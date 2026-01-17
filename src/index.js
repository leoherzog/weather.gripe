// Weather.gripe Cloudflare Worker
// Proxies and caches Open-Meteo and Unsplash APIs

const WEATHER_CACHE_TTL = 15 * 60; // 15 minutes
const GEOCODE_CACHE_TTL = 24 * 60 * 60; // 24 hours
const UNSPLASH_CACHE_TTL = 24 * 60 * 60; // 24 hours
const ALERTS_CACHE_TTL = 5 * 60; // 5 minutes

// Truncate coordinates to 3 decimal places (~111m precision)
function truncateCoord(coord) {
  return Math.round(parseFloat(coord) * 1000) / 1000;
}

// Handle weather API proxy
async function handleWeather(request, env, ctx) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing lat/lon parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const truncLat = truncateCoord(lat);
  const truncLon = truncateCoord(lon);

  // Check cache first
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('lat', truncLat.toString());
  cacheUrl.searchParams.set('lon', truncLon.toString());
  const cacheRequest = new Request(cacheUrl.toString());

  let response = await cache.match(cacheRequest);
  if (response) {
    return response;
  }

  // Fetch from Open-Meteo (always metric)
  const openMeteoUrl = new URL('https://api.open-meteo.com/v1/forecast');
  openMeteoUrl.searchParams.set('latitude', truncLat.toString());
  openMeteoUrl.searchParams.set('longitude', truncLon.toString());
  openMeteoUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,uv_index');
  openMeteoUrl.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  openMeteoUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max');
  openMeteoUrl.searchParams.set('timezone', 'auto');
  openMeteoUrl.searchParams.set('forecast_days', '7');

  const apiResponse = await fetch(openMeteoUrl.toString());
  const data = await apiResponse.json();

  response = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${WEATHER_CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*'
    }
  });

  // Store in cache
  ctx.waitUntil(cache.put(cacheRequest, response.clone()));

  return response;
}

// Handle geocoding API proxy
async function handleGeocode(request, env, ctx) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing q parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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
  const data = await apiResponse.json();

  response = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${GEOCODE_CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*'
    }
  });

  // Store in cache
  ctx.waitUntil(cache.put(request, response.clone()));

  return response;
}

// Handle Unsplash API proxy (hides API key)
async function handleUnsplash(request, env, ctx) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.UNSPLASH_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'Unsplash API not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
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
  const data = await apiResponse.json();

  // Extract just the image URL and attribution
  let result = { error: 'No images found' };
  if (data.results && data.results.length > 0) {
    const photo = data.results[0];
    result = {
      url: photo.urls.regular,
      thumb: photo.urls.thumb,
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      unsplashUrl: photo.links.html
    };
  }

  response = new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${UNSPLASH_CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*'
    }
  });

  // Store in cache
  ctx.waitUntil(cache.put(request, response.clone()));

  return response;
}

// Handle NWS alerts API proxy
async function handleAlerts(request, env, ctx) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing lat/lon parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const truncLat = truncateCoord(lat);
  const truncLon = truncateCoord(lon);

  // Check cache
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('lat', truncLat.toString());
  cacheUrl.searchParams.set('lon', truncLon.toString());
  const cacheRequest = new Request(cacheUrl.toString());

  let response = await cache.match(cacheRequest);
  if (response) return response;

  // Fetch from NWS
  const nwsUrl = new URL('https://api.weather.gov/alerts/active');
  nwsUrl.searchParams.set('point', `${truncLat},${truncLon}`);
  nwsUrl.searchParams.set('status', 'actual');
  nwsUrl.searchParams.set('message_type', 'alert,update');

  try {
    const apiResponse = await fetch(nwsUrl.toString(), {
      headers: {
        'User-Agent': 'weather.gripe (https://weather.gripe)',
        'Accept': 'application/geo+json'
      }
    });

    if (!apiResponse.ok) {
      // NWS returns 404 for non-US locations
      if (apiResponse.status === 404) {
        return new Response(JSON.stringify({ features: [] }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${ALERTS_CACHE_TTL}`,
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      throw new Error(`NWS API error: ${apiResponse.status}`);
    }

    const data = await apiResponse.json();

    // Filter to Severe/Extreme only, transform to minimal shape
    const alerts = (data.features || [])
      .filter(f => f.properties?.severity === 'Severe' || f.properties?.severity === 'Extreme')
      .map(f => ({
        id: f.properties.id,
        event: f.properties.event,
        headline: f.properties.headline,
        severity: f.properties.severity,
        description: f.properties.description,
        instruction: f.properties.instruction,
        effective: f.properties.effective,
        expires: f.properties.expires
      }));

    response = new Response(JSON.stringify({ features: alerts }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ALERTS_CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });

    ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    return response;
  } catch (e) {
    console.error('NWS API error:', e);
    return new Response(JSON.stringify({ error: 'Failed to fetch alerts', features: [] }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API routes
    if (path === '/api/weather') {
      return handleWeather(request, env, ctx);
    }
    if (path === '/api/geocode') {
      return handleGeocode(request, env, ctx);
    }
    if (path === '/api/unsplash') {
      return handleUnsplash(request, env, ctx);
    }
    if (path === '/api/alerts') {
      return handleAlerts(request, env, ctx);
    }

    // For all other routes, let the static assets handler take over
    // This is handled by Cloudflare Workers' assets feature
    return env.ASSETS.fetch(request);
  }
};
