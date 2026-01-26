// Forecast graph card renderer (5-day forecast with line graph)

import { CARD_WIDTH, drawWatermark, drawWeatherIcon } from './core.js';
import { Units } from '../utils/units.js';

// Create 5-Day Forecast Card with line graph
// timezone: IANA timezone string for displaying location's local time
export async function renderForecastGraph(canvas, weatherData, locationName = '5-Day Forecast', timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = 700;
  canvas.width = width;
  canvas.height = height;

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a2f4a');
  gradient.addColorStop(1, '#0d1b2a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const daily = weatherData?.daily;
  if (!daily || !daily[0]) {
    console.error('Weather data missing daily forecast');
    return canvas;
  }
  // Filter to days with complete data (both high and low), then take first 5
  const completeDays = daily.filter(d => d.high != null && d.low != null).slice(0, 5);
  if (completeDays.length === 0) {
    console.error('No complete daily forecast data for graph');
    return canvas;
  }
  const days = completeDays.length;
  const padding = { left: 100, right: 100, top: 170, bottom: 220 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Title (location name) - offset to align with centered temp labels on first data point
  ctx.fillStyle = 'white';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(locationName, padding.left - 35, 40);

  // Get temperature range
  const temps = completeDays.flatMap(d => [d.high, d.low]);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = maxTemp - minTemp || 1;

  // Calculate points
  const highPoints = [];
  const lowPoints = [];
  for (let i = 0; i < days; i++) {
    const day = completeDays[i];
    const x = padding.left + (days > 1 ? (i / (days - 1)) * graphWidth : graphWidth / 2);
    const highY = padding.top + (1 - (day.high - minTemp) / tempRange) * graphHeight;
    const lowY = padding.top + (1 - (day.low - minTemp) / tempRange) * graphHeight;
    highPoints.push({ x, y: highY, temp: day.high, day });
    lowPoints.push({ x, y: lowY, temp: day.low });
  }

  // Draw filled area between lines
  ctx.beginPath();
  ctx.moveTo(highPoints[0].x, highPoints[0].y);
  highPoints.forEach(p => ctx.lineTo(p.x, p.y));
  for (let i = lowPoints.length - 1; i >= 0; i--) {
    ctx.lineTo(lowPoints[i].x, lowPoints[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.fill();

  // Draw high temp line
  ctx.beginPath();
  ctx.moveTo(highPoints[0].x, highPoints[0].y);
  highPoints.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Draw low temp line
  ctx.beginPath();
  ctx.moveTo(lowPoints[0].x, lowPoints[0].y);
  lowPoints.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Draw points and labels
  highPoints.forEach((p, i) => {
    // High point
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();

    // High temp label
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Units.formatTempValue(p.temp)}°`, p.x, p.y - 20);

    // Low point
    const lp = lowPoints[i];
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();

    // Low temp label
    ctx.fillStyle = '#3b82f6';
    ctx.textBaseline = 'top';
    ctx.fillText(`${Units.formatTempValue(lp.temp)}°`, lp.x, lp.y + 20);

    // Day label and icon - compare actual date to today in location's timezone
    const todayOpts = timezone ? { timeZone: timezone } : {};
    const todayStr = new Date().toLocaleDateString('en-CA', todayOpts); // YYYY-MM-DD format
    const date = new Date(p.day.date + 'T00:00:00');
    const dayName = p.day.date === todayStr ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });

    ctx.fillStyle = 'white';
    ctx.font = '32px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(dayName, p.x, height - padding.bottom + 70);

    // Weather icon
    const icon = `fa-${p.day.condition?.icon || 'cloud-sun'}`;
    drawWeatherIcon(ctx, icon, p.x, height - padding.bottom + 140, 40);
  });

  // Watermark - determine data source from observedAt presence
  const dataSource = weatherData?.current?.observedAt ? 'NWS' : 'Open-Meteo';
  drawWatermark(ctx, width, height, dataSource, timezone);

  return canvas;
}
