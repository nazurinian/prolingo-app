import { parseTextStructuredGeneratedFilename } from '../../domain/text/textStructuredAudioGenerationDomain.js';
import {
  buildTextStructuredExternalAudioIdentityIndex,
  parseTextStructuredLegacyAudioFilename,
  resolveTextStructuredExternalAudioVariant
} from './textStructuredAudioExternalIdentityService.js';

const DB_NAME = 'prolingo_text_structured_audio_folder_v1';
const STORE = 'handles';
const HANDLE_KEY = 'structured-audio-folder';

const FOLDER_OBJECT_URL_CACHE_LIMIT = 12;
const folderObjectUrlCache = new Map();

const folderCacheKey = runtime => String(
  runtime?.folderCacheKey
  || [runtime?.filename, runtime?.folderFile?.size, runtime?.folderFile?.lastModified].filter(value => value !== undefined && value !== null).join('|')
  || runtime?.variantId
  || ''
);

const touchFolderCache = key => {
  const entry = folderObjectUrlCache.get(key);
  if (!entry) return;
  folderObjectUrlCache.delete(key);
  folderObjectUrlCache.set(key, entry);
};

const trimFolderCache = () => {
  while (folderObjectUrlCache.size > FOLDER_OBJECT_URL_CACHE_LIMIT) {
    const [key, entry] = folderObjectUrlCache.entries().next().value || [];
    if (!key) break;
    try { if (entry?.url) URL.revokeObjectURL(entry.url); } catch {}
    folderObjectUrlCache.delete(key);
  }
};

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

export const scanTextStructuredAudioFolderFiles = ({ files, audioVariants, segments = [] }) => {
  const index = buildTextStructuredExternalAudioIdentityIndex({ audioVariants, segments });
  const matches = [];
  const orphans = [];
  const legacy = [];
  (Array.from(files || [])).forEach(file => {
    const parsed = parseTextStructuredGeneratedFilename(file?.name);
    if (!parsed) {
      const legacyParsed = parseTextStructuredLegacyAudioFilename(file?.name);
      if (legacyParsed) legacy.push({ file, parsed: legacyParsed, reason: 'legacy-unresolved' });
      return;
    }
    const resolved = resolveTextStructuredExternalAudioVariant({ filename: file?.name, parsed, index });
    if (resolved.status !== 'matched' || !resolved.variant) {
      orphans.push({ file, parsed, reason: resolved.status });
      return;
    }
    matches.push({ file, parsed, variant: resolved.variant, aliasMatched: resolved.aliasMatched });
  });
  return { matches, orphans, legacy };
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
  const file = await fileHandle.getFile();
  return { status: 'written', filename, file, fileHandle };
};

export const clearTextStructuredAudioFolderRuntimeCache = () => {
  folderObjectUrlCache.forEach(entry => {
    try { if (entry?.url) URL.revokeObjectURL(entry.url); } catch {}
  });
  folderObjectUrlCache.clear();
};

export const readTextStructuredAudioFolderRuntimeBlob = async runtime => {
  if (runtime?.folderFile instanceof Blob) return runtime.folderFile;
  if (runtime?.folderFileHandle && typeof runtime.folderFileHandle.getFile === 'function') return runtime.folderFileHandle.getFile();
  throw new Error('Text Folder audio entry is missing its lazy file reference. Reconnect/rescan the Audio Folder.');
};

export const getTextStructuredAudioFolderRuntimeObjectUrl = async runtime => {
  const key = folderCacheKey(runtime);
  if (!key) throw new Error('Text Folder audio entry has no cache identity.');
  const cached = folderObjectUrlCache.get(key);
  if (cached?.url) {
    touchFolderCache(key);
    return cached.url;
  }
  const blob = await readTextStructuredAudioFolderRuntimeBlob(runtime);
  const url = URL.createObjectURL(blob);
  folderObjectUrlCache.set(key, { url, createdAt: Date.now() });
  trimFolderCache();
  return url;
};
