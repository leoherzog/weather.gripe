# AGENTS.md

This file provides guidance to Claude Code, OpenAI Codex, Google Gemini, etc when working with code in this repository.

## Build and Development Commands

```bash
# Start local development server (watches CSS + Wrangler dev mode)
npm run dev

# Build Tailwind CSS (required after adding new utility classes)
npm run build:css

# Watch Tailwind CSS for changes (runs automatically with npm run dev)
npm run watch:css

# Deploy to Cloudflare Workers (builds CSS first)
npm run deploy
```

## Architecture Overview

This is a Cloudflare Workers application that serves a weather website with shareable canvas-based weather cards.

### Backend (Cloudflare Worker)

**`src/index.js`** - Main Worker entry point that handles API routing and proxies external services:
- `/api/location` - **Primary endpoint**: Consolidated weather data endpoint (5min cache)
  - Accepts `lat`+`lon` (coordinates) or `q` (search query)
  - Returns location info (via Nominatim), weather data (Open-Meteo), and alerts (NWS)
  - Backend fetches all data in parallel for optimal performance
- `/api/geocode` - Proxies Open-Meteo geocoding API for search autocomplete (24hr cache)
- `/api/unsplash` - Proxies Unsplash photo search (hides API key, 24hr cache)
- All other routes served via Cloudflare static assets from `public/`

Coordinates are truncated to 3 decimal places (~111m precision) for cache efficiency.

### Frontend (Static Assets in `public/`)

- **`app.js`** - Main application state and UI orchestration (search, geolocation, location persistence)
- **`weather-cards.js`** - Canvas-based weather card renderers (`WeatherCards` object) with share/download functionality. Extracts FontAwesome SVG paths at runtime for canvas drawing.
- **`units.js`** - Unit conversion utilities (`Units` object). API returns metric; all conversions to imperial happen client-side.
- **`style.css`** - Compiled Tailwind CSS output (do not edit directly)

### Styles (`src/styles/`)

- **`input.css`** - Tailwind v4 source file with custom component styles. Uses class-based dark mode (`dark` class on `<html>`).

### External Dependencies

- Weather data: Open-Meteo API (free, no API key required)
- Location backgrounds: Unsplash API (requires `UNSPLASH_ACCESS_KEY` in `.dev.vars`)
- Weather alerts: NWS API (US locations only)
- CSS framework: Tailwind CSS v4 (compiled at build time)
- Icons: FontAwesome Kit (via CDN)

### Configuration

- `wrangler.toml` - Worker configuration, points to `src/index.js` as entry point
- `.dev.vars` - Local environment secrets (UNSPLASH_ACCESS_KEY)
