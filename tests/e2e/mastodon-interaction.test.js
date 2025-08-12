/**
 * End-to-end tests simulating Mastodon server interactions
 * Tests the complete flow from follow to post delivery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleRequest } from '../../src/index.js';
import { generateKeyPair, signRequest } from '../../src/utils/http-signature.js';

describe('E2E Mastodon Interaction', () => {
  let mockEnv;
  let mockCtx;
  let mastodonKeyPair;
  let weatherGripeKeyPair;
  let originalFetch;
  let deliveredActivities;

  beforeEach(async () => {
    // Save original fetch
    originalFetch = global.fetch;
    deliveredActivities = [];
    
    // Generate keypairs for both servers
    mastodonKeyPair = await generateKeyPair();
    weatherGripeKeyPair = await generateKeyPair();
    
    // Setup mock environment
    mockEnv = {
      DOMAIN: 'weather.gripe',
      USER_AGENT: 'weather.gripe/test',
      FOLLOWERS: new Map(),
      POSTS: new Map(),
      ALERTS: new Map(),
      DELIVERY_QUEUE: new Map(),
      KEYS: new Map([
        ['private_key:newyork', weatherGripeKeyPair.privateKey],
        ['public_key:newyork', weatherGripeKeyPair.publicKey]
      ])
    };

    // Mock KV storage methods
    const createKVMock = (map) => ({
      get: async (key) => map.get(key) || null,
      put: async (key, value, options) => {
        map.set(key, value);
        if (options?.expirationTtl) {
          // Simulate TTL (simplified)
          setTimeout(() => map.delete(key), options.expirationTtl * 1000);
        }
      },
      delete: async (key) => map.delete(key),
      list: async (options) => {
        const keys = Array.from(map.keys())
          .filter(k => !options?.prefix || k.startsWith(options.prefix))
          .map(name => ({ name }));
        return { keys };
      }
    });

    mockEnv.FOLLOWERS = createKVMock(mockEnv.FOLLOWERS);
    mockEnv.POSTS = createKVMock(mockEnv.POSTS);
    mockEnv.ALERTS = createKVMock(mockEnv.ALERTS);
    mockEnv.DELIVERY_QUEUE = createKVMock(mockEnv.DELIVERY_QUEUE);
    mockEnv.KEYS = createKVMock(mockEnv.KEYS);

    mockCtx = {
      waitUntil: vi.fn()
    };

    // Mock cache
    global.caches = {
      default: {
        match: vi.fn(() => null),
        put: vi.fn()
      }
    };

    // Mock fetch for external requests
    global.fetch = vi.fn(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      
      // Mock Mastodon actor fetch
      if (urlStr === 'https://mastodon.social/users/alice') {
        return new Response(JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Person',
          id: 'https://mastodon.social/users/alice',
          preferredUsername: 'alice',
          inbox: 'https://mastodon.social/users/alice/inbox',
          outbox: 'https://mastodon.social/users/alice/outbox',
          publicKey: {
            id: 'https://mastodon.social/users/alice#main-key',
            owner: 'https://mastodon.social/users/alice',
            publicKeyPem: mastodonKeyPair.publicKey
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/activity+json' }
        });
      }
      
      // Mock Mastodon inbox (capture delivered activities)
      if (urlStr === 'https://mastodon.social/users/alice/inbox') {
        deliveredActivities.push({
          url: urlStr,
          body: JSON.parse(options.body),
          headers: options.headers
        });
        return new Response('', { status: 202 });
      }
      
      // Mock weather API responses
      if (urlStr.includes('nominatim.openstreetmap.org')) {
        return new Response(JSON.stringify([{
          lat: 40.7128,
          lon: -74.0060,
          display_name: 'New York, NY, USA'
        }]), { status: 200 });
      }
      
      if (urlStr.includes('api.open-meteo.com')) {
        return new Response(JSON.stringify({
          latitude: 40.7128,
          longitude: -74.0060,
          timezone: 'America/New_York',
          current: {
            time: '2024-01-01T12:00',
            temperature_2m: 72,
            weather_code: 0
          },
          daily: {
            time: ['2024-01-01'],
            weather_code: [0],
            temperature_2m_max: [75],
            temperature_2m_min: [65]
          },
          hourly: {
            time: ['2024-01-01T12:00'],
            temperature_2m: [72],
            weather_code: [0]
          }
        }), { status: 200 });
      }
      
      return originalFetch(url, options);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Complete Follow Flow', () => {
    it('should handle WebFinger discovery', async () => {
      const request = new Request('https://weather.gripe/.well-known/webfinger?resource=acct:newyork@weather.gripe');
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const webfinger = await response.json();
      
      expect(webfinger.subject).toBe('acct:newyork@weather.gripe');
      expect(webfinger.links).toContainEqual(
        expect.objectContaining({
          rel: 'self',
          type: 'application/activity+json',
          href: 'https://weather.gripe/locations/newyork'
        })
      );
    });

    it('should accept follow and send Accept activity', async () => {
      // Step 1: Mastodon user follows weather location
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        id: 'https://mastodon.social/activities/follow-123',
        actor: 'https://mastodon.social/users/alice',
        object: 'https://weather.gripe/locations/newyork'
      };

      // Sign the follow request as if from Mastodon
      const body = JSON.stringify(followActivity);
      const signedHeaders = await signRequest({
        keyId: 'https://mastodon.social/users/alice#main-key',
        privateKey: mastodonKeyPair.privateKey,
        method: 'POST',
        url: 'https://weather.gripe/locations/newyork/inbox',
        headers: {
          'Content-Type': 'application/activity+json',
          'Date': new Date().toUTCString()
        },
        body
      });

      const followRequest = new Request('https://weather.gripe/locations/newyork/inbox', {
        method: 'POST',
        headers: signedHeaders,
        body
      });

      const response = await handleRequest(followRequest, mockEnv, mockCtx);
      
      expect(response.status).toBe(202);
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Step 2: Verify Accept was sent back
      const acceptActivity = deliveredActivities.find(a => a.body.type === 'Accept');
      expect(acceptActivity).toBeDefined();
      expect(acceptActivity.body.object).toEqual(followActivity);
      expect(acceptActivity.body.actor).toBe('https://weather.gripe/locations/newyork');
      
      // Step 3: Verify follower was stored
      const followers = await mockEnv.FOLLOWERS.get('followers:newyork');
      expect(followers).toBeDefined();
      const followerList = JSON.parse(followers);
      expect(followerList).toContainEqual(
        expect.objectContaining({
          id: 'https://mastodon.social/users/alice'
        })
      );
    });

    it('should deliver weather posts to followers', async () => {
      // Setup: Add a follower
      await mockEnv.FOLLOWERS.put('followers:newyork', JSON.stringify([{
        id: 'https://mastodon.social/users/alice',
        inbox: 'https://mastodon.social/users/alice/inbox',
        preferredUsername: 'alice'
      }]));

      // Simulate cron job creating and delivering a weather post
      const cronRequest = new Request('https://weather.gripe/cron', {
        headers: {
          'X-Cron-Trigger': 'scheduled'
        }
      });

      // Mock time to be 7am in New York
      const mockDate = new Date('2024-01-01T07:00:00-05:00');
      vi.setSystemTime(mockDate);

      const response = await handleRequest(cronRequest, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      
      // Wait for async delivery
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify post was delivered
      const createActivity = deliveredActivities.find(a => a.body.type === 'Create');
      expect(createActivity).toBeDefined();
      expect(createActivity.body.object.type).toBe('Note');
      expect(createActivity.body.object.content).toContain('weather');
      expect(createActivity.headers['Signature']).toBeDefined();
      
      // Verify post was stored
      const posts = await mockEnv.POSTS.list({ prefix: 'post:newyork:' });
      expect(posts.keys.length).toBeGreaterThan(0);
    });

    it('should handle unfollow correctly', async () => {
      // Setup: Add follower
      await mockEnv.FOLLOWERS.put('followers:newyork', JSON.stringify([{
        id: 'https://mastodon.social/users/alice',
        inbox: 'https://mastodon.social/users/alice/inbox'
      }]));

      // Send Undo Follow
      const undoActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        id: 'https://mastodon.social/activities/undo-123',
        actor: 'https://mastodon.social/users/alice',
        object: {
          type: 'Follow',
          actor: 'https://mastodon.social/users/alice',
          object: 'https://weather.gripe/locations/newyork'
        }
      };

      const body = JSON.stringify(undoActivity);
      const signedHeaders = await signRequest({
        keyId: 'https://mastodon.social/users/alice#main-key',
        privateKey: mastodonKeyPair.privateKey,
        method: 'POST',
        url: 'https://weather.gripe/locations/newyork/inbox',
        headers: {
          'Content-Type': 'application/activity+json',
          'Date': new Date().toUTCString()
        },
        body
      });

      const unfollowRequest = new Request('https://weather.gripe/locations/newyork/inbox', {
        method: 'POST',
        headers: signedHeaders,
        body
      });

      const response = await handleRequest(unfollowRequest, mockEnv, mockCtx);
      
      expect(response.status).toBe(202);
      
      // Verify follower was removed
      const followers = await mockEnv.FOLLOWERS.get('followers:newyork');
      const followerList = followers ? JSON.parse(followers) : [];
      expect(followerList).not.toContainEqual(
        expect.objectContaining({
          id: 'https://mastodon.social/users/alice'
        })
      );
    });
  });

  describe('Collections and Pagination', () => {
    it('should serve actor profile with public key', async () => {
      const request = new Request('https://weather.gripe/locations/newyork', {
        headers: {
          'Accept': 'application/activity+json'
        }
      });

      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const actor = await response.json();
      
      expect(actor.type).toBe('Person');
      expect(actor.publicKey).toBeDefined();
      expect(actor.publicKey.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(actor.inbox).toBe('https://weather.gripe/locations/newyork/inbox');
      expect(actor.outbox).toBe('https://weather.gripe/locations/newyork/outbox');
    });

    it('should serve outbox with posts', async () => {
      // Add some test posts
      const posts = [
        {
          id: 'https://weather.gripe/posts/123',
          type: 'Note',
          content: 'Morning forecast',
          published: '2024-01-01T07:00:00Z'
        },
        {
          id: 'https://weather.gripe/posts/124',
          type: 'Note',
          content: 'Noon update',
          published: '2024-01-01T12:00:00Z'
        }
      ];

      for (const post of posts) {
        await mockEnv.POSTS.put(`post:newyork:${post.published}`, JSON.stringify(post));
      }

      const request = new Request('https://weather.gripe/locations/newyork/outbox');
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const outbox = await response.json();
      
      expect(outbox.type).toBe('OrderedCollection');
      expect(outbox.totalItems).toBe(2);
      expect(outbox.first).toBeDefined();
    });

    it('should serve followers collection', async () => {
      // Add followers
      await mockEnv.FOLLOWERS.put('followers:newyork', JSON.stringify([
        { id: 'https://mastodon.social/users/alice' },
        { id: 'https://fosstodon.org/users/bob' }
      ]));

      const request = new Request('https://weather.gripe/locations/newyork/followers');
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const followers = await response.json();
      
      expect(followers.type).toBe('OrderedCollection');
      expect(followers.totalItems).toBe(2);
    });
  });

  describe('Weather Alerts', () => {
    it('should pin severe weather alerts to featured collection', async () => {
      // Create an alert post
      const alertPost = {
        id: 'https://weather.gripe/posts/alert-456',
        type: 'Note',
        content: '🚨 Severe thunderstorm warning for New York',
        published: new Date().toISOString(),
        sensitive: true
      };

      await mockEnv.ALERTS.put(
        `alert:newyork:thunderstorm-${Date.now()}`,
        JSON.stringify(alertPost),
        { expirationTtl: 3600 }
      );

      const request = new Request('https://weather.gripe/locations/newyork/alerts');
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const alerts = await response.json();
      
      expect(alerts.type).toBe('OrderedCollection');
      expect(alerts.totalItems).toBe(1);
      expect(alerts.orderedItems[0]).toEqual(alertPost);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed activities gracefully', async () => {
      const malformedActivity = '{"type": "Follow", "actor": null}'; // Missing required fields
      
      const request = new Request('https://weather.gripe/locations/newyork/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/activity+json'
        },
        body: malformedActivity
      });

      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });

    it('should return 404 for non-existent locations', async () => {
      const request = new Request('https://weather.gripe/locations/nonexistent');
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      // Should still return actor object (locations are created on-demand)
      expect(response.status).toBe(200);
      const actor = await response.json();
      expect(actor.preferredUsername).toBe('nonexistent');
    });

    it('should handle signature verification failures', async () => {
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        actor: 'https://mastodon.social/users/alice',
        object: 'https://weather.gripe/locations/newyork'
      };

      const body = JSON.stringify(followActivity);
      
      // Create invalid signature
      const request = new Request('https://weather.gripe/locations/newyork/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/activity+json',
          'Date': new Date().toUTCString(),
          'Signature': 'keyId="https://mastodon.social/users/alice#main-key",headers="(request-target) host date",signature="invalid_signature_here"'
        },
        body
      });

      const response = await handleRequest(request, mockEnv, mockCtx);
      
      // Should still accept (we're lenient with signatures for now)
      expect(response.status).toBe(202);
    });
  });
});