import { backfillTextContentUnits } from '../../../src/domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../../../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';

// In-memory, disposable v2 state only. Never opens IndexedDB or imports a live service.
export const createD4aConversationFixture = () => {
  let snapshot = backfillTextContentUnits({ schemaVersion: 1, initialized: true, activeDocumentId: null,
    counters: {}, collections: [], documents: [], blocks: [], segments: [], audioVariants: [] }, { now: 100 }).snapshot;
  const apply = (type, payload) => {
    const outcome = applyTextLibraryCommand(snapshot, { type, payload }, 100);
    snapshot = outcome.snapshot;
    return outcome.result;
  };
  const documentId = apply('document.create', { title: 'D4A disposable conversation', documentType: 'conversation' }).id;
  const sceneId = apply('block.create', { documentId, blockType: 'conversation', title: 'Arrival' }).id;
  const zeroSceneId = apply('block.create', { documentId, blockType: 'conversation', title: 'Intentionally empty scene' }).id;
  const aliceTurnId = apply('contentUnit.create', { blockId: sceneId, speaker: 'Alice', metadata: { note: 'Retain this Turn' } }).id;
  const firstSentenceId = apply('segment.create', { blockId: sceneId, unitId: aliceTurnId, text: 'Hello. Welcome.', meaning: 'Halo. Selamat datang.', joinAfter: 'line', metadata: { sourceTag: 'D4A' } }).id;
  const secondSentenceId = apply('segment.create', { blockId: sceneId, unitId: aliceTurnId, text: 'Please sit.', meaning: 'Silakan duduk.' }).id;
  const emptyTurnId = apply('contentUnit.create', { blockId: sceneId, speaker: 'Alice' }).id;
  const nextAliceTurnId = apply('contentUnit.create', { blockId: sceneId, speaker: 'Alice', text: 'Tea?' }).id;
  const bobTurnId = apply('contentUnit.create', { blockId: sceneId, speaker: 'Bob', text: 'Thank you.' }).id;
  const bobSentenceId = snapshot.segments.find(segment => segment.unitId === bobTurnId).id;
  const mixedDocumentId = apply('document.create', { title: 'Future Mixed', documentType: 'mixed' }).id;
  const paragraphId = apply('block.create', { documentId: mixedDocumentId, blockType: 'paragraph' }).id;
  const mixedSceneId = apply('block.create', { documentId: mixedDocumentId, blockType: 'conversation' }).id;
  for (const segment of snapshot.segments) {
    for (const channel of ['text', 'meaning']) {
      if (!segment[channel === 'text' ? 'text' : 'meaning']) continue;
      const { renderFingerprint, descriptor } = buildTextStructuredAudioRenderFingerprint({
        content: channel === 'text' ? segment.text : segment.meaning, channel, voiceId: 'en-GB-RyanNeural'
      });
      apply('audioVariant.upsert', { segmentId: segment.id, channel, engine: 'edge', voiceId: 'en-GB-RyanNeural',
        filename: `${segment.id}-${channel}.mp3`, metadata: { audioRenderFingerprintV1: renderFingerprint, audioRenderDescriptorV1: descriptor } });
    }
  }
  snapshot = { ...snapshot, activeDocumentId: documentId };
  return { snapshot, ids: { documentId, sceneId, zeroSceneId, aliceTurnId, firstSentenceId, secondSentenceId,
    emptyTurnId, nextAliceTurnId, bobTurnId, bobSentenceId, mixedDocumentId, paragraphId, mixedSceneId } };
};
