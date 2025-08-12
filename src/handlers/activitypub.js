/**
 * ActivityPub protocol handler
 * Handles all ActivityPub endpoints for locations and posts
 */

import { NotFoundError } from '../utils/error-handler.js';

/**
 * Handle ActivityPub requests
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
export async function handleActivityPub(request, env, logger) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Parse the path to determine what's being requested
  const locationMatch = path.match(/^\/locations\/([^\/]+)(\/(.+))?$/);
  const postMatch = path.match(/^\/posts\/([^\/]+)$/);

  if (locationMatch) {
    const [, locationName, , endpoint] = locationMatch;
    return handleLocationRequest(locationName, endpoint, request, env, logger);
  } else if (postMatch) {
    const [, postId] = postMatch;
    return handlePostRequest(postId, request, env, logger);
  }

  throw new NotFoundError('Unknown ActivityPub endpoint');
}

/**
 * Handle location-based ActivityPub requests
 * @param {string} locationName
 * @param {string} endpoint
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function handleLocationRequest(locationName, endpoint, request, env, logger) {
  logger.info('Location request', { locationName, endpoint });

  // Handle different endpoints
  switch (endpoint) {
    case undefined:
    case '':
      // Actor profile
      return getLocationActor(locationName, env, logger);
    
    case 'inbox':
      if (request.method === 'POST') {
        return handleInbox(locationName, request, env, logger);
      }
      return new Response('Method not allowed', { status: 405 });
    
    case 'outbox':
      return getOutbox(locationName, request, env, logger);
    
    case 'followers':
      return getFollowers(locationName, request, env, logger);
    
    case 'following':
      return getFollowing(locationName, env, logger);
    
    case 'alerts':
      return getAlerts(locationName, env, logger);
    
    default:
      throw new NotFoundError('Unknown endpoint');
  }
}

/**
 * Get location actor object
 * @param {string} locationName
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getLocationActor(locationName, env, logger) {
  // Get or generate public key for this actor
  const { DeliveryService } = await import('../services/delivery-service.js');
  const deliveryService = new DeliveryService(env, logger);
  const actorId = `https://${env.DOMAIN}/locations/${locationName}`;
  const publicKey = await deliveryService.getActorPublicKey(actorId);

  const actor = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      {
        'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers',
        'sensitive': 'as:sensitive',
        'movedTo': { '@id': 'as:movedTo', '@type': '@id' },
        'Hashtag': 'as:Hashtag',
        'toot': 'http://joinmastodon.org/ns#',
        'featured': { '@id': 'toot:featured', '@type': '@id' },
        'featuredTags': { '@id': 'toot:featuredTags', '@type': '@id' },
        'discoverable': 'toot:discoverable',
        'indexable': 'toot:indexable',
        'memorial': 'toot:memorial',
        'attributionDomains': { '@id': 'toot:attributionDomains', '@type': '@id' }
      }
    ],
    type: 'Person',
    id: `https://${env.DOMAIN}/locations/${locationName}`,
    preferredUsername: locationName,
    name: `${locationName} Weather`,
    summary: `Automated weather forecasts and severe weather alerts for ${locationName}. Posts at 7am, noon, and 7pm local time.`,
    inbox: `https://${env.DOMAIN}/locations/${locationName}/inbox`,
    outbox: `https://${env.DOMAIN}/locations/${locationName}/outbox`,
    followers: `https://${env.DOMAIN}/locations/${locationName}/followers`,
    following: `https://${env.DOMAIN}/locations/${locationName}/following`,
    featured: `https://${env.DOMAIN}/locations/${locationName}/alerts`,
    url: `https://${env.DOMAIN}/locations/${locationName}`,
    manuallyApprovesFollowers: false,
    discoverable: true,
    published: '2024-01-01T00:00:00Z',
    icon: {
      type: 'Image',
      mediaType: 'image/png',
      url: `https://${env.DOMAIN}/assets/weather-icon.png`
    },
    publicKey: {
      id: `https://${env.DOMAIN}/locations/${locationName}#main-key`,
      owner: `https://${env.DOMAIN}/locations/${locationName}`,
      publicKeyPem: publicKey || '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----'
    }
  };

  return new Response(JSON.stringify(actor), {
    headers: {
      'Content-Type': 'application/activity+json'
    }
  });
}

/**
 * Handle inbox POST requests
 * @param {string} locationName
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function handleInbox(locationName, request, env, logger) {
  try {
    // Verify HTTP signature if present
    const signature = request.headers.get('Signature');
    if (signature) {
      const { verifySignature } = await import('../utils/http-signature.js');
      const isValid = await verifySignature(request, async (keyId) => {
        // Fetch the public key from the actor's profile
        try {
          const actorUrl = keyId.replace('#main-key', '');
          const actorResponse = await fetch(actorUrl, {
            headers: {
              'Accept': 'application/activity+json',
              'User-Agent': env.USER_AGENT || 'weather.gripe/1.0'
            }
          });
          if (actorResponse.ok) {
            const actor = await actorResponse.json();
            return actor.publicKey?.publicKeyPem;
          }
        } catch (error) {
          logger.error('Failed to fetch actor public key', { keyId, error });
        }
        return null;
      });
      
      if (!isValid) {
        logger.warn('Invalid HTTP signature', { locationName, signature });
        // Reject invalid signatures after grace period
        if (env.STRICT_SIGNATURES === 'true') {
          return new Response('Unauthorized: Invalid HTTP signature', { status: 401 });
        }
      }
    }
    
    // Parse the incoming activity
    const activity = await request.json();
    
    logger.info('Inbox activity received', { 
      locationName, 
      type: activity.type,
      actor: activity.actor
    });
    
    // Import delivery service
    const { DeliveryService } = await import('../services/delivery-service.js');
    const deliveryService = new DeliveryService(env, logger);
    
    // Handle different activity types
    switch (activity.type) {
      case 'Follow':
        // Someone wants to follow this location
        await deliveryService.handleFollow(activity, locationName);
        break;
        
      case 'Undo':
        // Check if it's an Undo Follow
        if (activity.object && activity.object.type === 'Follow') {
          await deliveryService.handleUnfollow(activity, locationName);
        }
        break;
        
      case 'Delete':
        // Handle account deletion - remove from followers
        // This is when a remote account is deleted
        const actorId = activity.actor;
        const { CacheService } = await import('../services/cache-service.js');
        const cache = new CacheService(env, logger);
        await cache.removeFollower(locationName, actorId);
        break;
        
      default:
        // Check if it's a valid ActivityStreams type
        const validTypes = ['Create', 'Update', 'Delete', 'Follow', 'Accept', 'Reject', 
                           'Add', 'Remove', 'Like', 'Announce', 'Undo', 'Block', 
                           'Flag', 'Ignore', 'Join', 'Leave', 'Offer', 'Invite',
                           'Question', 'Listen', 'Read', 'Move', 'Travel', 'View'];
        
        if (validTypes.includes(activity.type)) {
          logger.debug('Ignoring valid but unsupported activity type', { type: activity.type });
          // Return 202 for valid but unsupported activities
          return new Response('', { status: 202 });
        } else {
          logger.warn('Unknown activity type', { type: activity.type });
          // Return 400 for completely unknown activity types
          return new Response('Unknown activity type', { status: 400 });
        }
    }
    
    // Return 202 Accepted for processed activities
    return new Response('', { status: 202 });
    
  } catch (error) {
    logger.error('Failed to process inbox activity', { locationName, error });
    
    // Check if it's a JSON parsing error
    if (error instanceof SyntaxError) {
      return new Response('Malformed JSON', { status: 400 });
    }
    
    // Check if required fields are missing
    if (error.message && error.message.includes('Cannot read')) {
      return new Response('Missing required fields', { status: 400 });
    }
    
    return new Response('Bad Request', { status: 400 });
  }
}

/**
 * Get outbox collection
 * @param {string} locationName
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getOutbox(locationName, request, env, logger) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  
  try {
    // Import weather post model
    const { WeatherPost } = await import('../models/weather-post.js');
    
    if (!page) {
      // Return the collection without items (paged)
      const totalItems = await WeatherPost.getPostCount(locationName, env);
      const itemsPerPage = 20;
      const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
      
      const outbox = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'OrderedCollection',
        id: `https://${env.DOMAIN}/locations/${locationName}/outbox`,
        totalItems: totalItems,
        first: `https://${env.DOMAIN}/locations/${locationName}/outbox?page=1`,
        last: `https://${env.DOMAIN}/locations/${locationName}/outbox?page=${totalPages}`
      };
      
      return new Response(JSON.stringify(outbox), {
        headers: {
          'Content-Type': 'application/activity+json'
        }
      });
    }
    
    // Return a page of Create activities
    const pageNumber = parseInt(page, 10);
    const itemsPerPage = 20;
    const offset = (pageNumber - 1) * itemsPerPage;
    
    // Get posts for this page
    const posts = await WeatherPost.getRecentPosts(locationName, env, itemsPerPage, offset);
    
    // Wrap each post in a Create activity
    const activities = posts.map(post => ({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Create',
      id: `${post.id}/activity`,
      actor: `https://${env.DOMAIN}/locations/${locationName}`,
      published: post.published,
      to: post.to || ['https://www.w3.org/ns/activitystreams#Public'],
      cc: post.cc || [`https://${env.DOMAIN}/locations/${locationName}/followers`],
      object: post
    }));
    
    const collectionPage = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollectionPage',
      id: `https://${env.DOMAIN}/locations/${locationName}/outbox?page=${pageNumber}`,
      partOf: `https://${env.DOMAIN}/locations/${locationName}/outbox`,
      orderedItems: activities
    };
    
    // Add prev/next links if applicable
    if (pageNumber > 1) {
      collectionPage.prev = `https://${env.DOMAIN}/locations/${locationName}/outbox?page=${pageNumber - 1}`;
    }
    if (activities.length === itemsPerPage) {
      collectionPage.next = `https://${env.DOMAIN}/locations/${locationName}/outbox?page=${pageNumber + 1}`;
    }
    
    return new Response(JSON.stringify(collectionPage), {
      headers: {
        'Content-Type': 'application/activity+json'
      }
    });
    
  } catch (error) {
    logger.error('Failed to get outbox', { locationName, error });
    
    // Return empty collection on error
    const outbox = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollection',
      id: `https://${env.DOMAIN}/locations/${locationName}/outbox`,
      totalItems: 0,
      first: `https://${env.DOMAIN}/locations/${locationName}/outbox?page=1`,
      last: `https://${env.DOMAIN}/locations/${locationName}/outbox?page=1`
    };
    
    return new Response(JSON.stringify(outbox), {
      headers: {
        'Content-Type': 'application/activity+json'
      }
    });
  }
}

/**
 * Get followers collection
 * @param {string} locationName
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getFollowers(locationName, request, env, logger) {
  // TODO: Implement followers list from KV storage
  const followers = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    id: `https://${env.DOMAIN}/locations/${locationName}/followers`,
    totalItems: 0,
    first: `https://${env.DOMAIN}/locations/${locationName}/followers?page=1`
  };

  return new Response(JSON.stringify(followers), {
    headers: {
      'Content-Type': 'application/activity+json'
    }
  });
}

/**
 * Get following collection (always empty for weather bots)
 * @param {string} locationName
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getFollowing(locationName, env, logger) {
  const following = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    id: `https://${env.DOMAIN}/locations/${locationName}/following`,
    totalItems: 0,
    orderedItems: []
  };

  return new Response(JSON.stringify(following), {
    headers: {
      'Content-Type': 'application/activity+json'
    }
  });
}

/**
 * Get alerts collection (featured/pinned posts)
 * @param {string} locationName
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function getAlerts(locationName, env, logger) {
  // TODO: Implement alerts collection with active weather alerts
  const alerts = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    id: `https://${env.DOMAIN}/locations/${locationName}/alerts`,
    totalItems: 0,
    orderedItems: []
  };

  return new Response(JSON.stringify(alerts), {
    headers: {
      'Content-Type': 'application/activity+json'
    }
  });
}

/**
 * Handle post requests
 * @param {string} postId
 * @param {Request} request
 * @param {Object} env
 * @param {Logger} logger
 * @returns {Response}
 */
async function handlePostRequest(postId, request, env, logger) {
  logger.info('Post request', { postId });

  // TODO: Retrieve post from storage
  throw new NotFoundError('Post not found');
}