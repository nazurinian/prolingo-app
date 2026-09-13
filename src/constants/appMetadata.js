export const APP_VERSION = '5.13.0';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-R2';
export const APP_CHECKPOINT_LABEL = 'P4-R2 • C3.4.7 — Resource Hardening / Audio Staging';
export const APP_RELEASE_NAME = 'Resource Hardening / Audio Staging';
export const APP_RELEASE_DATE = '2026-09-13';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-R2 C3.4.7: IndexedDB audio staging, resumable Batch Library/export, bounded runtime audio memory, Table viewport hardening, and foreground playback resync.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-R2 C3.4.7`;

export const APP_CHANGELOG = Object.freeze([
  'R2 moves newly generated Table audio binaries out of the large runtime localAudioMapTable path and into a dedicated Audio Staging IndexedDB while preserving frozen VOCAB_ID/NO identity contracts',
  'IndexedDB Staging, attached Folder, and attached ZIP are lazy local-audio sources; runtime ObjectURL caching is bounded and binary data is loaded only when needed',
  'Batch Sessions persist lightweight recovery/checkpoint metadata across refreshes; Auto Export ZIP is configurable and ZIP splitting is byte-based rather than fixed at 500 files',
  'Per-card audio actions separate Generate, Download MP3, Regenerate, and staged-copy release; small direct MP3 batch export is capped conservatively for mobile convenience',
  'Verified Folder/ZIP attachment may release exact duplicate staged binaries while preserving export/batch history metadata',
  'Table virtual-list overscan is reduced from 20 rows per side to 10 rows per side; the existing fixed-height virtualizer remains unchanged otherwise',
  'Foreground playback resync suspends visual auto-follow while hidden and snaps immediately to the latest playing row on resume; ordinary visible-page auto-follow remains smooth',
  'R1.1 adaptive TTS retry/fail-forward behavior is absorbed into this line; Structured Text feature development remains paused pending R2 runtime acceptance'
]);
