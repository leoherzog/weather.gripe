// Build-time Font Awesome icon imports
// Replaces runtime Kit CDN loading

import { library } from '@fortawesome/fontawesome-svg-core';
import { registerIconLibrary } from '@awesome.me/webawesome-pro/dist/webawesome.js';

// Import all needed icons (23 total)
import {
  faArrowDown,
  faArrowUp,
  faCloud,
  faCloudBolt,
  faCloudMoon,
  faCloudRain,
  faCloudShowersHeavy,
  faCloudSun,
  faCloudSunRain,
  faDownload,
  faEye,
  faHeart,
  faLocationCrosshairs,
  faLocationDot,
  faMagnifyingGlass,
  faMoon,
  faQuestion,
  faShareNodes,
  faSmog,
  faSnowflake,
  faSun,
  faTriangleExclamation
} from '@fortawesome/pro-solid-svg-icons';

// Add all icons to Font Awesome library
library.add(
  faArrowDown,
  faArrowUp,
  faCloud,
  faCloudBolt,
  faCloudMoon,
  faCloudRain,
  faCloudShowersHeavy,
  faCloudSun,
  faCloudSunRain,
  faDownload,
  faEye,
  faHeart,
  faLocationCrosshairs,
  faLocationDot,
  faMagnifyingGlass,
  faMoon,
  faQuestion,
  faShareNodes,
  faSmog,
  faSnowflake,
  faSun,
  faTriangleExclamation
);

// Map kebab-case names to imported icon definitions for canvas rendering
const iconDefinitions = {
  'arrow-down': faArrowDown,
  'arrow-up': faArrowUp,
  'cloud': faCloud,
  'cloud-bolt': faCloudBolt,
  'cloud-moon': faCloudMoon,
  'cloud-rain': faCloudRain,
  'cloud-showers-heavy': faCloudShowersHeavy,
  'cloud-sun': faCloudSun,
  'cloud-sun-rain': faCloudSunRain,
  'download': faDownload,
  'eye': faEye,
  'heart': faHeart,
  'location-crosshairs': faLocationCrosshairs,
  'location-dot': faLocationDot,
  'magnifying-glass': faMagnifyingGlass,
  'moon': faMoon,
  'question': faQuestion,
  'share-nodes': faShareNodes,
  'smog': faSmog,
  'snowflake': faSnowflake,
  'sun': faSun,
  'triangle-exclamation': faTriangleExclamation
};

// Register custom icon library for wa-icon components
// This makes <wa-icon name="cloud-sun"> work without Kit CDN
registerIconLibrary('default', {
  resolver: (name) => {
    const def = iconDefinitions[name];
    if (!def) {
      console.warn(`Icon not found: ${name}`);
      return '';
    }
    // Font Awesome icon definition structure: [width, height, ligatures, unicode, svgPathData]
    const [width, height, , , pathData] = def.icon;
    const paths = Array.isArray(pathData) ? pathData.join(' ') : pathData;
    // Return SVG as data URL
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${paths}"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  },
  mutator: (svg) => svg.setAttribute('fill', 'currentColor')
});

/**
 * Get icon data for canvas rendering
 * @param {string} name - Icon name in kebab-case (e.g., 'cloud-sun')
 * @returns {{ width: number, height: number, paths: string[] } | null}
 */
export function getIconData(name) {
  const def = iconDefinitions[name];
  if (!def) {
    console.warn(`Icon not found for canvas: ${name}`);
    return null;
  }

  // Font Awesome icon structure: [width, height, ligatures, unicode, svgPathData]
  const [width, height, , , pathData] = def.icon;
  const paths = Array.isArray(pathData) ? pathData : [pathData];

  return { width, height, paths };
}

/**
 * Initialize icons (no-op, kept for API compatibility)
 * With build-time imports, icons are available immediately
 */
export async function initIcons() {
  // Icons are loaded at import time, nothing to wait for
  return Promise.resolve();
}
