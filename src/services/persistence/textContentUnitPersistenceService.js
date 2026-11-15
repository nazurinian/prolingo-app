import {
  TEXT_DISPOSABLE_QA_DB_NAME,
  TEXT_LIBRARY_CONTENT_UNIT_STORE,
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_STORES,
  TEXT_LIBRARY_V2_DB_VERSION,
  TEXT_LIBRARY_V2_META_KEYS,
  TEXT_LIBRARY_V2_STORES
} from '../../constants/textDatabaseConstants.js';
import {
  backfillTextContentUnits,
  inspectTextContentUnitMigrationState,
  TEXT_CONTENT_UNIT_MIGRATION_STATUS
} from '../../domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../../domain/text/textLibraryCommandDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';

const requestToPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const txDonePromise = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
});

export const assertDisposableOrAuthorizedV2DbName = (
  dbName,
  { allowCanonicalDatabase = false } = {}
) => {
  const cleanName = String(dbName ?? '').trim();
  if (!cleanName) {
    throw new Error('Text Content Unit persistence helper requires a non-empty database name.');
  }
  if (cleanName === TEXT_LIBRARY_DB_NAME && !allowCanonicalDatabase) {
    throw new Error(
      'Canonical ProLingo Text database migration is dormant in Gate D3-B; use a disposable QA database name.'
    );
  }
  return cleanName;
};

const createV1BaseStores = db => {
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
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.BLOCKS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.BLOCKS, { keyPath: 'id' });
    store.createIndex('byDocumentId', 'documentId', { unique: false });
    store.createIndex('byOrder', 'order', { unique: false });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.SEGMENTS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.SEGMENTS, { keyPath: 'id' });
    store.createIndex('byDocumentId', 'documentId', { unique: false });
    store.createIndex('byBlockId', 'blockId', { unique: false });
    store.createIndex('byOrder', 'order', { unique: false });
  }
  if (!db.objectStoreNames.contains(TEXT_LIBRARY_STORES.AUDIO_VARIANTS)) {
    const store = db.createObjectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS, { keyPath: 'id' });
    store.createIndex('bySegmentId', 'segmentId', { unique: false });
    store.createIndex('bySegmentChannel', ['segmentId', 'channel'], { unique: false });
  }
};

/**
 * Dormant schema v2 upgrader: ensures v1 stores plus normalized contentUnits store and segments.byUnitId index.
 */
export const createTextLibraryContentUnitStores = (db, transaction = null) => {
  createV1BaseStores(db);

  if (transaction && db.objectStoreNames.contains(TEXT_LIBRARY_STORES.SEGMENTS)) {
    const segmentStore = transaction.objectStore(TEXT_LIBRARY_STORES.SEGMENTS);
    if (!segmentStore.indexNames?.contains?.('byUnitId')) {
      segmentStore.createIndex('byUnitId', 'unitId', { unique: false });
    }
  }

  if (!db.objectStoreNames.contains(TEXT_LIBRARY_CONTENT_UNIT_STORE)) {
    const unitStore = db.createObjectStore(TEXT_LIBRARY_CONTENT_UNIT_STORE, { keyPath: 'id' });
    unitStore.createIndex('byDocumentId', 'documentId', { unique: false });
    unitStore.createIndex('byBlockId', 'blockId', { unique: false });
    unitStore.createIndex('byBlockOrder', ['blockId', 'order'], { unique: false });
    unitStore.createIndex('bySpeakerId', 'speakerId', { unique: false });
    unitStore.createIndex('byKind', 'kind', { unique: false });
    unitStore.createIndex('byUid', 'uid', { unique: false });
  }
};

export const openDisposableTextLibraryV2Database = ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  version = TEXT_LIBRARY_V2_DB_VERSION,
  allowCanonicalDatabase = false
} = {}) => new Promise((resolve, reject) => {
  const safeName = assertDisposableOrAuthorizedV2DbName(dbName, { allowCanonicalDatabase });
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is unavailable in this environment.'));
    return;
  }
  const request = indexedDB.open(safeName, version);
  request.onupgradeneeded = () => {
    if (version >= TEXT_LIBRARY_V2_DB_VERSION) {
      createTextLibraryContentUnitStores(request.result, request.transaction);
    } else {
      createV1BaseStores(request.result);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error(`Failed to open database ${safeName}`));
});

export const readTextLibraryV2SnapshotFromDb = async db => {
  const hasUnitsStore = Boolean(db?.objectStoreNames?.contains?.(TEXT_LIBRARY_CONTENT_UNIT_STORE));
  const storeNames = hasUnitsStore ? Object.values(TEXT_LIBRARY_V2_STORES) : Object.values(TEXT_LIBRARY_STORES);
  const tx = db.transaction(storeNames, 'readonly');

  const [metaEntries, collections, documents, blocks, segments, audioVariants, contentUnits] = await Promise.all([
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).getAll()),
    hasUnitsStore
      ? requestToPromise(tx.objectStore(TEXT_LIBRARY_CONTENT_UNIT_STORE).getAll())
      : Promise.resolve(undefined)
  ]);

  const meta = new Map((metaEntries || []).map(item => [item.key, item.value]));
  return {
    schemaVersion: meta.get(TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION) ?? 1,
    initialized: Boolean(meta.get(TEXT_LIBRARY_META_KEYS.INITIALIZED)),
    activeDocumentId: meta.get(TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID) || null,
    counters: meta.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS) || {},
    collections: collections || [],
    documents: documents || [],
    blocks: blocks || [],
    ...(hasUnitsStore ? { contentUnits: contentUnits || [] } : {}),
    segments: segments || [],
    audioVariants: audioVariants || [],
    ...(meta.has(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION)
      ? { contentUnitMigration: meta.get(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION) }
      : {})
  };
};

export const writeTextLibraryV2SnapshotToDb = async ({ db, snapshot, now = Date.now() }) => {
  const hasUnitsStore = Boolean(db?.objectStoreNames?.contains?.(TEXT_LIBRARY_CONTENT_UNIT_STORE));
  const storeNames = hasUnitsStore ? Object.values(TEXT_LIBRARY_V2_STORES) : Object.values(TEXT_LIBRARY_STORES);
  const tx = db.transaction(storeNames, 'readwrite');
  const completion = txDonePromise(tx);

  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  metaStore.put({ key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: snapshot.schemaVersion, updatedAt: now });
  metaStore.put({ key: TEXT_LIBRARY_META_KEYS.INITIALIZED, value: Boolean(snapshot.initialized), updatedAt: now });
  metaStore.put({ key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: snapshot.activeDocumentId || null, updatedAt: now });
  metaStore.put({ key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: snapshot.counters || {}, updatedAt: now });
  if (snapshot.contentUnitMigration) {
    metaStore.put({
      key: TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION,
      value: snapshot.contentUnitMigration,
      updatedAt: now
    });
  }

  const replaceStore = (storeName, rows) => {
    const store = tx.objectStore(storeName);
    store.clear();
    (rows || []).forEach(row => store.put(row));
  };

  replaceStore(TEXT_LIBRARY_STORES.COLLECTIONS, snapshot.collections);
  replaceStore(TEXT_LIBRARY_STORES.DOCUMENTS, snapshot.documents);
  replaceStore(TEXT_LIBRARY_STORES.BLOCKS, snapshot.blocks);
  replaceStore(TEXT_LIBRARY_STORES.SEGMENTS, snapshot.segments);
  replaceStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS, snapshot.audioVariants);
  if (hasUnitsStore) {
    replaceStore(TEXT_LIBRARY_CONTENT_UNIT_STORE, snapshot.contentUnits || []);
  }

  await completion;
};

export const writeTextLibrarySnapshotToDisposableDb = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  snapshot,
  version = 1,
  now = Date.now(),
  allowCanonicalDatabase = false
} = {}) => {
  const normalized = normalizeTextLibraryRuntimeSnapshot(snapshot);
  const db = await openDisposableTextLibraryV2Database({ dbName, version, allowCanonicalDatabase });
  try {
    await writeTextLibraryV2SnapshotToDb({ db, snapshot: normalized, now });
    return normalized;
  } finally {
    db.close?.();
  }
};

/**
 * Executes dormant two-phase v1 -> v2 upgrade + idempotent backfill against a disposable QA database.
 */
export const runDisposableContentUnitMigration = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  now = Date.now(),
  allowCanonicalDatabase = false
} = {}) => {
  const db = await openDisposableTextLibraryV2Database({
    dbName,
    version: TEXT_LIBRARY_V2_DB_VERSION,
    allowCanonicalDatabase
  });
  try {
    const currentSnapshot = await readTextLibraryV2SnapshotFromDb(db);
    const inspectionBefore = inspectTextContentUnitMigrationState(currentSnapshot, { idbVersion: db.version });
    if (inspectionBefore.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED) {
      throw new Error(`Refusing Content Unit migration on corrupted state: ${inspectionBefore.errors.join('; ')}`);
    }

    const backfill = backfillTextContentUnits(currentSnapshot, { now });
    const normalized = normalizeTextLibraryRuntimeSnapshot(backfill.snapshot);
    if (backfill.changed) {
      await writeTextLibraryV2SnapshotToDb({ db, snapshot: normalized, now });
    }
    const inspectionAfter = inspectTextContentUnitMigrationState(normalized, { idbVersion: db.version });
    return {
      changed: backfill.changed,
      statusBefore: inspectionBefore.status,
      statusAfter: inspectionAfter.status,
      createdUnitCount: backfill.createdUnitCount,
      linkedSegmentCount: backfill.linkedSegmentCount,
      snapshot: normalized
    };
  } finally {
    db.close?.();
  }
};

export const executeDisposableTextLibraryV2Command = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  command,
  now = Date.now(),
  allowCanonicalDatabase = false
} = {}) => {
  const db = await openDisposableTextLibraryV2Database({
    dbName,
    version: TEXT_LIBRARY_V2_DB_VERSION,
    allowCanonicalDatabase
  });
  try {
    const currentSnapshot = await readTextLibraryV2SnapshotFromDb(db);
    const inspection = inspectTextContentUnitMigrationState(currentSnapshot, { idbVersion: db.version });
    if (inspection.status !== TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2) {
      throw new Error(
        `Disposable v2 command refused in state "${inspection.status}": ${inspection.errors.join('; ') || 'run backfill first'}`
      );
    }
    const { snapshot, result } = applyTextLibraryCommand(currentSnapshot, command, now);
    await writeTextLibraryV2SnapshotToDb({ db, snapshot, now });
    return { snapshot, result };
  } finally {
    db.close?.();
  }
};

export const deleteDisposableTextLibraryDatabase = ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  allowCanonicalDatabase = false
} = {}) => new Promise((resolve, reject) => {
  const safeName = assertDisposableOrAuthorizedV2DbName(dbName, { allowCanonicalDatabase });
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is unavailable in this environment.'));
    return;
  }
  const request = indexedDB.deleteDatabase(safeName);
  request.onsuccess = () => resolve(true);
  request.onerror = () => reject(request.error || new Error(`Failed to delete disposable database ${safeName}`));
});
