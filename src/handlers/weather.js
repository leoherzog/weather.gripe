/**
 * Weather API handler
 * Provides weather data endpoints for debugging and admin purposes
 */

import { ValidationError, NotFoundError } from '../utils/error-handler.js';

/**
 * Handle weather API requests
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
export async function handleWeather(request, env, logger) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Parse the API path
  const match = path.match(/^\/api\/weather\/([^\/]+)$/);
  if (!match) {
    throw new NotFoundError('Unknown weather API endpoint');
  }

  const [, endpoint] = match;
  const location = url.searchParams.get('location');

  if (!location) {
    throw new ValidationError('Missing location parameter');
  }

  logger.info('Weather API request', { endpoint, location });

  switch (endpoint) {
    case 'forecast':
      return getForecast(location, env, logger);
    
    case 'current':
      return getCurrentConditions(location, env, logger);
    
    case 'alerts':
      return getAlerts(location, env, logger);
    
    case 'geocode':
      return geocodeLocation(location, env, logger);
    
    default:
      throw new NotFoundError('Unknown weather endpoint');
  }
}

/**
 * Get weather forecast for a location
 * @param {string} location
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getForecast(location, env, logger) {
  const { LocationService } = await import('../services/location-service.js');
  const { WeatherService } = await import('../services/weather-service.js');
  
  const locationService = new LocationService(env, logger);
  const weatherService = new WeatherService(env, logger);
  
  // Geocode the location
  const locationData = await locationService.searchLocation(location);
  
  // Get forecast
  const forecast = await weatherService.getForecast(locationData, {
    forecastDays: 2,
    includeCurrent: true
  });
  
  return new Response(JSON.stringify({
    location: locationData.displayName || location,
    coordinates: {
      lat: locationData.lat,
      lon: locationData.lon
    },
    forecast
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get current weather conditions
 * @param {string} location
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getCurrentConditions(location, env, logger) {
  const { LocationService } = await import('../services/location-service.js');
  const { WeatherService } = await import('../services/weather-service.js');
  
  const locationService = new LocationService(env, logger);
  const weatherService = new WeatherService(env, logger);
  
  // Geocode the location
  const locationData = await locationService.searchLocation(location);
  
  // Get forecast with current conditions
  const forecast = await weatherService.getForecast(locationData, {
    forecastDays: 1,
    includeCurrent: true
  });
  
  return new Response(JSON.stringify({
    location: locationData.displayName || location,
    coordinates: {
      lat: locationData.lat,
      lon: locationData.lon
    },
    current: forecast.current || {}
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get weather alerts for a location
 * @param {string} location
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getAlerts(location, env, logger) {
  const { LocationService } = await import('../services/location-service.js');
  const { WeatherService } = await import('../services/weather-service.js');
  
  const locationService = new LocationService(env, logger);
  const weatherService = new WeatherService(env, logger);
  
  // Geocode the location
  const locationData = await locationService.searchLocation(location);
  
  // Get forecast to check for severe conditions
  const forecast = await weatherService.getForecast(locationData, {
    forecastDays: 2,
    includeCurrent: true
  });
  
  // Generate alerts from severe weather conditions
  // OpenMeteo doesn't have dedicated alerts, so we generate from weather codes
  const alerts = [];
  
  if (forecast.current) {
    const code = forecast.current.weatherCode;
    // Check for severe weather codes
    if (code >= 95 && code <= 99) { // Thunderstorms
      alerts.push({
        event: 'Thunderstorm Warning',
        severity: 'Severe',
        urgency: 'Immediate',
        description: 'Severe thunderstorms are occurring or imminent',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 3600000).toISOString() // 1 hour
      });
    }
    // Check for extreme temperatures (Fahrenheit - as returned by API)
    if (forecast.current.temperature > 100) { // >100°F
      alerts.push({
        event: 'Excessive Heat Warning',
        severity: 'Extreme',
        urgency: 'Expected',
        description: `Extreme heat with temperatures reaching ${Math.round(forecast.current.temperature)}°F`,
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 7200000).toISOString() // 2 hours
      });
    }
    if (forecast.current.temperature < 0) { // <0°F
      alerts.push({
        event: 'Extreme Cold Warning',
        severity: 'Extreme',
        urgency: 'Expected',
        description: `Extreme cold with temperatures reaching ${Math.round(forecast.current.temperature)}°F`,
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 7200000).toISOString() // 2 hours
      });
    }
  }
  
  return new Response(JSON.stringify({
    location: locationData.displayName || location,
    coordinates: {
      lat: locationData.lat,
      lon: locationData.lon
    },
    alerts
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Geocode a location name to coordinates
 * @param {string} location
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function geocodeLocation(location, env, logger) {
  const { LocationService } = await import('../services/location-service.js');
  
  const locationService = new LocationService(env, logger);
  
  // Geocode the location
  const locationData = await locationService.searchLocation(location);
  
  return new Response(JSON.stringify({
    location: locationData.displayName || location,
    coordinates: {
      lat: locationData.lat,
      lon: locationData.lon
    },
    metadata: {
      country: locationData.country,
      state: locationData.state,
      city: locationData.city,
      type: locationData.type,
      importance: locationData.importance
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}