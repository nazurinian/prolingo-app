# P10 App-Wide Gap Register (ProLingo v6)

- **Repository / Baseline:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries` @ `d200fb38` (H1–H3 committed; uncommitted working tree includes bounded P10 H4–H5 remediation)
- **Audit Scope:** Consolidated internal runtime + code-level gaps across **P9-B Playback**, **P9-C Bulk/Staging/ZIP**, **Legacy Audit Triage**, and **Stage 4 App-Wide Discovery** (`Table`, `Legacy Text`, `Paragraph`, `Conversation`, `Mixed`).
- **Remediation Status (H1–H5):** All **8 / 8 P1** findings (`P10-G001`–`P10-G008`) plus **7 / 10 P2** findings (`P10-G009`–`P10-G012` in Wave H4; `P10-G014`, `P10-G016` in Wave H5; bonus `P10-G015` in Wave H2) are **Fixed & Verified in Node/Vite/ESLint**. Note that real Chromium multi-download permission/activation heuristics (`P10-G016`), real OS `MediaSession` UI (`P10-G009`), and live browser playback/IndexedDB checks remain **`UNVERIFIED`** until manual browser acceptance. Remaining **Open / Deferred** items: **3 P2** (`P10-G013` / `S10-A`, `P10-G017`, `P10-G018`) and **3 P3** (`P10-G019`–`P10-G021`). See [`P10_H1_H3_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H1_H3_Remediation_Report.md) and [`P10_H4_H5_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H4_H5_Remediation_Report.md).

---

## Summary by Severity & Confidence

| Severity | Count | Status after H1–H5 | Gap IDs |
|---|---:|---|---|
| **P1 (High / Functional or Data Integrity)** | 8 | **8 / 8 Fixed & Verified (H1–H3; H5-C rollback follow-up)** | `P10-G001` – `P10-G008` |
| **P2 (Medium / Voice, UI Parity, Export, Leak)** | 10 | **7 Fixed & Verified in Node (`G009`–`G012`, `G014`, `G015`, `G016`), 3 Open/Deferred (`G013`, `G017`, `G018`)** | `P10-G009` – `P10-G018` |
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
- **Verification & Classification:** **`FIXED`** — both `audit-v603-p10-h1-h3-remediation.mjs` (`[H3][P10-G003]`) and the H5-D updated contract in `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S6-B]`) **PASS** (`nav` delegates to `resolveStructuredTextSmartNavigationContext` without `session` setting inheritance).
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
- **Implemented Fix:** Created transactional orchestrator `executeTextStructuredAudioZipImport` in [textStructuredAudioZipImportService.js:166](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L166) (**Phase 1:** decompress & validate all Split/Full blobs before any DB write -> **Phase 2:** snapshot pre-existing Staging records & stage blobs -> **Phase 3:** atomic single-TX `executeTextZipImportMetadataCommit` in [textLibraryCommandService.js:399](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textLibraryCommandService.js#L399) -> compensating rollback via `rollbackTextAudioStagingBatch` + `executeTextAudioImportRollback`). In **Wave H5-C**, hardened two-DB compensating rollback with `zipImportRecovery` (`cleanRollback`, `residualRisk`, separate metadata & staging rollback status), dual-phase independent Staging rollback in [textAudioStagingService.js:66](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L66), `createTextStructuredAudioZipImportCoordinator` serialization/cancellation & `rollbackCompletedTextStructuredAudioZipImport` ([textStructuredAudioZipImportService.js:77,492](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L77)), plus honest partial-rollback logging and mode/doc-switch/unmount cancellation in `handleStructuredTextAddAudioZipFiles` ([App.jsx:331,874,1973,3869](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1973)). Note: Text Library IDB and Audio Staging IDB remain separate IndexedDB databases (compensating rollback, not single-TX cross-DB atomicity).
- **Verification & Classification:** **`FIXED`** — verified across `audit-v603-p10-h1-h3-remediation.mjs` (`[H2][P10-G007]` **PASS**), `audit-v603-p10-h5-export-zip-remediation.mjs` (`H5-C` `Scenario-1`..`Scenario-6` **PASS** covering metadata rollback failure, staging rollback failure, overlapping imports, mid-import workspace switch, post-commit abort, and idempotent retry), plus the H5-D updated contracts in `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-B]` **PASS**) and `audit-v603-beta8-p4-staging-zip.mjs` (`21/21` **PASS**).
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
- **Status:** **Fixed & Verified in Node (Wave H4; real OS MediaSession hardware UI pending manual browser check)**
- **Category:** Hardware / OS Media Controls Parity
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S1-B`)
- **Affected Modes:** Structured Text `Full` mode (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S1-B]`): because `Full` mode intentionally sets `playingIndex = null` at segment level while tracking card state separately, `MediaSession` metadata effect stays `null`.
- **Implemented Fix:** Updated `executeMediaSessionLifecycleService` in [mediaSessionLifecycleService.js:6-95](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/mediaSessionLifecycleService.js#L6-L95) to resolve active Structured Text Full card metadata from `sessionContext.cursorSegmentId` / `currentIndex` / `sessionContext.blockId` even when `playingIndex === null` (across playing and paused states), clear stale metadata on Stop/workspace switch, and reflect active Full representation metadata cleanly (`App.jsx:5149`).
- **Verification & Classification:** **`FIXED` (Node)** — `audit-v603-p10-h4-playback-remediation.mjs` (`[H4-A][G009-1]`, `[H4-A][G009-2]`) and `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S1-B]`) **PASS**.
- **Manual Browser Check Required:** Yes (**`UNVERIFIED`** for live desktop/Android lock-screen media controls during active Full playback and pause/stop transitions).

---

### `P10-G010` — Full Block Channel Planner Ignores `CUSTOM_LOCAL` Pin Mode
- **Status:** **Fixed & Verified (Wave H4)**
- **Category:** Ordered Multi-Audio / Playback Profile Routing
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S2-A`)
- **Affected Modes:** Structured Text `Full` mode (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S2-A]`): `resolveStructuredTextBlockChannelPlaybackPlan` in `src/App.jsx` omitted `CUSTOM_LOCAL` / `localAudioPlaybackProfileV1` handling.
- **Implemented Fix:** Exported `resolveTextStructuredEffectiveCustomLocalVoice` in [textStructuredLocalAudioProfileDomain.js:63](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredLocalAudioProfileDomain.js#L63) (honoring Card > Document Speaker hierarchy and Conversation Speaker-1 sync), enforced pinned `CUSTOM_LOCAL` voice readiness in [textStructuredRuntimePlaybackPlanDomain.js:226](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L226) (fail-closed without falling back to AUTO priority), and wired `resolveStructuredTextBlockChannelPlaybackPlan` in [App.jsx:3277](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3277).
- **Verification & Classification:** **`FIXED`** — `audit-v603-p10-h4-playback-remediation.mjs` (`[H4-B][G010-1]`, `[H4-B][G010-2]`) and `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S2-A]`) **PASS**.
- **Manual Browser Check Required:** Optional (smoke verify `CUSTOM_LOCAL` pin on Full card in browser).

---

### `P10-G011` — Browser TTS Fallback Skips `card-speaker` & `document-speaker` When Segment Voice Unavailable
- **Status:** **Fixed & Verified (Wave H4)**
- **Category:** Voice Inheritance / Fallback Chain
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S4-A`)
- **Affected Modes:** Structured Text (`Conversation`, `Mixed`, `Paragraph` with speaker profiles)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S4-A]`): when a Segment override named an unavailable voice, `resolveTextStructuredBrowserVoiceResolution` returned `'DocVoice (document)'` instead of walking down through `'CardAliceVoice'` / `'SpeakerAliceVoice'`.
- **Implemented Fix:** Updated `resolveTextStructuredBrowserVoiceResolution` in [textStructuredVoiceAssignmentDomain.js:291-448](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredVoiceAssignmentDomain.js#L291-L448) to walk the full candidate hierarchy (`Segment > Card Speaker > Doc Speaker > Card > Doc > Global`) including legacy `speakerVoiceMap` fallback and Full segment-override suppression, and wired `resolveStructuredTextChannelVoiceState` in [App.jsx:907](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L907).
- **Verification & Classification:** **`FIXED`** — `audit-v603-p10-h4-playback-remediation.mjs` (`[H4-C][G011-1]`, `[H4-C][G011-2]`) and `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S4-A]`) **PASS**.
- **Manual Browser Check Required:** Optional (smoke verify with multi-speaker Conversation card).

---

### `P10-G012` — `structuredTextPlaybackSourceStatus` Leaks Across Workspaces & Stop Transitions
- **Status:** **Fixed & Verified (Wave H4)**
- **Category:** UI Status / State Hygiene
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S8-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S8-A]`): `structuredTextPlaybackSourceStatus` previously had no `documentId` scope and was not reset on Stop or workspace switch.
- **Implemented Fix:** Added pure `resolveScopedStructuredTextPlaybackSourceStatus` in [textStructuredPlaybackDomain.js:183-197](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js#L183-L197) enforcing `mode`, `activeEditorModel`, `documentId`, and `sessionId` scoping, cleared `structuredTextPlaybackSourceStatus` across Stop, Doc switch, Mode switch, and Restart in [App.jsx:869,1331,1691,3650,3868](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L869), and rendered `scopedStructuredTextPlaybackSourceStatus` at [App.jsx:6565](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6565).
- **Verification & Classification:** **`FIXED`** — `audit-v603-p10-h4-playback-remediation.mjs` (`[H4-D][G012-1]`, `[H4-D][G012-2]`) and `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S8-A]`) **PASS**.
- **Manual Browser Check Required:** Yes (visual check on Bottom/Player badge during Stop and workspace switch).

---

### `P10-G013` — `BottomPlayerBar` Receives `textTtsOnly` / `onTextTtsOnlyChange` Without Rendering Toggle
- **Status:** **Open / Deferred (Out of H1–H5 Scope)**
- **Category:** UI Prop Plumbing / Control Parity
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S10-A`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S10-A]`), [MainAppShellView.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/MainAppShellView.jsx), and [BottomPlayerBar.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/BottomPlayerBar.jsx): `BottomPlayerBar` accepts `textTtsOnly` / `onTextTtsOnlyChange` props but neither renders nor invokes them.
- **Bounded Fix Direction:** Decide explicitly: either wire a compact TTS-Only toggle/badge into `BottomPlayerBar` (matching Player header expectation) OR remove dead props if Sidebar `TextStructuredAudioControls` (`L294`) is the intended single control.
- **Required Test:** Align P9-B `S10-A` with approved UI contract.
- **Manual Browser Check Required:** Yes.

---

### `P10-G014` — Single-Card & Legacy-Batch Exporters Ignore Ready Edge `Full` Artifacts
- **Status:** **Fixed & Verified (Wave H5-A)**
- **Category:** Audio Export Completeness
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-C`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Mixed` `Full` audio)
- **Primary Evidence:** Prior [App.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4839-L4881) card & legacy-batch exporters (`handleStructuredTextExportCardZip`, `handleStructuredTextExportFullCardAudio`, `handleStructuredTextBatchExportReadyMp3`, `handleStructuredTextBatchExportConsolidatedZip`) + P9-C `[DEFECT P9C-C]` only inspected Split variants even when Ready Edge `Full` artifacts existed in Staging.
- **Implemented Fix:** Added `resolveTextStructuredCardReadyFullArtifacts` and `resolveTextStructuredBatchReadyFullArtifacts` in [textStructuredBulkExportDomain.js:257,317](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredBulkExportDomain.js#L257) and extracted `executeStructuredTextCardZipExport`, `executeStructuredTextFullCardAudioExport`, `executeStructuredTextBatchReadyMp3Export`, and `executeStructuredTextBatchConsolidatedZipExport` into [textStructuredCardExportService.js:156-656](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L156), wired from [App.jsx:4839-4881](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4839-L4881). Packages deduplicated matching Ready Edge Full MP3s (`representation: 'full'`, `fullArtifactFingerprint`, `rf: null` in manifest v2 + `AUDIO_INDEX.csv`), excludes stale/mismatched/metadata-only Full records, avoids regeneration, and prefers Ready Edge Full MP3 over derived WAV fallback.
- **Verification & Classification:** **`FIXED`** — `audit-v603-p10-h5-export-zip-remediation.mjs` (`H5-A` `P10-G014-CardZip`, `P10-G014-FullCard`, `P10-G014-Batch`) and `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-C]`) **PASS**. Note historical inline regex `audit-v603-dl-b1-download-batch.mjs:61` still probes old inline `physicalByRf` inside `App.jsx` after service extraction.
- **Manual Browser Check Required:** Yes (export a Card ZIP & Full Card MP3 after generating `Full` audio in browser and inspect downloaded archive/audio).

---

### `P10-G015` — Portable ZIP Split Import Overwrites Runtime ObjectURLs Without Revocation
- **Status:** **Fixed & Verified (Bonus in Wave H2)**
- **Category:** Memory / Blob URL Leak
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-D`) & `Confirmed Code`
- **Affected Modes:** Structured Text Portable ZIP Import
- **Primary Evidence:** `handleStructuredTextAddAudioZipFiles` previously overwrote runtime ObjectURL entries without revoking superseded `blob:` URLs.
- **Implemented Fix:** Added stale Split and Full `URL.revokeObjectURL` cleanup during runtime state updates in `handleStructuredTextAddAudioZipFiles` ([App.jsx:1973-2090](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1973)) alongside `reconcileTextAudioStagingRuntimeBindings` ([textAudioStagingService.js:298](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L298)).
- **Verification & Classification:** **`FIXED`** — `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-D]`) **PASSES**.
- **Manual Browser Check Required:** No.

---

### `P10-G016` — Multi-Part Bulk Export ZIP Loop Triggers Back-to-Back Downloads Without Wave Pause
- **Status:** **Fixed in Code & Verified in Node (Wave H5-B; Chromium Multi-Download Permission/Activation Behavior `UNVERIFIED`)**
- **Category:** Browser Download Throttling Risk
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-E`)
- **Affected Modes:** Structured Text Bulk Export (`AUDIO_ONLY_ZIP`, `PORTABLE_ZIP`) and Batch Consolidated ZIP (when multi-part)
- **Primary Evidence:** `scripts/audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-E]`): multi-part ZIP export loop previously dispatched consecutive `triggerBrowserZipDownload` calls with zero inter-part yield.
- **Implemented Fix:** Added `TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS = 350` pacing strictly between consecutive ZIP parts (`chunkIndex > 0` / `triggeredZipCount > 0`) with zero delay for single-part ZIPs in [App.jsx:4945](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4945) (`handleStructuredTextBulkExport`) and [textStructuredCardExportService.js:28,584](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L28) (`executeStructuredTextBatchConsolidatedZipExport`).
- **Verification & Classification:** **`FIXED` (Node deterministic timer/chunk order verified; Chromium browser behavior `UNVERIFIED`)** — `audit-v603-p10-h5-export-zip-remediation.mjs` (`H5-B` `P10-G016`) and `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-E]`) **PASS**.
- **Manual Browser Check Required:** Yes (**`UNVERIFIED`** in headless Node — verify live Chromium multi-download permission bar & sequential `PART_01..PART_0N` file saves without user-activation expiry).

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
