// Core canvas utilities for weather cards

// Import icon data directly from build-time imports
import { getIconData } from '../ui/icons.js';
import { getTemperatureColors, getFallbackGradient } from '../utils/palette-colors.js';

// Re-export for backward compatibility
export { getIconData };

// Card dimensions
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 800;

// Theme colors
const LIGHT_TEXT = '26, 26, 26';   // #1a1a1a
const DARK_TEXT = '255, 255, 255'; // white
const LIGHT_OVERLAY = '255, 255, 255'; // white overlay for light mode
const DARK_OVERLAY = '0, 0, 0';       // black overlay for dark mode

// Theme detection
export function isDarkMode() {
  return document.documentElement.classList.contains('wa-dark');
}

// Theme-aware text color (white in dark mode, dark in light mode)
export function cardText(opacity = 1) {
  const rgb = isDarkMode() ? DARK_TEXT : LIGHT_TEXT;
  return opacity >= 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${opacity})`;
}

// Theme-aware overlay color (black in dark mode, white in light mode)
export function cardOverlay(opacity) {
  const rgb = isDarkMode() ? DARK_OVERLAY : LIGHT_OVERLAY;
  return `rgba(${rgb}, ${opacity})`;
}

// Theme-aware divider color (same as text, different semantic usage)
export function cardDivider(opacity) {
  return cardText(opacity);
}

// Temperature color getters (resolved from Web Awesome palette)
export function getTempHighColor() {
  return getTemperatureColors().high;
}

export function getTempLowColor() {
  return getTemperatureColors().low;
}

// Draw weather icon using imported SVG path data
export function drawWeatherIcon(ctx, iconClass, x, y, size, color) {
  if (color === undefined) color = cardText();
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
  const wmColor = cardText(0.7);
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = wmColor;
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
    ctx.strokeStyle = wmColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20 + prefixWidth, y + 2);
    ctx.lineTo(20 + prefixWidth + siteWidth, y + 2);
    ctx.stroke();
  } else {
    ctx.fillText(siteText, 20, y);
    // Underline
    const siteWidth = ctx.measureText(siteText).width;
    ctx.strokeStyle = wmColor;
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
// Dark mode: black overlay; Light mode: white overlay
export function drawOverlay(ctx, width, height, opacity = 0.5) {
  ctx.fillStyle = cardOverlay(opacity);
  ctx.fillRect(0, 0, width, height);
}

// Draw fallback gradient background when photo API fails
export function drawFallbackBackground(ctx, width, height) {
  const colors = getFallbackGradient();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// Draw a rounded rectangle pill
export function drawPill(ctx, x, y, text, bgColor, textColor) {
  if (textColor === undefined) textColor = cardText();
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

