export const AUDIO_DOWNLOAD_HISTORY_KEY = 'prolingo_audio_download_history_v1';

export const loadAudioDownloadHistory = () => {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(AUDIO_DOWNLOAD_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const persistAudioDownloadHistory = history => {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(AUDIO_DOWNLOAD_HISTORY_KEY, JSON.stringify(history || {}));
  } catch (error) {
    console.warn('Unable to persist audio download history:', error);
  }
};

const clean = value => String(value ?? '').trim();
const upper = value => clean(value).toUpperCase();

const scopedHistoryKey = record => {
  const mode = record?.mode || 'table';
  const mapKey = clean(record?.mapKey);
  if (!mapKey) return null;
  const vocabId = upper(record?.vocabId);
  const bookId = upper(record?.bookId);
  if (mode === 'table' && (vocabId || bookId)) return `${mode}:${bookId || '_'}:${vocabId || '_'}:${mapKey}`;
  return `${mode}:${mapKey}`;
};

export const getAudioDownloadHistoryRecord = (history, reference) => {
  const exactKey = scopedHistoryKey(reference);
  if (exactKey && history?.[exactKey]) return history[exactKey];
  const legacyKey = `${reference?.mode || 'table'}:${clean(reference?.mapKey)}`;
  const legacy = history?.[legacyKey] || null;
  if (!legacy) return null;
  // Legacy/unscoped Table history is ambiguous because mapKey is NO-based.
  if ((reference?.mode || 'table') === 'table' && (reference?.vocabId || reference?.bookId)) {
    const sameVocab = upper(legacy?.vocabId) && upper(legacy?.vocabId) === upper(reference?.vocabId);
    const sameBook = upper(legacy?.bookId) && upper(legacy?.bookId) === upper(reference?.bookId);
    return sameVocab || sameBook ? legacy : null;
  }
  return legacy;
};

export const recordAudioDownloadHistory = (history, records) => {
  const next = { ...(history || {}) };
  (Array.isArray(records) ? records : [records]).filter(Boolean).forEach(record => {
    const mode = record.mode || 'table';
    const mapKey = record.mapKey;
    if (!mapKey) return;
    const key = scopedHistoryKey({ ...record, mode, mapKey });
    if (!key) return;
    const previous = next[key] || {};
    const deliveredAt = record.deliveredAt || Date.now();
    const delivery = record.delivery || 'browser-download';
    const lowerDelivery = String(delivery).toLowerCase();
    next[key] = {
      ...previous,
      mode,
      mapKey,
      vocabId: record.vocabId || previous.vocabId || null,
      bookId: record.bookId || previous.bookId || null,
      displayId: record.displayId ?? previous.displayId ?? null,
      part: record.part || previous.part || null,
      engine: record.engine || previous.engine || null,
      voice: record.voice || previous.voice || null,
      filename: record.filename || previous.filename || null,
      delivery,
      deliveredAt,
      mp3ExportedAt: lowerDelivery.includes('mp3') ? deliveredAt : (previous.mp3ExportedAt || null),
      zipExportedAt: (lowerDelivery.includes('zip') || lowerDelivery.includes('package')) ? deliveredAt : (previous.zipExportedAt || null)
    };
  });
  return next;
};

export const clearAudioDownloadHistoryForMode = (history, mode = 'table') => {
  const prefix = `${mode}:`;
  return Object.fromEntries(Object.entries(history || {}).filter(([key]) => !String(key).startsWith(prefix)));
};

// C3.4.6: source detach / manual coverage reset must be durable immediately.
// Do not rely only on React's later persistence effect because a refresh/navigation
// can happen before that effect commits. This helper touches only ProLingo's audio
// delivery-history key; cookies, login state, datasets and other localStorage keys
// are intentionally untouched.
export const clearPersistedAudioDownloadHistoryForMode = (mode = 'table') => {
  const current = loadAudioDownloadHistory();
  const next = clearAudioDownloadHistoryForMode(current, mode);
  persistAudioDownloadHistory(next);
  return next;
};
