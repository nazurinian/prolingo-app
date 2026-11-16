import { backfillTextContentUnits } from '../../../src/domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../../src/domain/text/textStructuredAudioRuntimeDomain.js';
import { TEXT_AUDIO_COVERAGE_STATUS } from '../../../src/domain/text/textStructuredAudioCoverageDomain.js';
import {
  TEXT_PARAGRAPH_CARD_ROLES,
  buildTextParagraphCardRoleMetadata
} from '../../../src/domain/text/textParagraphRoleDomain.js';

/**
 * Isolated, disposable Paragraph fixtures for Shared Card UI A2 evaluation and browser tests.
 * Never opens IndexedDB or mutates canonical snapshots.
 */
export const createA2ParagraphReaderFixture = () => {
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
  }, { now: 820 }).snapshot;

  const apply = (type, payload) => {
    const res = applyTextLibraryCommand(snapshot, { type, payload }, 820);
    snapshot = res.snapshot;
    return res.result.id;
  };

  const documentId = apply('document.create', {
    title: 'Morning Commute in Jakarta',
    documentType: 'paragraph',
    textLanguage: 'en',
    meaningLanguage: 'id'
  });

  // Card 1: TITLE role card with subtitle prose
  const titleCardId = apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Chapter One · Early Train Through Gambir',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.TITLE })
  });
  const titleSectionId = snapshot.contentUnits.find(u => u.blockId === titleCardId)?.id
    || apply('contentUnit.create', { blockId: titleCardId, kind: 'paragraph' });
  const titleSeg1Id = apply('segment.create', {
    blockId: titleCardId,
    unitId: titleSectionId,
    text: 'A calm morning routine before the station platform fills with commuters.',
    meaning: 'Rutinitas pagi yang tenang sebelum peron stasiun dipenuhi para komuter.',
    joinAfter: 'paragraph'
  });

  // Card 2: Multi-section editorial Paragraph card (3 Sections including Empty Section,
  // long wrapped prose, duplicate English text with different meanings, joinAfter: line, missing meaning)
  const storyCardId = apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Waiting for the Express',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH })
  });
  const storySection1Id = snapshot.contentUnits.find(u => u.blockId === storyCardId)?.id
    || apply('contentUnit.create', { blockId: storyCardId, kind: 'paragraph' });

  const longSegId = apply('segment.create', {
    blockId: storyCardId,
    unitId: storySection1Id,
    text: ' Sunlight slanted across the wet platform tiles while announcements echoed above the tracks, reminding passengers to step behind the yellow safety line as the commuter train approached slowly through the morning mist.',
    meaning: 'Cahaya matahari menyinari ubin peron yang masih basah sementara pengumuman bergema di atas rel, mengingatkan penumpang agar berdiri di belakang garis pengaman kuning saat kereta komuter melaju perlahan menembus kabut pagi.',
    joinAfter: 'line'
  });

  const duplicateSeg1Id = apply('segment.create', {
    blockId: storyCardId,
    unitId: storySection1Id,
    text: 'The door stayed open.',
    meaning: 'Pintu kereta itu dibiarkan terbuka untuk penumpang yang masih naik.',
    joinAfter: 'paragraph'
  });

  const storySection2Id = apply('contentUnit.create', {
    blockId: storyCardId,
    kind: 'paragraph',
    text: 'He checked his pocket watch and folded the damp newspaper neatly beside his bag.',
    meaning: 'Ia memeriksa arloji sakunya lalu melipat koran yang lembap itu dengan rapi di sebelah tasnya.'
  });
  const s2FirstSegId = snapshot.segments.find(s => s.unitId === storySection2Id)?.id;

  const missingMeaningSegId = apply('segment.create', {
    blockId: storyCardId,
    unitId: storySection2Id,
    text: 'This middle sentence intentionally has no Indonesian translation yet so layout alignment can be verified.',
    meaning: '',
    joinAfter: 'paragraph'
  });

  const duplicateSeg2Id = apply('segment.create', {
    blockId: storyCardId,
    unitId: storySection2Id,
    text: 'The door stayed open.',
    meaning: 'Pintu gerbang stasiun sudah dibuka sejak pukul lima pagi.',
    joinAfter: 'paragraph'
  });

  // Persistent Empty Section inside Card 2
  const emptySectionId = apply('contentUnit.create', {
    blockId: storyCardId,
    kind: 'paragraph'
  });

  // Card 3: Multilingual diacritics + long unbroken URL wrapping check
  const multilingualCardId = apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Multilingual Café Notes & Long Tokens',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH })
  });
  const multilingualSectionId = snapshot.contentUnits.find(u => u.blockId === multilingualCardId)?.id
    || apply('contentUnit.create', { blockId: multilingualCardId, kind: 'paragraph' });
  const multilingualSegId = apply('segment.create', {
    blockId: multilingualCardId,
    unitId: multilingualSectionId,
    text: 'At the café in Zürich (Bahnhofstraße 12), visitors read multilingual notes including 東京, مرحبا, and long references such as https://prolingo.example.org/reader/bilingual-typography-and-wrap-verification-2026.',
    meaning: 'Di sebuah kafe di Zürich (Bahnhofstraße 12), para pengunjung membaca catatan multibahasa termasuk 東京, مرحبا, serta rujukan panjang seperti https://prolingo.example.org/reader/bilingual-typography-and-wrap-verification-2026.',
    joinAfter: 'paragraph'
  });

  // Card 4: Zero-Unit empty Paragraph Card
  const emptyCardId = apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Author Notes (Empty Card)',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH })
  });
  for (const unit of snapshot.contentUnits.filter(u => u.blockId === emptyCardId)) {
    snapshot = applyTextLibraryCommand(snapshot, {
      type: 'contentUnit.delete',
      payload: { id: unit.id }
    }, 820).snapshot;
  }

  // Keep raw un-trimmed whitespace sample on first long segment for fidelity verification
  snapshot = {
    ...snapshot,
    segments: snapshot.segments.map(seg => (seg.id === longSegId
      ? {
          ...seg,
          text: `  ${seg.text.trim()}  `,
          meaning: `  ${seg.meaning.trim()}  `
        }
      : seg))
  };

  // Host coverage map sample (domain-derived keys)
  const audioCoverageMap = {
    [buildTextStructuredRuntimeAudioKey(titleSeg1Id, 'text')]: {
      status: TEXT_AUDIO_COVERAGE_STATUS.READY,
      requiredVoiceId: 'en-GB-SoniaNeural'
    },
    [buildTextStructuredRuntimeAudioKey(titleSeg1Id, 'meaning')]: {
      status: TEXT_AUDIO_COVERAGE_STATUS.READY,
      requiredVoiceId: 'id-ID-GadisNeural'
    },
    [buildTextStructuredRuntimeAudioKey(longSegId, 'text')]: {
      status: TEXT_AUDIO_COVERAGE_STATUS.READY,
      requiredVoiceId: 'en-GB-SoniaNeural'
    },
    [buildTextStructuredRuntimeAudioKey(longSegId, 'meaning')]: {
      status: TEXT_AUDIO_COVERAGE_STATUS.STALE,
      requiredVoiceId: 'id-ID-GadisNeural'
    },
    [buildTextStructuredRuntimeAudioKey(duplicateSeg1Id, 'text')]: {
      status: TEXT_AUDIO_COVERAGE_STATUS.READY,
      requiredVoiceId: 'en-GB-SoniaNeural'
    },
    [buildTextStructuredRuntimeAudioKey(duplicateSeg2Id, 'text')]: {
      status: TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE,
      requiredVoiceId: 'en-GB-LibbyNeural'
    }
  };

  return {
    snapshot,
    audioCoverageMap,
    ids: {
      documentId,
      titleCardId,
      titleSectionId,
      titleSeg1Id,
      storyCardId,
      storySection1Id,
      storySection2Id,
      emptySectionId,
      longSegId,
      duplicateSeg1Id,
      s2FirstSegId,
      missingMeaningSegId,
      duplicateSeg2Id,
      multilingualCardId,
      multilingualSectionId,
      multilingualSegId,
      emptyCardId
    }
  };
};

export const createA2V1CompatibilityParagraphFixture = () => {
  let snapshot = {
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: null,
    counters: {},
    collections: [],
    documents: [],
    blocks: [],
    segments: [],
    audioVariants: []
  };
  const apply = (type, payload) => {
    const res = applyTextLibraryCommand(snapshot, { type, payload }, 821);
    snapshot = res.snapshot;
    return res.result.id;
  };
  const documentId = apply('document.create', {
    title: 'V1 Compatibility Reading Passage',
    documentType: 'paragraph',
    textLanguage: 'en',
    meaningLanguage: 'id'
  });
  const titleCardId = apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Legacy Schema v1 Title',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.TITLE })
  });
  const titleSegId = apply('segment.create', {
    blockId: titleCardId,
    text: 'A classic v1 Title card reading.',
    meaning: 'Bacaan kartu Judul skema v1 klasik.'
  });
  const cardId = apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'V1 Virtual Section Card',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH })
  });
  const seg1Id = apply('segment.create', {
    blockId: cardId,
    text: 'In schema version 1, Paragraph cards have no persistent Sections.',
    meaning: 'Pada skema versi 1, kartu Paragraf belum memiliki Section persisten.'
  });
  const seg2Id = apply('segment.create', {
    blockId: cardId,
    text: 'This second sentence demonstrates an omitted Indonesian meaning in v1.',
    meaning: ''
  });
  const seg3Id = apply('segment.create', {
    blockId: cardId,
    text: 'The third sentence keeps its exact Segment identity and interactive playback.',
    meaning: 'Kalimat ketiga tetap mempertahankan identitas Segment dan pemutaran interaktifnya.'
  });

  return {
    snapshot,
    ids: { documentId, titleCardId, titleSegId, cardId, seg1Id, seg2Id, seg3Id }
  };
};
