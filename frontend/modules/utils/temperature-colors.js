// Temperature-based color system using Chroma.js
// Based on windy.com temperature scale

// Animation constants
const DEFAULT_TRANSITION_DURATION_MS = 300;
const EASE_OUT_EXPONENT = 3; // Cubic ease-out

// Temperature and color constants
const INITIAL_TEMP_F = 70; // Gold color temperature
const GRADIENT_RANGE_F = 5; // ±5°F from current temperature
const FALLBACK_COLOR = 'gold';
const FALLBACK_HEX = '#ffd700';

// Accessibility constants (WCAG)
const WCAG_AAA_CONTRAST_RATIO = 7;
const WCAG_AAA_LARGE_TEXT_RATIO = 4.5;
const DARK_TEXT_COLOR = '#1a1a1a';

// Color adjustment constants
const BRIGHTEN_AMOUNT = 0.5;
const DARKEN_AMOUNT = 0.5;
const ALPHA_AMOUNT = 0.2;

let chroma = null;

// Dynamically load chroma-js
async function ensureChroma() {
  if (!chroma) {
    const mod = await import('chroma-js');
    chroma = mod.default;
  }
  return chroma;
}

export const TemperatureColors = {
  scale: null,
  currentColor: null,
  currentTempF: null, // Track current temperature for gradient interpolation
  transitionTimer: null,
  chroma: null, // Store reference to loaded chroma

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
  async init() {
    this.chroma = await ensureChroma();
    const temps = this.scaleData.map(d => d.temp);
    const colors = this.scaleData.map(d => this.chroma(d.color));

    // Create scale with lab interpolation
    this.scale = this.chroma.scale(colors).domain(temps).mode('lab');

    // Set initial color to gold (70°F on the temperature scale)
    // This ensures both primary color and gradient start at the same gold
    this.currentTempF = INITIAL_TEMP_F;
    this.setColor(FALLBACK_COLOR);
    this.setButtonGradient(INITIAL_TEMP_F);
  },

  // Get color for a temperature (in Fahrenheit)
  getColor(tempF) {
    if (!this.scale) return this.chroma?.(FALLBACK_COLOR) || null;
    return this.scale(tempF);
  },

  // Get hex color for a temperature
  getHex(tempF) {
    const color = this.getColor(tempF);
    return color ? color.hex() : FALLBACK_HEX;
  },

  // Set the primary color (can be a color name, hex, or chroma color)
  // skipTextColor: skip recalculating text color (used during transitions)
  setColor(color, skipTextColor = false) {
    if (!this.chroma) return;
    const c = this.chroma(color);
    this.currentColor = c;
    this.updateCSSVariables(c, skipTextColor);
  },

  // Update CSS custom properties for the primary color
  // Uses CSS lab() color function for perceptual uniformity
  updateCSSVariables(color, skipTextColor = false) {
    const root = document.documentElement;

    // Primary color in lab() format
    root.style.setProperty('--color-primary', color.css('lab'));
    root.style.setProperty('--color-primary-rgb', color.rgb().join(', '));

    // Contrasting text color for AAA accessibility (skip during transitions)
    if (!skipTextColor) {
      const textColor = this.getContrastingText(color);
      root.style.setProperty('--color-primary-text', textColor.color.css('lab'));
      root.style.setProperty('--color-primary-contrast', textColor.contrast.toFixed(2));
    }

    // Lighter variant (for hover states)
    const lighter = color.brighten(BRIGHTEN_AMOUNT);
    root.style.setProperty('--color-primary-light', lighter.css('lab'));

    // Darker variant
    const darker = color.darken(DARKEN_AMOUNT);
    root.style.setProperty('--color-primary-dark', darker.css('lab'));

    // Very light (for backgrounds)
    const veryLight = color.alpha(ALPHA_AMOUNT);
    root.style.setProperty('--color-primary-alpha', veryLight.css('lab'));

    // Map to Web Awesome brand tokens
    root.style.setProperty('--wa-color-brand-fill-normal', color.css('lab'));
    root.style.setProperty('--wa-color-brand-fill-quiet', lighter.css('lab'));
    root.style.setProperty('--wa-color-brand-fill-loud', darker.css('lab'));
  },

  // Generate gradient for buttons based on temperature range
  // Uses lab() colors for perceptually uniform gradients
  // skipTextColor: skip recalculating text color (used during transitions)
  setButtonGradient(tempF, skipTextColor = false) {
    if (!this.chroma) return;
    const root = document.documentElement;
    const tempLow = tempF - GRADIENT_RANGE_F;
    const tempHigh = tempF + GRADIENT_RANGE_F;

    const colorLowChroma = this.getColor(tempLow);
    const colorHighChroma = this.getColor(tempHigh);
    const colorLow = colorLowChroma.css('lab');
    const colorHigh = colorHighChroma.css('lab');

    // Calculate text color that works with both gradient ends (skip during transitions)
    if (!skipTextColor) {
      const colorMid = this.getColor(tempF);
      const textColor = this.getContrastingText(colorMid);
      root.style.setProperty('--gradient-text', textColor.color.css('lab'));
    }

    // Set gradient CSS variables with lab colors
    // Use 'in lab' for CSS gradient interpolation in lab space
    root.style.setProperty('--gradient-temp-low', colorLow);
    root.style.setProperty('--gradient-temp-high', colorHigh);
    root.style.setProperty('--button-gradient', `linear-gradient(in lab 135deg, ${colorLow}, ${colorHigh})`);
  },

  // Animate transition from current color to temperature color
  transitionToTemperature(tempF, duration = DEFAULT_TRANSITION_DURATION_MS) {
    if (!this.scale || !this.chroma) return;

    const startColor = this.currentColor || this.chroma(FALLBACK_COLOR);
    const endColor = this.getColor(tempF);
    // Track starting temperature for gradient interpolation (estimate from color, or use initial temp for gold)
    const startTempF = this.currentTempF ?? INITIAL_TEMP_F;
    const startTime = performance.now();

    // Cancel any existing transition
    if (this.transitionTimer) {
      cancelAnimationFrame(this.transitionTimer);
    }

    // Pre-calculate and set final text colors immediately to avoid flashing during transition
    const root = document.documentElement;
    const primaryTextColor = this.getContrastingText(endColor);
    root.style.setProperty('--color-primary-text', primaryTextColor.color.css('lab'));
    root.style.setProperty('--color-primary-contrast', primaryTextColor.contrast.toFixed(2));
    const gradientMidColor = this.getColor(tempF);
    const gradientTextColor = this.getContrastingText(gradientMidColor);
    root.style.setProperty('--gradient-text', gradientTextColor.color.css('lab'));

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, EASE_OUT_EXPONENT);

      // Interpolate between colors in lab space (skip text color recalculation)
      const interpolated = this.chroma.mix(startColor, endColor, eased, 'lab');
      this.setColor(interpolated, true);

      // Interpolate gradient temperature as well (skip text color recalculation)
      const interpolatedTempF = startTempF + (tempF - startTempF) * eased;
      this.setButtonGradient(interpolatedTempF, true);

      if (progress < 1) {
        this.transitionTimer = requestAnimationFrame(animate);
      } else {
        // Ensure we end exactly on the target color and gradient
        this.setColor(endColor);
        this.setButtonGradient(tempF);
        this.currentTempF = tempF;
      }
    };

    requestAnimationFrame(animate);
  },

  // Get contrasting text color (white or black) for a background
  // Returns the color that meets the target contrast ratio, preferring white
  getContrastingText(bgColor, targetRatio = WCAG_AAA_CONTRAST_RATIO) {
    if (!this.chroma) return { color: { css: () => 'white' }, contrast: 21 };
    const bg = this.chroma(bgColor);
    const white = this.chroma('white');
    const black = this.chroma(DARK_TEXT_COLOR);

    const whiteContrast = this.chroma.contrast(bg, white);
    const blackContrast = this.chroma.contrast(bg, black);

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
    if (!this.chroma) return { passes: true, ratio: 21, required: WCAG_AAA_CONTRAST_RATIO };
    const ratio = this.chroma.contrast(bgColor, textColor);
    const required = isLargeText ? WCAG_AAA_LARGE_TEXT_RATIO : WCAG_AAA_CONTRAST_RATIO;
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
      this.currentTempF = tempF;
    }
  }
};
