import { BOOK_AUDIO_MAX_BYTES, BOOK_AUDIO_MAX_ITEMS, bookAudioError } from '../../domain/text/bookQaAudioDomain.js';
import { canonicalJsonStringify } from '../../domain/text/textCanonicalFingerprintDomain.js';
import { collectBookPortableReferences, listBookPortableRequirements, listBookPortableTargets } from '../../domain/text/bookPortableAudioDomain.js';
import { portableReferenceKey } from '../../domain/text/bookPortableAudioManifestDomain.js';
import { compactTextVoiceFilenameLabel, sanitizeTextFilenameToken } from '../../domain/text/textFilenameDomain.js';
import { projectBookBodyAudioDocument } from '../../domain/text/bookQaBodyAudioDomain.js';
import { resolveTextStructuredEffectivePlaybackRate } from '../../domain/text/textStructuredPlaybackRateProfileDomain.js';
import { getTextStructuredSpeakerRegistry } from '../../domain/text/textStructuredSpeakerIdentityDomain.js';
import { buildStoredZipBlob, STORED_ZIP_END_BYTES, storedZipEntryBytes } from './browserZipService.js';
import { buildDerivedTextFullAudioWav } from './textStructuredFullAudioExportService.js';
import { validateBookAudioBytes } from './bookQaAudioBytes.js';

const number = (value, total = 99) => String(value).padStart(Math.max(2, String(total).length), '0');
const label = value => sanitizeTextFilenameToken(value, 'Untitled', 30);
const unitLabel = (doc, unit, index, total) => unit?.kind === 'turn'
  ? `T${number(index + 1, total)}_${label(getTextStructuredSpeakerRegistry(doc).find(speaker => speaker.id === unit.speakerId)?.label || unit.speaker || unit.speakerId)}`
  : `SC${number(index + 1, total)}`;
const cancelled = signal => {
  if (signal?.aborted) throw bookAudioError('AUDIO_CANCELLED', 'Normal audio export cancelled');
};
export const NORMAL_AUDIO_ZIP_LIMITS = Object.freeze({ entries: 2048, bytes: 128 * 1024 ** 2 });

export const assertNormalAudioZipCapacity = (entryCount, archiveBytes, filename, size) => {
  const next = archiveBytes + storedZipEntryBytes(filename, size);
  if (entryCount >= NORMAL_AUDIO_ZIP_LIMITS.entries || next > NORMAL_AUDIO_ZIP_LIMITS.bytes) {
    throw bookAudioError('NORMAL_AUDIO_LIMIT', 'Listening ZIP exceeds 2,048 entries or 128 MiB. Select a smaller scope, fewer representations or channels, or current profiles only.');
  }
  return next;
};

export const exportBookNormalAudio = async ({ snapshot, workspaceId = null, preferences, read, signal,
  channels = ['text', 'meaning'], representations = ['main-title', 'heading', 'full', 'split'], includeAlternate = false, onProgress }) => {
  const targets = listBookPortableTargets(snapshot, workspaceId);
  const requirements = listBookPortableRequirements(targets, preferences);
  const rows = collectBookPortableReferences(snapshot, targets, preferences);
  const rowsByKey = new Map(rows.map(row => [portableReferenceKey(row.ref), row]));
  const entries = [], omissions = [], reads = new Map();
  let archiveBytes = STORED_ZIP_END_BYTES;
  const checkCapacity = (filename, size) => assertNormalAudioZipCapacity(entries.length, archiveBytes, filename, size);
  const append = (filename, blob, verifiedRead) => {
    archiveBytes = checkCapacity(filename, blob.size);
    entries.push({ filename, blob });
    if (verifiedRead) reads.set(verifiedRead.key, verifiedRead.result);
    onProgress?.({ completed: entries.length });
  };
  // Cache only bytes already retained by the archive. Composition inputs may be selected
  // without Split output and should be released at the end of each Unit.
  const readExact = async (fingerprint, binary) => {
    cancelled(signal);
    const key = canonicalJsonStringify([fingerprint, binary]);
    const result = reads.get(key) ?? await read(fingerprint, binary);
    cancelled(signal);
    const ready = result.status === 'ready' && canonicalJsonStringify(result.binary) === canonicalJsonStringify(binary);
    return { key, result, status: ready ? 'ready' : result.status === 'ready' ? 'conflict' : result.status };
  };
  const collectionOrder = new Map(snapshot.collections.map(collection => [collection.id, collection.order]));
  const docs = [...new Map(targets.map(target => [target.doc.uid, target.doc])).values()].sort((left, right) =>
    (collectionOrder.get(left.collectionId) ?? 0) - (collectionOrder.get(right.collectionId) ?? 0)
    || (left.order ?? 0) - (right.order ?? 0) || left.uid.localeCompare(right.uid));
  const targetByOwner = new Map(targets.map(target => [JSON.stringify([target.representation, target.owner.uid]), target]));
  const selected = ref => channels.includes(ref.channel) && representations.includes(ref.representation === 'main-title' ? 'main-title'
    : ref.representation.endsWith('heading') ? 'heading' : ref.representation.startsWith('full-') ? 'full' : 'split');
  const add = async row => {
    cancelled(signal);
    const { ref, entry, binary } = row;
    const target = targetByOwner.get(JSON.stringify([ref.representation, ref.ownerUid]));
    if (!target || !binary) { omissions.push({ ref, status: 'metadata-only' }); return; }
    if (ref.representation === 'full-conversation' && !row.trustedComposition) {
      omissions.push({ ref, status: 'unverified-composition' }); return;
    }
    if (ref.representation === 'full-conversation') {
      const audible = target.block.segments.filter(segment => segment[ref.channel]?.trim());
      if (entry.descriptor.composition.length !== audible.length) { omissions.push({ ref, status: 'missing-composition-input' }); return; }
      for (const [index, input] of entry.descriptor.composition.entries()) {
        const dependency = rows.find(item => item.ref.representation === 'split' && item.entry.target.segmentId === audible[index].id
          && item.ref.fingerprint === input.renderFingerprint && ['current', 'other-profile'].includes(item.state));
        if (!dependency?.binary) { omissions.push({ ref, status: 'missing-composition-input' }); return; }
        if ((await readExact(dependency.ref.fingerprint, dependency.binary)).status !== 'ready') {
          omissions.push({ ref, status: 'unavailable-composition-input' }); return;
        }
      }
    }
    const verified = await readExact(ref.fingerprint, binary);
    if (verified.status !== 'ready') {
      omissions.push({ ref, status: verified.status }); return;
    }
    const { doc, block, segment } = target;
    const workspace = `${number(docs.findIndex(item => item.uid === doc.uid) + 1, docs.length)}_${label(doc.title)}`;
    const channel = ref.channel === 'text' ? 'EN' : 'ID';
    const voice = label(compactTextVoiceFilenameLabel(entry.descriptor.voiceId).toUpperCase());
    const suffix = includeAlternate ? `_${ref.fingerprint.split('-').at(-1)}` : '';
    let path;
    if (!block) path = `${workspace}/00_Title/${channel}_${voice}${suffix}.${binary.format}`;
    else {
      const index = doc.blocks.findIndex(item => item.id === block.id);
      const typeIndex = doc.blocks.slice(0, index + 1).filter(item => item.blockType === block.blockType).length;
      const card = `${workspace}/${number(index + 1, doc.blocks.length)}_${block.blockType === 'paragraph' ? 'P' : 'C'}${typeIndex}_${label(block.title)}`;
      if (segment) {
        const unitIndex = block.units.findIndex(unit => unit.id === segment.unitId);
        const unit = block.units[unitIndex];
        if (!unit) { omissions.push({ ref, status: 'unsupported-unit-identity' }); return; }
        const unitName = unitLabel(doc, unit, unitIndex, block.units.length);
        const segmentIndex = unit?.segments.findIndex(item => item.id === segment.id) ?? -1;
        path = `${card}/Split/${unitName}/SG${number(segmentIndex + 1, unit.segments.length)}_${channel}_${voice}${suffix}.${binary.format}`;
      } else path = `${card}/${ref.representation.endsWith('heading') ? '00_Heading' : 'Full_Card'}/${channel}_${voice}${suffix}.${binary.format}`;
    }
    append(path, verified.result.blob, verified);
  };
  for (const requirement of requirements.filter(item => selected(item.ref))) {
    const row = rowsByKey.get(portableReferenceKey(requirement.ref));
    if (row?.state === 'current') await add(row);
    else omissions.push({ ref: requirement.ref, status: requirement.status ?? row?.state ?? 'missing' });
  }
  if (includeAlternate) for (const row of rows.filter(item => item.state === 'other-profile' && selected(item.ref))) await add(row);
  for (const row of rows.filter(item => ['stale', 'unsupported', 'missing-composition-input'].includes(item.state) && selected(item.ref))) {
    omissions.push({ ref: row.ref, status: row.state });
  }
  if (representations.includes('unit')) for (const doc of docs) for (const block of doc.blocks.filter(item =>
    targets.some(target => target.block?.id === item.id && target.representation.startsWith('full-')))) {
    for (const [unitIndex, unit] of block.units.entries()) for (const channel of channels) {
      cancelled(signal);
      const segments = unit.segments.filter(segment => segment[channel]?.trim());
      if (!segments.length) continue;
      if (segments.length > BOOK_AUDIO_MAX_ITEMS) {
        omissions.push({ status: 'unsupported-unit-composition', unitUid: unit.uid, channel, message: 'Unit composition exceeds the input limit' });
        continue;
      }
      const owner = projectBookBodyAudioDocument(doc, block.blockType);
      const inputs = [];
      let inputBytes = 0;
      let status = null;
      for (const segment of segments) {
        if (resolveTextStructuredEffectivePlaybackRate({ documentTree: owner, block, segment, channel, globalRate: 1,
          respectConversationSync: block.blockType === 'conversation' }) !== 1) { status = 'unsupported-unit-rate'; break; }
        const requirement = requirements.find(item => item.ref.representation === 'split' && item.ref.ownerUid === segment.uid && item.ref.channel === channel);
        const row = requirement && rowsByKey.get(portableReferenceKey(requirement.ref));
        if (!row || row.state !== 'current' || !row.binary) { status = 'missing-unit-input'; break; }
        inputBytes += row.binary.bytes;
        if (inputBytes > BOOK_AUDIO_MAX_BYTES) { status = 'unsupported-unit-composition'; break; }
        const { status: readStatus, result } = await readExact(row.ref.fingerprint, row.binary);
        if (readStatus !== 'ready') {
          status = 'unavailable-unit-input'; break;
        }
        inputs.push({ blob: result.blob, voice: row.entry.descriptor.voiceId });
      }
      if (status) { omissions.push({ status, unitUid: unit.uid, channel }); continue; }
      const index = doc.blocks.findIndex(item => item.id === block.id);
      const typeIndex = doc.blocks.slice(0, index + 1).filter(item => item.blockType === block.blockType).length;
      const card = `${number(docs.findIndex(item => item.uid === doc.uid) + 1, docs.length)}_${label(doc.title)}/${number(index + 1, doc.blocks.length)}_${block.blockType === 'paragraph' ? 'P' : 'C'}${typeIndex}_${label(block.title)}`;
      const unitName = unitLabel(doc, unit, unitIndex, block.units.length);
      const voices = [...new Set(inputs.map(input => input.voice))];
      const voice = voices.length === 1 ? label(compactTextVoiceFilenameLabel(voices[0]).toUpperCase()) : 'MULTI-SPEAKER';
      const filename = `${card}/${unit.kind === 'turn' ? 'Full_Turn' : 'Full_Section'}/${unitName}_${channel === 'text' ? 'EN' : 'ID'}_${voice}.wav`;
      checkCapacity(filename, 44);
      try {
        const output = await buildDerivedTextFullAudioWav({ blobs: inputs.map(input => input.blob), sampleRate: 48000, signal,
          maxDuration: 120, checkOutputSize: size => checkCapacity(filename, size) });
        cancelled(signal);
        const proof = await validateBookAudioBytes(output.blob, 'wav');
        if (proof.sampleRate !== 48000 || output.segmentCount !== segments.length) throw new Error('Invalid unit audio output');
        cancelled(signal);
        append(filename, output.blob);
      } catch (error) {
        cancelled(signal);
        if (error.code === 'NORMAL_AUDIO_LIMIT') throw error;
        omissions.push({ status: 'unsupported-unit-composition', unitUid: unit.uid, channel, message: error.message });
      }
    }
  }
  cancelled(signal);
  entries.sort((left, right) => left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0);
  const blob = entries.length ? await buildStoredZipBlob(entries, { relativePaths: true, signal }).catch(error => {
    cancelled(signal);
    throw error;
  }) : null;
  cancelled(signal);
  return { blob, report: { logical: entries.length, omissions } };
};
