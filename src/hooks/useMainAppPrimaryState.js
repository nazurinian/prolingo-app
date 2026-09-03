import { useRef, useState } from 'react';
import { DEFAULT_ROW_HEIGHT_PC } from '../constants/datasetConstants';
import { initialEdgeVoices } from '../constants/voiceConstants';
import { createEmptyManualForm } from '../utils/csvUtils';
import { createEmptySourcePack } from '../utils/multiSourceUtils';
import { createEmptyVocabularyOrder } from '../utils/playbackSequenceUtils';
import { loadControlSectionPreference, loadPlaybackDelaysPreference, loadPlaybackSequencePreference, loadVocabularyPlayOrderPreference } from '../services/persistence/preferencePersistenceService';
import { loadTextIdentityState } from '../services/persistence/textIdentityPersistenceService';

export const useMainAppPrimaryState = () => {
  const [mode, setMode] = useState('table'); 
  const [tableViewMode, setTableViewMode] = useState('master'); 
  const [studyQueue, setStudyQueue] = useState([]); 
  const [rangeInput, setRangeInput] = useState("");

  const [tableContent, setTableContent] = useState("");
  const [textIdentityState, setTextIdentityState] = useState(() => loadTextIdentityState());
  const [textContent, setTextContent] = useState(() => textIdentityState.rawContent);
  const [playlist, setPlaylist] = useState([]); 
  const [newTextItem, setNewTextItem] = useState("");
  // v5.8.3: last CSV snapshot that has been imported or explicitly saved to disk.
  const [csvBaselineContent, setCsvBaselineContent] = useState("");
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [masterSearch, setMasterSearch] = useState("");
  const [masterFilter, setMasterFilter] = useState('all');
  const [isChangeReviewOpen, setIsChangeReviewOpen] = useState(false);
  const [isRevertAllConfirmOpen, setIsRevertAllConfirmOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [lastDraftAutoSaveAt, setLastDraftAutoSaveAt] = useState(null);
  // v5.10: relational source baselines. Working data stays unified in tableContent.
  const [sourcePack, setSourcePack] = useState(createEmptySourcePack);
  const [sourceUploadKey, setSourceUploadKey] = useState('main');

  // v5.8 Manual Vocabulary Manager
  const [isManualEditorOpen, setIsManualEditorOpen] = useState(false);
  const [manualEditingId, setManualEditingId] = useState(null);
  const [manualForm, setManualForm] = useState(createEmptyManualForm);
  const [manualAdvancedOpen, setManualAdvancedOpen] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(null);
  const [savedIndices, setSavedIndices] = useState({ table: null, text: null });

  // -- NEW: SCROLL POSITION PERSISTENCE --
  const viewScrollPosRef = useRef({ master: 0, study: 0, text: 0 });
  // -- NEW: Pending Scroll Restoration Ref --
  const pendingScrollRestoration = useRef(null);

  const [masterIndex, setMasterIndex] = useState(null);
  const [studyIndex, setStudyIndex] = useState(null);

  const [playingIndex, setPlayingIndex] = useState(null);
  const [playingContext, setPlayingContext] = useState(null);

  const tableViewModeRef = useRef(tableViewMode);
  const justSwitchedTab = useRef(false);
  const prevCurrentIndex = useRef(currentIndex);

  const [savedDecks, setSavedDecks] = useState({});
  const [selectedDeckId, setSelectedDeckId] = useState(""); 
  const [currentDeckName, setCurrentDeckName] = useState("Untitled Sheet");
  // v5.8.1: sequence/audio slot high-water mark. NEVER auto-decreases on row deletion.
  const [sequenceHighWater, setSequenceHighWater] = useState(0);
  const [manualIdHighWater, setManualIdHighWater] = useState(0);
  const [importedRowCount, setImportedRowCount] = useState(0);

  const [voices, setVoices] = useState([]); 
  const [indonesianVoices, setIndonesianVoices] = useState([]); 
  const [selectedVoice, setSelectedVoice] = useState(null); 
  const [selectedIndonesianVoice, setSelectedIndonesianVoice] = useState(null); 

  const selectedVoiceRef = useRef(null);
  const selectedIndonesianVoiceRef = useRef(null);

  const [rate, setRate] = useState(1);
  // eslint-disable-next-line no-unused-vars
  const [pitch, setPitch] = useState(1); 

  // v5.11.6: one ordered list controls part order, enabled state, and per-part repeat count.
  const [playbackSequence, setPlaybackSequence] = useState(loadPlaybackSequencePreference);
  // v5.11.6: configurable delay between sequence parts and between repeats.
  // Defaults preserve v5.11.2 behaviour (300 ms transition gap).
  const [playbackDelays, setPlaybackDelays] = useState(loadPlaybackDelaysPreference);
  // v5.11.6: item order is independent from the per-item playback sequence.
  const [vocabularyPlayOrder, setVocabularyPlayOrder] = useState(loadVocabularyPlayOrderPreference);
  const [activeVocabularyOrder, setActiveVocabularyOrder] = useState(createEmptyVocabularyOrder);
  const [expandedAdvancedId, setExpandedAdvancedId] = useState(null);

  const [preferLocalAudio, setPreferLocalAudio] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speakingPart, setSpeakingPart] = useState(null); 
  const [playbackMode, setPlaybackMode] = useState('once'); 
  const [independentPlayingId, setIndependentPlayingId] = useState(null); 

  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [lockedStates, setLockedStates] = useState({ table: false, text: true });

  // FIX: Initialize sidebar state based on window width to prevent glitch/flash on mobile load
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true); 
  // v5.11.6: one shared control category for desktop sidebar + mobile Tools.
  const [sidebarSection, setSidebarSection] = useState(loadControlSectionPreference);
  const [showLogs, setShowLogs] = useState(false); 

  const [mobileTab, setMobileTab] = useState('player'); 
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  // NEW: Batch Config includes doMeaning
  const [batchConfig, setBatchConfig] = useState({ start: 1, end: 10, doWord: true, doWordTranslation: false, doSentence: true, doMeaning: false, expEn: [false, false, false, false, false], expIdn: [false, false, false, false, false] });
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState(""); 
  const [isBatchStopping, setIsBatchStopping] = useState(false); 

  const [isMemoryMode, setIsMemoryMode] = useState(false);
  const [revealedCells, setRevealedCells] = useState({}); 
  const [memorySettings, setMemorySettings] = useState({ word: true, sentence: true, meaning: true, expressions: true }); 

  const [activeMenuId, setActiveMenuId] = useState(null);

  const isLocked = lockedStates[mode];

  // E: transient BYOK input only; the plaintext key is never persisted client-side.
  const [userApiKey, setUserApiKey] = useState("");
  const [geminiOwnerState, setGeminiOwnerState] = useState({ checked: false, configured: false, unlocked: false, byokAvailable: false, byokRegistered: false });
  const [aiVoiceName, setAiVoiceName] = useState("Kore");
  const [aiLoadingId, setAiLoadingId] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]); 

  // --- NEW: GENERATOR ENGINE STATES ---
  const [generatorEngine, setGeneratorEngine] = useState('edge'); // 'gemini' | 'edge'

  // EDGE VOICE STATES (Expanded)
  // eslint-disable-next-line no-unused-vars
  const [edgeVoices, setEdgeVoices] = useState(initialEdgeVoices); 
  const [edgeVoice, setEdgeVoice] = useState("en-GB-LibbyNeural"); // Preferred Edge generator UK default
  const [edgeIndonesianVoice, setEdgeIndonesianVoice] = useState("su-ID-TutiNeural"); // Preferred Edge generator Indonesian-region default

  const [edgeRate, setEdgeRate] = useState(0); // -50 to +50 (Percent)
  const [edgePitch, setEdgePitch] = useState(0); // -20 to +20 (Hz)
  const [edgeHealth, setEdgeHealth] = useState({ status: 'idle', message: 'Belum dites' });

  const [localAudioMapTable, setLocalAudioMapTable] = useState({}); 
  const [localAudioMapText, setLocalAudioMapText] = useState({});
  const [audioStatusTable, setAudioStatusTable] = useState('idle');
  const [audioStatusText, setAudioStatusText] = useState('idle');

  const listContainerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); 

  const [rowHeights, setRowHeights] = useState({ 
      table: DEFAULT_ROW_HEIGHT_PC, 
      text: 70 
  });

  const [isMobile, setIsMobile] = useState(false);
  const [showAppBar, setShowAppBar] = useState(true);
  const lastScrollY = useRef(0);

  // FIX: Ref to track when we are performing a programmatic auto-scroll
  const isAutoScrolling = useRef(false);

  const isSystemBusy = isBatchDownloading || aiLoadingId !== null;

  // FIX: Silent Audio Ref (Anchor) - NEW GENERATION STRATEGY
  const silentAudioRef = useRef(null);
  const silentWavUrlRef = useRef(null);

  return {
    mode, setMode, tableViewMode, setTableViewMode, studyQueue, setStudyQueue,
    rangeInput, setRangeInput, tableContent, setTableContent, textContent, setTextContent, textIdentityState, setTextIdentityState,
    playlist, setPlaylist, newTextItem, setNewTextItem, csvBaselineContent, setCsvBaselineContent,
    pendingDeleteItem, setPendingDeleteItem, masterSearch, setMasterSearch, masterFilter, setMasterFilter,
    isChangeReviewOpen, setIsChangeReviewOpen, isRevertAllConfirmOpen, setIsRevertAllConfirmOpen, undoStack, setUndoStack,
    lastDraftAutoSaveAt, setLastDraftAutoSaveAt, sourcePack, setSourcePack, sourceUploadKey, setSourceUploadKey,
    isManualEditorOpen, setIsManualEditorOpen, manualEditingId, setManualEditingId, manualForm, setManualForm,
    manualAdvancedOpen, setManualAdvancedOpen, currentIndex, setCurrentIndex, savedIndices, setSavedIndices,
    viewScrollPosRef, pendingScrollRestoration, masterIndex, setMasterIndex, studyIndex, setStudyIndex,
    playingIndex, setPlayingIndex, playingContext, setPlayingContext, tableViewModeRef, justSwitchedTab,
    prevCurrentIndex, savedDecks, setSavedDecks, selectedDeckId, setSelectedDeckId, currentDeckName,
    setCurrentDeckName, sequenceHighWater, setSequenceHighWater, manualIdHighWater, setManualIdHighWater, importedRowCount,
    setImportedRowCount, voices, setVoices, indonesianVoices, setIndonesianVoices, selectedVoice,
    setSelectedVoice, selectedIndonesianVoice, setSelectedIndonesianVoice, selectedVoiceRef, selectedIndonesianVoiceRef, rate,
    setRate, pitch, setPitch, playbackSequence, setPlaybackSequence, playbackDelays,
    setPlaybackDelays, vocabularyPlayOrder, setVocabularyPlayOrder, activeVocabularyOrder, setActiveVocabularyOrder, expandedAdvancedId,
    setExpandedAdvancedId, preferLocalAudio, setPreferLocalAudio, isPlaying, setIsPlaying, isPaused,
    setIsPaused, speakingPart, setSpeakingPart, playbackMode, setPlaybackMode, independentPlayingId,
    setIndependentPlayingId, isClearDialogOpen, setIsClearDialogOpen, isDeleteDialogOpen, setIsDeleteDialogOpen, lockedStates,
    setLockedStates, isSidebarOpen, setIsSidebarOpen, sidebarSection, setSidebarSection, showLogs,
    setShowLogs, mobileTab, setMobileTab, isBatchOpen, setIsBatchOpen, batchConfig,
    setBatchConfig, isBatchDownloading, setIsBatchDownloading, batchStatusText, setBatchStatusText, isBatchStopping,
    setIsBatchStopping, isMemoryMode, setIsMemoryMode, revealedCells, setRevealedCells, memorySettings,
    setMemorySettings, activeMenuId, setActiveMenuId, isLocked, userApiKey, setUserApiKey,
    geminiOwnerState, setGeminiOwnerState,
    aiVoiceName, setAiVoiceName, aiLoadingId, setAiLoadingId, systemLogs, setSystemLogs,
    generatorEngine, setGeneratorEngine, edgeVoices, setEdgeVoices, edgeVoice, setEdgeVoice,
    edgeIndonesianVoice, setEdgeIndonesianVoice, edgeRate, setEdgeRate, edgePitch, setEdgePitch,
    edgeHealth, setEdgeHealth, localAudioMapTable, setLocalAudioMapTable, localAudioMapText, setLocalAudioMapText,
    audioStatusTable, setAudioStatusTable, audioStatusText, setAudioStatusText, listContainerRef, scrollTop,
    setScrollTop, containerHeight, setContainerHeight, rowHeights, setRowHeights, isMobile,
    setIsMobile, showAppBar, setShowAppBar, lastScrollY, isAutoScrolling, isSystemBusy,
    silentAudioRef, silentWavUrlRef,
  };
};
