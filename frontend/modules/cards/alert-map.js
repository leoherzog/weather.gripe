// Alert map card renderer with lazy-loaded MapLibre
// Renders alert content over a faded map background showing affected zones/polygons

import { CARD_WIDTH } from './core.js';
import { createCardActions, shareCard, downloadCard } from './share.js';
import {
  alertLayout,
  calculateAlertLayout,
  drawAlertContent
} from './alert-renderer.js';
import { getSeverityColors } from '../utils/palette-colors.js';
import { ensureMapLibre, waitForDOMConnection, exportMapToCanvas } from '../utils/map-utils.js';
import { attachLightboxHandler } from '../ui/lightbox.js';

// Map layout constants
const MAP_LAYOUT = {
  TEXT_WIDTH_RATIO: 0.80,       // Text occupies left 80% of card
  BOUNDS_PADDING: 0.15,         // 15% padding around polygon bounds
  MAP_CENTER_OFFSET: 0.04,      // Offset bounds center 4% of width to the right
  POLYGON_FILL_OPACITY: 0.25,
  POLYGON_STROKE_WIDTH: 2,
  POLYGON_STROKE_OPACITY: 0.6,
  FIT_BOUNDS_PADDING: 20
};

// Gradient opacity values (hex suffixes)
const GRADIENT_OPACITY = {
  leftEdge: 'ee',      // ~93% opacity
  textBoundary: 'aa',  // ~67% opacity
  rightEdge: '55'      // ~33% opacity
};

// Gradient stop position for text boundary
const GRADIENT_TEXT_BOUNDARY = 0.65;

// Get polygon colors for a severity level (fill from pill, stroke from palette)
function getPolygonColors(severity) {
  const colors = getSeverityColors(severity);
  return { fill: colors.pill, stroke: colors.stroke };
}

// Calculate bounds from GeoJSON geometry
function calculatePolygonBounds(geometry) {
  if (!geometry || !geometry.coordinates) return null;

  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : [geometry.coordinates];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  if (!isFinite(minLon)) return null;

  return {
    sw: { lon: minLon, lat: minLat },
    ne: { lon: maxLon, lat: maxLat }
  };
}

// Create alert map card with MapLibre background and alert content overlay
export async function createAlertMapCard(alertData, userLocation, timezone = null) {
  const width = CARD_WIDTH;

  // Check for valid polygon geometry
  const geometry = alertData.geometry;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
    return null;
  }

  // Calculate bounds from polygon
  const bounds = calculatePolygonBounds(geometry);
  if (!bounds) {
    return null;
  }

  // Ensure MapLibre is loaded
  let MapLibre;
  try {
    MapLibre = await ensureMapLibre();
  } catch (e) {
    console.error('Failed to load MapLibre:', e);
    return null;
  }

  const severity = (alertData.severity || 'unknown').toLowerCase();
  const polyColors = getPolygonColors(severity);
  const bgColors = getSeverityColors(severity);

  // Calculate card height based on content (with narrower text area)
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = 100;
  const tempCtx = tempCanvas.getContext('2d');
  const L = alertLayout;
  const maxWidth = (width * MAP_LAYOUT.TEXT_WIDTH_RATIO) - L.padding.x * 2;
  const layout = calculateAlertLayout(tempCtx, alertData, maxWidth);
  const height = layout.height;

  // Create card container
  const card = document.createElement('wa-card');
  card.className = 'weather-card';
  card.dataset.cardType = 'alert-map';

  // Create map wrapper with dynamic height
  const mapWrapper = document.createElement('div');
  mapWrapper.setAttribute('slot', 'media');
  mapWrapper.className = 'map-wrapper';
  mapWrapper.style.aspectRatio = `${width}/${height}`;

  // Create map container
  const mapContainer = document.createElement('div');
  mapContainer.className = 'map-container';
  mapWrapper.appendChild(mapContainer);

  // Create overlay canvas for dark overlay + alert content
  const overlay = document.createElement('canvas');
  overlay.width = width;
  overlay.height = height;
  overlay.className = 'map-overlay';
  mapWrapper.appendChild(overlay);

  card.appendChild(mapWrapper);

  // Initialize map after element is in DOM
  let map = null;
  const initMap = () => {
    // Add padding to bounds
    const lonSpan = bounds.ne.lon - bounds.sw.lon;
    const latSpan = bounds.ne.lat - bounds.sw.lat;
    const lonPad = lonSpan * MAP_LAYOUT.BOUNDS_PADDING;
    const latPad = latSpan * MAP_LAYOUT.BOUNDS_PADDING;

    // Calculate pixel offset to position polygon center in the right portion of the card
    // Positive x offset moves bounds center to the right of map center
    const offsetX = width * MAP_LAYOUT.MAP_CENTER_OFFSET;

    map = new MapLibre.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/fiord',
      bounds: [
        [bounds.sw.lon - lonPad, bounds.sw.lat - latPad],
        [bounds.ne.lon + lonPad, bounds.ne.lat + latPad]
      ],
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false,
      fitBoundsOptions: {
        padding: MAP_LAYOUT.FIT_BOUNDS_PADDING,
        offset: [offsetX, 0]
      }
    });

    map.on('styleimagemissing', () => {});

    // Ensure map fills container after styles compute
    map.once('load', () => map.resize());

    map.on('load', () => {
      // Add alert polygon source
      map.addSource('alert-polygon', {
        type: 'geojson',
        data: { type: 'Feature', geometry }
      });

      // Polygon fill (subtle)
      map.addLayer({
        id: 'alert-polygon-fill',
        type: 'fill',
        source: 'alert-polygon',
        paint: {
          'fill-color': polyColors.fill,
          'fill-opacity': MAP_LAYOUT.POLYGON_FILL_OPACITY
        }
      });

      // Polygon stroke
      map.addLayer({
        id: 'alert-polygon-stroke',
        type: 'line',
        source: 'alert-polygon',
        paint: {
          'line-color': polyColors.stroke,
          'line-width': MAP_LAYOUT.POLYGON_STROKE_WIDTH,
          'line-opacity': MAP_LAYOUT.POLYGON_STROKE_OPACITY
        }
      });
    });

    // Draw overlay content immediately (doesn't depend on map loading)
    const ctx = overlay.getContext('2d');

    // Horizontal gradient: opaque on left (text area) → transparent on right (map area)
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, `${bgColors.bg[0]}${GRADIENT_OPACITY.leftEdge}`);
    gradient.addColorStop(GRADIENT_TEXT_BOUNDARY, `${bgColors.bg[1]}${GRADIENT_OPACITY.textBoundary}`);
    gradient.addColorStop(1, `${bgColors.bg[1]}${GRADIENT_OPACITY.rightEdge}`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw alert content (text already wrapped for narrower width)
    drawAlertContent(ctx, width, height, alertData, layout, timezone);
  };

  // Wait for DOM connection before initializing map
  const cancelDOMWait = waitForDOMConnection(mapContainer, initMap);

  // Export function for share/download
  const exportToCanvas = () => exportMapToCanvas(map, overlay, width, height);

  // Expose export function for lightbox
  card._exportToCanvas = exportToCanvas;

  // Attach lightbox click handler
  attachLightboxHandler(card);

  // Add share/download actions
  card.appendChild(createCardActions(
    async () => {
      const canvas = await exportToCanvas();
      shareCard(canvas, 'alert');
    },
    async () => {
      const canvas = await exportToCanvas();
      downloadCard(canvas, 'alert');
    }
  ));

  // Store cleanup function
  card._cleanup = () => {
    cancelDOMWait();
    if (map) {
      map.remove();
      map = null;
    }
  };

  return card;
}
