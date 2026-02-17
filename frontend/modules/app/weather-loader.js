// Weather data loading for the app

import { TemperatureColors } from '../utils/temperature-colors.js';

// Create weather loader with dependency injection
export function createWeatherLoader(app) {
  // Request versioning to prevent race conditions
  let currentRequestVersion = 0;

  return {
    // Load weather for a location
    // saveLocation: whether to persist to localStorage (false for auto-detected)
    async loadWeather(lat, lon, name = null, saveLocation = true) {
      // Increment version to track this request
      const thisRequest = ++currentRequestVersion;
      app.showLoading();

      try {
        const response = await fetch(`/api/location?lat=${lat}&lon=${lon}`);

        // Check if a newer request has started - if so, abandon this one
        if (thisRequest !== currentRequestVersion) return;

        if (!response.ok) throw new Error('Failed to load weather');
        const data = await response.json();

        // Check again after parsing JSON
        if (thisRequest !== currentRequestVersion) return;

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
          try {
            localStorage.setItem('lastLocation', JSON.stringify(app.currentLocation));
          } catch (e) {
            // localStorage may throw in Safari private mode or hardened contexts
            console.warn('Failed to save location to localStorage:', e);
          }
        }

        // Update location display with current conditions
        app.updateHeading();
        app.elements.locationDisplay.hidden = false;

        // Wait for wxstory and render
        const wxStory = await wxStoryPromise;

        // Final check before rendering
        if (thisRequest !== currentRequestVersion) return;

        app.currentWxStory = wxStory;

        // Render weather cards
        await app.cardRenderer.renderAllCards(data.weather, data.alerts, wxStory, cityName);

        app.hideLoading();
      } catch (e) {
        // Only show error if this is still the current request
        if (thisRequest !== currentRequestVersion) return;
        console.error('Load weather error:', e);
        app.showError('Failed to load weather data. Please try again.');
      }
    },

    // Fetch Unsplash background images with optional location fallback
    // options: { location, region } for cascading search
    // Returns array of photos (call pickRandomPhoto to select one)
    async fetchBackgrounds(query, options = {}) {
      try {
        const params = new URLSearchParams({ query });
        if (options.location) params.set('location', options.location);
        if (options.region) params.set('region', options.region);

        const response = await fetch(`/api/unsplash?${params.toString()}`);
        if (!response.ok) return [];
        const data = await response.json();
        if (data.error) return [];
        if (data.photos?.length) {
          return data.photos;
        }
        if (data.url) return [data];
        return [];
      } catch (e) {
        console.warn('Unsplash fetch failed:', e);
        return [];
      }
    },

    // Pick a random photo from an array of photos
    pickRandomPhoto(photos) {
      if (!photos || photos.length === 0) return null;
      return photos[Math.floor(Math.random() * photos.length)];
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
