// Share/download utilities for weather cards

import { attachLightboxHandler } from '../ui/lightbox.js';
import { notifyEngagement } from '../ui/pwa-install.js';

// Share card using Web Share API
export async function shareCard(canvas, cardType) {
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], `weather-${cardType}.png`, { type: 'image/png' });

    const shareData = {
      title: 'Weather from weather.gripe',
      files: [file]
    };

    // Verify file sharing is supported before attempting
    if (!navigator.canShare?.(shareData)) {
      downloadCard(canvas, cardType);
      return;
    }

    await navigator.share(shareData);
    notifyEngagement();
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('Share failed:', e);
      // Fallback to download
      downloadCard(canvas, cardType);
    }
  }
}

// Download card as image
export function downloadCard(canvas, cardType) {
  const link = document.createElement('a');
  link.download = `weather-${cardType}-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  notifyEngagement(); // Triggers PWA install prompt after first engagement
}

// Create share/download action buttons (shared utility)
export function createCardActions(onShare, onDownload) {
  const footer = document.createElement('div');
  footer.setAttribute('slot', 'footer');
  footer.className = 'wa-split wa-gap-xs';

  // Check if file sharing is supported (not just basic share)
  // Firefox lacks canShare() but supports share() with files, so fall back to checking share exists
  const testFile = new File([''], 'test.png', { type: 'image/png' });
  const hasShareAPI = navigator.canShare?.({ files: [testFile] }) ?? !!navigator.share;

  if (hasShareAPI) {
    const shareBtn = document.createElement('wa-button');
    shareBtn.setAttribute('variant', 'brand');
    shareBtn.setAttribute('appearance', 'outlined');
    shareBtn.setAttribute('size', 'small');
    shareBtn.setAttribute('aria-label', 'Share this weather card');
    shareBtn.style.flex = '1';
    shareBtn.innerHTML = '<wa-icon slot="start" name="share-nodes"></wa-icon> Share';
    shareBtn.onclick = onShare;
    footer.appendChild(shareBtn);
  }

  const downloadBtn = document.createElement('wa-button');
  downloadBtn.setAttribute('variant', 'brand');
  downloadBtn.setAttribute('appearance', 'outlined');
  downloadBtn.setAttribute('size', 'small');
  downloadBtn.setAttribute('aria-label', 'Download this weather card as an image');
  downloadBtn.style.flex = '1';
  downloadBtn.innerHTML = '<wa-icon slot="start" name="download"></wa-icon> Download';
  downloadBtn.onclick = onDownload;
  footer.appendChild(downloadBtn);

  return footer;
}

// Update photo attribution on a card (used by photo nav buttons)
function updatePhotoAttribution(card, photo) {
  const existing = card.querySelector('.photo-attribution');
  if (!existing) return;
  if (!photo) {
    existing.remove();
    return;
  }
  existing.innerHTML = '';
  existing.appendChild(document.createTextNode('Photo by '));

  const photographerLink = document.createElement('a');
  photographerLink.href = `${photo.photographerUrl}?utm_source=weather.gripe&utm_medium=referral`;
  photographerLink.target = '_blank';
  photographerLink.rel = 'noopener noreferrer';
  photographerLink.textContent = photo.photographer;
  photographerLink.setAttribute('aria-label', `${photo.photographer} on Unsplash (opens in new tab)`);
  existing.appendChild(photographerLink);

  existing.appendChild(document.createTextNode(' on '));

  const unsplashLink = document.createElement('a');
  unsplashLink.href = `${photo.unsplashUrl}?utm_source=weather.gripe&utm_medium=referral`;
  unsplashLink.target = '_blank';
  unsplashLink.rel = 'noopener noreferrer';
  unsplashLink.textContent = 'Unsplash';
  unsplashLink.setAttribute('aria-label', 'Unsplash (opens in new tab)');
  existing.appendChild(unsplashLink);
}

// Create card container with share/download buttons
// photoNav: optional { photos, currentIndex, rerender } for background photo cycling
export function createCardContainer(canvas, cardType, photoNav = null) {
  const container = document.createElement('wa-card');
  container.className = 'weather-card';
  container.dataset.cardType = cardType;

  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';

  if (photoNav && photoNav.photos.length > 1) {
    // Wrap canvas in a positioned container for overlay buttons
    const wrapper = document.createElement('div');
    wrapper.className = 'card-media-wrapper';
    wrapper.setAttribute('slot', 'media');
    wrapper.appendChild(canvas);

    let currentIndex = photoNav.currentIndex;
    let isNavigating = false;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'photo-nav-btn photo-nav-prev';
    prevBtn.setAttribute('aria-label', 'Previous photo');
    prevBtn.innerHTML = '<wa-icon name="angle-left"></wa-icon>';
    wrapper.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'photo-nav-btn photo-nav-next';
    nextBtn.setAttribute('aria-label', 'Next photo');
    nextBtn.innerHTML = '<wa-icon name="angle-right"></wa-icon>';
    wrapper.appendChild(nextBtn);

    const navigate = async (newIndex) => {
      if (isNavigating) return;
      isNavigating = true;
      try {
        currentIndex = newIndex;
        const photo = photoNav.photos[currentIndex];
        await photoNav.rerender(photo);
        updatePhotoAttribution(container, photo);
      } finally {
        isNavigating = false;
      }
    };

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate((currentIndex - 1 + photoNav.photos.length) % photoNav.photos.length);
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate((currentIndex + 1) % photoNav.photos.length);
    });

    // Expose theme refresh: re-render canvas with current photo (no re-fetch)
    container._rerenderTheme = () => photoNav.rerender(photoNav.photos[currentIndex]);

    container.appendChild(wrapper);
  } else {
    // No photo navigation - direct media slot
    canvas.setAttribute('slot', 'media');
    container.appendChild(canvas);
  }

  container.appendChild(createCardActions(
    () => shareCard(canvas, cardType),
    () => downloadCard(canvas, cardType)
  ));

  // Attach lightbox click handler
  attachLightboxHandler(container);

  return container;
}
