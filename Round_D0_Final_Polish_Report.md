# ProLingo v6 — D0 Final Polish Report

**Branch:** `fix/text-data-system-boundaries`  
**Baseline:** `b475f38` (`b475f386`)  
**Scope:** UI voice presentation consistency, Edge voice availability/recovery, legacy `en-GB-AlfiesNeural` compatibility, Bulk Stop button live counter sync, and Chrome Indonesian Browser TTS default selection.

---

## 1. Summary of Changes

### 1.1 Shared Voice Sorting & Full Country Labels
- Added `src/domain/audio/voicePresentationDomain.js` to define the shared region display order:
  **UK → US → AU → NZ → SG → CA → IE → Other English → Indonesian/Regional** (`ID → JV → SU → ID_OTHER`).
- Added `ENGLISH_COUNTRY_NAME_BY_CODE` mapping regional English locale subtags (`HK` → `Hong Kong`, `IN` → `India`, `KE` → `Kenya`, `NG` → `Nigeria`, `PH` → `Philippines`, `ZA` → `South Africa`, `TZ` → `Tanzania`, etc.) for display-only labels.
- Named English regions sort alphabetically by formatted voice label; **Other English** sorts first by full country name and then alphabetically by voice name.
- Preserved Browser TTS vs Edge TTS inventory separation and existing Natural/Standard/Child/region compact badges across `src/domain/audio/browserTtsVoicePresentationDomain.js`, `src/domain/audio/voicePresentationDomain.js`, and `src/utils/audioUtils.js`.

### 1.2 Edge TTS `<optgroup>` Grouping & Bulk Divider Presentation
- Extended `src/components/common/GroupedVoiceSelect.jsx` with `<EdgeVoiceOptgroups>` (`context`: `'main'`, `'all'`, `'meaning'`).
- Updated Edge voice dropdowns across:
  - `src/components/text/TextStructuredAudioControls.jsx` (Sidebar EN/ID Edge download selectors & Narration Profile selectors)
  - `src/components/text/TextStructuredCardAudioPanel.jsx` (Card & Segment Edge selectors)
  - `src/components/table/BatchPopup.jsx` (both Structured Text global Edge download selects when mounted in Batch modal and Table Edge download selectors; `src/components/layout/MainAppAuxiliaryViews.jsx` now forwards `edgeVoices` into `BatchPopup`)
  - `src/components/controls/DesktopSystemControls.jsx`, `src/components/controls/MobileSystemControls.jsx`, `src/components/layout/Sidebar.jsx`
- Updated `src/components/text/TextBatchPopup.jsx` Bulk multi-voice checkbox lists inside existing `max-h-40` / `max-h-32` scroll containers with compact region dividers while keeping Single/Multiple toggles and the `/-ID$/i.test` rule intact.

### 1.3 Unavailable Edge Voices: Visible/Disabled, Saved State Preserved, Explicit Remove, Reversible Live Compatibility
- `src/constants/voiceConstants.js` retains all 57 `initialEdgeVoices` entries (44 active + 13 marked `available: false, unavailable: true`: `en-GB-AlfieNeural` and 12 retired `en-AU-*` voices).
- Unavailable Edge voices remain visible and disabled (`· Unavailable`) in Edge dropdowns while preserving any previously saved preference in state/preferences without silently substituting another voice.
- `src/components/text/TextBatchPopup.jsx` displays saved checked unavailable voices in Bulk lists with a sibling `Remove` button (`[data-text-bulk-remove-unavailable]`) so users can opt out cleanly, and shows warning banners when unavailable Edge voices are targeted.
- Generation & download paths block unavailable Edge voices fail-closed across:
  - Table Batch download & Table sidebar (`BatchPopup.jsx`, `DesktopSystemControls.jsx`, `MobileSystemControls.jsx`, `Sidebar.jsx`, `App.jsx` `generateAIAudio` & `runBatchDownload`)
  - Structured Text Card / Segment / Bulk / Manual generation (`App.jsx` `generateStructuredTextAudioJob`, `generateStructuredTextFullAudioJob`, `runStructuredTextAudioGenerationBatch`; `textStructuredAudioGenerationDomain.js`; `textStructuredBulkGenerationDomain.js`; `TextStructuredCardAudioPanel.jsx`)
- **Card UI boundary:** `TextStructuredCardAudioPanel.jsx` disables `GENERATE MISSING` (`data-text-card-generate-missing="true"`) and `REGENERATE CARD SPLIT` when an unavailable Edge voice is targeted for active generation, while keeping Ready `EN Full MP3` / `ID Full MP3` exports enabled.
- **Reversible Compatibility & HTTP Error Separation:**
  - `server/edgeTtsService.js` classifies explicit unsupported voices (`KNOWN_UNSUPPORTED_VOICE_LOWER_SET` + unsupported voice regex) as HTTP `422` (`EDGE_VOICE_UNSUPPORTED`, `retryable: false`), while keeping transient failures and stream-close absent from `getVoices()` as retryable `500`.
  - `src/services/audio/audioTtsSideEffectService.js` propagates structured `{ status, httpStatus, code, retryable, voiceId }` results from `executeEdgeBackendHealthService` and `executeAudioGenerationService`.
  - `src/constants/voiceConstants.js` (`applyEdgeVoiceCompatibilityResult` and `getEdgeVoiceDiagnostic`) recovers voices on HTTP `200` (clearing stale diagnostics) and marks voices unavailable on `422` / `EDGE_VOICE_UNSUPPORTED`, without mutating voice availability on transient `500` errors.
  - `src/App.jsx` wires `applyEdgeVoiceCompatibilityResult` on health checks, single synthesis, and bulk synthesis, and replaces prior `initialEdgeVoices` references with live `edgeVoices` state (preserving `handleStructuredTextBulkExport` before `handleStructuredTextEdgeHealthCheck`).

### 1.4 Alfie & Legacy `en-GB-AlfiesNeural` Typo Handling
- `src/constants/voiceConstants.js` and `server/edgeTtsService.js` include both `en-GB-AlfieNeural` and `en-GB-AlfiesNeural` in `UNSUPPORTED_EDGE_VOICE_IDS` / `KNOWN_UNSUPPORTED_VOICE_LOWER_SET`.
- `initialEdgeVoices` keeps only `en-GB-AlfieNeural` (no duplicate Alfie entry), while `DEPRECATED_EDGE_VOICE_IDS = ['en-GB-AlfiesNeural']` ensures saved legacy typo values display as `en-GB-AlfiesNeural (UK) · Unavailable` and are blocked consistently.

### 1.5 Batch Stop Button Telemetry Synchronization
- Added memoized `TextBatchStopButtonContent` in `src/components/text/TextBatchPopup.jsx` subscribed directly to `subscribeTextBatchTelemetry` via `React.useSyncExternalStore` alongside `TextBatchLiveTelemetry`.
- Displays synchronized live counters (`STOP n/N`, `Stopping… n/N`, `Completing n/N`) without forcing full `TextBatchPopup` parent re-renders.

### 1.6 Chrome Indonesian Browser TTS Default Selection
- Updated `src/domain/audio/browserTtsVoiceDecisionDomain.js` (`resolveDefaultIndonesianBrowserVoice`) and `src/domain/text/textStructuredVoiceDomain.js` (`resolveDefaultTextStructuredBrowserMeaningVoice`) to prefer `Google Bahasa Indonesia` over `Microsoft Andika` when `Gadis` is unavailable, while keeping Edge TTS defaulting to `id-ID-GadisNeural`.
- Updated `src/services/audio/audioRuntimeLifecycleService.js` (`executeBrowserTtsVoiceLifecycleEffect`) and `src/App.jsx` (`selectedVoiceExplicitRef`, `selectedIndonesianVoiceExplicitRef`) so asynchronous `onvoiceschanged` upgrades non-explicit defaults safely without overriding explicit user selections.

---

## 2. Files Changed

**Modified (23 files):**
- `scripts/audit-v603-round-d0-f1-f2-patch.mjs`
- `server/edgeTtsService.js`
- `src/App.jsx`
- `src/components/common/GroupedVoiceSelect.jsx`
- `src/components/controls/DesktopSystemControls.jsx`
- `src/components/controls/MobileSystemControls.jsx`
- `src/components/layout/MainAppAuxiliaryViews.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/table/BatchPopup.jsx`
- `src/components/text/TextBatchPopup.jsx`
- `src/components/text/TextStructuredAudioControls.jsx`
- `src/components/text/TextStructuredCardAudioPanel.jsx`
- `src/constants/voiceConstants.js`
- `src/domain/audio/browserTtsVoiceDecisionDomain.js`
- `src/domain/audio/browserTtsVoicePresentationDomain.js`
- `src/domain/text/textStructuredAudioDownloadProfileDomain.js`
- `src/domain/text/textStructuredAudioGenerationDomain.js`
- `src/domain/text/textStructuredBulkGenerationDomain.js`
- `src/domain/text/textStructuredVoiceAssignmentDomain.js`
- `src/domain/text/textStructuredVoiceDomain.js`
- `src/services/audio/audioRuntimeLifecycleService.js`
- `src/services/audio/audioTtsSideEffectService.js`
- `src/utils/audioUtils.js`

**Added (2 files + this report):**
- `src/domain/audio/voicePresentationDomain.js`
- `scripts/audit-v603-round-d0-final-polish.mjs`
- `Round_D0_Final_Polish_Report.md`

---

## 3. Verification Results

All post-edit checks below were run after the final source & line-ending edits.

### 3.1 Production Build
- `npm run build` (`vite build`): **PASS** (`1890 modules transformed`, `✓ built in 7.01s`, exit code `0`).

### 3.2 ESLint
- Clean 15-file set (`src/domain/audio/voicePresentationDomain.js`, `src/domain/audio/browserTtsVoicePresentationDomain.js`, `src/domain/audio/browserTtsVoiceDecisionDomain.js`, `src/constants/voiceConstants.js`, `src/domain/text/textStructuredVoiceDomain.js`, `src/domain/text/textStructuredVoiceAssignmentDomain.js`, `src/domain/text/textStructuredAudioDownloadProfileDomain.js`, `src/domain/text/textStructuredAudioGenerationDomain.js`, `src/domain/text/textStructuredBulkGenerationDomain.js`, `src/services/audio/audioRuntimeLifecycleService.js`, `src/services/audio/audioTtsSideEffectService.js`, `src/components/common/GroupedVoiceSelect.jsx`, `src/components/text/TextBatchPopup.jsx`, `scripts/audit-v603-round-d0-f1-f2-patch.mjs`, `scripts/audit-v603-round-d0-final-polish.mjs`): **0 errors, 0 warnings** (`EXIT=0`).
- Other touched files retain pre-existing lint issues outside D0 Final Polish scope:
  - `server/edgeTtsService.js`: Node `Buffer` (`no-undef`) and `_fetchUpstreamVoices` (`no-unused-vars`).
  - `src/utils/audioUtils.js`: line 53 `no-control-regex`.
  - `src/App.jsx`, `src/components/controls/DesktopSystemControls.jsx`, `src/components/controls/MobileSystemControls.jsx`, `src/components/layout/Sidebar.jsx`, `src/components/layout/MainAppAuxiliaryViews.jsx`, `src/components/table/BatchPopup.jsx`, `src/components/text/TextStructuredAudioControls.jsx`, `src/components/text/TextStructuredCardAudioPanel.jsx`: pre-existing `react-hooks/refs`, `react-hooks/exhaustive-deps`, `react-refresh/only-export-components`, `no-unused-vars`, and `no-empty` diagnostics.

### 3.3 Regression & Feature Audit Scripts (27/27 Executed Active Scripts Passed)
| Script | Result |
| --- | --- |
| `scripts/audit-v603-round-d0-final-polish.mjs` | **8 PASS, 0 FAIL** |
| `scripts/audit-v603-round-d0-f1-f2-patch.mjs` | **12 PASS, 0 FAIL** |
| `scripts/audit-v603-round-a-d1-d4.mjs` | **7/7 PASS** |
| `scripts/audit-v603-round-b-d2-d3.mjs` | **6/6 PASS** |
| `scripts/audit-v603-round-c-taxonomy.mjs` | **10 PASS** |
| `scripts/audit-v603-round-c1-legacy-empty-audio.mjs` | **4 PASS** |
| `scripts/audit-v603-p9b-playback-marathon.mjs` | **24 PASS, 0 FAIL** |
| `scripts/audit-v603-p9c-bulk-marathon.mjs` | **17 PASS, 0 FAIL** |
| `scripts/audit-v603-p10-h1-h3-remediation.mjs` | **8 PASS, 0 FAIL** |
| `scripts/audit-v603-p10-h4-playback-remediation.mjs` | **8/8 PASS** |
| `scripts/audit-v603-p10-h5-export-zip-remediation.mjs` | **11 PASS, 0 FAIL** |
| `scripts/audit-v603-beta8-p1-ordered-multi-audio.mjs` | **13 PASS** |
| `scripts/audit-v603-beta8-p2-split-full-domain.mjs` | **17 PASS** |
| `scripts/audit-v603-beta8-p3-runtime-playback.mjs` | **15 PASS** |
| `scripts/audit-v603-beta8-p4-staging-zip.mjs` | **21 PASS** |
| `scripts/audit-v603-beta8-p5-bulk-generation.mjs` | **17 PASS** |
| `scripts/audit-v603-beta8-p6-bulk-export.mjs` | **17 PASS** |
| `scripts/audit-v603-beta8-p7-hf1-runtime-boot.mjs` | **4/4 PASS** |
| `scripts/audit-v603-beta8-p9-hf4d-navigation.mjs` | **20/20 PASS** |
| `scripts/audit-v603-a0-a3-rf-portability.mjs` | **18 PASS** |
| `scripts/audit-v603-a4-staging-gc.mjs` | **7 PASS** |
| `scripts/audit-v603-beta4-runtime-ux.mjs` | **12 PASS** |
| `scripts/audit-v603-beta5-testing-clarity.mjs` | **19 PASS** |
| `scripts/audit-v603-beta7-shared-rf-consumer-sync.mjs` | **13 PASS** |
| `scripts/audit-v603-d2-external-json.mjs` | **30 PASS** |
| `scripts/audit-v603-d3-d4-external-reconcile.mjs` | **19 PASS** |
| `scripts/audit-v603-dl-b1-download-batch.mjs` | **35 PASS** |

### 3.4 Triage of Pre-Existing / Superseded Legacy Audit Scripts (9 scripts not re-asserted as current gates)
An earlier sweep of all 37 `scripts/*.mjs` files showed 28 passing and 9 failing. Triaging against baseline `b475f386` confirmed every failure reflects earlier checkpoint assumptions already superseded prior to D0 Final Polish (or the intentional D0 Table Edge selector update in `BatchPopup.jsx`):
- `audit-v603-beta6-shared-rf-folder-crash.mjs` (`L25`): asserts deprecated `"Remembered Audio Folder detected"` text removed from `src/App.jsx` before `b475f386`.
- `audit-v603-beta8-p7-hf2-global-player-defaults.mjs` (`L152`): asserts `su-ID-TutiNeural` normal Meaning default, already `id-ID-GadisNeural` at `b475f386`.
- `audit-v603-beta8-p7-hf3-mobile-ui.mjs`: asserts `6.0.3-beta.8-p7-hf3` version strings, superseded by `6.0.3-beta.8-p9-hf4d` at `b475f386`.
- `audit-v603-beta8-p7-ui-simplification.mjs`: asserts `data-text-global-tts-only="true"` on `TextStructuredPlaybackControls.jsx` (absent at `b475f386`) and P7 frozen table directory hash (`src/components/table/BatchPopup.jsx` was intentionally updated in D0 Final Polish for Edge voice grouping and unavailable-voice blocking).
- `audit-v603-beta8-p9-hf4a-card-ux.mjs`: asserts legacy `setPlayingIndex(step.highlight ?` pattern absent from `textStructuredPlaybackSessionService.js` at `b475f386`.
- `audit-v603-beta8-p9-hf4c-player-audio-ux.mjs`: asserts `6.0.3-beta.8-p9-hf4c` version metadata (`6.0.3-beta.8-p9-hf4d` at `b475f386`).
- `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs`: asserts `6.0.3-beta.8-p9-hf4c-r1` version metadata (`6.0.3-beta.8-p9-hf4d` at `b475f386`).
- `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs` (`L834`): asserts `formatTextStructuredBrowserVoiceLabel(...)` includes `"Browser TTS"`, whereas `D0-F1/F2` (`b475f386`) intentionally changed default labels to compact `"David · US"`.
- `audit-v603-d0-d1-text-identity.mjs` (`L229`): all UID, backup v1, and filename checks (`L1-L228`) passed; line `229` fails on an older pre-`b475f386` `src/components/table` SHA-256 (`024aa45b...` vs `b475f386` `02b6c4a2...` and D0 Final Polish `BatchPopup.jsx` updates).
- Note: `scripts/audit-v5116-functions.mjs` passed in the earlier sweep and auto-regenerated `docs/M1_FUNCTION_WIRING_AUDIT.md`, which was restored via `git checkout -- docs/M1_FUNCTION_WIRING_AUDIT.md` before final packaging.
