import { V511_DEFAULT_DELAYS, V511_PLAYBACK_PRESETS } from '../../constants/playbackConstants';
import { createDefaultPlaybackSequence, createEmptyVocabularyOrder, createPlaybackPresetSequence, normalizePlaybackDelays } from '../../utils/playbackSequenceUtils';
import { movePlaybackSequencePartState, setPlaybackDelayState, setPlaybackSequencePartRepeatState, shufflePlaybackSequenceState, togglePlaybackSequencePartState } from '../../domain/playback/playbackSequenceDomain';

export const executeTogglePlaybackSequencePart = ({ key, setPlaybackSequence }) => {
    setPlaybackSequence(prev => togglePlaybackSequencePartState(prev, key));
};

export const executeSetPlaybackSequencePartRepeat = ({ key, repeat, setPlaybackSequence }) => {
    setPlaybackSequence(prev => setPlaybackSequencePartRepeatState(prev, key, repeat));
};

export const executeSetPlaybackDelay = ({ field, value, setPlaybackDelays }) => {
    setPlaybackDelays(prev => setPlaybackDelayState(prev, field, value));
};

export const executeResetPlaybackDelays = ({ setPlaybackDelays }) => setPlaybackDelays({ ...V511_DEFAULT_DELAYS });

export const executeChangeVocabularyPlayOrder = ({
  nextMode, vocabularyPlayOrder, isPlaying, forceStopAll, activeVocabularyOrderRef,
  setActiveVocabularyOrder, setVocabularyPlayOrder, addLog
}) => {
    const safeMode = nextMode === 'shuffle' ? 'shuffle' : 'sequential';
    if (safeMode === vocabularyPlayOrder) return;
    if (isPlaying) forceStopAll();
    const emptyOrder = createEmptyVocabularyOrder();
    activeVocabularyOrderRef.current = emptyOrder;
    setActiveVocabularyOrder(emptyOrder);
    setVocabularyPlayOrder(safeMode);
    addLog('Playback', `Vocabulary order: ${safeMode === 'shuffle' ? 'Shuffle (no-repeat round)' : 'Sequential'}.`);
};

export const executeReshuffleVocabularyPlayback = ({
  isPlaying, vocabularyPlayOrderRef, playingContext, mode, tableViewMode,
  getBasePlaybackListForContext, playingIndex, currentIndex, resolveVocabularyPlaybackList, addLog
}) => {
    if (isPlaying || vocabularyPlayOrderRef.current !== 'shuffle') return;
    const context = playingContext || (mode === 'table' ? tableViewMode : 'text');
    const baseList = getBasePlaybackListForContext(context);
    if (!baseList.length) return;
    const avoidId = playingIndex ?? currentIndex ?? null;
    resolveVocabularyPlaybackList(baseList, context, {
      forceReshuffle: true,
      avoidFirstId: avoidId
    });
    addLog('Playback', `Vocabulary order reshuffled for ${baseList.length} item(s).`);
};

export const executeMovePlaybackSequencePart = ({ key, direction, setPlaybackSequence }) => {
    setPlaybackSequence(prev => movePlaybackSequencePartState(prev, key, direction));
};

export const executeShufflePlaybackSequence = ({ setPlaybackSequence }) => {
    setPlaybackSequence(prev => shufflePlaybackSequenceState(prev));
};

export const executeResetPlaybackSequence = ({ setPlaybackSequence }) => setPlaybackSequence(createDefaultPlaybackSequence());

export const executeApplyPlaybackPreset = ({ presetKey, setPlaybackSequence, setPlaybackDelays, addLog }) => {
    const preset = V511_PLAYBACK_PRESETS[presetKey];
    if (!preset) return;
    setPlaybackSequence(createPlaybackPresetSequence(preset));
    setPlaybackDelays(normalizePlaybackDelays(preset.delays));
    addLog('Playback', `Preset applied: ${preset.label}.`);
};

export const resolvePlaybackSequencePartAvailable = ({ key, advancedDatasetStats }) => {
    const expMatch = key.match(/^exp([1-5])_/);
    if (!expMatch) return true;
    return Boolean(advancedDatasetStats.expCounts[Number(expMatch[1])]);
};
