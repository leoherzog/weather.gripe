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
  footer.className = 'flex wa-gap-xs';

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
    shareBtn.className = 'flex-1';
    shareBtn.innerHTML = '<wa-icon slot="start" name="share-nodes" aria-hidden="true"></wa-icon> Share';
    shareBtn.onclick = onShare;

    const downloadBtn = document.createElement('wa-button');
    downloadBtn.setAttribute('variant', 'brand');
    downloadBtn.setAttribute('appearance', 'outlined');
    downloadBtn.setAttribute('size', 'small');
    downloadBtn.setAttribute('aria-label', 'Download this weather card as an image');
    downloadBtn.className = 'flex-1';
    downloadBtn.innerHTML = '<wa-icon slot="start" name="download" aria-hidden="true"></wa-icon> Download';
    downloadBtn.onclick = onDownload;

    footer.appendChild(shareBtn);
    footer.appendChild(downloadBtn);
  } else {
    const downloadBtn = document.createElement('wa-button');
    downloadBtn.setAttribute('variant', 'brand');
    downloadBtn.setAttribute('appearance', 'outlined');
    downloadBtn.setAttribute('size', 'small');
    downloadBtn.setAttribute('aria-label', 'Download this weather card as an image');
    downloadBtn.className = 'flex-1';
    downloadBtn.innerHTML = '<wa-icon slot="start" name="download" aria-hidden="true"></wa-icon> Download';
    downloadBtn.onclick = onDownload;
    footer.appendChild(downloadBtn);
  }

  return footer;
}

// Create card container with share/download buttons
export function createCardContainer(canvas, cardType) {
  const container = document.createElement('wa-card');
  container.className = 'weather-card';
  container.dataset.cardType = cardType;

  // Use media slot for edge-to-edge display
  canvas.setAttribute('slot', 'media');
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';

  container.appendChild(canvas);
  container.appendChild(createCardActions(
    () => shareCard(canvas, cardType),
    () => downloadCard(canvas, cardType)
  ));

  // Attach lightbox click handler
  attachLightboxHandler(container);

  return container;
}
