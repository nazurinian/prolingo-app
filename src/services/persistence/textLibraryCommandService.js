import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import { applyTextLibraryCommand } from '../../domain/text/textLibraryCommandDomain.js';
import { createTextAudioVariantRecord, formatTextLibraryId, normalizeTextIdCounters, normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';
import { getTextStructuredAudioVariantKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredFullAudioArtifactsMetadata, normalizeTextStructuredFullArtifactRecord } from '../../domain/text/textStructuredSplitFullDomain.js';
import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from '../../domain/text/textGlobalIdentityDomain.js';
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


// Final Text C6 fast path: audio generation must not read/diff the entire Text
// Library on every generated audio. This transaction touches only one Segment,
// its Document, the candidate channel variants, and the identity counter.
export const executeTextAudioVariantUpsert = async payload => {
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction([
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ], 'readwrite');
    const done = transactionDone(tx);
    const segmentStore = tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS);
    const documentStore = tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS);
    const audioStore = tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS);
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    const segmentId = String(payload?.segmentId || '').toUpperCase();
    const channel = String(payload?.channel || 'text').toLowerCase();
    const [segment, countersRecord, channelVariants] = await Promise.all([
      requestToPromise(segmentStore.get(segmentId)),
      requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS)),
      requestToPromise(audioStore.index('bySegmentChannel').getAll([segmentId, channel]))
    ]);
    if (!segment) throw new Error(`Unknown Text segment: ${segmentId}`);
    const document = await requestToPromise(documentStore.get(segment.documentId));
    if (!document || document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) throw new Error(`Text audio requires a structured Document: ${segment.documentId}`);

    const identity = {
      segmentId,
      channel,
      engine: payload?.engine || 'local',
      source: payload?.source || 'file',
      voiceId: payload?.voiceId ?? null
    };
    const identityKey = getTextStructuredAudioVariantKey(identity);
    const existing = (channelVariants || []).find(item => getTextStructuredAudioVariantKey(item) === identityKey) || null;
    const now = Date.now();
    let counters = normalizeTextIdCounters(countersRecord?.value);
    let record;
    let action;
    if (existing) {
      record = createTextAudioVariantRecord({
        ...existing,
        uid: existing.uid || createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT),
        ...identity,
        language: payload?.language === undefined ? existing.language : payload.language,
        filename: payload?.filename === undefined ? existing.filename : payload.filename,
        mimeType: payload?.mimeType === undefined ? existing.mimeType : payload.mimeType,
        updatedAt: now,
        metadata: payload?.metadata === undefined ? existing.metadata : payload.metadata
      });
      action = 'update';
    } else {
      counters = { ...counters, audioVariant: Number(counters.audioVariant || 0) + 1 };
      record = createTextAudioVariantRecord({
        id: formatTextLibraryId('AUDIO_VARIANT', counters.audioVariant),
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT),
        ...identity,
        language: payload?.language,
        filename: payload?.filename,
        mimeType: payload?.mimeType,
        createdAt: now,
        updatedAt: now,
        metadata: payload?.metadata
      });
      putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, counters, now);
      action = 'create';
    }
    audioStore.put(record);
    await done;
    return { entity: 'audioVariant', action, id: record.id, segmentId, identityKey, audioVariant: record, counters };
  } finally {
    db.close();
  }
};


// v6.0.3-beta.6: RF reconciliation can fan one physical render out to many
// logical Segment/channel slots. Persist those logical AudioVariants in one
// IndexedDB transaction instead of opening one transaction per match.
export const executeTextAudioVariantBulkUpsert = async payloadsCandidate => {
  const payloads = (Array.isArray(payloadsCandidate) ? payloadsCandidate : []).filter(payload => payload?.segmentId && payload?.channel);
  if (!payloads.length) return { audioVariants: [], counters: null, created: 0, updated: 0 };

  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction([
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ], 'readwrite');
    const done = transactionDone(tx);
    const segmentStore = tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS);
    const documentStore = tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS);
    const audioStore = tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS);
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    const [segments, documents, existingVariants, countersRecord] = await Promise.all([
      requestToPromise(segmentStore.getAll()),
      requestToPromise(documentStore.getAll()),
      requestToPromise(audioStore.getAll()),
      requestToPromise(metaStore.get(TEXT_LIBRARY_META_KEYS.ID_COUNTERS))
    ]);

    const segmentsById = new Map((segments || []).map(record => [String(record?.id || '').toUpperCase(), record]));
    const documentsById = new Map((documents || []).map(record => [String(record?.id || '').toUpperCase(), record]));
    const variantsByIdentity = new Map((existingVariants || []).map(record => [getTextStructuredAudioVariantKey(record), record]));
    let counters = normalizeTextIdCounters(countersRecord?.value);
    let created = 0;
    let updated = 0;
    const records = [];
    const now = Date.now();

    for (const payload of payloads) {
      const segmentId = String(payload.segmentId || '').toUpperCase();
      const channel = String(payload.channel || 'text').toLowerCase();
      const segment = segmentsById.get(segmentId);
      if (!segment) throw new Error(`Unknown Text segment: ${segmentId}`);
      const document = documentsById.get(String(segment.documentId || '').toUpperCase());
      if (!document || document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) {
        throw new Error(`Text audio requires a structured Document: ${segment.documentId}`);
      }

      const identity = {
        segmentId,
        channel,
        engine: payload.engine || 'local',
        source: payload.source || 'file',
        voiceId: payload.voiceId ?? null
      };
      const identityKey = getTextStructuredAudioVariantKey(identity);
      const existing = variantsByIdentity.get(identityKey) || null;
      let record;
      if (existing) {
        record = createTextAudioVariantRecord({
          ...existing,
          uid: existing.uid || createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT),
          ...identity,
          language: payload.language === undefined ? existing.language : payload.language,
          filename: payload.filename === undefined ? existing.filename : payload.filename,
          mimeType: payload.mimeType === undefined ? existing.mimeType : payload.mimeType,
          updatedAt: now,
          metadata: payload.metadata === undefined ? existing.metadata : payload.metadata
        });
        updated += 1;
      } else {
        counters = { ...counters, audioVariant: Number(counters.audioVariant || 0) + 1 };
        record = createTextAudioVariantRecord({
          id: formatTextLibraryId('AUDIO_VARIANT', counters.audioVariant),
          uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT),
          ...identity,
          language: payload.language,
          filename: payload.filename,
          mimeType: payload.mimeType,
          createdAt: now,
          updatedAt: now,
          metadata: payload.metadata
        });
        created += 1;
      }
      variantsByIdentity.set(identityKey, record);
      audioStore.put(record);
      records.push(record);
    }

    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, counters, now);
    await done;
    return { audioVariants: records, counters, created, updated };
  } finally {
    db.close();
  }
};


// beta.8/P4: Portable ZIP may materialize multiple Full Artifacts at once.
// Persist them in one transaction so a large ZIP never opens one IndexedDB
// transaction per Card/profile match.
export const executeTextFullAudioArtifactBulkUpsert = async payloadsCandidate => {
  const payloads = (Array.isArray(payloadsCandidate) ? payloadsCandidate : []).filter(payload => payload?.blockId && payload?.artifact);
  if (!payloads.length) return { artifacts: [], blocks: [], updated: 0 };

  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction([
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS
    ], 'readwrite');
    const done = transactionDone(tx);
    const blockStore = tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS);
    const documentStore = tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS);
    const [blocks, documents] = await Promise.all([
      requestToPromise(blockStore.getAll()),
      requestToPromise(documentStore.getAll())
    ]);
    const blocksById = new Map((blocks || []).map(record => [String(record?.id || '').toUpperCase(), record]));
    const documentsById = new Map((documents || []).map(record => [String(record?.id || '').toUpperCase(), record]));
    const updatedBlocks = new Map();
    const touchedDocuments = new Set();
    const artifacts = [];
    const now = Date.now();

    for (const payload of payloads) {
      const blockId = String(payload.blockId || '').toUpperCase();
      const current = updatedBlocks.get(blockId) || blocksById.get(blockId);
      if (!current) throw new Error(`Unknown Text block: ${blockId}`);
      const document = documentsById.get(String(current.documentId || '').toUpperCase());
      if (!document || document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) {
        throw new Error(`Full Text audio requires a structured Document: ${current.documentId}`);
      }
      const artifact = normalizeTextStructuredFullArtifactRecord(payload.artifact);
      if (!artifact) throw new Error(`Invalid Full Audio Artifact for ${blockId}`);
      const normalizedArtifact = {
        ...artifact,
        createdAt: artifact.createdAt || now,
        updatedAt: now
      };
      const next = {
        ...current,
        metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: current.metadata, artifact: normalizedArtifact }),
        updatedAt: now
      };
      updatedBlocks.set(blockId, next);
      touchedDocuments.add(String(current.documentId || '').toUpperCase());
      artifacts.push({ blockId, artifact: normalizedArtifact });
    }

    updatedBlocks.forEach(record => blockStore.put(record));
    touchedDocuments.forEach(documentId => {
      const current = documentsById.get(documentId);
      if (current) documentStore.put({ ...current, updatedAt: now });
    });
    await done;
    return { artifacts, blocks: [...updatedBlocks.values()], updated: artifacts.length };
  } finally {
    db.close();
  }
};
