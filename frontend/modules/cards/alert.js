// Alert card renderer

import { CARD_WIDTH } from './core.js';
import {
  severityColors,
  alertLayout,
  calculateAlertLayout,
  drawAlertContent
} from './alert-renderer.js';

// Re-export for consumers that import from alert.js
export { severityColors, urgencyColors, alertLayout } from './alert-renderer.js';

// Create Severe Weather Alert Card
// timezone: IANA timezone string for displaying location's local time
export async function renderAlert(canvas, alertData, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const L = alertLayout;
  const maxWidth = width - L.padding.x * 2;

  // Set temporary canvas size for text measurement
  canvas.width = width;
  canvas.height = 100;

  // Calculate layout (wraps text and determines height)
  const layout = calculateAlertLayout(ctx, alertData, maxWidth);
  const height = layout.height;

  // Set final canvas size
  canvas.height = height;

  // Background gradient
  const severity = layout.severity;
  const colors = severityColors[severity] || severityColors.unknown;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bg[0]);
  gradient.addColorStop(1, colors.bg[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Draw all alert content
  drawAlertContent(ctx, width, height, alertData, layout, timezone);

  return canvas;
}
