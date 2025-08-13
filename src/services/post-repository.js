/**
 * Post Repository Service
 * Handles storage and retrieval of weather posts
 */

export class PostRepository {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
  }

  /**
   * Store a weather post
   * @param {Object} post - Post object
   * @returns {Promise<void>}
   */
  async save(post) {
    if (!this.env.POSTS) {
      this.logger.warn('POSTS KV namespace not available');
      return;
    }

    try {
      const postId = post.id.split('/').pop(); // Extract ID from URL
      const key = `post:${postId}`;
      
      await this.env.POSTS.put(key, JSON.stringify(post));
      this.logger.info('Stored post', { postId });
      
      // Also store by location and timestamp for outbox queries
      if (post.attributedTo) {
        const locationId = post.attributedTo.split('/').pop();
        const timestamp = new Date(post.published).getTime();
        const locationKey = `post:${locationId}:${timestamp}`;
        
        await this.env.POSTS.put(locationKey, JSON.stringify(post));
      }
    } catch (error) {
      this.logger.error('Failed to store post', { error });
    }
  }

  /**
   * Retrieve a post by ID
   * @param {string} postId - Post ID
   * @returns {Promise<Object|null>}
   */
  async findById(postId) {
    if (!this.env.POSTS) {
      this.logger.warn('POSTS KV namespace not available');
      return null;
    }

    try {
      const key = `post:${postId}`;
      const data = await this.env.POSTS.get(key, 'json');
      
      if (data) {
        this.logger.debug('Retrieved post', { postId });
        return data;
      }
      
      this.logger.debug('Post not found', { postId });
      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve post', { postId, error });
      return null;
    }
  }

  /**
   * Check if a post exists
   * @param {string} postId - Post ID
   * @returns {Promise<boolean>}
   */
  async exists(postId) {
    const post = await this.findById(postId);
    return post !== null;
  }

  /**
   * Get posts for a location
   * @param {string} locationId - Location identifier
   * @param {number} limit - Maximum number of posts
   * @param {string} cursor - Pagination cursor
   * @returns {Promise<Object>}
   */
  async getLocationPosts(locationId, limit = 20, cursor = null) {
    if (!this.env.POSTS) {
      this.logger.warn('POSTS KV namespace not available');
      return { posts: [], cursor: null };
    }

    try {
      const prefix = `post:${locationId}:`;
      const list = await this.env.POSTS.list({ 
        prefix, 
        limit,
        cursor
      });
      
      const posts = [];
      for (const key of list.keys) {
        const data = await this.env.POSTS.get(key.name);
        if (data) {
          posts.push(JSON.parse(data));
        }
      }
      
      // Sort by published date (newest first)
      posts.sort((a, b) => new Date(b.published) - new Date(a.published));
      
      return {
        posts,
        cursor: list.cursor
      };
    } catch (error) {
      this.logger.error('Failed to get location posts', { locationId, error });
      return { posts: [], cursor: null };
    }
  }

  /**
   * Get total post count for a location
   * @param {string} locationId - Location identifier
   * @returns {Promise<number>}
   */
  async getPostCount(locationId) {
    if (!this.env.POSTS) {
      return 0;
    }

    try {
      const prefix = `post:${locationId}:`;
      let count = 0;
      let cursor = undefined;
      
      do {
        const list = await this.env.POSTS.list({ 
          prefix, 
          limit: 1000,
          cursor
        });
        count += list.keys.length;
        cursor = list.cursor;
      } while (cursor);
      
      return count;
    } catch (error) {
      this.logger.error('Failed to get post count', { locationId, error });
      return 0;
    }
  }

  /**
   * Store an alert post with expiration
   * @param {string} locationId - Location identifier
   * @param {string} alertId - Alert identifier
   * @param {Object} post - Alert post object
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async saveAlert(locationId, alertId, post, ttlSeconds) {
    if (!this.env.ALERTS) {
      this.logger.warn('ALERTS KV namespace not available');
      return;
    }

    try {
      const key = `alerts:${locationId}:${alertId}`;
      const postId = post.id.split('/').pop();
      
      await this.env.ALERTS.put(key, JSON.stringify({
        postedAt: new Date().toISOString(),
        postId,
        post
      }), {
        expirationTtl: ttlSeconds
      });
      
      this.logger.info('Stored alert', { locationId, alertId, ttlSeconds });
    } catch (error) {
      this.logger.error('Failed to store alert', { locationId, alertId, error });
    }
  }

  /**
   * Check if an alert has been posted
   * @param {string} locationId - Location identifier
   * @param {string} alertId - Alert identifier
   * @returns {Promise<boolean>}
   */
  async alertExists(locationId, alertId) {
    if (!this.env.ALERTS) {
      return false;
    }

    try {
      const key = `alerts:${locationId}:${alertId}`;
      const data = await this.env.ALERTS.get(key);
      return data !== null;
    } catch (error) {
      this.logger.error('Failed to check alert', { locationId, alertId, error });
      return false;
    }
  }

  /**
   * Get active alerts for a location
   * @param {string} locationId - Location identifier
   * @returns {Promise<Array>}
   */
  async getActiveAlerts(locationId) {
    if (!this.env.ALERTS) {
      return [];
    }

    const alerts = [];
    
    try {
      const prefix = `alerts:${locationId}:`;
      const list = await this.env.ALERTS.list({ prefix });
      
      for (const key of list.keys) {
        const data = await this.env.ALERTS.get(key.name);
        if (data) {
          alerts.push(JSON.parse(data));
        }
      }
      
      return alerts;
    } catch (error) {
      this.logger.error('Failed to get active alerts', { locationId, error });
      return [];
    }
  }
}