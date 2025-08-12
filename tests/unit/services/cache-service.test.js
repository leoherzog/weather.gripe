import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheService } from '../../../src/services/cache-service.js';

describe('CacheService', () => {
  let cacheService;
  let mockEnv;
  let mockLogger;
  let mockCache;

  beforeEach(() => {
    // Mock the global caches object
    mockCache = {
      put: vi.fn(),
      match: vi.fn()
    };
    
    global.caches = {
      default: mockCache
    };

    mockEnv = {
      DOMAIN: 'weather.gripe',
      FOLLOWERS: {
        get: vi.fn(),
        put: vi.fn()
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

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    };

    cacheService = new CacheService(mockEnv, mockLogger);
  });

  describe('HTTP Response Caching', () => {
    describe('cacheResponse', () => {
      it('should cache a response with proper headers', async () => {
        const key = 'https://weather.gripe/test';
        const response = new Response('test data', {
          headers: { 'Content-Type': 'text/plain' }
        });
        const ttl = 3600;

        await cacheService.cacheResponse(key, response, ttl);

        expect(mockCache.put).toHaveBeenCalled();
        const [cacheKey, cachedResponse] = mockCache.put.mock.calls[0];
        
        expect(cacheKey).toBeInstanceOf(Request);
        expect(cacheKey.url).toBe(key);
        expect(cachedResponse.headers.get('Cache-Control')).toBe('public, max-age=3600');
        expect(cachedResponse.headers.get('X-Cache-Time')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('should handle caching errors gracefully', async () => {
        mockCache.put.mockRejectedValue(new Error('Cache error'));
        
        const response = new Response('test');
        await cacheService.cacheResponse('key', response, 100);
        
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to cache response',
          expect.objectContaining({ key: 'key' })
        );
      });
    });

    describe('getCachedResponse', () => {
      it('should return cached response when available', async () => {
        const cachedResponse = new Response('cached data', {
          headers: { 'X-Cache-Time': '2025-01-01T00:00:00Z' }
        });
        mockCache.match.mockResolvedValue(cachedResponse);

        const result = await cacheService.getCachedResponse('https://weather.gripe/test');

        expect(result).toBe(cachedResponse);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Cache hit',
          expect.objectContaining({ key: 'https://weather.gripe/test' })
        );
      });

      it('should return null for cache miss', async () => {
        mockCache.match.mockResolvedValue(null);

        const result = await cacheService.getCachedResponse('https://weather.gripe/miss');

        expect(result).toBeNull();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Cache miss',
          { key: 'https://weather.gripe/miss' }
        );
      });

      it('should handle errors gracefully', async () => {
        mockCache.match.mockRejectedValue(new Error('Match error'));

        const result = await cacheService.getCachedResponse('key');

        expect(result).toBeNull();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });
  });

  describe('Weather Data Caching', () => {
    it('should cache weather data with 6-hour TTL', async () => {
      const data = { temperature: 75, condition: 'sunny' };
      
      await cacheService.cacheWeatherData(40.7128, -74.0060, 'forecast', data);

      expect(mockCache.put).toHaveBeenCalled();
      const [cacheKey, response] = mockCache.put.mock.calls[0];
      
      expect(cacheKey.url).toBe('https://weather.gripe/cache/weather/40.7128,-74.006/forecast');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=21600');
    });

    it('should retrieve cached weather data', async () => {
      const data = { temperature: 75 };
      const cachedResponse = new Response(JSON.stringify(data));
      mockCache.match.mockResolvedValue(cachedResponse);

      const result = await cacheService.getCachedWeatherData(40.7128, -74.0060, 'forecast');

      expect(result).toEqual(data);
    });
  });

  describe('Geocoding Caching', () => {
    it('should cache geocoding results with 30-day TTL', async () => {
      const data = { lat: 40.7128, lon: -74.0060 };
      
      await cacheService.cacheGeocodingResult('New York', data);

      expect(mockCache.put).toHaveBeenCalled();
      const [cacheKey, response] = mockCache.put.mock.calls[0];
      
      expect(cacheKey.url).toBe('https://weather.gripe/cache/geocode/new%20york');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=2592000');
    });

    it('should normalize location names for caching', async () => {
      await cacheService.cacheGeocodingResult('NEW YORK', {});
      
      const [cacheKey] = mockCache.put.mock.calls[0];
      expect(cacheKey.url).toContain('/new%20york');
    });
  });

  describe('ActivityPub Object Caching', () => {
    it('should cache ActivityPub objects with 1-hour TTL', async () => {
      const actor = { type: 'Person', id: 'actor-1' };
      
      await cacheService.cacheActivityPubObject('actor', 'newyork', actor);

      const [cacheKey, response] = mockCache.put.mock.calls[0];
      
      expect(cacheKey.url).toBe('https://weather.gripe/cache/activitypub/actor/newyork');
      expect(response.headers.get('Content-Type')).toBe('application/activity+json');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });
  });

  describe('Followers Management (KV)', () => {
    describe('getFollowers', () => {
      it('should return followers list', async () => {
        const followers = [{ id: 'follower1' }, { id: 'follower2' }];
        mockEnv.FOLLOWERS.get.mockResolvedValue(followers);

        const result = await cacheService.getFollowers('newyork');

        expect(result).toEqual(followers);
        expect(mockEnv.FOLLOWERS.get).toHaveBeenCalledWith('followers:newyork', 'json');
      });

      it('should return empty array when no followers', async () => {
        mockEnv.FOLLOWERS.get.mockResolvedValue(null);

        const result = await cacheService.getFollowers('paris');

        expect(result).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        mockEnv.FOLLOWERS.get.mockRejectedValue(new Error('KV error'));

        const result = await cacheService.getFollowers('london');

        expect(result).toEqual([]);
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('addFollower', () => {
      it('should add new follower', async () => {
        mockEnv.FOLLOWERS.get.mockResolvedValue([]);
        
        const follower = {
          id: 'https://mastodon.social/@user',
          inbox: 'https://mastodon.social/@user/inbox'
        };

        await cacheService.addFollower('newyork', follower);

        expect(mockEnv.FOLLOWERS.put).toHaveBeenCalledWith(
          'followers:newyork',
          expect.stringContaining(follower.id)
        );
      });

      it('should not add duplicate followers', async () => {
        const existingFollower = {
          id: 'https://mastodon.social/@user',
          inbox: 'https://mastodon.social/@user/inbox',
          addedAt: '2025-01-01T00:00:00Z'
        };
        mockEnv.FOLLOWERS.get.mockResolvedValue([existingFollower]);

        await cacheService.addFollower('newyork', existingFollower);

        expect(mockEnv.FOLLOWERS.put).not.toHaveBeenCalled();
      });
    });

    describe('removeFollower', () => {
      it('should remove follower', async () => {
        const followers = [
          { id: 'follower1' },
          { id: 'follower2' }
        ];
        mockEnv.FOLLOWERS.get.mockResolvedValue(followers);

        await cacheService.removeFollower('newyork', 'follower1');

        expect(mockEnv.FOLLOWERS.put).toHaveBeenCalledWith(
          'followers:newyork',
          JSON.stringify([{ id: 'follower2' }])
        );
      });

      it('should handle non-existent follower', async () => {
        mockEnv.FOLLOWERS.get.mockResolvedValue([{ id: 'follower1' }]);

        await cacheService.removeFollower('newyork', 'nonexistent');

        expect(mockEnv.FOLLOWERS.put).not.toHaveBeenCalled();
      });
    });
  });

  describe('Post Storage (KV)', () => {
    it('should store post with metadata', async () => {
      const post = {
        id: 'post-123',
        location: 'newyork',
        type: 'forecast',
        published: '2025-01-01T07:00:00Z'
      };

      await cacheService.storePost('post-123', post);

      expect(mockEnv.POSTS.put).toHaveBeenCalledWith(
        'post:post-123',
        JSON.stringify(post),
        {
          metadata: {
            location: 'newyork',
            type: 'forecast',
            createdAt: '2025-01-01T07:00:00Z'
          }
        }
      );
    });

    it('should retrieve post by ID', async () => {
      const post = { id: 'post-123', content: 'Weather update' };
      mockEnv.POSTS.get.mockResolvedValue(post);

      const result = await cacheService.getPost('post-123');

      expect(result).toEqual(post);
      expect(mockEnv.POSTS.get).toHaveBeenCalledWith('post:post-123', 'json');
    });
  });

  describe('Alert Tracking (KV)', () => {
    it('should track alert with expiration', async () => {
      const alertData = {
        severity: 'Severe',
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      };

      await cacheService.trackAlert('miami', 'alert-456', alertData);

      expect(mockEnv.ALERTS.put).toHaveBeenCalled();
      const [key, data, options] = mockEnv.ALERTS.put.mock.calls[0];
      
      expect(key).toBe('alerts:miami:alert-456');
      expect(JSON.parse(data)).toMatchObject(alertData);
      expect(options.expirationTtl).toBeGreaterThan(0);
      expect(options.expirationTtl).toBeLessThanOrEqual(3600);
    });

    it('should use default TTL when no expiration provided', async () => {
      const alertData = { severity: 'Moderate' };

      await cacheService.trackAlert('chicago', 'alert-789', alertData);

      const [, , options] = mockEnv.ALERTS.put.mock.calls[0];
      expect(options.expirationTtl).toBe(86400); // 24 hours
    });
  });

  describe('Cache Invalidation', () => {
    it('should log invalidation request', async () => {
      await cacheService.invalidateCache('weather/*');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache invalidation requested',
        { pattern: 'weather/*' }
      );
    });
  });
});