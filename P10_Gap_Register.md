# P10 App-Wide Gap Register (ProLingo v6)

- **Repository / Baseline:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries` @ `fe0f4de` (working tree includes bounded P10 H1–H3 remediation)
- **Audit Scope:** Consolidated internal runtime + code-level gaps across **P9-B Playback**, **P9-C Bulk/Staging/ZIP**, **Legacy Audit Triage**, and **Stage 4 App-Wide Discovery** (`Table`, `Legacy Text`, `Paragraph`, `Conversation`, `Mixed`).
- **Remediation Status (H1–H3):** All **8 / 8 P1** findings (`P10-G001`–`P10-G008`) plus bonus P2 **`P10-G015`** (`P9C-D`) are **Fixed & Verified** in Node/Vite/ESLint. Remaining P2 (`P10-G009`–`P10-G014`, `P10-G016`–`P10-G018`) and P3 (`P10-G019`–`P10-G021`) items remain **Deferred / Out of Scope for H1–H3**. See [`P10_H1_H3_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H1_H3_Remediation_Report.md).

---

## Summary by Severity & Confidence

| Severity | Count | Status after H1–H3 | Gap IDs |
|---|---:|---|---|
| **P1 (High / Functional or Data Integrity)** | 8 | **8 / 8 Fixed & Verified** | `P10-G001` – `P10-G008` |
| **P2 (Medium / Voice, UI Parity, Export, Leak)** | 10 | **1 Bonus Fixed (`G015`), 9 Deferred** | `P10-G009` – `P10-G018` |
| **P3 (Low / Cleanup, UX Consistency)** | 3 | **3 Deferred** | `P10-G019` – `P10-G021` |

| Confidence Tag | Meaning | Count |
|---|---|---:|
| `Confirmed Runtime` | Deterministically reproduced by executing `audit-v603-p9b-playback-marathon.mjs` or `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT]` probes) | 15 |
| `Confirmed Code` | Directly observed in source code paths & cross-module invariants | 6 |

---

## Detailed Gap Register

### `P10-G001` — Unthrottled Spin Loop on `repeatMode=loop` When TTS Fails/Resolves Synchronously
- **Status:** **Fixed & Verified (Wave H1)**
- **Category:** Playback Reliability / Browser Freeze Hazard
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S6-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S6-A]`): 100 consecutive loop passes execute with zero inter-pass delay when channel resolves immediately (`unavailable TTS voice` / missing `SpeechSynthesisUtterance`). Related playback runtime loop in [textStructuredPlaybackSessionService.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js).
- **Implemented Fix:** Added progressive fast-settle step (`FAST_SETTLE_STEP_THRESHOLD_MS = 15`, `FAST_STEP_YIELD_MS = 16` after `>= 2` instant steps) and pass (`FAST_SETTLE_PASS_THRESHOLD_MS = 60`, `FAST_PASS_BACKOFF_STEP_MS = 40` capped at `250ms`) cancellable backoff in [textStructuredPlaybackSessionService.js:17-21,257,342,376](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L17-L21), keeping normal `>= 60ms` playback passes delay-free.
- **Verification & Classification:** **`FIXED`** — both `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S6-A]`) and `audit-v603-p10-h1-h3-remediation.mjs` (`[H1][P10-G001]`) **PASS**.
- **Manual Browser Check Required:** Yes (verify Stop responsiveness / no tab freeze when Web Speech API is unavailable).

---

### `P10-G002` — `FROM_HERE` Starting Mid-Card in `Full` Representation Replays Segment 1
- **Status:** **Fixed & Verified (Wave H3)**
- **Category:** Playback Ordering / Cursor Fidelity
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S1-A`)
- **Affected Modes:** Structured Text `Full` mode (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S1-A]`): starting `FROM_HERE` at `SEGMENT_000002` inside a multi-segment card yields `["SEGMENT_000001","SEGMENT_000002","SEGMENT_000003", ...]`, replaying Seg 1 before advancing.
- **Implemented Fix:** Added `segmentIds` slice support via `resolveScopedSegments` in [textStructuredRuntimePlaybackPlanDomain.js:30-43,125,246-254](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L30-L43) so partial card slices suppress `FULL_LOCAL` and build `fullRepresentation` and `splitFallback` strictly from remaining segments while preserving block-level `playbackOrder`/`ttsOnly`; updated [textStructuredPlaybackSessionService.js:206-233](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L206-L233) to slice `planBlock` & `planSegmentIds` and filter returned steps on `!group.wholeBlock` while keeping `Card 2+` `FULL_LOCAL` intact; wired `fullBlock`/`segmentIds` in [App.jsx:3178](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3178).
- **Verification & Classification:** **`FIXED`** — both `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S1-A]`) and `audit-v603-p10-h1-h3-remediation.mjs` (`[H3][P10-G002]`) **PASS**.
- **Manual Browser Check Required:** Yes (click mid-card "From Here" in `Full` mode and verify audio/highlight).

---

### `P10-G003` — `handlePlayerSmartNav` Leaks Temporary Manual Override Settings Into Global Playback
- **Status:** **Fixed & Verified (Wave H3)**
- **Category:** Global vs Manual Session Isolation
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S6-B`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S6-B]`): `handlePlayerSmartNav` previously inherited `session.repeatMode`, `playbackRepresentationMode`, and `playbackChannelMode` even when the prior active session was a scoped manual Segment/Card play.
- **Implemented Fix:** Extracted `resolveStructuredTextSmartNavigationContext` and `resolveStructuredTextSmartNavPlan` in [textStructuredPlaybackDomain.js:170-277](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js#L170-L277) so global Prev/Next ALWAYS resolves `playbackRepresentationMode`, `playbackOrderMode`, `playbackChannelMode`, `repeatMode`, and `repeatCount: null` from current global `preferences` (never inheriting from `session`); wired `handlePlayerSmartNav` in [App.jsx:3676-3720](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3676-L3720).
- **Verification & Classification:** **`FIXED` (behavioral verification in `audit-v603-p10-h1-h3-remediation.mjs` `[H3][P10-G003]` PASS)**; note `audit-v603-p9b-playback-marathon.mjs` `[DEFECT S6-B]` is classified **`INVALID TEST` (archived pre-fix inline regex probe)** because its regex (`/session\?\.scope\s*===\s*TEXT_STRUCTURED_PLAYBACK_SCOPES\.(DOCUMENT|FROM_HERE)/` inside `navFn`) expected inline `session.scope` branching inside `App.jsx` whereas the clean architectural fix eliminated `session` setting inheritance completely via `textStructuredPlaybackDomain.js`.
- **Manual Browser Check Required:** Yes (play manual Segment with Loop, then press Global Next/Prev).

---

### `P10-G004` — Stale `orderedListOverride` Overrides `Sequential` Mode
- **Status:** **Fixed & Verified (Wave H3)**
- **Category:** Playback Order / Shuffle State Leak
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S7-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S7-A]`): switching back to `Sequential` still resolved shuffled order `["SEGMENT_000006","SEGMENT_000004","SEGMENT_000005",...]` due to stale `orderedListOverride`.
- **Implemented Fix:** Gated `overrideValid` & `persistedOrderedList` on `playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE` in [textStructuredPlaybackSessionService.js:141-158,202,329](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L141-L158), ignored saved Shuffle snapshots when `playbackOrderMode !== 'shuffle'` in `resolveStructuredTextSmartNavigationContext` ([textStructuredPlaybackDomain.js:211-237](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js#L211-L237)), cleared resume `orderedList` in `handleStructuredTextPlaybackFeelChange` ([App.jsx:1273-1283](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1273-L1283)), and gated resume `orderedListOverride` in `startStructuredTextPlayback` & `handlePlayerGlobalPlay` ([App.jsx:3531-3586,3660-3672](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3531-L3586)).
- **Verification & Classification:** **`FIXED`** — both `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S7-A]`) and `audit-v603-p10-h1-h3-remediation.mjs` (`[H3][P10-G004]`) **PASS**, and `audit-v603-beta8-p9-hf4d-navigation.mjs` (`20/20`) stays **PASS**.
- **Manual Browser Check Required:** Yes (enable Shuffle -> pause/stop -> switch to Sequential -> press Next/Play).

---

### `P10-G005` — Missing Null-Voice Fallback Skips Native Browser TTS Completely
- **Status:** **Fixed & Verified (Wave H1)**
- **Category:** Browser TTS Resilience
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S9-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S9-A]`): `playStructuredTextChannel` / `FullStep` in `src/App.jsx` returned early when `!targetVoice`, contradicting `executeBrowserTtsPlaybackService`'s native system-default TTS fallback policy.
- **Implemented Fix:** Added `isBrowserTtsSpeechSupported` helper & guards in [audioPlaybackSideEffectService.js:1-25](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/audioPlaybackSideEffectService.js#L1-L25) and shared `speakStructuredTextBrowserTts` in [App.jsx:3209,3350,3502,4604](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3209) so missing named voices fall back to native OS TTS (`overrideVoice: null`) whenever Web Speech API is supported.
- **Verification & Classification:** **`FIXED`** — both `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S9-A]`) and `audit-v603-p10-h1-h3-remediation.mjs` (`[H1][P10-G005]`) **PASS**.
- **Manual Browser Check Required:** Yes (test with System Default Browser TTS when `getVoices()` returns empty or lacks named voice).

---

### `P10-G006` — Text DB Restore / Pack Sync Skips Staging Runtime ObjectURL Re-Hydration
- **Status:** **Fixed & Verified (Wave H2)**
- **Category:** Storage / Runtime State Desync
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-C `P9C-A`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `handleTextDatabaseBackupRestore` and Pack Sync previously left `structuredTextAudioStagingHydratedRef.current` latched `true`, so runtime ObjectURL maps (`structuredTextAudioRuntimeUrls` & `structuredTextFullAudioRuntimeUrls`) were neither cleared nor re-bound from IndexedDB Staging after restore/merge.
- **Implemented Fix:** Added pure `reconcileTextAudioStagingRuntimeBindings` in [textAudioStagingService.js:281](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L281) (handling ID collisions & revoking superseded blob URLs safely without destructive GC) plus async-token-guarded `rehydrateStructuredTextAudioStagingRuntime` in [App.jsx:625-667](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L625-L667); wired into `handleTextDatabaseBackupRestore` (`resetExisting: true` at `App.jsx:4026`), `handleTextPackAttachOrSync`, `handleTextPackImportCopy`, `handleTextExternalInitialImport`, `handleTextExternalImportDecision`, and `handleTextSourceDetach` (`App.jsx:3918-3979`).
- **Verification & Classification:** **`FIXED`** — both `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-A]`) and `audit-v603-p10-h1-h3-remediation.mjs` (`[H2][P10-G006]`) **PASS**.
- **Manual Browser Check Required:** Yes (verify audio plays immediately after DB restore / Pack Sync without page reload).

---

### `P10-G007` — Non-Atomic Two-DB Portable ZIP Import Without Rollback on Failure
- **Status:** **Fixed & Verified (Wave H2)**
- **Category:** Data Integrity / Transaction Safety
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-C `P9C-B`)
- **Affected Modes:** Structured Text Portable ZIP Import
- **Primary Evidence:** ZIP import previously wrote `audioVariants` / `fullAudioArtifacts` metadata into Text Library IDB before extracting and storing binary blobs into Audio Staging IDB, with no rollback if blob decompression failed mid-archive.
- **Implemented Fix:** Created transactional orchestrator `executeTextStructuredAudioZipImport` in [textStructuredAudioZipImportService.js:72](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L72) (**Phase 1:** decompress & validate all ZIP blobs before any DB write -> **Phase 2:** snapshot pre-existing Staging records via `getTextAudioStagingSnapshot`/`getTextFullAudioStagingSnapshot` & stage blobs -> **Phase 3:** atomic single-TX `executeTextZipImportMetadataCommit` in [textLibraryCommandService.js:399](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textLibraryCommandService.js#L399) -> full compensating rollback via `rollbackTextAudioStagingBatch` + `executeTextAudioImportRollback` on error or `AbortSignal`, restoring overwritten pre-existing Staging blobs via [audioStagingIndexedDbService.js:201-249](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L201-L249)); wired cleanly into `handleStructuredTextAddAudioZipFiles` in [App.jsx:1923-2035](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1923-L2035).
- **Verification & Classification:** **`FIXED` (verified in `audit-v603-p10-h1-h3-remediation.mjs` `[H2][P10-G007]` PASS across corrupt-ZIP, Phase 2 Staging error, Phase 3 Text DB error, post-commit AbortSignal, and happy path)**; note `audit-v603-p9c-bulk-marathon.mjs:536` (`[DEFECT P9C-B]`, `assert.ok(firstWritePos > 0 && firstReadPos > firstWritePos)`) and `audit-v603-beta8-p4-staging-zip.mjs:212` (`assert.match(appSource, /zip-imported-staging-ready/)`) are classified **`INVALID TEST` (archived pre-fix / pre-extraction source regexes on `App.jsx`)**.
- **Manual Browser Check Required:** Optional (import a valid Portable ZIP and a corrupt ZIP in browser to smoke-check UI feedback).

---

### `P10-G008` — Table "Clear Audio RAM" (`clearAudioStagingRuntimeCache()`) Revokes Text Staging ObjectURLs
- **Status:** **Fixed & Verified (Wave H1)**
- **Category:** Table/Text Boundary Isolation Leak
- **Severity / Confidence:** `P1` | `Confirmed Code`
- **Affected Modes:** `Table` -> impacts `Structured Text` (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `clearTableGeneratedAudioRam()` (`App.jsx`) and `clearAudioStagingForMode(mode)` (`audioStagingIndexedDbService.js`) previously called global `clearAudioStagingRuntimeCache()` instead of mode-scoped `clearAudioStagingRuntimeCacheForMode(...)`, revoking Structured Text Staging ObjectURLs from Table actions.
- **Implemented Fix:** Replaced global `clearAudioStagingRuntimeCache()` in `clearTableGeneratedAudioRam` with `clearAudioStagingRuntimeCacheForMode('table')` ([App.jsx:6201](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6201)), and updated `clearAudioStagingForMode` ([audioStagingIndexedDbService.js:353-367](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L353-L367)) to revoke only `clearAudioStagingRuntimeCacheForIds(ids)` + `clearAudioStagingRuntimeCacheForMode(mode)`.
- **Verification & Classification:** **`FIXED`** — `audit-v603-p10-h1-h3-remediation.mjs` (`[H1][P10-G008]`) **PASS** (`clearAudioStagingRuntimeCacheForMode('table')` & `clearAudioStagingForMode('table')` preserve `'text'` ObjectURLs while revoking `'table'` ObjectURLs).
- **Manual Browser Check Required:** Yes (verify playing Text Staging audio after Table Clear Audio RAM).

---

### `P10-G009` — `MediaSession` Metadata Stays `null` in Structured Text `Full` Playback
- **Category:** Hardware / OS Media Controls Parity
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S1-B`)
- **Affected Modes:** Structured Text `Full` mode (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S1-B]`): because `Full` mode intentionally sets `playingIndex = null` at segment level while tracking card state separately, `MediaSession` metadata effect stays `null`.
- **Repro Condition:** Play a Paragraph Card in `Full` representation on mobile/desktop supporting `navigator.mediaSession`.
- **Bounded Fix Direction:** Derive `MediaSession` metadata from active structured block/card context whenever Text `Full` session is active even if segment `playingIndex === null`.
- **Required Test:** Flip P9-B `S1-B` into `[CONTRACT]`.
- **Manual Browser Check Required:** Yes (inspect lock-screen / OS media widget in `Full` mode).

---

### `P10-G010` — Full Block Channel Planner Ignores `CUSTOM_LOCAL` Pin Mode
- **Category:** Ordered Multi-Audio / Playback Profile Routing
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S2-A`)
- **Affected Modes:** Structured Text `Full` mode (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S2-A]`): `resolveStructuredTextBlockChannelPlaybackPlan` in `src/App.jsx` omits `CUSTOM_LOCAL` / `localAudioPlaybackProfileV1` handling.
- **Repro Condition:** Set global/card `localAudioPlaybackProfileV1` to pin a specific custom profile and play a card in `Full` mode.
- **Bounded Fix Direction:** Route `Full` channel planning through the same `CUSTOM_LOCAL` profile resolver contract used for Split segments (while retaining fail-closed readiness).
- **Required Test:** Flip P9-B `S2-A` into `[CONTRACT]`.
- **Manual Browser Check Required:** No (can be verified via unit test + sanity check).

---

### `P10-G011` — Browser TTS Fallback Skips `card-speaker` & `document-speaker` When Segment Voice Unavailable
- **Category:** Voice Inheritance / Fallback Chain
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S4-A`)
- **Affected Modes:** Structured Text (`Conversation`, `Mixed`, `Paragraph` with speaker profiles)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S4-A]`): when a Segment override names an unavailable voice, `resolveTextStructuredBrowserVoiceResolution` returned `'DocVoice (document)'` instead of walking down through `'CardAliceVoice'` / `'SpeakerAliceVoice'`.
- **Repro Condition:** Assign unavailable Browser TTS voice at Segment level, valid voice at Card Speaker or Document Speaker level, and valid fallback at Document level.
- **Bounded Fix Direction:** Evaluate candidate precedence sequentially against available browser voices instead of short-circuiting from Segment straight to Document/Global default.
- **Required Test:** Flip P9-B `S4-A` into `[CONTRACT]`.
- **Manual Browser Check Required:** Optional (smoke verify with multi-speaker Conversation card).

---

### `P10-G012` — `structuredTextPlaybackSourceStatus` Leaks Across Workspaces & Stop Transitions
- **Category:** UI Status / State Hygiene
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S8-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S8-A]`): `structuredTextPlaybackSourceStatus` has no `documentId` scope and isn't reset on Stop or workspace switch.
- **Repro Condition:** Play Document A (status badge shows source engine/file), switch to Document B or Stop -> stale source badge from Document A persists.
- **Bounded Fix Direction:** Tag status state with `{ documentId, ... }` and clear on Stop and active document transitions.
- **Required Test:** Flip P9-B `S8-A` into `[CONTRACT]`.
- **Manual Browser Check Required:** Yes (visual check on Bottom/Player badge).

---

### `P10-G013` — `BottomPlayerBar` Receives `textTtsOnly` / `onTextTtsOnlyChange` Without Rendering Toggle
- **Category:** UI Prop Plumbing / Control Parity
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S10-A`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S10-A]`), [MainAppShellView.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/MainAppShellView.jsx), and [BottomPlayerBar.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/BottomPlayerBar.jsx): `BottomPlayerBar` accepts `textTtsOnly` / `onTextTtsOnlyChange` props but neither renders nor invokes them.
- **Bounded Fix Direction:** Decide explicitly: either wire a compact TTS-Only toggle/badge into `BottomPlayerBar` (matching Player header expectation) OR remove dead props if Sidebar `TextStructuredAudioControls` (`L294`) is the intended single control.
- **Required Test:** Align P9-B `S10-A` with approved UI contract.
- **Manual Browser Check Required:** Yes.

---

### `P10-G014` — Single-Card & Legacy-Batch Exporters Ignore Ready Edge `Full` Artifacts
- **Category:** Audio Export Completeness
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-C`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Mixed` `Full` audio)
- **Primary Evidence:** [App.jsx:4819-5102](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4819-L5102) (`handleStructuredTextExportCardZip`, `handleStructuredTextExportFullCardAudio`, `handleStructuredTextBatchExportReadyMp3`, `handleStructuredTextBatchExportConsolidatedZip`) + P9-C `[DEFECT P9C-C]`. Only Split variants are included in Card ZIP / Legacy-Batch exports even when Ready Edge `Full` artifacts exist in Staging (contrast with Bulk Export which already supports Full).
- **Bounded Fix Direction:** Include Ready Edge `Full` artifact entries alongside Split variants in Card ZIP / Batch helpers (or gate Card-level Full export cleanly onto Staging Full artifact lookup).
- **Required Test:** Flip P9-C `P9C-C` into `[CONTRACT]`.
- **Manual Browser Check Required:** Yes (export a Card ZIP after generating `Full` audio and inspect archive contents).

---

### `P10-G015` — Portable ZIP Split Import Overwrites Runtime ObjectURLs Without Revocation
- **Status:** **Fixed & Verified (Bonus in Wave H2)**
- **Category:** Memory / Blob URL Leak
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-D`) & `Confirmed Code`
- **Affected Modes:** Structured Text Portable ZIP Import
- **Primary Evidence:** `handleStructuredTextAddAudioZipFiles` previously overwrote runtime ObjectURL entries without revoking superseded `blob:` URLs.
- **Implemented Fix:** Added stale Split and Full `URL.revokeObjectURL` cleanup during runtime state updates in `handleStructuredTextAddAudioZipFiles` ([App.jsx:1994-2035](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1994-L2035)) alongside `reconcileTextAudioStagingRuntimeBindings` ([textAudioStagingService.js:281](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L281)).
- **Verification & Classification:** **`FIXED`** — `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-D]`) now **PASSES**.
- **Manual Browser Check Required:** No (verified cleanly in Node; note `P10-G009`–`P10-G014` and `P10-G016`–`P10-G021` remain Deferred / Out of Scope for H1–H3).

---

### `P10-G016` — Multi-Part Bulk Export ZIP Loop Triggers Back-to-Back Downloads Without Wave Pause
- **Category:** Browser Download Throttling Risk
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-E`)
- **Affected Modes:** Structured Text Bulk Export (large multi-part ZIPs)
- **Primary Evidence:** `scripts/audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-E]`): multi-part ZIP export loop dispatches consecutive `triggerBrowserZipDownload` calls with zero inter-part yield.
- **Repro Condition:** Export a collection/workspace large enough to split into 2+ ZIP parts in Chromium/Edge with default multiple-download prompt heuristics.
- **Bounded Fix Direction:** Insert a short cancellable wave delay (e.g. `150–300ms`) between consecutive `triggerBrowserZipDownload` calls when `parts.length > 1`.
- **Required Test:** Flip P9-C `P9C-E` verifying delay hook on `parts.length > 1`.
- **Manual Browser Check Required:** Yes (verify Chrome does not silently block part 2+).

---

### `P10-G017` — Staging GC Full/Split Policy Asymmetry & Edge-Only Coverage Readiness Gate
- **Category:** Staging Lifecycle & Coverage Semantics
- **Severity / Confidence:** `P2` | `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:**
  - `textAudioStagingGcService.js` (observed in Stage 2): upon segment text edits, `Full` Staging blobs whose fingerprint no longer matches current block `fullArtifactFingerprint` become unreferenced and are purged immediately by GC, whereas `Split` blobs remain preserved behind `STALE` / `OTHER_VOICE` variant entries until explicit cleanup.
  - [textStructuredAudioCoverageDomain.js:23-26](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioCoverageDomain.js#L23-L26): `variantsForSlot` requires `source === 'generated'` and `engine === 'edge'`, excluding imported Folder/ZIP or non-Edge audio variants from slot coverage diagnostics.
- **Bounded Fix Direction:** Document the intended Split-vs-Full GC retention contract explicitly for Round D (avoid silent surprise deletion of user-generated Full audio on minor typos OR align Split GC cleanly), and confirm whether external/non-Edge variants should surface separately in coverage UI.
- **Required Test:** Unit test clarifying `textAudioStagingGcService.js` retention matrix across `STALE` Split vs `Full`.
- **Manual Browser Check Required:** No.

---

### `P10-G018` — Partial `hf6` Indonesian Default Voice Split (`Gadis` vs `Tuti`)
- **Category:** Default Preference Consistency
- **Severity / Confidence:** `P2` | `Confirmed Code` (triggered by Stage 3 Triage of `fdcf3aa`)
- **Affected Modes:** Structured Text Bulk/Download Profiles vs Global Edge (`Table` intentionally separate)
- **Primary Evidence:**
  - Commit `fdcf3aa` changed `edgeMeaningVoiceId` to `'id-ID-GadisNeural'` at [textStructuredAudioGenerationDomain.js:16](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L16).
  - Remaining Text sites still default to `'su-ID-TutiNeural'`: `bulkMeaningVoiceIds` (`L24`), `bulkExportMeaningVoiceId` (`L32`), [textStructuredAudioDownloadProfileDomain.js:165](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioDownloadProfileDomain.js#L165), plus [useMainAppPrimaryState.js:152](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/hooks/useMainAppPrimaryState.js#L152) (`edgeIndonesianVoice` for Table/Legacy).
- **Bounded Fix Direction:** Explicitly ratify per-scope defaults prior to Round D Reset-to-Defaults implementation (especially whether Text Bulk & Download Profile ID defaults align to `Gadis` or remain intentionally distinct from `edgeMeaningVoiceId`, while keeping `Table` isolated).
- **Required Test:** Align `audit-v603-beta8-p7-hf2-global-player-defaults.mjs` + Round D reset default contract test.
- **Manual Browser Check Required:** No.

---

### `P10-G019` — App Unmount Cleanup Omits Table/Legacy Runtime ObjectURL Maps
- **Category:** Memory Hygiene on Remount/HMR
- **Severity / Confidence:** `P3` | `Confirmed Code`
- **Affected Modes:** `Table`, `Legacy Text`
- **Primary Evidence:** [App.jsx:372-382](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L372-L382) cleanup effect revokes `structuredTextAudioRuntimeUrlsRef`, `structuredTextFullAudioRuntimeUrlsRef`, and Structured Text/Staging caches on unmount, without revoking `localAudioMapTable`, `localAudioMapText`, `tableAudioFolderVariantInventory`, or `tableAudioZipRuntimeCache`.
- **Bounded Fix Direction:** Add non-intrusive unmount revocation via refs if `App` is ever remounted under tests/StrictMode.
- **Required Test:** Code/lifecycle review.
- **Manual Browser Check Required:** No.

---

### `P10-G020` — Orphaned Legacy UI Components (`Sidebar.jsx`, `ControlSectionTabs.jsx`)
- **Category:** Dead Code / Maintenance Surface
- **Severity / Confidence:** `P3` | `Confirmed Code`
- **Affected Modes:** N/A (dead files in `src/`)
- **Primary Evidence:** Repository search (`git grep`) shows [Sidebar.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/Sidebar.jsx) and [ControlSectionTabs.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/controls/ControlSectionTabs.jsx) are never imported by `App.jsx`, `MainAppShellView.jsx`, or active runtime modules (superseded by `SidebarShell`, `SidebarTopControls`, and `MainAppAuxiliaryViews.renderControlSectionTabsView`).
- **Bounded Fix Direction:** Verify no external audit script reads their contents before removing or archiving in a dedicated cleanup commit.
- **Required Test:** `npm run build` + legacy audit check.
- **Manual Browser Check Required:** No.

---

### `P10-G021` — Confirmation & System Storage Parity Gaps (`window.confirm` + Text Staging Controls)
- **Category:** UI/UX Consistency
- **Severity / Confidence:** `P3` | `Confirmed Code`
- **Affected Modes:** Structured Text & Legacy Text Library Management
- **Primary Evidence:** [TextLibraryShell.jsx:612](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/text/TextLibraryShell.jsx#L612) uses synchronous native `window.confirm(...)` to delete an empty Book Collection (whereas Workspace delete at `L596` uses two-step inline confirmation `deleteDocumentArmed`, and Table System dialogs in [DesktopSystemControls.jsx:205-236](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/controls/DesktopSystemControls.jsx#L205-L236) use accessible `SafetyConfirmDialog`). Additionally, System Storage cards in Text mode expose informational `TextSystemStorageCard` summaries without a Text-mode equivalent for clearing runtime ObjectURL RAM or running orphaned-Staging GC from System Settings.
- **Bounded Fix Direction:** Replace `window.confirm` with inline two-step arming or `SafetyConfirmDialog` consistency when UI polish resumes; evaluate exposing a safe Text runtime cache reset / orphan GC trigger under Audio Library / System.
- **Required Test:** UI component test + manual verification.
- **Manual Browser Check Required:** Yes.
