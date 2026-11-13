# ProLingo v6 — P10-H6 Final Consolidation & Release-Readiness Report

- **Repository:** `nazurinian/prolingo-app`
- **Branch / Base HEAD:** `fix/text-data-system-boundaries` @ `212d398d3a5bc3638a2391bab2c422d8760bb13c` (H1–H5 committed; working tree holds uncommitted H6 changes)
- **Scope:** Bounded H6 consolidation (`H6-A`..`H6-E`) covering `dl-b1` export-contract alignment, `P10-G013`/`S10-A` dead prop cleanup, `G017`–`G019` triage & bounded fixes, queued ZIP UI-lag race hardening (`H6-D`), full H1–H6 regression verification, and final gap register classification.
- **Boundary Integrity:** Table business logic, Legacy Text behavior, Text Library IndexedDB schema (`v1`), Split/Full fingerprints (`rf-sha256-*` / `full-sha256-*`), voice inheritance hierarchy, speaker identities, HF6, and Round D Reset-to-Defaults were all preserved untouched.

---

## 1. Confirmed Fixed

### H6 Workstreams (`H6-A` – `H6-D`)

- **H6-A (`dl-b1` Contract Alignment):**
  - Updated [`scripts/audit-v603-dl-b1-download-batch.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-dl-b1-download-batch.mjs) to replace stale source-regex assertions against inline `App.jsx` `physicalByRf` / `reusedPhysical: reused` with executable behavioral tests of [`executeStructuredTextCardZipExport`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredCardExportService.js#L156) and `executeStructuredTextBatchConsolidatedZipExport`, verifying deduplicated Split + active Ready Full physical MP3s, logical `references`, `prolingo-text-audio-manifest.json` (`packageVersion: 2`), canonical filenames, and `App.jsx` delegation (`reusedPhysical: reusedPhysicalKeys.size`, `generatedPhysical: generatedPhysicalKeys.size`).
  - **Result:** `35 checks` **PASS**.
- **H6-B (`P10-G013` / `S10-A` — Dead Prop Wiring Removed):**
  - Removed unused `textTtsOnly` and `onTextTtsOnlyChange` prop forwarding between [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx) and [`src/components/layout/MainAppShellView.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/MainAppShellView.jsx) -> [`BottomPlayerBar.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/BottomPlayerBar.jsx) without duplicating the toggle inside `BottomPlayerBar`.
  - Preserved [`handleStructuredTextGlobalTtsOnlyChange`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6613) on `TextStructuredAudioControls` (`LOCAL FIRST` / `TTS ONLY` `data-text-audio-source-toggle="true"`, `AUTO`, `CUSTOM`) across Desktop (`MainAppShellView.jsx`) and Mobile (`MobileTools.jsx`) plus `TextBatchPopup` ([`App.jsx:6718`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6718)).
  - **Result:** [`scripts/audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs) (`[DEFECT S10-A FIXED]`, `24 PASS, 0 FAIL`).
- **H6-C (`P10-G018` Fallback & `P10-G019` Unmount Cleanup):**
  - **`P10-G018` fallback fix:** Aligned missing-preference Meaning fallback in [`resolveTextStructuredEffectiveDownloadVoice`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioDownloadProfileDomain.js#L165) from `'su-ID-TutiNeural'` to `'id-ID-GadisNeural'`, matching `TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeMeaningVoiceId` (`'id-ID-GadisNeural'`) while keeping `Bulk` and `Table` defaults intact. Verified by `[H6-C][CONTRACT] [P10-G018]` in [`scripts/audit-v603-p9c-bulk-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs) (`17 PASS, 0 FAIL`).
  - **`P10-G019` cleanup fix:** Added `localAudioMapTableRef` paired with `localAudioMapTextRef` and a root unmount cleanup effect in [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6180-L6198) revoking all Table/Legacy runtime ObjectURLs and clearing `clearTableAudioFolderRuntimeCache()`, `clearTableAudioZipRuntimeCache()`, and `clearAudioStagingRuntimeCacheForMode('table')` (alongside existing Structured Text cleanup at [`App.jsx:398-408`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L398-L408) and `silentWavUrlRef` cleanup in `audioRuntimeLifecycleService.js`).
- **H6-D (Queued Portable ZIP Import Convergence Before React `useState` Commit):**
  - Exported pure [`mergeTextLibraryZipMetadataCommitIntoSnapshot`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/textStructuredAudioZipImportService.js#L74) to merge committed Split `audioVariants`, `counters`, and Full Block `blocks` metadata without waiting for React render commit.
  - Updated [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1989) inside `coordinator.runExclusive` to read fresh `readTextLibrarySnapshot()` when `!snapshotOverride` and synchronously update `textLibrarySnapshotRef.current` alongside queuing `setTextLibrarySnapshot(previous => mergeTextLibraryZipMetadataCommitIntoSnapshot(previous, metadataCommit))` ([`App.jsx:2048-2060`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L2048-L2060)).
  - **Result:** [`scripts/audit-v603-p10-h5-export-zip-remediation.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p10-h5-export-zip-remediation.mjs) (`[H6-D][Scenario-7]`, `11 PASS, 0 FAIL`): two queued imports (`TXTAUDIO_000002` + `TXTAUDIO_000003` + `fullAudioArtifactsV1`) + a failing 3rd import aborting after IDB commit converge cleanly with zero duplicate IDs, zero stale overwrite, preserved Staging blobs, clean rollback isolation, and identical deferred React `useState` flush.

### Cumulative H1–H6 Status Across `P10_Gap_Register.md`

- **P1 Fixed (8 / 8):** `P10-G001` (loop backoff), `P10-G002` (`FROM_HERE` Full slice), `P10-G003` (global nav session isolation), `P10-G004` (`Shuffle` -> `Sequential` stale `orderedListOverride`), `P10-G005` (null-voice Browser TTS fallback), `P10-G006` (DB restore / Pack Sync Staging runtime re-hydration), `P10-G007` (atomic/compensating Portable ZIP import + H5-C rollback & H6-D queued convergence), `P10-G008` (mode-scoped Table Clear Audio RAM).
- **P2 Fixed (8 / 10):** `P10-G009` (`MediaSession` Full metadata), `P10-G010` (`CUSTOM_LOCAL` pin enforcement), `P10-G011` (`card-speaker` & `document-speaker` TTS fallback chain), `P10-G012` (`structuredTextPlaybackSourceStatus` workspace/stop scoping), `P10-G013` (H6-B dead prop removal), `P10-G014` (card & batch Ready Full MP3 export), `P10-G015` (ZIP import ObjectURL revocation), `P10-G016` (350ms multi-part ZIP wave yield).
- **P3 Fixed (1 / 3):** `P10-G019` (H6-C Table/Legacy root unmount ObjectURL & cache cleanup).

---

## 2. Intentional Product Behavior

- **`P10-G017` — Staging GC Full/Split Retention & Edge-Only Coverage Readiness Gate:**
  - Read-only verification of [`textAudioStagingGcService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/textAudioStagingGcService.js#L11-L34) confirmed `referenced` protects both active Split `rf-sha256-*` fingerprints and content-matching Full `full-sha256-*` fingerprints (`current.contentFingerprint === artifact?.descriptor?.contentFingerprint`), while leaving Table/legacy staging records untouched and reclaiming unreferenced orphans. Confirmed intentional (`audit-v603-a4-staging-gc.mjs` `7 checks` **PASS**, `audit-v603-beta8-p4-staging-zip.mjs` `PASS 13–14`).
- **`P10-G018` — Per-Scope Indonesian & English Voice Defaults:**
  - Structured Text Single Edge defaults (`edgeTextVoiceId: 'en-GB-SoniaNeural'`, `edgeMeaningVoiceId: 'id-ID-GadisNeural'` in [`textStructuredAudioGenerationDomain.js:15-16`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L15-L16)), Structured Text Bulk defaults (`bulkTextVoiceIds: ['en-GB-LibbyNeural']`, `bulkMeaningVoiceIds: ['su-ID-TutiNeural']` at `L23-24`), and Table/Legacy `edgeIndonesianVoice` (`'su-ID-TutiNeural'` in [`useMainAppPrimaryState.js:152`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/hooks/useMainAppPrimaryState.js#L152)) remain intentionally distinct across modes and scopes.

---

## 3. Deferred by Design

- **`P10-G020` (`Sidebar.jsx`, `ControlSectionTabs.jsx` Orphaned Legacy Components):** Left untouched outside H6; zero runtime impact.
- **`P10-G021` (`window.confirm` in `TextLibraryShell.jsx:612` & Text Staging UI Parity Controls):** Left outside H6 UI polish scope.
- **Round D (`Reset to Defaults` for Text Audio Settings):** Intentionally deferred for separate implementation after manual P9-B/C acceptance.

---

## 4. Unverified in Browser

Node harness checks use deterministic in-memory IndexedDB, synthetic `Blob`/timer stubs, and static/esbuild component checks rather than a live Chromium process. The following remain **Unverified in Browser** until manual P9-B/C acceptance testing:

1. **Multi-Part Bulk / Consolidated ZIP Browser Downloads (`P10-G016`):** Chromium user-activation lifetime and automatic-download permission prompts across consecutive `350ms`-spaced `PART_01..PART_0N` downloads.
2. **OS `MediaSession` Hardware UI (`P10-G009`):** Desktop/Android lock-screen / media overlay rendering and play/pause/next/prev callbacks during Structured Text `Full` playback (`playingIndex === null`).
3. **Web Speech API & Real `getVoices()` Fallback (`P10-G001`, `P10-G005`, `P10-G011`):** Live browser voice enumeration, OS default fallback when a named voice is absent, Stop responsiveness, and multi-speaker Conversation switching.
4. **Live IndexedDB & File System Access Persistence (`P10-G006`, `P10-G007`, `H6-D`):** Real browser DB restore, Pack Sync, back-to-back queued Portable ZIP imports during active React renders, corrupt ZIP rollback recovery, and Table vs Legacy vs Structured mode switching.
5. **Interactive UI & Visual Controls (`P10-G002`–`P10-G004`, `P10-G008`, `P10-G010`, `P10-G012`–`P10-G014`):** Mid-card `FROM_HERE`, `CUSTOM_LOCAL` pin playback, status badge clearing, `TextStructuredAudioControls` (`LOCAL FIRST`/`TTS ONLY`, `AUTO`, `CUSTOM`) on Desktop & Mobile, Card ZIP & Full Card MP3 download inspection, and Table `Clear Audio RAM` isolation.

---

## 5. Remaining Release Blockers

- **Code-Level Blockers:** **0** remaining P1 or P2 defects in Node/Vite verification (`P10_Gap_Register.md` has 0 unaddressed P1/P2 defects).
- **Release Gate Blocker:** Manual P9-B / P9-C Chromium browser acceptance testing covering the items in Section 4 is required before production release sign-off.

---

## 6. Regression Test, Build & Static Check Summary

### Targeted H6-E Verification Suite (All Executed After Final Edit)

| Check / Command | Scope | Observed Result |
|---|---|---|
| `node scripts/audit-v603-p10-h1-h3-remediation.mjs` | Wave H1–H3 P1/P2 remediation | **8 PASS, 0 FAIL** (`EXIT: 0`) |
| `node scripts/audit-v603-p10-h4-playback-remediation.mjs` | Wave H4 P9-B playback fixes | **8/8 PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-p10-h5-export-zip-remediation.mjs` | Wave H5 export/ZIP rollback + H6-D Scenario-7 | **11 PASS, 0 FAIL** (`EXIT: 0`) |
| `node scripts/audit-v603-p9b-playback-marathon.mjs` | P9-B playback contracts + H6-B `S10-A` | **24 PASS, 0 FAIL** (`EXIT: 0`) |
| `node scripts/audit-v603-p9c-bulk-marathon.mjs` | P9-C bulk/staging/ZIP + H6-C `P10-G018` | **17 PASS, 0 FAIL** (`EXIT: 0`) |
| `node scripts/audit-v603-dl-b1-download-batch.mjs` | H6-A DL1/DL2/B1 export contract | **35 checks PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-a4-staging-gc.mjs` | A4 Staging GC contract | **7 checks PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-beta8-p4-staging-zip.mjs` | Beta.8 P4 Staging + Portable ZIP | **21 checks PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-round-a-d1-d4.mjs` | Round A boundary (D1/D4) | **7 PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-round-b-d2-d3.mjs` | Round B boundary (D2/D3) | **6 PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-round-c-taxonomy.mjs` | Round C taxonomy & Stage 0 | **10 PASS** (`EXIT: 0`) |
| `node scripts/audit-v603-round-c1-legacy-empty-audio.mjs` | Round C.1 empty Legacy audio & UI label | **4 PASS** (`EXIT: 0`) |
| `npm run build` (`vite build`) | Production bundle (`1888 modules`) | **Built in 7.54s** (`EXIT: 0`) |
| `git diff --check` | Whitespace / conflict marker check | **Clean (`EXIT: 0`)** |
| `npx eslint ...` on all 8 modified JS/JSX/MJS files | Modified file lint check | **0 errors/warnings** in the 6 non-shell modified files (`downloadProfileDomain`, `zipImportService`, 4 `audit-*.mjs`); **`183` pre-existing baseline problems (`123 errors, 60 warnings`, `EXIT: 1`)** in `src/App.jsx` and `src/components/layout/MainAppShellView.jsx` with 0 new issues introduced by H6 edits |

### Broader Sweep Across All `scripts/audit-*.mjs` (`35` Scripts Total)

- **Passed (`26 / 35`, `EXIT: 0`):** All 12 targeted H1–H6 / Round A–C.1 / P9-B / P9-C / DL-B1 / A4 / P4 gates above, plus `audit-v5116-functions.mjs` *(side-effect update to `docs/M1_FUNCTION_WIRING_AUDIT.md` restored cleanly afterwards)*, `audit-v603-a0-a3-rf-portability.mjs` (`18`), `audit-v603-beta4-runtime-ux.mjs` (`12`), `audit-v603-beta5-testing-clarity.mjs` (`19`), `audit-v603-beta7-shared-rf-consumer-sync.mjs` (`13`), `audit-v603-beta8-p1-ordered-multi-audio.mjs` (`13`), `audit-v603-beta8-p2-split-full-domain.mjs` (`17`), `audit-v603-beta8-p3-runtime-playback.mjs` (`15`), `audit-v603-beta8-p5-bulk-generation.mjs` (`17`), `audit-v603-beta8-p6-bulk-export.mjs` (`17`), `audit-v603-beta8-p7-hf1-runtime-boot.mjs` (`4/4`), `audit-v603-beta8-p9-hf4d-navigation.mjs` (`20/20`), `audit-v603-d2-external-json.mjs` (`30`), and `audit-v603-d3-d4-external-reconcile.mjs` (`19`).
- **Pre-Existing Historical Baseline Failures (`9 / 35`, `EXIT: 1` — 0 caused by H6):**
  1. `audit-v603-beta6-shared-rf-folder-crash.mjs`: expects legacy auto-scan on startup (`FAIL: startup remembers Folder but does not auto-scan it`).
  2. `audit-v603-beta8-p7-hf2-global-player-defaults.mjs`: expects pre-HF5 `edgeMeaningVoiceId === 'su-ID-TutiNeural'`.
  3. `audit-v603-beta8-p7-hf3-mobile-ui.mjs`: checks historical `V6.0.3-BETA8-P7-HF3-MOBILE-UI` version token.
  4. `audit-v603-beta8-p7-ui-simplification.mjs`: expects old `data-text-global-tts-only="true"` attribute superseded by `data-text-audio-source-toggle="true"` in HF4-C.
  5. `audit-v603-beta8-p9-hf4a-card-ux.mjs`: source regex `setPlayingIndex(step.highlight ?` superseded by H1–H4 playback remediation.
  6. `audit-v603-beta8-p9-hf4c-player-audio-ux.mjs`: checks historical `6.0.3-beta.8-p9-hf4c` metadata string.
  7. `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs`: checks historical `6.0.3-beta.8-p9-hf4c-r1` metadata string.
  8. `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs`: checks `/Browser TTS/` label text against `'David · US'`.
  9. `audit-v603-d0-d1-text-identity.mjs`: compares against historical D0/D1 hash `'024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767'`.

---

## 7. Round D Readiness Recommendation

**Status: Ready to proceed after manual P9-B/C browser smoke verification (no remaining P10 code blockers).**

1. Run a focused manual Chromium P9-B/C acceptance pass first against Section 4 (multi-part ZIP download permission/timing, Full `MediaSession`, queued Portable ZIP import + corrupt ZIP rollback, DB restore playback, Table `Clear Audio RAM` isolation, and Desktop/Mobile `TextStructuredAudioControls`).
2. Keep the ratified `P10-G018` defaults matrix intact when implementing Round D Reset-to-Defaults:
   - Structured Text Global/Single Edge & Download fallback: `'en-GB-SoniaNeural'` / `'id-ID-GadisNeural'`
   - Structured Text Bulk defaults: `['en-GB-LibbyNeural']` / `['su-ID-TutiNeural']`
   - Table / Legacy defaults (`useMainAppPrimaryState.js`): isolated from Structured Text resets
3. Keep `P10-G017` Staging GC semantics and `P10-G020`/`P10-G021` cleanly decoupled from Round D so Reset-to-Defaults remains surgical and testable without destabilizing Table, Legacy Text, or Structured Text Staging binaries.
