/**
 * WebFinger protocol handler
 * Implements WebFinger discovery for ActivityPub actors
 */

import { ValidationError, NotFoundError } from '../utils/error-handler.js';

/**
 * Handle WebFinger requests
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
export async function handleWebFinger(request, env, logger) {
  const url = new URL(request.url);
  const resource = url.searchParams.get('resource');

  logger.info('WebFinger request', { resource });

  if (!resource) {
    throw new ValidationError('Missing resource parameter');
  }

  // Parse the resource to extract the location
  // Expected format: acct:location@weather.gripe
  const match = resource.match(/^acct:([^@]+)@(.+)$/);
  if (!match) {
    throw new ValidationError('Invalid resource format');
  }

  const [, locationName, domain] = match;

  // Get the hostname from the current request
  const requestDomain = new URL(request.url).hostname;
  
  // Accept the configured domain and the actual request domain
  const acceptedDomains = [
    env.DOMAIN.toLowerCase(),
    requestDomain.toLowerCase()
  ];
  
  if (!acceptedDomains.includes(domain.toLowerCase())) {
    throw new NotFoundError('Unknown domain');
  }

  // Verify the location exists by geocoding it
  try {
    const { LocationService } = await import('../services/location-service.js');
    const locationService = new LocationService(env, logger);
    await locationService.searchLocation(locationName);
  } catch (error) {
    logger.warn('Location verification failed', { location: locationName, error });
    // Continue anyway - allow discovery even if geocoding fails
  }

  // Return WebFinger response
  const response = {
    subject: resource,
    aliases: [
      `https://${env.DOMAIN}/locations/${locationName}`
    ],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `https://${env.DOMAIN}/locations/${locationName}`
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${env.DOMAIN}/locations/${locationName}`
      }
    ]
  };

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/jrd+json'
    }
  });
}