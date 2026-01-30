// Lightbox functionality for weather cards
// Uses wa-dialog for the lightbox with grow/shrink animation

// Singleton dialog element (created once, reused)
let lightboxDialog = null;
let currentCard = null;

/**
 * Initialize the lightbox dialog (called once on first use)
 */
function ensureLightboxDialog() {
  if (lightboxDialog) return lightboxDialog;

  lightboxDialog = document.createElement('wa-dialog');
  lightboxDialog.className = 'card-lightbox';
  lightboxDialog.setAttribute('label', 'Enlarged weather card');
  lightboxDialog.setAttribute('without-header', '');
  lightboxDialog.setAttribute('light-dismiss', '');

  // Create content container
  const content = document.createElement('div');
  content.className = 'lightbox-content';
  lightboxDialog.appendChild(content);

  // Close on click on content (the image)
  content.addEventListener('click', () => {
    lightboxDialog.open = false;
  });

  document.body.appendChild(lightboxDialog);
  return lightboxDialog;
}

/**
 * Get the canvas from a card element
 * Handles canvas-based cards, map-based cards, and image-based cards
 * @param {HTMLElement} card - The wa-card element
 * @returns {Promise<HTMLCanvasElement|null>}
 */
async function getCardCanvas(card) {
  const cardType = card.dataset.cardType;

  // Handle map-based cards (radar, alert-map) with async export
  if (cardType === 'radar' || cardType === 'alert-map') {
    if (card._exportToCanvas) {
      return await card._exportToCanvas();
    }
    return null;
  }

  // Handle wxstory cards (img-based)
  if (cardType === 'wxstory') {
    const img = card.querySelector('img[slot="media"]');
    if (img) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas;
    }
    return null;
  }

  // For canvas-based cards, find the canvas in media slot (or inside media wrapper)
  return card.querySelector('canvas[slot="media"]')
      || card.querySelector('.card-media-wrapper canvas')
      || null;
}

/**
 * Open the lightbox with a grow animation from the card's position
 * @param {HTMLElement} card - The clicked wa-card element
 */
export async function openLightbox(card) {
  const dialog = ensureLightboxDialog();
  const content = dialog.querySelector('.lightbox-content');

  // Store reference to current card for close animation
  currentCard = card;

  // Get the card's position for animation origin
  const cardRect = card.getBoundingClientRect();

  // Get the canvas from the card
  const canvas = await getCardCanvas(card);
  if (!canvas) return;

  // Create an image from the canvas for display
  const img = document.createElement('img');
  img.src = canvas.toDataURL('image/png');
  img.className = 'lightbox-image';
  img.alt = `${card.dataset.cardType} weather card - enlarged view`;

  // Clear previous content and add image
  content.innerHTML = '';
  content.appendChild(img);

  // Calculate the scale and position for the grow animation
  // Start from card's size/position, grow to center
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Card center position (use the media area, not the whole card with footer)
  const cardCenterX = cardRect.left + cardRect.width / 2;
  const cardCenterY = cardRect.top + cardRect.height / 2;

  // Viewport center
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;

  // Translation needed to move from card center to viewport center
  const translateX = cardCenterX - viewportCenterX;
  const translateY = cardCenterY - viewportCenterY;

  // Scale: fit within 90vw x 90vh, whichever is more constrained
  const maxWidth = viewportWidth * 0.9;
  const maxHeight = viewportHeight * 0.9;
  const imageAspect = canvas.width / canvas.height;
  const targetAspect = maxWidth / maxHeight;

  // Determine target size based on aspect ratio
  let targetWidth;
  if (imageAspect > targetAspect) {
    // Image is wider than target area - constrain by width
    targetWidth = maxWidth;
  } else {
    // Image is taller than target area - constrain by height
    targetWidth = maxHeight * imageAspect;
  }
  const scale = cardRect.width / targetWidth;

  // Apply initial transform to content (start at card's position/size)
  content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  content.style.opacity = '1';

  // Show dialog (this triggers its own show animation, but we override with ours)
  dialog.open = true;

  // Animate to final position (centered, full size)
  requestAnimationFrame(() => {
    content.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
    content.style.transform = 'translate(0, 0) scale(1)';
  });

  // Handle close - shrink back to card position
  const handleHide = () => {
    dialog.removeEventListener('wa-hide', handleHide);

    if (currentCard) {
      // Get updated card position (might have scrolled)
      const newCardRect = currentCard.getBoundingClientRect();
      const newCardCenterX = newCardRect.left + newCardRect.width / 2;
      const newCardCenterY = newCardRect.top + newCardRect.height / 2;
      const newTranslateX = newCardCenterX - viewportCenterX;
      const newTranslateY = newCardCenterY - viewportCenterY;
      const newScale = newCardRect.width / targetWidth;

      // Animate back to card position
      content.style.transform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${newScale})`;
      content.style.opacity = '0.8';
    }

    currentCard = null;
  };

  // Listen for dialog starting to hide
  dialog.addEventListener('wa-hide', handleHide);

  // Clean up transition after dialog fully closes
  const handleAfterHide = () => {
    content.style.transition = '';
    content.style.transform = '';
    content.style.opacity = '';
    dialog.removeEventListener('wa-after-hide', handleAfterHide);
  };

  dialog.addEventListener('wa-after-hide', handleAfterHide);
}

/**
 * Attach lightbox click handler to a card
 * Excludes footer buttons and attribution links from triggering the lightbox
 * @param {HTMLElement} card - The wa-card element
 */
export function attachLightboxHandler(card) {
  // Add accessibility attributes
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View ${card.dataset.cardType} card in fullscreen`);

  // Handle click events
  card.addEventListener('click', async (e) => {
    // Don't trigger if clicking on footer buttons or their children
    const footer = card.querySelector('[slot="footer"]');
    if (footer && footer.contains(e.target)) {
      return;
    }

    // Don't trigger if clicking on photo attribution links
    const attribution = card.querySelector('.photo-attribution');
    if (attribution && attribution.contains(e.target)) {
      return;
    }

    await openLightbox(card);
  });

  // Handle keyboard events for accessibility
  card.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // Don't trigger if focus is on a button inside the card
      if (e.target.tagName === 'WA-BUTTON' || e.target.closest('wa-button')) {
        return;
      }
      e.preventDefault();
      await openLightbox(card);
    }
  });
}
