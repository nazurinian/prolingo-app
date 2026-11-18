import {
  TEXT_DISPOSABLE_QA_DB_NAME,
  TEXT_LIBRARY_CONTENT_UNIT_STORE,
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES,
  TEXT_LIBRARY_V2_DB_VERSION,
  TEXT_LIBRARY_V2_META_KEYS,
  TEXT_LIBRARY_V2_SCHEMA_VERSION,
  TEXT_LIBRARY_V2_STORES
} from '../../constants/textDatabaseConstants.js';
import {
  applyTextDataManagementCommand,
  freezeTextManagementView,
  resolveTextManagementSelection,
  TextDataManagementError,
  validateTextManagementSnapshot
} from '../../domain/text/textDataManagementDomain.js';
import {
  inspectTextContentUnitMigrationState,
  TEXT_CONTENT_UNIT_MIGRATION_STATUS
} from '../../domain/text/textContentUnitDomain.js';
import {
  exportTextManagementData,
  inspectTextManagementTransfer
} from '../../domain/text/textDataManagementTransferDomain.js';
import { validateProLingoTextDatabaseBackup } from '../../domain/text/textDatabaseBackupDomain.js';
import { canonicalJsonStringify } from '../../domain/text/textCanonicalFingerprintDomain.js';
import { normalizeTextSourceAttachments } from '../../domain/text/textSourceAttachmentDomain.js';
import { normalizeTextExternalImportRegistry } from '../../domain/text/textExternalJsonDomain.js';
import { getTextLibraryIdSequence } from '../../domain/text/textLibraryDomain.js';
import {
  assertDisposableQaDatabaseHandle,
  assertDisposableQaDatabaseName,
  openDisposableTextLibraryV2Database,
  TEXT_DISPOSABLE_QA_DB_PREFIX
} from './textContentUnitPersistenceService.js';

export { TEXT_DISPOSABLE_QA_DB_PREFIX, assertDisposableQaDatabaseName, assertDisposableQaDatabaseHandle };

const CORE_META_KEYS = new Set([
  TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION,
  TEXT_LIBRARY_META_KEYS.INITIALIZED,
  TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID,
  TEXT_LIBRARY_META_KEYS.ID_COUNTERS,
  TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION
]);

const KNOWN_SIDECAR_META_KEYS = new Set([
  TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS,
  TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS
]);

const activeWriteLocks = new Set();

const typedFail = (code, message) => {
  throw new TextDataManagementError(code, message);
};

const requestToPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const txDonePromise = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
});

const clonePlain = value => (value === undefined ? undefined : structuredClone(value));

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertDisposablePersistenceOptions = (options = {}) => {
  if (!isPlainObject(options)) {
    typedFail('INVALID_OPTIONS', 'Persistence options must be a plain object');
  }
  if (options.allowCanonicalWrites || options.allowCanonicalDatabase || options.canonical || options.liveCanonical) {
    typedFail('CANONICAL_WRITES_DISABLED', 'Canonical ProLingo database writes remain disabled in P15-A2');
  }
  if (options.db !== undefined) {
    typedFail('INVALID_OPTIONS', 'External database handles are not accepted; pass a disposable QA dbName');
  }
  const rawName = String(options.dbName ?? '').trim();
  if (!rawName) {
    typedFail('INVALID_DATABASE_NAME', 'A scoped disposable QA database name is required');
  }
  if (rawName === TEXT_LIBRARY_DB_NAME) {
    typedFail('CANONICAL_DB_PROTECTED', 'Canonical ProLingo database access is blocked; use a disposable QA database');
  }
  try {
    return assertDisposableQaDatabaseName(rawName);
  } catch (error) {
    typedFail('INVALID_DATABASE_NAME', error.message);
  }
};

const acquireWriteLock = safeName => {
  if (activeWriteLocks.has(safeName)) {
    typedFail('BUSY', `Another transactional write is already in flight on ${safeName}`);
  }
  activeWriteLocks.add(safeName);
  return () => activeWriteLocks.delete(safeName);
};

const openExistingDisposableDb = async (safeName, version = null) => {
  if (typeof indexedDB === 'undefined') {
    typedFail('INVALID_OPERATION', 'IndexedDB is unavailable in this environment');
  }
  if (version != null) {
    return openDisposableTextLibraryV2Database({ dbName: safeName, version });
  }
  return new Promise((resolve, reject) => {
    let createdBlank = false;
    const request = indexedDB.open(safeName);
    request.onupgradeneeded = () => {
      createdBlank = true;
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        assertDisposableQaDatabaseHandle(db);
        if (createdBlank || !db.objectStoreNames?.contains?.(TEXT_LIBRARY_STORES.META)) {
          db.close?.();
          if (createdBlank) {
            try { indexedDB.deleteDatabase(safeName); } catch { /* ignore cleanup error */ }
          }
          reject(new TextDataManagementError('UNINITIALIZED', `Disposable QA database "${safeName}" has not been initialized`));
          return;
        }
        resolve(db);
      } catch (error) {
        db?.close?.();
        reject(error);
      }
    };
    request.onerror = () => reject(request.error || new Error(`Failed to open database ${safeName}`));
  });
};

const resolveStoreNames = db => {
  const hasUnitsStore = Boolean(db?.objectStoreNames?.contains?.(TEXT_LIBRARY_CONTENT_UNIT_STORE));
  const storeNames = hasUnitsStore ? Object.values(TEXT_LIBRARY_V2_STORES) : Object.values(TEXT_LIBRARY_STORES);
  const missingStore = storeNames.find(name => !db?.objectStoreNames?.contains?.(name));
  if (missingStore) {
    typedFail('INVALID_SNAPSHOT', `Database is missing required object store: ${missingStore}`);
  }
  return { hasUnitsStore, storeNames };
};

const reconstructValidatedStateFromRows = ({
  metaRecords,
  collections,
  documents,
  blocks,
  segments,
  audioVariants,
  contentUnits,
  hasUnitsStore,
  dbVersion,
  requireCompleteMetadata = true
}) => {
  if (!Array.isArray(metaRecords)) {
    typedFail('METADATA_REQUIRED', 'Authoritative metaRecords array is required');
  }
  const metaMap = new Map();
  for (const record of metaRecords) {
    const key = String(record?.key ?? '').trim();
    if (!key) {
      typedFail('METADATA_MISMATCH', 'Database meta store contains an unnamed metadata record');
    }
    metaMap.set(key, clonePlain(record.value));
  }

  if (requireCompleteMetadata) {
    const missingKeys = [
      TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION,
      TEXT_LIBRARY_META_KEYS.INITIALIZED,
      TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID,
      TEXT_LIBRARY_META_KEYS.ID_COUNTERS
    ].filter(key => !metaMap.has(key));
    if (missingKeys.length > 0) {
      typedFail('METADATA_REQUIRED', `Database metadata is incomplete; missing: ${missingKeys.join(', ')}`);
    }
  }

  const initialized = metaMap.get(TEXT_LIBRARY_META_KEYS.INITIALIZED);
  if (initialized !== true) {
    typedFail('UNINITIALIZED', 'Disposable QA database is not initialized');
  }

  const schemaVersion = metaMap.get(TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION);
  if (![TEXT_LIBRARY_SCHEMA_VERSION, TEXT_LIBRARY_V2_SCHEMA_VERSION].includes(schemaVersion)) {
    typedFail('UNSUPPORTED_SCHEMA', `Unsupported database schemaVersion: ${String(schemaVersion)}`);
  }

  if (schemaVersion === TEXT_LIBRARY_V2_SCHEMA_VERSION && !hasUnitsStore) {
    typedFail('INVALID_SNAPSHOT', 'Schema 2 database requires contentUnits object store');
  }
  if (schemaVersion === TEXT_LIBRARY_V2_SCHEMA_VERSION && requireCompleteMetadata && !metaMap.has(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION)) {
    typedFail('MIGRATION_REQUIRED', 'Incomplete Content Unit upgrade: missing contentUnitMigration metadata');
  }

  const rawCounters = metaMap.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS);
  if (requireCompleteMetadata && !isPlainObject(rawCounters)) {
    typedFail('METADATA_MISMATCH', 'Database meta idCounters must be a plain object');
  }

  const rawCandidate = {
    schemaVersion,
    initialized: true,
    activeDocumentId: metaMap.get(TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID) ?? null,
    counters: clonePlain(rawCounters || {}),
    collections: clonePlain(collections || []),
    documents: clonePlain(documents || []),
    blocks: clonePlain(blocks || []),
    ...(hasUnitsStore ? { contentUnits: clonePlain(contentUnits || []) } : {}),
    segments: clonePlain(segments || []),
    audioVariants: clonePlain(audioVariants || []),
    ...(metaMap.has(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION)
      ? { contentUnitMigration: clonePlain(metaMap.get(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION)) }
      : {})
  };

  const inspection = inspectTextContentUnitMigrationState(rawCandidate, { idbVersion: dbVersion });
  if (inspection.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.PARTIAL_UPGRADE) {
    typedFail('MIGRATION_REQUIRED', 'Incomplete Content Unit upgrade; automatic repair is forbidden');
  }
  if (inspection.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED) {
    typedFail('INVALID_SNAPSHOT', inspection.errors.join('; ') || 'Corrupted Content Unit state');
  }

  const snapshot = validateTextManagementSnapshot(rawCandidate);

  if (requireCompleteMetadata) {
    const coreChecks = {
      [TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION]: snapshot.schemaVersion,
      [TEXT_LIBRARY_META_KEYS.INITIALIZED]: snapshot.initialized,
      [TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID]: snapshot.activeDocumentId,
      [TEXT_LIBRARY_META_KEYS.ID_COUNTERS]: snapshot.counters,
      ...(snapshot.contentUnitMigration
        ? { [TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION]: snapshot.contentUnitMigration }
        : {})
    };
    for (const [key, expectedValue] of Object.entries(coreChecks)) {
      if (canonicalJsonStringify(metaMap.get(key)) !== canonicalJsonStringify(expectedValue)) {
        typedFail('METADATA_MISMATCH', `Database meta record "${key}" disagrees with snapshot state`);
      }
    }
    const maxSeq = (kind, rows) => (rows || []).reduce((max, row) => Math.max(max, getTextLibraryIdSequence(kind, row?.id)), 0);
    const counterFloors = [
      ['collection', maxSeq('COLLECTION', snapshot.collections)],
      ['document', maxSeq('DOCUMENT', snapshot.documents)],
      ['text', maxSeq('BLOCK', snapshot.blocks)],
      ['segment', maxSeq('SEGMENT', snapshot.segments)],
      ['audioVariant', maxSeq('AUDIO_VARIANT', snapshot.audioVariants)]
    ];
    for (const [counterKey, minRequired] of counterFloors) {
      if (Number(snapshot.counters?.[counterKey] || 0) < minRequired) {
        typedFail('METADATA_MISMATCH', `Database idCounters.${counterKey} (${snapshot.counters?.[counterKey] ?? 0}) fell behind high-water ID ${minRequired}`);
      }
    }
  }

  const rawAttachments = metaMap.get(TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS);
  if (rawAttachments !== undefined && !Array.isArray(rawAttachments)) {
    typedFail('METADATA_MISMATCH', 'Database meta sourceAttachments must be an array');
  }
  const rawExternalImports = metaMap.get(TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS);
  if (rawExternalImports !== undefined && !Array.isArray(rawExternalImports)) {
    typedFail('METADATA_MISMATCH', 'Database meta externalSourceImports must be an array');
  }

  const sourceAttachments = normalizeTextSourceAttachments(rawAttachments || []);
  const externalImports = normalizeTextExternalImportRegistry(rawExternalImports || []);
  const cleanMetaRecords = metaRecords.map(record => ({
    key: String(record.key),
    value: clonePlain(record.value),
    updatedAt: record.updatedAt ?? null
  }));
  const extraMetaRecords = cleanMetaRecords.filter(
    record => !CORE_META_KEYS.has(record.key) && !KNOWN_SIDECAR_META_KEYS.has(record.key)
  );

  return freezeTextManagementView({
    dbVersion,
    schemaVersion: snapshot.schemaVersion,
    hasUnitsStore,
    snapshot,
    snapshotFingerprint: canonicalJsonStringify(snapshot),
    metaRecords: cleanMetaRecords,
    sourceAttachments,
    externalImports,
    extraMetaRecords
  });
};

const writeRecordDiff = (store, beforeRecords, afterRecords) => {
  const beforeById = new Map((beforeRecords || []).map(record => [record.id, record]));
  const afterById = new Map((afterRecords || []).map(record => [record.id, record]));
  beforeById.forEach((_record, id) => {
    if (!afterById.has(id)) {
      store.delete(id);
    }
  });
  afterById.forEach((record, id) => {
    const previous = beforeById.get(id);
    if (!previous || canonicalJsonStringify(previous) !== canonicalJsonStringify(record)) {
      store.put(clonePlain(record));
    }
  });
};

const stageCoreMetaUpdatesAndBuildList = ({
  tx,
  beforeMetaRecords,
  beforeSnapshot,
  afterSnapshot,
  now
}) => {
  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  const nextCoreEntries = {
    [TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION]: afterSnapshot.schemaVersion,
    [TEXT_LIBRARY_META_KEYS.INITIALIZED]: Boolean(afterSnapshot.initialized),
    [TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID]: afterSnapshot.activeDocumentId || null,
    [TEXT_LIBRARY_META_KEYS.ID_COUNTERS]: afterSnapshot.counters,
    ...(afterSnapshot.contentUnitMigration
      ? { [TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION]: afterSnapshot.contentUnitMigration }
      : {})
  };
  const beforeMap = new Map(beforeMetaRecords.map(record => [record.key, clonePlain(record)]));

  Object.entries(nextCoreEntries).forEach(([key, nextValue]) => {
    const prevRecord = beforeMap.get(key);
    const prevValue = prevRecord ? prevRecord.value : undefined;
    if (!prevRecord || canonicalJsonStringify(prevValue) !== canonicalJsonStringify(nextValue)) {
      const updatedRecord = { key, value: clonePlain(nextValue), updatedAt: now };
      metaStore.put(updatedRecord);
      beforeMap.set(key, updatedRecord);
    }
  });

  if (beforeSnapshot.contentUnitMigration && !afterSnapshot.contentUnitMigration) {
    metaStore.delete(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION);
    beforeMap.delete(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION);
  }

  return [...beforeMap.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const stageFullReplaceOnTx = ({
  tx,
  hasUnitsStore,
  snapshot,
  metaRecords,
  now
}) => {
  const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
  metaStore.clear();
  metaRecords.forEach(record => {
    const key = String(record?.key || '').trim();
    if (!key) {
      typedFail('METADATA_MISMATCH', 'Cannot write metadata record without a valid key');
    }
    metaStore.put({
      key,
      value: clonePlain(record.value),
      updatedAt: record.updatedAt ?? now
    });
  });

  const replaceStore = (storeName, rows) => {
    const store = tx.objectStore(storeName);
    store.clear();
    (rows || []).forEach(row => store.put(clonePlain(row)));
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
 * Seeds a disposable QA database atomically with validated snapshot and metadata records.
 * Used exclusively by isolated tests and disposable QA harnesses.
 */
export const seedDisposableTextManagementDatabase = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  snapshot,
  metaRecords = null,
  sourceAttachments = [],
  externalImports = [],
  extraMetaRecords = [],
  version = null,
  now = Date.now(),
  onBeforeCommit = null,
  ...restOptions
} = {}) => {
  const safeName = assertDisposablePersistenceOptions({ dbName, ...restOptions });
  const validatedSnapshot = validateTextManagementSnapshot(snapshot);
  const targetVersion = version ?? (
    validatedSnapshot.schemaVersion === TEXT_LIBRARY_V2_SCHEMA_VERSION
      ? TEXT_LIBRARY_V2_DB_VERSION
      : TEXT_LIBRARY_DB_VERSION
  );
  if (validatedSnapshot.schemaVersion === TEXT_LIBRARY_V2_SCHEMA_VERSION && targetVersion < TEXT_LIBRARY_V2_DB_VERSION) {
    typedFail('INVALID_SNAPSHOT', 'Schema 2 snapshot requires a v2 disposable database');
  }

  const effectiveMetaRecords = (() => {
    if (Array.isArray(metaRecords)) {
      return metaRecords.map(r => ({ key: String(r.key), value: clonePlain(r.value), updatedAt: r.updatedAt ?? now }));
    }
    const map = new Map();
    for (const extra of extraMetaRecords) {
      const k = String(extra?.key || '').trim();
      if (!k) typedFail('METADATA_MISMATCH', 'Extra metadata records require a non-empty key');
      map.set(k, { key: k, value: clonePlain(extra.value), updatedAt: extra.updatedAt ?? now });
    }
    if (sourceAttachments.length > 0) {
      map.set(TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, {
        key: TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS,
        value: normalizeTextSourceAttachments(sourceAttachments),
        updatedAt: now
      });
    }
    if (externalImports.length > 0) {
      map.set(TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS, {
        key: TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS,
        value: normalizeTextExternalImportRegistry(externalImports),
        updatedAt: now
      });
    }
    map.set(TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, {
      key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION,
      value: validatedSnapshot.schemaVersion,
      updatedAt: now
    });
    map.set(TEXT_LIBRARY_META_KEYS.INITIALIZED, {
      key: TEXT_LIBRARY_META_KEYS.INITIALIZED,
      value: Boolean(validatedSnapshot.initialized),
      updatedAt: now
    });
    map.set(TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, {
      key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID,
      value: validatedSnapshot.activeDocumentId || null,
      updatedAt: now
    });
    map.set(TEXT_LIBRARY_META_KEYS.ID_COUNTERS, {
      key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS,
      value: clonePlain(validatedSnapshot.counters),
      updatedAt: now
    });
    if (validatedSnapshot.contentUnitMigration) {
      map.set(TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION, {
        key: TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION,
        value: clonePlain(validatedSnapshot.contentUnitMigration),
        updatedAt: now
      });
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();

  const release = acquireWriteLock(safeName);
  let db;
  try {
    db = await openDisposableTextLibraryV2Database({ dbName: safeName, version: targetVersion });
    const { hasUnitsStore, storeNames } = resolveStoreNames(db);
    const tx = db.transaction(storeNames, 'readwrite');
    const completion = txDonePromise(tx);
    try {
      stageFullReplaceOnTx({
        tx,
        hasUnitsStore,
        snapshot: validatedSnapshot,
        metaRecords: effectiveMetaRecords,
        now
      });
      onBeforeCommit?.({ tx, snapshot: validatedSnapshot, metaRecords: effectiveMetaRecords });
    } catch (error) {
      try { tx.abort(); } catch { /* ignore abort error */ }
      await completion.catch(() => {});
      throw error;
    }
    await completion;
    return freezeTextManagementView({
      ok: true,
      dbName: safeName,
      dbVersion: db.version,
      snapshot: validatedSnapshot,
      snapshotFingerprint: canonicalJsonStringify(validatedSnapshot),
      metaRecords: effectiveMetaRecords
    });
  } finally {
    db?.close?.();
    release();
  }
};

/**
 * Reads the complete snapshot, metadata records, and fingerprint inside ONE consistent
 * IndexedDB readonly transaction. Missing core metadata is never synthesized.
 */
export const readDisposableTextManagementDatabaseState = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  version = null,
  requireCompleteMetadata = true,
  ...restOptions
} = {}) => {
  const safeName = assertDisposablePersistenceOptions({ dbName, ...restOptions });
  const db = await openExistingDisposableDb(safeName, version);
  try {
    assertDisposableQaDatabaseHandle(db);
    const { hasUnitsStore, storeNames } = resolveStoreNames(db);
    const tx = db.transaction(storeNames, 'readonly');
    const done = txDonePromise(tx);
    const [metaRecords, collections, documents, blocks, segments, audioVariants, contentUnits] = await Promise.all([
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
    await done;
    return reconstructValidatedStateFromRows({
      metaRecords,
      collections,
      documents,
      blocks,
      segments,
      audioVariants,
      contentUnits,
      hasUnitsStore,
      dbVersion: db.version,
      requireCompleteMetadata
    });
  } finally {
    db?.close?.();
  }
};

const runSynchronousReadWriteTransaction = ({ db, handler }) => new Promise((resolve, reject) => {
  assertDisposableQaDatabaseHandle(db);
  const { hasUnitsStore, storeNames } = resolveStoreNames(db);
  const tx = db.transaction(storeNames, 'readwrite');
  const rows = {
    metaRecords: undefined,
    collections: undefined,
    documents: undefined,
    blocks: undefined,
    segments: undefined,
    audioVariants: undefined,
    contentUnits: undefined
  };

  let failure = null;
  let output;
  let settled = false;

  const fail = error => {
    if (settled) return;
    settled = true;
    reject(error);
  };

  tx.oncomplete = () => {
    if (failure) {
      fail(failure);
      return;
    }
    if (!settled) {
      settled = true;
      resolve(output);
    }
  };
  tx.onabort = () => fail(failure || tx.error || new Error('IndexedDB transaction aborted'));
  tx.onerror = () => fail(failure || tx.error || new Error('IndexedDB transaction failed'));

  const requests = [
    ['metaRecords', tx.objectStore(TEXT_LIBRARY_STORES.META).getAll()],
    ['collections', tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).getAll()],
    ['documents', tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).getAll()],
    ['blocks', tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).getAll()],
    ['segments', tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).getAll()],
    ['audioVariants', tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).getAll()]
  ];
  if (hasUnitsStore) {
    requests.push(['contentUnits', tx.objectStore(TEXT_LIBRARY_CONTENT_UNIT_STORE).getAll()]);
  }

  let remaining = requests.length;
  for (const [key, req] of requests) {
    req.onerror = () => {
      failure = failure || req.error || new Error(`IndexedDB read failed on store ${key}`);
      try { tx.abort?.(); } catch { /* ignore abort errors */ }
    };
    req.onsuccess = () => {
      rows[key] = req.result;
      remaining -= 1;
      if (remaining !== 0) return;

      // Execute synchronously inside final read onsuccess so the readwrite tx never auto-commits.
      try {
        output = handler({ tx, hasUnitsStore, rows });
      } catch (error) {
        failure = error;
        try { tx.abort?.(); } catch { /* ignore abort errors */ }
      }
    };
  }
});

/**
 * Authoritative single-allocation transactional command path on disposable QA IndexedDB.
 * Reads current DB state + metadata inside one readwrite transaction, validates expected
 * snapshot identity BEFORE allocating IDs/UIDs, applies the command ONCE, commits store diffs
 * while preserving all sidecar and unknown metadata records, and returns a frozen receipt.
 */
export const executeDisposableTextManagementTransaction = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  version = null,
  command,
  selection = {},
  boundary = 'read-only',
  permissions = [],
  expectedSnapshotFingerprint = null,
  expectedRevision = null,
  now = Date.now(),
  onBeforeCommit = null,
  ...restOptions
} = {}) => {
  const safeName = assertDisposablePersistenceOptions({ dbName, ...restOptions });
  if (boundary !== 'disposable') {
    typedFail('READ_ONLY', 'Transactional database writes require disposable boundary');
  }
  if (typeof expectedSnapshotFingerprint !== 'string' || !expectedSnapshotFingerprint.length) {
    typedFail('PRECONDITION_REQUIRED', 'expectedSnapshotFingerprint is required before transactional commit');
  }

  const release = acquireWriteLock(safeName);
  let db;
  try {
    db = await openExistingDisposableDb(safeName, version);
    return await runSynchronousReadWriteTransaction({
      db,
      handler: ({ tx, hasUnitsStore, rows }) => {
        const beforeState = reconstructValidatedStateFromRows({
          ...rows,
          hasUnitsStore,
          dbVersion: db.version,
          requireCompleteMetadata: true
        });
        if (beforeState.snapshotFingerprint !== expectedSnapshotFingerprint) {
          typedFail(
            'STALE_RESULT',
            'Database snapshot changed concurrently; reload current state before committing'
          );
        }

        const resolvedSelection = resolveTextManagementSelection(beforeState.snapshot, selection);
        const outcome = applyTextDataManagementCommand(beforeState.snapshot, command, {
          selection: resolvedSelection,
          boundary,
          permissions,
          now
        });

        writeRecordDiff(
          tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS),
          beforeState.snapshot.collections,
          outcome.snapshot.collections
        );
        writeRecordDiff(
          tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS),
          beforeState.snapshot.documents,
          outcome.snapshot.documents
        );
        writeRecordDiff(
          tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS),
          beforeState.snapshot.blocks,
          outcome.snapshot.blocks
        );
        if (hasUnitsStore) {
          writeRecordDiff(
            tx.objectStore(TEXT_LIBRARY_CONTENT_UNIT_STORE),
            beforeState.snapshot.contentUnits || [],
            outcome.snapshot.contentUnits || []
          );
        }
        writeRecordDiff(
          tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS),
          beforeState.snapshot.segments,
          outcome.snapshot.segments
        );
        writeRecordDiff(
          tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS),
          beforeState.snapshot.audioVariants,
          outcome.snapshot.audioVariants
        );

        const nextMetaRecords = stageCoreMetaUpdatesAndBuildList({
          tx,
          beforeMetaRecords: beforeState.metaRecords,
          beforeSnapshot: beforeState.snapshot,
          afterSnapshot: outcome.snapshot,
          now
        });

        const nextFingerprint = canonicalJsonStringify(outcome.snapshot);
        onBeforeCommit?.({
          tx,
          beforeSnapshot: beforeState.snapshot,
          afterSnapshot: outcome.snapshot,
          result: outcome.result,
          metaRecords: nextMetaRecords
        });

        return freezeTextManagementView({
          ok: true,
          authoritative: true,
          dbName: safeName,
          dbVersion: db.version,
          commandType: command?.type || null,
          expectedRevision,
          previousFingerprint: beforeState.snapshotFingerprint,
          snapshotFingerprint: nextFingerprint,
          snapshot: outcome.snapshot,
          result: outcome.result,
          metaRecords: nextMetaRecords
        });
      }
    });
  } finally {
    db?.close?.();
    release();
  }
};

/**
 * Exports a validated database-backup envelope from ONE consistent readonly transaction.
 * Audio binaries remain separated (audioBinaryIncluded: false).
 */
export const exportDisposableTextManagementDatabaseBackup = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  version = null,
  now = Date.now(),
  ...restOptions
} = {}) => {
  const state = await readDisposableTextManagementDatabaseState({
    dbName,
    version,
    requireCompleteMetadata: true,
    ...restOptions
  });
  return exportTextManagementData(state.snapshot, {
    kind: 'database-backup',
    metaRecords: state.metaRecords,
    now
  });
};

/**
 * Atomically replaces a disposable QA database from a validated ProLingo Text Database backup,
 * preserving all unknown/sidecar metadata records, counters, UIDs, and audio metadata references.
 */
export const restoreDisposableTextManagementDatabaseBackup = async ({
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  backup,
  upgradeV1Backup = false,
  now = Date.now(),
  onBeforeCommit = null,
  ...restOptions
} = {}) => {
  const safeName = assertDisposablePersistenceOptions({ dbName, ...restOptions });
  if (!upgradeV1Backup && Array.isArray(backup?.metaRecords)) {
    const rawMetaKeys = new Set(backup.metaRecords.map(record => record?.key));
    const missingMeta = [
      TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION,
      TEXT_LIBRARY_META_KEYS.INITIALIZED,
      TEXT_LIBRARY_META_KEYS.ID_COUNTERS
    ].filter(key => !rawMetaKeys.has(key));
    if (missingMeta.length > 0) {
      typedFail('METADATA_REQUIRED', `Backup metaRecords missing required keys: ${missingMeta.join(', ')}`);
    }
  }
  let inspected;
  try {
    inspected = inspectTextManagementTransfer({ kind: 'database-backup', data: backup });
  } catch (error) {
    if (error instanceof TextDataManagementError) throw error;
    typedFail('INVALID_TRANSFER', error?.message || 'Invalid database backup payload');
  }
  const validated = validateProLingoTextDatabaseBackup(inspected.backup, {
    upgradeToV2: Boolean(upgradeV1Backup),
    now
  });
  const validatedSnapshot = validateTextManagementSnapshot(validated.snapshot);
  const targetDbVersion = validated.backup.database.dbVersion;
  const release = acquireWriteLock(safeName);
  let db;
  try {
    db = await openDisposableTextLibraryV2Database({ dbName: safeName, version: targetDbVersion });
    const { hasUnitsStore, storeNames } = resolveStoreNames(db);
    if (validatedSnapshot.schemaVersion === TEXT_LIBRARY_V2_SCHEMA_VERSION && !hasUnitsStore) {
      typedFail('INVALID_SNAPSHOT', 'Target database does not have contentUnits store for v2 restore');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const completion = txDonePromise(tx);
    try {
      stageFullReplaceOnTx({
        tx,
        hasUnitsStore,
        snapshot: validatedSnapshot,
        metaRecords: validated.backup.metaRecords,
        now
      });
      onBeforeCommit?.({
        tx,
        snapshot: validatedSnapshot,
        backup: validated.backup,
        metaRecords: validated.backup.metaRecords
      });
    } catch (error) {
      try { tx.abort(); } catch { /* ignore abort error */ }
      await completion.catch(() => {});
      throw error;
    }
    await completion;
    return freezeTextManagementView({
      ok: true,
      dbName: safeName,
      dbVersion: db.version,
      snapshot: validatedSnapshot,
      snapshotFingerprint: canonicalJsonStringify(validatedSnapshot),
      backup: validated.backup,
      metaRecords: validated.backup.metaRecords
    });
  } finally {
    db?.close?.();
    release();
  }
};

/**
 * Controlled persistence adapter contract for P15 sessions / UI integration.
 * Only disposable QA mode is permitted in P15-A2; canonical live writes remain disabled.
 */
export const createTextDataManagementPersistenceAdapter = ({
  mode = 'disposable-qa',
  allowCanonicalWrites = false,
  dbName = TEXT_DISPOSABLE_QA_DB_NAME,
  version = null,
  boundary = 'read-only',
  permissions = [],
  now = () => Date.now(),
  ...restOptions
} = {}) => {
  if (mode !== 'disposable-qa' || allowCanonicalWrites) {
    typedFail(
      'CANONICAL_WRITES_DISABLED',
      'Live canonical persistence adapter is not enabled in P15-A2; bind disposable-qa mode only'
    );
  }
  const safeName = assertDisposablePersistenceOptions({ dbName, ...restOptions });
  const grantedPermissions = Object.freeze([...permissions]);
  const resolveNow = typeof now === 'function' ? now : () => Number(now) || Date.now();

  const execute = (command, context = {}) => executeDisposableTextManagementTransaction({
    dbName: safeName,
    version,
    command,
    selection: context.selection || {},
    boundary: context.boundary ?? boundary,
    permissions: context.permissions ?? grantedPermissions,
    expectedSnapshotFingerprint: context.expectedSnapshotFingerprint ?? null,
    expectedRevision: context.expectedRevision ?? null,
    now: resolveNow()
  });
  Object.defineProperty(execute, 'authoritativeTransaction', {
    value: true,
    enumerable: false,
    configurable: false
  });

  return freezeTextManagementView({
    mode: 'disposable-qa',
    dbName: safeName,
    canonicalWritesEnabled: false,
    boundary,
    permissions: grantedPermissions,
    loadState: () => readDisposableTextManagementDatabaseState({ dbName: safeName, version }),
    exportBackup: ({ now: exportNow } = {}) => exportDisposableTextManagementDatabaseBackup({
      dbName: safeName,
      version,
      now: exportNow ?? resolveNow()
    }),
    execute
  });
};
