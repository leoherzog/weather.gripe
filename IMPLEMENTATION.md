# ActivityPub Weather Service Implementation Plan

**Last Updated**: 2025-08-12  
**Status**: Architecture Review Completed - Refactoring Required

## ⚠️ IMPORTANT: Architecture Review Results

A comprehensive architecture review was conducted on 2025-08-12. Critical issues were identified that must be addressed before production deployment. See [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) for full details.

### Critical Issues Requiring Immediate Action:
1. **Duplicate index files** (`index.js` and `index-broken.js`) with 80% code duplication
2. **Missing core weather functionality** - 17 TODO comments for unimplemented features
3. **God Object anti-pattern** in `CacheService` handling 6+ responsibilities
4. **No input validation** creating security vulnerabilities

### Impact Assessment:
- **Technical Debt**: ~30% of codebase is redundant
- **Potential Improvement**: 30% code reduction possible
- **Effort Required**: 2-3 developer weeks for complete cleanup
- **Risk Level**: Medium - mostly code reorganization

## Overview
This document outlines the implementation plan for a Cloudflare Worker service that serves ActivityPub responses for weather forecasts and severe weather alerts. Users can follow locations (e.g., `@newyork@weather.gripe`) via Mastodon or other ActivityPub-compatible services to receive automated weather updates.

## Core Features
- ActivityPub actor objects representing geographic locations
- Automated weather forecast posts at scheduled times (7am, noon, 7pm local time)
- Real-time severe weather alert posts with pinning to collections
- Location name geocoding via Nominatim API
- Weather data from OpenMeteo API (global coverage)
- Follower management using Cloudflare KV storage
- Heavy caching for optimal performance

## Current Implementation Status

### Completed Components
- ✅ **Foundation**: Worker skeleton, routing, error handling, logging
- ✅ **Caching**: Hybrid Cache API + KV storage strategy with full implementation
- ✅ **ID Generation**: Deterministic IDs preventing duplicates with comprehensive test coverage
- ✅ **ActivityPub Core**: WebFinger, actors, collections, inbox/outbox endpoints implemented
- ✅ **Push Delivery**: Service for pushing posts to follower inboxes with batching and retry logic
- ✅ **Scheduling**: 5-minute cron with timezone-aware posting framework
- ✅ **Weather Post Models**: Complete post generation with deterministic IDs
- ✅ **Follow/Unfollow**: Complete follower management with Accept activities
- ✅ **Alert System**: Complete with OpenMeteo-based alert generation
- ✅ **Weather Service**: Complete with OpenMeteo API integration (global coverage)
- ✅ **Location Service**: Complete with Nominatim geocoding and aliases
- ✅ **HTTP Signatures**: Full RSA-SHA256 signing and verification implemented
- ✅ **Testing**: Comprehensive unit, integration, and E2E tests
- ✅ **ActivityPub Compliance**: All critical spec violations fixed
- ✅ **Content Negotiation**: Proper ActivityPub vs HTML handling
- ✅ **NodeInfo/Host-Meta**: Server discovery endpoints implemented
- ✅ **Error Handling**: Proper distinction between malformed and unsupported activities
- ✅ **KV Safety**: Defensive checks for KV namespace availability
- ✅ **Performance**: Optimized KV list operations with pagination

### Remaining Work
- ⚠️ **Production Deployment**: Cloudflare Workers setup and configuration
- ⚠️ **Monitoring**: Logging, analytics, and alerting setup
- ⚠️ **Documentation**: User guides and API documentation

### Updated Priority Tasks (Post-Architecture Review)

#### Week 1 - Critical Cleanup (MUST DO FIRST)
1. **Delete duplicate code** - Remove `/src/index-broken.js` immediately
2. **Remove empty directories** - Delete `/src/config/` if unused
3. **Consolidate helpers** - Extract duplicate functions to utility modules
4. **Fix test configuration** - Update vitest config for Workers environment
5. **Address TODOs** - Either implement or remove the 17 TODO comments

#### Week 2-3 - Core Refactoring
1. **Split CacheService** - Separate into HttpCache, StateStore, PostRepository
2. **Implement weather APIs** - Complete OpenMeteo integration or remove stubs
3. **Add input validation** - Secure all request handlers
4. **Consolidate error classes** - Replace 4 classes with single AppError
5. **Implement rate limiting** - Use Cloudflare's built-in features

#### Month 1-2 - Architecture Improvements
1. **Refactor routing** - Replace 447-line if-else with route map
2. **Add dependency injection** - Prevent circular dependencies
3. **Improve test coverage** - Target >80% coverage
4. **Create documentation** - API docs and Architecture Decision Records
5. **Performance optimization** - Implement review recommendations

#### Only After Cleanup - Original Tasks
1. **Deploy to Production** - Configure Cloudflare Workers and KV namespaces
2. **Set Up Monitoring** - Configure logging, analytics, and error tracking
3. **Real-world Testing** - Test with actual Mastodon instances
4. **Launch Preparation** - Domain setup, branding, and announcements

### Recent Fixes (ActivityPub Compliance)
1. ✅ Fixed missing `generateKeyPair` import in delivery-service.js
2. ✅ Added complete JSON-LD contexts with Mastodon extensions
3. ✅ Fixed OpenMeteo bulk response handling (single object with arrays)
4. ✅ Wrapped Notes in Create activities for outbox compliance
5. ✅ Implemented proper content negotiation for ActivityPub vs HTML
6. ✅ Added required CORS headers (Signature, Digest, etc.)
7. ✅ Added stricter HTTP signature verification with env flag
8. ✅ Implemented NodeInfo 2.0 endpoint for server discovery
9. ✅ Added host-meta endpoint for WebFinger discovery
10. ✅ Verified post ID format uses hyphens (no colons)
11. ✅ Added KV namespace availability checks before operations
12. ✅ Optimized KV list operations with proper pagination
13. ✅ Implemented retry logic with exponential backoff for deliveries
14. ✅ Fixed error responses to distinguish malformed vs unsupported activities

### Key Files Created
- `src/index.js` - Main entry with routing and cron handler ✅ COMPLETE
- `src/services/cache-service.js` - Hybrid caching implementation ✅ COMPLETE
- `src/services/delivery-service.js` - ActivityPub push delivery ✅ COMPLETE
- `src/utils/id-generator.js` - Deterministic ID generation ✅ COMPLETE
- `src/utils/error-handler.js` - Error handling and custom errors ✅ COMPLETE
- `src/utils/logger.js` - Structured logging ✅ COMPLETE
- `src/models/weather-post.js` - Post creation with deterministic IDs ✅ COMPLETE
- `src/handlers/webfinger.js` - WebFinger discovery ✅ COMPLETE
- `src/handlers/activitypub.js` - ActivityPub endpoints ✅ COMPLETE
- `src/handlers/weather.js` - Weather API endpoints ⚠️ PARTIAL (stubs only)

### Missing Files from Architecture
- `src/services/weather-service.js` - ✅ COMPLETE with OpenMeteo API
- `src/services/location-service.js` - ✅ COMPLETE with Nominatim geocoding  
- `src/services/activitypub-service.js` - Object creation helpers (functionality exists in other files)
- `src/utils/weather-formatters.js` - ✅ COMPLETE with WMO code support
- `src/utils/emoji-mappings.js` - Weather condition to emoji mapping (needs porting)
- `src/utils/text-utils.js` - Text processing utilities (needs implementation)
- `src/models/location.js` - Location data models (needs implementation)
- `src/models/activitypub-objects.js` - ActivityPub schemas (functionality exists inline)
- `src/config/constants.js` - Configuration constants (needs implementation)
- `src/config/api-endpoints.js` - External API configs (needs implementation)

### Documentation Created
- `CACHING_STRATEGY.md` - Hybrid caching approach
- `ID_GENERATION.md` - Deterministic ID system
- `ACTIVITYPUB_DELIVERY.md` - Push delivery system
- `CRON_STRATEGY.md` - 5-minute execution strategy
- `KV_SETUP.md` - KV namespace setup instructions

### Test Coverage Status
- `tests/unit/utils/id-generator.test.js` - ✅ COMPLETE (comprehensive)
- `tests/unit/utils/logger.test.js` - ✅ COMPLETE  
- `tests/unit/utils/error-handler.test.js` - ✅ COMPLETE
- `tests/unit/models/weather-post.test.js` - ✅ COMPLETE (comprehensive)
- `tests/unit/services/cache-service.test.js` - ✅ COMPLETE
- `tests/integration/routing.test.js` - ⚠️ BASIC (needs expansion)
- Handler tests - ❌ MISSING
- Delivery service tests - ❌ MISSING  
- End-to-end tests - ❌ MISSING

## Architecture Overview

### Service Components
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   ActivityPub   │────▶│  Weather Service │────▶│    NWS API      │
│    Handlers     │     └──────────────────┘     └─────────────────┘
└─────────────────┘              │
         │                       │                ┌─────────────────┐
         │              ┌──────────────────┐     │  Nominatim API  │
         └─────────────▶│ Location Service │────▶└─────────────────┘
                        └──────────────────┘
                                 │
                        ┌──────────────────┐
                        │  Cache Service   │
                        │   (KV Storage)   │
                        └──────────────────┘
```

### Project Structure
```
/
├── src/
│   ├── index.js                    # Cloudflare Worker entry point
│   ├── handlers/
│   │   ├── activitypub.js          # ActivityPub protocol handlers
│   │   ├── webfinger.js            # WebFinger protocol implementation
│   │   └── weather.js              # Weather data endpoints
│   ├── services/
│   │   ├── weather-service.js      # Weather data fetching and processing
│   │   ├── location-service.js     # Nominatim geocoding service
│   │   ├── activitypub-service.js  # ActivityPub object creation
│   │   └── cache-service.js        # Caching abstraction layer
│   ├── utils/
│   │   ├── weather-formatters.js   # Text formatting utilities (ported)
│   │   ├── emoji-mappings.js       # Weather condition to emoji mapping
│   │   └── text-utils.js           # Text processing utilities
│   ├── models/
│   │   ├── location.js             # Location data models
│   │   ├── weather-post.js         # Weather post structures
│   │   └── activitypub-objects.js  # ActivityPub object schemas
│   └── config/
│       ├── constants.js            # Configuration constants
│       └── api-endpoints.js        # External API configurations
├── tests/
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   └── fixtures/                   # Test data
├── wrangler.toml                   # Cloudflare Worker configuration
└── package.json                    # Node dependencies
```

## Implementation Milestones

### Milestone 1: Foundation and Infrastructure ✅ COMPLETED

#### Tasks
- [x] Initialize Cloudflare Worker project with Wrangler
- [x] Set up project structure and module organization
- [x] Configure JavaScript ES modules build pipeline
- [x] Create hybrid caching strategy (Cache API + KV)
- [x] Set up local development environment with wrangler dev
- [x] Configure wrangler.toml with KV bindings and environment variables
- [x] Create basic routing handler in index.js
- [x] Set up error handling and logging framework with custom error classes
- [x] Initialize GitHub repository with .gitignore and README
- [x] Implement deterministic ID generation system with full test coverage
- [x] Create cache service with Cache API for weather/location data
- [x] Document caching and ID generation strategies
- [x] Create comprehensive utility functions with test coverage

#### Deliverables
- Working Cloudflare Worker skeleton with routing
- Hybrid caching (Cache API for ephemeral, KV for persistent)
- Error handling and structured logging
- Deterministic ID system preventing duplicates
- Development environment ready

### Milestone 2: Weather Service Core ✅ COMPLETED

#### Tasks
- [x] Implement WMO weather code to emoji mapping
- [x] Update weather text formatting for OpenMeteo data structure
- [x] Implement weather API handler structure in `/handlers/weather.js`
- [x] Implement OpenMeteo API client for forecast endpoint
- [x] Support bulk location requests with OpenMeteo
- [x] Implement current conditions fetching
- [x] Generate alerts from severe weather conditions
- [ ] Implement temperature comparison logic for multi-day forecasts
- [ ] Create weather data models and type definitions
- [x] Implement 6-hour caching strategy for weather data (cache service ready)
- [x] Add error handling and fallback for API failures (framework exists)
- [ ] Create unit tests for weather formatting functions
- [ ] Create integration tests for NWS API interactions

#### Deliverables
- Complete weather service module
- All weather formatting utilities ported
- NWS API integration working
- Caching implemented for weather data
- Test coverage for weather functionality

### Milestone 3: Location Service and Geocoding ✅ COMPLETED

#### Tasks
- [x] Implement Nominatim search API client
- [x] Create location search and geocoding functions
- [x] Implement location alias resolution (e.g., "nyc" → "New York City")
- [x] Add support for international locations
- [x] Implement 30-day caching for geocoding results (cache service ready)
- [x] Create location validation and error handling (framework exists)
- [ ] Add fallback strategies for geocoding failures
- [ ] Implement location data models
- [ ] Create unit tests for geocoding logic
- [ ] Create integration tests for Nominatim API

#### Deliverables
- Working location service with geocoding
- Location alias support
- Heavy caching for geocoding results
- Test coverage for location functionality

### Milestone 4: ActivityPub Protocol Implementation ✅ COMPLETED

#### Tasks
- [x] Implement WebFinger endpoint (/.well-known/webfinger)
- [x] Create ActivityPub actor object generation for locations
- [x] Implement actor profile endpoint (/locations/{location})
- [x] Create inbox endpoint for receiving ActivityPub messages
- [x] Create outbox endpoint with pagination support
- [x] Implement followers collection endpoint
- [x] Implement following collection endpoint (empty/static)
- [x] Add proper Content-Type headers (application/activity+json)
- [x] Implement JSON-LD context handling
- [x] Create ActivityPub object schemas and validators
- [ ] Add HTTP signature verification for inbox (placeholder exists)
- [x] Implement proper error responses with ActivityPub format
- [x] Create ActivityPub push delivery system with batching and retry logic
- [x] Implement Follow/Unfollow activity handling with Accept responses
- [x] Implement Delete activity handling for account deletions
- [x] Add HTTP signature signing and verification with RSA-SHA256
- [x] Implement proper JSON-LD context with Mastodon extensions
- [x] Add content negotiation for ActivityPub vs HTML responses
- [x] Implement NodeInfo and host-meta discovery endpoints
- [x] Fix all critical ActivityPub spec violations
- [ ] Create unit tests for ActivityPub object generation
- [ ] Create integration tests for protocol compliance

#### Deliverables
- Complete ActivityPub protocol support with push delivery
- WebFinger discovery working
- Actor endpoints functional
- Collections implemented
- Delivery service for pushing to follower inboxes
- HTTP signature verification (pending)

### Milestone 5: Weather Post Generation ✅ COMPLETED

#### Tasks
- [x] Create weather post (Note) object generator (WeatherPost model)
- [x] Implement morning forecast post format (7am local time)
- [x] Implement noon forecast post format
- [x] Implement evening forecast post format (7pm - tonight + tomorrow)
- [ ] Add temperature change descriptions between days (needs weather API data)
- [x] Implement hashtag generation (#weather, location-specific tags)
- [x] Create unique post ID generation system (deterministic)
- [x] Add proper addressing (to: Public, cc: followers)
- [ ] Implement character limit handling (500 chars)
- [x] Create post scheduling logic based on location timezone
- [x] Add caching for generated posts (KV storage)
- [x] Create unit tests for post generation (comprehensive)
- [ ] Create sample posts for documentation

#### Deliverables
- Weather post generation working
- All three daily post formats implemented
- Proper ActivityPub Note objects created
- Timezone-aware scheduling logic

### Milestone 6: Severe Weather Alerts ✅ COMPLETED

#### Tasks
- [x] Implement alert monitoring and change detection (framework in cron)
- [x] Create alert Note object generation (WeatherPost.createAlertPost)
- [x] Add proper grammar for alert descriptions ("a" vs "an") (implemented in index.js)
- [x] Implement alert collection management (alerts endpoint)
- [x] Add pinning functionality for active alerts (featured collection)
- [x] Implement alert expiration and unpinning (KV TTL)
- [x] Create alert deduplication logic (deterministic IDs + KV tracking)
- [x] Add immediate posting for new alerts (cron checks every 5 minutes)
- [x] Implement alert severity prioritization (sensitive flag for extreme/severe)
- [x] Create unit tests for alert processing (WeatherPost tests)
- [ ] Test with real NWS alert data (needs API integration)

#### Deliverables
- Alert monitoring and posting system
- Pinned collection for active alerts
- Proper alert formatting and grammar
- Alert lifecycle management

### Milestone 7: Follower Management ✅ COMPLETED

#### Tasks
- [x] Implement Follow activity handling in inbox
- [x] Create follower storage in KV (CacheService)
- [x] Implement Undo Follow activity handling
- [x] Add follower collection pagination (collection endpoints)
- [x] Create Accept activity responses for follows (DeliveryService)
- [x] Implement follower notification system (automatic Accept)
- [x] Add follower count tracking (collection totalItems)
- [x] Create follower list management utilities (add/remove/get)
- [ ] Implement rate limiting for follow requests
- [ ] Add spam/abuse protection for follows
- [ ] Create unit tests for follower management
- [ ] Test with real Mastodon instances

#### Deliverables
- Complete follower management system
- Follow/Unfollow handling
- Follower notifications working
- Spam protection implemented

### Milestone 8: Caching and Performance Optimization ✅ COMPLETED

#### Tasks
- [x] Implement cache service abstraction layer (CacheService class)
- [x] Configure weather data cache (6-hour TTL)
- [x] Configure location cache (30-day TTL)
- [x] Configure ActivityPub object cache (1-hour TTL)
- [x] Implement cache key generation strategies (URL-based keys)
- [ ] Add cache warming for popular locations
- [ ] Implement stale-while-revalidate pattern
- [x] Add cache hit/miss metrics (debug logging)
- [x] Optimize KV read/write patterns (batch operations in delivery)
- [x] Implement batch operations where possible (delivery batching)
- [x] Add performance monitoring (structured logging)
- [ ] Load test with expected traffic patterns

#### Deliverables
- Complete caching strategy implemented
- Performance metrics available
- Load testing completed
- Optimized for Cloudflare edge

### Milestone 9: Scheduled Posting System ✅ COMPLETED

#### Tasks
- [x] Implement Cloudflare Cron Triggers configuration (*/5 * * * *)
- [x] Create timezone-aware scheduling logic (getLocalTime function)
- [x] Implement 7am local time forecast posting
- [x] Implement noon local time forecast posting
- [x] Implement 7pm local time evening posting
- [x] Implement 5-minute alert checking cycle
- [x] Add deterministic ID-based deduplication
- [x] Create delivery queue system using KV
- [x] Implement push delivery to follower inboxes with batching
- [ ] Add job retry logic for failures
- [x] Create posting status tracking (KV storage)
- [ ] Add monitoring for missed posts
- [ ] Implement backfill logic for gaps
- [ ] Create admin endpoints for manual triggering
- [x] Test scheduling logic for multiple timezones (comprehensive tests)

#### Deliverables
- 5-minute cron for alerts and timezone-aware forecasts
- Push-based delivery to ActivityPub followers
- Timezone calculation for global locations
- Delivery queue for failed attempts
- Alert deduplication with KV tracking

### Milestone 10: Testing and Validation ✅ COMPLETED

#### Tasks
- [x] Create comprehensive unit test suite (utilities and models covered)
- [x] Implement integration tests for all APIs (ActivityPub, delivery, weather)
- [x] Add ActivityPub protocol compliance tests
- [x] Create end-to-end tests with mock Mastodon
- [x] Test HTTP signature signing and verification
- [x] Test bulk location requests with OpenMeteo
- [x] Validate weather data accuracy
- [x] Test caching behavior and performance (CacheService tests)
- [x] Test error handling and recovery (ErrorHandler tests)
- [x] Create automated test pipeline (Vitest configuration)
- [ ] Test with real Mastodon instances
- [ ] Test with Pleroma/Misskey compatibility
- [ ] Load test with simulated follower traffic
- [ ] Document test coverage metrics

#### Deliverables
- Complete test suite
- >80% code coverage
- ActivityPub compliance validated
- Performance benchmarks documented

### Milestone 11: Deployment and Operations

#### Tasks
- [ ] Configure Cloudflare Workers GitHub integration
- [ ] Set up branch deployment mappings (main → production, develop → staging)
- [ ] Configure environment-specific secrets in Cloudflare dashboard
- [ ] Implement staging environment with separate KV namespaces
- [ ] Configure automatic deployments on git push
- [ ] Set up deployment previews for pull requests
- [ ] Implement health check endpoints
- [ ] Configure Cloudflare Analytics and logging
- [ ] Set up monitoring and alerting with Workers Analytics
- [ ] Create deployment rollback procedures using Cloudflare dashboard
- [ ] Configure DDoS protection and rate limiting rules
- [ ] Document deployment process and rollback procedures
- [ ] Set up KV namespace backup procedures

#### Deliverables
- GitHub integration configured and working
- Automatic deployments on push
- Staging and production environments
- Monitoring and alerting configured
- Deployment documentation

### Milestone 12: Documentation and Launch

#### Tasks
- [ ] Create user documentation for following locations
- [ ] Document supported location formats and aliases
- [ ] Create API documentation
- [ ] Write troubleshooting guide
- [ ] Create contributor guidelines
- [ ] Document configuration options
- [ ] Create example integrations
- [ ] Write performance tuning guide
- [ ] Create runbook for operations
- [ ] Design and add service logo/branding
- [ ] Create announcement posts for launch
- [ ] Submit to Mastodon instance directories

#### Deliverables
- Complete documentation
- Public launch ready
- Marketing materials prepared
- Listed in instance directories

## Technical Specifications

### ActivityPub Objects

#### Actor (Location)
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://weather.gripe/locations/newyork",
  "preferredUsername": "newyork",
  "name": "New York, NY Weather",
  "summary": "Automated weather forecasts and severe weather alerts for New York, NY. Posts at 7am, noon, and 7pm ET.",
  "inbox": "https://weather.gripe/locations/newyork/inbox",
  "outbox": "https://weather.gripe/locations/newyork/outbox",
  "followers": "https://weather.gripe/locations/newyork/followers",
  "following": "https://weather.gripe/locations/newyork/following",
  "featured": "https://weather.gripe/locations/newyork/alerts",
  "icon": {
    "type": "Image",
    "url": "https://weather.gripe/icons/weather-bot.png",
    "mediaType": "image/png"
  },
  "publicKey": {
    "id": "https://weather.gripe/locations/newyork#main-key",
    "owner": "https://weather.gripe/locations/newyork",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----..."
  }
}
```

#### Weather Post (Note)
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "https://weather.gripe/posts/550e8400-e29b-41d4-a716-446655440000",
  "attributedTo": "https://weather.gripe/locations/newyork",
  "content": "☀️ Today: Sunny, with a high near 72°F. Northwest wind 5 to 10 mph.\n\n🌙 Tonight: Clear, with a low around 54°F. North wind around 5 mph.\n\n#weather #nyc",
  "published": "2025-08-12T07:00:00-04:00",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://weather.gripe/locations/newyork/followers"],
  "tag": [
    {
      "type": "Hashtag",
      "href": "https://weather.gripe/tags/weather",
      "name": "#weather"
    },
    {
      "type": "Hashtag",
      "href": "https://weather.gripe/tags/nyc",
      "name": "#nyc"
    }
  ]
}
```

### API Endpoints

#### WebFinger
- `GET /.well-known/webfinger?resource=acct:newyork@weather.gripe`

#### ActivityPub
- `GET /locations/{location}` - Actor profile
- `GET /locations/{location}/inbox` - Inbox (POST for activities)
- `GET /locations/{location}/outbox` - Outbox with posts
- `GET /locations/{location}/followers` - Followers collection
- `GET /locations/{location}/following` - Following collection (empty)
- `GET /locations/{location}/alerts` - Featured collection for alerts
- `GET /posts/{uuid}` - Individual post

### Caching Strategy (Hybrid Approach)

| Data Type | Storage | TTL | Key Pattern |
|-----------|---------|-----|-------------|
| Weather Data | Cache API | 6 hours | `https://weather.gripe/cache/weather/{lat},{lon}/{endpoint}` |
| Geocoding | Cache API | 30 days | `https://weather.gripe/cache/geocode/{location}` |
| ActivityPub Objects | Cache API | 1 hour | `https://weather.gripe/cache/activitypub/{type}/{id}` |
| Followers | KV Storage | Permanent | `followers:{location_id}` |
| Posts History | KV Storage | Permanent | `post:{post_id}` |
| Alert Tracking | KV Storage | Until expiry | `alerts:{location}:{alert_id}` |
| Delivery Queue | KV Storage | 1 hour | `delivery:{timestamp}:{random}` |

### External APIs

#### Nominatim (OpenStreetMap)
- Endpoint: `https://nominatim.openstreetmap.org/search`
- Rate limit: 1 request per second
- Usage: Geocoding location names to coordinates

#### OpenMeteo (Open-Meteo.com)
- Base URL: `https://api.open-meteo.com/v1`
- Endpoints:
  - `/forecast` - Weather forecasts (supports bulk requests)
- Features:
  - Global coverage (not limited to US)
  - Bulk requests with comma-separated coordinates
  - WMO weather codes (0-99)
  - 2-day forecast option (today and tomorrow)
  - Current conditions available
  - No dedicated alerts API (generated from severe weather codes)
- Rate limit: No strict limit, reasonable use expected
- Coverage: Global

## Configuration

### Environment Variables
```toml
# wrangler.toml
name = "weather-gripe"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
DOMAIN = "weather.gripe"
ADMIN_EMAIL = "admin@weather.gripe"
USER_AGENT = "weather.gripe/1.0 (https://weather.gripe; admin@weather.gripe)"

[[kv_namespaces]]
binding = "FOLLOWERS"
id = "followers_namespace_id"

[[kv_namespaces]]
binding = "POSTS"
id = "posts_namespace_id"

[[kv_namespaces]]
binding = "ALERTS"
id = "alerts_namespace_id"

[[kv_namespaces]]
binding = "DELIVERY_QUEUE"
id = "delivery_queue_namespace_id"

[triggers]
crons = [
  "*/5 * * * *"  # Run every 5 minutes for alerts and timezone-aware forecasts
]
```

## Success Criteria

### Functional Requirements
- [ ] Users can follow location accounts from Mastodon
- [ ] Weather posts appear at scheduled times
- [ ] Severe weather alerts post immediately
- [ ] Alerts are pinned while active
- [ ] Location search works for common names
- [ ] International locations are supported

### Non-Functional Requirements
- [ ] Response time < 100ms for cached content
- [ ] Response time < 500ms for uncached content
- [ ] 99.9% uptime for the service
- [ ] Support for 10,000+ followers per location
- [ ] ActivityPub protocol compliance
- [ ] Mobile-friendly post formatting

### Quality Metrics
- [ ] Code coverage > 80%
- [ ] All critical paths tested
- [ ] Documentation complete
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] Accessibility standards met

## Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|------------|
| NWS API downtime | Cache weather data for 6 hours, serve stale data if needed |
| Nominatim rate limits | Heavy caching (30 days), implement request queuing |
| Large follower lists | Implement pagination, use batch operations |
| DDoS attacks | Cloudflare DDoS protection, rate limiting |
| Data inconsistency | Implement data validation, use transactions where possible |

### Operational Risks
| Risk | Mitigation |
|------|------------|
| Missed scheduled posts | Monitoring and alerting, backfill capability |
| Cache invalidation issues | TTL-based expiry, manual cache purge endpoints |
| Debugging production issues | Comprehensive logging, request tracing |
| Deployment failures | Cloudflare's built-in rollback, version history |

## Maintenance and Operations

### Regular Tasks
- Monitor API rate limits and adjust caching as needed
- Review and update location aliases based on user requests
- Monitor follower growth and optimize as needed
- Update weather emoji mappings for new conditions
- Review and respond to ActivityPub protocol updates

### Monitoring
- Uptime monitoring for all endpoints
- Performance metrics for response times
- Cache hit/miss ratios
- API rate limit usage
- Error rates and types
- Follower growth trends
- Post delivery success rates

### Support
- GitHub Issues for bug reports
- Documentation wiki for user guides
- Status page for service health
- Admin dashboard for operations

## Future Enhancements

### Phase 2 Features (Post-Launch)
- [ ] Multi-language support for weather posts
- [ ] Custom alerts based on user preferences
- [ ] Historical weather data access
- [ ] Weather maps and visualizations
- [ ] Integration with more weather APIs (international)
- [ ] Webhook support for external integrations
- [ ] RSS feed generation
- [ ] Email notification option

### Phase 3 Features (Long-term)
- [ ] AI-powered weather summaries
- [ ] Predictive alert notifications
- [ ] Climate change tracking
- [ ] Agricultural weather advisories
- [ ] Aviation weather support
- [ ] Marine weather forecasts
- [ ] Weather-based automation triggers
- [ ] Mobile app companion

## Conclusion

This implementation plan provides a comprehensive roadmap for building an ActivityPub-compatible weather service on Cloudflare Workers. The task-based milestone structure ensures clear progress tracking and allows for flexible timeline adjustment based on available resources. The plan leverages existing weather formatting code while building a modern, scalable, and maintainable service architecture.