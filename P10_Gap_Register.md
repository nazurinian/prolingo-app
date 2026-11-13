# P10 App-Wide Gap Register (ProLingo v6)

- **Repository / Baseline:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries` @ `212d398d` (H1–H5 committed; uncommitted working tree includes bounded **P10-H6** consolidation & regression hygiene)
- **Audit Scope:** Consolidated internal runtime + code-level gaps across **P9-B Playback**, **P9-C Bulk/Staging/ZIP**, **Legacy Audit Triage**, and **Stage 4 App-Wide Discovery** (`Table`, `Legacy Text`, `Paragraph`, `Conversation`, `Mixed`).
- **Remediation Status (H1–H6):** All **8 / 8 P1** findings (`P10-G001`–`P10-G008`, including H6-D queued ZIP UI-lag hardening) plus **8 / 10 P2** findings (`P10-G009`–`P10-G016`, with `G013` fixed in H6-B) and **1 / 3 P3** findings (`P10-G019`, fixed in H6-C) are **Confirmed Fixed** in code and Node/Vite verification. **`P10-G017`** is verified **Intentional Product Behavior** (read-only), **`P10-G018`** is split (**Fixed** missing-preference Download Profile fallback in `textStructuredAudioDownloadProfileDomain.js:165`; **Intentional Product Behavior** for Single Edge vs Bulk vs Table defaults), and **`P10-G020`–`P10-G021`** remain **Deferred by Design** (alongside Round D Reset-to-Defaults). Note that real Chromium multi-download activation (`P10-G016`), real OS `MediaSession` hardware controls (`P10-G009`), and live browser IndexedDB/Web Speech execution remain **Unverified in Browser** until manual P9-B/C acceptance. See [`P10_H1_H3_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H1_H3_Remediation_Report.md), [`P10_H4_H5_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H4_H5_Remediation_Report.md), and [`P10_H6_Final_Consolidation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H6_Final_Consolidation_Report.md).

---

## Summary by Severity & Confidence

| Severity | Count | Status after H1–H6 | Gap IDs |
|---|---:|---|---|
| **P1 (High / Functional or Data Integrity)** | 8 | **8 / 8 Confirmed Fixed** (H1–H3; H5-C & H6-D ZIP hardening) | `P10-G001` – `P10-G008` |
| **P2 (Medium / Voice, UI Parity, Export, Leak)** | 10 | **8 Confirmed Fixed (`G009`–`G016`), 1 Intentional Product Behavior (`G017`), 1 Fixed Fallback + Intentional Split (`G018`)** | `P10-G009` – `P10-G018` |
| **P3 (Low / Cleanup, UX Consistency)** | 3 | **1 Confirmed Fixed (`G019`), 2 Deferred by Design (`G020`, `G021`)** | `P10-G019` – `P10-G021` |

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
- **Implemented Fix:** Created transactional orchestrator `executeTextStructuredAudioZipImport` in [textStructuredAudioZipImportService.js:192](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L192) (**Phase 1:** decompress & validate all Split/Full blobs before any DB write -> **Phase 2:** snapshot pre-existing Staging records & stage blobs -> **Phase 3:** atomic single-TX `executeTextZipImportMetadataCommit` in [textLibraryCommandService.js:399](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textLibraryCommandService.js#L399) -> compensating rollback via `rollbackTextAudioStagingBatch` + `executeTextAudioImportRollback`). In **Wave H5-C**, hardened two-DB compensating rollback with `zipImportRecovery` (`cleanRollback`, `residualRisk`, separate metadata & staging rollback status), dual-phase independent Staging rollback in [textAudioStagingService.js:66](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L66), `createTextStructuredAudioZipImportCoordinator` serialization/cancellation & `rollbackCompletedTextStructuredAudioZipImport` ([textStructuredAudioZipImportService.js:103,518](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L103)), plus honest partial-rollback logging and mode/doc-switch/unmount cancellation in `handleStructuredTextAddAudioZipFiles` (`App.jsx`). In **Wave H6-D**, hardened queued ZIP imports before React commits `setTextLibrarySnapshot` by reading live `readTextLibrarySnapshot()` inside `coordinator.runExclusive` ([App.jsx:1989](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1989)) and synchronously merging `metadataCommit` into `textLibrarySnapshotRef.current` via pure `mergeTextLibraryZipMetadataCommitIntoSnapshot` ([textStructuredAudioZipImportService.js:74](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L74), [App.jsx:2048-2060](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L2048-L2060)). Note: Text Library IDB and Audio Staging IDB remain separate IndexedDB databases (compensating rollback, not single-TX cross-DB atomicity).
- **Verification & Classification:** **`Confirmed Fixed` (Node; live browser smoke test `Unverified in Browser`)** — verified across `audit-v603-p10-h1-h3-remediation.mjs` (`[H2][P10-G007]` **PASS**), `audit-v603-p10-h5-export-zip-remediation.mjs` (`H5-C` `Scenario-1`..`Scenario-6` + `H6-D` `Scenario-7` **PASS** — `11/11` total), `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-B]` **PASS**), and `audit-v603-beta8-p4-staging-zip.mjs` (`21/21` **PASS**).
- **Manual Browser Check Required:** Yes (import valid, corrupt, and back-to-back queued Portable ZIPs in browser).

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
- **Status:** **Fixed & Verified (Wave H6-B)**
- **Category:** UI Prop Plumbing / Control Parity
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-B `S10-A`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** Previously [MainAppShellView.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/MainAppShellView.jsx) forwarded unused `textTtsOnly` / `onTextTtsOnlyChange` props to [BottomPlayerBar.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/BottomPlayerBar.jsx) (`S10-A` probe).
- **Implemented Fix:** Removed dead `textTtsOnly` and `onTextTtsOnlyChange` prop wiring from `MainAppShellView.jsx` and `App.jsx`, leaving `TextStructuredAudioControls` as the canonical single `LOCAL FIRST` / `TTS ONLY` (`data-text-audio-source-toggle="true"`), `AUTO`, `CUSTOM` owner on both Desktop (`MainAppShellView.jsx`) and Mobile (`MobileTools.jsx`) via `handleStructuredTextGlobalTtsOnlyChange` ([App.jsx:6613,6718](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6613)).
- **Verification & Classification:** **`Confirmed Fixed`** — `audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S10-A FIXED]`, `24/24` **PASS**) confirms dead props are removed, no duplicate toggle was added to `BottomPlayerBar.jsx`, and `TextStructuredAudioControls` works on Desktop & Mobile.
- **Manual Browser Check Required:** Optional visual check on Desktop & Mobile Player Source toggles.

---

### `P10-G014` — Single-Card & Legacy-Batch Exporters Ignore Ready Edge `Full` Artifacts
- **Status:** **Fixed & Verified (Wave H5-A; H6-A Contract Alignment)**
- **Category:** Audio Export Completeness
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-C`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Mixed` `Full` audio)
- **Primary Evidence:** Prior [App.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4839-L4881) card & legacy-batch exporters (`handleStructuredTextExportCardZip`, `handleStructuredTextExportFullCardAudio`, `handleStructuredTextBatchExportReadyMp3`, `handleStructuredTextBatchExportConsolidatedZip`) + P9-C `[DEFECT P9C-C]` only inspected Split variants even when Ready Edge `Full` artifacts existed in Staging.
- **Implemented Fix:** Added `resolveTextStructuredCardReadyFullArtifacts` and `resolveTextStructuredBatchReadyFullArtifacts` in [textStructuredBulkExportDomain.js:257,317](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredBulkExportDomain.js#L257) and extracted `executeStructuredTextCardZipExport`, `executeStructuredTextFullCardAudioExport`, `executeStructuredTextBatchReadyMp3Export`, and `executeStructuredTextBatchConsolidatedZipExport` into [textStructuredCardExportService.js:156-656](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L156), wired from `App.jsx` (`handleStructuredTextExportCardZip`..`handleStructuredTextBatchExportConsolidatedZip`). Packages deduplicated matching Ready Edge Full MP3s (`representation: 'full'`, `fullArtifactFingerprint`, `rf: null` in manifest v2 + `AUDIO_INDEX.csv`), excludes stale/mismatched/metadata-only Full records, avoids regeneration, and prefers Ready Edge Full MP3 over derived WAV fallback.
- **Verification & Classification:** **`Confirmed Fixed`** — `audit-v603-p10-h5-export-zip-remediation.mjs` (`H5-A` `P10-G014-CardZip`, `P10-G014-FullCard`, `P10-G014-Batch`), `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-C]`), and H6-A behavior-verified `audit-v603-dl-b1-download-batch.mjs` (`35 checks`) all **PASS**.
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
- **Status:** **Intentional Product Behavior (Read-Only Verified in Wave H6-C)**
- **Category:** Staging Lifecycle & Coverage Semantics
- **Severity / Confidence:** `P2` | `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence & Verification:**
  - Read-only inspection of [textAudioStagingGcService.js:11-34](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingGcService.js#L11-L34) confirmed `referenced` collects both active Split `rf-sha256-*` fingerprints and content-matching Full `full-sha256-*` fingerprints (`current.contentFingerprint === artifact?.descriptor?.contentFingerprint`); legacy records are preserved, while unreferenced orphans are eligible for GC release. Verified passing by `audit-v603-a4-staging-gc.mjs` (`7 checks`), `audit-v603-beta8-p4-staging-zip.mjs` (`PASS 13–14`), and `audit-v603-p9c-bulk-marathon.mjs` (`C4`, `C7`, `C10`).
  - [textStructuredAudioCoverageDomain.js:23-26](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioCoverageDomain.js#L23-L26) deliberately gates `variantsForSlot` to `source === 'generated'` and `engine === 'edge'` for Edge download coverage.
- **Classification:** **`Intentional Product Behavior`** (no production code changes).
- **Manual Browser Check Required:** No.

---

### `P10-G018` — Partial `hf6` Indonesian Default Voice Split (`Gadis` vs `Tuti`)
- **Status:** **Fixed Missing-Preference Download Profile Fallback (Wave H6-C) | Intentional Product Behavior (Per-Scope Defaults)**
- **Category:** Default Preference Consistency
- **Severity / Confidence:** `P2` | `Confirmed Code` (triggered by Stage 3 Triage of `fdcf3aa`)
- **Affected Modes:** Structured Text Download Profile vs Bulk Generation vs Global Edge (`Table` intentionally separate)
- **Primary Evidence:**
  - `TEXT_STRUCTURED_GENERATION_DEFAULTS` sets `edgeTextVoiceId: 'en-GB-SoniaNeural'` and `edgeMeaningVoiceId: 'id-ID-GadisNeural'` ([textStructuredAudioGenerationDomain.js:15-16](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L15-L16)) while intentionally keeping `bulkTextVoiceIds: ['en-GB-LibbyNeural']` and `bulkMeaningVoiceIds: ['su-ID-TutiNeural']` (`L23-24`), and Table/Legacy `edgeIndonesianVoice` remains `'su-ID-TutiNeural'` ([useMainAppPrimaryState.js:152](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/hooks/useMainAppPrimaryState.js#L152)).
  - However, `resolveTextStructuredEffectiveDownloadVoice` ([textStructuredAudioDownloadProfileDomain.js:165](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioDownloadProfileDomain.js#L165)) still fell back to `'su-ID-TutiNeural'` when `preferences?.edgeMeaningVoiceId` was absent.
- **Implemented Fix & Verification:** Updated the missing-preference Meaning fallback at `textStructuredAudioDownloadProfileDomain.js:165` to `'id-ID-GadisNeural'` while preserving `Libby`/`Tuti` Bulk defaults and Table defaults. Verified by `[H6-C][CONTRACT] [P10-G018]` in `audit-v603-p9c-bulk-marathon.mjs` (`17/17 PASS`). Note historical `audit-v603-beta8-p7-hf2-global-player-defaults.mjs:152` remains a pre-existing baseline mismatch predating HF5 (`fdcf3aa`).
- **Manual Browser Check Required:** No.

---

### `P10-G019` — App Unmount Cleanup Omits Table/Legacy Runtime ObjectURL Maps
- **Status:** **Fixed & Verified (Wave H6-C)**
- **Category:** Memory Hygiene on Remount/HMR
- **Severity / Confidence:** `P3` | `Confirmed Code`
- **Affected Modes:** `Table`, `Legacy Text`
- **Primary Evidence:** Previously [App.jsx:398-408](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L398-L408) only cleaned Structured Text ObjectURLs on unmount (alongside `silentWavUrlRef` cleanup in `audioRuntimeLifecycleService.js:21`) without revoking `localAudioMapTable`, `localAudioMapText`, `clearTableAudioFolderRuntimeCache()`, `clearTableAudioZipRuntimeCache()`, or `clearAudioStagingRuntimeCacheForMode('table')`.
- **Implemented Fix & Verification:** Added `localAudioMapTableRef` alongside `localAudioMapTextRef` and an App root unmount cleanup effect ([App.jsx:6180-6198](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6180-L6198)) revoking all `localAudioMapTableRef.current` / `localAudioMapTextRef.current` blob URLs and calling `clearTableAudioFolderRuntimeCache()`, `clearTableAudioZipRuntimeCache()`, and `clearAudioStagingRuntimeCacheForMode('table')`. Verified via `npm run build`, `audit-v603-round-a-d1-d4.mjs` (`7/7`), `audit-v603-round-b-d2-d3.mjs` (`6/6`), `audit-v603-round-c-taxonomy.mjs` (`10/10`), and `audit-v603-round-c1-legacy-empty-audio.mjs` (`4/4`).
- **Manual Browser Check Required:** Optional.

---

### `P10-G020` — Orphaned Legacy UI Components (`Sidebar.jsx`, `ControlSectionTabs.jsx`)
- **Status:** **Deferred by Design (Outside H1–H6 Scope)**
- **Category:** Dead Code / Maintenance Surface
- **Severity / Confidence:** `P3` | `Confirmed Code`
- **Affected Modes:** N/A (dead files in `src/`)
- **Primary Evidence:** Repository search (`git grep`) shows [Sidebar.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/Sidebar.jsx) and [ControlSectionTabs.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/controls/ControlSectionTabs.jsx) are never imported by `App.jsx`, `MainAppShellView.jsx`, or active runtime modules (superseded by `SidebarShell`, `SidebarTopControls`, and `MainAppAuxiliaryViews.renderControlSectionTabsView`).
- **Bounded Fix Direction:** Verify no external audit script reads their contents before removing or archiving in a dedicated cleanup commit.
- **Required Test:** `npm run build` + legacy audit check.
- **Manual Browser Check Required:** No.

---

### `P10-G021` — Confirmation & System Storage Parity Gaps (`window.confirm` + Text Staging Controls)
- **Status:** **Deferred by Design (Outside H1–H6 Scope)**
- **Category:** UI/UX Consistency
- **Severity / Confidence:** `P3` | `Confirmed Code`
- **Affected Modes:** Structured Text & Legacy Text Library Management
- **Primary Evidence:** [TextLibraryShell.jsx:612](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/text/TextLibraryShell.jsx#L612) uses synchronous native `window.confirm(...)` to delete an empty Book Collection (whereas Workspace delete at `L596` uses two-step inline confirmation `deleteDocumentArmed`, and Table System dialogs in [DesktopSystemControls.jsx:205-236](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/controls/DesktopSystemControls.jsx#L205-L236) use accessible `SafetyConfirmDialog`). Additionally, System Storage cards in Text mode expose informational `TextSystemStorageCard` summaries without a Text-mode equivalent for clearing runtime ObjectURL RAM or running orphaned-Staging GC from System Settings.
- **Bounded Fix Direction:** Replace `window.confirm` with inline two-step arming or `SafetyConfirmDialog` consistency when UI polish resumes; evaluate exposing a safe Text runtime cache reset / orphan GC trigger under Audio Library / System.
- **Required Test:** UI component test + manual verification.
- **Manual Browser Check Required:** Yes.

---

## Final Release-Readiness Classification Matrix (Post-H6)

- **Confirmed Fixed (17 gap items):** `P10-G001`–`P10-G016` (with `G013` fixed in H6-B, `G007` queued UI-lag hardened in H6-D), `P10-G018` (missing-preference Download Profile fallback fixed in H6-C), and `P10-G019` (fixed in H6-C).
- **Intentional Product Behavior:** `P10-G017` (Staging GC Split/Full retention & Edge-only readiness gate) and the intentional per-scope voice split in `P10-G018` (`Sonia`/`Gadis` Single Edge vs `Libby`/`Tuti` Bulk vs `su-ID-TutiNeural` Table).
- **Deferred by Design:** `P10-G020`, `P10-G021`, and **Round D** (`Reset to Defaults`).
- **Unverified in Browser:** Live Chromium playback, Web Speech API (`getVoices()`), OS `MediaSession` UI (`P10-G009`), multi-part ZIP browser download bar (`P10-G016`), real IndexedDB & File System Access folder flows (`P10-G006`, `P10-G007`), and interactive UI smoke checks (`P10-G001`–`P10-G005`, `P10-G008`, `P10-G010`–`P10-G014`).
- **Remaining Release Blockers:** **0 known code-level P1/P2 blockers** in Node/Vite automated verification; release sign-off remains gated on manual P9-B/C Chromium acceptance testing.
