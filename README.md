# Weather.gripe 🌦️

An ActivityPub-powered weather service that allows Mastodon and other Fediverse users to follow location-based weather accounts for automated forecasts and severe weather alerts.

## Features

- **ActivityPub Integration**: Follow weather accounts from any ActivityPub-compatible platform (Mastodon, Pleroma, Misskey, etc.)
- **Location-based Accounts**: Follow specific locations like `@newyork@weather.gripe` or `@paris@weather.gripe`
- **Global Weather Coverage**: Powered by OpenMeteo API for worldwide weather data
- **Automated Weather Posts**: 
  - Morning forecast (7am local time)
  - Noon update with current conditions
  - Evening forecast with overnight and tomorrow's weather (7pm local time)
- **Severe Weather Alerts**: Immediate posts for extreme weather conditions, automatically pinned
- **Full ActivityPub Compliance**: 
  - Proper JSON-LD contexts with Mastodon extensions
  - Create activities wrapping Note objects in outbox
  - Content negotiation for ActivityPub vs HTML
  - NodeInfo and host-meta discovery endpoints
- **HTTP Signatures**: RSA-SHA256 cryptographically signed messages for secure federation
- **Smart Caching**: Hybrid caching strategy using Cache API and KV storage
- **Reliable Delivery**: Automatic retry with exponential backoff for failed deliveries
- **Bulk Weather Requests**: Efficient fetching for multiple locations simultaneously
- **International Support**: Geocoding via Nominatim for worldwide locations with timezone awareness

## Technology Stack

- **Cloudflare Workers**: Serverless edge computing platform
- **Cloudflare KV**: Distributed key-value storage for persistent state
- **OpenMeteo API**: Global weather forecasts with WMO weather codes
- **Nominatim**: OpenStreetMap geocoding service
- **ActivityPub**: W3C standard for federated social networking
- **HTTP Signatures**: RSA-SHA256 signing for message authentication

## Development

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Cloudflare account with Workers enabled
- Wrangler CLI (installed as dev dependency)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/leoherzog/weather.gripe.git
cd weather.gripe
```

2. Install dependencies:
```bash
npm install
```

3. Create KV namespaces:
```bash
npx wrangler kv:namespace create "FOLLOWERS"
npx wrangler kv:namespace create "POSTS"
npx wrangler kv:namespace create "ALERTS"
npx wrangler kv:namespace create "DELIVERY_QUEUE"
npx wrangler kv:namespace create "KEYS"
```

4. Update `wrangler.toml` with the KV namespace IDs from the previous step

5. Run locally:
```bash
npm run dev
```

### Deployment

The project is configured for automatic deployment via Cloudflare's GitHub integration:

1. Connect your GitHub repository to Cloudflare Workers
2. Configure branch deployments:
   - `main` → Production
   - `develop` → Staging
3. Push to GitHub to trigger automatic deployment

Manual deployment is also available:
```bash
npm run deploy  # Deploy to production
npm run deploy:staging  # Deploy to staging
```

## API Endpoints

### ActivityPub Endpoints

- `GET /.well-known/webfinger` - WebFinger discovery
- `GET /.well-known/nodeinfo` - NodeInfo discovery
- `GET /.well-known/host-meta` - Host metadata for WebFinger
- `GET /nodeinfo/2.0` - Server information and statistics
- `GET /locations/{location}` - Actor profile (content negotiation aware)
- `POST /locations/{location}/inbox` - Receive ActivityPub activities
- `GET /locations/{location}/outbox` - Weather posts collection (paginated)
- `GET /locations/{location}/followers` - Followers collection
- `GET /locations/{location}/following` - Following collection (empty)
- `GET /locations/{location}/alerts` - Active weather alerts (featured)
- `GET /posts/{uuid}` - Individual weather post

### Admin/Debug Endpoints

- `GET /health` - Health check
- `GET /api/weather/forecast?location={name}` - Get forecast data
- `GET /api/weather/current?location={name}` - Get current conditions
- `GET /api/weather/alerts?location={name}` - Get active alerts
- `GET /api/weather/geocode?location={name}` - Geocode location

## Configuration

See `wrangler.toml` for configuration options. Key settings:

- `DOMAIN`: Your domain (e.g., "weather.gripe")
- `ADMIN_EMAIL`: Administrator email
- `USER_AGENT`: User agent for API requests
- `STRICT_SIGNATURES`: Enable strict HTTP signature verification (default: false)
- KV namespace bindings:
  - `FOLLOWERS`: Follower relationships
  - `POSTS`: Weather post storage
  - `ALERTS`: Alert tracking
  - `DELIVERY_QUEUE`: Failed delivery retry queue
  - `KEYS`: RSA keypairs for HTTP signatures

## Architecture

The service follows a modular architecture:

- **Handlers**: Request routing and protocol implementation
- **Services**: Business logic for weather, location, and ActivityPub
- **Utils**: Shared utilities for formatting, caching, and error handling
- **Models**: Data structures and schemas
- **Config**: Configuration and constants

## Contributing

Contributions are welcome! Please see [IMPLEMENTATION.md](IMPLEMENTATION.md) for the development roadmap and task list.

## License

ISC License - See [LICENSE](LICENSE) file for details

## Credits

Weather data formatting and emoji mappings adapted from the original Apps Script weather bot implementation.