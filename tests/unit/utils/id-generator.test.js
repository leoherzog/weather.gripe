import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePostId,
  generateActorId,
  generateCollectionId,
  generateActivityId,
  generateCreateActivityId,
  parsePostId,
  shouldPostExist,
  getCanonicalUrl,
  sanitizeId
} from '../../../src/utils/id-generator.js';

describe('ID Generator Utils', () => {
  describe('generatePostId', () => {
    it('should generate deterministic forecast post IDs', () => {
      const date = new Date('2025-08-12T07:00:00Z');
      const id1 = generatePostId('newyork', date, 'forecast-morning');
      const id2 = generatePostId('newyork', date, 'forecast-morning');
      
      expect(id1).toBe(id2);
      expect(id1).toBe('newyork-forecast-morning-20250812-07');
    });

    it('should generate different IDs for different post types', () => {
      const date = new Date('2025-08-12T12:00:00Z');
      const morning = generatePostId('newyork', date, 'forecast-morning');
      const noon = generatePostId('newyork', date, 'forecast-noon');
      const evening = generatePostId('newyork', date, 'forecast-evening');
      
      expect(morning).toBe('newyork-forecast-morning-20250812-07');
      expect(noon).toBe('newyork-forecast-noon-20250812-12');
      expect(evening).toBe('newyork-forecast-evening-20250812-19');
    });

    it('should generate alert post IDs with NWS alert ID', () => {
      const date = new Date('2025-08-12T14:30:00Z');
      const id = generatePostId('miami', date, 'alert', 'NWS.FLZ072.HURRICANE.WARNING');
      
      expect(id).toBe('miami-alert-nws-flz072-hurricane-warning');
    });

    it('should handle dots in alert IDs', () => {
      const id = generatePostId('chicago', new Date(), 'alert', 'NWS.ILZ013.BLIZZARD.WARNING');
      expect(id).toBe('chicago-alert-nws-ilz013-blizzard-warning');
    });

    it('should use UTC hours for non-standard post types', () => {
      const date = new Date('2025-08-12T15:30:00Z');
      const id = generatePostId('london', date, 'custom');
      
      expect(id).toBe('london-custom-20250812-15');
    });
  });

  describe('generateActorId', () => {
    it('should normalize location names', () => {
      expect(generateActorId('New York')).toBe('newyork');
      expect(generateActorId('los-angeles')).toBe('losangeles');
      expect(generateActorId('TOKYO')).toBe('tokyo');
      expect(generateActorId('Paris, France')).toBe('parisfrance');
    });

    it('should be deterministic', () => {
      const id1 = generateActorId('San Francisco');
      const id2 = generateActorId('San Francisco');
      
      expect(id1).toBe(id2);
      expect(id1).toBe('sanfrancisco');
    });
  });

  describe('generateCollectionId', () => {
    it('should generate collection IDs without pagination', () => {
      const id = generateCollectionId('newyork', 'outbox');
      expect(id).toBe('newyork-outbox');
    });

    it('should generate paginated collection IDs', () => {
      const id = generateCollectionId('paris', 'followers', 2);
      expect(id).toBe('paris-followers-page2');
    });

    it('should normalize location names in collections', () => {
      const id = generateCollectionId('Los Angeles', 'alerts');
      expect(id).toBe('losangeles-alerts');
    });
  });

  describe('generateActivityId', () => {
    it('should generate deterministic activity IDs', () => {
      const timestamp = new Date('2025-08-12T14:30:22Z');
      const id1 = generateActivityId('Accept', 'newyork', 'follow-123', timestamp);
      const id2 = generateActivityId('Accept', 'newyork', 'follow-123', timestamp);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^accept-newyork-[a-z0-9]{8}-20250812-143022$/);
    });

    it('should generate different IDs for different activities', () => {
      const timestamp = new Date('2025-08-12T14:30:22Z');
      const accept = generateActivityId('Accept', 'newyork', 'follow-123', timestamp);
      const follow = generateActivityId('Follow', 'paris', 'follow-456', timestamp);
      
      expect(accept).not.toBe(follow);
    });
  });

  describe('generateCreateActivityId', () => {
    it('should append -create suffix to post ID', () => {
      const postId = 'newyork-forecast-morning-20250812-07';
      const createId = generateCreateActivityId(postId);
      
      expect(createId).toBe('newyork-forecast-morning-20250812-07-create');
    });
  });

  describe('parsePostId', () => {
    it('should parse forecast post IDs', () => {
      const parsed = parsePostId('newyork-forecast-morning-20250812-07');
      
      expect(parsed).toEqual({
        locationId: 'newyork',
        type: 'forecast-morning',
        date: '20250812',
        hour: '07'
      });
    });

    it('should parse alert post IDs', () => {
      const parsed = parsePostId('miami-alert-nws-flz072-hurricane-warning');
      
      expect(parsed).toEqual({
        locationId: 'miami',
        type: 'alert',
        alertId: 'nws-flz072-hurricane-warning'
      });
    });

    it('should return null for invalid IDs', () => {
      expect(parsePostId('invalid')).toBeNull();
      expect(parsePostId('too-short')).toBeNull();
    });
  });

  describe('shouldPostExist', () => {
    it('should return true for past forecast posts', () => {
      const pastPost = 'newyork-forecast-morning-20240101-07';
      const result = shouldPostExist(pastPost, new Date('2025-01-01T00:00:00Z'));
      
      expect(result).toBe(true);
    });

    it('should return false for future forecast posts', () => {
      const futurePost = 'newyork-forecast-morning-20300101-07';
      const result = shouldPostExist(futurePost, new Date('2025-01-01T00:00:00Z'));
      
      expect(result).toBe(false);
    });

    it('should always return true for alert posts', () => {
      const alertPost = 'miami-alert-nws-hurricane';
      const result = shouldPostExist(alertPost);
      
      expect(result).toBe(true);
    });

    it('should return false for invalid post IDs', () => {
      expect(shouldPostExist('invalid')).toBe(false);
    });
  });

  describe('getCanonicalUrl', () => {
    it('should generate correct URLs for actors', () => {
      const url = getCanonicalUrl('weather.gripe', 'actor', 'newyork');
      expect(url).toBe('https://weather.gripe/locations/newyork');
    });

    it('should generate correct URLs for posts', () => {
      const url = getCanonicalUrl('weather.gripe', 'post', 'post-123');
      expect(url).toBe('https://weather.gripe/posts/post-123');
    });

    it('should generate correct URLs for activities', () => {
      const url = getCanonicalUrl('weather.gripe', 'activity', 'activity-456');
      expect(url).toBe('https://weather.gripe/activities/activity-456');
    });

    it('should generate correct URLs for collections', () => {
      const url = getCanonicalUrl('weather.gripe', 'collection', 'newyork-outbox');
      expect(url).toBe('https://weather.gripe/collections/newyork-outbox');
    });

    it('should handle unknown object types', () => {
      const url = getCanonicalUrl('weather.gripe', 'unknown', 'object-789');
      expect(url).toBe('https://weather.gripe/objects/object-789');
    });
  });

  describe('sanitizeId', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeId('UPPERCASE')).toBe('uppercase');
    });

    it('should replace special characters with hyphens', () => {
      expect(sanitizeId('new york city')).toBe('new-york-city');
      expect(sanitizeId('paris@france')).toBe('paris-france');
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeId('too---many---hyphens')).toBe('too-many-hyphens');
    });

    it('should trim hyphens from start and end', () => {
      expect(sanitizeId('-trimmed-')).toBe('trimmed');
      expect(sanitizeId('--both-sides--')).toBe('both-sides');
    });
  });
});