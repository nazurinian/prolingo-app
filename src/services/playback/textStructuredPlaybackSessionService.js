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
  const resolvedCursorIndex = cursorId ? scopedList.findIndex(item => item.id === cursorId) : 0;
  const initialCursorIndex = resolvedCursorIndex >= 0 ? resolvedCursorIndex : 0;
  if (!scopedList.length) {
    addLog?.('Text Player', 'Playback not started: no Segment in this scope has content for the selected Text Play mode.');
    return false;
  }

  const normalizedRepresentation = playbackRepresentationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    ? TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    : TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;
  const fullRuntimeEnabled = normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    && playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL
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
    const representationLabel = fullRuntimeEnabled ? 'full' : normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL ? 'full→split' : 'split';
    addLog?.('Text Player', `${documentTree.title || documentTree.id} • ${scope} • ${scopedList.length} segment${scopedList.length === 1 ? '' : 's'} • ${playbackChannelMode} • ${representationLabel} • ${playbackOrderMode} • ${repeatLabel}.`);

    if (silentAudioRef.current) silentAudioRef.current.play().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    let pass = 0;
    while (pass < repeatLimit && !shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) {
      if (fullRuntimeEnabled) {
        const groups = buildScopedBlockGroups({ scopedList, fullList: resolved.fullList, documentTree });
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
            orderedList: [...scopedList]
          };
        }

        for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
          const group = groups[groupIndex];
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          await waitWhilePaused();
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          prepareMediaPlayingState({ silentAudioRef });

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
              setCurrentIndex(step.segmentId || item?.id || null);
              // Full Mode intentionally suppresses sentence highlight even when its
              // runtime route falls back to Split audio/TTS.
              setPlayingIndex(step.highlight ? (step.segmentId || item?.id || null) : null);
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
        // Accepted beta.7 Split runtime path remains the compatibility/default
        // execution path. When Full is requested with Shuffle, we deliberately
        // use Split order because a single Full Artifact cannot represent shuffle.
        const orderedList = resolveStructuredTextPlaybackOrder({
          list: scopedList,
          orderMode: playbackOrderMode,
          anchorId: pass === 0 ? cursorId : null,
          random
        });
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

        const firstItemIndex = pass === 0 && playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL ? initialCursorIndex : 0;
        for (let itemIndex = firstItemIndex; itemIndex < orderedList.length; itemIndex += 1) {
          const item = orderedList[itemIndex];
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          await waitWhilePaused();
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;

          prepareMediaPlayingState({ silentAudioRef });
          const suppressHighlight = normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
          setPlayingIndex(suppressHighlight ? null : item.id);
          setCurrentIndex(item.id);
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
      addLog?.('Text Player', 'Structured Text playback finished.');
      forceStopAll();
    }
  });

  return true;
};
