import { getAdvancedExpressionPairs } from '../../utils/audioUtils';
import { getPlaybackItemId } from '../../utils/playbackSequenceUtils';
import { resolvePlaybackAdvanceState, resolvePlaybackRequestedId, resolvePlaybackSessionContextState, resolvePlaybackStartIndex } from '../../domain/playback/playbackSessionDomain';

export const executeGlobalPlaybackSessionService = ({
  startItemId = null,
  forcedContext = null,
  options = {},
  playingContext,
  playingIndex,
  isPlaying,
  mode,
  tableViewMode,
  setPlayingContext,
  getBasePlaybackListForContext,
  resolveVocabularyPlaybackList,
  safePlayTransition,
  playbackSessionRef,
  setIsPlaying,
  setIsPaused,
  pauseStateRef,
  addLog,
  vocabularyPlayOrderRef,
  silentAudioRef,
  stopSignalRef,
  waitWhilePaused,
  setPlayingIndex,
  setMasterIndex,
  setStudyIndex,
  setSavedIndices,
  tableViewModeRef,
  setCurrentIndex,
  playbackModeRef,
  playbackSequenceRef,
  setSpeakingPart,
  playbackDelaysRef,
  waitPlaybackDelay,
  playSource,
  forceStopAll,
  onStudyVocab
}) => {
    const sessionStart = resolvePlaybackSessionContextState({
      forcedContext,
      playingContext,
      playingIndex,
      isPlaying,
      mode,
      tableViewMode
    });
    const sessionMode = sessionStart.sessionMode;
    if (sessionStart.shouldSetPlayingContext) {
      setPlayingContext(sessionStart.nextPlayingContext);
    }

    const baseList = getBasePlaybackListForContext(sessionMode);
    if (!baseList.length) return;

    const requestedId = resolvePlaybackRequestedId(startItemId);
    let listToPlay = resolveVocabularyPlaybackList(baseList, sessionMode, {
      forceReshuffle: Boolean(options.forceReshuffle),
      anchorId: options.anchorShuffle ? requestedId : null
    });

    const startIndex = resolvePlaybackStartIndex(listToPlay, requestedId);

    safePlayTransition(async () => {
      const playbackSession = playbackSessionRef.current;
      setIsPlaying(true);
      setIsPaused(false);
      pauseStateRef.current = false;
      let index = startIndex;
      addLog("Info", `Global Play (${sessionMode}) start • ${vocabularyPlayOrderRef.current === 'shuffle' ? 'Shuffle' : 'Sequential'} order.`);

      // --- FIX: START SILENT ANCHOR (AGGRESSIVE) ---
      if (silentAudioRef.current) {
          silentAudioRef.current.play().catch(e => console.warn("Silent Play Failed", e));
      }
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      // ---------------------------------

      while (index >= 0 && index < listToPlay.length && !stopSignalRef.current && playbackSession === playbackSessionRef.current) {
        await waitWhilePaused();
        if (stopSignalRef.current) break;
        // --- HEARTBEAT CHECK ---
        if (silentAudioRef.current && silentAudioRef.current.paused) {
             silentAudioRef.current.play().catch(() => {});
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        // -----------------------

        const item = listToPlay[index];
        setPlayingIndex(item.id); 

        if (sessionMode === 'master') setMasterIndex(item.id);
        else if (sessionMode === 'study') setStudyIndex(item.id);
        else setSavedIndices(prev => ({...prev, text: item.id}));

        if ((mode === 'table' && tableViewModeRef.current === sessionMode) || (mode === 'text' && sessionMode === 'text')) {
             setCurrentIndex(item.id);
        }

        const currentMode = playbackModeRef.current;
        const loops = (currentMode === 'repeat_2x') ? 2 : 1;
        let studyEventRecorded = false;

        for (let l = 0; l < loops; l++) {
          if (stopSignalRef.current) break;
          if (playbackModeRef.current !== currentMode && currentMode === 'repeat_2x' && l > 0) break;

          if (item.isStructured) {
            const expressionPairs = getAdvancedExpressionPairs(item);
            const activeSequence = playbackSequenceRef.current.filter(entry => entry.enabled);

            for (let sequenceIndex = 0; sequenceIndex < activeSequence.length; sequenceIndex++) {
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
              await waitWhilePaused();
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

              const sequencePart = activeSequence[sequenceIndex].key;
              let textToPlay = '';
              let sourcePart = sequencePart;

              if (sequencePart === 'word_en') {
                textToPlay = item.word || '';
                sourcePart = 'word';
              } else if (sequencePart === 'word_idn') {
                textToPlay = item.meaningWord || '';
                sourcePart = 'word_idn';
              } else if (sequencePart === 'sentence_en') {
                textToPlay = item.sentence || '';
                sourcePart = 'sentence';
              } else if (sequencePart === 'sentence_idn') {
                // v5.11.6: read the sentence translation directly with no spoken prefix.
                textToPlay = item.meaning || '';
                sourcePart = 'meaning';
              } else {
                const expMatch = sequencePart.match(/^exp([1-5])_(en|idn)$/);
                if (expMatch) {
                  const expNo = Number(expMatch[1]);
                  const language = expMatch[2];
                  const pair = expressionPairs[expNo - 1];
                  textToPlay = language === 'idn' ? (pair?.idn || '') : (pair?.en || '');
                  sourcePart = `exp${expNo}_${language}`;
                }
              }

              if (!String(textToPlay || '').trim()) continue;
              if (!studyEventRecorded) {
                onStudyVocab?.(item);
                studyEventRecorded = true;
              }

              const repeatCount = Math.min(5, Math.max(1, Number.parseInt(activeSequence[sequenceIndex]?.repeat, 10) || 1));
              setSpeakingPart(sourcePart);

              for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
                await waitWhilePaused();
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

                // v5.11.6: repeat-gap and part-gap are independently configurable.
                const delayMs = repeatIndex > 0
                  ? playbackDelaysRef.current.repeatDelayMs
                  : (sequenceIndex > 0 ? playbackDelaysRef.current.partDelayMs : 0);
                if (delayMs > 0) {
                  const delayCompleted = await waitPlaybackDelay(delayMs, playbackSession);
                  if (!delayCompleted) break;
                }

                await playSource(textToPlay, item, sourcePart);
              }
            }
          } else {
            setSpeakingPart('full');
            await playSource(item.text, item, 'full');
          }
          if (l < loops - 1) {
              await new Promise(r => setTimeout(r, 500));
              await waitWhilePaused();
          }
        }

        if (stopSignalRef.current) break;
        await new Promise(r => setTimeout(r, 800));
        await waitWhilePaused();

        const liveMode = playbackModeRef.current;
        const advance = resolvePlaybackAdvanceState({
          liveMode,
          vocabularyPlayOrder: vocabularyPlayOrderRef.current,
          index,
          listLength: listToPlay.length
        });
        if (advance.shouldBreak) break;
        if (advance.shouldReshuffle) {
          // Legacy Random mode with Shuffle Vocabulary and normal sequential progression
          // both complete the current no-repeat round before generating a fresh order.
          listToPlay = resolveVocabularyPlaybackList(baseList, sessionMode, {
            forceReshuffle: true,
            avoidFirstId: getPlaybackItemId(item)
          });
        }
        index = advance.nextIndex;
      }
      if (playbackSession !== playbackSessionRef.current) return;
      setIsPlaying(false);
      setIsPaused(false);
      pauseStateRef.current = false;
      setSpeakingPart(null);
      // forceStopAll akan dipanggil manual oleh user atau cleanup, tapi jika loop habis:
      if (!stopSignalRef.current) {
          // Playlist selesai secara alami
          addLog("Info", "Playback Finished.");
          forceStopAll(); // Matikan silent audio juga
      }
    });
};
