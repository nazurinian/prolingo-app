import { createD5AudioFixture } from '../d5/conversation-audio-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../../../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../../../src/domain/text/textStructuredSplitFullDomain.js';

/** Disposable in-memory v2 only. No persistence, real audio generation or database. */
export const createP13MixedFixture = ({ runtimeBindings = false } = {}) => {
  const base = createD5AudioFixture();
  let snapshot = base.snapshot;
  const apply = (type, payload) => {
    const result = applyTextLibraryCommand(snapshot, { type, payload }, 1300);
    snapshot = result.snapshot;
    return result.result.id;
  };
  const { documentId, sceneId, zeroSceneId, mixedDocumentId, paragraphId, mixedSceneId } = base.ids;
  apply('document.update', { id: documentId, documentType: 'mixed', title: 'P13 Mixed Workspace' });
  const beforeCardId = apply('block.create', { documentId, blockType: 'paragraph', title: 'Before the dialogue', metadata: { sourceTag: 'p13-before' } });
  const sectionId = snapshot.contentUnits.find(u => u.blockId === beforeCardId)?.id
    || apply('contentUnit.create', { blockId: beforeCardId, kind: 'paragraph' });
  const beforeSentenceId = apply('segment.create', {
    blockId: beforeCardId, unitId: sectionId, text: '  Hello. Welcome.  ', meaning: 'Arti pengantar, bukan dialog.',
    joinAfter: 'line', metadata: { sourceTag: 'p13-source-sentence', translatedFrom: 'fixture' }
  });
  const blankMeaningId = apply('segment.create', {
    blockId: beforeCardId, unitId: sectionId, text: 'Hello. Welcome.', meaning: '', joinAfter: 'paragraph'
  });
  const secondSectionId = apply('contentUnit.create', {
    blockId: beforeCardId, kind: 'paragraph', text: 'The meeting is about to begin.', meaning: 'Pertemuan akan dimulai.'
  });
  const emptySectionId = apply('contentUnit.create', { blockId: beforeCardId, kind: 'paragraph' });
  const afterCardId = apply('block.create', { documentId, blockType: 'paragraph', title: 'After the dialogue' });
  const afterSectionId = snapshot.contentUnits.find(u => u.blockId === afterCardId)?.id
    || apply('contentUnit.create', { blockId: afterCardId, kind: 'paragraph' });
  const afterSentenceId = apply('segment.create', {
    blockId: afterCardId, unitId: afterSectionId, text: 'The conversation ended quietly.', meaning: 'Percakapan berakhir dengan tenang.'
  });
  const emptyParagraphId = apply('block.create', { documentId, blockType: 'paragraph', title: 'Intentionally empty Paragraph' });
  for (const unit of snapshot.contentUnits.filter(u => u.blockId === emptyParagraphId)) apply('contentUnit.delete', { id: unit.id });
  const laterSceneId = apply('block.create', { documentId, blockType: 'conversation', title: 'The same cast returns' });
  const aliceId = snapshot.contentUnits.find(u => u.id === base.ids.aliceTurnId).speakerId;
  const laterTurnId = apply('contentUnit.create', { blockId: laterSceneId, speakerId: aliceId, speaker: 'Alice', text: 'Welcome back.', meaning: 'Selamat datang kembali.' });
  const unassignedTurnId = apply('contentUnit.create', { blockId: laterSceneId, text: 'An unassigned speaker.', meaning: 'Pembicara belum ditetapkan.' });
  const cardOrder = [beforeCardId, sceneId, afterCardId, zeroSceneId, emptyParagraphId, laterSceneId];
  apply('block.reorder', { documentId, orderedIds: cardOrder });
  apply('document.update', { id: mixedDocumentId, title: 'P13 Other Mixed Workspace' });
  const otherSectionId = snapshot.contentUnits.find(u => u.blockId === paragraphId)?.id
    || apply('contentUnit.create', { blockId: paragraphId, kind: 'paragraph' });
  apply('segment.create', { blockId: paragraphId, unitId: otherSectionId, text: 'Another Workspace.', meaning: 'Workspace lain.' });
  apply('contentUnit.create', { blockId: mixedSceneId, speaker: 'Alice', text: 'A separate cast.', meaning: 'Identitas pembicara lain.' });
  const render = buildTextStructuredAudioRenderFingerprint({ content: 'Hello. Welcome.', channel: 'text', voiceId: base.preferences.edgeTextVoiceId });
  const paragraphAudioId = apply('audioVariant.upsert', {
    segmentId: beforeSentenceId, channel: 'text', engine: 'edge', voiceId: base.preferences.edgeTextVoiceId,
    source: 'generated', filename: render.renderFingerprint + '.mp3',
    metadata: { audioRenderFingerprintV1: render.renderFingerprint, audioRenderDescriptorV1: render.descriptor, fixtureNote: 'preserve exactly' }
  });
  const tree = resolveTextLibraryDocumentTree(snapshot, documentId);
  const scene = tree.blocks.find(b => b.id === sceneId);
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: tree, block: scene, audioVariants: snapshot.audioVariants,
    preferences: base.preferences, representationMode: 'full'
  });
  const artifact = buildTextStructuredFullArtifactRecord({ block: scene, channel: 'text', composition: plan.composition, source: 'derived', mimeType: 'audio/wav' });
  apply('fullAudioArtifact.upsert', { blockId: sceneId, artifact });
  snapshot = { ...snapshot, activeDocumentId: documentId };
  // Imported raw whitespace is legal; creation commands normally trim drafts.
  snapshot.segments.find(s => s.id === beforeSentenceId).text = '  Hello. Welcome.  ';
  // Only runtime-injection tests request these bindings. The DEV preview is metadata-only.
  const runtimeAudioUrls = runtimeBindings ? { ...base.runtimeAudioUrls,
    [paragraphAudioId]: { url: 'blob:p13-injected-runtime-only', renderFingerprint: render.renderFingerprint } } : {};
  return { snapshot, preferences: base.preferences, runtimeAudioUrls, artifact,
    ids: { ...base.ids, beforeCardId, sectionId, beforeSentenceId, blankMeaningId, secondSectionId, emptySectionId,
      afterCardId, afterSectionId, afterSentenceId, emptyParagraphId, laterSceneId, laterTurnId, unassignedTurnId, paragraphAudioId },
    cardOrder };
};
