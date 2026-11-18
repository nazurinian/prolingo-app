# ProLingo P15-A2 — Safe Persistence & Transaction Integration Report

**Date:** 2026-11-18  
**Branch:** `feature/p15-structured-data-management`  
**Worktree:** `prolingo-p12-integration-qa`  
**Baseline:** `71802b58fb02d20e42c69216247d2b9ecd6fb754`  
**Status:** COMPLETE — Verified across Node and real headless Microsoft Edge (IndexedDB + React `<StrictMode>`).

---

## 1. Summary of Implemented Changes

### Modified Source Files (Preserving Completed P15-H1 UI Design)
1. `src/domain/text/textDataManagementDomain.js`
   - Exported `validateAndScopeTextDataManagementCommand` and reused it inside `applyTextDataManagementCommand` so session preflight validates command structure, capability boundaries, protected metadata, and Workspace scope without prematurely allocating IDs or UIDs.
2. `src/domain/text/textMixedEditorDomain.js`
   - Added `INVALID_EXECUTOR` guard in `createTextSnapshotCommandCoordinator` rejecting direct `executeTextLibraryCommand` callbacks.
   - Added `authoritativeTransaction: true` receipt mode alongside optional `precheck` and `validateSnapshot` hooks, verifying `previousFingerprint`, active revision, active workspace ID, snapshot stability, and receipt shape prior to committing.
3. `src/services/textDataManagementSession.js`
   - Added explicit `executeTextLibraryCommand` rejection (`INVALID_EXECUTOR`) on session construction.
   - Wired `precheck: validateAndScopeTextDataManagementCommand` and `validateSnapshot: validateTextManagementSnapshot` into `createTextSnapshotCommandCoordinator`.
   - Added optional `metaRecords` tracking updated from authoritative transaction receipts and forwarded to `exportData({ kind: 'database-backup' })` without allowing synthetic fallback when `metaRecords` is absent.
4. `src/components/text/management/TextDataManagementPage.jsx`
   - Fixed the direct-host lifecycle defect where mounting `TextDataManagementPage` without an external `session` prop (or re-rendering a parent with omitted optional props) triggered spurious `replaceSource` calls via uninitialized `syncedState.session` + `firstMountRef` and inline `{}` / `[]` default props (`revision` jumping `1 -> 2` and resetting committed state).
   - Replaced inline defaults with `EMPTY_OBJECT` / `EMPTY_ARRAY`, tracked loaded inputs in `appliedSourceRef`, added `data-dm-revision={revision}`, and added controlled `persistenceAdapter` / `metaRecords` prop support with `INVALID_EXECUTOR` and `CANONICAL_WRITES_DISABLED` guards.

### New Source & Verification Files
1. `src/services/persistence/textDataManagementPersistenceService.js`
   - Disposable QA persistence transaction service (`prolingo_text_library_d3b_qa_*`), single-transaction `readonly` snapshot/meta reader, synchronous `readwrite` single-allocation command executor (`executeDisposableTextManagementTransaction`), consistent backup export/restore (`exportDisposableTextManagementDatabaseBackup`, `restoreDisposableTextManagementDatabaseBackup`), test seeder (`seedDisposableTextManagementDatabase`), and controlled adapter factory (`createTextDataManagementPersistenceAdapter` with `canonicalWritesEnabled: false`).
2. `scripts/audit-v603-p15-a2-persistence.mjs` (Node verification — 6/6 checks)
3. `scripts/audit-v603-p15-a2-persistence-browser.mjs` & `scripts/fixtures/p15-data-management/a2-browser-cases.jsx` (Real Edge IndexedDB + React `<StrictMode>` verification — 6/6 checks)

---

## 2. Verification Results

All checks below ran after the final code edit (including reverting the unused non-transactional marker in `src/services/persistence/textLibraryCommandService.js`):

| Check / Suite | Scope | Result | Notes |
| --- | --- | --- | --- |
| `npm run build` | Production Vite build | PASS | Built `dist/assets/index-9b3mrNZx.js` & CSS cleanly |
| Scoped ESLint (`npx eslint ...`) | All modified/created P15-A2 JS/JSX files | PASS | 0 errors, 0 warnings |
| `git diff --check` | Patch whitespace hygiene | PASS | 0 issues |
| `scripts/audit-v603-p15-a2-persistence.mjs` | A2 Node contract, single allocation & guards | 6/6 PASS | `dbCalls: 0`, `TEXT_LIBRARY_DB_VERSION = 1`, `TEXT_LIBRARY_SCHEMA_VERSION = 1` |
| `scripts/audit-v603-p15-a2-persistence-browser.mjs` | A2-T / A2-B / A2-S real Edge IndexedDB + React `<StrictMode>` | 6/6 PASS | `canonicalDbTouches: 0`, `hasCanonicalDb: false`, `remainingDisposableDbs: 0` |
| `scripts/audit-v603-p15-data-management.mjs` | P15-A1 Domain & Session contract | 18/18 PASS | `dbCalls: 0` |
| `scripts/audit-v603-p15-data-management-browser.mjs --check-production` | P15-H1 Browser UI & Prod bundle isolation | 13/13 PASS | 4/4 DEV/PROD route gates pass; `qaPreviewAbsent: true` |
| `scripts/audit-v603-p12d-virtual-content-units.mjs` | D2 Virtual Content Units | PASS | All checks pass |
| `scripts/audit-v603-p12d-d3b-content-unit-persistence.mjs` | D3-B Persistence | PASS | All checks pass |
| `scripts/audit-v603-p12d-d3c-compatibility.mjs` | D3-C Backup/Restore/Export compat | PASS | All checks pass |
| `scripts/audit-v603-p12d-d3d-regression.mjs` & `...browser.mjs` | D3-D Node + Real IDB browser audit | PASS | 9/9 browser IDB checks pass |
| `scripts/audit-v603-p12d-d4a-conversation-editor.mjs` | D4 Conversation Editor Core | PASS | All checks pass |
| `scripts/audit-v603-p12d-d5-conversation-audio.mjs` | D5 Conversation Audio Core | PASS | All checks pass |
| `scripts/audit-v603-p12-shared-card-a1..a4h` (Node) + `a4c/a4h-browser` | Shared Card Presentation A1..A4H | PASS | All checked suites pass |
| `scripts/audit-v603-d2-external-json.mjs` & `d3-d4-external-reconcile.mjs` | External JSON & Reconciliation | PASS | 30 & 19 checks pass |

### Pre-Existing Unrelated Failures Observed During Broad Regression Sweep
- `scripts/audit-v603-d0-d1-text-identity.mjs`: failed at line 229 on `EXPECTED_TABLE_COMPONENTS_SHA256` hash check over `src/components/table` (pre-existing branch change in `src/components/table`; `src/components/table` was not modified in P15-A2).
- `scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs`: Cases 1–9 passed, Case 10 failed at line 834 asserting `/Browser TTS/` against `'David · US'` from `formatTextStructuredBrowserVoiceLabel` (pre-existing voice-label formatting unrelated to P15-A2).
  - Companion `scripts/audit-v603-p9b-playback-marathon.mjs` (24/24 PASS) and `scripts/audit-v603-p9c-bulk-marathon.mjs` (17/17 PASS) both passed completely.

---

## 3. Defects Caught & Fixed During P15-A2 Verification

1. **Direct-Host `replaceSource` Lifecycle Bug (`TextDataManagementPage.jsx`):**
   - Mounting `TextDataManagementPage` without an external `session` previously fired `replaceSource` on initial session creation (`revision: 1 -> 2`) and on every parent rerender due to `firstMountRef` flipping before `syncedState.session` existed plus fresh `{}` / `[]` default props. Fixed using `EMPTY_OBJECT` / `EMPTY_ARRAY` and `appliedSourceRef`.
2. **Backup Validation Meta Synthesis Bypass (`textDataManagementPersistenceService.js`):**
   - Calling `inspectTextManagementTransfer({ kind: 'database-backup' })` delegates to `validateProLingoTextDatabaseBackup`, which reconstructs `metaRecords` entries including `idCounters`. When `upgradeV1Backup` is false, `restoreDisposableTextManagementDatabaseBackup` now validates raw `backup.metaRecords` keys (`schemaVersion`, `initialized`, `idCounters`) *before* inspection so backups missing core metadata fail with `METADATA_REQUIRED`.
3. **Counter Floor Integrity Check (`textDataManagementPersistenceService.js`):**
   - `validateTextLibrarySnapshot` did not reject `idCounters` falling behind existing collection/document/block/segment/audioVariant ID sequences. `reconstructValidatedStateFromRows` now verifies every counter floor against high-water store sequences when `requireCompleteMetadata` is true and fails with `METADATA_MISMATCH`.
