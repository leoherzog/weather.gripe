// Weather.gripe Cloudflare Worker
// Proxies and caches Open-Meteo and Unsplash APIs

import SunCalc from 'suncalc';

const GEOCODE_CACHE_TTL = 24 * 60 * 60; // 24 hours
const NWS_POINTS_CACHE_TTL = 24 * 60 * 60; // 24 hours
const NWS_ZONE_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days (zone boundaries rarely change)
const UNSPLASH_CACHE_TTL = 24 * 60 * 60; // 24 hours
const LOCATION_CACHE_TTL = 5 * 60; // 5 minutes (limited by alerts)
const WXSTORY_CACHE_TTL = 5 * 60; // 5 minutes
const WXSTORY_IMAGE_CACHE_TTL = 30 * 60; // 30 minutes
const RADAR_TIMESTAMP_CACHE_TTL = 60; // 1 minute
const RADAR_TILE_CACHE_TTL = 120; // 2 minutes
const BASEMAP_TILE_CACHE_TTL = 86400; // 24 hours

// NOAA radar region configurations
const NOAA_RADAR_CONFIG = {
  conus: {
    name: 'Continental US',
    bounds: { minLat: 21, maxLat: 50, minLon: -130, maxLon: -60 },
    layer: 'conus_bref_qcd'
  },
  alaska: {
    name: 'Alaska',
    bounds: { minLat: 51, maxLat: 72, minLon: -180, maxLon: -129 },
    layer: 'alaska_bref_qcd'
  },
  hawaii: {
    name: 'Hawaii',
    bounds: { minLat: 18, maxLat: 23, minLon: -161, maxLon: -154 },
    layer: 'hawaii_bref_qcd'
  },
  carib: {
    name: 'Caribbean',
    bounds: { minLat: 16, maxLat: 20, minLon: -68, maxLon: -63 },
    layer: 'carib_bref_qcd'
  },
  guam: {
    name: 'Guam',
    bounds: { minLat: 12, maxLat: 15, minLon: 144, maxLon: 146 },
    layer: 'guam_bref_qcd'
  }
};

const NOMINATIM_HEADERS = {
  'User-Agent': 'weather.gripe/1.0 (https://weather.gripe)',
  'Accept': 'application/json'
};

// Fallback images when Unsplash API fails (all by @leoherzog)
const FALLBACK_IMAGES = {
  rain: 'photo-1617112896650-69a1be08ad10',
  'clear-warm': 'photo-1519921264316-de3473991b99',
  'mostly-sunny': 'photo-1519920600744-610bc64b7d57',
  'overcast-warm': 'photo-1519921428872-dd80407bb5bb',
  snow: 'photo-1519921336846-ff8bd0df94b4',
  'mostly-cloudy': 'photo-1519921124984-411e6188efa3',
  'clear-cold': 'photo-1519921386942-020e6e4a06f7',
  overcast: 'photo-1519921191976-a438eba0ede8'
};

// Build a fallback photo object matching Unsplash API format
function getFallbackPhoto(photoId) {
  return {
    url: `https://images.unsplash.com/${photoId}?w=1080&q=80`,
    thumb: `https://images.unsplash.com/${photoId}?w=200&q=80`,
    photographer: 'Leo Herzog',
    username: 'leoherzog',
    photographerUrl: 'https://unsplash.com/@leoherzog',
    unsplashUrl: `https://unsplash.com/photos/${photoId.replace('photo-', '')}`,
    downloadLocation: null // No tracking needed for fallbacks
  };
}

// Select appropriate fallback image based on query keywords
function selectFallbackImage(query) {
  const q = query.toLowerCase();

  // Check for specific conditions
  if (q.includes('rain') || q.includes('drizzle') || q.includes('lightning') || q.includes('thunder') || q.includes('storm')) {
    return getFallbackPhoto(FALLBACK_IMAGES.rain);
  }
  if (q.includes('snow') || q.includes('blizzard') || q.includes('snowstorm')) {
    return getFallbackPhoto(FALLBACK_IMAGES.snow);
  }
  if (q.includes('fog') || q.includes('mist')) {
    return getFallbackPhoto(FALLBACK_IMAGES.overcast);
  }
  if (q.includes('overcast') || q.includes('gray')) {
    if (q.includes('warm') || q.includes('hot')) {
      return getFallbackPhoto(FALLBACK_IMAGES['overcast-warm']);
    }
    return getFallbackPhoto(FALLBACK_IMAGES.overcast);
  }
  if (q.includes('cloudy') || q.includes('clouds')) {
    return getFallbackPhoto(FALLBACK_IMAGES['mostly-cloudy']);
  }
  if (q.includes('clear') || q.includes('sunny') || q.includes('blue sky')) {
    if (q.includes('cold') || q.includes('freezing') || q.includes('icy')) {
      return getFallbackPhoto(FALLBACK_IMAGES['clear-cold']);
    }
    if (q.includes('warm') || q.includes('hot')) {
      return getFallbackPhoto(FALLBACK_IMAGES['clear-warm']);
    }
    return getFallbackPhoto(FALLBACK_IMAGES['mostly-sunny']);
  }

  // Default fallback
  return getFallbackPhoto(FALLBACK_IMAGES['mostly-sunny']);
}

const NWS_HEADERS = {
  'User-Agent': 'weather.gripe (https://weather.gripe)',
  'Accept': 'application/geo+json'
};

// WMO weather code to unified condition mapping
const WMO_CONDITIONS = {
  0: { code: 'clear', text: 'Clear Sky', icon: 'sun' },
  1: { code: 'mostly-clear', text: 'Mainly Clear', icon: 'sun' },
  2: { code: 'partly-cloudy', text: 'Partly Cloudy', icon: 'cloud-sun' },
  3: { code: 'overcast', text: 'Overcast', icon: 'cloud' },
  45: { code: 'fog', text: 'Fog', icon: 'smog' },
  48: { code: 'fog', text: 'Depositing Rime Fog', icon: 'smog' },
  51: { code: 'drizzle', text: 'Light Drizzle', icon: 'cloud-rain' },
  53: { code: 'drizzle', text: 'Moderate Drizzle', icon: 'cloud-rain' },
  55: { code: 'drizzle', text: 'Dense Drizzle', icon: 'cloud-rain' },
  56: { code: 'freezing-rain', text: 'Freezing Drizzle', icon: 'cloud-rain' },
  57: { code: 'freezing-rain', text: 'Dense Freezing Drizzle', icon: 'cloud-rain' },
  61: { code: 'rain-light', text: 'Light Rain', icon: 'cloud-rain' },
  63: { code: 'rain', text: 'Moderate Rain', icon: 'cloud-showers-heavy' },
  65: { code: 'rain-heavy', text: 'Heavy Rain', icon: 'cloud-showers-heavy' },
  66: { code: 'freezing-rain', text: 'Freezing Rain', icon: 'cloud-rain' },
  67: { code: 'freezing-rain', text: 'Heavy Freezing Rain', icon: 'cloud-showers-heavy' },
  71: { code: 'snow-light', text: 'Light Snow', icon: 'snowflake' },
  73: { code: 'snow', text: 'Moderate Snow', icon: 'snowflake' },
  75: { code: 'snow-heavy', text: 'Heavy Snow', icon: 'snowflake' },
  77: { code: 'snow-light', text: 'Snow Grains', icon: 'snowflake' },
  80: { code: 'rain-light', text: 'Light Showers', icon: 'cloud-sun-rain' },
  81: { code: 'rain', text: 'Moderate Showers', icon: 'cloud-showers-heavy' },
  82: { code: 'rain-heavy', text: 'Heavy Showers', icon: 'cloud-showers-heavy' },
  85: { code: 'snow-light', text: 'Light Snow Showers', icon: 'snowflake' },
  86: { code: 'snow-heavy', text: 'Heavy Snow Showers', icon: 'snowflake' },
  95: { code: 'thunderstorm', text: 'Thunderstorm', icon: 'cloud-bolt' },
  96: { code: 'thunderstorm', text: 'Thunderstorm With Hail', icon: 'cloud-bolt' },
  99: { code: 'thunderstorm-severe', text: 'Thunderstorm With Heavy Hail', icon: 'cloud-bolt' }
};

// NWS icon code to unified condition mapping
// Based on https://www.weather.gov/forecast-icons/
const NWS_ICON_CONDITIONS = {
  // Clear/Sky conditions
  'skc': { code: 'clear', text: 'Clear', icon: 'sun' },
  'nskc': { code: 'clear', text: 'Clear', icon: 'sun' },
  'few': { code: 'mostly-clear', text: 'Mostly Clear', icon: 'sun' },
  'nfew': { code: 'mostly-clear', text: 'Mostly Clear', icon: 'sun' },
  'sct': { code: 'partly-cloudy', text: 'Partly Cloudy', icon: 'cloud-sun' },
  'nsct': { code: 'partly-cloudy', text: 'Partly Cloudy', icon: 'cloud-sun' },
  'bkn': { code: 'mostly-cloudy', text: 'Mostly Cloudy', icon: 'cloud' },
  'nbkn': { code: 'mostly-cloudy', text: 'Mostly Cloudy', icon: 'cloud' },
  'ovc': { code: 'overcast', text: 'Overcast', icon: 'cloud' },
  'novc': { code: 'overcast', text: 'Overcast', icon: 'cloud' },

  // Wind variants (map to base sky condition)
  'wind_skc': { code: 'clear', text: 'Clear and Windy', icon: 'sun' },
  'wind_few': { code: 'mostly-clear', text: 'Mostly Clear and Windy', icon: 'sun' },
  'wind_sct': { code: 'partly-cloudy', text: 'Partly Cloudy and Windy', icon: 'cloud-sun' },
  'wind_bkn': { code: 'mostly-cloudy', text: 'Mostly Cloudy and Windy', icon: 'cloud' },
  'wind_ovc': { code: 'overcast', text: 'Overcast and Windy', icon: 'cloud' },
  'nwind_skc': { code: 'clear', text: 'Clear and Windy', icon: 'sun' },
  'nwind_few': { code: 'mostly-clear', text: 'Mostly Clear and Windy', icon: 'sun' },
  'nwind_sct': { code: 'partly-cloudy', text: 'Partly Cloudy and Windy', icon: 'cloud-sun' },
  'nwind_bkn': { code: 'mostly-cloudy', text: 'Mostly Cloudy and Windy', icon: 'cloud' },
  'nwind_ovc': { code: 'overcast', text: 'Overcast and Windy', icon: 'cloud' },

  // Rain
  'ra': { code: 'rain', text: 'Rain', icon: 'cloud-showers-heavy' },
  'nra': { code: 'rain', text: 'Rain', icon: 'cloud-showers-heavy' },
  'minus_ra': { code: 'rain-light', text: 'Light Rain', icon: 'cloud-rain' },
  'hi_shwrs': { code: 'rain-light', text: 'Showers', icon: 'cloud-sun-rain' },
  'hi_nshwrs': { code: 'rain-light', text: 'Showers', icon: 'cloud-sun-rain' },
  'shra': { code: 'rain', text: 'Rain Showers', icon: 'cloud-showers-heavy' },
  'nshra': { code: 'rain', text: 'Rain Showers', icon: 'cloud-showers-heavy' },

  // Snow (API uses both 'sn' and 'snow' codes)
  'sn': { code: 'snow', text: 'Snow', icon: 'snowflake' },
  'nsn': { code: 'snow', text: 'Snow', icon: 'snowflake' },
  'snow': { code: 'snow', text: 'Snow', icon: 'snowflake' },
  'nsnow': { code: 'snow', text: 'Snow', icon: 'snowflake' },
  'ra_sn': { code: 'snow', text: 'Rain/Snow Mix', icon: 'snowflake' },
  'nra_sn': { code: 'snow', text: 'Rain/Snow Mix', icon: 'snowflake' },
  'snip': { code: 'snow', text: 'Snow/Ice Pellets', icon: 'snowflake' },
  'nsnip': { code: 'snow', text: 'Snow/Ice Pellets', icon: 'snowflake' },

  // Freezing precipitation
  'fzra': { code: 'freezing-rain', text: 'Freezing Rain', icon: 'cloud-rain' },
  'nfzra': { code: 'freezing-rain', text: 'Freezing Rain', icon: 'cloud-rain' },
  'ra_fzra': { code: 'freezing-rain', text: 'Rain/Freezing Rain', icon: 'cloud-rain' },
  'nra_fzra': { code: 'freezing-rain', text: 'Rain/Freezing Rain', icon: 'cloud-rain' },
  'fzra_sn': { code: 'freezing-rain', text: 'Freezing Rain/Snow', icon: 'cloud-rain' },
  'nfzra_sn': { code: 'freezing-rain', text: 'Freezing Rain/Snow', icon: 'cloud-rain' },
  'ip': { code: 'freezing-rain', text: 'Ice Pellets', icon: 'cloud-rain' },
  'nip': { code: 'freezing-rain', text: 'Ice Pellets', icon: 'cloud-rain' },
  'raip': { code: 'freezing-rain', text: 'Rain/Ice Pellets', icon: 'cloud-rain' },
  'nraip': { code: 'freezing-rain', text: 'Rain/Ice Pellets', icon: 'cloud-rain' },
  'mix': { code: 'freezing-rain', text: 'Wintry Mix', icon: 'cloud-rain' },
  'nmix': { code: 'freezing-rain', text: 'Wintry Mix', icon: 'cloud-rain' },

  // Thunderstorms
  'tsra': { code: 'thunderstorm', text: 'Thunderstorm', icon: 'cloud-bolt' },
  'ntsra': { code: 'thunderstorm', text: 'Thunderstorm', icon: 'cloud-bolt' },
  'scttsra': { code: 'thunderstorm', text: 'Scattered Thunderstorms', icon: 'cloud-bolt' },
  'nscttsra': { code: 'thunderstorm', text: 'Scattered Thunderstorms', icon: 'cloud-bolt' },
  'hi_tsra': { code: 'thunderstorm', text: 'Thunderstorms', icon: 'cloud-bolt' },
  'hi_ntsra': { code: 'thunderstorm', text: 'Thunderstorms', icon: 'cloud-bolt' },
  'fc': { code: 'thunderstorm-severe', text: 'Funnel Cloud', icon: 'cloud-bolt' },
  'nfc': { code: 'thunderstorm-severe', text: 'Funnel Cloud', icon: 'cloud-bolt' },
  'tor': { code: 'thunderstorm-severe', text: 'Tornado', icon: 'cloud-bolt' },
  'ntor': { code: 'thunderstorm-severe', text: 'Tornado', icon: 'cloud-bolt' },

  // Fog/Haze/Smoke
  'fg': { code: 'fog', text: 'Fog', icon: 'smog' },
  'nfg': { code: 'fog', text: 'Fog', icon: 'smog' },
  'hz': { code: 'fog', text: 'Haze', icon: 'smog' },
  'fu': { code: 'fog', text: 'Smoke', icon: 'smog' },
  'nfu': { code: 'fog', text: 'Smoke', icon: 'smog' },
  'du': { code: 'fog', text: 'Dust', icon: 'smog' },
  'ndu': { code: 'fog', text: 'Dust', icon: 'smog' },

  // Additional full-word variants used by NWS API
  'rain': { code: 'rain', text: 'Rain', icon: 'cloud-showers-heavy' },
  'nrain': { code: 'rain', text: 'Rain', icon: 'cloud-showers-heavy' },
  'rain_showers': { code: 'rain', text: 'Rain Showers', icon: 'cloud-showers-heavy' },
  'rain_showers_hi': { code: 'rain-light', text: 'Showers', icon: 'cloud-sun-rain' },
  'tsra_hi': { code: 'thunderstorm', text: 'Thunderstorms', icon: 'cloud-bolt' },
  'tsra_sct': { code: 'thunderstorm', text: 'Scattered Thunderstorms', icon: 'cloud-bolt' },

  // Severe/Hazardous
  'blizzard': { code: 'snow-heavy', text: 'Blizzard', icon: 'snowflake' },
  'nblizzard': { code: 'snow-heavy', text: 'Blizzard', icon: 'snowflake' },
  'cold': { code: 'clear', text: 'Cold', icon: 'sun' },
  'ncold': { code: 'clear', text: 'Cold', icon: 'sun' },
  'hot': { code: 'clear', text: 'Hot', icon: 'sun' },

  // Tropical (day only typically)
  'hur_warn': { code: 'thunderstorm-severe', text: 'Hurricane Warning', icon: 'cloud-bolt' },
  'hur_watch': { code: 'thunderstorm-severe', text: 'Hurricane Watch', icon: 'cloud-bolt' },
  'ts_warn': { code: 'thunderstorm-severe', text: 'Tropical Storm Warning', icon: 'cloud-bolt' },
  'ts_watch': { code: 'thunderstorm-severe', text: 'Tropical Storm Watch', icon: 'cloud-bolt' },
};

// Parse NWS icon URL to extract condition code and probability
// URL format: https://api.weather.gov/icons/land/{day|night}/{condition}?size=medium
// Condition can be: "bkn" or "tsra,40" or "tsra,40/ra,60" (dual icons with probabilities)
function parseNWSIconUrl(iconUrl) {
  if (!iconUrl) return null;
  try {
    const url = new URL(iconUrl);
    const parts = url.pathname.split('/');
    // Find the condition part (after "day" or "night")
    const dayNightIndex = parts.findIndex(p => p === 'day' || p === 'night');
    if (dayNightIndex === -1 || dayNightIndex >= parts.length - 1) return null;
    const isNight = parts[dayNightIndex] === 'night';

    const conditionPart = parts[dayNightIndex + 1];
    // Handle dual icons: "tsra,40/ra,60" - take the more severe (first) condition
    const conditions = conditionPart.split('/');
    const firstCondition = conditions[0];
    // Split condition and probability: "tsra,40" -> ["tsra", "40"]
    const [conditionCode, probStr] = firstCondition.split(',');
    const probability = probStr ? parseInt(probStr, 10) : null;

    return {
      code: conditionCode,
      probability,
      isNight,
      // If dual icon, include secondary condition info
      secondary: conditions[1] ? {
        code: conditions[1].split(',')[0],
        probability: conditions[1].split(',')[1] ? parseInt(conditions[1].split(',')[1], 10) : null
      } : null
    };
  } catch (e) {
    return null;
  }
}

// Map NWS icon URL to unified condition object
function mapNWSIconToCondition(iconUrl, fallbackText) {
  const parsed = parseNWSIconUrl(iconUrl);
  if (parsed && NWS_ICON_CONDITIONS[parsed.code]) {
    const condition = { ...NWS_ICON_CONDITIONS[parsed.code] };
    // Include probability if present in icon URL
    if (parsed.probability != null) {
      condition.probability = parsed.probability;
    }
    return condition;
  }
  // Fallback to text-based parsing if icon not recognized
  return mapNWSConditionFromText(fallbackText);
}

// Map NWS forecast text to unified condition object (fallback)
function mapNWSConditionFromText(text) {
  const lower = (text || '').toLowerCase();

  // If no text provided, return generic condition
  if (!lower) {
    return { code: 'partly-cloudy', text: 'Partly Cloudy', icon: 'cloud-sun' };
  }

  // Thunderstorms (check first as they may include rain/wind descriptions)
  if (lower.includes('thunder')) {
    if (lower.includes('severe') || lower.includes('tornado')) {
      return { code: 'thunderstorm-severe', text, icon: 'cloud-bolt' };
    }
    return { code: 'thunderstorm', text, icon: 'cloud-bolt' };
  }

  // Freezing precipitation
  if (lower.includes('freezing') || lower.includes('ice') || lower.includes('sleet')) {
    return { code: 'freezing-rain', text, icon: 'cloud-rain' };
  }

  // Snow
  if (lower.includes('snow') || lower.includes('flurr') || lower.includes('blizzard')) {
    if (lower.includes('heavy') || lower.includes('blizzard')) {
      return { code: 'snow-heavy', text, icon: 'snowflake' };
    }
    if (lower.includes('light') || lower.includes('flurr')) {
      return { code: 'snow-light', text, icon: 'snowflake' };
    }
    return { code: 'snow', text, icon: 'snowflake' };
  }

  // Rain/Showers
  if (lower.includes('rain') || lower.includes('shower') || lower.includes('drizzle')) {
    if (lower.includes('heavy')) {
      return { code: 'rain-heavy', text, icon: 'cloud-showers-heavy' };
    }
    if (lower.includes('light') || lower.includes('drizzle')) {
      return { code: 'rain-light', text, icon: 'cloud-rain' };
    }
    return { code: 'rain', text, icon: 'cloud-showers-heavy' };
  }

  // Fog/Mist/Haze
  if (lower.includes('fog') || lower.includes('mist') || lower.includes('haze')) {
    return { code: 'fog', text, icon: 'smog' };
  }

  // Cloud cover
  if (lower.includes('overcast') || lower.includes('cloudy')) {
    if (lower.includes('mostly cloudy')) {
      return { code: 'mostly-cloudy', text, icon: 'cloud' };
    }
    if (lower.includes('partly')) {
      return { code: 'partly-cloudy', text, icon: 'cloud-sun' };
    }
    return { code: 'overcast', text, icon: 'cloud' };
  }

  // Clear conditions
  if (lower.includes('sunny') || lower.includes('clear')) {
    if (lower.includes('mostly')) {
      return { code: 'mostly-clear', text, icon: 'sun' };
    }
    if (lower.includes('partly')) {
      return { code: 'partly-cloudy', text, icon: 'cloud-sun' };
    }
    return { code: 'clear', text, icon: 'sun' };
  }

  // Default fallback
  return { code: 'partly-cloudy', text, icon: 'cloud-sun' };
}

// Calculate sunrise/sunset times using SunCalc
function getSunTimes(date, lat, lon) {
  const times = SunCalc.getTimes(date, lat, lon);
  // SunCalc returns Invalid Date for polar day/night - check before converting
  const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());
  return {
    sunrise: isValidDate(times.sunrise) ? times.sunrise.toISOString() : null,
    sunset: isValidDate(times.sunset) ? times.sunset.toISOString() : null
  };
}

// Extract precipitation detail from NWS forecast text (e.g., "Accumulation of 1 to 3 inches.")
function extractPrecipDetail(text) {
  if (!text) return null;
  // Match patterns like "Accumulation of X to Y inches" or "New snow accumulation of around X inch"
  const match = text.match(/(?:accumulation|new (?:snow|rainfall?))[\s\w]*of[^.]+/i);
  return match ? match[0] : null;
}

// Truncate coordinates to 3 decimal places (~111m precision)
function truncateCoord(coord) {
  return Math.round(parseFloat(coord) * 1000) / 1000;
}

// Parse max-age from Cache-Control header
function parseCacheControl(header) {
  if (!header) return null;
  const match = header.match(/max-age=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Check if cache should be bypassed via ?cache=false
function shouldSkipCache(request) {
  const url = new URL(request.url);
  return url.searchParams.get('cache') === 'false';
}

// Create JSON response with standard headers
function jsonResponse(data, status = 200, cacheTTL = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  if (cacheTTL) {
    headers['Cache-Control'] = `public, max-age=${cacheTTL}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

// Reverse geocode coordinates to location name via Nominatim (with caching)
async function reverseGeocode(lat, lon, cache, ctx) {
  const cacheKey = `reverse-geocode:${truncateCoord(lat)},${truncateCoord(lon)}`;
  const cacheUrl = `https://weather.gripe/api/geocode-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl);

  // Check cache first
  if (cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached.json();
    }
  }

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());
  url.searchParams.set('format', 'jsonv2');

  const response = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!response.ok) throw new Error('Reverse geocoding failed');

  const data = await response.json();

  // Handle Nominatim error responses or missing data
  if (data.error || !data.lat || !data.lon) {
    return {
      name: 'Unknown Location',
      region: '',
      latitude: lat,
      longitude: lon,
      country_code: null
    };
  }

  const addr = data.address || {};

  const result = {
    name: addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Unknown',
    region: [addr.state, addr.country].filter(Boolean).join(', '),
    latitude: parseFloat(data.lat),
    longitude: parseFloat(data.lon),
    country_code: addr.country_code
  };

  // Cache for 24 hours (location names don't change)
  if (cache && ctx) {
    const cacheResponse = new Response(JSON.stringify(result), {
      headers: { 'Cache-Control': `public, max-age=${GEOCODE_CACHE_TTL}` }
    });
    ctx.waitUntil(cache.put(cacheRequest, cacheResponse));
  }

  return result;
}

// Forward geocode query to coordinates via Nominatim
async function forwardGeocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!response.ok) throw new Error('Forward geocoding failed');

  const data = await response.json();
  if (!data.length) throw new Error('Location not found');

  const result = data[0];
  const addr = result.address || {};

  // Extract city name from address details, preferring city > town > village > county
  const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county;
  // Fallback to first part of display_name if no city found
  const parts = result.display_name.split(', ');
  const name = cityName || parts[0] || 'Unknown';

  return {
    name,
    region: parts.slice(1).join(', '),
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
    country_code: addr.country_code || null
  };
}

// Fetch NWS grid point data with caching
async function fetchNWSPoints(lat, lon, cache, ctx, skipCache = false) {
  const cacheKey = `nws-points:${truncateCoord(lat)},${truncateCoord(lon)}`;
  const cacheUrl = `https://weather.gripe/api/nws-points-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl);

  // Delete existing cache if bypassing
  if (skipCache) {
    ctx.waitUntil(cache.delete(cacheRequest));
  } else {
    // Check cache first
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached.json();
    }
  }

  const url = `https://api.weather.gov/points/${lat},${lon}`;
  const response = await fetch(url, { headers: NWS_HEADERS });

  if (!response.ok) {
    throw new Error(`NWS points API error: ${response.status}`);
  }

  const data = await response.json();
  const props = data.properties;

  const result = {
    gridId: props.gridId,
    gridX: props.gridX,
    gridY: props.gridY,
    forecast: props.forecast,
    forecastHourly: props.forecastHourly,
    observationStations: props.observationStations,
    timeZone: props.timeZone
  };

  // Respect NWS Cache-Control header, fallback to 24 hours
  const nwsCacheControl = response.headers.get('Cache-Control');
  const maxAge = parseCacheControl(nwsCacheControl) || NWS_POINTS_CACHE_TTL;
  const cacheResponse = new Response(JSON.stringify(result), {
    headers: { 'Cache-Control': `public, max-age=${maxAge}` }
  });
  ctx.waitUntil(cache.put(cacheRequest, cacheResponse));

  return result;
}

// Fetch latest observation from NWS with station fallback
async function fetchNWSObservation(stationsUrl) {
  try {
    // Get list of observation stations
    const stationsRes = await fetch(stationsUrl, { headers: NWS_HEADERS });
    if (!stationsRes.ok) return null;

    const stationsData = await stationsRes.json();
    const stations = stationsData.features?.slice(0, 3) || []; // Try up to 3 nearest stations

    // First pass: find station with both temperature AND textDescription
    for (const station of stations) {
      const stationId = station.properties?.stationIdentifier;
      if (!stationId) continue;

      const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
      const obsRes = await fetch(obsUrl, { headers: NWS_HEADERS });

      if (obsRes.ok) {
        const obsData = await obsRes.json();
        const props = obsData.properties;

        // Check if observation has valid temperature AND textDescription
        if (props?.temperature?.value != null && Number.isFinite(props.temperature.value) && props.textDescription) {
          return {
            temperature: props.temperature?.value,
            feelsLike: props.windChill?.value ?? props.heatIndex?.value ?? props.temperature?.value,
            humidity: props.relativeHumidity?.value,
            windSpeed: props.windSpeed?.value,
            windDirection: props.windDirection?.value,
            textDescription: props.textDescription,
            observedAt: props.timestamp
          };
        }
      }
    }

    // Second pass: accept station with just temperature (fallback)
    for (const station of stations) {
      const stationId = station.properties?.stationIdentifier;
      if (!stationId) continue;

      const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
      const obsRes = await fetch(obsUrl, { headers: NWS_HEADERS });

      if (obsRes.ok) {
        const obsData = await obsRes.json();
        const props = obsData.properties;

        if (props?.temperature?.value != null && Number.isFinite(props.temperature.value)) {
          return {
            temperature: props.temperature?.value,
            feelsLike: props.windChill?.value ?? props.heatIndex?.value ?? props.temperature?.value,
            humidity: props.relativeHumidity?.value,
            windSpeed: props.windSpeed?.value,
            windDirection: props.windDirection?.value,
            textDescription: props.textDescription || null,
            observedAt: props.timestamp
          };
        }
      }
    }
    return null;
  } catch (e) {
    console.error('NWS observation fetch error:', e);
    return null;
  }
}

// Fetch complete weather data from NWS and transform to unified schema
// Accepts optional pre-fetched points to avoid redundant API call
async function fetchWeatherNWS(lat, lon, cache, ctx, skipCache = false, existingPoints = null) {
  // 1. Get grid point (use existing or fetch)
  const points = existingPoints || await fetchNWSPoints(lat, lon, cache, ctx, skipCache);

  // 2. Parallel fetch forecast + observation
  const [forecastRes, observation] = await Promise.all([
    fetch(points.forecast, { headers: NWS_HEADERS }),
    fetchNWSObservation(points.observationStations)
  ]);

  if (!forecastRes.ok) {
    throw new Error(`NWS forecast API error: ${forecastRes.status}`);
  }

  const forecast = await forecastRes.json();
  const periods = forecast.properties?.periods || [];

  // 3. Group periods by day and build daily forecast
  const dailyMap = new Map();

  for (const period of periods) {
    const date = period.startTime.split('T')[0];

    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, dayPeriod: null, nightPeriod: null });
    }

    const day = dailyMap.get(date);
    if (period.isDaytime) {
      day.dayPeriod = period;
    } else {
      day.nightPeriod = period;
    }
  }

  // 4. Build daily array with sunrise/sunset from suncalc
  const daily = [];
  for (const [date, { dayPeriod, nightPeriod }] of dailyMap) {
    if (daily.length >= 7) break;

    const sunTimes = getSunTimes(new Date(date + 'T12:00:00'), lat, lon);
    const primaryPeriod = dayPeriod || nightPeriod;
    // Use icon URL for more reliable condition mapping
    const condition = mapNWSIconToCondition(primaryPeriod?.icon, primaryPeriod?.shortForecast);

    // NWS provides precip chance but not amounts in standard forecast
    // Extract detail text for accumulation info
    const detailText = dayPeriod?.detailedForecast || nightPeriod?.detailedForecast;
    const precipDetail = extractPrecipDetail(detailText);

    daily.push({
      date,
      high: dayPeriod?.temperature != null ? fahrenheitToCelsius(dayPeriod.temperature) : null,
      low: nightPeriod?.temperature != null ? fahrenheitToCelsius(nightPeriod.temperature) : null,
      condition: {
        ...condition,
        detail: precipDetail
      },
      precipitation: {
        probability: Math.max(
          dayPeriod?.probabilityOfPrecipitation?.value ?? 0,
          nightPeriod?.probabilityOfPrecipitation?.value ?? 0
        ),
        amount: null, // NWS doesn't provide this in standard forecast
        snow: null,
        rain: null
      },
      sunrise: sunTimes.sunrise,
      sunset: sunTimes.sunset,
      // Detailed forecast objects for text forecast cards
      dayForecast: dayPeriod ? {
        name: dayPeriod.name,
        detailedForecast: dayPeriod.detailedForecast,
        shortForecast: dayPeriod.shortForecast,
        condition: mapNWSIconToCondition(dayPeriod.icon, dayPeriod.shortForecast)
      } : null,
      nightForecast: nightPeriod ? {
        name: nightPeriod.name,
        detailedForecast: nightPeriod.detailedForecast,
        shortForecast: nightPeriod.shortForecast,
        condition: mapNWSIconToCondition(nightPeriod.icon, nightPeriod.shortForecast)
      } : null
    });
  }

  // 5. Build current conditions from observation
  let current;
  if (observation) {
    // Convert m/s to km/h for wind
    const windSpeedKmh = observation.windSpeed != null ? observation.windSpeed * 3.6 : null;

    current = {
      temperature: observation.temperature,
      feelsLike: observation.feelsLike,
      humidity: observation.humidity,
      wind: {
        speed: windSpeedKmh,
        direction: observation.windDirection
      },
      condition: mapNWSConditionFromText(observation.textDescription),
      observedAt: observation.observedAt
    };
  } else {
    // Fallback: use first forecast period
    const firstPeriod = periods[0];
    current = {
      temperature: firstPeriod ? fahrenheitToCelsius(firstPeriod.temperature) : null,
      feelsLike: null,
      humidity: null,
      wind: {
        speed: firstPeriod ? parseWindSpeed(firstPeriod.windSpeed) : null,
        direction: firstPeriod ? parseWindDirection(firstPeriod.windDirection) : null
      },
      condition: mapNWSIconToCondition(firstPeriod?.icon, firstPeriod?.shortForecast),
      observedAt: null
    };
  }

  // 6. Fetch hourly forecast
  let hourly = [];
  try {
    const hourlyRes = await fetch(points.forecastHourly, { headers: NWS_HEADERS });
    if (hourlyRes.ok) {
      const hourlyData = await hourlyRes.json();
      const hourlyPeriods = hourlyData.properties?.periods || [];
      hourly = hourlyPeriods.slice(0, 24).map(period => ({
        time: period.startTime,
        temperature: fahrenheitToCelsius(period.temperature),
        condition: mapNWSIconToCondition(period.icon, period.shortForecast),
        precipProbability: period.probabilityOfPrecipitation?.value || 0
      }));
    }
  } catch (e) {
    console.error('NWS hourly fetch error:', e);
  }

  return {
    current,
    daily,
    hourly,
    timezone: points.timeZone,
    source: 'nws'
  };
}

// Helper: Convert Fahrenheit to Celsius
function fahrenheitToCelsius(f) {
  return Math.round((f - 32) * 5 / 9);
}

// Helper: Parse NWS wind speed string (e.g., "5 to 10 mph") to km/h
function parseWindSpeed(windStr) {
  if (!windStr) return null;
  const match = windStr.match(/(\d+)/);
  if (!match) return null;
  const mph = parseInt(match[1], 10);
  return Math.round(mph * 1.60934); // Convert mph to km/h
}

// Helper: Parse wind direction string to degrees
function parseWindDirection(dirStr) {
  if (!dirStr) return null;
  const directions = {
    'N': 0, 'NNE': 22, 'NE': 45, 'ENE': 67,
    'E': 90, 'ESE': 112, 'SE': 135, 'SSE': 157,
    'S': 180, 'SSW': 202, 'SW': 225, 'WSW': 247,
    'W': 270, 'WNW': 292, 'NW': 315, 'NNW': 337
  };
  return directions[dirStr.toUpperCase()] ?? null;
}

// Helper: Determine NOAA radar region from coordinates
function getRadarRegion(lat, lon) {
  for (const [region, config] of Object.entries(NOAA_RADAR_CONFIG)) {
    const { bounds } = config;
    if (lat >= bounds.minLat && lat <= bounds.maxLat &&
        lon >= bounds.minLon && lon <= bounds.maxLon) {
      return region;
    }
  }
  return null;
}

// Helper: Convert lat/lon to Web Mercator coordinates
function latLonToWebMercator(lat, lon) {
  const x = lon * 20037508.34 / 180;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  return { x, y: y * 20037508.34 / 180 };
}

// Helper: Calculate BBOX for radar tile request
function calculateRadarBbox(lat, lon, zoom = 7) {
  const { x, y } = latLonToWebMercator(lat, lon);
  // Approximate meters per pixel at this zoom level
  // At zoom 7, we want roughly 50-100 mile radius
  const halfWidth = 300000; // ~186 miles total width
  const halfHeight = 200000; // ~124 miles total height (card aspect ratio)
  return {
    minX: x - halfWidth,
    minY: y - halfHeight,
    maxX: x + halfWidth,
    maxY: y + halfHeight
  };
}

// Fetch weather data from Open-Meteo and transform to unified schema
const OPENMETEO_CACHE_TTL = 15 * 60; // 15 minutes

async function fetchWeatherOpenMeteo(lat, lon, cache, ctx, skipCache = false) {
  const cacheKey = `openmeteo:${truncateCoord(lat)},${truncateCoord(lon)}`;
  const cacheUrl = `https://weather.gripe/api/openmeteo-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl);

  // Delete existing cache if bypassing
  if (skipCache) {
    ctx.waitUntil(cache.delete(cacheRequest));
  } else {
    // Check cache first
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached.json();
    }
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toString());
  url.searchParams.set('longitude', lon.toString());
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,snowfall_sum,rain_sum');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('precipitation_unit', 'inch');

  // Fetch with exponential backoff retry for rate limits and server errors
  const maxRetries = 3;
  const baseDelay = 500; // ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url.toString());

    if (response.ok) {
      var data = await response.json();
      break;
    }

    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt === maxRetries) {
      const body = await response.text().catch(() => '');
      console.error(`Open-Meteo API error: ${response.status} ${response.statusText}`, body);
      throw new Error(`Weather fetch failed: ${response.status}`);
    }

    // Exponential backoff: 500ms, 1000ms, 2000ms
    const delay = baseDelay * Math.pow(2, attempt);
    console.log(`Open-Meteo rate limited (${response.status}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Transform to unified schema
  const result = {
    current: {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      wind: {
        speed: data.current.wind_speed_10m,
        direction: data.current.wind_direction_10m
      },
      condition: WMO_CONDITIONS[data.current.weather_code] || WMO_CONDITIONS[2],
      observedAt: null
    },
    daily: data.daily.time.map((date, i) => ({
      date,
      high: data.daily.temperature_2m_max[i],
      low: data.daily.temperature_2m_min[i],
      condition: {
        ...(WMO_CONDITIONS[data.daily.weather_code[i]] || WMO_CONDITIONS[2]),
        detail: null
      },
      precipitation: {
        probability: data.daily.precipitation_probability_max[i],
        amount: data.daily.precipitation_sum[i],
        snow: data.daily.snowfall_sum[i],
        rain: data.daily.rain_sum[i]
      },
      sunrise: data.daily.sunrise[i],
      sunset: data.daily.sunset[i]
    })),
    hourly: data.hourly?.time?.slice(0, 24).map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[i],
      condition: WMO_CONDITIONS[data.hourly.weather_code[i]] || WMO_CONDITIONS[2],
      precipProbability: data.hourly.precipitation_probability[i] || 0
    })) || [],
    timezone: data.timezone,
    source: 'open-meteo'
  };

  // Cache for 15 minutes
  const cacheResponse = new Response(JSON.stringify(result), {
    headers: {
      'Cache-Control': `public, max-age=${OPENMETEO_CACHE_TTL}`,
      'Content-Type': 'application/json'
    }
  });
  ctx.waitUntil(cache.put(cacheRequest, cacheResponse));

  return result;
}

const ALERTS_CACHE_TTL = 60; // 60 seconds - alerts need to be relatively fresh

// Fetch alerts from NWS (with short-lived cache)
async function fetchAlerts(lat, lon, cache, ctx) {
  const cacheKey = `alerts:${truncateCoord(lat)},${truncateCoord(lon)}`;
  const cacheUrl = `https://weather.gripe/api/alerts-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl);

  // Check cache first
  if (cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached.json();
    }
  }

  const url = new URL('https://api.weather.gov/alerts');
  url.searchParams.set('point', `${lat},${lon}`);
  url.searchParams.set('status', 'actual');
  url.searchParams.set('active', 'true');

  try {
    const response = await fetch(url.toString(), { headers: NWS_HEADERS });

    if (!response.ok) {
      if (response.status === 404) return []; // Non-US location
      throw new Error(`NWS API error: ${response.status}`);
    }

    const data = await response.json();
    const allAlerts = (data.features || []).map(f => ({
      id: f.properties.id,
      event: f.properties.event,
      headline: f.properties.headline,
      severity: f.properties.severity,
      urgency: f.properties.urgency,
      sent: f.properties.sent,
      onset: f.properties.onset,
      ends: f.properties.ends,
      description: f.properties.description,
      instruction: f.properties.instruction,
      senderName: f.properties.senderName,
      geometry: f.geometry || null,
      affectedZones: f.properties.affectedZones || []
    }));

    // Deduplicate by event type, keeping most recent
    const alertsByEvent = new Map();
    for (const alert of allAlerts) {
      const existing = alertsByEvent.get(alert.event);
      if (!existing || new Date(alert.sent) > new Date(existing.sent)) {
        alertsByEvent.set(alert.event, alert);
      }
    }
    const result = Array.from(alertsByEvent.values());

    // Cache alerts for 60 seconds
    if (cache && ctx) {
      const cacheResponse = new Response(JSON.stringify(result), {
        headers: { 'Cache-Control': `public, max-age=${ALERTS_CACHE_TTL}` }
      });
      ctx.waitUntil(cache.put(cacheRequest, cacheResponse));
    }

    return result;
  } catch (e) {
    console.error('NWS alerts error:', e);
    return [];
  }
}

// Fetch single zone geometry from NWS API with heavy caching
async function fetchZoneGeometry(zoneUrl, ctx) {
  // Extract zone ID from URL for cache key
  const zoneId = zoneUrl.split('/').pop();
  const cacheKey = `zone-${zoneId}`;
  const cacheUrl = `https://weather.gripe/api/zone-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl);

  // Check cache first
  const cache = caches.default;
  const cached = await cache.match(cacheRequest);
  if (cached) {
    return cached.json();
  }

  try {
    const response = await fetch(zoneUrl, { headers: NWS_HEADERS });
    if (!response.ok) {
      console.error(`Zone fetch failed: ${zoneUrl} - ${response.status}`);
      return null;
    }

    const data = await response.json();
    const geometry = data.geometry;

    if (!geometry) {
      return null;
    }

    // Normalize GeometryCollection to MultiPolygon
    let normalizedGeometry;
    if (geometry.type === 'GeometryCollection') {
      // Combine all polygons from the collection
      const allCoordinates = [];
      for (const geom of geometry.geometries) {
        if (geom.type === 'Polygon') {
          allCoordinates.push(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          allCoordinates.push(...geom.coordinates);
        }
      }
      normalizedGeometry = {
        type: 'MultiPolygon',
        coordinates: allCoordinates
      };
    } else if (geometry.type === 'Polygon') {
      normalizedGeometry = {
        type: 'MultiPolygon',
        coordinates: [geometry.coordinates]
      };
    } else {
      normalizedGeometry = geometry;
    }

    // Cache for 30 days
    if (ctx) {
      const cacheResponse = new Response(JSON.stringify(normalizedGeometry), {
        headers: { 'Cache-Control': `public, max-age=${NWS_ZONE_CACHE_TTL}` }
      });
      ctx.waitUntil(cache.put(cacheRequest, cacheResponse));
    }

    return normalizedGeometry;
  } catch (e) {
    console.error(`Zone fetch error: ${zoneUrl}`, e);
    return null;
  }
}

// Handle zone geometry API - fetches and combines multiple zones
async function handleZoneGeometry(request, env, ctx) {
  const url = new URL(request.url);
  const zonesParam = url.searchParams.get('zones');

  if (!zonesParam) {
    return jsonResponse({ error: 'Missing zones parameter' }, 400);
  }

  // Parse zone URLs (comma-separated)
  const zoneUrls = zonesParam.split(',').filter(z => z.startsWith('https://api.weather.gov/zones/'));

  if (zoneUrls.length === 0) {
    return jsonResponse({ error: 'No valid zone URLs provided' }, 400);
  }

  // Fetch all zone geometries in parallel
  const geometries = await Promise.all(
    zoneUrls.map(zoneUrl => fetchZoneGeometry(zoneUrl, ctx))
  );

  // Filter out failed fetches and combine into single MultiPolygon
  const validGeometries = geometries.filter(g => g !== null);

  if (validGeometries.length === 0) {
    return jsonResponse({ error: 'Failed to fetch zone geometries' }, 502);
  }

  // Combine all coordinates into a single MultiPolygon
  const allCoordinates = [];
  for (const geom of validGeometries) {
    if (geom.type === 'MultiPolygon') {
      allCoordinates.push(...geom.coordinates);
    } else if (geom.type === 'Polygon') {
      allCoordinates.push(geom.coordinates);
    }
  }

  const combinedGeometry = {
    type: 'MultiPolygon',
    coordinates: allCoordinates
  };

  return jsonResponse(combinedGeometry, 200, NWS_ZONE_CACHE_TTL);
}

// Handle consolidated location API
async function handleLocation(request, env, ctx) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const query = url.searchParams.get('q');
  const skipCache = shouldSkipCache(request);

  if ((!lat || !lon) && !query) {
    return jsonResponse({ error: 'Missing lat/lon or q parameter' }, 400);
  }

  // Validate lat/lon are finite numbers
  if (lat && lon) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      return jsonResponse({ error: 'Invalid lat/lon values' }, 400);
    }
  }

  // Check cache
  const cache = caches.default;
  const cacheKey = lat && lon
    ? `location:${truncateCoord(lat)},${truncateCoord(lon)}`
    : `location:q:${encodeURIComponent(query)}`;
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/api/location-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl.toString());

  // Delete existing cache if bypassing
  if (skipCache) {
    ctx.waitUntil(cache.delete(cacheRequest));
  } else {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached;
    }
  }

  try {
    // Get location info
    let location;
    let coords;
    let speculativePointsPromise = null;

    // Check if coordinates are likely in the US (rough bounding box)
    // Continental US: lat 24-49, lon -125 to -66
    // Also includes Alaska: lat 51-72, lon -180 to -130
    // Also includes Hawaii: lat 18-23, lon -161 to -154
    const isLikelyUS = (latNum, lonNum) => {
      // Continental US
      if (latNum >= 24 && latNum <= 49 && lonNum >= -125 && lonNum <= -66) return true;
      // Alaska
      if (latNum >= 51 && latNum <= 72 && lonNum >= -180 && lonNum <= -130) return true;
      // Hawaii
      if (latNum >= 18 && latNum <= 23 && lonNum >= -161 && lonNum <= -154) return true;
      return false;
    };

    if (lat && lon) {
      coords = { lat: truncateCoord(lat), lon: truncateCoord(lon) };

      // Speculatively start NWS points fetch if likely US (runs in parallel with geocode)
      if (isLikelyUS(coords.lat, coords.lon)) {
        speculativePointsPromise = fetchNWSPoints(coords.lat, coords.lon, cache, ctx, skipCache).catch(() => null);
      }

      location = await reverseGeocode(coords.lat, coords.lon, cache, ctx);
    } else {
      location = await forwardGeocode(query);
      coords = { lat: truncateCoord(location.latitude), lon: truncateCoord(location.longitude) };
    }

    // Determine if US location
    const isUS = location.country_code === 'us';

    // Fetch weather based on location
    let weather;
    let alerts = [];
    let nwsOffice = null;

    if (isUS) {
      // Start alerts fetch immediately - it's independent of weather/points
      const alertsPromise = fetchAlerts(coords.lat, coords.lon, cache, ctx);

      // Try NWS first for US locations
      try {
        // Use speculative points if available, otherwise fetch
        const points = (speculativePointsPromise && await speculativePointsPromise) ||
                       await fetchNWSPoints(coords.lat, coords.lon, cache, ctx, skipCache);
        nwsOffice = points.gridId;
        // Pass pre-fetched points to avoid redundant API call
        weather = await fetchWeatherNWS(coords.lat, coords.lon, cache, ctx, skipCache, points);
      } catch (e) {
        console.error('NWS failed, falling back to Open-Meteo:', e);
        weather = await fetchWeatherOpenMeteo(coords.lat, coords.lon, cache, ctx, skipCache);
        // Try to get NWS office for wxstory even if weather fetch failed
        try {
          const points = await fetchNWSPoints(coords.lat, coords.lon, cache, ctx, skipCache);
          nwsOffice = points.gridId;
        } catch (e2) {
          // Ignore - nwsOffice stays null
        }
      }

      // Wait for alerts (likely already resolved by now)
      alerts = await alertsPromise;
    } else {
      // Use Open-Meteo for non-US locations
      weather = await fetchWeatherOpenMeteo(coords.lat, coords.lon, cache, ctx, skipCache);
    }

    const result = {
      location: {
        ...location,
        timezone: weather.timezone,
        nwsOffice
      },
      weather,
      alerts
    };

    const response = jsonResponse(result, 200, LOCATION_CACHE_TTL);
    ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    return response;
  } catch (e) {
    console.error('Location API error:', e);
    return jsonResponse({ error: e.message || 'Failed to fetch location data' }, 500);
  }
}

// Handle geocoding API proxy
async function handleGeocode(request, env, ctx) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const skipCache = shouldSkipCache(request);

  if (!query) {
    return jsonResponse({ error: 'Missing q parameter' }, 400);
  }

  // Build cache key without the 'cache' parameter
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.delete('cache');
  const cacheKey = new Request(cacheUrl.toString());

  // Check cache
  const cache = caches.default;
  if (skipCache) {
    ctx.waitUntil(cache.delete(cacheKey));
  } else {
    const response = await cache.match(cacheKey);
    if (response) {
      return response;
    }
  }

  // Fetch from Open-Meteo geocoding
  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.searchParams.set('name', query);
  geocodeUrl.searchParams.set('count', '30');
  geocodeUrl.searchParams.set('language', 'en');
  geocodeUrl.searchParams.set('format', 'json');

  const apiResponse = await fetch(geocodeUrl.toString());
  if (!apiResponse.ok) {
    return jsonResponse({ error: 'Upstream API error' }, 502);
  }
  const data = await apiResponse.json();

  const response = jsonResponse(data, 200, GEOCODE_CACHE_TTL);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// Handle Unsplash API proxy (hides API key)
// Supports cascading fallback: location+condition -> region+condition -> condition only
async function handleUnsplash(request, env, ctx) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const location = url.searchParams.get('location');
  const region = url.searchParams.get('region');
  const skipCache = shouldSkipCache(request);

  if (!query) {
    return jsonResponse({ error: 'Missing query parameter' }, 400);
  }

  if (!env.UNSPLASH_ACCESS_KEY) {
    return jsonResponse({ error: 'Unsplash API not configured' }, 503);
  }

  // Build cache key without the 'cache' parameter
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.delete('cache');
  const cacheKey = new Request(cacheUrl.toString());

  // Check cache
  const cache = caches.default;
  if (skipCache) {
    ctx.waitUntil(cache.delete(cacheKey));
  } else {
    const response = await cache.match(cacheKey);
    if (response) {
      return response;
    }
  }

  // Build query variants for cascading fallback
  const queries = [];
  if (location && region) {
    queries.push(`${location} ${region} ${query}`); // e.g., "Seattle Washington rain weather"
  }
  if (location) {
    queries.push(`${location} ${query}`); // e.g., "Seattle rain weather"
  }
  if (region) {
    queries.push(`${region} ${query}`); // e.g., "Washington rain weather"
  }
  queries.push(query); // Base condition-only query as final fallback

  // Try each query in order until we find results
  let result = null;
  for (const searchQuery of queries) {
    const unsplashUrl = new URL('https://api.unsplash.com/search/photos');
    unsplashUrl.searchParams.set('query', searchQuery);
    unsplashUrl.searchParams.set('per_page', '30');
    unsplashUrl.searchParams.set('orientation', 'landscape');

    console.log(`[Unsplash] Trying query: "${searchQuery}"`);
    const apiResponse = await fetch(unsplashUrl.toString(), {
      headers: {
        'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}`
      }
    });

    if (!apiResponse.ok) {
      console.log(`[Unsplash] API error ${apiResponse.status}: ${await apiResponse.text()}`);
      continue; // Try next query variant
    }

    const data = await apiResponse.json();
    console.log(`[Unsplash] Got ${data.results?.length || 0} results for "${searchQuery}"`);
    if (data.results && data.results.length > 0) {
      // Return all photos so frontend can randomize (cache stores all, client picks)
      result = {
        photos: data.results.map(photo => ({
          url: photo.urls.regular,
          thumb: photo.urls.thumb,
          photographer: photo.user.name,
          username: photo.user.username,
          photographerUrl: photo.user.links.html,
          unsplashUrl: photo.links.html,
          downloadLocation: photo.links.download_location
        }))
      };
      break; // Found a result, stop searching
    }
  }

  // Use fallback image if Unsplash failed or returned no results
  if (!result) {
    console.log(`[Unsplash] Using fallback for query: "${query}"`);
    result = { photos: [selectFallbackImage(query)] };
  }

  const response = jsonResponse(result, 200, UNSPLASH_CACHE_TTL);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// HTMLRewriter handler to collect wxstory images
class ImageCollector {
  constructor() {
    this.images = [];
  }

  element(element) {
    if (element.tagName === 'img') {
      const src = element.getAttribute('src');
      if (src && src.toLowerCase().includes('wxstory')) {
        let fullUrl = src;
        if (src.startsWith('//')) {
          fullUrl = 'https:' + src;
        } else if (src.startsWith('/')) {
          fullUrl = 'https://www.weather.gov' + src;
        }
        this.images.push(fullUrl);
      }
    }
  }
}

// Countries that use imperial units
const IMPERIAL_COUNTRIES = new Set(['US', 'LR', 'MM']);

// Get default unit system based on country
function getDefaultUnits(countryCode) {
  return IMPERIAL_COUNTRIES.has(countryCode) ? 'imperial' : 'metric';
}

// HTMLRewriter to inject default units script
class DefaultUnitsInjector {
  constructor(units) {
    this.units = units;
  }

  element(element) {
    element.prepend(`<script>window.__defaultUnits="${this.units}";</script>`, { html: true });
  }
}

// Handle Cloudflare location detection API
async function handleCfLocation(request) {
  const cf = request.cf || {};

  if (!cf.latitude || !cf.longitude) {
    return jsonResponse({ error: 'Location not available' }, 404);
  }

  return jsonResponse({
    latitude: cf.latitude,
    longitude: cf.longitude,
    city: cf.city || null,
    region: cf.region || null,
    country: cf.country || null
  });
}

// Handle Unsplash download tracking (for API compliance)
async function handleUnsplashDownload(request, env) {
  const url = new URL(request.url);
  const downloadUrl = url.searchParams.get('url');

  if (!downloadUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, 400);
  }

  // Validate it's an Unsplash URL
  if (!downloadUrl.startsWith('https://api.unsplash.com/')) {
    return jsonResponse({ error: 'Invalid download URL' }, 400);
  }

  if (!env.UNSPLASH_ACCESS_KEY) {
    return jsonResponse({ error: 'Unsplash API not configured' }, 503);
  }

  try {
    // Trigger the download tracking (fire-and-forget on Unsplash's side)
    await fetch(downloadUrl, {
      headers: {
        'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}`
      }
    });
    return jsonResponse({ success: true });
  } catch (e) {
    console.error('Unsplash download tracking error:', e);
    return jsonResponse({ error: 'Tracking failed' }, 500);
  }
}

// Handle weather story API
async function handleWxStory(request, env, ctx) {
  const url = new URL(request.url);
  const office = url.searchParams.get('office');
  const skipCache = shouldSkipCache(request);

  if (!office || !/^[A-Za-z]{3}$/.test(office)) {
    return jsonResponse({ error: 'Invalid office code. Please provide a 3-letter NWS office code.' }, 400);
  }

  // Check cache
  const cache = caches.default;
  const cacheKey = `wxstory:${office.toUpperCase()}`;
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/api/wxstory-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl.toString());

  if (skipCache) {
    ctx.waitUntil(cache.delete(cacheRequest));
  } else {
    const cached = await cache.match(cacheRequest);
    if (cached) return cached;
  }

  try {
    const storyResponse = await fetch(
      `https://www.weather.gov/${office.toLowerCase()}/weatherstory`,
      {
        headers: {
          'User-Agent': 'weather.gripe (https://weather.gripe)'
        }
      }
    );

    if (!storyResponse.ok) {
      return jsonResponse({ office: office.toUpperCase(), images: [] }, 200, WXSTORY_CACHE_TTL);
    }

    const collector = new ImageCollector();
    const transformed = new HTMLRewriter()
      .on('img', collector)
      .transform(storyResponse);
    await transformed.text(); // consume to populate collector.images

    // Clean up double slashes in URLs and convert to proxy URLs
    const images = collector.images.map(x => {
      const cleanUrl = x.replaceAll('//', '/').replace(':/', '://');
      return `/api/wxstory/image?url=${encodeURIComponent(cleanUrl)}`;
    });

    const response = jsonResponse({ office: office.toUpperCase(), images }, 200, WXSTORY_CACHE_TTL);
    ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    return response;
  } catch (e) {
    console.error('Weather story fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch weather story', details: e.message }, 500);
  }
}

// Handle weather story image proxy - caches and serves wxstory images
async function handleWxStoryImage(request, env, ctx) {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, 400);
  }

  // Validate URL is from weather.gov and contains wxstory
  if (!imageUrl.startsWith('https://www.weather.gov/') || !imageUrl.toLowerCase().includes('wxstory')) {
    return jsonResponse({ error: 'Invalid wxstory image URL' }, 400);
  }

  const cache = caches.default;
  const cacheRequest = new Request(imageUrl);

  // Check cache
  const cached = await cache.match(cacheRequest);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'image/png',
        'Cache-Control': `public, max-age=${WXSTORY_IMAGE_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': 'weather.gripe (https://weather.gripe)' }
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Failed to fetch wxstory image' }, 502);
    }

    const contentType = response.headers.get('Content-Type') || 'image/png';
    const proxyResponse = new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${WXSTORY_IMAGE_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });

    ctx.waitUntil(cache.put(cacheRequest, proxyResponse.clone()));
    return proxyResponse;
  } catch (e) {
    console.error('WxStory image fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch wxstory image' }, 500);
  }
}

// Handle radar API - returns radar and basemap URLs for a location
async function handleRadar(request, env, ctx) {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return jsonResponse({ error: 'Invalid lat/lon parameters' }, 400);
  }

  // Determine radar region
  const region = getRadarRegion(lat, lon);
  if (!region) {
    return jsonResponse({
      coverage: false,
      error: 'Location outside NOAA radar coverage'
    });
  }

  const config = NOAA_RADAR_CONFIG[region];
  const cache = caches.default;

  // Check for cached timestamp
  const timestampCacheKey = `radar-timestamp:${region}`;
  const timestampCacheUrl = `https://weather.gripe/api/radar-cache/${timestampCacheKey}`;
  const timestampCacheRequest = new Request(timestampCacheUrl);

  let timestamp = null;
  const cached = await cache.match(timestampCacheRequest);
  if (cached) {
    const data = await cached.json();
    timestamp = data.timestamp;
  } else {
    // Fetch GetCapabilities to get latest timestamp
    try {
      const capabilitiesUrl = `https://opengeo.ncep.noaa.gov/geoserver/${region}/wms?service=WMS&version=1.1.1&request=GetCapabilities`;
      const capResponse = await fetch(capabilitiesUrl, {
        headers: { 'User-Agent': 'weather.gripe (https://weather.gripe)' }
      });
      if (capResponse.ok) {
        const capText = await capResponse.text();
        // Extract timestamp from capabilities (look for time dimension in the specific layer)
        const layerRegex = new RegExp(`<Name>${region}:${config.layer}</Name>[\\s\\S]*?<Dimension[^>]*name="time"[^>]*>([^<]+)</Dimension>`, 'i');
        const timeMatch = capText.match(layerRegex);
        if (timeMatch) {
          const times = timeMatch[1].split(',');
          timestamp = times[times.length - 1].trim();
        }
      }
    } catch (e) {
      console.error('Failed to fetch radar capabilities:', e);
    }

    // Cache timestamp for 1 minute
    if (timestamp) {
      const timestampResponse = new Response(JSON.stringify({ timestamp }), {
        headers: { 'Cache-Control': `public, max-age=${RADAR_TIMESTAMP_CACHE_TTL}` }
      });
      ctx.waitUntil(cache.put(timestampCacheRequest, timestampResponse));
    }
  }

  // Calculate BBOX for this location
  const bbox = calculateRadarBbox(lat, lon);
  const bboxStr = `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`;

  // Return radar metadata for client-side MapLibre rendering
  // Client builds WMS URLs dynamically with {bbox-epsg-3857} placeholder
  return jsonResponse({
    coverage: true,
    region,
    timestamp,
    bbox: bboxStr,
    center: { lat, lon }
  });
}

// Handle radar tile proxy - proxies NOAA radar tiles to handle CORS
// Accepts region, layer, time, bbox params and constructs WMS URL server-side
async function handleRadarTile(request, env, ctx) {
  const url = new URL(request.url);

  // Get parameters - bbox is substituted by MapLibre at request time
  const region = url.searchParams.get('region');
  const layer = url.searchParams.get('layer');
  const time = url.searchParams.get('time');
  const bbox = url.searchParams.get('bbox');

  if (!region || !layer || !bbox) {
    return jsonResponse({ error: 'Missing required parameters (region, layer, bbox)' }, 400);
  }

  // Validate region is one of our known regions
  if (!NOAA_RADAR_CONFIG[region]) {
    return jsonResponse({ error: 'Invalid radar region' }, 400);
  }

  // Validate layer matches the configured layer for this region
  if (layer !== NOAA_RADAR_CONFIG[region].layer) {
    return jsonResponse({ error: 'Invalid layer for region' }, 400);
  }

  // Build the NOAA WMS URL server-side
  const wmsParams = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    width: '256',
    height: '256',
    srs: 'EPSG:3857',
    bbox: bbox
  });
  if (time) {
    wmsParams.set('time', time);
  }
  const tileUrl = `https://opengeo.ncep.noaa.gov/geoserver/${region}/${layer}/ows?${wmsParams.toString()}`;

  const cache = caches.default;
  const cacheRequest = new Request(tileUrl);

  // Check cache
  const cached = await cache.match(cacheRequest);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${RADAR_TILE_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const response = await fetch(tileUrl, {
      headers: { 'User-Agent': 'weather.gripe (https://weather.gripe)' }
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Failed to fetch radar tile' }, 502);
    }

    const proxyResponse = new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/png',
        'Cache-Control': `public, max-age=${RADAR_TILE_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });

    ctx.waitUntil(cache.put(cacheRequest, proxyResponse.clone()));
    return proxyResponse;
  } catch (e) {
    console.error('Radar tile fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch radar tile' }, 500);
  }
}

// Handle basemap tile proxy - proxies CARTO basemap tiles to handle CORS
async function handleBasemapTile(request, env, ctx) {
  const url = new URL(request.url);
  const tileUrl = url.searchParams.get('url');

  if (!tileUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, 400);
  }

  // Validate URL is from allowed basemap providers
  if (!tileUrl.startsWith('https://ows.mundialis.de/')) {
    return jsonResponse({ error: 'Invalid basemap tile URL' }, 400);
  }

  const cache = caches.default;
  const cacheRequest = new Request(tileUrl);

  // Check cache
  const cached = await cache.match(cacheRequest);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${BASEMAP_TILE_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const response = await fetch(tileUrl, {
      headers: { 'User-Agent': 'weather.gripe (https://weather.gripe)' }
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Failed to fetch basemap tile' }, 502);
    }

    const proxyResponse = new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/png',
        'Cache-Control': `public, max-age=${BASEMAP_TILE_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });

    ctx.waitUntil(cache.put(cacheRequest, proxyResponse.clone()));
    return proxyResponse;
  } catch (e) {
    console.error('Basemap tile fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch basemap tile' }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API routes
    if (path === '/api/location') {
      return handleLocation(request, env, ctx);
    }
    if (path === '/api/geocode') {
      return handleGeocode(request, env, ctx);
    }
    if (path === '/api/unsplash') {
      return handleUnsplash(request, env, ctx);
    }
    if (path === '/api/unsplash/download') {
      return handleUnsplashDownload(request, env);
    }
    if (path === '/api/wxstory') {
      return handleWxStory(request, env, ctx);
    }
    if (path === '/api/wxstory/image') {
      return handleWxStoryImage(request, env, ctx);
    }
    if (path === '/api/cf-location') {
      return handleCfLocation(request);
    }
    if (path === '/api/radar') {
      return handleRadar(request, env, ctx);
    }
    if (path === '/api/radar/tile') {
      return handleRadarTile(request, env, ctx);
    }
    if (path === '/api/basemap/tile') {
      return handleBasemapTile(request, env, ctx);
    }
    if (path === '/api/zones') {
      return handleZoneGeometry(request, env, ctx);
    }

    // For all other routes, let the static assets handler take over
    const response = await env.ASSETS.fetch(request);

    // Inject default units into HTML responses based on country
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const country = request.cf?.country || 'US';
      const defaultUnits = getDefaultUnits(country);
      return new HTMLRewriter()
        .on('head', new DefaultUnitsInjector(defaultUnits))
        .transform(response);
    }

    return response;
  }
};
