// Weather data loading for the app

import { Units } from '../utils/units.js';
import { TemperatureColors } from '../utils/temperature-colors.js';

// Create weather loader with dependency injection
export function createWeatherLoader(app) {
  return {
    // Load weather for a location
    // saveLocation: whether to persist to localStorage (false for auto-detected)
    async loadWeather(lat, lon, name = null, saveLocation = true) {
      app.showLoading();

      try {
        const response = await fetch(`/api/location?lat=${lat}&lon=${lon}`);
        if (!response.ok) throw new Error('Failed to load weather');
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
        const wxStoryPromise = this.fetchWxStory(data.location.nwsOffice);

        // Save to local storage only for manual location selections
        if (saveLocation) {
          localStorage.setItem('lastLocation', JSON.stringify(app.currentLocation));
        }

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
        console.error('Load weather error:', e);
        app.showError('Failed to load weather data. Please try again.');
      }
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
    }
  };
}
