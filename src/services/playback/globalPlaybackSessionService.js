import { getAdvancedExpressionPairs } from '../../utils/audioUtils';
import { getPlaybackItemId } from '../../utils/playbackSequenceUtils';
import { resolvePlaybackAdvanceState, resolvePlaybackRequestedId, resolvePlaybackSessionContextState, resolvePlaybackStartIndex } from '../../domain/playback/playbackSessionDomain';

const resolveSequencePart = (item, part, expressionPairs) => {
  if (part === 'word_en') return { textToPlay: item.word, sourcePart: 'word' };
  if (part === 'word_idn') return { textToPlay: item.meaningWord, sourcePart: part };
  if (part === 'sentence_en') return { textToPlay: item.sentence, sourcePart: 'sentence' };
  if (part === 'sentence_idn') return { textToPlay: item.meaning, sourcePart: 'meaning' };
  const match = typeof part === 'string' && part.match(/^exp([1-5])_(en|idn)$/);
  return { textToPlay: match ? expressionPairs[Number(match[1]) - 1]?.[match[2]] : null, sourcePart: part };
};

export const executeGlobalPlaybackSessionService = args => {
  const {
  startItemId = null,
  forcedContext = null,
  options = {},
  sourceData = null,
  documentId = null,
  isVisibleContext = null,
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
  playbackContextRef,
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
  } = args;
    const sessionStart = resolvePlaybackSessionContextState({
      forcedContext,
      playingContext,
      playingIndex,
      isPlaying,
      mode,
      tableViewMode
    });
    const sessionMode = forcedContext || sessionStart.sessionMode;
    if (!['master', 'study', 'text'].includes(sessionMode)) return;
    // P4-A0: Table vocabulary order is a Table-domain preference. Legacy Text
    // playback remains deterministic/sequential until Text owns its own order contract.
    const sessionPlayOrder = options.sessionPlayOrder ?? (sessionMode === 'text' ? 'sequential' : vocabularyPlayOrderRef.current);

    const baseList = Array.isArray(options.baseListOverride)
      ? [...options.baseListOverride]
      : getBasePlaybackListForContext(sessionMode);
    if (!baseList.length) return;

    const sequence = options.sequence ?? (Array.isArray(playbackSequenceRef.current) ? playbackSequenceRef.current : [])
      .filter(entry => entry.enabled).map(entry => ({ ...entry }));
    const delays = options.delays ?? { ...playbackDelaysRef?.current };

    // D3: a structured/table session with no enabled playback part has no work.
    // Refuse before safePlayTransition so no fake playing state, silent anchor,
    // fixed wait, index change, or shuffle mutation can occur.
    if (sessionMode !== 'text' && !sequence.length) {
      addLog("Info", "Playback not started: no Playback Sequence parts are enabled.");
      return;
    }

    let requestedId = resolvePlaybackRequestedId(startItemId);
    const isPlayable = item => {
      if (!item.isStructured) return Boolean(String(item.text ?? '').trim());
      const pairs = getAdvancedExpressionPairs(item);
      return sequence.some(({ key }) => String(resolveSequencePart(item, key, pairs).textToPlay ?? '').trim());
    };
    if (!options.transport && requestedId !== null && !baseList.some(item => String(item.id) === requestedId && isPlayable(item))) {
      if (!options.resumeHint) return;
      requestedId = null;
    }
    let listToPlay = Array.isArray(options.orderedListOverride)
      ? [...options.orderedListOverride]
      : resolveVocabularyPlaybackList(baseList, sessionMode, {
          forceReshuffle: Boolean(options.forceReshuffle),
          anchorId: options.anchorShuffle ? requestedId : null
        });

    if (!listToPlay.length || (requestedId !== null && !listToPlay.some(item => String(item.id) === requestedId))) return;
    const startIndex = options.queueIndex ?? (requestedId === null
      ? listToPlay.findIndex(isPlayable) : resolvePlaybackStartIndex(listToPlay, requestedId));
    if (startIndex < 0) return;
    const makeSession = queueIndex => ({
      context: sessionMode, kind: 'global', baseList, orderedList: listToPlay, queueIndex, sourceData, documentId,
      restart: (item, index) => executeGlobalPlaybackSessionService({
        ...args, startItemId: item.id, forcedContext: sessionMode,
        options: { baseListOverride: baseList, orderedListOverride: listToPlay, queueIndex: index, sessionPlayOrder, sequence, delays, transport: true }
      })
    });

    safePlayTransition(async () => {
      const playbackSession = playbackSessionRef.current;
      if (playbackContextRef) {
        playbackContextRef.current = { ...makeSession(startIndex), sessionId: playbackSession };
      }
      setPlayingContext(sessionMode);
      setIsPlaying(true);
      setIsPaused(false);
      pauseStateRef.current = false;
      let index = startIndex;
      addLog("Info", `Global Play (${sessionMode}) start • ${sessionPlayOrder === 'shuffle' ? 'Shuffle' : 'Sequential'} order.`);

      // --- FIX: START SILENT ANCHOR (AGGRESSIVE) ---
      if (silentAudioRef.current) {
          silentAudioRef.current.play().catch(e => console.warn("Silent Play Failed", e));
      }
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      // ---------------------------------

      while (index >= 0 && index < listToPlay.length && !stopSignalRef.current && playbackSession === playbackSessionRef.current) {
        await waitWhilePaused();
        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
        // --- HEARTBEAT CHECK ---
        if (silentAudioRef.current && silentAudioRef.current.paused) {
             silentAudioRef.current.play().catch(() => {});
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        // -----------------------

        const item = listToPlay[index];
        if (playbackContextRef?.current?.sessionId === playbackSession) playbackContextRef.current.queueIndex = index;
        setPlayingIndex(item.id); 

        if (sessionMode === 'master') setMasterIndex(item.id);
        else if (sessionMode === 'study') setStudyIndex(item.id);
        else setSavedIndices(prev => ({...prev, text: item.id}));

        const visible = isVisibleContext ? isVisibleContext(sessionMode, documentId)
          : (mode === 'table' && tableViewModeRef.current === sessionMode) || (mode === 'text' && sessionMode === 'text');
        if (visible) {
             setCurrentIndex(item.id);
        }

        const currentMode = playbackModeRef.current;
        const loops = (currentMode === 'repeat_2x') ? 2 : 1;
        let studyEventRecorded = false;

        for (let l = 0; l < loops; l++) {
          if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
          if (playbackModeRef.current !== currentMode && currentMode === 'repeat_2x' && l > 0) break;

          let playedAnyPartThisLoop = false;

          if (item.isStructured) {
            const expressionPairs = getAdvancedExpressionPairs(item);
            for (const sequenceEntry of sequence) {
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
              await waitWhilePaused();
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

              const { textToPlay, sourcePart } = resolveSequencePart(item, sequenceEntry.key, expressionPairs);

              if (!String(textToPlay || '').trim()) continue;
              if (!studyEventRecorded) {
                onStudyVocab?.(item);
                studyEventRecorded = true;
              }

              const repeatCount = Math.min(5, Math.max(1, Number.parseInt(sequenceEntry.repeat, 10) || 1));
              setSpeakingPart(sourcePart);

              for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
                await waitWhilePaused();
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

                // v5.11.6: repeat-gap and part-gap are independently configurable.
                const delayMs = repeatIndex > 0
                  ? delays.repeatDelayMs
                  : (playedAnyPartThisLoop ? delays.partDelayMs : 0);
                if (delayMs > 0) {
                  const delayCompleted = await waitPlaybackDelay(delayMs, playbackSession);
                  if (!delayCompleted) break;
                }
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

                await playSource(textToPlay, item, sourcePart, { queueIndex: index });
                playedAnyPartThisLoop = true;
              }
            }
          } else {
            setSpeakingPart('full');
            await playSource(item.text, item, 'full', { queueIndex: index });
            playedAnyPartThisLoop = true;
          }
          if (l < loops - 1) {
              // Keep the legacy Item 2x gap only when this loop actually played content.
              // A structured item with no playable enabled content must not create a silent wait.
              if (item.isStructured && !playedAnyPartThisLoop) continue;
              await new Promise(r => setTimeout(r, 500));
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
              await waitWhilePaused();
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
          }
        }

        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

        // P3-B: table vocabulary playback must not add a hidden fixed 800 ms gap
        // after every item. User-configured part/repeat delays remain the only
        // learning gaps for structured vocabulary. Preserve the legacy Text-mode
        // boundary until Text Mode is audited separately in Part 4.
        if (sessionMode === 'text') {
          await new Promise(r => setTimeout(r, 800));
          if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
        }
        await waitWhilePaused();
        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

        const liveMode = playbackModeRef.current;
        const advance = resolvePlaybackAdvanceState({
          liveMode,
          vocabularyPlayOrder: sessionPlayOrder,
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
          if (playbackContextRef?.current?.sessionId === playbackSession) {
            playbackContextRef.current = {
              ...playbackContextRef.current,
              orderedList: [...listToPlay]
            };
          }
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
    }, makeSession(startIndex));
};
