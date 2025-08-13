/**
 * Weather.gripe - ActivityPub Weather Service
 * Main Cloudflare Worker entry point
 */

import { handleWebFinger } from './handlers/webfinger.js';
import { handleActivityPub } from './handlers/activitypub.js';
import { handleWeather } from './handlers/weather.js';
import { ErrorHandler } from './utils/error-handler.js';
import { Logger } from './utils/logger.js';
import { getLocalTime, getLocalHour, isWithinPostingWindow } from './utils/time-utils.js';
import { formatAlertContent } from './utils/alert-utils.js';

// Helper functions moved outside the export

/**
 * Get list of locations with active followers
 * @param {Object} env - Environment
 * @param {Object} logger - Logger instance
 * @returns {Promise<Array>} Active locations
 */
async function getActiveLocations(env, logger) {
  // Get all locations with followers from KV storage
  const locations = [];
  
  if (!env.FOLLOWERS) {
    logger.warn('FOLLOWERS KV namespace not available');
    return [];
  }
  
  try {
    // List all keys in the FOLLOWERS namespace
    const list = await env.FOLLOWERS.list({ prefix: 'followers:' });
    
    for (const key of list.keys) {
      // Extract location ID from key (format: followers:{locationId})
      const locationId = key.name.replace('followers:', '');
      
      // Get follower list to check if not empty
      const followersData = await env.FOLLOWERS.get(key.name);
      if (followersData) {
        const followers = JSON.parse(followersData);
        if (followers.length > 0) {
          locations.push({
            id: locationId,
            name: locationId, // Will be enhanced with geocoding later
            followers: followers.length
          });
        }
      }
    }
    
    logger.info('Active locations found', { count: locations.length });
    return locations;
  } catch (error) {
    logger.error('Failed to get active locations', { error });
    return [];
  }
}


/**
 * Check and post severe weather alerts
 * @param {Array} locations - Active locations to check
 * @param {Object} env - Environment
 * @param {Object} deliveryService - Delivery service instance
 * @param {Object} logger - Logger instance
 */
async function checkAndPostAlerts(locations, env, deliveryService, logger) {
  const { WeatherPost } = await import('./models/weather-post.js');
  const alertsPosted = [];
  
  for (const location of locations) {
    try {
      // Fetch current alerts (generated from severe weather conditions)
      const { WeatherService } = await import('./services/weather-service.js');
      const weatherService = new WeatherService(env, logger);
      
      // Get forecast to check for severe conditions
      const forecast = await weatherService.getForecast(location, {
        forecastDays: 1,
        includeCurrent: true
      });
      
      const alerts = generateAlertsFromForecast(forecast, location);
      
      for (const alert of alerts) {
        // Check if we've already posted this alert
        const alertKey = `alerts:${location.id}:${alert.id}`;
        const alreadyPosted = await env.ALERTS.get(alertKey);
        
        if (!alreadyPosted) {
          // Create alert post
          const alertContent = formatAlertContent(alert, location);
          const post = WeatherPost.createAlertPost({
            locationId: location.id,
            locationName: location.name,
            alert,
            content: alertContent,
            domain: env.DOMAIN
          });
          
          // Store the post
          await WeatherPost.store(post, env);
          
          // Mark alert as posted (with expiration)
          const ttl = Math.floor((new Date(alert.expires) - new Date()) / 1000);
          await env.ALERTS.put(alertKey, JSON.stringify({
            postedAt: new Date().toISOString(),
            postId: post._metadata.postId
          }), { expirationTtl: ttl });
          
          // Deliver to followers immediately
          await deliveryService.deliverPostToFollowers(location.id, post);
          
          alertsPosted.push({ location: location.id, alert: alert.id });
          logger.info('Posted severe weather alert', { 
            locationId: location.id,
            alertId: alert.id,
            event: alert.event
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check alerts for location', { 
        location: location.id, 
        error 
      });
    }
  }
  
  if (alertsPosted.length > 0) {
    logger.info('Severe weather alerts posted', { count: alertsPosted.length });
  }
}

/**
 * Check and post scheduled forecasts
 * Runs every 5 minutes to catch locations as they hit 7am, noon, or 7pm local time
 * @param {Array} locations - Active locations to check
 * @param {Date} now - Current time
 * @param {Object} env - Environment
 * @param {Object} deliveryService - Delivery service instance
 * @param {Object} logger - Logger instance
 */
async function checkAndPostForecasts(locations, now, env, deliveryService, logger) {
  const { WeatherPost } = await import('./models/weather-post.js');
  const { generatePostId } = await import('./utils/id-generator.js');
  
  const currentMinute = now.getMinutes();
  const forecastsPosted = [];
  
  // Only check during the first 5 minutes of each hour for efficiency
  if (currentMinute >= 5) {
    return;
  }
  
  for (const location of locations) {
    try {
      // Calculate local time for this location
      const localTime = getLocalTime(location, now);
      const localHour = localTime.getHours();
      const localMinute = localTime.getMinutes();
      
      // Check if we're in a posting window (first 5 minutes of 7am, noon, or 7pm)
      if (localMinute < 5 && [7, 12, 19].includes(localHour)) {
        // Determine post type based on hour
        let postType;
        if (localHour === 7) postType = 'forecast-morning';
        else if (localHour === 12) postType = 'forecast-noon';
        else postType = 'forecast-evening';
        
        // Generate deterministic post ID
        const postId = generatePostId(location.id, localTime, postType);
        
        // Check if this post already exists
        const exists = await WeatherPost.exists(postId, env);
        
        if (!exists) {
          // Fetch weather forecast
          const { WeatherService } = await import('./services/weather-service.js');
          const weatherService = new WeatherService(env, logger);
          
          const forecast = await weatherService.getForecast(location, {
            forecastDays: 2,
            includeCurrent: true
          });
          
          if (forecast) {
            // Format forecast content based on type
            const content = await formatForecastContent(forecast, postType, location);
            
            // Create the post
            const post = WeatherPost.createForecastPost({
              locationId: location.id,
              locationName: location.name,
              postTime: localTime,
              postType,
              content,
              hashtags: ['weather', location.hashtag],
              domain: env.DOMAIN
            });
            
            // Store the post
            await WeatherPost.store(post, env);
            
            // Deliver to followers
            await deliveryService.deliverPostToFollowers(location.id, post);
            
            forecastsPosted.push({ 
              location: location.id, 
              postType, 
              localTime: localTime.toISOString() 
            });
            
            logger.info('Posted scheduled forecast', { 
              locationId: location.id,
              postType,
              localTime: `${localHour}:${localMinute}`
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check forecasts for location', { 
        location: location.id, 
        error 
      });
    }
  }
  
  if (forecastsPosted.length > 0) {
    logger.info('Scheduled forecasts posted', { count: forecastsPosted.length });
  }
}

/**
 * Format forecast content based on type
 * @param {Object} forecast - Weather forecast data
 * @param {string} postType - Type of post
 * @param {Object} location - Location object
 * @returns {string} Formatted content
 */
async function formatForecastContent(forecast, postType, location) {
  const { formatMorningForecast, formatNoonForecast, formatEveningForecast } = 
    await import('./utils/weather-formatters.js');
  
  switch (postType) {
    case 'forecast-morning':
      return formatMorningForecast(forecast, location);
    case 'forecast-noon':
      return formatNoonForecast(forecast, location);
    case 'forecast-evening':
      return formatEveningForecast(forecast, location);
    default:
      return `Weather update for ${location.name}`;
  }
}

/**
 * Generate alerts from weather forecast data
 * @param {Object} forecast - Weather forecast data
 * @param {Object} location - Location object
 * @returns {Array} Array of alert objects
 */
function generateAlertsFromForecast(forecast, location) {
  const alerts = [];
  
  if (!forecast || !forecast.current) {
    return alerts;
  }
  
  const code = forecast.current.weatherCode;
  const temp = forecast.current.temperature;
  
  // Check for severe weather codes
  if (code >= 95 && code <= 99) { // Thunderstorms
    alerts.push({
      id: `thunderstorm-${location.id}-${Date.now()}`,
      event: 'Thunderstorm Warning',
      severity: 'Severe',
      urgency: 'Immediate',
      headline: 'Severe Thunderstorm Warning',
      description: 'Severe thunderstorms are occurring or imminent in your area.',
      effective: new Date().toISOString(),
      expires: new Date(Date.now() + 3600000).toISOString() // 1 hour
    });
  }
  
  // Check for heavy snow
  if ((code >= 73 && code <= 77) || (code >= 85 && code <= 86)) {
    alerts.push({
      id: `snow-${location.id}-${Date.now()}`,
      event: 'Winter Storm Warning',
      severity: 'Severe',
      urgency: 'Expected',
      headline: 'Winter Storm Warning',
      description: 'Heavy snow is expected or occurring.',
      effective: new Date().toISOString(),
      expires: new Date(Date.now() + 7200000).toISOString() // 2 hours
    });
  }
  
  // Check for extreme temperatures (Celsius)
  if (temp > 37.8) { // >100°F
    alerts.push({
      id: `heat-${location.id}-${Date.now()}`,
      event: 'Excessive Heat Warning',
      severity: 'Extreme',
      urgency: 'Expected',
      headline: 'Excessive Heat Warning',
      description: `Dangerously hot conditions with temperatures reaching ${Math.round(temp * 1.8 + 32)}°F.`,
      effective: new Date().toISOString(),
      expires: new Date(Date.now() + 7200000).toISOString() // 2 hours
    });
  }
  
  if (temp < -17.8) { // <0°F
    alerts.push({
      id: `cold-${location.id}-${Date.now()}`,
      event: 'Extreme Cold Warning',
      severity: 'Extreme',
      urgency: 'Expected',
      headline: 'Extreme Cold Warning',
      description: `Dangerously cold conditions with temperatures dropping to ${Math.round(temp * 1.8 + 32)}°F.`,
      effective: new Date().toISOString(),
      expires: new Date(Date.now() + 7200000).toISOString() // 2 hours
    });
  }
  
  // Check for high UV index in daily forecast
  if (forecast.daily && forecast.daily.length > 0) {
    const todayUV = forecast.daily[0].uvIndexMax;
    if (todayUV >= 11) {
      alerts.push({
        id: `uv-${location.id}-${Date.now()}`,
        event: 'UV Index Alert',
        severity: 'Moderate',
        urgency: 'Expected',
        headline: 'Extreme UV Index',
        description: `UV index reaching extreme levels (${todayUV}). Avoid sun exposure during midday hours.`,
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 14400000).toISOString() // 4 hours
      });
    }
  }
  
  return alerts;
}

// Main export for Cloudflare Worker
const workerHandler = {
  /**
   * Main request handler
   * @param {Request} request
   * @param {Object} env - Environment bindings (KV namespaces, vars, etc.)
   * @param {Object} ctx - Execution context
   */
  async fetch(request, env, ctx) {
    const logger = new Logger(env.ENVIRONMENT || 'production');
    
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      
      // Log incoming request
      logger.info(`${request.method} ${path}`, {
        headers: Object.fromEntries(request.headers),
        ip: request.headers.get('CF-Connecting-IP'),
      });

      // CORS headers for ActivityPub
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Date, Signature, Digest',
        'Access-Control-Expose-Headers': 'Link, Location'
      };

      // Handle OPTIONS requests
      if (request.method === 'OPTIONS') {
        return new Response(null, { 
          status: 204,
          headers: corsHeaders 
        });
      }

      // Content negotiation for ActivityPub vs HTML
      const acceptHeader = request.headers.get('Accept') || '';
      const wantsActivityPub = acceptHeader.includes('application/activity+json') ||
                               acceptHeader.includes('application/ld+json') ||
                               acceptHeader.includes('application/json');
      
      // Route handling
      let response;

      // WebFinger endpoint
      if (path === '/.well-known/webfinger') {
        response = await handleWebFinger(request, env, logger);
      }
      // NodeInfo endpoints
      else if (path === '/.well-known/nodeinfo') {
        response = new Response(JSON.stringify({
          links: [{
            rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
            href: `https://${env.DOMAIN}/nodeinfo/2.0`
          }]
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      else if (path === '/nodeinfo/2.0') {
        response = new Response(JSON.stringify({
          version: '2.0',
          software: {
            name: 'weather.gripe',
            version: '1.0.0'
          },
          protocols: ['activitypub'],
          services: {
            outbound: [],
            inbound: []
          },
          usage: {
            users: {
              total: 1000,
              activeMonth: 100,
              activeHalfyear: 500
            },
            localPosts: 10000
          },
          openRegistrations: false,
          metadata: {
            nodeName: 'Weather.gripe',
            nodeDescription: 'ActivityPub-powered weather forecasts and severe weather alerts'
          }
        }), {
          headers: { 'Content-Type': 'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.0#"' }
        });
      }
      // Host-meta endpoint
      else if (path === '/.well-known/host-meta') {
        response = new Response(`<?xml version="1.0" encoding="UTF-8"?>
<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
  <Link rel="lrdd" type="application/xrd+xml" template="https://${env.DOMAIN}/.well-known/webfinger?resource={uri}"/>
</XRD>`, {
          headers: { 'Content-Type': 'application/xrd+xml' }
        });
      }
      // ActivityPub endpoints
      else if (path.startsWith('/locations/')) {
        // Check if client wants ActivityPub or HTML
        if (wantsActivityPub || path.includes('/inbox') || path.includes('/outbox') || 
            path.includes('/followers') || path.includes('/following') || path.includes('/alerts')) {
          response = await handleActivityPub(request, env, logger);
        } else {
          // Return HTML representation of the location
          const locationName = path.split('/')[2];
          response = new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${locationName} Weather - Weather.gripe</title>
              <meta charset="utf-8">
              <link rel="alternate" type="application/activity+json" href="https://${env.DOMAIN}/locations/${locationName}">
            </head>
            <body>
              <h1>${locationName} Weather</h1>
              <p>Follow <code>@${locationName}@weather.gripe</code> on Mastodon for weather updates.</p>
              <p><a href="https://${env.DOMAIN}/locations/${locationName}/outbox">View recent posts</a></p>
            </body>
            </html>
          `, {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      }
      // Individual post retrieval
      else if (path.startsWith('/posts/')) {
        const postId = path.split('/').pop();
        const post = await env.POSTS.get(`post:${postId}`, 'json');
        
        if (post) {
          response = new Response(JSON.stringify(post), {
            headers: { 'Content-Type': 'application/activity+json' }
          });
        } else {
          response = new Response('Post not found', { status: 404 });
        }
      }
      // Weather API endpoints
      else if (path.startsWith('/api/weather/')) {
        response = await handleWeather(request, env, logger);
      }
      // Health check
      else if (path === '/health') {
        response = new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT || 'production'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Home page
      else if (path === '/') {
        response = new Response(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Weather.gripe - ActivityPub Weather Service</title>
            <meta charset="utf-8">
            <style>
              body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
              h1 { color: #333; }
              .example { background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0; }
              code { background: #e5e5e5; padding: 2px 5px; border-radius: 3px; }
            </style>
          </head>
          <body>
            <h1>🌦️ Weather.gripe</h1>
            <p>ActivityPub-powered weather forecasts and severe weather alerts.</p>
            <h2>How to Follow</h2>
            <p>Search for a location in your Mastodon instance:</p>
            <div class="example">
              <code>@newyork@weather.gripe</code><br>
              <code>@nyc@weather.gripe</code><br>
              <code>@paris@weather.gripe</code>
            </div>
            <p>You'll receive:</p>
            <ul>
              <li>📅 Daily forecasts at 7am, noon, and 7pm local time</li>
              <li>⚠️ Severe weather alerts as they're issued</li>
              <li>🌡️ Temperature trends and weather conditions</li>
            </ul>
            <h2>API Status</h2>
            <p><a href="/health">Health Check</a></p>
          </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      // 404 for unknown routes
      else {
        response = new Response('Not Found', { status: 404 });
      }

      // Add CORS headers to response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      // Log response
      logger.info(`Response: ${response.status}`);

      return response;
    } catch (error) {
      // Handle errors
      logger.error('Request failed', error);
      return ErrorHandler.handleError(error, logger);
    }
  },

  /**
   * Scheduled cron handler for posting weather updates and checking alerts
   * Runs every 5 minutes for alerts, handles forecasts at appropriate times
   * @param {Object} event - Scheduled event
   * @param {Object} env - Environment bindings
   * @param {Object} ctx - Execution context
   */
  async scheduled(event, env, ctx) {
    const logger = new Logger(env.ENVIRONMENT || 'production');
    
    try {
      const startTime = Date.now();
      logger.info('Scheduled cron triggered', { 
        cron: event.cron,
        timestamp: event.scheduledTime 
      });

      // Import services
      const { DeliveryService } = await import('./services/delivery-service.js');
      const { WeatherPost } = await import('./models/weather-post.js');
      const { generatePostId } = await import('./utils/id-generator.js');
      
      const deliveryService = new DeliveryService(env, logger);
      
      // Get current time
      const now = new Date();
      const currentMinute = now.getMinutes();
      const currentHour = now.getUTCHours();
      
      // Get all active locations (with followers)
      const locations = await getActiveLocations(env, logger);
      
      if (locations.length === 0) {
        logger.info('No active locations to check');
        return;
      }
      
      // ALWAYS check for severe weather alerts (every 5 minutes)
      await checkAndPostAlerts(locations, env, deliveryService, logger);
      
      // ALWAYS check for forecast posts (every 5 minutes)
      // Each location gets checked to see if it's at a posting time in its local timezone
      await checkAndPostForecasts(locations, now, env, deliveryService, logger);
      
      const duration = Date.now() - startTime;
      logger.info('Scheduled cron completed', { 
        duration,
        locationsChecked: locations.length
      });
    } catch (error) {
      logger.error('Scheduled cron failed', error);
    }
  }
};

// Export for Cloudflare Worker
export default workerHandler;

// Export helper functions for testing
export const handleRequest = workerHandler.fetch;
export const scheduled = workerHandler.scheduled;

export {
  formatAlertContent,
  getActiveLocations,
  getLocalTime,
  getLocalHour,
  checkAndPostAlerts,
  checkAndPostForecasts,
  formatForecastContent
};