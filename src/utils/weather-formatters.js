/**
 * Weather Formatting Utilities
 * Converts weather data into human-readable text with emojis
 */

/**
 * Map WMO weather codes to emoji
 * @param {number} weatherCode - WMO weather code (0-99)
 * @param {boolean} isDay - Whether it's daytime
 * @returns {string} Weather emoji
 */
export function getWeatherEmoji(weatherCode, isDay = true) {
  // Map WMO codes to emojis
  const emojiMap = {
    0: isDay ? '☀️' : '🌙',  // Clear sky
    1: isDay ? '🌤️' : '🌙',  // Mainly clear
    2: '⛅',                  // Partly cloudy
    3: '☁️',                  // Overcast
    45: '🌫️',                 // Fog
    48: '🌫️',                 // Rime fog
    51: '🌦️',                 // Light drizzle
    53: '🌦️',                 // Moderate drizzle
    55: '🌧️',                 // Dense drizzle
    56: '🌨️',                 // Freezing drizzle
    57: '🌨️',                 // Dense freezing drizzle
    61: '🌦️',                 // Slight rain
    63: '🌧️',                 // Moderate rain
    65: '🌧️',                 // Heavy rain
    66: '🌨️',                 // Freezing rain
    67: '🌨️',                 // Heavy freezing rain
    71: '🌨️',                 // Slight snow
    73: '❄️',                  // Moderate snow
    75: '❄️',                  // Heavy snow
    77: '🌨️',                 // Snow grains
    80: '🌦️',                 // Slight rain showers
    81: '🌧️',                 // Moderate rain showers
    82: '⛈️',                  // Violent rain showers
    85: '🌨️',                 // Snow showers
    86: '❄️',                  // Heavy snow showers
    95: '⛈️',                  // Thunderstorm
    96: '⛈️',                  // Thunderstorm with hail
    99: '⛈️'                   // Thunderstorm with heavy hail
  };
  
  return emojiMap[weatherCode] || '🌡️';
}

/**
 * Format temperature with trend indicator
 * @param {number} temp - Temperature value
 * @param {string} trend - Temperature trend (rising, falling, null)
 * @param {string} unit - Temperature unit (F or C)
 * @returns {string} Formatted temperature
 */
export function formatTemperature(temp, trend = null, unit = 'F') {
  if (temp === null || temp === undefined) return '';
  
  let trendEmoji = '';
  if (trend === 'rising') trendEmoji = '↗️';
  else if (trend === 'falling') trendEmoji = '↘️';
  
  return `${Math.round(temp)}°${unit}${trendEmoji}`;
}

/**
 * Format wind information
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} windDirection - Wind direction in degrees
 * @returns {string} Formatted wind string
 */
export function formatWind(windSpeed, windDirection) {
  if (!windSpeed || windSpeed === 0) return '';
  
  // Add wind emoji for strong winds
  let windEmoji = '';
  if (windSpeed >= 25) windEmoji = '💨 ';
  
  // Convert direction degrees to compass direction
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                     'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(windDirection / 22.5) % 16;
  const compassDir = directions[index];
  
  return `${windEmoji}Wind: ${compassDir} ${Math.round(windSpeed)} mph`;
}

/**
 * Format a forecast period into a nice string for posting
 * @param {Object} period - Forecast period from OpenMeteo
 * @param {Object} options - Formatting options
 * @returns {string} Formatted forecast text
 */
export function formatForecastPeriod(period, options = {}) {
  const {
    includeWind = true,
    includeDetails = false,
    includePrecipitation = true
  } = options;
  
  const emoji = getWeatherEmoji(period.weatherCode, period.isDay);
  const temp = period.temperature !== undefined 
    ? formatTemperature(period.temperature)
    : `High ${formatTemperature(period.temperatureMax)}, Low ${formatTemperature(period.temperatureMin)}`;
  
  let result = `${emoji} ${period.name || 'Forecast'}: ${period.description}`;
  
  if (temp) {
    result += `, ${temp}`;
  }
  
  if (includeWind && period.windSpeed && period.windSpeed > 0) {
    const wind = formatWind(period.windSpeed, period.windDirection);
    if (wind) result += `. ${wind}`;
  }
  
  if (includePrecipitation && period.precipitationProbability > 0) {
    result += ` (${period.precipitationProbability}% chance)`;
  }
  
  return result;
}

/**
 * Format morning forecast post (7am) using OpenMeteo data
 * @param {Object} forecast - Forecast data from weather service
 * @param {Object} location - Location object
 * @returns {string} Formatted morning post
 */
export function formatMorningForecast(forecast, location) {
  const { daily = [], hourly = [] } = forecast;
  
  // Get today and tomorrow from daily forecast
  const today = daily[0];
  const tomorrow = daily[1];
  
  // Find evening hours for tonight (6pm-midnight)
  const now = new Date();
  const eveningHours = hourly.filter(h => {
    const hour = new Date(h.time).getHours();
    return hour >= 18 && hour <= 23;
  }).slice(0, 1); // Just get one representative evening hour
  
  let post = `Good morning, ${location.displayName}! ☀️\n\n`;
  
  if (today) {
    const todayEmoji = getWeatherEmoji(today.weatherCode, true);
    post += `${todayEmoji} Today: ${today.description}\n`;
    post += `High ${formatTemperature(today.temperatureMax)}, Low ${formatTemperature(today.temperatureMin)}`;
    
    if (today.windSpeedMax > 5) {
      post += `. Wind up to ${Math.round(today.windSpeedMax)} mph`;
    }
    
    if (today.precipitationProbabilityMax > 20) {
      post += ` (${today.precipitationProbabilityMax}% chance of precipitation)`;
    }
    
    post += '\n\n';
  }
  
  if (eveningHours.length > 0) {
    const tonight = eveningHours[0];
    const tonightEmoji = getWeatherEmoji(tonight.weatherCode, false);
    post += `${tonightEmoji} Tonight: ${tonight.description}, ${formatTemperature(tonight.temperature)}\n\n`;
  }
  
  if (tomorrow) {
    const tomorrowEmoji = getWeatherEmoji(tomorrow.weatherCode, true);
    post += `Tomorrow: ${tomorrow.description}, High ${formatTemperature(tomorrow.temperatureMax)}`;
  }
  
  post += '\n\n#weather';
  if (location.city) {
    const hashtag = location.city.toLowerCase().replace(/[^a-z0-9]/g, '');
    post += ` #${hashtag}`;
  }
  
  return post.trim();
}

/**
 * Format noon forecast post using OpenMeteo data
 * @param {Object} forecast - Forecast data
 * @param {Object} location - Location object
 * @returns {string} Formatted noon post
 */
export function formatNoonForecast(forecast, location) {
  const { current, daily = [], hourly = [] } = forecast;
  
  // Get rest of today and tonight
  const today = daily[0];
  
  // Find evening hours
  const now = new Date();
  const afternoonHours = hourly.filter(h => {
    const hour = new Date(h.time).getHours();
    return hour >= 12 && hour <= 18;
  }).slice(0, 1);
  
  const eveningHours = hourly.filter(h => {
    const hour = new Date(h.time).getHours();
    return hour >= 18 && hour <= 23;
  }).slice(0, 1);
  
  let post = `Midday update for ${location.displayName} 🌤️\n\n`;
  
  // Add current conditions if available
  if (current && current.temperature !== undefined) {
    const currentEmoji = getWeatherEmoji(current.weatherCode, true);
    post += `Currently: ${currentEmoji} ${formatTemperature(current.temperature)} - ${current.description}`;
    
    if (current.windSpeed > 5) {
      post += `, ${formatWind(current.windSpeed, current.windDirection)}`;
    }
    
    post += '\n\n';
  }
  
  if (afternoonHours.length > 0) {
    const afternoon = afternoonHours[0];
    const afternoonEmoji = getWeatherEmoji(afternoon.weatherCode, true);
    post += `${afternoonEmoji} This afternoon: ${afternoon.description}, ${formatTemperature(afternoon.temperature)}`;
    
    if (afternoon.precipitation > 0) {
      post += ` (${Math.round(afternoon.precipitation * 10) / 10}" precipitation)`;
    }
    
    post += '\n\n';
  }
  
  if (eveningHours.length > 0) {
    const tonight = eveningHours[0];
    const tonightEmoji = getWeatherEmoji(tonight.weatherCode, false);
    post += `${tonightEmoji} Tonight: ${tonight.description}, ${formatTemperature(tonight.temperature)}`;
  }
  
  post += '\n\n#weather';
  if (location.city) {
    const hashtag = location.city.toLowerCase().replace(/[^a-z0-9]/g, '');
    post += ` #${hashtag}`;
  }
  
  return post.trim();
}

/**
 * Format evening forecast post (7pm) using OpenMeteo data
 * @param {Object} forecast - Forecast data
 * @param {Object} location - Location object
 * @returns {string} Formatted evening post
 */
export function formatEveningForecast(forecast, location) {
  const { daily = [], hourly = [] } = forecast;
  
  // Get tomorrow and day after
  const tomorrow = daily[1];
  const dayAfter = daily[2];
  
  // Find overnight hours (midnight to 6am)
  const overnightHours = hourly.filter(h => {
    const hour = new Date(h.time).getHours();
    const hourDate = new Date(h.time).getDate();
    const tomorrowDate = new Date().getDate() + 1;
    return hourDate === tomorrowDate && hour >= 0 && hour <= 6;
  }).slice(0, 1);
  
  let post = `Good evening, ${location.displayName}! 🌙\n\n`;
  
  if (overnightHours.length > 0) {
    const tonight = overnightHours[0];
    const tonightEmoji = getWeatherEmoji(tonight.weatherCode, false);
    post += `${tonightEmoji} Overnight: ${tonight.description}, ${formatTemperature(tonight.temperature)}\n\n`;
  }
  
  if (tomorrow) {
    const tomorrowEmoji = getWeatherEmoji(tomorrow.weatherCode, true);
    post += `${tomorrowEmoji} Tomorrow: ${tomorrow.description}\n`;
    post += `High ${formatTemperature(tomorrow.temperatureMax)}, Low ${formatTemperature(tomorrow.temperatureMin)}`;
    
    if (tomorrow.windSpeedMax > 10) {
      post += `. Wind up to ${Math.round(tomorrow.windSpeedMax)} mph`;
    }
    
    if (tomorrow.precipitationProbabilityMax > 20) {
      post += ` (${tomorrow.precipitationProbabilityMax}% chance)`;
    }
    
    post += '\n\n';
  }
  
  // Add weekend outlook if it's Thursday or Friday
  const now = new Date();
  const dayOfWeek = now.getDay();
  if ((dayOfWeek === 4 || dayOfWeek === 5) && dayAfter) {
    const dayAfterEmoji = getWeatherEmoji(dayAfter.weatherCode, true);
    const dayAfterDate = new Date(dayAfter.date);
    const dayName = dayAfterDate.toLocaleDateString('en-US', { weekday: 'long' });
    post += `${dayName}: ${dayAfter.description}, High ${formatTemperature(dayAfter.temperatureMax)}`;
  }
  
  post += '\n\n#weather';
  if (location.city) {
    const hashtag = location.city.toLowerCase().replace(/[^a-z0-9]/g, '');
    post += ` #${hashtag}`;
  }
  
  return post.trim();
}

/**
 * Format alert post using OpenMeteo generated alerts
 * @param {Object} alert - Alert object from weather service
 * @param {Object} location - Location object
 * @returns {string} Formatted alert post
 */
export function formatAlertPost(alert, location) {
  // Choose emoji based on severity and event type
  let emoji = '⚠️';
  if (alert.severity === 'High') emoji = '🚨';
  else if (alert.severity === 'Moderate') emoji = '⛔';
  
  // Special emojis for specific event types
  const eventLower = alert.event?.toLowerCase() || '';
  if (eventLower.includes('thunderstorm')) emoji = '⛈️';
  else if (eventLower.includes('snow') || eventLower.includes('blizzard')) emoji = '❄️';
  else if (eventLower.includes('heat')) emoji = '🌡️';
  else if (eventLower.includes('cold') || eventLower.includes('freeze')) emoji = '🥶';
  else if (eventLower.includes('wind')) emoji = '💨';
  else if (eventLower.includes('fog')) emoji = '🌫️';
  else if (eventLower.includes('uv')) emoji = '☀️';
  
  let post = `${emoji} ${location.displayName}: ${alert.headline}\n\n`;
  
  if (alert.description) {
    post += `${alert.description}\n\n`;
  }
  
  // Add timing info if available
  if (alert.effective) {
    const effectiveDate = new Date(alert.effective);
    post += `Effective: ${effectiveDate.toLocaleString('en-US', { 
      timeZone: location.timezone || 'UTC',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })}\n`;
  }
  
  if (alert.expires) {
    const expiresDate = new Date(alert.expires);
    post += `Expires: ${expiresDate.toLocaleString('en-US', {
      timeZone: location.timezone || 'UTC',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })}\n\n`;
  }
  
  post += '#weather #alert';
  if (alert.severity === 'High') {
    post += ' #severeweather';
  }
  if (location.city) {
    const hashtag = location.city.toLowerCase().replace(/[^a-z0-9]/g, '');
    post += ` #${hashtag}`;
  }
  
  return post.trim();
}

/**
 * Compare temperatures between days and describe the change
 * @param {number} today - Today's temperature
 * @param {number} tomorrow - Tomorrow's temperature
 * @returns {string} Description of temperature change
 */
export function describeTemperatureChange(today, tomorrow) {
  if (!today || !tomorrow) return '';
  
  const diff = tomorrow - today;
  
  if (Math.abs(diff) < 3) return 'Similar temperatures';
  
  if (diff > 0) {
    if (diff > 15) return `Much warmer (${Math.round(tomorrow)}°F)`;
    if (diff > 8) return `Warmer (${Math.round(tomorrow)}°F)`;
    return `Slightly warmer (${Math.round(tomorrow)}°F)`;
  } else {
    if (diff < -15) return `Much cooler (${Math.round(tomorrow)}°F)`;
    if (diff < -8) return `Cooler (${Math.round(tomorrow)}°F)`;
    return `Slightly cooler (${Math.round(tomorrow)}°F)`;
  }
}