import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES
} from '../../constants/textDatabaseConstants.js';
import { applyTextLibraryCommand } from '../../domain/text/textLibraryCommandDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';
import { openTextLibraryDatabase } from './textLibraryIndexedDbService.js';

const requestToPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});

const putMeta = (store, key, value, now = Date.now()) => store.put({ key, value, updatedAt: now });

const recordChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

const writeRecordDiff = (store, beforeRecords, afterRecords) => {
  const beforeById = new Map(beforeRecords.map(record => [record.id, record]));
  const afterById = new Map(afterRecords.map(record => [record.id, record]));
  beforeById.forEach((_record, id) => {
    if (!afterById.has(id)) store.delete(id);
  });
  afterById.forEach((record, id) => {
    if (!beforeById.has(id) || recordChanged(beforeById.get(id), record)) store.put(record);
  });
};

const readSnapshotInsideTransaction = async tx => {
  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  const [schemaRecord, initializedRecord, activeRecord, countersRecord, collections, documents, blocks, segments, audioVariants] = await Promise.all([
    requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION)),
    requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.INITIALIZED)),
    requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID)),
    requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS)),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).getAll())
  ]);
  return normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: schemaRecord?.value || TEXT_LIBRARY_SCHEMA_VERSION,
    initialized: initializedRecord?.value,
    activeDocumentId: activeRecord?.value || null,
    counters: countersRecord?.value,
    collections,
    documents,
    blocks,
    segments,
    audioVariants
  });
};

export const executeTextLibraryCommand = async command => {
  const db = await openTextLibraryDatabase();
  try {
    const storeNames = [
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.COLLECTIONS,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ];
    const tx = db.transaction(storeNames, 'readwrite');
    const done = transactionDone(tx);
    const before = await readSnapshotInsideTransaction(tx);
    if (!before.initialized) throw new Error('Text Library command refused before IndexedDB initialization');

    // A3 identity guarantee: counters are read and advanced inside the same readwrite
    // transaction as the records they protect. No UI/runtime snapshot allocates IDs.
    const { snapshot: after, result } = applyTextLibraryCommand(before, command, Date.now());

    writeRecordDiff(tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS), before.collections, after.collections);
    writeRecordDiff(tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS), before.documents, after.documents);
    writeRecordDiff(tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS), before.blocks, after.blocks);
    writeRecordDiff(tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS), before.segments, after.segments);
    writeRecordDiff(tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS), before.audioVariants, after.audioVariants);

    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, TEXT_LIBRARY_SCHEMA_VERSION);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, after.activeDocumentId);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, after.counters);
    await done;
    return { ...result, librarySnapshot: after };
  } finally {
    db.close();
  }
};
