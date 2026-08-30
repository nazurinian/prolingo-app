export const APP_VERSION = '5.12.2';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_RELEASE_NAME = 'Progress Filters';
export const APP_RELEASE_DATE = '2026-08-30';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} Progress Filters: Master Data can be filtered by mastery status without changing CSV/dataset state.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • Progress Filters`;

export const APP_CHANGELOG = Object.freeze([
  'Master Data mastery filter added: All / New / Learning / Familiar / Mastered',
  'Mastery filter composes with Search and existing source/change filters',
  'Master playback follows the visible filtered Master Data projection',
  'Study Queue remains independent from Master Data mastery filtering',
  'VOCAB_ID, NO/audio slots, Mastery persistence, CSV dirty-state, playback, and TTS invariants preserved'
]);
