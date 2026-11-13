# ProLingo v6 — P10 High-Priority Remediation Report (Waves H1–H3)

- **Repository / Branch:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries`
- **Baseline Commit (`HEAD`):** `fe0f4de085fb67deb2bca4b1ec1967e335624cd0`
- **Scope Executed:** Bounded P1 remediation Waves **H1–H3** (`P10-G001`–`P10-G008`), plus bonus `P10-G015` runtime ObjectURL revocation cleanly addressed inside Wave H2's ZIP import refactor.
- **Explicit Exclusions Preserved:** Table business logic, CSV/Deck data, Text Library IndexedDB schema (`v1`), speaker identities (`speakerRegistryV1` / `speakerIdentityV1`), Split RF & Full artifact fingerprints, Edge-only Structured Text generation, `feature/ai-voice`, Round D reset-to-defaults, and deferred P2/P3 items (`P10-G009`–`P10-G014`, `P10-G016`–`P10-G021`). Working tree remains uncommitted/unpushed with zero resets or stashes.

---

## 1. Executive Outcome

| Wave | Gap IDs | Fix Summary | Dedicated H1–H3 Gate | Legacy P9-B / P9-C Marathon Probes |
|---|---|---|---|---|
| **H1** | `P10-G001`, `P10-G005`, `P10-G008` | Loop fast-settle backoff, Browser TTS native OS fallback, mode-isolated Staging RAM clear | **3 / 3 PASS** | `S6-A` PASS, `S9-A` PASS (`G008` covered in H1-H3 suite) |
| **H2** | `P10-G006`, `P10-G007` (+ bonus `P10-G015`) | Async-guarded Staging runtime binding reconciliation on DB restore/Pack Sync; atomic extract -> stage -> single-TX commit Portable ZIP import with rollback & URL revocation | **2 / 2 PASS** | `P9C-A` PASS, `P9C-D` PASS; `P9C-B` & `beta8-p4:212` classified `INVALID TEST` (pre-extraction `App.jsx` regexes) |
| **H3** | `P10-G002`, `P10-G003`, `P10-G004` | `FROM_HERE` mid-card Full slice isolation, global vs manual Smart Nav session isolation, Shuffle->Sequential override clearing | **3 / 3 PASS** | `S1-A` PASS, `S7-A` PASS; `S6-B` classified `INVALID TEST` (pre-extraction `App.jsx` inline regex) |

**Automated H1–H3 Suite Result (`node scripts/audit-v603-p10-h1-h3-remediation.mjs`):** **8 PASS, 0 FAIL (`exit 0`)**.

---

## 2. Implemented Changes by Wave

### Wave H1 — Playback Loop Safety, Native Browser TTS Fallback & Mode-Isolated Staging RAM Clear
- **`P10-G001` (Loop fast-settle throttle):**
  - Updated [textStructuredPlaybackSessionService.js:17-21,257,342,376](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L17-L21) with `FAST_SETTLE_STEP_THRESHOLD_MS = 15`, `FAST_STEP_YIELD_MS = 16`, `FAST_SETTLE_PASS_THRESHOLD_MS = 60`, `FAST_PASS_BACKOFF_STEP_MS = 40`, `FAST_PASS_MAX_YIELD_MS = 250`. Instantaneous loop iterations yield progressively via `waitPlaybackFeelDelay` (respecting immediate Stop/Cancel), while normal `>= 60ms` passes incur `0ms` overhead.
- **`P10-G005` (Native Browser TTS fallback & guard):**
  - Exported `isBrowserTtsSpeechSupported` in [audioPlaybackSideEffectService.js:1,25](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/audioPlaybackSideEffectService.js#L1).
  - Extracted shared `speakStructuredTextBrowserTts` in [App.jsx:3209,3350,3502,4604](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3209) so Channel, Full-step, and Preview TTS delegate with `overrideVoice = null` (OS default voice) when `isBrowserTtsSpeechSupported` is true and no named voice matches.
- **`P10-G008` (Table/Text runtime ObjectURL isolation):**
  - Updated `clearTableGeneratedAudioRam` in [App.jsx:6201](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6201) to call `clearAudioStagingRuntimeCacheForMode('table')` instead of global `clearAudioStagingRuntimeCache()`.
  - Updated `clearAudioStagingForMode` in [audioStagingIndexedDbService.js:353-367](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L353-L367) to call `clearAudioStagingRuntimeCacheForIds(ids)` and `clearAudioStagingRuntimeCacheForMode(mode)`, keeping Text runtime ObjectURLs untouched by Table clears.

### Wave H2 — Staging Runtime Reconciliation, Transactional Portable ZIP Import & ObjectURL Hygiene
- **`P10-G006` (Restore / Pack Sync runtime binding reconciliation):**
  - Added pure `reconcileTextAudioStagingRuntimeBindings` in [textAudioStagingService.js:281](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L281), handling Split RF and Full artifact bindings, logical ID collisions (revoking superseded blob URLs safely), and incremental preservation when `resetExisting` is `false`.
  - Replaced `structuredTextAudioStagingHydratedRef` latching in [App.jsx:299,625-667](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L625-L667) with async-token-guarded `rehydrateStructuredTextAudioStagingRuntime`, wired into `handleTextDatabaseBackupRestore` (`resetExisting: true` at `L4026`), `handleTextPackAttachOrSync` (`L3918`), `handleTextPackImportCopy` (`L3929`), `handleTextExternalInitialImport` (`L3941`), `handleTextExternalImportDecision` (`L3960`), and `handleTextSourceDetach` (`L3979`).
- **`P10-G007` + Bonus `P10-G015` (Atomic two-DB Portable ZIP import & URL revocation):**
  - Added Staging snapshot/rollback helpers `getAudioStagingSnapshotBySpec`, `deleteAudioStagingRecordsByIds`, and `restoreAudioStagingSnapshotRecords` in [audioStagingIndexedDbService.js:201-249](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L201-L249) and `getTextAudioStagingSnapshot`, `getTextFullAudioStagingSnapshot`, `rollbackTextAudioStagingBatch` in [textAudioStagingService.js:62-75](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L62-L75).
  - Added single-transaction `executeTextZipImportMetadataCommit` (`L399`) and compensating `executeTextAudioImportRollback` (`L498`) sharing `prepareAudioVariantBulkWrites` (`L182`) and `prepareFullAudioArtifactBulkWrites` (`L256`) in [textLibraryCommandService.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textLibraryCommandService.js).
  - Created [textStructuredAudioZipImportService.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js) executing **Phase 1** (decompress & validate all Split/Full blobs before any DB mutation) -> **Phase 2** (snapshot pre-existing Staging records & write blobs) -> **Phase 3** (atomic single-TX Text Library commit), with full compensating rollback preserving pre-existing Staging blobs on any error or `AbortSignal`.
  - Updated `handleStructuredTextAddAudioZipFiles` in [App.jsx:1923-2035](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1923-L2035) to delegate to `executeTextStructuredAudioZipImport` and revoke superseded Split and Full ObjectURLs (`L2004, L2031`), resolving `P10-G015` / `P9C-D`.

### Wave H3 — Mid-Card `FROM_HERE` Slicing, Smart Nav Isolation & Shuffle->Sequential Order Hygiene
- **`P10-G002` (`FROM_HERE` mid-card Full slice):**
  - Added `resolveScopedSegments` and `segmentIds` support to `buildTextStructuredSplitRuntimePlan` and `buildTextStructuredBlockRuntimePlaybackPlan` in [textStructuredRuntimePlaybackPlanDomain.js:30-43,125,246-254](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L30-L43). When `segmentIds` restricts a card to a strict subset, whole-card `FULL_LOCAL` is disabled and `fullRepresentation` + `splitFallback` use only the remaining segments while preserving full block metadata (`playbackOrder`, `ttsOnly`).
  - Updated `executeStructuredTextPlaybackSessionService` in [textStructuredPlaybackSessionService.js:206-233](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L206-L233) to pass sliced `planBlock`, `fullBlock`, `segmentIds`, and filter steps when `!group.wholeBlock`, keeping `Card 2+` `FULL_LOCAL` intact; wired `fullBlock`/`segmentIds` in `resolveStructuredTextBlockChannelPlaybackPlan` ([App.jsx:3178](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3178)).
- **`P10-G003` & `P10-G004` (Global Prev/Next session isolation + Shuffle->Sequential hygiene):**
  - Added `resolveStructuredTextSmartNavigationContext` (`L170`) and `resolveStructuredTextSmartNavPlan` (`L252`) in [textStructuredPlaybackDomain.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js): global Prev/Next reads representation, order, channel, and repeat settings strictly from current global `preferences` (`repeatCount: null`), never from temporary Manual `SEGMENT`/`CARD` sessions or stale stopped sessions, and reuses frozen `orderedList` snapshots ONLY when `playbackOrderMode === 'shuffle'`.
  - Gated `overrideValid` & `onPlaybackCursor`'s `orderedList` strictly on `playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE` in [textStructuredPlaybackSessionService.js:141-158,202,329](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L141-L158).
  - Updated `handleStructuredTextPlaybackFeelChange` ([App.jsx:1273](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1273)), `startStructuredTextPlayback` (`L3531-L3586`), `handlePlayerGlobalPlay` (`L3660-L3672`), and `handlePlayerSmartNav` (`L3676-L3720`) to clear/ignore stale Shuffle snapshots outside Shuffle mode and preserve frozen document Shuffle across temporary manual card/segment plays.

---

## 3. Full Verification Results (Executed After Final Edit)

### A. Build & Lint
- **`npm run build` (`vite build`):** **PASS (`exit 0`)** — `1887 modules transformed`, built in `7.67s`.
- **Changed non-`App.jsx` files + new H1–H3 test script (`npx eslint ...` across 9 files):** **PASS (`exit 0`, 0 errors / 0 warnings)**.
  - Checked files: `src/domain/text/textStructuredPlaybackDomain.js`, `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`, `src/services/playback/textStructuredPlaybackSessionService.js`, `src/services/audio/audioPlaybackSideEffectService.js`, `src/services/persistence/audioStagingIndexedDbService.js`, `src/services/persistence/textAudioStagingService.js`, `src/services/persistence/textLibraryCommandService.js`, `src/services/audio/textStructuredAudioZipImportService.js`, `scripts/audit-v603-p10-h1-h3-remediation.mjs`.
- **`npx eslint --format json src/App.jsx`:** `172` pre-existing problems (`112 errors, 60 warnings`, down from `173` baseline after removing unused `exportTextAudioStagingZipChunks`); **`0` errors and `0` warnings on any line added or modified relative to `fe0f4de`**.
- **`git diff --check`:** **PASS (`exit 0`)**.

### B. Automated Audit Suites (All 33 Scripts in `scripts/*.mjs`)
- **P10 H1–H3 Suite ([`audit-v603-p10-h1-h3-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h1-h3-remediation.mjs)):** **8 PASS, 0 FAIL (`exit 0`)** (`P10-G001`–`P10-G008`).
- **P9-B Marathon ([`audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs)):** **18 PASS, 6 FAIL (`exit 1`)** *(baseline was 14 PASS, 10 FAIL)*:
  - **Now PASS (`4` P1 probes):** `[DEFECT S1-A]` (`P10-G002`), `[DEFECT S6-A]` (`P10-G001`), `[DEFECT S7-A]` (`P10-G004`), `[DEFECT S9-A]` (`P10-G005`).
  - **`INVALID TEST` (archived pre-fix structural regex, `1` fail):** `[DEFECT S6-B]` (`P10-G003`) fails hardcoded `navFn` regex `/session\?\.scope\s*===\s*TEXT_STRUCTURED_PLAYBACK_SCOPES\.(DOCUMENT|FROM_HERE)/` inside `App.jsx` because smart-nav isolation now lives in `resolveStructuredTextSmartNavigationContext` (verified behaviorally in `[H3][P10-G003]`).
  - **Explicitly Deferred P2 (`5` fails):** `S1-B` (`P10-G009`), `S2-A` (`P10-G010`), `S4-A` (`P10-G011`), `S8-A` (`P10-G012`), `S10-A` (`P10-G013`).
- **P9-C Marathon ([`audit-v603-p9c-bulk-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs)):** **13 PASS, 3 FAIL (`exit 1`)** *(baseline was 11 PASS, 5 FAIL)*:
  - **Now PASS (`2` probes):** `[DEFECT P9C-A]` (`P10-G006`), `[DEFECT P9C-D]` (bonus `P10-G015` URL revocation).
  - **`INVALID TEST` (archived pre-fix structural regex, `1` fail):** `[DEFECT P9C-B]` (`P10-G007`) fails line 536 `assert.ok(firstWritePos > 0 && firstReadPos > firstWritePos)` (which probed the old buggy inline write-before-read order inside `App.jsx`), whereas `executeTextStructuredAudioZipImport` now extracts/validates before writing Staging and commits Text DB in 1 TX with rollback (verified behaviorally in `[H2][P10-G007]`).
  - **Explicitly Deferred P2 (`2` fails):** `P9C-C` (`P10-G014`), `P9C-E` (`P10-G016`).
- **30 Historical Regression Scripts:**
  - **20 PASS (`exit 0`):** `audit-v5116-functions` *(auto-updated `docs/M1_FUNCTION_WIRING_AUDIT.md`)*, `a0-a3-rf-portability` (18), `a4-staging-gc` (7), `beta4-runtime-ux` (12), `beta5-testing-clarity` (19), `beta7-shared-rf-consumer-sync` (13), `beta8-p1-ordered-multi-audio` (13), `beta8-p2-split-full-domain` (17), `beta8-p3-runtime-playback` (15), `beta8-p5-bulk-generation` (17), `beta8-p6-bulk-export` (17), `beta8-p7-hf1-runtime-boot` (4), `beta8-p9-hf4d-navigation` (20), `d2-external-json` (30), `d3-d4-external-reconcile` (19), `dl-b1-download-batch` (17), `round-a-d1-d4` (7), `round-b-d2-d3` (6), `round-c-taxonomy` (10), `round-c1-legacy-empty-audio` (4).
  - **1 Service-Extraction Regex Failure (`audit-v603-beta8-p4-staging-zip.mjs`):** Checks 1–14 pass; fails at line 212 (`assert.match(appSource, /zip-imported-staging-ready/)`) because `H2` extracted the Portable ZIP importer (including `'zip-imported-staging-ready'` at lines 40, 239, 285) out of `src/App.jsx` into [textStructuredAudioZipImportService.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js).
  - **9 Pre-Existing Baseline Failures (`Legacy_Audit_Failures_Triage.md`):** `beta6-shared-rf-folder-crash`, `beta8-p7-hf2-global-player-defaults`, `beta8-p7-hf3-mobile-ui`, `beta8-p7-ui-simplification`, `beta8-p9-hf4a-card-ux`, `beta8-p9-hf4c-player-audio-ux`, `beta8-p9-hf4c-r1-ui-repair`, `beta8-p9-hf5-voice-audio-ux`, `d0-d1-text-identity`.

---

## 4. Modified & Created Files Inventory

- Modified production modules:
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx)
  - [`src/domain/text/textStructuredPlaybackDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js)
  - [`src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js)
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js)
  - [`src/services/audio/audioPlaybackSideEffectService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/audioPlaybackSideEffectService.js)
  - [`src/services/persistence/audioStagingIndexedDbService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js)
  - [`src/services/persistence/textAudioStagingService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js)
  - [`src/services/persistence/textLibraryCommandService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textLibraryCommandService.js)
- Created production & test modules:
  - [`src/services/audio/textStructuredAudioZipImportService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js)
  - [`scripts/audit-v603-p10-h1-h3-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h1-h3-remediation.mjs)
- Documentation updated/created:
  - [`P10_Gap_Register.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_Gap_Register.md)
  - [`P10_H1_H3_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H1_H3_Remediation_Report.md)
  - [`docs/M1_FUNCTION_WIRING_AUDIT.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/docs/M1_FUNCTION_WIRING_AUDIT.md) *(regenerated automatically when `scripts/audit-v5116-functions.mjs` ran)*

---

## 5. Manual Browser Acceptance Remaining for User

Node checks validate domain state, IDB transaction logic (via IndexedDB mocks), and service behavior offline; real browser `Audio`, Web Speech API, IndexedDB transactions, and UI interaction still require manual browser verification:
1. **`P10-G001`:** Enable `Loop` repeat in TTS-Only mode with an unavailable/missing voice and confirm Stop/Pause remains immediately responsive without browser freeze.
2. **`P10-G005`:** Set Browser TTS voice to an unavailable voice (or System Default on a browser with empty `getVoices()`) and confirm native OS speech plays both Channel and Full TTS steps.
3. **`P10-G008`:** Play Structured Text Staging audio -> switch to Table -> click **Clear Audio RAM** -> return to Structured Text and confirm active Text Staging audio still plays immediately.
4. **`P10-G006`:** Perform a Text DB Backup Restore (`Replace`) and a Text Pack Sync into a session where Staging blobs exist in IndexedDB, and confirm audio plays right away without reloading the page.
5. **`P10-G007` + `P10-G015`:** Import a Portable ProLingo Audio ZIP (and retry with a intentionally corrupted ZIP if testing fault recovery) and confirm metadata + audio stay consistent without orphaned variants or broken URLs.
6. **`P10-G002`:** Enable global `Full` representation on a multi-segment card -> trigger **Play from here** on Segment 2 -> confirm Segment 1 is skipped while Card 2 still plays as whole `FULL_LOCAL`.
7. **`P10-G003`:** Configure global `Full` + `Once` + `EN Only` -> start a manual single-Segment `Loop` -> tap Global **Next Card** and confirm it advances by Card under global `Full`/`Once`/`EN Only`.
8. **`P10-G004`:** Play Document under `Shuffle`, pause/stop mid-document, switch order back to `Sequential`, and tap **Play** / **Next** to confirm strictly sequential order resumes.
