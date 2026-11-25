import { selectTextConversationEditorState, TextConversationEditorError } from './textConversationEditorDomain.js';
import { selectTextCardPresentation } from './textCardPresentationDomain.js';
import { resolveTextCardPresentationCursor } from './textCardPresentationCursorDomain.js';

/** D4 validation first; A1 remains the sole read-only Card/Unit/Segment projection. */
export const selectTextConversationReaderPresentation = (snapshot, { documentId } = {}) => {
  const state = selectTextConversationEditorState(snapshot, { documentId });
  if (state.workspace.documentType !== 'conversation') {
    throw new TextConversationEditorError('UNSUPPORTED_WORKSPACE', 'The Conversation reader requires a Conversation Workspace. Mixed UI is not enabled.');
  }
  return selectTextCardPresentation(snapshot, { documentId: state.workspace.id });
};

/** No index fallback: only a status belonging to the live D5 scope is audible evidence. */
export const resolveTextConversationReaderCursor = ({ presentation, audioPlayback } = {}) => {
  const idle = () => resolveTextCardPresentationCursor({ presentation });
  const scope = audioPlayback?.readPresentationPlaybackScope?.();
  const status = audioPlayback?.playbackSourceStatus;
  const workspace = presentation?.workspace;
  if (!scope?.current || !workspace || scope.workspaceId !== workspace.id || scope.workspaceUid !== workspace.uid
    || !status || status.sessionId !== scope.sessionId || status.documentId !== workspace.id) return idle();
  return resolveTextCardPresentationCursor({ presentation, playback: {
    ...scope,
    playbackSourceStatus: status
  } });
};

/** Explicit reader actions delegate to the existing D5 host, never to browse/view state. */
export const createTextConversationReaderActions = ({ presentation, audioPlayback, disabled = false } = {}) => Object.freeze({
  onPlaySegment: (segmentId, channel) => {
    if (!disabled && presentation?.segmentById[segmentId]) {
      return channel === undefined ? audioPlayback?.playSentence?.(segmentId) : audioPlayback?.playSentence?.(segmentId, channel);
    }
  },
  onPlayCard: (cardId, options = {}) => {
    if (disabled || !presentation?.cardById[cardId]) return;
    const channel = options.playbackChannelMode;
    if (channel === 'text-only' || channel === 'meaning-only') {
      return audioPlayback?.playScene?.(cardId, { playbackChannelMode: channel });
    }
    return audioPlayback?.playScene?.(cardId);
  }
});
