import { sha256Hex, canonicalJsonStringify } from '../../domain/text/textCanonicalFingerprintDomain.js';
import { bookAudioError } from '../../domain/text/bookQaAudioDomain.js';
import { assertDisposableQaDatabaseName } from './textContentUnitPersistenceService.js';
import { initializeAudioStagingV1Stores, AUDIO_STAGING_DB_VERSION } from './audioStagingIndexedDbService.js';
import { digestBookAudioBytes } from '../audio/bookQaAudioBytes.js';

const PREFIX = 'prolingo_book_qa_audio_staging_v1__';
const META = 'audioMeta', BYTES = 'audioBlob', JOBS = 'batchSessions';
export const deriveBookQaAudioStagingName = library => {
  if (typeof library !== 'string' || library !== assertDisposableQaDatabaseName(library)) {
    throw bookAudioError('INVALID_DATABASE_NAME', 'Staging requires the exact validated Book QA library name');
  }
  return PREFIX + sha256Hex(library);
};

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const createBookQaAudioStaging = (library, assertConnected) => {
  const name = deriveBookQaAudioStagingName(library);
  const prefix = name.slice(PREFIX.length);
  const assetId = fingerprint => prefix + '|' + fingerprint;
  const open = () => {
    assertConnected();
    const request = indexedDB.open(name, AUDIO_STAGING_DB_VERSION);
    request.onupgradeneeded = () => initializeAudioStagingV1Stores(request.result);
    return requestResult(request);
  };
  const transact = async (stores, mode, action) => {
    const db = await open();
    try {
      assertConnected();
      const tx = db.transaction(stores, mode);
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || bookAudioError('AUDIO_STAGE_ABORT', 'Staging transaction was aborted'));
      });
      // Attach before any request can abort the transaction.
      done.catch(() => {});
      try {
        const result = await action(tx);
        await done;
        return result;
      } catch (error) {
        try { tx.abort(); } catch { /* transaction already settled */ }
        await done.catch(() => {});
        throw error;
      }
    } finally { db.close(); }
  };
  const rowFor = job => ({ ...job, mode: 'book-qa', library });
  return {
    name,
    async stage(job, assets) {
      return transact([META, BYTES, JOBS], 'readwrite', async tx => {
        const meta = tx.objectStore(META), bytes = tx.objectStore(BYTES), jobs = tx.objectStore(JOBS);
        if (await requestResult(jobs.get(job.id))) throw bookAudioError('AUDIO_OPERATION_EXISTS', 'This audio operation already exists');
        for (const { fingerprint, binary, blob } of assets) {
          assertConnected();
          const id = assetId(fingerprint);
          const previous = await requestResult(meta.get(id));
          if (previous) {
            if (previous.library !== library || canonicalJsonStringify(previous.binary) !== canonicalJsonStringify(binary)) {
              throw bookAudioError('AUDIO_BYTE_CONFLICT', 'This render identity already owns different bytes');
            }
            // Validate the durable stored bytes after completion before committing Text.
            continue;
          }
          const wrapped = new Blob([blob], { type: binary.format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
          meta.add({ id, mode: 'book-qa', library, mapKey: fingerprint, binary, size: binary.bytes, hasBlob: true,
            batchSessionId: job.id, mimeType: wrapped.type });
          bytes.add({ id, blob: wrapped });
        }
        jobs.add(rowFor(job));
      });
    },
    listJobs: () => transact([JOBS], 'readonly', tx => requestResult(tx.objectStore(JOBS).getAll())),
    saveJob: job => transact([JOBS], 'readwrite', tx => requestResult(tx.objectStore(JOBS).put(rowFor(job)))),
    async read(fingerprint, expected) {
      const id = assetId(fingerprint);
      const { meta, bytes } = await transact([META, BYTES], 'readonly', async tx => {
        const [meta, bytes] = await Promise.all([
          requestResult(tx.objectStore(META).get(id)),
          requestResult(tx.objectStore(BYTES).get(id))
        ]);
        return { meta, bytes };
      });
      if (!meta && !bytes) return { status: 'metadata-only' };
      const blob = bytes?.blob;
      if (meta?.library !== library || meta.mapKey !== fingerprint || !(blob instanceof Blob) || blob.size !== expected.bytes
        || canonicalJsonStringify(meta.binary) !== canonicalJsonStringify(expected)
        || await digestBookAudioBytes(await blob.arrayBuffer()) !== expected.digest) return { status: 'corrupt' };
      return { status: 'ready', id, blob };
    }
  };
};
