# ProLingo v6 — Internal Audit Master Report

- **Repository:** `nazurinian/prolingo-app`
- **Branch / Baseline:** `fix/text-data-system-boundaries` @ `c3b8f4f`
- **Audit Scope:** Stages 1–6 (P9-B Playback Marathon, P9-C Bulk/Staging/ZIP Marathon, Legacy 30-Script Triage, P10 App-Wide Gap Discovery, Round D Reset Readiness, Build/Lint/Git Hygiene Verification).
- **Strict Read-Only Production Constraint:** **0 lines modified** in `src/`, IndexedDB schemas, persisted user data, or existing `scripts/audit-v*.mjs` files. No commits, pushes, merges, or destructive actions performed.

---

## 1. Deliverable Index

| Deliverable | Purpose | Link |
|---|---|---|
| **P9-B Report** | P9-B Playback Scenarios 1–10 audit & runtime probes | [P9B_Internal_Audit.md](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P9B_Internal_Audit.md) |
| **P9-B Script** | Deterministic Node regression suite (24 checks: 14 pass / 10 fail) | [audit-v603-p9b-playback-marathon.mjs](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs) |
| **P9-C Report** | P9-C Bulk, Audio Staging, Portable ZIP & Export audit (Areas C1–C13) | [P9C_Internal_Audit.md](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P9C_Internal_Audit.md) |
| **P9-C Script** | Deterministic Node regression suite (16 checks: 11 pass / 5 fail) | [audit-v603-p9c-bulk-marathon.mjs](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs) |
| **Legacy Triage** | Run & root-cause classification for all 30 existing scripts | [Legacy_Audit_Failures_Triage.md](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/Legacy_Audit_Failures_Triage.md) |
| **P10 Register** | Consolidated 21-item prioritized Gap Register (`P10-G001`..`P10-G021`) | [P10_Gap_Register.md](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/P10_Gap_Register.md) |
| **Round D Brief** | Reset-to-Defaults architecture hazards & sequencing brief | [Round_D_Implementation_Readiness.md](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/Round_D_Implementation_Readiness.md) |

---

## 2. Verification Channels — Explicit Separation of Evidence

### 2A. Existing Automated Suite (`scripts/audit-*.mjs`: **21 / 30 PASS**)
All 30 pre-existing Node scripts execute offline (zero browser/network calls).
- **21 PASS (`exit 0`):** `v5116-functions`, `a0-a3-rf-portability`, `a4-staging-gc`, `beta4-runtime-ux`, `beta5-testing-clarity`, `beta7-shared-rf-consumer-sync`, `beta8-p1-ordered-multi-audio`, `beta8-p2-split-full-domain`, `beta8-p3-runtime-playback`, `beta8-p4-staging-zip`, `beta8-p5-bulk-generation`, `beta8-p6-bulk-export`, `beta8-p7-hf1-runtime-boot`, `beta8-p9-hf4d-navigation`, `d2-external-json`, `d3-d4-external-reconcile`, `dl-b1-download-batch`, `round-a-d1-d4`, `round-b-d2-d3`, `round-c-taxonomy`, `round-c1-legacy-empty-audio`.
- *Scope caveat:* These scripts confirm domain/storage invariants, boundary isolation (`Round A–C`), and structural source contracts; they do not execute React DOM/Web Speech/IndexedDB in a real browser.

### 2B. New Marathon Suites (**25 Contract PASS / 15 Defect Probes FAIL**)
Both newly added scripts pass `npx eslint` with **0 errors / 0 warnings** (`exit 0`) and fail exit-code `1` solely on explicit `[DEFECT]` probes reproducing unfixed bugs:
- **P9-B Playback (`audit-v603-p9b-playback-marathon.mjs`):** **14 PASS (`[CONTRACT]`) / 10 FAIL (`[DEFECT S1-A..S10-A]`), 24 total**.
  - Verified Contracts: Split segment highlight, Full single-step `FULL_LOCAL`, playback order precedence + fail-closed checks, Global TTS Only override, 6-level Split Browser TTS inheritance, Full ignores segment Browser TTS overrides, Full MP3 fallback chain (`full-local` -> `split-fallback` -> `full-tts-fallback`), Split vs Full navigation wrapping, 120ms Stop/Play transition guard, custom repeat clamping, card-only Shuffle, Stop/Workspace switch cancellation without cursor overwrite, mobile TTS suspend/resume settle, Desktop/Mobile control mount parity.
- **P9-C Bulk/Staging/ZIP (`audit-v603-p9c-bulk-marathon.mjs`):** **11 PASS (`[CONTRACT]`) / 5 FAIL (`[DEFECT P9C-A..P9C-E]`), 16 total**.
  - Verified Contracts: Multi-voice Bulk generation planning, Split RF + Full render fingerprinting, Staging physical GC retention + `table`/`text` partitioning, manifest v2 Portable ZIP parsing & Shared RF fan-out, Bulk Export filtering/deduplication, `AudioContext` guard for derived Full WAV, non-destructive `OTHER_VOICE`/`OTHER_PROFILE`/`STALE` classification, repeat-selection metric idempotence, `DELETE_BLOCK`/`DELETE_DOCUMENT` cascade + GC orphan reclaim, batch scope clamp + empty voice UI support.

### 2C. Pre-Existing Script Failures (**9 / 30 FAIL**)
All 9 existing failures stem from **historical expectations overtaken by later intentional commits** (zero unintended regressions in Table/Boundary/HF6 logic), while surfacing **1 genuine partial-default inconsistency (`P10-G018`)**:
1. `beta6-shared-rf-folder-crash.mjs:25` — checks removed `'Remembered Audio Folder detected'`/`'Reconnect explicitly'` strings (`6580a5d` / `0dd2a61`).
2. `beta8-p7-hf2-global-player-defaults.mjs:152` — expects `edgeMeaningVoiceId === 'su-ID-TutiNeural'`, whereas `fdcf3aa` intentionally changed `edgeMeaningVoiceId` to `'id-ID-GadisNeural'` (and surfaced stale `'su-ID-TutiNeural'` still left on Bulk/Download profiles — `P10-G018`).
3. `beta8-p7-hf3-mobile-ui.mjs:46` — pins outdated `APP_VERSION` / `APP_CHECKPOINT_ID` (`now 6.0.3-beta.8-p9-hf4d`).
4. `beta8-p7-ui-simplification.mjs:44` — checks removed `data-text-global-tts-only="true"` in `TextStructuredPlaybackControls.jsx` (deduplicated intentionally in `3f3163d`).
5. `beta8-p9-hf4a-card-ux.mjs:82,97` — regex `setPlayingIndex(step.highlight ?` overtaken by `d23eb9c` / `5de05d3` (`suppressHighlight ? null : item.id`) + pinned version.
6. `beta8-p9-hf4c-player-audio-ux.mjs:35` — hardcoded `6.0.3-beta.8-p9-hf4c` version pin.
7. `beta8-p9-hf4c-r1-ui-repair.mjs:33` — hardcoded `6.0.3-beta.8-p9-hf4c-r1` version pin.
8. `beta8-p9-hf5-voice-audio-ux.mjs:834` — expects `/Browser TTS/` from `formatTextStructuredBrowserVoiceLabel`, whose `includeEngineHint` default became `false` in `7a56884`.
9. `d0-d1-text-identity.mjs:229` — hardcoded directory SHA-256 of `src/components/table/` shifted by intentional Table modularization commits (`d158c73`, `8ce9af4`, `7c7505d`).

### 2D. Newly Uncovered Runtime-Reproduced Defects (**15 Total**)
- **High Priority (`P1`, 7 runtime + 1 code):**
  - `P10-G001` (`S6-A`): `repeatMode='loop'` with unavailable TTS causes unthrottled infinite spin / UI freeze risk.
  - `P10-G002` (`S1-A`): `FROM_HERE` starting mid-card in `Full` mode replays skipped Segment 1 (`buildTextStructuredSplitRuntimePlan`).
  - `P10-G003` (`S6-B`): `handlePlayerSmartNav` leaks Manual Segment/Card session overrides (`repeatMode`, representation, channel) into Global playback.
  - `P10-G004` (`S7-A`): Stale Shuffle `orderedListOverride` overrides `Sequential` mode on resume / smart nav.
  - `P10-G005` (`S9-A`): `!targetVoice` early return in `playStructuredTextChannel` / `FullStep` blocks native OS Browser TTS fallback.
  - `P10-G006` (`P9C-A`): `handleTextDatabaseBackupRestore` / Pack Sync keep `structuredTextAudioStagingHydratedRef=true` (`App.jsx:626, 4121-4139`), skipping Staging URL re-hydration until reload.
  - `P10-G007` (`P9C-B`): Non-atomic two-DB ZIP import commits Text Library metadata before Staging blob extraction without rollback on error.
- **Medium Priority (`P2`, 8 runtime):**
  - `P10-G009` (`S1-B`): `MediaSession` metadata stays `null` during Full playback (`playingIndex=null`).
  - `P10-G010` (`S2-A`): `resolveStructuredTextBlockChannelPlaybackPlan` ignores `CUSTOM_LOCAL` pin mode in Full playback.
  - `P10-G011` (`S4-A`): `resolveTextStructuredBrowserVoiceResolution` fallback skips `card-speaker` & `document-speaker`.
  - `P10-G012` (`S8-A`): `structuredTextPlaybackSourceStatus` omits `documentId` and is not cleared on Stop / Doc switch / Mode switch.
  - `P10-G013` (`S10-A`): `BottomPlayerBar` receives `textTtsOnly` / `onTextTtsOnlyChange` props without rendering or invoking them.
  - `P10-G014` (`P9C-C`): Card ZIP & Legacy-Batch export handlers (`App.jsx:4819-5102`) omit Ready Edge Full artifacts.
  - `P10-G015` (`P9C-D`): Portable ZIP Split import (`App.jsx:2051-2070`) overwrites runtime URLs without `URL.revokeObjectURL`.
  - `P10-G016` (`P9C-E`): Multi-part Bulk ZIP export loop dispatches consecutive downloads with zero wave yield.

### 2E. Code-Only Findings Not Yet Runtime-Executed (**6 Total**)
- `P10-G008` (**P1**): `clearTableGeneratedAudioRam()` ([App.jsx:6308-6315](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6308-L6315)) and `clearAudioStagingForMode()` ([audioStagingIndexedDbService.js:288-300](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L288-L300)) invoke global `clearAudioStagingRuntimeCache()` instead of mode-scoped `clearAudioStagingRuntimeCacheForMode(...)`, causing Table Clear RAM to revoke active Text Staging ObjectURLs.
- `P10-G017` (**P2**): `textAudioStagingGcService.js` drops `STALE` Full blobs on text edits while keeping `STALE` Split blobs; plus `textStructuredAudioCoverageDomain.js:23-26` gates slot readiness strictly on `source === 'generated' && engine === 'edge'`.
- `P10-G018` (**P2**): `fdcf3aa` default split (`edgeMeaningVoiceId: 'id-ID-GadisNeural'` vs `bulkMeaningVoiceIds`/`bulkExportMeaningVoiceId`/`audioDownloadProfileV1`/`edgeIndonesianVoice` on `'su-ID-TutiNeural'`).
- `P10-G019` (**P3**): Root unmount cleanup (`App.jsx:372-382`) omits Table/Legacy runtime ObjectURL maps (`localAudioMapTable`, `localAudioMapText`, `tableAudioFolderVariantInventory`, `tableAudioZipRuntimeCache`).
- `P10-G020` (**P3**): Unused orphan UI modules ([Sidebar.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/Sidebar.jsx), [ControlSectionTabs.jsx](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/controls/ControlSectionTabs.jsx)).
- `P10-G021` (**P3**): Synchronous `window.confirm` for empty Book Collection delete ([TextLibraryShell.jsx:612](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/text/TextLibraryShell.jsx#L612)) + missing Text runtime cache / orphan GC action in System Storage.

---

## 3. Build, Lint & Git Workspace Health (Freshly Executed)

- **`npm run build` (`vite build`):** **PASS (`exit 0`)** — `1886 modules transformed`, built in `7.06s` (standard Vite >500KB chunk notice only).
- **`npm run lint` (`eslint .`):** **FAIL (`exit 1`)** — `597 problems (514 errors, 83 warnings)` because `eslint.config.js` ignores only `dist` and scans `.backup/**` & `_backup_app_v5116.jsx`.
- **Active `src/` ESLint (`npx eslint src/ --ignore-pattern "src/_backup_app_v5116.jsx"`):** **FAIL (`exit 1`)** — `318 problems (239 errors, 79 warnings)` pre-existing lint debt.
- **New Marathon Scripts ESLint:** **PASS (`exit 0`)** — `0 errors / 0 warnings` on both new `.mjs` audit scripts.
- **Git Cleanliness (`git status --short` / `git diff --stat`):** `0` changes in `src/` or existing `scripts/audit-v*.mjs`. Pre-existing `M docs/M1_FUNCTION_WIRING_AUDIT.md` left untouched; all 7 new audit deliverables sit untracked cleanly in root / `scripts/`.

---

## 4. Recommended Remediation & Round D Sequencing

1. **Pre-Round D Hardening Patch (Smallest Safe Batch):** Fix `P10-G001` (Loop spin yield), `P10-G005` (null-voice native TTS fallback), `P10-G004` (`orderedListOverride` reset on `Sequential`), and `P10-G008` (mode-scoped `clearAudioStagingRuntimeCacheForMode`), plus ratify `P10-G018` Indonesian Edge voice defaults (`Gadis` vs `Tuti`).
2. **P9-B Playback Bugs:** Fix `P10-G002` (`FROM_HERE` Full slice), `P10-G003` (`handlePlayerSmartNav` session isolation), `P10-G009` (`MediaSession` in Full), `P10-G010` (`CUSTOM_LOCAL` in Full), `P10-G011` (speaker fallback hierarchy), `P10-G012` (`documentId`-scoped source badge), and decide `P10-G013` (`BottomPlayerBar` TTS-only props).
3. **P9-C Storage/ZIP Bugs:** Fix `P10-G006` (reset `structuredTextAudioStagingHydratedRef` on DB Restore / Pack Sync), `P10-G007` (atomic ZIP import ordering/rollback), `P10-G014` (Edge Full Card/Batch export), `P10-G015` (revoke overwritten ZIP runtime URLs), and `P10-G016` (multi-part ZIP wave delay).
4. **Round D Reset Implementation:** Follow [Round_D_Implementation_Readiness.md](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/Round_D_Implementation_Readiness.md) to keep `speakerRegistryV1`, `speakerIdentityV1`, `fullAudioArtifactsV1`, `audioVariants`, Staging Blobs, and Table/Legacy datasets strictly untouched.

---

## 5. Manual Browser Acceptance Checklist (Required From User)

Because automated Node harnesses cannot drive real browser `Audio`, Web Speech API, IndexedDB transactions, lock-screen widgets, or responsive CSS layout:
1. **Loop + No/System-Default Voice (`P10-G001`, `P10-G005`):** Verify Loop playback on Paragraph/Conversation with System Default voice neither mutes playback nor freezes browser tab.
2. **Full Mode `FROM_HERE`, `MediaSession` & Nav (`P10-G002`, `P10-G003`, `P10-G004`, `P10-G009`, `P10-G012`):** In `Full` representation, play from mid-card (Segment 2+), verify Seg 1 is NOT replayed, OS Media widget shows metadata, Next/Prev after manual Seg play returns to Global settings, toggling Shuffle -> Sequential restores Card 1->N order, and switching documents clears source status badge.
3. **Text DB Backup Restore & Pack Sync (`P10-G006`):** Restore a Text DB backup containing Staging-backed audio variants and play immediately **without refreshing page**.
4. **Card ZIP Export & Multi-Part Bulk ZIP (`P10-G014`, `P10-G016`):** Export Single Card ZIP with Full audio generated and verify `.mp3` contents; export large workspace generating 2+ ZIP parts and confirm Chromium downloads all parts cleanly.
5. **Table Clear Audio RAM vs Text Staging (`P10-G008`):** Hydrate/play Structured Text Staging audio -> switch to Table -> click **Clear Audio RAM** -> return to Text and confirm Text audio still plays without reload.
6. **Desktop vs Mobile UI Parity (`P10-G013`, `P10-G021`):** Inspect `BottomPlayerBar` controls vs Sidebar `TextStructuredAudioControls` and test Book Collection deletion UX on desktop & mobile viewport.

