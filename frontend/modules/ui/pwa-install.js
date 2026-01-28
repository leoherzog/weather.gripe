// PWA Install Prompt - shows after first successful share
// Uses @khmyznikov/pwa-install web component

import '@khmyznikov/pwa-install';

// State management helpers (localStorage with error handling for private browsing)
function hasSharedBefore() {
  try {
    return localStorage.getItem('hasSharedCard') === 'true';
  } catch {
    return false;
  }
}

function markShared() {
  try {
    localStorage.setItem('hasSharedCard', 'true');
  } catch {}
}

function wasDismissed() {
  try {
    return localStorage.getItem('pwaInstallDismissed') === 'true';
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem('pwaInstallDismissed', 'true');
  } catch {}
}

// Get the pwa-install element
function getInstallElement() {
  return document.querySelector('pwa-install');
}

/**
 * Call this after a successful share to potentially show the install prompt.
 * Only shows on first share, and only if user hasn't dismissed before.
 */
export function notifyShareSuccess() {
  // Only trigger on first share
  if (hasSharedBefore()) return;
  markShared();

  const pwaInstall = getInstallElement();
  if (!pwaInstall) return;

  // Don't show if user dismissed before or already installed
  if (wasDismissed() || pwaInstall.isUnderStandaloneMode) return;

  // Show after share sheet dismisses (small delay for UX)
  setTimeout(() => pwaInstall.showDialog(), 500);
}

/**
 * Initialize PWA install tracking. Call after DOM is ready.
 */
export function initPWAInstall() {
  const pwaInstall = getInstallElement();
  if (!pwaInstall) return;

  // Track when user closes the dialog without installing
  pwaInstall.addEventListener('pwa-install-how-to-event', () => {
    // iOS user saw instructions - count as "shown"
    markDismissed();
  });

  // Also track when dialog is hidden (user clicked outside or closed it)
  pwaInstall.addEventListener('pwa-user-choice-result-event', (e) => {
    // If user didn't accept, mark as dismissed
    if (e.detail?.message !== 'accepted') {
      markDismissed();
    }
  });
}
