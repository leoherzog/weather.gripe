// Alert map card renderer with lazy-loaded MapLibre
// Renders alert content over a faded map background showing affected zones/polygons

import { CARD_WIDTH, drawWatermark, drawWeatherIcon, drawPill, wrapText } from './core.js';
import { createCardActions, shareCard, downloadCard } from './share.js';
import { severityColors, urgencyColors, alertLayout } from './alert.js';
import { ensureMapLibre, waitForDOMConnection, exportMapToCanvas } from '../utils/map-utils.js';

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

// Severity-based polygon colors (derived from severityColors.pill values)
const polygonColors = {
  extreme: { fill: severityColors.extreme.pill, stroke: '#dc2626' },
  severe: { fill: severityColors.severe.pill, stroke: '#ea580c' },
  moderate: { fill: severityColors.moderate.pill, stroke: '#ca8a04' },
  minor: { fill: severityColors.minor.pill, stroke: '#2563eb' },
  unknown: { fill: severityColors.unknown.pill, stroke: '#4b5563' }
};

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

// Calculate card height based on content (same logic as alert.js)
// textWidthRatio: fraction of card width for text (e.g., 0.75 for 75%)
function calculateCardHeight(ctx, alertData, width, textWidthRatio = 1.0) {
  const L = alertLayout;
  const maxWidth = (width * textWidthRatio) - L.padding.x * 2;

  const now = new Date();
  const onsetDate = alertData.onset ? new Date(alertData.onset) : null;
  const endsDate = alertData.ends ? new Date(alertData.ends) : null;
  const isActiveNow = onsetDate && now >= onsetDate;
  const severity = (alertData.severity || 'unknown').toLowerCase();

  const showSeverityPill = severity !== 'unknown';
  const showUrgencyPill = !isActiveNow;
  const hasPills = showSeverityPill || showUrgencyPill;
  const hasTime = (isActiveNow && endsDate) || (!isActiveNow && onsetDate);

  let descLines = [];
  if (alertData.description) {
    ctx.font = L.desc.font;
    descLines = wrapText(ctx, alertData.description, maxWidth);
  }

  let instructionLines = [];
  if (alertData.instruction) {
    ctx.font = L.inst.font;
    instructionLines = wrapText(ctx, alertData.instruction, maxWidth);
  }

  let height = L.padding.top + L.header.height;
  if (hasPills || hasTime) height += L.header.gapAfter;
  if (hasPills) height += L.pills.height;
  if (hasPills && hasTime) height += L.pills.gapAfter;
  if (hasTime) height += L.time.height;
  height += L.gap;
  if (descLines.length > 0) height += descLines.length * L.desc.lineHeight + L.gap;
  if (instructionLines.length > 0) height += instructionLines.length * L.inst.lineHeight;
  height += L.padding.bottom;

  return {
    height: Math.max(height, L.minHeight),
    descLines,
    instructionLines,
    hasPills,
    hasTime,
    showSeverityPill,
    showUrgencyPill,
    isActiveNow
  };
}

// Draw full alert content on canvas (replicates alert.js rendering)
// textWidthRatio: fraction of card width for text (e.g., 0.75 for 75%)
function drawAlertContent(ctx, width, height, alertData, layout, timezone, textWidthRatio = 1.0) {
  const L = alertLayout;
  const textWidth = width * textWidthRatio;
  const severity = (alertData.severity || 'unknown').toLowerCase();
  const colors = severityColors[severity] || severityColors.unknown;

  const now = new Date();
  const onsetDate = alertData.onset ? new Date(alertData.onset) : null;
  const endsDate = alertData.ends ? new Date(alertData.ends) : null;

  let y = L.padding.top;

  // Header (icon + event name)
  const headerCenterY = y + L.header.height / 2;
  const eventLower = (alertData.event || '').toLowerCase();
  const isWatch = eventLower.includes('watch');
  const icon = isWatch ? 'fa-eye' : 'fa-triangle-exclamation';
  drawWeatherIcon(ctx, icon, L.header.iconX, headerCenterY, L.header.iconSize, colors.icon);

  ctx.fillStyle = 'white';
  ctx.font = 'bold 60px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(alertData.event || 'Weather Alert', L.header.textX, headerCenterY);
  y += L.header.height;
  if (layout.hasPills || layout.hasTime) y += L.header.gapAfter;

  // Pills row
  if (layout.hasPills) {
    let pillX = L.padding.x;
    const pillY = y;

    if (layout.showSeverityPill) {
      const severityText = alertData.severity.toUpperCase();
      const pillWidth = drawPill(ctx, pillX, pillY, severityText, colors.pill);
      pillX += pillWidth + L.pills.gap;
    }

    if (layout.showUrgencyPill) {
      const urgencyRaw = alertData.urgency || 'Unknown';
      const urgency = urgencyRaw.toLowerCase();
      const urgencyColor = urgencyColors[urgency] || urgencyColors.unknown;
      const urgencyTextColor = urgency === 'future' ? '#1f2937' : 'white';
      drawPill(ctx, pillX, pillY, urgencyRaw.toUpperCase(), urgencyColor, urgencyTextColor);
    }
    y += L.pills.height;
    if (layout.hasTime) y += L.pills.gapAfter;
  }

  // Time line
  if (layout.hasTime) {
    ctx.font = '38px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textBaseline = 'top';

    const nowInTz = timezone
      ? new Date(now.toLocaleString('en-US', { timeZone: timezone }))
      : now;
    const isToday = (d) => {
      if (!d) return false;
      const dInTz = timezone
        ? new Date(d.toLocaleString('en-US', { timeZone: timezone }))
        : d;
      return dInTz.toDateString() === nowInTz.toDateString();
    };
    const formatOpts = (d) => {
      const base = isToday(d)
        ? { timeStyle: 'short' }
        : { dateStyle: 'long', timeStyle: 'short' };
      return timezone ? { ...base, timeZone: timezone } : base;
    };

    if (layout.isActiveNow && endsDate) {
      ctx.fillText(`Until ${endsDate.toLocaleString(undefined, formatOpts(endsDate))}`, L.padding.x, y);
    } else if (!layout.isActiveNow && onsetDate) {
      ctx.fillText(`Starts ${onsetDate.toLocaleString(undefined, formatOpts(onsetDate))}`, L.padding.x, y);
    }
    y += L.time.height;
  }

  y += L.gap;

  // Description
  if (layout.descLines.length > 0) {
    ctx.font = L.desc.font;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textBaseline = 'top';
    for (const line of layout.descLines) {
      ctx.fillText(line, L.padding.x, y);
      y += L.desc.lineHeight;
    }
    y += L.gap;
  }

  // Instructions
  if (layout.instructionLines.length > 0) {
    ctx.font = L.inst.font;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.textBaseline = 'top';
    for (const line of layout.instructionLines) {
      ctx.fillText(line, L.padding.x, y);
      y += L.inst.lineHeight;
    }
  }

  // Watermark
  drawWatermark(ctx, width, height, alertData.senderName, timezone);
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
  const polyColors = polygonColors[severity] || polygonColors.unknown;
  const bgColors = severityColors[severity] || severityColors.unknown;

  // Calculate card height based on content (with narrower text area)
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = 100;
  const tempCtx = tempCanvas.getContext('2d');
  const layout = calculateCardHeight(tempCtx, alertData, width, MAP_LAYOUT.TEXT_WIDTH_RATIO);
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

    // Draw alert content (constrained to left portion)
    drawAlertContent(ctx, width, height, alertData, layout, timezone, MAP_LAYOUT.TEXT_WIDTH_RATIO);
  };

  // Wait for DOM connection before initializing map
  const cancelDOMWait = waitForDOMConnection(mapContainer, initMap);

  // Export function for share/download
  const exportToCanvas = () => exportMapToCanvas(map, overlay, width, height);

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
