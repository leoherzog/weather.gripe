/**
 * State Store Service
 * Handles persistent state storage using Cloudflare KV
 */

export class StateStore {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
  }

  /**
   * Get followers list from KV storage
   * @param {string} locationId - Location identifier
   * @returns {Promise<Array>}
   */
  async getFollowers(locationId) {
    if (!this.env.FOLLOWERS) {
      this.logger.warn('FOLLOWERS KV namespace not available');
      return [];
    }

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
    if (!this.env.FOLLOWERS) {
      this.logger.warn('FOLLOWERS KV namespace not available');
      return;
    }

    try {
      const key = `followers:${locationId}`;
      const followers = await this.getFollowers(locationId);
      
      // Check if already following
      if (!followers.find(f => f.id === follower.id)) {
        followers.push({
          id: follower.id,
          inbox: follower.inbox,
          sharedInbox: follower.sharedInbox,
          preferredUsername: follower.preferredUsername,
          followedAt: new Date().toISOString()
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
    if (!this.env.FOLLOWERS) {
      this.logger.warn('FOLLOWERS KV namespace not available');
      return;
    }

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
   * Get all locations with followers
   * @returns {Promise<Array>}
   */
  async getActiveLocations() {
    if (!this.env.FOLLOWERS) {
      this.logger.warn('FOLLOWERS KV namespace not available');
      return [];
    }

    const locations = [];
    
    try {
      // List all keys in the FOLLOWERS namespace
      let cursor = undefined;
      do {
        const list = await this.env.FOLLOWERS.list({ 
          prefix: 'followers:', 
          cursor,
          limit: 1000 
        });
        
        for (const key of list.keys) {
          // Extract location ID from key (format: followers:{locationId})
          const locationId = key.name.replace('followers:', '');
          
          // Get follower count
          const followersData = await this.env.FOLLOWERS.get(key.name);
          if (followersData) {
            const followers = JSON.parse(followersData);
            if (followers.length > 0) {
              locations.push({
                id: locationId,
                name: locationId,
                followerCount: followers.length
              });
            }
          }
        }
        
        cursor = list.cursor;
      } while (cursor);
      
      this.logger.info('Active locations found', { count: locations.length });
      return locations;
    } catch (error) {
      this.logger.error('Failed to get active locations', { error });
      return [];
    }
  }

  /**
   * Store RSA key pair
   * @param {string} locationId - Location identifier
   * @param {string} privateKey - Private key PEM
   * @param {string} publicKey - Public key PEM
   * @returns {Promise<void>}
   */
  async storeKeyPair(locationId, privateKey, publicKey) {
    if (!this.env.KEYS) {
      this.logger.warn('KEYS KV namespace not available');
      return;
    }

    try {
      await this.env.KEYS.put(`private_key:${locationId}`, privateKey);
      await this.env.KEYS.put(`public_key:${locationId}`, publicKey);
      this.logger.info('Stored key pair', { locationId });
    } catch (error) {
      this.logger.error('Failed to store key pair', { locationId, error });
    }
  }

  /**
   * Get RSA private key
   * @param {string} locationId - Location identifier
   * @returns {Promise<string|null>}
   */
  async getPrivateKey(locationId) {
    if (!this.env.KEYS) {
      this.logger.warn('KEYS KV namespace not available');
      return null;
    }

    try {
      return await this.env.KEYS.get(`private_key:${locationId}`);
    } catch (error) {
      this.logger.error('Failed to get private key', { locationId, error });
      return null;
    }
  }

  /**
   * Get RSA public key
   * @param {string} locationId - Location identifier
   * @returns {Promise<string|null>}
   */
  async getPublicKey(locationId) {
    if (!this.env.KEYS) {
      this.logger.warn('KEYS KV namespace not available');
      return null;
    }

    try {
      return await this.env.KEYS.get(`public_key:${locationId}`);
    } catch (error) {
      this.logger.error('Failed to get public key', { locationId, error });
      return null;
    }
  }

  /**
   * Store delivery queue item
   * @param {Object} delivery - Delivery data
   * @param {number} ttlSeconds - TTL in seconds
   * @returns {Promise<void>}
   */
  async queueDelivery(delivery, ttlSeconds = 3600) {
    if (!this.env.DELIVERY_QUEUE) {
      this.logger.warn('DELIVERY_QUEUE KV namespace not available');
      return;
    }

    try {
      const key = `delivery:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await this.env.DELIVERY_QUEUE.put(key, JSON.stringify(delivery), {
        expirationTtl: ttlSeconds
      });
      this.logger.debug('Queued delivery', { key });
    } catch (error) {
      this.logger.error('Failed to queue delivery', { error });
    }
  }

  /**
   * Get pending deliveries
   * @returns {Promise<Array>}
   */
  async getPendingDeliveries() {
    if (!this.env.DELIVERY_QUEUE) {
      this.logger.warn('DELIVERY_QUEUE KV namespace not available');
      return [];
    }

    const deliveries = [];
    
    try {
      const list = await this.env.DELIVERY_QUEUE.list({ prefix: 'delivery:' });
      
      for (const key of list.keys) {
        const data = await this.env.DELIVERY_QUEUE.get(key.name);
        if (data) {
          deliveries.push({
            key: key.name,
            ...JSON.parse(data)
          });
        }
      }
      
      return deliveries;
    } catch (error) {
      this.logger.error('Failed to get pending deliveries', { error });
      return [];
    }
  }

  /**
   * Remove delivery from queue
   * @param {string} key - Delivery key
   * @returns {Promise<void>}
   */
  async removeDelivery(key) {
    if (!this.env.DELIVERY_QUEUE) {
      return;
    }

    try {
      await this.env.DELIVERY_QUEUE.delete(key);
      this.logger.debug('Removed delivery', { key });
    } catch (error) {
      this.logger.error('Failed to remove delivery', { key, error });
    }
  }
}