export const TEXT_LIBRARY_SEARCH_ACTIONS = Object.freeze({
  OPEN: 'open',
  PLAY: 'play',
  START_HERE: 'start-here'
});

export const TEXT_LIBRARY_SEARCH_RESULT_TYPES = Object.freeze({
  DOCUMENT: 'document',
  CARD: 'card',
  SEGMENT: 'segment'
});

export const TEXT_LIBRARY_SEARCH_DEFAULT_LIMIT = 60;
export const TEXT_LIBRARY_SEARCH_MIN_QUERY_LENGTH = 2;

const normalize = value => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const tokensFor = query => normalize(query).split(' ').filter(Boolean);
const matchesTokens = (value, tokens) => {
  const normalized = normalize(value);
  return Boolean(normalized) && tokens.every(token => normalized.includes(token));
};

const titleScore = (value, query, base) => {
  const normalizedValue = normalize(value);
  const normalizedQuery = normalize(query);
  if (!normalizedValue || !normalizedQuery) return base;
  if (normalizedValue === normalizedQuery) return base + 80;
  if (normalizedValue.startsWith(normalizedQuery)) return base + 45;
  return base;
};

const resultOrder = (a, b) => (
  b.score - a.score
  || a.documentOrder - b.documentOrder
  || a.blockOrder - b.blockOrder
  || a.segmentOrder - b.segmentOrder
  || a.id.localeCompare(b.id)
);

const resultBase = ({ document, block = null, segment = null, resultType, matchedFields, score }) => ({
  id: `${resultType}:${segment?.id || block?.id || document.id}`,
  resultType,
  documentId: document.id,
  documentTitle: document.title || document.id,
  editorModel: document.editorModel || null,
  documentType: document.documentType || null,
  documentOrder: Number(document.order) || 0,
  blockId: block?.id || null,
  blockTitle: block?.title || null,
  blockType: block?.blockType || null,
  blockOrder: Number(block?.order) || 0,
  segmentId: segment?.id || null,
  segmentOrder: Number(segment?.order) || 0,
  text: segment?.text || '',
  meaning: segment?.meaning || '',
  speaker: segment?.speaker || null,
  matchedFields,
  score
});

export const resolveTextLibrarySearchResults = (snapshot, query, { limit = TEXT_LIBRARY_SEARCH_DEFAULT_LIMIT } = {}) => {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < TEXT_LIBRARY_SEARCH_MIN_QUERY_LENGTH) return [];
  const tokens = tokensFor(normalizedQuery);
  if (!tokens.length) return [];

  const documents = Array.isArray(snapshot?.documents) ? snapshot.documents : [];
  const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
  const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : [];
  const blockMap = new Map(blocks.map(block => [block.id, block]));
  const documentMap = new Map(documents.map(document => [document.id, document]));
  const results = [];

  documents.forEach(document => {
    if (matchesTokens(document.title, tokens)) {
      results.push(resultBase({
        document,
        resultType: TEXT_LIBRARY_SEARCH_RESULT_TYPES.DOCUMENT,
        matchedFields: ['title'],
        score: titleScore(document.title, normalizedQuery, 420)
      }));
    }
  });

  blocks.forEach(block => {
    const document = documentMap.get(block.documentId);
    if (!document || !matchesTokens(block.title, tokens)) return;
    results.push(resultBase({
      document,
      block,
      resultType: TEXT_LIBRARY_SEARCH_RESULT_TYPES.CARD,
      matchedFields: ['title'],
      score: titleScore(block.title, normalizedQuery, 340)
    }));
  });

  segments.forEach(segment => {
    const block = blockMap.get(segment.blockId);
    const document = documentMap.get(segment.documentId);
    if (!block || !document) return;
    const matchedFields = [];
    if (matchesTokens(segment.text, tokens)) matchedFields.push('text');
    if (matchesTokens(segment.meaning, tokens)) matchedFields.push('meaning');
    if (matchesTokens(segment.speaker, tokens)) matchedFields.push('speaker');
    if (!matchedFields.length) return;

    let score = 220;
    if (matchedFields.includes('text')) score += 40;
    if (matchedFields.includes('meaning')) score += 25;
    if (matchedFields.includes('speaker')) score += 15;
    if (normalize(segment.text) === normalizedQuery) score += 60;
    if (normalize(segment.meaning) === normalizedQuery) score += 50;
    if (normalize(segment.speaker) === normalizedQuery) score += 35;

    results.push(resultBase({
      document,
      block,
      segment,
      resultType: TEXT_LIBRARY_SEARCH_RESULT_TYPES.SEGMENT,
      matchedFields,
      score
    }));
  });

  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Math.trunc(Number(limit)))) : TEXT_LIBRARY_SEARCH_DEFAULT_LIMIT;
  return results.sort(resultOrder).slice(0, safeLimit);
};

export const resolveTextLibrarySearchActionTarget = (result, action = TEXT_LIBRARY_SEARCH_ACTIONS.OPEN) => {
  if (!result?.documentId) throw new Error('Text search action requires a result with documentId');
  if (!Object.values(TEXT_LIBRARY_SEARCH_ACTIONS).includes(action)) throw new Error(`Unsupported Text search action: ${action}`);

  const structured = result.editorModel === 'structured-v1';
  if (action !== TEXT_LIBRARY_SEARCH_ACTIONS.OPEN && !structured) {
    return {
      action: TEXT_LIBRARY_SEARCH_ACTIONS.OPEN,
      documentId: result.documentId,
      blockId: result.blockId || null,
      segmentId: result.segmentId || null,
      fallbackReason: 'legacy-document'
    };
  }

  if (action === TEXT_LIBRARY_SEARCH_ACTIONS.START_HERE && !result.segmentId) {
    return {
      action: TEXT_LIBRARY_SEARCH_ACTIONS.OPEN,
      documentId: result.documentId,
      blockId: result.blockId || null,
      segmentId: null,
      fallbackReason: 'start-here-requires-segment'
    };
  }

  return {
    action,
    documentId: result.documentId,
    blockId: result.blockId || null,
    segmentId: result.segmentId || null,
    fallbackReason: null
  };
};
