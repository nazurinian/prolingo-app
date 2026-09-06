export const TEXT_STRUCTURED_PLAYBACK_CONTEXT = 'text-structured';
export const TEXT_STRUCTURED_PLAYBACK_SCOPES = Object.freeze({
  SEGMENT: 'segment',
  CARD: 'card',
  FROM_HERE: 'from-here',
  DOCUMENT: 'document'
});

const normalize = value => String(value ?? '').trim();

export const resolveStructuredTextPlaybackList = documentTree => {
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return [];
  const blocks = Array.isArray(documentTree.blocks) ? documentTree.blocks : [];
  let documentSequence = 0;
  return blocks.flatMap((block, blockIndex) => {
    const segments = Array.isArray(block.segments) ? block.segments : [];
    return segments.map((segment, segmentIndex) => {
      documentSequence += 1;
      return {
        id: segment.id,
        segmentId: segment.id,
        textId: block.id,
        blockId: block.id,
        blockTitle: block.title || null,
        blockType: block.blockType,
        documentId: documentTree.id,
        documentTitle: documentTree.title,
        documentType: documentTree.documentType,
        textLanguage: documentTree.textLanguage,
        meaningLanguage: documentTree.meaningLanguage,
        speaker: segment.speaker || null,
        text: normalize(segment.text),
        meaning: normalize(segment.meaning),
        displayId: documentSequence,
        blockIndex,
        segmentIndex,
        blockSegmentCount: segments.length,
        isTextStructuredSegment: true,
        isStructured: false
      };
    });
  }).filter(item => item.text);
};

export const resolveStructuredTextPlaybackScopeList = ({
  documentTree,
  startSegmentId = null,
  blockId = null,
  scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE
}) => {
  const fullList = resolveStructuredTextPlaybackList(documentTree);
  if (!fullList.length) return { fullList, playbackList: [], startIndex: -1 };

  if (scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT) {
    return { fullList, playbackList: fullList, startIndex: 0 };
  }

  if (scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD) {
    const targetBlockId = blockId || fullList.find(item => item.id === startSegmentId)?.blockId || null;
    const playbackList = fullList.filter(item => item.blockId === targetBlockId);
    return { fullList, playbackList, startIndex: playbackList.length ? 0 : -1 };
  }

  const requestedIndex = startSegmentId ? fullList.findIndex(item => item.id === startSegmentId) : 0;
  const safeIndex = requestedIndex >= 0 ? requestedIndex : 0;

  if (scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT) {
    const item = fullList[safeIndex];
    return { fullList, playbackList: item ? [item] : [], startIndex: item ? 0 : -1 };
  }

  return {
    fullList,
    playbackList: fullList.slice(safeIndex),
    startIndex: 0
  };
};


export const resolveStructuredTextPlaybackOrder = ({
  list,
  orderMode = 'sequential',
  anchorId = null,
  random = Math.random
}) => {
  const items = Array.isArray(list) ? [...list] : [];
  if (orderMode !== 'shuffle' || items.length < 2) return items;

  let anchor = null;
  let pool = items;
  if (anchorId) {
    const anchorIndex = items.findIndex(item => item?.id === anchorId || item?.segmentId === anchorId);
    if (anchorIndex >= 0) {
      anchor = items[anchorIndex];
      pool = items.filter((_, index) => index !== anchorIndex);
    }
  }

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const value = Number(random?.());
    const safeRandom = Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0;
    const swapIndex = Math.floor(safeRandom * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return anchor ? [anchor, ...pool] : pool;
};


export const resolveStructuredTextAdjacentSegment = ({ list, currentId, direction }) => {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return null;
  const currentIndex = items.findIndex(item => item.id === currentId);
  const anchor = currentIndex >= 0 ? currentIndex : 0;
  const delta = direction === 'prev' ? -1 : 1;
  const nextIndex = anchor + delta;
  if (nextIndex < 0 || nextIndex >= items.length) return null;
  return items[nextIndex] || null;
};

export const resolveStructuredTextPlayerTitle = item => {
  if (!item?.isTextStructuredSegment) return null;
  const segmentLabel = `Segment ${Number(item.displayId) || 1}`;
  const detail = item.speaker || item.blockTitle || (item.blockType === 'conversation' ? 'Conversation' : 'Paragraph');
  return {
    title: item.documentTitle || 'Text Document',
    artist: [detail, segmentLabel].filter(Boolean).join(' • '),
    album: 'ProLingo Text Library'
  };
};
