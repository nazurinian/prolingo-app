import { backfillTextContentUnits } from '../../../src/domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import {
  TEXT_PARAGRAPH_CARD_ROLES,
  buildTextParagraphCardRoleMetadata
} from '../../../src/domain/text/textParagraphRoleDomain.js';

const FIXTURE_NOW = 4000;

/**
 * Authoritative UAT-4 Mixed fixture dataset: "A Journey to London".
 * 4 Cards, 11 Content Units, 37 exact bilingual Segment pairs.
 * Source of truth: docs/uat4/ProLingo_UAT4_Mixed_Fixture_A_Journey_to_London.md
 */
export const JOURNEY_TO_LONDON_CARDS_SPEC = Object.freeze([
  Object.freeze({
    key: 'P1',
    blockType: 'paragraph',
    title: 'Preparing for the Journey',
    units: Object.freeze([
      Object.freeze({
        key: 'P1_SC1',
        kind: 'paragraph',
        segments: Object.freeze([
          Object.freeze({
            text: 'James woke up earlier than usual because he was travelling to London that morning.',
            meaning: 'James bangun lebih awal dari biasanya karena pagi itu ia akan bepergian ke London.'
          }),
          Object.freeze({
            text: 'He had packed his suitcase the night before, but he still needed to check a few things.',
            meaning: 'Ia telah mengemas kopernya malam sebelumnya, tetapi masih perlu memeriksa beberapa hal.'
          }),
          Object.freeze({
            text: 'After having breakfast, he checked his train schedule and made sure that his phone was fully charged.',
            meaning: 'Setelah sarapan, ia memeriksa jadwal kereta dan memastikan ponselnya terisi penuh.'
          }),
          Object.freeze({
            text: 'He left the house at half past seven, feeling excited about the journey ahead.',
            meaning: 'Ia meninggalkan rumah pukul setengah delapan, merasa bersemangat menghadapi perjalanan itu.'
          })
        ])
      }),
      Object.freeze({
        key: 'P1_SC2',
        kind: 'paragraph',
        segments: Object.freeze([
          Object.freeze({
            text: 'When James arrived at the railway station, the main entrance was already crowded with passengers.',
            meaning: 'Ketika James tiba di stasiun kereta, pintu masuk utama sudah dipenuhi penumpang.'
          }),
          Object.freeze({
            text: 'Some people were waiting for their trains, while others were buying tickets at the counter.',
            meaning: 'Sebagian orang sedang menunggu kereta, sementara yang lain membeli tiket di loket.'
          }),
          Object.freeze({
            text: 'James looked at the departure board to find the next available train to London.',
            meaning: 'James melihat papan keberangkatan untuk menemukan kereta berikutnya menuju London.'
          }),
          Object.freeze({
            text: 'He then walked towards the ticket office, hoping that there were still some seats available.',
            meaning: 'Ia kemudian berjalan menuju loket tiket, berharap masih ada kursi yang tersedia.'
          })
        ])
      })
    ])
  }),
  Object.freeze({
    key: 'C1',
    blockType: 'conversation',
    title: 'Buying a Train Ticket',
    units: Object.freeze([
      Object.freeze({
        key: 'C1_T1',
        kind: 'turn',
        speaker: 'James',
        segments: Object.freeze([
          Object.freeze({
            text: "Good morning. I'd like to buy a ticket to London, please.",
            meaning: 'Selamat pagi. Saya ingin membeli tiket ke London.'
          }),
          Object.freeze({
            text: 'Could you tell me when the next train leaves?',
            meaning: 'Bisakah Anda memberi tahu saya kapan kereta berikutnya berangkat?'
          }),
          Object.freeze({
            text: 'I would prefer a direct train if there is one available.',
            meaning: 'Saya lebih memilih kereta langsung jika tersedia.'
          })
        ])
      }),
      Object.freeze({
        key: 'C1_T2',
        kind: 'turn',
        speaker: 'Ticket Officer',
        segments: Object.freeze([
          Object.freeze({
            text: 'Certainly. The next direct train leaves at nine fifteen from platform four.',
            meaning: 'Tentu. Kereta langsung berikutnya berangkat pukul sembilan lewat lima belas dari peron empat.'
          }),
          Object.freeze({
            text: 'The journey usually takes about two hours, depending on the service.',
            meaning: 'Perjalanan biasanya memakan waktu sekitar dua jam, tergantung layanannya.'
          }),
          Object.freeze({
            text: 'Would you like a single ticket or a return ticket?',
            meaning: 'Apakah Anda ingin tiket sekali jalan atau pulang-pergi?'
          })
        ])
      }),
      Object.freeze({
        key: 'C1_T3',
        kind: 'turn',
        speaker: 'James',
        segments: Object.freeze([
          Object.freeze({
            text: "A return ticket would be better because I'm planning to come back on Sunday evening.",
            meaning: 'Tiket pulang-pergi lebih baik karena saya berencana kembali pada Minggu malam.'
          }),
          Object.freeze({
            text: 'Could I also have a seat next to the window, if possible?',
            meaning: 'Bisakah saya mendapatkan tempat duduk di dekat jendela, jika memungkinkan?'
          }),
          Object.freeze({
            text: "I'd like to enjoy the view during the journey.",
            meaning: 'Saya ingin menikmati pemandangan selama perjalanan.'
          })
        ])
      }),
      Object.freeze({
        key: 'C1_T4',
        kind: 'turn',
        speaker: 'Ticket Officer',
        segments: Object.freeze([
          Object.freeze({
            text: "Of course. I've reserved a window seat for you in carriage B.",
            meaning: 'Tentu. Saya telah memesan kursi dekat jendela untuk Anda di gerbong B.'
          }),
          Object.freeze({
            text: 'Here is your ticket, and please keep it with you until you leave the station in London.',
            meaning: 'Ini tiket Anda, dan mohon simpan sampai Anda meninggalkan stasiun di London.'
          }),
          Object.freeze({
            text: 'Have a pleasant journey, and thank you for travelling with us.',
            meaning: 'Semoga perjalanan Anda menyenangkan, dan terima kasih telah bepergian bersama kami.'
          })
        ])
      })
    ])
  }),
  Object.freeze({
    key: 'P2',
    blockType: 'paragraph',
    title: 'On the Train',
    units: Object.freeze([
      Object.freeze({
        key: 'P2_SC1',
        kind: 'paragraph',
        segments: Object.freeze([
          Object.freeze({
            text: 'The train departed on time, and James quickly settled into his comfortable window seat.',
            meaning: 'Kereta berangkat tepat waktu, dan James segera duduk dengan nyaman di kursi dekat jendela.'
          }),
          Object.freeze({
            text: 'As the train moved through the countryside, he watched the green fields and small villages pass by.',
            meaning: 'Saat kereta melintasi pedesaan, ia mengamati ladang hijau dan desa-desa kecil yang dilewatinya.'
          }),
          Object.freeze({
            text: 'He took out a book from his bag and began reading while enjoying a cup of coffee.',
            meaning: 'Ia mengeluarkan buku dari tasnya dan mulai membaca sambil menikmati secangkir kopi.'
          }),
          Object.freeze({
            text: 'About half an hour later, a young woman entered the carriage and sat opposite him.',
            meaning: 'Sekitar setengah jam kemudian, seorang perempuan muda memasuki gerbong dan duduk di hadapannya.'
          }),
          Object.freeze({
            text: 'She smiled politely before asking him a question about the journey.',
            meaning: 'Ia tersenyum dengan sopan sebelum mengajukan pertanyaan tentang perjalanan.'
          })
        ])
      })
    ])
  }),
  Object.freeze({
    key: 'C2',
    blockType: 'conversation',
    title: 'Meeting Another Passenger',
    units: Object.freeze([
      Object.freeze({
        key: 'C2_T1',
        kind: 'turn',
        speaker: 'Emma',
        segments: Object.freeze([
          Object.freeze({
            text: 'Excuse me, do you know whether this train stops at Reading?',
            meaning: 'Permisi, apakah Anda tahu apakah kereta ini berhenti di Reading?'
          }),
          Object.freeze({
            text: "I don't travel by train very often, so I'm not familiar with this route.",
            meaning: 'Saya tidak terlalu sering bepergian dengan kereta, jadi saya tidak begitu mengenal rute ini.'
          }),
          Object.freeze({
            text: "I just want to make sure that I've got on the right train.",
            meaning: 'Saya hanya ingin memastikan bahwa saya naik kereta yang benar.'
          })
        ])
      }),
      Object.freeze({
        key: 'C2_T2',
        kind: 'turn',
        speaker: 'James',
        segments: Object.freeze([
          Object.freeze({
            text: 'Yes, I believe Reading is the next major stop.',
            meaning: 'Ya, saya rasa Reading adalah pemberhentian besar berikutnya.'
          }),
          Object.freeze({
            text: 'According to the schedule, we should arrive there in about twenty minutes.',
            meaning: 'Menurut jadwal, kita seharusnya tiba di sana sekitar dua puluh menit lagi.'
          }),
          Object.freeze({
            text: 'You can also check the information screen at the end of the carriage.',
            meaning: 'Anda juga bisa memeriksa layar informasi di ujung gerbong.'
          })
        ])
      }),
      Object.freeze({
        key: 'C2_T3',
        kind: 'turn',
        speaker: 'Emma',
        segments: Object.freeze([
          Object.freeze({
            text: "That's very helpful. Thank you for explaining it to me.",
            meaning: 'Itu sangat membantu. Terima kasih telah menjelaskannya kepada saya.'
          }),
          Object.freeze({
            text: "I'm visiting an old friend who recently moved there for work.",
            meaning: 'Saya akan mengunjungi seorang teman lama yang baru saja pindah ke sana untuk bekerja.'
          }),
          Object.freeze({
            text: 'Are you travelling to London for business or for a holiday?',
            meaning: 'Apakah Anda bepergian ke London untuk urusan bisnis atau liburan?'
          })
        ])
      }),
      Object.freeze({
        key: 'C2_T4',
        kind: 'turn',
        speaker: 'James',
        segments: Object.freeze([
          Object.freeze({
            text: "I'm spending the weekend in London to visit a few museums and practise my English.",
            meaning: 'Saya akan menghabiskan akhir pekan di London untuk mengunjungi beberapa museum dan berlatih bahasa Inggris.'
          }),
          Object.freeze({
            text: "I've been studying the language for several months, and I'd like to become more confident when speaking.",
            meaning: 'Saya telah mempelajari bahasa ini selama beberapa bulan dan ingin menjadi lebih percaya diri ketika berbicara.'
          }),
          Object.freeze({
            text: "It's always nice to meet someone new during a journey like this.",
            meaning: 'Selalu menyenangkan bertemu seseorang yang baru dalam perjalanan seperti ini.'
          })
        ])
      })
    ])
  })
]);

const createEmptyV2Snapshot = (now = FIXTURE_NOW) => (
  backfillTextContentUnits({
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: null,
    counters: {},
    collections: [],
    documents: [],
    blocks: [],
    segments: [],
    audioVariants: []
  }, { now }).snapshot
);

const createCommandRunner = (initialSnapshot, now = FIXTURE_NOW) => {
  let snapshot = initialSnapshot;
  return {
    getSnapshot: () => snapshot,
    setSnapshot: next => { snapshot = next; },
    apply: (type, payload) => {
      const outcome = applyTextLibraryCommand(snapshot, { type, payload }, now);
      snapshot = outcome.snapshot;
      return outcome.result;
    }
  };
};

/**
 * Creates the isolated, in-memory native v2 Mixed fixture "A Journey to London".
 * Exact counts: 4 Cards, 11 Content Units, 37 bilingual Segment pairs.
 * Never opens IndexedDB or imports fixture data into canonical storage.
 */
export const createJourneyToLondonFixture = () => {
  const runner = createCommandRunner(createEmptyV2Snapshot(FIXTURE_NOW), FIXTURE_NOW);
  const documentId = runner.apply('document.create', {
    title: 'A Journey to London',
    documentType: 'mixed',
    textLanguage: 'en',
    meaningLanguage: 'id'
  }).id;

  const speakerIds = {
    James: runner.apply('speaker.register', { documentId, label: 'James' }).id,
    'Ticket Officer': runner.apply('speaker.register', { documentId, label: 'Ticket Officer' }).id,
    Emma: runner.apply('speaker.register', { documentId, label: 'Emma' }).id
  };

  const cardIds = {};
  const unitIds = {};
  const segmentIds = [];
  const segmentIdsByUnitKey = {};

  for (const cardSpec of JOURNEY_TO_LONDON_CARDS_SPEC) {
    const blockId = runner.apply('block.create', {
      documentId,
      blockType: cardSpec.blockType,
      title: cardSpec.title
    }).id;
    cardIds[cardSpec.key] = blockId;

    const existingUnits = runner.getSnapshot().contentUnits.filter(unit => unit.blockId === blockId);
    cardSpec.units.forEach((unitSpec, unitIdx) => {
      let unitId;
      if (cardSpec.blockType === 'paragraph' && unitIdx === 0 && existingUnits[0]) {
        unitId = existingUnits[0].id;
      } else if (unitSpec.kind === 'turn') {
        unitId = runner.apply('contentUnit.create', {
          blockId,
          kind: 'turn',
          speakerId: speakerIds[unitSpec.speaker],
          speaker: unitSpec.speaker
        }).id;
      } else {
        unitId = runner.apply('contentUnit.create', {
          blockId,
          kind: 'paragraph'
        }).id;
      }

      unitIds[unitSpec.key] = unitId;
      segmentIdsByUnitKey[unitSpec.key] = [];

      for (const segSpec of unitSpec.segments) {
        const segmentId = runner.apply('segment.create', {
          blockId,
          unitId,
          text: segSpec.text,
          meaning: segSpec.meaning,
          ...(segSpec.joinAfter ? { joinAfter: segSpec.joinAfter } : {})
        }).id;
        segmentIds.push(segmentId);
        segmentIdsByUnitKey[unitSpec.key].push(segmentId);
      }
    });
  }

  runner.setSnapshot({
    ...runner.getSnapshot(),
    activeDocumentId: documentId
  });

  const snapshot = runner.getSnapshot();
  return {
    snapshot,
    ids: {
      documentId,
      speakers: Object.freeze({ ...speakerIds }),
      cards: Object.freeze({ ...cardIds }),
      units: Object.freeze({ ...unitIds }),
      segmentIds: Object.freeze([...segmentIds]),
      segmentIdsByUnitKey: Object.freeze(
        Object.fromEntries(Object.entries(segmentIdsByUnitKey).map(([k, v]) => [k, Object.freeze([...v])]))
      )
    },
    counts: Object.freeze({
      cards: snapshot.blocks.length,
      units: snapshot.contentUnits.length,
      segments: snapshot.segments.length
    })
  };
};

/**
 * Separate isolated stress fixture kept distinct from the 4/11/37 base counts.
 * Covers: Title Card role, empty Unit, same-Speaker consecutive Turns, very long
 * Speaker name, unassigned Speaker, joinAfter semantics, and unequal EN/ID lengths.
 */
export const createJourneyToLondonStressFixtures = () => {
  const runner = createCommandRunner(createEmptyV2Snapshot(FIXTURE_NOW + 100), FIXTURE_NOW + 100);
  const documentId = runner.apply('document.create', {
    title: 'UAT-4B0 Stress Cases (Separate)',
    documentType: 'mixed',
    textLanguage: 'en',
    meaningLanguage: 'id'
  }).id;

  const jamesSpeakerId = runner.apply('speaker.register', { documentId, label: 'James' }).id;
  const longSpeakerLabel = 'Senior International Railway Ticketing & Passenger Assistance Coordinator';
  const longSpeakerId = runner.apply('speaker.register', { documentId, label: longSpeakerLabel }).id;
  const emmaSpeakerId = runner.apply('speaker.register', { documentId, label: 'Emma' }).id;

  // 1. Title Card with real bilingual Segment content (must NOT receive paragraph first-line indent)
  const titleCardId = runner.apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Chapter One',
    metadata: buildTextParagraphCardRoleMetadata({ role: TEXT_PARAGRAPH_CARD_ROLES.TITLE })
  }).id;
  const titleUnitId = runner.getSnapshot().contentUnits.find(u => u.blockId === titleCardId)?.id
    || runner.apply('contentUnit.create', { blockId: titleCardId, kind: 'paragraph' }).id;
  const titleSegmentId = runner.apply('segment.create', {
    blockId: titleCardId,
    unitId: titleUnitId,
    text: 'A Journey to London',
    meaning: 'Perjalanan ke London'
  }).id;

  // 2. Paragraph stress Card: joinAfter ('none' & 'line'), unequal EN/ID lengths, and an intentionally empty Section
  const paragraphStressCardId = runner.apply('block.create', {
    documentId,
    blockType: 'paragraph',
    title: 'Punctuation, Line Break & Unequal Length Stress'
  }).id;
  const joinSectionId = runner.getSnapshot().contentUnits.find(u => u.blockId === paragraphStressCardId)?.id
    || runner.apply('contentUnit.create', { blockId: paragraphStressCardId, kind: 'paragraph' }).id;
  const joinNoneSegId = runner.apply('segment.create', {
    blockId: paragraphStressCardId,
    unitId: joinSectionId,
    text: 'Platform 4',
    meaning: 'Peron 4',
    joinAfter: 'none'
  }).id;
  const joinAfterPunctSegId = runner.apply('segment.create', {
    blockId: paragraphStressCardId,
    unitId: joinSectionId,
    text: '—direct express service—departed promptly while passengers settled into their seats for the long scenic journey across southern England.',
    meaning: '—kereta ekspres langsung—berangkat tepat waktu.',
    joinAfter: 'line'
  }).id;
  const unequalShortEnLongIdSegId = runner.apply('segment.create', {
    blockId: paragraphStressCardId,
    unitId: joinSectionId,
    text: 'All aboard!',
    meaning: 'Para penumpang yang terhormat dipersilakan segera naik ke gerbong masing-masing karena pintu kereta akan segera ditutup sebelum keberangkatan.'
  }).id;
  const emptySectionId = runner.apply('contentUnit.create', {
    blockId: paragraphStressCardId,
    kind: 'paragraph'
  }).id;

  // 3. Conversation stress Card: consecutive same-Speaker Turns, very long Speaker name, empty Turn, unassigned Turn
  const conversationStressCardId = runner.apply('block.create', {
    documentId,
    blockType: 'conversation',
    title: 'Consecutive, Long-Name & Empty Turn Stress'
  }).id;
  const consecutiveTurn1Id = runner.apply('contentUnit.create', {
    blockId: conversationStressCardId,
    kind: 'turn',
    speakerId: jamesSpeakerId,
    speaker: 'James'
  }).id;
  const consecutiveTurn1SegId = runner.apply('segment.create', {
    blockId: conversationStressCardId,
    unitId: consecutiveTurn1Id,
    text: 'Wait a moment—I think I left my boarding pass in my coat pocket.',
    meaning: 'Tunggu sebentar—sepertinya tiket saya tertinggal di saku mantel.'
  }).id;
  const consecutiveTurn2Id = runner.apply('contentUnit.create', {
    blockId: conversationStressCardId,
    kind: 'turn',
    speakerId: jamesSpeakerId,
    speaker: 'James'
  }).id;
  const consecutiveTurn2SegId = runner.apply('segment.create', {
    blockId: conversationStressCardId,
    unitId: consecutiveTurn2Id,
    text: 'Oh, here it is! Sorry for holding up the queue at the barrier.',
    meaning: 'Oh, ini dia! Maaf sudah menahan antrean di gerbang.'
  }).id;
  const longSpeakerTurnId = runner.apply('contentUnit.create', {
    blockId: conversationStressCardId,
    kind: 'turn',
    speakerId: longSpeakerId,
    speaker: longSpeakerLabel
  }).id;
  const longSpeakerSeg1Id = runner.apply('segment.create', {
    blockId: conversationStressCardId,
    unitId: longSpeakerTurnId,
    text: 'No problem at all; please proceed directly down the concourse towards carriage B where luggage racks remain available.',
    meaning: 'Tidak masalah sama sekali; silakan langsung menuju gerbong B di sepanjang peron tempat rak bagasi masih tersedia.'
  }).id;
  const longSpeakerSeg2Id = runner.apply('segment.create', {
    blockId: conversationStressCardId,
    unitId: longSpeakerTurnId,
    text: 'Our onboard attendants can also help you locate your reserved window seat if the carriage is busy.',
    meaning: 'Petugas kami di dalam kereta juga dapat membantu menemukan kursi dekat jendela yang telah Anda pesan jika gerbong sedang ramai.'
  }).id;
  const emptyTurnId = runner.apply('contentUnit.create', {
    blockId: conversationStressCardId,
    kind: 'turn',
    speakerId: emmaSpeakerId,
    speaker: 'Emma'
  }).id;
  const unassignedTurnId = runner.apply('contentUnit.create', {
    blockId: conversationStressCardId,
    kind: 'turn'
  }).id;
  const unassignedSegId = runner.apply('segment.create', {
    blockId: conversationStressCardId,
    unitId: unassignedTurnId,
    text: 'Please mind the gap between the train and the platform edge.',
    meaning: 'Harap perhatikan celah antara kereta dan tepi peron.'
  }).id;

  runner.setSnapshot({
    ...runner.getSnapshot(),
    activeDocumentId: documentId
  });

  return {
    snapshot: runner.getSnapshot(),
    ids: {
      documentId,
      titleCardId,
      titleUnitId,
      titleSegmentId,
      paragraphStressCardId,
      joinSectionId,
      joinNoneSegId,
      joinAfterPunctSegId,
      unequalShortEnLongIdSegId,
      emptySectionId,
      conversationStressCardId,
      consecutiveTurn1Id,
      consecutiveTurn1SegId,
      consecutiveTurn2Id,
      consecutiveTurn2SegId,
      longSpeakerTurnId,
      longSpeakerSeg1Id,
      longSpeakerSeg2Id,
      emptyTurnId,
      unassignedTurnId,
      unassignedSegId,
      jamesSpeakerId,
      longSpeakerId,
      emmaSpeakerId
    }
  };
};
