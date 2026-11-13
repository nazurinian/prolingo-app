import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCanonicalTextRenderAudioFilename,
  parseCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  buildProLingoTextAudioManifest,
  validateProLingoTextAudioManifest
} from '../src/domain/text/textAudioManifestDomain.js';
import { buildTextStructuredBatchWorkspaceSelection } from '../src/domain/text/textStructuredBatchDomain.js';
import { buildDerivedTextFullAudioWav, buildDerivedTextFullAudioFilename } from '../src/services/audio/textStructuredFullAudioExportService.js';

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };

const rf = `rf-sha256-${'ab'.repeat(32)}`;
const filename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf, engine: 'edge', voiceId: 'en-GB-RyanNeural', extension: 'mp3' });
ok(filename.startsWith(`RF_${'AB'.repeat(32)}__EDGE__Ryan`), 'RF filename must be physical-RF centric');
const parsed = parseCanonicalTextRenderAudioFilename(filename);
ok(parsed?.renderFingerprint === rf, 'RF filename round-trip');

const manifest = buildProLingoTextAudioManifest({ entries: [{ rf, filename, mimeType: 'audio/mpeg', size: 10, references: [{ segmentId: 'SEGMENT_000001' }, { segmentId: 'SEGMENT_000002' }] }] });
const validated = validateProLingoTextAudioManifest(manifest);
ok(validated.entries.length === 1, 'manifest stores one physical RF entry');
ok(validated.entries[0].references.length === 2, 'manifest preserves multiple logical references to one RF');

const doc = {
  id: 'DOC_000001', uid: 'WSUID_test', title: 'Workspace', editorModel: 'structured-v1', documentType: 'paragraph', textLanguage: 'en', meaningLanguage: 'id',
  blocks: [{ id: 'TEXT_000001', uid: 'CARDUID_test', blockType: 'paragraph', title: 'Card', metadata: {}, segments: [
    { id: 'SEGMENT_000001', uid: 'SEGUID_a', text: 'Same sentence.', meaning: '', order: 1, metadata: {} },
    { id: 'SEGMENT_000002', uid: 'SEGUID_b', text: 'Same sentence.', meaning: '', order: 2, metadata: {} }
  ] }]
};
const selection = buildTextStructuredBatchWorkspaceSelection({ documentTrees: [doc], preferences: { edgeTextVoiceId: 'en-GB-RyanNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false }, coverageMapsByDocument: {}, activeDocumentId: doc.id, activeScope: { scopeMode: 'workspace' } });
ok(selection.slots.length === 2, 'batch preserves two logical Segment slots');
ok(selection.slots.every(slot => slot.documentUid === 'WSUID_test'), 'batch slots carry Workspace UID diagnostics');
ok(selection.slots.every(slot => slot.cardUid === 'CARDUID_test'), 'batch slots carry Card UID diagnostics');
ok(selection.slots.map(slot => slot.segmentUid).join(',') === 'SEGUID_a,SEGUID_b', 'batch slots carry Segment UID diagnostics');

class FakeAudioContext {
  constructor() { this.sampleRate = 48000; this.calls = 0; }
  async decodeAudioData() {
    this.calls += 1;
    const length = this.calls === 1 ? 4 : 3;
    const data = new Float32Array(length).fill(this.calls === 1 ? 0.25 : -0.25);
    return { length, numberOfChannels: 1, sampleRate: 48000, duration: length / 48000, getChannelData: () => data };
  }
  async close() {}
}
globalThis.AudioContext = FakeAudioContext;
const full = await buildDerivedTextFullAudioWav({ blobs: [new Blob(['a'], { type: 'audio/mpeg' }), new Blob(['b'], { type: 'audio/mpeg' })] });
ok(full.segmentCount === 2, 'Full derived audio composes ordered Segment binaries');
ok(full.blob.type === 'audio/wav', 'Full derived output is WAV');
ok(full.blob.size === 44 + (7 * 1 * 2), 'Full WAV contains one header plus ordered PCM frames');
ok(buildDerivedTextFullAudioFilename({ documentTitle: 'My Text', blockId: 'TEXT_000001', channel: 'meaning' }).endsWith('__FULL_ID__DERIVED.wav'), 'Full ID naming is explicit and derived');

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panelSource = fs.readFileSync(new URL('../src/components/text/TextStructuredCardAudioPanel.jsx', import.meta.url), 'utf8');
const popupSource = fs.readFileSync(new URL('../src/components/text/TextBatchPopup.jsx', import.meta.url), 'utf8');
const cardExportServiceSource = fs.readFileSync(new URL('../src/services/audio/textStructuredCardExportService.js', import.meta.url), 'utf8');

await (async () => {
  const {
    executeStructuredTextCardZipExport,
    executeStructuredTextBatchConsolidatedZipExport
  } = await import('../src/services/audio/textStructuredCardExportService.js');
  const { buildTextStructuredAudioRenderFingerprint } = await import('../src/domain/text/textStructuredAudioRenderFingerprintDomain.js');
  const {
    buildTextStructuredFullArtifactRecord,
    buildTextStructuredFullAudioArtifactsMetadata,
    buildTextStructuredFullRepresentation
  } = await import('../src/domain/text/textStructuredSplitFullDomain.js');
  const { buildProLingoTextAudioManifest: _manifestCheck, parseProLingoTextAudioManifestJson, TEXT_AUDIO_MANIFEST_FILENAME } = await import('../src/domain/text/textAudioManifestDomain.js');
  const { buildCanonicalTextFullArtifactFilename, buildCanonicalTextRenderAudioFilename } = await import('../src/domain/text/textFilenameDomain.js');

  const sharedText = 'Repeated sentence for RF dedup.';
  const rfResult = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: sharedText,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  const baseBlock = {
    id: 'BLOCK_B1',
    uid: 'crd_b1',
    documentId: 'DOC_B1',
    order: 0,
    blockType: 'paragraph',
    text: `${sharedText} ${sharedText}`,
    segments: [
      { id: 'SEG_B1_1', uid: 'seg_b1_1', documentId: 'DOC_B1', blockId: 'BLOCK_B1', order: 0, text: sharedText },
      { id: 'SEG_B1_2', uid: 'seg_b1_2', documentId: 'DOC_B1', blockId: 'BLOCK_B1', order: 1, text: sharedText }
    ]
  };
  const fullRep = buildTextStructuredFullRepresentation({ block: baseBlock, channel: 'text' });
  const readyFullArtifact = buildTextStructuredFullArtifactRecord({
    block: baseBlock,
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0,
    contentFingerprint: fullRep.contentFingerprint,
    stagingId: 'stg_full_b1',
    deliveryStatus: 'staged-ready',
    filename: buildCanonicalTextFullArtifactFilename({
      fullArtifactFingerprint: buildTextStructuredFullArtifactRecord({
        block: baseBlock,
        channel: 'text',
        language: 'en',
        engine: 'edge',
        voiceId: 'en-GB-SoniaNeural',
        contentFingerprint: fullRep.contentFingerprint
      }).fullArtifactFingerprint,
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      extension: 'mp3'
    })
  });
  const exportDoc = {
    id: 'DOC_B1',
    uid: 'doc_b1',
    title: 'Batch Export Check',
    editorModel: 'structured-v1',
    blocks: [{
      ...baseBlock,
      metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: readyFullArtifact })
    }]
  };
  const splitFilename = buildCanonicalTextRenderAudioFilename({
    renderFingerprint: rfResult.renderFingerprint,
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    extension: 'mp3'
  });
  const splitVariantFor = (segmentId, variantId) => ({
    id: variantId,
    uid: `var_${segmentId}`,
    segmentId,
    channel: 'text',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    filename: splitFilename,
    metadata: {
      audioRenderFingerprintV1: rfResult.renderFingerprint
    }
  });
  const slotMap = new Map([
    ['SEG_B1_1', {
      variant: splitVariantFor('SEG_B1_1', 'TXTAUDIO_1'),
      coverage: { requiredVoiceId: 'en-GB-SoniaNeural', filename: splitFilename },
      runtime: { stagingBacked: true, stagingId: 'stg_split_b1', filename: splitFilename }
    }],
    ['SEG_B1_2', {
      variant: splitVariantFor('SEG_B1_2', 'TXTAUDIO_2'),
      coverage: { requiredVoiceId: 'en-GB-SoniaNeural', filename: splitFilename },
      runtime: { stagingBacked: true, stagingId: 'stg_split_b1', filename: splitFilename }
    }]
  ]);
  const blobsByStagingId = new Map([
    ['stg_split_b1', new Blob(['SPLIT_RF_MP3'], { type: 'audio/mpeg' })],
    ['stg_full_b1', new Blob(['FULL_CARD_MP3'], { type: 'audio/mpeg' })]
  ]);
  const readBlob = async runtime => blobsByStagingId.get(runtime?.stagingId) || null;
  const runtimeFullAudio = {
    [readyFullArtifact.fullArtifactFingerprint]: {
      stagingBacked: true,
      stagingId: 'stg_full_b1',
      filename: readyFullArtifact.filename,
      mimeType: 'audio/mpeg'
    }
  };
  const capturedZips = [];
  const captureZip = async ({ entries, filename }) => {
    capturedZips.push({ entries, filename });
    return { filename, size: entries.length };
  };
  const noopMarkExported = async () => 0;

  const cardZipResult = await executeStructuredTextCardZipExport({
    documentTree: exportDoc,
    blockId: 'BLOCK_B1',
    options: { representation: 'both' },
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false },
    runtimeFullAudio,
    resolveManualReadySlot: (segmentId) => slotMap.get(segmentId) || null,
    readBlob,
    triggerZipDownload: captureZip,
    markStagingExported: noopMarkExported
  });

  const batchSelection = buildTextStructuredBatchWorkspaceSelection({
    documentTrees: [exportDoc],
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false },
    coverageMapsByDocument: {},
    activeDocumentId: 'DOC_B1',
    activeScope: { scopeMode: 'workspace' }
  });
  const batchZipResult = await executeStructuredTextBatchConsolidatedZipExport({
    partial: false,
    batchSelection,
    targetTrees: [exportDoc],
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false },
    runtimeFullAudio,
    resolveBatchReadySlot: slot => slotMap.get(slot.segmentId) || null,
    readBlob,
    triggerZipDownload: captureZip,
    markStagingExported: noopMarkExported
  });

  const verifyPackagedZip = async (zipCapture, expectedPhysicalCount) => {
    const manifestEntry = zipCapture.entries.find(e => e.filename === TEXT_AUDIO_MANIFEST_FILENAME);
    ok(Boolean(manifestEntry), `Card/Batch ZIP emits canonical ${TEXT_AUDIO_MANIFEST_FILENAME}`);
    const manifest = parseProLingoTextAudioManifestJson(await manifestEntry.blob.text());
    ok(manifest.packageVersion === 2, 'Canonical portable manifest uses packageVersion 2');
    ok(manifest.entries.length === expectedPhysicalCount, 'Physical RF & Full files are deduplicated cleanly');
    const splitManifestEntry = manifest.entries.find(entry => entry.representation === 'split');
    const fullManifestEntry = manifest.entries.find(entry => entry.representation === 'full');
    ok(Boolean(splitManifestEntry) && splitManifestEntry.references.length === 2, 'Shared physical RF preserves both logical segment references');
    ok(Boolean(fullManifestEntry) && fullManifestEntry.fullArtifactFingerprint === readyFullArtifact.fullArtifactFingerprint, 'Eligible Ready Full artifact is included alongside Split RF');
    ok(splitManifestEntry.filename === splitFilename, 'Split RF entry preserves canonical filename');
    ok(fullManifestEntry.filename === readyFullArtifact.filename, 'Ready Full entry preserves canonical filename');
    const audioFiles = zipCapture.entries.filter(e => e.filename.endsWith('.mp3'));
    ok(audioFiles.length === expectedPhysicalCount, 'Physical MP3 count in ZIP matches deduplicated entry count');
  };

  ok(cardZipResult.status === 'completed' && batchZipResult.status === 'completed', 'Card & Batch ZIP services export cleanly');
  ok(capturedZips.length === 2, 'Captured Card ZIP and Batch ZIP exports');
  await verifyPackagedZip(capturedZips[0], 2);
  await verifyPackagedZip(capturedZips[1], 2);
  ok(
    appSource.includes('executeStructuredTextCardZipExport')
      && appSource.includes('executeStructuredTextBatchConsolidatedZipExport')
      && cardExportServiceSource.includes('buildProLingoTextAudioManifest'),
    'Card/Batch ZIP production path RF-deduplicates and emits manifest'
  );
  ok(
    appSource.includes('reusedPhysical: reusedPhysicalKeys.size')
      && appSource.includes('generatedPhysical: generatedPhysicalKeys.size'),
    'Batch telemetry separates RF reuse from new generation'
  );
})();
ok((panelSource.includes('SELECTED ZIP') && panelSource.includes('segmentIds: selectedSegmentIds')) || (panelSource.includes('Scope exports now live in Bulk Audio') && panelSource.includes('onExportSegmentAudio')), 'DL1 granular Segment export remains reachable while P7 centralizes scope export in Bulk Audio');
ok((panelSource.includes('FULL EN') && panelSource.includes('FULL ID')) || (popupSource.includes('Split + Full') && popupSource.includes('Audio-Only')), 'DL2 Full export remains available through the final Split/Full Bulk export surface');
ok((popupSource.includes('unique physical RF') && popupSource.includes('Text Audio Manifest')) || (popupSource.includes('Unique physical') && popupSource.includes('Portable ProLingo ZIP')), 'Batch UI exposes physical dedup and canonical Portable export behavior');

console.log(`PASS DL1/DL2/B1 download-batch audit: ${checks} checks`);
