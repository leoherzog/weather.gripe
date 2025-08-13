/**
 * Configuration Constants
 * Centralized configuration for the weather.gripe service
 */

// Cache TTL settings (in seconds)
export const CACHE_TTL = {
  WEATHER_DATA: 21600,      // 6 hours
  GEOCODING: 2592000,       // 30 days
  ACTIVITYPUB: 3600,        // 1 hour
};

// Delivery configuration
export const DELIVERY_CONFIG = {
  BATCH_SIZE: 10,           // Number of deliveries per batch
  MAX_RETRIES: 3,           // Maximum retry attempts
  RETRY_DELAYS: [1000, 5000, 15000], // Retry delays in ms (1s, 5s, 15s)
  TIMEOUT: 30000,           // Request timeout in ms (30s)
};

// Weather thresholds
export const WEATHER_ALERTS = {
  EXTREME_HEAT_F: 100,      // Fahrenheit threshold for heat warning
  EXTREME_COLD_F: 0,        // Fahrenheit threshold for cold warning
  HIGH_UV_INDEX: 11,        // UV index threshold for warning
  ALERT_TTL: {
    THUNDERSTORM: 3600000,  // 1 hour in ms
    TEMPERATURE: 7200000,   // 2 hours in ms
    UV: 14400000,          // 4 hours in ms
  }
};

// Posting schedule
export const POSTING_SCHEDULE = {
  MORNING_HOUR: 7,         // 7 AM local time
  NOON_HOUR: 12,          // 12 PM local time
  EVENING_HOUR: 19,       // 7 PM local time
  POSTING_WINDOW: 5,      // Minutes after the hour to post
};

// Pagination
export const PAGINATION = {
  FOLLOWERS_PER_PAGE: 20,  // Items per page in follower collection
  POSTS_PER_PAGE: 20,      // Items per page in outbox
  MAX_LIST_SIZE: 1000,     // Maximum items per KV list operation
};

// API Configuration
export const API_CONFIG = {
  OPENMETEO_BASE_URL: 'https://api.open-meteo.com/v1',
  NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org',
  FORECAST_DAYS: 2,        // Number of forecast days to request
};

// ActivityPub Configuration
export const ACTIVITYPUB_CONFIG = {
  CONTEXTS: [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1',
    {
      'toot': 'http://joinmastodon.org/ns#',
      'discoverable': 'toot:discoverable',
      'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers',
      'sensitive': 'as:sensitive',
      'featured': {
        '@id': 'toot:featured',
        '@type': '@id'
      },
      'featuredTags': {
        '@id': 'toot:featuredTags',
        '@type': '@id'
      }
    }
  ],
  VALID_ACTIVITY_TYPES: [
    'Create', 'Update', 'Delete', 'Follow', 'Accept', 'Reject',
    'Add', 'Remove', 'Like', 'Announce', 'Undo', 'Block',
    'Flag', 'Ignore', 'Join', 'Leave', 'Offer', 'Invite',
    'Question', 'Listen', 'Read', 'Move', 'Travel', 'View'
  ],
};

// Weather Codes
export const SEVERE_WEATHER_CODES = {
  THUNDERSTORM_START: 95,
  THUNDERSTORM_END: 99,
  HEAVY_SNOW_START: 73,
  HEAVY_SNOW_END: 77,
  SNOW_SHOWERS_START: 85,
  SNOW_SHOWERS_END: 86,
};

// Default Values
export const DEFAULTS = {
  USER_AGENT: 'weather.gripe/1.0 (https://weather.gripe)',
  ENVIRONMENT: 'production',
  DOMAIN: 'weather.gripe',
};