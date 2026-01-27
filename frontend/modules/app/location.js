// Location management for the app

// Create location manager with dependency injection
export function createLocationManager(app) {
  return {
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
          app.isManualLocation = true;
          this.updateLocationModeUI();
          // Don't pass name - let API provide fresh name + region format
          await app.loadWeather(location.lat, location.lon);
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
        await app.loadWeather(browserLocation.latitude, browserLocation.longitude, null, false);
      }
    },

    // Fetch and load weather from Cloudflare-detected location
    async loadFromCloudflareLocation() {
      try {
        const response = await fetch('/api/cf-location');
        if (!response.ok) {
          app.hideLoading();
          return;
        }
        const cfLocation = await response.json();
        // Let API provide name + region via reverse geocode (don't save auto-detected)
        await app.loadWeather(cfLocation.latitude, cfLocation.longitude, null, false);
      } catch (e) {
        console.error('Cloudflare location detection failed:', e);
        app.hideLoading();
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

    // Reset to auto-detected location (Cloudflare + browser geolocation)
    async resetToAutoLocation() {
      // Clear saved location
      localStorage.removeItem('lastLocation');
      app.isManualLocation = false;
      this.updateLocationModeUI();
      app.elements.searchCombobox.value = '';

      // Re-run auto-detection
      app.showLoading();

      // Start browser geolocation request immediately
      const browserGeoPromise = this.requestBrowserGeolocation();

      // Load from Cloudflare location first
      await this.loadFromCloudflareLocation();

      // Then update with more precise browser location if available (don't save)
      const browserLocation = await browserGeoPromise;
      if (browserLocation) {
        await app.loadWeather(browserLocation.latitude, browserLocation.longitude, null, false);
      }
    },

    // Update UI based on location mode (show/hide reset button)
    updateLocationModeUI() {
      app.elements.locationResetBtn.hidden = !app.isManualLocation;
    }
  };
}
