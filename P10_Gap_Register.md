# P10 App-Wide Gap Register (ProLingo v6)

- **Repository / Baseline:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries` @ `c3b8f4f`
- **Audit Scope:** Consolidated internal runtime + code-level gaps across **P9-B Playback**, **P9-C Bulk/Staging/ZIP**, **Legacy Audit Triage**, and **Stage 4 App-Wide Discovery** (`Table`, `Legacy Text`, `Paragraph`, `Conversation`, `Mixed`).
- **Safety Constraint Check:** Zero production source files modified; all gaps require bounded future fix rounds.

---

## Summary by Severity & Confidence

| Severity | Count | Gap IDs |
|---|---:|---|
| **P1 (High / Functional or Data Integrity)** | 8 | `P10-G001` – `P10-G008` |
| **P2 (Medium / Voice, UI Parity, Export, Leak)** | 10 | `P10-G009` – `P10-G018` |
| **P3 (Low / Cleanup, UX Consistency)** | 3 | `P10-G019` – `P10-G021` |

| Confidence Tag | Meaning | Count |
|---|---|---:|
| `Confirmed Runtime` | Deterministically reproduced by executing `audit-v603-p9b-playback-marathon.mjs` or `audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT]` probes) | 15 |
| `Confirmed Code` | Directly observed in source code paths & cross-module invariants | 6 |

---

## Detailed Gap Register

### `P10-G001` — Unthrottled Spin Loop on `repeatMode=loop` When TTS Fails/Resolves Synchronously
- **Category:** Playback Reliability / Browser Freeze Hazard
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S6-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S6-A]`): 100 consecutive loop passes execute with zero inter-pass delay when channel resolves immediately (`unavailable TTS voice` / missing `SpeechSynthesisUtterance`). Related playback runtime loop in [textStructuredPlaybackSessionService.js](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js).
- **Repro Condition:** Set repeat mode to Loop, enable TTS path on an environment where voice lookup fails or `SpeechSynthesisUtterance` resolves immediately, and press Play.
- **Bounded Fix Direction:** Enforce a minimum async yield (e.g. `waitPlaybackDelay` floor / consecutive immediate-error circuit breaker) between loop iterations.
- **Required Test:** Extend Node P9-B `S6-A` contract to pass cleanly + browser smoke check when Web Speech API is unavailable.
- **Manual Browser Check Required:** Yes (verify UX stops or throttles safely without tab hang).

---

### `P10-G002` — `FROM_HERE` Starting Mid-Card in `Full` Representation Replays Segment 1
- **Category:** Playback Ordering / Cursor Fidelity
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S1-A`)
- **Affected Modes:** Structured Text `Full` mode (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S1-A]`): starting `FROM_HERE` at `SEGMENT_000002` inside a multi-segment card yields `["SEGMENT_000001","SEGMENT_000002","SEGMENT_000003", ...]`, replaying Seg 1 before advancing.
- **Repro Condition:** Enable `Full` global representation, trigger "Play from here" on Segment 2 of Card 1.
- **Bounded Fix Direction:** In `Full` representation plan resolution, either play from the clicked card's Full artifact (skipping prior segments of Card 1) or slice remaining segments cleanly without prepending Seg 1.
- **Required Test:** Flip P9-B `S1-A` probe from `[DEFECT]` into enforced `[CONTRACT]`.
- **Manual Browser Check Required:** Yes (click mid-card "From Here" in `Full` mode and verify audio/highlight).

---

### `P10-G003` — `handlePlayerSmartNav` Leaks Temporary Manual Override Settings Into Global Playback
- **Category:** Global vs Manual Session Isolation
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S6-B`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S6-B]`): `handlePlayerSmartNav` unconditionally inherits `session.repeatMode`, `playbackRepresentationMode`, and `playbackChannelMode` even when the prior active session was a scoped manual Segment/Card play.
- **Repro Condition:** Manually play a single Segment with Loop or temporary Split override, then click Global Prev/Next (`handlePlayerSmartNav`).
- **Bounded Fix Direction:** Distinguish global session state from ephemeral manual Segment/Card session profile so global Prev/Next reads global settings unless global session itself owns those overrides.
- **Required Test:** Flip P9-B `S6-B` into `[CONTRACT]` assertion.
- **Manual Browser Check Required:** Yes.

---

### `P10-G004` — Stale `orderedListOverride` Overrides `Sequential` Mode
- **Category:** Playback Order / Shuffle State Leak
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S7-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S7-A]`): switching back to `Sequential` still resolved shuffled order `["SEGMENT_000006","SEGMENT_000004","SEGMENT_000005",...]` due to stale `orderedListOverride`.
- **Repro Condition:** Enable Shuffle, play or pause, switch `playbackOrderMode` back to Sequential, trigger playback/smart nav.
- **Bounded Fix Direction:** Clear or ignore `orderedListOverride` whenever `playbackOrderMode !== 'shuffle'` (and clear cached override on mode/order transitions).
- **Required Test:** Flip P9-B `S7-A` into `[CONTRACT]` assertion.
- **Manual Browser Check Required:** Yes.

---

### `P10-G005` — Missing Null-Voice Fallback Skips Native Browser TTS Completely
- **Category:** Browser TTS Resilience
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-B `S9-A`)
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** `scripts/audit-v603-p9b-playback-marathon.mjs` (`[DEFECT S9-A]`): `playStructuredTextChannel` / `FullStep` in `src/App.jsx` return early when `!targetVoice`, contradicting `executeBrowserTtsPlaybackService`'s native system-default TTS fallback policy.
- **Repro Condition:** Device/browser where `speechSynthesis.getVoices()` returns empty or matching voice object is `null`.
- **Bounded Fix Direction:** Delegate to `executeBrowserTtsPlaybackService` with `overrideVoice = null` when TTS is intentionally requested instead of returning early on `!targetVoice` (note `P10-G001` throttle guard must accompany this if `SpeechSynthesisUtterance` itself is missing).
- **Required Test:** Flip P9-B `S9-A` into `[CONTRACT]`.
- **Manual Browser Check Required:** Yes (test with System Default Browser TTS).

---

### `P10-G006` — Text DB Restore / Pack Sync Skips Staging Runtime ObjectURL Re-Hydration
- **Category:** Storage / Runtime State Desync
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-C `P9C-A`) & `Confirmed Code`
- **Affected Modes:** Structured Text (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:** [App.jsx:4121-4139](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4121-L4139) (`handleTextDatabaseBackupRestore`) and [App.jsx:626](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L626); P9-C probe `[DEFECT P9C-A]`. `structuredTextAudioStagingHydratedRef.current` stays `true`, so runtime ObjectURL maps (`structuredTextAudioRuntimeUrls` & `structuredTextFullAudioRuntimeUrls`) are neither cleared nor re-bound from IndexedDB Staging after restore/merge.
- **Repro Condition:** Import a Text DB Backup or Pack Sync referencing Staging blobs already present in `Audio Staging IDB` during an active session without refreshing the page.
- **Bounded Fix Direction:** Reset `structuredTextAudioStagingHydratedRef.current = false` (or trigger an explicit bounded Staging re-hydration pass for active variant/full fingerprints) inside backup restore & Pack Sync completion handlers.
- **Required Test:** Flip P9-C `P9C-A` + add headless browser/IDB restore test.
- **Manual Browser Check Required:** Yes (verify audio plays immediately after DB restore without page reload).

---

### `P10-G007` — Non-Atomic Two-DB Portable ZIP Import Without Rollback on Failure
- **Category:** Data Integrity / Transaction Safety
- **Severity / Confidence:** `P1` | `Confirmed Runtime` (P9-C `P9C-B`)
- **Affected Modes:** Structured Text Portable ZIP Import
- **Primary Evidence:** `scripts/audit-v603-p9c-bulk-marathon.mjs` (`[DEFECT P9C-B]`): ZIP import writes `audioVariants` / `fullAudioArtifacts` metadata into Text Library IDB before extracting and storing binary blobs into Audio Staging IDB, with no compensation/rollback if blob decompression fails mid-stream.
- **Repro Condition:** Import a Portable ProLingo ZIP containing valid manifest + corrupt/truncated `.mp3` entry mid-archive.
- **Bounded Fix Direction:** Extract/validate & stage binary blobs into temporary/Staging entries first (or clean up committed Text Library variant metadata on Staging write failure before updating UI coverage).
- **Required Test:** Flip P9-C `P9C-B` with corrupt-entry ZIP fixture asserting zero dangling `audioVariants` metadata.
- **Manual Browser Check Required:** Optional (covered well by simulated IDB/JSZip fault injection).

---

### `P10-G008` — Table "Clear Audio RAM" (`clearAudioStagingRuntimeCache()`) Revokes Text Staging ObjectURLs
- **Category:** Table/Text Boundary Isolation Leak
- **Severity / Confidence:** `P1` | `Confirmed Code`
- **Affected Modes:** `Table` -> impacts `Structured Text` (`Paragraph`, `Conversation`, `Mixed`)
- **Primary Evidence:**
  - [App.jsx:6308-6315](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6308-L6315): `clearTableGeneratedAudioRam()` invokes `clearAudioStagingRuntimeCache()` (global across ALL modes) instead of `clearAudioStagingRuntimeCacheForMode('table')` ([audioStagingIndexedDbService.js:241](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L241)).
  - [audioStagingIndexedDbService.js:288-300](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L288-L300): `clearAudioStagingForMode(mode)` likewise clears the whole global runtime cache at `L300` instead of calling `clearAudioStagingRuntimeCacheForMode(mode)`.
- **Repro Condition:** Play/hydrate Staging audio in Structured Text, switch to Table, click **Clear Audio RAM** (or clear Table Staging), switch back to Text -> active Text Staging blob URLs have been revoked.
- **Bounded Fix Direction:** Replace `clearAudioStagingRuntimeCache()` with `clearAudioStagingRuntimeCacheForMode('table')` in `clearTableGeneratedAudioRam()` and `clearAudioStagingRuntimeCacheForMode(mode)` in `clearAudioStagingForMode()`.
- **Required Test:** Node unit test verifying `clearAudioStagingRuntimeCacheForMode('table')` preserves `'text'` ObjectURLs while revoking `'table'` URLs.
- **Manual Browser Check Required:** Yes (verify playing Text Staging audio after Table Clear RAM).

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
- **Category:** Memory / Blob URL Leak
- **Severity / Confidence:** `P2` | `Confirmed Runtime` (P9-C `P9C-D`) & `Confirmed Code`
- **Affected Modes:** Structured Text Portable ZIP Import
- **Primary Evidence:** [App.jsx:2051-2070](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L2051-L2070) (`handleStructuredTextAddAudioZipFiles`) assigns `next[match.variant.id]` without calling `URL.revokeObjectURL(previous?.url)` (whereas Folder import at [App.jsx:1937](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1937) properly revokes `previous?.url`).
- **Bounded Fix Direction:** Call `if (previous?.url && previous.url !== nextUrl) try { URL.revokeObjectURL(previous.url); } catch {}` on overwrite in `handleStructuredTextAddAudioZipFiles`.
- **Required Test:** Flip P9-C `P9C-D` into `[CONTRACT]`.
- **Manual Browser Check Required:** No (fully testable via Node/DOM mock).

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
