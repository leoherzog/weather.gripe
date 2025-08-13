# Changelog

All notable changes to the Weather.gripe ActivityPub service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] - 2025-08-13

### Technical Debt Cleanup - 2025-08-13

#### Completed Improvements
- **Implemented all missing weather functionality** - Removed 17 TODO comments by implementing weather API endpoints
- **Split CacheService god object** - Refactored into three focused services:
  - `HttpCache` - Handles HTTP response caching via Cache API
  - `StateStore` - Manages persistent KV storage operations
  - `PostRepository` - Handles post-specific storage and retrieval
- **Improved architecture** - Applied dependency injection pattern preparation
- **Enhanced maintainability** - Reduced coupling between services

#### Technical Changes
- Implemented weather forecast, current conditions, alerts, and geocoding endpoints in `/handlers/weather.js`
- Created `generateAlertsFromForecast()` function to derive alerts from weather conditions
- Implemented `getActiveLocations()` to list locations with followers
- Fixed async/await patterns in forecast content formatting
- Updated all services to use new focused service classes
- Added proper followers collection implementation with pagination
- Implemented alerts collection for active weather warnings
- Fixed post retrieval from KV storage

### Architecture Review - 2025-08-12

#### Discovered Issues
- **Critical**: Found duplicate index files (`index.js` and `index-broken.js`) with 80% code duplication
- **Critical**: Identified 17 TODO comments indicating missing core weather functionality
- **Major**: Discovered God Object anti-pattern in `CacheService` (306 lines, 6+ responsibilities)
- **Major**: Found 447-line if-else routing chain requiring refactoring
- **Security**: Missing input validation across all request handlers
- **Performance**: ~30% of codebase identified as redundant or inefficient
- **Testing**: Test configuration using wrong environment (Node instead of Workers)

#### Required Actions
- Immediate deletion of duplicate files and empty directories
- Refactoring of CacheService into focused services
- Implementation of proper routing pattern
- Addition of comprehensive input validation
- Completion or removal of TODO implementations

See [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) for full details.

## [0.2.0-review] - 2025-08-12

### Added
- Complete ActivityPub specification compliance
- NodeInfo 2.0 endpoint for server discovery (`/.well-known/nodeinfo` and `/nodeinfo/2.0`)
- Host-meta endpoint for WebFinger discovery (`/.well-known/host-meta`)
- Content negotiation to serve HTML or ActivityPub based on Accept headers
- Retry logic with exponential backoff for failed deliveries (3 retries: 1s, 5s, 15s)
- KV namespace availability checks before all operations
- Stricter HTTP signature verification with environment flag (`STRICT_SIGNATURES`)
- Proper error responses distinguishing malformed vs unsupported activities
- Comprehensive JSON-LD context with Mastodon extensions
- Optimized pagination for KV list operations
- `getPostCount` method for efficient collection totalItems

### Fixed
- Missing `generateKeyPair` import in delivery-service.js causing runtime errors
- Incorrect JSON-LD contexts missing essential ActivityPub extensions
- OpenMeteo API bulk response handling (now correctly handles single object with arrays)
- Outbox not wrapping Notes in Create activities (ActivityPub spec violation)
- Missing CORS headers required for ActivityPub (Signature, Digest headers)
- Delivery service timeout handling with AbortController
- Error handling for permanent (4xx) vs temporary (5xx) delivery failures
- KV operations now fail gracefully when namespaces unavailable
- Post ID format verification (confirmed using hyphens, no colons)

### Changed
- Outbox now returns properly paginated OrderedCollectionPage with Create activities
- Actor objects now include complete ActivityPub context for Mastodon compatibility
- CORS headers expanded to include ActivityPub-specific requirements
- Delivery service enhanced with retry queue using KV storage
- Weather service bulk forecast processing corrected for OpenMeteo response format
- Error responses now return appropriate HTTP status codes (400 for malformed, 202 for unsupported)

### Technical Details
- HTTP signatures: RSA-SHA256 with proper key generation and storage
- Delivery: Batch size of 10 with sequential batch processing
- Caching: 6-hour TTL for weather, 30-day for geocoding, 1-hour for ActivityPub objects
- Retry delays: Exponential backoff at 1s, 5s, 15s intervals
- Timeout: 30-second timeout for all outbound ActivityPub deliveries

## [0.1.0] - 2025-08-11

### Initial Implementation
- Core Cloudflare Worker structure with ES modules
- ActivityPub protocol implementation (WebFinger, actors, collections)
- OpenMeteo weather API integration with global coverage
- Nominatim geocoding service for location resolution
- Deterministic ID generation system preventing duplicates
- Weather post generation for morning, noon, and evening forecasts
- Severe weather alert system with pinned collections
- Follower management with KV storage
- HTTP signature signing and verification
- Hybrid caching strategy (Cache API + KV storage)
- 5-minute cron job for timezone-aware posting
- Comprehensive test suite with Vitest

### Infrastructure
- Cloudflare Workers with KV namespaces
- Environment variables configuration
- Structured logging with debug/info/warn/error levels
- Error handling with custom error classes
- Batch delivery system for follower notifications

### APIs Integrated
- OpenMeteo API for weather forecasts (global coverage)
- Nominatim API for geocoding (OpenStreetMap)
- ActivityPub protocol for federation
- WebFinger protocol for discovery

### Known Limitations
- No dedicated weather alerts API (generated from severe weather codes)
- Manual timezone calculation from longitude
- No real-time WebSub/WebSocket support
- English-only weather descriptions