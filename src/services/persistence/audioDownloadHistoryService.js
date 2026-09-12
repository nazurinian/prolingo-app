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

export const recordAudioDownloadHistory = (history, records) => {
  const next = { ...(history || {}) };
  (Array.isArray(records) ? records : [records]).filter(Boolean).forEach(record => {
    const mode = record.mode || 'table';
    const mapKey = record.mapKey;
    if (!mapKey) return;
    next[`${mode}:${mapKey}`] = {
      mode,
      mapKey,
      part: record.part || null,
      engine: record.engine || null,
      voice: record.voice || null,
      filename: record.filename || null,
      delivery: record.delivery || 'browser-download',
      deliveredAt: record.deliveredAt || Date.now()
    };
  });
  return next;
};

export const clearAudioDownloadHistoryForMode = (history, mode = 'table') => {
  const prefix = `${mode}:`;
  return Object.fromEntries(Object.entries(history || {}).filter(([key]) => !String(key).startsWith(prefix)));
};
