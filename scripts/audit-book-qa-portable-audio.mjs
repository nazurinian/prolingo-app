import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { applyBookQaAudioOperation } from '../src/domain/text/bookQaAudioDomain.js';
import { getBookBodyGenerationRequests } from '../src/domain/text/bookQaBodyAudioDomain.js';
import { planBookAtomicGeneration } from '../src/domain/text/bookQaHeadingAudioDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata } from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import { buildCanonicalTextRenderAudioFilename, buildCanonicalTextFullArtifactFilename, textVoiceFilenameTokenMatches, TEXT_AUDIO_MANIFEST_FILENAME } from '../src/domain/text/textFilenameDomain.js';
import { buildBookPortableAudioManifest, portableFilenameMatches, validateBookPortableAudioManifest } from '../src/domain/text/bookPortableAudioManifestDomain.js';
import { validateProLingoTextAudioManifest } from '../src/domain/text/textAudioManifestDomain.js';
import { bookPortableLegacyRequirements, listBookPortableTargets, resolveBookPortableReference } from '../src/domain/text/bookPortableAudioDomain.js';
import { buildStoredZipBlob, crc32Blob } from '../src/services/audio/browserZipService.js';
import { openPortableAudioZip } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import { exportBookPortableAudio, importBookPortableAudio } from '../src/services/audio/bookPortableAudioService.js';
import { exportBookNormalAudio } from '../src/services/audio/bookNormalAudioService.js';

const { snapshot, ids } = createJourneyToLondonFixture();
const tree = resolveTextLibraryDocumentTree(snapshot, ids.documentId);
const block = tree.blocks[0], segment = block.segments[0];
const render = buildTextStructuredAudioRenderFingerprint({ content: segment.text, voiceId: 'en-GB-LibbyNeural' });
const audio = new Blob([await readFile(new URL('./fixtures/a1b-1a/tone-440.mp3', import.meta.url))]);
const path = buildCanonicalTextRenderAudioFilename({ renderFingerprint: render.renderFingerprint, voiceId: render.descriptor.voiceId, engine: 'edge' });
const asset = { fingerprint: render.renderFingerprint, descriptor: render.descriptor, digest: 'a'.repeat(64),
  path, codec: 'mp3', mimeType: 'audio/mpeg', size: audio.size, sampleRate: 24000 };
const ref = { fingerprint: asset.fingerprint, representation: 'split', workspaceUid: tree.uid, ownerUid: segment.uid, channel: 'text', order: [1, 1, 1, 1] };
const mirror = { ...ref, representation: 'main-title', ownerUid: tree.uid, order: [1, 0, 0, 0] };
const defaultManifest = () => structuredClone(buildBookPortableAudioManifest([asset], [ref, mirror]));
const zip = entries => buildStoredZipBlob(entries.map(([filename, blob]) => ({ filename, blob })));

test('strict v3 maps one verified RF to explicit atomic and Split identities without changing v1/v2 parsing', () => {
  const manifest = defaultManifest();
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.references.length, 2);
  assert.equal(validateBookPortableAudioManifest(manifest), manifest);
  const legacy = version => ({ packageType: manifest.packageType, packageVersion: version, entries: [{ rf: asset.fingerprint, filename: path }] });
  for (const version of [1, 2]) assert.equal(validateProLingoTextAudioManifest(legacy(version)).entries[0].identity, asset.fingerprint);
  assert.throws(() => validateProLingoTextAudioManifest(manifest), /version/iu);
  for (const change of [
    data => { data.references[0].representation = 'unknown'; },
    data => { data.references[0].channel = 'meaning'; },
    data => { data.references.push(data.references[0]); },
    data => { data.assets.push(data.assets[0]); },
    data => { data.assets[0].descriptor.voiceId = 'en-GB-SoniaNeural'; },
    data => { data.assets[0].digest = data.assets[0].digest.slice(1); },
    data => { data.assets[0].path = '../' + data.assets[0].path; },
    data => { data.assets[0].path += '/'; },
    data => { data.assets[0].path = data.assets[0].path.replace(/Libby/iu, 'Sonia'); },
    data => { data.assets[0].codec = 'wav'; },
    data => { data.assets[0].trustedComposition = true; }
  ]) {
    const input = defaultManifest();
    change(input);
    assert.throws(() => validateBookPortableAudioManifest(input), { code: 'INVALID_PORTABLE_MANIFEST' });
  }
});

test('portable relative paths round-trip and reject unsafe or colliding names', async () => {
  assert.match(path, /^RF_[A-F0-9]{64}__EDGE__LIBBY\.mp3$/u);
  const full = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: 'full-sha256-' + 'a'.repeat(64), engine: 'derived', voiceId: 'multi-speaker', extension: 'wav' });
  assert.equal(full, 'FULL_' + 'A'.repeat(64) + '__DERIVED__MULTI-SPEAKER.wav');
  assert(textVoiceFilenameTokenMatches('SPEAKER', 'multi-speaker'));
  assert(textVoiceFilenameTokenMatches('Libby', 'en-GB-LibbyNeural'));
  const filename = `Audio/RF/EN/${path}`;
  const blob = await buildStoredZipBlob([{ filename, blob: audio }], { relativePaths: true });
  const archive = await openPortableAudioZip(blob);
  assert.equal(archive.entries[0].filename, filename);
  for (const unsafe of ['../audio.mp3', 'CON/audio.mp3', 'Audio/a.mp3.']) {
    await assert.rejects(buildStoredZipBlob([{ filename: unsafe, blob: audio }], { relativePaths: true }));
  }
  await assert.rejects(buildStoredZipBlob([{ filename, blob: audio }, { filename: filename.toLowerCase(), blob: audio }], { relativePaths: true }));
  for (const names of [['Audio', 'audio/RF/x.mp3'], ['audio/RF/x.mp3', 'Audio'], ['\u212b', '\u00c5/x.mp3']]) {
    await assert.rejects(buildStoredZipBlob(names.map(name => ({ filename: name, blob: audio })), { relativePaths: true }));
  }
  await assert.rejects(buildStoredZipBlob([{ filename: 'x'.repeat(241), blob: audio }], { relativePaths: true }));
});

test('native IDs cannot substitute for owner UIDs and exact current authored content', () => {
  const targets = listBookPortableTargets(snapshot, tree.id);
  assert.equal(resolveBookPortableReference(snapshot, targets, ref, asset).entry.target.segmentId, segment.id);
  const stale = { ...snapshot, segments: snapshot.segments.map(row => row.id === segment.id ? { ...row, text: 'Different text' } : row) };
  assert.equal(resolveBookPortableReference(stale, listBookPortableTargets(stale, tree.id), ref, asset).status, 'stale');
  const missing = { ...ref, ownerUid: 'Unknown' };
  assert.equal(resolveBookPortableReference(snapshot, targets, missing, asset).status, 'unmatched');
  const copyHint = { ...missing, workspaceUid: 'Other library' };
  assert.equal(resolveBookPortableReference(snapshot, targets, copyHint, asset).status, 'matched');
  const duplicate = { ...snapshot, segments: snapshot.segments.map(row => row.id === block.segments[1].id ? { ...row, text: segment.text } : row) };
  assert.equal(resolveBookPortableReference(duplicate, listBookPortableTargets(duplicate, tree.id), copyHint, asset).status, 'ambiguous');
});

test('strict ZIP validates CRC, path case collisions, archive ranges and local names', async () => {
  const original = await zip([[path, audio]]);
  const archive = await openPortableAudioZip(original);
  assert.deepEqual(await (await archive.read(archive.entries[0])).arrayBuffer(), await audio.arrayBuffer());
  await assert.rejects(openPortableAudioZip(await zip([[path, audio], [path.toLowerCase(), audio]])), /duplicate/iu);
  const corrupted = new Uint8Array(await original.arrayBuffer());
  corrupted[archive.entries[0].dataStart] ^= 1;
  const badCrc = await openPortableAudioZip(new Blob([corrupted]));
  await assert.rejects(badCrc.read(badCrc.entries[0]), /CRC/u);
  const wrongLocal = new Uint8Array(await original.arrayBuffer());
  wrongLocal[30] = 'X'.charCodeAt(0);
  await assert.rejects(openPortableAudioZip(new Blob([wrongLocal])), /local entry name/iu);
  await assert.rejects(openPortableAudioZip(original.slice(0, original.size - 4)), /end-of-central-directory/iu);
});

const compressedZip = async (data, declaredSize = data.size) => {
  const source = await zip([['test.bin', data]]);
  const before = new Uint8Array(await source.arrayBuffer());
  const compressed = deflateRawSync(new Uint8Array(await data.arrayBuffer()));
  const start = 30 + 'test.bin'.length;
  const oldCentral = start + data.size;
  const central = before.slice(oldCentral);
  const local = before.slice(0, start);
  for (const [bytes, method, packed, unpacked] of [[local, 8, 18, 22], [central, 10, 20, 24]]) {
    const view = new DataView(bytes.buffer);
    view.setUint16(method, 8, true);
    view.setUint32(packed, compressed.length, true);
    view.setUint32(unpacked, declaredSize, true);
  }
  new DataView(central.buffer).setUint32(central.length - 6, start + compressed.length, true);
  return new Blob([local, compressed, central]);
};

test('deflate reads enforce the declared output limit before retaining expanded bytes', async () => {
  const data = new Blob(['audio bounds '.repeat(1000)]);
  const encoded = await openPortableAudioZip(await compressedZip(data));
  assert.equal(await crc32Blob(await encoded.read(encoded.entries[0])), await crc32Blob(data));
  const overrun = await openPortableAudioZip(await compressedZip(data, 2));
  await assert.rejects(overrun.read(overrun.entries[0]), /expanded past/u);
});

test('an invalid v3 package never reaches the publisher, including duplicate manifest and undeclared audio', async () => {
  const manifest = new Blob([JSON.stringify(defaultManifest())]);
  const invalid = await zip([[TEXT_AUDIO_MANIFEST_FILENAME, manifest], [TEXT_AUDIO_MANIFEST_FILENAME.toUpperCase(), manifest], [path, audio]]);
  const extra = await zip([[TEXT_AUDIO_MANIFEST_FILENAME, manifest], [path, audio], ['sneaky.mp3', audio]]);
  const missing = await zip([[TEXT_AUDIO_MANIFEST_FILENAME, manifest]]);
  const report = await importBookPortableAudio({ files: [invalid, extra, missing], snapshot, workspaceId: tree.id,
    publish: () => assert.fail('Invalid package reached publication') });
  assert.deepEqual(report.issues.map(issue => issue.status), ['invalid-archive', 'invalid-archive', 'missing']);
  assert.equal(report.issues.at(-1).logicalReferences, 2);
  assert.equal(report.logicalCommitted, 0);
});

const preferences = { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeRate: 0, edgePitch: 0 };
const proof = { digest: asset.digest, format: asset.codec, sampleRate: asset.sampleRate, bytes: asset.size };
const docTree = source => resolveTextLibraryDocumentTree(source, ids.documentId);
const body = (source, prefs = preferences) => docTree(source).blocks.flatMap(card =>
  getBookBodyGenerationRequests(docTree(source), card, 'text', { options: { preferences: prefs, globalRate: 1 } }));
const record = (source, ...items) => applyBookQaAudioOperation(source, items.map(item => ({ ...item, binary: proof })), 42).snapshot;
const coverage = (report, kind, channel = 'text') => report.coverage.find(row => row.representation === kind && row.channel === channel);
const readReady = async () => ({ status: 'ready', blob: audio, binary: proof });
const reportFor = (source, options = {}) => exportBookPortableAudio({ snapshot: source, workspaceId: ids.documentId, preferences, read: readReady, ...options });

const firstNine = () => {
  const chosen = new Set(tree.blocks.flatMap(card => card.segments).slice(0, 9).map(row => row.id));
  return {
    ...snapshot,
    documents: snapshot.documents.map(row => ({ ...row, metadata: { ...row.metadata, bookMainTitleV1: { mode: 'custom', en: 'An unrecorded title' } } })),
    blocks: snapshot.blocks.map(row => ({ ...row, title: '', metadata: { ...row.metadata, bookHeadingV1: {} } })),
    segments: snapshot.segments.filter(row => chosen.has(row.id)).map(row => ({ ...row, meaning: '' }))
  };
};

test('export reports two recorded and seven missing EN Split requirements, and skips blank Heading channels', async () => {
  const source = firstNine();
  const entries = body(source);
  assert.equal(entries.length, 9);
  const { report, manifest } = await reportFor(record(source, entries[4], entries[6]));
  assert.deepEqual(coverage(report, 'split'), {
    representation: 'split', channel: 'text', expected: 9, available: 2, exported: 2, alternateExported: 0,
    statuses: { missing: 7, ready: 2 }
  });
  assert.equal(coverage(report, 'main-title').statuses.missing, 1);
  assert.equal(coverage(report, 'main-title', 'meaning'), undefined);
  assert.equal(coverage(report, 'paragraph-heading'), undefined);
  assert.equal(coverage(report, 'scene-heading'), undefined);
  assert.equal(coverage(report, 'split', 'meaning'), undefined);
  assert.equal(report.omissions.filter(row => row.ref.representation === 'split' && row.status === 'missing').length, 7);
  assert.equal(manifest.references.length, 2);
});

test('coverage distinguishes metadata-only, corrupt, stale and alternate references from current ready slots', async () => {
  const source = firstNine();
  const [one, two, three, four] = body(source);
  const alternate = body(source, { ...preferences, edgeRate: 5, edgePitch: 3 })[0];
  const recorded = record(source, one, two, three, four, alternate);
  const changed = { ...recorded, segments: recorded.segments.map(row => row.id === four.target.segmentId ? { ...row, text: 'Edited fourth sentence' } : row) };
  const read = async rf => rf === two.fingerprint ? { status: 'metadata-only' }
    : rf === three.fingerprint ? { status: 'corrupt' } : readReady();
  const { report } = await reportFor(changed, { read });
  assert.deepEqual(coverage(report, 'split').statuses, { ready: 1, 'metadata-only': 1, corrupt: 1, missing: 6 });
  assert.equal(coverage(report, 'split').alternateExported, 1);
  assert.equal(coverage(report, 'split').available, 1);
  assert(report.omissions.some(row => row.ref.fingerprint === four.fingerprint && row.status === 'stale'));
  const onlyCurrent = await reportFor(changed, { read, includeAlternate: false });
  assert.equal(coverage(onlyCurrent.report, 'split').available, 1);
  assert.equal(coverage(onlyCurrent.report, 'split').alternateExported, 0);
});

test('coverage counts shared RF consumers separately and keeps missing composition inputs unavailable', async () => {
  const source = firstNine();
  const doc = docTree(source), [split] = body(source);
  const titled = { ...source, documents: source.documents.map(row => ({
    ...row, metadata: { ...row.metadata, bookMainTitleV1: { mode: 'custom', en: doc.blocks[0].segments[0].text } }
  })) };
  const atomic = planBookAtomicGeneration(docTree(titled), null, 'mainTitle', 'text', preferences);
  assert.equal(atomic.fingerprint, split.fingerprint);
  let calls = 0;
  const { report, manifest } = await reportFor(record(titled, split, atomic), { read: async () => { calls++; return readReady(); } });
  assert.equal(calls, 1);
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.references.length, 2);
  assert.equal(coverage(report, 'split').available, 1);
  assert.equal(coverage(report, 'main-title').available, 1);
  assert.equal(coverage(report, 'full-conversation').available, 0);
  assert.equal(coverage(report, 'full-conversation').statuses['missing-composition-input'], 1);
});

test('normal listening ZIP retains shared logical occurrences and reports missing unit inputs', async () => {
  const source = firstNine(), doc = docTree(source), [split] = body(source);
  const titled = { ...source, documents: source.documents.map(row => ({ ...row,
    metadata: { ...row.metadata, bookMainTitleV1: { mode: 'custom', en: doc.blocks[0].segments[0].text } } })) };
  const atomic = planBookAtomicGeneration(docTree(titled), null, 'mainTitle', 'text', preferences);
  const before = record(titled, split, atomic);
  const copy = structuredClone(before);
  const { blob, report } = await exportBookNormalAudio({ snapshot: before, workspaceId: ids.documentId, preferences,
    read: readReady, channels: ['text'], representations: ['main-title', 'split', 'unit'] });
  const archive = await openPortableAudioZip(blob);
  assert.equal(report.logical, 2);
  assert.equal(archive.entries.length, 2);
  assert(archive.entries.some(item => item.filename.includes('/00_Title/EN_LIBBY.mp3')));
  assert(archive.entries.some(item => item.filename.includes('/Split/SC01/SG01_EN_LIBBY.mp3')));
  assert(report.omissions.some(item => item.status === 'missing-unit-input'));
  assert.deepEqual(before, copy);
});

test('normal listening reports corrupt bytes and rejects non-unit composition rates', async () => {
  const source = firstNine();
  const doc = docTree(source), scene = doc.blocks.find(card => card.blockType === 'conversation' && card.segments.length);
  const changed = { ...source, blocks: source.blocks.map(card => card.id === scene.id ? { ...card,
    metadata: buildTextStructuredPlaybackRateProfileMetadata({ metadata: card.metadata, channel: 'text', rate: 1.2 }) } : card) };
  const items = body(changed);
  const { report } = await exportBookNormalAudio({ snapshot: record(changed, ...items), workspaceId: ids.documentId,
    preferences, channels: ['text'], representations: ['unit', 'split'], read: async () => ({ status: 'corrupt' }) });
  assert(report.omissions.some(item => item.status === 'corrupt'));
  assert(report.omissions.some(item => item.status === 'unsupported-unit-rate'));
});

test('normal listening respects channel, alternate profile and cancellation choices', async () => {
  const source = firstNine(), current = body(source)[0], alternate = body(source, { ...preferences, edgeRate: 5 })[0];
  const saved = record(source, current, alternate);
  const options = { snapshot: saved, preferences, read: readReady, channels: ['text'], representations: ['split'] };
  const onlyCurrent = await exportBookNormalAudio(options);
  const allProfiles = await exportBookNormalAudio({ ...options, includeAlternate: true });
  assert.equal(onlyCurrent.report.logical, 1);
  assert.equal(allProfiles.report.logical, 2);
  assert.equal((await exportBookNormalAudio({ ...options, channels: ['meaning'] })).blob, null);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(exportBookNormalAudio({ ...options, signal: controller.signal }), { code: 'AUDIO_CANCELLED' });
});

test('recorded Full with missing durable input stays unavailable and unverified composition is only a verified export', async () => {
  const source = firstNine(), doc = docTree(source);
  const scene = doc.blocks.find(row => row.blockType === 'conversation' && row.segments.length);
  const splits = body(source).filter(item => item.target.cardId === scene.id);
  const [full] = getBookBodyGenerationRequests(doc, scene, 'text', { full: true, options: { preferences, globalRate: 1 } });
  const derivedName = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: full.fingerprint, engine: 'derived', voiceId: 'multi-speaker', extension: 'wav' });
  assert(derivedName.endsWith('__DERIVED__MULTI-SPEAKER.wav'));
  assert(portableFilenameMatches(derivedName, full.fingerprint, full.descriptor, 'wav'));
  assert(portableFilenameMatches(derivedName.replace('MULTI-SPEAKER', 'SPEAKER'), full.fingerprint, full.descriptor, 'wav'));
  const pcm = Buffer.alloc(46);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) pcm.write(text, offset);
  for (const [offset, number] of [[4, 38], [16, 16], [24, 48000], [28, 96000], [40, 2]]) pcm.writeUInt32LE(number, offset);
  for (const [offset, number] of [[20, 1], [22, 1], [32, 2], [34, 16]]) pcm.writeUInt16LE(number, offset);
  const binary = { digest: createHash('sha256').update(pcm).digest('hex'), format: 'wav', sampleRate: 48000, bytes: pcm.length };
  const persisted = applyBookQaAudioOperation(record(source, ...splits), [{ ...full, binary }], 43).snapshot;
  const wav = { status: 'ready', blob: new Blob([pcm]), binary };
  const { report, manifest } = await reportFor(persisted, { read: async rf => rf === full.fingerprint ? wav : readReady() });
  assert.equal(coverage(report, 'full-conversation').available, 0);
  assert.equal(coverage(report, 'full-conversation').exported, 1);
  assert.equal(coverage(report, 'full-conversation').statuses['unverified-composition'], 1);
  assert(manifest.references.some(row => row.fingerprint === full.fingerprint));
  const listening = await exportBookNormalAudio({ snapshot: persisted, workspaceId: ids.documentId, preferences,
    channels: ['text'], representations: ['full'], read: async rf => rf === full.fingerprint ? wav : readReady() });
  assert(listening.report.omissions.some(row => row.ref?.fingerprint === full.fingerprint && row.status === 'unverified-composition'));
  const missing = await reportFor(persisted, { read: async rf => rf === full.fingerprint ? wav : { status: 'metadata-only' } });
  assert.equal(missing.blob, null);
  assert.equal(coverage(missing.report, 'full-conversation').statuses['missing-composition-input'], 1);

  const unsupported = { ...source, blocks: source.blocks.map(row => row.id === scene.id ? { ...row,
    metadata: buildTextStructuredPlaybackRateProfileMetadata({ metadata: row.metadata, channel: 'text', rate: 1.2 })
  } : row) };
  const blocked = await reportFor(unsupported);
  assert.equal(coverage(blocked.report, 'full-conversation').statuses['unsupported-composition'], 1);
});

test('loose RF requirements include unrecorded atomic targets with strict logical ambiguity', async () => {
  const source = firstNine();
  const paragraph = docTree(source).blocks[0], scene = docTree(source).blocks.find(row => row.blockType === 'conversation');
  const titled = { ...source, blocks: source.blocks.map(row => row.id === paragraph.id || row.id === scene.id
    ? { ...row, title: row.id === paragraph.id ? 'Unique paragraph heading' : 'Unique scene heading' } : row) };
  const doc = docTree(titled), targets = listBookPortableTargets(titled, doc.id);
  const known = bookPortableLegacyRequirements(titled, targets, preferences);
  for (const [card, representation] of [[null, 'main-title'], [doc.blocks[0], 'paragraph-heading'], [doc.blocks.find(row => row.blockType === 'conversation'), 'scene-heading']]) {
    const request = planBookAtomicGeneration(doc, card, card ? 'heading' : 'mainTitle', 'text', preferences);
    assert.deepEqual(known.get(request.fingerprint), request.descriptor);
    assert.equal(resolveBookPortableReference(titled, targets, { representation: 'rf' }, request).representation, representation);
  }
  const split = body(titled)[0];
  const shared = { ...titled, documents: titled.documents.map(row => ({
    ...row, metadata: { ...row.metadata, bookMainTitleV1: { mode: 'custom', en: doc.blocks[0].segments[0].text } }
  })) };
  assert.equal(resolveBookPortableReference(shared, listBookPortableTargets(shared, doc.id), { representation: 'rf' }, split).status, 'ambiguous');
  assert.equal(resolveBookPortableReference(shared, listBookPortableTargets(shared, doc.id), { ...mirror, workspaceUid: doc.uid, ownerUid: doc.uid }, split).representation, 'main-title');
  const different = planBookAtomicGeneration(doc, doc.blocks[0], 'heading', 'text', { ...preferences, edgeRate: 17 });
  const name = buildCanonicalTextRenderAudioFilename({ renderFingerprint: different.fingerprint, engine: 'edge', voiceId: different.descriptor.voiceId });
  const report = await importBookPortableAudio({ files: [new File([audio], name)], snapshot: titled, workspaceId: doc.id, preferences,
    publish: () => assert.fail('A mismatched Heading RF reached publication') });
  assert.equal(report.issues[0].status, 'legacy-unverified');
  assert.equal(report.logicalCommitted, 0);
});
