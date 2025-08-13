/**
 * HTTP Cache Service
 * Handles caching of HTTP responses using Cloudflare Cache API
 */

import { CACHE_TTL } from '../config/constants.js';

export class HttpCache {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
    // Use default cache instance
    this.cache = caches.default;
  }

  /**
   * Cache an HTTP response using Cache API
   * @param {string} key - Cache key (usually a URL)
   * @param {Response} response - HTTP response to cache
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async cacheResponse(key, response, ttlSeconds) {
    try {
      // Create a request object as cache key
      const cacheKey = new Request(key);
      
      // Clone the response and add cache control headers
      const responseToCache = new Response(response.body, response);
      responseToCache.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      responseToCache.headers.set('X-Cache-Time', new Date().toISOString());
      
      await this.cache.put(cacheKey, responseToCache);
      
      this.logger.debug('Cached response', { key, ttlSeconds });
    } catch (error) {
      this.logger.error('Failed to cache response', { key, error });
    }
  }

  /**
   * Get cached HTTP response from Cache API
   * @param {string} key - Cache key
   * @returns {Promise<Response|null>}
   */
  async getCachedResponse(key) {
    try {
      const cacheKey = new Request(key);
      const cached = await this.cache.match(cacheKey);
      
      if (cached) {
        const cacheTime = cached.headers.get('X-Cache-Time');
        this.logger.debug('Cache hit', { key, cacheTime });
        return cached;
      }
      
      this.logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached response', { key, error });
      return null;
    }
  }

  /**
   * Cache weather data from weather API
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {string} endpoint - API endpoint type
   * @param {Object} data - Weather data to cache
   * @returns {Promise<void>}
   */
  async cacheWeatherData(lat, lon, endpoint, data) {
    const key = `https://${this.env.DOMAIN}/cache/weather/${lat},${lon}/${endpoint}`;
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Cache for configured TTL
    await this.cacheResponse(key, response, CACHE_TTL.WEATHER_DATA);
  }

  /**
   * Get cached weather data
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {string} endpoint - API endpoint type
   * @returns {Promise<Object|null>}
   */
  async getCachedWeatherData(lat, lon, endpoint) {
    const key = `https://${this.env.DOMAIN}/cache/weather/${lat},${lon}/${endpoint}`;
    const cached = await this.getCachedResponse(key);
    
    if (cached) {
      return await cached.json();
    }
    return null;
  }

  /**
   * Cache geocoding result from Nominatim
   * @param {string} locationName - Location search term
   * @param {Object} data - Geocoding result
   * @returns {Promise<void>}
   */
  async cacheGeocodingResult(locationName, data) {
    const key = `https://${this.env.DOMAIN}/cache/geocode/${encodeURIComponent(locationName.toLowerCase())}`;
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Cache for configured TTL
    await this.cacheResponse(key, response, CACHE_TTL.GEOCODING);
  }

  /**
   * Get cached geocoding result
   * @param {string} locationName - Location search term
   * @returns {Promise<Object|null>}
   */
  async getCachedGeocodingResult(locationName) {
    const key = `https://${this.env.DOMAIN}/cache/geocode/${encodeURIComponent(locationName.toLowerCase())}`;
    const cached = await this.getCachedResponse(key);
    
    if (cached) {
      return await cached.json();
    }
    return null;
  }

  /**
   * Cache generated ActivityPub object
   * @param {string} type - Object type (actor, collection, etc.)
   * @param {string} id - Object ID
   * @param {Object} data - ActivityPub object
   * @returns {Promise<void>}
   */
  async cacheActivityPubObject(type, id, data) {
    const key = `https://${this.env.DOMAIN}/cache/activitypub/${type}/${id}`;
    const response = new Response(JSON.stringify(data), {
      headers: { 
        'Content-Type': 'application/activity+json'
      }
    });
    
    // Cache for configured TTL
    await this.cacheResponse(key, response, CACHE_TTL.ACTIVITYPUB);
  }

  /**
   * Get cached ActivityPub object
   * @param {string} type - Object type
   * @param {string} id - Object ID
   * @returns {Promise<Object|null>}
   */
  async getCachedActivityPubObject(type, id) {
    const key = `https://${this.env.DOMAIN}/cache/activitypub/${type}/${id}`;
    const cached = await this.getCachedResponse(key);
    
    if (cached) {
      return await cached.json();
    }
    return null;
  }

  /**
   * Invalidate cache by pattern using cache tags
   * @param {string} pattern - Cache key pattern
   * @returns {Promise<void>}
   */
  async invalidateCache(pattern) {
    // Note: Cache API doesn't support wildcard deletion
    // This would need to be implemented with cache tags
    // or by maintaining a list of keys in KV
    this.logger.info('Cache invalidation requested', { pattern });
  }
}