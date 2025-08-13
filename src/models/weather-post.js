/**
 * Weather Post Model
 * Creates deterministic ActivityPub Note objects for weather posts
 */

import { generatePostId, generateCreateActivityId, getCanonicalUrl } from '../utils/id-generator.js';

export class WeatherPost {
  /**
   * Create a forecast post
   * @param {Object} params
   * @param {string} params.locationId - Location identifier
   * @param {string} params.locationName - Display name for location
   * @param {Date} params.postTime - When this post is being made
   * @param {string} params.postType - Type: "forecast-morning", "forecast-noon", "forecast-evening"
   * @param {string} params.content - Formatted weather content
   * @param {Array} params.hashtags - Hashtags for the post
   * @param {string} params.domain - Domain name
   * @returns {Object} ActivityPub Note object
   */
  static createForecastPost({ 
    locationId, 
    locationName, 
    postTime, 
    postType, 
    content, 
    hashtags = ['weather'],
    domain 
  }) {
    // Generate deterministic ID
    const postId = generatePostId(locationId, postTime, postType);
    const postUrl = getCanonicalUrl(domain, 'post', postId);
    const actorUrl = getCanonicalUrl(domain, 'actor', locationId);
    
    // Round post time to the nearest hour for consistency
    const publishedDate = new Date(postTime);
    publishedDate.setMinutes(0, 0, 0);
    
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Note',
      id: postUrl,
      url: postUrl,
      attributedTo: actorUrl,
      content,
      published: publishedDate.toISOString(),
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`${actorUrl}/followers`],
      tag: hashtags.map(tag => ({
        type: 'Hashtag',
        href: `https://${domain}/tags/${tag}`,
        name: `#${tag}`
      })),
      // Add metadata for debugging and cache validation
      _metadata: {
        postId,
        postType,
        locationId,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create an alert post
   * @param {Object} params
   * @param {string} params.locationId - Location identifier
   * @param {string} params.locationName - Display name for location
   * @param {Object} params.alert - NWS alert object
   * @param {string} params.content - Formatted alert content
   * @param {string} params.domain - Domain name
   * @returns {Object} ActivityPub Note object
   */
  static createAlertPost({ 
    locationId, 
    locationName, 
    alert, 
    content, 
    domain 
  }) {
    // Use the NWS alert ID for deterministic post ID
    const postId = generatePostId(locationId, new Date(alert.effective), 'alert', alert.id);
    const postUrl = getCanonicalUrl(domain, 'post', postId);
    const actorUrl = getCanonicalUrl(domain, 'actor', locationId);
    
    // Use the alert's effective time as published time
    const publishedDate = new Date(alert.effective);
    
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Note',
      id: postUrl,
      url: postUrl,
      attributedTo: actorUrl,
      content,
      published: publishedDate.toISOString(),
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`${actorUrl}/followers`],
      tag: [
        {
          type: 'Hashtag',
          href: `https://${domain}/tags/weather`,
          name: '#weather'
        },
        {
          type: 'Hashtag',
          href: `https://${domain}/tags/alert`,
          name: '#alert'
        }
      ],
      // Mark as sensitive for severe alerts
      sensitive: alert.severity === 'Extreme' || alert.severity === 'Severe',
      // Add attachment for alert details
      attachment: {
        type: 'Page',
        name: alert.event,
        content: alert.description,
        url: alert.web || `https://api.weather.gov/alerts/${alert.id}`
      },
      _metadata: {
        postId,
        postType: 'alert',
        locationId,
        alertId: alert.id,
        severity: alert.severity,
        expires: alert.expires,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create a Create activity for a post
   * @param {Object} post - The Note object being created
   * @param {string} domain - Domain name
   * @returns {Object} Create activity
   */
  static createActivity(post, domain) {
    const activityId = generateCreateActivityId(post._metadata.postId);
    const activityUrl = getCanonicalUrl(domain, 'activity', activityId);
    
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Create',
      id: activityUrl,
      actor: post.attributedTo,
      object: post,
      published: post.published,
      to: post.to,
      cc: post.cc
    };
  }

  /**
   * Check if a post already exists (for deduplication)
   * @param {string} postId - Post ID to check
   * @param {Object} env - Environment with KV bindings
   * @returns {Promise<boolean>} Whether the post exists
   */
  static async exists(postId, env) {
    if (!env.POSTS) {
      console.error('POSTS KV namespace not configured');
      return false;
    }
    
    try {
      const key = `post:${postId}`;
      const exists = await env.POSTS.get(key);
      return exists !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Store a post in KV for persistence
   * @param {Object} post - Post to store
   * @param {Object} env - Environment with KV bindings
   * @returns {Promise<void>}
   */
  static async store(post, env) {
    if (!env.POSTS) {
      throw new Error('POSTS KV namespace not configured');
    }
    
    const postId = post._metadata.postId;
    const key = `post:${postId}`;
    
    await env.POSTS.put(key, JSON.stringify(post), {
      metadata: {
        locationId: post._metadata.locationId,
        postType: post._metadata.postType,
        published: post.published
      }
    });
  }

  /**
   * Atomically store a post only if it doesn't exist
   * @param {Object} post - Post to store
   * @param {Object} env - Environment with KV bindings
   * @returns {Promise<boolean>} True if stored, false if already exists
   */
  static async storeIfNotExists(post, env) {
    if (!env.POSTS) {
      throw new Error('POSTS KV namespace not configured');
    }
    
    const postId = post._metadata.postId;
    const key = `post:${postId}`;
    
    // Check and store atomically by using metadata
    const existing = await env.POSTS.get(key);
    if (existing) {
      return false; // Already exists
    }
    
    await env.POSTS.put(key, JSON.stringify(post), {
      metadata: {
        locationId: post._metadata.locationId,
        postType: post._metadata.postType,
        published: post.published
      }
    });
    
    return true; // Successfully stored
  }

  /**
   * Retrieve a post by ID
   * @param {string} postId - Post ID
   * @param {Object} env - Environment with KV bindings
   * @returns {Promise<Object|null>} Post object or null
   */
  static async retrieve(postId, env) {
    if (!env.POSTS) {
      console.error('POSTS KV namespace not configured');
      return null;
    }
    
    try {
      const key = `post:${postId}`;
      const data = await env.POSTS.get(key, 'json');
      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get recent posts for a location
   * @param {string} locationId - Location identifier
   * @param {Object} env - Environment with KV bindings
   * @param {number} limit - Maximum number of posts
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Array of posts
   */
  static async getRecentPosts(locationId, env, limit = 20, offset = 0) {
    if (!env.POSTS) {
      console.error('POSTS KV namespace not configured');
      return [];
    }
    
    try {
      // List keys with prefix
      const prefix = `post:${locationId}-`;
      const list = await env.POSTS.list({ prefix, limit: limit + offset });
      
      // Skip offset number of items and take limit
      const keysToFetch = list.keys.slice(offset, offset + limit);
      
      // Fetch the actual posts
      const posts = await Promise.all(
        keysToFetch.map(async (key) => {
          const data = await env.POSTS.get(key.name, 'json');
          return data;
        })
      );
      
      // Sort by published date descending
      posts.sort((a, b) => new Date(b.published) - new Date(a.published));
      
      return posts;
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Get post count for a location
   * @param {string} locationId - Location identifier
   * @param {Object} env - Environment with KV bindings
   * @returns {Promise<number>} Number of posts
   */
  static async getPostCount(locationId, env) {
    if (!env.POSTS) {
      console.error('POSTS KV namespace not configured');
      return 0;
    }
    
    try {
      const prefix = `post:${locationId}-`;
      const list = await env.POSTS.list({ prefix });
      return list.keys.length;
    } catch (error) {
      return 0;
    }
  }
}