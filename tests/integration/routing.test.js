import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRequest, scheduled } from '../../src/index.js';

describe('Main Application Routing', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    mockEnv = {
      DOMAIN: 'weather.gripe',
      ADMIN_EMAIL: 'test@weather.gripe',
      USER_AGENT: 'weather.gripe/test',
      FOLLOWERS: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn()
      },
      POSTS: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn()
      },
      ALERTS: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn()
      }
    };

    mockCtx = {
      waitUntil: vi.fn()
    };

    // Mock global caches
    global.caches = {
      default: {
        put: vi.fn(),
        match: vi.fn()
      }
    };
  });

  describe('WebFinger endpoint', () => {
    it('should handle WebFinger requests', async () => {
      const request = new Request('https://weather.gripe/.well-known/webfinger?resource=acct:newyork@weather.gripe');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/jrd+json');
      
      const body = await response.json();
      expect(body.subject).toBe('acct:newyork@weather.gripe');
      expect(body.links).toBeDefined();
    });

    it('should return 400 for WebFinger without resource', async () => {
      const request = new Request('https://weather.gripe/.well-known/webfinger');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(400);
    });
  });

  describe('ActivityPub endpoints', () => {
    it('should handle actor profile requests', async () => {
      const request = new Request('https://weather.gripe/locations/newyork', {
        headers: { 'Accept': 'application/activity+json' }
      });
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/activity+json');
      
      const body = await response.json();
      expect(body.type).toBe('Person');
      expect(body.preferredUsername).toBe('newyork');
    });

    it('should handle inbox POST requests', async () => {
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        actor: 'https://mastodon.social/@user',
        object: 'https://weather.gripe/locations/newyork'
      };
      
      const request = new Request('https://weather.gripe/locations/newyork/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/activity+json' },
        body: JSON.stringify(followActivity)
      });
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(202);
    });

    it('should handle outbox GET requests', async () => {
      mockEnv.POSTS.list.mockResolvedValue({ keys: [] });
      
      const request = new Request('https://weather.gripe/locations/newyork/outbox');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/activity+json');
      
      const body = await response.json();
      expect(body.type).toBe('OrderedCollection');
    });

    it('should handle followers collection', async () => {
      mockEnv.FOLLOWERS.get.mockResolvedValue([]);
      
      const request = new Request('https://weather.gripe/locations/newyork/followers');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/activity+json');
      
      const body = await response.json();
      expect(body.type).toBe('OrderedCollection');
      expect(body.totalItems).toBe(0);
    });

    it('should handle following collection', async () => {
      const request = new Request('https://weather.gripe/locations/newyork/following');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.type).toBe('OrderedCollection');
      expect(body.totalItems).toBe(0);
    });
  });

  describe('Weather API endpoints', () => {
    it('should handle forecast requests', async () => {
      const request = new Request('https://weather.gripe/api/weather/forecast?location=newyork');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should handle current weather requests', async () => {
      const request = new Request('https://weather.gripe/api/weather/current?location=newyork');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
    });

    it('should handle alerts requests', async () => {
      const request = new Request('https://weather.gripe/api/weather/alerts?location=newyork');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
    });

    it('should handle geocode requests', async () => {
      const request = new Request('https://weather.gripe/api/weather/geocode?location=newyork');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Post endpoints', () => {
    it('should retrieve individual posts', async () => {
      const mockPost = {
        type: 'Note',
        content: 'Weather update',
        id: 'https://weather.gripe/posts/test-post'
      };
      mockEnv.POSTS.get.mockResolvedValue(JSON.stringify(mockPost));
      
      const request = new Request('https://weather.gripe/posts/test-post');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/activity+json');
    });

    it('should return 404 for missing posts', async () => {
      mockEnv.POSTS.get.mockResolvedValue(null);
      
      const request = new Request('https://weather.gripe/posts/nonexistent');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
    });
  });

  describe('Health check', () => {
    it('should respond to health check', async () => {
      const request = new Request('https://weather.gripe/health');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://weather.gripe/unknown/path');
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
    });

    it('should handle OPTIONS requests', async () => {
      const request = new Request('https://weather.gripe/locations/newyork', {
        method: 'OPTIONS'
      });
      
      const response = await handleRequest(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});

describe('Scheduled Handler (Cron)', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    mockEnv = {
      DOMAIN: 'weather.gripe',
      FOLLOWERS: {
        list: vi.fn(),
        get: vi.fn()
      },
      POSTS: {
        get: vi.fn(),
        put: vi.fn()
      },
      ALERTS: {
        get: vi.fn(),
        put: vi.fn()
      }
    };

    mockCtx = {
      waitUntil: vi.fn()
    };

    global.caches = {
      default: {
        put: vi.fn(),
        match: vi.fn()
      }
    };
  });

  it('should execute scheduled task', async () => {
    // Mock followers for a location
    mockEnv.FOLLOWERS.list.mockResolvedValue({
      keys: [{ name: 'followers:newyork' }]
    });
    mockEnv.FOLLOWERS.get.mockResolvedValue(JSON.stringify([
      { id: 'https://mastodon.social/@user', inbox: 'https://mastodon.social/@user/inbox' }
    ]));

    const event = {
      scheduledTime: new Date('2025-01-15T12:00:00Z').getTime(),
      cron: '*/5 * * * *'
    };

    await scheduled(event, mockEnv, mockCtx);

    // Verify that the scheduled task attempted to process locations
    expect(mockEnv.FOLLOWERS.list).toHaveBeenCalled();
  });

  it('should handle cron execution errors gracefully', async () => {
    mockEnv.FOLLOWERS.list.mockRejectedValue(new Error('KV error'));

    const event = {
      scheduledTime: Date.now(),
      cron: '*/5 * * * *'
    };

    // Should not throw
    await expect(scheduled(event, mockEnv, mockCtx)).resolves.not.toThrow();
  });
});