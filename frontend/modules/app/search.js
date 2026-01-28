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
    // Update combobox options from geocoding results
    async updateOptions(query) {
      const combobox = app.elements.searchCombobox;

      try {
        const results = await this.geocode(query);

        // Clear existing options
        combobox.querySelectorAll('wa-option').forEach(opt => opt.remove());

        if (results.length === 0) {
          combobox.open = false;
          return;
        }

        // Add new options
        results.forEach((loc) => {
          const option = document.createElement('wa-option');
          // Value encodes lat/lon/name for retrieval on selection
          option.value = JSON.stringify({
            lat: loc.latitude,
            lon: loc.longitude,
            name: loc.name
          });

          // Build display label
          const fullName = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
          option.innerHTML = `
            <strong>${escapeHtml(loc.name)}</strong>
            <small>${[loc.admin1, loc.country].filter(Boolean).map(escapeHtml).join(', ')}</small>
          `;
          option.setAttribute('aria-label', fullName);

          combobox.appendChild(option);
        });

        // Show the dropdown after adding options
        await combobox.updateComplete;
        combobox.open = true;
      } catch (e) {
        console.error('Autocomplete error:', e);
      }
    },

    // Handle option selection
    handleSelection() {
      const combobox = app.elements.searchCombobox;
      const value = combobox.value;

      if (!value) return;

      try {
        const { lat, lon, name } = JSON.parse(value);

        // Clear the combobox
        combobox.value = '';
        combobox.inputValue = '';
        combobox.querySelectorAll('wa-option').forEach(opt => opt.remove());

        // Mark as manual location
        app.isManualLocation = true;
        app.location.updateLocationModeUI();

        // Load weather for selected location
        app.loadWeather(lat, lon, name);
      } catch (e) {
        console.error('Selection error:', e);
      }
    },

    // Clear options
    clearOptions() {
      const combobox = app.elements.searchCombobox;
      combobox.querySelectorAll('wa-option').forEach(opt => opt.remove());
    },

    // Geocode a location query
    async geocode(query) {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Geocoding failed');
      const data = await response.json();
      return data.results || [];
    },

    // Handle direct form submission (for Enter key without selection)
    async handleSearch(searchQuery) {
      const combobox = app.elements.searchCombobox;
      const query = searchQuery || combobox.inputValue || '';

      if (!query.trim()) return;

      this.clearOptions();
      app.showLoading();

      try {
        const response = await fetch(`/api/location?q=${encodeURIComponent(query.trim())}`);
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Location not found');
        }
        const data = await response.json();

        const cityName = data.location.name;

        app.currentLocation = {
          lat: data.location.latitude,
          lon: data.location.longitude,
          name: cityName,
          nwsOffice: data.location.nwsOffice
        };
        app.currentWeather = data.weather;
        app.currentAlerts = data.alerts;

        if (data.weather?.current?.temperature !== undefined) {
          TemperatureColors.setFromCelsius(data.weather.current.temperature);
        }

        const wxStoryPromise = app.weatherLoader.fetchWxStory(data.location.nwsOffice);

        try {
          localStorage.setItem('lastLocation', JSON.stringify(app.currentLocation));
        } catch (e) {
          // localStorage may throw in Safari private mode or hardened contexts
          console.warn('Failed to save location to localStorage:', e);
        }
        combobox.value = '';

        app.isManualLocation = true;
        app.location.updateLocationModeUI();

        const temp = Units.formatTemp(data.weather.current.temperature);
        const condition = data.weather.current.condition?.text || 'Unknown';
        app.elements.locationName.textContent = `${temp} and ${condition} in ${cityName}`;
        app.elements.locationDisplay.hidden = false;

        const wxStory = await wxStoryPromise;
        app.currentWxStory = wxStory;

        await app.cardRenderer.renderAllCards(data.weather, data.alerts, wxStory, cityName);
        app.hideLoading();
      } catch (e) {
        console.error('Search error:', e);
        app.showError(e.message === 'Location not found'
          ? 'No locations found for your search.'
          : 'Failed to search for location. Please try again.');
      }
    }
  };
}
