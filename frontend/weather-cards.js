// Canvas-based weather card renderers for weather.gripe
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const WeatherCards = {
  // Card dimensions
  CARD_WIDTH: 1200,
  CARD_HEIGHT: 800,

  // All icons that may be needed for canvas rendering
  iconsNeeded: [
    'sun', 'moon', 'cloud', 'cloud-sun', 'cloud-moon', 'smog',
    'cloud-rain', 'cloud-showers-heavy', 'cloud-sun-rain',
    'snowflake', 'cloud-bolt', 'triangle-exclamation', 'eye', 'question',
    'location-dot'
  ],

  // Wait for Web Awesome / FontAwesome to be fully loaded
  waitForFontAwesome() {
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
  },

  // Initialize by creating wa-icon elements and extracting SVG paths
  async init() {
    await this.waitForFontAwesome();

    // Create hidden container with wa-icon elements
    const container = document.createElement('div');
    container.id = 'weather-icons-source';
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';

    // Create wa-icon elements for each needed icon
    for (const name of this.iconsNeeded) {
      const icon = document.createElement('wa-icon');
      icon.setAttribute('name', name);
      icon.dataset.iconName = name;
      container.appendChild(icon);
    }
    document.body.appendChild(container);

    // Wait for icons to render, then extract SVG data
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.extractIconData();
  },

  // Extract SVG path data from rendered wa-icon elements
  async extractIconData() {
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
          this.iconCache[name] = { width, height, paths };
        }
      }
    }
  },

  // Condition code to Unsplash query mapping
  conditionQueries: {
    'clear': 'clear sky sunshine',
    'mostly-clear': 'clear sky',
    'partly-cloudy': 'partly cloudy sky',
    'mostly-cloudy': 'cloudy sky',
    'overcast': 'overcast cloudy sky',
    'fog': 'foggy weather',
    'drizzle': 'light rain drizzle',
    'rain-light': 'light rain',
    'rain': 'rain weather',
    'rain-heavy': 'heavy rain storm',
    'freezing-rain': 'freezing rain ice',
    'snow-light': 'light snow winter',
    'snow': 'snow winter',
    'snow-heavy': 'heavy snow blizzard',
    'thunderstorm': 'thunderstorm lightning',
    'thunderstorm-severe': 'severe thunderstorm'
  },

  // Conditions that already imply cold (skip temperature modifiers)
  coldImpliedConditions: new Set([
    'snow-light', 'snow', 'snow-heavy', 'freezing-rain'
  ]),

  // Get temperature modifier for Unsplash query
  getTemperatureModifier(tempC) {
    if (tempC <= -10) return 'freezing';
    if (tempC <= 0) return 'icy';
    if (tempC <= 10) return 'cold';
    if (tempC >= 30) return 'hot';
    if (tempC >= 25) return 'warm';
    return null;
  },

  // Get Unsplash query for a condition, optionally adjusted for temperature
  getConditionQuery(condition, tempC = null) {
    const baseQuery = this.conditionQueries[condition?.code] || 'weather';

    // Skip modifier for conditions that already imply cold
    if (this.coldImpliedConditions.has(condition?.code)) {
      return baseQuery;
    }

    const modifier = tempC != null ? this.getTemperatureModifier(tempC) : null;
    return modifier ? `${modifier} ${baseQuery}` : baseQuery;
  },

  // Condition codes that involve snow vs rain (for precipitation display)
  snowConditions: new Set(['snow-light', 'snow', 'snow-heavy']),
  rainConditions: new Set(['drizzle', 'rain-light', 'rain', 'rain-heavy', 'freezing-rain', 'thunderstorm', 'thunderstorm-severe']),

  // Format precipitation amount with one decimal place
  formatPrecip(amount) {
    if (!amount || amount < 0.1) return null;
    return `${amount.toFixed(1)}in`;
  },

  // Get formatted condition text with precipitation if applicable
  // condition: { code, text, icon, detail? }
  // precipitation: { probability, amount, snow, rain }
  getConditionText(condition, precipitation = {}) {
    let text = condition?.text || 'Unknown';

    // If there's a detail from NWS (like accumulation), use that
    if (condition?.detail) {
      return `${text} — ${condition.detail}`;
    }

    // Otherwise, add precipitation amounts for relevant conditions
    const { snow = 0, rain = 0 } = precipitation;
    if (this.snowConditions.has(condition?.code) && snow > 0) {
      const precip = this.formatPrecip(snow);
      if (precip) text += ` (${precip})`;
    } else if (this.rainConditions.has(condition?.code) && rain > 0) {
      const precip = this.formatPrecip(rain);
      if (precip) text += ` (${precip})`;
    }

    return text;
  },

  // Draw watermark and timestamp on canvas
  // timezone: IANA timezone string (e.g., 'America/New_York') for displaying location's local time
  drawWatermark(ctx, width, height, suffix = null, timezone = null) {
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
  },

  // Draw semi-transparent overlay for text readability
  drawOverlay(ctx, width, height, opacity = 0.5) {
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.fillRect(0, 0, width, height);
  },

  // Cache for extracted icon data
  iconCache: {},

  // Get icon path data from cache
  getIconData(iconName) {
    if (this.iconCache[iconName]) {
      return this.iconCache[iconName];
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
        this.iconCache[iconName] = { width, height, paths };
        return this.iconCache[iconName];
      }
    }

    console.warn(`Icon not found: ${iconName} - Web Awesome may not have loaded yet`);
    return null;
  },

  // Draw weather icon using extracted SVG path data
  drawWeatherIcon(ctx, iconClass, x, y, size, color = 'white') {
    // Convert 'fa-cloud-sun' to 'cloud-sun'
    const iconName = iconClass.replace(/^fa-/, '');

    const iconData = this.getIconData(iconName);
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
  },

  // Load image from URL (uses createImageBitmap for off-main-thread decoding when available)
  async loadImage(url) {
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
  },

  // Create Current Conditions Card
  // timezone: IANA timezone string for displaying location's local time
  async renderCurrentConditions(canvas, weatherData, backgroundUrl = null, unsplashUsername = null, timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
    const height = this.CARD_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    // Draw background
    if (backgroundUrl) {
      try {
        const img = await this.loadImage(backgroundUrl);
        const scale = Math.max(width / img.width, height / img.height);
        const x = (width - img.width * scale) / 2;
        const y = (height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        this.drawOverlay(ctx, width, height, 0.4);
      } catch (e) {
        this.drawFallbackBackground(ctx, width, height);
      }
    } else {
      this.drawFallbackBackground(ctx, width, height);
    }

    const current = weatherData?.current;
    const daily = weatherData?.daily;
    if (!current) {
      console.error('Weather data missing current conditions');
      return canvas;
    }
    const condition = current.condition;
    const todayPrecip = daily?.[0]?.precipitation || {};
    const conditionText = this.getConditionText(condition, todayPrecip);

    // Current temperature (large)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 192px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(Units.formatTemp(current.temperature), 60, 80);

    // Feels like
    ctx.font = '48px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(`Feels like ${Units.formatTemp(current.feelsLike)}`, 60, 300);

    // Condition text
    ctx.font = '56px system-ui, sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText(conditionText, 60, 380);

    // Weather icon (right side) - icon is without fa- prefix, add it
    this.drawWeatherIcon(ctx, `fa-${condition.icon}`, width - 200, 200, 160);

    // Bottom stats row
    const statsY = height - 160;
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

    // Wind
    const windDir = Units.windDirection(current.wind?.direction);
    ctx.textAlign = 'left';
    ctx.fillText(`Wind: ${Units.formatWind(current.wind?.speed)} ${windDir}`, 60, statsY);

    // Humidity
    ctx.textAlign = 'right';
    ctx.fillText(`Humidity: ${Units.formatHumidity(current.humidity)}`, width - 60, statsY);

    // Watermark - indicate data source based on whether we have observedAt (NWS) or not (Open-Meteo)
    const dataSource = current.observedAt ? 'NWS' : 'Open-Meteo';
    const attribution = unsplashUsername
      ? `${dataSource} and @${unsplashUsername} on Unsplash`
      : dataSource;
    this.drawWatermark(ctx, width, height, attribution, timezone);

    return canvas;
  },

  // Create Today/Tonight/Tomorrow Card
  // timezone: IANA timezone string for displaying location's local time
  async renderDayForecast(canvas, weatherData, timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
    const height = 600;
    canvas.width = width;
    canvas.height = height;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#2d4a6f');
    gradient.addColorStop(0.5, '#1e3a5f');
    gradient.addColorStop(1, '#0d1b2a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

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
    const columns = isNightMode ? [
      {
        label: 'Tonight',
        low: daily[0]?.low,
        condition: daily[0]?.condition,
        precipitation: daily[0]?.precipitation,
        showHigh: false,
        showLow: true,
        isNight: true
      },
      {
        label: 'Tomorrow',
        high: daily[1]?.high,
        low: daily[1]?.low,
        condition: daily[1]?.condition,
        precipitation: daily[1]?.precipitation,
        showHigh: true,
        showLow: true
      },
      {
        label: 'Tomorrow Night',
        low: daily[1]?.low,
        condition: daily[1]?.condition,
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
        condition: daily[0]?.condition,
        precipitation: daily[0]?.precipitation,
        showHigh: true,
        showLow: true
      },
      {
        label: 'Tonight',
        low: daily[0]?.low,
        condition: daily[0]?.condition,
        precipitation: daily[0]?.precipitation,
        showHigh: false,
        showLow: true,
        isNight: true
      },
      {
        label: 'Tomorrow',
        high: daily[1]?.high,
        low: daily[1]?.low,
        condition: daily[1]?.condition,
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
      this.drawWeatherIcon(ctx, icon, x, 180, 100);

      // Temperatures
      ctx.fillStyle = 'white';
      ctx.font = 'bold 56px system-ui, sans-serif';

      if (col.showHigh && col.showLow) {
        ctx.fillText(`${Units.formatTempValue(col.high)}° / ${Units.formatTempValue(col.low)}°`, x, 320);
        ctx.font = '28px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('High / Low', x, 390);
      } else if (col.showLow) {
        ctx.fillText(`${Units.formatTempValue(col.low)}°`, x, 320);
        ctx.font = '28px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('Low', x, 390);
      }

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
    this.drawWatermark(ctx, width, height, dataSource, timezone);

    return canvas;
  },

  // Create 5-Day Forecast Card with line graph
  // timezone: IANA timezone string for displaying location's local time
  async renderForecastGraph(canvas, weatherData, locationName = '5-Day Forecast', timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
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
      this.drawWeatherIcon(ctx, icon, p.x, height - padding.bottom + 140, 40);
    });

    // Watermark - determine data source from observedAt presence
    const dataSource = weatherData?.current?.observedAt ? 'NWS' : 'Open-Meteo';
    this.drawWatermark(ctx, width, height, dataSource, timezone);

    return canvas;
  },

  // Severity color mapping
  severityColors: {
    extreme: { bg: ['#7f1d1d', '#450a0a'], pill: '#ef4444', icon: '#fca5a5' },
    severe: { bg: ['#7c2d12', '#431407'], pill: '#f97316', icon: '#fdba74' },
    moderate: { bg: ['#713f12', '#422006'], pill: '#eab308', icon: '#fde047' },
    minor: { bg: ['#1e3a5f', '#0d1b2a'], pill: '#3b82f6', icon: '#93c5fd' },
    unknown: { bg: ['#374151', '#1f2937'], pill: '#6b7280', icon: '#9ca3af' }
  },

  // Urgency color mapping
  urgencyColors: {
    immediate: '#dc2626',
    expected: '#ea580c',
    future: '#ca8a04',
    past: '#4b5563',
    unknown: '#6b7280'
  },

  // Draw a rounded rectangle pill
  drawPill(ctx, x, y, text, bgColor, textColor = 'white') {
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
  },

  // Word wrap helper that returns lines
  wrapText(ctx, text, maxWidth) {
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
  },

  // Layout constants for alert cards
  alertLayout: {
    padding: { x: 60, top: 40, bottom: 80 },
    header: { height: 100, iconX: 100, iconSize: 90, textX: 160, gapAfter: 16 },
    pills: { height: 48, gap: 12, gapAfter: 16 },
    time: { height: 50 },
    desc: { lineHeight: 56, font: '44px system-ui, sans-serif' },
    inst: { lineHeight: 54, font: 'italic 40px system-ui, sans-serif' },
    gap: 20
  },

  // Layout constants for detailed forecast cards
  detailedLayout: {
    padding: { x: 60, top: 40, bottom: 100 },
    header: { height: 100, iconX: 100, iconSize: 90, textX: 160 },
    title: { font: 'bold 60px system-ui, sans-serif' },
    text: { font: '44px system-ui, sans-serif', lineHeight: 56 },
    gap: 36,
    maxLines: 8,
    minHeight: 600,
    maxHeight: 1000
  },

  // Create Severe Weather Alert Card
  // timezone: IANA timezone string for displaying location's local time
  async renderAlert(canvas, alertData, timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
    const L = this.alertLayout;
    const maxWidth = width - L.padding.x * 2;

    // Parse dates and determine alert state
    const now = new Date();
    const onsetDate = alertData.onset ? new Date(alertData.onset) : null;
    const endsDate = alertData.ends ? new Date(alertData.ends) : null;
    const isActiveNow = onsetDate && now >= onsetDate;
    const severity = (alertData.severity || 'unknown').toLowerCase();
    const colors = this.severityColors[severity] || this.severityColors.unknown;

    // Determine which elements are visible
    const showSeverityPill = severity !== 'unknown';
    const showUrgencyPill = !isActiveNow;
    const hasPills = showSeverityPill || showUrgencyPill;
    const hasTime = (isActiveNow && endsDate) || (!isActiveNow && onsetDate);

    // Pre-calculate wrapped text (need temporary canvas for measurement)
    canvas.width = width;
    canvas.height = 100;

    let descLines = [];
    if (alertData.description) {
      ctx.font = L.desc.font;
      descLines = this.wrapText(ctx, alertData.description, maxWidth);
    }

    let instructionLines = [];
    if (alertData.instruction) {
      ctx.font = L.inst.font;
      instructionLines = this.wrapText(ctx, alertData.instruction, maxWidth);
    }

    // Calculate total height using layout constants
    let height = L.padding.top + L.header.height;
    if (hasPills || hasTime) height += L.header.gapAfter;
    if (hasPills) height += L.pills.height;
    if (hasPills && hasTime) height += L.pills.gapAfter;
    if (hasTime) height += L.time.height;
    height += L.gap; // gap before description
    if (descLines.length > 0) height += descLines.length * L.desc.lineHeight + L.gap;
    if (instructionLines.length > 0) height += instructionLines.length * L.inst.lineHeight;
    height += L.padding.bottom;
    height = Math.max(height, 400);
    canvas.height = height;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colors.bg[0]);
    gradient.addColorStop(1, colors.bg[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Running Y cursor for layout
    let y = L.padding.top;

    // Header (icon + event name)
    const headerCenterY = y + L.header.height / 2;
    const eventLower = (alertData.event || '').toLowerCase();
    const isWatch = eventLower.includes('watch');
    const icon = isWatch ? 'fa-eye' : 'fa-triangle-exclamation';
    this.drawWeatherIcon(ctx, icon, L.header.iconX, headerCenterY, L.header.iconSize, colors.icon);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(alertData.event || 'Weather Alert', L.header.textX, headerCenterY);
    y += L.header.height;
    if (hasPills || hasTime) y += L.header.gapAfter;

    // Pills row
    if (hasPills) {
      let pillX = L.padding.x;
      const pillY = y; // pills are 48px tall

      if (showSeverityPill) {
        const severityText = alertData.severity.toUpperCase();
        const pillWidth = this.drawPill(ctx, pillX, pillY, severityText, colors.pill);
        pillX += pillWidth + L.pills.gap;
      }

      if (showUrgencyPill) {
        const urgencyRaw = alertData.urgency || 'Unknown';
        const urgency = urgencyRaw.toLowerCase();
        const urgencyColor = this.urgencyColors[urgency] || this.urgencyColors.unknown;
        const urgencyTextColor = urgency === 'future' ? '#1f2937' : 'white';
        this.drawPill(ctx, pillX, pillY, urgencyRaw.toUpperCase(), urgencyColor, urgencyTextColor);
      }
      y += L.pills.height;
      if (hasTime) y += L.pills.gapAfter;
    }

    // Time line
    if (hasTime) {
      ctx.font = '38px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.textBaseline = 'top';

      // Compare dates in location's timezone
      const nowInTz = timezone
        ? new Date(now.toLocaleString('en-US', { timeZone: timezone }))
        : now;
      const isToday = (d) => {
        if (!d) return false;
        const dInTz = timezone
          ? new Date(d.toLocaleString('en-US', { timeZone: timezone }))
          : d;
        return dInTz.toDateString() === nowInTz.toDateString();
      };
      const formatOpts = (d) => {
        const base = isToday(d)
          ? { timeStyle: 'short' }
          : { dateStyle: 'long', timeStyle: 'short' };
        return timezone ? { ...base, timeZone: timezone } : base;
      };

      if (isActiveNow && endsDate) {
        ctx.fillText(`Until ${endsDate.toLocaleString(undefined, formatOpts(endsDate))}`, L.padding.x, y);
      } else if (!isActiveNow && onsetDate) {
        ctx.fillText(`Starts ${onsetDate.toLocaleString(undefined, formatOpts(onsetDate))}`, L.padding.x, y);
      }
      y += L.time.height;
    }

    y += L.gap; // gap before description

    // Description
    if (descLines.length > 0) {
      ctx.font = L.desc.font;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.textBaseline = 'top';
      for (const line of descLines) {
        ctx.fillText(line, L.padding.x, y);
        y += L.desc.lineHeight;
      }
      y += L.gap;
    }

    // Instructions
    if (instructionLines.length > 0) {
      ctx.font = L.inst.font;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.textBaseline = 'top';
      for (const line of instructionLines) {
        ctx.fillText(line, L.padding.x, y);
        y += L.inst.lineHeight;
      }
    }

    // Watermark
    this.drawWatermark(ctx, width, height, alertData.senderName, timezone);

    return canvas;
  },

  // Draw fallback gradient background when Unsplash fails
  drawFallbackBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1e3a5f');
    gradient.addColorStop(1, '#0d1b2a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  },

  // Create Detailed Forecast Card (Today/Tonight/Tomorrow with text forecast)
  // timezone: IANA timezone string for displaying location's local time
  async renderDetailedForecast(canvas, forecastData, backgroundUrl = null, unsplashUsername = null, cityName = null, timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
    const L = this.detailedLayout;
    const maxWidth = width - L.padding.x * 2;

    // Skip if no detailed forecast text
    if (!forecastData?.detailedForecast) {
      return null;
    }

    // Pre-calculate wrapped text
    canvas.width = width;
    canvas.height = 100;
    ctx.font = L.text.font;
    let textLines = this.wrapText(ctx, forecastData.detailedForecast, maxWidth);

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
        const img = await this.loadImage(backgroundUrl);
        const scale = Math.max(width / img.width, height / img.height);
        const x = (width - img.width * scale) / 2;
        const y = (height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        this.drawOverlay(ctx, width, height, 0.55); // Slightly darker for text readability
      } catch (e) {
        this.drawFallbackBackground(ctx, width, height);
      }
    } else {
      this.drawFallbackBackground(ctx, width, height);
    }

    // Running Y cursor for layout
    let y = L.padding.top;

    // Header (icon + title, similar to alert cards)
    const headerCenterY = y + L.header.height / 2;

    // Weather icon on the left
    const icon = `fa-${forecastData.condition?.icon || 'cloud-sun'}`;
    this.drawWeatherIcon(ctx, icon, L.header.iconX, headerCenterY, L.header.iconSize, 'white');

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
    this.drawWatermark(ctx, width, height, attribution, timezone);

    return canvas;
  },

  // Radar dBZ color scale (reflectivity values and colors)
  radarColors: [
    { dbz: 5, color: '#04e9e7' },   // Light cyan
    { dbz: 10, color: '#019ff4' },  // Light blue
    { dbz: 15, color: '#0300f4' },  // Blue
    { dbz: 20, color: '#02fd02' },  // Green
    { dbz: 25, color: '#01c501' },  // Dark green
    { dbz: 30, color: '#008e00' },  // Darker green
    { dbz: 35, color: '#fdf802' },  // Yellow
    { dbz: 40, color: '#e5bc00' },  // Gold
    { dbz: 45, color: '#fd9500' },  // Orange
    { dbz: 50, color: '#fd0000' },  // Red
    { dbz: 55, color: '#d40000' },  // Dark red
    { dbz: 60, color: '#bc0000' },  // Darker red
    { dbz: 65, color: '#f800fd' },  // Magenta
    { dbz: 70, color: '#9854c6' },  // Purple
  ],

  // Draw location marker (red pin with white glow)
  drawLocationMarker(ctx, x, y, size = 24) {
    ctx.save();
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 4;
    this.drawWeatherIcon(ctx, 'fa-location-dot', x, y - size / 2, size, '#ef4444');
    ctx.restore();
  },

  // Draw radar header bar
  // timezone: IANA timezone string for displaying location's local time
  drawRadarHeader(ctx, width, radarData, locationName, timezone = null) {
    const headerHeight = 70;

    // Semi-transparent header background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, headerHeight);

    // Title (left side)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const title = locationName || 'Radar';
    ctx.fillText(title, 24, headerHeight / 2);

    // Timestamp (right side) - use location's timezone if provided
    if (radarData?.timestamp) {
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      const date = new Date(radarData.timestamp);
      const timeOpts = { hour: 'numeric', minute: '2-digit' };
      if (timezone) timeOpts.timeZone = timezone;
      const timeStr = date.toLocaleTimeString(undefined, timeOpts);
      ctx.fillText(`Updated: ${timeStr}`, width - 24, headerHeight / 2);
    }
  },

  // Draw radar legend (dBZ color scale)
  drawRadarLegend(ctx, width, height) {
    const legendWidth = 200;
    const legendHeight = 20;
    const legendX = width - legendWidth - 24;
    const legendY = height - 60;

    // Background for legend
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(legendX - 10, legendY - 25, legendWidth + 20, legendHeight + 45);

    // Draw color gradient
    const colors = this.radarColors;
    const segmentWidth = legendWidth / colors.length;
    for (let i = 0; i < colors.length; i++) {
      ctx.fillStyle = colors[i].color;
      ctx.fillRect(legendX + i * segmentWidth, legendY, segmentWidth + 1, legendHeight);
    }

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

    // Labels
    ctx.fillStyle = 'white';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('dBZ', legendX + legendWidth / 2, legendY - 20);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('5', legendX, legendY + legendHeight + 4);
    ctx.textAlign = 'right';
    ctx.fillText('70+', legendX + legendWidth, legendY + legendHeight + 4);
  },

  // Convert Web Mercator (EPSG:3857) coordinates to lat/lon
  webMercatorToLatLon(x, y) {
    const lon = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return { lat, lon };
  },

  // Build NOAA radar WMS tile URL with bbox placeholder for MapLibre
  // Uses the /geoserver/{region}/{layer}/ows endpoint per NOAA documentation
  buildRadarTileUrl(radarData) {
    const layer = `${radarData.region}_bref_qcd`;
    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.1.1',
      request: 'GetMap',
      layers: layer,
      styles: '',
      format: 'image/png',
      transparent: 'true',
      width: '256',
      height: '256',
      srs: 'EPSG:3857',
      bbox: '{bbox-epsg-3857}'
    });
    if (radarData.timestamp) {
      params.set('time', radarData.timestamp);
    }
    return `https://opengeo.ncep.noaa.gov/geoserver/${radarData.region}/${layer}/ows?${params.toString()}`;
  },

  // Create radar card with embedded MapLibre map
  // Returns a wa-card element (not a canvas)
  createRadarCard(radarData, locationName, timezone = null) {
    const width = this.CARD_WIDTH;
    const height = this.CARD_HEIGHT;

    // Check if radar data indicates no coverage - fall back to canvas
    if (!radarData || radarData.coverage === false) {
      const canvas = document.createElement('canvas');
      this.renderRadarUnavailable(canvas, locationName, timezone);
      return this.createCardContainer(canvas, 'radar');
    }

    // Parse bbox to get bounds
    const [minX, minY, maxX, maxY] = radarData.bbox.split(',').map(Number);
    const sw = this.webMercatorToLatLon(minX, minY);
    const ne = this.webMercatorToLatLon(maxX, maxY);

    // Create card container
    const card = document.createElement('wa-card');
    card.className = 'weather-card';
    card.dataset.cardType = 'radar';

    // Create map wrapper with proper aspect ratio
    const mapWrapper = document.createElement('div');
    mapWrapper.setAttribute('slot', 'media');
    mapWrapper.style.cssText = `position:relative;width:100%;aspect-ratio:${width}/${height};`;

    // Create map container
    const mapContainer = document.createElement('div');
    mapContainer.style.cssText = 'position:absolute;inset:0;';
    mapWrapper.appendChild(mapContainer);

    // Create overlay canvas for header/legend/marker/watermark
    const overlay = document.createElement('canvas');
    overlay.width = width;
    overlay.height = height;
    overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    mapWrapper.appendChild(overlay);

    card.appendChild(mapWrapper);

    // Initialize map after element is in DOM
    let map = null;
    const initMap = () => {
      map = new maplibregl.Map({
        container: mapContainer,
        style: 'https://tiles.openfreemap.org/styles/fiord',
        bounds: [[sw.lon, sw.lat], [ne.lon, ne.lat]],
        preserveDrawingBuffer: true,
        interactive: false,
        attributionControl: false,
        fitBoundsOptions: { padding: 0 }
      });

      // Ignore missing sprite images
      map.on('styleimagemissing', () => {});

      map.on('load', () => {
        // Build radar WMS tile URL - bbox must be a top-level param for MapLibre substitution
        const layer = `${radarData.region}_bref_qcd`;
        const baseParams = new URLSearchParams({
          region: radarData.region,
          layer: layer,
          time: radarData.timestamp || ''
        });
        const proxiedRadarUrl = `/api/radar/tile?${baseParams.toString()}&bbox={bbox-epsg-3857}`;

        // Add NOAA radar WMS layer
        map.addSource('noaa-radar', {
          type: 'raster',
          tiles: [proxiedRadarUrl],
          tileSize: 256
        });

        map.addLayer({
          id: 'radar-layer',
          type: 'raster',
          source: 'noaa-radar',
          paint: { 'raster-opacity': 0.9 }
        });

        // Debug: log any tile errors
        map.on('error', (e) => {
          console.error('Map error:', e.error?.message || e);
        });

        // Add highways overlay on top of radar (OpenFreeMap uses OpenMapTiles schema)
        map.addLayer({
          id: 'highways-overlay',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
          paint: {
            'line-color': '#ffffff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 2],
            'line-opacity': 0.5
          }
        });
      });

      // Draw overlay elements
      const ctx = overlay.getContext('2d');
      this.drawLocationMarker(ctx, width / 2, height / 2, 32);
      this.drawRadarHeader(ctx, width, radarData, locationName, timezone);
      this.drawRadarLegend(ctx, width, height);
      this.drawWatermark(ctx, width, height, 'NOAA', timezone);
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (mapContainer.isConnected) {
        initMap();
      } else {
        // Wait for element to be connected
        const observer = new MutationObserver(() => {
          if (mapContainer.isConnected) {
            observer.disconnect();
            initMap();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });

    // Export function for share/download - combines map + overlay
    const exportToCanvas = async () => {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext('2d');

      if (map) {
        // Draw map
        const mapCanvas = map.getCanvas();
        ctx.drawImage(mapCanvas, 0, 0, width, height);
      }
      // Draw overlay on top
      ctx.drawImage(overlay, 0, 0);
      return exportCanvas;
    };

    // Add share/download actions
    card.appendChild(this.createCardActions(
      async () => {
        const canvas = await exportToCanvas();
        this.shareCard(canvas, 'radar');
      },
      async () => {
        const canvas = await exportToCanvas();
        this.downloadCard(canvas, 'radar');
      }
    ));

    // Store cleanup function
    card._cleanup = () => {
      if (map) {
        map.remove();
        map = null;
      }
    };

    return card;
  },

  // Render "radar unavailable" card for non-US locations
  renderRadarUnavailable(canvas, locationName, timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
    const height = this.CARD_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    // Dark background
    this.drawFallbackBackground(ctx, width, height);

    // Header
    this.drawRadarHeader(ctx, width, null, locationName, timezone);

    // Message
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Radar not available for this location', width / 2, height / 2 - 20);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('NOAA radar coverage is limited to US territories', width / 2, height / 2 + 30);

    // Watermark
    this.drawWatermark(ctx, width, height, null, timezone);

    return canvas;
  },

  // Render radar error card
  renderRadarError(canvas, message, timezone = null) {
    const ctx = canvas.getContext('2d');
    const width = this.CARD_WIDTH;
    const height = this.CARD_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    // Dark background
    this.drawFallbackBackground(ctx, width, height);

    // Error message
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message || 'Radar temporarily unavailable', width / 2, height / 2);

    // Watermark
    this.drawWatermark(ctx, width, height, null, timezone);

    return canvas;
  },

  // Create card container with share/download buttons
  createCardContainer(canvas, cardType) {
    const container = document.createElement('wa-card');
    container.className = 'weather-card';
    container.dataset.cardType = cardType;

    // Use media slot for edge-to-edge display
    canvas.setAttribute('slot', 'media');
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';

    container.appendChild(canvas);
    container.appendChild(this.createCardActions(
      () => this.shareCard(canvas, cardType),
      () => this.downloadCard(canvas, cardType)
    ));
    return container;
  },

  // Share card using Web Share API
  async shareCard(canvas, cardType) {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], `weather-${cardType}.png`, { type: 'image/png' });

      const shareData = {
        title: 'Weather from weather.gripe',
        files: [file]
      };

      // Verify file sharing is supported before attempting
      if (!navigator.canShare?.(shareData)) {
        this.downloadCard(canvas, cardType);
        return;
      }

      await navigator.share(shareData);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        // Fallback to download
        this.downloadCard(canvas, cardType);
      }
    }
  },

  // Download card as image
  downloadCard(canvas, cardType) {
    const link = document.createElement('a');
    link.download = `weather-${cardType}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  },

  // Create share/download action buttons (shared utility)
  createCardActions(onShare, onDownload) {
    const footer = document.createElement('div');
    footer.setAttribute('slot', 'footer');
    footer.className = 'flex wa-gap-xs';

    // Check if file sharing is supported (not just basic share)
    // Firefox lacks canShare() but supports share() with files, so fall back to checking share exists
    const testFile = new File([''], 'test.png', { type: 'image/png' });
    const hasShareAPI = navigator.canShare?.({ files: [testFile] }) ?? !!navigator.share;

    if (hasShareAPI) {
      const shareBtn = document.createElement('wa-button');
      shareBtn.setAttribute('variant', 'brand');
      shareBtn.setAttribute('appearance', 'outlined');
      shareBtn.setAttribute('size', 'small');
      shareBtn.setAttribute('aria-label', 'Share this weather card');
      shareBtn.className = 'flex-1';
      shareBtn.innerHTML = '<wa-icon slot="start" name="share-nodes" aria-hidden="true"></wa-icon> Share';
      shareBtn.onclick = onShare;

      const downloadBtn = document.createElement('wa-button');
      downloadBtn.setAttribute('appearance', 'outlined');
      downloadBtn.setAttribute('size', 'small');
      downloadBtn.setAttribute('aria-label', 'Download this weather card as an image');
      downloadBtn.className = 'flex-1';
      downloadBtn.innerHTML = '<wa-icon slot="start" name="download" aria-hidden="true"></wa-icon> Download';
      downloadBtn.onclick = onDownload;

      footer.appendChild(shareBtn);
      footer.appendChild(downloadBtn);
    } else {
      const downloadBtn = document.createElement('wa-button');
      downloadBtn.setAttribute('variant', 'brand');
      downloadBtn.setAttribute('appearance', 'outlined');
      downloadBtn.setAttribute('size', 'small');
      downloadBtn.setAttribute('aria-label', 'Download this weather card as an image');
      downloadBtn.className = 'flex-1';
      downloadBtn.innerHTML = '<wa-icon slot="start" name="download" aria-hidden="true"></wa-icon> Download';
      downloadBtn.onclick = onDownload;
      footer.appendChild(downloadBtn);
    }

    return footer;
  }
};

// Export to global scope for other modules
window.WeatherCards = WeatherCards;
