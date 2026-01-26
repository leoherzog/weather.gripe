// Weather Cards module facade
// Re-exports all public card rendering functions

import { initIcons, CARD_WIDTH, CARD_HEIGHT } from './core.js';
import { getConditionQuery, getConditionText } from './condition-utils.js';
import { renderCurrentConditions } from './current.js';
import { renderDayForecast } from './day-forecast.js';
import { renderForecastGraph } from './forecast-graph.js';
import { renderAlert } from './alert.js';
import { renderDetailedForecast } from './detailed.js';
import { createRadarCard, renderRadarUnavailable, renderRadarError } from './radar.js';
import { shareCard, downloadCard, createCardActions, createCardContainer } from './share.js';

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
  renderAlert,
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
  renderAlert,
  renderDetailedForecast,
  createRadarCard,
  renderRadarUnavailable,
  renderRadarError,
  shareCard,
  downloadCard,
  createCardActions,
  createCardContainer
};
