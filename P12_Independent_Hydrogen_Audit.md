# P12 Conversation Only & P13 Mixed Architecture — Independent Source Audit

**Repository:** `nazurinian/prolingo-app`  
**Branch:** `fix/text-data-system-boundaries`  
**Verified Baseline Commit:** `8fd8c38aa9898f8ccf2d1b83794b24d902c6a6db` (`Merge Text audio UI acceptance hotfix (PR #3)`)  
**Issue Reference:** GitHub Issue #4 — *P12/P13 preflight — independent Conversation Only + Mixed source audit (READ ONLY)*  
**Auditor:** Gemini 4 Hydrogen  
**Audit Mode:** Strictly Read-Only (zero tracked source modifications, no branches, no merges, no fixes implemented; completed independently prior to viewing any external audit reports)

---

## 1. Scope, Methodology & External Fixture Disclosure

This report audits the ProLingo Text Library codebase at commit `8fd8c38aa9898f8ccf2d1b83794b24d902c6a6db` across the six architectural areas required for **P12 (`conversation-only`)** and **P13 (`mixed`)** readiness:

1. Data model, external JSON import/export, and `update-existing` reconciliation
2. Speaker identity, registry mutations, and structured editor authoring
3. Voice, playback speed, Custom Local voice, Edge Download voice inheritance, and Speaker Sync
4. Workspace / Speaker / Card / Segment Reset semantics and dirty-state detection
5. Runtime playback and Split vs Full routing (`LOCAL_FIRST`, `TTS_ONLY`, derived WAV, Full TTS)
6. Audio generation, `audioRenderFingerprintV1` (`rf`), coverage, staging GC, Bulk Audio, Batch Popup, and ZIP export/import

### Fixture Availability & Unrun Runtime Checks
- **Inspected in-repo fixtures & demos:**
  - `scripts/fixtures/v603-d2-external-mix-example.json` (`L1-141`)
  - Built-in demo `Demo • Conversation • 3 Speakers` in `src/components/text/TextLibraryShell.jsx:87-119`
- **External fixtures not readable in workspace sandbox:**
  - `C:\Users\HikamSeif\Downloads\P12_Conversation_Only_Additional_Test_v1.json` and `C:\Users\HikamSeif\Downloads\P13_Mixed_Additional_Test_v1.json` referenced in Issue #4 reside outside the active workspace directory (`prolingo-app`) and could not be read or executed directly against IndexedDB/Web Speech/Edge TTS in a live browser session during this read-only source audit.
  - All schema validation, reconciliation, taxonomy, playback-plan, and export paths for `conversation-only` and `mix` payloads were traced directly in source.

---

## 2. Executive Summary

| Category | Count | Summary |
| --- | --- | --- |
| **Confirmed Bugs / Defects** | **10** (`8 × P1`, `2 × P2`) | Critical data loss in external JSON `update-existing`, total Conversation exclusion in Bulk Generate/Export, broken Mixed Custom Local Speaker Sync, broken Speaker Sync fallback/precedence in `App.jsx`, stale metadata overwrites on first speaker edit, wrong Full-mode voice/fallback handling on multi-speaker Conversation cards, object-vs-string `speakerIdentityV1` bug in Card Audio UI, unhandled duplicate speaker crash, and non-atomic speaker mutations. |
| **Source-Level Risks / Hypotheses** | **3** | Card Audio player hierarchy header misleading labels on Conversation cards, Split/Merge guard edge cases across Mixed cards, and `inferDocumentType` auto-demotion hiding `speakerRegistryV1`. |

**Readiness Verdict at `8fd8c38`:** **NO-GO** for both P12 (`conversation-only`) and P13 (`mixed`). Neither mode can pass end-to-end acceptance until `DEFECT-01` through `DEFECT-08` (blocking `P1` defects) and `DEFECT-09`/`DEFECT-10` (`P2` UI & registry integrity defects) are remediated and covered by automated + browser tests.

---

## 3. Architectural Analysis Across the 6 Issue #4 Audit Questions

### Audit Area 1 — Data Model, Import/Export & Reconciliation
*Primary files:* `src/domain/text/textExternalJsonDomain.js`, `src/domain/text/textExternalReconciliationDomain.js`, `src/domain/text/textWorkspaceTaxonomyDomain.js`

- **Schema & Taxonomy:**
  - `validateTextExternalJsonPayload` (`src/domain/text/textExternalJsonDomain.js:116-248`) validates `schemaVersion: 1`, `workspace.mode` (`paragraph-only`, `conversation-only`, `mix`), requires non-empty `speakers[]` for `conversation` cards (`L196-205`), and forbids `speakers[]` on `paragraph` cards (`L207-210`).
  - `src/domain/text/textWorkspaceTaxonomyDomain.js:14-60` normalizes internal `documentType` (`paragraph` | `conversation` | `mixed`) to external modes (`paragraph-only` | `conversation-only` | `mix`) and computes effective taxonomy from blocks via `inferTextWorkspaceTaxonomyFromBlocks` (`L35-44`).
- **Import & Baseline Tracking:**
  - `buildTextStructuredTreeFromExternalPayload` (`src/domain/text/textExternalJsonDomain.js:338-496`) derives deterministic `SPK_EXT_${hashString(...)}` IDs (`L357`), stores `speakerRegistryV1` on `document.metadata` (`L350-369`), stamps `externalEntityV1` on cards (`L436-442`) and segments (`L464-472`), and records baseline hashes in `document.metadata.externalImportV1` (`L477-485`).
- **Round-Trip Export:**
  - `exportTextStructuredWorkspaceToExternalJson` (`L501-593`) emits valid v1 payloads with `workspace.mode`, deduplicated `speakers[]`, `cards[]`, and `segments[]`.
- **Reconciliation Failures (`planTextExternalUpdateExisting`, `src/domain/text/textExternalReconciliationDomain.js:194-416`):**
  - **DEFECT-01 (`P1` Data Loss):** `nextBlocks` (`L251`) and `nextSegments` (`L252`) strip every block and segment belonging to the target document and only reconstruct items matched from `payload` or indexed by `externalEntityV1.cardKey` / `segmentKey` (`L295-296`). Any user-added local Card or Segment lacks `externalEntityV1` and is permanently deleted. Similarly, `buildIncomingSpeakerMap` (`L152`) filters `existingRegistry` with `.filter(item => clean(item?.externalKey))`, dropping locally registered speakers on update.
  - **DEFECT-02 (`P1` Conflict Detection Bypass):** `buildTextExternalLocalEntityFingerprints` (`src/domain/text/textExternalJsonDomain.js:650-652`) computes `speakerKey` as `clean(segmentMeta?.speakerKey) || resolveSpeakerKeyForLocalSegment(...)`. Because `segmentMeta.speakerKey` (written at initial import at `L467`) is never updated when a user reassigns a segment's speaker in the UI, `resolveSpeakerKeyForLocalSegment` is dead code for imported segments; local speaker edits stay invisible to conflict detection and are silently overwritten even when `conflictPolicy === 'keep-local'`.
  - **DEFECT-03 (`P1` Speaker Rename Desync):** When external JSON updates a speaker's `displayName` without changing `speakerKey` or segment text/meaning, `buildIncomingSpeakerMap` (`textExternalReconciliationDomain.js:170`) updates `speakerRegistryV1.label`, but `segDecision.action === 'local'` (`L348-349`) preserves the old `segment` object verbatim with its stale `segment.speaker` string.
  - **DEFECT-10c (`P2` Non-deterministic Speaker ID):** New speakers introduced during `update-existing` receive random UID suffixes `SPK_EXT_${speakerUid...slice(-10)}` (`L158-159`) instead of `SPK_EXT_${hashString(...)}` used on initial import (`textExternalJsonDomain.js:357`).

---

### Audit Area 2 — Speaker Identity, Registry & Authoring
*Primary files:* `src/domain/text/textStructuredSpeakerIdentityDomain.js`, `src/components/text/TextStructuredSpeakerRegistry.jsx`, `src/components/text/TextStructuredEditor.jsx`, `src/domain/text/textLibraryCommandDomain.js`

- **Speaker Identity Domain:**
  - `src/domain/text/textStructuredSpeakerIdentityDomain.js:1-150` defines `speakerIdentityV1: { version: 1, speakerId }` (`L24-27`), case-insensitive `normalizeTextStructuredSpeakerKey`, `buildTextStructuredUpsertSpeakerRegistryMetadata` (`L51-95`), `resolveTextStructuredSegmentSpeakerEntry` (`L97-105`), and `collectTextStructuredConversationSpeakerIdentities` (`L107-150`).
- **Speaker Registry UI & Authoring Issues:**
  - `TextStructuredSpeakerRegistry` (`src/components/text/TextStructuredSpeakerRegistry.jsx:1-134`) is mounted when `hasConversationCards` (`src/App.jsx:5796`).
  - **DEFECT-10a (`P2`):** `buildTextStructuredUpsertSpeakerRegistryMetadata` throws synchronously (`L63-81`) on duplicate speaker labels; `registerSpeaker` (`TextStructuredSpeakerRegistry.jsx:35`) and `saveRename` (`L75`) call it inside async handlers without `try/catch`, producing unhandled promise rejections with no user-facing validation feedback.
  - **DEFECT-10b (`P2`):** Adding or renaming a speaker dispatches `1` `UPDATE_DOCUMENT` + `N` sequential `UPDATE_SEGMENT` commands (`L35-47, L75-88`), triggering `N+1` IndexedDB transactions and `N+1` `runStructuredTextAudioStagingGc` sweeps (`src/App.jsx:4468`), risking partial persistence on failure.
  - **Authoring & Block Taxonomy:** `textLibraryCommandDomain.js:165-169, 211-318, 470-620` enforces `splitParagraphSegment` (`L522`) and `mergeParagraphSegments` (`L581`) guards for `block.blockType === 'conversation'`, while `inferDocumentType` (`L165-169`) automatically promotes `'paragraph'` -> `'mixed'` when a conversation block is added and demotes `'mixed'` -> `'paragraph'` if the last conversation block is removed (`RISK-03`).

---

### Audit Area 3 — Voice, Playback Rate, Custom Local & Edge Download Inheritance + Speaker Sync
*Primary files:* `src/domain/text/textStructuredVoiceAssignmentDomain.js`, `src/domain/text/textStructuredSpeakerVoiceProfileDomain.js`, `src/domain/text/textStructuredAudioSyncProfileDomain.js`, `src/domain/text/textStructuredPlaybackRateProfileDomain.js`, `src/domain/text/textStructuredLocalAudioProfileDomain.js`, `src/domain/text/textStructuredAudioDownloadProfileDomain.js`, `src/App.jsx`

- **Inheritance & Sync Model:**
  - Domain resolvers support Segment override -> Card Speaker override -> Card Channel override -> Workspace Speaker override -> Workspace Narrator override -> Global default, with Speaker Sync controlled by `audioSyncProfileV1` (`src/domain/text/textStructuredAudioSyncProfileDomain.js:1-46`, aligning other speakers on Conversation cards with Speaker 1).
- **Confirmed Cross-Layer Defects:**
  - **DEFECT-05 (`P1` Mixed Custom Local Speaker Sync Broken & Runtime Missing Speakers):**
    1. `resolveTextStructuredEffectiveCustomLocalVoice` (`src/domain/text/textStructuredLocalAudioProfileDomain.js:72-74`) gates Custom Local Speaker Sync on `documentTree?.documentType === 'conversation'` instead of checking `block?.blockType === 'conversation'`. In P13 (`documentType === 'mixed'`), Custom Local Speaker Sync is completely ignored for Conversation cards.
    2. `textStructuredLocalAudioProfileDomain.js:74` only reads `firstSpeaker` when `Array.isArray(conversationSpeakers)` is passed (unlike `textStructuredAudioDownloadProfileDomain.js:184`, which falls back to `collectTextStructuredConversationSpeakerIdentities(documentTree)`), and `textStructuredRuntimePlaybackPlanDomain.js:144-149, 302-307` calls `resolveTextStructuredEffectiveCustomLocalVoice` **without passing `conversationSpeakers`**. Thus `firstSpeaker` is `null` in runtime playback plans even in P12 Conversation workspaces!
  - **DEFECT-06 (`P1` Speaker Sync Precedence & Fallback Bugs in `App.jsx`):**
    1. In `resolveStructuredTextChannelVoiceState` (`src/App.jsx:1004-1051`), when Speaker Sync is enabled, `firstVoice` is queried only via `getTextStructuredSpeakerAssignedVoiceName` (Document-level speaker override, `L1020-1038`). If Speaker 1 has no Document-level voice override (so `firstVoice === null`), `requestedVoiceName: null` is passed alongside `segment: targetSegment` (Speaker 2's segment), causing Speaker 2 to use Speaker 2's own saved voice instead of Speaker 1's effective voice (or Card-level Speaker 1 override).
    2. Conversely, when `firstVoice` IS set (`L1033-1036`), `App.jsx` passes `requestedVoiceName: firstVoice` and `ignoreSegmentOverride: true`, causing Workspace Speaker 1 to override Segment-level and Card-level speaker overrides (breaking the `Segment -> Card -> Workspace` precedence respected by Download & Custom Local resolvers).
    3. In `resolveStructuredTextItemPlaybackRate` (`src/App.jsx:1073-1097`), when `syncRate` is `true` (`L1075-1085`), `App.jsx` returns immediately from Document `rateProfile` without calling `resolveTextStructuredEffectivePlaybackRate`, bypassing all Segment-level, Card-level, and Card-Speaker rate overrides (even for Speaker 1).
  - **DEFECT-07 (`P1` Stale Closure Metadata Overwrite on First Speaker Edit):**
    - `handleStructuredTextSpeakerVoiceChange` (`App.jsx:5109`), `handleStructuredTextSpeakerRateChange` (`L5128`), `handleStructuredTextSpeakerLocalAudioVoiceChange` (`L5218`), and `handleStructuredTextSpeakerDownloadVoiceChange` (`L5228`) `await ensureStructuredTextSpeakerIdentity(speakerLike)` (`L4762-4791`), which commits an updated `speakerRegistryV1` via `UPDATE_DOCUMENT` (`L4786-4789`). Immediately afterward, the caller constructs its next `UPDATE_DOCUMENT` payload from `activeTextDocumentTree.metadata` captured in the **pre-await React closure**. `updateDocument` (`textLibraryCommandDomain.js:465`) performs a shallow spread `{ ...current.metadata, ...payload.metadata }`, so whenever `activeTextDocumentTree.metadata` already contained an older `speakerRegistryV1` array, the second write clobbers the newly registered speaker entry.
  - **DEFECT-09 (`P2` Broken `speakerIdentityV1` Comparison in Card Audio UI):**
    - `src/components/text/TextStructuredCardAudioPanel.jsx:987` and `L1293` match segments to a speaker via `segment?.metadata?.speakerIdentityV1 === id`. Because `speakerIdentityV1` is `{ version: 1, speakerId: "..." }` (`textStructuredSpeakerIdentityDomain.js:24-27`), strict equality against string `id` is always `false`, falling back to `segment.speaker` string matching (or `firstSegment` at `L1293`) and misreporting inherited Browser TTS / Edge Download voices after speaker renames.

---

### Audit Area 4 — Reset Semantics & Dirty Detection
*Primary files:* `src/domain/text/textStructuredResetDomain.js`, `src/domain/text/textStructuredResetPresentationDomain.js`, `src/components/text/TextStructuredAudioControls.jsx`, `src/components/text/TextStructuredCardAudioPanel.jsx`

- **Workspace-level Reset:** `buildTextStructuredWorkspaceClearedMetadata` (`textStructuredResetDomain.js:126-198`) cleanly isolates `'browserTts'` (clearing narrator, speaker voice profiles, TTS sync, and speed profiles while leaving Edge Download/Custom Local intact) vs `'edgeMp3'` (clearing download narrator/speaker/sync profiles and Custom Local profiles).
- **Speaker-row Reset & Dirty Checks:** `buildTextStructuredSpeakerClearedMetadata` (`L206-277`) and `isTextStructuredSpeakerResetDirty` (`L383-421`) handle Workspace and Card speaker overrides, clearing both ID-keyed (`speakerId`) and normalized-label entries.
- **Card & Segment Reset:** `buildTextStructuredCardClearedMetadata` (`L279-330`), `isTextStructuredCardResetDirty` (`L423-444`), and `buildTextStructuredSegmentClearedMetadata` (`L332-360`) cover Card channel overrides, Card speaker overrides, and Segment overrides; presentation & confirmation rules reside in `textStructuredResetPresentationDomain.js:1-178`. No standalone defects were found in `textStructuredResetDomain.js` itself, though Card Reset UI triggers inherit `DEFECT-09`'s sample-segment lookup issue when computing displayed inherited speaker labels.

---

### Audit Area 5 — Runtime Playback & Split/Full Routing
*Primary files:* `src/domain/text/textStructuredSplitFullDomain.js`, `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`, `src/domain/text/textStructuredPlaybackDomain.js`, `src/services/playback/textStructuredPlaybackSessionService.js`, `src/App.jsx`

- **Capability Boundaries:** `resolveTextStructuredBlockSplitFullCapability` (`src/domain/text/textStructuredSplitFullDomain.js:68-100`) sets `edgeFullGenerationEligible: false` and `derivedFullExportEligible: true` for `conversation` blocks (preserving `edgeFullGenerationEligible: true` for `paragraph` blocks in both P12/P13).
- **DEFECT-08 (`P1` Full-Mode Playback on Multi-Speaker Conversation Cards Uses Speaker 1 Only):**
  - **Root cause part A (Fallback MP3 plan):** In `resolveStructuredTextBlockChannelPlaybackPlan` (`src/App.jsx:3764-3797`), `generatedVoice` is resolved once using `firstSegment` (`block.segments[0]`, Speaker 1) and passed as `fallbackVoiceId` for the entire block. `buildTextStructuredSplitRuntimePlan` (`src/domain/text/textStructuredRuntimePlaybackPlanDomain.js:166-178`) then passes that single Speaker-1 `fallbackVoiceId` and `playbackOrder.profiles` to **every segment** in the Conversation block during `LOCAL_FIRST` playback, causing Speaker 2/3 segments with Ready Edge MP3s under their own speaker voices to miss if their voice differs from Speaker 1's!
  - **Root cause part B (`FULL` + `TTS_ONLY` or `localCount === 0`):** When a Conversation card is set to `FULL` representation and has `localCount === 0` (`textStructuredRuntimePlaybackPlanDomain.js:435-462`) or `ttsOnly.enabled === true` (`L349-375`), `buildTextStructuredBlockRuntimePlaybackPlan` emits a single `FULL_TTS` step concatenating all speakers' lines into `fullRepresentation.content`. `playStructuredTextFullStep` (`src/App.jsx:3892-3973`) speaks that concatenated block using `firstSegmentItem` (Speaker 1's voice and rate only), whereas if even 1 segment has a Ready local MP3 (`localCount > 0` in `LOCAL_FIRST`), `buildTextStructuredBlockRuntimePlaybackPlan` takes `route: 'split-fallback'` (`L464-483`) and plays per-segment voices. Multi-speaker Conversation cards cannot authentically play in Full TTS mode with per-speaker voices.

---

### Audit Area 6 — Audio Generation, Fingerprints, Coverage, Staging & ZIP Import/Export
*Primary files:* `src/domain/text/textStructuredAudioRenderFingerprintDomain.js`, `src/domain/text/textStructuredAudioCoverageDomain.js`, `src/domain/text/textStructuredAudioGenerationDomain.js`, `src/domain/text/textStructuredBulkGenerationDomain.js`, `src/domain/text/textStructuredBulkExportDomain.js`, `src/domain/text/textStructuredBatchDomain.js`, `src/services/audio/textStructuredCardExportService.js`, `src/services/audio/textStructuredAudioZipArchiveService.js`, `src/services/audio/textStructuredAudioZipImportService.js`, `src/components/table/BatchPopup.jsx`, `src/App.jsx`

- **Per-Segment Fingerprints, Coverage & Card-Level Export (Working Across P12/P13):**
  - `computeTextStructuredAudioRenderFingerprint` (`src/domain/text/textStructuredAudioRenderFingerprintDomain.js:56-79`) and `evaluateTextStructuredSegmentChannelCoverage` (`src/domain/text/textStructuredAudioCoverageDomain.js:34-98`) compute RF and readiness per segment using `resolveTextStructuredEffectiveDownloadVoice` with explicit `speakerRegistry` + `conversationSpeakers`.
  - `buildTextStructuredManualGenerationTasks` (`textStructuredAudioGenerationDomain.js:53-98`), `executeStructuredTextCardZipExport` (`textStructuredCardExportService.js:156-288`), `executeStructuredTextFullCardAudioExport` (`L295-376`), Legacy Batch Popup (`BatchPopup.jsx` + `textStructuredBatchDomain.js:46-112`), `executeStructuredTextBatchReadyMp3Export` (`textStructuredCardExportService.js:382-486`), `executeStructuredTextBatchConsolidatedZipExport` (`L492-656`), and Portable ZIP archive export/import (`textStructuredAudioZipArchiveService.js:154-416`, `textStructuredAudioZipImportService.js:312-561`) operate over Conversation and Mixed blocks alike.
- **DEFECT-04 (`P1` Bulk Audio Generate & Bulk Export Completely Skip All Conversation Cards):**
  - `buildTextStructuredBulkGenerationPlan` (`src/domain/text/textStructuredBulkGenerationDomain.js:192, 296-297`) filters `isP5EligibleBlock` (`lower(block?.blockType || 'paragraph') === 'paragraph'`) and `continue`s past all `conversation` cards (`L297`). Worse, `executeStructuredTextBulkGenerationPlan` / `runStructuredTextAudioGenerationBatch` (`src/App.jsx:3466-3550, 5627-5635`) builds its task list from `plan.requirements`; in P12 (`conversation-only`), `requirements` is `[]` (returning `status: 'empty-scope'` / no-op), and in P13 (`mixed`), Conversation cards are completely excluded from Bulk generation.
  - Likewise, `buildTextStructuredBulkExportPlan` (`src/domain/text/textStructuredBulkExportDomain.js:34, 153`) hard-filters `isParagraph(block)` and skips every `conversation` block. Thus Bulk Audio **Portable ZIP**, **Audio-Only ZIP**, and **Direct MP3** export `0` Conversation files in both P12 (failing with empty plan even when Conversation Split MP3s are Ready!) and P13 (silently exporting only Paragraph cards).

---

## 4. Confirmed Bugs / Defects Catalog

### DEFECT-01 `[P1]` — External JSON `update-existing` Silently Deletes Local Cards, Segments & Speakers
- **Affected Scope:** P12 & P13
- **Evidence:** `src/domain/text/textExternalReconciliationDomain.js`: `buildIncomingSpeakerMap` (`L152-183`), `planTextExternalUpdateExisting` (`L249-252`, `L295-382`)
- **Minimal Reproduction:**
  1. Import a P12 or P13 external JSON workspace.
  2. Locally add a new Conversation/Paragraph Card, append a local Segment inside an existing card, and register a new local Speaker in `TextStructuredSpeakerRegistry`.
  3. Run `Import -> Update existing workspace` with an updated external JSON (even with `conflictPolicy: 'keep-local'`).
- **User / Runtime Impact:** Permanent deletion of all locally added cards, locally added segments, and locally registered speakers.
- **Root Cause:** `nextBlocks` (`L251`) and `nextSegments` (`L252`) drop all existing entities of the document and rebuild strictly from incoming payload keys; `localByCard` (`L295`) and `localSegmentsByKey` (`L296`) ignore entities without `externalEntityV1`. `buildIncomingSpeakerMap` (`L152`) filters `existingRegistry` by `.filter(item => clean(item?.externalKey))`, discarding local speakers.
- **Proposed Regression Test:** Add a reconciliation test verifying that after `update-existing` under `keep-local`, locally created cards, locally appended segments, and locally registered speakers without `externalKey` remain preserved in `nextBlocks`, `nextSegments`, and `speakerRegistryV1`.

### DEFECT-02 `[P1]` — Static `externalEntityV1.speakerKey` Masks Local Speaker Reassignments During Reconciliation
- **Affected Scope:** P12 & P13
- **Evidence:** `src/domain/text/textExternalJsonDomain.js`: `buildTextExternalTree` segment metadata (`L464-472`), `buildTextExternalLocalEntityFingerprints` (`L595-600`, `L650-652`); `src/domain/text/textExternalReconciliationDomain.js:325-347`
- **Minimal Reproduction:**
  1. Import a Conversation card whose segment `s1` originally belongs to `"Amelia"`.
  2. Reassign `s1`'s speaker in `TextStructuredEditor` to `"Jordan"`.
  3. Run `update-existing` with an external JSON file that changed `s1`'s `text` or `speakerKey` (with `conflictPolicy: 'keep-local'`).
- **User / Runtime Impact:** Local speaker reassignment is treated as unedited (`local === baseline`), reclassified as `incoming-update-safe`, and silently overwritten by the incoming payload.
- **Root Cause:** Line `651` evaluates `clean(segmentMeta?.speakerKey) || resolveSpeakerKeyForLocalSegment(...)`. Since `segmentMeta.speakerKey` (`metadata.externalEntityV1.speakerKey`) is stamped once on import and never updated when the segment's speaker changes, `resolveSpeakerKeyForLocalSegment` never runs for imported segments.
- **Proposed Regression Test:** Reassign an imported segment's speaker via the command domain, call `buildTextExternalLocalEntityFingerprints`, and assert `speakerKey` reflects the new `speakerIdentityV1`/`speaker` and triggers a `conflict` when incoming JSON modifies that segment.

### DEFECT-03 `[P1]` — External Speaker Rename Leaves Unmodified Kept Segments With Stale `segment.speaker` Strings
- **Affected Scope:** P12 & P13
- **Evidence:** `src/domain/text/textExternalReconciliationDomain.js:170`, `L325-349`; `src/domain/text/textStructuredSpeakerIdentityDomain.js:97-105`
- **Minimal Reproduction:**
  1. Import P12/P13 JSON containing speaker `{ speakerKey: "amelia", displayName: "Amelia" }`.
  2. Run `update-existing` renaming `{ speakerKey: "amelia", displayName: "Amy" }` while keeping an unmodified segment locally.
- **User / Runtime Impact:** Workspace Speaker Registry displays `"Amy"`, while kept segments still store `segment.speaker = "Amelia"`, causing mixed labels in editor chips, card summaries, and legacy key lookups.
- **Root Cause:** `buildIncomingSpeakerMap` (`L170`) updates `speakerRegistryV1.label`, while `segDecision.action === 'local'` (`L348-349`) pushes `segment` unchanged without refreshing `segment.speaker` from the resolved incoming speaker label.
- **Proposed Regression Test:** Test `planTextExternalUpdateExisting` when only a speaker's `displayName` changes in the incoming JSON and assert `segment.speaker` on kept segments bound to that `speakerId` is updated to the new label.

### DEFECT-04 `[P1]` — Bulk Audio Generation & Bulk Export Completely Skip Conversation Cards
- **Affected Scope:** P12 & P13
- **Evidence:** `src/domain/text/textStructuredBulkGenerationDomain.js`: `isP5EligibleBlock` (`L192`), `buildTextStructuredBulkGenerationPlan` (`L296-297`, `L399-403`, `L451`); `src/domain/text/textStructuredBulkExportDomain.js`: `isParagraph` (`L34`), `buildTextStructuredBulkExportPlan` (`L153`, `L264`); `src/App.jsx:3466-3550`, `L5627-5635`
- **Minimal Reproduction:**
  1. Open a P12 (`conversation-only`) or P13 (`mixed`) workspace in Bulk Audio.
  2. Trigger Bulk Generate Missing/All or Bulk Export (Portable ZIP / Audio-Only ZIP / Direct MP3).
- **User / Runtime Impact:**
  - In **P12**, Bulk Generate does nothing (`requirements = []`, `status: 'empty-scope'`) and Bulk Export reports nothing to export even when Card Audio Split MP3s are `READY`.
  - In **P13**, Bulk Generate and Bulk Export process Paragraph cards only and silently drop all Conversation cards.
- **Root Cause:** Both `isP5EligibleBlock` (`textStructuredBulkGenerationDomain.js:192`) and `isParagraph` (`textStructuredBulkExportDomain.js:34`) reject any block where `blockType !== 'paragraph'`.
- **Proposed Regression Test:** Verify `buildTextStructuredBulkGenerationPlan` generates Split requirements (with `allowFull: false`) and `buildTextStructuredBulkExportPlan` packages Split + Derived Full (no Edge Full) for `conversation` blocks in both P12 and P13 fixtures.

### DEFECT-05 `[P1]` — Custom Local Speaker Sync Disabled in P13 Mixed Workspaces & Broken in Runtime Plans
- **Affected Scope:** P12 & P13 (P13 completely disabled; P12 runtime plan fails to resolve `firstSpeaker`)
- **Evidence:** `src/domain/text/textStructuredLocalAudioProfileDomain.js:72-74`; `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js:144-149`, `L302-307` (contrast `src/domain/text/textStructuredAudioDownloadProfileDomain.js:184`)
- **Minimal Reproduction:**
  1. Enable **Speaker Sync** on Custom Local audio in a P13 (`mixed`) workspace and assign Custom Local audio for Speaker 1, leaving Speaker 2 unset.
  2. Play or compute runtime playback plan on a Conversation card.
- **User / Runtime Impact:** Custom Local Speaker Sync never applies in P13 workspaces (`documentType === 'mixed'`), and runtime playback plans in P12 fail to resolve `firstSpeaker` when `conversationSpeakers` is omitted.
- **Root Cause:** `resolveTextStructuredEffectiveCustomLocalVoice` (`textStructuredLocalAudioProfileDomain.js:72`) checks `documentTree?.documentType === 'conversation'` rather than `block?.blockType === 'conversation'`, and `L74` lacks a fallback to `collectTextStructuredConversationSpeakerIdentities(documentTree)` when callers like `textStructuredRuntimePlaybackPlanDomain.js:144-149, 302-307` omit `conversationSpeakers`.
- **Proposed Regression Test:** Test `resolveTextStructuredEffectiveCustomLocalVoice` and `buildTextStructuredBlockRuntimePlaybackPlan` on a `'mixed'` document with `blockType: 'conversation'`, asserting Speaker 2 resolves Speaker 1's Custom Local voice without explicitly passing `conversationSpeakers`.

### DEFECT-06 `[P1]` — Browser TTS Speaker Sync Fallback & Precedence Bugs + Rate Sync Override Bypass in `App.jsx`
- **Affected Scope:** P12 & P13
- **Evidence:** `src/App.jsx`: `resolveStructuredTextChannelVoiceState` (`L1004-1051`), `resolveStructuredTextItemPlaybackRate` (`L1073-1097`)
- **Minimal Reproduction:**
  1. Enable Browser TTS **Sync speakers** on a Conversation workspace while leaving Speaker 1 on Workspace/Global default (or overriding Speaker 1 at Card level), while Speaker 2 previously had a saved voice. Play Speaker 2.
  2. Alternatively, set Workspace Speaker 1 voice, also set a Segment or Card override on Speaker 2, and play Speaker 2.
  3. Enable Speed **Sync speakers**, set a Card-level or Segment-level rate override, and play.
- **User / Runtime Impact:**
  - Case 1: Speaker 2 plays in **Speaker 2's own saved voice** instead of syncing to Speaker 1.
  - Case 2: Workspace Speaker 1 forces `ignoreSegmentOverride: true`, erasing Segment and Card overrides.
  - Case 3: Speed Sync ignores all Segment, Card, and Card-Speaker rate overrides (even Speaker 1's Card/Segment rate!).
- **Root Cause:** `App.jsx:1020-1038` only queries Document-level `getTextStructuredSpeakerAssignedVoiceName` for Speaker 1; when `null`, it falls through using `segment: targetSegment`; when non-null, it forces `requestedVoiceName: firstVoice` + `ignoreSegmentOverride: true`. `resolveStructuredTextItemPlaybackRate` (`L1075-1085`) returns early from Document `rateProfile` when `syncRate` is `true` instead of delegating to `resolveTextStructuredEffectivePlaybackRate`.
- **Proposed Regression Test:** Unit-test effective voice & rate resolution under `syncVoice=true` and `syncRate=true` covering: (a) unset Speaker 1 inheriting Workspace Narrator, (b) Card Speaker 1 override, and (c) Segment override on Speaker 2 taking highest precedence.

### DEFECT-07 `[P1]` — Stale Closure Metadata Overwrite After `ensureStructuredTextSpeakerIdentity`
- **Affected Scope:** P12 & P13
- **Evidence:** `src/App.jsx`: `ensureStructuredTextSpeakerIdentity` (`L4762-4791`), `handleStructuredTextSpeakerVoiceChange` (`L5106-5158`), `handleStructuredTextSpeakerLocalAudioVoiceChange` / `handleStructuredTextSpeakerDownloadVoiceChange` (`L5215-5242`); `src/domain/text/textLibraryCommandDomain.js:465`
- **Minimal Reproduction:**
  1. Have an existing Conversation workspace whose `documentTree.metadata` already contains `speakerRegistryV1` for Speakers A & B.
  2. Add an unregistered speaker `"Charlie"` in a Card segment and immediately change `"Charlie"`'s voice, speed, Custom Local voice, or Edge Download voice from Card Audio / Workspace controls.
- **User / Runtime Impact:** The newly registered `speakerRegistryV1` entry for `"Charlie"` is persisted by `ensureStructuredTextSpeakerIdentity` and immediately overwritten by the second `UPDATE_DOCUMENT` call spreading the pre-`await` `activeTextDocumentTree.metadata.speakerRegistryV1`.
- **Root Cause:** Both sequential `UPDATE_DOCUMENT` calls use closure-captured `activeTextDocumentTree.metadata`, and `updateDocument` (`textLibraryCommandDomain.js:465`) shallow-merges `metadata`.
- **Proposed Regression Test:** Simulate a speaker voice/rate update for an unregistered speaker on a document with pre-existing `speakerRegistryV1`, verifying the persisted `document.metadata.speakerRegistryV1` retains the newly added speaker entry.

### DEFECT-08 `[P1]` — Full-Mode Conversation Playback Uses Speaker 1 Only (Both `LOCAL_FIRST` Fallback Plan and `FULL_TTS`)
- **Affected Scope:** P12 & P13 (Conversation cards played in Full mode)
- **Evidence:** `src/App.jsx`: `resolveStructuredTextBlockChannelPlaybackPlan` (`L3764-3797`), `playStructuredTextFullStep` (`L3892-3973`); `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js:102-180`, `L289`, `L349-375`, `L435-483`
- **Minimal Reproduction:**
  1. Create a 2-speaker Conversation card (`Speaker 1` = Libbi/Aria, `Speaker 2` = Ryan/Andrew).
  2. Generate Split Edge MP3s for Speaker 1 and Speaker 2 using their respective Download voices. Switch Card mode to **Full** and press Play under `LOCAL_FIRST` (or play under `TTS_ONLY` / ungenerated `LOCAL_FIRST`).
- **User / Runtime Impact:**
  - In `LOCAL_FIRST`, `buildTextStructuredSplitRuntimePlan` (`L166-178`) evaluates every segment's MP3 readiness against `fallbackVoiceId` (derived solely from `firstSegment` at `App.jsx:3767-3774`), missing Ready Split MP3s owned by Speaker 2/3 when their Download voices differ from Speaker 1.
  - When `localCount === 0` or `TTS_ONLY` is active in Full mode, `playStructuredTextFullStep` (`App.jsx:3897-3904, 3957-3972`) speaks the entire multi-speaker conversation as one monologue using **only Speaker 1's voice and rate** instead of per-segment speaker playback.
- **Root Cause:** Block-level playback plan construction anchors `fallbackVoiceId` and `FULL_TTS` `firstSegmentItem` to `block.segments[0]` rather than supporting multi-speaker Split sequencing when a Conversation card has `>1` speaker voice/rate in Full mode.
- **Proposed Regression Test:** Verify that playing a multi-speaker Conversation card in Full mode (a) resolves each segment's own `effectiveDownloadVoice` against Staging/IndexedDB binaries under `LOCAL_FIRST`, and (b) plays sequential per-speaker voices/rates under `TTS_ONLY` or zero-MP3 `LOCAL_FIRST`.

### DEFECT-09 `[P2]` — `segment?.metadata?.speakerIdentityV1 === id` Always Evaluates False in `TextStructuredCardAudioPanel.jsx`
- **Affected Scope:** P12 & P13
- **Evidence:** `src/components/text/TextStructuredCardAudioPanel.jsx:987`, `L1293`; `src/domain/text/textStructuredSpeakerIdentityDomain.js:24-27`
- **Minimal Reproduction:** Inspect Card Audio speaker voice rows in a Conversation card after renaming a speaker in the Workspace Registry when not all segment label strings match `speakerRegistryV1.label`.
- **User / Runtime Impact:** `sample` resolves `null` at `L987` or falls back to `firstSegment` (Speaker 1) at `L1293`, displaying the wrong inherited Browser TTS or Edge Download voice label for Speaker 2/3.
- **Root Cause:** `segment.metadata.speakerIdentityV1` is `{ version: 1, speakerId }`, so `=== id` compares an object reference to a string ID (`false`).
- **Proposed Regression Test:** Extract the speaker sample matcher and assert a segment with `metadata.speakerIdentityV1 = { version: 1, speakerId: 'SPK_2' }` and an older `segment.speaker` string still matches speaker `'SPK_2'`.

### DEFECT-10 `[P2]` — Unhandled Duplicate Speaker Exception, Non-Atomic `1+N` Registry Mutations & External Speaker ID Mismatch
- **Affected Scope:** P12 & P13
- **Evidence:**
  - (a) `src/domain/text/textStructuredSpeakerIdentityDomain.js:63-81`; `src/components/text/TextStructuredSpeakerRegistry.jsx:35`, `L75`
  - (b) `src/components/text/TextStructuredSpeakerRegistry.jsx:35-47`, `L75-88`; `src/App.jsx:4468`
  - (c) `src/domain/text/textExternalJsonDomain.js:357` vs `src/domain/text/textExternalReconciliationDomain.js:158-159`
- **Minimal Reproduction:**
  - (a) In Speaker Registry, type a speaker name that already exists (case-insensitive) and click Add/Save.
  - (b) Rename a speaker in a workspace with 50 segments and observe sequential DB writes + GC sweeps.
  - (c) Import JSON v1 and later add a new speaker via `update-existing`; compare `speakerId` derivation.
- **User / Runtime Impact:** Unhandled Promise rejection in browser console with no inline error banner on duplicate speaker; unnecessary IndexedDB write amplification and partial-save window on rename; non-deterministic `SPK_EXT_` IDs for incrementally imported speakers.
- **Root Cause:** Synchronous `throw` inside unguarded async UI handlers; absence of a single atomic rename command in `textLibraryCommandDomain.js`; diverging ID generators between `textExternalJsonDomain.js` and `textExternalReconciliationDomain.js`.
- **Proposed Regression Test:** Test UI handler error state on duplicate speaker name, atomic workspace speaker rename command across `speakerRegistryV1` + all matching segments, and deterministic `SPK_EXT_` ID generation in `buildIncomingSpeakerMap`.

---

## 5. Source-Level Risks / Hypotheses (Architecture Observations)

| ID | Severity | Location | Hypothesis / Risk Description |
| --- | --- | --- | --- |
| **RISK-01** | `P2` | `src/components/text/TextStructuredCardAudioPanel.jsx:507-528, 825-904` | **Misleading Card Audio Header Summary on Conversation Cards:** `cardVoiceResolutions` is computed using `firstSegment` in `'full'` representation and displays `"Workspace Narrator"` / `"Card Override"` rows alongside Speaker 1's voice as the card's summary voice, which can confuse users when Speakers 2–N use distinct voices on the same Conversation card. |
| **RISK-02** | `P3` | `src/domain/text/textLibraryCommandDomain.js:522, 581` | **Authoring Split/Merge Guard Coupling in Mixed Workspaces:** `splitParagraphSegment` and `mergeParagraphSegments` guard `block?.blockType === 'conversation'`; verify UI entry points in `TextStructuredEditor.jsx` also hide Split/Merge buttons solely per block (`blockType === 'conversation'`) rather than disabling Paragraph blocks inside a Mixed document (`documentType === 'mixed'`). |
| **RISK-03** | `P3` | `src/domain/text/textLibraryCommandDomain.js:165-169`, `src/App.jsx:5796` | **Auto-Demotion Hiding `speakerRegistryV1`:** Removing the last `conversation` block from a Mixed workspace auto-demotes `documentType` to `'paragraph'` via `inferDocumentType` (`L165-169`). Because `hasConversationCards` becomes `false` (`App.jsx:5796`), `TextStructuredSpeakerRegistry` disappears while orphaned `speakerRegistryV1` and speaker voice/rate profiles remain in `document.metadata`. |

---

## 6. P12-First & P13-Second Acceptance Matrix & Risk Register

### Part A — P12 Conversation Only Acceptance Matrix (`P12-AC`)

| ID | Area | Severity | Action / Scenario | Observable Pass Criteria | Status at `8fd8c38` | Blocker(s) |
| --- | --- | --- | --- | --- | --- | --- |
| **P12-AC-01** | External Import | `P1` | Import a `conversation-only` v1 JSON with `N >= 3` speakers & multi-turn cards | Workspace created with `documentType === 'conversation'`, deterministic `SPK_EXT_` registry IDs, all cards `blockType: 'conversation'`, Speaker Registry visible | **PASS (Source)** | — |
| **P12-AC-02** | Update Reconciliation | `P1` | Locally add Card, Segment, & Speaker; run `update-existing` (`keep-local`) | Incoming updates merge while **all local Card, local Segment, and local Speaker entries remain intact** | **FAIL** | `DEFECT-01` |
| **P12-AC-03** | Reconciliation Conflict | `P1` | Reassign imported segment speaker locally; run `update-existing` modifying that segment | Reconciliation detects `conflict` (not `incoming-update-safe`) and preserves local speaker under `keep-local` | **FAIL** | `DEFECT-02` |
| **P12-AC-04** | Speaker Rename Sync | `P1` | Rename speaker `displayName` via external JSON update OR Workspace Registry | Both `speakerRegistryV1[].label` and every bound `segment.speaker` match the new name atomically; duplicate name surfaces UI error | **FAIL** | `DEFECT-03`, `DEFECT-10` |
| **P12-AC-05** | First Speaker Edit | `P1` | Add an unregistered speaker in a card segment, then immediately set Speaker voice/speed/local/download | Voice/speed persists AND new speaker remains in `document.metadata.speakerRegistryV1` | **FAIL** | `DEFECT-07` |
| **P12-AC-06** | Speaker Sync (Voice & Rate) | `P1` | Toggle TTS/Local/Download Speaker Sync & Rate Sync across Speaker 1 unset, Card override, and Segment override | Speaker 2 matches Speaker 1 when Sync ON except where Segment/Card override wins; Speed Sync honors Card/Segment rate overrides | **FAIL** | `DEFECT-05`, `DEFECT-06` |
| **P12-AC-07** | Card Audio Labels | `P2` | Inspect Card Audio inherited Browser TTS & Edge Download labels per speaker after rename | Labels match each speaker's actual resolved segment via `speakerIdentityV1.speakerId` | **FAIL** | `DEFECT-09` |
| **P12-AC-08** | Reset Semantics | `P2` | Execute Workspace / Speaker / Card / Segment Resets per channel (`browserTts` vs `edgeMp3`) | Channel-isolated reset restores inherited defaults without wiping unrelated channel settings or throwing | **PASS (Source)** | (`DEFECT-09` label display) |
| **P12-AC-09** | Split Runtime Playback | `P1` | Play Conversation card in Split mode (`TTS_ONLY` & `LOCAL_FIRST`) | Each turn plays in its own speaker's voice, rate, Custom Local override, and Ready Split MP3 | **PARTIAL FAIL** | `DEFECT-05`, `DEFECT-06` |
| **P12-AC-10** | Full Runtime Playback | `P1` | Play multi-speaker Conversation card in Full mode (`LOCAL_FIRST` w/ multi-voice MP3s & `TTS_ONLY`) | Multi-speaker Full playback uses per-speaker Ready MP3s in `LOCAL_FIRST` and preserves speaker differentiation in TTS mode | **FAIL** | `DEFECT-08` |
| **P12-AC-11** | Bulk Generate & Export | `P1` | Open Bulk Audio on P12 workspace; run Generate Missing/All & Export ZIP / MP3 | Bulk scope includes all Conversation Split segments, generates missing MP3s, and exports Portable ZIP / Audio ZIP / MP3 | **FAIL** | `DEFECT-04` |
| **P12-AC-12** | Card / Batch / Portable ZIP | `P1` | Generate Card Split MP3s; export Card ZIP, Derived Full WAV, Batch ZIP, and re-import Portable ZIP | Unique `rf` MP3s packaged with manifest v2; Portable ZIP re-import restores `speakerRegistryV1`, `speakerIdentityV1`, and Ready coverage | **PASS (Source)** | — |

---

### Part B — P13 Mixed Workspace Acceptance Matrix (`P13-AC`)

| ID | Area | Severity | Action / Scenario | Observable Pass Criteria | Status at `8fd8c38` | Blocker(s) |
| --- | --- | --- | --- | --- | --- | --- |
| **P13-AC-01** | External Mix Import & Taxonomy | `P1` | Import `mix` JSON containing both `paragraph` and `conversation` cards | `documentType === 'mixed'`; Paragraph cards forbid `speakers`, Conversation cards preserve `speakerIdentityV1`; JSON export emits `workspace.mode: "mix"` | **PASS (Source)** | — |
| **P13-AC-02** | Mixed Update Reconciliation | `P1` | Mix local Paragraph/Conversation card edits + additions, then run `update-existing` | Local Paragraph + Conversation cards/segments/speakers preserved; speaker reassignment triggers conflict | **FAIL** | `DEFECT-01`, `DEFECT-02`, `DEFECT-03` |
| **P13-AC-03** | Editor Block Isolation | `P2` | Inside a Mixed workspace, split/merge segments on Paragraph cards and edit speakers on Conversation cards | Split/Merge enabled for `paragraph` cards and blocked for `conversation` cards; taxonomy stays `'mixed'` | **PASS (Verify UI)** | `RISK-02`, `RISK-03` |
| **P13-AC-04** | Narrator vs Speaker Isolation | `P1` | Configure distinct Workspace Narrator voice (Paragraph) and Workspace Speaker 1..N voices (Conversation) | Paragraph cards resolve Workspace Narrator; Conversation cards resolve Workspace Speaker voices without cross-leakage | **PASS (Source)** | — |
| **P13-AC-05** | Mixed Custom Local Speaker Sync | `P1` | Enable Custom Local Speaker Sync in a `'mixed'` workspace with local voice set on Speaker 1 | Conversation cards sync Speaker 2..N Custom Local voices to Speaker 1; Paragraph cards continue using Paragraph narrator/card rules | **FAIL** | `DEFECT-05` |
| **P13-AC-06** | Mixed Voice & Rate Sync | `P1` | Enable TTS/Download Speaker Sync + Rate Sync on a Mixed workspace | Sync applies cleanly to Conversation cards without breaking Paragraph Card/Segment overrides or Speaker 1 inheritance | **FAIL** | `DEFECT-06`, `DEFECT-07` |
| **P13-AC-07** | Mixed Split/Full Capability | `P1` | Toggle Split vs Full on Paragraph card (Edge Full allowed) vs Conversation card (Derived Full only) in same workspace | Paragraph cards support Edge Full generation & playback; Conversation cards disable Edge Full generation, support Derived Full WAV, and play multi-speaker correctly | **FAIL (Conv Full)** | `DEFECT-08` |
| **P13-AC-08** | Mixed Bulk Generation | `P1` | Run Bulk Generate on a Mixed workspace (all cards or filtered scope) | Paragraph Split/Full + Conversation Split tasks are all planned and generated cleanly | **FAIL** | `DEFECT-04` |
| **P13-AC-09** | Mixed Bulk Export | `P1` | Export Portable ZIP / Audio-Only ZIP / Direct MP3 from Bulk Audio on a Mixed workspace | Archive contains **both** Paragraph (Split/Full) and Conversation (Split) unique `rf` files with valid manifest v2 & `AUDIO_INDEX.csv` | **FAIL** | `DEFECT-04` |
| **P13-AC-10** | Mixed Portable ZIP Round-Trip | `P1` | Delete Mixed workspace/cache locally and re-import Mixed Portable ZIP | Both Paragraph cards and multi-speaker Conversation cards restore with 100% Ready `rf` coverage and intact `speakerRegistryV1` | **PASS (Source)** | — |

---

*End of Independent Audit Report (`8fd8c38aa9898f8ccf2d1b83794b24d902c6a6db`).*
