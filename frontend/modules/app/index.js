// App orchestrator - main application logic

import { WeatherCards } from '../cards/index.js';
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
    // Initialize WeatherCards (detects FontAwesome font)
    await WeatherCards.init();

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
      searchForm: document.getElementById('search-form'),
      searchInput: document.getElementById('search-input'),
      searchIconEnd: document.getElementById('search-icon-end'),
      locationResetBtn: document.getElementById('location-reset-btn'),
      searchResults: document.getElementById('search-results'),
      locationDisplay: document.getElementById('location-display'),
      locationName: document.getElementById('location-name'),
      errorState: document.getElementById('error-state'),
      errorMessage: document.getElementById('error-message'),
      errorRetry: document.getElementById('error-retry'),
      weatherCards: document.getElementById('weather-cards'),
      unitsMetric: document.getElementById('units-metric'),
      unitsImperial: document.getElementById('units-imperial'),
      siteFooter: document.getElementById('site-footer'),
      dataSource: document.getElementById('data-source')
    };
  },

  // Bind event handlers
  bindEvents() {
    // Search form
    this.elements.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.search.handleSearch();
    });

    // Search input (debounced autocomplete)
    let searchTimeout;
    this.elements.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = this.elements.searchInput.value.trim();
      if (query.length >= 2) {
        searchTimeout = setTimeout(() => this.search.showSearchResults(query), 300);
      } else {
        this.search.hideSearchResults();
      }
    });

    // Hide search results on click outside
    document.addEventListener('click', (e) => {
      if (!this.elements.searchResults.contains(e.target) &&
          e.target !== this.elements.searchInput) {
        this.search.hideSearchResults();
      }
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

    // Unit toggle buttons - UI handled by inline script, just refresh cards here
    this.elements.unitsMetric.addEventListener('click', () => this.cardRenderer.refreshCards());
    this.elements.unitsImperial.addEventListener('click', () => this.cardRenderer.refreshCards());

    // Location reset button - return to auto-detected location
    this.elements.locationResetBtn.addEventListener('click', () => this.location.resetToAutoLocation());
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
        <div slot="footer" class="flex wa-gap-xs">
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
        </div>
      </wa-card>
      <wa-card class="weather-card" data-card-type="skeleton-day">
        <wa-skeleton slot="media" effect="sheen" class="skeleton-day"></wa-skeleton>
        <div slot="footer" class="flex wa-gap-xs">
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
          <wa-skeleton effect="sheen" class="flex-1 h-9"></wa-skeleton>
        </div>
      </wa-card>
      <wa-card class="weather-card" data-card-type="skeleton-forecast">
        <wa-skeleton slot="media" effect="sheen" class="skeleton-forecast"></wa-skeleton>
        <div slot="footer" class="flex wa-gap-xs">
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
