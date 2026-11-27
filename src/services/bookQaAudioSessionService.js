import { canonicalJsonStringify } from '../domain/text/textCanonicalFingerprintDomain.js';
import { BOOK_AUDIO_MAX_BYTES, BOOK_AUDIO_MAX_ITEMS, assertBookAudioCompatibleBytes, assertBookAudioReferenceCapacity, bookAudioCommitKey, bookAudioError,
  isBookAudioOperationId, readBookAudioBinding, resolveBookAudioTarget } from '../domain/text/bookQaAudioDomain.js';
import { validateBookAudioBytes } from './audio/bookQaAudioBytes.js';
import { createBookQaAudioStaging } from './persistence/bookQaAudioStagingService.js';
import { createDisposableBookAudioCommitter } from './persistence/textDataManagementPersistenceService.js';
import { executeTextStructuredAudioGenerationRequest } from './audio/textStructuredAudioGenerationService.js';
import { buildDerivedTextConversationFullAudioWav } from './audio/textStructuredFullAudioExportService.js';
import { exportBookPortableAudio, importBookPortableAudio } from './audio/bookPortableAudioService.js';

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

export const createBookQaAudioSession = ({ library, loadState, getSnapshot, getRevision, publish, blockWrites, assertWritable, assertReadable }) => {
  const connectionId = crypto.randomUUID();
  const urls = new Map();
  const lifetime = new AbortController();
  let pending = false, disposed = false, touched = false, recovered = false;
  let coldRead;
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
    recovered = true;
    return loaded;
  };
  const render = async (entry, owner, before, signal) => {
    const { descriptor, fingerprint } = entry;
    const binding = readBookAudioBinding(before, entry);
    const proof = binding.status === 'bound' ? binding.binary : null;
    const staged = await staging.read(fingerprint, proof);
    checkCancelled(signal);
    if (staged.status !== 'ready' && (proof || staged.binary)) {
      if (proof) fail('AUDIO_REPAIR_BYTES_REQUIRED', 'Restore bytes matching this committed digest before generating this profile');
      fail('AUDIO_STAGED_BYTES_UNAVAILABLE', 'Existing scoped bytes for this render identity failed verification');
    }
    if (descriptor.engine !== 'derived') {
      if (staged.status === 'ready') return { blob: staged.blob, binary: staged.binary };
      const content = owner.content ?? owner.segment?.[descriptor.channel] ?? owner.expected?.fullRepresentation.content;
      const { blob } = await executeTextStructuredAudioGenerationRequest({
        engine: 'edge', text: content, engineVoiceId: descriptor.voiceId,
        edgeRate: descriptor.rate, edgePitch: descriptor.pitch, signal
      });
      return { blob };
    }
    if (binding.trustedComposition && staged.status === 'ready') return { ...staged, trustedComposition: true };
    const blobs = [];
    for (const input of owner.dependencies) {
      const checked = await staging.read(input.fingerprint, input.binary);
      checkCancelled(signal);
      if (checked.status !== 'ready') fail('INVALID_AUDIO_COMPOSITION', 'A referenced composition input is unavailable');
      blobs.push(checked.blob);
    }
    const composed = await buildDerivedTextConversationFullAudioWav({
      plan: { composition: descriptor.composition, entries: owner.dependencies, readyToCompose: true,
        fullArtifactRequirement: { descriptor } },
      blobs
    });
    return { blob: composed.blob, trustedComposition: true };
  };
  const perform = async (items, callerSignal, generated, portable = null) => {
    assertCurrent();
    assertWritable();
    const signal = callerSignal ? AbortSignal.any([callerSignal, lifetime.signal]) : lifetime.signal;
    checkCancelled(signal);
    if (!Array.isArray(items) || !items.length || items.length > BOOK_AUDIO_MAX_ITEMS) {
      fail('INVALID_AUDIO_REQUEST', 'An audio operation requires 1 to 32 entries');
    }
    let totalBytes = 0;
    const counted = new Set();
    const captured = items.map(item => {
      if (!item || (!generated && (!(item.blob instanceof Blob) || (!portable && item.kind === 'heading')))
        || Object.keys(item).some(key => !['kind', 'target', 'fingerprint', 'descriptor', ...(generated ? [] : ['blob'])].includes(key))) {
        fail('INVALID_AUDIO_REQUEST', 'Provide a typed target, render identity, and Blob');
      }
      const { blob, ...entry } = item;
      if (!portable || !counted.has(item.fingerprint)) totalBytes += blob?.size ?? 0;
      counted.add(item.fingerprint);
      return { entry: structuredClone(entry), blob };
    });
    if (totalBytes > BOOK_AUDIO_MAX_BYTES) fail('INVALID_AUDIO_REQUEST', 'The operation exceeds the 64 MiB byte limit');
    const before = getSnapshot();
    if (portable && portable.snapshot !== before) {
      blockWrites();
      fail('STALE_RESULT', 'The connected library changed during portable transfer');
    }
    const fingerprint = canonicalJsonStringify(before), revision = getRevision();
    assertBookAudioReferenceCapacity(before, captured.map(({ entry }) => entry), { bodyOnly: generated || Boolean(portable) });
    return guarded(async () => {
      let initial;
      try { initial = await recover(); }
      catch (error) { blockWrites(); throw error; }
      if (initial.snapshotFingerprint !== fingerprint) {
        blockWrites();
        fail('STALE_RESULT', 'Audio operation was captured against an older library snapshot');
      }
      const entries = [], assets = new Map(), available = [], repaired = [], reused = new Set();
      let renderedBytes = 0;
      for (const { blob: supplied, entry } of captured) {
        const owner = resolveBookAudioTarget(before, entry);
        for (const input of owner.dependencies ?? []) {
          if ((await staging.read(input.fingerprint, input.binary)).status !== 'ready') {
            fail('INVALID_AUDIO_COMPOSITION', 'A referenced composition input is unavailable');
          }
        }
        const prior = assets.get(entry.fingerprint);
        const prepared = generated ? (prior || await render(entry, owner, before, signal)) : { blob: supplied };
        const { blob, trustedComposition } = prepared;
        const proof = portable?.proofs.get(entry.fingerprint);
        const binary = prepared.binary || (proof?.blob === blob ? proof?.binary : null) || await validateBookAudioBytes(blob, owner.format);
        checkCancelled(signal);
        assertBookAudioCompatibleBytes(before, entry.fingerprint, binary);
        if (prior && !same(prior.binary, binary)) fail('AUDIO_BYTE_CONFLICT', 'Operation supplies conflicting bytes for the same render identity');
        if (!prior) renderedBytes += blob.size;
        if (renderedBytes > BOOK_AUDIO_MAX_BYTES) fail('INVALID_AUDIO_REQUEST', 'Rendered audio exceeds the 64 MiB operation limit');
        if (portable) {
          const binding = readBookAudioBinding(before, entry);
          if (binding.status === 'bound' && same(binding.binary, binary)) {
            const durable = await staging.read(entry.fingerprint, binary);
            if (durable.status === 'ready') {
              available.push(entry);
              reused.add(entry.fingerprint);
              continue;
            }
            checkCancelled(signal);
            if ((await loadState()).snapshotFingerprint !== fingerprint) {
              blockWrites();
              fail('STALE_RESULT', 'The library changed before exact-byte restoration');
            }
            await staging.restoreExactBytes(entry.fingerprint, binary, blob);
            await verifyBindings(before, [{ ...entry, binary }]);
            repaired.push(entry.fingerprint);
            available.push(entry);
            continue;
          }
        }
        assets.set(entry.fingerprint, { fingerprint: entry.fingerprint, binary, blob, trustedComposition });
        entries.push({ ...entry, binary, ...(trustedComposition ? { trustedComposition } : {}) });
      }
      if (!entries.length) {
        checkCancelled(signal);
        if (getSnapshot() !== before || (await loadState()).snapshotFingerprint !== fingerprint) {
          blockWrites();
          fail('STALE_RESULT', 'The connected library changed during portable readback');
        }
        return { results: [], snapshot: before, available, repaired, stored: [], reused: [...reused] };
      }
      const job = { id: crypto.randomUUID(), library, connectionId, status: 'provisional', createdAt: Date.now(), entries, revision };
      let phase = 'staging', receipt;
      try {
        const physical = await staging.stage(job, assets.values());
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
        return { status: 'committed', operationId: job.id, results: receipt.result,
          ...(portable ? { snapshot: getSnapshot(), available, repaired, stored: physical.stored, reused: [...new Set([...reused, ...physical.reused])] } : {}) };
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
    submit: (items, { signal } = {}) => perform(items, signal, false),
    generate: (items, { signal } = {}) => perform(items, signal, true),
    exportPortable: options => {
      assertCurrent();
      assertReadable();
      const signal = options?.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
      const snapshot = getSnapshot();
      return guarded(async () => {
        let loaded;
        try { loaded = await recover(); }
        catch (error) { blockWrites(); throw error; }
        if (loaded.snapshotFingerprint !== canonicalJsonStringify(snapshot)) {
          blockWrites();
          fail('STALE_RESULT', 'Refresh before exporting audio from this library');
        }
        const result = await exportBookPortableAudio({ ...options, snapshot, read: staging.read, signal });
        checkCancelled(signal);
        assertCurrent();
        if (getSnapshot() !== snapshot || (await loadState()).snapshotFingerprint !== canonicalJsonStringify(snapshot)) {
          blockWrites();
          fail('STALE_RESULT', 'The connected library changed during export');
        }
        return result;
      }, signal);
    },
    importPortable: (files, options) => {
      assertCurrent();
      assertWritable();
      const signal = options?.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
      return importBookPortableAudio({ ...options, files, signal, snapshot: getSnapshot(),
        publish: (items, expected, proofs) => perform(items, signal, false, { snapshot: expected, proofs }) });
    },
    recover: () => guarded(recover),
    repair: (entry, blob) => guarded(async () => {
      const requested = structuredClone(entry);
      const loaded = await loadState();
      const binding = readBookAudioBinding(loaded.snapshot, requested);
      if (binding.status !== 'bound') fail('AUDIO_REPAIR_UNAVAILABLE', 'Only an existing committed audio proof can be repaired');
      if ((await staging.read(requested.fingerprint, binding.binary)).status === 'ready') return { status: 'ready' };
      const binary = await validateBookAudioBytes(blob, binding.binary.format);
      if (!same(binary, binding.binary)) fail('AUDIO_REPAIR_BYTES_REQUIRED', 'Repair requires bytes matching the committed SHA-256 digest');
      if ((await loadState()).snapshotFingerprint !== loaded.snapshotFingerprint) fail('STALE_RESULT', 'The repair target changed before byte restoration');
      await staging.restoreExactBytes(requested.fingerprint, binary, blob);
      if ((await staging.read(requested.fingerprint, binary)).status !== 'ready') fail('AUDIO_READBACK_FAILED', 'Repaired audio failed verification');
      return { status: 'repaired' };
    }),
    async readRuntime(entry, { withUrl = true } = {}) {
      assertCurrent();
      assertReadable();
      if (!recovered) {
        assertWritable();
        if (pending && !coldRead) fail('AUDIO_BUSY', 'Wait for the pending audio recovery or publication');
        coldRead ??= guarded(async () => publish(await recover())).catch(error => {
          recovered = false;
          blockWrites();
          throw error;
        }).finally(() => { coldRead = null; });
        await coldRead;
      }
      const captured = getSnapshot();
      const binding = readBookAudioBinding(captured, entry);
      if (binding.status !== 'bound') return binding;
      const result = await staging.read(entry.fingerprint, binding.binary);
      assertCurrent();
      if (captured !== getSnapshot()) fail('STALE_RESULT', 'Audio source changed during runtime read');
      if (result.status !== 'ready') return result;
      if (withUrl && !urls.has(result.id)) urls.set(result.id, URL.createObjectURL(result.blob));
      return { status: 'ready', ...(withUrl ? { url: urls.get(result.id) } : {}), binary: binding.binary, id: result.id,
        variantId: binding.variantId, trustedComposition: binding.trustedComposition };
    },
    dispose() {
      disposed = true;
      lifetime.abort();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
};
