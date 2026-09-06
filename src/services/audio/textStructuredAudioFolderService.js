import { parseTextStructuredGeneratedFilename } from '../../domain/text/textStructuredAudioGenerationDomain.js';

const DB_NAME = 'prolingo_text_structured_audio_folder_v1';
const STORE = 'handles';
const HANDLE_KEY = 'structured-audio-folder';

const openDb = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available.'));
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Failed to open structured audio folder database.'));
});

const readHandle = async () => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read structured audio folder handle.'));
    });
  } finally { db.close(); }
};

const saveHandle = async handle => {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to remember structured audio folder.'));
      tx.onabort = () => reject(tx.error || new Error('Structured audio folder save aborted.'));
    });
  } finally { db.close(); }
};

const permission = async (handle, request = false) => {
  if (!handle) return 'denied';
  try {
    const current = typeof handle.queryPermission === 'function'
      ? await handle.queryPermission({ mode: 'readwrite' })
      : 'prompt';
    if (current === 'granted' || !request) return current;
    return typeof handle.requestPermission === 'function'
      ? await handle.requestPermission({ mode: 'readwrite' })
      : 'denied';
  } catch { return 'denied'; }
};

const supported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';

const collectFiles = async directoryHandle => {
  const files = [];
  const walk = async dir => {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') files.push(await entry.getFile());
      else if (entry.kind === 'directory') await walk(entry);
    }
  };
  await walk(directoryHandle);
  return files;
};

export const scanTextStructuredAudioFolderFiles = ({ files, audioVariants }) => {
  const variants = new Map((Array.isArray(audioVariants) ? audioVariants : []).map(variant => [String(variant?.id || '').toUpperCase(), variant]));
  const matches = [];
  const orphans = [];
  (Array.from(files || [])).forEach(file => {
    const parsed = parseTextStructuredGeneratedFilename(file?.name);
    if (!parsed) return;
    const variant = variants.get(parsed.audioVariantId);
    if (!variant) {
      orphans.push({ file, parsed, reason: 'missing-metadata' });
      return;
    }
    if (String(variant.segmentId || '').toUpperCase() !== parsed.segmentId || String(variant.channel || '').toLowerCase() !== parsed.channel) {
      orphans.push({ file, parsed, reason: 'identity-mismatch' });
      return;
    }
    matches.push({ file, parsed, variant });
  });
  return { matches, orphans };
};

export const executeTextStructuredAudioFolderChoose = async () => {
  if (!supported()) return { status: 'unsupported', handle: null };
  try {
    const handle = await window.showDirectoryPicker({ id: 'prolingo-text-structured-audio', mode: 'readwrite', startIn: 'music' });
    const granted = await permission(handle, true);
    if (granted !== 'granted') return { status: 'permission-denied', handle: null };
    await saveHandle(handle);
    return { status: 'selected', handle, name: handle.name };
  } catch (error) {
    if (error?.name === 'AbortError') return { status: 'cancelled', handle: null };
    return { status: 'error', handle: null, error };
  }
};

export const executeTextStructuredAudioFolderRestore = async () => {
  if (!supported()) return { status: 'unsupported', handle: null };
  try {
    const handle = await readHandle();
    if (!handle) return { status: 'none', handle: null };
    const granted = await permission(handle, false);
    if (granted !== 'granted') return { status: 'reconnect-required', handle: null, rememberedHandle: handle, name: handle.name };
    return { status: 'restored', handle, name: handle.name };
  } catch (error) {
    return { status: 'error', handle: null, error };
  }
};

export const executeTextStructuredAudioFolderReconnect = async rememberedHandle => {
  if (!rememberedHandle) return executeTextStructuredAudioFolderChoose();
  const granted = await permission(rememberedHandle, true);
  if (granted !== 'granted') return { status: 'permission-denied', handle: null };
  await saveHandle(rememberedHandle);
  return { status: 'reconnected', handle: rememberedHandle, name: rememberedHandle.name };
};

export const readTextStructuredAudioFolderFiles = collectFiles;

export const writeTextStructuredAudioFile = async ({ directoryHandle, filename, blob }) => {
  if (!directoryHandle) return { status: 'no-folder' };
  const granted = await permission(directoryHandle, false);
  if (granted !== 'granted') return { status: 'permission-required' };
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return { status: 'written', filename };
};
