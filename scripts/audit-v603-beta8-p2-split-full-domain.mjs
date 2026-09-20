import assert from 'node:assert/strict';
import {
  TEXT_STRUCTURED_ARTIFACT_READINESS,
  buildTextStructuredFullRepresentation,
  buildTextStructuredFullTextPair,
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata,
  getTextStructuredFullAudioArtifacts,
  resolveTextStructuredFullArtifactReadiness,
  summarizeTextStructuredSplitProfileReadiness,
  resolveTextStructuredSplitFullReadiness
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  createTextDocumentRecord,
  createTextBlockRecord,
  createTextSegmentRecord,
  createTextAudioVariantRecord,
  resolveTextLibraryDocumentTree
} from '../src/domain/text/textLibraryDomain.js';
import { applyTextLibraryCommand, TEXT_LIBRARY_COMMAND_TYPES } from '../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredAudioContentFingerprint } from '../src/domain/text/textStructuredAudioIdentityDomain.js';

let pass = 0;
const check = (name, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`);
};

const now = 1000;
const doc = createTextDocumentRecord({
  id: 'DOC_000001',
  title: 'P2 Test',
  documentType: 'paragraph',
  editorModel: 'structured-v1',
  createdAt: now,
  updatedAt: now
});
const block = createTextBlockRecord({
  id: 'TEXT_000001',
  documentId: doc.id,
  blockType: 'paragraph',
  order: 1,
  createdAt: now,
  updatedAt: now
});
const seg1 = createTextSegmentRecord({
  id: 'SEGMENT_000001', documentId: doc.id, blockId: block.id, order: 1,
  text: 'First sentence.', meaning: 'Kalimat pertama.', joinAfter: 'space', createdAt: now, updatedAt: now
});
const seg2 = createTextSegmentRecord({
  id: 'SEGMENT_000002', documentId: doc.id, blockId: block.id, order: 2,
  text: 'Second sentence!', meaning: 'Kalimat kedua!', joinAfter: 'line', createdAt: now, updatedAt: now
});
const seg3 = createTextSegmentRecord({
  id: 'SEGMENT_000003', documentId: doc.id, blockId: block.id, order: 3,
  text: 'Third sentence?', meaning: 'Kalimat ketiga?', joinAfter: 'space', createdAt: now, updatedAt: now
});
const baseSnapshot = {
  schemaVersion: 1,
  activeDocumentId: doc.id,
  initialized: true,
  counters: { collection: 0, document: 1, text: 1, segment: 3, audioVariant: 0 },
  collections: [], documents: [doc], blocks: [block], segments: [seg1, seg2, seg3], audioVariants: []
};
const baseTree = resolveTextLibraryDocumentTree(baseSnapshot, doc.id);
const baseBlock = baseTree.blocks[0];
const libbyProfile = { engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 };
const maisieProfile = { engine: 'edge', voiceId: 'en-GB-MaisieNeural', rate: 0, pitch: 0 };

check('Full Text is deterministically derived from ordered Segments and joinAfter', () => {
  const full = buildTextStructuredFullRepresentation({ block: baseBlock, channel: 'text' });
  assert.equal(full.content, 'First sentence. Second sentence!\nThird sentence?');
  assert.equal(full.segmentCount, 3);
  assert.deepEqual(full.segmentIds, ['SEGMENT_000001', 'SEGMENT_000002', 'SEGMENT_000003']);
});

check('Full EN and aligned Full ID are parallel derived representations', () => {
  const pair = buildTextStructuredFullTextPair({ block: baseBlock });
  assert.equal(pair.text.content, 'First sentence. Second sentence!\nThird sentence?');
  assert.equal(pair.meaning.content, 'Kalimat pertama. Kalimat kedua!\nKalimat ketiga?');
  assert.notEqual(pair.text.contentFingerprint, pair.meaning.contentFingerprint);
});

const libbyFullArtifact = buildTextStructuredFullArtifactRecord({
  block: baseBlock,
  channel: 'text',
  language: 'en-GB',
  engine: 'edge',
  voiceId: libbyProfile.voiceId,
  rate: 0,
  pitch: 0,
  filename: 'full-libby.mp3',
  mimeType: 'audio/mpeg',
  createdAt: 1100,
  updatedAt: 1100
});

check('Full Artifact identity is deterministic for the same Full content/profile', () => {
  const again = buildTextStructuredFullArtifactRecord({
    block: baseBlock, channel: 'text', language: 'en-GB', engine: 'edge', voiceId: libbyProfile.voiceId,
    rate: 0, pitch: 0, createdAt: 9999, updatedAt: 9999
  });
  assert.equal(again.fullArtifactFingerprint, libbyFullArtifact.fullArtifactFingerprint);
  assert.ok(libbyFullArtifact.fullArtifactFingerprint.startsWith('full-sha256-'));
});

check('Different Full voice creates a different artifact fingerprint', () => {
  const maisie = buildTextStructuredFullArtifactRecord({
    block: baseBlock, channel: 'text', language: 'en-GB', engine: 'edge', voiceId: maisieProfile.voiceId,
    rate: 0, pitch: 0
  });
  assert.notEqual(maisie.fullArtifactFingerprint, libbyFullArtifact.fullArtifactFingerprint);
});

const blockWithFull = {
  ...baseBlock,
  metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: baseBlock.metadata, artifact: libbyFullArtifact })
};

check('Full Artifact metadata is additive and readable without a DB schema change', () => {
  const artifacts = getTextStructuredFullAudioArtifacts(blockWithFull);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].fullArtifactFingerprint, libbyFullArtifact.fullArtifactFingerprint);
});

check('Tampered Full Artifact descriptor is rejected instead of trusting a mismatched fingerprint', () => {
  const tampered = { ...libbyFullArtifact, descriptor: { ...libbyFullArtifact.descriptor, voiceId: 'en-GB-MaisieNeural' } };
  const metadata = { fullAudioArtifactsV1: { version: 1, artifacts: [tampered] } };
  assert.equal(getTextStructuredFullAudioArtifacts({ metadata }).length, 0);
});

check('Full readiness is READY only when exact artifact metadata and physical runtime are both present', () => {
  const runtimeFullAudio = { [libbyFullArtifact.fullArtifactFingerprint]: { stagingBacked: true } };
  const state = resolveTextStructuredFullArtifactReadiness({ block: blockWithFull, channel: 'text', profile: libbyProfile, language: 'en-GB', runtimeFullAudio });
  assert.equal(state.status, TEXT_STRUCTURED_ARTIFACT_READINESS.READY);
  assert.equal(state.ready, true);
});

check('Full readiness is metadata-only when physical binary is unavailable', () => {
  const state = resolveTextStructuredFullArtifactReadiness({ block: blockWithFull, channel: 'text', profile: libbyProfile, language: 'en-GB', runtimeFullAudio: {} });
  assert.equal(state.status, TEXT_STRUCTURED_ARTIFACT_READINESS.METADATA_ONLY);
  assert.equal(state.ready, false);
});

check('Editing canonical Segment text makes the old same-profile Full Artifact stale automatically', () => {
  const editedBlock = {
    ...blockWithFull,
    segments: blockWithFull.segments.map(item => item.id === seg2.id ? { ...item, text: 'Changed second sentence!' } : item)
  };
  const state = resolveTextStructuredFullArtifactReadiness({ block: editedBlock, channel: 'text', profile: libbyProfile, language: 'en-GB', runtimeFullAudio: { [libbyFullArtifact.fullArtifactFingerprint]: { stagingBacked: true } } });
  assert.equal(state.status, TEXT_STRUCTURED_ARTIFACT_READINESS.STALE);
  assert.equal(state.ready, false);
});

check('Current Full content under another voice is reported as other-profile, not Ready', () => {
  const maisieArtifact = buildTextStructuredFullArtifactRecord({ block: baseBlock, channel: 'text', language: 'en-GB', engine: 'edge', voiceId: maisieProfile.voiceId });
  const onlyMaisieBlock = { ...baseBlock, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: maisieArtifact }) };
  const state = resolveTextStructuredFullArtifactReadiness({ block: onlyMaisieBlock, channel: 'text', profile: libbyProfile, language: 'en-GB', runtimeFullAudio: { [maisieArtifact.fullArtifactFingerprint]: { stagingBacked: true } } });
  assert.equal(state.status, TEXT_STRUCTURED_ARTIFACT_READINESS.OTHER_PROFILE);
});

const libbyVar1 = createTextAudioVariantRecord({
  id: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', engine: 'edge', voiceId: libbyProfile.voiceId,
  source: 'generated', createdAt: 1200, updatedAt: 1200,
  metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg1.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: libbyProfile.voiceId, rate: 0, pitch: 0 } }
});
const libbyVar2Stale = createTextAudioVariantRecord({
  id: 'TXTAUDIO_000002', segmentId: seg2.id, channel: 'text', engine: 'edge', voiceId: libbyProfile.voiceId,
  source: 'generated', createdAt: 1200, updatedAt: 1200,
  metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: 'Old second sentence.' }), audioRenderDescriptorV1: { engine: 'edge', voiceId: libbyProfile.voiceId, rate: 0, pitch: 0 } }
});
const treeWithSplit = {
  ...baseTree,
  blocks: [{
    ...blockWithFull,
    segments: blockWithFull.segments.map(item => ({
      ...item,
      audioVariants: item.id === seg1.id ? [libbyVar1] : (item.id === seg2.id ? [libbyVar2Stale] : [])
    }))
  }]
};

check('Split readiness supports partial libraries instead of all-or-nothing failure', () => {
  const summary = summarizeTextStructuredSplitProfileReadiness({
    block: treeWithSplit.blocks[0], channel: 'text', profile: libbyProfile,
    runtimeAudioUrls: { [libbyVar1.id]: { stagingBacked: true }, [libbyVar2Stale.id]: { stagingBacked: true } }
  });
  assert.equal(summary.total, 3);
  assert.equal(summary.ready, 1);
  assert.equal(summary.stale, 1);
  assert.equal(summary.missing, 1);
  assert.equal(summary.complete, false);
  assert.equal(summary.partial, true);
  assert.equal(summary.needAudio, 2);
});

check('Split and Full readiness are independent in one combined model', () => {
  const combined = resolveTextStructuredSplitFullReadiness({
    block: treeWithSplit.blocks[0], channel: 'text', profile: libbyProfile, language: 'en-GB',
    runtimeAudioUrls: { [libbyVar1.id]: { stagingBacked: true } },
    runtimeFullAudio: { [libbyFullArtifact.fullArtifactFingerprint]: { stagingBacked: true } }
  });
  assert.equal(combined.split.complete, false);
  assert.equal(combined.split.ready, 1);
  assert.equal(combined.full.status, TEXT_STRUCTURED_ARTIFACT_READINESS.READY);
});

check('Full artifact upsert command persists on Card metadata while Text DB remains schema v1', () => {
  const result = applyTextLibraryCommand(baseSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_FULL_AUDIO_ARTIFACT,
    payload: { blockId: block.id, artifact: libbyFullArtifact }
  }, 1300);
  assert.equal(result.snapshot.schemaVersion, 1);
  const tree = resolveTextLibraryDocumentTree(result.snapshot, doc.id);
  assert.equal(getTextStructuredFullAudioArtifacts(tree.blocks[0]).length, 1);
});

check('Deleting a Split AudioVariant does not delete the independent Full Artifact metadata', () => {
  const withFull = applyTextLibraryCommand(baseSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_FULL_AUDIO_ARTIFACT,
    payload: { blockId: block.id, artifact: libbyFullArtifact }
  }, 1300).snapshot;
  const withSplit = {
    ...withFull,
    counters: { ...withFull.counters, audioVariant: 1 },
    audioVariants: [libbyVar1]
  };
  const deleted = applyTextLibraryCommand(withSplit, {
    type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_AUDIO_VARIANT,
    payload: { id: libbyVar1.id }
  }, 1400).snapshot;
  const tree = resolveTextLibraryDocumentTree(deleted, doc.id);
  assert.equal(tree.blocks[0].segments[0].audioVariants.length, 0);
  assert.equal(getTextStructuredFullAudioArtifacts(tree.blocks[0]).length, 1);
});

check('Deleting Full Artifact metadata does not delete Split AudioVariants', () => {
  const withFull = applyTextLibraryCommand(baseSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_FULL_AUDIO_ARTIFACT,
    payload: { blockId: block.id, artifact: libbyFullArtifact }
  }, 1300).snapshot;
  const withSplit = { ...withFull, counters: { ...withFull.counters, audioVariant: 1 }, audioVariants: [libbyVar1] };
  const deleted = applyTextLibraryCommand(withSplit, {
    type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_FULL_AUDIO_ARTIFACT,
    payload: { blockId: block.id, fullArtifactFingerprint: libbyFullArtifact.fullArtifactFingerprint }
  }, 1400).snapshot;
  const tree = resolveTextLibraryDocumentTree(deleted, doc.id);
  assert.equal(getTextStructuredFullAudioArtifacts(tree.blocks[0]).length, 0);
  assert.equal(tree.blocks[0].segments[0].audioVariants.length, 1);
});

check('Changing only Segment boundaries while preserving joined Full Text preserves Full content identity', () => {
  const oneSeg = createTextSegmentRecord({
    id: 'SEGMENT_000010', documentId: doc.id, blockId: block.id, order: 1,
    text: 'Alpha sentence. Beta sentence.', meaning: 'Alfa. Beta.', joinAfter: 'space', createdAt: now, updatedAt: now
  });
  const singleBlock = { ...block, segments: [oneSeg] };
  const before = buildTextStructuredFullRepresentation({ block: singleBlock, channel: 'text' });
  const splitBlock = {
    ...block,
    segments: [
      { ...oneSeg, id: 'SEGMENT_000010', order: 1, text: 'Alpha sentence.', joinAfter: 'space' },
      { ...oneSeg, id: 'SEGMENT_000011', order: 2, text: 'Beta sentence.', joinAfter: 'space' }
    ]
  };
  const after = buildTextStructuredFullRepresentation({ block: splitBlock, channel: 'text' });
  assert.equal(before.content, after.content);
  assert.equal(before.contentFingerprint, after.contentFingerprint);
  assert.notEqual(before.segmentCount, after.segmentCount);
});

check('Reordering content changes derived Full identity when the audible Full Text changes', () => {
  const before = buildTextStructuredFullRepresentation({ block: baseBlock, channel: 'text' });
  const reordered = { ...baseBlock, segments: baseBlock.segments.map(item => item.id === seg1.id ? { ...item, order: 3 } : item.id === seg3.id ? { ...item, order: 1 } : item) };
  const after = buildTextStructuredFullRepresentation({ block: reordered, channel: 'text' });
  assert.notEqual(before.content, after.content);
  assert.notEqual(before.contentFingerprint, after.contentFingerprint);
});

console.log(`\nP2 AUDIT COMPLETE — ${pass} PASS`);
