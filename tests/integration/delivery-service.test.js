/**
 * Integration tests for ActivityPub Delivery Service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeliveryService } from '../../src/services/delivery-service.js';
import { generateKeyPair } from '../../src/utils/http-signature.js';
import { WeatherPost } from '../../src/models/weather-post.js';

describe('Delivery Service Integration', () => {
  let deliveryService;
  let mockEnv;
  let mockLogger;
  let testKeyPair;
  let originalFetch;

  beforeEach(async () => {
    // Save original fetch
    originalFetch = global.fetch;
    
    // Generate test keypair
    testKeyPair = await generateKeyPair();
    
    mockEnv = {
      DOMAIN: 'weather.gripe',
      USER_AGENT: 'weather.gripe/test',
      FOLLOWERS: { 
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      },
      KEYS: {
        get: vi.fn(async (key) => {
          if (key.includes('public_key')) return testKeyPair.publicKey;
          if (key.includes('private_key')) return testKeyPair.privateKey;
          return null;
        }),
        put: vi.fn()
      },
      DELIVERY_QUEUE: {
        put: vi.fn(),
        list: vi.fn(() => ({ keys: [] })),
        delete: vi.fn()
      }
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    deliveryService = new DeliveryService(mockEnv, mockLogger);
    
    // Mock cache
    global.caches = {
      default: {
        match: vi.fn(() => null),
        put: vi.fn()
      }
    };
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('Post Delivery', () => {
    it('should deliver post to all followers', async () => {
      // Mock followers
      mockEnv.FOLLOWERS.get.mockResolvedValue(JSON.stringify([
        { 
          id: 'https://mastodon.social/users/user1',
          inbox: 'https://mastodon.social/users/user1/inbox'
        },
        { 
          id: 'https://fosstodon.org/users/user2',
          inbox: 'https://fosstodon.org/users/user2/inbox'
        }
      ]));

      // Mock successful delivery
      const deliveredInboxes = [];
      global.fetch = vi.fn(async (url, options) => {
        deliveredInboxes.push(url);
        
        // Verify signature header is present
        expect(options.headers['Signature']).toBeDefined();
        expect(options.headers['Signature']).toContain('keyId=');
        expect(options.headers['Signature']).toContain('signature=');
        
        // Verify digest header for POST with body
        expect(options.headers['Digest']).toBeDefined();
        expect(options.headers['Digest']).toMatch(/^SHA-256=/);
        
        return new Response('', { status: 202 });
      });

      // Create a test post
      const post = WeatherPost.createForecastPost(
        'newyork',
        'weather.gripe',
        { content: 'Test weather forecast' },
        'morning'
      );

      const results = await deliveryService.deliverPostToFollowers('newyork', post);
      
      expect(results.success).toBe(2);
      expect(results.failed).toBe(0);
      expect(deliveredInboxes).toHaveLength(2);
      expect(deliveredInboxes).toContain('https://mastodon.social/users/user1/inbox');
      expect(deliveredInboxes).toContain('https://fosstodon.org/users/user2/inbox');
    });

    it('should handle delivery failures gracefully', async () => {
      mockEnv.FOLLOWERS.get.mockResolvedValue(JSON.stringify([
        { 
          id: 'https://mastodon.social/users/user1',
          inbox: 'https://mastodon.social/users/user1/inbox'
        },
        { 
          id: 'https://failed.server/users/user2',
          inbox: 'https://failed.server/users/user2/inbox'
        }
      ]));

      global.fetch = vi.fn(async (url) => {
        if (url.includes('failed.server')) {
          return new Response('Server error', { status: 500 });
        }
        return new Response('', { status: 202 });
      });

      const post = WeatherPost.createForecastPost(
        'chicago',
        'weather.gripe',
        { content: 'Test forecast' },
        'noon'
      );

      const results = await deliveryService.deliverPostToFollowers('chicago', post);
      
      expect(results.success).toBe(1);
      expect(results.failed).toBe(1);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0]).toContain('failed.server');
    });

    it('should batch large follower lists', async () => {
      // Create 25 mock followers
      const followers = Array.from({ length: 25 }, (_, i) => ({
        id: `https://server${i}.social/users/user${i}`,
        inbox: `https://server${i}.social/users/user${i}/inbox`
      }));
      
      mockEnv.FOLLOWERS.get.mockResolvedValue(JSON.stringify(followers));

      let requestCount = 0;
      global.fetch = vi.fn(async () => {
        requestCount++;
        return new Response('', { status: 202 });
      });

      const post = WeatherPost.createForecastPost(
        'seattle',
        'weather.gripe',
        { content: 'Test forecast' },
        'evening'
      );

      const results = await deliveryService.deliverPostToFollowers('seattle', post);
      
      expect(results.success).toBe(25);
      expect(requestCount).toBe(25);
      
      // Verify batching occurred (check logger for batch messages)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Processing batch'),
        expect.any(Object)
      );
    });
  });

  describe('Follow Handling', () => {
    it('should handle Follow activity and send Accept', async () => {
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        id: 'https://mastodon.social/activities/12345',
        actor: 'https://mastodon.social/users/testuser',
        object: 'https://weather.gripe/locations/boston'
      };

      // Mock actor fetch
      global.fetch = vi.fn(async (url, options) => {
        if (url === 'https://mastodon.social/users/testuser' && options.method === 'GET') {
          return new Response(JSON.stringify({
            id: 'https://mastodon.social/users/testuser',
            inbox: 'https://mastodon.social/users/testuser/inbox',
            preferredUsername: 'testuser'
          }), { 
            status: 200,
            headers: { 'Content-Type': 'application/activity+json' }
          });
        }
        
        if (url === 'https://mastodon.social/users/testuser/inbox' && options.method === 'POST') {
          const body = JSON.parse(options.body);
          expect(body.type).toBe('Accept');
          expect(body.object).toEqual(followActivity);
          expect(options.headers['Signature']).toBeDefined();
          return new Response('', { status: 202 });
        }
        
        return new Response('Not found', { status: 404 });
      });

      await deliveryService.handleFollow(followActivity, 'boston');
      
      // Verify follower was added
      expect(mockEnv.FOLLOWERS.put).toHaveBeenCalledWith(
        'followers:boston',
        expect.stringContaining('testuser')
      );
      
      // Verify Accept was sent
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mastodon.social/users/testuser/inbox',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle Undo Follow activity', async () => {
      // Mock existing follower
      mockEnv.FOLLOWERS.get.mockResolvedValue(JSON.stringify([
        {
          id: 'https://mastodon.social/users/testuser',
          inbox: 'https://mastodon.social/users/testuser/inbox'
        }
      ]));

      const undoActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        actor: 'https://mastodon.social/users/testuser',
        object: {
          type: 'Follow',
          actor: 'https://mastodon.social/users/testuser',
          object: 'https://weather.gripe/locations/miami'
        }
      };

      await deliveryService.handleUnfollow(undoActivity, 'miami');
      
      // Verify follower was removed
      expect(mockEnv.FOLLOWERS.put).toHaveBeenCalledWith(
        'followers:miami',
        '[]'
      );
    });

    it('should handle Delete activity for account deletion', async () => {
      // Mock existing follower
      mockEnv.FOLLOWERS.get.mockResolvedValue(JSON.stringify([
        {
          id: 'https://mastodon.social/users/deleteduser',
          inbox: 'https://mastodon.social/users/deleteduser/inbox'
        },
        {
          id: 'https://mastodon.social/users/otheruser',
          inbox: 'https://mastodon.social/users/otheruser/inbox'
        }
      ]));

      const deleteActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Delete',
        actor: 'https://mastodon.social/users/deleteduser',
        object: 'https://mastodon.social/users/deleteduser'
      };

      await deliveryService.handleDelete(deleteActivity, 'denver');
      
      // Verify deleted user was removed but other user remains
      expect(mockEnv.FOLLOWERS.put).toHaveBeenCalledWith(
        'followers:denver',
        expect.stringContaining('otheruser')
      );
      
      const savedFollowers = JSON.parse(mockEnv.FOLLOWERS.put.mock.calls[0][1]);
      expect(savedFollowers).toHaveLength(1);
      expect(savedFollowers[0].id).toBe('https://mastodon.social/users/otheruser');
    });
  });

  describe('HTTP Signatures', () => {
    it('should sign outgoing requests correctly', async () => {
      const testUrl = new URL('https://example.com/inbox');
      const testBody = JSON.stringify({ test: 'data' });
      const actorId = 'https://weather.gripe/locations/portland';
      
      const signedHeaders = await deliveryService.signRequest(
        testUrl,
        'POST',
        {
          'Content-Type': 'application/activity+json',
          'Date': 'Mon, 01 Jan 2024 12:00:00 GMT'
        },
        testBody,
        actorId
      );
      
      expect(signedHeaders['Signature']).toBeDefined();
      expect(signedHeaders['Signature']).toContain('keyId="https://weather.gripe/locations/portland#main-key"');
      expect(signedHeaders['Signature']).toContain('headers="(request-target) host date digest"');
      expect(signedHeaders['Signature']).toContain('signature="');
      expect(signedHeaders['Digest']).toBeDefined();
      expect(signedHeaders['Host']).toBe('example.com');
    });

    it('should generate and store keypairs when needed', async () => {
      // Clear mock to simulate no existing keys
      mockEnv.KEYS.get.mockResolvedValue(null);
      
      const actorId = 'https://weather.gripe/locations/phoenix';
      const privateKey = await deliveryService.getActorPrivateKey(actorId);
      
      expect(privateKey).toBeDefined();
      expect(privateKey).toContain('BEGIN PRIVATE KEY');
      
      // Verify keys were stored
      expect(mockEnv.KEYS.put).toHaveBeenCalledWith(
        'private_key:phoenix',
        expect.stringContaining('BEGIN PRIVATE KEY')
      );
      expect(mockEnv.KEYS.put).toHaveBeenCalledWith(
        'public_key:phoenix',
        expect.stringContaining('BEGIN PUBLIC KEY')
      );
    });
  });

  describe('Queue Processing', () => {
    it('should process delivery queue', async () => {
      // Mock queued deliveries
      mockEnv.DELIVERY_QUEUE.list.mockResolvedValue({
        keys: [
          { name: 'delivery:1704110400000:abc123' },
          { name: 'delivery:1704110400000:def456' }
        ]
      });
      
      mockEnv.DELIVERY_QUEUE.get.mockImplementation(async (key) => {
        if (key.includes('abc123')) {
          return JSON.stringify({
            inbox: 'https://mastodon.social/users/user1/inbox',
            activity: { type: 'Create', object: { type: 'Note' } }
          });
        }
        return JSON.stringify({
          inbox: 'https://fosstodon.org/users/user2/inbox',
          activity: { type: 'Create', object: { type: 'Note' } }
        });
      });
      
      global.fetch = vi.fn(async () => new Response('', { status: 202 }));
      
      await deliveryService.processDeliveryQueue();
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockEnv.DELIVERY_QUEUE.delete).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Processed delivery queue'),
        expect.objectContaining({ processed: 2 })
      );
    });

    it('should retry failed deliveries', async () => {
      mockEnv.DELIVERY_QUEUE.list.mockResolvedValue({
        keys: [{ name: 'delivery:1704110400000:retry123' }]
      });
      
      mockEnv.DELIVERY_QUEUE.get.mockResolvedValue(JSON.stringify({
        inbox: 'https://flaky.server/inbox',
        activity: { type: 'Create' },
        attempts: 1
      }));
      
      let attempts = 0;
      global.fetch = vi.fn(async () => {
        attempts++;
        if (attempts === 1) {
          return new Response('Server error', { status: 500 });
        }
        return new Response('', { status: 202 });
      });
      
      await deliveryService.processDeliveryQueue();
      
      // First attempt fails, should requeue
      expect(mockEnv.DELIVERY_QUEUE.put).toHaveBeenCalledWith(
        expect.stringContaining('delivery:'),
        expect.stringContaining('"attempts":2'),
        expect.objectContaining({ expirationTtl: 3600 })
      );
    });
  });
});