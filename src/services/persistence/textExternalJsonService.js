import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES
} from '../../constants/textDatabaseConstants.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';
import {
  buildTextExternalPackageDataFingerprint,
  normalizeTextExternalImportRegistry,
  planProLingoTextExternalInitialImport,
  validateProLingoTextExternalPackage
} from '../../domain/text/textExternalJsonDomain.js';
import { inspectTextExternalReconciliation, planTextExternalUpdateExisting } from '../../domain/text/textExternalReconciliationDomain.js';
import { openTextLibraryDatabase } from './textLibraryIndexedDbService.js';

const MAX_EXTERNAL_TEXT_JSON_BYTES = 25 * 1024 * 1024;

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

export const parseProLingoTextExternalJson = raw => {
  if (typeof raw !== 'string') throw new Error('External Text JSON input must be text');
  if (raw.length > MAX_EXTERNAL_TEXT_JSON_BYTES) throw new Error('External Text JSON is larger than the 25 MB safety limit');
  let candidate;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid External Text JSON: ${error.message}`);
  }
  return validateProLingoTextExternalPackage(candidate).package;
};

export const readProLingoTextExternalJsonFile = async file => {
  if (!file) throw new Error('Choose an External Text JSON file first');
  if (Number.isFinite(file.size) && file.size > MAX_EXTERNAL_TEXT_JSON_BYTES) throw new Error('External Text JSON is larger than the 25 MB safety limit');
  const raw = await file.text();
  return parseProLingoTextExternalJson(raw);
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

const readExternalImportsInsideTransaction = async tx => {
  const record = await requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).get(TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS));
  return normalizeTextExternalImportRegistry(record?.value);
};

export const readTextExternalSourceImports = async () => {
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction(TEXT_LIBRARY_STORES.META, 'readonly');
    const done = transactionDone(tx);
    const imports = await readExternalImportsInsideTransaction(tx);
    await done;
    return imports;
  } finally {
    db.close();
  }
};

export const executeProLingoTextExternalInitialImport = async ({ package: packageCandidate, fileName = null, now = Date.now() }) => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  const db = await openTextLibraryDatabase();
  try {
    const stores = [
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.COLLECTIONS,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ];
    const tx = db.transaction(stores, 'readwrite');
    const done = transactionDone(tx);
    const [before, storedImports] = await Promise.all([
      readSnapshotInsideTransaction(tx),
      readExternalImportsInsideTransaction(tx)
    ]);
    if (!before.initialized) throw new Error('External Text import refused before Text Library initialization');
    const liveDocumentIds = new Set(before.documents.map(document => document.id));
    const imports = storedImports.filter(item => liveDocumentIds.has(item.documentId));

    const plan = planProLingoTextExternalInitialImport({
      localSnapshot: before,
      package: packageValue,
      existingImports: imports,
      fileName,
      now
    });

    plan.created.collectionIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).put(plan.snapshot.collections.find(record => record.id === id)));
    plan.created.documentIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).put(plan.snapshot.documents.find(record => record.id === id)));
    plan.created.blockIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).put(plan.snapshot.blocks.find(record => record.id === id)));
    plan.created.segmentIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).put(plan.snapshot.segments.find(record => record.id === id)));

    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, TEXT_LIBRARY_SCHEMA_VERSION, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, plan.snapshot.counters, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, plan.snapshot.activeDocumentId, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS, [...imports, plan.importRecord], now);
    await done;

    return {
      mode: 'external-initial-import',
      externalSourceKey: packageValue.externalSourceKey,
      documentId: plan.importRecord.documentId,
      documentUid: plan.importRecord.documentUid,
      snapshot: plan.snapshot,
      importRecord: plan.importRecord,
      imports: [...imports, plan.importRecord],
      counts: plan.counts
    };
  } finally {
    db.close();
  }
};

export const executeProLingoTextExternalJsonFileInitialImport = async ({ file, now = Date.now() }) => {
  const packageValue = await readProLingoTextExternalJsonFile(file);
  return executeProLingoTextExternalInitialImport({ package: packageValue, fileName: file?.name || null, now });
};

const replaceExternalImportRecord = (imports, nextRecord) => {
  const key = nextRecord?.externalSourceKey;
  return [...normalizeTextExternalImportRegistry(imports).filter(item => item.externalSourceKey !== key), nextRecord];
};

const persistDocumentScopedReconciliation = async ({ tx, before, after, documentId }) => {
  const stores = {
    documents: tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS),
    blocks: tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS),
    segments: tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS),
    audioVariants: tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS)
  };
  const beforeBlocks = new Set(before.blocks.filter(item => item.documentId === documentId).map(item => item.id));
  const afterBlocks = new Set(after.blocks.filter(item => item.documentId === documentId).map(item => item.id));
  const beforeSegments = new Set(before.segments.filter(item => item.documentId === documentId).map(item => item.id));
  const afterSegments = new Set(after.segments.filter(item => item.documentId === documentId).map(item => item.id));
  const beforeAudio = new Set(before.audioVariants.filter(item => beforeSegments.has(item.segmentId)).map(item => item.id));
  const afterAudio = new Set(after.audioVariants.filter(item => afterSegments.has(item.segmentId)).map(item => item.id));

  const document = after.documents.find(item => item.id === documentId);
  if (!document) throw new Error(`Reconciled Workspace ${documentId} disappeared unexpectedly.`);
  stores.documents.put(document);
  after.blocks.filter(item => item.documentId === documentId).forEach(item => stores.blocks.put(item));
  after.segments.filter(item => item.documentId === documentId).forEach(item => stores.segments.put(item));
  after.audioVariants.filter(item => afterSegments.has(item.segmentId)).forEach(item => stores.audioVariants.put(item));
  beforeBlocks.forEach(id => { if (!afterBlocks.has(id)) stores.blocks.delete(id); });
  beforeSegments.forEach(id => { if (!afterSegments.has(id)) stores.segments.delete(id); });
  beforeAudio.forEach(id => { if (!afterAudio.has(id)) stores.audioVariants.delete(id); });
};

export const inspectProLingoTextExternalImport = async ({ package: packageCandidate }) => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
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
    const [snapshot, storedImports] = await Promise.all([
      readSnapshotInsideTransaction(tx),
      readExternalImportsInsideTransaction(tx)
    ]);
    await done;
    const liveDocumentIds = new Set(snapshot.documents.map(document => document.id));
    const imports = storedImports.filter(item => liveDocumentIds.has(item.documentId));
    const existingImport = imports.find(item => item.externalSourceKey === packageValue.externalSourceKey) || null;
    if (!existingImport) {
      return {
        status: 'new-source',
        externalSourceKey: packageValue.externalSourceKey,
        dataFingerprint: buildTextExternalPackageDataFingerprint(packageValue),
        package: packageValue,
        existingImport: null,
        summary: { added: 1, updated: 0, removed: 0, conflicts: 0 }
      };
    }
    return {
      ...inspectTextExternalReconciliation({ localSnapshot: snapshot, package: packageValue, existingImport }),
      package: packageValue
    };
  } finally { db.close(); }
};

export const inspectProLingoTextExternalJsonFile = async file => {
  const packageValue = await readProLingoTextExternalJsonFile(file);
  const inspection = await inspectProLingoTextExternalImport({ package: packageValue });
  return { ...inspection, fileName: file?.name || null };
};

export const executeProLingoTextExternalImportDecision = async ({
  package: packageCandidate,
  decision,
  fileName = null,
  now = Date.now()
}) => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  if (decision === 'keep-existing') {
    return { mode: 'external-keep-existing', externalSourceKey: packageValue.externalSourceKey, skipped: true };
  }
  if (decision === 'new-source') {
    return executeProLingoTextExternalInitialImport({ package: packageValue, fileName, now });
  }
  if (decision === 'import-as-copy') {
    const randomSuffix = (globalThis.crypto?.randomUUID?.() || `${now}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toLowerCase();
    const copyPackage = {
      ...packageValue,
      externalSourceKey: `${packageValue.externalSourceKey}.copy.${randomSuffix}`,
      source: {
        ...packageValue.source,
        notes: [packageValue.source?.notes, `Independent copy of externalSourceKey=${packageValue.externalSourceKey}`].filter(Boolean).join(' | ')
      }
    };
    const result = await executeProLingoTextExternalInitialImport({ package: copyPackage, fileName, now });
    return { ...result, mode: 'external-import-copy', originalExternalSourceKey: packageValue.externalSourceKey };
  }
  if (!['update-keep-local', 'update-use-incoming'].includes(decision)) {
    throw new Error(`Unsupported external import decision: ${decision}`);
  }

  const db = await openTextLibraryDatabase();
  try {
    const stores = [
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.COLLECTIONS,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ];
    const tx = db.transaction(stores, 'readwrite');
    const done = transactionDone(tx);
    const [before, storedImports] = await Promise.all([
      readSnapshotInsideTransaction(tx),
      readExternalImportsInsideTransaction(tx)
    ]);
    const imports = storedImports.filter(item => before.documents.some(document => document.id === item.documentId));
    const existingImport = imports.find(item => item.externalSourceKey === packageValue.externalSourceKey) || null;
    if (!existingImport) throw new Error(`External source ${packageValue.externalSourceKey} is no longer registered. Re-inspect before updating.`);

    const plan = planTextExternalUpdateExisting({
      localSnapshot: before,
      package: packageValue,
      existingImport,
      conflictPolicy: decision === 'update-use-incoming' ? 'use-incoming' : 'keep-local',
      fileName,
      now
    });
    await persistDocumentScopedReconciliation({ tx, before, after: plan.snapshot, documentId: existingImport.documentId });
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, plan.snapshot.counters, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, plan.snapshot.activeDocumentId, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS, replaceExternalImportRecord(imports, plan.importRecord), now);
    await done;
    return {
      mode: 'external-update',
      decision,
      externalSourceKey: packageValue.externalSourceKey,
      documentId: existingImport.documentId,
      snapshot: plan.snapshot,
      importRecord: plan.importRecord,
      imports: replaceExternalImportRecord(imports, plan.importRecord),
      stats: plan.stats,
      conflicts: plan.conflicts,
      changedSegmentIds: plan.changedSegmentIds,
      removedSegmentIds: plan.removedSegmentIds
    };
  } finally { db.close(); }
};

export const executeProLingoTextExternalJsonFileDecision = async ({ file, decision, now = Date.now() }) => {
  const packageValue = await readProLingoTextExternalJsonFile(file);
  return executeProLingoTextExternalImportDecision({ package: packageValue, decision, fileName: file?.name || null, now });
};
