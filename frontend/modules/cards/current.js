// Current conditions card renderer

import { CARD_WIDTH, CARD_HEIGHT, drawWatermark, drawOverlay, drawFallbackBackground, drawWeatherIcon, loadImage, cardText } from './core.js';
import { getConditionText } from './condition-utils.js';
import { Units } from '../utils/units.js';

// Create Current Conditions Card
// timezone: IANA timezone string for displaying location's local time
export async function renderCurrentConditions(canvas, weatherData, backgroundUrl = null, unsplashUsername = null, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
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

  const current = weatherData?.current;
  const daily = weatherData?.daily;
  if (!current) {
    console.error('Weather data missing current conditions');
    return canvas;
  }
  const condition = current.condition;
  const todayPrecip = daily?.[0]?.precipitation || {};
  const conditionText = getConditionText(condition, todayPrecip);

  // Current temperature (large)
  ctx.fillStyle = cardText();
  ctx.font = 'bold 192px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(Units.formatTemp(current.temperature), 60, 80);

  // Feels like
  ctx.font = '48px system-ui, sans-serif';
  ctx.fillStyle = cardText(0.8);
  ctx.fillText(`Feels like ${Units.formatTemp(current.feelsLike)}`, 60, 300);

  // Condition text
  ctx.font = '56px system-ui, sans-serif';
  ctx.fillStyle = cardText();
  ctx.fillText(conditionText, 60, 380);

  // Wind (descriptive text, omit if null)
  let nextY = 460;
  ctx.font = '40px system-ui, sans-serif';
  ctx.fillStyle = cardText(0.9);
  const windDesc = Units.describeWind(current.wind?.speed);
  if (windDesc) {
    const windDir = Units.windDirection(current.wind?.direction);
    ctx.fillText(`${windDesc} ${windDir}`, 60, nextY);
    nextY += 60;
  }

  // Humidity
  const humidity = Units.formatHumidity(current.humidity);
  if (humidity !== '--') {
    ctx.fillText(`${humidity} Humidity`, 60, nextY);
  }

  // Weather icon (right side) - icon is without fa- prefix, add it
  drawWeatherIcon(ctx, `fa-${condition.icon}`, width - 200, 200, 160);

  // Watermark - indicate data source based on whether we have observedAt (NWS) or not (Open-Meteo)
  const dataSource = current.observedAt ? 'NWS' : 'Open-Meteo';
  const attribution = unsplashUsername
    ? `${dataSource} and @${unsplashUsername} on Unsplash`
    : dataSource;
  drawWatermark(ctx, width, height, attribution, timezone);

  return canvas;
}
