export const APP_VERSION = '5.12.5';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P2-A28';
export const APP_CHECKPOINT_LABEL = 'P2-A28 — Collapsing Mobile Control Center Tabs';
export const APP_RELEASE_NAME = 'Progress Backup + Restore';
export const APP_RELEASE_DATE = '2026-08-30';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} Progress Backup + Restore: mastery and study tracking can be exported and restored separately from dataset CSV state.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • Progress Backup + Restore`;

export const APP_CHANGELOG = Object.freeze([
  'Progress backup exports Mastery and Study Tracking as portable VOCAB_ID-keyed JSON',
  'Restore supports idempotent Merge and explicit Replace without touching dataset CSV, NO/audio slots, or CSV high-water metadata',
  'Unknown or currently unloaded VOCAB_ID progress is preserved instead of being remapped by row position or word text',
  'Restore persistence includes rollback protection if a multi-key progress write fails partway through',
  'Storage Safety keeps granular reset actions for dataset cache, Mastery, Study Tracking, and advanced CSV metadata',
  'v5.12 progress foundation complete: Mastery, filters, statistics, storage safety, automatic tracking, and backup/restore'
]);
