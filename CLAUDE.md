# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Weather.gripe is an ActivityPub-powered weather service built on Cloudflare Workers that allows Mastodon and other Fediverse users to follow location-based weather accounts for automated forecasts and severe weather alerts.

## Development Commands

```bash
# Install dependencies
npm install

# Local development server
npm run dev

# Run tests
npm test                    # Run all tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report

# Deployment (Manual - not typically needed)
npm run deploy             # Manual deploy to production
npm run deploy:staging     # Manual deploy to staging environment

# Note: This project is configured for automatic deployment via Cloudflare's GitHub integration.
# The worker automatically pulls and builds from GitHub on push - no manual deployment needed!

# Monitor production logs
npm run tail               # View live logs from production
```

## Testing Strategy

- Test framework: Vitest with Miniflare environment for Cloudflare Workers
- Test files located in `tests/` directory with `.test.js` extension
- Run a single test file: `npx vitest run tests/unit/utils/id-generator.test.js`
- Run tests matching a pattern: `npx vitest run -t "weather"` 

## Architecture Overview

### Core Components

1. **Main Entry Point** (`src/index.js`)
   - Handles HTTP routing for ActivityPub, WebFinger, and weather API endpoints
   - Manages scheduled cron jobs for posting forecasts and checking alerts
   - Implements content negotiation between ActivityPub JSON and HTML

2. **ActivityPub Implementation**
   - Full W3C ActivityPub compliance with Mastodon extensions
   - HTTP Signatures (RSA-SHA256) for secure federation
   - Handles Follow/Unfollow activities and delivers Create activities
   - Actor profiles at `/locations/{location}` with inbox/outbox/followers endpoints

3. **Weather Service Integration**
   - OpenMeteo API for global weather data (no API key required)
   - Nominatim for geocoding location names to coordinates
   - Generates forecasts at 7am, noon, and 7pm local time
   - Monitors for severe weather conditions and posts immediate alerts

4. **Storage Strategy**
   - **Cloudflare KV Namespaces** for persistent state:
     - `FOLLOWERS`: Follower relationships
     - `POSTS`: Weather post storage
     - `ALERTS`: Track posted alerts to prevent duplicates
     - `DELIVERY_QUEUE`: Failed delivery retry queue
     - `KEYS`: RSA keypairs for HTTP signatures
   - **Cache API** for ephemeral data (weather data, geocoding results)

5. **Posting System**
   - Deterministic post IDs prevent duplicates even after cache purges
   - Three daily forecast types: morning, noon, evening
   - Severe weather alerts triggered by extreme conditions
   - Posts delivered to all followers via ActivityPub Create activities

## Key Implementation Details

### Time Zone Handling
The service calculates local time for each location using timezone data from the geocoding service. Posts are triggered when a location enters its posting window (first 5 minutes of 7am, noon, or 7pm local time).

### HTTP Signatures
All outgoing ActivityPub messages are signed with RSA-SHA256. Keys are generated per location and stored in KV. The signature includes headers: `(request-target)`, `host`, `date`, and `digest`.

### Delivery Reliability
Failed deliveries are queued with exponential backoff (max 5 retries). The delivery service handles both immediate posting and retry processing.

### Weather Code Mapping
OpenMeteo WMO weather codes are mapped to descriptive text and emojis in `utils/weather-formatters.js`. Severe conditions (codes 95-99 for thunderstorms, extreme temperatures) trigger immediate alerts.

## Working with Cloudflare Workers

### KV Namespace Setup
Before first deployment, create KV namespaces:
```bash
npx wrangler kv:namespace create "FOLLOWERS"
npx wrangler kv:namespace create "POSTS"
npx wrangler kv:namespace create "ALERTS"
npx wrangler kv:namespace create "DELIVERY_QUEUE"
npx wrangler kv:namespace create "KEYS"
```
Then update the IDs in `wrangler.toml`.

### Local Development
`wrangler dev` provides a local environment with KV namespace emulation. The service runs on `http://localhost:8787` by default.

### Production Deployment
**Important**: This project uses Cloudflare's GitHub integration for automatic deployment. The worker is configured to automatically pull and build from the GitHub repository when changes are pushed. There is no need to:
- Run `wrangler deploy` manually
- Set up GitHub Actions for deployment
- Configure any CI/CD pipeline

Simply push to the appropriate branch and Cloudflare will handle the deployment automatically.

### Debugging
- Use `Logger` utility for structured logging
- `wrangler tail` shows real-time production logs
- Test ActivityPub integration with tools like `curl` or Mastodon's remote follow

## Important Patterns

1. **Error Handling**: Centralized through `ErrorHandler` utility with appropriate HTTP status codes
2. **Caching**: Hybrid approach using Cache API (TTL-based) and KV storage (persistent)
3. **ID Generation**: Deterministic IDs based on location, timestamp, and post type
4. **Content Formatting**: Weather descriptions use emoji and natural language via formatter utilities
5. **Time Utilities**: Handle timezone conversions and posting window calculations