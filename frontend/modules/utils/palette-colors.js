// Palette color resolver for canvas rendering
// Reads Web Awesome CSS variables at runtime and caches resolved values
// Supports dynamic palette switching via wa-palette-* classes

// WCAG AAA contrast ratio requirements
const WCAG_AAA_RATIO = 7;
const DARK_TEXT = '#1a1a1a';
const LIGHT_TEXT = '#ffffff';

/**
 * Parse a color string to RGB values
 * Supports hex (#rgb, #rrggbb) and rgb(r, g, b) formats
 * @param {string} color - Color string
 * @returns {Object|null} {r, g, b} object or null if parsing fails
 */
function parseColor(color) {
  if (!color) return null;

  // Handle hex colors
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
  }

  // Handle rgb() colors
  const rgbMatch = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }

  return null;
}

/**
 * Calculate relative luminance per WCAG 2.1
 * @param {Object} rgb - {r, g, b} object with 0-255 values
 * @returns {number} Relative luminance (0-1)
 */
function getLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1
 * @param {number} l1 - Luminance of first color
 * @param {number} l2 - Luminance of second color
 * @returns {number} Contrast ratio (1-21)
 */
function getContrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get AAA-accessible contrasting text color for a background
 * @param {string} bgColor - Background color (hex or rgb)
 * @returns {string} White or dark text color that meets WCAG AAA
 */
export function getContrastingTextColor(bgColor) {
  const rgb = parseColor(bgColor);
  if (!rgb) return LIGHT_TEXT;

  const bgLuminance = getLuminance(rgb);
  const whiteLuminance = 1; // White has luminance of 1
  const darkLuminance = getLuminance(parseColor(DARK_TEXT));

  const whiteContrast = getContrastRatio(bgLuminance, whiteLuminance);
  const darkContrast = getContrastRatio(bgLuminance, darkLuminance);

  // Prefer white if it meets AAA, otherwise use dark if it meets AAA
  // Fall back to whichever has better contrast
  if (whiteContrast >= WCAG_AAA_RATIO) return LIGHT_TEXT;
  if (darkContrast >= WCAG_AAA_RATIO) return DARK_TEXT;
  return whiteContrast > darkContrast ? LIGHT_TEXT : DARK_TEXT;
}

// Fallback colors when CSS variables aren't available (original hardcoded values)
const FALLBACKS = {
  'red-05': '#450a0a',
  'red-10': '#7f1d1d',
  'red-50': '#ef4444',
  'red-60': '#dc2626',
  'red-80': '#fca5a5',
  'orange-05': '#431407',
  'orange-10': '#7c2d12',
  'orange-50': '#ea580c',
  'orange-60': '#f97316',
  'orange-80': '#fdba74',
  'yellow-05': '#422006',
  'yellow-10': '#713f12',
  'yellow-70': '#ca8a04',
  'yellow-80': '#eab308',
  'yellow-90': '#fde047',
  'blue-10': '#0d1b2a',
  'blue-20': '#1e3a5f',
  'blue-50': '#2563eb',
  'blue-60': '#3b82f6',
  'blue-80': '#93c5fd',
  'gray-10': '#1f2937',
  'gray-30': '#374151',
  'gray-50': '#4b5563',
  'gray-60': '#6b7280',
  'gray-70': '#9ca3af'
};

// Semantic color mappings → Web Awesome variable names (without --wa-color- prefix)
const COLOR_MAP = {
  severity: {
    extreme: { bg: ['red-10', 'red-05'], pill: 'red-50', icon: 'red-80', stroke: 'red-60' },
    severe: { bg: ['orange-10', 'orange-05'], pill: 'orange-60', icon: 'orange-80', stroke: 'orange-50' },
    moderate: { bg: ['yellow-10', 'yellow-05'], pill: 'yellow-80', icon: 'yellow-90', stroke: 'yellow-70' },
    minor: { bg: ['blue-20', 'blue-10'], pill: 'blue-60', icon: 'blue-80', stroke: 'blue-50' },
    unknown: { bg: ['gray-30', 'gray-10'], pill: 'gray-60', icon: 'gray-70', stroke: 'gray-50' }
  },
  urgency: {
    immediate: 'red-60',
    expected: 'orange-50',
    future: 'yellow-70',
    past: 'gray-50',
    unknown: 'gray-60'
  },
  temperature: {
    high: 'orange-60',
    low: 'blue-60'
  },
  radar: {
    marker: 'red-50'
  },
  fallback: {
    gradientStart: 'blue-20',
    gradientEnd: 'blue-10'
  }
};

// Cache: variable name → resolved hex value
const cache = new Map();

// Palette change callbacks
const callbacks = new Set();

// Current palette class
let currentPalette = null;

// MutationObserver instance
let observer = null;

/**
 * Resolve a Web Awesome color variable to its computed hex value
 * Falls back to hardcoded values if CSS variable isn't available
 * @param {string} colorName - Variable name without prefix (e.g., 'red-50')
 * @returns {string} Resolved color value (e.g., '#dc3146')
 */
function resolve(colorName) {
  const key = `--wa-color-${colorName}`;
  if (!cache.has(key)) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    // Use fallback if CSS variable is empty or undefined
    cache.set(key, value || FALLBACKS[colorName] || '#888888');
  }
  return cache.get(key);
}

/**
 * Invalidate the color cache (called on palette change)
 */
function invalidateCache() {
  cache.clear();
}

/**
 * Notify all registered callbacks of palette change
 */
function notifyPaletteChange() {
  for (const callback of callbacks) {
    try {
      callback();
    } catch (e) {
      console.error('Palette change callback error:', e);
    }
  }
}

/**
 * Detect current palette class from <html> element
 * @returns {string|null} Current palette class or null
 */
function detectPalette() {
  const classList = document.documentElement.classList;
  return Array.from(classList).find(c => c.startsWith('wa-palette-')) || null;
}

/**
 * Handle mutations on <html> element
 * @param {MutationRecord[]} mutations
 */
function handleMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.attributeName === 'class') {
      const newPalette = detectPalette();
      if (newPalette !== currentPalette) {
        currentPalette = newPalette;
        invalidateCache();
        notifyPaletteChange();
      }
    }
  }
}

/**
 * Initialize the palette color system
 * Sets up MutationObserver for palette changes
 */
export function init() {
  if (observer) return; // Already initialized

  currentPalette = detectPalette();

  observer = new MutationObserver(handleMutations);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });
}

/**
 * Register a callback for palette changes
 * @param {Function} callback - Function to call when palette changes
 * @returns {Function} Unsubscribe function
 */
export function onPaletteChange(callback) {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

/**
 * Get resolved severity colors for canvas rendering
 * @param {string} severity - Severity level (extreme, severe, moderate, minor, unknown)
 * @returns {Object} Colors object with bg (array), pill, pillText, icon, stroke properties
 */
export function getSeverityColors(severity) {
  const mapping = COLOR_MAP.severity[severity.toLowerCase()] || COLOR_MAP.severity.unknown;
  const pillColor = resolve(mapping.pill);
  return {
    bg: mapping.bg.map(resolve),
    pill: pillColor,
    pillText: getContrastingTextColor(pillColor),
    icon: resolve(mapping.icon),
    stroke: resolve(mapping.stroke)
  };
}

/**
 * Get resolved urgency color for canvas rendering
 * @param {string} urgency - Urgency level (immediate, expected, future, past, unknown)
 * @returns {Object} Object with bg and text properties
 */
export function getUrgencyColor(urgency) {
  const mapping = COLOR_MAP.urgency[urgency.toLowerCase()] || COLOR_MAP.urgency.unknown;
  const color = resolve(mapping);
  return {
    bg: color,
    text: getContrastingTextColor(color)
  };
}

/**
 * Get resolved temperature indicator colors
 * @returns {Object} Colors object with high and low properties
 */
export function getTemperatureColors() {
  return {
    high: resolve(COLOR_MAP.temperature.high),
    low: resolve(COLOR_MAP.temperature.low)
  };
}

/**
 * Get resolved radar marker color
 * @returns {string} Resolved color value
 */
export function getRadarMarkerColor() {
  return resolve(COLOR_MAP.radar.marker);
}

/**
 * Get resolved fallback gradient colors
 * @returns {Object} Colors object with start and end properties
 */
export function getFallbackGradient() {
  return {
    start: resolve(COLOR_MAP.fallback.gradientStart),
    end: resolve(COLOR_MAP.fallback.gradientEnd)
  };
}

/**
 * Force cache refresh (useful for testing)
 */
export function refreshCache() {
  invalidateCache();
}

/**
 * Get current palette name
 * @returns {string|null} Current palette class or null
 */
export function getCurrentPalette() {
  return currentPalette;
}
