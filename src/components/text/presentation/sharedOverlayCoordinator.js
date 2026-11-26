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

const READING_HISTORY_KEY = 'prolingoOverlay';
let readingEntry = null;
let readingTraversalPending = false;
let readingHistorySequence = 0;
let readingHistoryListening = false;

const clearReadingHistoryMarker = () => {
  const state = window.history.state;
  if (!state?.[READING_HISTORY_KEY]) return;
  const { [READING_HISTORY_KEY]: marker, ...previousState } = state;
  window.history.replaceState(marker.previousStateWasNull ? null : previousState, '');
};

const pushReadingHistoryEntry = () => {
  if (!readingEntry || readingTraversalPending) return;
  const state = window.history.state;
  const token = ++readingHistorySequence;
  try {
    window.history.pushState({ ...state, [READING_HISTORY_KEY]: { token, previousStateWasNull: state === null } }, '');
    readingEntry.token = token;
  } catch {
    // Restricted history contexts still have the on-screen and keyboard controls.
  }
};

const onReadingHistoryTraversal = () => {
  if (readingTraversalPending) {
    readingTraversalPending = false;
    clearReadingHistoryMarker();
    pushReadingHistoryEntry();
    return;
  }
  const entry = readingEntry;
  if (entry && window.history.state?.[READING_HISTORY_KEY]?.token !== entry.token) {
    readingEntry = null;
    entry.dismiss();
  }
  if (!readingEntry) clearReadingHistoryMarker();
};

const onReadingPageHide = () => {
  const entry = readingEntry;
  readingEntry = null;
  readingTraversalPending = false;
  if (entry) {
    clearReadingHistoryMarker();
    entry.dismiss();
  }
};

export const openReadingHistoryEntry = dismiss => {
  if (!readingHistoryListening) {
    window.addEventListener('popstate', onReadingHistoryTraversal);
    window.addEventListener('pagehide', onReadingPageHide);
    readingHistoryListening = true;
  }
  const entry = { dismiss, token: null };
  readingEntry = entry;
  pushReadingHistoryEntry();
  return () => {
    if (readingEntry !== entry) return;
    readingEntry = null;
    if (entry.token === null || window.history.state?.[READING_HISTORY_KEY]?.token !== entry.token) return;
    // Strip the current marker before returning. Keep the popstate listener alive
    // across unmounts and serialize a reopen behind this asynchronous traversal.
    clearReadingHistoryMarker();
    readingTraversalPending = true;
    window.history.back();
  };
};
