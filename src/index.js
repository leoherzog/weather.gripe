// Weather.gripe Cloudflare Worker
// Proxies and caches Open-Meteo and Unsplash APIs

const GEOCODE_CACHE_TTL = 24 * 60 * 60; // 24 hours
const UNSPLASH_CACHE_TTL = 24 * 60 * 60; // 24 hours
const LOCATION_CACHE_TTL = 5 * 60; // 5 minutes (limited by alerts)
const WXSTORY_CACHE_TTL = 5 * 60; // 5 minutes

const NOMINATIM_HEADERS = {
  'User-Agent': 'weather.gripe/1.0 (https://weather.gripe)',
  'Accept': 'application/json'
};

const NWS_HEADERS = {
  'User-Agent': 'weather.gripe (https://weather.gripe)',
  'Accept': 'application/geo+json'
};

// Truncate coordinates to 3 decimal places (~111m precision)
function truncateCoord(coord) {
  return Math.round(parseFloat(coord) * 1000) / 1000;
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

// Reverse geocode coordinates to location name via Nominatim
async function reverseGeocode(lat, lon) {
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

  return {
    name: addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Unknown',
    region: [addr.state, addr.country].filter(Boolean).join(', '),
    latitude: parseFloat(data.lat),
    longitude: parseFloat(data.lon),
    country_code: addr.country_code
  };
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
  // Parse display_name to extract city and region
  const parts = result.display_name.split(', ');

  return {
    name: parts[0] || 'Unknown',
    region: parts.slice(1).join(', '),
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
    country_code: addr.country_code || null
  };
}

// Fetch weather data from Open-Meteo
async function fetchWeather(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toString());
  url.searchParams.set('longitude', lon.toString());
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,uv_index');
  // Hourly data not used by frontend, omitting to reduce payload
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,snowfall_sum,rain_sum');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('precipitation_unit', 'inch');

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('Weather fetch failed');
  return response.json();
}

// Fetch alerts from NWS
async function fetchAlerts(lat, lon) {
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
      senderName: f.properties.senderName
    }));

    // Deduplicate by event type, keeping most recent
    const alertsByEvent = new Map();
    for (const alert of allAlerts) {
      const existing = alertsByEvent.get(alert.event);
      if (!existing || new Date(alert.sent) > new Date(existing.sent)) {
        alertsByEvent.set(alert.event, alert);
      }
    }
    return Array.from(alertsByEvent.values());
  } catch (e) {
    console.error('NWS alerts error:', e);
    return [];
  }
}

// Fetch NWS office code for a location
async function fetchNWSOffice(lat, lon) {
  const url = `https://api.weather.gov/points/${lat},${lon}`;
  try {
    const response = await fetch(url, { headers: NWS_HEADERS });
    if (!response.ok) return null; // Non-US location returns 404
    const data = await response.json();
    return data.properties?.gridId || null;
  } catch (e) {
    console.error('NWS office lookup error:', e);
    return null;
  }
}

// Handle consolidated location API
async function handleLocation(request, env, ctx) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const query = url.searchParams.get('q');

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

  const cached = await cache.match(cacheRequest);
  if (cached) return cached;

  try {
    // Get location info
    let location;
    let coords;

    if (lat && lon) {
      coords = { lat: truncateCoord(lat), lon: truncateCoord(lon) };
      location = await reverseGeocode(coords.lat, coords.lon);
    } else {
      location = await forwardGeocode(query);
      coords = { lat: truncateCoord(location.latitude), lon: truncateCoord(location.longitude) };
    }

    // Fetch weather, alerts, and NWS office in parallel
    const [weather, alerts, nwsOffice] = await Promise.all([
      fetchWeather(coords.lat, coords.lon),
      fetchAlerts(coords.lat, coords.lon),
      fetchNWSOffice(coords.lat, coords.lon)
    ]);

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

  if (!query) {
    return jsonResponse({ error: 'Missing q parameter' }, 400);
  }

  // Check cache first
  const cache = caches.default;
  let response = await cache.match(request);
  if (response) {
    return response;
  }

  // Fetch from Open-Meteo geocoding
  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.searchParams.set('name', query);
  geocodeUrl.searchParams.set('count', '10');
  geocodeUrl.searchParams.set('language', 'en');
  geocodeUrl.searchParams.set('format', 'json');

  const apiResponse = await fetch(geocodeUrl.toString());
  if (!apiResponse.ok) {
    return jsonResponse({ error: 'Upstream API error' }, 502);
  }
  const data = await apiResponse.json();

  response = jsonResponse(data, 200, GEOCODE_CACHE_TTL);
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

// Handle Unsplash API proxy (hides API key)
async function handleUnsplash(request, env, ctx) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');

  if (!query) {
    return jsonResponse({ error: 'Missing query parameter' }, 400);
  }

  if (!env.UNSPLASH_ACCESS_KEY) {
    return jsonResponse({ error: 'Unsplash API not configured' }, 503);
  }

  // Check cache first
  const cache = caches.default;
  let response = await cache.match(request);
  if (response) {
    return response;
  }

  // Fetch from Unsplash
  const unsplashUrl = new URL('https://api.unsplash.com/search/photos');
  unsplashUrl.searchParams.set('query', query);
  unsplashUrl.searchParams.set('per_page', '1');
  unsplashUrl.searchParams.set('orientation', 'landscape');

  const apiResponse = await fetch(unsplashUrl.toString(), {
    headers: {
      'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}`
    }
  });
  if (!apiResponse.ok) {
    return jsonResponse({ error: 'Upstream API error' }, 502);
  }
  const data = await apiResponse.json();

  // Extract just the image URL and attribution
  let result = { error: 'No images found' };
  if (data.results && data.results.length > 0) {
    const photo = data.results[0];
    result = {
      url: photo.urls.regular,
      thumb: photo.urls.thumb,
      photographer: photo.user.name,
      username: photo.user.username,
      photographerUrl: photo.user.links.html,
      unsplashUrl: photo.links.html
    };
  }

  response = jsonResponse(result, 200, UNSPLASH_CACHE_TTL);
  ctx.waitUntil(cache.put(request, response.clone()));
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

// Handle weather story API
async function handleWxStory(request, env, ctx) {
  const url = new URL(request.url);
  const office = url.searchParams.get('office');

  if (!office || !/^[A-Za-z]{3}$/.test(office)) {
    return jsonResponse({ error: 'Invalid office code. Please provide a 3-letter NWS office code.' }, 400);
  }

  // Check cache first
  const cache = caches.default;
  const cacheKey = `wxstory:${office.toUpperCase()}`;
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/api/wxstory-cache/${cacheKey}`;
  const cacheRequest = new Request(cacheUrl.toString());

  const cached = await cache.match(cacheRequest);
  if (cached) return cached;

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

    // Clean up double slashes in URLs
    const images = collector.images.map(x =>
      x.replaceAll('//', '/').replace(':/', '://')
    );

    const response = jsonResponse({ office: office.toUpperCase(), images }, 200, WXSTORY_CACHE_TTL);
    ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    return response;
  } catch (e) {
    console.error('Weather story fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch weather story', details: e.message }, 500);
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
    if (path === '/api/wxstory') {
      return handleWxStory(request, env, ctx);
    }
    if (path === '/api/cf-location') {
      return handleCfLocation(request);
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
