// Sunrise & sunset times card renderer

import { CARD_WIDTH, drawWatermark, drawOverlay, drawFallbackBackground, drawWeatherIcon, loadImage, cardText, cardDivider } from './core.js';

// Format a sunrise/sunset ISO string as a local clock time
// NWS times are UTC (suncalc toISOString); Open-Meteo times are location-local
// with no offset suffix - parsing and re-formatting those in the browser's zone
// round-trips the literal clock time, so no timeZone conversion is applied
function formatSunTime(iso, timezone) {
  if (!iso) return '—';
  const date = new Date(iso);
  const opts = { hour: 'numeric', minute: '2-digit' };
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  if (hasOffset && timezone) {
    opts.timeZone = timezone;
  }
  return date.toLocaleTimeString('en-US', opts);
}

// Create Sunrise & Sunset Card
// timezone: IANA timezone string for displaying location's local time
export async function renderSunTimes(canvas, weatherData, cityName = '', backgroundUrl = null, unsplashUsername = null, timezone = null) {
  const today = weatherData?.daily?.[0];
  // Nothing to show (e.g. polar day/night with both missing) - skip the card
  if (!today?.sunrise && !today?.sunset) {
    return null;
  }

  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = 500;
  canvas.width = width;
  canvas.height = height;

  // Draw background
  if (backgroundUrl) {
    try {
      const img = await loadImage(backgroundUrl);
      const scale = Math.max(width / img.width, height / img.height);
      const x = (width - img.width * scale) / 2;
      const y = (height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      drawOverlay(ctx, width, height, 0.5);
    } catch (e) {
      drawFallbackBackground(ctx, width, height);
    }
  } else {
    drawFallbackBackground(ctx, width, height);
  }

  // Header: clock icon + full date title (e.g. "Wednesday, July 15, 2026 in Holland")
  const headerCenterY = 54;
  drawWeatherIcon(ctx, 'fa-clock', 80, headerCenterY, 64);

  const titleDate = today.date ? new Date(`${today.date}T00:00:00`) : new Date();
  const dateStr = titleDate.toLocaleDateString(undefined, { dateStyle: 'full' });
  const title = cityName ? `${dateStr} in ${cityName}` : dateStr;
  ctx.fillStyle = cardText();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // Shrink to fit - the full date plus a long city name can outgrow the card
  let titleSize = 48;
  do {
    ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
    titleSize -= 2;
  } while (titleSize > 30 && ctx.measureText(title).width > width - 130 - 40);
  ctx.fillText(title, 130, headerCenterY);

  // Vertical divider between the two columns
  ctx.strokeStyle = cardDivider(0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, 150);
  ctx.lineTo(width / 2, 420);
  ctx.stroke();

  // Two side-by-side columns: sunrise (left) and sunset (right)
  const columns = [
    { icon: 'fa-sunrise', time: today.sunrise, x: width * 0.28 },
    { icon: 'fa-sunset', time: today.sunset, x: width * 0.72 }
  ];

  for (const col of columns) {
    drawWeatherIcon(ctx, col.icon, col.x, 250, 150);

    ctx.fillStyle = cardText();
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(formatSunTime(col.time, timezone), col.x, 350);
  }

  // Watermark with data source and photo attribution
  const dataSource = weatherData.source === 'nws' ? 'NWS' : 'Open-Meteo';
  const attribution = unsplashUsername
    ? `${dataSource} and @${unsplashUsername} on Unsplash`
    : dataSource;
  drawWatermark(ctx, width, height, attribution, timezone, false);

  return canvas;
}
