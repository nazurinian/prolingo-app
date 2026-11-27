import { BOOK_AUDIO_MAX_BYTES, BOOK_AUDIO_MAX_ITEMS, bookAudioError, readBookAudioBinding } from '../../domain/text/bookQaAudioDomain.js';
import { canonicalJsonStringify } from '../../domain/text/textCanonicalFingerprintDomain.js';
import {
  BOOK_PORTABLE_AUDIO_VERSION, BOOK_PORTABLE_MAX_ASSETS, BOOK_PORTABLE_MAX_REFERENCES, buildBookPortableAudioManifest,
  portableFilenameMatches, portableMime, portablePhysicalType, validateBookPortableAudioManifest
} from '../../domain/text/bookPortableAudioManifestDomain.js';
import { bookPortableLegacyRequirements, collectBookPortableReferences, currentBookPortableFingerprints, listBookPortableTargets, resolveBookPortableReference, uniqueBookPortableReferences } from '../../domain/text/bookPortableAudioDomain.js';
import { validateProLingoTextAudioManifest } from '../../domain/text/textAudioManifestDomain.js';
import {
  buildCanonicalTextFullArtifactFilename, buildCanonicalTextRenderAudioFilename, isSafePortableZipPath, parseCanonicalTextFullArtifactFilename,
  parseCanonicalTextRenderAudioFilename, portableZipPathKey, TEXT_AUDIO_MANIFEST_FILENAME
} from '../../domain/text/textFilenameDomain.js';
import { buildStoredZipBlob } from './browserZipService.js';
import { openPortableAudioZip, PORTABLE_ZIP_LIMITS } from './textStructuredAudioZipArchiveService.js';
import { validateBookAudioBytes } from './bookQaAudioBytes.js';

const LEGACY_AUDIO = /\.(mp3|wav|ogg|webm)$/iu;
const basename = path => path.split('/').at(-1);
const zipName = file => file.name || 'Portable Audio archive';
const fail = (code, message) => { throw bookAudioError(code, message); };
const abort = signal => {
  if (signal?.aborted) fail('AUDIO_CANCELLED', 'Portable transfer cancelled');
};
const json = value => new Blob([JSON.stringify(value)], { type: 'application/json' });
const csv = rows => new Blob([rows.map(row => row.map(value => {
  const clean = String(value ?? '');
  return '"' + (/^[=+@\-\t\r\n]/u.test(clean) ? "'" : '') + clean.replaceAll('"', '""') + '"';
}).join(',')).join('\r\n')], { type: 'text/csv' });
const acceptedProof = asset => ({ digest: asset.digest, format: asset.codec, bytes: asset.size, sampleRate: asset.sampleRate });
const resultError = error => ({ code: typeof error.code === 'string' ? error.code : error.name === 'AbortError' ? 'AUDIO_CANCELLED' : 'PORTABLE_TRANSFER_ERROR',
  message: error.message, ...(error.reloadRequired ? { reloadRequired: true } : {}),
  ...(error.operationId ? { operationId: error.operationId, status: error.status } : {}) });

const indexColumns = ['archive_path', 'fingerprint', 'representation', 'workspace_uid', 'owner_uid', 'channel',
  'workspace_order', 'card_order', 'unit_order', 'segment_order', 'engine', 'voice_id', 'render_rate', 'render_pitch', 'codec', 'mime_type', 'byte_size', 'sample_rate', 'byte_sha256'];
export const buildBookPortableAudioIndex = manifest => {
  const assets = new Map(manifest.assets.map(asset => [asset.fingerprint, asset]));
  return csv([indexColumns, ...manifest.references.map(ref => {
    const asset = assets.get(ref.fingerprint);
    return [asset.path, ref.fingerprint, ref.representation, ref.workspaceUid, ref.ownerUid, ref.channel, ...ref.order,
      asset.descriptor.engine, asset.descriptor.voiceId, asset.descriptor.rate, asset.descriptor.pitch,
      asset.codec, asset.mimeType, asset.size, asset.sampleRate, asset.digest];
  })]);
};

export const exportBookPortableAudio = async ({ snapshot, workspaceId = null, preferences, includeAlternate = true, read, signal }) => {
  const targets = listBookPortableTargets(snapshot, workspaceId);
  const rows = uniqueBookPortableReferences(collectBookPortableReferences(snapshot, targets, preferences));
  const omissions = [], selected = [], reads = new Map();
  const verified = async row => {
    const { entry, ref, binary } = row;
    if (!binary) return { status: 'legacy-unverified' };
    if (!reads.has(ref.fingerprint)) reads.set(ref.fingerprint, await read(ref.fingerprint, binary));
    const result = reads.get(ref.fingerprint);
    if (result.status !== 'ready') return result;
    if (canonicalJsonStringify(result.binary) !== canonicalJsonStringify(binary)) return { status: 'conflict' };
    const name = ref.fingerprint.startsWith('rf-')
      ? buildCanonicalTextRenderAudioFilename({ renderFingerprint: ref.fingerprint, engine: entry.descriptor.engine,
        voiceId: entry.descriptor.voiceId, extension: binary.format })
      : buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: ref.fingerprint, engine: entry.descriptor.engine,
        voiceId: entry.descriptor.voiceId, extension: binary.format });
    return { status: 'ready', blob: result.blob, asset: { fingerprint: ref.fingerprint, path: name,
      descriptor: entry.descriptor, digest: binary.digest, codec: binary.format, mimeType: portableMime(binary.format),
      size: binary.bytes, sampleRate: binary.sampleRate } };
  };
  const splitByOwner = new Map(rows.filter(row => row.ref.representation === 'split')
    .map(row => [JSON.stringify([row.entry.target.segmentId, row.ref.fingerprint]), row]));
  for (const row of rows) {
    abort(signal);
    const { ref, state, entry } = row;
    if (!['current', 'other-profile'].includes(state) || (!includeAlternate && state === 'other-profile')) {
      omissions.push({ ref, status: row.proof === 'legacy-unverified' ? row.proof : state });
      continue;
    }
    const result = await verified(row);
    if (result.status !== 'ready') { omissions.push({ ref, status: result.status }); continue; }
    const dependencies = [];
    if (ref.representation === 'full-conversation') {
      const card = targets.find(target => target.representation === ref.representation && target.owner.uid === ref.ownerUid).block;
      const audible = card.segments.filter(segment => segment[ref.channel]?.trim());
      for (const [index, item] of entry.descriptor.composition.entries()) {
        const source = splitByOwner.get(JSON.stringify([audible[index]?.id, item.renderFingerprint]));
        if (!source) break;
        const dependency = await verified(source);
        if (dependency.status !== 'ready') break;
        dependencies.push({ ...dependency, ref: source.ref, state: source.state });
      }
      if (dependencies.length !== audible.length) { omissions.push({ ref, status: 'missing-composition-input' }); continue; }
    }
    selected.push(...dependencies, { ...result, ref, state });
  }
  const logical = uniqueBookPortableReferences(selected);
  const physical = [...new Map(logical.map(row => [row.asset.fingerprint, row])).values()];
  const report = { physical: physical.length, logical: logical.length, omissions, alternate: logical.filter(row => row.state === 'other-profile').length };
  if (!physical.length) return { blob: null, manifest: null, report };
  if (physical.length > BOOK_PORTABLE_MAX_ASSETS || logical.length > BOOK_PORTABLE_MAX_REFERENCES) fail('PORTABLE_LIMIT', 'Export exceeds the portable asset or reference limit');
  const manifest = buildBookPortableAudioManifest(physical.map(row => row.asset), logical.map(row => row.ref));
  const manifestBlob = json(manifest);
  const entries = [{ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: manifestBlob },
    { filename: 'AUDIO_INDEX.csv', blob: buildBookPortableAudioIndex(manifest) },
    ...physical.map(({ asset, blob }) => ({ filename: asset.path, blob }))];
  if (manifestBlob.size > PORTABLE_ZIP_LIMITS.manifest || entries.reduce((size, row) => size + row.blob.size + 100 + row.filename.length * 4, 22)
      > PORTABLE_ZIP_LIMITS.bytes) fail('PORTABLE_LIMIT', 'Export exceeds the archive limit. Select a smaller Workspace or current profiles.');
  const blob = await buildStoredZipBlob(entries, { onProgress: () => abort(signal) });
  return { blob, manifest, report };
};

const scanArchive = async (file, signal, known, report) => {
  if (LEGACY_AUDIO.test(file.name ?? '')) {
    const fingerprint = parseCanonicalTextRenderAudioFilename(file.name)?.renderFingerprint
      ?? parseCanonicalTextFullArtifactFilename(file.name)?.fullArtifactFingerprint;
    const descriptor = known.get(fingerprint);
    const kind = portablePhysicalType(fingerprint, descriptor);
    const codec = kind === 'full-conversation' ? 'wav' : 'mp3';
    const invalid = !kind ? 'legacy-unverified' : !isSafePortableZipPath(file.name) || !portableFilenameMatches(file.name, fingerprint, descriptor, codec) ? 'conflict' : null;
    report.physicalDiscovered++;
    return { archive: { read: () => file }, assets: [{ asset: { fingerprint, path: file.name, descriptor, codec, size: null }, entry: file,
      refs: [{ fingerprint, representation: kind === 'rf' ? 'split' : kind }], legacy: true, invalid }] };
  }
  const archive = await openPortableAudioZip(file, { signal });
  const manifests = archive.entries.filter(entry => portableZipPathKey(basename(entry.filename)) === TEXT_AUDIO_MANIFEST_FILENAME);
  if (manifests.length > 1) fail('AMBIGUOUS_PORTABLE_MANIFEST', 'Archive contains multiple manifest paths');
  const raw = manifests.length ? JSON.parse(await (await archive.read(manifests[0], PORTABLE_ZIP_LIMITS.manifest)).text()) : null;
  const assets = [];
  if (raw?.packageVersion === BOOK_PORTABLE_AUDIO_VERSION) {
    const manifest = validateBookPortableAudioManifest(raw);
    if (manifests[0].filename !== TEXT_AUDIO_MANIFEST_FILENAME) fail('INVALID_PORTABLE_MANIFEST', 'A v3 manifest must be at its exact root path');
    const paths = new Map(archive.entries.map(entry => [entry.filename, entry]));
    const refs = Map.groupBy(manifest.references, ref => ref.fingerprint);
    const declared = new Set(manifest.assets.map(asset => asset.path));
    if (archive.entries.some(entry => LEGACY_AUDIO.test(entry.filename) && !declared.has(entry.filename))) {
      fail('INVALID_PORTABLE_MANIFEST', 'Archive contains undeclared v3 audio entries');
    }
    for (const asset of manifest.assets) assets.push({ asset, entry: paths.get(asset.path), refs: refs.get(asset.fingerprint), legacy: false });
  } else {
    if (manifests.length && !raw) fail('INVALID_PORTABLE_MANIFEST', 'Legacy archive manifest is empty');
    if (raw?.entries?.some?.(entry => entry?.representation != null && !['split', 'full'].includes(String(entry.representation).toLowerCase()))) {
      fail('INVALID_PORTABLE_MANIFEST', 'Unrecognized legacy representation');
    }
    const manifest = raw ? validateProLingoTextAudioManifest(raw) : null;
    const files = archive.entries.filter(entry => LEGACY_AUDIO.test(entry.filename));
    const paths = new Map(files.map(entry => [entry.filename, entry]));
    const byName = Map.groupBy(files, entry => portableZipPathKey(basename(entry.filename)));
    const used = new Set();
    const add = (path, entry, fingerprint, descriptor, legacySize = null) => {
      const legacy = true;
      const kind = portablePhysicalType(fingerprint, descriptor);
      const refs = [{ fingerprint, representation: kind === 'rf' ? 'split' : kind }];
      const codec = kind === 'full-conversation' ? 'wav' : 'mp3';
      const invalid = !kind ? 'legacy-unverified' : !portableFilenameMatches(path, fingerprint, descriptor, codec) ? 'conflict' : null;
      assets.push({ asset: { fingerprint, path, descriptor, codec, size: legacySize }, entry, refs, legacy, invalid });
      if (entry) used.add(entry);
    };
    for (const entry of manifest?.entries ?? []) {
      if (!isSafePortableZipPath(entry.filename) || entry.filename.endsWith('/')) fail('INVALID_PORTABLE_MANIFEST', 'Legacy manifest path is invalid');
      const candidates = byName.get(portableZipPathKey(basename(entry.filename))) ?? [];
      const archiveEntry = paths.get(entry.filename) ?? (candidates.length === 1 ? candidates[0] : null);
      if (candidates.length > 1 && !paths.has(entry.filename)) fail('AMBIGUOUS_PORTABLE_PATH', 'Legacy filename matches multiple archive paths');
      if (archiveEntry && used.has(archiveEntry)) fail('AMBIGUOUS_PORTABLE_PATH', 'Multiple legacy rows claim the same archive entry');
      add(archiveEntry?.filename ?? entry.filename, archiveEntry, entry.identity, entry.render ?? known.get(entry.identity), entry.size || null);
    }
    for (const entry of files.filter(item => !used.has(item))) {
      const fingerprint = parseCanonicalTextRenderAudioFilename(entry.filename)?.renderFingerprint
        ?? parseCanonicalTextFullArtifactFilename(entry.filename)?.fullArtifactFingerprint;
      add(entry.filename, entry, fingerprint, known.get(fingerprint));
    }
  }
  report.physicalDiscovered += assets.length;
  return { archive, assets };
};

const preparePortable = async (files, signal, known, report) => {
  const physical = new Map(), blocked = new Set();
  let expanded = 0, count = 0, logical = 0;
  for (const file of files) {
    abort(signal);
    let scanned;
    try { scanned = await scanArchive(file, signal, known, report); }
    catch (error) { abort(signal); report.issues.push({ archive: zipName(file), status: 'invalid-archive', ...resultError(error) }); continue; }
    count += scanned.assets.length;
    logical += scanned.assets.reduce((total, row) => total + row.refs.length, 0);
    expanded += scanned.assets.reduce((total, row) => total + (row.entry?.uncompressedSize ?? row.entry?.size ?? 0), 0);
    if (count > BOOK_PORTABLE_MAX_ASSETS || logical > BOOK_PORTABLE_MAX_REFERENCES || expanded > 256 * 1024 ** 2) {
      fail('PORTABLE_LIMIT', 'Selected archives exceed the combined transfer limits');
    }
    for (const { asset, entry, refs, legacy, invalid } of scanned.assets) {
      const problem = (status, error) => report.issues.push({ archive: zipName(file), path: asset.path, fingerprint: asset.fingerprint,
        status, logicalReferences: refs.length, ...(error ? resultError(error) : {}) });
      if (invalid || !entry) { problem(invalid ?? 'missing'); continue; }
      abort(signal);
      let blob, binary;
      try {
        blob = await scanned.archive.read(entry);
        binary = await validateBookAudioBytes(blob, asset.codec);
        if (legacy ? asset.size != null && asset.size !== binary.bytes
          : canonicalJsonStringify(acceptedProof(asset)) !== canonicalJsonStringify(binary)) fail('PORTABLE_DIGEST_MISMATCH', 'Manifest bytes, sample rate or digest disagree');
      } catch (error) { abort(signal); problem('corrupt', error); continue; }
      report.physicalValidated++;
      if (blocked.has(asset.fingerprint)) { problem('conflict'); continue; }
      const previous = physical.get(asset.fingerprint);
      if (previous && canonicalJsonStringify(previous.binary) !== canonicalJsonStringify(binary)) {
        physical.delete(asset.fingerprint);
        blocked.add(asset.fingerprint);
        problem('conflict');
        continue;
      }
      if (previous) previous.refs.push(...refs);
      else physical.set(asset.fingerprint, { blob, binary, asset, refs: [...refs] });
    }
  }
  return physical;
};

const targetKey = entry => JSON.stringify([entry.kind, entry.target, entry.fingerprint]);

export const importBookPortableAudio = async ({ files, snapshot, workspaceId = null, preferences = {}, publish, signal, onProgress }) => {
  const report = {
    physicalDiscovered: 0, physicalValidated: 0, physicalUniqueValidated: 0, physicalStored: 0, physicalReused: 0, physicalRepaired: 0,
    logicalMatched: 0, logicalCommitted: 0, alreadyAvailable: 0, otherProfile: 0, batches: [], issues: [], logical: [], stopped: null
  };
  const selected = Array.from(files ?? []);
  if (!selected.length || selected.length > 8 || selected.some(file => !(file instanceof Blob))
    || selected.reduce((total, file) => total + file.size, 0) > 256 * 1024 ** 2) fail('PORTABLE_LIMIT', 'Select up to eight files within the combined 256 MiB limit');
  const targets = listBookPortableTargets(snapshot, workspaceId);
  const known = bookPortableLegacyRequirements(snapshot, targets, preferences);
  const current = currentBookPortableFingerprints(targets, preferences);
  const stored = new Set(), reused = new Set(), repaired = new Set(), seen = new Set();
  try {
    const physical = await preparePortable(selected, signal, known, report);
    report.physicalUniqueValidated = physical.size;
    const flush = async (items, representations) => {
      if (!items.length) return;
      abort(signal);
      const result = await publish(items, snapshot, physical);
      snapshot = result.snapshot;
      report.logicalCommitted += result.results.length;
      report.alreadyAvailable += result.available.length;
      result.stored.forEach(rf => stored.add(rf));
      result.reused.forEach(rf => reused.add(rf));
      result.repaired.forEach(rf => repaired.add(rf));
      report.batches.push({ operationId: result.operationId ?? null, committed: result.results.length, available: result.available.length });
      for (const item of items) {
        const { kind, target, fingerprint, descriptor } = item;
        const entry = { kind, target, fingerprint, descriptor };
        const binding = readBookAudioBinding(snapshot, entry);
        const unverified = descriptor.engine === 'derived' && !binding.trustedComposition;
        const profile = current.get(JSON.stringify(target))?.has(fingerprint) ? 'current' : 'other-profile';
        if (profile === 'other-profile') report.otherProfile++;
        report.logical.push({ fingerprint, target, channel: descriptor.channel, profile, representation: representations.get(targetKey(entry)),
          status: unverified ? 'unverified-composition' : result.available.some(row => targetKey(row) === targetKey(item)) ? 'already-available' : 'committed' });
      }
      onProgress?.({ phase: 'commit', batches: report.batches.length, committed: report.logicalCommitted, available: report.alreadyAvailable });
    };
    // Derived inputs must already have committed exact Split bindings when a Full reference is matched.
    for (const derived of [false, true]) {
      let batch = [], batchBytes = 0, batchPhysical = new Set();
      const representations = new Map();
      for (const { asset, refs, blob } of physical.values()) {
        if ((asset.descriptor.engine === 'derived') !== derived) continue;
        for (const ref of refs) {
          abort(signal);
          const outcome = resolveBookPortableReference(snapshot, targets, ref, asset);
          if (outcome.status !== 'matched') { report.logical.push({ ref, status: outcome.status }); continue; }
          const { entry } = outcome;
          const key = targetKey(entry);
          if (seen.has(key)) continue;
          seen.add(key);
          report.logicalMatched++;
          if (batch.length === BOOK_AUDIO_MAX_ITEMS || batchBytes + (batchPhysical.has(entry.fingerprint) ? 0 : blob.size) > BOOK_AUDIO_MAX_BYTES) {
            await flush(batch, representations);
            batch = []; batchBytes = 0; batchPhysical = new Set(); representations.clear();
          }
          if (!batchPhysical.has(entry.fingerprint)) { batchBytes += blob.size; batchPhysical.add(entry.fingerprint); }
          batch.push({ ...entry, blob });
          representations.set(key, ref.representation);
        }
      }
      await flush(batch, representations);
    }
  } catch (error) { report.stopped = resultError(error); }
  report.physicalStored = stored.size;
  report.physicalReused = [...reused].filter(rf => !stored.has(rf) && !repaired.has(rf)).length;
  report.physicalRepaired = repaired.size;
  return report;
};
