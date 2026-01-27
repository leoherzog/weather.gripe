// Shared MapLibre utilities for radar and alert-map cards

// MapLibre is lazy-loaded and cached
let maplibregl = null;

/**
 * Lazily load MapLibre GL JS and its CSS
 * @returns {Promise<MapLibre>} The MapLibre GL JS module
 */
export async function ensureMapLibre() {
  if (!maplibregl) {
    const mod = await import('maplibre-gl');
    maplibregl = mod.default;
    await import('maplibre-gl/dist/maplibre-gl.css');
  }
  return maplibregl;
}

/**
 * Wait for a DOM element to be connected before executing callback
 * Handles the case where element may not be in DOM yet when map needs to initialize
 * @param {HTMLElement} element - Element to wait for
 * @param {Function} callback - Function to call when element is connected
 * @returns {Function} Cleanup function to cancel the observer
 */
export function waitForDOMConnection(element, callback) {
  let observer = null;
  let cancelled = false;

  requestAnimationFrame(() => {
    if (cancelled) return;

    if (element.isConnected) {
      callback();
    } else {
      observer = new MutationObserver(() => {
        if (element.isConnected) {
          observer.disconnect();
          observer = null;
          callback();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });

  // Return cleanup function
  return () => {
    cancelled = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

/**
 * Export a MapLibre map combined with an overlay canvas to a single canvas
 * Triggers repaint and waits for idle to ensure WebGL buffer is populated
 * @param {MapLibre.Map} map - The MapLibre map instance
 * @param {HTMLCanvasElement} overlay - The overlay canvas
 * @param {number} width - Export width
 * @param {number} height - Export height
 * @param {number} timeout - Timeout in ms (default 5000)
 * @returns {Promise<HTMLCanvasElement>} The combined export canvas
 */
export async function exportMapToCanvas(map, overlay, width, height, timeout = 5000) {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d');

  if (map) {
    // Trigger repaint and wait for idle with timeout
    map.triggerRepaint();
    await Promise.race([
      new Promise(resolve => map.once('idle', resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Map idle timeout')), timeout))
    ]).catch(() => {
      // Timeout - proceed with current state
      console.warn('Map export timed out, using current state');
    });

    const mapCanvas = map.getCanvas();
    ctx.drawImage(mapCanvas, 0, 0, width, height);
  }

  // Draw overlay on top
  ctx.drawImage(overlay, 0, 0);
  return exportCanvas;
}
