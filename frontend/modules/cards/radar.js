// Radar card renderer with lazy-loaded MapLibre

import { CARD_WIDTH, CARD_HEIGHT, drawWatermark, drawFallbackBackground, drawWeatherIcon, cardText, cardOverlay, cardDivider } from './core.js';
import { getRadarMarkerColor } from '../utils/palette-colors.js';
import { createCardContainer, createCardActions, shareCard, downloadCard } from './share.js';
import { ensureMapLibre, waitForDOMConnection, exportMapToCanvas } from '../utils/map-utils.js';
import { attachLightboxHandler } from '../ui/lightbox.js';

// Layout constants
const HEADER_HEIGHT = 70;
const HEADER_PADDING = 24;
const HEADER_BG_OPACITY = 0.7;
const TITLE_FONT_SIZE = 36;
const TIMESTAMP_FONT_SIZE = 24;
const TIMESTAMP_TEXT_OPACITY = 0.8;

const LEGEND_WIDTH = 200;
const LEGEND_HEIGHT = 20;
const LEGEND_BOTTOM_OFFSET = 60;
const LEGEND_BG_OPACITY = 0.6;
const LEGEND_PADDING_X = 10;
const LEGEND_PADDING_Y_TOP = 25;
const LEGEND_PADDING_Y_BOTTOM = 45;
const LEGEND_LABEL_FONT_SIZE = 14;
const LEGEND_LABEL_OFFSET_TOP = 20;
const LEGEND_LABEL_OFFSET_BOTTOM = 4;
const LEGEND_BORDER_OPACITY = 0.5;

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
function drawLocationMarker(ctx, x, y, size = MARKER_DEFAULT_SIZE) {
  ctx.save();
  ctx.shadowColor = MARKER_GLOW_COLOR;
  ctx.shadowBlur = MARKER_GLOW_BLUR;
  drawWeatherIcon(ctx, 'fa-location-dot', x, y - size / 2, size, getRadarMarkerColor());
  ctx.restore();
}

// Draw radar header bar
// timezone: IANA timezone string for displaying location's local time
function drawRadarHeader(ctx, width, radarData, locationName, timezone = null) {
  // Semi-transparent header background
  ctx.fillStyle = cardOverlay(HEADER_BG_OPACITY);
  ctx.fillRect(0, 0, width, HEADER_HEIGHT);

  // Title (left side)
  ctx.fillStyle = cardText();
  ctx.font = `bold ${TITLE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const title = locationName || 'Radar';
  ctx.fillText(title, HEADER_PADDING, HEADER_HEIGHT / 2);

  // Timestamp (right side) - use location's timezone if provided
  if (radarData?.timestamp) {
    ctx.font = `${TIMESTAMP_FONT_SIZE}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = cardText(TIMESTAMP_TEXT_OPACITY);
    const date = new Date(radarData.timestamp);
    const timeOpts = { hour: 'numeric', minute: '2-digit' };
    if (timezone) timeOpts.timeZone = timezone;
    const timeStr = date.toLocaleTimeString(undefined, timeOpts);
    ctx.fillText(`Updated: ${timeStr}`, width - HEADER_PADDING, HEADER_HEIGHT / 2);
  }
}

// Draw radar legend (dBZ color scale)
function drawRadarLegend(ctx, width, height) {
  const legendX = width - LEGEND_WIDTH - HEADER_PADDING;
  const legendY = height - LEGEND_BOTTOM_OFFSET;

  // Background for legend
  ctx.fillStyle = cardOverlay(LEGEND_BG_OPACITY);
  ctx.fillRect(
    legendX - LEGEND_PADDING_X,
    legendY - LEGEND_PADDING_Y_TOP,
    LEGEND_WIDTH + LEGEND_PADDING_X * 2,
    LEGEND_HEIGHT + LEGEND_PADDING_Y_BOTTOM
  );

  // Draw color gradient
  const segmentWidth = LEGEND_WIDTH / radarColors.length;
  for (let i = 0; i < radarColors.length; i++) {
    ctx.fillStyle = radarColors[i].color;
    ctx.fillRect(legendX + i * segmentWidth, legendY, segmentWidth + 1, LEGEND_HEIGHT);
  }

  // Border
  ctx.strokeStyle = cardDivider(LEGEND_BORDER_OPACITY);
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, LEGEND_WIDTH, LEGEND_HEIGHT);

  // Labels
  ctx.fillStyle = cardText();
  ctx.font = `${LEGEND_LABEL_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('dBZ', legendX + LEGEND_WIDTH / 2, legendY - LEGEND_LABEL_OFFSET_TOP);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('5', legendX, legendY + LEGEND_HEIGHT + LEGEND_LABEL_OFFSET_BOTTOM);
  ctx.textAlign = 'right';
  ctx.fillText('70+', legendX + LEGEND_WIDTH, legendY + LEGEND_HEIGHT + LEGEND_LABEL_OFFSET_BOTTOM);
}

// Convert Web Mercator (EPSG:3857) coordinates to lat/lon
function webMercatorToLatLon(x, y) {
  const lon = (x / WEB_MERCATOR_EXTENT) * 180;
  let lat = (y / WEB_MERCATOR_EXTENT) * 180;
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
  const mapBounds = [[sw.lon, sw.lat], [ne.lon, ne.lat]];

  // Create card container
  const card = document.createElement('wa-card');
  card.className = 'weather-card';
  card.dataset.cardType = 'radar';

  // Create map wrapper with proper aspect ratio
  const mapWrapper = document.createElement('div');
  mapWrapper.setAttribute('slot', 'media');
  mapWrapper.className = 'map-wrapper';
  mapWrapper.style.aspectRatio = `${width}/${height}`;

  // Create map container
  const mapContainer = document.createElement('div');
  mapContainer.className = 'map-container';
  mapWrapper.appendChild(mapContainer);

  // Create overlay canvas for header/legend/marker/watermark
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
      fitBoundsOptions: { padding: 0 },
      pixelRatio
    });

    // Ignore missing sprite images
    map.on('styleimagemissing', () => {});

    map.on('load', () => {
      // Ensure map size/center are correct after slot layout settles
      requestAnimationFrame(syncMapToBounds);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => syncMapToBounds());
        resizeObserver.observe(mapContainer);
      }

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

      // Draw overlay elements once map is fully loaded and positioned
      const ctx = overlay.getContext('2d');
      map.once('idle', () => {
        drawLocationMarker(ctx, width / 2, height / 2, MARKER_LARGE_SIZE);
        drawRadarHeader(ctx, width, radarData, locationName, timezone);
        // drawRadarLegend(ctx, width, height);
        drawWatermark(ctx, width, height, 'NOAA', timezone);
      });
    });
  };

  // Wait for DOM connection before initializing map
  const cancelDOMWait = waitForDOMConnection(mapContainer, initMap);

  // Export function for share/download - combines map + overlay
  const exportToCanvas = () => exportMapToCanvas(map, overlay, width, height);

  // Expose export function for lightbox
  card._exportToCanvas = exportToCanvas;

  // Theme refresh: redraw overlay canvas (header, legend, watermark) without touching the map
  card._rerenderTheme = () => {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    drawLocationMarker(ctx, width / 2, height / 2, MARKER_LARGE_SIZE);
    drawRadarHeader(ctx, width, radarData, locationName, timezone);
    drawWatermark(ctx, width, height, 'NOAA', timezone);
  };

  // Attach lightbox click handler
  attachLightboxHandler(card);

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
  ctx.fillStyle = cardText(UNAVAILABLE_TEXT_OPACITY);
  ctx.font = `${UNAVAILABLE_MESSAGE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Radar not available for this location', width / 2, height / 2 - UNAVAILABLE_MESSAGE_OFFSET_Y);
  ctx.font = `${UNAVAILABLE_SUBMESSAGE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.fillStyle = cardText(UNAVAILABLE_SUBTEXT_OPACITY);
  ctx.fillText('NOAA radar coverage is limited to US territories', width / 2, height / 2 + UNAVAILABLE_SUBMESSAGE_OFFSET_Y);

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
  ctx.fillStyle = cardText(UNAVAILABLE_TEXT_OPACITY);
  ctx.font = `${UNAVAILABLE_MESSAGE_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message || 'Radar temporarily unavailable', width / 2, height / 2);

  // Watermark
  drawWatermark(ctx, width, height, null, timezone);

  return canvas;
}
