# ProLingo P15-A2 — Hydrogen H2 Integration Handoff

**From:** Codex (P15-A2 Persistence & Transaction Integration)  
**To:** Gemini Hydrogen (Future P15-H2 / Canonical Gate Integration)  
**Branch:** `feature/p15-structured-data-management`  
**Worktree:** `prolingo-p12-integration-qa`

---

## 1. What H2 Can Safely Assume Is Ready

1. **Authoritative Disposable DB Persistence Adapter (`createTextDataManagementPersistenceAdapter`):**
   - Defined in `src/services/persistence/textDataManagementPersistenceService.js`.
   - Returns a frozen adapter (`{ mode: 'disposable-qa', dbName, canonicalWritesEnabled: false, boundary, permissions, loadState, exportBackup, execute }`).
   - `adapter.loadState()` reads `snapshot`, `snapshotFingerprint`, `metaRecords`, `sourceAttachments`, `externalImports`, and `extraMetaRecords` in **one consistent `readonly` IndexedDB transaction** (without synthesizing missing canonical metadata).
   - `adapter.exportBackup()` exports a validated `prolingo-text-database-backup` (`audioBinaryIncluded: false`) using that same consistent `readonly` transaction.
   - `adapter.execute` is tagged with `authoritativeTransaction: true`, enforces expected snapshot fingerprint preconditions before single ID/UID allocation, commits store diffs atomically, preserves `sourceAttachments`, `externalSourceImports`, `legacyMigration`, and unknown `meta` keys, and rejects stale concurrent edits (`STALE_RESULT`), overlapping writes (`BUSY`), and aborted commits.

2. **Direct-Host `<TextDataManagementPage />` Mounting Fixed (A2-S):**
   - Mounting `<TextDataManagementPage snapshot={state.snapshot} initialSelection={...} boundary={...} permissions={...} persistenceAdapter={adapter} metaRecords={state.metaRecords} sourceAttachments={state.sourceAttachments} externalImports={state.externalImports} extraMetaRecords={state.extraMetaRecords} />` **without** an external `session` prop now maintains `revision = 1` across `<StrictMode>` mount and parent rerenders, preserves committed commands, retains unrelated drafts, and rejects stale async responses cleanly.
   - Do **not** pass `executeTextLibraryCommand` to `TextDataManagementPage`, `createTextDataManagementSession`, or `createTextSnapshotCommandCoordinator` — it is explicitly rejected with `INVALID_EXECUTOR`.

---

## 2. What Remains Explicitly Gated / Out of Scope for H2 Until Approved

1. **Canonical Database (`prolingo_text_library`) Remains Protected (`v1`):**
   - `TEXT_LIBRARY_DB_VERSION = 1` and `TEXT_LIBRARY_SCHEMA_VERSION = 1` must remain unchanged.
   - `canonicalWritesEnabled` is `false`; attempting `allowCanonicalWrites`, `allowCanonicalDatabase`, `mode: 'canonical'`, or passing `dbName: 'prolingo_text_library'` throws `CANONICAL_WRITES_DISABLED` / `CANONICAL_DB_PROTECTED`.
2. **Transfer Mutating Workflows Remain Unbound in UI:**
   - Replace-policy DB restore (`restoreDisposableTextManagementDatabaseBackup`), Text Pack sync/detach commits, External JSON reconciliation commits, physical Staging/FS audio deletions, Legacy editing, and multi-Workspace source detach are still NOT bound to `TextDataManagementPage` buttons unless explicitly scoped in a future gate.
3. **Production Route Unwired:**
   - Structured Text Data Management remains reachable only via `?qa=data-management` / `#qa-data-management` in DEV mode.

---

## 3. Recommended H2 Pattern When Binding Disposable QA Databases in UI

```js
// 1. Read authoritative state + complete metaRecords in one readonly tx:
const initial = await adapter.loadState();

// 2. Mount TextDataManagementPage directly (or with an external session):
<TextDataManagementPage
  snapshot={initial.snapshot}
  metaRecords={initial.metaRecords}
  sourceAttachments={initial.sourceAttachments}
  externalImports={initial.externalImports}
  extraMetaRecords={initial.extraMetaRecords}
  boundary="disposable"
  permissions={['catalog', 'content']}
  persistenceAdapter={adapter}
  onReloadValidSource={async () => {
    const reloaded = await adapter.loadState();
    setLoadedState(reloaded);
  }}
/>
```
If a concurrent writer triggers `STALE_RESULT`, `TextDataManagementPage` surfaces the non-blocking `STALE_RESULT` banner while retaining all in-memory drafts; triggering `onReloadValidSource` fetches a fresh `loadState()` snapshot and `replaceSource` updates the page cleanly.
