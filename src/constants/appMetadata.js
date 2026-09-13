export const APP_VERSION = '5.13.3';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-R2.3';
export const APP_CHECKPOINT_LABEL = 'P4-R2.3 • C3.4.7.3 — Exact VOCAB Audio Scope + Built-in MASTER Demo';
export const APP_RELEASE_NAME = 'R2.3 Exact VOCAB Audio Scope + Built-in MASTER Demo';
export const APP_RELEASE_DATE = '2026-09-13';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-R2.3 C3.4.7.3: resolves Table audio per exact VOCAB_ID inside multi-book playlists, scopes IndexedDB staging keys so equal NO values cannot overwrite one another, and keeps Demo MASTER 1–5 in the saved CSV/deck list on every startup.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-R2.3 C3.4.7.3`;

export const APP_CHANGELOG = Object.freeze([
  'R2.3 resolves playback, per-card loaded state, regenerate/replace checks, manual release, and Batch Missing coverage against the current row VOCAB_ID/book instead of accepting any audio that shares the same NO mapKey',
  'Audio Staging IndexedDB keys now include Table VOCAB_ID (book fallback only when VOCAB_ID is unavailable), allowing MASTER_0001 and R2A_0001 to coexist even when both use NO=1 and the same voice',
  'Batch coverage adds a scoped lookup key so two mounted books with the same NO cannot overwrite each other in Missing/Ready decisions',
  'ZIP dedupe and inventory counts include vocabulary scope; legacy numeric-only Folder/ZIP filenames fail closed when the same NO exists in more than one mounted book',
  'A built-in read-only “Demo • MASTER 1–5” deck is injected into the saved CSV/deck list on every startup; rename it to save an editable copy',
  'When another CSV contains the same VOCAB_ID (for example MASTER_0001 in the full MASTER 1–533 file), existing Staging/Folder/ZIP audio is reused automatically; same WORD text with a different VOCAB_ID remains isolated',
  'R2.2 Card staging-only Download All and LEARN OFF markers remain included',
  'R2.1 Mobile Settings hotfix remains included',
  'R2 Audio Staging, bounded runtime caches, byte-based ZIP safety export, 10+10 Table overscan, and foreground playback snap remain unchanged',
  'Structured Text feature development remains paused pending R2 runtime acceptance'
]);
