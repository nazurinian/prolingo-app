export const APP_VERSION = '5.12.6';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-START';
export const APP_CHECKPOINT_LABEL = 'P4-START • A17 — Part 4 Final Audit / Freeze';
export const APP_RELEASE_NAME = 'Text Mode Foundation';
export const APP_RELEASE_DATE = '2026-09-06';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-START A17: Part 4 Text foundation final freeze after A0–A16 regression, identity, import/backup, audio, search, and Table isolation audit.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-START A17 FINAL`;

export const APP_CHANGELOG = Object.freeze([
  'P4-A17 finalizes the Part 4 Text foundation after user runtime acceptance of A16; no new IndexedDB schema/store/index or Table-domain behavior is introduced',
  'Structured Text identity remains Collection/Document/TEXT_ID/SEGMENT_ID with TXTAUDIO_ID audio metadata; display order is never identity',
  'A12.1 effective voice assignment and content-fingerprint stale-audio guard remain frozen; local/generated audio continues to resolve by exact Segment/channel/source/engine/voice',
  'A13 Text-owned playback feel remains isolated from Table order/repeat/delay state',
  'A14 Text Pack JSON remains MERGE ONLY; A15 full Text database restore remains explicit REPLACE RESTORE with atomic validation/commit',
  'A16 library-wide Text search, Open/Play/Start Here, Segment auto-follow, and responsive Card polish are accepted/frozen',
  'A17 refreshes authoritative source hashes/manifests and consolidates Part 4 decision/changelog/freeze documentation for future development',
  'Text IndexedDB DB/schema remain v1 and all 20 frozen Table files remain byte-identical to the Part 4 freeze baseline'
]);
