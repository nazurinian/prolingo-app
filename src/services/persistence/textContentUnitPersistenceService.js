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
  isContentUnitSnapshot,
  TEXT_CONTENT_UNIT_MIGRATION_STATUS
} from '../../domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../../domain/text/textLibraryCommandDomain.js';
import {
  createProLingoTextDatabaseBackup,
  validateProLingoTextDatabaseBackup
} from '../../domain/text/textDatabaseBackupDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';

export const TEXT_DISPOSABLE_QA_DB_PREFIX = 'prolingo_text_library_d3b_qa_';
const VALID_QA_DB_NAME_PATTERN = /^prolingo_text_library_d3b_qa_[a-z0-9_-]+$/i;
const activeQaWriteDbNames = new Set();

const requestToPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const txDonePromise = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
});

// ===========================================================================
// SECTION 1 — Gate D3-B Disposable QA Isolation Guards
// ===========================================================================

/**
 * Non-bypassable Gate D3-B guard restricting QA IndexedDB helpers strictly to
 * designated disposable QA databases and hard-blocking the canonical ProLingo database.
 */
export const assertDisposableQaDatabaseName = (dbName, options = {}) => {
  if (options && typeof options === 'object' && options.allowCanonicalDatabase) {
    throw new Error(
      'Canonical database bypass (allowCanonicalDatabase) is hard-blocked in Gate D3-B.'
    );
  }
  const cleanName = String(dbName ?? '').trim();
  if (!cleanName) {
    throw new Error('Disposable QA persistence helper requires a non-empty scoped QA database name.');
  }
  if (cleanName === TEXT_LIBRARY_DB_NAME) {
    throw new Error(
      'Canonical ProLingo Text database is hard-blocked in Gate D3-B; use a scoped disposable QA database.'
    );
  }
  if (cleanName !== TEXT_DISPOSABLE_QA_DB_NAME && !VALID_QA_DB_NAME_PATTERN.test(cleanName)) {
    throw new Error(
      `Database "${cleanName}" is outside the Gate D3-B disposable QA scope (${TEXT_DISPOSABLE_QA_DB_PREFIX}*).`
    );
  }
  return cleanName;
};

/**
 * Validates that an IDBDatabase handle belongs strictly to an allowed disposable QA database.
 */
export const assertDisposableQaDatabaseHandle = (db, options = {}) => {
  if (!db || typeof db !== 'object') {
    throw new Error('Disposable QA database operation requires a valid IDBDatabase handle.');
  }
  assertDisposableQaDatabaseName(db.name, options);
  return db;
};

const resolveQaEntrypointDbName = (dbName, restOptions = {}) => {
  if (restOptions && typeof restOptions === 'object' && restOptions.db !== undefined) {
    assertDisposableQaDatabaseHandle(restOptions.db, restOptions);
    throw new Error('Disposable QA persistence APIs do not accept direct external db handles.');
  }
  return assertDisposableQaDatabaseName(dbName, restOptions);
};

const acquireQaWriteLock = safeDbName => {
  if (activeQaWriteDbNames.has(safeDbName)) {
    throw new Error(
      `Concurrent write rejected on disposable QA database "${safeDbName}": another transaction is in flight.`
    );
  }
  activeQaWriteDbNames.add(safeDbName);
};

/**
 * H1-03: Mirrors canonical src/services/persistence/textLibraryIndexedDbService.js createStores
 * verbatim for v1 stores and indexes before applying dormant v2 additions.
 */
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

// ===========================================================================
// SECTION 2 — Dormant Production Migration & Read Primitives (Unactivated in D3-B)
// Reserved for future D3-C / D3-D activation; read-only or versionchange-only.
// ===========================================================================

/**
 * Dormant production schema v2 upgrader primitive (D3-C/D3-D) & QA schema builder:
 * ensures canonical v1 stores/indexes plus normalized contentUnits store and segments.byUnitId.
 * Must only execute inside an authorized onupgradeneeded versionchange transaction.
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

// ===========================================================================
// SECTION 3 — Disposable QA Persistence APIs (Scoped to prolingo_text_library_d3b_qa_*)
// Canonical ProLingo DB handles/names and arbitrary direct db arguments are rejected.
// ===========================================================================

export const openDisposableTextLibraryV2Database = ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  version = TEXT_LIBRARY_V2_DB_VERSION,
  ...restOptions
} = {}) => new Promise((resolve, reject) => {
  let safeName;
  try {
    safeName = resolveQaEntrypointDbName(dbName, restOptions);
  } catch (error) {
    reject(error);
    return;
  }
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
  request.onsuccess = () => {
    try {
      resolve(assertDisposableQaDatabaseHandle(request.result));
    } catch (error) {
      request.result?.close?.();
      reject(error);
    }
  };
  request.onerror = () => reject(request.error || new Error(`Failed to open database ${safeName}`));
});

const buildSnapshotFromStoreRows = ({
  metaEntries,
  collections,
  documents,
  blocks,
  segments,
  audioVariants,
  contentUnits,
  hasUnitsStore
}) => {
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

const cloneMetaValue = value => (value === undefined ? undefined : structuredClone(value));

const stageSnapshotWritesOnTx = ({
  tx,
  hasUnitsStore,
  snapshot,
  metaRecords = null,
  replaceMetaStore = false,
  now
}) => {
  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  if (replaceMetaStore) {
    if (!Array.isArray(metaRecords)) {
      throw new Error('Replace-policy metadata restoration requires a validated metaRecords array.');
    }
    metaStore.clear();
    metaRecords.forEach(record => {
      const key = String(record?.key || '').trim();
      if (!key) {
        throw new Error('Cannot restore metadata record without a valid key.');
      }
      metaStore.put({
        key,
        value: cloneMetaValue(record.value),
        updatedAt: record.updatedAt ?? now
      });
    });
  } else {
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
};

/**
 * Dormant read-only migration & QA snapshot inspector primitive.
 * Opens a strictly 'readonly' transaction across v1 or v2 object stores and never mutates DB state.
 */
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

  return buildSnapshotFromStoreRows({
    metaEntries,
    collections,
    documents,
    blocks,
    segments,
    audioVariants,
    contentUnits,
    hasUnitsStore
  });
};

// Private QA-guarded low-level writer; never exported directly to prevent raw handle bypasses.
const writeTextLibraryV2SnapshotToDb = async ({ db, snapshot, now = Date.now() }) => {
  assertDisposableQaDatabaseHandle(db);
  const hasUnitsStore = Boolean(db?.objectStoreNames?.contains?.(TEXT_LIBRARY_CONTENT_UNIT_STORE));
  const storeNames = hasUnitsStore ? Object.values(TEXT_LIBRARY_V2_STORES) : Object.values(TEXT_LIBRARY_STORES);
  const tx = db.transaction(storeNames, 'readwrite');
  const completion = txDonePromise(tx);
  try {
    if (isContentUnitSnapshot(snapshot) && !hasUnitsStore) {
      throw new Error('Cannot write a v2 Content Unit snapshot to a v1 database');
    }
    stageSnapshotWritesOnTx({ tx, hasUnitsStore, snapshot, now });
  } catch (error) {
    tx.abort();
    await completion.catch(() => {});
    throw error;
  }
  await completion;
};

/**
 * H1-01: Executes read, domain computation, validation, and store writes inside ONE single
 * readwrite IndexedDB transaction without releasing control back to the event loop between read & write.
 */
const runSingleReadWriteSnapshotTransaction = ({
  db,
  now = Date.now(),
  onBeforeCommit = null,
  transform
}) => new Promise((resolve, reject) => {
  assertDisposableQaDatabaseHandle(db);
  const hasUnitsStore = Boolean(db?.objectStoreNames?.contains?.(TEXT_LIBRARY_CONTENT_UNIT_STORE));
  const storeNames = hasUnitsStore ? Object.values(TEXT_LIBRARY_V2_STORES) : Object.values(TEXT_LIBRARY_STORES);
  const tx = db.transaction(storeNames, 'readwrite');

  const rows = {
    metaEntries: undefined,
    collections: undefined,
    documents: undefined,
    blocks: undefined,
    segments: undefined,
    audioVariants: undefined,
    contentUnits: undefined
  };

  let transformError = null;
  let outcome;
  let finalized = false;

  const failTx = error => {
    if (finalized) return;
    finalized = true;
    reject(error);
  };

  tx.oncomplete = () => {
    if (transformError) {
      failTx(transformError);
      return;
    }
    if (!finalized) {
      finalized = true;
      resolve(outcome);
    }
  };
  tx.onabort = () => failTx(transformError || tx.error || new Error('IndexedDB readwrite transaction aborted'));
  tx.onerror = () => failTx(transformError || tx.error || new Error('IndexedDB readwrite transaction failed'));

  const readSpecs = [
    ['metaEntries', tx.objectStore(TEXT_LIBRARY_STORES.META).getAll()],
    ['collections', tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).getAll()],
    ['documents', tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).getAll()],
    ['blocks', tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).getAll()],
    ['segments', tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).getAll()],
    ['audioVariants', tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).getAll()]
  ];
  if (hasUnitsStore) {
    readSpecs.push(['contentUnits', tx.objectStore(TEXT_LIBRARY_CONTENT_UNIT_STORE).getAll()]);
  }

  let pendingReads = readSpecs.length;
  for (const [key, req] of readSpecs) {
    req.onerror = () => {
      transformError = transformError || req.error || new Error(`Failed reading store ${key}`);
      try { tx.abort?.(); } catch { /* ignore abort errors */ }
    };
    req.onsuccess = () => {
      rows[key] = req.result;
      pendingReads -= 1;
      if (pendingReads !== 0) return;

      // Still inside final read request's synchronous callback so tx stays open through writes.
      try {
        const currentSnapshot = buildSnapshotFromStoreRows({ ...rows, hasUnitsStore });
        const step = transform(currentSnapshot);
        outcome = step.output;
        if (step.shouldWrite) {
          stageSnapshotWritesOnTx({
            tx,
            hasUnitsStore,
            snapshot: step.nextSnapshot,
            metaRecords: step.metaRecords ?? null,
            replaceMetaStore: Boolean(step.replaceMetaStore),
            now
          });
          onBeforeCommit?.({
            tx,
            snapshot: step.nextSnapshot,
            metaRecords: step.metaRecords ?? null,
            output: step.output
          });
        }
      } catch (error) {
        transformError = error;
        try { tx.abort?.(); } catch { /* ignore abort errors */ }
      }
    };
  }
});

export const writeTextLibrarySnapshotToDisposableDb = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  snapshot,
  version = 1,
  now = Date.now(),
  ...restOptions
} = {}) => {
  const safeName = resolveQaEntrypointDbName(dbName, restOptions);
  acquireQaWriteLock(safeName);
  try {
    const normalized = normalizeTextLibraryRuntimeSnapshot(snapshot);
    if (isContentUnitSnapshot(normalized) && Number(version) < TEXT_LIBRARY_V2_DB_VERSION) {
      throw new Error('Cannot write a v2 Content Unit snapshot to a v1 database');
    }
    const db = await openDisposableTextLibraryV2Database({ dbName: safeName, version });
    try {
      await writeTextLibraryV2SnapshotToDb({ db, snapshot: normalized, now });
      return normalized;
    } finally {
      db.close?.();
    }
  } finally {
    activeQaWriteDbNames.delete(safeName);
  }
};

/**
 * Isolated QA two-phase migration helper: opens schema v2 (Phase 1) then executes read,
 * backfill, validation, and commit within a single readwrite IDB transaction (Phase 2).
 */
export const runDisposableContentUnitMigration = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  now = Date.now(),
  onBeforeCommit = null,
  ...restOptions
} = {}) => {
  const safeName = resolveQaEntrypointDbName(dbName, restOptions);
  acquireQaWriteLock(safeName);
  try {
    const db = await openDisposableTextLibraryV2Database({
      dbName: safeName,
      version: TEXT_LIBRARY_V2_DB_VERSION
    });
    try {
      return await runSingleReadWriteSnapshotTransaction({
        db,
        now,
        onBeforeCommit,
        transform: currentSnapshot => {
          const inspectionBefore = inspectTextContentUnitMigrationState(currentSnapshot, { idbVersion: db.version });
          if (inspectionBefore.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED) {
            throw new Error(`Refusing Content Unit migration on corrupted state: ${inspectionBefore.errors.join('; ')}`);
          }
          const backfill = backfillTextContentUnits(currentSnapshot, { now });
          const normalized = normalizeTextLibraryRuntimeSnapshot(backfill.snapshot);
          const inspectionAfter = inspectTextContentUnitMigrationState(normalized, { idbVersion: db.version });
          return {
            shouldWrite: backfill.changed,
            nextSnapshot: normalized,
            output: {
              changed: backfill.changed,
              statusBefore: inspectionBefore.status,
              statusAfter: inspectionAfter.status,
              createdUnitCount: backfill.createdUnitCount,
              linkedSegmentCount: backfill.linkedSegmentCount,
              snapshot: normalized
            }
          };
        }
      });
    } finally {
      db.close?.();
    }
  } finally {
    activeQaWriteDbNames.delete(safeName);
  }
};

/**
 * Isolated single-transaction read-modify-write command runner for disposable QA databases.
 * Fails closed on overlapping in-process concurrent writes; canonical DB remains hard-blocked.
 */
export const executeDisposableTextLibraryV2Command = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  command,
  now = Date.now(),
  onBeforeCommit = null,
  ...restOptions
} = {}) => {
  const safeName = resolveQaEntrypointDbName(dbName, restOptions);
  acquireQaWriteLock(safeName);
  try {
    const db = await openDisposableTextLibraryV2Database({
      dbName: safeName,
      version: TEXT_LIBRARY_V2_DB_VERSION
    });
    try {
      return await runSingleReadWriteSnapshotTransaction({
        db,
        now,
        onBeforeCommit,
        transform: currentSnapshot => {
          const inspection = inspectTextContentUnitMigrationState(currentSnapshot, { idbVersion: db.version });
          if (inspection.status !== TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2) {
            throw new Error(
              `Disposable v2 command refused in state "${inspection.status}": ${inspection.errors.join('; ') || 'run backfill first'}`
            );
          }
          const { snapshot, result } = applyTextLibraryCommand(currentSnapshot, command, now);
          return {
            shouldWrite: true,
            nextSnapshot: snapshot,
            output: { snapshot, result }
          };
        }
      });
    } finally {
      db.close?.();
    }
  } finally {
    activeQaWriteDbNames.delete(safeName);
  }
};

export const exportDisposableTextLibraryV2Backup = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  source = {},
  now = Date.now(),
  ...restOptions
} = {}) => {
  const safeName = resolveQaEntrypointDbName(dbName, restOptions);
  const db = await openDisposableTextLibraryV2Database({
    dbName: safeName,
    version: TEXT_LIBRARY_V2_DB_VERSION
  });
  try {
    assertDisposableQaDatabaseHandle(db);
    const hasUnitsStore = Boolean(db?.objectStoreNames?.contains?.(TEXT_LIBRARY_CONTENT_UNIT_STORE));
    const storeNames = hasUnitsStore ? Object.values(TEXT_LIBRARY_V2_STORES) : Object.values(TEXT_LIBRARY_STORES);
    const tx = db.transaction(storeNames, 'readonly');
    const done = txDonePromise(tx);
    const [
      metaRecords,
      collections,
      documents,
      blocks,
      contentUnits,
      segments,
      audioVariants
    ] = await Promise.all([
      requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).getAll()),
      requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).getAll()),
      requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).getAll()),
      requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).getAll()),
      hasUnitsStore
        ? requestToPromise(tx.objectStore(TEXT_LIBRARY_CONTENT_UNIT_STORE).getAll())
        : Promise.resolve([]),
      requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).getAll()),
      requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).getAll())
    ]);
    await done;
    return createProLingoTextDatabaseBackup({
      metaRecords,
      stores: {
        collections,
        documents,
        blocks,
        contentUnits,
        segments,
        audioVariants
      },
      source,
      now
    });
  } finally {
    db.close?.();
  }
};

export const restoreDisposableTextLibraryV2Backup = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  backup,
  now = Date.now(),
  upgradeV1Backup = true,
  onBeforeCommit = null,
  ...restOptions
} = {}) => {
  const safeName = resolveQaEntrypointDbName(dbName, restOptions);
  const validated = validateProLingoTextDatabaseBackup(backup, {
    upgradeToV2: upgradeV1Backup,
    now
  });
  if (validated.backup.database.dbVersion !== TEXT_LIBRARY_V2_DB_VERSION) {
    throw new Error('Disposable v2 database restore requires a v2 backup or upgradeV1Backup=true');
  }
  acquireQaWriteLock(safeName);
  try {
    const db = await openDisposableTextLibraryV2Database({
      dbName: safeName,
      version: TEXT_LIBRARY_V2_DB_VERSION
    });
    try {
      return await runSingleReadWriteSnapshotTransaction({
        db,
        now,
        onBeforeCommit,
        transform: () => ({
          shouldWrite: true,
          replaceMetaStore: true,
          metaRecords: validated.backup.metaRecords,
          nextSnapshot: validated.snapshot,
          output: {
            backup: validated.backup,
            snapshot: validated.snapshot,
            migration: validated.migration
          }
        })
      });
    } finally {
      db.close?.();
    }
  } finally {
    activeQaWriteDbNames.delete(safeName);
  }
};

export const deleteDisposableTextLibraryDatabase = ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  ...restOptions
} = {}) => new Promise((resolve, reject) => {
  let safeName;
  try {
    safeName = resolveQaEntrypointDbName(dbName, restOptions);
  } catch (error) {
    reject(error);
    return;
  }
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is unavailable in this environment.'));
    return;
  }
  const request = indexedDB.deleteDatabase(safeName);
  request.onsuccess = () => resolve(true);
  request.onerror = () => reject(request.error || new Error(`Failed to delete disposable database ${safeName}`));
});
