import { createD4aConversationFixture } from '../d4a/conversation-editor-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata } from '../../../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredSpeakerVoiceProfileV2Metadata } from '../../../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import { buildTextStructuredAudioRequirementsForDocument } from '../../../src/domain/text/textStructuredAudioRequirementDomain.js';

export const createD5AudioFixture = () => {
  const fixture = createD4aConversationFixture();
  let snapshot = fixture.snapshot;
  const preferences = { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 };
  const document = snapshot.documents.find(d => d.id === fixture.ids.documentId);
  let metadata = document.metadata;
  for (const [unitId, voiceId] of [[fixture.ids.aliceTurnId, 'en-GB-RyanNeural'], [fixture.ids.bobTurnId, 'en-GB-SoniaNeural']]) {
    const unit = snapshot.contentUnits.find(u => u.id === unitId);
    metadata = buildTextStructuredAudioDownloadProfileMetadata({ metadata, channel: 'text', speakerId: unit.speakerId, voiceId });
    metadata = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata, channel: 'text', speakerId: unit.speakerId, voiceName: voiceId });
  }
  snapshot = applyTextLibraryCommand(snapshot, { type: 'document.update', payload: { id: document.id, metadata } }, 300).snapshot;
  const requirements = buildTextStructuredAudioRequirementsForDocument({ documentTree: resolveTextLibraryDocumentTree(snapshot, document.id), preferences });
  const runtimeAudioUrls = {};
  for (const req of requirements) {
    const result = applyTextLibraryCommand(snapshot, { type: 'audioVariant.upsert', payload: { segmentId: req.segmentId,
      channel: req.channel, engine: req.engine, voiceId: req.voiceId, source: 'generated', filename: `${req.renderFingerprint}.mp3`,
      metadata: { audioRenderFingerprintV1: req.renderFingerprint, audioRenderDescriptorV1: req.renderDescriptor } } }, 300);
    snapshot = result.snapshot;
    runtimeAudioUrls[result.result.id] = { url: `blob:d5-fixture-${result.result.id}`, renderFingerprint: req.renderFingerprint };
  }
  return { ...fixture, snapshot, preferences, requirements, runtimeAudioUrls };
};
