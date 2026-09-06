export const APP_VERSION = '5.12.6';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-START';
export const APP_CHECKPOINT_LABEL = 'P4-START • A15 — Full Text Database Backup / Restore';
export const APP_RELEASE_NAME = 'Text Mode Foundation';
export const APP_RELEASE_DATE = '2026-09-06';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-START A15: Full Text IndexedDB safety backup plus validated, explicit REPLACE restore with atomic transaction protection.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-START A15`;

export const APP_CHANGELOG = Object.freeze([
  'P4-A15 adds a full Text IndexedDB safety backup containing Text meta, Collections, Documents, Cards, Segments, audio identity metadata, counters, and active Document state',
  'A15 restore is intentionally REPLACE-oriented and never masquerades as A14 Merge import; the UI requires backup validation plus a second destructive confirmation click',
  'Full Text DB restore clears and rewrites all Text IndexedDB stores inside one atomic readwrite transaction so a failed transaction cannot leave a partial database',
  'Backup preflight validates package type/version, database/schema compatibility, Text relationships, active Document integrity, and audio identity relationships before destructive restore is available',
  'A15 includes a migration gate for current backup/schema v1 and safely raises stale ID counters to the restored permanent-identity floor without remapping identities',
  'Active legacy-line Text is flushed to IndexedDB before export so the safety snapshot does not miss a recent textarea edit',
  'After restore, Text runtime state is rehydrated from the restored active Document and prior Text playback cursor/session state is cleared',
  'External audio binary files and Text preferences remain outside the Text IndexedDB backup; audioVariants metadata/fingerprints are preserved and reconnect through the existing A12.1 runtime contract',
  'A14 Text Pack JSON remains the portable Merge-only content workflow; A15 database restore is the destructive disaster-recovery workflow',
  'A13 playback feel, A12.1 Edge audio/voice/identity contracts, Text DB/schema v1, and frozen Table source remain unchanged'
]);
