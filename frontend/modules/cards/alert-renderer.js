// Shared alert content rendering utilities
// Used by both alert.js and alert-map.js

import { drawWatermark, drawPill, wrapText, drawWeatherIcon } from './core.js';
import { getSeverityColors, getUrgencyColor } from '../utils/palette-colors.js';

// Layout constants for alert cards
export const alertLayout = {
  padding: { x: 60, top: 40, bottom: 80 },
  header: { height: 100, iconX: 100, iconSize: 90, textX: 160, gapAfter: 16 },
  pills: { height: 48, gap: 12, gapAfter: 16 },
  time: { height: 50, font: '38px system-ui, sans-serif', opacity: 0.85 },
  desc: { lineHeight: 56, font: '44px system-ui, sans-serif', opacity: 0.95 },
  inst: { lineHeight: 54, font: 'italic 40px system-ui, sans-serif', opacity: 0.75 },
  gap: 20,
  minHeight: 400
};

// Text style for header event name
const HEADER_FONT = 'bold 60px system-ui, sans-serif';

/**
 * Calculate layout information for an alert card
 * Pre-computes wrapped text and determines which elements are visible
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @param {Object} alertData - Alert data object
 * @param {number} maxWidth - Maximum text width
 * @returns {Object} Layout information including wrapped lines and visibility flags
 */
export function calculateAlertLayout(ctx, alertData, maxWidth) {
  const L = alertLayout;
  const now = new Date();
  const onsetDate = alertData.onset ? new Date(alertData.onset) : null;
  const endsDate = alertData.ends ? new Date(alertData.ends) : null;
  const isActiveNow = onsetDate && now >= onsetDate;
  const severity = (alertData.severity || 'unknown').toLowerCase();

  const showSeverityPill = severity !== 'unknown';
  const showUrgencyPill = !isActiveNow;
  const hasPills = showSeverityPill || showUrgencyPill;
  const hasTime = (isActiveNow && endsDate) || (!isActiveNow && onsetDate);

  // Wrap description text
  let descLines = [];
  if (alertData.description) {
    ctx.font = L.desc.font;
    descLines = wrapText(ctx, alertData.description, maxWidth);
  }

  // Wrap instruction text
  let instructionLines = [];
  if (alertData.instruction) {
    ctx.font = L.inst.font;
    instructionLines = wrapText(ctx, alertData.instruction, maxWidth);
  }

  // Calculate total height
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
    isActiveNow,
    onsetDate,
    endsDate,
    severity
  };
}

/**
 * Draw the alert header (icon + event name)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} alertData - Alert data object
 * @param {number} y - Y position for header
 * @param {Object} colors - Severity colors object
 * @returns {number} Y position after header
 */
export function drawAlertHeader(ctx, alertData, y, colors) {
  const L = alertLayout;
  const headerCenterY = y + L.header.height / 2;

  // Determine icon based on watch vs warning
  const eventLower = (alertData.event || '').toLowerCase();
  const isWatch = eventLower.includes('watch');
  const icon = isWatch ? 'fa-eye' : 'fa-triangle-exclamation';

  drawWeatherIcon(ctx, icon, L.header.iconX, headerCenterY, L.header.iconSize, colors.icon);

  ctx.fillStyle = 'white';
  ctx.font = HEADER_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(alertData.event || 'Weather Alert', L.header.textX, headerCenterY);

  return y + L.header.height;
}

/**
 * Draw the pills row (severity and urgency)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} alertData - Alert data object
 * @param {Object} layout - Pre-calculated layout info
 * @param {number} y - Y position for pills
 * @param {Object} colors - Severity colors object
 * @returns {number} Y position after pills
 */
export function drawAlertPills(ctx, alertData, layout, y, colors) {
  const L = alertLayout;

  if (!layout.hasPills) return y;

  let pillX = L.padding.x;

  if (layout.showSeverityPill) {
    const severityText = alertData.severity.toUpperCase();
    const pillWidth = drawPill(ctx, pillX, y, severityText, colors.pill, colors.pillText);
    pillX += pillWidth + L.pills.gap;
  }

  if (layout.showUrgencyPill) {
    const urgencyRaw = alertData.urgency || 'Unknown';
    const urgencyColors = getUrgencyColor(urgencyRaw.toLowerCase());
    drawPill(ctx, pillX, y, urgencyRaw.toUpperCase(), urgencyColors.bg, urgencyColors.text);
  }

  return y + L.pills.height;
}

/**
 * Format a date for display, using timezone if provided
 * @param {Date} date - Date to format
 * @param {Date} nowInTz - Current time in target timezone
 * @param {string|null} timezone - IANA timezone string
 * @returns {string} Formatted date string
 */
function formatAlertDate(date, nowInTz, timezone) {
  const dateInTz = timezone
    ? new Date(date.toLocaleString('en-US', { timeZone: timezone }))
    : date;
  const isToday = dateInTz.toDateString() === nowInTz.toDateString();

  const formatOpts = isToday
    ? { timeStyle: 'short' }
    : { dateStyle: 'long', timeStyle: 'short' };

  if (timezone) formatOpts.timeZone = timezone;

  return date.toLocaleString(undefined, formatOpts);
}

/**
 * Draw the time line (until/starts)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} layout - Pre-calculated layout info
 * @param {number} y - Y position for time
 * @param {string|null} timezone - IANA timezone string
 * @returns {number} Y position after time
 */
export function drawAlertTime(ctx, layout, y, timezone) {
  const L = alertLayout;

  if (!layout.hasTime) return y;

  ctx.font = L.time.font;
  ctx.fillStyle = `rgba(255, 255, 255, ${L.time.opacity})`;
  ctx.textBaseline = 'top';

  const now = new Date();
  const nowInTz = timezone
    ? new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    : now;

  if (layout.isActiveNow && layout.endsDate) {
    const formattedDate = formatAlertDate(layout.endsDate, nowInTz, timezone);
    ctx.fillText(`Until ${formattedDate}`, L.padding.x, y);
  } else if (!layout.isActiveNow && layout.onsetDate) {
    const formattedDate = formatAlertDate(layout.onsetDate, nowInTz, timezone);
    ctx.fillText(`Starts ${formattedDate}`, L.padding.x, y);
  }

  return y + L.time.height;
}

/**
 * Draw the description text
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string[]} lines - Pre-wrapped description lines
 * @param {number} y - Y position for description
 * @returns {number} Y position after description
 */
export function drawAlertDescription(ctx, lines, y) {
  const L = alertLayout;

  if (lines.length === 0) return y;

  ctx.font = L.desc.font;
  ctx.fillStyle = `rgba(255, 255, 255, ${L.desc.opacity})`;
  ctx.textBaseline = 'top';

  for (const line of lines) {
    ctx.fillText(line, L.padding.x, y);
    y += L.desc.lineHeight;
  }

  return y + L.gap;
}

/**
 * Draw the instruction text
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string[]} lines - Pre-wrapped instruction lines
 * @param {number} y - Y position for instructions
 * @returns {number} Y position after instructions
 */
export function drawAlertInstructions(ctx, lines, y) {
  const L = alertLayout;

  if (lines.length === 0) return y;

  ctx.font = L.inst.font;
  ctx.fillStyle = `rgba(255, 255, 255, ${L.inst.opacity})`;
  ctx.textBaseline = 'top';

  for (const line of lines) {
    ctx.fillText(line, L.padding.x, y);
    y += L.inst.lineHeight;
  }

  return y;
}

/**
 * Draw complete alert content on a canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Object} alertData - Alert data object
 * @param {Object} layout - Pre-calculated layout info from calculateAlertLayout
 * @param {string|null} timezone - IANA timezone string
 */
export function drawAlertContent(ctx, width, height, alertData, layout, timezone) {
  const L = alertLayout;
  const colors = getSeverityColors(layout.severity);

  let y = L.padding.top;

  // Header (icon + event name)
  y = drawAlertHeader(ctx, alertData, y, colors);
  if (layout.hasPills || layout.hasTime) y += L.header.gapAfter;

  // Pills row
  y = drawAlertPills(ctx, alertData, layout, y, colors);
  if (layout.hasPills && layout.hasTime) y += L.pills.gapAfter;

  // Time line
  y = drawAlertTime(ctx, layout, y, timezone);

  // Gap before description
  y += L.gap;

  // Description
  y = drawAlertDescription(ctx, layout.descLines, y);

  // Instructions
  drawAlertInstructions(ctx, layout.instructionLines, y);

  // Watermark
  drawWatermark(ctx, width, height, alertData.senderName, timezone);
}
