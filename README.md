# Weather.gripe 🌦️

An ActivityPub-powered weather service that allows Mastodon and other Fediverse users to follow location-based weather accounts for automated forecasts and severe weather alerts.

## ✅ Project Status

**Production Ready** - All core functionality implemented, tested, and optimized.

## Features

- **ActivityPub Integration**: Follow weather accounts from any ActivityPub-compatible platform (Mastodon, Pleroma, Misskey, etc.)
- **Location-based Accounts**: Follow specific locations like `@newyork@weather.gripe` or `@paris@weather.gripe`
- **Global Weather Coverage**: Powered by OpenMeteo API for worldwide weather data
- **Automated Weather Posts**: 
  - Morning forecast (7am local time)
  - Noon update with current conditions
  - Evening forecast with overnight and tomorrow's weather (7pm local time)
- **Severe Weather Alerts**: Immediate posts for extreme weather conditions
- **Full ActivityPub Compliance**: 
  - Proper JSON-LD contexts with Mastodon extensions
  - Create activities wrapping Note objects in outbox
  - Content negotiation for ActivityPub vs HTML
  - NodeInfo and host-meta discovery endpoints
- **HTTP Signatures**: RSA-SHA256 cryptographically signed messages for secure federation
- **Smart Caching**: Hybrid caching strategy using Cache API and KV storage
- **Reliable Delivery**: Automatic retry with exponential backoff for failed deliveries
- **Deterministic IDs**: Prevents duplicate posts even after cache purges
- **International Support**: Geocoding via Nominatim for worldwide locations

## Technology Stack

- **Cloudflare Workers**: Serverless edge computing platform
- **Cloudflare KV**: Distributed key-value storage for persistent state
- **OpenMeteo API**: Global weather forecasts with WMO weather codes
- **Nominatim**: OpenStreetMap geocoding service
- **ActivityPub**: W3C standard for federated social networking
- **HTTP Signatures**: RSA-SHA256 signing for message authentication

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Cloudflare account with Workers enabled
- Wrangler CLI (installed as dev dependency)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/leoherzog/weather.gripe.git
cd weather.gripe
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create KV namespaces:**
```bash
npx wrangler kv:namespace create "FOLLOWERS"
npx wrangler kv:namespace create "POSTS"
npx wrangler kv:namespace create "ALERTS"
npx wrangler kv:namespace create "DELIVERY_QUEUE"
npx wrangler kv:namespace create "KEYS"
```

4. **Update `wrangler.toml`** with the KV namespace IDs from the previous step

5. **Run locally:**
```bash
npm run dev
```

### Deployment

**Automatic deployment via GitHub:**

1. Connect your GitHub repository to Cloudflare Workers
2. Configure branch deployments:
   - `main` → Production
   - `develop` → Staging
3. Push to GitHub to trigger automatic deployment

**Manual deployment:**
```bash
npm run deploy          # Deploy to production
npm run deploy:staging  # Deploy to staging
```

## API Endpoints

### ActivityPub Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/.well-known/webfinger` | WebFinger discovery |
| GET | `/.well-known/nodeinfo` | NodeInfo discovery |
| GET | `/.well-known/host-meta` | Host metadata |
| GET | `/nodeinfo/2.0` | Server information |
| GET | `/locations/{location}` | Actor profile |
| POST | `/locations/{location}/inbox` | Receive activities |
| GET | `/locations/{location}/outbox` | Weather posts |
| GET | `/locations/{location}/followers` | Followers list |
| GET | `/locations/{location}/following` | Following (empty) |
| GET | `/locations/{location}/alerts` | Active alerts |
| GET | `/posts/{uuid}` | Individual post |

### Admin/Debug Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/weather/forecast?location={name}` | Forecast data |
| GET | `/api/weather/current?location={name}` | Current conditions |
| GET | `/api/weather/alerts?location={name}` | Active alerts |
| GET | `/api/weather/geocode?location={name}` | Geocode location |

## Architecture

The service follows a clean, modular architecture:

```
src/
├── index.js                 # Main entry point & routing
├── config/
│   └── constants.js        # Centralized configuration
├── handlers/               # Request handlers
│   ├── activitypub.js      # ActivityPub protocol
│   ├── webfinger.js        # WebFinger discovery
│   └── weather.js          # Weather API endpoints
├── services/               # Business logic
│   ├── weather-service.js  # OpenMeteo integration
│   ├── location-service.js # Nominatim geocoding
│   ├── delivery-service.js # ActivityPub delivery
│   ├── http-cache.js       # Cache API wrapper
│   ├── state-store.js      # KV storage operations
│   └── post-repository.js  # Post storage
├── models/                 # Data models
│   └── weather-post.js     # Post generation
└── utils/                  # Utilities
    ├── weather-formatters.js # Text formatting
    ├── id-generator.js      # Deterministic IDs
    ├── error-handler.js     # Error handling
    ├── http-signature.js    # RSA signatures
    ├── time-utils.js        # Timezone logic
    ├── alert-utils.js       # Alert formatting
    └── logger.js            # Structured logging
```

## Configuration

Configuration in `wrangler.toml`:

```toml
name = "weather-gripe"
main = "src/index.js"

[vars]
DOMAIN = "weather.gripe"
ADMIN_EMAIL = "admin@weather.gripe"
USER_AGENT = "weather.gripe/1.0"
STRICT_SIGNATURES = false

[[kv_namespaces]]
binding = "FOLLOWERS"
id = "your-followers-namespace-id"

# ... additional KV namespaces
```

See [Configuration Constants](src/config/constants.js) for runtime configuration options.

## Documentation

- [Implementation Roadmap](IMPLEMENTATION.md) - Development milestones
- [Technical Debt](TECHNICAL_DEBT.md) - Known issues and improvements
- [Changelog](CHANGELOG.md) - Version history
- [Caching Strategy](CACHING_STRATEGY.md) - Hybrid caching approach
- [ID Generation](ID_GENERATION.md) - Deterministic ID system
- [ActivityPub Delivery](ACTIVITYPUB_DELIVERY.md) - Push delivery system
- [HTTP Signatures](HTTP_SIGNATURES.md) - Authentication
- [OpenMeteo API](OPENMETEO_API.md) - Weather data integration
- [Cron Strategy](CRON_STRATEGY.md) - Scheduled posting
- [KV Setup](KV_SETUP.md) - Storage configuration

## Contributing

Contributions are welcome! Key areas for improvement:

- **Features**: Multi-language support, custom alerts, weather maps
- **Performance**: Enhanced caching, batch processing optimization
- **Testing**: Expand integration tests, add E2E tests
- **Documentation**: API documentation, user guides

Please ensure:
- Code follows existing patterns and style
- Tests are included for new features
- Documentation is updated as needed

## License

ISC License - See [LICENSE](LICENSE) file for details

## Credits

Weather data formatting and emoji mappings adapted from the original Apps Script weather bot implementation.

## Support

- **Issues**: [GitHub Issues](https://github.com/leoherzog/weather.gripe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/leoherzog/weather.gripe/discussions)
- **Email**: admin@weather.gripe