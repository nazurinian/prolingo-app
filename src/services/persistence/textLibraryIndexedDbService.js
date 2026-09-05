import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES
} from '../../constants/textDatabaseConstants.js';
import {
  createLegacyCompatibilitySyncPlan,
  createLegacyTextMigrationPlan,
  getTextLibraryIdSequence,
  normalizeTextIdCounters,
  normalizeTextLibraryRuntimeSnapshot,
  resolveLegacyTextIdentityProjection
} from '../../domain/text/textLibraryDomain.js';
import { createEmptyTextIdentityState } from '../../domain/text/textIdentityDomain.js';

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

const readMetaValue = async (db, key) => {
  const tx = db.transaction(TEXT_LIBRARY_STORES.META, 'readonly');
  const done = transactionDone(tx);
  const result = await requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).get(key));
  await done;
  return result?.value;
};

const createStores = db => {
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.META)) {
    db.createObjectStore(TEXT_LIBRARY_STORES.META, { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.COLLECTIONS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.COLLECTIONS, { keyPath: 'id' });
    store.createIndex('byOrder', 'order', { unique: false });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.DOCUMENTS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.DOCUMENTS, { keyPath: 'id' });
    store.createIndex('byCollectionId', 'collectionId', { unique: false });
    store.createIndex('byOrder', 'order', { unique: false });
    store.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.BLOCKS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.BLOCKS, { keyPath: 'id' });
    store.createIndex('byDocumentId', 'documentId', { unique: false });
    store.createIndex('byDocumentOrder', ['documentId', 'order'], { unique: false });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.SEGMENTS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.SEGMENTS, { keyPath: 'id' });
    store.createIndex('byDocumentId', 'documentId', { unique: false });
    store.createIndex('byBlockId', 'blockId', { unique: false });
    store.createIndex('byBlockOrder', ['blockId', 'order'], { unique: false });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.AUDIO_VARIANTS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS, { keyPath: 'id' });
    store.createIndex('bySegmentId', 'segmentId', { unique: false });
    store.createIndex('bySegmentChannel', ['segmentId', 'channel'], { unique: false });
  }
};

export const openTextLibraryDatabase = () => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TEXT_LIBRARY_DB_NAME, TEXT_LIBRARY_DB_VERSION);
    request.onupgradeneeded = () => createStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open Text Library IndexedDB'));
    request.onblocked = () => reject(new Error('Text Library IndexedDB upgrade is blocked by another open tab'));
  });
};

const readTextLibrarySnapshotFromDb = async (db) => {
  const storeNames = [
    TEXT_LIBRARY_STORES.META,
    TEXT_LIBRARY_STORES.COLLECTIONS,
    TEXT_LIBRARY_STORES.DOCUMENTS,
    TEXT_LIBRARY_STORES.BLOCKS,
    TEXT_LIBRARY_STORES.SEGMENTS,
    TEXT_LIBRARY_STORES.AUDIO_VARIANTS
  ];
  const tx = db.transaction(storeNames, 'readonly');
  const done = transactionDone(tx);
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
  await done;
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

export const readTextLibrarySnapshot = async () => {
  const db = await openTextLibraryDatabase();
  try {
    return await readTextLibrarySnapshotFromDb(db);
  } finally {
    db.close();
  }
};

export const readTextDocumentSnapshot = async (db, documentId) => {
  const tx = db.transaction([
    TEXT_LIBRARY_STORES.DOCUMENTS,
    TEXT_LIBRARY_STORES.BLOCKS,
    TEXT_LIBRARY_STORES.SEGMENTS,
    TEXT_LIBRARY_STORES.META
  ], 'readonly');
  const done = transactionDone(tx);
  const documentStore = tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS);
  const blockStore = tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS);
  const segmentStore = tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS);
  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  const [document, blocks, segments, countersRecord] = await Promise.all([
    requestToPromise(documentStore.get(documentId)),
    requestToPromise(blockStore.index('byDocumentId').getAll(documentId)),
    requestToPromise(segmentStore.index('byDocumentId').getAll(documentId)),
    requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS))
  ]);
  await done;
  return {
    document: document || null,
    blocks: (blocks || []).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    segments: (segments || []).sort((a, b) => {
      if (a.blockId === b.blockId) return a.order - b.order || a.id.localeCompare(b.id);
      return a.blockId.localeCompare(b.blockId);
    }),
    counters: normalizeTextIdCounters(countersRecord?.value)
  };
};

const writeMigrationPlan = async (db, plan) => {
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
  const now = Date.now();
  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  plan.collections.forEach(record => tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).put(record));
  plan.documents.forEach(record => tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).put(record));
  plan.blocks.forEach(record => tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).put(record));
  plan.segments.forEach(record => tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).put(record));
  plan.audioVariants.forEach(record => tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).put(record));
  putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, TEXT_LIBRARY_SCHEMA_VERSION, now);
  putMeta(metaStore, TEXT_LIBRARY_META_KEYS.INITIALIZED, true, now);
  putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, plan.activeDocumentId, now);
  putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, plan.counters, now);
  putMeta(metaStore, TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION, plan.migration, now);
  await done;
};

export const initializeTextLibraryFromLegacy = async (legacyState) => {
  const db = await openTextLibraryDatabase();
  try {
    const initialized = await readMetaValue(db, TEXT_LIBRARY_META_KEYS.INITIALIZED);
    let activeDocumentId = await readMetaValue(db, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID);
    if (!initialized) {
      const plan = createLegacyTextMigrationPlan(legacyState);
      await writeMigrationPlan(db, plan);
      activeDocumentId = plan.activeDocumentId;
    }
    const librarySnapshot = await readTextLibrarySnapshotFromDb(db);
    if (!activeDocumentId && librarySnapshot.documents.length) {
      activeDocumentId = librarySnapshot.documents[0].id;
      const tx = db.transaction(TEXT_LIBRARY_STORES.META, 'readwrite');
      const done = transactionDone(tx);
      putMeta(tx.objectStore(TEXT_LIBRARY_STORES.META), TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, activeDocumentId);
      await done;
      librarySnapshot.activeDocumentId = activeDocumentId;
    }
    const activeDocument = activeDocumentId
      ? librarySnapshot.documents.find(document => document.id === activeDocumentId) || null
      : null;
    if (activeDocumentId && !activeDocument) throw new Error(`Active Text document ${activeDocumentId} is missing`);
    const projection = activeDocument?.editorModel === TEXT_LEGACY_EDITOR_MODEL
      ? resolveLegacyTextIdentityProjection({
          document: activeDocument,
          blocks: librarySnapshot.blocks.filter(block => block.documentId === activeDocumentId),
          segments: librarySnapshot.segments.filter(segment => segment.documentId === activeDocumentId),
          highWater: librarySnapshot.counters.text
        })
      : createEmptyTextIdentityState();
    return {
      activeDocumentId,
      document: activeDocument,
      textIdentityState: projection,
      counters: librarySnapshot.counters,
      librarySnapshot,
      migrated: !initialized,
      schemaVersion: TEXT_LIBRARY_SCHEMA_VERSION
    };
  } finally {
    db.close();
  }
};

export const syncLegacyTextProjectionToDatabase = async ({ documentId, textIdentityState }) => {
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction([
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS,
      TEXT_LIBRARY_STORES.SEGMENTS
    ], 'readwrite');
    const done = transactionDone(tx);
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    const documentStore = tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS);
    const blockStore = tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS);
    const segmentStore = tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS);

    // Read all blocks so a future multi-document library cannot silently overwrite
    // a global TEXT_ID owned by another document.
    const [document, allBlocks, currentSegments, countersRecord] = await Promise.all([
      requestToPromise(documentStore.get(documentId)),
      requestToPromise(blockStore.getAll()),
      requestToPromise(segmentStore.index('byDocumentId').getAll(documentId)),
      requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS))
    ]);

    const plan = createLegacyCompatibilitySyncPlan({
      document,
      allBlocks,
      currentSegments,
      counters: countersRecord?.value,
      nextTextIdentityState: textIdentityState,
      now: Date.now()
    });

    plan.deleteSegments.forEach(id => segmentStore.delete(id));
    plan.deleteBlocks.forEach(id => blockStore.delete(id));
    plan.upsertBlocks.forEach(record => blockStore.put(record));
    plan.upsertSegments.forEach(record => segmentStore.put(record));
    documentStore.put(plan.document);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, plan.counters, plan.document.updatedAt);
    await done;
    const librarySnapshot = await readTextLibrarySnapshotFromDb(db);
    return { documentId, counters: plan.counters, itemCount: plan.itemCount, librarySnapshot };
  } finally {
    db.close();
  }
};

export const readTextLibraryDiagnostics = async () => {
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction([
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.COLLECTIONS,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ], 'readonly');
    const done = transactionDone(tx);
    const storeNames = Object.values(TEXT_LIBRARY_STORES);
    const countPromises = storeNames.map(storeName => requestToPromise(tx.objectStore(storeName).count()));
    const schemaPromise = requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).get(TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION));
    const activePromise = requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).get(TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID));
    const [countValues, schema, active] = await Promise.all([
      Promise.all(countPromises), schemaPromise, activePromise
    ]);
    await done;
    const counts = Object.fromEntries(storeNames.map((storeName, index) => [storeName, countValues[index]]));
    return {
      dbName: TEXT_LIBRARY_DB_NAME,
      dbVersion: TEXT_LIBRARY_DB_VERSION,
      schemaVersion: schema?.value || null,
      activeDocumentId: active?.value || null,
      counts
    };
  } finally {
    db.close();
  }
};

export const isTextLibraryDocumentId = id => Boolean(getTextLibraryIdSequence('DOCUMENT', id));
