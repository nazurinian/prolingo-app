import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { applyTextDataManagementCommand } from '../src/domain/text/textDataManagementDomain.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata, resolveTextStructuredEffectiveDownloadVoice } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredCardMissingFullRequirements } from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import { resolveTextStructuredEffectiveCustomLocalVoice } from '../src/domain/text/textStructuredLocalAudioProfileDomain.js';
import { resolveTextStructuredEffectivePlaybackRate } from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import { resolveTextStructuredBrowserVoiceResolution } from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import { getBookBodyGenerationRequests, getBookFullPlaybackRequests, getBookSplitPlaybackRequests, projectBookBodyAudioDocument } from '../src/domain/text/bookQaBodyAudioDomain.js';
import { applyBookQaAudioOperation, assertBookAudioReferenceCapacity, readBookAudioBinding, readBookAudioReferences } from '../src/domain/text/bookQaAudioDomain.js';

const fixture = createJourneyToLondonFixture();
const workspace = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
const paragraph = workspace.blocks[0];
const conversation = workspace.blocks.find(block => block.blockType === 'conversation');
const preferences = { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeRate: 0, edgePitch: 0 };
const options = { preferences, audioSourceMode: 'local-first', globalRate: 1 };
const access = { bookAuthoring: true, boundary: 'disposable', permissions: ['catalog', 'content'], selection: { workspaceId: workspace.id } };
const command = (kind, values, speakerId) => ({ type: 'document.update', payload: { id: workspace.id, bodyAudioProfile: {
  workspaceUid: workspace.uid, channel: 'text', kind, values, ...(speakerId ? { speakerId } : {})
} } });
const binary = { format: 'mp3', sampleRate: 24000, bytes: 10, digest: 'a'.repeat(64) };

test('typed profile isolation and reset preserve Workspace, Speaker and Body ownership', () => {
  const speakerId = conversation.units[0].speakerId;
  const p = applyTextDataManagementCommand(fixture.snapshot, command('paragraph', {
    edgeVoice: 'en-GB-RyanNeural', browserVoice: 'Narrator TTS', localVoice: 'Narrator local', playbackRate: 1.3
  }), access).snapshot;
  const c = applyTextDataManagementCommand(p, command('conversation', {
    edgeVoice: 'en-GB-LibbyNeural', browserVoice: 'Speaker TTS', localVoice: 'Speaker local', playbackRate: 0.9
  }, speakerId), access).snapshot;
  const tree = resolveTextLibraryDocumentTree(c, workspace.id);
  const forBlock = block => resolveTextStructuredEffectiveDownloadVoice({
    documentTree: projectBookBodyAudioDocument(tree, block.blockType), block, segment: block.segments[0], preferences
  }).voiceId;
  assert.equal(forBlock(paragraph), 'en-GB-RyanNeural');
  assert.equal(forBlock(conversation), 'en-GB-LibbyNeural');
  const profileFor = (tree, block) => {
    const owner = { documentTree: projectBookBodyAudioDocument(tree, block.blockType), block, segment: block.segments[0] };
    return [resolveTextStructuredBrowserVoiceResolution(owner).requestedVoiceName,
      resolveTextStructuredEffectiveCustomLocalVoice(owner), resolveTextStructuredEffectivePlaybackRate(owner)];
  };
  assert.deepEqual(profileFor(tree, paragraph), ['Narrator TTS', 'Narrator local', 1.3]);
  assert.deepEqual(profileFor(tree, conversation), ['Speaker TTS', 'Speaker local', 0.9]);
  const speakerReset = applyTextDataManagementCommand(c, command('conversation', {
    edgeVoice: null, browserVoice: null, localVoice: null, playbackRate: null
  }, speakerId), access).snapshot;
  const speakerResetTree = resolveTextLibraryDocumentTree(speakerReset, workspace.id);
  assert.deepEqual(profileFor(speakerResetTree, paragraph), ['Narrator TTS', 'Narrator local', 1.3]);
  assert.equal(getBookBodyGenerationRequests(speakerResetTree, paragraph, 'text', { options })[0].descriptor.voiceId, 'en-GB-RyanNeural');
  const reset = applyTextDataManagementCommand(c, command('paragraph', { edgeVoice: null }), access).snapshot;
  const resetTree = resolveTextLibraryDocumentTree(reset, workspace.id);
  assert.equal(getBookBodyGenerationRequests(resetTree, paragraph, 'text', { options })[0].descriptor.voiceId, 'en-GB-SoniaNeural');
  assert.equal(getBookBodyGenerationRequests(resetTree, conversation, 'text', { options })[0].descriptor.voiceId, 'en-GB-LibbyNeural');
  assert.deepEqual(reset.blocks, fixture.snapshot.blocks);
  assert.deepEqual(reset.segments, fixture.snapshot.segments);
  assert.throws(() => applyTextDataManagementCommand(c, command('conversation', { edgeVoice: null }, 'SPK_FAKE'), access),
    { code: 'INVALID_BOOK_AUDIO_PROFILE' });
  assert.throws(() => applyTextDataManagementCommand(c, command('paragraph', { playbackRate: 1.25 }), access),
    { code: 'INVALID_BOOK_AUDIO_PROFILE' });
  assert.throws(() => applyTextDataManagementCommand(c, command('paragraph', { edgeVoice: null }), { ...access, bookAuthoring: false }),
    { code: 'INVALID_COMMAND' });
});

test('Full Paragraph generation bypasses first-Sentence overrides and Split retains them', () => {
  const block = { ...paragraph, segments: [{ ...paragraph.segments[0], metadata: buildTextStructuredAudioDownloadProfileMetadata({
    metadata: paragraph.segments[0].metadata, channel: 'text', voiceId: 'en-GB-RyanNeural'
  }) }, ...paragraph.segments.slice(1)] };
  assert.equal(getBookBodyGenerationRequests(workspace, block, 'text', { options })[0].descriptor.voiceId, 'en-GB-RyanNeural');
  assert.equal(getBookBodyGenerationRequests(workspace, block, 'text', { options, full: true })[0].descriptor.voiceId, 'en-GB-SoniaNeural');
  assert.equal(buildTextStructuredCardMissingFullRequirements({ documentTree: workspace, block, preferences, channels: ['text'] })[0].voiceId, 'en-GB-SoniaNeural');
});

test('stable variant retains 64 exact profiles and rejects the entire overflow batch', () => {
  const entries = Array.from({ length: 65 }, (_, rate) => ({
    ...getBookSplitPlaybackRequests(workspace, paragraph, paragraph.segments[0], 'text', {
      ...options, preferences: { ...preferences, edgeRate: rate }
    })[0], binary
  }));
  const first = applyBookQaAudioOperation(fixture.snapshot, entries.slice(0, 32), 100);
  const second = applyBookQaAudioOperation(first.snapshot, entries.slice(32, 64), 101);
  const variant = second.snapshot.audioVariants[0];
  assert.equal(variant.id, first.snapshot.audioVariants[0].id);
  assert.equal(variant.uid, first.snapshot.audioVariants[0].uid);
  assert.equal(Object.keys(readBookAudioReferences(variant)).length, 64);
  const original = structuredClone(second.snapshot);
  assert.throws(() => assertBookAudioReferenceCapacity(second.snapshot, [entries[0], entries[64]]), { code: 'AUDIO_REFERENCE_LIMIT' });
  assert.throws(() => applyBookQaAudioOperation(second.snapshot, [entries[0], entries[64]], 102), { code: 'AUDIO_REFERENCE_LIMIT' });
  assert.deepEqual(second.snapshot, original);
  assert.equal(readBookAudioBinding(second.snapshot, entries[0]).status, 'bound');
  assert.equal(readBookAudioBinding(second.snapshot, entries[64]).status, 'other-profile');
});

test('exact references retain missing, legacy and stale distinctions and exclude historical Title authoring', () => {
  const [entry] = getBookSplitPlaybackRequests(workspace, paragraph, paragraph.segments[0], 'text', options);
  assert.equal(readBookAudioBinding(fixture.snapshot, entry).status, 'missing');
  const { snapshot } = applyBookQaAudioOperation(fixture.snapshot, [{ ...entry, binary }], 100);
  const legacy = { ...snapshot, audioVariants: snapshot.audioVariants.map(row => ({ ...row, metadata: {
    audioRenderFingerprintV1: entry.fingerprint, audioRenderDescriptorV1: entry.descriptor
  } })) };
  assert.equal(readBookAudioBinding(legacy, entry).status, 'legacy-unverified');
  const changed = { ...snapshot, segments: snapshot.segments.map(row => row.id === entry.target.segmentId ? { ...row, text: 'Changed Sentence.' } : row) };
  assert.equal(readBookAudioBinding(changed, entry).status, 'stale');
  const oldTitle = { ...fixture.snapshot, blocks: fixture.snapshot.blocks.map(row => row.id === paragraph.id ? {
    ...row, metadata: { ...row.metadata, paragraphRoleV1: 'title' }
  } : row) };
  assert.throws(() => assertBookAudioReferenceCapacity(oldTitle, [entry], { bodyOnly: true }), { code: 'INVALID_AUDIO_TARGET' });
  const legacyTree = resolveTextLibraryDocumentTree(oldTitle, workspace.id);
  assert.deepEqual(getBookBodyGenerationRequests(legacyTree, legacyTree.blocks[0], 'text', { options, full: true }), []);
});

test('scoped recorded playback honors explicit source profiles and Browser-only mode', () => {
  const split = (scope) => getBookSplitPlaybackRequests(workspace, paragraph, paragraph.segments[0], 'text', scope);
  const full = (scope) => getBookFullPlaybackRequests(workspace, paragraph, 'text', scope);
  const restricted = { ...options, globalPlaybackOrder: { channels: { text: [
    { engine: 'edge', voiceId: 'en-GB-RyanNeural', source: 'uploaded' },
    { engine: 'edge', voiceId: 'en-GB-LibbyNeural', source: 'generated', rate: 9, pitch: 4 }
  ] } } };
  for (const playback of [split, full]) {
    const requests = playback(restricted);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].descriptor.voiceId, 'en-GB-LibbyNeural');
    assert.equal(requests[0].descriptor.rate, 9);
    assert.equal(requests[0].descriptor.pitch, 4);
    assert.deepEqual(playback({ ...restricted, audioSourceMode: 'tts-only' }), []);
  }
});
