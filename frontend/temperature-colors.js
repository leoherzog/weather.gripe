// Temperature-based color system using Chroma.js
// Based on windy.com temperature scale

import chroma from 'chroma-js';

const TemperatureColors = {
  scale: null,
  currentColor: null,
  transitionTimer: null,

  // Windy.com color scale data (Kelvin to RGBA)
  // Converted to Fahrenheit for easier use
  scaleData: [
    { temp: -94, color: [115, 70, 105] },   // 203K
    { temp: -67, color: [202, 172, 195] },  // 218K
    { temp: -40, color: [162, 70, 145] },   // 233K
    { temp: -13, color: [143, 89, 169] },   // 248K
    { temp: 5, color: [157, 219, 217] },    // 258K
    { temp: 17, color: [106, 191, 181] },   // 265K
    { temp: 25, color: [100, 166, 189] },   // 269K
    { temp: 32, color: [93, 133, 198] },    // 273.15K (freezing)
    { temp: 34, color: [68, 125, 99] },     // 274K
    { temp: 50, color: [128, 147, 24] },    // 283K
    { temp: 70, color: [243, 183, 4] },     // 294K
    { temp: 86, color: [232, 83, 25] },     // 303K
    { temp: 117, color: [71, 14, 0] }       // 320K
  ],

  // Initialize the color scale
  init() {
    const temps = this.scaleData.map(d => d.temp);
    const colors = this.scaleData.map(d => chroma(d.color));

    // Create scale with lab interpolation
    this.scale = chroma.scale(colors).domain(temps).mode('lab');

    // Set initial color to gold
    this.setColor('gold');
  },

  // Get color for a temperature (in Fahrenheit)
  getColor(tempF) {
    if (!this.scale) this.init();
    return this.scale(tempF);
  },

  // Get hex color for a temperature
  getHex(tempF) {
    return this.getColor(tempF).hex();
  },

  // Set the primary color (can be a color name, hex, or chroma color)
  setColor(color) {
    const c = chroma(color);
    this.currentColor = c;
    this.updateCSSVariables(c);
  },

  // Update CSS custom properties for the primary color
  // Uses CSS lab() color function for perceptual uniformity
  updateCSSVariables(color) {
    const root = document.documentElement;

    // Primary color in lab() format
    root.style.setProperty('--color-primary', color.css('lab'));
    root.style.setProperty('--color-primary-rgb', color.rgb().join(', '));

    // Contrasting text color for AAA accessibility
    const textColor = this.getContrastingText(color);
    root.style.setProperty('--color-primary-text', textColor.color.css('lab'));
    root.style.setProperty('--color-primary-contrast', textColor.contrast.toFixed(2));

    // Lighter variant (for hover states)
    const lighter = color.brighten(0.5);
    root.style.setProperty('--color-primary-light', lighter.css('lab'));

    // Darker variant
    const darker = color.darken(0.5);
    root.style.setProperty('--color-primary-dark', darker.css('lab'));

    // Very light (for backgrounds)
    const veryLight = color.alpha(0.2);
    root.style.setProperty('--color-primary-alpha', veryLight.css('lab'));

    // Map to Web Awesome brand tokens
    root.style.setProperty('--wa-color-brand-fill-normal', color.css('lab'));
    root.style.setProperty('--wa-color-brand-fill-quiet', lighter.css('lab'));
    root.style.setProperty('--wa-color-brand-fill-loud', darker.css('lab'));
  },

  // Generate gradient for buttons based on temperature range
  // Uses lab() colors for perceptually uniform gradients
  setButtonGradient(tempF) {
    const root = document.documentElement;
    const tempLow = tempF - 5;
    const tempHigh = tempF + 5;

    const colorLowChroma = this.getColor(tempLow);
    const colorHighChroma = this.getColor(tempHigh);
    const colorLow = colorLowChroma.css('lab');
    const colorHigh = colorHighChroma.css('lab');

    // Calculate text color that works with both gradient ends (use middle color)
    const colorMid = this.getColor(tempF);
    const textColor = this.getContrastingText(colorMid);
    root.style.setProperty('--gradient-text', textColor.color.css('lab'));

    // Set gradient CSS variables with lab colors
    // Use 'in lab' for CSS gradient interpolation in lab space
    root.style.setProperty('--gradient-temp-low', colorLow);
    root.style.setProperty('--gradient-temp-high', colorHigh);
    root.style.setProperty('--button-gradient', `linear-gradient(in lab 135deg, ${colorLow}, ${colorHigh})`);
  },

  // Animate transition from current color to temperature color
  transitionToTemperature(tempF, duration = 1500) {
    if (!this.scale) this.init();

    const startColor = this.currentColor || chroma('gold');
    const endColor = this.getColor(tempF);
    const startTime = performance.now();

    // Cancel any existing transition
    if (this.transitionTimer) {
      cancelAnimationFrame(this.transitionTimer);
    }

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      // Interpolate between colors in lab space
      const interpolated = chroma.mix(startColor, endColor, eased, 'lab');
      this.setColor(interpolated);

      if (progress < 1) {
        this.transitionTimer = requestAnimationFrame(animate);
      } else {
        // Ensure we end exactly on the target color
        this.setColor(endColor);
        this.setButtonGradient(tempF);
      }
    };

    requestAnimationFrame(animate);
  },

  // Get contrasting text color (white or black) for a background
  // Returns the color that meets the target contrast ratio, preferring white
  getContrastingText(bgColor, targetRatio = 7) {
    const bg = chroma(bgColor);
    const white = chroma('white');
    const black = chroma('#1a1a1a');

    const whiteContrast = chroma.contrast(bg, white);
    const blackContrast = chroma.contrast(bg, black);

    // Return whichever meets AAA, preferring white for aesthetics
    if (whiteContrast >= targetRatio) {
      return { color: white, contrast: whiteContrast };
    } else if (blackContrast >= targetRatio) {
      return { color: black, contrast: blackContrast };
    } else {
      // Neither meets target, return the better one
      return whiteContrast >= blackContrast
        ? { color: white, contrast: whiteContrast }
        : { color: black, contrast: blackContrast };
    }
  },

  // Check if a color combination meets WCAG AAA
  meetsAAA(bgColor, textColor, isLargeText = false) {
    const ratio = chroma.contrast(bgColor, textColor);
    const required = isLargeText ? 4.5 : 7;
    return { passes: ratio >= required, ratio, required };
  },

  // Convert Celsius to Fahrenheit
  celsiusToFahrenheit(c) {
    return (c * 9/5) + 32;
  },

  // Set colors from a Celsius temperature (what the API returns)
  setFromCelsius(tempC, animate = true) {
    const tempF = this.celsiusToFahrenheit(tempC);
    if (animate) {
      this.transitionToTemperature(tempF);
    } else {
      this.setColor(this.getColor(tempF));
      this.setButtonGradient(tempF);
    }
  }
};

// Initialize on load with gold color
TemperatureColors.init();

// Export to window for use by other scripts
window.TemperatureColors = TemperatureColors;
