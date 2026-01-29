// Day forecast card renderer (Today/Tonight/Tomorrow)

import { CARD_WIDTH, getTempHighColor, getTempLowColor, drawWatermark, drawWeatherIcon, loadImage, drawOverlay, drawFallbackBackground } from './core.js';
import { Units } from '../utils/units.js';

// Create Today/Tonight/Tomorrow Card
// timezone: IANA timezone string for displaying location's local time
export async function renderDayForecast(canvas, weatherData, backgroundUrl = null, flickrPhotographer = null, timezone = null) {
  const ctx = canvas.getContext('2d');
  const width = CARD_WIDTH;
  const height = 600;
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
      drawOverlay(ctx, width, height, 0.6);
    } catch (e) {
      drawFallbackBackground(ctx, width, height);
    }
  } else {
    drawFallbackBackground(ctx, width, height);
  }

  const daily = weatherData?.daily;
  if (!daily || daily.length < 2) {
    console.error('Insufficient daily data for day forecast');
    return canvas;
  }
  const colWidth = width / 3;

  // Check if we should show night mode (Tonight, Tomorrow, Tomorrow Night)
  // This happens when: it's after sunset OR today's high is missing (NWS at night)
  const now = new Date();
  const todaySunset = daily[0]?.sunset ? new Date(daily[0].sunset) : null;
  const isAfterSunset = todaySunset && now > todaySunset;
  const isMissingTodayHigh = daily[0]?.high == null;
  const isNightMode = isAfterSunset || isMissingTodayHigh;

  // Helper to check if condition is clear/partly cloudy for night icons
  const isClearOrPartly = (condition) => {
    const code = condition?.code || '';
    return code === 'clear' || code === 'mostly-clear' || code === 'partly-cloudy';
  };

  // Three columns: adjust based on time of day
  // Use dayForecast/nightForecast conditions when available for accurate icons
  const columns = isNightMode ? [
    {
      label: 'Tonight',
      low: daily[0]?.low,
      condition: daily[0]?.nightForecast?.condition || daily[0]?.condition,
      precipitation: daily[0]?.precipitation,
      showHigh: false,
      showLow: true,
      isNight: true
    },
    {
      label: 'Tomorrow',
      high: daily[1]?.high,
      low: daily[1]?.low,
      condition: daily[1]?.dayForecast?.condition || daily[1]?.condition,
      precipitation: daily[1]?.precipitation,
      showHigh: true,
      showLow: true
    },
    {
      label: 'Tomorrow Night',
      low: daily[1]?.low,
      condition: daily[1]?.nightForecast?.condition || daily[1]?.condition,
      precipitation: daily[1]?.precipitation,
      showHigh: false,
      showLow: true,
      isNight: true
    }
  ] : [
    {
      label: 'Today',
      high: daily[0]?.high,
      low: daily[0]?.low,
      condition: daily[0]?.dayForecast?.condition || daily[0]?.condition,
      precipitation: daily[0]?.precipitation,
      showHigh: true,
      showLow: true
    },
    {
      label: 'Tonight',
      low: daily[0]?.low,
      condition: daily[0]?.nightForecast?.condition || daily[0]?.condition,
      precipitation: daily[0]?.precipitation,
      showHigh: false,
      showLow: true,
      isNight: true
    },
    {
      label: 'Tomorrow',
      high: daily[1]?.high,
      low: daily[1]?.low,
      condition: daily[1]?.dayForecast?.condition || daily[1]?.condition,
      precipitation: daily[1]?.precipitation,
      showHigh: true,
      showLow: true
    }
  ];

  columns.forEach((col, i) => {
    const x = i * colWidth + colWidth / 2;

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(col.label, x, 40);

    // Weather icon (use moon/cloud-moon for clear/partly cloudy night conditions)
    const conditionCode = col.condition?.code || '';
    let icon;
    if (col.isNight && isClearOrPartly(col.condition)) {
      icon = (conditionCode === 'clear' || conditionCode === 'mostly-clear') ? 'fa-moon' : 'fa-cloud-moon';
    } else {
      icon = `fa-${col.condition?.icon || 'cloud-sun'}`;
    }
    drawWeatherIcon(ctx, icon, x, 180, 100);

    // Temperatures
    ctx.fillStyle = 'white';
    ctx.font = 'bold 56px system-ui, sans-serif';

    ctx.textAlign = 'left';
    const arrowSize = 36;
    const arrowGap = 12;

    if (col.showHigh && col.showLow) {
      // High temp with red arrow icon
      const highTemp = Units.formatTemp(col.high);
      const highTempWidth = ctx.measureText(highTemp).width;
      const highTotalWidth = arrowSize + arrowGap + highTempWidth;
      const highStart = x - highTotalWidth / 2;
      drawWeatherIcon(ctx, 'arrow-up', highStart + arrowSize / 2, 300 + 28, arrowSize, getTempHighColor());
      ctx.fillStyle = 'white';
      ctx.fillText(highTemp, highStart + arrowSize + arrowGap, 300);

      // Low temp with blue arrow icon
      const lowTemp = Units.formatTemp(col.low);
      const lowTempWidth = ctx.measureText(lowTemp).width;
      const lowTotalWidth = arrowSize + arrowGap + lowTempWidth;
      const lowStart = x - lowTotalWidth / 2;
      drawWeatherIcon(ctx, 'arrow-down', lowStart + arrowSize / 2, 370 + 28, arrowSize, getTempLowColor());
      ctx.fillStyle = 'white';
      ctx.fillText(lowTemp, lowStart + arrowSize + arrowGap, 370);
    } else if (col.showLow) {
      // Low temp only with blue arrow icon
      const lowTemp = Units.formatTemp(col.low);
      const lowTempWidth = ctx.measureText(lowTemp).width;
      const lowTotalWidth = arrowSize + arrowGap + lowTempWidth;
      const lowStart = x - lowTotalWidth / 2;
      drawWeatherIcon(ctx, 'arrow-down', lowStart + arrowSize / 2, 335 + 28, arrowSize, getTempLowColor());
      ctx.fillStyle = 'white';
      ctx.fillText(lowTemp, lowStart + arrowSize + arrowGap, 335);
    }

    ctx.textAlign = 'center';

    // Condition text (use short description directly, no detail suffix)
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(col.condition?.text || 'Unknown', x, 440);
  });

  // Divider lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * colWidth, 60);
    ctx.lineTo(i * colWidth, height - 80);
    ctx.stroke();
  }

  // Watermark - determine data source from observedAt presence
  const dataSource = weatherData?.current?.observedAt ? 'NWS' : 'Open-Meteo';
  const attribution = flickrPhotographer
    ? `${dataSource} and ${flickrPhotographer} on Flickr`
    : dataSource;
  drawWatermark(ctx, width, height, attribution, timezone);

  return canvas;
}
