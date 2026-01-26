// Main entry point for weather.gripe

// Web Awesome Pro components (side-effect import)
import './modules/ui/webawesome.js';

// App styles
import './style.css';

// Initialize temperature colors early (async load of chroma-js)
import { TemperatureColors } from './modules/utils/temperature-colors.js';

// Unit toggle and app
import { initUnitToggle } from './modules/ui/unit-toggle.js';
import { App } from './modules/app/index.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize temperature colors (loads chroma-js lazily)
  await TemperatureColors.init();

  // Initialize unit toggle UI
  initUnitToggle();

  // Initialize main app
  await App.init();
});
