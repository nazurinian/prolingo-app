import { seedDisposableTextManagementDatabase as seed, readDisposableTextManagementDatabaseState as read } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
import { createP15Fixture } from './fixture.js';
const assert = (ok, message) => { if (!ok) throw Error(message); };
export const seedPeer = options => seed(options);
export async function runP15A2BrowserCases() {
  const snapshot = createP15Fixture().snapshot, names = [], results = [];
  const name = key => { const n = 'prolingo_text_library_d3b_qa_h3_atomic_' + key; names.push(n); return n; };
  const test = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, error: e.message }); } };
  const raw = async (n, version, fill) => new Promise((resolve, reject) => {
    const request = indexedDB.open(n, version);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore('sentinel'); if (fill) store.put('preserve', 'key'); };
    request.onsuccess = () => { const db = request.result; db.close(); resolve(); }; request.onerror = () => reject(request.error);
  });
  const describe = async n => new Promise((resolve, reject) => {
    const request = indexedDB.open(n);
    request.onsuccess = () => { const db = request.result, stores = [...db.objectStoreNames], tx = db.transaction(stores, 'readonly'), rows = {};
      stores.forEach(s => { const r = tx.objectStore(s).getAll(); r.onsuccess = () => { rows[s] = r.result; }; });
      tx.oncomplete = () => { const version = db.version; db.close(); resolve(JSON.stringify({ version, rows })); }; tx.onerror = () => reject(tx.error); };
  });
  try {
    await test('Fresh createOnly initializes once; a second call preserves every record', async () => {
      const n = name('fresh'); await seed({ dbName: n, snapshot, createOnly: true });
      const before = await read({ dbName: n }); let rejected = false;
      try { await seed({ dbName: n, snapshot: { ...snapshot, documents: snapshot.documents.map(d => ({ ...d, title: 'Must not overwrite' })) }, createOnly: true }); } catch (e) { rejected = ['EXISTING_DB_PROTECTED', 'ALREADY_INITIALIZED'].includes(e.code); }
      assert(rejected, 'Existing data overwritten instead of rejected');
      assert((await read({ dbName: n })).snapshotFingerprint === before.snapshotFingerprint, 'Existing data changed');
    });
    await test('Existing empty/invalid/partial/incompatible databases retain schema and sentinel data', async () => {
      for (const [key, version, fill] of [['empty', 2, false], ['partial', 1, true], ['incompatible', 3, true]]) {
        const n = name(key); await raw(n, version, fill); const before = await describe(n);
        let error; try { await seed({ dbName: n, snapshot, createOnly: true }); } catch (e) { error = e; }
        assert(error, 'Existing database accepted: ' + key); assert(await describe(n) === before, 'Schema or content changed: ' + key);
      }
    });
    await test('Two independent realms initialize exactly once and retain the winner', async () => {
      const n = name('race'), iframe = document.createElement('iframe'); iframe.src = '/peer'; document.body.append(iframe);
      await new Promise(r => { iframe.onload = r; });
      try {
        const remote = await iframe.contentWindow.eval("import('/a2-cases.js')");
        const other = { ...snapshot, documents: snapshot.documents.map(d => ({ ...d, title: 'Other realm' })) };
        const responses = await Promise.allSettled([seed({ dbName: n, snapshot, createOnly: true }), remote.seedPeer({ dbName: n, snapshot: other, createOnly: true })]);
        assert(responses.filter(r => r.status === 'fulfilled').length === 1, 'Both initializers succeeded');
        const winner = responses.find(r => r.status === 'fulfilled').value;
        assert((await read({ dbName: n })).snapshotFingerprint === winner.snapshotFingerprint, 'Winner overwritten');
      } finally { iframe.remove(); }
    });
    await test('A racing writer between schema creation and initialization cannot be cleared', async () => {
      const n = name('writer'), original = indexedDB.open.bind(indexedDB);
      let intercepted = false;
      indexedDB.open = (...args) => {
        const req = original(...args);
        if (args[0] === n) req.addEventListener('success', () => {
          if (intercepted || !req.result.objectStoreNames.contains('meta')) return; intercepted = true;
          req.result.transaction('meta', 'readwrite').objectStore('meta').put({ key: 'external-writer', value: 'keep' });
        });
        return req;
      };
      let error;
      try { await seed({ dbName: n, snapshot, createOnly: true }); } catch (e) { error = e; } finally { indexedDB.open = original; }
      assert(intercepted && error?.code === 'EXISTING_DB_PROTECTED', 'Racing rows were cleared');
      assert((await describe(n)).includes('external-writer'), 'Lost racing writer');
    });
    await test('Missing read aborts creation; explicit destructive reseed remains available', async () => {
      const n = name('probe'); let error;
      try { await read({ dbName: n }); } catch (e) { error = e; }
      assert(error?.databaseMissing === true, 'Missing state not reported');
      assert(!(await indexedDB.databases()).some(d => d.name === n), 'Probe left a database');
      await seed({ dbName: n, snapshot, createOnly: true }); await seed({ dbName: n, snapshot });
      assert((await read({ dbName: n })).snapshot.documents.length === snapshot.documents.length, 'Explicit reseed failed');
    });
  } finally { for (const n of names) await deleteDisposableTextLibraryDatabase({ dbName: n }); }
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, canonicalDbTouches: window.__p15A2CanonicalDbTouches, hasCanonicalDb: false,
    remainingDisposableDbs: (await indexedDB.databases()).filter(d => names.includes(d.name)).length };
}
