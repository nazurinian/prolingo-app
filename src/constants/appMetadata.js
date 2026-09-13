export const APP_VERSION = '5.13.2';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-R2.2';
export const APP_CHECKPOINT_LABEL = 'P4-R2.2 • C3.4.7.2 — Deck Audio Scope + Card Staging UX';
export const APP_RELEASE_NAME = 'R2.2 Deck Audio Scope + Card Staging UX';
export const APP_RELEASE_DATE = '2026-09-13';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-R2.2 C3.4.7.2: scopes Table audio by active VOCAB_ID/book across deck switches, keeps per-card Download All staging-only, and marks EXP audio whose Learn playback part is disabled.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-R2.2 C3.4.7.2`;

export const APP_CHANGELOG = Object.freeze([
  'R2.2 prevents NO-based Table audio from leaking across deck/book switches by scoping Staging, Folder, ZIP, generated runtime metadata, Batch Sessions, and export history to active VOCAB_ID / Book ID',
  'Old unscoped NO-only runtime/history data now fails closed after a scoped deck switch instead of making a different book look Ready or Downloaded*',
  'Per-card DOWNLOAD ALL is explicitly IndexedDB Staging-only and never follows the Batch Auto Export ZIP toggle; individual missing-cell generation is staging-only as well',
  'EXP audio remains available for manual staging/export even when that EXP channel is disabled in Learn, but the card Audio list now marks the channel as LEARN OFF to avoid confusion',
  'R2.1 Mobile Tools/System settings prop plumbing hotfix remains included',
  'R2 moves newly generated Table audio binaries out of the large runtime localAudioMapTable path and into a dedicated Audio Staging IndexedDB while preserving frozen VOCAB_ID/NO identity contracts',
  'IndexedDB Staging, attached Folder, and attached ZIP are lazy local-audio sources; runtime ObjectURL caching is bounded and binary data is loaded only when needed',
  'Batch Sessions persist lightweight recovery/checkpoint metadata across refreshes; Auto Export ZIP is configurable and ZIP splitting is byte-based rather than fixed at 500 files',
  'Table virtual-list overscan remains 10 rows per side; foreground playback resync snaps directly to the latest active row after background/lock resume',
  'R1.1 adaptive TTS retry/fail-forward behavior remains absorbed; Structured Text feature development remains paused pending R2 runtime acceptance'
]);
