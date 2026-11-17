import { backfillTextContentUnits } from '../../../src/domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../../../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../../../src/domain/text/textStructuredSplitFullDomain.js';
import { normalizeTextStructuredPreferences } from '../../../src/domain/text/textStructuredPlaybackPreferenceDomain.js';

/**
 * In-memory disposable A4-H2 Conversation fixture for DEV QA & automated verification.
 * Never opens IndexedDB or imports persistence stores.
 */
export const createA4hShowcaseConversationFixture = ({
  includeAudioVariants = true,
  includeFullArtifact = false
} = {}) => {
  let snapshot = backfillTextContentUnits({
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: null,
    counters: {},
    collections: [],
    documents: [],
    blocks: [],
    segments: [],
    audioVariants: []
  }, { now: 100 }).snapshot;

  const apply = (type, payload) => {
    const outcome = applyTextLibraryCommand(snapshot, { type, payload }, 100);
    snapshot = outcome.snapshot;
    return outcome.result;
  };

  const documentId = apply('document.create', {
    title: 'Morning Café & Station Platform',
    documentType: 'conversation'
  }).id;

  const scene1Id = apply('block.create', {
    documentId,
    blockType: 'conversation',
    title: 'At the Station Café Counter'
  }).id;

  const scene2Id = apply('block.create', {
    documentId,
    blockType: 'conversation',
    title: 'Platform Two Farewell'
  }).id;

  const zeroSceneId = apply('block.create', {
    documentId,
    blockType: 'conversation',
    title: 'Quiet Waiting Room'
  }).id;

  // Scene 1 Turns & Sentences
  const baristaTurn1Id = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: 'Barista'
  }).id;
  const baristaS1Id = apply('segment.create', {
    blockId: scene1Id,
    unitId: baristaTurn1Id,
    text: 'Good morning! Are you catching the 7:40 express?',
    meaning: 'Selamat pagi! Apakah Anda mengejar kereta ekspres jam 7.40?',
    joinAfter: 'space'
  }).id;
  const baristaS2Id = apply('segment.create', {
    blockId: scene1Id,
    unitId: baristaTurn1Id,
    text: 'We just pulled a fresh pot of dark roast from Bandung.',
    meaning: 'Kami baru saja menyeduh satu teko kopi sangrai gelap segar dari Bandung.',
    joinAfter: 'line'
  }).id;

  const mayaTurn1Id = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: 'Maya'
  }).id;
  const mayaS3Id = apply('segment.create', {
    blockId: scene1Id,
    unitId: mayaTurn1Id,
    text: 'Yes, please—one black coffee without sugar, and two warm croissants.',
    meaning: 'Ya, tolong—satu kopi hitam tanpa gula, dan dua croissant hangat.',
    joinAfter: 'line'
  }).id;
  const mayaS4MissingMeaningId = apply('segment.create', {
    blockId: scene1Id,
    unitId: mayaTurn1Id,
    text: 'Wait—where is the platform timetable link again?',
    meaning: ''
  }).id;

  // Consecutive same-speaker Maya Turn with multilingual + long token URL
  const mayaTurn2ConsecutiveId = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: 'Maya'
  }).id;
  const mayaS5UrlId = apply('segment.create', {
    blockId: scene1Id,
    unitId: mayaTurn2ConsecutiveId,
    text: 'Found it: check https://prolingo.example.org/timetable/express-platform-2026 along with notes from Zürich and 東京.',
    meaning: 'Ketemu: periksa https://prolingo.example.org/timetable/express-platform-2026 bersama catatan dari Zürich dan 東京.'
  }).id;

  // Attributed empty Turn (speaker pauses between lines)
  const baristaEmptyTurnId = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: 'Barista'
  }).id;

  // Unassigned speaker Turn (stage/announcement direction with null speaker)
  const unassignedTurnId = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: ''
  }).id;
  const unassignedS6Id = apply('segment.create', {
    blockId: scene1Id,
    unitId: unassignedTurnId,
    text: 'All aboard the Jakarta Kota express on Platform 2.',
    meaning: 'Seluruh penumpang kereta ekspres Jakarta Kota dipersilakan naik di Peron 2.'
  }).id;

  // Duplicate English text across two speakers with distinct Indonesian meanings
  const tariTurnId = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: 'Tari'
  }).id;
  const duplicateEnTariId = apply('segment.create', {
    blockId: scene1Id,
    unitId: tariTurnId,
    text: 'Excuse me, is this seat free?',
    meaning: 'Permisi, apakah kursi ini kosong untuk duduk?'
  }).id;

  const mayaTurn3DupId = apply('contentUnit.create', {
    blockId: scene1Id,
    speaker: 'Maya'
  }).id;
  const duplicateEnMayaId = apply('segment.create', {
    blockId: scene1Id,
    unitId: mayaTurn3DupId,
    text: 'Excuse me, is this seat free?',
    meaning: 'Maaf, apakah tempat duduk ini masih tersedia untuk tas saya?'
  }).id;

  // Scene 2 Turns
  const scene2BaristaTurnId = apply('contentUnit.create', {
    blockId: scene2Id,
    speaker: 'Barista'
  }).id;
  const scene2S1Id = apply('segment.create', {
    blockId: scene2Id,
    unitId: scene2BaristaTurnId,
    text: 'Have a smooth ride today!',
    meaning: 'Semoga perjalanan Anda menyenangkan hari ini!'
  }).id;

  const scene2MayaTurnId = apply('contentUnit.create', {
    blockId: scene2Id,
    speaker: 'Maya'
  }).id;
  const scene2S2Id = apply('segment.create', {
    blockId: scene2Id,
    unitId: scene2MayaTurnId,
    text: 'Thank you, see you tomorrow!',
    meaning: 'Terima kasih, sampai jumpa besok!'
  }).id;

  if (includeAudioVariants) {
    for (const segment of snapshot.segments) {
      for (const channel of ['text', 'meaning']) {
        const content = channel === 'text' ? segment.text : segment.meaning;
        if (!content) continue;
        const { renderFingerprint, descriptor } = buildTextStructuredAudioRenderFingerprint({
          content,
          channel,
          voiceId: 'en-GB-RyanNeural'
        });
        apply('audioVariant.upsert', {
          segmentId: segment.id,
          channel,
          engine: 'edge',
          voiceId: 'en-GB-RyanNeural',
          filename: `${segment.id}-${channel}.mp3`,
          metadata: {
            audioRenderFingerprintV1: renderFingerprint,
            audioRenderDescriptorV1: descriptor
          }
        });
      }
    }
  }

  const preferences = normalizeTextStructuredPreferences({
    audioSourceMode: 'local-first',
    playbackRepresentationMode: includeFullArtifact ? 'full' : 'split',
    playbackChannelMode: 'text-only'
  });

  const runtimeFullAudio = {};
  if (includeFullArtifact) {
    const tree = resolveTextLibraryDocumentTree(snapshot, documentId);
    const block = tree.blocks.find(b => b.id === scene1Id);
    const plan = buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree: tree,
      block,
      audioVariants: snapshot.audioVariants,
      preferences,
      representationMode: 'full'
    });
    const artifact = buildTextStructuredFullArtifactRecord({
      block,
      channel: 'text',
      composition: plan.composition,
      source: 'derived',
      mimeType: 'audio/wav'
    });
    snapshot = applyTextLibraryCommand(snapshot, {
      type: 'fullAudioArtifact.upsert',
      payload: { blockId: scene1Id, artifact }
    }, 600).snapshot;
    runtimeFullAudio[artifact.fullArtifactFingerprint] = {
      blob: new Blob(['A4H QA derived WAV'], { type: 'audio/wav' }),
      url: 'blob:a4h-qa-full-scene1',
      fullArtifactFingerprint: artifact.fullArtifactFingerprint
    };
  }

  snapshot = { ...snapshot, activeDocumentId: documentId };

  return {
    snapshot,
    preferences,
    runtimeFullAudio,
    ids: {
      documentId,
      scene1Id,
      scene2Id,
      zeroSceneId,
      baristaTurn1Id,
      baristaS1Id,
      baristaS2Id,
      mayaTurn1Id,
      mayaS3Id,
      mayaS4MissingMeaningId,
      mayaTurn2ConsecutiveId,
      mayaS5UrlId,
      baristaEmptyTurnId,
      unassignedTurnId,
      unassignedS6Id,
      tariTurnId,
      duplicateEnTariId,
      mayaTurn3DupId,
      duplicateEnMayaId,
      scene2BaristaTurnId,
      scene2S1Id,
      scene2MayaTurnId,
      scene2S2Id
    }
  };
};
