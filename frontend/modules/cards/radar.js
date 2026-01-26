// Radar card renderer with lazy-loaded MapLibre

import { CARD_WIDTH, CARD_HEIGHT, drawWatermark, drawFallbackBackground, drawWeatherIcon } from './core.js';
import { createCardContainer, createCardActions, shareCard, downloadCard } from './share.js';

// MapLibre is lazy-loaded
let maplibregl = null;

async function ensureMapLibre() {
  if (!maplibregl) {
    const mod = await import('maplibre-gl');
    maplibregl = mod.default;
    // Also import CSS
    await import('maplibre-gl/dist/maplibre-gl.css');
  }
  return maplibregl;
}

// Radar dBZ color scale (reflectivity values and colors)
const radarColors = [
  { dbz: 5, color: '#04e9e7' },   // Light cyan
  { dbz: 10, color: '#019ff4' },  // Light blue
  { dbz: 15, color: '#0300f4' },  // Blue
  { dbz: 20, color: '#02fd02' },  // Green
  { dbz: 25, color: '#01c501' },  // Dark green
  { dbz: 30, color: '#008e00' },  // Darker green
  { dbz: 35, color: '#fdf802' },  // Yellow
  { dbz: 40, color: '#e5bc00' },  // Gold
  { dbz: 45, color: '#fd9500' },  // Orange
  { dbz: 50, color: '#fd0000' },  // Red
  { dbz: 55, color: '#d40000' },  // Dark red
  { dbz: 60, color: '#bc0000' },  // Darker red
  { dbz: 65, color: '#f800fd' },  // Magenta
  { dbz: 70, color: '#9854c6' },  // Purple
];

// Draw location marker (red pin with white glow)
function drawLocationMarker(ctx, x, y, size = 24) {
  ctx.save();
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 4;
  drawWeatherIcon(ctx, 'fa-location-dot', x, y - size / 2, size, '#ef4444');
  ctx.restore();
}

// Draw radar header bar
// timezone: IANA timezone string for displaying location's local time
function drawRadarHeader(ctx, width, radarData, locationName, timezone = null) {
  const headerHeight = 70;

  // Semi-transparent header background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, width, headerHeight);

  // Title (left side)
  ctx.fillStyle = 'white';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const title = locationName || 'Radar';
  ctx.fillText(title, 24, headerHeight / 2);

  // Timestamp (right side) - use location's timezone if provided
  if (radarData?.timestamp) {
    ctx.font = '24px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    const date = new Date(radarData.timestamp);
    const timeOpts = { hour: 'numeric', minute: '2-digit' };
    if (timezone) timeOpts.timeZone = timezone;
    const timeStr = date.toLocaleTimeString(undefined, timeOpts);
    ctx.fillText(`Updated: ${timeStr}`, width - 24, headerHeight / 2);
  }
}

// Draw radar legend (dBZ color scale)
function drawRadarLegend(ctx, width, height) {
  const legendWidth = 200;
  const legendHeight = 20;
  const legendX = width - legendWidth - 24;
  const legendY = height - 60;

  // Background for legend
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(legendX - 10, legendY - 25, legendWidth + 20, legendHeight + 45);

  // Draw color gradient
  const segmentWidth = legendWidth / radarColors.length;
  for (let i = 0; i < radarColors.length; i++) {
    ctx.fillStyle = radarColors[i].color;
    ctx.fillRect(legendX + i * segmentWidth, legendY, segmentWidth + 1, legendHeight);
  }

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

  // Labels
  ctx.fillStyle = 'white';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('dBZ', legendX + legendWidth / 2, legendY - 20);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('5', legendX, legendY + legendHeight + 4);
  ctx.textAlign = 'right';
  ctx.fillText('70+', legendX + legendWidth, legendY + legendHeight + 4);
}

// Convert Web Mercator (EPSG:3857) coordinates to lat/lon
function webMercatorToLatLon(x, y) {
  const lon = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return { lat, lon };
}

// Create radar card with embedded MapLibre map
// Returns a wa-card element (not a canvas)
export async function createRadarCard(radarData, locationName, timezone = null) {
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;

  // Check if radar data indicates no coverage - fall back to canvas
  if (!radarData || radarData.coverage === false) {
    const canvas = document.createElement('canvas');
    renderRadarUnavailable(canvas, locationName, timezone);
    return createCardContainer(canvas, 'radar');
  }

  // Ensure MapLibre is loaded
  const MapLibre = await ensureMapLibre();

  // Parse bbox to get bounds
  const [minX, minY, maxX, maxY] = radarData.bbox.split(',').map(Number);
  const sw = webMercatorToLatLon(minX, minY);
  const ne = webMercatorToLatLon(maxX, maxY);

  // Create card container
  const card = document.createElement('wa-card');
  card.className = 'weather-card';
  card.dataset.cardType = 'radar';

  // Create map wrapper with proper aspect ratio
  const mapWrapper = document.createElement('div');
  mapWrapper.setAttribute('slot', 'media');
  mapWrapper.style.cssText = `position:relative;width:100%;aspect-ratio:${width}/${height};`;

  // Create map container
  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = 'position:absolute;inset:0;';
  mapWrapper.appendChild(mapContainer);

  // Create overlay canvas for header/legend/marker/watermark
  const overlay = document.createElement('canvas');
  overlay.width = width;
  overlay.height = height;
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  mapWrapper.appendChild(overlay);

  card.appendChild(mapWrapper);

  // Initialize map after element is in DOM
  let map = null;
  const initMap = () => {
    map = new MapLibre.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/fiord',
      bounds: [[sw.lon, sw.lat], [ne.lon, ne.lat]],
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false,
      fitBoundsOptions: { padding: 0 }
    });

    // Ignore missing sprite images
    map.on('styleimagemissing', () => {});

    map.on('load', () => {
      // Build radar WMS tile URL - bbox must be a top-level param for MapLibre substitution
      const layer = `${radarData.region}_bref_qcd`;
      const baseParams = new URLSearchParams({
        region: radarData.region,
        layer: layer,
        time: radarData.timestamp || ''
      });
      const proxiedRadarUrl = `/api/radar/tile?${baseParams.toString()}&bbox={bbox-epsg-3857}`;

      // Add NOAA radar WMS layer
      map.addSource('noaa-radar', {
        type: 'raster',
        tiles: [proxiedRadarUrl],
        tileSize: 256
      });

      map.addLayer({
        id: 'radar-layer',
        type: 'raster',
        source: 'noaa-radar',
        paint: { 'raster-opacity': 0.9 }
      });

      // Debug: log any tile errors
      map.on('error', (e) => {
        console.error('Map error:', e.error?.message || e);
      });

      // Add highways overlay on top of radar (OpenFreeMap uses OpenMapTiles schema)
      map.addLayer({
        id: 'highways-overlay',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 2],
          'line-opacity': 0.5
        }
      });
    });

    // Draw overlay elements once map is fully loaded and positioned
    const ctx = overlay.getContext('2d');
    map.once('idle', () => {
      drawLocationMarker(ctx, width / 2, height / 2, 32);
      drawRadarHeader(ctx, width, radarData, locationName, timezone);
      // drawRadarLegend(ctx, width, height);
      drawWatermark(ctx, width, height, 'NOAA', timezone);
    });
  };

  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    if (mapContainer.isConnected) {
      initMap();
    } else {
      // Wait for element to be connected
      const observer = new MutationObserver(() => {
        if (mapContainer.isConnected) {
          observer.disconnect();
          initMap();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });

  // Export function for share/download - combines map + overlay
  const exportToCanvas = async () => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d');

    if (map) {
      // Draw map
      const mapCanvas = map.getCanvas();
      ctx.drawImage(mapCanvas, 0, 0, width, height);
    }
    // Draw overlay on top
    ctx.drawImage(overlay, 0, 0);
    return exportCanvas;
  };

  // Add share/download actions
  card.appendChild(createCardActions(
    async () => {
      const canvas = await exportToCanvas();
      shareCard(canvas, 'radar');
    },
    async () => {
      const canvas = await exportToCanvas();
      downloadCard(canvas, 'radar');
    }
  ));

  // Store cleanup function
  card._cleanup = () => {
    if (map) {
      map.remove();
      map = null;
    }
  };

  return card;
}

// Render "radar unavailable" card for non-US locations
export function renderRadarUnavailable(canvas, locationName, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
  canvas.width = width;
  canvas.height = height;

  // Dark background
  drawFallbackBackground(ctx, width, height);

  // Header
  drawRadarHeader(ctx, width, null, locationName, timezone);

  // Message
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Radar not available for this location', width / 2, height / 2 - 20);
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('NOAA radar coverage is limited to US territories', width / 2, height / 2 + 30);

  // Watermark
  drawWatermark(ctx, width, height, null, timezone);

  return canvas;
}

// Render radar error card
export function renderRadarError(canvas, message, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
  canvas.width = width;
  canvas.height = height;

  // Dark background
  drawFallbackBackground(ctx, width, height);

  // Error message
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message || 'Radar temporarily unavailable', width / 2, height / 2);

  // Watermark
  drawWatermark(ctx, width, height, null, timezone);

  return canvas;
}
