import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { backfillTextContentUnits } from '../../../src/domain/text/textContentUnitDomain.js';
import { createProLingoTextDatabaseBackup } from '../../../src/domain/text/textDatabaseBackupDomain.js';
import * as persistence from '../../../src/services/persistence/textContentUnitPersistenceService.js';

// Run only in a fresh disposable browser profile. Every factory call is guarded as well.
export const runD3dBrowserCases = async () => {
  const prefix = 'prolingo_text_library_d3b_qa_d3d_';
  const nativeFactory = globalThis.indexedDB;
  const names = new Set();
  const checkName = name => {
    if (!String(name).startsWith(prefix)) throw new Error(`D3D factory blocked database: ${name}`);
    names.add(name);
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open(name, version) { checkName(name); return nativeFactory.open(name, version); },
    deleteDatabase(name) { checkName(name); return nativeFactory.deleteDatabase(name); }
  } });
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
  const rejects = async (fn, pattern) => {
    try { await fn(); } catch (error) {
      assert(!pattern || pattern.test(String(error)), `Unexpected rejection: ${error}`);
      return;
    }
    throw new Error('Expected rejection, operation succeeded');
  };
  const test = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack || String(error) }); }
  };
  const empty = { schemaVersion: 1, initialized: true, activeDocumentId: null, counters: {}, collections: [], documents: [], blocks: [], segments: [], audioVariants: [] };
  const command = (snapshot, type, payload) => applyTextLibraryCommand(snapshot, { type, payload }, 100).snapshot;
  let v1 = command(empty, 'document.create', { title: 'Disposable D3D', documentType: 'paragraph' });
  v1 = command(v1, 'block.create', { documentId: v1.documents[0].id, blockType: 'paragraph' });
  v1 = command(v1, 'segment.create', { blockId: v1.blocks[0].id, text: 'Keep my identity.' });
  const v2 = backfillTextContentUnits(v1, { now: 200 }).snapshot;
  const read = async dbName => {
    const db = await persistence.openDisposableTextLibraryV2Database({ dbName });
    try { return await persistence.readTextLibraryV2SnapshotFromDb(db); }
    finally { db.close(); }
  };
  const seed = (dbName, snapshot = v1, version = 1) => persistence.writeTextLibrarySnapshotToDisposableDb({ dbName, snapshot, version });
  const dbName = `${prefix}migration`;
  try {
    await test('v2 snapshot cannot be seeded into v1 stores', async () => {
      await rejects(() => seed(`${prefix}wrong_version`, v2), /v2.*v1/);
    });
    await test('synchronous put failure aborts queued clears and writes', async () => {
      const name = `${prefix}clone_failure`;
      await seed(name, v2, 2);
      const before = await read(name);
      const broken = { ...v2, blocks: v2.blocks.map(block => ({ ...block, metadata: { cannotClone: () => {} } })) };
      await rejects(() => seed(name, broken, 2), /clone|function/i);
      equal(await read(name), before, 'DataCloneError partially committed the replace writer');
    });
    await test('browser v1 migration, indexes and exact repeat identity', async () => {
      await seed(dbName);
      const migration = await persistence.runDisposableContentUnitMigration({ dbName, now: 300 });
      assert(migration.statusAfter === 'migrated-v2', 'Migration incomplete');
      equal(migration.snapshot.segments.map(s => [s.id, s.uid, s.text]), v1.segments.map(s => [s.id, s.uid, s.text]), 'Segment identity changed');
      const db = await persistence.openDisposableTextLibraryV2Database({ dbName });
      const tx = db.transaction(['contentUnits', 'segments'], 'readonly');
      assert(tx.objectStore('segments').indexNames.contains('byUnitId'), 'Missing byUnitId');
      assert(tx.objectStore('contentUnits').indexNames.contains('byUid'), 'Missing byUid');
      db.close();
      const repeated = await persistence.runDisposableContentUnitMigration({ dbName, now: 400 });
      assert(repeated.changed === false, 'Repeated migration writes again');
      equal(repeated.snapshot, migration.snapshot, 'Repeat migration changed identities or metadata');
    });
    await test('phase-2 abort leaves v1 rows and recovers under physical v2', async () => {
      const name = `${prefix}partial`;
      await seed(name);
      await rejects(() => persistence.runDisposableContentUnitMigration({ dbName: name, onBeforeCommit() { throw new Error('D3D abort'); } }), /D3D abort/);
      const partial = await read(name);
      assert(partial.schemaVersion === 1 && partial.contentUnits.length === 0, 'Backfill partially committed');
      equal(partial.segments, v1.segments, 'Aborted migration changed Segments');
      const resumed = await persistence.runDisposableContentUnitMigration({ dbName: name });
      assert(resumed.statusAfter === 'migrated-v2', 'Partial upgrade did not recover');
    });
    await test('asynchronous request failure rolls back a command', async () => {
      const before = await read(dbName);
      await rejects(() => persistence.executeDisposableTextLibraryV2Command({
        dbName, command: { type: 'contentUnit.create', payload: { blockId: v1.blocks[0].id } },
        onBeforeCommit({ tx, snapshot }) { tx.objectStore('contentUnits').add(snapshot.contentUnits[0]); }
      }));
      equal(await read(dbName), before, 'ConstraintError command partially committed');
    });
    await test('restore replaces arbitrary metadata and abort restores all stores', async () => {
      const backup = await persistence.exportDisposableTextLibraryV2Backup({ dbName });
      backup.metaRecords.push({ key: 'd3dCustomMeta', value: { nested: ['preserved'] }, updatedAt: 123 });
      const before = await read(dbName);
      await rejects(() => persistence.restoreDisposableTextLibraryV2Backup({ dbName, backup, onBeforeCommit() { throw new Error('restore-abort'); } }), /restore-abort/);
      equal(await read(dbName), before, 'Restore abort changed entity stores');
      await persistence.restoreDisposableTextLibraryV2Backup({ dbName, backup });
      const exported = await persistence.exportDisposableTextLibraryV2Backup({ dbName });
      equal(exported.metaRecords.find(r => r.key === 'd3dCustomMeta'), backup.metaRecords.find(r => r.key === 'd3dCustomMeta'), 'Custom metadata changed');
      await persistence.restoreDisposableTextLibraryV2Backup({ dbName, backup: { ...backup, metaRecords: backup.metaRecords.filter(r => r.key !== 'd3dCustomMeta') } });
      const replaced = await persistence.exportDisposableTextLibraryV2Backup({ dbName });
      assert(!replaced.metaRecords.some(r => r.key === 'd3dCustomMeta'), 'Replace restore left stale metadata');
    });
    await test('v1 backup upgrades to v2 without changing Segment identities', async () => {
      const backup = createProLingoTextDatabaseBackup({ stores: v1, metaRecords: [
        { key: 'initialized', value: true }, { key: 'schemaVersion', value: 1 },
        { key: 'activeDocumentId', value: v1.activeDocumentId }, { key: 'idCounters', value: v1.counters }
      ] });
      const restored = await persistence.restoreDisposableTextLibraryV2Backup({ dbName: `${prefix}v1_restore`, backup });
      equal(restored.snapshot.segments.map(s => [s.id, s.uid]), v1.segments.map(s => [s.id, s.uid]), 'v1 restore changed Segment identities');
    });
    await test('corrupted persisted FK fails closed without a repair write', async () => {
      const name = `${prefix}corruption`;
      await seed(name, v2, 2);
      const db = await persistence.openDisposableTextLibraryV2Database({ dbName: name });
      const tx = db.transaction('segments', 'readwrite');
      tx.objectStore('segments').put({ ...v2.segments[0], unitId: 'UNIT_999999' });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
      db.close();
      const corrupt = await read(name);
      await rejects(() => persistence.runDisposableContentUnitMigration({ dbName: name }), /corrupt/i);
      equal(await read(name), corrupt, 'Corruption inspection changed persisted records');
    });
    await test('independent workers serialize read-modify-write through IndexedDB', async () => {
      const workerSource = `import { executeDisposableTextLibraryV2Command } from '${location.origin}/src/services/persistence/textContentUnitPersistenceService.js';
        onmessage = async ({data}) => { try {
          if (!data.dbName.startsWith('${prefix}')) throw new Error('Non-QA worker name');
          const result = await executeDisposableTextLibraryV2Command(data);
          postMessage({ok:true,id:result.result.id});
        } catch(error) { postMessage({ok:false,error:String(error)}); } };`;
      const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      const workers = [new Worker(url, { type: 'module' }), new Worker(url, { type: 'module' })];
      try {
        const before = await read(dbName);
        const outcomes = await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
          worker.onmessage = event => resolve(event.data);
          worker.onerror = reject;
          worker.postMessage({ dbName, command: { type: 'contentUnit.create', payload: { blockId: v1.blocks[0].id } } });
        })));
        assert(outcomes.every(o => o.ok), JSON.stringify(outcomes));
        assert(outcomes[0].id !== outcomes[1].id, 'Workers allocated duplicate Unit IDs');
        const after = await read(dbName);
        assert(after.contentUnits.length === before.contentUnits.length + 2, 'Concurrent worker lost an update');
      } finally { workers.forEach(worker => worker.terminate()); URL.revokeObjectURL(url); }
    });
  } finally {
    for (const name of names) await persistence.deleteDisposableTextLibraryDatabase({ dbName: name });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: nativeFactory });
  }
  return { browser: navigator.userAgent, results, databases: [...names], passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
};
