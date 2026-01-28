// Temperature-based color system using Chroma.js
// Based on windy.com temperature scale

// Font Awesome poo-storm icon paths (viewBox 0 0 640 640)
const FAVICON_SECONDARY_PATH = 'M112 360C112 340.1 126.6 323.5 145.6 320.5L178.8 315.3C186.5 314.1 193.1 309.3 196.5 302.3C199.9 295.3 199.9 287.2 196.3 280.3L180.6 250.6C177.7 245.1 176 238.8 176 232C176 209.9 193.9 192 216 192L240 192C271.6 192 303.2 183.8 327.5 164.8C345.5 150.8 358.4 131.8 364.3 108.9C366.7 114.6 368 120.8 368 127.4C368 130.3 367.8 133.1 367.3 135.8L362.4 163.9C361.2 170.9 363.1 178 367.7 183.5C372.3 189 379 192 386 192L424 192C446.1 192 464 209.9 464 232C464 238.8 462.3 245.1 459.4 250.6L443.7 280.3C440.1 287.1 440 295.3 443.5 302.3C447 309.3 453.6 314.1 461.2 315.3L494.4 320.5C513.4 323.5 528 340.1 528 360C528 382.1 510.1 400 488 400C464.7 400 441.4 400 418.1 400.1L430.8 357.7C443.6 315 411.6 272 367.1 272C350.7 272 334.9 278 322.7 289C281.3 326 240 363 198.6 400.1L152 400C129.9 400 112 382.1 112 360z';
const FAVICON_PRIMARY_PATH = 'M326 40.8C332.3 35.1 341.2 33.2 349.3 35.8C388 48.2 416 84.5 416 127.4C416 133.1 415.5 138.6 414.6 144L424 144C472.6 144 512 183.4 512 232C512 246.8 508.3 260.8 501.8 273.1C543.8 279.7 576 316.1 576 360C576 408.6 536.6 448 488 448L477.9 448C470.8 421.2 446.9 401.2 418.1 400.1L418.1 400L488 400C510.1 400 528 382.1 528 360C528 340.1 513.4 323.5 494.4 320.5L461.2 315.3C453.5 314.1 446.9 309.3 443.5 302.3C440.1 295.3 440.1 287.2 443.7 280.3L459.4 250.6C462.3 245.1 464 238.8 464 232C464 209.9 446.1 192 424 192L386 192C378.9 192 372.2 188.9 367.6 183.4C363 177.9 361.1 170.8 362.3 163.8L367.2 135.7L367.2 135.7C367.7 133 367.9 130.2 367.9 127.3C367.9 120.8 366.6 114.5 364.2 108.8C358.3 131.6 345.4 150.7 327.4 164.7C303 183.7 271.5 191.9 239.9 191.9L215.9 191.9C193.8 191.9 175.9 209.8 175.9 231.9C175.9 238.7 177.6 245 180.5 250.5L196.2 280.2C199.8 287 199.9 295.2 196.4 302.2C192.9 309.2 186.3 314 178.7 315.2L145.5 320.4C126.5 323.4 111.9 340 111.9 359.9C111.9 382 129.8 399.9 151.9 399.9L198.5 399.9L181.4 415.2C171.6 424 164.8 435.4 161.7 447.9L152 448C103.4 448 64 408.6 64 360C64 316.1 96.1 279.7 138.2 273.1C131.7 260.8 128 246.9 128 232C128 183.4 167.4 144 216 144L240 144C264 144 284.2 137.7 298.1 127C311.5 116.6 320 101.1 320 79.4C320 73.9 319.5 68.6 318.4 63.5C316.7 55.2 319.6 46.6 325.9 40.9zM224.6 480C215.4 480 208 472.6 208 463.4C208 458.7 210 454.2 213.5 451L354.7 324.7C358.1 321.7 362.5 320 367.1 320C379.5 320 388.4 332 384.9 343.9L353.7 448L415.5 448C424.7 448 432.1 455.4 432.1 464.6C432.1 469.3 430.1 473.8 426.6 477L285.3 603.3C281.9 606.3 277.5 608 272.9 608C260.5 608 251.6 596 255.1 584.1L286.3 480L224.5 480z';

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
  currentColorLight: null, // Brightened variant
  currentColorDark: null,  // Darkened variant
  currentTempF: null, // Track current temperature for gradient interpolation
  transitionTimer: null,
  chroma: null, // Store reference to loaded chroma
  darkModeQuery: null, // Media query for dark mode detection

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

    // Set up dark mode listener for favicon updates
    this.darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.darkModeQuery.addEventListener('change', () => {
      this.updateFavicon();
    });

    // Set initial favicon and theme color (light/dark variants set by setColor above)
    this.updateFavicon();
    this.updateThemeColor(this.currentColor);
  },

  // Generate favicon SVG using pre-calculated light/dark variants
  // Uses darker variant in light mode, lighter variant in dark mode for better visibility
  generateFaviconSvg() {
    const isDark = this.darkModeQuery?.matches ?? false;
    const color = isDark ? this.currentColorLight : this.currentColorDark;
    if (!color) return null;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <path fill="${color.hex()}" opacity="0.4" d="${FAVICON_SECONDARY_PATH}"/>
  <path fill="${color.hex()}" d="${FAVICON_PRIMARY_PATH}"/>
</svg>`;
  },

  // Update the favicon using current light/dark color variants
  updateFavicon() {
    const svg = this.generateFaviconSvg();
    if (!svg) return;

    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    // Update SVG favicon
    const svgLink = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (svgLink) {
      svgLink.href = dataUrl;
    }
  },

  // Update the meta theme-color
  updateThemeColor(color) {
    if (!color) return;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content = color.hex();
    }
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
    this.currentColorLight = color.brighten(BRIGHTEN_AMOUNT);
    root.style.setProperty('--color-primary-light', this.currentColorLight.css('lab'));

    // Darker variant
    this.currentColorDark = color.darken(DARKEN_AMOUNT);
    root.style.setProperty('--color-primary-dark', this.currentColorDark.css('lab'));

    // Very light (for backgrounds)
    const veryLight = color.alpha(ALPHA_AMOUNT);
    root.style.setProperty('--color-primary-alpha', veryLight.css('lab'));

    // Map to Web Awesome brand tokens
    root.style.setProperty('--wa-color-brand-fill-normal', color.css('lab'));
    root.style.setProperty('--wa-color-brand-fill-quiet', this.currentColorLight.css('lab'));
    root.style.setProperty('--wa-color-brand-fill-loud', this.currentColorDark.css('lab'));
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

      // Update theme-color during animation (lightweight, affects browser chrome)
      this.updateThemeColor(interpolated);

      if (progress < 1) {
        this.transitionTimer = requestAnimationFrame(animate);
      } else {
        // Ensure we end exactly on the target color and gradient
        this.setColor(endColor);
        this.setButtonGradient(tempF);
        this.updateFavicon();
        this.updateThemeColor(endColor);
        this.currentTempF = tempF;
      }
    };

    // Favicon updates only at animation end (not per-frame) for performance
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
      const color = this.getColor(tempF);
      this.setColor(color);
      this.setButtonGradient(tempF);
      this.updateFavicon();
      this.updateThemeColor(color);
      this.currentTempF = tempF;
    }
  }
};
