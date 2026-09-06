import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES
} from '../../constants/textDatabaseConstants.js';
import {
  createProLingoTextPack,
  mergeProLingoTextPack,
  validateProLingoTextPack
} from '../../domain/text/textPackJsonDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../../domain/text/textLibraryDomain.js';
import { openTextLibraryDatabase } from './textLibraryIndexedDbService.js';

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

const safeFilenamePart = value => String(value || 'text-pack').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'text-pack';

export const serializeProLingoTextPack = pack => `${JSON.stringify(validateProLingoTextPack(pack).pack, null, 2)}\n`;

export const buildProLingoTextPackFilename = ({ scopeType, title, packageId }) =>
  `ProLingo_TextPack_${safeFilenamePart(scopeType)}_${safeFilenamePart(title)}_${safeFilenamePart(packageId)}.json`;

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
