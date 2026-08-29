import { useRef } from 'react';

export const useMainAppRuntimeRefs = ({ playbackMode, playbackSequence, playbackDelays, vocabularyPlayOrder, activeVocabularyOrder }) => {
  const stopSignalRef = useRef(false);
  const pauseStateRef = useRef(false);
  const playbackSessionRef = useRef(0);
  const playbackResolveRef = useRef(null);
  const batchStopSignalRef = useRef(false); 
  const currentAudioObjRef = useRef(null);
  const generationAbortControllerRef = useRef(null);
  const edgeTestAbortControllerRef = useRef(null);
  const playbackModeRef = useRef(playbackMode); 
  const playbackSequenceRef = useRef(playbackSequence);
  const playbackDelaysRef = useRef(playbackDelays);
  const vocabularyPlayOrderRef = useRef(vocabularyPlayOrder);
  const activeVocabularyOrderRef = useRef(activeVocabularyOrder);

  // FIX: REFERENCE FOR CURRENT UTTERANCE TO PREVENT GARBAGE COLLECTION
  const currentUtteranceRef = useRef(null);

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
    generationAbortControllerRef, edgeTestAbortControllerRef, playbackModeRef, playbackSequenceRef, playbackDelaysRef, vocabularyPlayOrderRef,
    activeVocabularyOrderRef, currentUtteranceRef, synth, folderInputRef, csvInputRef, sourceInputRef,
    fullPackInputRef, sourceUploadKeyRef, logContainerRef, debugButtonRef, debugPanelRef, batchPanelRef,
    batchButtonRef, textareaRef, newItemTextareaRef,
  };
};
