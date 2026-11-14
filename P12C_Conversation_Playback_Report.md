# ProLingo P12-C — Conversation Playback & Acceptance Report

**Branch:** `feature/p12-conversation-only`  
**Baseline Commit:** `ab790b02c3959584539ef600635b76a45a4320c0` (post P12-A + P12-B source reviews)  
**Scope:** GitHub Issue #7 — Conversation Only playback, Speaker Sync, Audio Coverage, Card/Batch/Portable ZIP exports, and C0–C4 acceptance preparation.

---

## C0 — Locked Acceptance & Policy Contract (Pre-Fix Baseline)

This section separates **(a) existing implementation**, **(b) suspected/confirmed defects to verify test-first**, and **(c) explicit product decisions** so Conversation behavior is verified without silently altering P12/P13 or P5/P6 policies.

### (a) Existing Implementation (Locked Behavior)
1. **Speaker Sync Storage & Non-Destructive Semantics:**
   - Document metadata stores `audioPlaybackSyncProfileV1` (`{ version: 1, voice: { text, meaning }, rate: { text, meaning } }`) via `src/domain/text/textStructuredAudioSyncProfileDomain.js`.
   - Toggling Sync ON/OFF updates only `audioPlaybackSyncProfileV1` and does **not** erase or overwrite per-speaker preferences (`speakerVoiceProfileV2`, `speakerVoiceMapV1`, `audioPlaybackRateProfileV1`, `localAudioPlaybackProfileV1`, `audioDownloadProfileV1`). EN (`text`) and ID (`meaning`) channels are independent for both Voice and Rate.
2. **Browser TTS Override Hierarchy:**
   - Split mode: `Segment -> Card Speaker -> Doc Speaker -> Card -> Document Narrator -> Global Browser TTS` (`resolveTextStructuredEffectiveVoiceProfile`, `resolveTextStructuredBrowserVoiceResolution`).
   - Full mode (`representationMode: 'full'`): ignores `Segment` overrides (`ignoreSegmentOverride: true`).
3. **`CUSTOM_LOCAL` Playback Routing:**
   - `resolveTextStructuredEffectiveCustomLocalVoice` (`src/domain/text/textStructuredLocalAudioProfileDomain.js`) checks Sync ON (`syncProfile.voice[channel] === true`), otherwise `Card Speaker -> Doc Speaker -> Card -> Document -> Global`.
   - Pinned voice validation is strict (no silent fallback to `AUTO` order when pinned MP3 is missing; falls back to Browser TTS if missing). Mixed-document `CUSTOM_LOCAL` guard (`MIX-01`) remains deferred to P13.
4. **Edge Download `FOLLOW_PLAYER` & Per-Speaker Overrides:**
   - Card/Segment/Speaker Download resolution (`resolveTextStructuredEffectiveDownloadVoice`) supports `DEFAULT`, `FOLLOW_PLAYER` (mapping Browser TTS voice to Edge voice or Global Edge fallback), and `CUSTOM` per-speaker/card/segment overrides.
   - When Conversation Sync Voice is ON, `FOLLOW_PLAYER` explicitly intends to follow Speaker 1 (`source: 'sync-speaker-1'`).
5. **Conversation Split & Full Playback Routing (`POL-02`):**
   - `resolveStructuredTextPlaybackList` includes all playable segments across `document`, `card`, `segment`, and `from-here` scopes.
   - `shuffleCards` shuffles Conversation Card order only; segments within each Card remain in dialogue sequence.
   - Full mode on Conversation cards (`buildTextStructuredBlockRuntimePlaybackPlan`):
     - If `>= 1` segment has a Ready Split local file (and not `TTS_ONLY`): routes to **`split-fallback`** (`highlight: false`, `playingIndex: null`, `ignoreSegmentVoiceOverride: true`, `ttsVoicePolicy: FULL_CARD`), playing Ready Split MP3s (including per-speaker files) with TTS fallback for missing segments.
     - If `0` local files exist or `TTS_ONLY`: routes to **`full-tts-fallback`** / **`full-tts-only`** — a single concatenated `FULL_TTS` utterance resolved using the first segment's Card/Doc/Global context (**not** per-speaker multi-voice TTS switching).
6. **Bulk P5 & Full Card MP3 Boundaries (`POL-01`, `POL-02`):**
   - `isP5EligibleBlock` (`textStructuredBulkGenerationDomain.js`) and `buildTextStructuredBulkExportPlan` (`textStructuredBulkExportDomain.js`) are **Paragraph-only**. Conversation cards are skipped in Bulk P5 generation (`skippedConversationBlockCount`) and Bulk Export.
   - `TextStructuredCardAudioPanel` marks Conversation blocks with `isConversation`, hides the Paragraph Full checkbox (`Also generate missing Full audio`), disables Full Card EN/ID MP3 export buttons with title `"Full Card MP3 export is only available for Paragraph cards"`, and forces `FULL MISSING` (`ready: false`).
   - `TextBatchPopup` displays `Conversation skipped: N (use Card Audio)` and disables Bulk Generate / Bulk Export buttons when only Conversation blocks exist.
   - Conversation cards use Card Audio (`handleStructuredTextGenerateCardAudio`, `handleStructuredTextGenerateSpeakerAudio`), per-segment MP3 export (`handleStructuredTextExportAudioMp3`), Derived Full WAV export (`executeStructuredTextFullCardAudioExport` fallback to `'derived-split-wav'`), Card ZIP (`executeStructuredTextCardZipExport`), Consolidated Batch MP3/ZIP (`executeStructuredTextBatchReadyMp3Export`, `executeStructuredTextBatchConsolidatedZipExport`), and Portable ZIP v2 import/export (`executeTextStructuredAudioZipImport`). Note: legacy scope-export helpers remain in service/App layer while UI Generation/Export focuses on Card Audio & Audio Library Portable ZIP import.

### (b) Defects Suspected in Baseline Source (To Verify Test-First in C1–C3)
1. **Suspected Defect C1-A (`src/App.jsx` `resolveStructuredTextChannelVoiceState`):** When `syncVoice === true` and Speaker 1 has **no** explicit entry in `speakerVoiceProfileV2` / `speakerVoiceMapV1` (`firstVoice === null`, so Speaker 1 inherits Workspace Narrator or Global Browser TTS), `App.jsx` passes `requestedVoiceName: null, requestedSource: null`, allowing `resolveTextStructuredBrowserVoiceResolution` to fall back to Follower Speaker 2's own `card-speaker` or `document-speaker` override instead of Speaker 1's effective voice.
2. **Suspected Defect C1-B (`src/domain/text/textStructuredAudioDownloadProfileDomain.js` `FOLLOW_PLAYER` Sync):** Under Conversation `FOLLOW_PLAYER` with `syncProfile.voice[channel] === true`, when Speaker 1 has no direct `speakerVoiceProfileV2`/`speakerVoiceMapV1` entry, `getTextStructuredSpeakerAssignedVoiceName || defaultPlaybackVoiceName` skips Card-Speaker-1 and Workspace Narrator overrides; furthermore, if `defaultPlaybackVoiceName` is omitted (`null`), `syncedVoice || playback.voiceName` leaks the **Follower's** saved voice while stamping `source: 'sync-speaker-1'`.
3. **Suspected Defect C1-C (`src/components/text/TextStructuredPlayer.jsx` segment speaker voice badge):** Calls `resolveTextStructuredEffectiveVoiceProfile` directly for each Conversation segment without checking `audioPlaybackSyncProfileV1`, displaying the Follower's unsynced voice label even when Sync Voice EN is ON.
4. **Suspected Checks C1-D / C1-E (Playback Rate Sync, Custom Local Sync, `TextStructuredAudioControls` Sync badges):** Verify in test harness whether `resolveStructuredTextItemPlaybackRate` (`App.jsx`), `resolveTextStructuredEffectiveCustomLocalVoice` (`textStructuredLocalAudioProfileDomain.js`), and `TextStructuredAudioControls.jsx` rate/local sync badges properly respect `syncProfile.rate` vs `syncProfile.voice` and Workspace/Global inheritance when Speaker 1 has no explicit per-speaker pin/rate.

### (c) Product Decisions & Explicit Boundaries (No Silent Changes)
- **PD-01 Multi-Speaker Full Mode Playback:** Kept unchanged (`split-fallback` when Ready Split MP3s exist; single `FULL_TTS` utterance using first-segment context when 0 local audio exists / `TTS_ONLY`). Converting Full TTS fallback into a sequential multi-speaker utterance queue is an explicit future product decision and is **not** changed silently here; no synthetic multi-speaker MP3 stitching or fake `FULL READY` state is introduced.
- **PD-02 Paragraph-Only Bulk P5 & Full MP3 Boundaries (`POL-01`, `POL-02`):** Preserved strictly Paragraph-only.
- **PD-03 `FOLLOW_PLAYER` under Speaker Sync (`POL-03`):** Retains the codebase's existing design that `FOLLOW_PLAYER` honors Conversation Voice Sync ON (`source: 'sync-speaker-1'`), fixing only the inheritance/fallback bug when Speaker 1 inherits Card-Speaker-1 / Workspace Narrator / Global default.
- **PD-04 P13 Mixed (`MIX-01`) & Table/AI Voice:** Out of scope and untouched.

---

## C1–C4 Execution Log

### 1. Test-First Baseline (Pre-Fix RED at `ab790b02c3959584539ef600635b76a45a4320c0`)
Command: `node scripts\audit-v603-p12c-conversation-playback.mjs`
Result: **9 passed, 4 failed (13 total)**

| Check ID | Scope | Pre-Fix Status | Post-Fix Status | Confirmed Defect / Coverage Summary |
| :--- | :--- | :--- | :--- | :--- |
| `C1.1` | Conversation EN/ID rate sync & playback | PASS | PASS | Independent EN/ID rate resolution and Sync toggle behavior verified in Node harness. |
| `C1.2-DEFECT` | Browser TTS Voice Sync inheritance | **FAIL** | **PASS** | When Speaker 1 lacked an explicit speaker override, Sync passed `requestedVoiceName: null`, letting follower Ben's card override (`Microsoft Ryan`) leak instead of Speaker 1's Workspace Narrator (`Microsoft George`). Also covered unavailable requested voice fallback strictly down Speaker 1's hierarchy plus Card-1 rate `1.7`. |
| `C1.3-DEFECT` | Edge `FOLLOW_PLAYER` under Voice Sync | **FAIL** | **PASS** | `FOLLOW_PLAYER` under Voice Sync skipped Workspace Narrator (`Microsoft Thomas -> en-GB-ThomasNeural`) and leaked follower Ben (`en-GB-SoniaNeural`) when `defaultPlaybackVoiceName` was omitted. |
| `C1.4-DEFECT` | `CUSTOM_LOCAL` under Voice Sync | **FAIL** | **PASS** | `CUSTOM_LOCAL` under Sync read `documentTree` only and ignored Card-1 Speaker-1 pin (`en-GB-MaisieNeural`), returning `en-GB-RyanNeural`. Resolved as `Card Speaker 1 -> Doc Speaker 1 -> Card Channel -> Doc Channel`, satisfying both `C1.4-DEFECT` and `p10-h4` `[H4-B][G010-2]`. |
| `C1.5-DEFECT` | `TextStructuredPlayer.jsx` voice/rate badges | **FAIL** | **PASS** | Player badge rendered follower Ben's unsynced voice (`Ben Microsoft Ryan`) instead of Speaker 1's synced voice (`Sonia`) and synced rate display. |
| `C1.6` | Speaker Voice/Rate Sync controls & labels | PASS | PASS | `'sync-speaker-1': 'Synced to Speaker 1'` source labeling and panel sync state verified. |
| `C2.1` | Split vs Full Conversation playback ordering | PASS | PASS | Multi-speaker segment sequence, Split/Full selection, and navigation ordering verified. |
| `C2.2` | Resume, repeat & shuffle state handling | PASS | PASS | Conversation playback resume position, repeat, and shuffle transitions verified. |
| `C2.3` | Active segment highlighting & speaker turn sync | PASS | PASS | Active item highlighting aligned with segment turn progression in React/domain harness. |
| `C2.4` | EN/ID channel switching & playback continuity | PASS | PASS | Channel toggle preserves Conversation speaker resolution and playback boundaries. |
| `C3.1` | Conversation Card audio & missing-audio coverage | PASS | PASS | Card audio resolution, Ready/Partial/TTS states, and coverage counts verified. |
| `C3.2` | Bulk P5 & Full Card MP3 boundaries (`PD-02`) | PASS | PASS | Verified Paragraph-only Bulk P5 and Full Card MP3 boundaries remain untouched for Conversation documents. |
| `C3.3` | Conversation ZIP export & import roundtrip | PASS | PASS | Scoped Conversation ZIP export/import metadata & audio asset handling verified in Node harness. |

### 2. Root Causes & Production Fixes Applied
1. **Shared Master Speaker Lookup (`src/domain/text/textStructuredSpeakerIdentityDomain.js`):** Added `resolveTextStructuredConversationMasterSpeaker({ documentTree, block, conversationSpeakers })` so all Conversation sync consumers resolve Speaker 1's `{ speaker, segment }` consistently via `buildTextStructuredSegmentSpeakerIdentityMetadata`.
2. **Synced Voice Profile & Browser Resolution (`src/domain/text/textStructuredVoiceAssignmentDomain.js`):** Added `resolveTextStructuredConversationSyncedVoiceProfile`, `'sync-speaker-1': 'Synced to Speaker 1'` source/display label mappings, and `respectConversationSync` / `conversationSpeakers` / `syncedToFirstSpeaker` support to `resolveTextStructuredBrowserVoiceResolution` (falling back strictly along Speaker 1's hierarchy when unavailable).
3. **Effective Rate & App Sync Unification (`src/domain/text/textStructuredPlaybackRateProfileDomain.js`, `src/App.jsx`):** Added `respectConversationSync` and `conversationSpeakers` to `resolveTextStructuredEffectivePlaybackRate`, unified `resolveStructuredTextChannelVoiceState` and `resolveStructuredTextItemPlaybackRate` in `src/App.jsx`, and removed the unused `getTextStructuredSpeakerAssignedVoiceName` import.
4. **Custom Local Sync Precedence (`src/domain/text/textStructuredLocalAudioProfileDomain.js`):** Extracted shared `resolveSpeakerLocalPin(...)` helper and ordered Sync ON resolution as `Card Speaker 1 -> Doc Speaker 1 -> Card Channel -> Doc Channel`, preserving `Card > Doc Speaker` when Sync is OFF.
5. **Download, Runtime Status & UI Consumers (`src/domain/text/textStructuredAudioDownloadProfileDomain.js`, `src/domain/text/textStructuredAudioRuntimeDomain.js`, `src/components/text/TextStructuredPlayer.jsx`, `src/components/text/TextStructuredCardAudioPanel.jsx`):** Routed `FOLLOW_PLAYER`, runtime audio status map, `TextStructuredPlayer` speaker badge, and `TextStructuredCardAudioPanel` `cardVoiceResolutions` (`respectConversationSync: true`) through the shared Conversation sync resolvers.

### 3. Changed Files (`feature/p12-conversation-only`)
- `src/domain/text/textStructuredSpeakerIdentityDomain.js`
- `src/domain/text/textStructuredVoiceAssignmentDomain.js`
- `src/domain/text/textStructuredPlaybackRateProfileDomain.js`
- `src/domain/text/textStructuredLocalAudioProfileDomain.js`
- `src/domain/text/textStructuredAudioDownloadProfileDomain.js`
- `src/domain/text/textStructuredAudioRuntimeDomain.js`
- `src/components/text/TextStructuredPlayer.jsx`
- `src/components/text/TextStructuredCardAudioPanel.jsx`
- `src/App.jsx`
- `scripts/audit-v603-p12c-conversation-playback.mjs` (new P12-C regression audit)
- `P12C_Conversation_Playback_Report.md` (this report)

### 4. Stage C4 Verification Matrix (Run After Final Code Edit)
| Check Command | Outcome | Reported Summary |
| :--- | :--- | :--- |
| `node scripts\audit-v603-p12c-conversation-playback.mjs` | **PASS** (`EXIT=0`) | `13 passed, 0 failed (13 total)` (`C1.1`..`C1.6`, `C2.1`..`C2.4`, `C3.1`..`C3.3`) |
| `node scripts\audit-v603-p12a-external-reconcile.mjs` | **PASS** (`EXIT=0`) | `PASS P12-A external reconciliation audit` (`11` PASS lines) |
| `node scripts\audit-v603-p12b-speaker-registry.mjs` | **PASS** (`EXIT=0`) | `14 passed, 0 failed` |
| `node scripts\audit-v603-d2-external-json.mjs` | **PASS** (`EXIT=0`) | `PASS D2 External JSON audit: 30 checks` |
| `node scripts\audit-v603-d3-d4-external-reconcile.mjs` | **PASS** (`EXIT=0`) | `PASS D3/D4 external reconciliation audit: 19 checks` |
| `node scripts\audit-v603-round-c-taxonomy.mjs` | **PASS** (`EXIT=0`) | `Round C Taxonomy & Stage 0 Audit complete: 10 PASS` |
| `node scripts\audit-v603-round-c1-legacy-empty-audio.mjs` | **PASS** (`EXIT=0`) | `Round C.1 Final Boundary Polish Audit complete: 4 PASS` |
| `node scripts\audit-v603-p10-h4-playback-remediation.mjs` | **PASS** (`EXIT=0`) | `=== H4 REMEDIATION GATE SUMMARY: 8/8 PASS ===` |
| `node scripts\audit-v603-p10-h1-h3-remediation.mjs` | **PASS** (`EXIT=0`) | `P10 H1-H3 REMEDIATION CHECKS: 8 PASS, 0 FAIL (8 total)` |
| `node scripts\audit-v603-p10-h5-export-zip-remediation.mjs` | **PASS** (`EXIT=0`) | `P10 H5 EXPORT & ZIP REMEDIATION SUMMARY: 11 PASS, 0 FAIL (11 total)` |
| `node scripts\audit-v603-p9b-playback-marathon.mjs` | **PASS** (`EXIT=0`) | `P9-B MARATHON SUMMARY: 24 PASS, 0 FAIL (24 total)` |
| `node scripts\audit-v603-p9c-bulk-marathon.mjs` | **PASS** (`EXIT=0`) | `P9-C MARATHON SUMMARY: 17 PASS, 0 FAIL (17 total)` |
| `node scripts\audit-v603-round-d3-paragraph-acceptance.mjs` | **PASS** (`EXIT=0`) | `D3_SUMMARY: 7 PASS, 0 FAIL` |
| `node scripts\audit-v603-final-workspace-reset-scopes.mjs` | **PASS** (`EXIT=0`) | `Final Text Audio UI hotfix: scoped Workspace reset contracts PASS` |
| `node scripts\audit-v603-round-d1-reset-preferences.mjs` | **PASS** (`EXIT=0`) | `ROUND D1 RESET PREFERENCES AUDIT COMPLETE — 3 PASS, 0 FAIL` |
| `node scripts\audit-v603-round-d2-reset-ui.mjs` | **PASS** (`EXIT=0`) | `D2_SUMMARY: 7 PASS, 0 FAIL` |
| `node scripts\audit-v603-p4-reset-alignment.mjs` | **PASS** (`EXIT=0`) | `P4 RESET ALIGNMENT SUMMARY: 5 PASS, 0 FAIL` |
| `node scripts\audit-v603-reset-dirty-release.mjs` | **PASS** (`EXIT=0`) | `RESET_DIRTY_RELEASE_SUMMARY: 5 PASS, 0 FAIL` |
| `npx eslint src/domain/text/textStructuredSpeakerIdentityDomain.js src/domain/text/textStructuredVoiceAssignmentDomain.js src/domain/text/textStructuredPlaybackRateProfileDomain.js src/domain/text/textStructuredLocalAudioProfileDomain.js src/domain/text/textStructuredAudioDownloadProfileDomain.js src/domain/text/textStructuredAudioRuntimeDomain.js scripts/audit-v603-p12c-conversation-playback.mjs` | **PASS** (`EXIT=0`) | 0 errors, 0 warnings |
| `npx eslint src/App.jsx src/components/text/TextStructuredPlayer.jsx src/components/text/TextStructuredCardAudioPanel.jsx` (filtered to P12-C edited lines) | **0 new issues on edited lines** | 0 errors/warnings on P12-C modified lines (`src/App.jsx` has 192 pre-existing problems: 126 errors, 66 warnings; `TextStructuredPlayer.jsx` has 20 pre-existing problems: 17 errors, 3 warnings; `TextStructuredCardAudioPanel.jsx` clean). |
| `npm run build` (`vite build`) | **PASS** (`EXIT=0`) | `1895 modules transformed`, built in `7.87s` (`dist/index.html 0.86 kB`, `dist/assets/index-Dau5Wyfi.css 100.38 kB`, `dist/assets/index-ByCKLs-6.js 1,555.45 kB`). |

> **Pre-existing unrelated audit note:** `node scripts\audit-v603-beta8-p9-hf5-voice-audio-ux.mjs` passed Test Cases 1–9 and exited `1` on Test Case 10 Part C (`L834`), where `formatTextStructuredBrowserVoiceLabel({ name: 'Microsoft David - English (United States)', lang: 'en-US' })` returns `'David · US'` (introduced in earlier Round D0 commit `033c83a`) while the older `hf5` test asserts `/Browser TTS/`. Left untouched per P12-C scope.

### 5. Node-vs-Browser & UAT Verification Boundaries
All C1–C4 checks above ran in Node-based domain/React harness scripts and `vite build`. The following remain **UNVERIFIED in live runtime** until manual UAT after review:
- Live Chromium desktop and mobile browser UI rendering/interaction (hover/focus tooltips, responsive controls, slider drag/release commit behavior).
- Real Web Speech API (`window.speechSynthesis` / `SpeechSynthesisUtterance`) voice enumeration, actual spoken rate, and utterance lifecycle events.
- Live Edge TTS backend synthesis/network download responses (`FOLLOW_PLAYER` / Edge MP3 generation).
- Browser `AudioContext` WAV encoding/decoding and DOM `<audio>` playback element transitions.
- Persistent browser `IndexedDB` audio blob storage across page reloads.

---

**Stage Status:** P12-C implementation and C4 verification complete. Stopped for independent ChatGPT review before any manual UAT or P13 Mixed (`MIX-01`) work.
