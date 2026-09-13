const DB_NAME = 'prolingo_audio_staging_v1';
const DB_VERSION = 1;
const META_STORE = 'audioMeta';
const BLOB_STORE = 'audioBlob';
const BATCH_STORE = 'batchSessions';
const HOT_CACHE_LIMIT = 12;

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const safeMode = value => clean(value) || 'table';

export const AUDIO_STAGING_DB_NAME = DB_NAME;
export const AUDIO_STAGING_DB_VERSION = DB_VERSION;

export const buildAudioStagingId = ({ mode = 'table', mapKey, engine, voiceId }) => [
  safeMode(mode),
  clean(mapKey),
  lower(engine) || 'unknown-engine',
  lower(voiceId) || 'unknown-voice'
].join('|');

const openDb = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is not available.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(META_STORE)) {
      const meta = db.createObjectStore(META_STORE, { keyPath: 'id' });
      meta.createIndex('mode', 'mode', { unique: false });
      meta.createIndex('mapKey', 'mapKey', { unique: false });
      meta.createIndex('batchSessionId', 'batchSessionId', { unique: false });
      meta.createIndex('hasBlob', 'hasBlob', { unique: false });
    }
    if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(BATCH_STORE)) {
      const batch = db.createObjectStore(BATCH_STORE, { keyPath: 'id' });
      batch.createIndex('mode', 'mode', { unique: false });
      batch.createIndex('createdAt', 'createdAt', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Failed to open Audio Staging database.'));
});

const waitRequest = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
});

const waitTransaction = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
});

export const putAudioStagingBlob = async ({
  mode = 'table', mapKey, part = null, engine = null, voiceId = null, filename = null,
  mimeType = null, blob, stableId = null, vocabId = null, displayId = null, bookId = null,
  batchSessionId = null, metadata = null
}) => {
  if (!(blob instanceof Blob)) throw new Error('Audio Staging requires a Blob.');
  const id = buildAudioStagingId({ mode, mapKey, engine, voiceId });
  const now = Date.now();
  const db = await openDb();
  try {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const blobStore = tx.objectStore(BLOB_STORE);
    const previous = await waitRequest(metaStore.get(id));
    const record = {
      ...(previous || {}),
      id,
      mode: safeMode(mode),
      mapKey: clean(mapKey),
      part: part || previous?.part || null,
      engine: engine || previous?.engine || null,
      voiceId: voiceId || previous?.voiceId || null,
      filename: filename || previous?.filename || null,
      mimeType: mimeType || blob.type || previous?.mimeType || null,
      size: Number(blob.size || 0),
      stableId: stableId || previous?.stableId || null,
      vocabId: vocabId || previous?.vocabId || null,
      displayId: Number.isFinite(Number(displayId)) ? Number(displayId) : (previous?.displayId ?? null),
      bookId: bookId || previous?.bookId || null,
      batchSessionId: batchSessionId || previous?.batchSessionId || null,
      hasBlob: true,
      status: 'staged',
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      metadata: { ...(previous?.metadata || {}), ...(metadata || {}) }
    };
    metaStore.put(record);
    blobStore.put({ id, blob });
    await waitTransaction(tx);
    return record;
  } finally {
    db.close();
  }
};

export const listAudioStagingMetadata = async ({ mode = null, includeReleased = true } = {}) => {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, 'readonly');
    const rows = await waitRequest(tx.objectStore(META_STORE).getAll());
    return (rows || [])
      .filter(row => !mode || row?.mode === mode)
      .filter(row => includeReleased || row?.hasBlob)
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
  } finally {
    db.close();
  }
};

export const getAudioStagingMetadata = async id => {
  const db = await openDb();
  try {
    return await waitRequest(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(id));
  } finally {
    db.close();
  }
};

export const getAudioStagingBlob = async id => {
  const db = await openDb();
  try {
    const row = await waitRequest(db.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE).get(id));
    return row?.blob || null;
  } finally {
    db.close();
  }
};

export const patchAudioStagingMetadata = async (id, patch = {}) => {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    const previous = await waitRequest(store.get(id));
    if (!previous) {
      await waitTransaction(tx);
      return null;
    }
    const next = { ...previous, ...patch, updatedAt: Date.now(), metadata: { ...(previous.metadata || {}), ...(patch.metadata || {}) } };
    store.put(next);
    await waitTransaction(tx);
    return next;
  } finally {
    db.close();
  }
};

export const markAudioStagingExported = async (ids, { kind = 'zip', sessionId = null, filename = null } = {}) => {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))];
  if (!list.length) return [];
  const db = await openDb();
  const now = Date.now();
  const updated = [];
  try {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    for (const id of list) {
      const previous = await waitRequest(store.get(id));
      if (!previous) continue;
      const exportKey = kind === 'mp3' ? 'mp3ExportedAt' : 'zipExportedAt';
      const next = {
        ...previous,
        [exportKey]: now,
        lastExportKind: kind,
        lastExportFilename: filename || previous.lastExportFilename || null,
        lastExportSessionId: sessionId || previous.lastExportSessionId || null,
        updatedAt: now
      };
      store.put(next);
      updated.push(next);
    }
    await waitTransaction(tx);
    return updated;
  } finally {
    db.close();
  }
};

const objectUrlCache = new Map();
const touchCache = id => {
  const entry = objectUrlCache.get(id);
  if (!entry) return;
  objectUrlCache.delete(id);
  objectUrlCache.set(id, entry);
};
const trimCache = () => {
  while (objectUrlCache.size > HOT_CACHE_LIMIT) {
    const [id, entry] = objectUrlCache.entries().next().value || [];
    if (!id) break;
    try { URL.revokeObjectURL(entry.url); } catch { /* noop */ }
    objectUrlCache.delete(id);
  }
};

export const getAudioStagingObjectUrl = async stagingRecordOrId => {
  const id = typeof stagingRecordOrId === 'string' ? stagingRecordOrId : stagingRecordOrId?.id;
  if (!id) return null;
  const cached = objectUrlCache.get(id);
  if (cached?.url) {
    touchCache(id);
    return cached.url;
  }
  const blob = await getAudioStagingBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, { url, createdAt: Date.now() });
  trimCache();
  return url;
};

export const clearAudioStagingRuntimeCache = () => {
  objectUrlCache.forEach(entry => {
    try { if (entry?.url) URL.revokeObjectURL(entry.url); } catch { /* noop */ }
  });
  objectUrlCache.clear();
};

export const releaseAudioStagingBlobs = async (ids, { reason = 'manual-release' } = {}) => {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))];
  if (!list.length) return 0;
  const db = await openDb();
  let released = 0;
  try {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const blobStore = tx.objectStore(BLOB_STORE);
    for (const id of list) {
      const previous = await waitRequest(metaStore.get(id));
      if (!previous?.hasBlob) continue;
      blobStore.delete(id);
      metaStore.put({ ...previous, hasBlob: false, status: 'released', releaseReason: reason, releasedAt: Date.now(), updatedAt: Date.now() });
      const cached = objectUrlCache.get(id);
      if (cached?.url) {
        try { URL.revokeObjectURL(cached.url); } catch { /* noop */ }
        objectUrlCache.delete(id);
      }
      released += 1;
    }
    await waitTransaction(tx);
    return released;
  } finally {
    db.close();
  }
};

export const clearAudioStagingForMode = async (mode = 'table', { clearHistory = false } = {}) => {
  const rows = await listAudioStagingMetadata({ mode, includeReleased: true });
  if (!rows.length) return { released: 0, deletedMetadata: 0 };
  const ids = rows.map(row => row.id);
  if (!clearHistory) return { released: await releaseAudioStagingBlobs(ids, { reason: 'clear-mode-staging' }), deletedMetadata: 0 };
  const db = await openDb();
  try {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const blobStore = tx.objectStore(BLOB_STORE);
    ids.forEach(id => { metaStore.delete(id); blobStore.delete(id); });
    await waitTransaction(tx);
    clearAudioStagingRuntimeCache();
    return { released: ids.length, deletedMetadata: ids.length };
  } finally {
    db.close();
  }
};

export const saveAudioBatchSession = async session => {
  if (!session?.id) throw new Error('Batch Session requires an id.');
  const db = await openDb();
  try {
    const tx = db.transaction(BATCH_STORE, 'readwrite');
    const store = tx.objectStore(BATCH_STORE);
    const previous = await waitRequest(store.get(session.id));
    const now = Date.now();
    const next = {
      ...(previous || {}),
      ...session,
      mode: session.mode || previous?.mode || 'table',
      createdAt: previous?.createdAt || session.createdAt || now,
      updatedAt: now
    };
    store.put(next);
    await waitTransaction(tx);
    return next;
  } finally {
    db.close();
  }
};

export const listAudioBatchSessions = async ({ mode = null } = {}) => {
  const db = await openDb();
  try {
    const rows = await waitRequest(db.transaction(BATCH_STORE, 'readonly').objectStore(BATCH_STORE).getAll());
    return (rows || [])
      .filter(row => !mode || row?.mode === mode)
      .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  } finally {
    db.close();
  }
};

export const deleteAudioBatchSession = async id => {
  const db = await openDb();
  try {
    const tx = db.transaction(BATCH_STORE, 'readwrite');
    tx.objectStore(BATCH_STORE).delete(id);
    await waitTransaction(tx);
    return true;
  } finally {
    db.close();
  }
};

export const getAudioOriginStorageEstimate = async () => {
  try {
    if (!navigator?.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    const usage = Number(estimate?.usage || 0);
    const quota = Number(estimate?.quota || 0);
    return { usage, quota, available: Math.max(0, quota - usage), ratio: quota > 0 ? usage / quota : 0 };
  } catch {
    return null;
  }
};

export const requestPersistentAudioStorage = async () => {
  try {
    if (!navigator?.storage?.persist) return false;
    return Boolean(await navigator.storage.persist());
  } catch {
    return false;
  }
};

const batchRequestedSpecMatchesRecord = (record, spec) => {
  if (!record?.mapKey || record.mapKey !== spec?.mapKey) return false;
  const wantedVoice = lower(spec?.voiceId || spec?.requiredVoiceId);
  if (!wantedVoice) return true;
  return lower(record?.voiceId) === wantedVoice;
};

export const recoverInterruptedAudioBatchSessions = async ({ mode = 'table' } = {}) => {
  const [sessions, staging] = await Promise.all([
    listAudioBatchSessions({ mode }),
    listAudioStagingMetadata({ mode, includeReleased: true })
  ]);
  const recovered = [];
  for (const session of sessions) {
    const requestedSpecs = Array.isArray(session?.requestedSpecs) ? session.requestedSpecs : [];
    const relevant = requestedSpecs.length
      ? staging.filter(record => requestedSpecs.some(spec => batchRequestedSpecMatchesRecord(record, spec)))
      : staging.filter(record => session?.audioIds?.includes?.(record.id));
    const active = relevant.filter(record => record?.hasBlob);
    const wasInterrupted = String(session?.status || '').startsWith('running');
    const next = {
      ...session,
      audioIds: [...new Set([...(session?.audioIds || []), ...relevant.map(record => record.id)])],
      stagedCount: active.length,
      stagedBytes: active.reduce((sum, record) => sum + Number(record?.size || 0), 0),
      ...(wasInterrupted ? {
        status: 'interrupted-recovered',
        recoveredAt: Date.now(),
        recoveredStagedCount: active.length
      } : {})
    };
    const changed = wasInterrupted || next.audioIds.length !== (session?.audioIds || []).length || Number(next.stagedCount || 0) !== Number(session?.stagedCount || 0) || Number(next.stagedBytes || 0) !== Number(session?.stagedBytes || 0);
    recovered.push(changed ? await saveAudioBatchSession(next) : session);
  }
  return recovered.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
};

export const clearAudioStagingExportHistoryForMode = async (mode = 'table') => {
  const rows = await listAudioStagingMetadata({ mode, includeReleased: true });
  if (!rows.length) return 0;
  const db = await openDb();
  let cleared = 0;
  try {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    for (const row of rows) {
      if (!(row?.mp3ExportedAt || row?.zipExportedAt || row?.lastExportKind || row?.lastExportFilename || row?.lastExportSessionId)) continue;
      const next = { ...row };
      delete next.mp3ExportedAt;
      delete next.zipExportedAt;
      delete next.lastExportKind;
      delete next.lastExportFilename;
      delete next.lastExportSessionId;
      next.updatedAt = Date.now();
      store.put(next);
      cleared += 1;
    }
    await waitTransaction(tx);
    return cleared;
  } finally {
    db.close();
  }
};
