/**
 * ActivityPub Delivery Service
 * Handles pushing posts and activities to follower inboxes
 */

import { signRequest, generateKeyPair } from '../utils/http-signature.js';

export class DeliveryService {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
  }

  /**
   * Deliver a post to all followers of a location
   * @param {string} locationId - Location identifier
   * @param {Object} post - The Note object to deliver
   * @returns {Promise<Object>} Delivery results
   */
  async deliverPostToFollowers(locationId, post) {
    const startTime = Date.now();
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    try {
      // Get all followers for this location
      const followers = await this.getFollowerInboxes(locationId);
      
      if (followers.length === 0) {
        this.logger.info('No followers to deliver to', { locationId });
        return results;
      }

      this.logger.info('Starting delivery to followers', { 
        locationId, 
        followerCount: followers.length,
        postId: post.id
      });

      // Create the Create activity wrapping the post
      const activity = this.wrapInCreateActivity(post, locationId);

      // Batch delivery to avoid overwhelming the system
      const BATCH_SIZE = 10; // Adjust based on Cloudflare limits
      const batches = this.chunkArray(followers, BATCH_SIZE);

      for (const batch of batches) {
        const deliveryPromises = batch.map(inbox => 
          this.deliverToInbox(inbox, activity, locationId)
            .then(() => results.success++)
            .catch(error => {
              results.failed++;
              results.errors.push({ inbox, error: error.message });
            })
        );

        // Wait for batch to complete before starting next
        await Promise.allSettled(deliveryPromises);
      }

      const duration = Date.now() - startTime;
      this.logger.info('Delivery completed', { 
        locationId,
        success: results.success,
        failed: results.failed,
        duration
      });

    } catch (error) {
      this.logger.error('Delivery service error', { locationId, error });
      results.errors.push({ general: error.message });
    }

    return results;
  }

  /**
   * Deliver an activity to a specific inbox with retry logic
   * @param {string} inboxUrl - Target inbox URL
   * @param {Object} activity - Activity to deliver
   * @param {string} actorId - Actor sending the activity
   * @param {number} retryCount - Current retry attempt (default: 0)
   * @returns {Promise<void>}
   */
  async deliverToInbox(inboxUrl, activity, actorId, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
    
    try {
      // Prepare the request
      const body = JSON.stringify(activity);
      const url = new URL(inboxUrl);
      
      // Create base request headers
      const headers = {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json',
        'User-Agent': this.env.USER_AGENT || 'weather.gripe/1.0',
        'Date': new Date().toUTCString()
      };

      // Sign the request using HTTP Signatures
      const signedHeaders = await this.signRequest(
        url,
        'POST',
        headers,
        body,
        actorId
      );

      // Make the delivery request with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(inboxUrl, {
        method: 'POST',
        headers: signedHeaders,
        body: body,
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        // Check if it's a permanent failure (4xx) or temporary (5xx)
        if (response.status >= 400 && response.status < 500) {
          // Permanent failure, don't retry
          throw new Error(`Permanent delivery failure: ${response.status} ${response.statusText}`);
        } else if (response.status >= 500) {
          // Temporary failure, might retry
          throw new Error(`Temporary delivery failure: ${response.status} ${response.statusText}`);
        }
      }

      this.logger.debug('Successfully delivered to inbox', { 
        inboxUrl, 
        status: response.status,
        retryCount 
      });

    } catch (error) {
      const isTemporaryError = error.message.includes('Temporary') || 
                               error.name === 'AbortError' ||
                               error.message.includes('NetworkError') ||
                               error.message.includes('TimeoutError');
      
      if (isTemporaryError && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount];
        this.logger.warn('Temporary delivery failure, will retry', { 
          inboxUrl, 
          error: error.message,
          retryCount,
          retryDelay: delay
        });
        
        // Queue for retry after delay
        if (this.env.DELIVERY_QUEUE) {
          await this.queueDelivery({
            inbox: inboxUrl,
            activity: activity,
            actorId: actorId,
            retryCount: retryCount + 1,
            retryAfter: Date.now() + delay
          });
        } else if (retryCount < MAX_RETRIES - 1) {
          // If no queue available, retry inline after delay (but respect max retries)
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.deliverToInbox(inboxUrl, activity, actorId, retryCount + 1);
        } else {
          this.logger.warn('Cannot retry delivery - no queue and max retries reached', {
            inboxUrl,
            retryCount
          });
        }
      } else {
        this.logger.error('Failed to deliver to inbox after retries', { 
          inboxUrl, 
          error: error.message,
          retryCount
        });
        throw error;
      }
    }
  }

  /**
   * Get follower inbox URLs for a location
   * @param {string} locationId - Location identifier
   * @returns {Promise<Array<string>>} Array of inbox URLs
   */
  async getFollowerInboxes(locationId) {
    try {
      const { StateStore } = await import('./state-store.js');
      const stateStore = new StateStore(this.env, this.logger);
      const followers = await stateStore.getFollowers(locationId);
      
      // Extract unique inbox URLs (dedup shared inboxes)
      const inboxes = [...new Set(followers.map(f => f.inbox || f.sharedInbox))];
      
      return inboxes.filter(inbox => inbox); // Remove any null/undefined
    } catch (error) {
      this.logger.error('Failed to get follower inboxes', { locationId, error });
      return [];
    }
  }

  /**
   * Wrap a post in a Create activity
   * @param {Object} post - The Note object
   * @param {string} locationId - Location identifier
   * @returns {Object} Create activity
   */
  wrapInCreateActivity(post, locationId) {
    const actorUrl = `https://${this.env.DOMAIN}/locations/${locationId}`;
    
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Create',
      id: `${post.id}/activity`,
      actor: actorUrl,
      published: post.published,
      to: post.to,
      cc: post.cc,
      object: post
    };
  }

  /**
   * Sign HTTP request for ActivityPub delivery
   * @param {URL} url - Target URL
   * @param {string} method - HTTP method
   * @param {Object} headers - Request headers
   * @param {string} body - Request body
   * @param {string} actorId - Actor ID for key lookup
   * @returns {Promise<Object>} Signed headers
   */
  async signRequest(url, method, headers, body, actorId) {
    try {
      // Get the private key for this actor
      const privateKey = await this.getActorPrivateKey(actorId);
      const keyId = `${actorId}#main-key`;
      
      // Sign the request
      const signedHeaders = await signRequest({
        keyId,
        privateKey,
        method,
        url: url.toString(),
        headers,
        body
      });
      
      return signedHeaders;
    } catch (error) {
      this.logger.error('Failed to sign request', { error, actorId });
      // Return unsigned headers as fallback
      return headers;
    }
  }
  
  /**
   * Get or generate private key for an actor
   * @param {string} actorId - Actor URL
   * @returns {Promise<string>} Private key in PEM format
   */
  async getActorPrivateKey(actorId) {
    // Extract location ID from actor URL
    const locationId = actorId.split('/').pop();
    const keyName = `private_key:${locationId}`;
    
    // Check if we have a stored key
    let privateKey = await this.env.KEYS?.get(keyName);
    
    if (!privateKey) {
      // Generate a new key pair
      const { privateKey: newPrivateKey, publicKey } = await generateKeyPair();
      
      // Store the private key (you'll need a KEYS KV namespace)
      if (this.env.KEYS) {
        await this.env.KEYS.put(keyName, newPrivateKey);
        await this.env.KEYS.put(`public_key:${locationId}`, publicKey);
      }
      
      privateKey = newPrivateKey;
    }
    
    return privateKey;
  }
  
  /**
   * Get public key for an actor
   * @param {string} actorId - Actor URL
   * @returns {Promise<string>} Public key in PEM format
   */
  async getActorPublicKey(actorId) {
    const locationId = actorId.split('/').pop();
    const keyName = `public_key:${locationId}`;
    
    let publicKey = await this.env.KEYS?.get(keyName);
    
    if (!publicKey) {
      // Generate keys if they don't exist
      await this.getActorPrivateKey(actorId);
      publicKey = await this.env.KEYS?.get(keyName);
    }
    
    return publicKey;
  }

  /**
   * Handle Follow activity - add follower and send Accept
   * @param {Object} followActivity - Follow activity from inbox
   * @param {string} locationId - Location being followed
   * @returns {Promise<void>}
   */
  async handleFollow(followActivity, locationId) {
    try {
      const followerActor = followActivity.actor;
      
      // Fetch the follower's actor object to get their inbox
      const followerData = await this.fetchActorData(followerActor);
      
      if (!followerData) {
        throw new Error('Could not fetch follower actor data');
      }

      // Add to followers list
      const { StateStore } = await import('./state-store.js');
      const stateStore = new StateStore(this.env, this.logger);
      await stateStore.addFollower(locationId, {
        id: followerActor,
        inbox: followerData.inbox,
        sharedInbox: followerData.endpoints?.sharedInbox
      });

      // Send Accept activity back
      const acceptActivity = this.createAcceptActivity(followActivity, locationId);
      await this.deliverToInbox(
        followerData.inbox, 
        acceptActivity, 
        locationId
      );

      this.logger.info('Accepted follow request', { 
        locationId, 
        follower: followerActor 
      });

    } catch (error) {
      this.logger.error('Failed to handle follow', { 
        locationId, 
        error: error.message 
      });
    }
  }

  /**
   * Handle Undo Follow activity - remove follower
   * @param {Object} undoActivity - Undo activity from inbox
   * @param {string} locationId - Location being unfollowed
   * @returns {Promise<void>}
   */
  async handleUnfollow(undoActivity, locationId) {
    try {
      const followActivity = undoActivity.object;
      const followerActor = followActivity.actor;

      // Remove from followers list
      const { StateStore } = await import('./state-store.js');
      const stateStore = new StateStore(this.env, this.logger);
      await stateStore.removeFollower(locationId, followerActor);

      this.logger.info('Processed unfollow', { 
        locationId, 
        follower: followerActor 
      });

    } catch (error) {
      this.logger.error('Failed to handle unfollow', { 
        locationId, 
        error: error.message 
      });
    }
  }

  /**
   * Create Accept activity for a Follow
   * @param {Object} followActivity - The Follow activity to accept
   * @param {string} locationId - Location accepting the follow
   * @returns {Object} Accept activity
   */
  createAcceptActivity(followActivity, locationId) {
    const actorUrl = `https://${this.env.DOMAIN}/locations/${locationId}`;
    
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Accept',
      id: `${actorUrl}/accepts/${Date.now()}`,
      actor: actorUrl,
      object: followActivity,
      published: new Date().toISOString()
    };
  }

  /**
   * Fetch actor data from remote server
   * @param {string} actorUrl - Actor URL to fetch
   * @returns {Promise<Object|null>} Actor object or null
   */
  async fetchActorData(actorUrl) {
    try {
      const response = await fetch(actorUrl, {
        headers: {
          'Accept': 'application/activity+json',
          'User-Agent': this.env.USER_AGENT
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch actor: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to fetch actor data', { 
        actorUrl, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Chunk array into batches
   * @param {Array} array - Array to chunk
   * @param {number} size - Batch size
   * @returns {Array<Array>} Array of batches
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Queue delivery for async processing (using Cloudflare Queues or KV)
   * @param {Object} deliveryJob - Delivery job details
   * @returns {Promise<void>}
   */
  async queueDelivery(deliveryJob) {
    if (!this.env.DELIVERY_QUEUE) {
      this.logger.warn('DELIVERY_QUEUE KV namespace not configured, cannot queue delivery');
      return;
    }
    
    // For MVP, we'll use KV with a timestamp key
    // In production, consider Cloudflare Queues
    const key = `delivery:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const ttl = 3600; // 1 hour TTL for delivery jobs
    
    await this.env.DELIVERY_QUEUE.put(key, JSON.stringify(deliveryJob), {
      expirationTtl: ttl
    });
    
    this.logger.debug('Queued delivery job', { key });
  }

  /**
   * Process queued deliveries (called by cron)
   * @returns {Promise<void>}
   */
  async processDeliveryQueue() {
    if (!this.env.DELIVERY_QUEUE) {
      this.logger.warn('DELIVERY_QUEUE KV namespace not configured');
      return;
    }
    
    try {
      // List all pending deliveries
      const list = await this.env.DELIVERY_QUEUE.list({ prefix: 'delivery:' });
      const now = Date.now();
      
      for (const key of list.keys) {
        const job = await this.env.DELIVERY_QUEUE.get(key.name, 'json');
        
        if (job) {
          // Check if it's time to retry
          if (job.retryAfter && job.retryAfter > now) {
            continue; // Not time yet
          }
          
          try {
            // Process the delivery with retry count
            await this.deliverToInbox(
              job.inbox, 
              job.activity, 
              job.actorId,
              job.retryCount || 0
            );
            
            // Success - remove from queue
            await this.env.DELIVERY_QUEUE.delete(key.name);
          } catch (error) {
            // Delivery failed, it will be re-queued if retryable
            this.logger.error('Failed to process queued delivery', { 
              key: key.name,
              error: error.message 
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to process delivery queue', error);
    }
  }
}