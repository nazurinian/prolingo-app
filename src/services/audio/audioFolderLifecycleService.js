import { getAudioVoiceFilenameLabel, normalizeAudioVocabIdentity } from '../../utils/audioUtils.js';

const FOLDER_OBJECT_URL_CACHE_LIMIT = 12;
const tableFolderObjectUrlCache = new Map();

const folderCacheKey = variant => {
  const file = variant?.file;
  return [
    String(variant?.sourceId || 'active-folder'),
    String(variant?.mapKey || ''),
    String(variant?.voiceId || ''),
    String(file?.name || variant?.filename || ''),
    Number(file?.size || 0),
    Number(file?.lastModified || 0)
  ].join('|');
};

const touchFolderObjectUrlCache = key => {
  const entry = tableFolderObjectUrlCache.get(key);
  if (!entry) return;
  tableFolderObjectUrlCache.delete(key);
  tableFolderObjectUrlCache.set(key, entry);
};

const trimFolderObjectUrlCache = () => {
  while (tableFolderObjectUrlCache.size > FOLDER_OBJECT_URL_CACHE_LIMIT) {
    const [key, entry] = tableFolderObjectUrlCache.entries().next().value || [];
    if (!key) break;
    try { if (entry?.url) URL.revokeObjectURL(entry.url); } catch { /* noop */ }
    tableFolderObjectUrlCache.delete(key);
  }
};

export const clearTableAudioFolderRuntimeCache = () => {
  tableFolderObjectUrlCache.forEach(entry => {
    try { if (entry?.url) URL.revokeObjectURL(entry.url); } catch { /* noop */ }
  });
  tableFolderObjectUrlCache.clear();
};

export const getTableAudioFolderVariantObjectUrl = async variant => {
  const file = variant?.file;
  if (!(file instanceof Blob)) throw new Error('Folder audio variant is missing its File/Blob reference.');
  const key = folderCacheKey(variant);
  const cached = tableFolderObjectUrlCache.get(key);
  if (cached?.url) {
    touchFolderObjectUrlCache(key);
    return cached.url;
  }
  const url = URL.createObjectURL(file);
  tableFolderObjectUrlCache.set(key, { url, createdAt: Date.now() });
  trimFolderObjectUrlCache();
  return url;
};

export const buildTableAudioVocabIdentityIndex = ({ playlist, getVocabIdentity }) => {
  const index = new Map();
  (playlist || []).forEach(item => {
    if (!item?.isStructured) return;
    const canonical = String(getVocabIdentity(item) || '').trim().toUpperCase();
    if (!canonical) return;
    const aliases = new Set([canonical, normalizeAudioVocabIdentity(canonical)]);
    aliases.forEach(alias => {
      if (!alias) return;
      if (!index.has(alias)) index.set(alias, item);
      else if (index.get(alias) !== item) index.set(alias, null);
    });
  });
  return index;
};

export const resolveTableAudioItemByVocabPrefix = ({ fileName, identityIndex }) => {
  const upper = String(fileName || '').trim().toUpperCase();
  if (!upper || !identityIndex?.size) return null;
  let matchedItem = null;
  let underscore = upper.indexOf('_');
  while (underscore > 0) {
    const prefix = upper.slice(0, underscore);
    if (identityIndex.has(prefix)) {
      const candidate = identityIndex.get(prefix);
      // Longest valid known VOCAB_ID prefix wins. Colliding compact aliases
      // are stored as null and therefore fail closed instead of guessing.
      if (candidate) matchedItem = candidate;
    }
    underscore = upper.indexOf('_', underscore + 1);
  }
  return matchedItem;
};

export const resolveTableAudioVoiceFromFilename = ({ fileName, part, edgeVoices = [] }) => {
  const base = String(fileName || '').replace(/\.(wav|mp3|ogg|webm)$/i, '').toLowerCase();
  const partToken = String(part || '').trim().toLowerCase();
  if (!base || !partToken) return null;
  const voices = [...(Array.isArray(edgeVoices) ? edgeVoices : [])].sort((a, b) => String(getAudioVoiceFilenameLabel(b?.id || '')).length - String(getAudioVoiceFilenameLabel(a?.id || '')).length);
  const matched = voices.find(voice => {
    const token = String(getAudioVoiceFilenameLabel(voice?.id || '')).toLowerCase();
    return token && base.endsWith(`_${token}_${partToken}`);
  });
  return matched?.id || null;
};

export const resolveTableAudioPartFromFilename = (fileName) => {
  const lowerName = String(fileName || '').toLowerCase();
  let type = null;
  const expTypeMatch = lowerName.match(/(?:_|-)(exp[1-5]_(?:en|idn))\.(wav|mp3|ogg|webm)$/i);
  if (expTypeMatch) type = expTypeMatch[1].toLowerCase();
  else if (/(?:_|-)(word_idn|word-?idn|word_meaning|arti_kata)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'word_idn';
  else if (/(?:_|-)(word|kata)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'word';
  else if (/(?:_|-)(sentence|sent|kalimat)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'sentence';
  else if (/(?:_|-)(meaning|mean|arti)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'meaning';
  else if (lowerName.includes('_word_idn.') || lowerName.includes('_arti_kata.')) type = 'word_idn';
  else if (lowerName.includes('_word.') || lowerName.includes('_kata.')) type = 'word';
  else if (lowerName.includes('_sentence.') || lowerName.includes('_kalimat.')) type = 'sentence';
  else if (lowerName.includes('_meaning.') || lowerName.includes('_arti.')) type = 'meaning';
  return type;
};

export const executeAudioFolderSelectService = ({
  e,
  mode,
  localAudioMapTable,
  localAudioMapText,
  playlist,
  getRecordAudioNo,
  getVocabIdentity,
  getStableAudioIdentity,
  setLocalAudioMapTable,
  setAudioStatusTable,
  setLocalAudioMapText,
  setAudioStatusText,
  silent = false,
  onMatchedAudio = null,
  edgeVoices = []
}) => {
    const files = e.target.files;
    if (!files) return;
    let count = 0;

    if (mode === 'table') {
        Object.values(localAudioMapTable).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        const variantRecords = [];
        const tableAudioIdentityIndex = buildTableAudioVocabIdentityIndex({ playlist, getVocabIdentity });
        let orphanCount = 0;
        let audioFileCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;
            audioFileCount++;

            const type = resolveTableAudioPartFromFilename(file.name);
            if (!type) continue;

            const numericMatch = file.name.match(/^(\d+)_/);
            // Preferred path: resolve the longest known VOCAB_ID prefix from the
            // loaded playlist. This supports compound IDs such as
            // ELFAST_01_0001 / VOCAB1_03_0001 / W1P1_14_0001 instead of
            // stopping at the first numeric block (for example ELFAST_01).
            let matchedItem = resolveTableAudioItemByVocabPrefix({
                fileName: file.name,
                identityIndex: tableAudioIdentityIndex
            });

            // Backward compatibility: old numeric-prefix files still use permanent NO.
            if (!matchedItem && numericMatch) {
                const audioNo = Number.parseInt(numericMatch[1], 10);
                matchedItem = playlist.find(item => item.isStructured && getRecordAudioNo(item) === audioNo) || null;
            }

            if (matchedItem) {
                const identity = getStableAudioIdentity(matchedItem);
                const mapKey = `${identity}_${type}`;
                const voice = resolveTableAudioVoiceFromFilename({ fileName: file.name, part: type, edgeVoices });
                // v5.13.0/R2: Folder is an indexed lazy source. Keep the File
                // reference only; do NOT allocate one ObjectURL for every audio
                // during scan. Playback creates a bounded on-demand URL via
                // getTableAudioFolderVariantObjectUrl().
                variantRecords.push({
                    sourceType: 'folder',
                    sourceId: 'active-folder',
                    mapKey,
                    part: type,
                    engine: voice ? 'edge' : null,
                    voiceId: voice,
                    voiceLabel: voice ? getAudioVoiceFilenameLabel(voice) : null,
                    filename: file.name,
                    file,
                    size: Number(file.size || 0),
                    verified: true,
                    deliveryStatus: 'folder-verified'
                });
                onMatchedAudio?.({
                    mode: 'table',
                    mapKey,
                    part: type,
                    engine: voice ? 'edge' : null,
                    voice,
                    filename: file.name,
                    verified: true,
                    deliveryStatus: 'folder-verified'
                });
                count++;
            } else {
                orphanCount++;
            }
        }

        setLocalAudioMapTable(newMap);
        setAudioStatusTable(count > 0 ? 'success' : 'empty');
        if (!silent) alert(`[Table] Audio scan: ${audioFileCount} file. Matched: ${count}. Orphan/unmatched: ${orphanCount}.\nVOCAB_ID adalah pengenal filename utama; prefix NO lama tetap didukung.`);
        e.target.value = '';
        return { mode: 'table', matchedCount: count, audioFileCount, orphanCount, variants: variantRecords };
    } else {
        Object.values(localAudioMapText).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        const validTextIds = new Set(playlist
            .filter(item => !item?.isStructured)
            .map(item => getStableAudioIdentity(item)));
        let audioFileCount = 0;
        let orphanCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;
            audioFileCount++;

            const textMatch = file.name.match(/^(TEXT_\d+)_/i);
            const numericMatch = file.name.match(/^(\d+)_/);
            let identity = textMatch ? textMatch[1].toUpperCase() : null;
            if (!identity && numericMatch) identity = `TEXT_${String(Number.parseInt(numericMatch[1], 10)).padStart(6, '0')}`;

            if (identity && validTextIds.has(identity)) {
                newMap[identity] = URL.createObjectURL(file);
                count++;
            } else {
                orphanCount++;
            }
        }
        setLocalAudioMapText(newMap);
        setAudioStatusText(count > 0 ? 'success' : 'empty');
        if (!silent) alert(`[Text] Audio scan: ${audioFileCount} file. Matched: ${count}. Orphan/unmatched: ${orphanCount}.`);
        e.target.value = '';
        return { mode: 'text', matchedCount: count, audioFileCount, orphanCount };
    }
};

const AUDIO_FOLDER_DB_NAME = 'prolingo_audio_folder_handles_v1';
const AUDIO_FOLDER_DB_STORE = 'handles';

const getRememberedAudioFolderKey = (mode) => `audio-folder-${mode === 'text' ? 'text' : 'table'}`;

const openAudioFolderHandleDb = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available.'));
        return;
    }

    const request = indexedDB.open(AUDIO_FOLDER_DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(AUDIO_FOLDER_DB_STORE)) {
            db.createObjectStore(AUDIO_FOLDER_DB_STORE);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open audio-folder database.'));
});

const readRememberedAudioFolderHandle = async (mode) => {
    const db = await openAudioFolderHandleDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(AUDIO_FOLDER_DB_STORE, 'readonly');
            const request = tx.objectStore(AUDIO_FOLDER_DB_STORE).get(getRememberedAudioFolderKey(mode));
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Failed to read remembered audio folder.'));
        });
    } finally {
        db.close();
    }
};

export const forgetRememberedAudioFolderHandle = async (mode) => {
    const db = await openAudioFolderHandleDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(AUDIO_FOLDER_DB_STORE, 'readwrite');
            tx.objectStore(AUDIO_FOLDER_DB_STORE).delete(getRememberedAudioFolderKey(mode));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to forget audio folder.'));
            tx.onabort = () => reject(tx.error || new Error('Audio-folder detach was aborted.'));
        });
    } finally {
        db.close();
    }
};

const saveRememberedAudioFolderHandle = async (mode, handle) => {
    const db = await openAudioFolderHandleDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(AUDIO_FOLDER_DB_STORE, 'readwrite');
            tx.objectStore(AUDIO_FOLDER_DB_STORE).put(handle, getRememberedAudioFolderKey(mode));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to remember audio folder.'));
            tx.onabort = () => reject(tx.error || new Error('Audio-folder save was aborted.'));
        });
    } finally {
        db.close();
    }
};

const queryAudioFolderReadPermission = async (handle) => {
    if (!handle || typeof handle.queryPermission !== 'function') return 'prompt';
    try {
        return await handle.queryPermission({ mode: 'read' });
    } catch {
        return 'prompt';
    }
};

const requestAudioFolderReadPermission = async (handle) => {
    if (!handle || typeof handle.requestPermission !== 'function') return 'denied';
    try {
        return await handle.requestPermission({ mode: 'read' });
    } catch {
        return 'denied';
    }
};

const collectAudioFolderFiles = async (directoryHandle) => {
    const fileHandles = [];

    const walk = async (dirHandle) => {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                fileHandles.push(entry);
            } else if (entry.kind === 'directory') {
                await walk(entry);
            }
        }
    };

    await walk(directoryHandle);
    return Promise.all(fileHandles.map(handle => handle.getFile()));
};

const isRememberedAudioFolderSupported = () => (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function' &&
    typeof indexedDB !== 'undefined'
);

export const executeRememberedAudioFolderOpenService = async ({
    mode,
    forcePicker = false,
    onFiles,
    fallbackOpen,
    addLog
}) => {
    if (!isRememberedAudioFolderSupported()) {
        fallbackOpen?.();
        return { status: 'legacy-fallback' };
    }

    try {
        let directoryHandle = forcePicker ? null : await readRememberedAudioFolderHandle(mode);

        if (directoryHandle) {
            let permission = await queryAudioFolderReadPermission(directoryHandle);
            if (permission !== 'granted') {
                permission = await requestAudioFolderReadPermission(directoryHandle);
            }

            if (permission === 'granted') {
                const files = await collectAudioFolderFiles(directoryHandle);
                const scanResult = await onFiles(files, directoryHandle.name, { remembered: true });
                if (scanResult?.stale) return { status: 'stale', name: directoryHandle.name, fileCount: files.length };
                const matchedSuffix = Number.isFinite(scanResult?.matchedCount) ? ` (${scanResult.matchedCount} matched)` : '';
                addLog?.('System', `Audio folder reconnected: ${directoryHandle.name}${matchedSuffix}`);
                return { status: 'reconnected', name: directoryHandle.name, fileCount: files.length, matchedCount: scanResult?.matchedCount };
            }
        }

        directoryHandle = await window.showDirectoryPicker({
            id: `prolingo-audio-${mode === 'text' ? 'text' : 'table'}`,
            mode: 'read',
            startIn: 'music'
        });
        await saveRememberedAudioFolderHandle(mode, directoryHandle);
        const files = await collectAudioFolderFiles(directoryHandle);
        const scanResult = await onFiles(files, directoryHandle.name, { remembered: false });
        if (scanResult?.stale) return { status: 'stale', name: directoryHandle.name, fileCount: files.length };
        const matchedSuffix = Number.isFinite(scanResult?.matchedCount) ? ` (${scanResult.matchedCount} matched)` : '';
        addLog?.('System', `Audio folder remembered: ${directoryHandle.name}${matchedSuffix}`);
        return { status: 'selected', name: directoryHandle.name, fileCount: files.length, matchedCount: scanResult?.matchedCount };
    } catch (error) {
        if (error?.name === 'AbortError') return { status: 'cancelled' };
        console.warn('Remembered audio folder failed; using legacy picker.', error);
        addLog?.('Warn', `Remember Audio Folder unavailable: ${error?.message || 'unknown error'}`);
        fallbackOpen?.();
        return { status: 'legacy-fallback', error };
    }
};

export const executeRememberedAudioFolderRestoreService = async ({
    mode,
    onFiles,
    addLog
}) => {
    if (!isRememberedAudioFolderSupported()) return { status: 'unsupported' };

    try {
        const directoryHandle = await readRememberedAudioFolderHandle(mode);
        if (!directoryHandle) return { status: 'none' };

        const permission = await queryAudioFolderReadPermission(directoryHandle);
        if (permission !== 'granted') {
            addLog?.('System', `Audio folder remembered (${directoryHandle.name}); reconnect required.`);
            return { status: 'reconnect-required', name: directoryHandle.name };
        }

        const files = await collectAudioFolderFiles(directoryHandle);
        const scanResult = await onFiles(files, directoryHandle.name, { remembered: true, automatic: true });
        if (scanResult?.stale) return { status: 'stale', name: directoryHandle.name, fileCount: files.length };
        const matchedSuffix = Number.isFinite(scanResult?.matchedCount) ? ` (${scanResult.matchedCount} matched)` : '';
        addLog?.('System', `Audio folder restored automatically: ${directoryHandle.name}${matchedSuffix}`);
        return { status: 'restored', name: directoryHandle.name, fileCount: files.length, matchedCount: scanResult?.matchedCount };
    } catch (error) {
        console.warn('Automatic audio-folder restore failed.', error);
        addLog?.('Warn', `Audio folder auto-restore failed: ${error?.message || 'unknown error'}`);
        return { status: 'error', error };
    }
};

