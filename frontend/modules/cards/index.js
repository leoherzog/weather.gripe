// Weather Cards module facade
// Re-exports all public card rendering functions

import { initIcons, CARD_WIDTH, CARD_HEIGHT } from './core.js';
import { getConditionQuery, getConditionText } from './condition-utils.js';
import { renderCurrentConditions } from './current.js';
import { renderDayForecast } from './day-forecast.js';
import { renderForecastGraph } from './forecast-graph.js';
import { renderHourlyForecast } from './hourly-forecast.js';
import { renderAlert } from './alert.js';
import { renderDetailedForecast } from './detailed.js';
import { shareCard, downloadCard, createCardActions, createCardContainer } from './share.js';

// Lazy-loaded map card modules (keeps maplibre-gl out of main bundle)
// These are only loaded when a user actually views a radar or alert-map card

async function createAlertMapCard(...args) {
  const { createAlertMapCard: create } = await import('./alert-map.js');
  return create(...args);
}

async function createRadarCard(...args) {
  const { createRadarCard: create } = await import('./radar.js');
  return create(...args);
}

async function renderRadarUnavailable(...args) {
  const { renderRadarUnavailable: render } = await import('./radar.js');
  return render(...args);
}

async function renderRadarError(...args) {
  const { renderRadarError: render } = await import('./radar.js');
  return render(...args);
}

// WeatherCards API - maintains backward compatibility with the original global object
export const WeatherCards = {
  // Card dimensions
  CARD_WIDTH,
  CARD_HEIGHT,

  // Initialize (load icons)
  async init() {
    await initIcons();
  },

  // Condition utilities
  getConditionQuery,
  getConditionText,

  // Card renderers
  renderCurrentConditions,
  renderDayForecast,
  renderForecastGraph,
  renderHourlyForecast,
  renderAlert,
  createAlertMapCard,
  renderDetailedForecast,
  createRadarCard,
  renderRadarUnavailable,
  renderRadarError,

  // Share/download utilities
  shareCard,
  downloadCard,
  createCardActions,
  createCardContainer
};

// Also export individual functions for tree-shaking
export {
  initIcons,
  getConditionQuery,
  getConditionText,
  renderCurrentConditions,
  renderDayForecast,
  renderForecastGraph,
  renderHourlyForecast,
  renderAlert,
  createAlertMapCard,
  renderDetailedForecast,
  createRadarCard,
  renderRadarUnavailable,
  renderRadarError,
  shareCard,
  downloadCard,
  createCardActions,
  createCardContainer
};
