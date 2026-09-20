import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildCanonicalTextRenderAudioFilename,
  buildCanonicalTextFullArtifactFilename,
  parseCanonicalTextFullArtifactFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildProLingoTextAudioManifest,
  parseProLingoTextAudioManifestJson,
  TEXT_AUDIO_MANIFEST_FILENAME
} from '../src/domain/text/textAudioManifestDomain.js';
import { buildTextAudioIndexCsv, TEXT_AUDIO_INDEX_FILENAME } from '../src/domain/text/textAudioIndexDomain.js';
import { scanTextStructuredAudioZipFiles, readTextStructuredAudioZipRuntimeBlob } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import { buildStoredZipBlob } from '../src/services/audio/browserZipService.js';
import { planTextAudioStagingGarbage } from '../src/services/persistence/textAudioStagingGcService.js';
import { resolveTextAudioStagingPhysicalIdentity } from '../src/services/persistence/textAudioStagingService.js';

let checks = 0;
const check = async (name, fn) => {
  await fn(); checks += 1;
  console.log(`PASS ${checks}: ${name}`);
};

const document = { id: 'DOCUMENT_000001', uid: 'doc-uid-p4', title: 'P4 Workspace', editorModel: 'structured-v1' };
const block = { id: 'TEXT_000001', uid: 'block-uid-p4', documentId: document.id, order: 1, type: 'paragraph', metadata: {} };
const segments = [
  { id: 'SEGMENT_000001', uid: 'seg-uid-a', blockId: block.id, documentId: document.id, order: 1, text: 'First sentence.', meaning: 'Kalimat pertama.', joinAfter: 'space' },
  { id: 'SEGMENT_000002', uid: 'seg-uid-b', blockId: block.id, documentId: document.id, order: 2, text: 'Second sentence.', meaning: 'Kalimat kedua.', joinAfter: 'space' }
];
const blockTree = { ...block, segments };
const splitProfile = { channel: 'text', content: segments[0].text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 };
const splitIdentity = buildTextStructuredAudioRenderFingerprint(splitProfile);
const splitFilename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: splitIdentity.renderFingerprint, engine: splitProfile.engine, voiceId: splitProfile.voiceId, extension: 'mp3' });
const splitRequirement = {
  documentId: document.id,
  blockId: block.id,
  segmentId: segments[0].id,
  channel: 'text',
  engine: splitProfile.engine,
  voiceId: splitProfile.voiceId,
  content: splitProfile.content,
  renderFingerprint: splitIdentity.renderFingerprint,
  contentFingerprintV2: splitIdentity.contentFingerprintV2,
  renderDescriptor: splitIdentity.descriptor
};
const maisieSplitProfile = { ...splitProfile, voiceId: 'en-GB-MaisieNeural' };
const maisieSplitIdentity = buildTextStructuredAudioRenderFingerprint(maisieSplitProfile);
const maisieSplitFilename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: maisieSplitIdentity.renderFingerprint, engine: maisieSplitProfile.engine, voiceId: maisieSplitProfile.voiceId, extension: 'mp3' });

const libbyFull = buildTextStructuredFullArtifactRecord({
  block: blockTree, channel: 'text', language: 'en-GB', engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0
});
const maisieFull = buildTextStructuredFullArtifactRecord({
  block: blockTree, channel: 'text', language: 'en-GB', engine: 'edge', voiceId: 'en-GB-MaisieNeural', rate: 0, pitch: 0
});
const libbyFullFilename = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: libbyFull.fullArtifactFingerprint, engine: 'edge', voiceId: libbyFull.descriptor.voiceId, extension: 'mp3' });
const maisieFullFilename = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: maisieFull.fullArtifactFingerprint, engine: 'edge', voiceId: maisieFull.descriptor.voiceId, extension: 'mp3' });

await check('Full canonical filename round-trips its full SHA-256 identity', async () => {
  const parsed = parseCanonicalTextFullArtifactFilename(libbyFullFilename);
  assert.equal(parsed.fullArtifactFingerprint, libbyFull.fullArtifactFingerprint);
  assert.equal(parsed.representation, 'full');
});

await check('Manifest v2 stores Split and Full physical identities independently', async () => {
  const manifest = buildProLingoTextAudioManifest({ entries: [
    { representation: 'split', rf: splitIdentity.renderFingerprint, filename: splitFilename, size: 4, render: splitIdentity.descriptor },
    { representation: 'full', fullArtifactFingerprint: libbyFull.fullArtifactFingerprint, filename: libbyFullFilename, size: 5, render: libbyFull.descriptor }
  ] });
  assert.equal(manifest.packageVersion, 2);
  assert.deepEqual(manifest.entries.map(entry => entry.representation), ['split', 'full']);
  assert.equal(manifest.entries[1].fullArtifactFingerprint, libbyFull.fullArtifactFingerprint);
});

await check('Manifest v1 remains backward-compatible as Split-only', async () => {
  const parsed = parseProLingoTextAudioManifestJson(JSON.stringify({
    packageType: 'prolingo-text-audio-manifest', packageVersion: 1, createdAt: new Date(0).toISOString(), source: null,
    entries: [{ rf: splitIdentity.renderFingerprint, filename: splitFilename, mimeType: 'audio/mpeg', size: 4, render: splitIdentity.descriptor, references: [] }]
  }));
  assert.equal(parsed.entries[0].representation, 'split');
  assert.equal(parsed.entries[0].rf, splitIdentity.renderFingerprint);
});

await check('AUDIO_INDEX.csv names Split/Full rows and logical references', async () => {
  const manifest = buildProLingoTextAudioManifest({ entries: [
    { representation: 'split', rf: splitIdentity.renderFingerprint, filename: splitFilename, size: 4, render: splitIdentity.descriptor, references: [{ documentTitle: document.title, cardId: block.id, segmentId: segments[0].id, channel: 'text', voiceId: splitProfile.voiceId }] },
    { representation: 'full', fullArtifactFingerprint: libbyFull.fullArtifactFingerprint, filename: libbyFullFilename, size: 5, render: libbyFull.descriptor, references: [{ documentTitle: document.title, cardId: block.id, channel: 'text', voiceId: libbyFull.descriptor.voiceId }] }
  ] });
  const csv = buildTextAudioIndexCsv(manifest);
  assert.ok(csv.startsWith('file,representation,identity,'));
  assert.ok(csv.includes(',split,'));
  assert.ok(csv.includes(',full,'));
  assert.ok(csv.includes(document.title));
});

const makePortableZip = async ({ name, fullArtifact, fullFilename, splitRender = splitIdentity, splitName = splitFilename, splitVoice = splitProfile.voiceId, includeSplit = true }) => {
  const splitBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' });
  const fullBlob = new Blob([new Uint8Array([5, 6, 7, 8, 9])], { type: 'audio/mpeg' });
  const entries = [];
  const manifestEntries = [];
  if (includeSplit) {
    entries.push({ filename: splitName, blob: splitBlob });
    manifestEntries.push({ representation: 'split', rf: splitRender.renderFingerprint, filename: splitName, mimeType: 'audio/mpeg', size: splitBlob.size, render: splitRender.descriptor, references: [{ documentId: document.id, cardId: block.id, segmentId: segments[0].id, channel: 'text', voiceId: splitVoice }] });
  }
  entries.push({ filename: fullFilename, blob: fullBlob });
  manifestEntries.push({ representation: 'full', fullArtifactFingerprint: fullArtifact.fullArtifactFingerprint, filename: fullFilename, mimeType: 'audio/mpeg', size: fullBlob.size, render: fullArtifact.descriptor, references: [{ documentId: document.id, cardId: block.id, channel: 'text', voiceId: fullArtifact.descriptor.voiceId }] });
  const manifest = buildProLingoTextAudioManifest({ entries: manifestEntries, source: { kind: 'p4-audit', documentId: document.id } });
  entries.push({ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) });
  entries.push({ filename: TEXT_AUDIO_INDEX_FILENAME, blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv' }) });
  const zip = await buildStoredZipBlob(entries);
  Object.defineProperty(zip, 'name', { value: name });
  Object.defineProperty(zip, 'lastModified', { value: name.includes('maisie') ? 20 : 10 });
  return zip;
};

const libbyZip = await makePortableZip({ name: 'libby-portable.zip', fullArtifact: libbyFull, fullFilename: libbyFullFilename, includeSplit: true });

await check('Portable ZIP v2 resolves one Split physical identity to current logical requirement', async () => {
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip], requirements: [splitRequirement], audioVariants: [], segments, blocks: [block], documents: [document] });
  assert.equal(scan.splitMatchedCount, 1);
  assert.equal(scan.matches[0].renderFingerprint, splitIdentity.renderFingerprint);
});

await check('Portable ZIP v2 resolves Full identity against current derived Card content/profile', async () => {
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip], requirements: [splitRequirement], audioVariants: [], segments, blocks: [block], documents: [document] });
  assert.equal(scan.fullMatchedCount, 1);
  assert.equal(scan.fullMatches[0].fullArtifactFingerprint, libbyFull.fullArtifactFingerprint);
  assert.equal(scan.fullMatches[0].block.id, block.id);
  assert.equal(scan.orphanCount, 0);
});

await check('ZIP runtime reader can materialize matched Full bytes before Staging import', async () => {
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip], requirements: [splitRequirement], audioVariants: [], segments, blocks: [block], documents: [document] });
  const blob = await readTextStructuredAudioZipRuntimeBlob(scan.fullMatches[0]);
  assert.equal(blob.size, 5);
});

await check('Full identity with current-content mismatch is orphaned fail-closed', async () => {
  const changedSegments = segments.map((segment, index) => index === 1 ? { ...segment, text: 'Changed sentence.' } : segment);
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip], requirements: [splitRequirement], audioVariants: [], segments: changedSegments, blocks: [block], documents: [document] });
  assert.equal(scan.fullMatchedCount, 0);
  assert.ok(scan.orphans.some(item => item.reason === 'full-no-current-content-match'));
});

const maisieZip = await makePortableZip({ name: 'maisie-portable.zip', fullArtifact: maisieFull, fullFilename: maisieFullFilename, splitRender: maisieSplitIdentity, splitName: maisieSplitFilename, splitVoice: maisieSplitProfile.voiceId, includeSplit: true });
await check('Two Portable ZIPs can expose different Split voices additively even when current download requirement only names Libby', async () => {
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip, maisieZip], requirements: [splitRequirement], audioVariants: [], segments, blocks: [block], documents: [document] });
  assert.equal(scan.archiveCount, 2);
  const firstSegmentMatches = scan.matches.filter(item => item.requirement?.segmentId === segments[0].id);
  assert.deepEqual(new Set(firstSegmentMatches.map(item => item.requirement?.voiceId)), new Set(['en-GB-LibbyNeural', 'en-GB-MaisieNeural']));
});

await check('Two Portable ZIPs can expose different Full voice identities additively', async () => {
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip, maisieZip], requirements: [splitRequirement], audioVariants: [], segments, blocks: [block], documents: [document] });
  assert.equal(scan.archiveCount, 2);
  assert.equal(scan.fullMatchedCount, 2);
  assert.deepEqual(new Set(scan.fullMatches.map(item => item.artifact.descriptor.voiceId)), new Set(['en-GB-LibbyNeural', 'en-GB-MaisieNeural']));
});

await check('One Full physical identity fans out to another current Card with identical derived content', async () => {
  const secondBlock = { ...block, id: 'TEXT_000002', uid: 'block-uid-p4-b' };
  const secondSegments = segments.map((segment, index) => ({ ...segment, id: `SEGMENT_00001${index + 1}`, uid: `seg-uid-copy-${index + 1}`, blockId: secondBlock.id }));
  const scan = await scanTextStructuredAudioZipFiles({ files: [libbyZip], requirements: [splitRequirement], audioVariants: [], segments: [...segments, ...secondSegments], blocks: [block, secondBlock], documents: [document] });
  assert.equal(scan.fullMatchedCount, 2);
  assert.deepEqual(new Set(scan.fullMatches.map(item => item.block.id)), new Set([block.id, secondBlock.id]));
});

await check('Staging physical identity distinguishes Split RF from Full Artifact fingerprint', async () => {
  const splitPhysical = resolveTextAudioStagingPhysicalIdentity({ mapKey: splitIdentity.renderFingerprint, metadata: { renderFingerprint: splitIdentity.renderFingerprint } });
  const fullPhysical = resolveTextAudioStagingPhysicalIdentity({ mapKey: libbyFull.fullArtifactFingerprint, metadata: { representation: 'full', fullArtifactFingerprint: libbyFull.fullArtifactFingerprint } });
  assert.deepEqual(splitPhysical, { representation: 'split', identity: splitIdentity.renderFingerprint });
  assert.deepEqual(fullPhysical, { representation: 'full', identity: libbyFull.fullArtifactFingerprint });
});

await check('GC keeps current referenced Full Staging and unrelated referenced Split Staging', async () => {
  const blockWithFull = { ...block, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: libbyFull }) };
  const snapshot = { blocks: [blockWithFull], segments, audioVariants: [{ metadata: { audioRenderFingerprintV1: splitIdentity.renderFingerprint } }] };
  const records = [
    { id: 'split-stage', hasBlob: true, size: 4, mapKey: splitIdentity.renderFingerprint, metadata: { renderFingerprint: splitIdentity.renderFingerprint } },
    { id: 'full-stage', hasBlob: true, size: 5, mapKey: libbyFull.fullArtifactFingerprint, metadata: { representation: 'full', fullArtifactFingerprint: libbyFull.fullArtifactFingerprint } }
  ];
  const plan = planTextAudioStagingGarbage({ snapshot, records });
  assert.equal(plan.orphanCount, 0);
  assert.equal(plan.referencedCount, 2);
  assert.equal(plan.fullCount, 1);
});

await check('GC releases stale Full physical binary when canonical derived Full content changes', async () => {
  const blockWithFull = { ...block, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: libbyFull }) };
  const changed = [{ ...segments[0] }, { ...segments[1], text: 'Changed sentence.' }];
  const snapshot = { blocks: [blockWithFull], segments: changed, audioVariants: [] };
  const records = [{ id: 'full-stage', hasBlob: true, size: 5, mapKey: libbyFull.fullArtifactFingerprint, metadata: { representation: 'full', fullArtifactFingerprint: libbyFull.fullArtifactFingerprint } }];
  const plan = planTextAudioStagingGarbage({ snapshot, records });
  assert.equal(plan.orphanCount, 1);
  assert.equal(plan.orphanRecords[0].id, 'full-stage');
});

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dataPanelSource = fs.readFileSync(new URL('../src/components/text/TextAudioDataPanel.jsx', import.meta.url), 'utf8');
const libraryShellSource = fs.readFileSync(new URL('../src/components/text/TextLibraryShell.jsx', import.meta.url), 'utf8');

await check('App Portable ZIP import commits Split binaries into Text Staging', async () => {
  assert.match(appSource, /putTextAudioStagingBlob\s*\(/);
  assert.match(appSource, /zip-imported-staging-ready/);
});
await check('App Portable ZIP import commits Full binaries and Full metadata additively', async () => {
  assert.match(appSource, /putTextFullAudioStagingBlob\s*\(/);
  assert.match(appSource, /executeTextFullAudioArtifactBulkUpsert\s*\(/);
});
await check('App startup hydration restores Full Staging runtime handles', async () => {
  assert.match(appSource, /setStructuredTextFullAudioRuntimeUrls/);
  assert.match(appSource, /fullArtifactFingerprint/);
});
await check('Folder workflow is explicitly locked/deprecated in normal beta.8 UI', async () => {
  assert.match(dataPanelSource, /Audio Folder • Deprecated/);
  assert.match(dataPanelSource, />LOCKED</);
  assert.match(appSource, /deprecated-locked/);
});
await check('Runtime diagnostics no longer present Folder as a connected active source', async () => {
  assert.match(libraryShellSource, /Deprecated • LOCKED in beta\.8/);
  assert.match(libraryShellSource, /Portable ZIP/);
});
await check('P4 adds AUDIO_INDEX.csv to portable export paths', async () => {
  assert.match(appSource, /TEXT_AUDIO_INDEX_FILENAME/);
  assert.match(appSource, /buildTextAudioIndexCsv/);
});
await check('Deleting Full Artifact is included in physical Staging GC triggers', async () => {
  assert.match(appSource, /TEXT_LIBRARY_COMMAND_TYPES\.DELETE_FULL_AUDIO_ARTIFACT/);
});

console.log(`PASS beta.8 P4 Staging + ZIP audit: ${checks} checks`);
