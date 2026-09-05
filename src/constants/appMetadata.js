export const APP_VERSION = '5.12.6';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-START';
export const APP_CHECKPOINT_LABEL = 'P4-START • A4 — Text Library Shell';
export const APP_RELEASE_NAME = 'Text Mode Foundation';
export const APP_RELEASE_DATE = '2026-09-05';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-START A4: Text now exposes its IndexedDB Library/Document shell while Table deck UI is hidden from Text surfaces.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-START A4`;

export const APP_CHANGELOG = Object.freeze([
  'P4-A4 adds the first visible Text Library shell for Collections/Books and structured Documents',
  'Desktop Text header now shows the active Text Document instead of Table Saved Deck controls',
  'Text Data surfaces can create Collection/Book, create Paragraph/Conversation/Mixed Document, rename, and switch active DOC_ID',
  'Legacy textarea is rendered only for legacy-line-v1; structured-v1 Documents never flatten into the old line editor',
  'Document switch/create flushes pending legacy projection before changing active DOC_ID and hard-stops the old Text playback context',
  'P4-A1 Schema v1, frozen Table files, and Parts 1–3 behavior remain unchanged'
]);
