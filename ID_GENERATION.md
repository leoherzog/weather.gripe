# Deterministic ID Generation Strategy

This document explains how we generate deterministic, predictable IDs for all ActivityPub objects to prevent duplicates and ensure consistency even after cache purges.

## Why Deterministic IDs?

Without deterministic IDs, if caches are purged or the worker restarts:
- The same weather forecast could be posted multiple times
- Followers might see duplicate posts in their timeline
- Alert posts might be recreated unnecessarily
- ActivityPub implementations might get confused by changing IDs

## ID Generation Rules

### Post IDs

Post IDs are generated based on the content and timing, ensuring the same post always has the same ID.

#### Forecast Posts
Format: `{locationId}-{postType}-{YYYYMMDD}-{HH}`

Examples:
- `newyork-forecast-morning-20250812-07` (Morning forecast for NYC on Aug 12, 2025)
- `paris-forecast-evening-20250812-19` (Evening forecast for Paris)

Components:
- **locationId**: Normalized location name
- **postType**: One of `forecast-morning`, `forecast-noon`, `forecast-evening`
- **date**: YYYYMMDD format
- **hour**: Two-digit hour (07, 12, or 19)

#### Alert Posts
Format: `{locationId}-alert-{nws-alert-id}`

Examples:
- `newyork-alert-nws-maz014-blizzard-warning-20250812`
- `miami-alert-nws-flz072-hurricane-warning-20250815`

Components:
- **locationId**: Normalized location name
- **"alert"**: Literal string indicating alert type
- **nws-alert-id**: The unique ID from NWS (already unique and deterministic)

### Actor IDs

Actor IDs are simply the normalized location name.

Examples:
- `newyork`
- `paris`
- `tokyojapan`

This ensures:
- The same location always has the same actor
- URLs are predictable: `/locations/newyork`
- WebFinger lookups are consistent

### Collection IDs

Format: `{actorId}-{collectionType}[-page{N}]`

Examples:
- `newyork-outbox` (Main outbox collection)
- `newyork-outbox-page1` (First page of outbox)
- `newyork-followers` (Followers collection)
- `newyork-alerts` (Featured/pinned alerts)

### Activity IDs

#### Create Activities
Format: `{postId}-create`

Example:
- `newyork-forecast-morning-20250812-07-create`

This ensures the Create activity for a post is always the same.

#### Accept Activities
Format: `accept-{actorId}-{followerHash}-{YYYYMMDD}-{HHMMSS}`

Example:
- `accept-newyork-a7f3b2c1-20250812-143022`

Components include a hash of the follower ID to keep IDs short while maintaining uniqueness.

## Implementation

### Generating IDs

```javascript
import { generatePostId, generateActorId } from './utils/id-generator.js';

// Generate a forecast post ID
const postId = generatePostId(
  'newyork',                    // locationId
  new Date('2025-08-12T07:00'), // postTime
  'forecast-morning',            // postType
  null                          // alertId (only for alerts)
);
// Result: "newyork-forecast-morning-20250812-07"

// Generate an alert post ID
const alertId = generatePostId(
  'miami',
  new Date('2025-08-15T14:30'),
  'alert',
  'NWS.FLZ072.HURRICANE.WARNING.20250815'
);
// Result: "miami-alert-nws-flz072-hurricane-warning-20250815"
```

### Checking for Existing Posts

Before creating a new post:

```javascript
// Check if this exact post already exists
const postId = generatePostId(locationId, postTime, postType);
const exists = await WeatherPost.exists(postId, env);

if (!exists) {
  // Create and store the post
  const post = WeatherPost.createForecastPost({...});
  await WeatherPost.store(post, env);
}
```

## Benefits

1. **Idempotency**: Running the same posting logic twice won't create duplicates
2. **Predictability**: Can construct URLs without database lookups
3. **Debugging**: IDs contain useful information about the content
4. **Cache Recovery**: After cache purge, regenerated content has same IDs
5. **Federation**: Remote servers see consistent IDs for the same content

## Edge Cases

### Time Zone Handling
- All times in IDs use UTC to avoid confusion
- The actual posting time (7am local) is converted to UTC for the ID
- Example: 7am EST (12:00 UTC) → ID uses hour "12"

### Location Name Changes
- Location IDs are normalized (lowercase, alphanumeric only)
- "New York" and "new-york" both become "newyork"
- Aliases are handled at the lookup level, not in IDs

### Alert Updates
- NWS sometimes updates alerts with the same ID
- We use the NWS ID directly, so updates replace the existing post
- The published timestamp remains the original effective time

### Missing Posts
- If a scheduled post was missed (e.g., downtime), it can be backfilled
- The ID will be based on when it should have been posted
- The `shouldPostExist()` function helps identify gaps

## Testing

To verify ID generation is working correctly:

```javascript
// Test that IDs are deterministic
const id1 = generatePostId('newyork', new Date('2025-08-12T07:00'), 'forecast-morning');
const id2 = generatePostId('newyork', new Date('2025-08-12T07:00'), 'forecast-morning');
console.assert(id1 === id2, 'IDs should be identical');

// Test that different times produce different IDs
const morning = generatePostId('newyork', new Date('2025-08-12T07:00'), 'forecast-morning');
const noon = generatePostId('newyork', new Date('2025-08-12T12:00'), 'forecast-noon');
console.assert(morning !== noon, 'Different times should produce different IDs');
```

## Migration

For existing systems migrating to deterministic IDs:
1. Generate new IDs for all existing content
2. Store mapping of old IDs to new IDs
3. Implement redirects from old URLs to new URLs
4. Update follower's cached data gradually

## Future Considerations

- **Versioning**: May need to add version suffix if post format changes significantly
- **Multi-language**: May need language code in ID for internationalization
- **Historical data**: May want to regenerate historical posts with correct IDs