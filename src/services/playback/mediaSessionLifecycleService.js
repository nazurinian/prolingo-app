import { describeAuthoredPlayback } from '../../domain/playback/globalPlayerPresentationDomain.js';
import { readNowPlayingMediaTimeline, readOwnedNowPlaying, readOwnedNowPlayingMedia } from '../../domain/playback/nowPlayingDomain.js';
import { capitalizeDisplayText } from '../../utils/displayTextUtils.js';
import { navigateOwnedPlayback, readOwnedPlaybackSession } from './playbackRuntimeControlService.js';

const join = (...parts) => parts.filter(Boolean).join(' · ');
const channels = { text: 'EN', meaning: 'ID' };
const artwork = [{
  src: '/text-uat-icon-512.png', sizes: '512x512', type: 'image/png'
}];
const transportActions = ['play', 'pause', 'previoustrack', 'nexttrack', 'stop'];
const seekActions = ['seekto', 'seekbackward', 'seekforward'];
const positionEvents = ['loadedmetadata', 'durationchange', 'timeupdate', 'ratechange', 'seeking', 'seeked', 'progress', 'emptied'];

export const formatMediaSessionMetadata = (nowPlaying, readCollectionTitle = () => null) => {
  const { domain, precision, workspace, card, item } = nowPlaying;
  const channel = channels[nowPlaying.channel];
  if (domain === 'structured-text' && card && ['segment', 'card'].includes(precision)) {
    const { cardCode, cardPosition, shortUnitCode, speaker, segmentCode } = describeAuthoredPlayback(nowPlaying);
    const cardLabel = cardCode || cardPosition || card.title;
    return {
      title: precision === 'card' ? join(cardLabel, 'Full') : join(cardLabel, speaker, shortUnitCode, segmentCode),
      artist: join(workspace?.title, channel),
      album: (workspace?.collectionId && readCollectionTitle(workspace.collectionId)) || 'ProLingo'
    };
  }
  if (!item) return null;
  if (domain === 'legacy-text') return { title: item.playedText || item.title || '', artist: 'ProLingo Audio', album: 'ProLingo' };
  if (domain !== 'table') return null;

  const word = capitalizeDisplayText(item.title);
  const spoken = item.playedText;
  const expression = /^exp([1-5])_(en|idn)$/u.exec(item.part ?? '');
  if (expression) return {
    title: spoken ? `EXP${expression[1]}${expression[2] === 'idn' ? ' IDN' : ''}: ${spoken}` : `EXP${expression[1]}`,
    artist: join(word, 'Advanced Practice', channel), album: 'ProLingo'
  };
  const translatedPart = { word_idn: 'Arti kata', meaning: 'Terjemahan kalimat' }[item.part];
  if (translatedPart) return {
    title: spoken ? `${translatedPart}: ${spoken}` : translatedPart,
    artist: join(word, channel), album: 'ProLingo'
  };
  return item.part === 'sentence'
    ? { title: spoken || 'Sentence practice', artist: join(word, 'Sentence practice', channel), album: 'ProLingo' }
    : { title: word || capitalizeDisplayText(spoken), artist: join(item.part === 'word' && 'Word practice', channel), album: 'ProLingo' };
};

const safe = operation => {
  try { operation(); } catch { /* Media Session support varies by browser and action. */ }
};

const seekPosition = (media, duration, requested) => {
  const ranges = media.seekable;
  let closest = null;
  for (let index = 0; index < ranges.length; index++) {
    const start = ranges.start(index);
    const end = ranges.end(index);
    const lower = Math.max(0, start);
    const upper = Math.min(duration, end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || lower > upper) continue;
    const position = Math.max(lower, Math.min(upper, requested));
    if (closest === null || Math.abs(position - requested) < Math.abs(closest - requested)) closest = position;
  }
  return closest;
};

/** Host lifecycle binding. The only retained values are the published UI state and its listeners. */
export const executeMediaSessionLifecycleService = ({
  refs, actionsRef, readCollectionTitle, owner = 'main',
  mediaSession = globalThis.navigator?.mediaSession, Metadata = globalThis.MediaMetadata
}) => {
  if (!mediaSession) return null;

  let disposed = false;
  let installedSessionId = null;
  let mediaBinding = null;
  let metadataKey;
  let positionKey;
  let playbackState;
  const setAction = (name, handler) => safe(() => mediaSession.setActionHandler?.(name, handler));

  const publishPosition = position => {
    const key = JSON.stringify(position);
    if (key === positionKey) return;
    safe(() => {
      mediaSession.setPositionState?.(position ?? {});
      positionKey = key;
    });
  };

  const publishMetadata = metadata => {
    const key = JSON.stringify(metadata);
    if (key === metadataKey) return;
    safe(() => {
      mediaSession.metadata = metadata && typeof Metadata === 'function' ? new Metadata({ ...metadata, artwork }) : null;
      metadataKey = key;
    });
  };

  const publishPlaybackState = state => {
    if (state === playbackState) return;
    safe(() => { mediaSession.playbackState = state; playbackState = state; });
  };

  const bindActions = sessionId => {
    if (installedSessionId === sessionId) return;
    installedSessionId = sessionId;
    if (sessionId == null) {
      transportActions.forEach(action => setAction(action, null));
      return;
    }
    const guard = command => () => {
      const session = readOwnedPlaybackSession(refs);
      if (disposed || installedSessionId !== sessionId || session?.sessionId !== sessionId) return;
      command(session);
    };
    setAction('play', guard(session => {
      if (!session.pending && refs.pauseStateRef.current) actionsRef.current?.resume?.();
    }));
    setAction('pause', guard(session => {
      if (!session.pending && !refs.pauseStateRef.current) actionsRef.current?.pause?.({ source: 'mediaSession' });
    }));
    setAction('previoustrack', guard(session => navigateOwnedPlayback(session, 'prev')));
    setAction('nexttrack', guard(session => navigateOwnedPlayback(session, 'next')));
    setAction('stop', guard(() => actionsRef.current?.stop?.()));
  };

  const observeMedia = (media, sessionId) => {
    if (mediaBinding && mediaBinding.media === media && mediaBinding.sessionId === sessionId) {
      mediaBinding.sync();
      return;
    }
    mediaBinding?.dispose();
    mediaBinding = null;
    publishPosition(null);
    if (!media || sessionId == null) return;

    let seekingEnabled = false;
    let observing = true;
    const isCurrent = () => observing && !disposed && readOwnedPlaybackSession(refs)?.sessionId === sessionId
      && readOwnedNowPlayingMedia(refs) === media;
    const seek = (action, details) => {
      if (!seekingEnabled || !isCurrent()) return;
      const timeline = readNowPlayingMediaTimeline(media);
      if (!timeline?.seekable || timeline.elapsedSeconds == null) return;
      const offset = details?.seekOffset ?? 10;
      if (action !== 'seekto' && (!Number.isFinite(offset) || offset <= 0)) return;
      const requested = action === 'seekto' ? details?.seekTime
        : timeline.elapsedSeconds + (action === 'seekforward' ? offset : -offset);
      if (!Number.isFinite(requested)) return;
      safe(() => {
        const position = seekPosition(media, timeline.durationSeconds, requested);
        if (position == null) return;
        if (details?.fastSeek && typeof media.fastSeek === 'function') media.fastSeek(position);
        else media.currentTime = position;
        sync();
      });
    };
    const sync = () => {
      if (!isCurrent()) return;
      const timeline = readNowPlayingMediaTimeline(media);
      const rate = media.playbackRate;
      const canSeek = Boolean(timeline?.seekable && timeline.elapsedSeconds != null && Number.isFinite(rate) && rate > 0
        && seekPosition(media, timeline.durationSeconds, timeline.elapsedSeconds) != null);
      publishPosition(canSeek ? { duration: timeline.durationSeconds, position: timeline.elapsedSeconds, playbackRate: rate } : null);
      if (canSeek === seekingEnabled) return;
      seekingEnabled = canSeek;
      seekActions.forEach(action => setAction(action, canSeek ? details => seek(action, details) : null));
    };
    mediaBinding = {
      media, sessionId, sync,
      dispose() {
        observing = false;
        positionEvents.forEach(event => media.removeEventListener?.(event, sync));
        if (seekingEnabled) seekActions.forEach(action => setAction(action, null));
      }
    };
    positionEvents.forEach(event => media.addEventListener?.(event, sync));
    sync();
  };

  const sync = () => {
    if (disposed) return;
    const session = readOwnedPlaybackSession(refs);
    const active = Boolean(session && !session.pending);
    bindActions(session?.sessionId ?? null);
    publishPlaybackState(!active ? 'none' : refs.pauseStateRef.current ? 'paused' : 'playing');
    publishMetadata(formatMediaSessionMetadata(readOwnedNowPlaying(refs, owner, { isPlaying: active }), readCollectionTitle));
    observeMedia(readOwnedNowPlayingMedia(refs), session?.sessionId);
  };
  sync();

  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      bindActions(null);
      observeMedia(null);
      publishMetadata(null);
      publishPlaybackState('none');
    }
  };
};
