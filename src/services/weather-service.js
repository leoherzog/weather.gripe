/**
 * Weather Service
 * Handles fetching weather data from OpenMeteo API
 */

import { CacheService } from './cache-service.js';

export class WeatherService {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
    this.cacheService = new CacheService(env, logger);
    this.openMeteoBaseUrl = 'https://api.open-meteo.com/v1';
    this.userAgent = env.USER_AGENT || 'weather.gripe/1.0 (https://weather.gripe)';
  }

  /**
   * Get weather forecast for a single location or multiple locations
   * @param {Array|Object} locations - Single location or array of locations with lat/lon
   * @param {Object} options - Forecast options
   * @returns {Promise<Object|Array>} Forecast data
   */
  async getForecast(locations, options = {}) {
    const isBulk = Array.isArray(locations);
    const locationsList = isBulk ? locations : [locations];
    
    // Default to 2 days (today and tomorrow)
    const forecastDays = options.forecastDays || 2;
    const includeCurrent = options.includeCurrent !== false;
    
    // Check cache for single location requests
    if (!isBulk && locationsList.length === 1) {
      const loc = locationsList[0];
      const cached = await this.cacheService.getCachedWeatherData(loc.lat, loc.lon, 'forecast');
      if (cached) {
        this.logger.debug('Forecast cache hit', { lat: loc.lat, lon: loc.lon });
        return cached;
      }
    }

    try {
      // Build API URL
      const url = new URL(`${this.openMeteoBaseUrl}/forecast`);
      
      // Add coordinates (comma-separated for bulk requests)
      url.searchParams.append('latitude', locationsList.map(l => l.lat.toFixed(4)).join(','));
      url.searchParams.append('longitude', locationsList.map(l => l.lon.toFixed(4)).join(','));
      
      // Request parameters
      url.searchParams.append('forecast_days', forecastDays.toString());
      url.searchParams.append('timezone', 'auto');
      
      // Current weather conditions
      if (includeCurrent) {
        url.searchParams.append('current', [
          'temperature_2m',
          'relative_humidity_2m',
          'apparent_temperature',
          'precipitation',
          'rain',
          'showers',
          'snowfall',
          'weather_code',
          'cloud_cover',
          'wind_speed_10m',
          'wind_direction_10m',
          'wind_gusts_10m'
        ].join(','));
      }
      
      // Daily forecast data
      url.searchParams.append('daily', [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'apparent_temperature_max',
        'apparent_temperature_min',
        'sunrise',
        'sunset',
        'precipitation_sum',
        'rain_sum',
        'showers_sum',
        'snowfall_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max',
        'wind_direction_10m_dominant',
        'uv_index_max'
      ].join(','));
      
      // Hourly data for more detailed forecasts
      url.searchParams.append('hourly', [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation',
        'rain',
        'showers',
        'snowfall',
        'snow_depth',
        'weather_code',
        'cloud_cover',
        'visibility',
        'wind_speed_10m',
        'wind_direction_10m',
        'is_day'
      ].join(','));
      
      // Units
      url.searchParams.append('temperature_unit', 'fahrenheit');
      url.searchParams.append('wind_speed_unit', 'mph');
      url.searchParams.append('precipitation_unit', 'inch');
      
      this.logger.info('Fetching forecast from OpenMeteo', { 
        locations: locationsList.length,
        forecastDays 
      });
      
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenMeteo API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Process the response
      const processedData = isBulk 
        ? this.processBulkForecast(data, locationsList)
        : this.processSingleForecast(data, locationsList[0]);
      
      // Cache single location results
      if (!isBulk && locationsList.length === 1) {
        const loc = locationsList[0];
        await this.httpCache.cacheWeatherData(loc.lat, loc.lon, 'forecast', processedData);
      }
      
      return processedData;
    } catch (error) {
      this.logger.error('Failed to fetch forecast', { error });
      throw error;
    }
  }

  /**
   * Process single location forecast response
   * @param {Object} data - OpenMeteo response
   * @param {Object} location - Location object
   * @returns {Object} Processed forecast
   */
  processSingleForecast(data, location) {
    return {
      location: {
        lat: data.latitude,
        lon: data.longitude,
        elevation: data.elevation,
        timezone: data.timezone,
        timezoneAbbreviation: data.timezone_abbreviation,
        ...location
      },
      current: data.current ? {
        time: data.current.time,
        temperature: data.current.temperature_2m,
        apparentTemperature: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        precipitation: data.current.precipitation,
        rain: data.current.rain,
        showers: data.current.showers,
        snowfall: data.current.snowfall,
        weatherCode: data.current.weather_code,
        cloudCover: data.current.cloud_cover,
        windSpeed: data.current.wind_speed_10m,
        windDirection: data.current.wind_direction_10m,
        windGusts: data.current.wind_gusts_10m,
        description: this.getWeatherDescription(data.current.weather_code)
      } : null,
      daily: this.processDailyForecast(data.daily),
      hourly: this.processHourlyForecast(data.hourly),
      units: data.daily_units
    };
  }

  /**
   * Process bulk forecast response
   * @param {Object} data - OpenMeteo bulk response (single object with arrays for each field)
   * @param {Array} locations - Array of location objects
   * @returns {Array} Array of processed forecasts
   */
  processBulkForecast(data, locations) {
    // OpenMeteo returns a single object with arrays for bulk requests
    const results = [];
    
    // Check if this is actually a bulk response (arrays in the response)
    const isBulkResponse = Array.isArray(data.latitude);
    
    if (!isBulkResponse) {
      // Single location response, just process it normally
      return [this.processSingleForecast(data, locations[0])];
    }
    
    // Process bulk response - extract data for each location
    for (let i = 0; i < locations.length; i++) {
      const singleForecast = {
        latitude: data.latitude[i],
        longitude: data.longitude[i],
        timezone: data.timezone[i],
        timezone_abbreviation: data.timezone_abbreviation[i],
        elevation: data.elevation[i],
        current_units: data.current_units,
        current: data.current ? {
          time: Array.isArray(data.current.time) ? data.current.time[i] : data.current.time,
          interval: Array.isArray(data.current.interval) ? data.current.interval[i] : data.current.interval,
          temperature_2m: Array.isArray(data.current.temperature_2m) ? data.current.temperature_2m[i] : data.current.temperature_2m,
          relative_humidity_2m: Array.isArray(data.current.relative_humidity_2m) ? data.current.relative_humidity_2m[i] : data.current.relative_humidity_2m,
          apparent_temperature: Array.isArray(data.current.apparent_temperature) ? data.current.apparent_temperature[i] : data.current.apparent_temperature,
          is_day: Array.isArray(data.current.is_day) ? data.current.is_day[i] : data.current.is_day,
          precipitation: Array.isArray(data.current.precipitation) ? data.current.precipitation[i] : data.current.precipitation,
          rain: Array.isArray(data.current.rain) ? data.current.rain[i] : data.current.rain,
          showers: Array.isArray(data.current.showers) ? data.current.showers[i] : data.current.showers,
          snowfall: Array.isArray(data.current.snowfall) ? data.current.snowfall[i] : data.current.snowfall,
          weather_code: Array.isArray(data.current.weather_code) ? data.current.weather_code[i] : data.current.weather_code,
          cloud_cover: Array.isArray(data.current.cloud_cover) ? data.current.cloud_cover[i] : data.current.cloud_cover,
          pressure_msl: Array.isArray(data.current.pressure_msl) ? data.current.pressure_msl[i] : data.current.pressure_msl,
          surface_pressure: Array.isArray(data.current.surface_pressure) ? data.current.surface_pressure[i] : data.current.surface_pressure,
          wind_speed_10m: Array.isArray(data.current.wind_speed_10m) ? data.current.wind_speed_10m[i] : data.current.wind_speed_10m,
          wind_direction_10m: Array.isArray(data.current.wind_direction_10m) ? data.current.wind_direction_10m[i] : data.current.wind_direction_10m,
          wind_gusts_10m: Array.isArray(data.current.wind_gusts_10m) ? data.current.wind_gusts_10m[i] : data.current.wind_gusts_10m
        } : null,
        daily_units: data.daily_units,
        daily: data.daily,
        hourly_units: data.hourly_units,
        hourly: data.hourly
      };
      
      results.push(this.processSingleForecast(singleForecast, locations[i]));
    }
    
    return results;
  }

  /**
   * Process daily forecast data
   * @param {Object} daily - Daily forecast data from OpenMeteo
   * @returns {Array} Processed daily forecast
   */
  processDailyForecast(daily) {
    if (!daily || !daily.time) return [];
    
    const days = [];
    for (let i = 0; i < daily.time.length; i++) {
      days.push({
        date: daily.time[i],
        weatherCode: daily.weather_code[i],
        temperatureMax: daily.temperature_2m_max[i],
        temperatureMin: daily.temperature_2m_min[i],
        apparentTemperatureMax: daily.apparent_temperature_max[i],
        apparentTemperatureMin: daily.apparent_temperature_min[i],
        sunrise: daily.sunrise[i],
        sunset: daily.sunset[i],
        precipitationSum: daily.precipitation_sum[i],
        rainSum: daily.rain_sum[i],
        showersSum: daily.showers_sum[i],
        snowfallSum: daily.snowfall_sum[i],
        precipitationProbabilityMax: daily.precipitation_probability_max[i],
        windSpeedMax: daily.wind_speed_10m_max[i],
        windGustsMax: daily.wind_gusts_10m_max[i],
        windDirection: daily.wind_direction_10m_dominant[i],
        uvIndexMax: daily.uv_index_max[i],
        description: this.getWeatherDescription(daily.weather_code[i])
      });
    }
    
    return days;
  }

  /**
   * Process hourly forecast data
   * @param {Object} hourly - Hourly forecast data from OpenMeteo
   * @returns {Array} Processed hourly forecast
   */
  processHourlyForecast(hourly) {
    if (!hourly || !hourly.time) return [];
    
    const hours = [];
    // Limit to next 48 hours
    const limit = Math.min(hourly.time.length, 48);
    
    for (let i = 0; i < limit; i++) {
      hours.push({
        time: hourly.time[i],
        temperature: hourly.temperature_2m[i],
        apparentTemperature: hourly.apparent_temperature[i],
        humidity: hourly.relative_humidity_2m[i],
        precipitation: hourly.precipitation[i],
        rain: hourly.rain[i],
        showers: hourly.showers[i],
        snowfall: hourly.snowfall[i],
        snowDepth: hourly.snow_depth[i],
        weatherCode: hourly.weather_code[i],
        cloudCover: hourly.cloud_cover[i],
        visibility: hourly.visibility[i],
        windSpeed: hourly.wind_speed_10m[i],
        windDirection: hourly.wind_direction_10m[i],
        isDay: hourly.is_day[i] === 1,
        description: this.getWeatherDescription(hourly.weather_code[i])
      });
    }
    
    return hours;
  }

  /**
   * Get human-readable weather description from WMO code
   * @param {number} code - WMO weather code
   * @returns {string} Weather description
   */
  getWeatherDescription(code) {
    const descriptions = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      56: 'Light freezing drizzle',
      57: 'Dense freezing drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      66: 'Light freezing rain',
      67: 'Heavy freezing rain',
      71: 'Slight snow fall',
      73: 'Moderate snow fall',
      75: 'Heavy snow fall',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail'
    };
    
    return descriptions[code] || `Weather code ${code}`;
  }

  /**
   * Get weather emoji from WMO code
   * @param {number} code - WMO weather code
   * @param {boolean} isDay - Whether it's daytime
   * @returns {string} Weather emoji
   */
  getWeatherEmoji(code, isDay = true) {
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
    
    return emojiMap[code] || '🌡️';
  }

  /**
   * Check if weather code indicates severe weather
   * @param {number} code - WMO weather code
   * @returns {boolean} True if severe weather
   */
  isSevereWeather(code) {
    // Codes indicating severe or dangerous weather
    const severeCodes = [
      67,  // Heavy freezing rain
      75,  // Heavy snow fall
      82,  // Violent rain showers
      86,  // Heavy snow showers
      95,  // Thunderstorm
      96,  // Thunderstorm with hail
      99   // Thunderstorm with heavy hail
    ];
    
    return severeCodes.includes(code);
  }

  /**
   * Get alerts based on weather conditions (OpenMeteo doesn't have dedicated alerts API)
   * @param {Object} forecast - Forecast data
   * @returns {Array} Generated alerts based on severe weather conditions
   */
  generateWeatherAlerts(forecast) {
    const alerts = [];
    
    // Check current conditions for severe weather
    if (forecast.current && this.isSevereWeather(forecast.current.weatherCode)) {
      alerts.push({
        severity: 'High',
        event: forecast.current.description,
        headline: `Current severe weather: ${forecast.current.description}`,
        description: `Temperature: ${forecast.current.temperature}°F, Wind: ${forecast.current.windSpeed} mph`,
        effective: forecast.current.time,
        expires: null
      });
    }
    
    // Check daily forecasts for severe conditions
    forecast.daily.forEach(day => {
      if (this.isSevereWeather(day.weatherCode)) {
        alerts.push({
          severity: 'Moderate',
          event: day.description,
          headline: `Forecast severe weather on ${day.date}: ${day.description}`,
          description: `High: ${day.temperatureMax}°F, Low: ${day.temperatureMin}°F, Precipitation: ${day.precipitationSum} in`,
          effective: day.date,
          expires: null
        });
      }
      
      // Check for extreme temperatures
      if (day.temperatureMax > 100) {
        alerts.push({
          severity: 'High',
          event: 'Extreme Heat',
          headline: `Extreme heat warning: ${day.temperatureMax}°F`,
          description: `Dangerous heat conditions expected on ${day.date}`,
          effective: day.date,
          expires: null
        });
      }
      
      if (day.temperatureMin < 0) {
        alerts.push({
          severity: 'High',
          event: 'Extreme Cold',
          headline: `Extreme cold warning: ${day.temperatureMin}°F`,
          description: `Dangerous cold conditions expected on ${day.date}`,
          effective: day.date,
          expires: null
        });
      }
      
      // Check for high UV
      if (day.uvIndexMax >= 11) {
        alerts.push({
          severity: 'Moderate',
          event: 'Extreme UV',
          headline: `Extreme UV index: ${day.uvIndexMax}`,
          description: 'Take extra precautions outdoors',
          effective: day.date,
          expires: null
        });
      }
    });
    
    return alerts;
  }
}