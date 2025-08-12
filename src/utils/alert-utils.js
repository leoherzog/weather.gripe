/**
 * Alert-related utility functions
 */

/**
 * Format alert content for posting
 * @param {Object} alert - Weather alert object
 * @param {Object} location - Location object
 * @returns {string} Formatted alert content
 */
export function formatAlertContent(alert, location) {
  const emoji = getAlertEmoji(alert.severity || alert.event);
  const article = getArticle(alert.event);
  
  let content = `${emoji} ${location.name || location.displayName} is now under ${article} ${alert.event}.`;
  
  if (alert.headline) {
    content += ` ${alert.headline}`;
  }
  
  if (alert.description && alert.description.length < 200) {
    content += `\n\n${alert.description}`;
  }
  
  return content;
}

/**
 * Get appropriate emoji for alert severity
 * @param {string} severityOrEvent - Alert severity level or event type
 * @returns {string} Emoji
 */
export function getAlertEmoji(severityOrEvent) {
  const text = (severityOrEvent || '').toLowerCase();
  
  if (text.includes('tornado')) return '🌪️';
  if (text.includes('hurricane') || text.includes('typhoon')) return '🌀';
  if (text.includes('flood')) return '🌊';
  if (text.includes('fire')) return '🔥';
  if (text.includes('blizzard') || text.includes('snow')) return '❄️';
  if (text.includes('thunder') || text.includes('storm')) return '⛈️';
  if (text.includes('extreme') || text.includes('severe')) return '🚨';
  if (text.includes('warning')) return '⚠️';
  if (text.includes('watch')) return '👁️';
  
  return '⚠️'; // Default warning emoji
}

/**
 * Get correct article ('a' or 'an') for a word
 * @param {string} word - The word to check
 * @returns {string} 'a' or 'an'
 */
export function getArticle(word) {
  if (!word) return 'a';
  
  // Check if first letter is a vowel
  const firstLetter = word[0].toLowerCase();
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  
  // Special cases for words that sound like they start with vowels
  const specialCases = {
    'hour': 'an',
    'honor': 'an',
    'honest': 'an',
    'heir': 'an',
    'one': 'a',
    'once': 'a',
    'unicorn': 'a',
    'uniform': 'a',
    'university': 'a',
    'european': 'a'
  };
  
  const wordLower = word.toLowerCase();
  for (const [special, article] of Object.entries(specialCases)) {
    if (wordLower.startsWith(special)) {
      return article;
    }
  }
  
  return vowels.includes(firstLetter) ? 'an' : 'a';
}

/**
 * Check if alert is considered severe
 * @param {Object} alert - Alert object
 * @returns {boolean} True if severe
 */
export function isAlertSevere(alert) {
  const severeKeywords = [
    'extreme', 'severe', 'tornado', 'hurricane', 'typhoon',
    'blizzard', 'emergency', 'danger', 'evacuation'
  ];
  
  const text = `${alert.severity || ''} ${alert.event || ''} ${alert.urgency || ''}`.toLowerCase();
  
  return severeKeywords.some(keyword => text.includes(keyword));
}

/**
 * Generate alert post ID
 * @param {string} locationId - Location identifier
 * @param {string} alertId - Alert identifier
 * @returns {string} Deterministic alert post ID
 */
export function generateAlertPostId(locationId, alertId) {
  // Create deterministic ID that won't change if we regenerate the same alert
  const cleanAlertId = alertId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${locationId}-alert-${cleanAlertId}`;
}