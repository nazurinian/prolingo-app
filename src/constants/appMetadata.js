export const APP_VERSION = '5.12.3';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_RELEASE_NAME = 'Progress Statistics';
export const APP_RELEASE_DATE = '2026-08-30';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} Progress Statistics: Mastery progress statistics are derived from the active structured dataset and persisted mastery state.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • Progress Statistics`;

export const APP_CHANGELOG = Object.freeze([
  'Derived Master Data progress statistics added: Total / New / Learning / Familiar / Mastered',
  'Started % and Mastery % are recalculated from the active structured dataset plus persisted mastery state',
  'Statistics remain global while Search, source/change filters, and Mastery filters control only the visible projection',
  'Rows without VOCAB_ID are excluded from mastery ratios and reported explicitly',
  'No duplicate statistics persistence added; refresh rebuilds statistics from mastery state',
  'VOCAB_ID, NO/audio slots, CSV dirty-state, playback, Study Queue, audio/TTS, and source ownership invariants preserved'
]);
