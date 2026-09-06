import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_STORES
} from '../../constants/textDatabaseConstants.js';
import {
  createProLingoTextDatabaseBackup,
  resolveProLingoTextDatabaseBackupDiagnostics,
  validateProLingoTextDatabaseBackup
} from '../../domain/text/textDatabaseBackupDomain.js';
import { openTextLibraryDatabase } from './textLibraryIndexedDbService.js';

const MAX_TEXT_DATABASE_BACKUP_BYTES = 50 * 1024 * 1024;

const requestToPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});

const allStoreNames = () => [
  TEXT_LIBRARY_STORES.META,
  TEXT_LIBRARY_STORES.COLLECTIONS,
  TEXT_LIBRARY_STORES.DOCUMENTS,
  TEXT_LIBRARY_STORES.BLOCKS,
  TEXT_LIBRARY_STORES.SEGMENTS,
  TEXT_LIBRARY_STORES.AUDIO_VARIANTS
];

const readRawDatabaseState = async db => {
  const tx = db.transaction(allStoreNames(), 'readonly');
  const done = transactionDone(tx);
  const [metaRecords, collections, documents, blocks, segments, audioVariants] = await Promise.all([
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.META).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).getAll()),
    requestToPromise(tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).getAll())
  ]);
  await done;
  return { metaRecords, stores: { collections, documents, blocks, segments, audioVariants } };
};

const safeFilenameTimestamp = value => String(value || '').replace(/[:.]/g, '-');

export const serializeProLingoTextDatabaseBackup = backup => `${JSON.stringify(validateProLingoTextDatabaseBackup(backup).backup, null, 2)}\n`;

export const buildProLingoTextDatabaseBackupFilename = backup =>
  `ProLingo_TextDB_Backup_${safeFilenameTimestamp(backup.createdAt || new Date().toISOString())}.json`;

export const triggerProLingoTextDatabaseBackupDownload = backupCandidate => {
  const { backup } = validateProLingoTextDatabaseBackup(backupCandidate);
  const content = serializeProLingoTextDatabaseBackup(backup);
  const filename = buildProLingoTextDatabaseBackupFilename(backup);
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
  return { filename, bytes: blob.size, backup };
};

export const executeProLingoTextDatabaseBackupExport = async ({ source = {}, now = Date.now() } = {}) => {
  const db = await openTextLibraryDatabase();
  try {
    const raw = await readRawDatabaseState(db);
    const initialized = raw.metaRecords.find(record => record.key === TEXT_LIBRARY_META_KEYS.INITIALIZED)?.value;
    if (!initialized) throw new Error('Text Database Backup refused before Text Library initialization');
    const backup = createProLingoTextDatabaseBackup({ ...raw, source, now });
    return triggerProLingoTextDatabaseBackupDownload(backup);
  } finally {
    db.close();
  }
};

export const parseProLingoTextDatabaseBackupJson = raw => {
  let candidate;
  try {
    candidate = JSON.parse(String(raw ?? ''));
  } catch (error) {
    throw new Error(`Invalid Text Database Backup JSON: ${error.message}`);
  }
  return validateProLingoTextDatabaseBackup(candidate);
};

export const readProLingoTextDatabaseBackupFile = async file => {
  if (!file) throw new Error('Choose a Text Database Backup JSON file first');
  if (Number.isFinite(file.size) && file.size > MAX_TEXT_DATABASE_BACKUP_BYTES) throw new Error('Text Database Backup is larger than the 50 MB safety limit');
  const raw = await file.text();
  if (raw.length > MAX_TEXT_DATABASE_BACKUP_BYTES) throw new Error('Text Database Backup is larger than the 50 MB safety limit');
  const parsed = parseProLingoTextDatabaseBackupJson(raw);
  return {
    ...parsed,
    diagnostics: resolveProLingoTextDatabaseBackupDiagnostics(parsed.backup),
    fileName: file.name || null,
    bytes: Number.isFinite(file.size) ? file.size : raw.length
  };
};

export const executeProLingoTextDatabaseReplaceRestore = async ({ backup: backupCandidate, now = Date.now() }) => {
  const prepared = validateProLingoTextDatabaseBackup(backupCandidate);
  const { backup, snapshot } = prepared;
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction(allStoreNames(), 'readwrite');
    const done = transactionDone(tx);
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    const collectionStore = tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS);
    const documentStore = tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS);
    const blockStore = tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS);
    const segmentStore = tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS);
    const audioStore = tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS);

    metaStore.clear();
    collectionStore.clear();
    documentStore.clear();
    blockStore.clear();
    segmentStore.clear();
    audioStore.clear();

    backup.metaRecords.forEach(record => metaStore.put({ ...record, updatedAt: record.updatedAt ?? now }));
    snapshot.collections.forEach(record => collectionStore.put(record));
    snapshot.documents.forEach(record => documentStore.put(record));
    snapshot.blocks.forEach(record => blockStore.put(record));
    snapshot.segments.forEach(record => segmentStore.put(record));
    snapshot.audioVariants.forEach(record => audioStore.put(record));

    await done;
    return {
      backup,
      snapshot,
      diagnostics: resolveProLingoTextDatabaseBackupDiagnostics(backup),
      restorePolicy: 'replace',
      restoredAt: new Date(now).toISOString()
    };
  } finally {
    db.close();
  }
};
