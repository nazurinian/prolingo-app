import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from './textStructuredPlaybackDomain.js';

const channel = value => ['text', 'meaning'].includes(value) ? value : null;

export const resolveNowPlayingReaderCursor = ({ presentation, nowPlaying } = {}) => {
  const workspace = presentation?.workspace;
  const idle = resolveTextCardPresentationCursor({ presentation });
  if (!workspace || nowPlaying?.domain !== 'structured-text'
    || nowPlaying.workspace?.id !== workspace.id || nowPlaying.workspace.uid !== workspace.uid) return idle;
  const active = Object.freeze({
    ...idle, sessionId: nowPlaying.sessionId, state: nowPlaying.state, commandTarget: nowPlaying.commandTarget
  });
  const cardId = nowPlaying.card?.id;
  if (!presentation.cardById[cardId]) return active;
  const audibleChannel = channel(nowPlaying.channel);
  if (nowPlaying.precision === 'card') return Object.freeze({ ...active, cardId, channel: audibleChannel, precision: 'card' });
  if (nowPlaying.precision !== 'segment') return active;
  const segmentId = nowPlaying.segment?.id;
  const location = presentation.locationBySegmentId[segmentId];
  if (location?.cardId !== cardId) return active;
  return Object.freeze({ ...active, cardId, unitId: location.unitId, segmentId, channel: audibleChannel, precision: 'segment' });
};

/**
 * Pure adapter. `playback` must be scoped by the owning host to its actual
 * Workspace ID/UID and current session token, not to a browse selection or an
 * old status event. Missing scope evidence fails closed. currentIndex is only
 * evidence of a Card, never of an audible Sentence in Full mode.
 */
export const resolveTextCardPresentationCursor = ({ presentation, playback = {} } = {}) => {
  const workspace = presentation?.workspace;
  const idle = { workspaceId: workspace?.id ?? null, workspaceUid: workspace?.uid ?? null,
    sessionId: null, state: 'idle', cardId: null, unitId: null, segmentId: null, channel: null, precision: 'none' };
  if (!workspace || !playback || typeof playback !== 'object' || playback.workspaceId !== workspace.id || playback.workspaceUid !== workspace.uid
    || playback.playingContext !== TEXT_STRUCTURED_PLAYBACK_CONTEXT || (!playback.isPlaying && !playback.isPaused)
    || !(typeof playback.sessionId === 'number' && Number.isFinite(playback.sessionId)
      || typeof playback.sessionId === 'string' && playback.sessionId.trim())) return Object.freeze(idle);
  const active = { ...idle, sessionId: playback.sessionId, state: playback.isPaused ? 'paused' : 'playing', channel: channel(playback.speakingPart) };
  const source = playback.playbackSourceStatus;
  const status = source?.sessionId === playback.sessionId && source?.documentId === workspace.id
    && (source.workspaceUid === undefined || source.workspaceUid === workspace.uid) ? source : null;
  if (status) active.channel = channel(status.channel);
  if (status?.source === 'unavailable') return Object.freeze(active);
  const fullWithoutSegment = status?.mode === 'full-local' || status?.mode === 'full-tts' || status?.representation === 'full' && !status.segmentId;
  const segmentId = !fullWithoutSegment && (status?.segmentId || (playback.playbackRepresentationMode === 'split' ? playback.playingIndex : null));
  if (segmentId) {
    const location = presentation.locationBySegmentId[segmentId];
    if (!location || (status?.blockId && status.blockId !== location.cardId)) return Object.freeze(active);
    return Object.freeze({ ...active, cardId: location.cardId, unitId: location.unitId, segmentId, precision: 'segment' });
  }
  const cardId = status?.blockId || playback.activeBlockId || presentation.locationBySegmentId[playback.currentIndex]?.cardId;
  return Object.freeze(presentation.cardById[cardId] ? { ...active, cardId, precision: 'card' } : active);
};
