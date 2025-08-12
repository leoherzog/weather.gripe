# Cron Execution Strategy

## Overview

The service runs a single cron job **every 5 minutes** that handles both:
1. **Severe weather alerts** - Checked every 5 minutes
2. **Scheduled forecasts** - Posted at 7am, noon, and 7pm local time

## Execution Flow

```
Every 5 minutes:
├── Check all active locations for alerts
│   ├── Fetch current alerts from NWS
│   ├── Compare with posted alerts (KV)
│   └── Post new alerts immediately
│
├── Check ALL locations for forecast posting times
│   ├── Calculate each location's local time
│   ├── If local time is 7:00-7:04, 12:00-12:04, or 19:00-19:04
│   ├── Check if post already exists (deterministic ID)
│   ├── Generate forecast post if needed
│   └── Deliver to followers
│
└── Process delivery queue (retries)
```

## Performance Optimization

### Alert Checking (Every 5 Minutes)
- **Frequency**: 288 times per day
- **Scope**: Only locations with followers
- **Caching**: NWS responses cached for 6 hours
- **Deduplication**: Track posted alerts in KV with TTL

### Forecast Posting (Every 5 Minutes)
- **Frequency**: 288 times per day (checked)
- **Actual posts**: 3 per location per day
- **Window**: Minutes 0-4 of each posting hour (7am, noon, 7pm local)
- **Timezone aware**: Each location checked against its local time
- **Idempotency**: Deterministic IDs prevent duplicates

## Resource Usage Estimates

### Per Execution (5-minute interval)
| Operation | Typical | Peak |
|-----------|---------|------|
| Duration | 1-2 sec | 10 sec |
| KV reads | 10-50 | 500 |
| KV writes | 0-5 | 50 |
| Cache API hits | 10-50 | 500 |
| External API calls | 0-10 | 100 |
| Deliveries | 0-100 | 10,000 |

### Daily Totals
| Metric | Count | Notes |
|--------|-------|-------|
| Cron executions | 288 | Every 5 minutes |
| Alert checks | 288 × locations | Cached heavily |
| Forecast checks | 24 × locations | Only top of hour |
| Actual forecasts | 3 × locations | Morning, noon, evening |
| Alert posts | Variable | Based on weather |

## Timezone Handling

### The Challenge
With locations worldwide, every 5-minute interval has different locations hitting their posting times:
- When it's 7:00 AM in New York (EST), it's 12:00 PM in London (GMT)
- When it's 7:00 PM in Tokyo, it's 11:00 AM in Paris
- Every 5 minutes, ~1/288th of the world enters a posting window

### Implementation
```javascript
// Every 5 minutes, check ALL locations
for (const location of allLocationsWithFollowers) {
  const localTime = getLocalTime(location, now);
  const hour = localTime.getHours();
  const minute = localTime.getMinutes();
  
  // Check if in posting window (first 5 minutes of hour)
  if (minute < 5 && [7, 12, 19].includes(hour)) {
    // Post if not already posted (deterministic ID prevents dupes)
    createAndDeliverForecast(location);
  }
}
```

### Timezone Data Sources
1. **From Nominatim**: Some geocoding results include timezone
2. **From coordinates**: Rough estimate using longitude (±15° = ±1 hour)
3. **From timezone API**: Could add dedicated timezone lookup service
4. **Cached**: Store timezone with location data after first lookup

## Optimization Strategies

### 1. Smart Location Filtering
```javascript
// Only check locations with followers
const activeLocations = await getLocationsWithFollowers();

// Skip locations outside severe weather zones
const alertEligible = activeLocations.filter(loc => 
  loc.country === 'US' && // NWS only covers US
  loc.hasRecentActivity()
);
```

### 2. Efficient Alert Deduplication
```javascript
// Use KV with automatic expiration
const alertKey = `alerts:${location}:${alert.id}`;
await env.ALERTS.put(alertKey, '1', {
  expirationTtl: alert.expires - now
});
```

### 3. Batch Operations
```javascript
// Fetch multiple locations' alerts in parallel
const alertPromises = locations.map(loc => 
  fetchAlerts(loc).catch(err => null)
);
const results = await Promise.all(alertPromises);
```

### 4. Cache-First Architecture
```javascript
// Check cache before external API
const cached = await cache.getCachedWeatherData(lat, lon, 'alerts');
if (cached && !isStale(cached)) {
  return cached;
}
```

## Cloudflare Limits

### Workers Limits
- **CPU time**: 50ms (Bundled), 30s (Unbound)
- **Duration**: 30 seconds max
- **Requests**: 1000/min subrequest
- **KV operations**: 1000/worker invocation

### Cron Limits
- **Minimum interval**: 1 minute
- **Maximum duration**: 30 seconds
- **Concurrent executions**: Limited by plan

## Monitoring Metrics

### Key Performance Indicators
1. **Execution duration** - Target: <2 seconds typical
2. **Alert latency** - Time from NWS issue to post
3. **Cache hit rate** - Target: >80%
4. **Delivery success rate** - Target: >95%
5. **KV operations per execution** - Target: <100

### Alert Response Times
| Priority | Target | Maximum |
|----------|--------|---------|
| Tornado Warning | <1 min | 5 min |
| Severe Thunderstorm | <5 min | 10 min |
| Winter Storm Warning | <10 min | 15 min |
| Watch/Advisory | <15 min | 30 min |

## Scaling Considerations

### Current Design (MVP)
- Single cron every 5 minutes
- All operations in one execution
- Sequential location processing

### Future Optimization
1. **Durable Objects** for per-location state
2. **Queues** for async alert processing
3. **Smart Placement** for regional workers
4. **Tiered checking** - More frequent for active weather

## Cost Implications

### Cloudflare Workers Pricing
- **Requests**: 288 executions/day = 8,640/month
- **Duration**: ~2 sec × 288 = 576 sec/day
- **KV operations**: Highly dependent on followers

### Optimization Impact
- Cache-first reduces external API calls by 80%
- Deterministic IDs prevent duplicate posts
- Batch delivery reduces total requests

## Error Handling

### Failure Modes
1. **NWS API down** - Use cached data
2. **Execution timeout** - Process critical alerts first
3. **KV limits** - Implement backpressure
4. **Delivery failures** - Queue for retry

### Recovery Strategy
```javascript
try {
  await checkAndPostAlerts(locations);
} catch (error) {
  // Log but don't fail entire execution
  logger.error('Alert check failed', error);
}

// Always try forecasts even if alerts failed
try {
  await checkAndPostForecasts(locations);
} catch (error) {
  logger.error('Forecast check failed', error);
}
```

## Configuration

### Environment Variables
```toml
# Adjust based on needs
ALERT_CHECK_INTERVAL = 5  # minutes
FORECAST_WINDOW = 5       # minutes after hour
MAX_LOCATIONS_PER_RUN = 100
MAX_DELIVERY_BATCH = 10
CACHE_TTL_ALERTS = 21600  # 6 hours
```

## Testing Strategy

### Load Testing
```bash
# Simulate worst case - all locations need alerts
for i in {1..288}; do
  curl -X POST https://weather.gripe/test/trigger-cron
  sleep 300  # 5 minutes
done
```

### Performance Monitoring
```javascript
const startTime = Date.now();
// ... execution logic ...
const duration = Date.now() - startTime;

if (duration > 5000) {
  logger.warn('Slow execution', { duration });
}
```