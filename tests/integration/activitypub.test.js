/**
 * Integration tests for ActivityPub handlers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleActivityPub } from '../../src/handlers/activitypub.js';
import { generateKeyPair, signRequest } from '../../src/utils/http-signature.js';

describe('ActivityPub Handler Integration', () => {
  let mockEnv;
  let mockLogger;
  let testKeyPair;

  beforeEach(async () => {
    // Generate test keypair
    testKeyPair = await generateKeyPair();
    
    mockEnv = {
      DOMAIN: 'weather.gripe',
      USER_AGENT: 'weather.gripe/test',
      FOLLOWERS: { 
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(() => ({ keys: [] }))
      },
      POSTS: { 
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(() => ({ keys: [] }))
      },
      ALERTS: { 
        get: vi.fn(),
        list: vi.fn(() => ({ keys: [] }))
      },
      KEYS: {
        get: vi.fn(async (key) => {
          if (key.includes('public_key')) return testKeyPair.publicKey;
          if (key.includes('private_key')) return testKeyPair.privateKey;
          return null;
        }),
        put: vi.fn()
      }
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock cache
    global.caches = {
      default: {
        match: vi.fn(() => null),
        put: vi.fn()
      }
    };
  });

  describe('Actor Endpoint', () => {
    it('should return actor object with public key', async () => {
      const request = new Request('https://weather.gripe/locations/newyork');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/activity+json');
      
      const actor = await response.json();
      expect(actor.type).toBe('Person');
      expect(actor.id).toBe('https://weather.gripe/locations/newyork');
      expect(actor.preferredUsername).toBe('newyork');
      expect(actor.inbox).toBe('https://weather.gripe/locations/newyork/inbox');
      expect(actor.outbox).toBe('https://weather.gripe/locations/newyork/outbox');
      expect(actor.publicKey).toBeDefined();
      expect(actor.publicKey.id).toBe('https://weather.gripe/locations/newyork#main-key');
      expect(actor.publicKey.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    });

    it('should include all required ActivityPub fields', async () => {
      const request = new Request('https://weather.gripe/locations/chicago');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      const actor = await response.json();
      
      // Check required fields
      expect(actor['@context']).toBeDefined();
      expect(actor.type).toBe('Person');
      expect(actor.id).toBeDefined();
      expect(actor.inbox).toBeDefined();
      expect(actor.outbox).toBeDefined();
      expect(actor.preferredUsername).toBeDefined();
      expect(actor.publicKey).toBeDefined();
      
      // Check optional but important fields
      expect(actor.followers).toBeDefined();
      expect(actor.following).toBeDefined();
      expect(actor.featured).toBeDefined();
      expect(actor.manuallyApprovesFollowers).toBe(false);
      expect(actor.discoverable).toBe(true);
    });
  });

  describe('Inbox Endpoint', () => {
    it('should accept Follow activity', async () => {
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        actor: 'https://mastodon.social/users/testuser',
        object: 'https://weather.gripe/locations/seattle',
        id: 'https://mastodon.social/activities/12345'
      };

      const request = new Request('https://weather.gripe/locations/seattle/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/activity+json'
        },
        body: JSON.stringify(followActivity)
      });

      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(202);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Inbox activity received'),
        expect.objectContaining({
          type: 'Follow',
          actor: 'https://mastodon.social/users/testuser'
        })
      );
    });

    it('should handle Undo Follow activity', async () => {
      const undoActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        actor: 'https://mastodon.social/users/testuser',
        object: {
          type: 'Follow',
          actor: 'https://mastodon.social/users/testuser',
          object: 'https://weather.gripe/locations/seattle'
        },
        id: 'https://mastodon.social/activities/12346'
      };

      const request = new Request('https://weather.gripe/locations/seattle/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/activity+json'
        },
        body: JSON.stringify(undoActivity)
      });

      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(202);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Inbox activity received'),
        expect.objectContaining({ type: 'Undo' })
      );
    });

    it('should verify HTTP signatures when present', async () => {
      const activity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        actor: 'https://mastodon.social/users/testuser',
        object: 'https://weather.gripe/locations/boston',
        id: 'https://mastodon.social/activities/12347'
      };

      const body = JSON.stringify(activity);
      const url = 'https://weather.gripe/locations/boston/inbox';
      
      // Sign the request
      const signedHeaders = await signRequest({
        keyId: 'https://mastodon.social/users/testuser#main-key',
        privateKey: testKeyPair.privateKey,
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/activity+json',
          'Date': new Date().toUTCString()
        },
        body
      });

      const request = new Request(url, {
        method: 'POST',
        headers: signedHeaders,
        body
      });

      // Mock the actor fetch to return our test public key
      global.fetch = vi.fn(async (url) => {
        if (url === 'https://mastodon.social/users/testuser') {
          return new Response(JSON.stringify({
            publicKey: {
              id: 'https://mastodon.social/users/testuser#main-key',
              publicKeyPem: testKeyPair.publicKey
            }
          }), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(202);
      // Should not log invalid signature warning
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid HTTP signature'),
        expect.any(Object)
      );
    });

    it('should reject invalid activity types', async () => {
      const invalidActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'InvalidType',
        actor: 'https://mastodon.social/users/testuser',
        object: 'https://weather.gripe/locations/miami'
      };

      const request = new Request('https://weather.gripe/locations/miami/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/activity+json'
        },
        body: JSON.stringify(invalidActivity)
      });

      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('Unsupported activity type');
    });
  });

  describe('Outbox Endpoint', () => {
    it('should return OrderedCollection with posts', async () => {
      // Mock some posts
      mockEnv.POSTS.list.mockResolvedValue({
        keys: [
          { name: 'post:newyork:2024-01-01T07:00:00Z' },
          { name: 'post:newyork:2024-01-01T12:00:00Z' }
        ]
      });

      mockEnv.POSTS.get.mockImplementation(async (key) => {
        return JSON.stringify({
          id: `https://weather.gripe/posts/${key}`,
          type: 'Note',
          content: 'Test weather post',
          published: '2024-01-01T07:00:00Z'
        });
      });

      const request = new Request('https://weather.gripe/locations/newyork/outbox');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(200);
      const outbox = await response.json();
      
      expect(outbox.type).toBe('OrderedCollection');
      expect(outbox.id).toBe('https://weather.gripe/locations/newyork/outbox');
      expect(outbox.totalItems).toBe(2);
      expect(outbox.first).toBeDefined();
    });

    it('should support pagination', async () => {
      const request = new Request('https://weather.gripe/locations/newyork/outbox?page=1');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(200);
      const page = await response.json();
      
      expect(page.type).toBe('OrderedCollectionPage');
      expect(page.partOf).toBe('https://weather.gripe/locations/newyork/outbox');
      expect(page.orderedItems).toBeDefined();
      expect(Array.isArray(page.orderedItems)).toBe(true);
    });
  });

  describe('Followers Endpoint', () => {
    it('should return followers collection', async () => {
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

      const request = new Request('https://weather.gripe/locations/newyork/followers');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(200);
      const followers = await response.json();
      
      expect(followers.type).toBe('OrderedCollection');
      expect(followers.id).toBe('https://weather.gripe/locations/newyork/followers');
      expect(followers.totalItems).toBe(2);
    });
  });

  describe('Following Endpoint', () => {
    it('should return empty following collection', async () => {
      const request = new Request('https://weather.gripe/locations/newyork/following');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(200);
      const following = await response.json();
      
      expect(following.type).toBe('OrderedCollection');
      expect(following.id).toBe('https://weather.gripe/locations/newyork/following');
      expect(following.totalItems).toBe(0);
      expect(following.orderedItems).toEqual([]);
    });
  });

  describe('Alerts (Featured) Endpoint', () => {
    it('should return active alerts collection', async () => {
      // Mock active alerts
      mockEnv.ALERTS.list.mockResolvedValue({
        keys: [
          { name: 'alert:newyork:severe-thunderstorm-2024-01-01' }
        ]
      });

      mockEnv.ALERTS.get.mockResolvedValue(JSON.stringify({
        id: 'https://weather.gripe/posts/alert-12345',
        type: 'Note',
        content: 'Severe thunderstorm warning',
        published: '2024-01-01T15:00:00Z'
      }));

      const request = new Request('https://weather.gripe/locations/newyork/alerts');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(200);
      const alerts = await response.json();
      
      expect(alerts.type).toBe('OrderedCollection');
      expect(alerts.id).toBe('https://weather.gripe/locations/newyork/alerts');
      expect(alerts.totalItems).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const request = new Request('https://weather.gripe/locations/newyork/unknown');
      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toContain('Unknown endpoint');
    });

    it('should handle malformed JSON in inbox', async () => {
      const request = new Request('https://weather.gripe/locations/newyork/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/activity+json'
        },
        body: 'invalid json {'
      });

      const response = await handleActivityPub(request, mockEnv, mockLogger);
      
      expect(response.status).toBe(400);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});