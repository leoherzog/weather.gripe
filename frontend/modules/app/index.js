// App orchestrator - main application logic

import { Units } from '../utils/units.js';
import { createLocationManager } from './location.js';
import { createSearchManager } from './search.js';
import { createWeatherLoader } from './weather-loader.js';
import { createCardRenderer } from './card-renderer.js';

export const App = {
  // Current state
  currentLocation: null,
  currentWeather: null,
  currentAlerts: null,
  currentWxStory: null,
  isManualLocation: false,

  // DOM elements
  elements: {},

  // Sub-modules (initialized in init())
  location: null,
  search: null,
  weatherLoader: null,
  cardRenderer: null,

  // Initialize the app
  async init() {
    this.cacheElements();

    // Initialize sub-modules with dependency injection
    this.location = createLocationManager(this);
    this.search = createSearchManager(this);
    this.weatherLoader = createWeatherLoader(this);
    this.cardRenderer = createCardRenderer(this);

    this.bindEvents();

    // Start location detection
    await this.location.autoDetectLocation();
  },

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      searchCombobox: document.getElementById('search-combobox'),
      locationResetBtn: document.getElementById('location-reset-btn'),
      locationDisplay: document.getElementById('location-display'),
      locationName: document.getElementById('location-name'),
      errorState: document.getElementById('error-state'),
      errorMessage: document.getElementById('error-message'),
      errorRetry: document.getElementById('error-retry'),
      weatherCards: document.getElementById('weather-cards'),
      unitToggle: document.getElementById('unit-toggle'),
      siteFooter: document.getElementById('site-footer'),
      dataSource: document.getElementById('data-source')
    };
  },

  // Bind event handlers
  bindEvents() {
    const combobox = this.elements.searchCombobox;

    // Track current search query for Enter key handler
    let currentQuery = '';

    // Debounced keyup handler for autocomplete (wa-combobox doesn't fire 'input' on typing)
    let searchTimeout;
    const ignoreKeys = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta'];
    combobox.addEventListener('keyup', (e) => {
      // Ignore navigation and modifier keys
      if (ignoreKeys.includes(e.key)) return;

      clearTimeout(searchTimeout);
      currentQuery = combobox.inputValue?.trim() || '';

      if (currentQuery.length >= 2) {
        searchTimeout = setTimeout(() => this.search.updateOptions(currentQuery), 300);
      } else {
        this.search.clearOptions();
      }
    });

    // Handle option selection
    combobox.addEventListener('change', () => {
      this.search.handleSelection();
      currentQuery = '';
    });

    // Handle Enter key press without selection (direct search)
    // Use capture phase since wa-combobox may intercept the event in shadow DOM
    combobox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Check if an option is highlighted (current = keyboard-navigated, not selected)
        const highlighted = [...combobox.querySelectorAll('wa-option')].some(opt => opt.current);
        if (!highlighted && currentQuery) {
          e.preventDefault();
          e.stopPropagation();
          clearTimeout(searchTimeout);
          this.search.handleSearch(currentQuery);
          currentQuery = '';
        }
      }
    }, true);

    // Clear options when menu closes
    combobox.addEventListener('wa-hide', () => {
      // Small delay to allow selection to process first
      setTimeout(() => {
        if (!combobox.value) {
          this.search.clearOptions();
        }
      }, 100);
    });

    // Error retry button
    this.elements.errorRetry.addEventListener('click', () => {
      if (this.currentLocation) {
        this.loadWeather(
          this.currentLocation.lat,
          this.currentLocation.lon,
          this.currentLocation.name
        );
      }
    });

    // Unit toggle - wa-radio-group emits change with built-in selection state
    this.elements.unitToggle.addEventListener('change', () => {
      Units.setSystem(this.elements.unitToggle.value);
      this.updateHeading();
      this.cardRenderer.refreshTheme();
    });

    // Location reset button - return to auto-detected location
    this.elements.locationResetBtn.addEventListener('click', () => this.location.resetToAutoLocation());

    // Re-render cards when dark/light mode changes (canvas cards are theme-aware)
    // Uses refreshTheme() to re-render canvases in-place, preserving current photos
    // Track wa-dark state so we only refresh on actual theme toggle, not unrelated class changes
    // (e.g., wa-scroll-lock added/removed by dialogs/lightbox)
    let wasDark = document.documentElement.classList.contains('wa-dark');
    new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('wa-dark');
      if (isDark !== wasDark) {
        wasDark = isDark;
        this.cardRenderer.refreshTheme();
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  },

  // Update the h2 heading with current units
  updateHeading() {
    if (!this.currentWeather?.current || !this.currentLocation?.name) return;
    const temp = Units.formatTemp(this.currentWeather.current.temperature);
    const condition = this.currentWeather.current.condition?.text || 'Unknown';
    this.elements.locationName.textContent = `${temp} and ${condition} in ${this.currentLocation.name}`;
  },

  // Proxy method to weather loader for backward compatibility
  async loadWeather(lat, lon, name = null, saveLocation = true) {
    return this.weatherLoader.loadWeather(lat, lon, name, saveLocation);
  },

  // Show loading state with skeleton cards
  showLoading() {
    this.elements.errorState.hidden = true;
    this.elements.locationDisplay.hidden = true;

    // Skip if skeletons already showing (e.g., initial page load)
    if (this.elements.weatherCards.querySelector('[data-card-type^="skeleton-"]')) {
      return;
    }

    // Clean up any MapLibre maps and show skeletons
    this.cardRenderer?.cleanupMapCards();
    this.elements.weatherCards.innerHTML = `
      <wa-card class="weather-card" data-card-type="skeleton-current">
        <wa-skeleton slot="media" effect="sheen" class="skeleton-current"></wa-skeleton>
        <div slot="footer" class="wa-cluster wa-gap-xs">
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
        </div>
      </wa-card>
      <wa-card class="weather-card" data-card-type="skeleton-day">
        <wa-skeleton slot="media" effect="sheen" class="skeleton-day"></wa-skeleton>
        <div slot="footer" class="wa-cluster wa-gap-xs">
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
        </div>
      </wa-card>
      <wa-card class="weather-card" data-card-type="skeleton-forecast">
        <wa-skeleton slot="media" effect="sheen" class="skeleton-forecast"></wa-skeleton>
        <div slot="footer" class="wa-cluster wa-gap-xs">
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
        </div>
      </wa-card>`;
  },

  // Hide loading state (clear skeletons)
  hideLoading() {
    // Clear any skeleton cards that might be showing
    const skeletons = this.elements.weatherCards.querySelectorAll('[data-card-type^="skeleton-"]');
    skeletons.forEach(el => el.remove());
  },

  // Show error state
  showError(message) {
    this.elements.errorState.hidden = false;
    this.elements.errorMessage.textContent = message;
    this.cardRenderer?.cleanupMapCards();
    this.elements.weatherCards.innerHTML = '';
  }
};
