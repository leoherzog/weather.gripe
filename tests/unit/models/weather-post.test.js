import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherPost } from '../../../src/models/weather-post.js';

describe('WeatherPost Model', () => {
  const mockDomain = 'weather.gripe';
  const mockLocationId = 'newyork';
  const mockLocationName = 'New York, NY';
  
  describe('createForecastPost', () => {
    it('should create a valid forecast post', () => {
      const postTime = new Date('2025-08-12T07:00:00Z');
      const content = 'Sunny with a high of 75°F';
      
      const post = WeatherPost.createForecastPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        postTime,
        postType: 'forecast-morning',
        content,
        domain: mockDomain
      });
      
      expect(post).toMatchObject({
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Note',
        id: 'https://weather.gripe/posts/newyork-forecast-morning-20250812-07',
        url: 'https://weather.gripe/posts/newyork-forecast-morning-20250812-07',
        attributedTo: 'https://weather.gripe/locations/newyork',
        content,
        published: '2025-08-12T07:00:00.000Z',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: ['https://weather.gripe/locations/newyork/followers']
      });
    });

    it('should include default weather hashtag', () => {
      const post = WeatherPost.createForecastPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        postTime: new Date(),
        postType: 'forecast-noon',
        content: 'Test content',
        domain: mockDomain
      });
      
      expect(post.tag).toContainEqual({
        type: 'Hashtag',
        href: 'https://weather.gripe/tags/weather',
        name: '#weather'
      });
    });

    it('should include custom hashtags', () => {
      const hashtags = ['weather', 'nyc', 'sunny'];
      const post = WeatherPost.createForecastPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        postTime: new Date(),
        postType: 'forecast-evening',
        content: 'Test content',
        hashtags,
        domain: mockDomain
      });
      
      expect(post.tag).toHaveLength(3);
      expect(post.tag[1]).toMatchObject({
        type: 'Hashtag',
        href: 'https://weather.gripe/tags/nyc',
        name: '#nyc'
      });
    });

    it('should round published time to the nearest hour', () => {
      const postTime = new Date('2025-08-12T07:34:56Z');
      const post = WeatherPost.createForecastPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        postTime,
        postType: 'forecast-morning',
        content: 'Test',
        domain: mockDomain
      });
      
      expect(post.published).toBe('2025-08-12T07:00:00.000Z');
    });

    it('should include metadata for debugging', () => {
      const postTime = new Date('2025-08-12T12:00:00Z');
      const post = WeatherPost.createForecastPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        postTime,
        postType: 'forecast-noon',
        content: 'Test',
        domain: mockDomain
      });
      
      expect(post._metadata).toMatchObject({
        postId: 'newyork-forecast-noon-20250812-12',
        postType: 'forecast-noon',
        locationId: mockLocationId,
        generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      });
    });
  });

  describe('createAlertPost', () => {
    const mockAlert = {
      id: 'NWS.ILZ013.TORNADO.WARNING',
      event: 'Tornado Warning',
      severity: 'Extreme',
      effective: '2025-08-12T14:30:00Z',
      expires: '2025-08-12T15:30:00Z',
      description: 'A tornado has been sighted...',
      web: 'https://alerts.weather.gov/alert123'
    };

    it('should create a valid alert post', () => {
      const content = '⚠️ Tornado Warning for New York';
      
      const post = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: mockAlert,
        content,
        domain: mockDomain
      });
      
      expect(post).toMatchObject({
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Note',
        id: expect.stringContaining('newyork-alert-nws-ilz013-tornado-warning'),
        attributedTo: 'https://weather.gripe/locations/newyork',
        content,
        published: '2025-08-12T14:30:00.000Z',
        sensitive: true
      });
    });

    it('should mark extreme and severe alerts as sensitive', () => {
      const extremeAlert = { ...mockAlert, severity: 'Extreme' };
      const post1 = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: extremeAlert,
        content: 'Test',
        domain: mockDomain
      });
      expect(post1.sensitive).toBe(true);

      const severeAlert = { ...mockAlert, severity: 'Severe' };
      const post2 = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: severeAlert,
        content: 'Test',
        domain: mockDomain
      });
      expect(post2.sensitive).toBe(true);
    });

    it('should not mark moderate alerts as sensitive', () => {
      const moderateAlert = { ...mockAlert, severity: 'Moderate' };
      const post = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: moderateAlert,
        content: 'Test',
        domain: mockDomain
      });
      expect(post.sensitive).toBe(false);
    });

    it('should include alert and weather hashtags', () => {
      const post = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: mockAlert,
        content: 'Test',
        domain: mockDomain
      });
      
      expect(post.tag).toHaveLength(2);
      expect(post.tag).toContainEqual({
        type: 'Hashtag',
        href: 'https://weather.gripe/tags/weather',
        name: '#weather'
      });
      expect(post.tag).toContainEqual({
        type: 'Hashtag',
        href: 'https://weather.gripe/tags/alert',
        name: '#alert'
      });
    });

    it('should include attachment with alert details', () => {
      const post = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: mockAlert,
        content: 'Test',
        domain: mockDomain
      });
      
      expect(post.attachment).toMatchObject({
        type: 'Page',
        name: 'Tornado Warning',
        content: 'A tornado has been sighted...',
        url: 'https://alerts.weather.gov/alert123'
      });
    });

    it('should fallback to NWS API URL if web URL not provided', () => {
      const alertNoWeb = { ...mockAlert, web: undefined };
      const post = WeatherPost.createAlertPost({
        locationId: mockLocationId,
        locationName: mockLocationName,
        alert: alertNoWeb,
        content: 'Test',
        domain: mockDomain
      });
      
      expect(post.attachment.url).toBe(`https://api.weather.gov/alerts/${mockAlert.id}`);
    });
  });

  describe('createActivity', () => {
    it('should create a Create activity for a post', () => {
      const post = {
        id: 'https://weather.gripe/posts/test-post',
        attributedTo: 'https://weather.gripe/locations/newyork',
        published: '2025-08-12T07:00:00.000Z',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: ['https://weather.gripe/locations/newyork/followers'],
        _metadata: {
          postId: 'newyork-forecast-morning-20250812-07'
        }
      };
      
      const activity = WeatherPost.createActivity(post, mockDomain);
      
      expect(activity).toMatchObject({
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Create',
        id: expect.stringContaining('newyork-forecast-morning-20250812-07-create'),
        actor: 'https://weather.gripe/locations/newyork',
        object: post,
        published: '2025-08-12T07:00:00.000Z',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: ['https://weather.gripe/locations/newyork/followers']
      });
    });
  });

  describe('KV Storage Operations', () => {
    let mockEnv;

    beforeEach(() => {
      mockEnv = {
        POSTS: {
          get: vi.fn(),
          put: vi.fn(),
          list: vi.fn()
        }
      };
    });

    describe('exists', () => {
      it('should return true if post exists', async () => {
        mockEnv.POSTS.get.mockResolvedValue('{"id": "test"}');
        
        const exists = await WeatherPost.exists('test-post-id', mockEnv);
        
        expect(exists).toBe(true);
        expect(mockEnv.POSTS.get).toHaveBeenCalledWith('post:test-post-id');
      });

      it('should return false if post does not exist', async () => {
        mockEnv.POSTS.get.mockResolvedValue(null);
        
        const exists = await WeatherPost.exists('non-existent', mockEnv);
        
        expect(exists).toBe(false);
      });

      it('should return false on error', async () => {
        mockEnv.POSTS.get.mockRejectedValue(new Error('KV error'));
        
        const exists = await WeatherPost.exists('error-post', mockEnv);
        
        expect(exists).toBe(false);
      });
    });

    describe('store', () => {
      it('should store post with metadata', async () => {
        const post = {
          id: 'test-post',
          published: '2025-08-12T07:00:00.000Z',
          _metadata: {
            postId: 'test-post-id',
            locationId: 'newyork',
            postType: 'forecast-morning'
          }
        };
        
        await WeatherPost.store(post, mockEnv);
        
        expect(mockEnv.POSTS.put).toHaveBeenCalledWith(
          'post:test-post-id',
          JSON.stringify(post),
          {
            metadata: {
              locationId: 'newyork',
              postType: 'forecast-morning',
              published: '2025-08-12T07:00:00.000Z'
            }
          }
        );
      });
    });

    describe('retrieve', () => {
      it('should retrieve post by ID', async () => {
        const mockPost = { id: 'test-post', content: 'Test content' };
        mockEnv.POSTS.get.mockResolvedValue(mockPost);
        
        const post = await WeatherPost.retrieve('test-post-id', mockEnv);
        
        expect(post).toEqual(mockPost);
        expect(mockEnv.POSTS.get).toHaveBeenCalledWith('post:test-post-id', 'json');
      });

      it('should return null if post not found', async () => {
        mockEnv.POSTS.get.mockResolvedValue(null);
        
        const post = await WeatherPost.retrieve('non-existent', mockEnv);
        
        expect(post).toBeNull();
      });

      it('should return null on error', async () => {
        mockEnv.POSTS.get.mockRejectedValue(new Error('KV error'));
        
        const post = await WeatherPost.retrieve('error-post', mockEnv);
        
        expect(post).toBeNull();
      });
    });

    describe('getRecentPosts', () => {
      it('should get recent posts for a location', async () => {
        const mockKeys = {
          keys: [
            { name: 'post:newyork-1' },
            { name: 'post:newyork-2' }
          ]
        };
        const mockPost1 = { id: '1', published: '2025-08-12T07:00:00Z' };
        const mockPost2 = { id: '2', published: '2025-08-12T12:00:00Z' };
        
        mockEnv.POSTS.list.mockResolvedValue(mockKeys);
        mockEnv.POSTS.get
          .mockResolvedValueOnce(mockPost1)
          .mockResolvedValueOnce(mockPost2);
        
        const posts = await WeatherPost.getRecentPosts('newyork', mockEnv, 10);
        
        expect(posts).toHaveLength(2);
        expect(posts[0]).toEqual(mockPost2); // More recent first
        expect(posts[1]).toEqual(mockPost1);
        expect(mockEnv.POSTS.list).toHaveBeenCalledWith({
          prefix: 'post:newyork-',
          limit: 10
        });
      });

      it('should return empty array on error', async () => {
        mockEnv.POSTS.list.mockRejectedValue(new Error('KV error'));
        
        const posts = await WeatherPost.getRecentPosts('newyork', mockEnv);
        
        expect(posts).toEqual([]);
      });

      it('should sort posts by published date descending', async () => {
        const mockKeys = {
          keys: [
            { name: 'post:1' },
            { name: 'post:2' },
            { name: 'post:3' }
          ]
        };
        const posts = [
          { id: '1', published: '2025-08-10T12:00:00Z' },
          { id: '2', published: '2025-08-12T12:00:00Z' },
          { id: '3', published: '2025-08-11T12:00:00Z' }
        ];
        
        mockEnv.POSTS.list.mockResolvedValue(mockKeys);
        mockEnv.POSTS.get
          .mockResolvedValueOnce(posts[0])
          .mockResolvedValueOnce(posts[1])
          .mockResolvedValueOnce(posts[2]);
        
        const result = await WeatherPost.getRecentPosts('test', mockEnv);
        
        expect(result[0].id).toBe('2'); // Most recent
        expect(result[1].id).toBe('3');
        expect(result[2].id).toBe('1'); // Oldest
      });
    });
  });
});