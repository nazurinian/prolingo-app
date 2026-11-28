import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackOrder,
  resolveStructuredTextPlaybackCommand
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  resolveStructuredTextPlaybackChannelOrder,
  resolveStructuredTextPlaybackChannelSteps
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES } from '../../domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { bookHeadingBoundarySteps } from '../../domain/text/bookQaHeadingAudioDomain.js';

const FAST_SETTLE_STEP_THRESHOLD_MS = 15;
const FAST_SETTLE_PASS_THRESHOLD_MS = 60;
const FAST_STEP_YIELD_MS = 16;
const FAST_PASS_BACKOFF_STEP_MS = 40;
const FAST_PASS_MAX_YIELD_MS = 250;

const waitPlaybackFeelDelay = async ({ durationMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession, pauseStateRef }) => {
  let remaining = Math.max(0, Number(durationMs) || 0);
  while (remaining > 0) {
    if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) return false;
    await waitWhilePaused();
    if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) return false;
    const slice = Math.min(100, remaining);
    await new Promise(resolve => setTimeout(resolve, slice));
    if (!pauseStateRef?.current) remaining -= slice;
  }
  return !(stopSignalRef.current || playbackSession !== playbackSessionRef.current);
};

const buildScopedBlockGroups = ({ scopedList, documentTree }) => {
  const byBlock = new Map();
  scopedList.forEach(item => {
    if (!byBlock.has(item.blockId)) byBlock.set(item.blockId, []);
    byBlock.get(item.blockId).push(item);
  });
  return [...byBlock.entries()].map(([blockId, items]) => {
    const block = (documentTree?.blocks || []).find(candidate => candidate?.id === blockId) || null;
    return { blockId, block, items };
  }).filter(group => group.block && group.items.length);
};

const shouldStop = ({ stopSignalRef, playbackSessionRef, playbackSession }) =>
  stopSignalRef.current || playbackSession !== playbackSessionRef.current;

const resumeSilentAnchor = ({ silentAudioRef }) => {
  if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
};

export const executeStructuredTextPlaybackSessionService = args => {
  const {
  documentTree,
  workspaceId,
  workspaceUid,
  startSegmentId = null,
  cursorSegmentId = null,
  blockId = null,
  unitId = null,
  virtualUnit = false,
  scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
  // The original low-level From Here adapter was workspace-wide.
  boundary = TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
  channel,
  cardChannel = null,
  playbackChannelMode: requestedChannelMode,
  playbackOrderMode = TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
  playbackRepresentationMode = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
  savedPlaybackRepresentationMode = playbackRepresentationMode,
  repeatMode = TEXT_STRUCTURED_REPEAT_MODES.ONCE,
  repeatCount = null,
  orderedListOverride = null,
  transportSegmentId = null,
  onPlaybackCursor = null,
  onPlaybackAccepted = null,
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
  playHeadingStep = null,
  trackFullFallback = false,
  prepareSplitStep = null,
  getPreparationStamp = null,
  continuePlayback = null,
  continuation = null,
  atomicOnly = false,
  forceStopAll,
  addLog,
  random = Math.random
  } = args;
  const { DOCUMENT, CARD, FROM_HERE, UNIT } = TEXT_STRUCTURED_PLAYBACK_SCOPES;
  const explicitCard = scope === CARD ? documentTree?.blocks?.find(block => block.id === blockId) : null;
  const freshWorkspace = scope === DOCUMENT && !cursorSegmentId && !startSegmentId && !transportSegmentId;
  const orderedChannels = resolveStructuredTextPlaybackChannelOrder(requestedChannelMode);
  const stepsFor = (block, explicit = false) => playHeadingStep
    ? bookHeadingBoundarySteps(documentTree, block, orderedChannels, { explicit }) : [];
  const opening = freshWorkspace ? stepsFor(null, atomicOnly) : [];
  const standaloneCard = explicitCard ? stepsFor(explicitCard, atomicOnly) : [];
  const standalone = explicitCard ? standaloneCard : [
    ...opening, ...(freshWorkspace && !atomicOnly && playHeadingStep ? (documentTree?.blocks ?? []).flatMap(block => stepsFor(block)) : [])
  ];
  const allowEmpty = Boolean(standalone.length) && (freshWorkspace || Boolean(explicitCard));
  const resolved = resolveStructuredTextPlaybackCommand({
    documentTree, workspaceId, workspaceUid, startSegmentId, cursorSegmentId, blockId, unitId, virtualUnit,
    scope, boundary, channel, playbackChannelMode: requestedChannelMode, playbackRepresentationMode, allowEmpty
  });
  if (!resolved || (atomicOnly && !allowEmpty)) {
    addLog?.('Text Player', 'Playback not started: invalid target or no content for the selected Text Play mode.');
    return false;
  }

  const { playbackChannelMode, commandRepresentation: normalizedRepresentation } = resolved;
  const scopedList = atomicOnly ? [] : resolved.scopedList;
  const cursorId = transportSegmentId ?? resolved.cursorId;
  if (transportSegmentId != null && !scopedList.some(item => item.id === transportSegmentId)) return false;
  const fullTraversal = normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
  const fullRuntimeEnabled = fullTraversal
    && typeof resolveBlockChannelPlaybackPlan === 'function'
    && typeof playStructuredFullStep === 'function';

  const repeatCountProvided = repeatCount !== null && repeatCount !== undefined && repeatCount !== '';
  const requestedRepeatCount = repeatCountProvided ? Number(repeatCount) : Number.NaN;
  const finiteRepeatCount = Number.isFinite(requestedRepeatCount) ? Math.min(20, Math.max(1, Math.round(requestedRepeatCount))) : null;
  const repeatLimit = channel !== undefined || !scopedList.length ? 1 : repeatMode === TEXT_STRUCTURED_REPEAT_MODES.LOOP
    ? Number.POSITIVE_INFINITY
    : finiteRepeatCount || (repeatMode === TEXT_STRUCTURED_REPEAT_MODES.TWICE ? 2 : 1);
  const shuffleOrderActive = playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE;
  const validItems = new Map(scopedList.map(item => [item.id, item]));
  const overrideValid = (shuffleOrderActive || transportSegmentId != null) && Array.isArray(orderedListOverride)
    && orderedListOverride.length === scopedList.length
    && new Set(orderedListOverride.map(item => item.id)).size === validItems.size
    && orderedListOverride.every(item => validItems.has(item.id));
  const firstOrder = overrideValid
    ? [...new Set(orderedListOverride.map(item => validItems.get(item.id).blockId))]
      .flatMap(id => scopedList.filter(item => item.blockId === id))
    : resolveStructuredTextPlaybackOrder({ list: scopedList, orderMode: playbackOrderMode, anchorId: cursorId, random });
  const commandTarget = Object.freeze({
    scope, boundary: scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE ? boundary : null,
    blockId, unitId, virtualUnit, segmentId: startSegmentId, channel: channel ?? null, cardChannel
  });
  const makeSession = (orderedList, startId, pass) => {
    const first = orderedList.find(item => item.id === startId) ?? orderedList[0];
    return {
      context: TEXT_STRUCTURED_PLAYBACK_CONTEXT, kind: 'text-structured', documentTree,
      documentId: documentTree.id, documentTitle: documentTree.title,
      nowPlayingCardOrder: fullTraversal ? [...new Set(orderedList.map(item => item.blockId))] : null,
      temporarySplitCardIds: fullTraversal ? [...resolved.partialCardIds] : [],
      scope: atomicOnly ? 'heading' : scope, boundary: commandTarget.boundary, commandTarget: atomicOnly ? null : commandTarget,
      requestedRepresentation: resolved.requestedRepresentation, savedPlaybackRepresentationMode,
      exactChannel: channel ?? null, scopeStartSegmentId: startSegmentId || null,
      cursorSegmentId: first?.id ?? null, blockId: first?.blockId ?? null,
      playbackChannelMode, playbackOrderMode, playbackRepresentationMode: normalizedRepresentation,
      repeatMode, repeatCount: repeatLimit === Number.POSITIVE_INFINITY ? null : repeatLimit,
      channelDelayMs, segmentDelayMs, repeatPass: pass + 1,
      continuousPresentation: Boolean(continuePlayback),
      presentationSessionId: continuation?.presentationSessionId,
      baseList: resolved.fullList, orderedList,
      restart: item => executeStructuredTextPlaybackSessionService({
        ...args, transportSegmentId: item.id, orderedListOverride: orderedList,
        continuation: continuePlayback ? playbackContextRef.current : null
      })
    };
  };

  if (firstOrder.length) onPlaybackAccepted?.({ segmentId: cursorId ?? firstOrder[0].id,
    orderedList: shuffleOrderActive ? firstOrder : null, continuing: Boolean(continuation) });
  const transition = continuation ? continuePlayback : safePlayTransition;
  transition(async () => {
    const playbackSession = playbackSessionRef.current;

    setPlayingContext(TEXT_STRUCTURED_PLAYBACK_CONTEXT);
    setIsPlaying(true);
    if (!continuation) {
      setIsPaused(false);
      pauseStateRef.current = false;
    }
    const repeatLabel = repeatMode === TEXT_STRUCTURED_REPEAT_MODES.LOOP ? repeatMode : `${repeatLimit}×`;
    const representationLabel = fullRuntimeEnabled ? 'full' : normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL ? 'full→split (runtime unavailable)' : 'split';
    addLog?.('Text Player', `${documentTree.title || documentTree.id} • ${scope} • ${scopedList.length} segment${scopedList.length === 1 ? '' : 's'} • ${playbackChannelMode} • ${representationLabel} • ${playbackOrderMode} • ${repeatLabel}.`);

    if (!pauseStateRef.current && silentAudioRef.current) silentAudioRef.current.play().catch(() => {});

    const stopArgs = { stopSignalRef, playbackSessionRef, playbackSession };
    const waitGap = durationMs => waitPlaybackFeelDelay({
      durationMs, waitWhilePaused, ...stopArgs, pauseStateRef: continuePlayback ? pauseStateRef : null
    });
    // A prepared result belongs to one execution and one readable snapshot.
    // Only the immediately following step is prepared. A stale read is retried
    // through the normal resolver with its full scope and byte checks.
    const lookAhead = () => {
      let next;
      return {
        prepare(key, read) {
          if (!getPreparationStamp || next?.key === key || shouldStop(stopArgs)) return;
          const stamp = getPreparationStamp();
          if (stamp) next = { key, stamp, result: Promise.resolve().then(read).catch(() => undefined) };
        },
        async take(key) {
          if (next?.key !== key) return undefined;
          const { stamp, result } = next;
          next = null;
          const value = await result;
          return !shouldStop(stopArgs) && stamp === getPreparationStamp() ? value : undefined;
        }
      };
    };
    const playHeadings = async (steps, intro = false) => {
      const context = playbackContextRef?.current;
      if (intro && context?.sessionId === playbackSession) context.headingIntro = true;
      for (const step of steps) {
        if (shouldStop(stopArgs)) break;
        await waitWhilePaused();
        if (shouldStop(stopArgs)) break;
        setPlayingIndex(null);
        setSpeakingPart(step.channel);
        await playHeadingStep(step, playbackSession);
      }
      if (context?.sessionId === playbackSession) context.headingIntro = false;
    };
    let pass = 0;
    let fastPassStreak = 0;
    while (pass < repeatLimit && !shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) {
      const passStartedAt = Date.now();
      let fastStepStreak = 0;
      const orderedList = pass === 0 ? firstOrder
        : resolveStructuredTextPlaybackOrder({ list: scopedList, orderMode: playbackOrderMode, random });
      if (playbackContextRef) {
        const previous = playbackContextRef.current;
        playbackContextRef.current = {
          ...makeSession(orderedList, pass === 0 ? cursorId : null, pass), sessionId: playbackSession,
          presentationSessionId: previous?.presentationSessionId ?? playbackSession,
          lastStarted: previous?.lastStarted
        };
      }
      if (!scopedList.length) {
        await playHeadings(standalone);
        break;
      }
      if (pass === 0 && opening.length) await playHeadings(opening, true);
      const persistedOrderedList = shuffleOrderActive ? orderedList : null;
      const autoHeadings = playHeadingStep && (scope === DOCUMENT || scope === CARD || (scope === FROM_HERE && boundary !== UNIT));
      const firstCard = (orderedList.find(item => item.id === (pass === 0 ? cursorId : null)) ?? orderedList[0])?.blockId;
      const skipFirstHeading = pass === 0 && Boolean(cursorId);
      const continuedCard = scope === FROM_HERE ? validItems.get(startSegmentId)?.blockId : null;
      const bodyCards = new Set(orderedList.map(item => item.blockId));
      const intervening = new Map();
      if (autoHeadings && freshWorkspace) {
        // Anchor heading-only Cards to an authored neighbour while Body shuffle keeps its existing order.
        let previous = null;
        for (const block of documentTree.blocks) {
          if (bodyCards.has(block.id)) previous = block.id;
          else {
            const steps = stepsFor(block);
            if (steps.length) intervening.set(previous, [...(intervening.get(previous) ?? []), ...steps]);
          }
        }
        if (intervening.has(null)) await playHeadings(intervening.get(null));
      }
      let previousCard = null;
      const enterCard = async (item, block) => {
        if (!autoHeadings || previousCard === item.blockId) return;
        if (intervening.has(previousCard) && previousCard) await playHeadings(intervening.get(previousCard));
        previousCard = item.blockId;
        if (item.blockId === continuedCard || (skipFirstHeading && item.blockId === firstCard)) return;
        const steps = stepsFor(block);
        if (!steps.length) return;
        const context = playbackContextRef?.current;
        if (context?.sessionId === playbackSession) {
          context.cursorSegmentId = item.id;
          context.blockId = item.blockId;
        }
        await playHeadings(steps);
      };
      const playSplitItems = async (items, firstItemIndex, { partialBlock = null, hasNextGroup = false, plans = null } = {}) => {
        const prepared = lookAhead();
        for (let itemIndex = firstItemIndex; itemIndex < items.length; itemIndex += 1) {
          const item = items[itemIndex];
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          await waitWhilePaused();
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          if (autoHeadings && !partialBlock && previousCard !== item.blockId) {
            await enterCard(item, documentTree.blocks.find(block => block.id === item.blockId));
            if (shouldStop(stopArgs)) break;
          }

          resumeSilentAnchor({ silentAudioRef });
          const suppressHighlight = !partialBlock && normalizedRepresentation === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
          setPlayingIndex(suppressHighlight ? null : item.id);
          setCurrentIndex(item.id);
          if (playbackContextRef?.current?.sessionId === playbackSession) {
            playbackContextRef.current.cursorSegmentId = item.id;
            playbackContextRef.current.blockId = item.blockId;
          }
          onPlaybackCursor?.({ documentId: documentTree.id, segmentId: item.id, blockId: item.blockId, orderedList: persistedOrderedList });
          const channelSteps = resolveStructuredTextPlaybackChannelSteps(item, playbackChannelMode);

          for (let stepIndex = 0; stepIndex < channelSteps.length; stepIndex += 1) {
            const step = channelSteps[stepIndex];
            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
            await waitWhilePaused();
            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;

            setSpeakingPart(step.channel);
            const stepStartedAt = Date.now();
            if (partialBlock || prepareSplitStep) {
              const nextItem = items[itemIndex + 1];
              const following = channelSteps[stepIndex + 1];
              const followingItem = following ? item : nextItem;
              const followingStep = following || (nextItem && resolveStructuredTextPlaybackChannelSteps(nextItem, playbackChannelMode)[0]);
              const preparedRuntime = await prepared.take(`${item.id}:${step.channel}`);
              if (shouldStop(stopArgs)) break;
              await playStructuredChannel(step.content, item, step.channel, {
                ...(partialBlock ? { block: partialBlock, step: plans.get(step.channel)?.get(item.id) } : {}),
                preparedRuntime,
                prepareFollowing: prepareSplitStep && followingStep ? () => prepared.prepare(
                  `${followingItem.id}:${followingStep.channel}`, () => prepareSplitStep(followingItem, followingStep.channel, partialBlock)
                ) : null
              });
            } else {
              await playStructuredChannel(step.content, item, step.channel);
            }
            const stepElapsedMs = Date.now() - stepStartedAt;
            fastStepStreak = stepElapsedMs < FAST_SETTLE_STEP_THRESHOLD_MS ? (fastStepStreak + 1) : 0;

            const hasNextChannel = stepIndex < channelSteps.length - 1;
            if (hasNextChannel) {
              const effectiveChannelDelayMs = Number(channelDelayMs) > 0
                ? channelDelayMs
                : (fastStepStreak >= 2 ? FAST_STEP_YIELD_MS : 0);
              if (effectiveChannelDelayMs > 0) {
                const keepGoing = await waitGap(effectiveChannelDelayMs);
                if (!keepGoing) break;
              }
            }
          }

          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          if (itemIndex < items.length - 1 || hasNextGroup) {
            const effectiveSegmentDelayMs = Number(segmentDelayMs) > 0
              ? segmentDelayMs
              : (fastStepStreak >= 2 ? FAST_STEP_YIELD_MS : 0);
            if (effectiveSegmentDelayMs > 0) {
              const keepGoing = await waitGap(effectiveSegmentDelayMs);
              if (!keepGoing) break;
            }
          }
        }
      };
      if (fullRuntimeEnabled) {
        const groups = buildScopedBlockGroups({ scopedList: orderedList, documentTree });
        // Full navigation is card-based: a cursor anywhere in a card restarts that
        // card's single Full artifact from its beginning.
        const cursorGroupIndex = pass === 0 && cursorId
          ? groups.findIndex(group => group.items.some(item => item.id === cursorId))
          : 0;
        const firstGroupIndex = cursorGroupIndex >= 0 ? cursorGroupIndex : 0;
        const channelOrder = resolveStructuredTextPlaybackChannelOrder(playbackChannelMode);
        const preparedFull = lookAhead();
        const readFull = (group, channel) => resolveBlockChannelPlaybackPlan({
          block: group.block, fullBlock: group.block, channel, allowFullArtifact: true,
          representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL, items: group.items, segmentIds: null
        });

        for (let groupIndex = firstGroupIndex; groupIndex < groups.length; groupIndex += 1) {
          const group = groups[groupIndex];
          if (autoHeadings) await enterCard(group.items[0], group.block);
          if (shouldStop(stopArgs)) break;
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          await waitWhilePaused();
          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          const hasNextGroup = groupIndex < groups.length - 1;
          if (resolved.partialCardIds.has(group.blockId)) {
            const segmentIds = group.items.map(item => item.id);
            const plans = new Map(channelOrder.map(channel => {
              const plan = resolveBlockChannelPlaybackPlan({
                block: group.block, channel, segmentIds, allowFullArtifact: false,
                representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
                items: group.items
              });
              const steps = Array.isArray(plan?.steps) ? plan.steps : [];
              const splitSteps = steps.filter(step => step.segmentId
                && step.type !== TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL
                && step.type !== TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
              return [channel, new Map(splitSteps.map(step => [step.segmentId, step]))];
            }));
            await playSplitItems(group.items, 0, { partialBlock: group.block, hasNextGroup, plans });
            continue;
          }
          resumeSilentAnchor({ silentAudioRef });
          const cardFirstSegment = group.items[0]?.id || null;
          const resumeIndex = trackFullFallback && pass === 0 && groupIndex === firstGroupIndex && cursorId
            ? Math.max(0, group.items.findIndex(item => item.id === cursorId)) : 0;
          const reportCursor = segmentId => {
            if (playbackContextRef?.current?.sessionId === playbackSession) {
              playbackContextRef.current.cursorSegmentId = segmentId;
              playbackContextRef.current.blockId = group.blockId;
            }
            onPlaybackCursor?.({ documentId: documentTree.id, segmentId, blockId: group.blockId, orderedList: persistedOrderedList });
          };
          const onFallbackStep = trackFullFallback ? segmentId => {
            setCurrentIndex(segmentId);
            setPlayingIndex(segmentId);
            reportCursor(segmentId);
          } : null;
          if (cardFirstSegment) reportCursor(group.items[resumeIndex].id);

          for (let channelIndex = 0; channelIndex < channelOrder.length; channelIndex += 1) {
            const channel = channelOrder[channelIndex];
            const cached = getPreparationStamp ? await preparedFull.take(`${group.blockId}:${channel}`) : undefined;
            if (shouldStop(stopArgs)) break;
            const candidate = cached ?? readFull(group, channel);
            const plan = typeof candidate?.then === 'function' ? await candidate : candidate;
            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
            const plannedSteps = Array.isArray(plan?.steps) ? plan.steps : [];
            const steps = resumeIndex ? plannedSteps.filter(step => !step.segmentId
              || group.items.findIndex(item => item.id === step.segmentId) >= resumeIndex) : plannedSteps;
            const nextGroup = channelIndex + 1 < channelOrder.length ? group : groups[groupIndex + 1];
            const nextChannel = channelOrder[channelIndex + 1] ?? channelOrder[0];
            const prepareNextFull = getPreparationStamp && nextGroup && !resolved.partialCardIds.has(nextGroup.blockId)
              ? () => preparedFull.prepare(`${nextGroup.blockId}:${nextChannel}`, () => readFull(nextGroup, nextChannel)) : null;
            const preparedSplit = lookAhead();

            for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
              const step = steps[stepIndex];
              if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
              await waitWhilePaused();
              if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
              resumeSilentAnchor({ silentAudioRef });

              const item = step.segmentId
                ? group.items.find(candidate => candidate.id === step.segmentId) || group.items[0]
                : group.items[0];
              const nextStep = steps[stepIndex + 1];
              const nextItem = nextStep?.segmentId && group.items.find(candidate => candidate.id === nextStep.segmentId);
              const prepareFollowing = prepareSplitStep && nextItem && !Object.hasOwn(nextStep, 'bookRuntime')
                ? () => preparedSplit.prepare(nextItem.id, () => prepareSplitStep(nextItem, nextStep.channel || channel, group.block))
                : prepareNextFull;
              setSpeakingPart(step.channel || channel);

              const stepStartedAt = Date.now();
              if (step.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL
                || step.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS) {
                setCurrentIndex(cardFirstSegment || item?.id || null);
                setPlayingIndex(null);
                if (trackFullFallback && cardFirstSegment) reportCursor(cardFirstSegment);
                await playStructuredFullStep(step, group.block, item, { onFallbackStep, prepareFollowing });
              } else {
                const preparedRuntime = prepareSplitStep ? await preparedSplit.take(item.id) : undefined;
                if (shouldStop(stopArgs)) break;
                if (onFallbackStep && step.segmentId) onFallbackStep(step.segmentId);
                else {
                  setCurrentIndex(cardFirstSegment || item?.id || null);
                  setPlayingIndex(null);
                }
                await playStructuredChannel(step.content, item, step.channel || channel, {
                  representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
                  ignoreSegmentOverride: step.ignoreSegmentVoiceOverride !== false,
                  block: group.block,
                  step,
                  preparedRuntime,
                  prepareFollowing
                });
              }
              const stepElapsedMs = Date.now() - stepStartedAt;
              fastStepStreak = stepElapsedMs < FAST_SETTLE_STEP_THRESHOLD_MS ? (fastStepStreak + 1) : 0;

              const hasNextStep = stepIndex < steps.length - 1;
              if (hasNextStep) {
                const effectiveStepDelayMs = Number(segmentDelayMs) > 0
                  ? segmentDelayMs
                  : (fastStepStreak >= 2 ? FAST_STEP_YIELD_MS : 0);
                if (effectiveStepDelayMs > 0) {
                  const keepGoing = await waitGap(effectiveStepDelayMs);
                  if (!keepGoing) break;
                }
              }
            }

            if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
            const hasNextChannel = channelIndex < channelOrder.length - 1;
            if (hasNextChannel && channelDelayMs > 0) {
              const keepGoing = await waitGap(channelDelayMs);
              if (!keepGoing) break;
            }
          }

          if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
          if (hasNextGroup && segmentDelayMs > 0) {
            const keepGoing = await waitGap(segmentDelayMs);
            if (!keepGoing) break;
          }
        }
      } else {
        // Split follows sentence units. Shuffle only rearranges cards; within
        // each card, all sentences retain their authored sequence.
        const cursorItem = pass === 0 && cursorId ? validItems.get(cursorId) : null;
        const scopedCursorIndex = cursorItem
          ? orderedList.findIndex(item => fullTraversal ? item.blockId === cursorItem.blockId : item.id === cursorId) : 0;
        await playSplitItems(orderedList, Math.max(0, scopedCursorIndex));
      }
      if (previousCard && intervening.has(previousCard)) await playHeadings(intervening.get(previousCard));

      if (shouldStop({ stopSignalRef, playbackSessionRef, playbackSession })) break;
      pass += 1;
      if (pass < repeatLimit) {
        // Yield progressively when a whole loop pass settles instantaneously (e.g. missing TTS/audio)
        // so Stop/Cancel remains responsive without adding latency to normal audio playback.
        const passElapsedMs = Date.now() - passStartedAt;
        fastPassStreak = passElapsedMs < FAST_SETTLE_PASS_THRESHOLD_MS ? (fastPassStreak + 1) : 0;
        const floorDelayMs = fastPassStreak > 0
          ? Math.min(FAST_PASS_MAX_YIELD_MS, FAST_PASS_BACKOFF_STEP_MS * fastPassStreak)
          : 0;
        const nextPassDelayMs = Math.max(Number(segmentDelayMs) || 0, floorDelayMs);
        if (nextPassDelayMs > 0) {
          const keepGoing = await waitGap(nextPassDelayMs);
          if (!keepGoing) break;
        }
      }
    }

    if (playbackSession !== playbackSessionRef.current) return;
    setSpeakingPart(null);
    setPlayingIndex(null);
    if (!stopSignalRef.current) {
      if (!atomicOnly && (scope === DOCUMENT || (scope === FROM_HERE && boundary === DOCUMENT))) {
        const firstId = resolved.fullList.find(item => resolveStructuredTextPlaybackChannelSteps(item, playbackChannelMode).length)?.id || null;
        if (firstId) setCurrentIndex(firstId);
        onPlaybackCompleted?.({ documentId: documentTree.id, segmentId: firstId });
      }
      addLog?.('Text Player', 'Structured Text playback finished.');
      forceStopAll();
    }
  }, makeSession(firstOrder, cursorId, 0), continuation);

  return true;
};
