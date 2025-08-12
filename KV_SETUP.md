# Cloudflare KV Namespace Setup

To complete the setup, you need to create the KV namespaces in your Cloudflare account. 

**Note**: This project uses a hybrid caching approach:
- **Cache API** (free, automatic): Weather data, geocoding results, ActivityPub objects
- **KV Storage** (persistent): Followers, posts history, alert tracking, RSA keys

## Required KV Namespaces

1. **FOLLOWERS** - Stores follower relationships for each location
2. **POSTS** - Stores historical posts for the outbox collection
3. **ALERTS** - Tracks active weather alerts with TTL to prevent duplicates
4. **DELIVERY_QUEUE** - Queue for retrying failed ActivityPub deliveries
5. **KEYS** - Stores RSA key pairs for HTTP Signature authentication

## Production Namespaces

```bash
npx wrangler kv:namespace create "FOLLOWERS"
npx wrangler kv:namespace create "POSTS"
npx wrangler kv:namespace create "ALERTS"
npx wrangler kv:namespace create "DELIVERY_QUEUE"
npx wrangler kv:namespace create "KEYS"
```

## Preview/Development Namespaces

```bash
npx wrangler kv:namespace create "FOLLOWERS" --preview
npx wrangler kv:namespace create "POSTS" --preview
npx wrangler kv:namespace create "ALERTS" --preview
npx wrangler kv:namespace create "DELIVERY_QUEUE" --preview
npx wrangler kv:namespace create "KEYS" --preview
```

## Staging Environment Namespaces

```bash
npx wrangler kv:namespace create "FOLLOWERS" --env staging
npx wrangler kv:namespace create "POSTS" --env staging
npx wrangler kv:namespace create "ALERTS" --env staging
npx wrangler kv:namespace create "DELIVERY_QUEUE" --env staging
npx wrangler kv:namespace create "KEYS" --env staging
```

## Updating wrangler.toml

After running these commands, you'll get output like:

```
🌀 Creating namespace with title "weather-gripe-FOLLOWERS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "FOLLOWERS", id = "abcd1234..." }
```

Take the `id` values from each command and update the corresponding placeholders in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "FOLLOWERS"
id = "your_followers_id_here"
preview_id = "your_followers_preview_id_here"

[[kv_namespaces]]
binding = "POSTS"
id = "your_posts_id_here"
preview_id = "your_posts_preview_id_here"

[[kv_namespaces]]
binding = "ALERTS"
id = "your_alerts_id_here"
preview_id = "your_alerts_preview_id_here"

[[kv_namespaces]]
binding = "DELIVERY_QUEUE"
id = "your_delivery_queue_id_here"
preview_id = "your_delivery_queue_preview_id_here"

[[kv_namespaces]]
binding = "KEYS"
id = "your_keys_id_here"
preview_id = "your_keys_preview_id_here"
```

## KV Storage Details

### Data Structure

#### FOLLOWERS
Key format: `followers:{location_id}`
```json
[
  {
    "id": "https://mastodon.social/users/username",
    "inbox": "https://mastodon.social/users/username/inbox",
    "sharedInbox": "https://mastodon.social/inbox",
    "preferredUsername": "username",
    "followedAt": "2024-01-01T12:00:00Z"
  }
]
```

#### POSTS
Key format: `post:{location_id}:{timestamp}`
```json
{
  "id": "https://weather.gripe/posts/uuid",
  "type": "Note",
  "content": "Weather forecast text",
  "published": "2024-01-01T07:00:00Z",
  "attributedTo": "https://weather.gripe/locations/newyork"
}
```

#### ALERTS
Key format: `alert:{location_id}:{alert_id}`
TTL: Set to alert expiration time
```json
{
  "id": "https://weather.gripe/posts/alert-uuid",
  "type": "Note",
  "content": "Alert text",
  "sensitive": true,
  "published": "2024-01-01T15:00:00Z"
}
```

#### DELIVERY_QUEUE
Key format: `delivery:{timestamp}:{random_id}`
TTL: 1 hour for retry attempts
```json
{
  "inbox": "https://mastodon.social/inbox",
  "activity": { /* ActivityPub activity object */ },
  "attempts": 1,
  "lastAttempt": "2024-01-01T12:00:00Z"
}
```

#### KEYS
Key format: `private_key:{location_id}` or `public_key:{location_id}`
Value: PEM-formatted RSA key
```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEA...
-----END PRIVATE KEY-----
```

## Verifying Setup

After updating `wrangler.toml`, you can verify the setup:

```bash
# List all KV namespaces
npx wrangler kv:namespace list

# Test KV operations locally
npx wrangler dev

# Deploy to preview environment
npx wrangler deploy --env preview
```

## Cache API vs KV Storage

### Use Cache API for:
- Weather forecast data (6-hour TTL)
- Geocoding results (30-day TTL)
- ActivityPub object caching (1-hour TTL)

### Use KV Storage for:
- Follower relationships (permanent)
- Post history (permanent)
- Alert tracking (TTL-based)
- Delivery retry queue (1-hour TTL)
- RSA key pairs (permanent)

## Troubleshooting

### Common Issues

1. **"Namespace not found" errors**: Ensure all KV namespaces are created and IDs are correctly updated in wrangler.toml

2. **"Binding not found" errors**: Check that the binding names match exactly between code and wrangler.toml

3. **Preview vs Production**: Remember that preview and production use different namespace IDs

### Debug Commands

```bash
# Check if namespace exists
npx wrangler kv:namespace list | grep FOLLOWERS

# Write test data
npx wrangler kv:key put --binding=FOLLOWERS "test" "value"

# Read test data
npx wrangler kv:key get --binding=FOLLOWERS "test"

# Delete test data
npx wrangler kv:key delete --binding=FOLLOWERS "test"
```