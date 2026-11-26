/**
 * Lightweight presentation-only overlay coordination (UAT-4 Packet I / 4G-E).
 *
 * Ensures mutually exclusive floating disclosures on mobile/desktop (Reading View
 * overlay, Expanded Global Player, Mobile AppBar overflow, Mobile Tools, Playback
 * Settings, and Card Audio Settings) without introducing a state store or ever
 * interrupting active playback or ownership.
 */

const OVERLAY_EVENT_NAME = 'prolingo:presentation-overlay-open';

export const OVERLAY_SOURCES = Object.freeze({
  READING_VIEW: 'reading-view',
  GLOBAL_PLAYER: 'global-player',
  APPBAR_OVERFLOW: 'appbar-overflow',
  MOBILE_TOOLS: 'mobile-tools',
  PLAYBACK_SETTINGS: 'playback-settings',
  CARD_AUDIO: 'card-audio'
});

export const announcePresentationOverlayOpen = source => {
  if (typeof window === 'undefined' || !source) return;
  try {
    window.dispatchEvent(new CustomEvent(OVERLAY_EVENT_NAME, { detail: { source } }));
  } catch {
    // Ignore environments without CustomEvent support.
  }
};

export const subscribeOtherPresentationOverlayOpen = (ownSource, onOtherOpen) => {
  if (typeof window === 'undefined' || typeof onOtherOpen !== 'function') return () => {};
  const handler = event => {
    const otherSource = event?.detail?.source;
    if (otherSource && otherSource !== ownSource) {
      onOtherOpen(otherSource);
    }
  };
  window.addEventListener(OVERLAY_EVENT_NAME, handler);
  return () => window.removeEventListener(OVERLAY_EVENT_NAME, handler);
};
