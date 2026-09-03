import { useRef } from 'react';

export const useMainAppRuntimeRefs = ({ playbackMode, playbackSequence, playbackDelays, vocabularyPlayOrder, activeVocabularyOrder, rate }) => {
  const stopSignalRef = useRef(false);
  const pauseStateRef = useRef(false);
  const playbackSessionRef = useRef(0);
  const playbackResolveRef = useRef(null);
  const batchStopSignalRef = useRef(false); 
  const currentAudioObjRef = useRef(null);
  const generationAbortControllerRef = useRef(null);
  // Session-only metadata for generated audio replacements. The playback maps stay URL-only.
  const generatedAudioMetaRef = useRef({});
  const edgeTestAbortControllerRef = useRef(null);
  const playbackModeRef = useRef(playbackMode);
  const rateRef = useRef(rate);
  rateRef.current = rate; 
  const playbackSequenceRef = useRef(playbackSequence);
  const playbackDelaysRef = useRef(playbackDelays);
  const vocabularyPlayOrderRef = useRef(vocabularyPlayOrder);
  const activeVocabularyOrderRef = useRef(activeVocabularyOrder);
  // D2: session-owned playback list/context. This must remain stable when the visible UI list changes.
  const playbackContextRef = useRef(null);

  // FIX: REFERENCE FOR CURRENT UTTERANCE TO PREVENT GARBAGE COLLECTION
  const currentUtteranceRef = useRef(null);
  // Browser TTS logical replay state used only when Android MediaSession pause
  // destroys the native SpeechSynthesis utterance.
  const ttsReplayRef = useRef(null);

  const synth = window.speechSynthesis;
  const folderInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const sourceInputRef = useRef(null);
  const fullPackInputRef = useRef(null);
  const sourceUploadKeyRef = useRef('main');
  const logContainerRef = useRef(null);
  const debugButtonRef = useRef(null);
  const debugPanelRef = useRef(null);
  const batchPanelRef = useRef(null);
  const batchButtonRef = useRef(null);
  const textareaRef = useRef(null); 
  const newItemTextareaRef = useRef(null); 

  return {
    stopSignalRef, pauseStateRef, playbackSessionRef, playbackResolveRef, batchStopSignalRef, currentAudioObjRef,
    generationAbortControllerRef, generatedAudioMetaRef, edgeTestAbortControllerRef, playbackModeRef, rateRef, playbackSequenceRef, playbackDelaysRef, vocabularyPlayOrderRef,
    activeVocabularyOrderRef, playbackContextRef, currentUtteranceRef, ttsReplayRef, synth, folderInputRef, csvInputRef, sourceInputRef,
    fullPackInputRef, sourceUploadKeyRef, logContainerRef, debugButtonRef, debugPanelRef, batchPanelRef,
    batchButtonRef, textareaRef, newItemTextareaRef,
  };
};
