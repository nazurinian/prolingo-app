import { normalizeAudioVocabIdentity } from '../../utils/audioUtils';

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
  silent = false
}) => {
    const files = e.target.files;
    if (!files) return;
    let count = 0;

    if (mode === 'table') {
        Object.values(localAudioMapTable).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        let orphanCount = 0;
        let audioFileCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;
            audioFileCount++;

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
            if (!type) continue;

            const stableMatch = file.name.match(/^([A-Za-z][A-Za-z0-9_-]*?_\d+)_/);
            const numericMatch = file.name.match(/^(\d+)_/);
            let matchedItem = null;

            // Preferred path: VOCAB_ID prefix. New filenames may compact only the
            // trailing numeric part to 4 digits (LEGACY_000001 -> LEGACY_0001),
            // while the canonical CSV VOCAB_ID remains unchanged.
            if (stableMatch) {
                const fileVocabId = stableMatch[1].toUpperCase();
                const compactFileVocabId = normalizeAudioVocabIdentity(fileVocabId);
                const exactMatches = playlist.filter(item => item.isStructured && getVocabIdentity(item) === fileVocabId);
                if (exactMatches.length === 1) {
                    matchedItem = exactMatches[0];
                } else if (!matchedItem) {
                    const compactMatches = playlist.filter(item =>
                        item.isStructured && normalizeAudioVocabIdentity(getVocabIdentity(item)) === compactFileVocabId
                    );
                    // Never guess if two canonical IDs collapse to the same compact alias.
                    if (compactMatches.length === 1) matchedItem = compactMatches[0];
                }
            }
            // Backward compatibility: old numeric-prefix files still use permanent NO.
            if (!matchedItem && numericMatch) {
                const audioNo = Number.parseInt(numericMatch[1], 10);
                matchedItem = playlist.find(item => item.isStructured && getRecordAudioNo(item) === audioNo) || null;
            }

            if (matchedItem) {
                const identity = getStableAudioIdentity(matchedItem);
                newMap[`${identity}_${type}`] = URL.createObjectURL(file);
                count++;
            } else {
                orphanCount++;
            }
        }

        setLocalAudioMapTable(newMap);
        setAudioStatusTable(count > 0 ? 'success' : 'empty');
        if (!silent) alert(`[Table] Audio scan: ${audioFileCount} file. Matched: ${count}. Orphan/unmatched: ${orphanCount}.\nVOCAB_ID adalah pengenal filename utama; prefix NO lama tetap didukung.`);
        e.target.value = '';
        return { mode: 'table', matchedCount: count, audioFileCount, orphanCount };
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

