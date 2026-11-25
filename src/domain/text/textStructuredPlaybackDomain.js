import { TEXT_PARAGRAPH_CARD_ROLES, resolveTextParagraphCardRole } from './textParagraphRoleDomain.js';
import { getTextStructuredSegmentSpeakerId } from './textStructuredSpeakerIdentityDomain.js';
import {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  hasStructuredTextPlayableChannel
} from './textStructuredPlaybackPreferenceDomain.js';

export const TEXT_STRUCTURED_PLAYBACK_CONTEXT = 'text-structured';
export const TEXT_STRUCTURED_PLAYBACK_SCOPES = Object.freeze({
  SEGMENT: 'segment',
  UNIT: 'unit',
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
        paragraphRole: resolveTextParagraphCardRole(block),
        documentId: documentTree.id,
        documentTitle: documentTree.title,
        documentType: documentTree.documentType,
        textLanguage: documentTree.textLanguage,
        meaningLanguage: documentTree.meaningLanguage,
        speaker: segment.speaker || null,
        ...(segment.unitId ? { unitId: segment.unitId, unitUid: block.units?.find(unit => unit.id === segment.unitId)?.uid || null,
          segmentUid: segment.uid || null, speakerId: getTextStructuredSegmentSpeakerId(segment) } : {}),
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
  }).filter(item => item.text || item.meaning);
};

export const resolveStructuredTextPlaybackScopeList = ({
  documentTree,
  workspaceId,
  workspaceUid,
  startSegmentId = null,
  cursorSegmentId = null,
  blockId = null,
  unitId = null,
  virtualUnit = false,
  scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
  boundary
}) => {
  const fullList = resolveStructuredTextPlaybackList(documentTree);
  const invalid = { fullList, playbackList: [], startIndex: -1 };
  const { DOCUMENT, CARD, UNIT, SEGMENT, FROM_HERE } = TEXT_STRUCTURED_PLAYBACK_SCOPES;
  if (!documentTree?.id || (workspaceId !== undefined && workspaceId !== documentTree.id)
    || (workspaceUid !== undefined && workspaceUid !== (documentTree.uid ?? null))
    || !Object.values(TEXT_STRUCTURED_PLAYBACK_SCOPES).includes(scope)) return invalid;

  const continuing = scope === FROM_HERE;
  const target = continuing ? boundary : scope;
  if (continuing && (![DOCUMENT, CARD, UNIT].includes(boundary) || startSegmentId == null)) return invalid;
  if (target === SEGMENT && startSegmentId == null && cursorSegmentId == null) return invalid;
  const start = fullList.find(item => item.id === startSegmentId);
  const cursor = fullList.find(item => item.id === cursorSegmentId);
  if ((startSegmentId != null && !start) || (cursorSegmentId != null && !cursor)) return invalid;
  if (target === SEGMENT && start && cursor && start !== cursor) return invalid;

  const blocks = documentTree.blocks || [];
  const targetBlockId = blockId ?? start?.blockId ?? cursor?.blockId
    ?? (unitId != null ? blocks.find(block => block.units?.some(unit => unit.id === unitId))?.id : null);
  const block = blocks.find(candidate => candidate.id === targetBlockId);
  if ((blockId != null || target === CARD || target === UNIT || unitId != null || virtualUnit) && !block) return invalid;
  if ((blockId != null || target === CARD || target === UNIT || unitId != null || virtualUnit)
    && [start, cursor].some(item => item && item.blockId !== block.id)) return invalid;

  const targetUnitId = unitId ?? (target === UNIT ? start?.unitId ?? cursor?.unitId ?? null : null);
  const useVirtualUnit = targetUnitId == null && (virtualUnit || (continuing && target === UNIT))
    && block?.blockType === 'paragraph' && !Array.isArray(block.units);
  if (virtualUnit && !useVirtualUnit) return invalid;
  if (targetUnitId != null && (!block?.units?.some(unit => unit.id === targetUnitId)
    || [start, cursor].some(item => item && item.unitId !== targetUnitId))) return invalid;
  if (target === UNIT && targetUnitId == null && !useVirtualUnit) return invalid;
  if (useVirtualUnit && [start, cursor].some(item => item?.unitId != null)) return invalid;

  let playbackList = fullList;
  if (target === SEGMENT) playbackList = [start || cursor];
  if (target === CARD) playbackList = fullList.filter(item => item.blockId === block.id);
  if (target === UNIT) {
    playbackList = fullList.filter(item => item.blockId === block.id
      && (useVirtualUnit ? item.unitId == null : item.unitId === targetUnitId));
  }
  if (continuing) {
    const startIndex = playbackList.indexOf(start);
    if (startIndex < 0) return invalid;
    playbackList = playbackList.slice(startIndex);
  }
  const anchor = cursor || start;
  const startIndex = anchor ? playbackList.indexOf(anchor) : (playbackList.length ? 0 : -1);
  return startIndex < 0 ? invalid : { fullList, playbackList, startIndex: scope === UNIT ? 0 : startIndex };
};

/** Resolve once before changing the owned session or its saved resume target. */
export const resolveStructuredTextPlaybackCommand = ({
  channel,
  playbackChannelMode = TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
  playbackRepresentationMode = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
  ...target
}) => {
  if (channel !== undefined && (!['text', 'meaning'].includes(channel)
    || target.scope !== TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT)) return null;
  const effectiveChannelMode = channel === 'text' ? TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY
    : channel === 'meaning' ? TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY : playbackChannelMode;
  if (!Object.values(TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES).includes(effectiveChannelMode)) return null;
  const resolved = resolveStructuredTextPlaybackScopeList(target);
  const playable = item => hasStructuredTextPlayableChannel(item, effectiveChannelMode);
  const scopedList = resolved.playbackList.filter(playable);
  const requestedCursorId = target.cursorSegmentId ?? target.startSegmentId ?? null;
  if (!scopedList.length || [requestedCursorId, target.startSegmentId]
    .some(id => id != null && !scopedList.some(item => item.id === id))) return null;

  const { FROM_HERE, SEGMENT, UNIT, CARD } = TEXT_STRUCTURED_PLAYBACK_SCOPES;
  const split = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;
  const full = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
  const requestedRepresentation = playbackRepresentationMode === full ? full : split;
  const scopeIds = new Set(resolved.playbackList.map(item => item.id));
  const partialCardIds = new Set(resolved.fullList.filter(item => !scopeIds.has(item.id)).map(item => item.blockId));
  const unitTarget = target.scope === UNIT || (target.scope === FROM_HERE && target.boundary === UNIT);
  const cursorId = target.scope === UNIT ? null : requestedCursorId;
  const partialCard = target.scope === FROM_HERE && target.boundary === CARD && partialCardIds.has(scopedList[0].blockId);
  return {
    ...resolved, scopedList, cursorId, partialCardIds,
    playbackChannelMode: effectiveChannelMode, requestedRepresentation,
    commandRepresentation: target.scope === SEGMENT || unitTarget || partialCard ? split : requestedRepresentation
  };
};


// Text playback always preserves the authored sentence order inside each card.
// Shuffle changes only the order of cards (not the order of sentences).
export const resolveStructuredTextPlaybackOrder = ({
  list, orderMode = 'sequential', anchorId = null, random = Math.random
}) => {
  const items = Array.isArray(list) ? [...list] : [];
  if (orderMode !== 'shuffle' || items.length < 2) return items;
  const groups = [];
  const byCard = new Map();
  items.forEach(item => {
    const id = item.blockId || item.textId || item.id;
    if (!byCard.has(id)) {
      const group = { id, items: [] };
      byCard.set(id, group);
      groups.push(group);
    }
    byCard.get(id).items.push(item);
  });
  if (groups.length < 2) return items;
  const anchorItem = anchorId ? items.find(item => item.id === anchorId || item.segmentId === anchorId) : null;
  const anchorGroupId = anchorItem?.blockId || anchorItem?.textId || anchorItem?.id || null;
  const anchorGroup = anchorGroupId ? byCard.get(anchorGroupId) : null;
  const pool = anchorGroup ? groups.filter(group => group.id !== anchorGroupId) : [...groups];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const sampled = Number(random?.());
    const safeRandom = Number.isFinite(sampled) ? Math.max(0, Math.min(0.999999999, sampled)) : 0;
    const swapIndex = Math.floor(safeRandom * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return [...(anchorGroup ? [anchorGroup] : []), ...pool].flatMap(group => group.items);
};

// The same UI Prev / Next buttons navigate by sentence in Split and by card in Full.
// Manual navigation wraps, matching the established Table transport controls.
export const resolveStructuredTextNavigationTarget = ({
  list, currentId = null, direction = 'next', representationMode = 'split'
}) => {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return null;
  const candidates = representationMode === 'full'
    ? items.filter((item, index) => items.findIndex(other => other.blockId === item.blockId) === index)
    : items;
  const active = currentId ? items.find(item => item.id === currentId || item.segmentId === currentId) : null;
  const activeIndex = active
    ? candidates.findIndex(item => representationMode === 'full' ? item.blockId === active.blockId : item.id === active.id)
    : -1;
  // With no cursor: Next chooses item/card 1; Prev chooses the last.
  if (activeIndex < 0) return direction === 'prev' ? candidates.at(-1) : candidates[0];
  const delta = direction === 'prev' ? -1 : 1;
  return candidates[(activeIndex + delta + candidates.length) % candidates.length];
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

export const resolveStructuredTextPlayerTitle = (item, options = {}) => {
  if (!item?.isTextStructuredSegment) return null;
  const isFullRepresentation = String(options?.representationMode || '').toLowerCase() === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
  if (isFullRepresentation) {
    const cardLabel = Number.isFinite(Number(item.blockIndex)) ? `Card ${Number(item.blockIndex) + 1}` : null;
    const cardDetail = (item.blockType === 'paragraph' && item.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE ? 'Title' : item.blockTitle)
      || (item.blockType === 'conversation' ? 'Conversation' : 'Paragraph');
    const channelLabel = String(options?.speakingPart || '').toLowerCase() === 'meaning' ? 'Meaning' : null;
    return {
      title: item.documentTitle || 'Text Workspace',
      artist: [cardDetail, cardLabel, 'Full', channelLabel].filter(Boolean).join(' • '),
      album: 'ProLingo Text Library'
    };
  }
  const segmentLabel = `Segment ${Number(item.displayId) || 1}`;
  const detail = item.speaker || (item.blockType === 'paragraph' && item.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE ? 'Title' : item.blockTitle) || (item.blockType === 'conversation' ? 'Conversation' : 'Paragraph');
  return {
    title: item.documentTitle || 'Text Workspace',
    artist: [detail, segmentLabel].filter(Boolean).join(' • '),
    album: 'ProLingo Text Library'
  };
};

/** Filters Structured Text playback source telemetry to the active workspace and session. */
export const resolveScopedStructuredTextPlaybackSourceStatus = ({
  status = null,
  mode = 'table',
  activeEditorModel = null,
  activeDocumentId = null,
  activeSessionId = null
} = {}) => {
  if (!status || typeof status !== 'object') return null;
  if (mode !== 'text' || activeEditorModel !== 'structured-v1') return null;
  if (!activeDocumentId || !status.documentId || status.documentId !== activeDocumentId) return null;
  if (activeSessionId !== null && activeSessionId !== undefined && status.sessionId !== null && status.sessionId !== undefined && status.sessionId !== activeSessionId) {
    return null;
  }
  return status;
};

export const resolveStructuredTextSmartNavigationContext = ({
  completeList,
  activeDocumentId = null,
  session = null,
  savedResume = null,
  preferences = {},
  random = Math.random
} = {}) => {
  const items = Array.isArray(completeList) ? completeList : [];
  if (!items.length) return null;

  const activeSession = session && (!session.documentId || !activeDocumentId || session.documentId === activeDocumentId)
    ? session
    : null;
  const savedForDoc = savedResume && (!activeDocumentId || savedResume.documentId === activeDocumentId)
    ? savedResume
    : null;
  const cursorId = savedForDoc?.segmentId || activeSession?.cursorSegmentId || null;

  // Global Prev/Next transport always obeys current persisted global preferences
  // rather than inheriting manual Segment/Card overrides or stopped session modes.
  const representationMode = preferences?.playbackRepresentationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    ? TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    : TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;
  const playbackOrderMode = preferences?.playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE
    ? TEXT_STRUCTURED_ORDER_MODES.SHUFFLE
    : TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL;
  const playbackChannelMode = Object.values(TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES).includes(preferences?.playbackChannelMode)
    ? preferences.playbackChannelMode
    : TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY;
  const repeatMode = Object.values(TEXT_STRUCTURED_REPEAT_MODES).includes(preferences?.repeatMode)
    ? preferences.repeatMode
    : TEXT_STRUCTURED_REPEAT_MODES.ONCE;
  const repeatCount = null;

  const validIds = new Set(items.map(item => item.id));
  const matchesFullList = list => Array.isArray(list)
    && list.length === items.length
    && new Set(list.map(item => item?.id)).size === validIds.size
    && list.every(item => validIds.has(item?.id));

  let ordered;
  let orderedListOverride = null;
  let persistedOrderedList = null;

  if (playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE) {
    const canReuseSessionSnapshot = activeSession?.playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE
      && (!activeSession.scope || activeSession.scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT)
      && matchesFullList(activeSession.orderedList);
    const snapshot = canReuseSessionSnapshot
      ? activeSession.orderedList
      : (matchesFullList(savedForDoc?.orderedList) ? savedForDoc.orderedList : null);
    ordered = snapshot || resolveStructuredTextPlaybackOrder({
      list: items,
      orderMode: playbackOrderMode,
      anchorId: cursorId,
      random
    });
    orderedListOverride = [...ordered];
    persistedOrderedList = [...ordered];
  } else {
    ordered = resolveStructuredTextPlaybackOrder({
      list: items,
      orderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      anchorId: cursorId,
      random
    });
  }

  return {
    cursorId,
    representationMode,
    playbackOrderMode,
    playbackChannelMode,
    repeatMode,
    repeatCount,
    ordered,
    orderedListOverride,
    persistedOrderedList
  };
};

export const resolveStructuredTextSmartNavPlan = ({
  completeList,
  activeDocumentId = null,
  session = null,
  savedResume = null,
  preferences = {},
  direction = 'next',
  random = Math.random
} = {}) => {
  const nav = resolveStructuredTextSmartNavigationContext({
    completeList,
    activeDocumentId,
    session,
    savedResume,
    preferences,
    random
  });
  if (!nav) return null;
  const target = resolveStructuredTextNavigationTarget({
    list: nav.ordered,
    currentId: nav.cursorId,
    direction,
    representationMode: nav.representationMode
  });
  if (!target) return null;
  return { ...nav, target };
};
