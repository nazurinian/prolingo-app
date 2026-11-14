# ProLingo v6 — Revised Independent P12 (Conversation Only) & P13 (Mixed) Architecture Audit

- **Auditor:** Gemini 4 Hydrogen (Revised after Issue #4 cross-check comment `#6878615482`)
- **Repository:** `nazurinian/prolingo-app`
- **Branch:** `fix/text-data-system-boundaries`
- **Audited Code Baseline:** `8fd8c38aa9898f8ccf2d1b83794b24d902c6a6db` (`src/` and `scripts/` unchanged from `8fd8c38`)
- **Mode:** Strictly Read-Only Audit & Revision (zero changes to `src/`, `scripts/`, `package.json`, AI Voice, or branches/PRs)

---

## 1. Cross-Check Revisions & Retractions vs. Initial Draft (`d28b47c`)

Following independent review in GitHub Issue #4 (`issuecomment-6878615482`), the initial draft (`d28b47c`) was re-verified directly against `8fd8c38`. The following inaccurate claims and false findings have been **corrected or removed**:

| Item in `d28b47c` | Correction Verified at `8fd8c38` | Action Taken |
| :--- | :--- | :--- |
| Wrong External JSON API names (`validateTextExternalJsonPayload`, `schemaVersion`, `workspace.mode`, `exportTextStructuredWorkspaceToExternalJson`) | Actual contract in `src/domain/text/textExternalJsonDomain.js` is `PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE = 'prolingo-text-external'` (`L22`), `PROLINGO_TEXT_EXTERNAL_PACKAGE_VERSION = 1`, validated by `validateProLingoTextExternalPackage` (`L184-250`), using `workspace.workspaceType` and `workspace.conversationMode` (`scripts/fixtures/v603-d2-external-mix-example.json`). No `prolingo-text-external` exporter exists in `src/`; `src/domain/text/textPackJsonDomain.js` exports `prolingo-text-pack`. | **Corrected** across Sections 2 & 3 |
| Former `DEFECT-09` (`speakerIdentityV1` object-vs-string mismatch) | `src/domain/text/textStructuredSpeakerIdentityDomain.js:16-17` stores and reads `metadata.speakerIdentityV1` as a plain string ID (`clean(segment?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY])`), matching all UI/domain consumers (`TextStructuredCardAudioPanel.jsx:987`, etc.). | **Removed** (False positive) |
| Former `RISK-03` (`inferDocumentType` auto-demoting `mixed` docs on delete) | `src/domain/text/textWorkspaceTaxonomyDomain.js` (`L1-105`) contains classification/display helpers only and has no `inferDocumentType`. `src/domain/text/textLibraryCommandDomain.js:204-211` (`assertBlockTypeAllowed`) enforces single-type invariants for `paragraph`/`conversation` docs and never auto-demotes `mixed` docs. | **Removed** (False positive) |
| Former `DEFECT-05` ("Custom Local drops `conversationSpeakers` fallback") | `src/domain/text/textStructuredLocalAudioProfileDomain.js:75-78` **does** fall back to `collectTextStructuredConversationSpeakerIdentities(documentTree)` when `conversationSpeakers` is not an array. The real P13 defect is `L72` (`documentTree?.documentType === 'conversation'`), which disables Custom Local Speaker-1 sync inside `mixed` workspaces. | **Re-scoped** as `MIX-01` |
| Former `DEFECT-07` (`updateDocument` `{...current.metadata, ...payload.metadata}` merge assumption) | `src/domain/text/textLibraryCommandDomain.js:328` **replaces** `metadata` wholesale when `payload?.metadata !== undefined` (`metadata: payload?.metadata === undefined ? current.metadata : payload.metadata`). Because `App.jsx` speaker handlers (`L5106-5242`) read stale pre-`await` `activeTextDocumentTree.metadata` after `await ensureStructuredTextSpeakerIdentity(...)` (`L4762-4791`), the second `UPDATE_DOCUMENT` overwrites newly written `speakerRegistryV1` entries. | **Corrected** root cause as `SPK-01` |
| Former `DEFECT-04` ("all Conversation bulk/ZIP exports broken") | Overgeneralized. Card ZIP (`App.jsx:5578`), Consolidated Batch ZIP & Ready MP3 (`App.jsx:5600-5624`), and Portable ZIP do handle Conversation cards/segments (excluding Conversation Full artifacts by design). Only the P5 Bulk Generation planner (`textStructuredBulkGenerationDomain.js:192, 296-297`), P6 Bulk Export planner (`textStructuredBulkExportDomain.js:34, 153`), and `TextBatchPopup.jsx:450, 482, 838` skip Conversation cards by deliberate Paragraph-first design. | **Reclassified** as Policy/Scope item `POL-01` |

---

## 2. Architecture Summary at Baseline `8fd8c38`

Structured Text (`editorModel === 'structured-v1'`) supports three document types:
- `paragraph` (**Paragraph Only**)
- `conversation` (**P12 Conversation Only**, enforcing `blockType === 'conversation'` in `textLibraryCommandDomain.js:204-211`)
- `mixed` (**P13 Mixed**, allowing both `paragraph` and `conversation` blocks inside one document)

### Key Separation & Contracts
1. **External AI Import vs. Portable Pack (`textExternalJsonDomain.js` / `textExternalReconciliationDomain.js` / `textPackJsonDomain.js`):**
   - `prolingo-text-external` v1 supports initial import (`planProLingoTextExternalInitialImport`) and three-way change inspection/reconciliation (`update-existing`, `import-copy`, `keep-local`) via `App.jsx:4551-4582` and `TextLibraryShell.jsx:222-244, 475`.
   - Workspace/collection export in ProLingo uses `prolingo-text-pack` v1 (`src/domain/text/textPackJsonDomain.js`), not `prolingo-text-external`.
2. **Speaker Identity & Registry (`textStructuredSpeakerIdentityDomain.js`):**
   - Segments reference speakers via `segment.metadata.speakerIdentityV1` (string ID `SPK_*` or `SPK_EXT_*`) plus human-readable `segment.speaker`.
   - Document `metadata.speakerRegistryV1` stores `{ id, uid?, label, externalKey? }` entries and enforces case-insensitive label uniqueness (`L73-79`).
3. **Audio Inheritance & Sync (`App.jsx`, `textStructuredVoiceAssignmentDomain.js`, `textStructuredLocalAudioProfileDomain.js`, `textStructuredAudioDownloadProfileDomain.js`):**
   - Playback Browser TTS (`App.jsx:991-1072`) and playback rate (`App.jsx:1073-1097`) resolve speaker profiles and check Speaker-1 Sync against `item?.blockType === 'conversation'`.
   - Edge Download profile resolution (`textStructuredAudioDownloadProfileDomain.js:159-238`) supports Workspace/Document, Speaker, Card, Card+Speaker, and Segment presets, with `FOLLOW_PLAYER` (`L181`) respecting `block?.blockType === 'conversation'`.
   - Card Audio (`TextStructuredCardAudioPanel.jsx`) manages per-card Speaker TTS drafts (`L424`, bound through `draftBlock`) and per-card/speaker/segment Edge generation (`L1271-1450`), while explicitly disabling Full Card artifacts on Conversation cards (`L470-478, 698-706, 1235-1244, 1518`).

---

## 3. Classified Findings

Every item below is strictly categorized into:
1. **Source-Confirmed Faulty Paths** (bugs provably present in `8fd8c38` source)
2. **Policy-Dependent Behavior / Open Product Contracts** (explicitly coded scope choices needing P12/P13 sign-off or expansion decision)
3. **Source-Level Hypotheses & Consistency Risks** (structural hazards or minor UI/script drift observed in source)
4. **Unverified / Runtime- & External-Fixture-Dependent Checks** (checks not executed in this read-only audit)

---

### 3.1 Source-Confirmed Faulty Paths

#### `[EXT-01]` High (P12 & P13) — `update-existing` external JSON reconciliation drops all local-only cards, segments, and speakers
- **Evidence:** `src/domain/text/textExternalReconciliationDomain.js:151-152, 251-252, 295-296`
- **Mechanism:**
  - `buildIncomingSpeakerMap` (`L151-172`) indexes `existingRegistry` using `.filter(item => clean(item?.externalKey))`, omitting any locally created speakers lacking `externalKey`.
  - `planTextExternalUpdateExisting` (`L186-417`) filters out the document's existing blocks (`L251`) and reconstructs `nextBlocks` and `nextSegments` strictly by iterating `incoming.blocks` (`L251-252`) and `card.segments` (`L295-296`). Any local-only card or segment lacking `metadata.externalEntityV1` is excluded from the reconciled snapshot.
- **Impact:** Users who add local notes/cards, custom dialogue turns, or local speakers to an external-imported workspace lose those additions silently when accepting an `update-existing` JSON re-import (and subsequent staging GC at `App.jsx:4575` can clean up orphaned staging audio).

#### `[EXT-02]` High (P12 & P13) — Local segment fingerprinting prefers stale `externalEntityV1.speakerKey`, hiding local speaker reassignments from conflict detection
- **Evidence:** `src/domain/text/textExternalJsonDomain.js:649-654`; consumers at `src/domain/text/textExternalReconciliationDomain.js:106, 200`
- **Mechanism:** Inside `buildTextExternalLocalEntityFingerprints` (`L602-658`):
  ```js
  fingerprints.segments[segmentKey] = buildCanonicalSha256Fingerprint(
    block.blockType === 'conversation'
      ? { ...paragraphSegmentSemantic(segment), speakerKey: clean(segmentMeta?.speakerKey) || resolveSpeakerKeyForLocalSegment({ segment, speakerRegistry }) }
      : paragraphSegmentSemantic(segment),
    'sha256'
  );
  ```
  Because `segment.metadata.externalEntityV1.speakerKey` retains the original imported value when a user edits `segment.speaker` or `speakerIdentityV1` locally in ProLingo, `clean(segmentMeta?.speakerKey)` short-circuits before `resolveSpeakerKeyForLocalSegment`.
- **Impact:** Local speaker edits on Conversation segments appear unmodified during external re-import inspection/reconciliation, allowing incoming external updates to overwrite local speaker assignments without surfacing a conflict (`keep-local` vs `incoming`).

#### `[EXT-03]` Medium (P12 & P13) — Incoming speaker `displayName` update leaves kept `segment.speaker` strings stale
- **Evidence:** `src/domain/text/textExternalReconciliationDomain.js:170, 332-349`
- **Mechanism:** When `decision.action === 'incoming'`, `buildIncomingSpeakerMap` (`L170`) updates `speakerRegistryV1` entry `label: speaker.displayName`. However, in `planTextExternalUpdateExisting`, if a segment under that speaker is kept without an incoming segment replacement (`else stats.preservedLocal += 1; nextSegments.push(segment);` at `L348-349`), the preserved `segment.speaker` field retains the old display string.
- **Impact:** After an external speaker rename, UI views reading `segment.speaker` (`TextStructuredCardAudioPanel.jsx:1034, 1324`) and fallback display/matching diverge from `speakerRegistryV1[id].label`.

#### `[SPK-01]` High (P12 & P13) — Stale `activeTextDocumentTree.metadata` across sequential `await` `UPDATE_DOCUMENT` calls overwrites newly registered `speakerRegistryV1`
- **Evidence:**
  - `src/domain/text/textLibraryCommandDomain.js:328`: `metadata: payload?.metadata === undefined ? current.metadata : payload.metadata` (full replacement, not merge)
  - `src/App.jsx:4762-4791` (`ensureStructuredTextSpeakerIdentity`)
  - `src/App.jsx:5106-5123` (`handleStructuredTextSpeakerVoiceChange`), `L5125-5158` (`handleStructuredTextSpeakerRateChange`), `L5215-5224` (`handleStructuredTextSpeakerLocalAudioVoiceChange`), `L5226-5242` (`handleStructuredTextSpeakerDownloadVoiceChange`)
- **Mechanism:** When editing an unregistered or newly authored speaker's Browser TTS voice, speed, Custom Local voice, or Edge Download voice:
  1. The handler captures `activeTextDocumentTree` from React closure and runs `const identity = await ensureStructuredTextSpeakerIdentity(speakerLike)`.
  2. `ensureStructuredTextSpeakerIdentity` writes `UPDATE_SEGMENT` in a loop (`L4772-4779`) and writes `speakerRegistryV1` via `UPDATE_DOCUMENT` (`L4780-4789`).
  3. Back in the caller, the handler builds the voice/rate/local/download metadata from the **stale pre-`await`** `activeTextDocumentTree.metadata` and dispatches a second `UPDATE_DOCUMENT` (`L5111-5120`, `L5141-5150`, `L5220-5221`, `L5230-5239`).
  4. Because `updateDocument` (`textLibraryCommandDomain.js:328`) replaces `document.metadata` with `payload.metadata`, the second command wipes out the newly created `speakerRegistryV1` entry whenever the speaker was not already persisted in `activeTextDocumentTree.metadata` prior to the click.
- **Impact:** First-time speaker voice/speed/local/download edits on newly authored Conversation speakers lose the `speakerRegistryV1` entry while segments still reference `identity.id` (`speakerIdentityV1`), breaking stable rename/identity lookup until re-registered. Also leaves multi-step `UPDATE_SEGMENT` + `UPDATE_DOCUMENT` non-atomic.

#### `[SPK-02]` Medium (P12 & P13) — Unhandled exception on speaker rename collision and non-atomic rename writes in Speaker Registry UI
- **Evidence:** `src/domain/text/textStructuredSpeakerIdentityDomain.js:73-79`; `src/components/text/TextStructuredSpeakerRegistry.jsx:35-49, 66-91`
- **Mechanism:** `buildTextStructuredUpsertSpeakerRegistryMetadata` throws `new Error('Speaker label “${cleanLabel}” is already registered')` (`L79`) when `entry.id !== id` matches case-insensitively. `saveRename` (`TextStructuredSpeakerRegistry.jsx:66-91`) invokes it without `try/catch` or UI error surfacing, and performs sequential non-atomic `1 UPDATE_DOCUMENT + N UPDATE_SEGMENT` mutations.
- **Impact:** Attempting to rename Speaker A to an existing Speaker B's name fails as an unhandled promise rejection with no user-facing validation message; partial failures between `UPDATE_DOCUMENT` and `UPDATE_SEGMENT` can leave `speakerRegistryV1.label` out of sync with `segment.speaker`.

#### `[MIX-01]` Medium (P13 Mixed) — Custom Local (`CUSTOM_LOCAL`) Speaker-1 sync is disabled in `'mixed'` workspaces despite Sync UI and Browser TTS honoring it
- **Evidence:**
  - `src/domain/text/textStructuredLocalAudioProfileDomain.js:71-78`
  - Contrasted with `src/App.jsx:1004-1006, 1075-1077` and `src/components/text/TextStructuredAudioControls.jsx:316, 550-580, 603-604`
- **Mechanism:**
  - Browser TTS sync (`App.jsx:1004-1006`), playback rate sync (`App.jsx:1075-1077`), and the Audio Controls UI (`TextStructuredAudioControls.jsx:316, 550-604`) enable Speaker-1 Sync whenever Conversation blocks/speakers are present (`item?.blockType === 'conversation'` / `hasConversationCards`), including in `mixed` workspaces.
  - However, `resolveTextStructuredEffectiveCustomLocalVoice` (`textStructuredLocalAudioProfileDomain.js:72`) gates Speaker-1 sync on `documentTree?.documentType === 'conversation'` (while `L75-78` **does** properly fall back to `collectTextStructuredConversationSpeakerIdentities(documentTree)`).
- **Impact:** In P13 `'mixed'` documents with `CUSTOM_LOCAL` enabled, turning on **SYNC EN VOICE** / **SYNC ID VOICE** updates the UI dropdowns (`L603-604`) and Browser TTS fallback (`App.jsx:1004-1006`) to follow Speaker 1, while local MP3 playback (`App.jsx:3776, 4011`) ignores Sync and continues using each follower's own pinned local voice. *(Note: when Sync IS active in a `conversation` doc, `L80-86` reads `speakerIds`/`speakers` on `localProfile` for `firstSpeaker` only, without `localProfile.channels[channel]` fallback.)*

---

### 3.2 Policy-Dependent Behavior / Open Product Contracts

These behaviors are internally consistent with existing P5/P9/D2 implementation contracts, not accidental coding regressions, but require explicit P12/P13 product sign-off:

#### `[POL-01]` (P12 & P13) — P5 Bulk Generation & P6 Bulk Export exclude Conversation cards (Paragraph-first design)
- **Evidence:** `src/domain/text/textStructuredBulkGenerationDomain.js:192, 296-297`; `src/domain/text/textStructuredBulkExportDomain.js:34, 153`; `src/components/text/TextBatchPopup.jsx:450, 482, 838`; working Conversation exports in `src/App.jsx:5578-5624`.
- **Verified Behavior:** Bulk Audio explicitly counts Paragraph cards only and displays `Conversation skipped: N (use Card Audio)` (`TextBatchPopup.jsx:838`). Meanwhile, Conversation Split generation/export inside Card Audio, Card ZIP (`handleStructuredTextExportCardZip`), Derived Full WAV, Consolidated Batch ZIP (Split), and Portable ZIP already work for Conversation cards.
- **Decision Required:** Confirm whether P12/P13 keeps Conversation multi-speaker audio generation inside Card Audio (or Workspace Audio Controls) or requires extending P5 Bulk Audio to support Conversation speaker voices.

#### `[POL-02]` (P12 & P13) — Full Card audio artifacts & Full MP3 export are Paragraph-only; `playStructuredTextFullStep` uses `firstSegmentItem`
- **Evidence:** `src/components/text/TextStructuredCardAudioPanel.jsx:470-478, 698-706, 1235-1244, 1518`; `src/App.jsx:3764-3804, 3892-3972`; `src/services/playback/textStructuredPlaybackSessionService.js:156-255`.
- **Verified Behavior:** Conversation cards return `MISSING` / `[]` for Full Card artifacts in Card Audio UI (`Full Card MP3 export is only available for Paragraph cards`) and disallow D2-C missing Full generation. If a Full-step playback or fallback plan executes via `resolveStructuredTextBlockChannelPlaybackPlan` / `playStructuredTextFullStep`, it resolves voice/rate/custom-local fallback from `block.segments[0]` (`firstSegment` / `firstSegmentItem`) with `ignoreSegmentOverride: true`.
- **Decision Required:** Confirm whether Full Playback (`Full · Entire Card` in `TextStructuredPlaybackControls.jsx:234`) on Conversation cards is permanently expected to play Split-per-speaker or have Full disabled for Conversation.

#### `[POL-03]` (P12 & P13) — Sync Voice / Sync Speed applies document-wide `Speaker 1` (`speakers[0]`) non-destructively across all Conversation cards
- **Evidence:** `src/App.jsx:939-942, 5160-5204`; `src/components/text/TextStructuredAudioControls.jsx:319-325, 571-610`.
- **Verified Behavior:** `collectTextStructuredConversationSpeakerIdentities` orders speakers workspace-wide; Sync applies `speakers[0]` across all Conversation cards without modifying followers' saved voices/speeds, and Edge Download presets (`resolveTextStructuredEffectiveDownloadVoice`) intentionally ignore Sync (documented as playback-only).
- **Decision Required:** Decide whether Edge Download `FOLLOW_PLAYER` (`textStructuredAudioDownloadProfileDomain.js:181`) should continue mapping each speaker's saved Browser TTS voice or obey active Sync overrides.

#### `[POL-04]` (P12 & P13) — No External JSON exporter (`prolingo-text-external`) exists; workspace export uses `prolingo-text-pack`
- **Evidence:** Workspace search in `src/` shows `PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE` (`src/domain/text/textExternalJsonDomain.js:22`) is import/reconcile-only (`TextLibraryShell.jsx:475`, `App.jsx:4551-4582`), while exports go through `src/domain/text/textPackJsonDomain.js` (`prolingo-text-pack`).
- **Decision Required:** Confirm that AI-authored external JSON remains one-way external source ingest + three-way update/reconcile, with `prolingo-text-pack` / DB Backup handling app-native exports.

---

### 3.3 Source-Level Hypotheses & Consistency Risks

#### `[RISK-01]` (P12 & P13) — Inconsistent `SPK_EXT_` ID derivation between Initial Import and Update Reconciliation
- **Evidence:** `src/domain/text/textExternalJsonDomain.js:357` (`SPK_EXT_${hashString(...)}`) vs. `src/domain/text/textExternalReconciliationDomain.js:158-159` (`` `SPK_EXT_${speakerUid.replace(/[^A-Za-z0-9]/g, '').slice(-10).toUpperCase()}` ``).
- **Risk:** Newly added external speakers during `update-existing` derive IDs from the trailing 10 alphanumeric characters of `speakerUid` rather than hashing like initial import; structurally inconsistent and risks ID collisions if two added UIDs share a 10-char suffix within one workspace.

#### `[RISK-02]` (P12 & P13) — Non-atomic multi-command writes in `handleStructuredTextApplyCardPlayerChanges` and External Audio GC ordering
- **Evidence:** `src/App.jsx:4570-4582, 5285-5375`.
- **Risk:** `handleStructuredTextApplyCardPlayerChanges` (`App.jsx:5285-5375`, wired at `L7552`) builds a single `nextBlockMetadata` object before `UPDATE_BLOCK` (avoiding the same-record overwrite pattern seen in `SPK-01`), then loops changed `UPDATE_SEGMENT` commands sequentially. Still, failures mid-loop or mid-external-reconcile before `runStructuredTextAudioStagingGc` (`App.jsx:4575`) are not wrapped in one IndexedDB multi-store transaction (unlike ZIP import's serialized rollback coordinator).

#### `[RISK-03]` (P12 & P13 | Minor UI) — Conversation Card speaker summary subtitle omits Workspace-level speaker overrides when Card override is unset
- **Evidence:** `src/components/text/TextStructuredCardAudioPanel.jsx:997`.
- **Risk:** When `!hasOverride` at Card level, the collapsed accordion subtitle shows `Inherits Workspace/Global • ${compactVoiceLabel(defaultTextVoiceName)}` without checking Workspace-level `speakerVoiceMap` or the `meaning` channel, which can momentarily mislead users until they expand the speaker accordion (`L1002-1011` where `inheritedFor(sample, channel, true)` resolves accurately).

#### `[RISK-04]` (Repo Hygiene) — Pre-existing identity audit script `audit-v603-d0-d1-text-identity.mjs` fails on outdated Table SHA-256 baseline
- **Evidence:** Observed at `8fd8c38`: `node scripts/audit-v603-d0-d1-text-identity.mjs` failed at `L229` (`treeHash('src/components/table')` actual `faa88212c55ed7f1a4ed782f6ed8614ac58ff89b27833bbfb50b013ce3809133` vs. expected `024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767`). `git log` confirms `src/components/table` was legitimately updated later in `033c83a` (Round D0 voice sorting polish) and `c0d9717` (D0 closure unavailable Edge voice guards), leaving the earlier hash constant stale.

---

### 3.4 Unverified / Runtime- & External-Fixture-Dependent Checks

The following items were **not** executed or inspected during this read-only audit and **must not** be reported as passing without dedicated verification:
1. **External Download Fixtures (outside repository root):**
   - `C:\Users\HikamSeif\Downloads\P12_Conversation_Only_Additional_Test_v1.json` — **UNVERIFIED** (not read, validated via `validateProLingoTextExternalPackage`, or imported).
   - `C:\Users\HikamSeif\Downloads\P13_Mixed_Additional_Test_v1.json` — **UNVERIFIED** (not read, validated via `validateProLingoTextExternalPackage`, or imported).
2. **Live Browser / IndexedDB / Audio Runtime Execution:**
   - All executed checks were static/headless Node scripts plus `vite build`. Real browser IndexedDB storage & Staging GC (`external-reconcile`), Web Speech API (`window.speechSynthesis`) voice fallback ordering across P12/P13, live Edge TTS server synthesis, ZIP import/export round-trips on P12/P13 fixtures, and UI responsiveness/scroll state remain **UNVERIFIED (Browser Runtime Required)**.

---

## 4. Baseline Verification Results Executed at `8fd8c38`

No `npm test` script exists in `package.json`; read-only verification scripts in `scripts/` and `npm run build` were executed directly on baseline `8fd8c38`:

| Check / Command | Scope Covered | Observed Result at `8fd8c38` |
| :--- | :--- | :--- |
| `npm run build` (`vite build`) | Production bundle compilation (`1895 modules`) | **PASS** (`7.50s`) |
| `node scripts/audit-v603-d2-external-json.mjs` | External JSON v1 validation, initial import, duplicate skip, Mix fixture | **PASS** (`30 checks`) |
| `node scripts/audit-v603-d3-d4-external-reconcile.mjs` | External JSON 3-way inspection & `update-existing` / `import-copy` / `keep-local` (in-memory) | **PASS** (`19 checks`) |
| `node scripts/audit-v603-round-c-taxonomy.mjs` | Legacy / Paragraph / Conversation / Mixed taxonomy & filters | **PASS** (`10 checks`) |
| `node scripts/audit-v603-p10-h1-h3-remediation.mjs` | Loop throttling, TTS fallback, Table/Text isolation, DB/Pack staging sync, ZIP rollback, Full playback slicing | **PASS** (`8/8 PASS`) |
| `node scripts/audit-v603-p10-h4-playback-remediation.mjs` | MediaSession Full mode, CUSTOM_LOCAL strictness, Browser TTS hierarchy, playback source status | **PASS** (`8/8 PASS`) |
| `node scripts/audit-v603-p10-h5-export-zip-remediation.mjs` | Card ZIP, Full Card Audio, Batch ZIP/MP3, Multi-part ZIP, ZIP import serialize/rollback | **PASS** (`11/11 PASS`) |
| `node scripts/audit-v603-beta8-p5-bulk-generation.mjs` | P5 Paragraph-first bulk generation planner & Conversation skip rules | **PASS** (`17 checks`) |
| `node scripts/audit-v603-beta8-p6-bulk-export.mjs` | P6 Paragraph-first bulk export planner & manifest/index | **PASS** (`17 checks`) |
| `node scripts/audit-v603-round-a-d1-d4.mjs` | Mode/editorModel folder & Bulk gating boundaries | **PASS** (`7/7 PASS`) |
| `node scripts/audit-v603-round-b-d2-d3.mjs` | Table vs Text system UI boundaries | **PASS** (`6/6 PASS`) |
| `node scripts/audit-v603-round-d1-reset-preferences.mjs` | Global/Workspace/Speaker/Card/Segment reset domain purity | **PASS** (`3/3 PASS`) |
| `node scripts/audit-v603-round-d2-reset-ui.mjs` | Reset UI confirmations, D2-C missing Full Paragraph gating & Conversation exclusion | **PASS** (`7/7 PASS`) |
| `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs` | Paragraph acceptance suite & isolation boundaries | **PASS** (`7/7 PASS`) |
| `node scripts/audit-v603-p4-reset-alignment.mjs` | Dropdown/Reset path alignment | **PASS** (`5/5 PASS`) |
| `node scripts/audit-v603-reset-dirty-release.mjs` | Dirty reset states & `emitTargetChange` async rejection propagation | **PASS** (`5/5 PASS`) |
| `node scripts/audit-v603-d0-d1-text-identity.mjs` | Text identity & Table component tree SHA-256 hash (`L229`) | **FAIL** (`exit 1` on stale Table hash `024aa45b...` vs `faa88212...`) |

---

## 5. Focused Regression Test Specifications Needed

1. **`test-ext-01-preserve-local-on-update` (`textExternalReconciliationDomain.js`):**
   - Given an external-imported P12/P13 document containing 1 local-only speaker (`SPK_LOCAL_*`, no `externalKey`), 1 local-only card (no `externalEntityV1`), and 1 local-only segment inside an external card, when `planTextExternalUpdateExisting` runs with updated external JSON, verify local-only entities are either intentionally preserved (per product policy) or explicitly surfaced in inspection warnings rather than silently dropped.
2. **`test-ext-02-speaker-reassignment-conflict` (`textExternalJsonDomain.js` + `textExternalReconciliationDomain.js`):**
   - Given an imported Conversation segment whose `metadata.externalEntityV1.speakerKey` was `'alex'`, change the local segment's speaker to `'jordan'` (`speakerIdentityV1` / `segment.speaker`) without editing `externalEntityV1`. Assert `buildTextExternalLocalEntityFingerprints` changes the segment fingerprint and external JSON inspection flags the segment as locally modified (`conflicts > 0`).
3. **`test-ext-03-speaker-rename-segment-label-sync` (`textExternalReconciliationDomain.js`):**
   - Rename a speaker's `displayName` in updated external JSON while keeping segment text/meaning unchanged; run `planTextExternalUpdateExisting` with `decision.action === 'incoming'` on the speaker. Assert kept segments under that `speakerIdentityV1` reflect the updated `segment.speaker` label matching `speakerRegistryV1[id].label`.
4. **`test-spk-01-no-metadata-clobber` (`App.jsx` / command domain):**
   - On a freshly authored Conversation card whose speaker is not yet persisted in `document.metadata.speakerRegistryV1`, trigger `handleStructuredTextSpeakerVoiceChange`, `handleStructuredTextSpeakerRateChange`, `handleStructuredTextSpeakerLocalAudioVoiceChange`, and `handleStructuredTextSpeakerDownloadVoiceChange`. Assert the resulting `document.metadata` retains **both** the new `speakerRegistryV1` entry and the newly set voice/rate/local/download profile without clobbering either.
5. **`test-spk-02-rename-collision-ui` (`TextStructuredSpeakerRegistry.jsx`):**
   - Register two speakers (`Alice`, `Bob`), attempt to rename `Bob` to `alice` (case-insensitive collision). Assert UI catches the domain error, displays an accessible `role="alert"` error message without unhandled promise rejection, and leaves `speakerRegistryV1` + segment labels consistent.
6. **`test-mix-01-custom-local-sync-mixed-doc` (`textStructuredLocalAudioProfileDomain.js`):**
   - On a `documentType: 'mixed'` document containing Paragraph + Conversation cards with Speaker-1 Sync enabled (`audioSyncProfileV1.voice.text = true`) and pinned local voices on Speaker 1 and Speaker 2, assert `resolveTextStructuredEffectiveCustomLocalVoice` for a Speaker 2 conversation segment honors the agreed P13 rule consistently with Browser TTS (`App.jsx:1004-1006`) and UI (`TextStructuredAudioControls.jsx:603-604`).

---

## 6. P12-First / P13-Second Remediation & Acceptance Matrix

| Priority | Phase | ID | Item & Scope | Classification | Target Acceptance Criterion |
| :---: | :---: | :---: | :--- | :--- | :--- |
| **P0** | P12 → P13 | `SPK-01` | Fix stale pre-`await` `activeTextDocumentTree.metadata` overwrites in `App.jsx` speaker handlers & non-atomic `ensureStructuredTextSpeakerIdentity` | Confirmed Bug | Editing voice/rate/local/download on a newly authored speaker persists both `speakerRegistryV1` and the audio setting in IDB cleanly. |
| **P0** | P12 → P13 | `EXT-01` | Decide & enforce local-only card/segment/speaker preservation or warning during `planTextExternalUpdateExisting` | Confirmed Bug | External `update-existing` never silently deletes local-only additions without explicit policy/warning and test coverage. |
| **P0** | P12 → P13 | `EXT-02` | Fix `buildTextExternalLocalEntityFingerprints` preferring stale `segmentMeta?.speakerKey` over actual local speaker | Confirmed Bug | Local speaker reassignments trigger conflict detection on external re-import. |
| **P1** | P12 → P13 | `EXT-03` | Propagate incoming speaker `displayName` updates onto kept `segment.speaker` strings | Confirmed Bug | `segment.speaker` and `speakerRegistryV1.label` stay aligned after external speaker renames. |
| **P1** | P12 → P13 | `SPK-02` | Catch speaker rename collision in `TextStructuredSpeakerRegistry.jsx` + harden rename command sequencing | Confirmed Bug | Duplicate speaker rename shows clean inline error; no split registry/segment divergence on failure. |
| **P1** | P13 | `MIX-01` | Align `resolveTextStructuredEffectiveCustomLocalVoice` (`textStructuredLocalAudioProfileDomain.js:72`) with `blockType === 'conversation'` & UI/TTS Sync | Confirmed Bug | `CUSTOM_LOCAL` + Sync ON behaves identically for Conversation cards in `mixed` docs as in `conversation` docs. |
| **P1** | P12 & P13 | `UNV-01` | Validate & test external Download fixtures (`P12_Conversation_Only_Additional_Test_v1.json`, `P13_Mixed_Additional_Test_v1.json`) + run live browser IDB/audio E2E | Unverified | Both user JSON fixtures pass `validateProLingoTextExternalPackage`, initial import, conflict reconcile, Split/Custom-Local playback, Card Audio, and Portable ZIP round-trip in Chrome. |
| **P2** | P12 & P13 | `POL-01`..`POL-04` | Lock product policy for Conversation Bulk Audio (`POL-01`), Full mode / Full MP3 (`POL-02`), Download `FOLLOW_PLAYER` vs Sync (`POL-03`), External Export (`POL-04`) | Policy Contract | Documented owner sign-off in Issue #4 or scoped follow-up implementation tasks. |
| **P2** | P12 & P13 | `RISK-01`..`RISK-04` | Unify `SPK_EXT_` ID derivation (`RISK-01`), harden sequential apply/GC command boundaries (`RISK-02`), fix collapsed speaker summary subtitle (`RISK-03`), refresh stale Table SHA-256 baseline in `audit-v603-d0-d1-text-identity.mjs` (`RISK-04`) | Consistency / Hygiene | Consistent `SPK_EXT_` IDs, hardened multi-step failure recovery, accurate card speaker summary, and 100% green `scripts/audit-*.mjs` suite. |
