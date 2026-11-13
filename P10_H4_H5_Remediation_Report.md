# ProLingo v6 — P10 Remediation Report (Waves H4–H5)

- **Repository / Branch:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries`
- **Committed H1–H3 Baseline (`HEAD`):** `d200fb384d5ad6087dd777a7c38c9cbc595d58bd`
- **Scope Executed:** Bounded remediation **Wave H4** (`P10-G009`–`P10-G012`) and **Wave H5** (`H5-A / P10-G014`, `H5-B / P10-G016`, `H5-C` H2 two-DB rollback hardening follow-up, `H5-D` obsolete historical test contract updates).
- **Explicit Exclusions Preserved:** Table business logic, CSV/Deck data, Text Library IndexedDB schema (`v1`), speaker identities, Split RF & Full artifact fingerprints, Edge-only Structured Text generation, Legacy Text functionality, `feature/ai-voice`, Round D, and deferred P2/P3 items (`P10-G013` / `S10-A`, `P10-G017`–`P10-G021`). Working tree remains uncommitted/unpushed with zero resets or stashes.

---

## 1. Executive Summary

| Wave | Scope / Gap IDs | Outcome in Node/Vite/ESLint | Browser Verification Status |
|---|---|---|---|
| **H4** | `P10-G009`, `P10-G010`, `P10-G011`, `P10-G012` | **8 / 8 PASS** (`audit-v603-p10-h4-playback-remediation.mjs`); all 4 P9-B probes **PASS** | Live Chromium OS `MediaSession` hardware widget (`P10-G009`) and visual player badge checks (`P10-G012`) remain **`UNVERIFIED`** until manual browser acceptance |
| **H5-A** | `P10-G014` (Single-Card & Legacy-Batch Ready Edge Full export) | **3 / 3 PASS** (`P10-G014-CardZip`, `P10-G014-FullCard`, `P10-G014-Batch`); P9-C `P9C-C` **PASS** | Live browser ZIP / MP3 / WAV download smoke check pending manual acceptance |
| **H5-B** | `P10-G016` (Multi-part ZIP wave delay `350ms`) | **1 / 1 PASS** (`H5-B` `P10-G016`); P9-C `P9C-E` **PASS** | Real Chromium multiple-download prompt / user-activation expiration remains **`UNVERIFIED`** in Node |
| **H5-C** | H2 Two-DB Portable ZIP rollback hardening (all 6 fault & concurrency scenarios) | **6 / 6 PASS** (`H5-C` `Scenario-1`..`Scenario-6` against in-memory IndexedDB) | Live Chromium IndexedDB + UI cancel/switch testing pending manual acceptance |
| **H5-D** | Obsolete historical contract updates (`S1-B`, `S6-B`, `P9C-B`, `beta8-p4`) | **All 4 updated contracts PASS** (`P9-B` `23/24` w/ `S10-A` left open; `P9-C` `16/16`; `beta8-p4` `21/21`) | N/A (Node static/behavioral suites) |

- **Post-Final-Edit Core Gates:**
  - `npm run build` (`vite build`): **PASS (`exit 0`, 1888 modules, `7.34s`)**
  - `npx eslint` on all 14 changed/new non-`App.jsx` files: **PASS (`exit 0`, 0 errors / 0 warnings)**
  - `scripts/audit-v603-p10-h4-playback-remediation.mjs`: **8 / 8 PASS (`exit 0`)**
  - `scripts/audit-v603-p10-h5-export-zip-remediation.mjs`: **10 PASS, 0 FAIL (`exit 0`)**
  - `scripts/audit-v603-p10-h1-h3-remediation.mjs`: **8 PASS, 0 FAIL (`exit 0`)**

---

## 2. Wave H4 Implementation Details (`P10-G009`–`P10-G012`)

- **`P10-G009` — Structured Text `Full` `MediaSession` Metadata & Clean Clear:**
  - Updated [`executeMediaSessionLifecycleService`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/mediaSessionLifecycleService.js#L6-L95) so active/paused Structured Text `Full` playback (`playingIndex === null` or `undefined`) resolves card metadata via `sessionContext.cursorSegmentId`, `currentIndex`, or `sessionContext.blockId`, sets `Full` metadata via `resolveStructuredTextPlayerTitle`, and clears `metadata`, `playbackState = 'none'`, and position state on Stop or workspace switch while leaving Split and Table behavior unchanged.
  - Cleaned up unused catch binding at [`mediaSessionLifecycleService.js:168`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/mediaSessionLifecycleService.js#L168).
- **`P10-G010` — `Full` Block Planner `CUSTOM_LOCAL` Pin Mode Support:**
  - Added [`resolveTextStructuredEffectiveCustomLocalVoice`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredLocalAudioProfileDomain.js#L63-L95) honoring Card > Document Speaker hierarchy and Conversation Speaker-1 sync.
  - Updated [`buildTextStructuredBlockRuntimePlaybackPlan`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L226) and [`resolveStructuredTextBlockChannelPlaybackPlan`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3277) so `Full` `CUSTOM_LOCAL` strictly requires a matching Ready artifact for the pinned voice and fails closed without silently falling back to `AUTO` priority.
- **`P10-G011` — Browser TTS Full Inheritance Fallback Chain:**
  - Updated [`resolveTextStructuredBrowserVoiceResolution`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredVoiceAssignmentDomain.js#L291-L448) to walk every candidate tier sequentially (`Segment > Card Speaker > Document Speaker > Card > Document > Global`, plus legacy `speakerVoiceMap` fallback and Full-mode Segment override suppression) before browser/system-default fallback.
  - Wired [`resolveStructuredTextChannelVoiceState`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L907) to delegate directly to `resolveTextStructuredBrowserVoiceResolution`.
- **`P10-G012` — `structuredTextPlaybackSourceStatus` Scoping & Clearing:**
  - Added [`resolveScopedStructuredTextPlaybackSourceStatus`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js#L183-L197) gating visibility on `mode === 'text'`, `activeEditorModel === 'structured-v1'`, active `documentId`, and active `sessionId`.
  - Cleared `structuredTextPlaybackSourceStatus` on Stop (`forceStopAll`), document switch (`handleTextLibrarySelectDocument`), mode/model/doc effect (`App.jsx:869`), and playback restart (`startStructuredTextPlayback`), and exposed `scopedStructuredTextPlaybackSourceStatus` at [`App.jsx:6565`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6565).

---

## 3. Wave H5-A & H5-B Implementation Details (`P10-G014`, `P10-G016`)

### `H5-A / P10-G014` — Single-Card & Legacy-Batch Ready Edge `Full` Exports
- **Domain Resolvers ([`textStructuredBulkExportDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredBulkExportDomain.js#L257-L345)):**
  - Added `resolveTextStructuredCardReadyFullArtifacts` and `resolveTextStructuredBatchReadyFullArtifacts` reusing `resolveTextStructuredEffectiveDownloadVoice` and `resolveTextStructuredFullArtifactReadiness` so only Paragraph cards with active-profile Ready Edge `Full` Staging binaries are included, while Conversation cards, stale post-edit artifacts, metadata-only records, and wrong-voice/rate/pitch/engine artifacts are excluded.
- **Export Service ([`textStructuredCardExportService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L156-L656)):**
  - `executeStructuredTextCardZipExport` (`L156`): Packages Ready Split + matching Ready Edge Full MP3s, supports full-only Ready cards and `options.partial` while preserving strict channel-completeness gating by default, deduplicates shared physical keys, writes v2 `TEXT_AUDIO_MANIFEST.json` (`representation: 'full'`, `fullArtifactFingerprint`, `rf: null`) and `AUDIO_INDEX.csv`, and marks both Split and Full Staging IDs exported without regenerating TTS.
  - `executeStructuredTextFullCardAudioExport` (`L295`): Prefers matching Ready Edge Full MP3 (`source: 'ready-full-edge'`) and falls back to client-side derived WAV (`source: 'derived-split-wav'`) only when no matching Ready Full artifact exists.
  - `executeStructuredTextBatchReadyMp3Export` (`L382`): Downloads deduplicated Ready Split and Ready Edge Full MP3s across the active Batch scope.
  - `executeStructuredTextBatchConsolidatedZipExport` (`L492`): Packages deduplicated Ready Split and Ready Edge Full MP3s with consolidated multi-card `references` in v2 manifest and `AUDIO_INDEX.csv`.
- **App Wiring ([`App.jsx:4839-4881`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4839-L4881)):**
  - Delegated `handleStructuredTextExportCardZip`, `handleStructuredTextExportFullCardAudio`, `handleStructuredTextBatchExportReadyMp3`, and `handleStructuredTextBatchExportConsolidatedZip` to `textStructuredCardExportService.js`.

### `H5-B / P10-G016` — Multi-Part ZIP Wave Delay Pacing
- Exported `TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS = 350` in [`textStructuredCardExportService.js:28`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L28).
- Inserted inter-part yield strictly between ZIP parts (`chunkIndex > 0` / `triggeredZipCount > 0`) in:
  - [`handleStructuredTextBulkExport`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4945) (`AUDIO_ONLY_ZIP` and `PORTABLE_ZIP`)
  - [`executeStructuredTextBatchConsolidatedZipExport`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L584)
- Single-part ZIP exports incur `0ms` delay. **Honest Browser Classification:** Node verifies sequential `PART_01..PART_0N` ordering, content uniqueness, and `350ms` inter-part waits (`H5-B`), whereas real Chromium multiple-download permission bars and user-activation expiration remain **`UNVERIFIED`** until manual browser testing.

---

## 4. Wave H5-C Implementation Details — H2 Two-DB Rollback Hardening Follow-Up

Structured Text stores Library metadata in Text Library IndexedDB and audio binaries in Audio Staging IndexedDB; those remain two separate IndexedDB databases (two-phase compensating rollback, **not** single-transaction cross-DB atomicity). Wave H5-C hardened all 6 failure and concurrency paths across [`textAudioStagingService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js#L66), [`textStructuredAudioZipImportService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L77-L536), and [`App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1973):

1. **Metadata rollback failure (`Scenario-1`):** `executeTextStructuredAudioZipImport` attempts Staging rollback even if `rollbackMetadata` throws, attaching `err.zipImportRecovery` (`metadataRollback: 'failed'`, `stagingRollback: 'rolled-back'`, `cleanRollback: false`, `residualRisk: true`). `App.jsx` branches on `recovery?.cleanRollback === false` (`L1999`, `L2025`) to log an incomplete-rollback warning instead of claiming clean rollback.
2. **Staging rollback failure (`Scenario-2`):** `rollbackTextAudioStagingBatch` in `textAudioStagingService.js` executes `restoreAudioStagingSnapshotRecords` and `deleteAudioStagingRecordsByIds` independently so an error in either phase never drops the second cleanup phase, then surfaces the combined error and `stagingRollback: 'failed'`, `cleanRollback: false`, `residualRisk: true`.
3. **Overlapping ZIP imports (`Scenario-3`):** `createTextStructuredAudioZipImportCoordinator()` (`structuredTextZipImportCoordinatorRef` at `App.jsx:331`) serializes queued imports via promise chaining and reads the fresh snapshot (`textLibrarySnapshotRef.current`) after import A commits before starting import B.
4. **Workspace / mode / unmount switch mid-import (`Scenario-4`):** `coordinator.cancelActive(...)` is triggered from `handleTextLibrarySelectDocument` (`App.jsx:3869`), mode/editorModel switch effect (`App.jsx:874`), and unmount cleanup (`App.jsx:341`), aborting in-flight imports, cancelling queued imports with `AbortError`, and running compensating rollback if context became stale right as `executeTextStructuredAudioZipImport` resolved.
5. **Post-commit cancel/abort (`Scenario-5`):** Checking `signal?.aborted` immediately after `commitMetadata` and offering `rollbackCompletedTextStructuredAudioZipImport` rolls back both Text Library IDB and Audio Staging IDB to exact pre-import state.
6. **Partial rollback + retry (`Scenario-6`):** Coordinator lock releases inside `finally`, and retrying the same ZIP against real IDB (even with a stale pre-failure React snapshot) converges idempotently without duplicating `AudioVariant` rows or corrupting counters.

---

## 5. Wave H5-D Historical Test Contract Maintenance

Updated only the 4 historical contract locations invalidated by intentional H2–H5 modular extractions while keeping original check IDs intact and keeping pre-existing unrelated failures (including `P9-B` `S10-A`) separate:
- [`scripts/audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs): wrapped `S1-B` media lifecycle harness cleanly so `mediaIntervalRef` is always cleared (preventing a dangling interval keep-alive), and updated `S6-B` to test domain `resolveStructuredTextSmartNavigationContext` directly alongside a historical relocation comment; flipped `S1-B`, `S2-A`, `S4-A`, `S8-A` to **PASS**; left `S10-A` failing as an open P2 UI mismatch.
- [`scripts/audit-v603-p9c-bulk-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs): updated `P9C-B` to verify `App.jsx` delegation and `textStructuredAudioZipImportService.js` Phase 1–3 ordering/rollback; flipped `P9C-C` and `P9C-E` to **PASS**.
- [`scripts/audit-v603-beta8-p4-staging-zip.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p4-staging-zip.mjs): updated checks 15–16 (`L206-225`) to inspect extracted `textStructuredAudioZipImportService.js` and `textLibraryCommandService.js` alongside `App.jsx` (`21/21` checks **PASS**).

---

## 6. Modified & Created Files Inventory

- **Modified Production Files:**
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx)
  - [`src/services/playback/mediaSessionLifecycleService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/mediaSessionLifecycleService.js) *(H4)*
  - [`src/domain/text/textStructuredLocalAudioProfileDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredLocalAudioProfileDomain.js) *(H4)*
  - [`src/domain/text/textStructuredPlaybackDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredPlaybackDomain.js) *(H4)*
  - [`src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js) *(H4)*
  - [`src/domain/text/textStructuredVoiceAssignmentDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredVoiceAssignmentDomain.js) *(H4)*
  - [`src/domain/text/textStructuredBulkExportDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredBulkExportDomain.js) *(H5-A)*
  - [`src/services/audio/textStructuredAudioZipImportService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js) *(H5-C)*
  - [`src/services/persistence/textAudioStagingService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingService.js) *(H5-C)*
- **Created Production Module:**
  - [`src/services/audio/textStructuredCardExportService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js) *(H5-A / H5-B)*
- **Created / Updated Audit Scripts:**
  - [`scripts/audit-v603-p10-h4-playback-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h4-playback-remediation.mjs) *(new)*
  - [`scripts/audit-v603-p10-h5-export-zip-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h5-export-zip-remediation.mjs) *(new)*
  - [`scripts/audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs) *(H5-D)*
  - [`scripts/audit-v603-p9c-bulk-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs) *(H5-D)*
  - [`scripts/audit-v603-beta8-p4-staging-zip.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p4-staging-zip.mjs) *(H5-D)*
- **Documentation / Auto-Generated Artifact:**
  - [`P10_Gap_Register.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_Gap_Register.md)
  - [`P10_H4_H5_Remediation_Report.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_H4_H5_Remediation_Report.md)
  - [`docs/M1_FUNCTION_WIRING_AUDIT.md`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/docs/M1_FUNCTION_WIRING_AUDIT.md) *(automatically refreshed when running `scripts/audit-v5116-functions.mjs`)*

---

## 7. Complete Verification Results (All Runs After Final Code Edit)

### A. Build & Static Checks
- **`npm run build` (`vite build`):** **PASS (`exit 0`)** — `1888 modules transformed`, `dist/assets/index-stYM-eWz.js 1,458.86 kB`, built in `7.34s`.
- **`npx eslint` (all 14 modified/created non-`App.jsx` production & script files):** **PASS (`exit 0`, 0 errors / 0 warnings)**.
- **`npx eslint -f json src/App.jsx`:** `171` pre-existing lint messages; on changed diff lines vs `HEAD`, `19` hits reported are pre-existing `react-hooks/exhaustive-deps` warnings (`severity: 1`) tied to `forceStopAll` at `App.jsx:1685`; `0` errors on H4/H5 changes.
- **`git diff --check`:** **PASS (`exit 0`)**.

### B. Dedicated P10 & Current Marathon Suites
1. [`audit-v603-p10-h4-playback-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h4-playback-remediation.mjs): **8 / 8 PASS (`exit 0`)** (`G009-1`, `G009-2`, `G010-1`, `G010-2`, `G011-1`, `G011-2`, `G012-1`, `G012-2`).
2. [`audit-v603-p10-h5-export-zip-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h5-export-zip-remediation.mjs): **10 PASS, 0 FAIL (`exit 0`)** (`P10-G014-CardZip`, `P10-G014-FullCard`, `P10-G014-Batch`, `H5-B P10-G016`, `H5-C Scenario-1..6`).
3. [`audit-v603-p10-h1-h3-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h1-h3-remediation.mjs): **8 PASS, 0 FAIL (`exit 0`)** (zero regression across H1–H3).
4. [`audit-v603-p9c-bulk-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs): **16 PASS, 0 FAIL (`exit 0`)**.
5. [`audit-v603-beta8-p4-staging-zip.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p4-staging-zip.mjs): **21 checks PASS (`exit 0`)**.
6. [`audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs): **23 PASS, 1 FAIL (`exit 1`)** — only remaining failure is deferred P2 `[DEFECT S10-A]` (`P10-G013` `BottomPlayerBar` not rendering `textTtsOnly` / `onTextTtsOnlyChange`).

### C. Full 35-Script Repository Audit Sweep (`scripts/audit-*.mjs`)
- **Passing suites (24 `exit 0` scripts):**
  - `p10-h4-playback-remediation` (8/8), `p10-h5-export-zip-remediation` (10/10), `p10-h1-h3-remediation` (8/8), `p9c-bulk-marathon` (16/16), `beta8-p4-staging-zip` (21/21), `v5116-functions`, `a0-a3-rf-portability` (18), `a4-staging-gc` (7), `beta4-runtime-ux`, `beta5-testing-clarity` (19), `beta7-shared-rf-consumer-sync` (13), `beta8-p1-ordered-multi-audio`, `beta8-p2-split-full-domain`, `beta8-p3-runtime-playback` (15), `beta8-p5-bulk-generation` (17), `beta8-p6-bulk-export` (17), `beta8-p7-hf1-runtime-boot` (4/4), `beta8-p9-hf4d-navigation` (20/20), `d2-external-json` (30), `d3-d4-external-reconcile` (19), `round-a-d1-d4` (7), `round-b-d2-d3` (6), `round-c-taxonomy` (10), `round-c1-legacy-empty-audio` (4).
- **Non-zero suites (11 `exit 1` scripts, kept untouched outside H5-D scope):**
  - `p9b-playback-marathon`: `23 PASS, 1 FAIL` — open deferred P2 `S10-A` (`P10-G013`).
  - `dl-b1-download-batch`: lines `1..57` domain/export checks pass; line `61` fails historical inline `App.jsx` regex (`appSource.includes('physicalByRf')`) after H5-A extracted Card/Batch ZIP builders into [`textStructuredCardExportService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js).
  - **9 pre-existing historical baseline failures** (`Legacy_Audit_Failures_Triage.md` / superseded pre-HF6 regexes): `beta6-shared-rf-folder-crash`, `beta8-p7-hf2-global-player-defaults`, `beta8-p7-hf3-mobile-ui`, `beta8-p7-ui-simplification`, `beta8-p9-hf4a-card-ux`, `beta8-p9-hf4c-player-audio-ux`, `beta8-p9-hf4c-r1-ui-repair`, `beta8-p9-hf5-voice-audio-ux`, `d0-d1-text-identity`.

---

## 8. Scope & Boundary Preservation Check

- **Table & Legacy Text:** Untouched; `MediaSession` Table/Legacy paths and `round-a..c1` boundary guards continue to pass (`EXIT=0`).
- **H1–H3 Preserved:** All `8/8` checks in `audit-v603-p10-h1-h3-remediation.mjs` continue to pass (`EXIT=0`).
- **Schemas, Fingerprints & Branches:** Text Library schema remains `v1`; Split RF and Full artifact fingerprints unchanged; Edge-only Structured Text generation preserved; `feature/ai-voice` and Round D untouched; zero git commits, pushes, merges, resets, or stashes executed.

---

## 9. Honest Residual Risks & Unverified Browser Surfaces

1. **Two-DB Compensating Rollback Boundary:** Text Library IDB and Audio Staging IDB are separate databases. While `H5-C` verifies independent dual-phase cleanup, structured `zipImportRecovery` flags, and idempotent retry across all 6 simulated faults in Node's in-memory IndexedDB mock, a double failure where IndexedDB itself rejects rollback writes cannot be atomic across databases and explicitly surfaces `cleanRollback: false` / `residualRisk: true` for user retry.
2. **Headless Node Mocks vs Chromium APIs:** Node tests mock IndexedDB, `navigator.mediaSession`, `Blob`/`URL`, timers (`350ms`), and download triggers. Real browser behavior for Chrome's `navigator.mediaSession` hardware/OS notifications (`P10-G009`), Chromium's multiple-download prompt & transient user-activation timeout (`P10-G016`), real Web Speech synthesis, and real IndexedDB quota/locks remains **`UNVERIFIED`** until manual browser acceptance.
3. **Open Deferred P2/P3 Items:** `P10-G013` (`BottomPlayerBar` `textTtsOnly` dead props / `S10-A`), `P10-G017`, `P10-G018`, and `P10-G019`–`P10-G021` remain intentionally deferred.

---

## 10. Manual Browser Acceptance Steps for User

1. **H4 / `P10-G009` (`Full` MediaSession — `UNVERIFIED` in browser):** Play a Paragraph card with Ready Edge Full MP3 in global `Full` mode. Verify OS/browser media notification shows card title/artist (`Card 1 • Full`), pause keeps metadata, and **Stop** or switching workspace clears metadata.
2. **H4 / `P10-G010` (`Full` `CUSTOM_LOCAL`):** Pin a card or speaker voice under `CUSTOM_LOCAL` in `Full` mode. Verify matching Full MP3 plays cleanly and missing pinned voice fails closed without silently playing another voice's Full MP3.
3. **H4 / `P10-G011` (`Browser TTS` Fallback):** Configure an unavailable voice at Segment level, a valid browser voice at Card Speaker or Document Speaker level, and a distinct Document default in a Conversation workspace; confirm Split TTS resolves through Card/Doc Speaker rather than skipping straight to Document/Global.
4. **H4 / `P10-G012` (Source Status Hygiene):** Start playback in Doc A so source status shows, then press **Stop**, switch to Doc B, switch to Table, and restart playback; confirm no stale Doc A source badge leaks.
5. **H5-A / `P10-G014` (Card & Legacy-Batch Ready Edge Full Export):**
   - Generate Split + Edge Full audio for a Paragraph card -> click **Card ZIP** -> extract ZIP and verify both Split RF MP3s, the matching Ready Edge Full MP3, `TEXT_AUDIO_MANIFEST.json` (`representation: 'full'`, `fullArtifactFingerprint`, `rf: null`), and `AUDIO_INDEX.csv` (excluding stale/wrong-voice Full MP3s and triggering zero Edge requests).
   - Click **Full EN/ID** export -> verify matching Ready Edge Full `.mp3` downloads directly without derived WAV stitching; edit card text or switch voice so Full becomes stale/mismatched and verify derived `.wav` fallback still works.
   - Trigger Legacy-Batch **Ready MP3** and **Consolidated ZIP** across two identical cards -> verify Ready Edge Full MP3 is included once (deduplicated) with multi-card manifest references.
6. **H5-B / `P10-G016` (Chromium Multi-Part ZIP Download Prompt — `UNVERIFIED` in browser):** Trigger Bulk Export (`AUDIO_ONLY_ZIP` / `PORTABLE_ZIP`) or Batch Consolidated ZIP on a dataset large enough (or chunk limit lowered in dev test) to produce `>= 2` parts (`PART_01.zip`, `PART_02.zip`, ...). Allow multiple downloads in Chromium if prompted and confirm all `PART_01..PART_0N` files save cleanly without silent blocking or missing parts.
7. **H5-C (Portable ZIP Import Concurrency, Switch & Retry):** Start importing a large Portable ZIP and immediately switch workspace/mode mid-import -> confirm abort/clean state; retry importing the same ZIP -> confirm audio binds cleanly without duplicate variants or errors in DevTools console/IDB.
