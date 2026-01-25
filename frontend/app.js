// Main application logic for weather.gripe

// HTML escape function to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const App = {
  // Current state
  currentLocation: null,
  currentWeather: null,
  currentAlerts: null,
  currentWxStory: null,
  isManualLocation: false,

  // DOM elements
  elements: {},

  // Initialize the app
  async init() {
    // Initialize WeatherCards (detects FontAwesome font)
    await WeatherCards.init();

    this.cacheElements();
    this.bindEvents();

    // Start location detection
    await this.autoDetectLocation();
  },

  // Auto-detect location on pageload
  async autoDetectLocation() {
    // Start browser geolocation request immediately (prompts user)
    const browserGeoPromise = this.requestBrowserGeolocation();

    // Check for saved location first
    const savedLocation = localStorage.getItem('lastLocation');
    if (savedLocation) {
      try {
        const location = JSON.parse(savedLocation);
        // Saved location means user previously searched, so mark as manual
        this.isManualLocation = true;
        this.updateLocationModeUI();
        // Don't pass name - let API provide fresh name + region format
        await this.loadWeather(location.lat, location.lon);
        // Don't override user-selected saved location with browser geolocation
        return;
      } catch (e) {
        console.error('Failed to load saved location:', e);
        // Fall through to CF location
        await this.loadFromCloudflareLocation();
      }
    } else {
      // No saved location, use Cloudflare location detection
      await this.loadFromCloudflareLocation();
    }

    // Wait for browser geolocation result (only if no saved location)
    const browserLocation = await browserGeoPromise;
    if (browserLocation) {
      // Update with more precise browser location (don't save auto-detected)
      await this.loadWeather(browserLocation.latitude, browserLocation.longitude, null, false);
    }
  },

  // Fetch and load weather from Cloudflare-detected location
  async loadFromCloudflareLocation() {
    try {
      const response = await fetch('/api/cf-location');
      if (!response.ok) {
        this.hideLoading();
        return;
      }
      const cfLocation = await response.json();
      // Let API provide name + region via reverse geocode (don't save auto-detected)
      await this.loadWeather(cfLocation.latitude, cfLocation.longitude, null, false);
    } catch (e) {
      console.error('Cloudflare location detection failed:', e);
      this.hideLoading();
    }
  },

  // Request browser geolocation (returns null if denied/unavailable)
  async requestBrowserGeolocation() {
    if (!navigator.geolocation) {
      return null;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        });
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (e) {
      // User denied or geolocation unavailable - silently continue
      console.log('Browser geolocation not available:', e.message);
      return null;
    }
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
      this.handleSearch();
    });

    // Search input (debounced autocomplete)
    let searchTimeout;
    this.elements.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = this.elements.searchInput.value.trim();
      if (query.length >= 2) {
        searchTimeout = setTimeout(() => this.showSearchResults(query), 300);
      } else {
        this.hideSearchResults();
      }
    });

    // Hide search results on click outside
    document.addEventListener('click', (e) => {
      if (!this.elements.searchResults.contains(e.target) &&
          e.target !== this.elements.searchInput) {
        this.hideSearchResults();
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
    this.elements.unitsMetric.addEventListener('click', () => this.refreshCards());
    this.elements.unitsImperial.addEventListener('click', () => this.refreshCards());

    // Location reset button - return to auto-detected location
    this.elements.locationResetBtn.addEventListener('click', () => this.resetToAutoLocation());
  },

  // Update search input end icon based on location mode
  updateLocationModeUI() {
    if (this.isManualLocation) {
      this.elements.searchIconEnd.hidden = true;
      this.elements.locationResetBtn.hidden = false;
    } else {
      this.elements.searchIconEnd.hidden = false;
      this.elements.locationResetBtn.hidden = true;
    }
  },

  // Reset to auto-detected location (Cloudflare + browser geolocation)
  async resetToAutoLocation() {
    // Clear saved location
    localStorage.removeItem('lastLocation');
    this.isManualLocation = false;
    this.updateLocationModeUI();
    this.elements.searchInput.value = '';

    // Re-run auto-detection
    this.showLoading();

    // Start browser geolocation request immediately
    const browserGeoPromise = this.requestBrowserGeolocation();

    // Load from Cloudflare location first
    await this.loadFromCloudflareLocation();

    // Then update with more precise browser location if available (don't save)
    const browserLocation = await browserGeoPromise;
    if (browserLocation) {
      await this.loadWeather(browserLocation.latitude, browserLocation.longitude, null, false);
    }
  },

  // Handle search form submission
  async handleSearch() {
    const query = this.elements.searchInput.value.trim();
    if (!query) return;

    this.hideSearchResults();
    this.showLoading();

    try {
      // Use consolidated endpoint directly for form submission (saves one API call)
      const response = await fetch(`/api/location?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Location not found');
      }
      const data = await response.json();

      // Combine name + region for display
      const displayName = [data.location.name, data.location.region].filter(Boolean).join(', ');

      this.currentLocation = {
        lat: data.location.latitude,
        lon: data.location.longitude,
        name: displayName,
        nwsOffice: data.location.nwsOffice
      };
      this.currentWeather = data.weather;
      this.currentAlerts = data.alerts;

      // Update primary color based on current temperature
      if (data.weather?.current?.temperature !== undefined) {
        TemperatureColors.setFromCelsius(data.weather.current.temperature);
      }

      // Fetch weather story (don't await, render cards first)
      const wxStoryPromise = this.fetchWxStory(data.location.nwsOffice);

      // Save to storage and clear input
      localStorage.setItem('lastLocation', JSON.stringify(this.currentLocation));
      this.elements.searchInput.value = '';

      // Mark as manual location and update UI
      this.isManualLocation = true;
      this.updateLocationModeUI();

      // Update location display
      this.elements.locationName.textContent = displayName;
      this.elements.locationDisplay.hidden = false;

      // Wait for wxstory and render
      const wxStory = await wxStoryPromise;
      this.currentWxStory = wxStory;

      // Render weather cards
      await this.renderAllCards(data.weather, data.alerts, wxStory, displayName);
      this.hideLoading();
    } catch (e) {
      console.error('Search error:', e);
      this.showError(e.message === 'Location not found'
        ? 'No locations found for your search.'
        : 'Failed to search for location. Please try again.');
    }
  },

  // Show search results dropdown
  async showSearchResults(query) {
    try {
      const results = await this.geocode(query);

      if (results.length === 0) {
        this.hideSearchResults();
        return;
      }

      this.elements.searchResults.innerHTML = results.map(loc => `
        <div class="search-result-item" data-lat="${loc.latitude}" data-lon="${loc.longitude}" data-name="${escapeHtml(loc.name)}">
          <strong>${escapeHtml(loc.name)}</strong>
          <small style="display: block; color: var(--wa-color-text-quiet);">${[loc.admin1, loc.country].filter(Boolean).map(escapeHtml).join(', ')}</small>
        </div>
      `).join('');

      // Add click handlers
      this.elements.searchResults.querySelectorAll('[data-lat]').forEach(item => {
        item.addEventListener('click', () => {
          const lat = parseFloat(item.dataset.lat);
          const lon = parseFloat(item.dataset.lon);
          const name = item.dataset.name;
          this.elements.searchInput.value = '';
          this.hideSearchResults();
          // Mark as manual location
          this.isManualLocation = true;
          this.updateLocationModeUI();
          this.loadWeather(lat, lon, name);
        });
      });

      this.elements.searchResults.hidden = false;
    } catch (e) {
      console.error('Autocomplete error:', e);
    }
  },

  // Hide search results dropdown
  hideSearchResults() {
    this.elements.searchResults.hidden = true;
    this.elements.searchResults.innerHTML = '';
  },

  // Geocode a location query
  async geocode(query) {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Geocoding failed');
    const data = await response.json();
    return data.results || [];
  },

  // Fetch Unsplash background image
  async fetchBackground(query) {
    try {
      const response = await fetch(`/api/unsplash?query=${encodeURIComponent(query)}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.error ? null : data;
    } catch (e) {
      console.warn('Unsplash fetch failed:', e);
      return null;
    }
  },

  // Fetch NWS Weather Story images
  async fetchWxStory(office) {
    if (!office) return null;
    try {
      const response = await fetch(`/api/wxstory?office=${encodeURIComponent(office)}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.images?.length > 0 ? data : null;
    } catch (e) {
      console.warn('Weather story fetch failed:', e);
      return null;
    }
  },

  // Fetch radar data for a location
  async fetchRadar(lat, lon) {
    try {
      const response = await fetch(`/api/radar?lat=${lat}&lon=${lon}`);
      if (!response.ok) return null;
      return response.json();
    } catch (e) {
      console.warn('Radar fetch failed:', e);
      return null;
    }
  },

  // Load weather for a location
  // saveLocation: whether to persist to localStorage (false for auto-detected)
  async loadWeather(lat, lon, name = null, saveLocation = true) {
    this.showLoading();

    try {
      const response = await fetch(`/api/location?lat=${lat}&lon=${lon}`);
      if (!response.ok) throw new Error('Failed to load weather');
      const data = await response.json();

      // Use provided name or combine name + region from API
      const locationName = name || [data.location.name, data.location.region].filter(Boolean).join(', ');
      this.currentLocation = {
        lat: data.location.latitude,
        lon: data.location.longitude,
        name: locationName,
        nwsOffice: data.location.nwsOffice
      };
      this.currentWeather = data.weather;
      this.currentAlerts = data.alerts;

      // Update primary color based on current temperature
      if (data.weather?.current?.temperature !== undefined) {
        TemperatureColors.setFromCelsius(data.weather.current.temperature);
      }

      // Fetch weather story (don't await, render cards first)
      const wxStoryPromise = this.fetchWxStory(data.location.nwsOffice);

      // Save to local storage only for manual location selections
      if (saveLocation) {
        localStorage.setItem('lastLocation', JSON.stringify(this.currentLocation));
      }

      // Update location display
      this.elements.locationName.textContent = locationName;
      this.elements.locationDisplay.hidden = false;

      // Wait for wxstory and render
      const wxStory = await wxStoryPromise;
      this.currentWxStory = wxStory;

      // Render weather cards
      await this.renderAllCards(data.weather, data.alerts, wxStory, locationName);

      this.hideLoading();
    } catch (e) {
      console.error('Load weather error:', e);
      this.showError('Failed to load weather data. Please try again.');
    }
  },

  // Add photo attribution to a card
  addPhotoAttribution(card, background) {
    if (!background) return;

    // Trigger Unsplash download tracking (fire-and-forget, via our proxy)
    if (background.downloadLocation) {
      fetch(`/api/unsplash/download?url=${encodeURIComponent(background.downloadLocation)}`).catch(() => {});
    }

    const attribution = document.createElement('small');
    attribution.className = 'photo-attribution';

    // Build attribution using DOM APIs to prevent XSS
    attribution.appendChild(document.createTextNode('Photo by '));

    const photographerLink = document.createElement('a');
    photographerLink.href = `${background.photographerUrl}?utm_source=weather.gripe&utm_medium=referral`;
    photographerLink.target = '_blank';
    photographerLink.textContent = background.photographer;
    attribution.appendChild(photographerLink);

    attribution.appendChild(document.createTextNode(' on '));

    const unsplashLink = document.createElement('a');
    unsplashLink.href = `${background.unsplashUrl}?utm_source=weather.gripe&utm_medium=referral`;
    unsplashLink.target = '_blank';
    unsplashLink.textContent = 'Unsplash';
    attribution.appendChild(unsplashLink);

    // Insert before footer (goes into body slot)
    const footer = card.querySelector('[slot="footer"]');
    if (footer) {
      card.insertBefore(attribution, footer);
    } else {
      card.appendChild(attribution);
    }
  },

  // Render all weather cards
  async renderAllCards(weather, alerts = [], wxStory = null, locationName = null) {
    const cards = [];
    const daily = weather?.daily || [];

    // Extract just the city name (before comma) for card labels
    const cityName = locationName?.split(',')[0]?.trim() || null;

    // Get timezone from weather data for displaying location's local time
    const timezone = weather?.timezone || null;

    // Determine if NWS data with detailed forecasts
    const isNWS = weather.source === 'nws';

    // Determine night mode: after sunset OR today's high is missing
    const now = new Date();
    const todaySunset = daily[0]?.sunset ? new Date(daily[0].sunset) : null;
    const isAfterSunset = todaySunset && now > todaySunset;
    const isMissingTodayHigh = daily[0]?.high == null;
    const isNightMode = isAfterSunset || isMissingTodayHigh;

    // Get background image based on current conditions and temperature (start fetch early)
    const conditionQuery = WeatherCards.getConditionQuery(weather.current.condition, weather.current.temperature);
    const backgroundPromise = this.fetchBackground(conditionQuery);

    // Start radar fetch early for US locations (parallel with background)
    const radarPromise = isNWS ? this.fetchRadar(this.currentLocation?.lat, this.currentLocation?.lon) : null;

    // For detailed cards, fetch backgrounds based on their specific conditions and temps
    let detailedBg1Promise = null;
    let detailedBg2Promise = null;
    if (isNWS) {
      if (isNightMode) {
        // Tonight + Tomorrow
        const tonightForecast = daily[0]?.nightForecast;
        const tomorrowForecast = daily[1]?.dayForecast;
        if (tonightForecast?.condition) {
          detailedBg1Promise = this.fetchBackground(WeatherCards.getConditionQuery(tonightForecast.condition, daily[0]?.low));
        }
        if (tomorrowForecast?.condition) {
          detailedBg2Promise = this.fetchBackground(WeatherCards.getConditionQuery(tomorrowForecast.condition, daily[1]?.high));
        }
      } else {
        // Today + Tonight
        const todayForecast = daily[0]?.dayForecast;
        const tonightForecast = daily[0]?.nightForecast;
        if (todayForecast?.condition) {
          detailedBg1Promise = this.fetchBackground(WeatherCards.getConditionQuery(todayForecast.condition, daily[0]?.high));
        }
        if (tonightForecast?.condition) {
          detailedBg2Promise = this.fetchBackground(WeatherCards.getConditionQuery(tonightForecast.condition, daily[0]?.low));
        }
      }
    }

    // Render all cards in parallel, then sort by order and append
    const cardPromises = [];

    // Alert cards (order: 0.x)
    alerts.forEach((alert, i) => {
      cardPromises.push((async () => {
        const canvas = document.createElement('canvas');
        await WeatherCards.renderAlert(canvas, {
          event: alert.event,
          severity: alert.severity,
          urgency: alert.urgency,
          onset: alert.onset,
          ends: alert.ends,
          instruction: alert.instruction,
          description: alert.description,
          senderName: alert.senderName
        }, timezone);
        return { order: 0 + i * 0.1, card: WeatherCards.createCardContainer(canvas, 'alert') };
      })());
    });

    // Current conditions card (order: 1, depends on background)
    cardPromises.push((async () => {
      const background = await backgroundPromise;
      const canvas = document.createElement('canvas');
      await WeatherCards.renderCurrentConditions(canvas, weather, background?.url, background?.username, timezone);
      const card = WeatherCards.createCardContainer(canvas, 'current');
      this.addPhotoAttribution(card, background);
      return { order: 1, card };
    })());

    // Detailed forecast cards (NWS only, order: 2-3, depend on their backgrounds)
    if (isNWS) {
      if (isNightMode) {
        // Tonight card (order: 2)
        const tonightForecast = daily[0]?.nightForecast;
        if (tonightForecast?.detailedForecast) {
          cardPromises.push((async () => {
            const detailedBg1 = detailedBg1Promise ? await detailedBg1Promise : null;
            const canvas = document.createElement('canvas');
            const result = await WeatherCards.renderDetailedForecast(
              canvas, tonightForecast, detailedBg1?.url, detailedBg1?.username, cityName, timezone
            );
            if (result) {
              const card = WeatherCards.createCardContainer(canvas, 'detailed-tonight');
              this.addPhotoAttribution(card, detailedBg1);
              return { order: 2, card };
            }
            return null;
          })());
        }

        // Tomorrow card (order: 3)
        const tomorrowForecast = daily[1]?.dayForecast;
        if (tomorrowForecast?.detailedForecast) {
          cardPromises.push((async () => {
            const detailedBg2 = detailedBg2Promise ? await detailedBg2Promise : null;
            const canvas = document.createElement('canvas');
            const result = await WeatherCards.renderDetailedForecast(
              canvas, tomorrowForecast, detailedBg2?.url, detailedBg2?.username, cityName, timezone
            );
            if (result) {
              const card = WeatherCards.createCardContainer(canvas, 'detailed-tomorrow');
              this.addPhotoAttribution(card, detailedBg2);
              return { order: 3, card };
            }
            return null;
          })());
        }
      } else {
        // Today card (order: 2)
        const todayForecast = daily[0]?.dayForecast;
        if (todayForecast?.detailedForecast) {
          cardPromises.push((async () => {
            const detailedBg1 = detailedBg1Promise ? await detailedBg1Promise : null;
            const canvas = document.createElement('canvas');
            const result = await WeatherCards.renderDetailedForecast(
              canvas, todayForecast, detailedBg1?.url, detailedBg1?.username, cityName, timezone
            );
            if (result) {
              const card = WeatherCards.createCardContainer(canvas, 'detailed-today');
              this.addPhotoAttribution(card, detailedBg1);
              return { order: 2, card };
            }
            return null;
          })());
        }

        // Tonight card (order: 3)
        const tonightForecast = daily[0]?.nightForecast;
        if (tonightForecast?.detailedForecast) {
          cardPromises.push((async () => {
            const detailedBg2 = detailedBg2Promise ? await detailedBg2Promise : null;
            const canvas = document.createElement('canvas');
            const result = await WeatherCards.renderDetailedForecast(
              canvas, tonightForecast, detailedBg2?.url, detailedBg2?.username, cityName, timezone
            );
            if (result) {
              const card = WeatherCards.createCardContainer(canvas, 'detailed-tonight');
              this.addPhotoAttribution(card, detailedBg2);
              return { order: 3, card };
            }
            return null;
          })());
        }
      }
    }

    // Day forecast card (order: 4, independent)
    cardPromises.push((async () => {
      const canvas = document.createElement('canvas');
      await WeatherCards.renderDayForecast(canvas, weather, timezone);
      return { order: 4, card: WeatherCards.createCardContainer(canvas, 'day') };
    })());

    // Radar card (order: 5, depends on radar data)
    if (isNWS && radarPromise) {
      cardPromises.push((async () => {
        const radarData = await radarPromise;
        const canvas = document.createElement('canvas');
        await WeatherCards.renderRadar(canvas, radarData, cityName, timezone);
        return { order: 5, card: WeatherCards.createCardContainer(canvas, 'radar') };
      })());
    }

    // Forecast graph card (order: 6, independent)
    cardPromises.push((async () => {
      const canvas = document.createElement('canvas');
      await WeatherCards.renderForecastGraph(canvas, weather, locationName, timezone);
      return { order: 6, card: WeatherCards.createCardContainer(canvas, 'forecast') };
    })());

    // Weather story cards (order: 7+)
    if (wxStory && wxStory.images.length > 0) {
      wxStory.images.forEach((image, i) => {
        cardPromises.push((async () => {
          const card = this.createWxStoryCard(image, wxStory.office, i + 1);
          return { order: 7 + i * 0.1, card };
        })());
      });
    }

    // Wait for all cards, filter nulls, sort by order, append to DOM
    const results = (await Promise.all(cardPromises)).filter(r => r !== null);
    results.sort((a, b) => a.order - b.order);

    this.elements.weatherCards.innerHTML = '';
    results.forEach(r => this.elements.weatherCards.appendChild(r.card));

    // Update footer attribution based on data source
    this.updateDataSource(weather);
  },

  // Refresh cards with current data (after unit change)
  async refreshCards() {
    if (this.currentWeather) {
      await this.renderAllCards(this.currentWeather, this.currentAlerts || [], this.currentWxStory, this.currentLocation?.name);
    }
  },

  // Update footer data source attribution based on weather source
  updateDataSource(weather) {
    if (!this.elements.dataSource) return;
    const isNWS = weather?.source === 'nws';
    const lat = this.currentLocation?.lat;
    const lon = this.currentLocation?.lon;
    if (isNWS) {
      const url = lat && lon
        ? `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}`
        : 'https://www.weather.gov/';
      this.elements.dataSource.innerHTML = `<a href="${url}" target="_blank" class="footer-link">NWS</a>`;
    } else {
      this.elements.dataSource.innerHTML = '<a href="https://open-meteo.com/" target="_blank" class="footer-link">Open-Meteo</a>';
    }
    if (this.elements.siteFooter) {
      this.elements.siteFooter.hidden = false;
    }
  },

  // Create a weather story card (follows same pattern as other weather cards)
  createWxStoryCard(imageUrl, office, index) {
    const container = document.createElement('wa-card');
    container.className = 'weather-card';
    container.dataset.cardType = 'wxstory';

    const img = document.createElement('img');
    img.slot = 'media';
    img.src = imageUrl;
    img.alt = `NWS ${office} Weather Story ${index}`;
    img.loading = 'lazy';
    container.appendChild(img);

    container.appendChild(WeatherCards.createCardActions(
      () => this.shareWxStoryCard(imageUrl, office, index),
      () => this.downloadWxStoryCard(imageUrl, office, index)
    ));
    return container;
  },

  // Share wxstory card using Web Share API
  async shareWxStoryCard(imageUrl, office, index) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `wxstory-${office}-${index}.png`, { type: 'image/png' });

      await navigator.share({
        title: `NWS ${office} Weather Story`,
        files: [file]
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        this.downloadWxStoryCard(imageUrl, office, index);
      }
    }
  },

  // Download wxstory card as image
  downloadWxStoryCard(imageUrl, office, index) {
    const link = document.createElement('a');
    link.download = `wxstory-${office}-${index}.png`;
    link.href = imageUrl;
    link.click();
  },

  // Show loading state with skeleton cards
  showLoading() {
    this.elements.errorState.hidden = true;
    this.elements.locationDisplay.hidden = true;

    // Skip if skeletons already showing (e.g., initial page load)
    if (this.elements.weatherCards.querySelector('[data-card-type^="skeleton-"]')) {
      return;
    }

    // Clear real cards and show skeletons
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
    this.elements.weatherCards.innerHTML = '';
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
