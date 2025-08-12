/**
 * Deterministic ID Generation
 * Creates predictable, unique IDs for all ActivityPub objects
 * to prevent duplicates after cache purges
 */

/**
 * Generate deterministic post ID based on content
 * @param {string} locationId - Location identifier (e.g., "newyork")
 * @param {Date} postDate - Date of the post
 * @param {string} postType - Type of post ("forecast-morning", "forecast-noon", "forecast-evening", "alert")
 * @param {string} alertId - For alerts, the NWS alert ID
 * @returns {string} Deterministic post ID
 */
export function generatePostId(locationId, postDate, postType, alertId = null) {
  // Normalize the date to the posting slot
  const date = new Date(postDate);
  
  if (postType === 'alert' && alertId) {
    // For alerts, use the NWS alert ID which is already unique
    // Format: location-alert-nws_id
    return `${locationId}-alert-${alertId.replace(/\./g, '-').toLowerCase()}`;
  }
  
  // For forecasts, round to the nearest posting time
  let hour;
  switch (postType) {
    case 'forecast-morning':
      hour = '07';
      break;
    case 'forecast-noon':
      hour = '12';
      break;
    case 'forecast-evening':
      hour = '19';
      break;
    default:
      hour = date.getUTCHours().toString().padStart(2, '0');
  }
  
  // Format: location-type-YYYYMMDD-HH
  // Example: newyork-forecast-morning-20250812-07
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `${locationId}-${postType}-${dateStr}-${hour}`;
}

/**
 * Generate deterministic actor ID
 * @param {string} locationId - Location identifier
 * @returns {string} Actor ID (just the location ID, always deterministic)
 */
export function generateActorId(locationId) {
  // Actor IDs are simply the normalized location name
  // This ensures the same location always has the same actor
  return locationId.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generate deterministic collection ID
 * @param {string} locationId - Location identifier
 * @param {string} collectionType - Type of collection (outbox, followers, etc.)
 * @param {number} page - Page number for paginated collections
 * @returns {string} Collection ID
 */
export function generateCollectionId(locationId, collectionType, page = null) {
  const actorId = generateActorId(locationId);
  
  if (page !== null) {
    return `${actorId}-${collectionType}-page${page}`;
  }
  
  return `${actorId}-${collectionType}`;
}

/**
 * Generate deterministic activity ID (for Accept, Follow, etc.)
 * @param {string} activityType - Type of activity
 * @param {string} actorId - Actor performing the activity
 * @param {string} objectId - Object of the activity
 * @param {Date} timestamp - When the activity occurred
 * @returns {string} Activity ID
 */
export function generateActivityId(activityType, actorId, objectId, timestamp) {
  // Create a deterministic ID based on the activity details
  // This prevents duplicate Accept activities for the same Follow
  const dateStr = new Date(timestamp).toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = new Date(timestamp).toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
  
  // Simple hash of the object ID to keep the ID shorter
  const objectHash = simpleHash(objectId);
  
  return `${activityType.toLowerCase()}-${actorId}-${objectHash}-${dateStr}-${timeStr}`;
}

/**
 * Generate deterministic Create activity ID for posts
 * @param {string} postId - The post being created
 * @returns {string} Create activity ID
 */
export function generateCreateActivityId(postId) {
  // Create activities have the same ID as their post with -create suffix
  // This ensures idempotency - the same post always has the same Create activity
  return `${postId}-create`;
}

/**
 * Parse a post ID to extract its components
 * @param {string} postId - Post ID to parse
 * @returns {Object} Parsed components
 */
export function parsePostId(postId) {
  const parts = postId.split('-');
  
  if (parts.length < 4) {
    return null;
  }
  
  // Check if it's an alert
  if (parts[1] === 'alert') {
    return {
      locationId: parts[0],
      type: 'alert',
      alertId: parts.slice(2).join('-')
    };
  }
  
  // Otherwise it's a forecast
  return {
    locationId: parts[0],
    type: `${parts[1]}-${parts[2]}`, // e.g., "forecast-morning"
    date: parts[3],
    hour: parts[4]
  };
}

/**
 * Check if a post ID represents a post that should exist at a given time
 * @param {string} postId - Post ID to check
 * @param {Date} currentTime - Current time
 * @returns {boolean} Whether this post should exist
 */
export function shouldPostExist(postId, currentTime = new Date()) {
  const parsed = parsePostId(postId);
  
  if (!parsed) {
    return false;
  }
  
  if (parsed.type === 'alert') {
    // Alerts exist as long as they're active
    // This would need to check against NWS API
    return true;
  }
  
  // For forecasts, check if the post time has passed
  const year = parsed.date.substr(0, 4);
  const month = parsed.date.substr(4, 2);
  const day = parsed.date.substr(6, 2);
  const postTime = new Date(`${year}-${month}-${day}T${parsed.hour}:00:00Z`);
  
  return currentTime >= postTime;
}

/**
 * Simple hash function for creating short hashes
 * @param {string} str - String to hash
 * @returns {string} 8-character hash
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8);
}

/**
 * Get the canonical URL for an ActivityPub object
 * @param {string} domain - Domain name
 * @param {string} objectType - Type of object (post, actor, activity)
 * @param {string} objectId - Object ID
 * @returns {string} Canonical URL
 */
export function getCanonicalUrl(domain, objectType, objectId) {
  switch (objectType) {
    case 'actor':
      return `https://${domain}/locations/${objectId}`;
    case 'post':
      return `https://${domain}/posts/${objectId}`;
    case 'activity':
      return `https://${domain}/activities/${objectId}`;
    case 'collection':
      return `https://${domain}/collections/${objectId}`;
    default:
      return `https://${domain}/objects/${objectId}`;
  }
}

/**
 * Ensure an ID is properly formatted for use in URLs
 * @param {string} id - ID to sanitize
 * @returns {string} URL-safe ID
 */
export function sanitizeId(id) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}