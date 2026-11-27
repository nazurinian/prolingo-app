import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildCanonicalTextRenderAudioFilename, TEXT_AUDIO_MANIFEST_FILENAME } from '../src/domain/text/textFilenameDomain.js';
import { buildBookPortableAudioManifest, validateBookPortableAudioManifest } from '../src/domain/text/bookPortableAudioManifestDomain.js';
import { validateProLingoTextAudioManifest } from '../src/domain/text/textAudioManifestDomain.js';
import { listBookPortableTargets, resolveBookPortableReference } from '../src/domain/text/bookPortableAudioDomain.js';
import { buildStoredZipBlob, crc32Blob } from '../src/services/audio/browserZipService.js';
import { openPortableAudioZip } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import { importBookPortableAudio } from '../src/services/audio/bookPortableAudioService.js';

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
    data => { data.assets[0].path = data.assets[0].path.replace('Libby', 'Sonia'); },
    data => { data.assets[0].codec = 'wav'; },
    data => { data.assets[0].trustedComposition = true; }
  ]) {
    const input = defaultManifest();
    change(input);
    assert.throws(() => validateBookPortableAudioManifest(input), { code: 'INVALID_PORTABLE_MANIFEST' });
  }
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
