/**
 * Location Service
 * Handles geocoding location names to coordinates using Nominatim
 */

import { HttpCache } from './http-cache.js';
import { ValidationError } from '../utils/error-handler.js';

export class LocationService {
  constructor(env, logger, httpCache = null) {
    this.env = env;
    this.logger = logger;
    this.httpCache = httpCache || new HttpCache(env, logger);
    this.nominatimBaseUrl = 'https://nominatim.openstreetmap.org';
    this.userAgent = env.USER_AGENT || 'weather.gripe/1.0';
  }

  /**
   * Search for a location by name and return coordinates
   * @param {string} locationName - Location name to search for
   * @returns {Promise<Object>} Location object with lat, lon, and metadata
   */
  async searchLocation(locationName) {
    if (!locationName || locationName.trim().length < 2) {
      throw new ValidationError('Location name must be at least 2 characters');
    }

    const normalizedName = this.normalizeLocationName(locationName);
    
    // Check cache first (30-day TTL)
    const cached = await this.httpCache.getCachedGeocodingResult(normalizedName);
    if (cached) {
      this.logger.info('Geocoding cache hit', { location: normalizedName });
      return cached;
    }

    // Search using Nominatim
    try {
      const searchUrl = new URL('/search', this.nominatimBaseUrl);
      searchUrl.searchParams.append('q', normalizedName);
      searchUrl.searchParams.append('format', 'json');
      searchUrl.searchParams.append('limit', '5');
      searchUrl.searchParams.append('addressdetails', '1');
      searchUrl.searchParams.append('extratags', '1');
      
      this.logger.info('Geocoding request', { location: normalizedName });
      
      const response = await fetch(searchUrl.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const results = await response.json();
      
      if (!results || results.length === 0) {
        throw new ValidationError(`Location not found: ${locationName}`);
      }

      // Process and select best result
      const location = this.selectBestLocation(results, normalizedName);
      
      // Cache the result
      await this.httpCache.cacheGeocodingResult(normalizedName, location);
      
      this.logger.info('Geocoding successful', { 
        location: normalizedName,
        lat: location.lat,
        lon: location.lon 
      });
      
      return location;
    } catch (error) {
      this.logger.error('Geocoding failed', { location: normalizedName, error });
      
      // Try fallback strategies
      const fallback = await this.tryFallbackLocation(normalizedName);
      if (fallback) {
        return fallback;
      }
      
      throw error;
    }
  }

  /**
   * Get location details by coordinates (reverse geocoding)
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} Location details
   */
  async reverseGeocode(lat, lon) {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    
    // Check cache
    const cached = await this.httpCache.getCachedGeocodingResult(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const reverseUrl = new URL('/reverse', this.nominatimBaseUrl);
      reverseUrl.searchParams.append('lat', lat.toString());
      reverseUrl.searchParams.append('lon', lon.toString());
      reverseUrl.searchParams.append('format', 'json');
      reverseUrl.searchParams.append('addressdetails', '1');
      
      const response = await fetch(reverseUrl.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const result = await response.json();
      const location = this.processLocationResult(result);
      
      // Cache the result
      await this.httpCache.cacheGeocodingResult(cacheKey, location);
      
      return location;
    } catch (error) {
      this.logger.error('Reverse geocoding failed', { lat, lon, error });
      throw error;
    }
  }

  /**
   * Select the best location from Nominatim results
   * @param {Array} results - Nominatim search results
   * @param {string} searchTerm - Original search term
   * @returns {Object} Best matching location
   */
  selectBestLocation(results, searchTerm) {
    // Prefer results in this order:
    // 1. Cities/towns
    // 2. Counties/states
    // 3. Other administrative areas
    // 4. First result as fallback
    
    const cityTypes = ['city', 'town', 'village', 'municipality'];
    const adminTypes = ['administrative', 'state', 'county'];
    
    // Look for cities first
    let best = results.find(r => 
      cityTypes.includes(r.type) || 
      cityTypes.includes(r.addresstype)
    );
    
    // Then administrative areas
    if (!best) {
      best = results.find(r => 
        adminTypes.some(t => r.type?.includes(t)) ||
        adminTypes.some(t => r.addresstype?.includes(t))
      );
    }
    
    // Default to first result
    if (!best) {
      best = results[0];
    }
    
    return this.processLocationResult(best);
  }

  /**
   * Process a Nominatim result into our location format
   * @param {Object} result - Nominatim result
   * @returns {Object} Processed location
   */
  processLocationResult(result) {
    const address = result.address || {};
    
    // Build display name
    let displayName = result.display_name;
    if (address.city || address.town || address.village) {
      const city = address.city || address.town || address.village;
      const state = address.state || address.country;
      displayName = state ? `${city}, ${state}` : city;
    }
    
    // Extract timezone if available
    let timezone = null;
    if (result.extratags?.timezone) {
      timezone = result.extratags.timezone;
    }
    
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName,
      city: address.city || address.town || address.village || address.hamlet,
      county: address.county,
      state: address.state,
      country: address.country,
      countryCode: address.country_code?.toUpperCase(),
      timezone,
      boundingBox: result.boundingbox ? {
        minLat: parseFloat(result.boundingbox[0]),
        maxLat: parseFloat(result.boundingbox[1]),
        minLon: parseFloat(result.boundingbox[2]),
        maxLon: parseFloat(result.boundingbox[3])
      } : null,
      importance: parseFloat(result.importance || 0),
      placeId: result.place_id,
      osmType: result.osm_type,
      osmId: result.osm_id
    };
  }

  /**
   * Normalize location name for searching and caching
   * @param {string} name - Location name
   * @returns {string} Normalized name
   */
  normalizeLocationName(name) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^\w\s,-]/g, '') // Remove special chars except comma and hyphen
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Try fallback strategies for common location aliases
   * @param {string} locationName - Location name that failed
   * @returns {Promise<Object|null>} Location if found, null otherwise
   */
  async tryFallbackLocation(locationName) {
    // Common aliases and abbreviations
    const aliases = {
      'nyc': 'New York City, NY, USA',
      'ny': 'New York, NY, USA',
      'la': 'Los Angeles, CA, USA',
      'sf': 'San Francisco, CA, USA',
      'dc': 'Washington, DC, USA',
      'chicago': 'Chicago, IL, USA',
      'boston': 'Boston, MA, USA',
      'seattle': 'Seattle, WA, USA',
      'miami': 'Miami, FL, USA',
      'dallas': 'Dallas, TX, USA',
      'houston': 'Houston, TX, USA',
      'atlanta': 'Atlanta, GA, USA',
      'philly': 'Philadelphia, PA, USA',
      'philadelphia': 'Philadelphia, PA, USA',
      'phoenix': 'Phoenix, AZ, USA',
      'denver': 'Denver, CO, USA',
      'london': 'London, United Kingdom',
      'paris': 'Paris, France',
      'tokyo': 'Tokyo, Japan',
      'sydney': 'Sydney, Australia',
      'toronto': 'Toronto, Canada',
      'vancouver': 'Vancouver, Canada',
      'mexico city': 'Mexico City, Mexico',
      'berlin': 'Berlin, Germany',
      'rome': 'Rome, Italy',
      'madrid': 'Madrid, Spain',
      'amsterdam': 'Amsterdam, Netherlands'
    };
    
    const normalized = locationName.toLowerCase().trim();
    const aliasTarget = aliases[normalized];
    
    if (aliasTarget) {
      this.logger.info('Using location alias', { 
        alias: normalized, 
        target: aliasTarget 
      });
      
      try {
        // Recursive call with the full location name
        return await this.searchLocation(aliasTarget);
      } catch (error) {
        this.logger.error('Alias fallback failed', { alias: normalized, error });
      }
    }
    
    return null;
  }

  /**
   * Get location ID for use in ActivityPub
   * @param {string} locationName - Location name
   * @returns {string} Normalized location ID
   */
  getLocationId(locationName) {
    return locationName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Get hashtag for a location
   * @param {Object} location - Location object
   * @returns {string} Hashtag for the location
   */
  getLocationHashtag(location) {
    if (location.city) {
      return location.city.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    return 'weather';
  }
}