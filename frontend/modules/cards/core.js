// Core canvas utilities for weather cards

// Import icon data directly from build-time imports
import { getIconData, initIcons } from '../ui/icons.js';
import { getTemperatureColors, getFallbackGradient } from '../utils/palette-colors.js';

// Re-export for backward compatibility
export { getIconData, initIcons };

// Card dimensions
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 800;

// Temperature color getters (resolved from Web Awesome palette)
export function getTempHighColor() {
  return getTemperatureColors().high;
}

export function getTempLowColor() {
  return getTemperatureColors().low;
}

// Draw weather icon using imported SVG path data
export function drawWeatherIcon(ctx, iconClass, x, y, size, color = 'white') {
  // Convert 'fa-cloud-sun' to 'cloud-sun'
  const iconName = iconClass.replace(/^fa-/, '');

  const iconData = getIconData(iconName);
  if (!iconData) {
    return;
  }

  const { width, height, paths } = iconData;

  ctx.save();
  ctx.fillStyle = color;

  // Scale and position the path
  const scale = size / Math.max(width, height);
  ctx.translate(x - (width * scale) / 2, y - (height * scale) / 2);
  ctx.scale(scale, scale);

  paths.forEach(d => {
    const path = new Path2D(d);
    ctx.fill(path);
  });

  ctx.restore();
}

// Draw watermark and timestamp on canvas
// timezone: IANA timezone string (e.g., 'America/New_York') for displaying location's local time
export function drawWatermark(ctx, width, height, suffix = null, timezone = null) {
  ctx.save();
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textBaseline = 'bottom';

  // Watermark (bottom-left) with underlined "weather.gripe"
  ctx.textAlign = 'left';
  const siteText = 'weather.gripe';
  const y = height - 20;

  if (suffix) {
    const prefixText = `${suffix} via `;
    ctx.fillText(prefixText, 20, y);
    const prefixWidth = ctx.measureText(prefixText).width;
    ctx.fillText(siteText, 20 + prefixWidth, y);
    // Underline
    const siteWidth = ctx.measureText(siteText).width;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20 + prefixWidth, y + 2);
    ctx.lineTo(20 + prefixWidth + siteWidth, y + 2);
    ctx.stroke();
  } else {
    ctx.fillText(siteText, 20, y);
    // Underline
    const siteWidth = ctx.measureText(siteText).width;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, y + 2);
    ctx.lineTo(20 + siteWidth, y + 2);
    ctx.stroke();
  }

  // Timestamp (bottom-right) - use location's timezone if provided
  ctx.textAlign = 'right';
  const formatOpts = timezone ? { timeZone: timezone } : {};
  const timestamp = new Date().toLocaleString(undefined, formatOpts);
  ctx.fillText(timestamp, width - 20, height - 20);

  ctx.restore();
}

// Draw semi-transparent overlay for text readability
export function drawOverlay(ctx, width, height, opacity = 0.5) {
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.fillRect(0, 0, width, height);
}

// Draw fallback gradient background when Unsplash fails
export function drawFallbackBackground(ctx, width, height) {
  const colors = getFallbackGradient();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// Draw a rounded rectangle pill
export function drawPill(ctx, x, y, text, bgColor, textColor = 'white') {
  ctx.font = 'bold 32px system-ui, sans-serif';
  const padding = 20;
  const height = 48;
  const textWidth = ctx.measureText(text).width;
  const pillWidth = textWidth + padding * 2;
  const radius = height / 2;

  // Draw pill background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, pillWidth, height, radius);
  ctx.fill();

  // Draw text
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padding, y + height / 2);

  return pillWidth;
}

// Word wrap helper that returns lines
export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = testLine;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

// Load image from URL (uses createImageBitmap for off-main-thread decoding when available)
export async function loadImage(url) {
  if (typeof createImageBitmap === 'function') {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return createImageBitmap(blob);
    } catch (e) {
      // Fall through to legacy method on failure
    }
  }

  // Fallback for older browsers
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

