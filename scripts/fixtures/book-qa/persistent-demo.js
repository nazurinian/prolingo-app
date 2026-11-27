import { createJourneyToLondonFixture, createJourneyToLondonStressFixtures } from '../uat4/journey-to-london.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { updateBookBodyProfileMetadata } from '../../../src/domain/text/bookQaBodyAudioDomain.js';
import { BOOK_CARD_HEADING_KEY, BOOK_MAIN_TITLE_KEY } from '../../../src/domain/text/textBookHeadingDomain.js';

const voices = {
  narrator: ['en-GB-SoniaNeural', 'id-ID-GadisNeural'],
  guide: ['en-GB-RyanNeural', 'id-ID-ArdiNeural'],
  traveller: ['en-GB-LibbyNeural', 'id-ID-GadisNeural']
};

export const createPersistentBookQaDemo = () => {
  const london = createJourneyToLondonFixture();
  let snapshot = london.snapshot;
  const apply = (type, payload) => {
    const next = applyTextLibraryCommand(snapshot, { type, payload }, 5000);
    snapshot = next.snapshot;
    return next.result.id;
  };
  const createWorkspace = (title, documentType) => apply('document.create', { title, documentType, textLanguage: 'en', meaningLanguage: 'id' });
  const mainTitle = (id, translation, en) => {
    const { metadata } = snapshot.documents.find(row => row.id === id);
    apply('document.update', { id, metadata: { ...metadata,
      [BOOK_MAIN_TITLE_KEY]: { mode: en ? 'custom' : 'workspace-name', ...(en ? { en } : {}), ...(translation ? { id: translation } : {}) }
    } });
  };
  const heading = (id, translation) => {
    const { metadata } = snapshot.blocks.find(row => row.id === id);
    apply('block.update', { id, metadata: { ...metadata, [BOOK_CARD_HEADING_KEY]: { id: translation } } });
  };
  const profile = (id, voiceIds, speakerId) => {
    const workspace = snapshot.documents.find(row => row.id === id);
    const metadata = ['text', 'meaning'].reduce((metadata, channel, index) => updateBookBodyProfileMetadata({
      ...workspace, metadata
    }, { workspaceUid: workspace.uid, kind: speakerId ? 'conversation' : 'paragraph', channel,
      ...(speakerId ? { speakerId } : {}), values: { edgeVoice: voiceIds[index] } }), workspace.metadata);
    apply('document.update', { id, metadata });
  };
  const card = (documentId, blockType, title, translation) => {
    const id = apply('block.create', { documentId, blockType, title });
    if (translation) heading(id, translation);
    return id;
  };
  const paragraphUnit = blockId => apply('contentUnit.create', { blockId, kind: 'paragraph' });
  const firstUnit = blockId => snapshot.contentUnits.find(row => row.blockId === blockId)?.id ?? paragraphUnit(blockId);
  const addSentences = (blockId, unitId, pairs) => {
    for (const [text, meaning] of pairs) apply('segment.create', { blockId, unitId, text, meaning });
  };

  mainTitle(london.ids.documentId, 'Perjalanan ke London');
  for (const [key, title] of Object.entries({ P1: 'Persiapan perjalanan', C1: 'Membeli tiket kereta', P2: 'Di dalam kereta', C2: 'Bertemu Emma' })) {
    heading(london.ids.cards[key], title);
  }
  profile(london.ids.documentId, voices.narrator);
  profile(london.ids.documentId, voices.guide, london.ids.speakers.James);
  profile(london.ids.documentId, voices.traveller, london.ids.speakers['Ticket Officer']);
  profile(london.ids.documentId, voices.narrator, london.ids.speakers.Emma);

  const paragraph = createWorkspace('Paragraph · A morning by the river', 'paragraph');
  mainTitle(paragraph, 'Pagi di tepi sungai');
  profile(paragraph, voices.narrator);
  const riverside = card(paragraph, 'paragraph', 'The riverside path', 'Jalur di tepi sungai');
  addSentences(riverside, firstUnit(riverside), [
    ['The path follows the river.', 'Jalur ini mengikuti aliran sungai.'],
    ['The morning air feels cool.', 'Udara pagi terasa sejuk.']
  ]);
  addSentences(riverside, paragraphUnit(riverside), [
    ['A small bridge connects the two banks.', 'Jembatan kecil menghubungkan kedua tepi sungai.'],
    ['We stop to watch the water.', 'Kami berhenti untuk melihat air.']
  ]);
  const cafe = card(paragraph, 'paragraph', 'A quiet café');
  addSentences(cafe, firstUnit(cafe), [
    ['The café opens early.', 'Kafe itu buka pagi-pagi.'],
    ['Today the owner serves ginger tea.', '']
  ]);

  const conversation = createWorkspace('Conversation · At the information desk', 'conversation');
  mainTitle(conversation, 'Percakapan di pusat informasi', 'Finding our way');
  const maya = apply('speaker.register', { documentId: conversation, label: 'Maya' });
  const ari = apply('speaker.register', { documentId: conversation, label: 'Ari' });
  profile(conversation, voices.traveller, maya);
  profile(conversation, voices.guide, ari);
  const turn = (blockId, speakerId, pairs) => {
    const unitId = apply('contentUnit.create', { blockId, kind: 'turn', speakerId });
    addSentences(blockId, unitId, pairs);
  };
  const directions = card(conversation, 'conversation', 'Asking for directions', 'Menanyakan arah');
  turn(directions, maya, [['Where is the nearest bridge?', 'Di mana jembatan terdekat?']]);
  turn(directions, maya, [['Can we walk there?', 'Bisakah kami berjalan kaki ke sana?']]);
  turn(directions, ari, [['The path follows the river.', 'Jalur ini mengikuti aliran sungai.'], ['Turn left after the café.', 'Belok kiri setelah kafe.']]);
  const thanks = card(conversation, 'conversation', 'Before leaving', 'Sebelum pergi');
  turn(thanks, ari, [['Would you like a map?', 'Apakah Anda ingin peta?']]);
  turn(thanks, maya, [['Yes, please. Thank you!', '']]);
  turn(thanks, ari, []);

  const stress = createJourneyToLondonStressFixtures({ initialSnapshot: snapshot });
  snapshot = stress.snapshot;
  const stressId = stress.ids.documentId;
  apply('document.update', { id: stressId, title: 'Stress · Book audio and Reader' });
  mainTitle(stressId, '', 'Book QA stress cases');
  const large = card(stressId, 'paragraph', '34 Sentences · Batch generation', '34 Kalimat · Pembuatan audio bertahap');
  const sections = [firstUnit(large), paragraphUnit(large)];
  for (let index = 0; index < 34; index++) {
    const position = index + 1;
    addSentences(large, sections[Math.floor(index / 17)], [[
      `At marker ${position}, stop and check the route.`,
      position === 34 ? '' : `Di penanda ${position}, berhenti dan periksa rutenya.`
    ]]);
  }
  return { ...snapshot, activeDocumentId: london.ids.documentId };
};
