/**
 * Integration test for the complete weather flow
 * Tests: location name → coordinates → OpenMeteo forecast
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocationService } from '../../src/services/location-service.js';
import { WeatherService } from '../../src/services/weather-service.js';
import { 
  formatMorningForecast, 
  formatNoonForecast, 
  formatEveningForecast,
  formatAlertPost 
} from '../../src/utils/weather-formatters.js';

describe('Weather Flow Integration', () => {
  let locationService;
  let weatherService;
  let mockEnv;
  let mockLogger;

  beforeEach(() => {
    mockEnv = {
      DOMAIN: 'weather.gripe',
      USER_AGENT: 'weather.gripe/test',
      FOLLOWERS: { get: () => null, put: () => {} },
      POSTS: { get: () => null, put: () => {} },
      ALERTS: { get: () => null, put: () => {} }
    };

    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: console.error
    };

    // Mock cache
    global.caches = {
      default: {
        match: () => Promise.resolve(null),
        put: () => Promise.resolve()
      }
    };

    locationService = new LocationService(mockEnv, mockLogger);
    weatherService = new WeatherService(mockEnv, mockLogger);
  });

  describe('Complete Flow Test', () => {
    it('should handle NYC: name → coordinates → forecast', async () => {
      // Step 1: Get coordinates from location name
      const location = await locationService.searchLocation('New York City');
      
      expect(location).toBeDefined();
      expect(location.lat).toBeCloseTo(40.7128, 1);
      expect(location.lon).toBeCloseTo(-74.0060, 1);
      expect(location.displayName).toContain('New York');
      
      console.log('Location found:', location.displayName, `(${location.lat}, ${location.lon})`);

      // Step 2: Get forecast from OpenMeteo
      const forecast = await weatherService.getForecast(location);
      
      expect(forecast).toBeDefined();
      expect(forecast.location).toBeDefined();
      expect(forecast.daily).toBeDefined();
      expect(forecast.daily.length).toBeGreaterThan(0);
      expect(forecast.hourly).toBeDefined();
      
      const firstDay = forecast.daily[0];
      expect(firstDay.date).toBeDefined();
      expect(firstDay.temperatureMax).toBeTypeOf('number');
      expect(firstDay.temperatureMin).toBeTypeOf('number');
      expect(firstDay.weatherCode).toBeTypeOf('number');
      expect(firstDay.description).toBeDefined();
      
      console.log('\nForecast for today:');
      console.log(`${firstDay.date}: ${firstDay.description}`);
      console.log(`High: ${firstDay.temperatureMax}°F, Low: ${firstDay.temperatureMin}°F`);
      
      if (forecast.current) {
        console.log('\nCurrent conditions:');
        console.log(`Temperature: ${forecast.current.temperature}°F`);
        console.log(`Conditions: ${forecast.current.description}`);
        console.log(`Wind: ${forecast.current.windSpeed} mph`);
      }

      // Step 3: Format forecast for posting
      const morningPost = formatMorningForecast(forecast, location);
      expect(morningPost).toContain('Good morning');
      expect(morningPost).toContain(location.displayName);
      expect(morningPost).toContain('#weather');
      
      console.log('\nFormatted morning post:');
      console.log(morningPost);
      console.log('---');

      // Step 4: Check for generated alerts
      const alerts = weatherService.generateWeatherAlerts(forecast);
      
      expect(alerts).toBeDefined();
      expect(Array.isArray(alerts)).toBe(true);
      
      if (alerts.length > 0) {
        console.log(`\nGenerated alerts: ${alerts.length}`);
        const firstAlert = alerts[0];
        console.log(`- ${firstAlert.event} (${firstAlert.severity})`);
        console.log(`  ${firstAlert.headline}`);
        
        const alertPost = formatAlertPost(firstAlert, location);
        console.log('\nFormatted alert post:');
        console.log(alertPost);
      } else {
        console.log('\nNo severe weather conditions detected');
      }
    }, 30000); // 30 second timeout for API calls

    it('should handle location aliases', async () => {
      const location = await locationService.searchLocation('nyc');
      
      expect(location).toBeDefined();
      expect(location.displayName).toContain('New York');
      expect(location.lat).toBeCloseTo(40.7128, 1);
    });

    it('should handle international location (London)', async () => {
      const location = await locationService.searchLocation('London, UK');
      
      expect(location).toBeDefined();
      expect(location.displayName).toContain('London');
      expect(location.countryCode).toBe('GB');
      
      // OpenMeteo supports international locations
      const forecast = await weatherService.getForecast(location);
      expect(forecast).toBeDefined();
      expect(forecast.daily).toBeDefined();
      expect(forecast.daily.length).toBeGreaterThan(0);
      
      console.log('\nLondon forecast:');
      console.log(`${forecast.daily[0].description}, High: ${forecast.daily[0].temperatureMax}°F`);
    }, 30000);

    it('should handle bulk location requests', async () => {
      // Get coordinates for multiple cities
      const nyc = await locationService.searchLocation('New York City');
      const chicago = await locationService.searchLocation('Chicago');
      const la = await locationService.searchLocation('Los Angeles');
      
      // Request bulk forecast
      const forecasts = await weatherService.getForecast([nyc, chicago, la]);
      
      expect(Array.isArray(forecasts)).toBe(true);
      expect(forecasts.length).toBe(3);
      
      forecasts.forEach((forecast, i) => {
        expect(forecast.location).toBeDefined();
        expect(forecast.daily).toBeDefined();
        
        const cityNames = ['New York', 'Chicago', 'Los Angeles'];
        console.log(`\n${cityNames[i]} forecast:`);
        console.log(`${forecast.daily[0].description}, High: ${forecast.daily[0].temperatureMax}°F`);
      });
    }, 30000);

    it('should get current conditions with forecast', async () => {
      const location = await locationService.searchLocation('Chicago');
      const forecast = await weatherService.getForecast(location, { 
        includeCurrent: true,
        forecastDays: 2 
      });
      
      expect(forecast.current).toBeDefined();
      
      if (forecast.current) {
        console.log('\nCurrent conditions in Chicago:');
        console.log(`Temperature: ${forecast.current.temperature}°F`);
        console.log(`Feels like: ${forecast.current.apparentTemperature}°F`);
        console.log(`Conditions: ${forecast.current.description}`);
        console.log(`Humidity: ${forecast.current.humidity}%`);
        console.log(`Wind: ${forecast.current.windSpeed} mph`);
      }
    }, 30000);

    it('should format different forecast types', async () => {
      const location = await locationService.searchLocation('Seattle');
      const forecast = await weatherService.getForecast(location, { 
        includeCurrent: true 
      });
      
      // Test all three forecast formats
      const morning = formatMorningForecast(forecast, location);
      expect(morning).toContain('Good morning');
      
      const noon = formatNoonForecast(forecast, location);
      expect(noon).toContain('Midday update');
      
      const evening = formatEveningForecast(forecast, location);
      expect(evening).toContain('Good evening');
      
      // All should have hashtags
      [morning, noon, evening].forEach(post => {
        expect(post).toContain('#weather');
        expect(post.length).toBeLessThan(500); // Mastodon limit
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid location names', async () => {
      await expect(
        locationService.searchLocation('zzzzinvalidlocationzzz')
      ).rejects.toThrow('Location not found');
    });

    it('should handle coordinates for remote location', async () => {
      // Coordinates for middle of Pacific Ocean
      const lat = 0;
      const lon = -150;
      
      // OpenMeteo should still work for ocean coordinates
      const forecast = await weatherService.getForecast({ lat, lon, displayName: 'Pacific Ocean' });
      expect(forecast).toBeDefined();
      expect(forecast.daily).toBeDefined();
    });
  });

  describe('Location ID Generation', () => {
    it('should generate consistent location IDs', () => {
      const id1 = locationService.getLocationId('New York');
      const id2 = locationService.getLocationId('new york');
      const id3 = locationService.getLocationId('NEW YORK');
      
      expect(id1).toBe('newyork');
      expect(id1).toBe(id2);
      expect(id1).toBe(id3);
    });

    it('should generate location hashtags', async () => {
      const location = await locationService.searchLocation('San Francisco');
      const hashtag = locationService.getLocationHashtag(location);
      
      expect(hashtag).toBe('sanfrancisco');
    });
  });

  describe('Weather Alerts Generation', () => {
    it('should generate alerts for extreme conditions', () => {
      // Mock forecast with extreme conditions
      const extremeForecast = {
        current: {
          weatherCode: 95, // Thunderstorm
          temperature: 85,
          windSpeed: 35,
          description: 'Thunderstorm'
        },
        daily: [
          {
            date: '2024-01-01',
            weatherCode: 75, // Heavy snow
            temperatureMax: 105, // Extreme heat
            temperatureMin: -5, // Extreme cold
            uvIndexMax: 12, // Extreme UV
            description: 'Heavy snow fall'
          }
        ]
      };
      
      const alerts = weatherService.generateWeatherAlerts(extremeForecast);
      
      expect(alerts.length).toBeGreaterThan(0);
      
      // Should have alerts for thunderstorm, heat, cold, UV
      const alertTypes = alerts.map(a => a.event);
      expect(alertTypes).toContain('Thunderstorm');
      expect(alertTypes).toContain('Extreme Heat');
      expect(alertTypes).toContain('Extreme Cold');
      expect(alertTypes).toContain('Extreme UV');
    });
  });
});