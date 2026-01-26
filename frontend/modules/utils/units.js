// Unit conversion utilities for weather.gripe
// Temperature and wind are fetched in metric (Celsius, km/h); precipitation in inches

export const Units = {
  // Current unit system: 'metric' or 'imperial' (default set by Worker based on country)
  current: window.__defaultUnits || 'imperial',

  // Temperature: Celsius to Fahrenheit
  tempToImperial(celsius) {
    return (celsius * 9/5) + 32;
  },

  // Wind speed: km/h to mph
  windToImperial(kmh) {
    return kmh * 0.621371;
  },

  // Format temperature with unit
  formatTemp(celsius, decimals = 0) {
    if (celsius == null || !Number.isFinite(celsius)) return '--';
    const value = this.current === 'imperial' ? this.tempToImperial(celsius) : celsius;
    const formatted = value.toFixed(decimals);
    const display = formatted === '-0' ? '0' : formatted; // Avoid "-0"
    return `${display}°${this.current === 'imperial' ? 'F' : 'C'}`;
  },

  // Format temperature value only (no unit)
  formatTempValue(celsius, decimals = 0) {
    if (celsius == null || !Number.isFinite(celsius)) return '--';
    const value = this.current === 'imperial' ? this.tempToImperial(celsius) : celsius;
    const formatted = value.toFixed(decimals);
    return formatted === '-0' ? '0' : formatted; // Avoid "-0"
  },

  // Format wind speed with unit
  formatWind(kmh, decimals = 0) {
    if (kmh == null || !Number.isFinite(kmh)) return '--';
    if (this.current === 'imperial') {
      return `${this.windToImperial(kmh).toFixed(decimals)} mph`;
    }
    return `${kmh.toFixed(decimals)} km/h`;
  },

  // Format humidity (no conversion needed)
  formatHumidity(percent) {
    if (percent == null || !Number.isFinite(percent)) return '--';
    return `${Math.round(percent)}%`;
  },

  // Wind direction from degrees
  windDirection(degrees) {
    if (degrees == null || !Number.isFinite(degrees)) {
      return 'N/A';
    }
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  },

  // Set unit system
  setSystem(system) {
    this.current = system;
    try {
      localStorage.setItem('weatherUnits', system);
    } catch (e) {
      // localStorage may be unavailable in private browsing
    }
  },

  // Load saved preference
  loadPreference() {
    try {
      const saved = localStorage.getItem('weatherUnits');
      if (saved === 'metric' || saved === 'imperial') {
        this.current = saved;
      }
    } catch (e) {
      // localStorage may be unavailable in private browsing
    }
    return this.current;
  }
};

// Load preference on module load
Units.loadPreference();
