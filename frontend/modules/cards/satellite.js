// Satellite imagery card renderer with lazy-loaded MapLibre

import { CARD_WIDTH, CARD_HEIGHT, drawWatermark, drawFallbackBackground, drawWeatherIcon, cardText, cardOverlay } from './core.js';
import { getRadarMarkerColor } from '../utils/palette-colors.js';
import { createCardContainer, createCardActions, shareCard, downloadCard } from './share.js';
import { ensureMapLibre, waitForDOMConnection, exportMapToCanvas } from '../utils/map-utils.js';
import { attachLightboxHandler } from '../ui/lightbox.js';

// Layout constants
const HEADER_HEIGHT = 70;
const HEADER_PADDING = 24;
const HEADER_BG_OPACITY = 0.7;
const TITLE_FONT_SIZE = 36;

const MARKER_DEFAULT_SIZE = 24;
const MARKER_LARGE_SIZE = 32;
const MARKER_GLOW_COLOR = 'white';
const MARKER_GLOW_BLUR = 4;

const UNAVAILABLE_MESSAGE_FONT_SIZE = 36;
const UNAVAILABLE_SUBMESSAGE_FONT_SIZE = 24;
const UNAVAILABLE_MESSAGE_OFFSET_Y = 20;
const UNAVAILABLE_SUBMESSAGE_OFFSET_Y = 30;
const UNAVAILABLE_TEXT_OPACITY = 0.7;
const UNAVAILABLE_SUBTEXT_OPACITY = 0.5;

// Web Mercator projection constant (Earth's circumference / 2 in meters)
const WEB_MERCATOR_EXTENT = 20037508.34;

// Draw location marker (red pin with white glow)
function drawLocationMarker(ctx, x, y, size = MARKER_DEFAULT_SIZE) {
  ctx.save();
  ctx.shadowColor = MARKER_GLOW_COLOR;
  ctx.shadowBlur = MARKER_GLOW_BLUR;
  drawWeatherIcon(ctx, 'fa-location-dot', x, y - size / 2, size, getRadarMarkerColor());
  ctx.restore();
}

// Draw satellite header bar
function drawSatelliteHeader(ctx, width, locationName) {
  // Semi-transparent header background
  ctx.fillStyle = cardOverlay(HEADER_BG_OPACITY);
  ctx.fillRect(0, 0, width, HEADER_HEIGHT);

  // Title (left side)
  ctx.fillStyle = cardText();
  ctx.font = `bold ${TITLE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const title = locationName ? `${locationName} Satellite` : 'Satellite';
  ctx.fillText(title, HEADER_PADDING, HEADER_HEIGHT / 2);
}

// Convert Web Mercator (EPSG:3857) coordinates to lat/lon
function webMercatorToLatLon(x, y) {
  const lon = (x / WEB_MERCATOR_EXTENT) * 180;
  let lat = (y / WEB_MERCATOR_EXTENT) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return { lat, lon };
}

// Create satellite card with embedded MapLibre map
// Returns a wa-card element (not a canvas)
export async function createSatelliteCard(satelliteData, locationName, timezone = null) {
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;

  // Check if satellite data indicates no coverage - fall back to canvas
  if (!satelliteData || satelliteData.coverage === false) {
    const canvas = document.createElement('canvas');
    renderSatelliteUnavailable(canvas, locationName, timezone);
    return createCardContainer(canvas, 'satellite');
  }

  // Ensure MapLibre is loaded
  const MapLibre = await ensureMapLibre();

  // Parse bbox to get bounds
  const [minX, minY, maxX, maxY] = satelliteData.bbox.split(',').map(Number);
  const sw = webMercatorToLatLon(minX, minY);
  const ne = webMercatorToLatLon(maxX, maxY);
  const mapBounds = [[sw.lon, sw.lat], [ne.lon, ne.lat]];

  // Create card container
  const card = document.createElement('wa-card');
  card.className = 'weather-card';
  card.dataset.cardType = 'satellite';

  // Create map wrapper with proper aspect ratio
  const mapWrapper = document.createElement('div');
  mapWrapper.setAttribute('slot', 'media');
  mapWrapper.className = 'map-wrapper';
  mapWrapper.style.aspectRatio = `${width}/${height}`;

  // Create map container
  const mapContainer = document.createElement('div');
  mapContainer.className = 'map-container';
  mapWrapper.appendChild(mapContainer);

  // Create overlay canvas for header/marker/watermark
  const overlay = document.createElement('canvas');
  overlay.width = width;
  overlay.height = height;
  overlay.className = 'map-overlay';
  mapWrapper.appendChild(overlay);

  // Zoom controls
  const zoomOut = document.createElement('button');
  zoomOut.className = 'radar-zoom-btn radar-zoom-out';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomOut.innerHTML = '<wa-icon name="minus"></wa-icon>';
  mapWrapper.appendChild(zoomOut);

  const zoomIn = document.createElement('button');
  zoomIn.className = 'radar-zoom-btn radar-zoom-in';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  zoomIn.innerHTML = '<wa-icon name="plus"></wa-icon>';
  mapWrapper.appendChild(zoomIn);

  zoomOut.addEventListener('click', (e) => {
    e.stopPropagation();
    if (map) map.zoomOut({ duration: 200 });
  });

  zoomIn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (map) map.zoomIn({ duration: 200 });
  });

  card.appendChild(mapWrapper);

  // Initialize map after element is in DOM
  let map = null;
  let resizeObserver = null;
  const initMap = () => {
    const syncMapToBounds = () => {
      if (!map) return;
      map.resize();
      map.fitBounds(mapBounds, { padding: 0, duration: 0 });
    };

    // Render at overlay resolution so map is as crisp as the canvas overlay
    const containerWidth = mapContainer.clientWidth || width;
    const pixelRatio = width / containerWidth;

    map = new MapLibre.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/fiord',
      bounds: mapBounds,
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false,
      minZoom: 1,
      maxZoom: 8,
      fitBoundsOptions: { padding: 0 },
      pixelRatio
    });

    // Update canvas with current zoom level
    const updateZoomAttribute = () => {
      const canvas = map.getCanvas();
      if (canvas) canvas.setAttribute('data-zoom', map.getZoom().toFixed());
    };
    map.on('zoom', updateZoomAttribute);
    map.once('load', updateZoomAttribute);

    // Ignore missing sprite images
    map.on('styleimagemissing', () => {});

    map.on('load', () => {
      // Enable 3D Globe Projection
      map.setProjection({ type: 'globe' });

      // Ensure map size/center are correct after slot layout settles
      requestAnimationFrame(syncMapToBounds);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => syncMapToBounds());
        resizeObserver.observe(mapContainer);
      }

      // Build satellite WMS tile URL - bbox must be a top-level param for MapLibre substitution
      const baseParams = new URLSearchParams({
        region: satelliteData.region,
        layer: satelliteData.layer,
        time: satelliteData.timestamp || ''
      });
      const proxiedSatelliteUrl = `/api/satellite/tile?${baseParams.toString()}&bbox={bbox-epsg-3857}`;

      // Add nowCOAST satellite WMS layer
      map.addSource('noaa-satellite', {
        type: 'raster',
        tiles: [proxiedSatelliteUrl],
        tileSize: 256
      });

      map.addLayer({
        id: 'satellite-layer',
        type: 'raster',
        source: 'noaa-satellite',
        paint: { 'raster-opacity': 0.85 }
      });

      // Debug: log any tile errors
      map.on('error', (e) => {
        console.error('Map error:', e.error?.message || e);
      });

      // Add country/state boundaries on top of imagery for geographic reference
      // (OpenFreeMap uses OpenMapTiles schema; imagery is opaque so highways
      // would be too noisy at this synoptic scale)
      map.addLayer({
        id: 'boundaries-overlay',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['all',
          ['<=', ['get', 'admin_level'], 4],
          ['!=', ['get', 'maritime'], 1]
        ],
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.5],
          'line-opacity': 0.4
        }
      });

      // Draw overlay elements once map is fully loaded and positioned
      const ctx = overlay.getContext('2d');
      map.once('idle', () => {
        drawLocationMarker(ctx, width / 2, height / 2, MARKER_LARGE_SIZE);
        drawSatelliteHeader(ctx, width, locationName);
        drawWatermark(ctx, width, height, 'NOAA', timezone, true, true);
      });
    });
  };

  // Wait for DOM connection before initializing map
  const cancelDOMWait = waitForDOMConnection(mapContainer, initMap);

  // Export function for share/download - combines map + overlay
  const exportToCanvas = () => exportMapToCanvas(map, overlay, width, height);

  // Expose export function for lightbox
  card._exportToCanvas = exportToCanvas;

  // Theme refresh: redraw overlay canvas (header, watermark) without touching the map
  card._rerenderTheme = () => {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    drawLocationMarker(ctx, width / 2, height / 2, MARKER_LARGE_SIZE);
    drawSatelliteHeader(ctx, width, locationName);
    drawWatermark(ctx, width, height, 'NOAA', timezone, true, true);
  };

  // Attach lightbox click handler
  attachLightboxHandler(card);

  // Add share/download actions
  card.appendChild(createCardActions(
    async () => {
      const canvas = await exportToCanvas();
      shareCard(canvas, 'satellite');
    },
    async () => {
      const canvas = await exportToCanvas();
      downloadCard(canvas, 'satellite');
    }
  ));

  // Store cleanup function
  card._cleanup = () => {
    cancelDOMWait();
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (map) {
      map.remove();
      map = null;
    }
  };

  return card;
}

// Render "satellite unavailable" card for locations outside imagery coverage
export function renderSatelliteUnavailable(canvas, locationName, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
  canvas.width = width;
  canvas.height = height;

  // Dark background
  drawFallbackBackground(ctx, width, height);

  // Header
  drawSatelliteHeader(ctx, width, locationName);

  // Message
  ctx.fillStyle = cardText(UNAVAILABLE_TEXT_OPACITY);
  ctx.font = `${UNAVAILABLE_MESSAGE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Satellite imagery not available for this location', width / 2, height / 2 - UNAVAILABLE_MESSAGE_OFFSET_Y);
  ctx.font = `${UNAVAILABLE_SUBMESSAGE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.fillStyle = cardText(UNAVAILABLE_SUBTEXT_OPACITY);
  ctx.fillText('NOAA satellite imagery covers latitudes 72°S to 72°N', width / 2, height / 2 + UNAVAILABLE_SUBMESSAGE_OFFSET_Y);

  // Watermark
  drawWatermark(ctx, width, height, null, timezone);

  return canvas;
}
