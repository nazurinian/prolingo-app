# ProLingo P15-A2 — Persistence & Transaction Contract

**Branch:** `feature/p15-structured-data-management`  
**Worktree:** `prolingo-p12-integration-qa`  
**Baseline commit:** `71802b58fb02d20e42c69216247d2b9ecd6fb754`  
**Scope:** Authoritative transactional persistence, single-read snapshot/backup integrity, and direct-host UI lifecycle safety on isolated disposable IndexedDB databases (`prolingo_text_library_d3b_qa_*`). Canonical IndexedDB (`prolingo_text_library`) remains strictly at `TEXT_LIBRARY_DB_VERSION = 1` and `TEXT_LIBRARY_SCHEMA_VERSION = 1` with live canonical writes disabled.

---

## 1. Boundary & Canonical Database Protection

1. **Canonical Constants Unchanged:** `src/constants/textDatabaseConstants.js` preserves `TEXT_LIBRARY_DB_VERSION = 1` and `TEXT_LIBRARY_SCHEMA_VERSION = 1`.
2. **Disposable QA Database Enforcement:** `src/services/persistence/textDataManagementPersistenceService.js` validates all persistence entrypoints (`seedDisposableTextManagementDatabase`, `readDisposableTextManagementDatabaseState`, `executeDisposableTextManagementTransaction`, `exportDisposableTextManagementDatabaseBackup`, `restoreDisposableTextManagementDatabaseBackup`, and `createTextDataManagementPersistenceAdapter`) through `assertDisposablePersistenceOptions`.
   - `prolingo_text_library` is rejected with `TextDataManagementError('CANONICAL_DB_PROTECTED', ...)`.
   - Empty names or names outside `prolingo_text_library_d3b_qa_*` are rejected with `TextDataManagementError('INVALID_DATABASE_NAME', ...)`.
   - Flags `allowCanonicalWrites`, `allowCanonicalDatabase`, `canonical`, `liveCanonical`, or `mode !== 'disposable-qa'` are rejected with `TextDataManagementError('CANONICAL_WRITES_DISABLED', ...)`.
   - Passing external raw `IDBDatabase` handles via `options.db` is rejected with `TextDataManagementError('INVALID_OPTIONS', ...)`.

---

## 2. Single-Allocation Transactional Command Contract (A2-T)

### 2.1 Prohibiting Direct `executeTextLibraryCommand` Session Binding
- `executeTextLibraryCommand` opens the canonical v1 DB directly, bypasses v2 `contentUnits`, lacks an expected-snapshot concurrency precondition, and allocates IDs/UIDs and timestamps independently of `createTextSnapshotCommandCoordinator`.
- Binding `executeTextLibraryCommand` as `execute` into:
  - `createTextDataManagementSession` (`src/services/textDataManagementSession.js`)
  - `createTextSnapshotCommandCoordinator` (`src/domain/text/textMixedEditorDomain.js`)
  - `TextDataManagementPage` (`src/components/text/management/TextDataManagementPage.jsx`)
  is rejected immediately with `TextDataManagementError('INVALID_EXECUTOR', ...)`.

### 2.2 Synchronous Single-Transaction Read-Validate-Allocate-Write Protocol
Implemented in `executeDisposableTextManagementTransaction`:

1. **Boundary & Precondition Gate (Pre-Lock):**
   - Requires `boundary === 'disposable'` (`READ_ONLY` otherwise).
   - Requires non-empty `expectedSnapshotFingerprint` (`PRECONDITION_REQUIRED` otherwise).
2. **In-Process Concurrency Lock:**
   - Acquires per-DB lock in `activeWriteLocks`; overlapping in-process writes targeting the same `dbName` fail immediately with `TextDataManagementError('BUSY', ...)`.
3. **Single Synchronous IndexedDB `readwrite` Transaction (`runSynchronousReadWriteTransaction`):**
   - Opens all stores (`meta`, `collections`, `documents`, `blocks`, `segments`, `audioVariants`, plus `contentUnits` on v2) in one `readwrite` transaction and reads all rows before running synchronous commit logic inside the final `req.onsuccess` callback so IndexedDB cannot auto-commit early.
   - Reconstructs and validates `beforeState` via `reconstructValidatedStateFromRows` (checking core metadata completeness, migration state via `inspectTextContentUnitMigrationState`, snapshot integrity via `validateTextManagementSnapshot`, and counter floors).
   - **Stale Edit Rejection Before Allocation:** Computes `beforeState.snapshotFingerprint` via `canonicalJsonStringify`. If `beforeState.snapshotFingerprint !== expectedSnapshotFingerprint`, throws `TextDataManagementError('STALE_RESULT', ...)` and aborts the transaction **before** calling `applyTextDataManagementCommand` or allocating any ID/UID or advancing counters.
   - **Single ID/UID Allocation:** Calls `applyTextDataManagementCommand(beforeState.snapshot, command, { selection, boundary, permissions, now })` **once** inside the transaction against live DB rows and DB `counters`.
   - **Zero-Allocation Preflight in Session Coordinator:** `createTextDataManagementSession` supplies `precheck: validateAndScopeTextDataManagementCommand` (`src/domain/text/textDataManagementDomain.js`) so when `execute.authoritativeTransaction === true`, `createTextSnapshotCommandCoordinator` validates command fields, capability boundaries, protected metadata, and workspace scope locally **without** invoking `applyTextLibraryCommand` or generating duplicate UIDs prior to the DB transaction.
   - **Atomic Diff Writes & Metadata Preservation:** Stages `put`/`delete` diffs via `writeRecordDiff` across entity stores (`collections`, `documents`, `blocks`, `contentUnits`, `segments`, `audioVariants`) and updates only core `meta` keys (`schemaVersion`, `initialized`, `activeDocumentId`, `idCounters`, `contentUnitMigration`). All other `meta` records (`sourceAttachments`, `externalSourceImports`, `legacyMigration`, and unknown/opaque keys) are preserved untouched.
   - **Interruption/Abort Rollback Hook:** Invokes optional `onBeforeCommit({ tx, beforeSnapshot, afterSnapshot, result, metaRecords })` inside the transaction prior to completion; throwing or calling `tx.abort()` rolls back every staged store and metadata write atomically.
   - **Authoritative Receipt:** Resolves on `tx.oncomplete` with a deeply frozen receipt:
     `{ ok: true, authoritative: true, dbName, dbVersion, commandType, expectedRevision, previousFingerprint, snapshotFingerprint, snapshot, result, metaRecords }`.

### 2.3 Coordinator & Session Receipt Verification
When `execute?.authoritativeTransaction === true` in `createTextSnapshotCommandCoordinator`:
1. Verifies the session was not disposed and `documentId`, `snapshot` reference, `revision`, and `canonicalJsonStringify(snapshot)` still equal pre-dispatch captured values (`STALE_RESULT` otherwise).
2. Verifies `outcome.ok === true`, `outcome.authoritative === true`, `outcome.previousFingerprint === captured`, valid `outcome.snapshot`, and defined `outcome.result` (`INVALID_RESPONSE` otherwise).
3. Validates `outcome.snapshot` via `validateSnapshot` (`validateTextManagementSnapshot`) and commits the cloned authoritative snapshot and optional `outcome.metaRecords` via `onCommit`, updating selection reconciliation while preserving unrelated session drafts.

---

## 3. Consistent Snapshot & Backup Integrity Contract (A2-B)

1. **Single Consistent `readonly` Read (`readDisposableTextManagementDatabaseState`):**
   - Opens one `readonly` transaction across `meta` and all existing object stores (`v1` without `contentUnits`, `v2` with `contentUnits`).
   - Never upgrades a `v1` database silently when `version` is omitted (`indexedDB.open(safeName)` without version number, failing closed with `UNINITIALIZED` on unseeded databases).
   - **No Synthetic Core Metadata:** When `requireCompleteMetadata` is true (default), missing `schemaVersion`, `initialized`, `activeDocumentId`, `idCounters` (or missing `contentUnitMigration` on schema 2) fails closed with `METADATA_REQUIRED` / `MIGRATION_REQUIRED`. Disagreements between `meta` records and normalized snapshot state (including `idCounters` falling below store high-water sequences) fail with `METADATA_MISMATCH` / `INVALID_SNAPSHOT`.
   - Returns frozen `{ dbVersion, schemaVersion, hasUnitsStore, snapshot, snapshotFingerprint, metaRecords, sourceAttachments, externalImports, extraMetaRecords }`.
2. **Backup Export (`exportDisposableTextManagementDatabaseBackup`):**
   - Executes `readDisposableTextManagementDatabaseState` and passes `{ snapshot, metaRecords }` to `exportTextManagementData(..., { kind: 'database-backup', metaRecords, now })`.
   - Physical audio binaries remain separated (`audioBinaryIncluded: false`); all known and unknown `metaRecords` are preserved.
3. **Replace-Policy Restore (`restoreDisposableTextManagementDatabaseBackup`):**
   - Verifies raw incoming `backup.metaRecords` presence (`schemaVersion`, `initialized`, `idCounters`) before running `inspectTextManagementTransfer` + `validateProLingoTextDatabaseBackup` when `upgradeV1Backup` is false (preventing silent counter synthesis during inspection).
   - Replaces entity stores and `meta` store atomically in a single `readwrite` transaction, purging stale entities and stale metadata keys while restoring unknown metadata records, `sourceAttachments`, `externalSourceImports`, `legacyMigration`, counters, and UIDs.

---

## 4. Direct-Host UI Lifecycle Contract (A2-S)

1. **Prop Stability (`src/components/text/management/TextDataManagementPage.jsx`):**
   - Uses frozen module-level defaults `EMPTY_OBJECT` and `EMPTY_ARRAY` for `initialSelection`, `permissions`, `sourceAttachments`, `externalImports`, and `extraMetaRecords`.
2. **Idempotent Direct-Host Initialization & Source Sync:**
   - Stores source inputs applied to the current internal session in `appliedSourceRef` (`session`, `snapshot`, `sourceAttachments`, `externalImports`, `metaRecords`).
   - Initial direct mount (without `externalSession`, including React `<StrictMode>` double-effect execution) and subsequent parent rerenders with unchanged source props do **not** call `replaceSource`, keeping initial `revision === 1`, preserving committed commands, selection, and drafts.
   - `replaceSource` runs only when the host supplies a changed `snapshot`, `sourceAttachments`, `externalImports`, or `metaRecords` reference for the active internal session.
3. **Controlled Adapter Interface (`persistenceAdapter` & `createTextDataManagementPersistenceAdapter`):**
   - `TextDataManagementPage` accepts optional `persistenceAdapter` (binding `persistenceAdapter.execute` and `persistenceAdapter.metaRecords`) while hard-rejecting `canonicalWritesEnabled === true` (`CANONICAL_WRITES_DISABLED`) and `executeTextLibraryCommand` (`INVALID_EXECUTOR`).
