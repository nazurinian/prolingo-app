# P9-C Internal Audit: Bulk Generation, Audio Staging, Portable ZIP & Export (`c3b8f4f`)

- **Repository / Baseline:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries` @ `c3b8f4f`
- **Automated Audit Script:** [audit-v603-p9c-bulk-marathon.mjs](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9c-bulk-marathon.mjs)
- **Execution Result (`EXIT: 1` intentional defect-probe exit):** **11 PASS (`[CONTRACT]`), 5 FAIL (`[DEFECT]` probes `P9C-A`..`P9C-E`), 16 total assertions**; `npx eslint` on script exits `0` with zero issues.
- **Safety Constraint Check:** Zero modifications to `src/`, schemas, persisted user data, or existing `scripts/audit-v*.mjs`.

---

## 1. Automated Probe Summary (`audit-v603-p9c-bulk-marathon.mjs`)

| Probe ID | Area | Type | Outcome | Observed Summary |
|---|---|---|---:|---|
| `C1` | Bulk Generation Planning | `[CONTRACT]` | **PASS** | Plans Split + Full across Paragraph cards, skips Conversation blocks, deduplicates physical renders, separates Stale |
| `C2` | Render Fingerprinting | `[CONTRACT]` | **PASS** | Split RF & Full artifact fingerprints react to content, voice, engine, rate, and pitch mutations |
| `C4` | Staging Physical GC | `[CONTRACT]` | **PASS** | Preserves active Split RF & Full artifact blobs, isolates `table` vs `text` Staging records, detects true orphans |
| `C5` | Portable ZIP Parsing | `[CONTRACT]` | **PASS** | `buildStoredZipBlob -> scanTextStructuredAudioZipFiles` handles manifest v2, Split+Full binaries, Shared RF fan-out & orphans |
| `C6` (Bulk) | Bulk Export Plan | `[CONTRACT]` | **PASS** | Filters Stale, honors `voicePolicy` (`preferred`/`selected`/`all-selected`), deduplicates physical keys |
| **`C6` (`P9C-C`)** | Card & Legacy-Batch Export | `[DEFECT]` | **FAIL** | `handleStructuredTextExportCardZip` & `ExportFullCardAudio` ignore Ready Edge Full artifacts (`App.jsx:4819-5102`) |
| `C7` | Profile / Text Changes | `[CONTRACT]` | **PASS** | Preference changes mark `OTHER_VOICE`/`OTHER_PROFILE`; text edits mark `STALE`; physical Staging blobs stay intact |
| **`C8` (`P9C-A`)** | Restore / Sync Hydration | `[DEFECT]` | **FAIL** | `handleTextDatabaseBackupRestore` / Pack Sync keep `structuredTextAudioStagingHydratedRef=true` (`App.jsx:626, 4121-4139`) |
| **`C9` (`P9C-B`)** | Two-DB ZIP Import Atomicity | `[DEFECT]` | **FAIL** | Materializes Text Library variant/Full metadata before blob decompression/staging with no rollback on error |
| `C9` | Deduplicated Bulk Metrics | `[CONTRACT]` | **PASS** | Repeated generation requirements do not inflate unique/reusable physical render counters |
| `C10` | Cascade Delete + GC | `[CONTRACT]` | **PASS** | `DELETE_BLOCK` & `DELETE_DOCUMENT` remove child segments & `audioVariants`, allowing Staging GC to reclaim orphans |
| `C11` | Derived Full WAV Helper | `[CONTRACT]` | **PASS** | Enforces `AudioContext` requirement cleanly and formats canonical Full filename |
| `C12` | Batch Scope & Voice Clamp | `[CONTRACT]` | **PASS** | Deterministic workspace/collection/card scope resolution + `allowEmptyVoiceSelection=true` UI zeroing support |
| **`C13` (`P9C-D`)** | ZIP Split URL Revocation | `[DEFECT]` | **FAIL** | `handleStructuredTextAddAudioZipFiles` overwrites `next[match.variant.id]` without `URL.revokeObjectURL` (`App.jsx:2051-2070`) |
| **`C13` (`P9C-E`)** | Multi-Part ZIP Download Wave | `[DEFECT]` | **FAIL** | Multi-part Bulk Export loop calls `triggerBrowserZipDownload` back-to-back without browser download throttling yield |

---

## 2. Detailed Domain Findings (Areas C1–C13)

### C1 & C2 — Multi-Voice Bulk Generation & Fingerprinting
- **Verified Behavior:** Domain planning separates Paragraph vs Conversation blocks cleanly, computes deterministic content/voice/engine/rate/pitch fingerprints (`contentFingerprint` / `contentFingerprintV2`), deduplicates identical physical renders, and tracks reusable vs net-new renders cleanly (`[C1]`, `[C2]`, `[C9]`).
- **Default Consistency Note:** [textStructuredAudioGenerationDomain.js:16,24,32](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L16-L32) uses `'id-ID-GadisNeural'` for `edgeMeaningVoiceId` (`fdcf3aa`) while `bulkMeaningVoiceIds` (`['su-ID-TutiNeural']`), `bulkExportMeaningVoiceId` (`'su-ID-TutiNeural'`), and [textStructuredAudioDownloadProfileDomain.js:165](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioDownloadProfileDomain.js#L165) remain on `'su-ID-TutiNeural'` (tracked as `P10-G018`).

### C3 — Slot Coverage & External Audio Readiness Gate
- **Observed Code Invariant:** In [textStructuredAudioCoverageDomain.js:23-26](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioCoverageDomain.js#L23-L26), `variantsForSlot` requires `source === 'generated'` and `engine === 'edge'`, excluding imported ZIP/Folder audio or non-Edge generated audio from Edge readiness counts (tracked in `P10-G017`).

### C4 & C10 — Audio Staging IndexedDB, GC Policy & Cross-Mode Isolation
- **Contract Verified:** Active Split RF & Full artifact blobs are retained, Table (`mode: 'table'`) and Text (`mode: 'text'`) entries stay partitioned, and `DELETE_BLOCK` / `DELETE_DOCUMENT` cascade cleanly (`[C4]`, `[C10]`).
- **Defect / Policy Asymmetry Found:**
  1. **`P10-G017` (GC Split vs Full Asymmetry):** `textAudioStagingGcService.js` drops stale `Full` Staging blobs upon text edits (because the unmatching `fullArtifactFingerprint` is no longer in current block descriptors), while `STALE` `Split` blobs remain pinned behind variant rows until explicit removal.
  2. **`P10-G008` (Table/Text Runtime Cache Leak):** [App.jsx:6308-6315](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6308-L6315) (`clearTableGeneratedAudioRam`) and [audioStagingIndexedDbService.js:288-300](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/persistence/audioStagingIndexedDbService.js#L288-L300) (`clearAudioStagingForMode`) call global `clearAudioStagingRuntimeCache()` instead of mode-scoped `clearAudioStagingRuntimeCacheForMode(...)`, revoking Structured Text's cached Staging ObjectURLs from Table actions.

### C5, C6 & C11 — Portable ZIP, Bulk Export & Card Export Exclusions
- **Verified Contract:** Manifest v2 Portable ZIP parsing & Shared RF fan-out (`[C5]`), Bulk Export deduplication/filtering (`[C6]`), and `AudioContext`-guarded Full WAV derivation (`[C11]`) pass in Node.
- **Confirmed Defect (`P9C-C` / `P10-G014`):** Card-level and legacy-batch export handlers ([App.jsx:4819-5102](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4819-L5102): `handleStructuredTextExportCardZip`, `handleStructuredTextExportFullCardAudio`, `handleStructuredTextBatchExportReadyMp3`, `handleStructuredTextBatchExportConsolidatedZip`) ignore Ready Edge `Full` artifacts and process only Split variants.

### C7, C8 & C9 — Non-Destructive Preference Drift, Restore Desync & Import Atomicity
- **Verified Contract:** Voice/profile edits reclassify variants into `OTHER_VOICE`/`OTHER_PROFILE` and text edits produce `STALE` without deleting Staging blobs (`[C7]`).
- **Confirmed Defect (`P9C-A` / `P10-G006`):** [App.jsx:4121-4139](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4121-L4139) (`handleTextDatabaseBackupRestore`) and Pack Sync leave `structuredTextAudioStagingHydratedRef.current = true` ([App.jsx:626](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L626)), preventing runtime `structuredTextAudioRuntimeUrls` / `structuredTextFullAudioRuntimeUrls` re-hydration from Staging IDB without a page reload.
- **Confirmed Defect (`P9C-B` / `P10-G007`):** Portable ZIP import writes Text Library `audioVariants` and `fullAudioArtifacts` metadata before reading/staging ZIP binary blobs, with no rollback if mid-archive blob decompression fails.

### C12 & C13 — Batch Scope, Blob Revocation & Browser Download Waves
- **Verified Contract:** Batch workspace target resolution (`workspace`/`collection`/`selected`/`all`) and empty-voice UI handling pass (`[C12]`).
- **Confirmed Defect (`P9C-D` / `P10-G015`):** Portable ZIP Split import ([App.jsx:2051-2070](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L2051-L2070)) overwrites `next[match.variant.id]` without calling `URL.revokeObjectURL(previous?.url)` (unlike Folder import at `L1937`).
- **Confirmed Defect (`P9C-E` / `P10-G016`):** Multi-part Bulk Export ZIP loops invoke `triggerBrowserZipDownload` consecutively with no wave yield, risking browser multi-download blocking (requires browser verification).
