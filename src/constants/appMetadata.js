export const APP_VERSION = '5.12.1';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_RELEASE_NAME = 'Mastery State Core';
export const APP_RELEASE_DATE = '2026-08-30';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} Mastery State Core: per-vocabulary mastery progress is stored separately from CSV/dataset state.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • Mastery State Core`;

export const APP_CHANGELOG = Object.freeze([
  'Mastery status added: NEW / LEARNING / FAMILIAR / MASTERED',
  'Mastery progress keyed by VOCAB_ID and persisted separately from CSV data',
  'Desktop and mobile mastery controls added without changing playback or dataset dirty-state',
  'Release metadata centralized for synchronized version labels and export filenames'
]);
