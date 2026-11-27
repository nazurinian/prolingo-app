import { createJourneyToLondonFixture } from '../uat4/journey-to-london.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../../../src/domain/text/textPackJsonDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { getBookBodyGenerationRequests } from '../../../src/domain/text/bookQaBodyAudioDomain.js';
import { planBookAtomicGeneration } from '../../../src/domain/text/bookQaHeadingAudioDomain.js';
import { seedDisposableTextManagementDatabase } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { buildStoredZipBlob } from '../../../src/services/audio/browserZipService.js';
import { openPortableAudioZip } from '../../../src/services/audio/textStructuredAudioZipArchiveService.js';
import { buildBookPortableAudioManifest } from '../../../src/domain/text/bookPortableAudioManifestDomain.js';
import { buildCanonicalTextRenderAudioFilename, TEXT_AUDIO_MANIFEST_FILENAME } from '../../../src/domain/text/textFilenameDomain.js';
import { validateBookAudioBytes } from '../../../src/services/audio/bookQaAudioBytes.js';
import { withAddFault } from '../a1b-1a/audio-browser-probe.js';

const preferences = { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 };
const options = { preferences, globalRate: 1, audioSourceMode: 'local-first' };
const json = value => new Blob([JSON.stringify(value)]);
const packZip = (manifest, assets) => buildStoredZipBlob([
  { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: json(manifest) }, ...assets
], { relativePaths: true });
const check = (condition, message) => { if (!condition) throw Error(message); };
const encoded = async blob => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let data = '';
  for (let start = 0; start < bytes.length; start += 8192) data += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(data);
};
const tone = async name => {
  const raw = await fetch('/__book_audio_' + name + '.mp3').then(response => response.blob());
  return new Blob(Array(14).fill(raw), { type: 'audio/mpeg' });
};

export const seedPortableSource = async name => {
  const fixture = createJourneyToLondonFixture();
  const tree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const [p1, c1] = tree.blocks;
  const title = p1.segments[0].text;
  let snapshot = fixture.snapshot;
  for (const [type, payload] of [
    ['document.update', { id: tree.id, metadata: { ...tree.metadata, bookMainTitleV1: { mode: 'custom', en: title, id: 'Judul portabel' } } }],
    ['block.update', { id: p1.id, title, metadata: { ...p1.metadata, bookHeadingV1: { id: 'Judul paragraf' } } }],
    ['block.update', { id: c1.id, title: 'Portable conversation', metadata: { ...c1.metadata, bookHeadingV1: { id: 'Judul adegan' } } }]
  ]) snapshot = applyTextLibraryCommand(snapshot, { type, payload }, 42).snapshot;
  await seedDisposableTextManagementDatabase({ dbName: name, snapshot, createOnly: true });
  return { workspaceId: tree.id, workspaceUid: tree.uid, segmentUid: p1.segments[0].uid,
    pack: createProLingoTextPack({ snapshot, rootId: tree.id }) };
};

export const seedPortableDestination = async (name, pack) => {
  const local = createJourneyToLondonFixture();
  const tree = resolveTextLibraryDocumentTree(local.snapshot, local.ids.documentId);
  const [paragraph, scene] = tree.blocks;
  const titled = applyTextLibraryCommand(local.snapshot, { type: 'document.update', payload: {
    id: tree.id, metadata: { ...tree.metadata, bookMainTitleV1: { mode: 'custom', en: 'A unique loose Main Title' } }
  } }, 42).snapshot;
  const prepared = { ...titled, blocks: titled.blocks.map(row => row.id === paragraph.id || row.id === scene.id
    ? { ...row, title: row.id === paragraph.id ? 'A unique loose Paragraph Heading' : 'A unique loose Scene Heading' } : row) };
  const preserve = mergeProLingoTextPack({ localSnapshot: prepared, pack, uidMode: 'preserve' }).snapshot;
  const copied = mergeProLingoTextPack({ localSnapshot: preserve, pack, uidMode: 'new-copy' }).snapshot;
  await seedDisposableTextManagementDatabase({ dbName: name, snapshot: copied, createOnly: true });
  return { decoy: local.ids.documentId, preserve: preserve.documents.at(-1).id, copy: copied.documents.at(-1).id };
};

export const looseAtomicPortableFixture = async (connection, workspaceId) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const [paragraph, scene] = tree.blocks;
  const entries = [planBookAtomicGeneration(tree, null, 'mainTitle', 'text', preferences),
    planBookAtomicGeneration(tree, paragraph, 'heading', 'text', preferences),
    planBookAtomicGeneration(tree, scene, 'heading', 'text', preferences)];
  const wrong = planBookAtomicGeneration(tree, scene, 'heading', 'text', { ...preferences, edgeRate: 17 });
  const bytes = await encoded(await tone(440));
  const fileFor = entry => ({ bytes, name: buildCanonicalTextRenderAudioFilename({
    renderFingerprint: entry.fingerprint, engine: entry.descriptor.engine, voiceId: entry.descriptor.voiceId
  }) });
  return { entries, files: entries.map(fileFor), wrong: fileFor(wrong) };
};

export const buildPortableFixture = async (connection, workspaceId) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const [paragraph, scene] = tree.blocks;
  const all = tree.blocks.flatMap(block => getBookBodyGenerationRequests(tree, block, 'text', { options }));
  const blob = await tone(440);
  const first = [all[0], ...all.filter(entry => entry.target.cardId === scene.id)];
  const full = getBookBodyGenerationRequests(tree, paragraph, 'text', { full: true, options })[0];
  const alt = getBookBodyGenerationRequests(tree, paragraph, 'text', {
    segment: paragraph.segments[0], options: { ...options, preferences: { ...preferences, edgeRate: 6, edgePitch: 3 } }
  })[0];
  await connection.audio.submit([...first, full].map(entry => ({ ...entry, blob })));
  const atomic = [planBookAtomicGeneration(tree, null, 'mainTitle', 'text', preferences),
    planBookAtomicGeneration(tree, paragraph, 'heading', 'text', preferences),
    planBookAtomicGeneration(tree, scene, 'heading', 'text', preferences),
    planBookAtomicGeneration(tree, null, 'mainTitle', 'meaning', preferences)];
  await connection.audio.generate(atomic);
  const partA = await connection.audio.exportPortable({ workspaceId, preferences });
  const remaining = all.filter(entry => !first.some(item => item.fingerprint === entry.fingerprint));
  await connection.audio.submit([...remaining, alt].map(entry => ({ ...entry, blob })));
  const derived = getBookBodyGenerationRequests(tree, scene, 'text', { full: true, options })[0];
  await connection.audio.generate([derived]);
  const complete = await connection.audio.exportPortable({ workspaceId, preferences });
  const currentOnly = await connection.audio.exportPortable({ workspaceId, preferences, includeAlternate: false });
  check(complete.manifest.assets.some(asset => asset.fingerprint === alt.fingerprint), 'Alternate profile omitted from complete export');
  check(!currentOnly.manifest.assets.some(asset => asset.fingerprint === alt.fingerprint), 'Current-only export included an alternate');
  const archive = await openPortableAudioZip(complete.blob);
  const contents = async asset => archive.read(archive.entries.find(entry => entry.filename === asset.path));
  const onlyB = complete.manifest.assets.filter(asset => !partA.manifest.assets.some(row => row.fingerprint === asset.fingerprint));
  const targetsB = new Set(onlyB.map(asset => asset.fingerprint));
  const partB = await packZip(buildBookPortableAudioManifest(onlyB, complete.manifest.references.filter(ref => targetsB.has(ref.fingerprint))),
    await Promise.all(onlyB.map(async asset => ({ filename: asset.path, blob: await contents(asset) }))));
  const derivedAsset = complete.manifest.assets.find(asset => asset.fingerprint === derived.fingerprint);
  const derivedOnly = await packZip(buildBookPortableAudioManifest([derivedAsset],
    complete.manifest.references.filter(ref => ref.fingerprint === derived.fingerprint)),
  [{ filename: derivedAsset.path, blob: await contents(derivedAsset) }]);

  const shared = complete.manifest.assets.find(asset => asset.fingerprint === all[0].fingerprint);
  const historicalSplit = complete.manifest.assets.find(asset => asset.fingerprint === all[1].fingerprint);
  const renderedFull = complete.manifest.assets.find(asset => asset.fingerprint === full.fingerprint);
  const oneReference = complete.manifest.references.find(ref => ref.fingerprint === shared.fingerprint && ref.representation === 'split');
  const historical = [];
  for (const version of [1, 2, 0]) {
    const legacy = { packageType: complete.manifest.packageType, packageVersion: version, entries: [
      { representation: 'split', rf: historicalSplit.fingerprint, filename: historicalSplit.path, ...(version === 2 ? { render: historicalSplit.descriptor } : {}) }
    ] };
    const assetEntry = { filename: historicalSplit.path, blob: await contents(historicalSplit) };
    historical.push(await encoded(await buildStoredZipBlob([
      ...(version ? [{ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: json(legacy) }] : []), assetEntry
    ], { relativePaths: true })));
  }
  const corruptManifest = buildBookPortableAudioManifest([{ ...shared, digest: '0'.repeat(64) }], [oneReference]);
  const corrupt = await packZip(corruptManifest, [{ filename: shared.path, blob: await contents(shared) }]);
  const badAudio = await packZip(buildBookPortableAudioManifest([shared], [oneReference]), [{ filename: shared.path, blob: new Blob(['misleading MP3']) }]);
  const conflictBytes = await tone(660);
  const proof = await validateBookAudioBytes(conflictBytes, 'mp3');
  const conflictManifest = buildBookPortableAudioManifest([{ ...shared, digest: proof.digest, size: proof.bytes, sampleRate: proof.sampleRate }], [oneReference]);
  const conflicting = await packZip(conflictManifest, [{ filename: shared.path, blob: conflictBytes }]);
  const duplicateManifest = await buildStoredZipBlob([
    { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: json(complete.manifest) },
    { filename: TEXT_AUDIO_MANIFEST_FILENAME.toUpperCase(), blob: json(complete.manifest) }
  ]);
  const conflict = await connection.audio.submit([{ ...all[0], blob: conflictBytes }]).then(() => null, error => error.code);
  check(conflict === 'AUDIO_BYTE_CONFLICT', 'Conflicting accepted physical bytes were replaced');
  const loose = await Promise.all([historicalSplit, renderedFull].map(async asset => ({ name: asset.path, bytes: await encoded(await contents(asset)) })));
  const ambiguous = { name: shared.path, bytes: await encoded(await contents(shared)) };
  const historicalExplicit = await encoded(await packZip({
    packageType: complete.manifest.packageType, packageVersion: 2, entries: [{
      representation: 'split', rf: shared.fingerprint, filename: shared.path, render: shared.descriptor,
      references: [{ representation: 'split', documentUid: tree.uid, segmentUid: paragraph.segments[0].uid, channel: 'text' }]
    }]
  }, [{ filename: shared.path, blob: await contents(shared) }]));
  return {
    partA: await encoded(partA.blob), partB: await encoded(partB), complete: await encoded(complete.blob), derivedOnly: await encoded(derivedOnly),
    historical, historicalExplicit, loose, ambiguous, problems: await Promise.all([corrupt, badAudio, duplicateManifest].map(encoded)), conflicting: await encoded(conflicting),
    manifest: complete.manifest, first: all[0], alternate: alt, derived,
    partACount: partA.manifest.references.length, partBCount: complete.manifest.references.length - partA.manifest.references.length
  };
};

export const portableFixtureFiles = data => data.map((part, index) => new File(
  [Uint8Array.from(atob(typeof part === 'string' ? part : part.bytes), character => character.charCodeAt(0))],
  typeof part === 'string' ? 'fixture-' + index + '.zip' : part.name
));

export const importPortableFixture = async (connection, workspaceId, data, mode = null) => {
  const files = portableFixtureFiles(data);
  const cancel = new AbortController();
  const run = () => connection.audio.importPortable(files, { workspaceId, preferences, signal: cancel.signal, onProgress: () => {
    if (mode === 'cancel') cancel.abort();
  } });
  if (mode !== 'uncertain') return run();
  const original = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  let first = true;
  return withAddFault('meta', value => value.key?.startsWith('bookQaAudioCommitV1:'), tx => {
    if (first) original.set.call(tx, () => tx.onerror(new Event('error')));
    first = false;
  }, run);
};

export const seedUnrelatedPortableAudio = async (connection, workspaceId) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const [block] = tree.blocks;
  const [entry] = getBookBodyGenerationRequests(tree, block, 'meaning', { segment: block.segments[0], options });
  await connection.audio.submit([{ ...entry, blob: await tone(660) }]);
  return entry;
};

export const readPortableFixtureBindings = async (connection, workspaceId, entries) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const [block, scene] = tree.blocks;
  const split = getBookBodyGenerationRequests(tree, block, 'text', { segment: block.segments[0], options })[0];
  const title = planBookAtomicGeneration(tree, null, 'mainTitle', 'text', preferences);
  const heading = planBookAtomicGeneration(tree, block, 'heading', 'text', preferences);
  const full = { ...entries.derived, target: { documentId: tree.id, documentUid: tree.uid, cardId: scene.id, cardUid: scene.uid } };
  const alternate = { ...split, fingerprint: entries.alternate.fingerprint, descriptor: entries.alternate.descriptor };
  const [a, b, c, d, e] = await Promise.all([split, title, heading, full, alternate].map(entry => connection.audio.readRuntime(entry)));
  return { states: [a, b, c, d, e].map(result => result.status), shared: a.id === b.id && b.id === c.id && a.url === b.url,
    compositionTrusted: d.trustedComposition === true,
    identity: [tree.uid, block.segments[0].uid, tree.blocks.length, tree.blocks.flatMap(item => item.units).length, tree.blocks.flatMap(item => item.segments).length] };
};
