/**
 * Time-related utility functions
 */

/**
 * Calculate local time for a location
 * @param {Object} location - Location object with timezone offset
 * @param {Date} date - Current UTC date
 * @returns {Date} Local time at the location
 */
export function getLocalTime(location, date) {
  // Location should have a timezone offset from geocoding
  // For example: location.timezoneOffset = -5 for EST, -8 for PST
  // If not available, try to estimate from longitude
  
  let offsetHours = 0;
  
  if (location.timezoneOffset !== undefined) {
    offsetHours = location.timezoneOffset;
  } else if (location.lon !== undefined) {
    // Rough estimate: Earth rotates 15 degrees per hour
    // Longitude -180 to +180, so divide by 15 for approximate timezone
    offsetHours = Math.round(location.lon / 15);
  }
  
  // Create a new date with the offset applied
  const localTime = new Date(date.getTime() + (offsetHours * 60 * 60 * 1000));
  return localTime;
}

/**
 * Calculate local hour for a location
 * @param {Object} location - Location object with timezone
 * @param {Date} date - Current date
 * @returns {number} Local hour (0-23)
 */
export function getLocalHour(location, date) {
  const localTime = getLocalTime(location, date);
  return localTime.getHours();
}

/**
 * Check if current time is within posting window
 * @param {Object} location - Location object
 * @param {Date} now - Current date/time
 * @param {number} targetHour - Target hour (7, 12, or 19)
 * @param {number} windowMinutes - Window size in minutes (default 5)
 * @returns {boolean} True if within posting window
 */
export function isWithinPostingWindow(location, now, targetHour, windowMinutes = 5) {
  const localTime = getLocalTime(location, now);
  const hour = localTime.getHours();
  const minute = localTime.getMinutes();
  
  return hour === targetHour && minute < windowMinutes;
}

/**
 * Get timezone offset from longitude (rough estimate)
 * @param {number} longitude - Longitude in degrees
 * @returns {number} Estimated timezone offset in hours
 */
export function estimateTimezoneFromLongitude(longitude) {
  // Earth rotates 15 degrees per hour
  // Longitude -180 to +180, so divide by 15 for approximate timezone
  return Math.round(longitude / 15);
}