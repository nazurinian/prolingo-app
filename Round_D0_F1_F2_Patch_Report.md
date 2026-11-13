# ProLingo v6 — Round D0-F1/F2 Patch Report

**Repository:** `nazurinian/prolingo-app`  
**Branch:** `fix/text-data-system-boundaries`  
**Baseline:** `7ab50b6e87c8070353ee0707194eb324d76e7b19`  

## Executive Summary

Applied four bounded fixes (F1-A, F1-B, F1-C, F2) on top of P10-H6 (`7ab50b6`) without altering Text Library IDB schema, Audio Staging schema/binaries, Split/Full fingerprints, speaker identity/inheritance rules, Table/Legacy business logic, or default voice policy (`Sonia`/`Gadis`, `Google UK English Female` fallback on Chrome).

## Workstreams Implemented

### F1-A — Shared Browser TTS Voice Presentation
- Created [`src/domain/audio/browserTtsVoicePresentationDomain.js`](src/domain/audio/browserTtsVoicePresentationDomain.js) as the shared display-only source of truth for:
  - `formatBrowserTtsVoiceLabel` (`Name · [Natural|Standard] · Region · [Child]` without inventing `Natural` or `Child` for non-matching voices, preserving `Maisie · Natural · UK · Child` and `Ana · Natural · US · Child`, `Gadis · Natural · ID`, `Siti · JV`, `Jajang · SU`).
  - `groupBrowserTtsVoicesByRegion` (`UK`, `US`, `AU`, `NZ`, `SG`, `CA`, `IE`, `Other English`, and channel-appropriate `Indonesia & Regional` / `Indonesian (ID)` + `Javanese (JV)` + `Sundanese (SU)` + `Other Indonesian & Regional`).
  - `dedupeBrowserTtsVoices` and `getBrowserTtsVoiceValue`.
- Delegated [`src/utils/audioUtils.js`](src/utils/audioUtils.js) (`formatVoiceLabel`, `groupVoicesByRegion`) and [`src/domain/text/textStructuredVoiceAssignmentDomain.js`](src/domain/text/textStructuredVoiceAssignmentDomain.js) (`formatTextStructuredBrowserVoiceLabel`) to `browserTtsVoicePresentationDomain.js`.
- Exported `BrowserTtsVoiceOptgroups` and updated `GroupedVoiceSelect` in [`src/components/common/GroupedVoiceSelect.jsx`](src/components/common/GroupedVoiceSelect.jsx) to preserve missing/unavailable saved values when voices are loaded while keeping raw `voice.name` / `voice.id` option values unchanged.
- Updated [`src/components/text/TextStructuredAudioControls.jsx`](src/components/text/TextStructuredAudioControls.jsx) (Text Global Browser TTS, Workspace Narrator, Conversation Speakers) and [`src/components/text/TextStructuredCardAudioPanel.jsx`](src/components/text/TextStructuredCardAudioPanel.jsx) (Card, Card Speaker, Segment overrides) to pass full deduped voice objects (`name` + `lang`) into `<BrowserTtsVoiceOptgroups>` and `.lang`-aware `Effective:` / `Inherit •` labels.

### F1-B — Edge TTS Regional Voice Error (`Elsie` / Retired Azure Voices)
- **Root Cause Verified Live:** Querying live Microsoft Edge `tts.getVoices()` and synthesizing all 57 entries in `initialEdgeVoices` showed **44 voices synthesize valid MP3 audio**, whereas **13 voices** (`en-GB-AlfiesNeural` plus 12 retired `en-AU-*` voices: `Annette`, `Carly`, `Darren`, `Duncan`, `Elsie`, `Freya`, `Joanne`, `Ken`, `Kim`, `Neil`, `Tim`, `Tina`) failed 100% of synthesis attempts with `"Stream closed before the synthesis completed (no turn.end received). The audio is likely truncated."` and are absent from upstream `getVoices()`. Meanwhile `en-AU-WilliamNeural` is absent from `getVoices()` yet synthesized cleanly, so validation is strictly post-failure rather than preemptive.
- Removed those 13 failing entries from `initialEdgeVoices` (44 remaining) and exported `UNSUPPORTED_EDGE_VOICE_IDS` in [`src/constants/voiceConstants.js`](src/constants/voiceConstants.js).
- Added cached upstream voice lookup (`getCachedEdgeVoiceShortNames`) and post-failure classification (`classifyEdgeTtsError`) in [`server/edgeTtsService.js`](server/edgeTtsService.js), wired into both [`api/tts.js`](api/tts.js) and [`server.js`](server.js):
  - Returns **HTTP 422** (`code: 'EDGE_VOICE_UNSUPPORTED'`, `retryable: false`) with explicit explanation when synthesis fails with 0 audio bytes for a known-unsupported or upstream-absent voice (no silent voice substitution).
  - Returns **HTTP 400** for invalid input and keeps **HTTP 500** (`retryable: true`) for transient upstream drops on valid voices.
- Updated [`src/services/audio/textStructuredEdgeAudioDownloadService.js`](src/services/audio/textStructuredEdgeAudioDownloadService.js) to parse structured `{ details, error, code }` JSON responses cleanly and avoid retries on non-retryable 4xx (such as 422), while preserving UI visibility (`Unavailable in Edge · <id>`) in [`src/components/text/TextStructuredAudioControls.jsx`](src/components/text/TextStructuredAudioControls.jsx), [`src/components/text/TextStructuredCardAudioPanel.jsx`](src/components/text/TextStructuredCardAudioPanel.jsx), and [`src/components/text/TextBatchPopup.jsx`](src/components/text/TextBatchPopup.jsx) for saved legacy preferences.

### F1-C — Full Card MP3 Download UI
- Updated [`src/components/text/TextStructuredCardAudioPanel.jsx`](src/components/text/TextStructuredCardAudioPanel.jsx) (`onExportFullCardAudio`, already wired from [`src/App.jsx`](src/App.jsx) -> [`src/components/text/TextStructuredPlayer.jsx`](src/components/text/TextStructuredPlayer.jsx)):
  - Exposed explicit `EN Full MP3` (`data-text-card-full-export="text"`) and `ID Full MP3` (`data-text-card-full-export="meaning"`) buttons inside `data-text-card-full-readiness="true"`, enabled only when the card is not a conversation block, generation is idle, and the matching Full artifact is `FULL READY` for the current effective target voice + content fingerprint.
  - Fixed default language fallback in `cardFullReadinessByChannel` from `'id-ID'`/`'en-GB'` to `'id'`/`'en'` to align with `textStructuredSplitFullDomain.js` and Bulk generation descriptors.

### F2 — Lightweight Batch Progress Updates
- Added `publishTextStructuredBatchTelemetryThrottled` (`minIntervalMs = 80`, bypassing throttle on first item, checkpoints, error increments, and terminal/cancel status) in [`src/services/audio/textStructuredBatchTelemetryService.js`](src/services/audio/textStructuredBatchTelemetryService.js).
- Updated the batch loop in [`src/App.jsx`](src/App.jsx) to publish throttled telemetry per completed loop iteration while preserving `TEXT_BATCH_STATUS_RENDER_INTERVAL = 10` for `setStructuredTextAudioGenerationState` / `flushStructuredTextStagingSummary` and `TEXT_BATCH_RUNTIME_FLUSH_INTERVAL = 256` for `flushStructuredTextPendingRuntimeEntries` (zero extra IDB scans or blob retention).
- Extracted memoized `<TextBatchLiveTelemetry>` inside [`src/components/text/TextBatchPopup.jsx`](src/components/text/TextBatchPopup.jsx) so `useSyncExternalStore` telemetry updates re-render only the leaf progress box rather than the entire modal tree.

## Automated & Live Verification Results

### Passing Suites After Final Production Edit
- `scripts/audit-v603-round-d0-f1-f2-patch.mjs`: **12 PASS, 0 FAIL**
- `scripts/audit-v603-beta8-p2-split-full-domain.mjs`: **17 PASS, 0 FAIL**
- `scripts/audit-v603-beta8-p3-runtime-playback.mjs`: **15 PASS, 0 FAIL**
- `scripts/audit-v603-beta8-p5-bulk-generation.mjs`: **17 PASS, 0 FAIL**
- `scripts/audit-v603-beta8-p6-bulk-export.mjs`: **17 PASS, 0 FAIL**
- `scripts/audit-v603-dl-b1-download-batch.mjs`: **35 PASS, 0 FAIL**
- `scripts/audit-v603-p9b-playback-marathon.mjs`: **24 PASS, 0 FAIL**
- `scripts/audit-v603-p9c-bulk-marathon.mjs`: **17 PASS, 0 FAIL**
- `scripts/audit-v603-p10-h1-h3-remediation.mjs`: **8 PASS, 0 FAIL**
- `scripts/audit-v603-p10-h4-playback-remediation.mjs`: **8 PASS, 0 FAIL**
- `scripts/audit-v603-p10-h5-export-zip-remediation.mjs`: **11 PASS, 0 FAIL**
- `scripts/audit-v603-round-a-d1-d4.mjs`: **7 PASS, 0 FAIL**
- `scripts/audit-v603-round-b-d2-d3.mjs`: **6 PASS, 0 FAIL**
- `scripts/audit-v603-round-c-taxonomy.mjs`: **10 PASS, 0 FAIL**
- `scripts/audit-v603-round-c1-legacy-empty-audio.mjs`: **4 PASS, 0 FAIL**

### Build, Lint, Live Endpoint, and Legacy-Script Notes
- `npm run build`: **Succeeded** (`1889 modules transformed`, `✓ built in 7.91s`).
- `npx eslint` on pure new/updated modules (`browserTtsVoicePresentationDomain.js`, `textStructuredVoiceAssignmentDomain.js`, `GroupedVoiceSelect.jsx`, `TextBatchPopup.jsx`, `voiceConstants.js`, `textStructuredEdgeAudioDownloadService.js`, `textStructuredBatchTelemetryService.js`, `api/tts.js`, `scripts/audit-v603-round-d0-f1-f2-patch.mjs`): **0 errors, 0 warnings** (`App.jsx`, `TextStructuredAudioControls.jsx`, `TextStructuredCardAudioPanel.jsx`, `audioUtils.js`, `server.js`, and `server/edgeTtsService.js` retain pre-existing repository lint findings outside our changed lines).
- Live `api/tts.js` handler check against Microsoft Edge TTS:
  - `en-AU-ElsieNeural` -> HTTP **422** `EDGE_VOICE_UNSUPPORTED` (non-retryable, no silent substitution).
  - `en-GB-LibbyNeural` -> HTTP **200** `audio/mpeg` (`13680` bytes).
- Pre-existing historical audit script mismatches (not caused by this patch):
  - `scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs`: passed 11 checks and failed on `su-ID-TutiNeural` vs baseline `id-ID-GadisNeural` (`HF2` line 152).
  - `scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs`: passed Test Cases 1–9 and failed at line 834 (`'David · US'` vs historical `/Browser TTS/` assertion outdated since baseline `a3694274`).
  - `scripts/audit-v603-beta8-p7-ui-simplification.mjs`: failed on historical `data-text-global-tts-only="true"` string removed in prior HF passes.

## Recommended Manual Smoke Checks
1. Open Browser TTS dropdowns across Text Global, Workspace, Card, Speaker, Segment, Table, and Sidebar to confirm grouped `<optgroup>` sections and compact `Name · Natural · Region · Child` labels.
2. Trigger a small Bulk Audio generation batch (<10 items) and confirm live progress increments immediately (`1/N`, `2/N`, ...) without UI lag.
3. Generate Full Card audio for a Paragraph Card and confirm `EN Full MP3` and `ID Full MP3` buttons enable only for `FULL READY` channels and download directly without regeneration.
4. Exercise a saved or API-submitted `en-AU-ElsieNeural` request against `/api/tts` in dev mode (`node server.js`) to confirm clean HTTP 422 reporting without retry loops or silent substitution.
