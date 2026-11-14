import assert from 'node:assert/strict';
import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from '../src/domain/text/textGlobalIdentityDomain.js';
import { applyTextLibraryCommand, TEXT_LIBRARY_COMMAND_TYPES } from '../src/domain/text/textLibraryCommandDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../src/domain/text/textLibraryDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextWorkspaceBrowserTtsMetadata,
  buildResetTextWorkspaceEdgePresetMetadata
} from '../src/domain/text/textStructuredResetDomain.js';
import { getTextStructuredAudioDownloadChannelMode, TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';

const original = {
  externalSourceV1: { importId: 'keep-import' },
  speakerRegistryV1: [{ id: 'SPK_1', label: 'Speaker 1' }],
  audioVoiceOverrideV1: {
    channels: { text: 'Microsoft Libby Online', meaning: 'Google Bahasa Indonesia' },
    speakerIds: { text: { SPK_1: 'Microsoft Ryan Online' }, meaning: {} },
    speakers: { text: {}, meaning: {} }
  },
  audioPlaybackRateProfileV1: {
    channels: { text: 1.4, meaning: 0.8 },
    speakerIds: { text: { SPK_1: 1.2 }, meaning: {} },
    speakers: { text: {}, meaning: {} }
  },
  audioDownloadProfileV1: {
    modes: { text: 'custom', meaning: 'follow-player' },
    channels: { text: 'en-US-GuyNeural', meaning: null },
    speakerIds: { text: { SPK_1: 'en-GB-RyanNeural' }, meaning: {} },
    speakers: { text: {}, meaning: {} }
  },
  localAudioPlaybackProfileV1: {
    channels: { text: 'en-GB-RyanNeural', meaning: null },
    speakerIds: { text: {}, meaning: {} },
    speakers: { text: {}, meaning: {} }
  },
  audioPlaybackOrderV1: { version: 1, channels: { text: [], meaning: [] }, ttsOnly: null }
};
const browser = buildResetTextWorkspaceBrowserTtsMetadata(original);
assert.equal(browser.audioVoiceOverrideV1?.channels?.text ?? null, null);
assert.equal(browser.audioPlaybackRateProfileV1?.channels?.text ?? null, null);
assert.equal(browser.audioVoiceOverrideV1.speakerIds.text.SPK_1, 'Microsoft Ryan Online');
assert.equal(browser.audioPlaybackRateProfileV1.speakerIds.text.SPK_1, 1.2);
assert.deepEqual(browser.audioDownloadProfileV1, original.audioDownloadProfileV1);
assert.deepEqual(browser.localAudioPlaybackProfileV1, original.localAudioPlaybackProfileV1);
assert.deepEqual(browser.audioPlaybackOrderV1, original.audioPlaybackOrderV1);
assert.deepEqual(buildResetTextWorkspaceBrowserTtsMetadata(browser), browser);

const edge = buildResetTextWorkspaceEdgePresetMetadata(original);
assert.equal(edge.audioDownloadProfileV1?.channels?.text ?? null, null);
assert.equal(edge.audioDownloadProfileV1?.modes?.text ?? null, null);
assert.equal(edge.audioDownloadProfileV1?.modes?.meaning ?? null, null);
assert.equal(edge.audioDownloadProfileV1.speakerIds.text.SPK_1, 'en-GB-RyanNeural');
assert.deepEqual(edge.audioVoiceOverrideV1, original.audioVoiceOverrideV1);
assert.deepEqual(edge.audioPlaybackRateProfileV1, original.audioPlaybackRateProfileV1);
assert.deepEqual(edge.localAudioPlaybackProfileV1, original.localAudioPlaybackProfileV1);
assert.deepEqual(buildResetTextWorkspaceEdgePresetMetadata(edge), edge);

const docId = 'DOC_000001';
const blockId = 'TEXT_000001';
const segmentId = 'SEGMENT_000001';
const snapshot = normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: 1, initialized: true, activeDocumentId: docId,
  counters: { collection: 0, document: 1, text: 1, segment: 1, audioVariant: 1 },
  collections: [],
  documents: [{
    id: docId, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    order: 1, title: 'Scope Test', documentType: 'paragraph',
    editorModel: 'structured-v1', collectionId: null, metadata: original
  }],
  blocks: [{
    id: blockId, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD),
    documentId: docId, order: 1, blockType: 'paragraph', title: 'Card',
    metadata: { paragraphRoleV1: 'paragraph', audioVoiceOverrideV1: { channels: { text: 'Card Voice', meaning: null } } }
  }],
  segments: [{
    id: segmentId, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: docId, blockId, order: 1, text: 'Hello.', meaning: 'Halo.',
    metadata: { sentenceAuthoringV1: { keep: true } }
  }],
  audioVariants: []
});
for (const scope of [TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS, TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_EDGE_PRESET]) {
  const result = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope, documentId: docId }
  });
  const next = result.snapshot;
  assert.deepEqual(next.blocks, snapshot.blocks, 'Workspace reset must not touch Card records');
  assert.deepEqual(next.segments, snapshot.segments, 'Workspace reset must not touch Segment records');
  assert.deepEqual(next.audioVariants, snapshot.audioVariants, 'Workspace reset must not touch audio variants');
  assert.deepEqual(next.documents[0].metadata.externalSourceV1, original.externalSourceV1);
  const nextDoc = { metadata: next.documents[0].metadata };
  if (scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS) {
    assert.deepEqual(nextDoc.metadata.audioDownloadProfileV1, original.audioDownloadProfileV1);
  } else {
    assert.equal(getTextStructuredAudioDownloadChannelMode(nextDoc, 'text'), TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT);
    assert.equal(getTextStructuredAudioDownloadChannelMode(nextDoc, 'meaning'), TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT);
    assert.deepEqual(nextDoc.metadata.audioVoiceOverrideV1, original.audioVoiceOverrideV1);
  }
  const again = applyTextLibraryCommand(next, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope, documentId: docId }
  });
  assert.deepEqual(again.snapshot.documents[0].metadata, next.documents[0].metadata, 'Scoped reset idempotency');
}
console.log('Final Text Audio UI hotfix: scoped Workspace reset contracts PASS');
