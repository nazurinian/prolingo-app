export const APP_VERSION = '5.12.6';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-START';
export const APP_CHECKPOINT_LABEL = 'P4-START • A8 — Text Indonesian Voice Integration';
export const APP_RELEASE_NAME = 'Text Mode Foundation';
export const APP_RELEASE_DATE = '2026-09-06';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-START A8: structured Text now owns separate EN/ID Browser TTS voice and speed preferences.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-START A8`;

export const APP_CHANGELOG = Object.freeze([
  'P4-A8 adds Text-owned Browser TTS English and Indonesian voice selection',
  'Structured Text no longer reads Table selectedVoice/selectedIndonesianVoice state',
  'Text Browser TTS speed is now independent from Table speed and persists with Text preferences',
  'ID, EN→ID, and ID→EN playback use the selected Text Meaning/ID Browser voice',
  'Missing or unavailable device voices fall back safely without changing Text content identity',
  'P4 Table Freeze Guard manifest format is repaired while retaining the original P4-START frozen hashes',
  'IndexedDB Schema v1 and all 20 frozen Table files remain unchanged'
]);
