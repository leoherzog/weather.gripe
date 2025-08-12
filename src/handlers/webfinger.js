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

  // Verify the domain matches
  if (domain !== env.DOMAIN) {
    throw new NotFoundError('Unknown domain');
  }

  // TODO: Verify the location exists by geocoding it
  // For now, we'll accept any location name

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