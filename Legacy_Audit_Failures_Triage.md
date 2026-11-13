# Legacy Audit Scripts Triage (`scripts/audit-*.mjs`)

- **Repository:** `nazurinian/prolingo-app`
- **Branch / Baseline HEAD:** `fix/text-data-system-boundaries` @ `c3b8f4f`
- **Run Policy:** Read-only triage; zero edits made to any existing audit script or `src/` file.
- **Full Raw Runner Log:** `scratch/legacy_scripts_run.log` (in conversation artifact directory)
- **Summary Counts:** **30 existing scripts run -> 21 PASS (`exit 0`), 9 FAIL (`exit 1`)**

---

## 1. Executive Summary & Pattern Analysis

Every single one of the **9 pre-existing script failures** fails because its assertions reflect an **older historical baseline (`beta6`–`hf5`)** that was later intentionally evolved (`hf6`, `7a56884`, `fdcf3aa`, `3f3163d`, `Round A–C`), rather than an unintended runtime regression.

However, triaging failure #2 (`audit-v603-beta8-p7-hf2-global-player-defaults.mjs`) revealed **one genuine partial-default inconsistency defect**: commit `fdcf3aa` changed `edgeMeaningVoiceId` to `'id-ID-GadisNeural'` while leaving `bulkMeaningVoiceIds`, `bulkExportMeaningVoiceId`, `textStructuredAudioDownloadProfileDomain.js`, and `useMainAppPrimaryState.js` on `'su-ID-TutiNeural'` (recorded as a gap in `P10_Gap_Register.md` and `Round_D_Implementation_Readiness.md`).

*(Reminder: existing passing scripts verify domain invariants and targeted regex/runtime checks; see `ProLingo_v6_Internal_Audit_Master_Report.md` for what remains unverified at runtime/browser level.)*

---

## 2. Full 30-Script Inventory

| # | Script | Status | Exit | Category |
|---|---|---|---:|---|
| 1 | `scripts/audit-v5116-functions.mjs` | PASS | 0 | Existing pass |
| 2 | `scripts/audit-v603-a0-a3-rf-portability.mjs` | PASS | 0 | Existing pass |
| 3 | `scripts/audit-v603-a4-staging-gc.mjs` | PASS | 0 | Existing pass |
| 4 | `scripts/audit-v603-beta4-runtime-ux.mjs` | PASS | 0 | Existing pass |
| 5 | `scripts/audit-v603-beta5-testing-clarity.mjs` | PASS | 0 | Existing pass |
| 6 | **`scripts/audit-v603-beta6-shared-rf-folder-crash.mjs`** | **FAIL** | **1** | **Intentional architecture evolution / Stale expectation** |
| 7 | `scripts/audit-v603-beta7-shared-rf-consumer-sync.mjs` | PASS | 0 | Existing pass |
| 8 | `scripts/audit-v603-beta8-p1-ordered-multi-audio.mjs` | PASS | 0 | Existing pass |
| 9 | `scripts/audit-v603-beta8-p2-split-full-domain.mjs` | PASS | 0 | Existing pass |
| 10 | `scripts/audit-v603-beta8-p3-runtime-playback.mjs` | PASS | 0 | Existing pass |
| 11 | `scripts/audit-v603-beta8-p4-staging-zip.mjs` | PASS | 0 | Existing pass |
| 12 | `scripts/audit-v603-beta8-p5-bulk-generation.mjs` | PASS | 0 | Existing pass |
| 13 | `scripts/audit-v603-beta8-p6-bulk-export.mjs` | PASS | 0 | Existing pass |
| 14 | `scripts/audit-v603-beta8-p7-hf1-runtime-boot.mjs` | PASS | 0 | Existing pass |
| 15 | **`scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs`** | **FAIL** | **1** | **Intentional `hf6` default change + Partial inconsistency surfaced** |
| 16 | **`scripts/audit-v603-beta8-p7-hf3-mobile-ui.mjs`** | **FAIL** | **1** | **Stale version/checkpoint pin** |
| 17 | **`scripts/audit-v603-beta8-p7-ui-simplification.mjs`** | **FAIL** | **1** | **Intentional UI deduplication (`3f3163d`)** |
| 18 | **`scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs`** | **FAIL** | **1** | **Intentional refactor + Stale version pin** |
| 19 | **`scripts/audit-v603-beta8-p9-hf4c-player-audio-ux.mjs`** | **FAIL** | **1** | **Stale version pin** |
| 20 | **`scripts/audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs`** | **FAIL** | **1** | **Stale version pin** |
| 21 | `scripts/audit-v603-beta8-p9-hf4d-navigation.mjs` | PASS | 0 | Existing pass |
| 22 | **`scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs`** | **FAIL** | **1** | **Intentional label formatting evolution (`7a56884`)** |
| 23 | **`scripts/audit-v603-d0-d1-text-identity.mjs`** | **FAIL** | **1** | **Stale directory hash baseline** |
| 24 | `scripts/audit-v603-d2-external-json.mjs` | PASS | 0 | Existing pass |
| 25 | `scripts/audit-v603-d3-d4-external-reconcile.mjs` | PASS | 0 | Existing pass |
| 26 | `scripts/audit-v603-dl-b1-download-batch.mjs` | PASS | 0 | Existing pass |
| 27 | `scripts/audit-v603-round-a-d1-d4.mjs` | PASS | 0 | Existing pass |
| 28 | `scripts/audit-v603-round-b-d2-d3.mjs` | PASS | 0 | Existing pass |
| 29 | `scripts/audit-v603-round-c-taxonomy.mjs` | PASS | 0 | Existing pass |
| 30 | `scripts/audit-v603-round-c1-legacy-empty-audio.mjs` | PASS | 0 | Existing pass |

---

## 3. Detailed Triage of the 9 Failing Scripts

### Fail 1: `scripts/audit-v603-beta6-shared-rf-folder-crash.mjs`
- **Failing line & assertion:** [audit-v603-beta6-shared-rf-folder-crash.mjs:25](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta6-shared-rf-folder-crash.mjs#L25) — asserts `appSource.includes('Remembered Audio Folder detected') && appSource.includes('Reconnect explicitly')` in `src/App.jsx`.
- **Observed error:** `AssertionError [ERR_ASSERTION]` at line 25 (`exit 1`).
- **Root cause & git evidence:** The old remembered-folder prompt copy in `App.jsx` was replaced when Text Library persistence and Structured Audio Staging landed in `6580a5d` (`feat: (beta8-p3&4) add text library persistence services, structured audio playback, and UI components`), and Round A (`0dd2a61`) subsequently quarantined legacy folder scanning away from Structured Text (`structured-v1`).
- **Classification:** **Stale expectation (intentional architecture evolution)**. Does not indicate a hidden crash; Table/Legacy folder isolation is actively covered by `audit-v603-round-a-d1-d4.mjs` and `audit-v603-round-c1-legacy-empty-audio.mjs` (both PASS).
- **Smallest corrective action:** Either archive this superseded beta.6 probe or replace lines 25–30 with an invariant check verifying Table/Legacy folder reconnect controls exist in `DesktopSystemControls.jsx` / `MobileSystemControls.jsx` while remaining locked in Structured Text.

### Fail 2: `scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p7-hf2-global-player-defaults.mjs:152](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs#L152) — expects `DEFAULT_TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCES.edgeMeaningVoiceId === 'su-ID-TutiNeural'`, actual `'id-ID-GadisNeural'`.
- **Observed error:** `AssertionError: Expected values to be strictly equal: 'id-ID-GadisNeural' !== 'su-ID-TutiNeural'`.
- **Root cause & git evidence:** Intentional commit `fdcf3aa` (`fix(hf6): use Gadis as default Indonesian Edge MP3 voice for new Text presets`) updated `edgeMeaningVoiceId` at [textStructuredAudioGenerationDomain.js:16](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L16) to `'id-ID-GadisNeural'`.
- **Classification:** **Intentional change (`fdcf3aa`) + Genuine secondary defect surfaced**: `fdcf3aa` patched only `edgeMeaningVoiceId` and left `bulkMeaningVoiceIds` (`['su-ID-TutiNeural']` at `L24`), `bulkExportMeaningVoiceId` (`'su-ID-TutiNeural'` at `L32`), [textStructuredAudioDownloadProfileDomain.js:165](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioDownloadProfileDomain.js#L165), and [useMainAppPrimaryState.js:152](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/hooks/useMainAppPrimaryState.js#L152) on `'su-ID-TutiNeural'`. Also [appMetadata.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/constants/appMetadata.js) still carries the historical HF2 text mentioning `Tuti ID`.
- **Smallest corrective action:** Decide explicitly during Round D whether Indonesian Edge default is `Gadis` (`id-ID-GadisNeural`) everywhere or only for `edgeMeaningVoiceId` vs `Bulk`, update the stale default sites (if unified) + align the HF2 script assertion to the chosen contract.

### Fail 3: `scripts/audit-v603-beta8-p7-hf3-mobile-ui.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p7-hf3-mobile-ui.mjs:46](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p7-hf3-mobile-ui.mjs#L46) (plus version check) — asserts `APP_CHECKPOINT_ID` matches `/V6\.0\.3-BETA8-P7-HF3-MOBILE-UI/` and `APP_VERSION === '6.0.3-beta.8-p7-hf3'`.
- **Root cause:** [appMetadata.js:1-3](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/constants/appMetadata.js#L1-L3) naturally advanced to `'6.0.3-beta.8-p9-hf4d'` and `'V6.0.3-BETA8-P9-HF4D-PLAYER-NAVIGATION'`.
- **Classification:** **Stale expectation (hardcoded version/checkpoint pinning)**.
- **Smallest corrective action:** Relax version/checkpoint checks in historical milestone scripts to assert non-empty format (`/^6\.0\.3-beta\./`) or `>=` baseline version rather than exact string equality.

### Fail 4: `scripts/audit-v603-beta8-p7-ui-simplification.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p7-ui-simplification.mjs:44](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p7-ui-simplification.mjs#L44) — asserts `/data-text-global-tts-only="true"/` in [TextStructuredPlaybackControls.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/text/TextStructuredPlaybackControls.jsx).
- **Root cause & git evidence:** Commit `3f3163d` (`style(hf6): remove duplicate Text source toggle from Player Settings`) intentionally deleted 13 lines containing that duplicate toggle from `TextStructuredPlaybackControls.jsx`. Canonical UI indicator/toggle remains at [TextStructuredAudioControls.jsx:294](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/text/TextStructuredAudioControls.jsx#L294) (`data-text-global-tts-status="true"`) and `BottomPlayerBar.jsx`.
- **Classification:** **Stale expectation (intentional UI deduplication)**.
- **Smallest corrective action:** Point the script assertion to `TextStructuredAudioControls.jsx` (`data-text-global-tts-status="true"`).

### Fail 5: `scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p9-hf4a-card-ux.mjs:82](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs#L82) — asserts `/setPlayingIndex\(step\.highlight \?/` in [textStructuredPlaybackSessionService.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js) (plus `L97` pins `APP_VERSION === '6.0.3-beta.8-p9-hf4a'`).
- **Root cause & git evidence:** Commits `d23eb9c` / `5de05d3` refactored playback highlight assignment in `textStructuredPlaybackSessionService.js` to `setPlayingIndex(null)` ([L216](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L216)) and `setPlayingIndex(suppressHighlight ? null : item.id)` ([L290](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L290)).
- **Classification:** **Stale expectation (refactoring + version pinning)**.
- **Smallest corrective action:** Match `setPlayingIndex(suppressHighlight ? null : item.id)` and decouple exact `APP_VERSION` pin.

### Fail 6: `scripts/audit-v603-beta8-p9-hf4c-player-audio-ux.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p9-hf4c-player-audio-ux.mjs:35](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p9-hf4c-player-audio-ux.mjs#L35) — asserts `APP_VERSION === '6.0.3-beta.8-p9-hf4c'`, actual `'6.0.3-beta.8-p9-hf4d'`.
- **Classification:** **Stale expectation (hardcoded version pinning)**.
- **Smallest corrective action:** Replace strict `===` with `typeof APP_VERSION === 'string' && APP_VERSION.startsWith('6.0.3-beta.8-p9')`.

### Fail 7: `scripts/audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs#L33) — asserts `APP_VERSION === '6.0.3-beta.8-p9-hf4c-r1'`, actual `'6.0.3-beta.8-p9-hf4d'`.
- **Classification:** **Stale expectation (hardcoded version pinning)**.
- **Smallest corrective action:** Same as Fail 6 (`startsWith('6.0.3-beta.8-p9')`).

### Fail 8: `scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs`
- **Failing line & assertion:** [audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs#L834) — asserts `formatTextStructuredBrowserVoiceLabel({ name: 'Microsoft David - English (United States)', lang: 'en-US' })` matches `/Browser TTS/`, actual `'David · US'`.
- **Root cause & git evidence:** Commit `7a56884` (`feat: add voice audio UX features and playback controls for structured text`) introduced `includeEngineHint = false` as default in [textStructuredVoiceAssignmentDomain.js:241,256](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredVoiceAssignmentDomain.js#L241-L256) to keep pill labels compact unless `{ includeEngineHint: true }` is passed explicitly.
- **Classification:** **Stale expectation (intentional UI formatting polish in `7a56884`)**.
- **Smallest corrective action:** Pass `{ includeEngineHint: true }` for the `/Browser TTS/` assertion and add a second assertion that default formatting returns `'David · US'`.

### Fail 9: `scripts/audit-v603-d0-d1-text-identity.mjs`
- **Failing line & assertion:** [audit-v603-d0-d1-text-identity.mjs:229](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-d0-d1-text-identity.mjs#L229) — asserts `treeHash('src/components/table') === '024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767'`, actual `'9b2c8016bab99526bdfcc6e21331c380ec39bdb729972cb0347fdfaa7fca2b03'`.
- **Root cause & git evidence:** Intentional Table UI modularization commits (`d158c73`, `8ce9af4`, `7c7505d`) restructured/added files under `src/components/table/` (`MemoizedRow.jsx`, `AudioDownloadPanel.jsx`, etc.), changing the directory hash relative to the early D0/D1 snapshot.
- **Classification:** **Stale expectation (intentional refactor shifted historical tree hash)**.
- **Smallest corrective action:** Compare against current intentional Table baseline (or git diff against the approved baseline commit rather than a brittle static directory SHA inside source).
