import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES
} from '../../constants/textDatabaseConstants.js';
import {
  createProLingoTextPack,
  mergeProLingoTextPack,
  PROLINGO_TEXT_PACK_UID_MODE_PRESERVE,
  validateProLingoTextPack
} from '../../domain/text/textPackJsonDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';
import {
  createTextSourceAttachmentFromMerge,
  findTextSourceAttachment,
  normalizeTextSourceAttachments,
  planTextSourceDetach,
  planTextSourceSync
} from '../../domain/text/textSourceAttachmentDomain.js';
import { openTextLibraryDatabase } from './textLibraryIndexedDbService.js';
import { buildCanonicalTextPackFilename } from '../../domain/text/textFilenameDomain.js';

const MAX_TEXT_PACK_BYTES = 25 * 1024 * 1024;

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

export const serializeProLingoTextPack = pack => `${JSON.stringify(validateProLingoTextPack(pack).pack, null, 2)}\n`;

export const buildProLingoTextPackFilename = ({ scopeType, title, packageId }) =>
  buildCanonicalTextPackFilename({ scopeType, title, packageId });

export const triggerProLingoTextPackDownload = ({ pack, title = 'Text' }) => {
  const content = serializeProLingoTextPack(pack);
  const filename = buildProLingoTextPackFilename({ scopeType: pack.scope.type, title, packageId: pack.packageId });
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { filename, bytes: blob.size, pack };
};

export const executeProLingoTextPackExport = ({ snapshot, scopeType, rootId, title, source, now = Date.now() }) => {
  const pack = createProLingoTextPack({ snapshot, scopeType, rootId, source, now });
  return triggerProLingoTextPackDownload({ pack, title });
};

export const parseProLingoTextPackJson = raw => {
  let candidate;
  try {
    candidate = JSON.parse(String(raw ?? ''));
  } catch (error) {
    throw new Error(`Invalid Text Pack JSON: ${error.message}`);
  }
  return validateProLingoTextPack(candidate).pack;
};

export const readProLingoTextPackFile = async file => {
  if (!file) throw new Error('Choose a Text Pack JSON file first');
  if (Number.isFinite(file.size) && file.size > MAX_TEXT_PACK_BYTES) throw new Error('Text Pack JSON is larger than the 25 MB safety limit');
  const raw = await file.text();
  if (raw.length > MAX_TEXT_PACK_BYTES) throw new Error('Text Pack JSON is larger than the 25 MB safety limit');
  return parseProLingoTextPackJson(raw);
};


const textPackStoreNames = () => [
  TEXT_LIBRARY_STORES.META,
  TEXT_LIBRARY_STORES.COLLECTIONS,
  TEXT_LIBRARY_STORES.DOCUMENTS,
  TEXT_LIBRARY_STORES.BLOCKS,
  TEXT_LIBRARY_STORES.SEGMENTS,
  TEXT_LIBRARY_STORES.AUDIO_VARIANTS
];

const readAttachmentsInsideTransaction = async tx => {
  const record = await requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).get(TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS));
  return normalizeTextSourceAttachments(record?.value);
};

const recordById = (records, id) => (records || []).find(record => record.id === id) || null;

const writeImportedSnapshotRecords = ({ tx, snapshot, imported }) => {
  (imported.collectionIds || []).forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).put(recordById(snapshot.collections, id)));
  (imported.documentIds || []).forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).put(recordById(snapshot.documents, id)));
  (imported.blockIds || []).forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).put(recordById(snapshot.blocks, id)));
  (imported.segmentIds || []).forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).put(recordById(snapshot.segments, id)));
  (imported.audioVariantIds || []).forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).put(recordById(snapshot.audioVariants, id)));
};

const applySourcePlanOperations = ({ tx, plan }) => {
  const stores = {
    collections: tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS),
    documents: tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS),
    blocks: tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS),
    segments: tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS),
    audioVariants: tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS)
  };
  Object.entries(stores).forEach(([group, store]) => {
    Object.values(plan.upsert?.[group] || {}).forEach(record => store.put(record));
  });
  // Delete deepest children first to keep the operation order easy to audit.
  ['audioVariants', 'segments', 'blocks', 'documents', 'collections'].forEach(group => {
    Object.keys(plan.remove?.[group] || {}).forEach(id => stores[group].delete(id));
  });
};

const replaceAttachment = (attachments, nextAttachment) => {
  const without = normalizeTextSourceAttachments(attachments).filter(item => item.attachmentId !== nextAttachment.attachmentId);
  return [...without, nextAttachment];
};

export const readTextSourceAttachments = async () => {
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction(TEXT_LIBRARY_STORES.META, 'readonly');
    const done = transactionDone(tx);
    const attachments = await readAttachmentsInsideTransaction(tx);
    await done;
    return attachments;
  } finally {
    db.close();
  }
};

export const executeProLingoTextPackAttachOrSync = async ({ pack: packCandidate, fileName = null, now = Date.now() }) => {
  const pack = validateProLingoTextPack(packCandidate).pack;
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction(textPackStoreNames(), 'readwrite');
    const done = transactionDone(tx);
    const [before, attachments] = await Promise.all([
      readSnapshotInsideTransaction(tx),
      readAttachmentsInsideTransaction(tx)
    ]);
    if (!before.initialized) throw new Error('Text source attach refused before Text Library initialization');
    const existing = findTextSourceAttachment(attachments, pack.packageId);
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);

    if (!existing) {
      const merged = mergeProLingoTextPack({ localSnapshot: before, pack, now, uidMode: PROLINGO_TEXT_PACK_UID_MODE_PRESERVE });
      const attached = createTextSourceAttachmentFromMerge({ pack, merged, fileName, now });
      writeImportedSnapshotRecords({ tx, snapshot: attached.snapshot, imported: attached.imported });
      putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, attached.snapshot.counters, now);
      putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, [...attachments, attached.attachment], now);
      await done;
      return {
        mode: 'attach',
        packageId: pack.packageId,
        attachment: attached.attachment,
        attachments: [...attachments, attached.attachment],
        snapshot: attached.snapshot,
        counts: attached.counts,
        stats: { created: Object.values(attached.counts).reduce((sum, value) => sum + Number(value || 0), 0), updated: 0, deleted: 0, preservedLocal: 0 }
      };
    }

    const plan = planTextSourceSync({ localSnapshot: before, pack, attachment: existing, fileName, now });
    if (!plan.ok) {
      try { tx.abort(); } catch { /* noop */ }
      await done.catch(() => {});
      const detail = (plan.conflicts || []).slice(0, 6).join('; ');
      const error = new Error(`Text source Sync blocked by conflict${detail ? `: ${detail}` : ''}`);
      error.code = 'TEXT_SOURCE_SYNC_CONFLICT';
      error.conflicts = plan.conflicts || [];
      throw error;
    }
    applySourcePlanOperations({ tx, plan });
    const nextAttachments = replaceAttachment(attachments, plan.attachment);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, plan.snapshot.counters, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, plan.snapshot.activeDocumentId, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, nextAttachments, now);
    await done;
    return {
      mode: 'sync',
      packageId: pack.packageId,
      attachment: plan.attachment,
      attachments: nextAttachments,
      snapshot: plan.snapshot,
      stats: plan.stats,
      localChanged: plan.localChanged || []
    };
  } finally {
    db.close();
  }
};

export const executeProLingoTextPackFileAttachOrSync = async ({ file, now = Date.now() }) => {
  const pack = await readProLingoTextPackFile(file);
  return executeProLingoTextPackAttachOrSync({ pack, fileName: file?.name || null, now });
};

export const executeTextSourceDetach = async ({ attachmentId, removeData = false, now = Date.now() }) => {
  if (!attachmentId) throw new Error('Text source detach requires attachmentId');
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction(textPackStoreNames(), 'readwrite');
    const done = transactionDone(tx);
    const [before, attachments] = await Promise.all([
      readSnapshotInsideTransaction(tx),
      readAttachmentsInsideTransaction(tx)
    ]);
    const attachment = attachments.find(item => item.attachmentId === attachmentId);
    if (!attachment) throw new Error(`Text source attachment not found: ${attachmentId}`);
    const plan = planTextSourceDetach({ localSnapshot: before, attachment, removeData, now });
    if (!plan.ok) {
      try { tx.abort(); } catch { /* noop */ }
      await done.catch(() => {});
      const detail = (plan.conflicts || []).slice(0, 6).join('; ');
      const error = new Error(`Text source removal blocked by local changes${detail ? `: ${detail}` : ''}`);
      error.code = 'TEXT_SOURCE_DETACH_CONFLICT';
      error.conflicts = plan.conflicts || [];
      throw error;
    }
    applySourcePlanOperations({ tx, plan });
    const nextAttachments = attachments.filter(item => item.attachmentId !== attachmentId);
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, plan.snapshot.activeDocumentId, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, nextAttachments, now);
    await done;
    return { ...plan, attachment, attachments: nextAttachments };
  } finally {
    db.close();
  }
};

export const executeProLingoTextPackMerge = async ({ pack: packCandidate, now = Date.now() }) => {
  const pack = validateProLingoTextPack(packCandidate).pack;
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
    if (!before.initialized) throw new Error('Text Pack import refused before Text Library initialization');
    const merged = mergeProLingoTextPack({ localSnapshot: before, pack, now });

    merged.imported.collectionIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).put(merged.snapshot.collections.find(record => record.id === id)));
    merged.imported.documentIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).put(merged.snapshot.documents.find(record => record.id === id)));
    merged.imported.blockIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).put(merged.snapshot.blocks.find(record => record.id === id)));
    merged.imported.segmentIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).put(merged.snapshot.segments.find(record => record.id === id)));
    merged.imported.audioVariantIds.forEach(id => tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).put(merged.snapshot.audioVariants.find(record => record.id === id)));

    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, TEXT_LIBRARY_SCHEMA_VERSION, now);
    putMeta(metaStore, TEXT_LIBRARY_META_KEYS.ID_COUNTERS, merged.snapshot.counters, now);
    await done;
    return merged;
  } finally {
    db.close();
  }
};

export const executeProLingoTextPackFileMerge = async ({ file, now = Date.now() }) => {
  const pack = await readProLingoTextPackFile(file);
  return executeProLingoTextPackMerge({ pack, now });
};

// Final Text C2 explicit compatibility path. This intentionally preserves the old
// A14 independent-copy behavior and is never used for canonical Attach/Sync.
export const executeProLingoTextPackFileImportCopy = executeProLingoTextPackFileMerge;
