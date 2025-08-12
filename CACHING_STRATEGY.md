# Caching Strategy

This project uses a hybrid caching approach optimized for Cloudflare Workers, combining the Cache API with KV storage for different types of data.

## Cache API (Cloudflare Cache)

The Cache API is used for HTTP responses and frequently-accessed data that can be regenerated. It's **free**, automatically distributed globally, and handles TTL expiration.

### What We Cache with Cache API:

#### Weather Data (6-hour TTL)
- NWS API responses (forecasts, current conditions, alerts)
- Cache key: `https://weather.gripe/cache/weather/{lat},{lon}/{endpoint}`
- Rationale: Weather data updates infrequently, high read volume

#### Geocoding Results (30-day TTL)
- Nominatim API responses for location searches
- Cache key: `https://weather.gripe/cache/geocode/{location_name}`
- Rationale: Geographic data rarely changes, expensive API calls

#### ActivityPub Objects (1-hour TTL)
- Generated actor profiles, collections, posts
- Cache key: `https://weather.gripe/cache/activitypub/{type}/{id}`
- Rationale: Frequently accessed, can be regenerated from source data

### Benefits:
- ✅ **Free** - No cost for cache storage or operations
- ✅ **Fast** - Served from Cloudflare edge locations
- ✅ **Automatic expiration** - TTL-based cleanup
- ✅ **Global distribution** - Cached at all CF locations

## KV Storage

KV is used for persistent state that must survive cache purges and cannot be regenerated.

### What We Store in KV:

#### Followers List
- List of actors following each location
- Key: `followers:{location_id}`
- Rationale: Must persist, cannot be regenerated, modified by user actions

#### Posted Content
- Historical record of all posts for audit/history
- Key: `post:{post_id}`
- Rationale: Permanent record, needed for post retrieval

#### Alert State
- Tracking which alerts have been posted/pinned
- Key: `alerts:{location_id}:{alert_id}`
- Rationale: Prevents duplicate posts, tracks alert lifecycle

### Benefits:
- ✅ **Persistent** - Survives cache purges
- ✅ **Consistent** - Eventually consistent globally
- ✅ **Durable** - Replicated storage
- ✅ **Metadata support** - Can store additional context

## Implementation Example

```javascript
// Using Cache API for weather data
async function getWeatherForecast(lat, lon) {
  const cacheService = new CacheService(env, logger);
  
  // Try cache first
  let forecast = await cacheService.getCachedWeatherData(lat, lon, 'forecast');
  
  if (!forecast) {
    // Cache miss - fetch from NWS
    forecast = await fetchFromNWS(lat, lon);
    // Cache for 6 hours
    await cacheService.cacheWeatherData(lat, lon, 'forecast', forecast);
  }
  
  return forecast;
}

// Using KV for followers
async function addFollower(locationId, followerActor) {
  const cacheService = new CacheService(env, logger);
  await cacheService.addFollower(locationId, followerActor);
  // This persists in KV storage
}
```

## Cache Invalidation

### Cache API
- Automatic expiration based on TTL
- No manual invalidation needed for time-based data
- Can use cache tags for grouped invalidation (future enhancement)

### KV Storage
- Manual deletion when needed
- TTL support for temporary data (like expiring alerts)
- Batch operations for cleanup

## Performance Characteristics

| Storage Type | Read Speed | Write Speed | Cost | Persistence | Global Sync |
|-------------|------------|-------------|------|-------------|-------------|
| Cache API | ~10ms | ~50ms | Free | TTL-based | Instant |
| KV Storage | ~50ms | ~200ms | Metered | Permanent | ~60 seconds |

## Best Practices

1. **Always try Cache API first** for HTTP responses
2. **Use appropriate TTLs** based on data freshness requirements
3. **Clone responses** before caching to avoid body consumption issues
4. **Add cache headers** to track cache time and debugging
5. **Use KV only for state** that must persist
6. **Batch KV operations** when possible for efficiency

## Monitoring

Track these metrics:
- Cache hit rate (target: >80% for weather data)
- Cache miss reasons (expiration vs. first request)
- KV operation latency
- Storage usage (KV has limits, Cache API doesn't)

## Future Enhancements

1. **Cache Tags** - Group related cache entries for bulk invalidation
2. **Stale-While-Revalidate** - Serve stale content while fetching fresh
3. **Cache Warming** - Preload popular locations
4. **Regional Caching** - Different TTLs for different regions