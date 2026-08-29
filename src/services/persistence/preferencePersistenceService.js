import { V5116_CONTROL_SECTION_KEYS, V511_DEFAULT_DELAYS } from '../../constants/playbackConstants';
import { createDefaultPlaybackSequence, createEmptyVocabularyOrder, normalizePlaybackDelays, normalizePlaybackSequence } from '../../utils/playbackSequenceUtils';

export const loadPlaybackSequencePreference = () => {
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('prolingo_playback_sequence_v511') : null;
    return normalizePlaybackSequence(saved ? JSON.parse(saved) : null);
  } catch {
    return createDefaultPlaybackSequence();
  }
};

export const loadPlaybackDelaysPreference = () => {
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('prolingo_playback_delays_v511') : null;
    return normalizePlaybackDelays(saved ? JSON.parse(saved) : null);
  } catch {
    return { ...V511_DEFAULT_DELAYS };
  }
};

export const loadVocabularyPlayOrderPreference = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('prolingo_vocabulary_play_order_v511') === 'shuffle'
      ? 'shuffle'
      : 'sequential';
  } catch {
    return 'sequential';
  }
};

export const loadControlSectionPreference = () => {
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('prolingo_control_section_v5116') : null;
    return V5116_CONTROL_SECTION_KEYS.has(saved) ? saved : 'player';
  } catch {
    return 'player';
  }
};

export const executePlaybackSequencePersistenceEffect = ({ playbackSequence, playbackSequenceRef }) => {
  playbackSequenceRef.current = playbackSequence;
  try {
    window.localStorage.setItem('prolingo_playback_sequence_v511', JSON.stringify(playbackSequence));
  } catch (error) {
    console.warn('Unable to persist playback sequence:', error);
  }
};

export const executePlaybackDelaysPersistenceEffect = ({ playbackDelays, playbackDelaysRef }) => {
  playbackDelaysRef.current = normalizePlaybackDelays(playbackDelays);
  try {
    window.localStorage.setItem('prolingo_playback_delays_v511', JSON.stringify(playbackDelaysRef.current));
  } catch (error) {
    console.warn('Unable to persist playback delays:', error);
  }
};

export const executeVocabularyPlayOrderPersistenceEffect = ({
  vocabularyPlayOrder,
  vocabularyPlayOrderRef,
  activeVocabularyOrderRef,
  setActiveVocabularyOrder
}) => {
  vocabularyPlayOrderRef.current = vocabularyPlayOrder;
  try {
    window.localStorage.setItem('prolingo_vocabulary_play_order_v511', vocabularyPlayOrder);
  } catch (error) {
    console.warn('Unable to persist vocabulary play order:', error);
  }
  if (vocabularyPlayOrder === 'sequential') {
    const emptyOrder = createEmptyVocabularyOrder();
    activeVocabularyOrderRef.current = emptyOrder;
    setActiveVocabularyOrder(emptyOrder);
  }
};

export const executeControlSectionPersistenceEffect = (sidebarSection) => {
  try {
    window.localStorage.setItem('prolingo_control_section_v5116', sidebarSection);
  } catch (error) {
    console.warn('Unable to persist control section:', error);
  }
};
