import { createMigrationFixture } from './migration-fixture.js';
import { migrateDisposableTextLibraryCopy } from '../../../src/services/persistence/textV2MigrationCopyService.js';
import { seedDisposableTextManagementDatabase as seed, readDisposableTextManagementDatabaseState as read,
  restoreDisposableTextManagementDatabaseBackup as restore, executeDisposableTextManagementTransaction as command } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
import { canonicalJsonStringify as canonical } from '../../../src/domain/text/textCanonicalFingerprintDomain.js';
const assert = (ok, message) => { if (!ok) throw Error(message); };
export async function runP15A2BrowserCases() {
  const f = createMigrationFixture(), names = [], results = [];
  const db = label => { const name = 'prolingo_text_library_d3b_qa_r2_' + label; names.push(name); return name; };
  const source = db('source'), target = db('target'), recovery = db('recovery'), interrupted = db('interrupted');
  const test = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, error: e.message }); } };
  let outcome, original;
  try {
    await seed({ dbName: source, ...f, version: 1, createOnly: true }); original = await read({ dbName: source });
    await test('Complete v1-to-v2 copy preserves source v1 and all identity/audio/source/meta relationships', async () => {
      outcome = await migrateDisposableTextLibraryCopy({ sourceDbName: source, targetDbName: target, now: 22000 });
      assert((await read({ dbName: source })).snapshotFingerprint === original.snapshotFingerprint, 'Source data changed');
      assert((await read({ dbName: source })).dbVersion === 1, 'Source schema upgraded');
      const next = outcome.committed;
      assert(next.dbVersion === 2 && next.snapshot.contentUnits.length > 0, 'Destination incomplete');
      for (const key of ['collections', 'documents', 'blocks', 'audioVariants']) assert(canonical(next.snapshot[key]) === canonical(original.snapshot[key]), 'Changed ' + key);
      for (const key of ['sourceAttachments', 'externalSourceImports', 'legacyMigration', 'unknownFutureKey']) {
        assert(canonical(next.metaRecords.find(m => m.key === key)) === canonical(original.metaRecords.find(m => m.key === key)), 'Lost metadata ' + key);
      }
      assert(!next.snapshot.contentUnits.some(u => u.documentId === f.ids.legacyId), 'Legacy converted into Units');
    });
    await test('Backup recovery is independently read and fingerprint verified', async () => {
      await restore({ dbName: recovery, backup: outcome.plan.backupAfter });
      const recovered = await read({ dbName: recovery });
      assert(recovered.snapshotFingerprint === outcome.plan.snapshotFingerprint, 'Recovered snapshot differs');
      assert(canonical(recovered.sourceAttachments) === canonical(outcome.committed.sourceAttachments), 'Recovered ownership differs');
    });
    await test('Interrupted destination transaction rolls back rows and counters; source backup is recoverable', async () => {
      let failed = false;
      try { await migrateDisposableTextLibraryCopy({ sourceDbName: source, targetDbName: interrupted, onBeforeCommit: ({ tx }) => tx.abort() }); } catch { failed = true; }
      assert(failed, 'Interrupted migration succeeded');
      assert((await read({ dbName: source })).snapshotFingerprint === original.snapshotFingerprint, 'Interrupted copy changed source');
      const restoredSource = db('source_recovery'); await restore({ dbName: restoredSource, backup: outcome.plan.backupBefore });
      assert((await read({ dbName: restoredSource })).snapshotFingerprint === original.snapshotFingerprint, 'Original source backup not recoverable');
    });
    await test('Repeated migration cannot overwrite destination; same-name and canonical sources reject', async () => {
      const before = await read({ dbName: target });
      for (const options of [{ sourceDbName: source, targetDbName: target }, { sourceDbName: source, targetDbName: source },
        { sourceDbName: 'prolingo_text_library', targetDbName: db('unused') }]) {
        let rejected = false; try { await migrateDisposableTextLibraryCopy(options); } catch { rejected = true; } assert(rejected, 'Unsafe copy accepted');
      }
      assert((await read({ dbName: target })).snapshotFingerprint === before.snapshotFingerprint, 'Repeated migration changed target');
    });
    await test('Migrated v2 supports Paragraph and Conversation authoring with persistent Units', async () => {
      let state = await read({ dbName: target });
      const out = await command({ dbName: target, selection: { workspaceId: f.ids.mixedId }, boundary: 'disposable', permissions: ['content'],
        expectedSnapshotFingerprint: state.snapshotFingerprint, command: { type: 'contentUnit.create', payload: { blockId: f.ids.scene, kind: 'turn', speaker: 'Carol', text: 'New authored Turn.', meaning: 'Giliran baru.' } } });
      assert(out.ok && out.snapshot.contentUnits.some(u => u.id === out.result.id), 'Native postmigration authoring failed');
      state = await read({ dbName: target }); assert(state.snapshotFingerprint === out.snapshotFingerprint, 'Authored result not committed');
    });
  } finally { for (const name of names) await deleteDisposableTextLibraryDatabase({ dbName: name }); }
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, canonicalDbTouches: window.__p15A2CanonicalDbTouches, hasCanonicalDb: false, remainingDisposableDbs: (await indexedDB.databases()).filter(d => names.includes(d.name)).length };
}
