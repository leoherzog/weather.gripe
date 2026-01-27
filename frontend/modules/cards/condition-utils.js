// Condition code utilities for weather cards

// Condition code to Unsplash query mapping (describe the image, not the condition)
export const conditionQueries = {
  'clear': 'blue sky',
  'mostly-clear': 'blue sky',
  'partly-cloudy': 'clouds sky',
  'mostly-cloudy': 'cloudy sky',
  'overcast': 'gray sky',
  'fog': 'fog mist',
  'drizzle': 'rain',
  'rain-light': 'rain',
  'rain': 'rain',
  'rain-heavy': 'rain storm',
  'freezing-rain': 'ice rain',
  'snow-light': 'snow',
  'snow': 'snow',
  'snow-heavy': 'snowstorm',
  'thunderstorm': 'lightning storm',
  'thunderstorm-severe': 'lightning storm'
};

// Conditions that already imply cold (skip temperature modifiers)
export const coldImpliedConditions = new Set([
  'snow-light', 'snow', 'snow-heavy', 'freezing-rain'
]);

// Condition codes that involve snow vs rain (for precipitation display)
export const snowConditions = new Set(['snow-light', 'snow', 'snow-heavy']);
export const rainConditions = new Set(['drizzle', 'rain-light', 'rain', 'rain-heavy', 'freezing-rain', 'thunderstorm', 'thunderstorm-severe']);

// Get temperature modifier for Unsplash query
export function getTemperatureModifier(tempC) {
  if (tempC <= -10) return 'freezing';
  if (tempC <= 0) return 'icy';
  if (tempC <= 10) return 'cold';
  if (tempC >= 30) return 'hot';
  if (tempC >= 25) return 'warm';
  return null;
}

// Get Unsplash query for a condition, optionally adjusted for temperature
export function getConditionQuery(condition, tempC = null) {
  const baseQuery = conditionQueries[condition?.code] || 'weather';

  // Skip modifier for conditions that already imply cold
  if (coldImpliedConditions.has(condition?.code)) {
    return baseQuery;
  }

  const modifier = tempC != null ? getTemperatureModifier(tempC) : null;
  return modifier ? `${modifier} ${baseQuery}` : baseQuery;
}

// Format precipitation amount with one decimal place
export function formatPrecip(amount) {
  if (!amount || amount < 0.1) return null;
  return `${amount.toFixed(1)}in`;
}

// Get formatted condition text with precipitation if applicable
// condition: { code, text, icon, detail? }
// precipitation: { probability, amount, snow, rain }
export function getConditionText(condition, precipitation = {}) {
  let text = condition?.text || 'Unknown';

  // If there's a detail from NWS (like accumulation), use that
  if (condition?.detail) {
    return `${text} — ${condition.detail}`;
  }

  // Otherwise, add precipitation amounts for relevant conditions
  const { snow = 0, rain = 0 } = precipitation;
  if (snowConditions.has(condition?.code) && snow > 0) {
    const precip = formatPrecip(snow);
    if (precip) text += ` (${precip})`;
  } else if (rainConditions.has(condition?.code) && rain > 0) {
    const precip = formatPrecip(rain);
    if (precip) text += ` (${precip})`;
  }

  return text;
}
