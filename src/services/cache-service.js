/**
 * Cache Service
 * Hybrid caching using Cloudflare Cache API for HTTP responses
 * and KV storage for persistent state
 */

export class CacheService {
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
   * Cache weather data from NWS API
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
    
    // Cache for 6 hours (21600 seconds)
    await this.cacheResponse(key, response, 21600);
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
    
    // Cache for 30 days (2592000 seconds)
    await this.cacheResponse(key, response, 2592000);
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
    
    // Cache for 1 hour (3600 seconds)
    await this.cacheResponse(key, response, 3600);
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

  // KV Storage methods for persistent data

  /**
   * Get followers list from KV storage
   * @param {string} locationId - Location identifier
   * @returns {Promise<Array>}
   */
  async getFollowers(locationId) {
    try {
      const key = `followers:${locationId}`;
      const data = await this.env.FOLLOWERS.get(key, 'json');
      return data || [];
    } catch (error) {
      this.logger.error('Failed to get followers', { locationId, error });
      return [];
    }
  }

  /**
   * Add follower to KV storage
   * @param {string} locationId - Location identifier
   * @param {Object} follower - Follower actor data
   * @returns {Promise<void>}
   */
  async addFollower(locationId, follower) {
    try {
      const key = `followers:${locationId}`;
      const followers = await this.getFollowers(locationId);
      
      // Check if already following
      if (!followers.find(f => f.id === follower.id)) {
        followers.push({
          id: follower.id,
          inbox: follower.inbox,
          addedAt: new Date().toISOString()
        });
        
        await this.env.FOLLOWERS.put(key, JSON.stringify(followers));
        this.logger.info('Added follower', { locationId, followerId: follower.id });
      }
    } catch (error) {
      this.logger.error('Failed to add follower', { locationId, error });
    }
  }

  /**
   * Remove follower from KV storage
   * @param {string} locationId - Location identifier
   * @param {string} followerId - Follower ID to remove
   * @returns {Promise<void>}
   */
  async removeFollower(locationId, followerId) {
    try {
      const key = `followers:${locationId}`;
      const followers = await this.getFollowers(locationId);
      
      const filtered = followers.filter(f => f.id !== followerId);
      
      if (filtered.length !== followers.length) {
        await this.env.FOLLOWERS.put(key, JSON.stringify(filtered));
        this.logger.info('Removed follower', { locationId, followerId });
      }
    } catch (error) {
      this.logger.error('Failed to remove follower', { locationId, error });
    }
  }

  /**
   * Store posted content for history/audit
   * @param {string} postId - Post ID
   * @param {Object} post - Post content
   * @returns {Promise<void>}
   */
  async storePost(postId, post) {
    try {
      const key = `post:${postId}`;
      await this.env.POSTS.put(key, JSON.stringify(post), {
        metadata: {
          location: post.location,
          type: post.type,
          createdAt: post.published
        }
      });
      this.logger.info('Stored post', { postId, location: post.location });
    } catch (error) {
      this.logger.error('Failed to store post', { postId, error });
    }
  }

  /**
   * Get posted content by ID
   * @param {string} postId - Post ID
   * @returns {Promise<Object|null>}
   */
  async getPost(postId) {
    try {
      const key = `post:${postId}`;
      const data = await this.env.POSTS.get(key, 'json');
      return data;
    } catch (error) {
      this.logger.error('Failed to get post', { postId, error });
      return null;
    }
  }

  /**
   * Track alert state in KV
   * @param {string} locationId - Location identifier
   * @param {string} alertId - Alert ID
   * @param {Object} alertData - Alert information
   * @returns {Promise<void>}
   */
  async trackAlert(locationId, alertId, alertData) {
    try {
      const key = `alerts:${locationId}:${alertId}`;
      await this.env.ALERTS.put(key, JSON.stringify({
        ...alertData,
        trackedAt: new Date().toISOString()
      }), {
        // Expire after alert expires
        expirationTtl: alertData.expiresAt ? 
          Math.floor((new Date(alertData.expiresAt) - new Date()) / 1000) : 
          86400 // 24 hours default
      });
      this.logger.info('Tracked alert', { locationId, alertId });
    } catch (error) {
      this.logger.error('Failed to track alert', { locationId, alertId, error });
    }
  }
}