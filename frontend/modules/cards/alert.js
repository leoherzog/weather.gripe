// Alert card renderer

import { CARD_WIDTH, drawWatermark, drawPill, wrapText, drawWeatherIcon } from './core.js';

// Severity color mapping
export const severityColors = {
  extreme: { bg: ['#7f1d1d', '#450a0a'], pill: '#ef4444', icon: '#fca5a5' },
  severe: { bg: ['#7c2d12', '#431407'], pill: '#f97316', icon: '#fdba74' },
  moderate: { bg: ['#713f12', '#422006'], pill: '#eab308', icon: '#fde047' },
  minor: { bg: ['#1e3a5f', '#0d1b2a'], pill: '#3b82f6', icon: '#93c5fd' },
  unknown: { bg: ['#374151', '#1f2937'], pill: '#6b7280', icon: '#9ca3af' }
};

// Urgency color mapping
export const urgencyColors = {
  immediate: '#dc2626',
  expected: '#ea580c',
  future: '#ca8a04',
  past: '#4b5563',
  unknown: '#6b7280'
};

// Layout constants for alert cards (exported for alert-map.js)
export const alertLayout = {
  padding: { x: 60, top: 40, bottom: 80 },
  header: { height: 100, iconX: 100, iconSize: 90, textX: 160, gapAfter: 16 },
  pills: { height: 48, gap: 12, gapAfter: 16 },
  time: { height: 50 },
  desc: { lineHeight: 56, font: '44px system-ui, sans-serif' },
  inst: { lineHeight: 54, font: 'italic 40px system-ui, sans-serif' },
  gap: 20,
  minHeight: 400
};

// Create Severe Weather Alert Card
// timezone: IANA timezone string for displaying location's local time
export async function renderAlert(canvas, alertData, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const L = alertLayout;
  const maxWidth = width - L.padding.x * 2;

  // Parse dates and determine alert state
  const now = new Date();
  const onsetDate = alertData.onset ? new Date(alertData.onset) : null;
  const endsDate = alertData.ends ? new Date(alertData.ends) : null;
  const isActiveNow = onsetDate && now >= onsetDate;
  const severity = (alertData.severity || 'unknown').toLowerCase();
  const colors = severityColors[severity] || severityColors.unknown;

  // Determine which elements are visible
  const showSeverityPill = severity !== 'unknown';
  const showUrgencyPill = !isActiveNow;
  const hasPills = showSeverityPill || showUrgencyPill;
  const hasTime = (isActiveNow && endsDate) || (!isActiveNow && onsetDate);

  // Pre-calculate wrapped text (need temporary canvas for measurement)
  canvas.width = width;
  canvas.height = 100;

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

  // Calculate total height using layout constants
  let height = L.padding.top + L.header.height;
  if (hasPills || hasTime) height += L.header.gapAfter;
  if (hasPills) height += L.pills.height;
  if (hasPills && hasTime) height += L.pills.gapAfter;
  if (hasTime) height += L.time.height;
  height += L.gap; // gap before description
  if (descLines.length > 0) height += descLines.length * L.desc.lineHeight + L.gap;
  if (instructionLines.length > 0) height += instructionLines.length * L.inst.lineHeight;
  height += L.padding.bottom;
  height = Math.max(height, L.minHeight);
  canvas.height = height;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bg[0]);
  gradient.addColorStop(1, colors.bg[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Running Y cursor for layout
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
  if (hasPills || hasTime) y += L.header.gapAfter;

  // Pills row
  if (hasPills) {
    let pillX = L.padding.x;
    const pillY = y; // pills are 48px tall

    if (showSeverityPill) {
      const severityText = alertData.severity.toUpperCase();
      const pillWidth = drawPill(ctx, pillX, pillY, severityText, colors.pill);
      pillX += pillWidth + L.pills.gap;
    }

    if (showUrgencyPill) {
      const urgencyRaw = alertData.urgency || 'Unknown';
      const urgency = urgencyRaw.toLowerCase();
      const urgencyColor = urgencyColors[urgency] || urgencyColors.unknown;
      const urgencyTextColor = urgency === 'future' ? '#1f2937' : 'white';
      drawPill(ctx, pillX, pillY, urgencyRaw.toUpperCase(), urgencyColor, urgencyTextColor);
    }
    y += L.pills.height;
    if (hasTime) y += L.pills.gapAfter;
  }

  // Time line
  if (hasTime) {
    ctx.font = '38px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textBaseline = 'top';

    // Compare dates in location's timezone
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

    if (isActiveNow && endsDate) {
      ctx.fillText(`Until ${endsDate.toLocaleString(undefined, formatOpts(endsDate))}`, L.padding.x, y);
    } else if (!isActiveNow && onsetDate) {
      ctx.fillText(`Starts ${onsetDate.toLocaleString(undefined, formatOpts(onsetDate))}`, L.padding.x, y);
    }
    y += L.time.height;
  }

  y += L.gap; // gap before description

  // Description
  if (descLines.length > 0) {
    ctx.font = L.desc.font;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textBaseline = 'top';
    for (const line of descLines) {
      ctx.fillText(line, L.padding.x, y);
      y += L.desc.lineHeight;
    }
    y += L.gap;
  }

  // Instructions
  if (instructionLines.length > 0) {
    ctx.font = L.inst.font;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.textBaseline = 'top';
    for (const line of instructionLines) {
      ctx.fillText(line, L.padding.x, y);
      y += L.inst.lineHeight;
    }
  }

  // Watermark
  drawWatermark(ctx, width, height, alertData.senderName, timezone);

  return canvas;
}
