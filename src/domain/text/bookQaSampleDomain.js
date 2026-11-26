export const createBookQaSample = async (type, createDocument, dispatch) => {
  if (!['paragraph', 'conversation', 'mixed'].includes(type)) return;
  const document = await createDocument({
    title: `Book QA · ${type[0].toUpperCase()}${type.slice(1)} sample`,
    documentType: type,
    collectionId: null
  });
  if (!document?.id) return;
  const createCard = async (blockType, title) => dispatch({
    type: 'block.create',
    payload: { documentId: document.id, blockType, title }
  });
  const createParagraph = async (title, rows) => {
    const block = await createCard('paragraph', title);
    if (!block?.id) return;
    const section = await dispatch({ type: 'contentUnit.create', payload: { blockId: block.id, kind: 'paragraph' } });
    if (!section?.id) return;
    for (const row of rows) {
      const result = await dispatch({ type: 'segment.create', payload: { blockId: block.id, unitId: section.id, ...row, joinAfter: 'space' } });
      if (!result?.id) return;
    }
  };
  const createConversation = async (title, turns) => {
    const block = await createCard('conversation', title);
    if (!block?.id) return;
    for (const turn of turns) {
      const speaker = await dispatch({ type: 'speaker.register', payload: { documentId: document.id, label: turn.speaker } });
      if (!speaker?.id) return;
      const unit = await dispatch({ type: 'contentUnit.create', payload: { blockId: block.id, kind: 'turn', speakerId: speaker.id } });
      if (!unit?.id) return;
      const segment = await dispatch({ type: 'segment.create', payload: { blockId: block.id, unitId: unit.id, text: turn.text, meaning: turn.meaning, joinAfter: 'line' } });
      if (!segment?.id) return;
    }
  };
  const paragraphRows = [
    { text: 'I practise English every day.', meaning: 'Saya berlatih bahasa Inggris setiap hari.' },
    { text: 'Today I am testing the ProLingo player.', meaning: 'Hari ini saya sedang menguji pemutar ProLingo.' }
  ];
  const conversationTurns = [
    { speaker: 'David', text: 'Hi, shall we start our practice?', meaning: 'Hai, apakah kita mulai latihan kita?' },
    { speaker: 'Maya', text: 'Yes, I am ready.', meaning: 'Ya, saya siap.' },
    { speaker: 'Nina', text: 'Great. I will listen carefully.', meaning: 'Bagus. Saya akan mendengarkan dengan saksama.' }
  ];
  if (type === 'paragraph') await createParagraph('Daily Practice', paragraphRows);
  else if (type === 'conversation') await createConversation('Three-speaker practice', conversationTurns);
  else {
    await createParagraph('Paragraph Card', paragraphRows);
    await createConversation('Conversation Card', conversationTurns);
  }
};
