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
  // TODO: Implement - for now return empty
  // This would list all locations that have at least one follower
  return [];
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
      // TODO: Fetch current alerts from NWS API
      const alerts = []; // await weatherService.getAlerts(location.lat, location.lon);
      
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
          // TODO: Fetch weather forecast from NWS
          const forecast = null; // await weatherService.getForecast(location.lat, location.lon);
          
          if (forecast) {
            // Format forecast content based on type
            const content = formatForecastContent(forecast, postType, location);
            
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
function formatForecastContent(forecast, postType, location) {
  // TODO: Implement proper forecast formatting
  // This should use the ported weather formatting functions
  return `Weather forecast for ${location.name}: ${postType}`;
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