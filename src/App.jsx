/* ProLingo - Modular Application Shell */
/* eslint-disable no-control-regex */
// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useRef, memo, useMemo, useCallback, useLayoutEffect } from 'react';
import { useMainAppPrimaryState } from './hooks/useMainAppPrimaryState';
import { useMainAppRuntimeRefs } from './hooks/useMainAppRuntimeRefs';
import { useMasteryProgressState } from './hooks/useMasteryProgressState';
import { useMasteryFilterState } from './hooks/useMasteryFilterState';
import { useStudyTrackingState } from './hooks/useStudyTrackingState';
import { 
  Play, Pause, RotateCcw, Volume2, Settings, Trash2, List, Mic, Globe, 
  CheckCircle, Save, Upload, Table, SkipBack, SkipForward, X, 
  Wand2, Download, Loader2, FolderOpen, Database, Shuffle, Repeat, Repeat1, FileText,
  ToggleLeft, ToggleRight, AlertCircle, PanelLeftClose, PanelLeftOpen, Lock, Unlock,
  Hash, Music, Bot, AlertTriangle, Terminal, XCircle, ChevronDown, Layers, Smartphone,
  Monitor, Cpu, CheckSquare, Square, ChevronRight, MoreHorizontal, ArrowRightToLine,
  Languages, Eye, EyeOff, Brain, BookOpen, Plus, Send, ListPlus, MinusCircle, Eraser,
  ChevronsUp, MoreVertical, LayoutTemplate, ArrowRight, Server, CloudLightning,
  Edit3, FileDown, Search, History
} from 'lucide-react';
import { GroupedVoiceSelect } from './components/common/GroupedVoiceSelect';
import { HighlightedText } from './components/common/HighlightedText';
import { LandingPage } from './components/landing/LandingPage';
import Header from './components/layout/Header';
import BottomPlayerBar from './components/layout/BottomPlayerBar';
import MobileTools from './components/layout/MobileTools';
import SidebarShell from './components/layout/SidebarShell';
import SidebarTopControls from './components/layout/SidebarTopControls';
import { renderMainAppShellView } from './components/layout/MainAppShellView';
import { renderBatchPopupView, renderControlSectionTabsView, renderMasterDataToolbarView, renderMobileToolsView, renderWorkspaceTabsView } from './components/layout/MainAppAuxiliaryViews';
import PlayerAudioSourceControls from './components/controls/PlayerAudioSourceControls';
import PlayerBrowserTtsControls from './components/controls/PlayerBrowserTtsControls';
import DesktopLearnControls from './components/controls/DesktopLearnControls';
import { renderPlaybackSequenceBuilderView } from './components/controls/PlaybackSequenceBuilderView';
import DesktopDataActions from './components/controls/DesktopDataActions';
import DesktopDataWorkspace from './components/controls/DesktopDataWorkspace';
import DesktopSystemControls from './components/controls/DesktopSystemControls';
import WorkspaceTabs from './components/table/WorkspaceTabs';
import MasterDataToolbar from './components/table/MasterDataToolbar';
import BatchPopup from './components/table/BatchPopup';
import ChangeReviewModal from './components/modals/ChangeReviewModal';
import ManualEditorModal from './components/modals/ManualEditorModal';
import { RevertAllConfirmModal, DeleteVocabularyModal, ClearViewModal, DeleteDeckModal } from './components/modals/ConfirmDialog';
import { MemoizedRow } from './components/table/MemoizedRow';
import { MemoizedTextRow } from './components/table/MemoizedTextRow';
import { TextHydrationGate } from './components/text/TextHydrationGate.jsx';
import { TextStructuredPlayer } from './components/text/TextStructuredPlayer.jsx';
import { renderPlaylistViewport } from './components/table/PlaylistViewport';
import { DEFAULT_ROW_HEIGHT_MOBILE, DEFAULT_ROW_HEIGHT_PC, OVERSCAN, V510_SOURCE_KEYS, V510_SOURCE_LABELS, V58_CANONICAL_HEADERS } from './constants/datasetConstants';
import { V5116_CONTROL_SECTIONS, V5116_CONTROL_SECTION_KEYS, V511_DEFAULT_DELAYS, V511_DELAY_OPTIONS, V511_PLAYBACK_PARTS, V511_PLAYBACK_PRESETS } from './constants/playbackConstants';
import { initialEdgeVoices } from './constants/voiceConstants';
import { downloadTextFile, encodeWAV, formatVoiceLabel, getAdvancedContentCount, getAdvancedExpressionPairs, getAudioFilenameIdentity, getItemPartText, getRecordAudioNo, getStableAudioIdentity, getVocabIdentity, groupVoicesByRegion, hasAdvancedContent, isIndonesianAudioPart, sanitizeFilename, writeString } from './utils/audioUtils';
import { canonicalizeTableContent, createEmptyManualForm, csvEscape, detectDelimiter, getMaxAssignedNoFromRecords, getMaxManualIdFromRecords, getNextManualVocabId, getRecordSignature, getTableChangeSummary, normalizeHeaderKey, normalizeVocabId, parseDelimitedText, parseTableRecords, serializeTableRecords, validateTableRecords } from './utils/csvUtils';
import { createEmptySourcePack, detectV510SourceKey, getDuplicateSourceIds, getSourceChangeSummary, getSourceDiagnostics, mergeSourcePackBaselines, normalizeDeckEntry, normalizeSourcePack, parseLayerSourceRecords, readV510FileText, serializeLayerSourceRecords, serializeMainSourceRecords, serializeSourceFromMerged } from './utils/multiSourceUtils';
import { createDefaultPlaybackSequence, createEmptyVocabularyOrder, createPlaybackPresetSequence, formatPlaybackDelay, getPlaybackItemId, getPlaybackListSignature, normalizePlaybackDelays, normalizePlaybackSequence, playbackConfigSignature, reorderPlaybackListByIds } from './utils/playbackSequenceUtils';
import { movePlaybackSequencePartState, setPlaybackDelayState, setPlaybackSequencePartRepeatState, shufflePlaybackSequenceState, togglePlaybackSequencePartState } from './domain/playback/playbackSequenceDomain';
import { resolveVocabularyPlaybackOrderState } from './domain/playback/vocabularyPlaybackOrderDomain';
import { resolvePlaybackAdvanceState, resolvePlaybackRequestedId, resolvePlaybackSessionContextState, resolvePlaybackStartIndex } from './domain/playback/playbackSessionDomain';
import { resolvePlaybackNavigationReferenceState, resolvePlaybackNavigationTargetState } from './domain/playback/playbackNavigationDomain';
import { resolveGlobalPlayControlAction, resolveGlobalPlayFreshStartState, resolveGlobalPlayResumeItem, resolveGlobalPlayTargetContext, shouldAttemptGlobalPlayResume } from './domain/playback/globalPlaybackControlDomain';
import { resolveIndependentPlaybackContext, resolveIndependentPlaybackControlAction, resolveNextPlaybackMode, shouldPausePlayback, shouldResumePlayback } from './domain/playback/playbackControlDomain';
import { resolveSingleChangeRevertState } from './domain/dataset/changeRevertDomain';
import { resolveStructuredDeleteRecords, resolveStructuredDeleteStudyQueue, shouldClearStructuredDeleteReference } from './domain/dataset/structuredDeleteDomain';
import { filterStudyQueueByValidIds, resolveSnapshotValidIds } from './domain/dataset/datasetSnapshotRestoreDomain';
import { resolveManualVocabularySaveState } from './domain/dataset/manualVocabularySaveDomain';
import { resolveCsvImportState } from './domain/dataset/csvImportStateDomain';
import { resolveCsvSaveMetadata } from './domain/dataset/csvSaveMetadataDomain';
import { resolveDraftCacheMetadata } from './domain/dataset/draftCacheMetadataDomain';
import { resolveExportSourceMetadata, resolveSavedSourceMetadata } from './domain/dataset/exportSourceMetadataDomain';
import { resolveFullPackImportState, resolveSingleSourceImportState } from './domain/dataset/sourceImportStateDomain';
import { resolveManualAddForm, resolveManualAddNextNo, resolveManualEditAdvancedOpen, resolveManualEditForm } from './domain/dataset/manualEditorStateDomain';
import { resolveActivePlaybackList, resolveAdvancedDatasetStats, resolveCurrentPlayerList, resolveMasterFilteredPlaylist, resolveSourceChangeSummaries } from './domain/view/mainAppDerivedStateDomain';
import { resolveMasteryProgressStatistics } from './domain/progress/masteryStatisticsDomain';
import { resolveStudyActivityStatistics } from './domain/progress/studyTrackingDomain.js';
import { resolveAudioFallbackVoice, resolveLocalAudioUrl } from './domain/audio/audioSourceRoutingDomain';
import { resolveBrowserTtsVoiceState } from './domain/audio/browserTtsVoiceDecisionDomain';
import { resolveGeneratedAudioMapKey, shouldIgnoreLocalAudioFailure, shouldResolveLocalAudioFailure } from './domain/audio/audioTtsCompletionFailureDomain';
import { executeAudioGenerationService, executeEdgeBackendHealthService, executeGeminiByokClearService, executeGeminiByokRegisterService, executeGeminiOwnerLockService, executeGeminiOwnerStatusService, executeGeminiOwnerUnlockService } from './services/audio/audioTtsSideEffectService';
import { executeAudioBatchDownloadService } from './services/audio/audioBatchDownloadService';
import { executeAudioFolderSelectService, executeRememberedAudioFolderOpenService, executeRememberedAudioFolderRestoreService } from './services/audio/audioFolderLifecycleService';
import { executeAudioSourcePlaybackService, executeBrowserTtsPlaybackService } from './services/audio/audioPlaybackSideEffectService';
import { executeBrowserTtsVoiceLifecycleEffect, executeSilentAudioAnchorEffect } from './services/audio/audioRuntimeLifecycleService';
import { executeGlobalPlaybackSessionService } from './services/playback/globalPlaybackSessionService';
import { executeMediaSessionLifecycleService } from './services/playback/mediaSessionLifecycleService';
import { executeForceStopPlaybackService, executeGlobalPlayInteraction, executeIndependentPlaybackInteraction, executeManualRowPlaybackInteraction, executeSmartPlaybackNavigation } from './services/playback/playbackInteractionService';
import { executeMobileTabSwitch, executeModeSwitch, executeTableViewTabSwitch } from './services/navigation/viewNavigationService';
import { executeActiveRowAutoFollow, executeMobileHeaderScroll, executePendingScrollRestoration } from './services/navigation/scrollViewportService';
import { executeActiveRowAutoFollowEffect, executeBodyScrollLockEffect, executeBodyThemeBackgroundEffect, executeLogAutoScrollEffect, executeMobileHeaderScrollListenerEffect, executeMobileWindowScrollEffect, executeResponsiveViewportLifecycleEffect, executeSidebarHeaderVisibilityEffect, executeUnsavedCsvBeforeUnloadEffect } from './services/navigation/appWindowLifecycleService';
import { executeApplyChangeRevert, executeBatchRangeBlur, executeConfirmDeleteStructuredItem, executeRevertAllChanges, executeSaveManualVocabulary, executeStudyRangeAdd, executeToggleCellReveal, executeUndoLastDataChange } from './services/dataset/datasetInteractionService';
import { executePlaylistContentSyncEffect, executeResetFullState, executeResetTextState, executeSystemLogAppend } from './services/app/mainAppStateLifecycleService';
import { executeAddTextItem, executeClearStudyQueue, executeCloseManualEditor, executeDeleteStructuredItemPrompt, executeDeleteTextItem, executeInsertTab, executeMenuToggle, executeOpenManualAdd, executeOpenManualEdit, executeToggleStudyItem } from './services/dataset/manualTextStudyInteractionService';
import { executePausePlayback, executeResumePlayback, executeSafePlayTransition, executeSettlePlaybackPromise, executeWaitPlaybackDelay, executeWaitWhilePaused } from './services/playback/playbackRuntimeControlService';
import { executeApplyPlaybackPreset, executeChangeVocabularyPlayOrder, executeMovePlaybackSequencePart, executeResetPlaybackDelays, executeResetPlaybackSequence, executeReshuffleVocabularyPlayback, executeSetPlaybackDelay, executeSetPlaybackSequencePartRepeat, executeShufflePlaybackSequence, executeTogglePlaybackSequencePart, resolvePlaybackSequencePartAvailable } from './services/playback/playbackConfigurationService';
import { executeCsvImportFileService, executeFullPackImportService, executeSourceLayerImportService } from './services/persistence/datasetImportFileService';
import { executeExportMergedDatasetService, executeExportTableCsvService, executeRemoveSourceLayerService, executeSaveUpdatedCsvService, executeSaveUpdatedSourceService } from './services/persistence/datasetPersistenceService';
import { executeDeleteDeckCacheService, executeDraftAutosaveEffect, executeLoadDeckCacheService, executeSaveDeckCacheService, executeStartupRestoreEffect } from './services/persistence/deckCacheLifecycleService';
import { executeControlSectionPersistenceEffect, executePlaybackDelaysPersistenceEffect, executePlaybackSequencePersistenceEffect, executeVocabularyPlayOrderPersistenceEffect, loadControlSectionPreference, loadPlaybackDelaysPreference, loadPlaybackSequencePreference, loadVocabularyPlayOrderPreference } from './services/persistence/preferencePersistenceService';
import { executeCycleMasteryState } from './services/progress/masteryInteractionService';
import { executeRecordStudyActivity } from './services/progress/studyTrackingInteractionService.js';
import { reconcileTextIdentityState } from './domain/text/textIdentityDomain';
import { resolveTextLibraryCatalog, resolveTextLibraryDocumentTree } from './domain/text/textLibraryDomain.js';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT, TEXT_STRUCTURED_PLAYBACK_SCOPES, resolveStructuredTextAdjacentSegment, resolveStructuredTextPlaybackList } from './domain/text/textStructuredPlaybackDomain.js';
import { hasStructuredTextPlayableChannel } from './domain/text/textStructuredPlaybackPreferenceDomain.js';
import { resolveTextStructuredBrowserVoiceState, resolveTextStructuredVoicePreferencePatch } from './domain/text/textStructuredVoiceDomain.js';
import { executeTextLibraryBootstrapEffect, executeTextLibraryCompatibilityPersistenceEffect } from './services/persistence/textLibraryLifecycleService';
import { executeTextLibraryCreateCollection, executeTextLibraryCreateDocument, executeTextLibraryRenameDocument, executeTextLibrarySelectDocument, executeTextLibraryStructuredCommand } from './services/persistence/textLibraryWorkspaceService.js';
import { executeStructuredTextPlaybackSessionService } from './services/playback/textStructuredPlaybackSessionService.js';
import { executeTextStructuredPreferencePersistenceEffect } from './services/persistence/textStructuredPreferenceService.js';


// --- MAIN COMPONENT ---
const MainApp = ({ goHome, theme, setTheme }) => {
  const {
    mode, setMode, tableViewMode, setTableViewMode, studyQueue, setStudyQueue,
    rangeInput, setRangeInput, tableContent, setTableContent, textContent, setTextContent, textIdentityState, setTextIdentityState,
    legacyTextBootstrapState, activeTextDocumentId, setActiveTextDocumentId, textLibrarySnapshot, setTextLibrarySnapshot,
    textDatabaseStatus, setTextDatabaseStatus, textDatabaseError, setTextDatabaseError,
    textStructuredPreferences, setTextStructuredPreferences, playlist, setPlaylist, newTextItem, setNewTextItem, csvBaselineContent, setCsvBaselineContent,
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
  } = useMainAppPrimaryState();

  const { masteryByVocabId, setMasteryByVocabId } = useMasteryProgressState();
  const { masteryFilter, setMasteryFilter } = useMasteryFilterState();
  const { activityByVocabId, setActivityByVocabId } = useStudyTrackingState();
  // UI-only session metadata so loaded audio can show its provider without changing URL-only playback maps.
  const [generatedAudioMeta, setGeneratedAudioMeta] = useState({});
  // P4-A4: Text Library UI command state belongs to Text only and never participates in Table busy state.
  const [textLibraryCommandBusy, setTextLibraryCommandBusy] = useState(false);
  const [textLibraryCommandError, setTextLibraryCommandError] = useState(null);

  // UI-only: if Advanced is open on the currently playing vocabulary, keep the
  // reading panel attached to the next vocabulary as playback advances.
  const previousAdvancedPlaybackIdRef = useRef(playingIndex);
  useEffect(() => {
      const previousPlayingId = previousAdvancedPlaybackIdRef.current;
      if (playingIndex !== previousPlayingId) {
          if (playingIndex !== null && expandedAdvancedId !== null && expandedAdvancedId === previousPlayingId) {
              setExpandedAdvancedId(playingIndex);
          }
          previousAdvancedPlaybackIdRef.current = playingIndex;
      }
  }, [playingIndex, expandedAdvancedId, setExpandedAdvancedId]);

  // FIX 1: Lock Body Scroll when Sidebar is Open (Prevent background scrolling)
  useEffect(() => executeBodyScrollLockEffect({ isMobile, isSidebarOpen }), [isMobile, isSidebarOpen]);

  // --- FORCE HEADER SHOW WHEN SIDEBAR OPEN (MOBILE) ---
  useEffect(() => executeSidebarHeaderVisibilityEffect({
      isMobile, isSidebarOpen, isPlaying, mobileTab, setShowAppBar
  }), [isSidebarOpen, isMobile, isPlaying, mobileTab]);

  const {
    stopSignalRef, pauseStateRef, playbackSessionRef, playbackResolveRef, batchStopSignalRef, currentAudioObjRef,
    generationAbortControllerRef, generatedAudioMetaRef, edgeTestAbortControllerRef, playbackModeRef, rateRef, playbackSequenceRef, playbackDelaysRef, vocabularyPlayOrderRef,
    activeVocabularyOrderRef, playbackContextRef, currentUtteranceRef, ttsReplayRef, synth, folderInputRef, csvInputRef, sourceInputRef,
    fullPackInputRef, sourceUploadKeyRef, logContainerRef, debugButtonRef, debugPanelRef, batchPanelRef,
    batchButtonRef, textareaRef, newItemTextareaRef,
  } = useMainAppRuntimeRefs({ playbackMode, playbackSequence, playbackDelays, vocabularyPlayOrder, activeVocabularyOrder, rate });

  const cycleMasteryState = useCallback((vocabId) => executeCycleMasteryState({
      vocabId, setMasteryByVocabId
  }), [setMasteryByVocabId]);

  const recordStudyActivity = useCallback((item) => executeRecordStudyActivity({
      item, setActivityByVocabId
  }), [setActivityByVocabId]);

  const storageRefreshToken = `${Object.keys(savedDecks).length}:${Object.keys(masteryByVocabId).length}:${Object.keys(activityByVocabId).length}`;

  const handleStorageDatasetCacheCleared = useCallback(() => {
      setSavedDecks({});
      setSelectedDeckId('');
  }, [setSavedDecks, setSelectedDeckId]);

  const handleStorageMasteryReset = useCallback(() => {
      setMasteryByVocabId({});
  }, [setMasteryByVocabId]);

  const handleStorageStudyTrackingReset = useCallback(() => {
      setActivityByVocabId({});
  }, [setActivityByVocabId]);

  const currentProgressVocabIds = useMemo(() => playlist
      .filter(item => item?.isStructured && item?.vocabId)
      .map(item => item.vocabId), [playlist]);

  const handleProgressRestored = useCallback(({ masteryByVocabId: nextMastery = {}, activityByVocabId: nextActivity = {} } = {}) => {
      setMasteryByVocabId(nextMastery);
      setActivityByVocabId(nextActivity);
  }, [setMasteryByVocabId, setActivityByVocabId]);

  const studyQueueSet = useMemo(() => new Set(studyQueue), [studyQueue]);

  const csvChangeSummary = useMemo(
      () => getTableChangeSummary(csvBaselineContent, tableContent),
      [csvBaselineContent, tableContent]
  );
  const isCsvDirty = csvChangeSummary.isDirty;
  const isMultiSourceMode = Boolean(sourcePack.main?.baselineContent);
  const sourceDiagnostics = useMemo(() => getSourceDiagnostics(sourcePack), [sourcePack]);
  const sourceChangeSummaries = useMemo(() => resolveSourceChangeSummaries({
      sourcePack, tableContent
  }), [sourcePack, tableContent]);
  const dirtySourceKeys = useMemo(() => V510_SOURCE_KEYS.filter(key => sourceChangeSummaries[key]?.isDirty), [sourceChangeSummaries]);

  const advancedDatasetStats = useMemo(() => resolveAdvancedDatasetStats({ playlist }), [playlist]);

  const masteryProgressStats = useMemo(() => resolveMasteryProgressStatistics({
      items: playlist.filter(item => item.isStructured), masteryByVocabId
  }), [playlist, masteryByVocabId]);

  const studyActivityStats = useMemo(() => resolveStudyActivityStatistics({
      items: playlist, activityByVocabId
  }), [playlist, activityByVocabId]);

  const masterFilteredPlaylist = useMemo(() => resolveMasterFilteredPlaylist({
      playlist, masterFilter, csvChangeSummary, masterSearch, masteryFilter, masteryByVocabId
  }), [playlist, masterFilter, masterSearch, csvChangeSummary.byId, masteryFilter, masteryByVocabId]);

  const currentPlayerList = useMemo(() => resolveCurrentPlayerList({
      mode, playlist, tableViewMode, studyQueueSet, masterFilteredPlaylist
  }), [playlist, mode, tableViewMode, studyQueueSet, masterFilteredPlaylist]);

  const legacyActivePlaybackList = useMemo(() => resolveActivePlaybackList({
      playingContext, playlist, studyQueueSet, masterFilteredPlaylist, vocabularyPlayOrder, activeVocabularyOrder
  }), [playingContext, playlist, studyQueueSet, masterFilteredPlaylist, vocabularyPlayOrder, activeVocabularyOrder]);


  useEffect(() => executeUnsavedCsvBeforeUnloadEffect({ isCsvDirty }), [isCsvDirty]);

  // v5.8.3: debounce-save the WORKING COPY to ProLingo cache. This never marks the CSV clean.
  useEffect(() => executeDraftAutosaveEffect({
      isCsvDirty,
      mode,
      currentDeckName,
      tableContent,
      csvBaselineContent,
      sourcePack,
      sequenceHighWater,
      manualIdHighWater,
      importedRowCount,
      setSavedDecks,
      setSelectedDeckId,
      setLastDraftAutoSaveAt,
      addLog
  }), [isCsvDirty, mode, currentDeckName, tableContent, csvBaselineContent, sourcePack, sequenceHighWater, manualIdHighWater, importedRowCount]);

  const aiVoices = [
    { id: "Kore", label: "Kore (F)", gender: "Female" },
    { id: "Zephyr", label: "Zephyr (F)", gender: "Female" },
    { id: "Puck", label: "Puck (M)", gender: "Male" },
    { id: "Fenrir", label: "Fenrir (M)", gender: "Male" },
    { id: "Charon", label: "Charon (M)", gender: "Male" }
  ];

  // --- NEW: SYNC BODY BACKGROUND WITH THEME (Fixes Mobile Bounce "White Layer" issue) ---
  useEffect(() => executeBodyThemeBackgroundEffect({ theme }), [theme]);

  // --- INITIALIZE SILENT AUDIO (ROBUST WAV) ---
  useEffect(() => executeSilentAudioAnchorEffect({
      silentWavUrlRef, silentAudioRef
  }), []);

  // --- SCROLL AUTO-HIDE LOGIC (UPDATED WITH FLAG & TAB CHECK) ---
  useEffect(() => executeMobileHeaderScrollListenerEffect({
      isMobile, isAutoScrolling, lastScrollY, mobileTab, setShowAppBar
  }), [isMobile, mobileTab]);

  // --- NEW: USELAYOUTEFFECT FOR INSTANT SCROLL RESTORATION ---
  useLayoutEffect(() => {
      executePendingScrollRestoration({
          pendingScrollRestoration, isAutoScrolling, isMobile, listContainerRef
      });
  }, [tableViewMode, mode, mobileTab, isMobile]); // Trigger immediately after mode changes trigger a re-render

  useEffect(() => executeResponsiveViewportLifecycleEffect({
      isMobile, listContainerRef, setIsMobile, setIsSidebarOpen, setContainerHeight,
      setRowHeights, setActiveMenuId
  }), [isMobile, mobileTab]);
  
  useEffect(() => {
    tableViewModeRef.current = tableViewMode;
  }, [tableViewMode]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);
  
  useEffect(() => executePlaybackSequencePersistenceEffect({
    playbackSequence,
    playbackSequenceRef
  }), [playbackSequence]);

  useEffect(() => executePlaybackDelaysPersistenceEffect({
    playbackDelays,
    playbackDelaysRef
  }), [playbackDelays]);

  useEffect(() => executeVocabularyPlayOrderPersistenceEffect({
    vocabularyPlayOrder,
    vocabularyPlayOrderRef,
    activeVocabularyOrderRef,
    setActiveVocabularyOrder
  }), [vocabularyPlayOrder]);

  useEffect(() => executeControlSectionPersistenceEffect(sidebarSection), [sidebarSection]);

  useEffect(() => {
    executeTextStructuredPreferencePersistenceEffect(textStructuredPreferences);
  }, [textStructuredPreferences]);

  useEffect(() => {
    activeVocabularyOrderRef.current = activeVocabularyOrder;
  }, [activeVocabularyOrder]);

  useEffect(() => {
      selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);
  
  useEffect(() => {
      selectedIndonesianVoiceRef.current = selectedIndonesianVoice;
  }, [selectedIndonesianVoice]);

  useEffect(() => executeStartupRestoreEffect({
    setSavedDecks,
    setTableContent,
    setCsvBaselineContent,
    setSequenceHighWater,
    setManualIdHighWater,
    setImportedRowCount,
    setLockedStates,
    addLog,
    forceStopAll
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // --- VOICE PERSISTENCE (Browser TTS) ---
  useEffect(() => executeBrowserTtsVoiceLifecycleEffect({
    synth, selectedVoiceRef, selectedIndonesianVoiceRef, setVoices, setSelectedVoice,
    setIndonesianVoices, setSelectedIndonesianVoice
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , []);

  useEffect(() => executeActiveRowAutoFollowEffect({
      currentIndex, currentPlayerList, isPlaying, independentPlayingId, playingContext, mode,
      tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling,
      isSidebarOpen, mobileTab, setShowAppBar, listContainerRef
  }), [currentIndex, mode, currentPlayerList, isPlaying, playingContext, tableViewMode, independentPlayingId, rowHeights, isMobile, showAppBar, isSidebarOpen, mobileTab]); 

  // --- MODIFIED SCROLL LISTENER FOR MOBILE (BLOCKER ADDED) ---
  useEffect(() => executeMobileWindowScrollEffect({
      isMobile, setScrollTop, setContainerHeight
  }), [isMobile]);

  useEffect(() => executeLogAutoScrollEffect({ logContainerRef }), [systemLogs, showLogs, mobileTab]);

  const addLog = useCallback((type, message) => executeSystemLogAppend({ type, message, setSystemLogs }), [setSystemLogs]);

  // E: Gemini access is resolved by server-side OWNER/BYOK sessions.
  useEffect(() => {
    executeGeminiOwnerStatusService({ setGeminiOwnerState, addLog });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUserApiKeyChange = (eventOrValue) => {
    const nextValue = typeof eventOrValue === 'string' ? eventOrValue : eventOrValue?.target?.value || '';
    setUserApiKey(nextValue);
  };

  const handleGeminiByokRegister = async () => {
    const cleanKey = String(userApiKey || '').trim();
    if (!cleanKey) return;
    try {
      await executeGeminiByokRegisterService({ apiKey: cleanKey, setGeminiOwnerState, addLog });
      setUserApiKey('');
    } catch (error) {
      addLog('Error', `Gemini BYOK registration failed: ${error.message}`);
      alert(`API key tidak dapat disimpan: ${error.message}`);
    }
  };

  const handleGeminiOwnerLock = async () => {
    try {
      await executeGeminiOwnerLockService({ setGeminiOwnerState, addLog });
    } catch (error) {
      addLog('Error', `Gemini owner lock failed: ${error.message}`);
      alert(`Owner lock gagal: ${error.message}`);
    }
  };

  const handleGeminiByokClear = async () => {
    try {
      await executeGeminiByokClearService({ setGeminiOwnerState, addLog });
      setUserApiKey('');
    } catch (error) {
      addLog('Error', `Gemini BYOK removal failed: ${error.message}`);
      alert(`API key tidak dapat dihapus: ${error.message}`);
    }
  };

  const handleGeminiOwnerUnlock = async () => {
    const accessCode = window.prompt('Owner Access Code');
    if (!accessCode) return;
    try {
      await executeGeminiOwnerUnlockService({ accessCode, setGeminiOwnerState, addLog });
    } catch (error) {
      addLog('Error', `Gemini owner unlock failed: ${error.message}`);
      alert(`Owner unlock gagal: ${error.message}`);
    }
  };

  // P4-A2: bootstrap from isolated migration input. Visible Text state starts empty
  // until IndexedDB hydration completes, preventing stale/default line flash.
  useEffect(() => executeTextLibraryBootstrapEffect({
    legacyState: legacyTextBootstrapState,
    setTextIdentityState, setTextContent, setActiveTextDocumentId, setTextLibrarySnapshot,
    setTextDatabaseStatus, setTextDatabaseError, addLog
  }), [legacyTextBootstrapState, addLog, setTextIdentityState, setTextContent, setActiveTextDocumentId, setTextLibrarySnapshot, setTextDatabaseStatus, setTextDatabaseError]);

  useEffect(() => {
    setTextIdentityState(prev => reconcileTextIdentityState(prev, textContent));
  }, [textContent, setTextIdentityState]);

  const activeTextEditorModel = textLibrarySnapshot?.documents?.find(document => document.id === activeTextDocumentId)?.editorModel || null;
  const textLibraryCatalog = useMemo(() => textLibrarySnapshot ? resolveTextLibraryCatalog(textLibrarySnapshot) : { rootDocuments: [], collections: [] }, [textLibrarySnapshot]);
  const activeTextDocumentTree = useMemo(() => textLibrarySnapshot && activeTextDocumentId ? resolveTextLibraryDocumentTree(textLibrarySnapshot, activeTextDocumentId) : null, [textLibrarySnapshot, activeTextDocumentId]);
  const activeTextDocument = activeTextDocumentTree ? { ...activeTextDocumentTree, blocks: undefined } : null;
  const structuredTextPlaybackList = useMemo(() => resolveStructuredTextPlaybackList(activeTextDocumentTree), [activeTextDocumentTree]);
  const structuredTextActivePlaybackList = useMemo(
    () => structuredTextPlaybackList.filter(item => hasStructuredTextPlayableChannel(item, textStructuredPreferences.playbackChannelMode)),
    [structuredTextPlaybackList, textStructuredPreferences.playbackChannelMode]
  );
  const structuredTextVoiceState = useMemo(() => resolveTextStructuredBrowserVoiceState({
    englishVoices: voices,
    indonesianVoices,
    preferences: textStructuredPreferences
  }), [voices, indonesianVoices, textStructuredPreferences.browserTextVoiceName, textStructuredPreferences.browserMeaningVoiceName]);
  const selectedTextBrowserVoice = structuredTextVoiceState.textVoice;
  const selectedTextIndonesianVoice = structuredTextVoiceState.meaningVoice;
  const structuredTextModeActive = mode === 'text' && activeTextEditorModel === 'structured-v1';
  const activeBrowserTtsVoice = structuredTextModeActive ? selectedTextBrowserVoice : selectedVoice;
  const activeBrowserTtsIndonesianVoice = structuredTextModeActive ? selectedTextIndonesianVoice : selectedIndonesianVoice;
  const activeBrowserTtsRate = structuredTextModeActive ? textStructuredPreferences.browserTtsRate : rate;
  const handleActiveBrowserTtsVoiceChange = (voice) => {
    if (structuredTextModeActive) {
      setTextStructuredPreferences(prev => ({ ...prev, ...resolveTextStructuredVoicePreferencePatch({ channel: 'text', voice }) }));
      return;
    }
    setSelectedVoice(voice);
  };
  const handleActiveBrowserTtsIndonesianVoiceChange = (voice) => {
    if (structuredTextModeActive) {
      setTextStructuredPreferences(prev => ({ ...prev, ...resolveTextStructuredVoicePreferencePatch({ channel: 'meaning', voice }) }));
      return;
    }
    setSelectedIndonesianVoice(voice);
  };
  const handleActiveBrowserTtsRateChange = (value) => {
    if (structuredTextModeActive) {
      const numericRate = Number(value);
      const browserTtsRate = Number.isFinite(numericRate) ? Math.min(2, Math.max(0.5, Math.round(numericRate * 10) / 10)) : 1;
      setTextStructuredPreferences(prev => ({ ...prev, browserTtsRate }));
      return;
    }
    setRate(value);
  };
  const activePlaybackList = mode === 'text' && activeTextEditorModel === 'structured-v1'
    ? structuredTextActivePlaybackList
    : legacyActivePlaybackList;


  useEffect(() => executeTextLibraryCompatibilityPersistenceEffect({
    textDatabaseStatus, activeTextDocumentId, activeTextEditorModel, textIdentityState,
    setTextLibrarySnapshot, setTextDatabaseError, addLog
  }), [textDatabaseStatus, activeTextDocumentId, activeTextEditorModel, textIdentityState, setTextLibrarySnapshot, setTextDatabaseError, addLog]);

  useEffect(() => executePlaylistContentSyncEffect({
    mode, textIdentityState, textDatabaseStatus, setTextDatabaseStatus, setPlaylist, setBatchConfig, tableContent, sequenceHighWater,
    setSequenceHighWater, setManualIdHighWater, addLog
  }), [tableContent, textIdentityState, textDatabaseStatus, mode, sequenceHighWater, setTextDatabaseStatus]);

  const resetFullState = () => executeResetFullState({
    localAudioMapTable, localAudioMapText, setLocalAudioMapTable, setLocalAudioMapText,
    setAudioStatusTable, setAudioStatusText, setCurrentIndex, setMasterIndex, setStudyIndex,
    setPlayingIndex, setPlayingContext, setStudyQueue, setTableViewMode, forceStopAll, addLog
  });

  const resetTextState = () => executeResetTextState({
    localAudioMapText, setLocalAudioMapText, setAudioStatusText,
    setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices,
    forceStopAll, addLog
  });

  const pushUndoSnapshot = useCallback((label, snapshot = tableContent) => {
      setUndoStack(prev => [...prev.slice(-19), { label, content: snapshot, at: Date.now() }]);
  }, [tableContent]);

  const undoLastDataChange = () => executeUndoLastDataChange({
      undoStack, forceStopAll, setTableContent, setStudyQueue, setUndoStack, addLog
  });

  const applyChangeRevert = (id, type) => executeApplyChangeRevert({
      id, type, csvBaselineContent, tableContent, pushUndoSnapshot, forceStopAll,
      setUndoStack, setStudyQueue, setTableContent, addLog
  });

  const revertAllChanges = () => executeRevertAllChanges({
      pushUndoSnapshot, csvBaselineContent, forceStopAll, setTableContent, setStudyQueue,
      setIsRevertAllConfirmOpen, setIsChangeReviewOpen, addLog
  });

  const openManualAdd = () => executeOpenManualAdd({
    tableContent, sequenceHighWater, manualIdHighWater, setManualEditingId, setManualAdvancedOpen,
    setManualForm, setIsManualEditorOpen
  });

  const openManualEdit = (item) => executeOpenManualEdit({
    item, setManualEditingId, setManualAdvancedOpen, setManualForm, setIsManualEditorOpen
  });

  const closeManualEditor = () => executeCloseManualEditor({
    setIsManualEditorOpen, setManualEditingId, setManualAdvancedOpen, setManualForm
  });

  const saveManualVocabulary = () => executeSaveManualVocabulary({
      manualForm, tableContent, manualEditingId, sequenceHighWater, manualIdHighWater,
      pushUndoSnapshot, setTableContent, setSequenceHighWater, setManualIdHighWater,
      setLockedStates, mode, handleModeSwitch, addLog, closeManualEditor
  });

  const deleteStructuredItem = (item) => executeDeleteStructuredItemPrompt({ item, setPendingDeleteItem });

  const confirmDeleteStructuredItem = () => executeConfirmDeleteStructuredItem({
      pendingDeleteItem, setPendingDeleteItem, pushUndoSnapshot, forceStopAll, tableContent,
      setTableContent, setStudyQueue, currentIndex, setCurrentIndex, playingIndex,
      setPlayingIndex, expandedAdvancedId, setExpandedAdvancedId, addLog
  });

  const exportTableCSV = (scope = 'master') => {
    return executeExportTableCsvService({
      scope,
      playlist,
      studyQueueSet,
      currentDeckName,
      sequenceHighWater,
      manualIdHighWater,
      importedRowCount,
      addLog
    });
  };


  const saveUpdatedCSV = async () => {
    return executeSaveUpdatedCsvService({
      isMultiSourceMode,
      exportMergedDataset,
      tableContent,
      currentDeckName,
      sequenceHighWater,
      manualIdHighWater,
      importedRowCount,
      savedDecks,
      setSavedDecks,
      setSelectedDeckId,
      setTableContent,
      setCsvBaselineContent,
      setUndoStack,
      setIsChangeReviewOpen,
      setIsRevertAllConfirmOpen,
      addLog
    });
  };

  const handleBatchRangeBlur = (field) => executeBatchRangeBlur({
      field, batchConfig, mode, sequenceHighWater, playlist, setBatchConfig
  });

  const handleInsertTab = () => executeInsertTab({ mode, setTableContent, setTextContent, textareaRef });
  
  const handleAddTextItem = () => executeAddTextItem({
    newTextItem, textContent, setTextContent, setNewTextItem, newItemTextareaRef, addLog
  });

  const handleDeleteTextItem = (indexToDelete) => executeDeleteTextItem({
    indexToDelete, playlist, setTextContent, addLog, currentIndex, forceStopAll
  });

  const toggleStudyItem = (id) => executeToggleStudyItem({ id, setStudyQueue });

  const handleRangeAdd = () => executeStudyRangeAdd({
      rangeInput, playlist, setStudyQueue, setRangeInput, addLog
  });

  const clearStudyQueue = () => executeClearStudyQueue({ setStudyQueue, addLog });

  const toggleCellReveal = (e, cellKey) => executeToggleCellReveal({
      e, cellKey, isMemoryMode, revealedCells, setRevealedCells
  });

  const handleMenuToggle = (rowId) => executeMenuToggle({ rowId, setActiveMenuId });

  // --- AUDIO ENGINE v5.8 ---
  const getLocalAudioUrl = (item, part) => resolveLocalAudioUrl({
      mode,
      item,
      part,
      localAudioMapTable,
      localAudioMapText
  });

  const settlePlaybackPromise = () => executeSettlePlaybackPromise({ playbackResolveRef });

  const waitWhilePaused = async () => executeWaitWhilePaused({ pauseStateRef, stopSignalRef });

  // Delay that remains responsive to Pause / Stop / playback-session changes.
  // Paused time does not consume the configured learning gap.
  const waitPlaybackDelay = async (durationMs, sessionId = playbackSessionRef.current) => executeWaitPlaybackDelay({
    durationMs, sessionId, playbackSessionRef, waitWhilePaused, stopSignalRef, pauseStateRef
  });

  const playTTS = (textToRead, overrideVoice = null) => {
    return executeBrowserTtsPlaybackService({
      textToRead,
      overrideVoice,
      selectedVoiceRef,
      stopSignalRef,
      pauseStateRef,
      synth,
      currentUtteranceRef,
      ttsReplayRef,
      playbackResolveRef,
      rateRef,
      rate,
      pitch
    });
  };

  const playSource = (textToRead, item, part) => {
    return executeAudioSourcePlaybackService({
      textToRead,
      item,
      part,
      stopSignalRef,
      preferLocalAudio,
      getLocalAudioUrl,
      currentAudioObjRef,
      rateRef,
      rate,
      playbackResolveRef,
      shouldIgnoreLocalAudioFailure,
      shouldResolveLocalAudioFailure,
      resolveAudioFallbackVoice,
      selectedIndonesianVoiceRef,
      playTTS,
      addLog
    });
  };

  // Part 1 carryover hotfix: local/generated audio reacts immediately to speed
  // changes; Browser TTS applies the latest rate when the next utterance/part
  // starts (native SpeechSynthesis cannot safely retime an utterance mid-speech).
  useEffect(() => {
    if (currentAudioObjRef.current) {
      currentAudioObjRef.current.playbackRate = Number(rate) || 1;
    }
  }, [rate, currentAudioObjRef]);

  const pausePlayback = (options = {}) => executePausePlayback({
    isPlaying, isPaused, isMobile, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog,
    ttsReplayRef, pauseSource: options?.source || 'ui'
  });

  const resumePlayback = () => executeResumePlayback({
    isPlaying, isPaused, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog, ttsReplayRef
  });

  const safePlayTransition = async (actionCallback) => executeSafePlayTransition({
    forceStopAll, playbackSessionRef, stopSignalRef, pauseStateRef, actionCallback
  });

  const handleIndependentPlay = (item, part, uiId) => executeIndependentPlaybackInteraction({
    item, part, uiId, setActiveMenuId, independentPlayingId, forceStopAll, safePlayTransition,
    playbackSessionRef, playbackContextRef, setIndependentPlayingId, setPlayingContext, mode, tableViewMode,
    setPlayingIndex, setCurrentIndex, setSpeakingPart, playSource, onStudyVocab: recordStudyActivity
  });

  // --- HELPER FOR SCROLL PERSISTENCE ---
  const getScrollPos = () => isMobile ? window.scrollY : (listContainerRef.current?.scrollTop || 0);
  
  const _setScrollPos = (val) => {
      if (isMobile) window.scrollTo({ top: val, behavior: 'auto' });
      else if (listContainerRef.current) listContainerRef.current.scrollTop = val;
  };

  const handleTabSwitch = (targetTab) => executeTableViewTabSwitch({
    targetTab, tableViewMode, getScrollPos, viewScrollPosRef, isPlaying, playingContext,
    isMobile, setShowAppBar, setMasterIndex, currentIndex, setStudyIndex, playingIndex,
    playlist, studyQueueSet, rowHeights, mode, justSwitchedTab, masterIndex, studyIndex,
    pendingScrollRestoration, isAutoScrolling, setScrollTop, setTableViewMode,
    setCurrentIndex, addLog
  });

  const handleMobileTabSwitch = (targetMobileTab) => executeMobileTabSwitch({
    targetMobileTab, mobileTab, mode, viewScrollPosRef, tableViewMode, isPlaying,
    currentIndex, currentPlayerList, rowHeights, setShowAppBar, setScrollTop,
    pendingScrollRestoration, isAutoScrolling, setMobileTab
  });

  const getBasePlaybackListForContext = (context) => {
    if (context === 'study') return playlist.filter(item => studyQueueSet.has(item.id));
    if (context === 'master') return masterFilteredPlaylist;
    return playlist;
  };

  const resolveVocabularyPlaybackList = (baseList, context, options = {}) => {
    // P4-A0: Text does not inherit the frozen Table Shuffle Vocabulary preference.
    if (context === 'text') return Array.isArray(baseList) ? [...baseList] : [];
    const resolved = resolveVocabularyPlaybackOrderState(
      baseList,
      context,
      vocabularyPlayOrderRef.current,
      activeVocabularyOrderRef.current,
      options
    );
    if (resolved.changed) {
      activeVocabularyOrderRef.current = resolved.nextOrder;
      setActiveVocabularyOrder(resolved.nextOrder);
    }
    return resolved.list;
  };

  const handleGlobalPlay = () => executeGlobalPlayInteraction({
    setActiveMenuId, isPlaying, isPaused, resumePlayback, pausePlayback, justSwitchedTab,
    playingIndex, playingContext, getBasePlaybackListForContext, startGlobalPlayback,
    mode, tableViewMode, currentIndex
  });

  const handleManualRowClick = (item) => executeManualRowPlaybackInteraction({
    item, setActiveMenuId, setIndependentPlayingId, mode, tableViewMode, setCurrentIndex,
    setPlayingIndex, setPlayingContext, startGlobalPlayback, vocabularyPlayOrderRef
  });

  const startGlobalPlayback = (startItemId = null, forcedContext = null, options = {}) => {
    return executeGlobalPlaybackSessionService({
      startItemId,
      forcedContext,
      options,
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
      onStudyVocab: recordStudyActivity
    });
  };

  const forceStopAll = () => executeForceStopPlaybackService({
    playbackSessionRef, stopSignalRef, pauseStateRef, currentAudioObjRef, synth,
    settlePlaybackPromise, currentUtteranceRef, silentAudioRef, setIsPlaying,
    setIsPaused, setSpeakingPart, setIndependentPlayingId, playbackContextRef
  });

  const playStructuredTextChannel = (textToRead, item, channel) => {
    const targetVoice = channel === 'meaning'
      ? selectedTextIndonesianVoice
      : selectedTextBrowserVoice;
    if (!targetVoice) {
      addLog('Warn', `Text Player: ${channel === 'meaning' ? 'Meaning/ID' : 'Text/EN'} Browser TTS voice is not ready; channel skipped for ${item?.segmentId || item?.id || 'segment'}.`);
      return Promise.resolve();
    }
    return executeBrowserTtsPlaybackService({
      textToRead,
      overrideVoice: targetVoice,
      selectedVoiceRef: { current: targetVoice },
      stopSignalRef,
      pauseStateRef,
      synth,
      currentUtteranceRef,
      ttsReplayRef,
      playbackResolveRef,
      rateRef: null,
      rate: textStructuredPreferences.browserTtsRate,
      pitch: 1
    });
  };

  const startStructuredTextPlayback = ({ startSegmentId = null, blockId = null, scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE } = {}) => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1' || !activeTextDocumentTree) return false;
    return executeStructuredTextPlaybackSessionService({
      documentTree: activeTextDocumentTree,
      startSegmentId,
      blockId,
      scope,
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
      playbackChannelMode: textStructuredPreferences.playbackChannelMode,
      playStructuredChannel: playStructuredTextChannel,
      forceStopAll,
      addLog
    });
  };

  const handleStructuredTextPlaySegment = (segmentId) => startStructuredTextPlayback({
    startSegmentId: segmentId,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT
  });

  const handleStructuredTextPlayCard = (blockId) => startStructuredTextPlayback({
    blockId,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD
  });

  const handleStructuredTextStartFromSegment = (segmentId) => startStructuredTextPlayback({
    startSegmentId: segmentId,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE
  });

  const handleStructuredTextPlayDocument = () => startStructuredTextPlayback({
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT
  });

  const handlePlayerGlobalPlay = () => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1') {
      handleGlobalPlay();
      return;
    }
    if (isPlaying && playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT) {
      if (isPaused) resumePlayback();
      else pausePlayback();
      return;
    }
    const resumeId = structuredTextActivePlaybackList.some(item => item.id === playingIndex) ? playingIndex : null;
    startStructuredTextPlayback({
      startSegmentId: resumeId,
      scope: resumeId ? TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE : TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT
    });
  };

  const handlePlayerSmartNav = (direction) => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1') {
      handleSmartNav(direction);
      return;
    }
    const anchorId = structuredTextActivePlaybackList.some(item => item.id === playingIndex)
      ? playingIndex
      : structuredTextActivePlaybackList[0]?.id;
    const target = resolveStructuredTextAdjacentSegment({
      list: structuredTextActivePlaybackList,
      currentId: anchorId,
      direction
    });
    if (!target) return;
    startStructuredTextPlayback({
      startSegmentId: target.id,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE
    });
  };

  const runTextLibraryUiCommand = useCallback(async (operation) => {
    if (textLibraryCommandBusy || isSystemBusy) return null;
    setTextLibraryCommandBusy(true);
    setTextLibraryCommandError(null);
    try {
      return await operation();
    } catch (error) {
      const message = error?.message || String(error);
      setTextLibraryCommandError(message);
      addLog('Error', `Text Library: ${message}`);
      return null;
    } finally {
      setTextLibraryCommandBusy(false);
    }
  }, [textLibraryCommandBusy, isSystemBusy, addLog]);

  const handleTextLibrarySelectDocument = useCallback((documentId) => runTextLibraryUiCommand(async () => {
    forceStopAll();
    setCurrentIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    setSavedIndices(prev => ({ ...prev, text: null }));
    return executeTextLibrarySelectDocument({
      documentId, activeTextDocumentId, activeTextEditorModel, textIdentityState,
      setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, addLog
    });
  }), [runTextLibraryUiCommand, forceStopAll, activeTextDocumentId, activeTextEditorModel, textIdentityState, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices, addLog]);

  const handleTextLibraryCreateDocument = useCallback((payload) => runTextLibraryUiCommand(async () => {
    forceStopAll();
    setCurrentIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    setSavedIndices(prev => ({ ...prev, text: null }));
    return executeTextLibraryCreateDocument({
      payload, activeTextDocumentId, activeTextEditorModel, textIdentityState,
      setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, addLog
    });
  }), [runTextLibraryUiCommand, forceStopAll, activeTextDocumentId, activeTextEditorModel, textIdentityState, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices, addLog]);

  const handleTextLibraryCreateCollection = useCallback((title) => runTextLibraryUiCommand(() => executeTextLibraryCreateCollection({ title, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryRenameDocument = useCallback((id, title) => runTextLibraryUiCommand(() => executeTextLibraryRenameDocument({ id, title, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryStructuredCommand = useCallback((command) => runTextLibraryUiCommand(() => executeTextLibraryStructuredCommand({ command, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);


  const handleSmartNav = (direction) => executeSmartPlaybackNavigation({
    direction, setActiveMenuId, justSwitchedTab, playingIndex, playingContext, mode,
    tableViewMode, currentIndex, getBasePlaybackListForContext, vocabularyPlayOrderRef,
    resolveVocabularyPlaybackList, activeVocabularyOrderRef, playbackContextRef, setCurrentIndex,
    setPlayingContext, startGlobalPlayback
  });
  
    // --- NEW: MEDIA SESSION API INTEGRATION (ANDROID WIDGET) ---// --- MEDIA SESSION API (STABLE, NO WIDGET FLICKER) ---
    const playRef = useRef(handlePlayerGlobalPlay);
    const pausePlaybackRef = useRef(pausePlayback);
    const resumePlaybackRef = useRef(resumePlayback);
    const navRef = useRef(handlePlayerSmartNav);
    const stopRef = useRef(forceStopAll);
    const mediaIntervalRef = useRef(null); // --- ADD: Ref untuk Teks Berjalan ---

    // Always update ref values to latest functions
    playRef.current = handlePlayerGlobalPlay;
    pausePlaybackRef.current = pausePlayback;
    resumePlaybackRef.current = resumePlayback;
    navRef.current = handlePlayerSmartNav;
    stopRef.current = forceStopAll;

    useEffect(() => {
        return executeMediaSessionLifecycleService({
            currentPlayerList, playbackContextRef, playingIndex, speakingPart, currentDeckName, isPlaying, isPaused,
            currentAudioObjRef, mediaIntervalRef, resumePlaybackRef, playRef, pausePlaybackRef, navRef, stopRef, pauseStateRef
        });
    }, [
        playingIndex,
        speakingPart,
        currentPlayerList,
        currentDeckName,
        isPlaying,
        isPaused
    ]);

  const cyclePlaybackMode = () => {
      setPlaybackMode(resolveNextPlaybackMode(playbackMode));
  };

  const handleModeSwitch = (targetMode) => executeModeSwitch({
    targetMode, mode, isSystemBusy, forceStopAll, setPlayingIndex, setPlayingContext,
    setIndependentPlayingId, viewScrollPosRef, tableViewMode, getScrollPos, currentIndex,
    setSavedIndices, setScrollTop, pendingScrollRestoration, isAutoScrolling, setMode,
    savedIndices, setCurrentIndex, addLog
  });

  const openFullPackPicker = () => {
      if (isSystemBusy) return;
      if (isCsvDirty) {
          alert('Simpan atau Revert perubahan working copy dulu sebelum Load Full Pack.');
          return;
      }
      fullPackInputRef.current?.click();
  };

  const handleFullPackUpload = async (e) => {
    return executeFullPackImportService({
      e,
      isCsvDirty,
      setSourcePack,
      setTableContent,
      setCsvBaselineContent,
      setSequenceHighWater,
      setManualIdHighWater,
      setImportedRowCount,
      setUndoStack,
      setMasterSearch,
      setMasterFilter,
      setExpandedAdvancedId,
      setCurrentDeckName,
      setSelectedDeckId,
      setLockedStates,
      handleModeSwitch,
      setSavedDecks,
      addLog
    });
  };

  const openSourcePicker = (key) => {
      if (isSystemBusy) return;
      if (isCsvDirty) {
          alert('Simpan atau Revert perubahan working copy dulu sebelum mengganti source file. Ini mencegah perubahan tercampur dengan baseline baru.');
          return;
      }
      if (key !== 'main' && !sourcePack.main?.baselineContent) {
          alert('Load MAIN terlebih dahulu. MAIN adalah pemilik VOCAB_ID, NO dan urutan audio.');
          return;
      }
      setSourceUploadKey(key);
      sourceUploadKeyRef.current = key;
      sourceInputRef.current?.click();
  };

  const handleSourceUpload = (e) => {
    return executeSourceLayerImportService({
      e,
      sourceUploadKeyRef,
      sourceUploadKey,
      sourcePack,
      currentDeckName,
      setSourcePack,
      setTableContent,
      setCsvBaselineContent,
      setSequenceHighWater,
      setManualIdHighWater,
      setImportedRowCount,
      setUndoStack,
      setMasterSearch,
      setMasterFilter,
      setExpandedAdvancedId,
      setCurrentDeckName,
      setLockedStates,
      handleModeSwitch,
      setSavedDecks,
      setSelectedDeckId,
      addLog
    });
  };

  const removeSourceLayer = (key) => {
    return executeRemoveSourceLayerService({
      key,
      isCsvDirty,
      sourcePack,
      sequenceHighWater,
      manualIdHighWater,
      importedRowCount,
      currentDeckName,
      setSourcePack,
      setTableContent,
      setCsvBaselineContent,
      setUndoStack,
      setSavedDecks,
      addLog
    });
  };

  const saveUpdatedSource = async (key) => {
    return executeSaveUpdatedSourceService({
      key,
      sourcePack,
      tableContent,
      currentDeckName,
      sequenceHighWater,
      manualIdHighWater,
      importedRowCount,
      setSourcePack,
      setCsvBaselineContent,
      setSavedDecks,
      setSelectedDeckId,
      addLog
    });
  };

  const exportMergedDataset = () => {
    return executeExportMergedDatasetService({
      tableContent,
      currentDeckName,
      addLog
    });
  };

  const handleInputContentChange = (val) => {
    if (mode === 'table') setTableContent(val);
    else setTextContent(val);
  };

  const handleSaveDeck = () => {
    return executeSaveDeckCacheService({
      currentDeckName,
      tableContent,
      csvBaselineContent,
      sourcePack,
      sequenceHighWater,
      manualIdHighWater,
      importedRowCount,
      savedDecks,
      csvChangeSummary,
      setSavedDecks,
      setSelectedDeckId,
      addLog
    });
  };

  const handleLoadDeck = (e) => {
    return executeLoadDeckCacheService({
      e,
      savedDecks,
      setSequenceHighWater,
      setManualIdHighWater,
      setImportedRowCount,
      setSourcePack,
      setCsvBaselineContent,
      setTableContent,
      setUndoStack,
      setMasterSearch,
      setMasterFilter,
      setExpandedAdvancedId,
      setCurrentDeckName,
      setSelectedDeckId,
      setLockedStates,
      forceStopAll,
      setPlayingIndex,
      setPlayingContext,
      setMode,
      setCurrentIndex,
      setMasterIndex,
      setStudyIndex,
      addLog
    });
  };

  const handleDeleteDeckInit = () => {
      if (!selectedDeckId) return;
      setIsDeleteDialogOpen(true);
  };

  const confirmDeleteDeck = () => {
    return executeDeleteDeckCacheService({
      selectedDeckId,
      savedDecks,
      setSavedDecks,
      setSelectedDeckId,
      setCurrentDeckName,
      setTableContent,
      setCsvBaselineContent,
      setSourcePack,
      setSequenceHighWater,
      setManualIdHighWater,
      setImportedRowCount,
      resetFullState,
      setIsDeleteDialogOpen,
      addLog
    });
  };

  const testEdgeBackend = async () => {
    return executeEdgeBackendHealthService({
      edgeHealth,
      edgeTestAbortControllerRef,
      setEdgeHealth,
      edgeVoice,
      addLog
    });
  };

  const generateAIAudio = async (item, part = 'full', options = {}) => {
    if (mode === 'table' && generatorEngine === 'gemini' && isIndonesianAudioPart(part)) {
      alert('Gemini Audio hanya mendukung audio English di ProLingo. Bagian IDN dikunci.');
      return { status: 'locked-language', part };
    }

    const stableId = getStableAudioIdentity(item);
    const mapKey = resolveGeneratedAudioMapKey({ mode, stableId, part });
    const activeMap = mode === 'table' ? localAudioMapTable : localAudioMapText;
    const existingUrl = activeMap?.[mapKey];

    if (existingUrl && !options.skipReplaceConfirm) {
      const metaKey = `${mode}:${mapKey}`;
      const existingMeta = generatedAudioMetaRef.current?.[metaKey];
      const currentSource = existingMeta
        ? `${String(existingMeta.engine || '').toUpperCase()} • ${existingMeta.voice || 'voice'}${existingMeta.filename ? ` • ${existingMeta.filename}` : ''}`
        : 'Audio Folder / local audio yang sedang ter-load';
      const nextVoice = generatorEngine === 'edge'
        ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
        : aiVoiceName;
      const ok = window.confirm(
        `Audio untuk ${part} sudah ada.\n\nSaat ini: ${currentSource}\nAudio baru: ${generatorEngine.toUpperCase()} • ${nextVoice || 'voice'}\n\nLanjut download ulang? Audio baru hanya mengganti path audio di sesi ProLingo saat ini. File lama di folder utama TIDAK dihapus/ditimpa. Refresh Audio Folder akan membaca audio dari folder utama lagi.`
      );
      if (!ok) return { status: 'replace-cancelled', mapKey };
    }

    return executeAudioGenerationService({
      item,
      part,
      mode,
      generatorEngine,
      edgeIndonesianVoice,
      edgeVoice,
      aiVoiceName,
      edgeRate,
      edgePitch,
      geminiAccessUnlocked: geminiOwnerState.unlocked || geminiOwnerState.byokRegistered,
      generationAbortControllerRef,
      setAiLoadingId,
      setEdgeHealth,
      setLocalAudioMapTable,
      setLocalAudioMapText,
      onGeneratedAudio: (meta) => {
        const metaKey = `${meta.mode}:${meta.mapKey}`;
        generatedAudioMetaRef.current = {
          ...generatedAudioMetaRef.current,
          [metaKey]: meta
        };
        setGeneratedAudioMeta(prev => ({ ...prev, [metaKey]: meta }));
      },
      addLog
    });
  };

  const runBatchDownload = async () => {
    if (generatorEngine === 'gemini' && !geminiOwnerState.unlocked && !geminiOwnerState.byokRegistered) {
      alert('Gemini terkunci. Daftarkan API key Anda atau unlock Owner Access.');
      return;
    }
    return executeAudioBatchDownloadService({
      isBatchDownloading,
      batchStopSignalRef,
      generationAbortControllerRef,
      setIsBatchStopping,
      setBatchStatusText,
      addLog,
      batchConfig,
      mode,
      sequenceHighWater,
      playlist,
      generatorEngine,
      setIsBatchDownloading,
      generateAIAudio
    });
  };

  const handleCSVUpload = (e) => {
    return executeCsvImportFileService({
      e,
      savedDecks,
      setSequenceHighWater,
      setManualIdHighWater,
      setImportedRowCount,
      setSourcePack,
      setCsvBaselineContent,
      setTableContent,
      setUndoStack,
      setMasterSearch,
      setMasterFilter,
      setExpandedAdvancedId,
      handleModeSwitch,
      setCurrentDeckName,
      setLockedStates,
      setSavedDecks,
      setSelectedDeckId,
      resetFullState,
      addLog
    });
  };

  const clearGeneratedAudioMetaForMode = (targetMode) => {
    generatedAudioMetaRef.current = Object.fromEntries(
      Object.entries(generatedAudioMetaRef.current || {}).filter(([key]) => !key.startsWith(`${targetMode}:`))
    );
    setGeneratedAudioMeta(prev => Object.fromEntries(
      Object.entries(prev || {}).filter(([key]) => !key.startsWith(`${targetMode}:`))
    ));
  };

  const loadAudioFolderFiles = (files, _folderName = '', options = {}) => {
    clearGeneratedAudioMetaForMode(mode);
    return executeAudioFolderSelectService({
    e: { target: { files, value: '' } },
    mode,
    localAudioMapTable,
    localAudioMapText,
    playlist,
    getRecordAudioNo,
    getVocabIdentity,
    getStableAudioIdentity,
    setLocalAudioMapTable,
    setAudioStatusTable,
    setLocalAudioMapText,
    setAudioStatusText,
    silent: !!options.automatic
    });
  };


  // Remembered folders are matched against the ACTIVE dataset, not against the
  // folder alone. Re-scan when dataset identity changes (import/add/delete), but
  // not for search/filter/sort because those do not change `playlist` identity.
  const audioDatasetIdentitySignature = useMemo(() => {
    if (!playlist.length) return '';
    if (mode === 'table') {
      return playlist
        .filter(item => item?.isStructured)
        .map(item => `${getVocabIdentity(item)}:${getRecordAudioNo(item) || ''}`)
        .join('|');
    }
    return playlist.map(item => String(item?.id || '')).join('|');
  }, [mode, playlist]);

  const getAudioAutoRestoreState = () => {
    if (!folderInputRef.audioAutoRestoreState) {
      folderInputRef.audioAutoRestoreState = { signatures: {}, generations: {} };
    }
    return folderInputRef.audioAutoRestoreState;
  };

  const handleFolderSelect = (e) => {
    clearGeneratedAudioMetaForMode(mode);
    return executeAudioFolderSelectService({
      e,
      mode,
      localAudioMapTable,
      localAudioMapText,
      playlist,
      getRecordAudioNo,
      getVocabIdentity,
      getStableAudioIdentity,
      setLocalAudioMapTable,
      setAudioStatusTable,
      setLocalAudioMapText,
      setAudioStatusText
    });
  };

  const handleRememberedAudioFolderOpen = ({ forcePicker = false } = {}) => {
    // Manual reconnect/change always supersedes any slower automatic scan.
    const restoreState = getAudioAutoRestoreState();
    restoreState.generations[mode] = (restoreState.generations[mode] || 0) + 1;
    return executeRememberedAudioFolderOpenService({
      mode,
      forcePicker,
      onFiles: loadAudioFolderFiles,
      fallbackOpen: () => folderInputRef.current?.click(),
      addLog
    });
  };

  const handleRememberedAudioFolderRefresh = () => {
    // Re-scan the remembered folder against the current dataset without forcing
    // the user to pick the folder again. This also supersedes slower auto scans.
    const restoreState = getAudioAutoRestoreState();
    const generation = (restoreState.generations[mode] || 0) + 1;
    restoreState.generations[mode] = generation;

    return executeRememberedAudioFolderOpenService({
      mode,
      forcePicker: false,
      onFiles: (files, folderName, options = {}) => {
        const latestState = getAudioAutoRestoreState();
        if (latestState.generations[mode] !== generation) return { stale: true };
        return loadAudioFolderFiles(files, folderName, { ...options, automatic: true });
      },
      fallbackOpen: () => folderInputRef.current?.click(),
      addLog
    });
  };

  // Keep existing prop plumbing intact: controls already receive folderInputRef.
  // The ref exposes remembered-folder open/change plus an explicit re-scan action.
  folderInputRef.openAudioFolder = handleRememberedAudioFolderOpen;
  folderInputRef.refreshAudioFolder = handleRememberedAudioFolderRefresh;

  useEffect(() => {
    if (!playlist.length || !audioDatasetIdentitySignature) return;

    const restoreState = getAudioAutoRestoreState();
    if (restoreState.signatures[mode] === audioDatasetIdentitySignature) return;

    restoreState.signatures[mode] = audioDatasetIdentitySignature;
    const generation = (restoreState.generations[mode] || 0) + 1;
    restoreState.generations[mode] = generation;

    executeRememberedAudioFolderRestoreService({
      mode,
      onFiles: (files, folderName, options = {}) => {
        const latestState = getAudioAutoRestoreState();
        if (latestState.generations[mode] !== generation) {
          return { stale: true };
        }
        return loadAudioFolderFiles(files, folderName, options);
      },
      addLog
    });
  // Auto-rescan only when the dataset's audio identities change. Search/filter/sort
  // do not change this signature, while CSV import/add/delete do.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, audioDatasetIdentitySignature]);

  const currentAudioStatus = mode === 'table' ? audioStatusTable : audioStatusText;
  const currentMapCount = mode === 'table' ? Object.keys(localAudioMapTable).length : Object.keys(localAudioMapText).length;

  const renderStatusBadge = () => {
      if (currentAudioStatus === 'idle' && currentMapCount === 0) return <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">Belum Load</span>;
      if (currentMapCount > 0) return <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {currentMapCount} File Aktif</span>;
      return <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> 0 File</span>;
  };

  const handleScroll = (e) => {
     // FIX CRITICAL: Removed "if (isAutoScrolling.current) return;" blocker.
     // This allows state synchronization even if the browser clamps the scroll position.
     const currentScroll = e.currentTarget.scrollTop;
     setScrollTop(currentScroll);
  };

  const renderBatchPopup = (options = {}) => renderBatchPopupView({
    batchPanelRef, mode, setIsBatchOpen, isBatchDownloading, batchConfig, setBatchConfig,
    generatorEngine, advancedDatasetStats, handleBatchRangeBlur, runBatchDownload,
    isBatchStopping, batchStatusText,
    inline: Boolean(options.inline),
    showClose: options.showClose !== false
  });

  const togglePlaybackSequencePart = (key) => executeTogglePlaybackSequencePart({ key, setPlaybackSequence });

  const setPlaybackSequencePartRepeat = (key, repeat) => executeSetPlaybackSequencePartRepeat({ key, repeat, setPlaybackSequence });

  const setPlaybackDelay = (field, value) => executeSetPlaybackDelay({ field, value, setPlaybackDelays });

  const resetPlaybackDelays = () => executeResetPlaybackDelays({ setPlaybackDelays });

  const changeVocabularyPlayOrder = (nextMode) => executeChangeVocabularyPlayOrder({
    nextMode, vocabularyPlayOrder, isPlaying, forceStopAll, activeVocabularyOrderRef,
    setActiveVocabularyOrder, setVocabularyPlayOrder, addLog
  });

  const reshuffleVocabularyPlayback = () => executeReshuffleVocabularyPlayback({
    isPlaying, vocabularyPlayOrderRef, playingContext, mode, tableViewMode,
    getBasePlaybackListForContext, playingIndex, currentIndex, resolveVocabularyPlaybackList, addLog
  });

  const movePlaybackSequencePart = (key, direction) => executeMovePlaybackSequencePart({ key, direction, setPlaybackSequence });

  const shufflePlaybackSequence = () => executeShufflePlaybackSequence({ setPlaybackSequence });

  const resetPlaybackSequence = () => executeResetPlaybackSequence({ setPlaybackSequence });

  const applyPlaybackPreset = (presetKey) => executeApplyPlaybackPreset({
    presetKey, setPlaybackSequence, setPlaybackDelays, addLog
  });

  const activePlaybackPreset = useMemo(() => {
    const currentSignature = playbackConfigSignature(playbackSequence, playbackDelays);
    const match = Object.entries(V511_PLAYBACK_PRESETS).find(([, preset]) =>
      playbackConfigSignature(createPlaybackPresetSequence(preset), preset.delays) === currentSignature
    );
    return match?.[0] || 'custom';
  }, [playbackSequence, playbackDelays]);

  const isPlaybackSequencePartAvailable = (key) => resolvePlaybackSequencePartAvailable({ key, advancedDatasetStats });

  const renderPlaybackSequenceBuilder = (compact = false) => renderPlaybackSequenceBuilderView({
    compact,
    playbackSequence,
    isPlaybackSequencePartAvailable,
    vocabularyPlayOrder,
    activeVocabularyOrder,
    changeVocabularyPlayOrder,
    isPlaying,
    reshuffleVocabularyPlayback,
    activePlaybackPreset,
    applyPlaybackPreset,
    shufflePlaybackSequence,
    resetPlaybackSequence,
    togglePlaybackSequencePart,
    setPlaybackSequencePartRepeat,
    movePlaybackSequencePart,
    playbackDelays,
    resetPlaybackDelays,
    setPlaybackDelay
  });

  const renderControlSectionTabs = (compact = false) => renderControlSectionTabsView({
    compact, sidebarSection, setSidebarSection
  });

  const renderMobileTools = () => renderMobileToolsView({
    sidebarSection, renderControlSectionTabs, currentMapCount, mode, renderStatusBadge,
    preferLocalAudio, setPreferLocalAudio, isSystemBusy, voices, selectedVoice: activeBrowserTtsVoice,
    setSelectedVoice: handleActiveBrowserTtsVoiceChange, indonesianVoices, selectedIndonesianVoice: activeBrowserTtsIndonesianVoice,
    setSelectedIndonesianVoice: handleActiveBrowserTtsIndonesianVoiceChange, rate: activeBrowserTtsRate,
    setRate: handleActiveBrowserTtsRateChange, showIndonesianBrowserVoice: (mode === 'table' || structuredTextModeActive),
    renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode, memorySettings,
    setMemorySettings, advancedDatasetStats, isMultiSourceMode, dirtySourceKeys, isCsvDirty,
    openFullPackPicker, sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker,
    removeSourceLayer, saveUpdatedSource, exportMergedDataset, savedDecks, selectedDeckId,
    handleLoadDeck, currentDeckName, setCurrentDeckName, handleSaveDeck, handleDeleteDeckInit,
    csvInputRef, openManualAdd, playlist, tableViewMode, exportTableCSV,
    setIsClearDialogOpen, csvChangeSummary, setIsChangeReviewOpen, undoStack, undoLastDataChange,
    saveUpdatedCSV, rangeInput, setRangeInput, handleRangeAdd, generatorEngine,
    setGeneratorEngine, aiVoiceName, setAiVoiceName, aiVoices,
    userApiKey, onUserApiKeyChange: handleUserApiKeyChange,
    geminiOwnerConfigured: geminiOwnerState.configured, geminiOwnerUnlocked: geminiOwnerState.unlocked,
    onGeminiOwnerUnlock: handleGeminiOwnerUnlock, onGeminiOwnerLock: handleGeminiOwnerLock, geminiByokAvailable: geminiOwnerState.byokAvailable,
    geminiByokRegistered: geminiOwnerState.byokRegistered, onGeminiByokRegister: handleGeminiByokRegister,
    onGeminiByokClear: handleGeminiByokClear, edgeVoices, edgeVoice, setEdgeVoice,
    edgeIndonesianVoice, setEdgeIndonesianVoice, edgeRate, setEdgeRate, edgePitch,
    setEdgePitch, testEdgeBackend, edgeHealth, folderInputRef, isBatchDownloading, isBatchStopping, batchStatusText,
    batchConfig, setBatchConfig, runBatchDownload, isBatchOpen, setIsBatchOpen, showLogs, setShowLogs,
    systemLogs, logContainerRef, storageRefreshToken,
    onDatasetCacheCleared: handleStorageDatasetCacheCleared, onMasteryReset: handleStorageMasteryReset,
    onStudyTrackingReset: handleStorageStudyTrackingReset, masteryByVocabId, activityByVocabId,
    currentVocabIds: currentProgressVocabIds, onProgressRestored: handleProgressRestored,
    textLibraryCatalog, activeTextDocument, activeTextDocumentTree, activeTextDocumentId, activeTextEditorModel,
    textLibraryCommandBusy: (textLibraryCommandBusy || isSystemBusy), textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
    handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryStructuredCommand
  });

  const renderWorkspaceTabs = (mobileContext = false) => renderWorkspaceTabsView({
    mobileContext, handleTabSwitch, tableViewMode, studyQueue, clearStudyQueue
  });

  const renderMasterDataToolbar = (extraClass = '') => renderMasterDataToolbarView({
    extraClass, mode, tableViewMode, playlist, masterSearch, setMasterSearch,
    masterFilter, setMasterFilter, masteryFilter, setMasteryFilter, masteryProgressStats, studyActivityStats,
    isCsvDirty, setIsChangeReviewOpen, csvChangeSummary,
    undoStack, undoLastDataChange, masterFilteredPlaylist, lastDraftAutoSaveAt,
    rangeInput, setRangeInput, handleRangeAdd
  });

  const renderPlaylist = () => {
    if (mode === 'text' && textDatabaseStatus !== 'ready') {
      return <TextHydrationGate status={textDatabaseStatus} error={textDatabaseError} />;
    }
    if (mode === 'text' && activeTextEditorModel === 'structured-v1') {
      return <TextStructuredPlayer
        documentTree={activeTextDocumentTree}
        isPlaying={isPlaying}
        isPaused={isPaused}
        speakingPart={speakingPart}
        playingContext={playingContext}
        playingIndex={playingIndex}
        displayMode={textStructuredPreferences.displayMode}
        playbackChannelMode={textStructuredPreferences.playbackChannelMode}
        onDisplayModeChange={(displayMode) => setTextStructuredPreferences(prev => ({ ...prev, displayMode }))}
        onPlaybackChannelModeChange={(playbackChannelMode) => setTextStructuredPreferences(prev => ({ ...prev, playbackChannelMode }))}
        onPlayDocument={handleStructuredTextPlayDocument}
        onPlayCard={handleStructuredTextPlayCard}
        onPlaySegment={handleStructuredTextPlaySegment}
        onStartFromSegment={handleStructuredTextStartFromSegment}
      />;
    }
    return renderPlaylistViewport({
    rowHeights,
    mode,
    currentPlayerList,
    tableViewMode,
    setTableViewMode,
    playlist,
    newItemTextareaRef,
    isSystemBusy,
    newTextItem,
    setNewTextItem,
    handleAddTextItem,
    renderMasterDataToolbar,
    isMobile,
    scrollTop,
    containerHeight,
    listContainerRef,
    handleScroll,
    playingIndex,
    isPlaying,
    independentPlayingId,
    playingContext,
    studyQueueSet,
    localAudioMapTable,
    toggleStudyItem,
    handleIndependentPlay,
    handleManualRowClick,
    speakingPart,
    isMemoryMode,
    memorySettings,
    revealedCells,
    toggleCellReveal,
    preferLocalAudio,
    generateAIAudio,
    aiLoadingId,
    activeMenuId,
    handleMenuToggle,
    csvChangeSummary,
    generatorEngine,
    openManualEdit,
    deleteStructuredItem,
    expandedAdvancedId,
    setExpandedAdvancedId,
    localAudioMapText,
    handleDeleteTextItem,
    masteryByVocabId,
    cycleMasteryState,
    playbackSequence,
    generatedAudioMeta
    });
  };

  return renderMainAppShellView({
    isMobile, showAppBar, isSidebarOpen, setIsSidebarOpen, goHome,
    isSystemBusy, savedDecks, selectedDeckId, handleLoadDeck, handleDeleteDeckInit,
    currentDeckName, setCurrentDeckName, handleSaveDeck, mode, isCsvDirty,
    csvChangeSummary, saveUpdatedCSV, folderInputRef, sourceInputRef, fullPackInputRef,
    handleFolderSelect, handleSourceUpload, handleFullPackUpload, mobileTab, handleMobileTabSwitch,
    renderWorkspaceTabs, theme, setTheme, handleModeSwitch, sidebarSection,
    renderControlSectionTabs, currentMapCount, renderStatusBadge, preferLocalAudio, setPreferLocalAudio,
    generatorEngine, setGeneratorEngine, aiVoiceName, setAiVoiceName, aiVoices,
    edgeVoices, edgeVoice, setEdgeVoice, edgeIndonesianVoice, setEdgeIndonesianVoice,
    edgeRate, setEdgeRate, edgePitch, setEdgePitch, edgeHealth,
    testEdgeBackend, userApiKey, onUserApiKeyChange: handleUserApiKeyChange,
    geminiOwnerConfigured: geminiOwnerState.configured, geminiOwnerUnlocked: geminiOwnerState.unlocked,
    onGeminiOwnerUnlock: handleGeminiOwnerUnlock, onGeminiOwnerLock: handleGeminiOwnerLock, geminiByokAvailable: geminiOwnerState.byokAvailable,
    geminiByokRegistered: geminiOwnerState.byokRegistered, onGeminiByokRegister: handleGeminiByokRegister,
    onGeminiByokClear: handleGeminiByokClear, batchButtonRef,
    isBatchDownloading, setIsBatchOpen, isBatchOpen, renderBatchPopup, debugButtonRef,
    setShowLogs, showLogs, logContainerRef, systemLogs, voices,
    selectedVoice: activeBrowserTtsVoice, setSelectedVoice: handleActiveBrowserTtsVoiceChange,
    indonesianVoices, selectedIndonesianVoice: activeBrowserTtsIndonesianVoice,
    setSelectedIndonesianVoice: handleActiveBrowserTtsIndonesianVoiceChange,
    rate: activeBrowserTtsRate, setRate: handleActiveBrowserTtsRateChange,
    showIndonesianBrowserVoice: (mode === 'table' || structuredTextModeActive),
    renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode,
    memorySettings, setMemorySettings, advancedDatasetStats, csvInputRef, handleCSVUpload,
    openManualAdd, playlist, tableViewMode, exportTableCSV, setIsClearDialogOpen,
    setIsChangeReviewOpen, undoStack, undoLastDataChange, isMultiSourceMode, textareaRef,
    isLocked, textContent, handleInputContentChange, handleInsertTab, setLockedStates,
    dirtySourceKeys, openFullPackPicker, sourceDiagnostics, sourceChangeSummaries, sourcePack,
    openSourcePicker, removeSourceLayer, saveUpdatedSource, exportMergedDataset, lastDraftAutoSaveAt,
    renderMobileTools, renderPlaylist, isPaused, isPlaying, playingIndex, speakingPart,
    activePlaybackList, handleSmartNav: handlePlayerSmartNav, handleGlobalPlay: handlePlayerGlobalPlay, forceStopAll, playbackMode,
    cyclePlaybackMode, setPlaybackMode, setShowAppBar, playingContext, structuredTextModeActive, isChangeReviewOpen,
    applyChangeRevert, setIsRevertAllConfirmOpen, isRevertAllConfirmOpen, revertAllChanges, isManualEditorOpen,
    closeManualEditor, manualEditingId, importedRowCount, sequenceHighWater, manualForm,
    setManualForm, manualAdvancedOpen, setManualAdvancedOpen, saveManualVocabulary, isClearDialogOpen,
    setTableContent, setCsvBaselineContent, setSourcePack, setSequenceHighWater, setManualIdHighWater,
    setImportedRowCount, setUndoStack, setMasterSearch, setMasterFilter, setLocalAudioMapTable,
    setAudioStatusTable, setTextContent, setLocalAudioMapText, setAudioStatusText, resetFullState, resetTextState, pendingDeleteItem,
    setPendingDeleteItem, confirmDeleteStructuredItem, isDeleteDialogOpen, setIsDeleteDialogOpen, confirmDeleteDeck,
    storageRefreshToken, onDatasetCacheCleared: handleStorageDatasetCacheCleared, onMasteryReset: handleStorageMasteryReset,
    onStudyTrackingReset: handleStorageStudyTrackingReset, masteryByVocabId, activityByVocabId,
    currentVocabIds: currentProgressVocabIds, onProgressRestored: handleProgressRestored,
    textLibraryCatalog, activeTextDocument, activeTextDocumentTree, activeTextDocumentId, activeTextEditorModel,
    textLibraryCommandBusy, textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
    handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryStructuredCommand
  });
};

// --- APP WRAPPER (Theme & View Logic) ---
const APP_VIEW_SESSION_KEY = 'prolingo:view:v1';

const App = () => {
    // Keep the current root view across same-tab reloads/HMR fallbacks.
    // A new browser session still starts on Landing by default.
    const [view, setView] = useState(() => {
        if (typeof window === 'undefined') return 'landing';
        try {
            return window.sessionStorage.getItem(APP_VIEW_SESSION_KEY) === 'app' ? 'app' : 'landing';
        } catch {
            return 'landing';
        }
    });

    const openAppView = () => {
        setView('app');
        try { window.sessionStorage.setItem(APP_VIEW_SESSION_KEY, 'app'); } catch {}
    };

    const openLandingView = () => {
        setView('landing');
        try { window.sessionStorage.removeItem(APP_VIEW_SESSION_KEY); } catch {}
    };
    
    // Theme State: 'light' | 'dark' | 'system'
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'system';
        }
        return 'system';
    });

    // --- REVISED THEME LOGIC: Handles Real-time System Changes ---
    useEffect(() => {
        const root = window.document.documentElement;
        
        // Function to apply the correct class
        const applyTheme = (targetTheme) => {
            root.classList.remove('light', 'dark');
            if (targetTheme === 'system') {
                const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                root.classList.add(systemIsDark ? 'dark' : 'light');
            } else {
                root.classList.add(targetTheme);
            }
        };

        // 1. Apply immediately
        applyTheme(theme);
        
        // 2. Save preference
        localStorage.setItem('theme', theme);

        // 3. Listen for system changes IF theme is 'system'
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            const handleSystemChange = (e) => {
                root.classList.remove('light', 'dark');
                root.classList.add(e.matches ? 'dark' : 'light');
            };

            // Modern event listener
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleSystemChange);
            } else {
                // Deprecated fallback
                mediaQuery.addListener(handleSystemChange);
            }

            // Cleanup listener
            return () => {
                if (mediaQuery.removeEventListener) {
                    mediaQuery.removeEventListener('change', handleSystemChange);
                } else {
                    mediaQuery.removeListener(handleSystemChange);
                }
            };
        }
    }, [theme]);

    return (
        <div className="antialiased transition-colors duration-300">
            {view === 'landing' ? (
                <LandingPage 
                    onStart={openAppView} 
                    theme={theme}
                    setTheme={setTheme}
                />
            ) : (
                <MainApp goHome={openLandingView} theme={theme} setTheme={setTheme} />
            )}
        </div>
    );
};

export default App;