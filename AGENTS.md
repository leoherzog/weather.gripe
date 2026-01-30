# AGENTS.md

This file provides guidance to Claude Code, OpenAI Codex, Google Gemini, etc when working with code in this repository.

## Build and Development Commands

```bash
# Start local development server (Wrangler dev mode)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

## Architecture Overview

This is a Cloudflare Workers application that serves a weather website with shareable canvas-based weather cards.

### Backend (Cloudflare Worker)

**`src/index.js`** - Main Worker entry point that handles API routing and proxies external services:

**API Endpoints:**
- `/api/location` - **Primary endpoint**: Consolidated weather data (5min cache)
  - Accepts `lat`+`lon` (coordinates) or `q` (search query)
  - Returns `{ location, weather, alerts }`
  - Use `?cache=false` to bypass all caches
- `/api/geocode` - Proxies Open-Meteo geocoding API for search autocomplete (24hr cache)
- `/api/photos/search` - Proxies Flickr photo search, hides API key (24hr cache, 2-tier cascade: geo 32km → global, sorted by interestingness, min 5 results per tier, CC-licensed, post-2010, excludes portraits/indoor/macro)
- `/api/wxstory` - Fetches NWS Weather Story images for a forecast office (5min cache)
- `/api/cf-location` - Returns Cloudflare edge-detected geolocation
- `/api/radar` - Returns radar metadata for a location (US only)
  - Accepts `lat`+`lon` coordinates
  - Returns `{ coverage, region, timestamp, bbox, center }`
  - Returns `{ coverage: false }` for non-US locations
- `/api/radar/tile` - Proxies NOAA radar WMS tiles (2min cache, handles CORS)
  - Accepts `region`, `layer`, `time`, `bbox` parameters
  - Constructs NOAA WMS URL server-side (allows MapLibre `{bbox-epsg-3857}` substitution)
- All other routes served via Cloudflare static assets from `public/`

Coordinates are truncated to 3 decimal places (~111m precision) for cache efficiency.

### Weather Data Sources

**US Locations (NWS - National Weather Service):**
- Primary source for all US coordinates (detected via reverse geocode `country_code`)
- Provides detailed forecasts, current observations, and weather alerts
- Icon URLs parsed for reliable condition codes (e.g., `snow,40` → "Snow" with 40% probability)
- Falls back to Open-Meteo if NWS fails

**International Locations (Open-Meteo):**
- Used for all non-US locations
- WMO weather codes mapped to unified condition system
- No API key required

### Radar Data Sources (US Only)

**NOAA MRMS Radar (opengeo.ncep.noaa.gov):**
- Multi-Radar Multi-Sensor system combining ~180 WSR-88D NEXRAD radars
- Layer format: `{region}_bref_qcd` (Base Reflectivity, Quality Controlled)
- Endpoint: `/geoserver/{region}/{layer}/ows` (WMS 1.1.1)
- Regions: `conus`, `alaska`, `hawaii`, `carib`, `guam`
- PNG with transparency, 256x256 tiles
- Updates every ~2 minutes

**OpenFreeMap Vector Tiles (tiles.openfreemap.org):**
- Dark/Fiord style basemap via MapLibre GL JS
- OpenMapTiles schema for vector data
- No API key required

**Radar Card Architecture:**
The radar card embeds a live MapLibre GL JS map (not canvas compositing):

1. **MapLibre Map Container** - Renders OpenFreeMap dark/fiord style
2. **NOAA Radar Layer** - WMS raster tiles at 90% opacity via `/api/radar/tile` proxy
3. **Highways Overlay** - Filtered from OpenMapTiles `transportation` layer (motorway/trunk/primary)
4. **Canvas Overlay** (transparent, pointer-events:none):
   - Location marker (red pin at center)
   - Header bar (city name + timestamp)
   - dBZ legend (color scale 5-70+)
   - Watermark ("NOAA via weather.gripe")
5. **Zoom Controls** - `fa-minus` (left) and `fa-plus` (right), vertically centered, positioned absolutely within the map wrapper. Click handlers call `map.zoomOut()`/`map.zoomIn()` programmatically (the map itself is `interactive: false`). `stopPropagation()` prevents lightbox activation.

**MapLibre Pixel Ratio:** The map is initialized with a custom `pixelRatio` of `CARD_WIDTH / containerWidth` so the WebGL canvas renders at 1200×800 regardless of the container's CSS pixel size. Without this, the basemap appears blurry because the overlay canvas is hardcoded to 1200×800 while MapLibre would default to the container's much smaller CSS dimensions × `devicePixelRatio`.

**MapLibre Cleanup:** The app calls `card._cleanup()` before removing radar cards to properly dispose of WebGL resources.

**Photo Navigation Controls:** Canvas-based weather cards with Flickr background photos have prev/next buttons (`fa-angle-left` / `fa-angle-right`) to cycle through the photos array. Buttons are 25% opacity (100% on hover), no background, positioned absolutely within a `.card-media-wrapper` div that wraps the canvas in the `media` slot. `createCardContainer` accepts an optional `photoNav` config (`{ photos, currentIndex, rerender }`) — when the photos array has 2+ items, buttons are added. Clicking navigates the index (wrapping with modular arithmetic), calls the card-specific `rerender` async closure to repaint the canvas with the new photo, and updates the `.photo-attribution` element. A `isNavigating` guard prevents concurrent canvas renders from racing. `stopPropagation()` prevents lightbox activation.

### Unified Condition Code System

Both NWS and Open-Meteo data are normalized to these condition codes:

| Code | Description |
|------|-------------|
| `clear` | Clear sky |
| `mostly-clear` | Mainly clear |
| `partly-cloudy` | Partly cloudy |
| `mostly-cloudy` | Mostly cloudy |
| `overcast` | Overcast |
| `fog` | Fog/Mist/Haze |
| `drizzle` | Drizzle |
| `rain-light` | Light rain/showers |
| `rain` | Rain |
| `rain-heavy` | Heavy rain |
| `freezing-rain` | Freezing rain/ice |
| `snow-light` | Light snow |
| `snow` | Snow |
| `snow-heavy` | Heavy snow/blizzard |
| `thunderstorm` | Thunderstorm |
| `thunderstorm-severe` | Severe thunderstorm/tornado |

**NWS Icon Mapping:** `NWS_ICON_CONDITIONS` maps ~70 NWS icon codes (e.g., `sn`, `snow`, `tsra`, `bkn`) to unified codes. Icon URLs like `https://api.weather.gov/icons/land/day/snow,40` are parsed to extract condition and probability.

**WMO Code Mapping:** `WMO_CONDITIONS` maps WMO numeric codes (0-99) from Open-Meteo to unified codes.

### Caching Strategy

Multi-layer caching using Cloudflare Cache API:

| Data | TTL | Cache Key Pattern |
|------|-----|-------------------|
| Location response | 5min | `location:{lat},{lon}` |
| Reverse geocode | 24hr | `reverse-geocode:{lat},{lon}` |
| NWS grid points | 24hr | `nws-points:{lat},{lon}` |
| NWS alerts | 60sec | `alerts:{lat},{lon}` |
| Open-Meteo weather | 5min | `openmeteo:{lat},{lon}` |
| Geocoding results | 24hr | Request URL |
| Flickr photos | 24hr | Request URL |
| Weather story | 5min | `wxstory:{office}` |
| Radar timestamp | 1min | `radar-timestamp:{region}` |
| Radar tiles | 2min | Constructed NOAA WMS URL |

**Performance Optimizations:**
- Speculative NWS points fetch for likely-US coordinates (parallel with geocode)
- Pre-fetched NWS points passed to weather function (avoids redundant call)
- Alerts fetched in parallel with weather data
- All independent fetches parallelized with `Promise.all`

### Frontend (Vite-bundled modules in `frontend/`)

- **`modules/app/`** - Application orchestration
  - `index.js` - Main app state, initialization, geolocation
  - `card-renderer.js` - Renders all weather cards, handles render cancellation for rapid location changes
  - `location.js` - Location management (Cloudflare detection → browser geolocation upgrade)
  - `weather-loader.js` - API calls and data loading
- **`modules/cards/`** - Weather card renderers (`WeatherCards` facade)
  - `index.js` - Public API with lazy-loading wrappers for map-based cards
  - `alert.js` / `alert-map.js` - Alert cards (text-only and map-overlay variants)
  - `alert-renderer.js` - Shared alert drawing utilities (colors, layout, text/icon rendering)
  - `radar.js` - Radar card with embedded MapLibre map
  - `core.js` - Shared canvas utilities (watermark, icons, text wrapping)
- **`modules/utils/`** - Shared utilities
  - `temperature-colors.js` - Dynamic color system based on windy.com scale, favicon & theme-color updates
  - `palette-colors.js` - Resolves Web Awesome color palette CSS variables for canvas rendering
  - `map-utils.js` - MapLibre lazy-loading and utilities
  - `units.js` - Unit conversion (API returns metric; imperial conversion client-side)
- **`static/`** - Static assets copied to build output by Vite (`publicDir: 'static'`)
  - `manifest.json` - PWA web app manifest
  - `sw.js` - Service worker (offline fallback)
  - `offline.html` - Branded offline page
  - `icons/` - PWA icons (poo-storm icon), favicon
  - `robots.txt`, `sitemap.xml` - SEO files
- **`style.css`** - Custom layout utilities and temperature theming CSS

**Lazy-Loading Strategy:** Map-based cards (`radar.js`, `alert-map.js`) are dynamically imported via wrappers in `cards/index.js`. This keeps MapLibre GL JS (~200KB) out of the main bundle—users who never view a radar card don't download map code.

**Render Cancellation:** When location updates rapidly (e.g., Cloudflare location followed by browser geolocation), `card-renderer.js` tracks render versions. Stale renders are discarded before appending cards, preventing mixed-location UI states.

**Ad/Support Card:** An ad card is appended after all weather cards on each render. It contains a Google AdSense ad unit with a "Buy Me a Tea" fallback link. Key implementation details:
- The ad card element is held in a **closure variable** inside `createCardRenderer()`, created once on first render and re-appended from the same JS reference after every `innerHTML = ''` clear.
- The `<ins class="adsbygoogle">` element is **not in static HTML** — it is created dynamically and prepended to the card on first render. This prevents AdSense's async auto-scan from finding a hidden/zero-dimension `<ins>` and throwing `no_div` errors.
- `adsbygoogle.push({})` is called once via `requestAnimationFrame` after the `<ins>` is in the visible DOM, ensuring the element is laid out before AdSense measures it.
- The AdSense library script (`adsbygoogle.js`) is loaded async in `<head>` of `index.html`.
- The card uses a `wa-card` web component. AdSense can find the slotted `<ins>` because Web Component slots keep content in the light DOM.
- CSS `:has(ins[data-ad-status="filled"])` hides the fallback when an ad loads. If the ad is blocked or unfilled, the fallback "Buy Me a Tea" button remains visible.
- The ad card has `cursor: default` and no lightbox handler (unlike weather cards).

### Default Units Injection

The Worker injects default units into HTML responses based on Cloudflare's detected country:
- **Imperial** (°F, mph): US, Liberia, Myanmar
- **Metric** (°C, km/h): All other countries

Injected as `<script>window.__defaultUnits="imperial";</script>` in `<head>`. User preference saved to `localStorage.weatherUnits` overrides this.

### UI Framework (Web Awesome)

The frontend uses [Web Awesome](https://webawesome.com), a web component library. Components use `wa-` prefixed custom elements (e.g., `wa-button`, `wa-card`, `wa-combobox`).

**Font Awesome Icons:** Icons are imported at build time from npm packages (not via Kit CDN). The `frontend/modules/ui/icons.js` module handles icon registration and exports.

**Icon Libraries:**
- `@fortawesome/pro-solid-svg-icons` - Solid icons for UI elements
- `@fortawesome/pro-duotone-svg-icons` - Duotone icons (poo-storm logo)

**Registered Libraries:**
- `'default'` - Solid icons, used as `<wa-icon name="cloud-sun">`
- `'duotone'` - Duotone icons, used as `<wa-icon library="duotone" name="poo-storm">`

**Duotone Implementation:** Duotone icons have two paths (secondary at 40% opacity, primary at 100%). The mutator adds `data-duotone-primary` and `data-duotone-secondary` attributes for Web Awesome CSS custom property support (`--primary-color`, `--secondary-color`, `--primary-opacity`, `--secondary-opacity`).

**Exports:**
- `getIconData(name)` - Returns `{ width, height, paths }` for canvas rendering
- `getDuotoneIconData(name)` - Returns `{ width, height, secondaryPath, primaryPath }` for favicon generation

**Header Logo:** The poo-storm duotone icon in the header uses temperature-based coloring via `.header-logo-icon` class. Uses `--color-primary-dark` in light mode, `--color-primary-light` in dark mode for visibility against the background.

**Dark Mode:** Uses `wa-dark` class on `<html>` element. Toggle persists to `localStorage.theme`. Canvas-rendered weather cards are theme-aware: dark mode uses light text/icons on dark overlays; light mode uses dark text/icons on light overlays. A `MutationObserver` on `<html>` class changes triggers `cardRenderer.refreshCards()` to re-render all cards when the theme toggles.

**Canvas Theme Helpers** (`frontend/modules/cards/core.js`):
- `isDarkMode()` - Checks for `wa-dark` class on `<html>`
- `cardText(opacity?)` - Returns themed text color (white in dark, `#1a1a1a` in light)
- `cardOverlay(opacity)` - Returns themed overlay color (black in dark, white in light)
- `cardDivider(opacity)` - Themed divider color (alias for `cardText`)
- All shared drawing functions (`drawOverlay`, `drawWatermark`, `drawWeatherIcon`, `drawPill`) auto-detect the theme internally.

**Light-Mode Alert Colors** (`palette-colors.js`): Severity background colors switch between dark tints (e.g., `red-10`/`red-05`) in dark mode and light tints (e.g., `red-80`/`red-90`) in light mode. Icon colors invert correspondingly. Pill text uses `getContrastingTextColor()` for automatic WCAG AAA contrast in both modes.

**Radar Card Theme:** The MapLibre basemap always uses the dark "fiord" style. Only the canvas overlay (header bar, legend, text, watermark) switches between dark and light themes. Highway overlays and the location marker glow remain white (on the dark basemap).

**Search Combobox (`wa-combobox`):**
The location search uses `wa-combobox` with dynamically populated options from the geocoding API. Key implementation notes:

- **Events:** Use standard DOM events, not `wa-` prefixed:
  - `keyup` for input detection (not `input` or `wa-input`)
  - `change` for selection (not `wa-change`)
  - `wa-hide` for dropdown close
- **Properties:**
  - `combobox.inputValue` - The typed text (not `value` or `displayValue`)
  - `combobox.value` - The selected option's value (JSON-encoded lat/lon/name)
- **Dynamic options:** Create `wa-option` elements and append to combobox, then set `combobox.open = true`
- **Server-side filtering:** Set `combobox.filter = () => true` to show all options (filtering done by API)
- **Slots:** Use `slot="start"` for prefix icon (not `slot="prefix"`)

### Progressive Web App (PWA)

The app is installable as a PWA on mobile and desktop.

**Manifest (`static/manifest.json`):**
- App name: "Shareable Weather Cards", short name: "weather.gripe"
- Display: standalone
- Icons: poo-storm (Font Awesome `fa-poo-storm`) at 192px, 512px, maskable variants

**Service Worker (`static/sw.js`):**
- Minimal offline support - caches only the offline fallback page
- Network-first for all requests; shows `offline.html` when offline
- Weather data intentionally not cached (must be fresh)

**Dynamic Favicon & Theme Color:**
- Browser tab icon updates to match current temperature color
- Favicon SVG generated using `getDuotoneIconData('poo-storm')` from `icons.js` (single source of truth)
- Uses `--color-primary-dark` in light mode, `--color-primary-light` in dark mode for visibility
- `<meta name="theme-color">` updates to match temperature (affects mobile browser chrome)
- Responds to system dark mode changes via `matchMedia` listener

**Icon Generation (`scripts/generate-icons.js`):**
- Generates PNG icons from Font Awesome poo-storm SVG paths
- Uses Sharp for SVG-to-PNG conversion
- Run with `node scripts/generate-icons.js`

### Temperature Color System

The app's primary color dynamically changes based on current temperature using the windy.com color scale.

**How it works:**
- On page load, primary color starts as `gold` (70°F)
- When weather data loads, color animates to the temperature-based color
- Uses Chroma.js v3 with `lab` interpolation for perceptually uniform colors
- Outputs CSS `lab()` color functions for browser-native color space support
- Button gradients span ±5°F from current temperature, interpolated `in lab`
- Favicon and theme-color meta tag update during color transitions

**CSS Custom Properties** (set dynamically by `temperature-colors.js`):
- `--color-primary` - Current temperature color
- `--color-primary-text` - AAA-accessible text color (white or dark)
- `--color-primary-light` / `--color-primary-dark` - Lighter/darker variants (also used for favicon)
- `--color-primary-alpha` - 20% opacity version for hover states
- `--button-gradient` - Linear gradient for buttons (±5°F range)
- `--gradient-text` - AAA-accessible text color for gradient backgrounds

**Web Awesome Integration:**
- Temperature colors map to Web Awesome brand tokens (`--wa-color-brand-fill-normal`, etc.)
- `.temp-gradient-btn` class applies gradient to button `::part(base)`

**Accessibility:**
- `getContrastingText(bgColor, targetRatio = 7)` - Returns white or dark text meeting WCAG AAA
- `meetsAAA(bgColor, textColor, isLargeText)` - Checks if color pair passes AAA (7:1 normal, 4.5:1 large)

### Palette Color System (Canvas Rendering)

Canvas-based weather cards use Web Awesome's color palette system for consistent theming. Since canvas rendering cannot use CSS variables directly, `palette-colors.js` resolves them at runtime.

**How it works:**
- Reads `--wa-color-{hue}-{tint}` CSS variables via `getComputedStyle()`
- Caches resolved hex values for performance
- Watches `<html>` classList for palette changes (`wa-palette-*`)
- Invalidates cache when palette changes
- Calculates WCAG AAA-accessible text colors for pill backgrounds

**Available Palettes:**
- `wa-palette-default`, `wa-palette-bright`, `wa-palette-natural`, `wa-palette-anodized`, `wa-palette-elegant`, etc.
- Switch by adding class to `<html>`: `document.documentElement.classList.add('wa-palette-bright')`

**Semantic Color Mappings:**
| Category | Colors | Used For |
|----------|--------|----------|
| Severity (extreme/severe/moderate/minor) | bg gradient, pill, pillText, icon, stroke | Alert cards |
| Urgency (immediate/expected/future/past) | bg, text | Alert urgency pills |
| Temperature (high/low) | indicator colors | Forecast cards (arrows, lines) |
| Radar | marker | Location pin on radar map |
| Fallback | gradient | Card background when Flickr fails |

**API Functions** (`frontend/modules/utils/palette-colors.js`):
- `getSeverityColors(severity)` → `{ bg: [dark, light], pill, pillText, icon, stroke }`
- `getUrgencyColor(urgency)` → `{ bg, text }`
- `getTemperatureColors()` → `{ high, low }`
- `getRadarMarkerColor()` → hex string
- `getFallbackGradient()` → `{ start, end }`
- `getContrastingTextColor(bgColor)` → white or dark hex for WCAG AAA (7:1 ratio)

**Fallbacks:** If CSS variables aren't loaded, hardcoded fallback values matching the original design are used.

**Architecture Note:** `palette-colors.js` (READER - resolves CSS variables for canvas) and `temperature-colors.js` (WRITER - generates dynamic theme colors) are intentionally kept separate despite both having contrast calculation. This avoids coupling canvas rendering to the chroma-js dependency.

### External Dependencies

**Backend (npm):**
- `suncalc` - Sunrise/sunset calculations

**Frontend (npm, bundled via Vite):**
- `@awesome.me/webawesome-pro` - Web Awesome UI components
- `@fortawesome/fontawesome-svg-core` + `@fortawesome/pro-solid-svg-icons` + `@fortawesome/pro-duotone-svg-icons` - Font Awesome icons (build-time imports, tree-shaken)
- `maplibre-gl` - WebGL map rendering for radar card
- `chroma-js` - Color manipulation for temperature colors

**External APIs:**
- **NWS (weather.gov)** - US weather data, alerts, observations (no key required)
- **Open-Meteo** - International weather, geocoding (no key required)
- **Nominatim (OpenStreetMap)** - Reverse geocoding (no key required, requires User-Agent)
- **Flickr** - Location background photos (requires `FLICKR_API_KEY`)
- **NOAA MRMS (opengeo.ncep.noaa.gov)** - US radar imagery via WMS (no key required)
- **OpenFreeMap (tiles.openfreemap.org)** - Vector tile basemap for radar card (no key required)
- **Google AdSense (pagead2.googlesyndication.com)** - Ad unit in support card (client ID: `ca-pub-9544720367752359`)

### Configuration

- `vite.config.js` - Vite build config (`root: 'frontend'`, `publicDir: 'static'`, `outDir: '../public'`)
- `wrangler.toml` - Worker configuration, points to `src/index.js` as entry point
- `.dev.vars` - Local environment secrets (FLICKR_API_KEY, FLICKR_SECRET, FONTAWESOME_NPM_TOKEN, WEBAWESOME_NPM_TOKEN)
- `.npmrc` - Private npm registry configuration for `@fortawesome` and `@awesome.me` scoped packages
- `package.json` - Build scripts and dependencies

### API Response Structure

**`/api/location` Response:**
```json
{
  "location": {
    "name": "New York",
    "region": "New York, United States",
    "latitude": 40.713,
    "longitude": -74.006,
    "country_code": "us",
    "timezone": "America/New_York",
    "nwsOffice": "OKX"
  },
  "weather": {
    "current": {
      "temperature": 5.2,
      "feelsLike": 1.3,
      "humidity": 65,
      "wind": { "speed": 12.5, "direction": 270 },
      "condition": { "code": "partly-cloudy", "text": "Partly Cloudy", "icon": "cloud-sun" },
      "observedAt": "2024-01-15T14:00:00Z"
    },
    "daily": [
      {
        "date": "2024-01-15",
        "high": 8,
        "low": -2,
        "condition": { "code": "snow", "text": "Snow", "icon": "snowflake", "probability": 60 },
        "precipitation": { "probability": 60, "amount": null, "snow": null, "rain": null },
        "sunrise": "2024-01-15T07:15:00-05:00",
        "sunset": "2024-01-15T16:55:00-05:00",
        "dayForecast": {
          "name": "Today",
          "detailedForecast": "Snow likely. Cloudy, with a high near 28...",
          "shortForecast": "Snow Likely",
          "condition": { "code": "snow", "text": "Snow", "icon": "snowflake" }
        },
        "nightForecast": {
          "name": "Tonight",
          "detailedForecast": "Snow likely before midnight. Mostly cloudy...",
          "shortForecast": "Snow Likely then Mostly Cloudy",
          "condition": { "code": "snow", "text": "Snow", "icon": "snowflake" }
        }
      }
    ],
    "timezone": "America/New_York"
  },
  "alerts": [
    {
      "event": "Winter Storm Warning",
      "headline": "...",
      "severity": "Severe",
      "urgency": "Expected",
      "onset": "...",
      "ends": "...",
      "description": "...",
      "instruction": "..."
    }
  ]
}
```

**Units:** All temperatures in Celsius, wind speeds in km/h, precipitation in inches. Client converts to imperial as needed.

**NWS-only fields:** `dayForecast` and `nightForecast` objects are only present for US locations using NWS data. These contain the detailed text forecasts used by the "Today/Tonight/Tomorrow" text summary cards.
