// Location management for the app

// Create location manager with dependency injection
export function createLocationManager(app) {
  return {
    // Auto-detect location on pageload
    async autoDetectLocation() {
      // Check for saved manual location first (before prompting for geolocation)
      const savedLocation = this._getSavedLocation();
      if (savedLocation) {
        try {
          // Saved location means user previously searched, so mark as manual
          app.isManualLocation = true;
          this.updateLocationModeUI();
          // Don't pass name - let API provide fresh name + region format
          await app.loadWeather(savedLocation.lat, savedLocation.lon);
          // Don't override user-selected saved location with browser geolocation
          return;
        } catch (e) {
          console.error('Failed to load saved location:', e);
          // Fall through to auto-detection
        }
      }

      // No manual location - run auto-detection
      await this._runAutoDetection();
    },

    // Shared auto-detection logic (used by autoDetectLocation and resetToAutoLocation)
    async _runAutoDetection() {
      const preciseLocation = this._getPreciseLocation();

      if (preciseLocation) {
        // User previously granted precise geolocation - load cached coords immediately
        await app.loadWeather(preciseLocation.lat, preciseLocation.lon, null, false);

        // Refresh with live browser geolocation in the background
        const browserLocation = await this.requestBrowserGeolocation();
        if (browserLocation) {
          this._savePreciseLocation(browserLocation.latitude, browserLocation.longitude);

          // Only re-fetch weather if coords changed meaningfully
          if (this._coordsChanged(preciseLocation, browserLocation)) {
            await app.loadWeather(browserLocation.latitude, browserLocation.longitude, null, false);
          }
        }
        // If browser geo fails: keep cached location, don't clear mode
      } else {
        // First visit or no precise mode - use CF + browser geo flow
        const browserGeoPromise = this.requestBrowserGeolocation();

        // Use Cloudflare location detection while waiting for browser geolocation
        const cfLocation = await this.loadFromCloudflareLocation();

        // Wait for browser geolocation result
        const browserLocation = await browserGeoPromise;
        if (browserLocation) {
          // Save precise mode for future visits
          this._savePreciseLocation(browserLocation.latitude, browserLocation.longitude);
          // Skip the re-fetch (and the disruptive re-render) if the precise location
          // is essentially the same as the CF estimate — the forecast won't change.
          if (cfLocation && this._isWithinKm(
            cfLocation.lat, cfLocation.lon,
            browserLocation.latitude, browserLocation.longitude,
            5
          )) {
            return;
          }
          // Update with more precise browser location (don't save to lastLocation)
          await app.loadWeather(browserLocation.latitude, browserLocation.longitude, null, false);
        }
      }
    },

    // Fetch and load weather from Cloudflare-detected location.
    // Returns { lat, lon } on success so callers can compare against a later precise fix.
    async loadFromCloudflareLocation() {
      try {
        const response = await fetch('/api/cf-location');
        if (!response.ok) {
          app.hideLoading();
          return null;
        }
        const cfLocation = await response.json();
        // Let API provide name + region via reverse geocode (don't save auto-detected)
        await app.loadWeather(cfLocation.latitude, cfLocation.longitude, null, false);
        return { lat: cfLocation.latitude, lon: cfLocation.longitude };
      } catch (e) {
        console.error('Cloudflare location detection failed:', e);
        app.hideLoading();
        return null;
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

    // Reset to auto-detected location (called when user clicks reset button)
    async resetToAutoLocation() {
      // Clear saved manual location (keep precise mode if set)
      try { localStorage.removeItem('lastLocation'); } catch (e) {}
      app.isManualLocation = false;
      this.updateLocationModeUI();
      app.elements.searchCombobox.value = '';

      // Re-run auto-detection (will use precise mode if available)
      app.showLoading();
      await this._runAutoDetection();
    },

    // Update UI based on location mode (show/hide reset button)
    updateLocationModeUI() {
      app.elements.locationResetBtn.hidden = !app.isManualLocation;
    },

    // --- Private helpers for precise location persistence ---

    _savePreciseLocation(lat, lon) {
      try {
        // Truncate to 3 decimal places to match API coordinate normalization
        const truncated = {
          lat: Math.round(lat * 1000) / 1000,
          lon: Math.round(lon * 1000) / 1000
        };
        localStorage.setItem('locationMode', 'precise');
        localStorage.setItem('lastPreciseLocation', JSON.stringify(truncated));
      } catch (e) {
        console.warn('Failed to save precise location:', e);
      }
    },

    _getPreciseLocation() {
      try {
        const mode = localStorage.getItem('locationMode');
        if (mode !== 'precise') return null;
        const data = localStorage.getItem('lastPreciseLocation');
        if (!data) return null;
        const parsed = JSON.parse(data);
        if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number') return null;
        return parsed;
      } catch (e) {
        return null;
      }
    },

    _getSavedLocation() {
      try {
        const data = localStorage.getItem('lastLocation');
        if (!data) return null;
        const parsed = JSON.parse(data);
        if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number') return null;
        return parsed;
      } catch (e) {
        return null;
      }
    },

    _coordsChanged(cached, fresh) {
      // Compare truncated coordinates - if they round to the same API cache key, skip re-fetch
      const truncate = (v) => Math.round(v * 1000) / 1000;
      return truncate(cached.lat) !== truncate(fresh.latitude) ||
             truncate(cached.lon) !== truncate(fresh.longitude);
    },

    // Approximate equirectangular distance check — accurate enough to decide whether
    // two nearby coordinates would yield the same weather forecast.
    _isWithinKm(lat1, lon1, lat2, lon2, km) {
      const KM_PER_DEG = 111;
      const dLat = (lat1 - lat2) * KM_PER_DEG;
      const dLon = (lon1 - lon2) * KM_PER_DEG * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
      return Math.sqrt(dLat * dLat + dLon * dLon) < km;
    }
  };
}
