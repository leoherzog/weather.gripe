// Core canvas utilities for weather cards

// Card dimensions
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 800;

// Temperature colors
export const COLOR_TEMP_HIGH = '#f97316';
export const COLOR_TEMP_LOW = '#3b82f6';

// All icons that may be needed for canvas rendering
export const iconsNeeded = [
  'sun', 'moon', 'cloud', 'cloud-sun', 'cloud-moon', 'smog',
  'cloud-rain', 'cloud-showers-heavy', 'cloud-sun-rain',
  'snowflake', 'cloud-bolt', 'triangle-exclamation', 'eye', 'question',
  'location-dot'
];

// Cache for extracted icon data
export const iconCache = {};

// Wait for Web Awesome / FontAwesome to be fully loaded
export function waitForFontAwesome() {
  return new Promise((resolve) => {
    // Check if wa-icon is defined (Web Awesome loaded)
    if (customElements.get('wa-icon')) {
      resolve();
      return;
    }
    // Wait for custom element to be defined
    customElements.whenDefined('wa-icon').then(resolve);
    // Fallback timeout
    setTimeout(resolve, 5000);
  });
}

// Extract SVG path data from rendered wa-icon elements
export async function extractIconData() {
  const container = document.getElementById('weather-icons-source');
  if (!container) return;

  for (const icon of container.querySelectorAll('wa-icon')) {
    const name = icon.dataset.iconName;
    // wa-icon renders SVG in shadow DOM
    const svg = icon.shadowRoot?.querySelector('svg');
    if (svg) {
      const viewBox = svg.getAttribute('viewBox') || '0 0 512 512';
      const [, , width, height] = viewBox.split(' ').map(Number);
      const paths = Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));
      if (paths.length > 0) {
        iconCache[name] = { width, height, paths };
      }
    }
  }
}

// Get icon path data from cache
export function getIconData(iconName) {
  if (iconCache[iconName]) {
    return iconCache[iconName];
  }

  // Try to extract from wa-icon if not in cache
  const container = document.getElementById('weather-icons-source');
  const icon = container?.querySelector(`wa-icon[data-icon-name="${iconName}"]`);
  const svg = icon?.shadowRoot?.querySelector('svg');
  if (svg) {
    const viewBox = svg.getAttribute('viewBox') || '0 0 512 512';
    const [, , width, height] = viewBox.split(' ').map(Number);
    const paths = Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));
    if (paths.length > 0) {
      iconCache[iconName] = { width, height, paths };
      return iconCache[iconName];
    }
  }

  console.warn(`Icon not found: ${iconName} - Web Awesome may not have loaded yet`);
  return null;
}

// Draw weather icon using extracted SVG path data
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
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1e3a5f');
  gradient.addColorStop(1, '#0d1b2a');
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

// Initialize icons by creating wa-icon elements and extracting SVG paths
export async function initIcons() {
  await waitForFontAwesome();

  // Create hidden container with wa-icon elements
  const container = document.createElement('div');
  container.id = 'weather-icons-source';
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';

  // Create wa-icon elements for each needed icon
  for (const name of iconsNeeded) {
    const icon = document.createElement('wa-icon');
    icon.setAttribute('name', name);
    icon.dataset.iconName = name;
    container.appendChild(icon);
  }
  document.body.appendChild(container);

  // Wait for icons to render, then extract SVG data
  await new Promise(resolve => setTimeout(resolve, 500));
  await extractIconData();
}
