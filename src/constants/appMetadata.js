export const APP_VERSION = '5.13.7';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_CHECKPOINT_ID = 'P4-R2.4';
export const APP_CHECKPOINT_LABEL = 'P4-R2.4 • C3.4.7.4.3 — Export + Abort + Library Polish';
export const APP_RELEASE_NAME = 'R2.4.3 Export + Abort + Library Polish';
export const APP_RELEASE_DATE = '2026-09-14';

export const APP_READY_LOG = `Ready. ProLingo ${APP_VERSION_LABEL} (${APP_RELEASE_NAME}).`;
export const APP_DATA_MANAGER_RELEASE_NOTE = `${APP_VERSION_LABEL} P4-R2.4 C3.4.7.4.3: hardens Edge STOP/abort, upgrades direct MP3 export to all-Ready waves of 10, adds Card MP3/ZIP export, and makes Batch Library inline.`;
export const APP_MANUAL_EDITOR_RELEASE_LABEL = `${APP_VERSION_LABEL} • P4-R2.4 C3.4.7.4.3`;

export const APP_CHANGELOG = Object.freeze([
  'Edge backend STOP/abort no longer destroys the msedge-tts stream; disconnected requests drain safely so Card/Batch/Text abort does not race the upstream WebSocket stream',
  'Batch direct MP3 export now exports every Ready audio in the current range/type/voice selection and throttles browser downloads in waves of max 10 instead of repeatedly taking only the first 10',
  'Card Audio now supports ALL MP3 and CARD ZIP export for all Ready child audio on the current EN/ID download voices without regenerating Missing audio',
  'Batch Library is now an inline show/hide section inside Batch Workspace with a three-session-height scroll box, avoiding nested popup stacking',
  'Batch Library history now shows book, range, voice, audio types, Ready/Staged/External/Unavailable and exported ZIP context; unavailable sessions disable export actions',
  'Batch ZIP filenames use compact voice names such as Ryan instead of full en-GB-RyanNeural identifiers',
  'The initial app workspace is Table again; Structured Text remains available but is no longer the startup tab',
  'Batch trigger now lives with Generate Engine/System & TTS and opens a root workspace overlay/bottom sheet instead of expanding inside the sidebar',
  'The lower System utility card now leaves Logs as the only standalone action, reducing sidebar height and keeping Batch re-entry independent from sidebar content',
  'Card Edit/Delete actions are locked while audio generation is active so destructive row changes cannot race an in-flight staged write',
  'Card-owned single-part generation now aborts on row unmount/virtualization just like Download All, preventing hidden orphan generation',
  'Batch Library no longer expands as a long list inside System/Batch; one Batch Library button shows the current-book history count and opens a dedicated history popup',
  'Batch now owns active-book/all-book Staging information and Clear Staging management, reducing duplicate storage UI in System controls',
  'Desktop and mobile System Batch buttons show the current-book Batch history count',
  'Per-card Audio can be reopened while manual generation is running; closing the panel no longer discards the visible Download All task state',
  'Per-card manual generation now has STOP for the current request and Download All sequence; Stop aborts the active TTS request and prevents the next Card item from starting',
  'Card Ready/Missing is resolved against the exact current System download voice, not whichever playback voice happens to be preferred',
  'Changing English download voice (for example Libby to Ryan) immediately makes missing Ryan slots downloadable while preserving the existing Libby variant; Indonesian voice behaves the same way',
  'Card MP3 export, staged Release, and replace detection use the same current download-voice identity so Folder/ZIP/Staging behavior stays consistent',
  'Card Download All remains staging-only and never inherits Batch Auto Export ZIP',
  'R2.3 exact VOCAB_ID audio scope and built-in Demo MASTER 1–5 remain included',
  'R2.2 LEARN OFF markers, R2.1 Settings hotfix, R2 Audio Staging/resource hardening, 10+10 Table overscan, and foreground playback snap remain included',
  'Structured Text feature development remains paused pending R2 runtime acceptance'
]);
