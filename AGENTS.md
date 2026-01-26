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
- `/api/unsplash` - Proxies Unsplash photo search, hides API key (24hr cache)
- `/api/unsplash/download` - Triggers Unsplash download tracking (API compliance)
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

**MapLibre Cleanup:** The app calls `card._cleanup()` before removing radar cards to properly dispose of WebGL resources.

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
| Unsplash images | 24hr | Request URL |
| Weather story | 5min | `wxstory:{office}` |
| Radar timestamp | 1min | `radar-timestamp:{region}` |
| Radar tiles | 2min | Constructed NOAA WMS URL |

**Performance Optimizations:**
- Speculative NWS points fetch for likely-US coordinates (parallel with geocode)
- Pre-fetched NWS points passed to weather function (avoids redundant call)
- Alerts fetched in parallel with weather data
- All independent fetches parallelized with `Promise.all`

### Frontend (Static Assets in `public/`)

- **`app.js`** - Main application state and UI orchestration (search, geolocation, location persistence)
- **`weather-cards.js`** - Weather card renderers (`WeatherCards` object) with share/download functionality. Extracts FontAwesome SVG paths at runtime for canvas drawing. Includes detailed text forecast cards for NWS data. Radar card uses embedded MapLibre GL JS map with canvas overlay for UI elements.
- **`temperature-colors.js`** - Dynamic color system based on windy.com temperature scale (`TemperatureColors` object). See Temperature Color System below.
- **`units.js`** - Unit conversion utilities (`Units` object). API returns metric (Celsius, km/h); all conversions to imperial happen client-side. Handles `-0` edge case in temperature formatting.
- **`style.css`** - Custom layout utilities and temperature theming CSS. Uses Web Awesome design tokens (`--wa-*` custom properties).

### Default Units Injection

The Worker injects default units into HTML responses based on Cloudflare's detected country:
- **Imperial** (°F, mph): US, Liberia, Myanmar
- **Metric** (°C, km/h): All other countries

Injected as `<script>window.__defaultUnits="imperial";</script>` in `<head>`. User preference saved to `localStorage.weatherUnits` overrides this.

### UI Framework (Web Awesome)

The frontend uses [Web Awesome](https://webawesome.com), a web component library that includes Font Awesome Pro icons. Components use `wa-` prefixed custom elements (e.g., `wa-button`, `wa-card`, `wa-input`).

**Dark Mode:** Uses `wa-dark` class on `<html>` element. Toggle persists to `localStorage.theme`.

### Temperature Color System

The app's primary color dynamically changes based on current temperature using the windy.com color scale.

**How it works:**
- On page load, primary color starts as `gold`
- When weather data loads, color animates to the temperature-based color over 1.5s
- Uses Chroma.js v3 with `lab` interpolation for perceptually uniform colors
- Outputs CSS `lab()` color functions for browser-native color space support
- Button gradients span ±5°F from current temperature, interpolated `in lab`

**CSS Custom Properties** (set dynamically by `temperature-colors.js`):
- `--color-primary` - Current temperature color
- `--color-primary-text` - AAA-accessible text color (white or dark)
- `--color-primary-light` / `--color-primary-dark` - Lighter/darker variants
- `--color-primary-alpha` - 20% opacity version for hover states
- `--button-gradient` - Linear gradient for buttons (±5°F range)
- `--gradient-text` - AAA-accessible text color for gradient backgrounds

**Web Awesome Integration:**
- Temperature colors map to Web Awesome brand tokens (`--wa-color-brand-fill-normal`, etc.)
- `.temp-gradient-btn` class applies gradient to button `::part(base)`

**Accessibility:**
- `getContrastingText(bgColor, targetRatio = 7)` - Returns white or dark text meeting WCAG AAA
- `meetsAAA(bgColor, textColor, isLargeText)` - Checks if color pair passes AAA (7:1 normal, 4.5:1 large)

### External Dependencies

**Backend (npm):**
- `suncalc` - Sunrise/sunset calculations

**Frontend (npm, bundled via Vite):**
- `maplibre-gl` - WebGL map rendering for radar card

**Frontend (CDN):**
- Web Awesome Kit - UI components and Font Awesome Pro icons
- Chroma.js v3 - Color manipulation (ES module via jsdelivr)

**External APIs:**
- **NWS (weather.gov)** - US weather data, alerts, observations (no key required)
- **Open-Meteo** - International weather, geocoding (no key required)
- **Nominatim (OpenStreetMap)** - Reverse geocoding (no key required, requires User-Agent)
- **Unsplash** - Location background photos (requires `UNSPLASH_ACCESS_KEY`)
- **NOAA MRMS (opengeo.ncep.noaa.gov)** - US radar imagery via WMS (no key required)
- **OpenFreeMap (tiles.openfreemap.org)** - Vector tile basemap for radar card (no key required)

### Configuration

- `wrangler.toml` - Worker configuration, points to `src/index.js` as entry point
- `.dev.vars` - Local environment secrets (UNSPLASH_ACCESS_KEY)
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
