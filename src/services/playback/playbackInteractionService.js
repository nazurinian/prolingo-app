import { getItemPartText } from '../../utils/audioUtils';
import { getPlaybackListSignature } from '../../utils/playbackSequenceUtils';
import { resolveIndependentPlaybackContext, resolveIndependentPlaybackControlAction } from '../../domain/playback/playbackControlDomain';
import { resolveGlobalPlayControlAction, resolveGlobalPlayFreshStartState, resolveGlobalPlayResumeItem, resolveGlobalPlayTargetContext, shouldAttemptGlobalPlayResume } from '../../domain/playback/globalPlaybackControlDomain';
import { resolvePlaybackNavigationReferenceState, resolvePlaybackNavigationTargetState } from '../../domain/playback/playbackNavigationDomain';

export const executeIndependentPlaybackInteraction = ({
  item, part, uiId, setActiveMenuId, independentPlayingId, forceStopAll, safePlayTransition,
  playbackSessionRef, playbackContextRef, setIndependentPlayingId, setPlayingContext, mode, tableViewMode,
  setPlayingIndex, setCurrentIndex, setSpeakingPart, playSource, onStudyVocab
}) => {
    setActiveMenuId(null);
    if (resolveIndependentPlaybackControlAction({ independentPlayingId, uiId }) === 'stop') {
        forceStopAll();
        return;
    }

    safePlayTransition(async () => {
      const playbackSession = playbackSessionRef.current;
      if (playbackContextRef) {
        playbackContextRef.current = {
          sessionId: playbackSession,
          context: resolveIndependentPlaybackContext({ mode, tableViewMode }),
          kind: 'independent',
          baseList: [item],
          orderedList: [item]
        };
      }
      setIndependentPlayingId(uiId);
      setPlayingContext(resolveIndependentPlaybackContext({ mode, tableViewMode }));
      setPlayingIndex(item.id);
      setCurrentIndex(item.id);
      
      const textToPlay = getItemPartText(item, part);
      if (!String(textToPlay || '').trim()) {
          setIndependentPlayingId(null);
          setSpeakingPart(null);
          return;
      }

      setSpeakingPart(part);
      onStudyVocab?.(item);
      await playSource(textToPlay, item, part);
      if (playbackSession !== playbackSessionRef.current) return;
      setIndependentPlayingId(null);
      setSpeakingPart(null); 
    });
};

export const executeGlobalPlayInteraction = ({
  setActiveMenuId, isPlaying, isPaused, resumePlayback, pausePlayback, justSwitchedTab,
  playingIndex, playingContext, getBasePlaybackListForContext, startGlobalPlayback,
  mode, tableViewMode, currentIndex
}) => {
    setActiveMenuId(null);

    const controlAction = resolveGlobalPlayControlAction({ isPlaying, isPaused });
    if (controlAction === 'resume') {
      resumePlayback();
      return;
    }
    if (controlAction === 'pause') {
      pausePlayback();
      return;
    }

    justSwitchedTab.current = true;
    if (shouldAttemptGlobalPlayResume({ playingIndex, playingContext })) {
        const baseList = getBasePlaybackListForContext(playingContext);
        const item = resolveGlobalPlayResumeItem(baseList, playingIndex);
        if (item) {
            startGlobalPlayback(item.id, playingContext);
            return;
        }
    }

    const targetContext = resolveGlobalPlayTargetContext({ mode, tableViewMode });
    const baseList = getBasePlaybackListForContext(targetContext);
    const freshStart = resolveGlobalPlayFreshStartState({ baseList, currentIndex });
    startGlobalPlayback(freshStart.startItemId, targetContext, {
      anchorShuffle: freshStart.anchorShuffle
    });
};

export const executeManualRowPlaybackInteraction = ({
  item, setActiveMenuId, setIndependentPlayingId, mode, tableViewMode, setCurrentIndex,
  setPlayingIndex, setPlayingContext, startGlobalPlayback, vocabularyPlayOrderRef
}) => {
      setActiveMenuId(null);
      setIndependentPlayingId(null);

      const targetContext = mode === 'table' ? tableViewMode : 'text';
      setCurrentIndex(item.id);
      setPlayingIndex(item.id);
      setPlayingContext(targetContext);
      startGlobalPlayback(item.id, targetContext, {
        anchorShuffle: targetContext !== 'text',
        forceReshuffle: targetContext !== 'text' && vocabularyPlayOrderRef.current === 'shuffle'
      });
};

export const executeForceStopPlaybackService = ({
  playbackSessionRef, stopSignalRef, pauseStateRef, currentAudioObjRef, synth,
  settlePlaybackPromise, currentUtteranceRef, silentAudioRef, setIsPlaying,
  setIsPaused, setSpeakingPart, setIndependentPlayingId, playbackContextRef
}) => {
    playbackSessionRef.current += 1;
    if (playbackContextRef) playbackContextRef.current = null;
    stopSignalRef.current = true;
    pauseStateRef.current = false;

    const activeAudio = currentAudioObjRef.current;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.onended = null;
      activeAudio.onerror = null;
    }
    synth.cancel();
    settlePlaybackPromise();
    currentAudioObjRef.current = null;
    currentUtteranceRef.current = null;

    if (silentAudioRef.current) {
        silentAudioRef.current.pause();
        silentAudioRef.current.currentTime = 0;
    }

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "none";

    setIsPlaying(false);
    setIsPaused(false);
    setSpeakingPart(null);
    setIndependentPlayingId(null);
};

export const executeSmartPlaybackNavigation = ({
  direction, setActiveMenuId, justSwitchedTab, playingIndex, playingContext, mode,
  tableViewMode, currentIndex, getBasePlaybackListForContext, vocabularyPlayOrderRef,
  resolveVocabularyPlaybackList, activeVocabularyOrderRef, playbackContextRef, setCurrentIndex,
  setPlayingContext, startGlobalPlayback
}) => {
    setActiveMenuId(null);
    justSwitchedTab.current = true;

    const navigationReference = resolvePlaybackNavigationReferenceState({
      playingIndex,
      playingContext,
      mode,
      tableViewMode,
      currentIndex
    });
    const contextToUse = navigationReference.contextToUse;
    const refId = navigationReference.refId;
    const sessionSnapshot = playbackContextRef?.current;
    const canUseSessionSnapshot = Boolean(
      sessionSnapshot?.kind === 'global' &&
      sessionSnapshot.context === contextToUse &&
      Array.isArray(sessionSnapshot.orderedList) &&
      sessionSnapshot.orderedList.some(item => item.id === refId)
    );
    const baseList = canUseSessionSnapshot
      ? sessionSnapshot.baseList
      : getBasePlaybackListForContext(contextToUse);
    if (!baseList.length) return;

    const useTableShuffle = contextToUse !== 'text' && vocabularyPlayOrderRef.current === 'shuffle';
    let listToUse = canUseSessionSnapshot
      ? sessionSnapshot.orderedList
      : (useTableShuffle
          ? resolveVocabularyPlaybackList(baseList, contextToUse, {
              anchorId: activeVocabularyOrderRef.current?.signature === getPlaybackListSignature(baseList) ? null : refId
            })
          : baseList);

    const navigationTarget = resolvePlaybackNavigationTargetState({
      direction,
      refId,
      listToUse,
      contextToUse,
      mode,
      tableViewMode
    });
    const targetItem = navigationTarget.targetItem;
    if (navigationTarget.shouldSetCurrentIndex) {
       setCurrentIndex(targetItem.id);
    }
    setPlayingContext(contextToUse);
    startGlobalPlayback(targetItem.id, contextToUse, canUseSessionSnapshot ? {
      baseListOverride: [...sessionSnapshot.baseList],
      orderedListOverride: [...sessionSnapshot.orderedList]
    } : {});
};
