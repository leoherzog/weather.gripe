// Hourly forecast card renderer (24-hour forecast with temperature line graph)

import { CARD_WIDTH, getTempLowColor, drawWatermark, drawWeatherIcon, loadImage, drawOverlay, drawFallbackBackground, cardText } from './core.js';
import { Units } from '../utils/units.js';

// Night icon mappings for clear/partly-cloudy conditions
const NIGHT_ICON_MAP = {
  'sun': 'moon',
  'cloud-sun': 'cloud-moon',
  'cloud-sun-rain': 'cloud-moon'
};

// Check if a time is after sunset for a given day
function isNightTime(time, daily, timezone) {
  const timeDate = new Date(time);

  // Find the matching day's sunset
  for (const day of daily) {
    if (!day.sunset) continue;
    const sunset = new Date(day.sunset);
    const sunrise = day.sunrise ? new Date(day.sunrise) : null;

    // Check if this hour is on the same day (in timezone)
    const timeOpts = timezone ? { timeZone: timezone } : {};
    const timeDay = timeDate.toLocaleDateString('en-CA', timeOpts);
    const sunsetDay = sunset.toLocaleDateString('en-CA', timeOpts);

    if (timeDay === sunsetDay) {
      // After sunset or before sunrise = night
      if (timeDate >= sunset) return true;
      if (sunrise && timeDate < sunrise) return true;
      return false;
    }
  }

  // Default: check against first day's times
  if (daily[0]?.sunset) {
    const sunset = new Date(daily[0].sunset);
    const sunrise = daily[0].sunrise ? new Date(daily[0].sunrise) : null;
    const hour = parseInt(timeDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: false,
      ...(timezone ? { timeZone: timezone } : {})
    }));
    // Rough estimate: night is 6pm-6am
    if (hour >= 18 || hour < 6) return true;
  }

  return false;
}

// Get the appropriate icon, converting to night variant if needed
function getHourlyIcon(condition, time, daily, timezone) {
  const baseIcon = condition?.icon || 'cloud-sun';

  if (isNightTime(time, daily, timezone)) {
    return NIGHT_ICON_MAP[baseIcon] || baseIcon;
  }

  return baseIcon;
}

// Create Hourly Forecast Card with temperature line graph
// timezone: IANA timezone string for displaying location's local time
export async function renderHourlyForecast(canvas, weatherData, cityName = '', backgroundUrl = null, unsplashUsername = null, timezone = null) {
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
      drawOverlay(ctx, width, height, 0.65);
    } catch (e) {
      drawFallbackBackground(ctx, width, height);
    }
  } else {
    drawFallbackBackground(ctx, width, height);
  }

  const hourly = weatherData?.hourly;
  const daily = weatherData?.daily || [];

  if (!hourly || hourly.length === 0) {
    console.error('Weather data missing hourly forecast');
    return canvas;
  }

  // Take first 24 hours
  const hours = hourly.slice(0, 24);
  const padding = { left: 80, right: 80, top: 120, bottom: 140 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Title
  ctx.fillStyle = cardText();
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(cityName ? `Next 24 Hours in ${cityName}` : 'Next 24 Hours', padding.left - 10, 30);

  // Get temperature range
  const temps = hours.map(h => h.temperature);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = maxTemp - minTemp || 1;

  // Add some padding to the range
  const tempPadding = tempRange * 0.1;
  const adjustedMin = minTemp - tempPadding;
  const adjustedMax = maxTemp + tempPadding;
  const adjustedRange = adjustedMax - adjustedMin;

  // Calculate points for all 24 hours
  const points = hours.map((hour, i) => {
    const x = padding.left + (i / (hours.length - 1)) * graphWidth;
    const y = padding.top + (1 - (hour.temperature - adjustedMin) / adjustedRange) * graphHeight;
    return { x, y, temp: hour.temperature, hour };
  });

  // Draw filled area under the line
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding.bottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.fill();

  // Draw temperature line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = getTempLowColor();
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw data points and labels every 4 hours (6 points total: 0, 4, 8, 12, 16, 20)
  const labelIndices = [0, 4, 8, 12, 16, 20];

  labelIndices.forEach(i => {
    if (i >= points.length) return;

    const p = points[i];
    const hour = hours[i];

    // Draw point
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = getTempLowColor();
    ctx.fill();
    ctx.strokeStyle = cardText();
    ctx.lineWidth = 2;
    ctx.stroke();

    // Temperature label above point
    ctx.fillStyle = cardText();
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(Units.formatTemp(p.temp), p.x, p.y - 15);

    // Time label below graph
    const time = new Date(hour.time);
    const timeOpts = timezone
      ? { timeZone: timezone, hour: 'numeric', hour12: true }
      : { hour: 'numeric', hour12: true };
    const timeStr = time.toLocaleTimeString('en-US', timeOpts).replace(' ', '');

    ctx.fillStyle = cardText(0.8);
    ctx.font = '22px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(timeStr, p.x, height - padding.bottom + 15);

    // Weather icon
    const icon = `fa-${getHourlyIcon(hour.condition, hour.time, daily, timezone)}`;
    drawWeatherIcon(ctx, icon, p.x, height - padding.bottom + 70, 36);
  });

  // Watermark
  const dataSource = weatherData?.current?.observedAt ? 'NWS' : 'Open-Meteo';
  const attribution = unsplashUsername
    ? `${dataSource} and @${unsplashUsername} on Unsplash`
    : dataSource;
  drawWatermark(ctx, width, height, attribution, timezone);

  return canvas;
}
