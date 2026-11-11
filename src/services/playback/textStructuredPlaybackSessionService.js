import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackOrder,
  resolveStructuredTextPlaybackScopeList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  hasStructuredTextPlayableChannel,
  resolveStructuredTextPlaybackChannelOrder,
  resolveStructuredTextPlaybackChannelSteps
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES } from '../../domain/text/textStructuredRuntimePlaybackPlanDomain.js';

const waitPlaybackFeelDelay = async ({ durationMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession }) => {
  let remaining = Math.max(0, Number(durationMs) || 0);
  while (remaining > 0) {
    if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) return false;
    await waitWhilePaused();
    if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) return false;
    const slice = Math.min(100, remaining);
    await new Promise(resolve => setTimeout(resolve, slice));
    remaining -= slice;
  }
  return !(stopSignalRef.current || playbackSession !== playbackSessionRef.current);
};

const buildScopedBlockGroups = ({ scopedList, fullList, documentTree }) => {
  const byBlock = new Map();
  scopedList.forEach(item => {
    if (!byBlock.has(item.blockId)) byBlock.set(item.blockId, []);
    byBlock.get(item.blockId).push(item);
  });
  return [...byBlock.entries()].map(([blockId, items]) => {
    const block = (documentTree?.blocks || []).find(candidate => candidate?.id === blockId) || null;
    const fullBlockItems = fullList.filter(item => item.blockId === blockId);
    const scopedIds = new Set(items.map(item => item.id));
    const wholeBlock = fullBlockItems.length > 0 && fullBlockItems.every(item => scopedIds.has(item.id));
    return { blockId, block, items, wholeBlock };
  }).filter(group => group.block && group.items.length);
};

const shouldStop = ({ stopSignalRef, playbackSessionRef, playbackSession }) =>
  stopSignalRef.current || playbackSession !== playbackSessionRef.current;

const prepareMediaPlayingState = ({ silentAudioRef }) => {
  if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
};

export const executeStructuredTextPlaybackSessionService = ({
  documentTree,
  startSegmentId = null,
  cursorSegmentId = null,
  blockId = null,
  scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
  playbackChannelMode,
  playbackOrderMode = TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
  playbackRepresentationMode = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
  repeatMode = TEXT_STRUCTURED_REPEAT_MODES.ONCE,
  repeatCount = null,
  orderedListOverride = null,
  onPlaybackCursor = null,
  onPlaybackCompleted = null,
  channelDelayMs = 0,
  segmentDelayMs = 0,
  safePlayTransition,
  playbackSessionRef,
  playbackContextRef,
  setIsPlaying,
  setIsPaused,
  pauseStateRef,
  stopSignalRef,
  silentAudioRef,
  waitWhilePaused,
  setPlayingContext,
  setPlayingIndex,
  setCurrentIndex,
  setSpeakingPart,
  playStructuredChannel,
  resolveBlockChannelPlaybackPlan = null,
  playStructuredFullStep = null,
  forceStopAll,
  addLog,
  random = Math.random
}) => {
  const resolved = resolveStructuredTextPlaybackScopeList({
    documentTree,
    startSegmentId,
    cursorSegmentId,
    blockId,
    scope
  });
  const scopedList = resolved.playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode));
  const cursorId = cursorSegmentId || startSegmentId || null;
  if (!scopedList.length) {
    addLog?.('Text Player', 'Playback not started: no Segment in this scope has content for the selected Text Play mode.');
    return false;
  }

  const normalizedRepresentation = playbackRepresentationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    ? TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    : TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;
  const fullRuntimeEnabled = normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    && typeof resolveBlockChannelPlaybackPlan === 'function'
    && typeof playStructuredFullStep === 'function';

  safePlayTransition(async () => {
    const playbackSession = playbackSessionRef.current;
    const repeatCountProvided = repeatCount !== null && repeatCount !== undefined && repeatCount !== '';
    const requestedRepeatCount = repeatCountProvided ? Number(repeatCount) : Number.NaN;
    const finiteRepeatCount = Number.isFinite(requestedRepeatCount) ? Math.min(20, Math.max(1, Math.round(requestedRepeatCount))) : null;
    const repeatLimit = repeatMode === TEXT_STRUCTURED_REPEAT_MODES.LOOP
      ? Number.POSITIVE_INFINITY
      : finiteRepeatCount || (repeatMode === TEXT_STRUCTURED_REPEAT_MODES.TWICE ? 2 : 1);

    setPlayingContext(TEXT_STRUCTURED_PLAYBACK_CONTEXT);
    setIsPlaying(true);
    setIsPaused(false);
    pauseStateRef.current = false;
    const repeatLabel = repeatMode === TEXT_STRUCTURED_REPEAT_MODES.LOOP ? repeatMode : `${repeatLimit}×`;
    const representationLabel = fullRuntimeEnabled ? 'full' : normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL ? 'full→split (runtime unavailable)' : 'split';
    addLog?.('Text Player', `${documentTree.title || documentTree.id} • ${scope} • ${scopedList.length} segment${scopedList.length === 1 ? '' : 's'} • ${playbackChannelMode} • ${representationLabel} • ${playbackOrderMode} • ${repeatLabel}.`);

    if (silentAudioRef.current) silentAudioRef.current.play().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    let pass = 0;
    while (pass < repeatLimit && !shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) {
      const validIds = new Set(scopedList.map(item => item.id));
      const overrideValid = pass === 0 && Array.isArray(orderedListOverride)
        && orderedListOverride.length === scopedList.length
        && new Set(orderedListOverride.map(item => item.id)).size === validIds.size
        && orderedListOverride.every(item => validIds.has(item.id));
      const orderedList = overrideValid
        ? orderedListOverride.map(item => scopedList.find(source => source.id === item.id))
        : resolveStructuredTextPlaybackOrder({
            list: scopedList,
            orderMode: playbackOrderMode,
            anchorId: pass === 0 && playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE ? cursorId : null,
            random
          });
      if (fullRuntimeEnabled) {
        const groups = buildScopedBlockGroups({ scopedList: orderedList, fullList: resolved.fullList, documentTree });
        // Full navigation is card-based: a cursor anywhere in a card restarts that
        // card's single Full artifact from its beginning.
        const cursorGroupIndex = pass === 0 && cursorId
          ? groups.findIndex(group => group.items.some(item => item.id === cursorId))
          : 0;
        const firstGroupIndex = cursorGroupIndex >= 0 ? cursorGroupIndex : 0;
        const channelOrder = resolveStructuredTextPlaybackChannelOrder(playbackChannelMode);

        if (playbackContextRef) {
          playbackContextRef.current = {
            sessionId: playbackSession,
            context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
            kind: 'text-structured',
            documentId: documentTree.id,
            documentTitle: documentTree.title,
            scope,
            scopeStartSegmentId: startSegmentId || null,
            cursorSegmentId: cursorId,
            blockId: blockId || groups[0]?.blockId || null,
            playbackChannelMode,
            playbackOrderMode,
            playbackRepresentationMode: normalizedRepresentation,
            repeatMode,
            repeatCount: repeatLimit === Number.POSITIVE_INFINITY ? null : repeatLimit,
            channelDelayMs,
            segmentDelayMs,
            repeatPass: pass + 1,
            baseList: [...resolved.fullList],
            orderedList: [...orderedList]
          };
        }

        for (let groupIndex = firstGroupIndex; groupIndex < groups.length; groupIndex += 1) {
          const group = groups[groupIndex];
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          await waitWhilePaused();
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          prepareMediaPlayingState({ silentAudioRef });
          const cardFirstSegment = group.items[0]?.id || null;
          if (cardFirstSegment) {
            if (playbackContextRef?.current?.sessionId === playbackSession) {
              playbackContextRef.current.cursorSegmentId = cardFirstSegment;
              playbackContextRef.current.blockId = group.blockId;
            }
            onPlaybackCursor?.({ documentId: documentTree.id, segmentId: cardFirstSegment, blockId: group.blockId, orderedList });
          }

          for (let channelIndex = 0; channelIndex < channelOrder.length; channelIndex += 1) {
            const channel = channelOrder[channelIndex];
            const plan = resolveBlockChannelPlaybackPlan({
              block: group.block,
              channel,
              allowFullArtifact: group.wholeBlock,
              items: group.items
            });
            const steps = Array.isArray(plan?.steps) ? plan.steps : [];

            for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
              const step = steps[stepIndex];
              if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
              await waitWhilePaused();
              if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
              prepareMediaPlayingState({ silentAudioRef });

              const item = step.segmentId
                ? group.items.find(candidate => candidate.id === step.segmentId) || group.items[0]
                : group.items[0];
              setCurrentIndex(cardFirstSegment || item?.id || null);
              // Full mode highlights the card/whole channel, never individual sentences.
              setPlayingIndex(null);
              setSpeakingPart(step.channel || channel);

              if (step.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL
                || step.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS) {
                await playStructuredFullStep(step, group.block, item);
              } else {
                await playStructuredChannel(step.content, item, step.channel || channel);
              }

              const hasNextStep = stepIndex < steps.length - 1;
              if (hasNextStep && segmentDelayMs > 0) {
                const keepGoing = await waitPlaybackFeelDelay({ durationMs: segmentDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
                if (!keepGoing) break;
              }
            }

            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
            const hasNextChannel = channelIndex < channelOrder.length - 1;
            if (hasNextChannel && channelDelayMs > 0) {
              const keepGoing = await waitPlaybackFeelDelay({ durationMs: channelDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
              if (!keepGoing) break;
            }
          }

          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          const hasNextGroup = groupIndex < groups.length - 1;
          if (hasNextGroup && segmentDelayMs > 0) {
            const keepGoing = await waitPlaybackFeelDelay({ durationMs: segmentDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
            if (!keepGoing) break;
          }
        }
      } else {
        // Split follows sentence units. Shuffle only rearranges cards; within
        // each card, all sentences retain their authored sequence.
        if (playbackContextRef) {
          playbackContextRef.current = {
            sessionId: playbackSession,
            context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
            kind: 'text-structured',
            documentId: documentTree.id,
            documentTitle: documentTree.title,
            scope,
            scopeStartSegmentId: startSegmentId || null,
            cursorSegmentId: cursorId,
            blockId: blockId || scopedList[0]?.blockId || null,
            playbackChannelMode,
            playbackOrderMode,
            playbackRepresentationMode: normalizedRepresentation,
            repeatMode,
            repeatCount: repeatLimit === Number.POSITIVE_INFINITY ? null : repeatLimit,
            channelDelayMs,
            segmentDelayMs,
            repeatPass: pass + 1,
            baseList: [...resolved.fullList],
            orderedList: [...orderedList]
          };
        }

        const scopedCursorIndex = pass === 0 && cursorId ? orderedList.findIndex(item => item.id === cursorId) : 0;
        const firstItemIndex = scopedCursorIndex >= 0 ? scopedCursorIndex : 0;
        for (let itemIndex = firstItemIndex; itemIndex < orderedList.length; itemIndex += 1) {
          const item = orderedList[itemIndex];
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          await waitWhilePaused();
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;

          prepareMediaPlayingState({ silentAudioRef });
          const suppressHighlight = normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
          setPlayingIndex(suppressHighlight ? null : item.id);
          setCurrentIndex(item.id);
          if (playbackContextRef?.current?.sessionId === playbackSession) {
            playbackContextRef.current.cursorSegmentId = item.id;
            playbackContextRef.current.blockId = item.blockId;
          }
          onPlaybackCursor?.({ documentId: documentTree.id, segmentId: item.id, blockId: item.blockId, orderedList });
          const channelSteps = resolveStructuredTextPlaybackChannelSteps(item, playbackChannelMode);

          for (let stepIndex = 0; stepIndex < channelSteps.length; stepIndex += 1) {
            const step = channelSteps[stepIndex];
            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
            await waitWhilePaused();
            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;

            setSpeakingPart(step.channel);
            await playStructuredChannel(step.content, item, step.channel);

            const hasNextChannel = stepIndex < channelSteps.length - 1;
            if (hasNextChannel && channelDelayMs > 0) {
              const keepGoing = await waitPlaybackFeelDelay({ durationMs: channelDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
              if (!keepGoing) break;
            }
          }

          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          const hasNextSegment = itemIndex < orderedList.length - 1;
          if (hasNextSegment && segmentDelayMs > 0) {
            const keepGoing = await waitPlaybackFeelDelay({ durationMs: segmentDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
            if (!keepGoing) break;
          }
        }
      }

      if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
      pass += 1;
      if (pass < repeatLimit && segmentDelayMs > 0) {
        const keepGoing = await waitPlaybackFeelDelay({ durationMs: segmentDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
        if (!keepGoing) break;
      }
    }

    if (playbackSession !== playbackSessionRef.current) return;
    setSpeakingPart(null);
    setPlayingIndex(null);
    if (!stopSignalRef.current) {
      if (scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT || scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE) {
        const firstId = resolved.fullList.find(item => hasStructuredTextPlayableChannel(item, playbackChannelMode))?.id || null;
        if (firstId) setCurrentIndex(firstId);
        onPlaybackCompleted?.({ documentId: documentTree.id, segmentId: firstId });
      }
      addLog?.('Text Player', 'Structured Text playback finished.');
      forceStopAll();
    }
  });

  return true;
};
