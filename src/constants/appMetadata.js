export const APP_VERSION = '5.12.4';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_RELEASE_NAME = 'Storage Safety + Study Tracking';
export const APP_RELEASE_DATE = '2026-08-30';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} Storage Safety + Study Tracking: local storage usage is visible and study encounters are tracked separately from mastery and dataset CSV state.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • Storage Safety + Study Tracking`;

export const APP_CHANGELOG = Object.freeze([
  'Storage Safety panel added with categorized local storage usage and granular reset actions',
  'Dataset cache, mastery progress, CSV high-water metadata, preferences, and study tracking remain isolated by storage boundary',
  'Automatic study tracking records structured VOCAB_ID encounters without automatically changing mastery state',
  'Study tracking persists compact per-vocab studyCount, firstStudiedAt, and lastStudiedAt metadata instead of an unbounded event log',
  'Master Data study activity summary added with studied/un-studied coverage, event count, and last-studied information',
  'VOCAB_ID, permanent NO/audio-slot identity, CSV dirty-state, playback sequence/repeat/delay/shuffle, and audio/TTS invariants preserved'
]);
