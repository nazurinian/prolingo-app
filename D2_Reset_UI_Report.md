# Round D2 — Reset UI, Synchronisation & Optional Card Full Convenience Report

**Branch:** `fix/text-data-system-boundaries`  
**D1 Baseline Commit:** `11f63b6fdc4f810a0e99eca9c280838e25828dd6`  
**Status:** AUTOMATED PASS (Manual browser UI/DOM/IndexedDB acceptance remains `MANUAL BROWSER PENDING`)

---

## 1. Summary of Changes

### Domain Helpers
- **`src/domain/text/textStructuredResetDomain.js`:**
  - Added `canExecuteTextStructuredReset({ zipImportActive, textLibraryCommandBusy, isSystemBusy, generationRunning, requireGenerationIdle })` to fail-closed block reset execution during active Portable ZIP imports or active Text Library / system IndexedDB transactions, while allowing active playback and (where supported) generation cancellation synchronization.
- **`src/domain/text/textStructuredBulkGenerationDomain.js`:**
  - Extracted shared `createFullBlockRequirement(...)` helper and exported `buildTextStructuredCardMissingFullRequirements({ documentTree, block, channels, preferences, runtimeFullAudio, stagingRecords })` for `D2-C`.
  - Plans missing/reusable Full EN/ID artifacts strictly for Paragraph cards using canonical Full fingerprinting and `resolveFullLogicalState`, skipping `ready` and `stale` Full artifacts as well as Conversation cards cleanly.

### Reset UI & Safety Confirmation (`SafetyConfirmDialog`, `z-[190]`, no `window.confirm`)
- **`src/components/text/TextStructuredPlaybackControls.jsx`:** Added Reset Defaults action (`[data-text-reset-playback="true"]`) gated by `SafetyConfirmDialog`, honoring `resetDisabled` while staying clickable during active playback (`disabled={controlsBusy}`).
- **`src/components/text/TextStructuredAudioControls.jsx`:**
  - Added Reset actions for Global Browser TTS (`[data-text-reset-global-browser-tts="true"]`), Workspace Audio (`[data-text-reset-workspace="true"]`), All Speakers (`[data-text-reset-all-speakers="true"]`), and individual Speaker overrides (`[data-text-reset-speaker]`) gated by `SafetyConfirmDialog` and `resetDisabled`.
  - Updated `[data-text-global-edge-restore-default="true"]` to reset Global Edge EN/ID defaults (`en-GB-SoniaNeural`, `id-ID-GadisNeural`, `0%` rate, `0Hz` pitch) via `SafetyConfirmDialog`.
- **`src/components/text/TextBatchPopup.jsx`:** Added `[data-text-reset-bulk-preferences="true"]` gated by `SafetyConfirmDialog` and `resetDisabled`, resetting draft text/meaning selections and voice modes alongside `structuredTextBatch.resetPreferences`.
- **`src/components/text/TextStructuredCardAudioPanel.jsx`:** Added Card Reset (`[data-text-reset-card-audio="true"]`) and per-segment Reset (`[data-text-reset-segment-audio]`) gated by `SafetyConfirmDialog` and `resetDisabled`.
- **`src/components/text/TextStructuredPlayer.jsx`:** Threaded `resetDisabled`, `onResetPlaybackPreferences`, `onResetCardAudioPreferences`, and `onResetSegmentAudioPreferences`.

### `D2-C` Optional Paragraph Card Full Convenience (`TextStructuredCardAudioPanel.jsx`)
- Added Paragraph-only checkbox `[data-text-card-include-missing-full="true"]` (*"Also generate missing Full audio"*), defaulting **OFF** and scoped per card (`includeMissingFullByBlockId`) without touching Bulk preferences or showing on Conversation cards.
- When **ON**, `GENERATE MISSING` enables even when Split audio is already `Ready` if missing/reusable Full EN/ID exists, passes `{ missingOnly: true, includeMissingFull: true }`, and blocks cleanly only if an unavailable Edge Full target voice is required.

### Synchronisation & Safety Wiring (`src/App.jsx`)
- Tracked active Portable ZIP imports (`structuredTextZipImportBusy` / `structuredTextZipImportPendingCountRef`) around `handleStructuredTextAddAudioZipFiles`.
- Added `structuredTextResetGuard`, `clearStructuredTextResetRuntimePlaybackState` (`forceStopAll()`, `setStructuredTextPlaybackSourceStatus(null)`, clearing `structuredTextResumeCursorRef` and `playbackContextRef.current.orderedListOverride`), and guarded reset handlers for global playback, global generation, workspace, speaker, card, and segment scopes.
- Extended `handleStructuredTextGenerateCardAudio` and `runStructuredTextAudioGenerationBatch` to append `buildTextStructuredCardMissingFullRequirements` when `options.includeMissingFull` is `true` on `missingOnly` runs.
- Preserved Staging MP3 binaries, Table mode, Legacy Text, and protected document metadata; no `localStorage.clear()`, `indexedDB.deleteDatabase`, or `window.confirm` calls added.

---

## 2. Verification & Commands Run (All executed after final edit)

| Check | Command | Result |
|---|---|---|
| D2 Reset UI, Synchronisation & D2-C Suite | `node scripts/audit-v603-round-d2-reset-ui.mjs` | **7 PASS, 0 FAIL** |
| D1 Reset Domain & Persistence Suite | `node scripts/audit-v603-round-d1-reset-preferences.mjs` | **3 PASS, 0 FAIL** |
| D0 Closure Guards | `node scripts/audit-v603-round-d0-closure-guards.mjs` | **4 PASS, 0 FAIL** |
| D0 Final Polish | `node scripts/audit-v603-round-d0-final-polish.mjs` | **8 PASS, 0 FAIL** |
| DL-B1 Download & Batch Audit | `node scripts/audit-v603-dl-b1-download-batch.mjs` | **PASS (35 checks)** |
| P9-C Bulk Generation & Export | `node scripts/audit-v603-p9c-bulk-marathon.mjs` | **17 PASS, 0 FAIL** |
| P9-B Playback Marathon | `node scripts/audit-v603-p9b-playback-marathon.mjs` | **24 PASS, 0 FAIL** |
| P10 H1–H3 Remediation | `node scripts/audit-v603-p10-h1-h3-remediation.mjs` | **8 PASS, 0 FAIL** |
| P10 H4 Playback Remediation | `node scripts/audit-v603-p10-h4-playback-remediation.mjs` | **8/8 PASS** |
| P10 H5 Export & ZIP Remediation | `node scripts/audit-v603-p10-h5-export-zip-remediation.mjs` | **11 PASS, 0 FAIL** |
| ESLint on D2 Modified Domain, UI & Test Files | `npx eslint src/domain/text/textStructuredResetDomain.js src/domain/text/textStructuredBulkGenerationDomain.js src/components/text/TextStructuredPlaybackControls.jsx src/components/text/TextBatchPopup.jsx src/components/text/TextStructuredCardAudioPanel.jsx scripts/audit-v603-round-d2-reset-ui.mjs` | **0 errors** (5 pre-existing `react-hooks/exhaustive-deps` warnings in `TextStructuredCardAudioPanel.jsx`) |
| Production Vite Build | `npm run build` | **PASS** (`vite build` built in `7.45s`) |
| Live Browser UI / DOM / IndexedDB Acceptance | — | **MANUAL BROWSER PENDING** |
