// Search functionality for the app

import { Units } from '../utils/units.js';
import { TemperatureColors } from '../utils/temperature-colors.js';

// HTML escape function to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Create search manager with dependency injection
export function createSearchManager(app) {
  return {
    // Handle search form submission
    async handleSearch() {
      const query = app.elements.searchInput.value.trim();
      if (!query) return;

      this.hideSearchResults();
      app.showLoading();

      try {
        // Use consolidated endpoint directly for form submission (saves one API call)
        const response = await fetch(`/api/location?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Location not found');
        }
        const data = await response.json();

        // Use city name from API for display
        const cityName = data.location.name;

        app.currentLocation = {
          lat: data.location.latitude,
          lon: data.location.longitude,
          name: cityName,
          nwsOffice: data.location.nwsOffice
        };
        app.currentWeather = data.weather;
        app.currentAlerts = data.alerts;

        // Update primary color based on current temperature
        if (data.weather?.current?.temperature !== undefined) {
          TemperatureColors.setFromCelsius(data.weather.current.temperature);
        }

        // Fetch weather story (don't await, render cards first)
        const wxStoryPromise = app.weatherLoader.fetchWxStory(data.location.nwsOffice);

        // Save to storage and clear input
        localStorage.setItem('lastLocation', JSON.stringify(app.currentLocation));
        app.elements.searchInput.value = '';

        // Mark as manual location and update UI
        app.isManualLocation = true;
        app.location.updateLocationModeUI();

        // Update location display with current conditions
        const temp = Units.formatTemp(data.weather.current.temperature);
        const condition = data.weather.current.condition?.text || 'Unknown';
        app.elements.locationName.textContent = `${temp} and ${condition} in ${cityName}`;
        app.elements.locationDisplay.hidden = false;

        // Wait for wxstory and render
        const wxStory = await wxStoryPromise;
        app.currentWxStory = wxStory;

        // Render weather cards
        await app.cardRenderer.renderAllCards(data.weather, data.alerts, wxStory, cityName);
        app.hideLoading();
      } catch (e) {
        console.error('Search error:', e);
        app.showError(e.message === 'Location not found'
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

        app.elements.searchResults.innerHTML = results.map(loc => {
          const fullName = [loc.name, loc.admin1, loc.country].filter(Boolean).map(escapeHtml).join(', ');
          return `
          <div class="search-result-item" role="option" tabindex="0" data-lat="${loc.latitude}" data-lon="${loc.longitude}" data-name="${escapeHtml(loc.name)}" aria-label="${fullName}">
            <strong>${escapeHtml(loc.name)}</strong>
            <small style="display: block; color: var(--wa-color-text-quiet);">${[loc.admin1, loc.country].filter(Boolean).map(escapeHtml).join(', ')}</small>
          </div>
        `;
        }).join('');

        // Add click and keyboard handlers
        app.elements.searchResults.querySelectorAll('[data-lat]').forEach(item => {
          const selectLocation = () => {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            const name = item.dataset.name;
            app.elements.searchInput.value = '';
            this.hideSearchResults();
            // Mark as manual location
            app.isManualLocation = true;
            app.location.updateLocationModeUI();
            app.loadWeather(lat, lon, name);
          };
          item.addEventListener('click', selectLocation);
          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectLocation();
            }
          });
        });

        app.elements.searchResults.hidden = false;
      } catch (e) {
        console.error('Autocomplete error:', e);
      }
    },

    // Hide search results dropdown
    hideSearchResults() {
      app.elements.searchResults.hidden = true;
      app.elements.searchResults.innerHTML = '';
    },

    // Geocode a location query
    async geocode(query) {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Geocoding failed');
      const data = await response.json();
      return data.results || [];
    }
  };
}
