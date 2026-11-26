import { canonicalJsonStringify } from '../domain/text/textCanonicalFingerprintDomain.js';
import { BOOK_AUDIO_MAX_BYTES, BOOK_AUDIO_MAX_ITEMS, assertBookAudioCompatibleBytes, bookAudioCommitKey, bookAudioError,
  isBookAudioOperationId, readBookAudioBinding, resolveBookAudioTarget } from '../domain/text/bookQaAudioDomain.js';
import { validateBookAudioBytes } from './audio/bookQaAudioBytes.js';
import { createBookQaAudioStaging } from './persistence/bookQaAudioStagingService.js';
import { createDisposableBookAudioCommitter } from './persistence/textDataManagementPersistenceService.js';

const fail = (code, message) => { throw bookAudioError(code, message); };
const same = (left, right) => canonicalJsonStringify(left) === canonicalJsonStringify(right);
const operationMarker = ({ id, connectionId, library }) => ({ id, connectionId, library });
const markerFor = (loaded, job) => loaded.metaRecords.find(row => row.key === bookAudioCommitKey(job.id))?.value;
const checkCancelled = signal => {
  if (signal?.aborted) fail('AUDIO_CANCELLED', 'Audio operation was cancelled');
};
const errorCode = (error, status) => error?.code && typeof error.code === 'string' ? error.code
  : error?.name === 'QuotaExceededError' ? 'AUDIO_QUOTA'
    : status === 'uncertain' ? 'AUDIO_COMMIT_UNCERTAIN'
      : status === 'committed-unaccepted' ? 'AUDIO_READBACK_FAILED' : 'AUDIO_STAGE_FAILED';

export const createBookQaAudioSession = ({ library, loadState, getSnapshot, getRevision, publish, blockWrites, assertWritable }) => {
  const connectionId = crypto.randomUUID();
  const urls = new Map();
  let pending = false, disposed = false, touched = false;
  const assertCurrent = () => {
    if (disposed) fail('AUDIO_CONNECTION_CLOSED', 'The audio connection has ended');
  };
  const staging = createBookQaAudioStaging(library, assertCurrent);
  const commit = createDisposableBookAudioCommitter({ dbName: library, connectionId, assertCurrent });
  const guarded = async (run, signal) => {
    assertCurrent();
    if (pending) fail('AUDIO_BUSY', 'Another audio operation is active on this connection');
    if (typeof navigator.locks?.request !== 'function') fail('AUDIO_LOCK_UNAVAILABLE', 'Cross-tab audio locking is unavailable');
    pending = true;
    try {
      return await navigator.locks.request(staging.name, { mode: 'exclusive', ...(signal ? { signal } : {}) }, async () => {
        assertCurrent();
        checkCancelled(signal);
        touched = true;
        return run();
      });
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) checkCancelled(signal);
      throw error;
    } finally { pending = false; }
  };
  const verifyBindings = async (snapshot, entries, { allowStale = false } = {}) => {
    for (const { binary, ...entry } of entries) {
      const binding = readBookAudioBinding(snapshot, entry);
      if (allowStale && binding.status === 'stale') continue;
      if (binding.status !== 'bound' || !same(binding.binary, binary)
        || (await staging.read(entry.fingerprint, binary)).status !== 'ready') {
        fail('AUDIO_READBACK_FAILED', 'Committed audio binding or durable bytes failed verification');
      }
    }
    assertCurrent();
  };
  const recover = async () => {
    const loaded = await loadState();
    for (const job of await staging.listJobs()) {
      if (['committed', 'precommit-failed'].includes(job.status)) continue;
      if (job.library !== library || !isBookAudioOperationId(job.id) || !isBookAudioOperationId(job.connectionId)
        || !['provisional', 'committing', 'uncertain', 'committed-unaccepted'].includes(job.status)) {
        fail('INVALID_AUDIO_JOURNAL', 'Audio journal does not belong to this library');
      }
      const marker = markerFor(loaded, job);
      if (marker) {
        if (!same(marker, operationMarker(job))) fail('INVALID_AUDIO_JOURNAL', 'Text commit marker does not match the staging operation');
        await verifyBindings(loaded.snapshot, job.entries, { allowStale: true });
      } else if (job.status === 'committed-unaccepted') {
        fail('AUDIO_RECONCILIATION_REQUIRED', 'Known commit marker is missing from the authoritative Text library');
      }
      // No deletion, byte replacement, replay, or counter restoration on recovery.
      await staging.saveJob({ ...job, status: marker ? 'committed' : 'precommit-failed', reconciled: true });
    }
    assertCurrent();
    return loaded;
  };
  const submit = async (items, { signal } = {}) => {
    assertCurrent();
    assertWritable();
    checkCancelled(signal);
    if (!Array.isArray(items) || !items.length || items.length > BOOK_AUDIO_MAX_ITEMS) {
      fail('INVALID_AUDIO_REQUEST', 'An audio operation requires 1 to 32 entries');
    }
    let totalBytes = 0;
    const captured = items.map(item => {
      if (!(item?.blob instanceof Blob) || Object.keys(item).some(key => !['kind', 'target', 'fingerprint', 'descriptor', 'blob'].includes(key))) {
        fail('INVALID_AUDIO_REQUEST', 'Provide a typed target, render identity, and Blob');
      }
      const { blob, ...entry } = item;
      totalBytes += blob.size;
      return { ...structuredClone(entry), blob };
    });
    if (totalBytes > BOOK_AUDIO_MAX_BYTES) fail('INVALID_AUDIO_REQUEST', 'The operation exceeds the 64 MiB byte limit');
    const before = getSnapshot();
    const fingerprint = canonicalJsonStringify(before), revision = getRevision();
    return guarded(async () => {
      let initial;
      try { initial = await recover(); }
      catch (error) { blockWrites(); throw error; }
      if (initial.snapshotFingerprint !== fingerprint) {
        blockWrites();
        fail('STALE_RESULT', 'Audio operation was captured against an older library snapshot');
      }
      const entries = [], assets = new Map();
      for (const { blob, ...entry } of captured) {
        const owner = resolveBookAudioTarget(before, entry);
        for (const input of owner.dependencies ?? []) {
          if ((await staging.read(input.fingerprint, input.binary)).status !== 'ready') {
            fail('INVALID_AUDIO_COMPOSITION', 'A referenced composition input is unavailable');
          }
        }
        const binary = await validateBookAudioBytes(blob, owner.format);
        checkCancelled(signal);
        assertBookAudioCompatibleBytes(before, entry.fingerprint, binary);
        const prior = assets.get(entry.fingerprint);
        if (prior && !same(prior.binary, binary)) fail('AUDIO_BYTE_CONFLICT', 'Operation supplies conflicting bytes for the same render identity');
        assets.set(entry.fingerprint, { fingerprint: entry.fingerprint, binary, blob });
        entries.push({ ...entry, binary });
      }
      const job = { id: crypto.randomUUID(), library, connectionId, status: 'provisional', createdAt: Date.now(), entries, revision };
      let phase = 'staging', receipt;
      try {
        await staging.stage(job, assets.values());
        phase = 'provisional';
        for (const { fingerprint: key, binary } of assets.values()) {
          if ((await staging.read(key, binary)).status !== 'ready') fail('AUDIO_READBACK_FAILED', 'Staged bytes failed durable readback');
        }
        checkCancelled(signal);
        await staging.saveJob({ ...job, status: 'committing' });
        checkCancelled(signal);
        phase = 'committing';
        receipt = await commit(job, { signal, fingerprint, revision });
        phase = 'committed-unaccepted';
        assertCurrent();
        const loaded = await loadState();
        if (!receipt.ok || receipt.authoritative !== true || receipt.dbName !== library || receipt.dbVersion !== 2
          || receipt.previousFingerprint !== fingerprint || receipt.expectedRevision !== revision
          || !same(receipt.operation, operationMarker(job)) || !same(markerFor(loaded, job), receipt.operation)
          || receipt.snapshotFingerprint !== canonicalJsonStringify(receipt.snapshot)
          || loaded.snapshotFingerprint !== receipt.snapshotFingerprint
          || canonicalJsonStringify(getSnapshot()) !== fingerprint) {
          fail('INVALID_AUDIO_RECEIPT', 'Authoritative audio receipt and readback disagree');
        }
        await verifyBindings(loaded.snapshot, entries);
        checkCancelled(signal);
        await staging.saveJob({ ...job, status: 'committed' });
        checkCancelled(signal);
        assertCurrent();
        publish(loaded);
        return { status: 'committed', operationId: job.id, results: receipt.result };
      } catch (error) {
        const status = phase === 'committed-unaccepted' ? phase
          : phase === 'committing' && !error.audioPrecommitFailure && !['STALE_RESULT', 'AUDIO_CANCELLED'].includes(error.code)
            ? 'uncertain' : 'precommit-failed';
        let reconcile = status !== 'precommit-failed' || error.code === 'STALE_RESULT' || error.code === 'AUDIO_OPERATION_EXISTS';
        if (reconcile) blockWrites();
        if (phase !== 'staging' && !disposed) {
          try { await staging.saveJob({ ...job, status, errorCode: errorCode(error, status) }); }
          catch { reconcile = true; blockWrites(); }
        }
        throw Object.assign(bookAudioError(errorCode(error, status), error.message), { status, operationId: job.id, reloadRequired: reconcile });
      }
    }, signal);
  };
  return {
    name: staging.name,
    get pending() { return pending; },
    get touched() { return touched; },
    submit,
    recover: () => guarded(recover),
    async readRuntime(entry) {
      assertCurrent();
      // Cold audio access also recovers a journal left by a previous connection.
      if (!touched) {
        assertWritable();
        try { await guarded(async () => publish(await recover())); }
        catch (error) { blockWrites(); throw error; }
      }
      const captured = getSnapshot();
      const binding = readBookAudioBinding(captured, entry);
      if (binding.status !== 'bound') return binding;
      const result = await staging.read(entry.fingerprint, binding.binary);
      assertCurrent();
      if (captured !== getSnapshot()) fail('STALE_RESULT', 'Audio source changed during runtime read');
      if (result.status !== 'ready') return result;
      if (!urls.has(result.id)) urls.set(result.id, URL.createObjectURL(result.blob));
      return { status: 'ready', url: urls.get(result.id), binary: binding.binary, id: result.id };
    },
    dispose() {
      disposed = true;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
};
