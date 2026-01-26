// Detailed forecast card renderer (Today/Tonight/Tomorrow with text forecast)

import { CARD_WIDTH, drawWatermark, drawOverlay, drawFallbackBackground, drawWeatherIcon, wrapText, loadImage } from './core.js';

// Layout constants for detailed forecast cards
const detailedLayout = {
  padding: { x: 60, top: 40, bottom: 100 },
  header: { height: 100, iconX: 100, iconSize: 90, textX: 160 },
  title: { font: 'bold 60px system-ui, sans-serif' },
  text: { font: '44px system-ui, sans-serif', lineHeight: 56 },
  gap: 36,
  maxLines: 8,
  minHeight: 600,
  maxHeight: 1000
};

// Create Detailed Forecast Card (Today/Tonight/Tomorrow with text forecast)
// timezone: IANA timezone string for displaying location's local time
export async function renderDetailedForecast(canvas, forecastData, backgroundUrl = null, unsplashUsername = null, cityName = null, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const L = detailedLayout;
  const maxWidth = width - L.padding.x * 2;

  // Skip if no detailed forecast text
  if (!forecastData?.detailedForecast) {
    return null;
  }

  // Pre-calculate wrapped text
  canvas.width = width;
  canvas.height = 100;
  ctx.font = L.text.font;
  let textLines = wrapText(ctx, forecastData.detailedForecast, maxWidth);

  // Truncate at maxLines with ellipsis if too long
  if (textLines.length > L.maxLines) {
    textLines = textLines.slice(0, L.maxLines);
    textLines[L.maxLines - 1] = textLines[L.maxLines - 1].replace(/\s*$/, '...');
  }

  // Calculate total height
  let height = L.padding.top + L.header.height + L.gap;
  height += textLines.length * L.text.lineHeight;
  height += L.padding.bottom;
  height = Math.max(height, L.minHeight);
  height = Math.min(height, L.maxHeight);
  canvas.height = height;

  // Draw background
  if (backgroundUrl) {
    try {
      const img = await loadImage(backgroundUrl);
      const scale = Math.max(width / img.width, height / img.height);
      const x = (width - img.width * scale) / 2;
      const y = (height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      drawOverlay(ctx, width, height, 0.55); // Slightly darker for text readability
    } catch (e) {
      drawFallbackBackground(ctx, width, height);
    }
  } else {
    drawFallbackBackground(ctx, width, height);
  }

  // Running Y cursor for layout
  let y = L.padding.top;

  // Header (icon + title, similar to alert cards)
  const headerCenterY = y + L.header.height / 2;

  // Weather icon on the left
  const icon = `fa-${forecastData.condition?.icon || 'cloud-sun'}`;
  drawWeatherIcon(ctx, icon, L.header.iconX, headerCenterY, L.header.iconSize, 'white');

  // Title (e.g., "Today in Portland", "Tonight in Portland")
  ctx.fillStyle = 'white';
  ctx.font = L.title.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const name = forecastData.name || 'Forecast';
  const baseName = name.endsWith(':') ? name.slice(0, -1) : name;
  const titleText = cityName ? `${baseName} in ${cityName}` : baseName;
  ctx.fillText(titleText, L.header.textX, headerCenterY);
  y += L.header.height + L.gap;

  // Detailed forecast text
  ctx.font = L.text.font;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  for (const line of textLines) {
    ctx.fillText(line, L.padding.x, y);
    y += L.text.lineHeight;
  }

  // Watermark with attribution
  const attribution = unsplashUsername
    ? `NWS and @${unsplashUsername} on Unsplash`
    : 'NWS';
  drawWatermark(ctx, width, height, attribution, timezone);

  return canvas;
}
