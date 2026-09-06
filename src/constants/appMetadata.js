export const APP_VERSION = '5.12.6';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-START';
export const APP_CHECKPOINT_LABEL = 'P4-START • A12.1 — Edge Audio Pipeline Separation & Voice Overrides';
export const APP_RELEASE_NAME = 'Text Mode Foundation';
export const APP_RELEASE_DATE = '2026-09-06';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-START A12.1: structured Text separates Browser TTS, Edge download, and SEGMENT_ID audio resolution; Card/Segment voice overrides share one effective resolver.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-START A12.1`;

export const APP_CHANGELOG = Object.freeze([
  'P4-A12.1 separates Browser TTS playback, Edge audio generation/download, and structured audio runtime resolution',
  'Global Text voices remain defaults while Card speaker/Card default/Segment overrides can choose EN or ID voices independently',
  'Conversation Card Audio can override each speaker locally; Paragraph Card Audio can override each Card and Segment',
  'TTS preview and Edge generation resolve the same effective voice hierarchy before audio identity lookup',
  'Structured audio stays anchored to SEGMENT_ID + channel + source + engine + voice and never to display order',
  'Content fingerprints make edited Segment audio stale instead of silently replaying obsolete speech',
  'Text generation is Edge-only in A12.1; Gemini Text generation is frozen for a later provider patch',
  'IndexedDB Text Library DB/schema remains v1 and all frozen Table files remain unchanged'
]);
