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
import { downloadTextFile, encodeWAV, formatVoiceLabel, getAdvancedContentCount, getAdvancedExpressionPairs, getAudioFilenameIdentity, getItemPartText, getRecordAudioNo, getStableAudioIdentity, getVocabIdentity, groupVoicesByRegion, hasAdvancedContent, isIndonesianAudioPart, sanitizeFilename, triggerBrowserDownload, writeString } from './utils/audioUtils';
import { buildCanonicalTextBrowserAudioPackageFilename } from './domain/text/textFilenameDomain.js';
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
import { buildTableAudioBatchCoverage, shouldDownloadTableCoverageSlot } from './domain/audio/audioDownloadCoverageDomain.js';
import { buildTableAudioGeneratedVariantInventory, buildTableAudioPresenceMap, buildTableAudioVoiceOptions, mergeTableAudioVariantInventories, reconcileTableAudioVoicePriority, resolveTableAudioPlaybackVariant, summarizeTableAudioVariantInventory, tableAudioVariantsFromRecords } from './domain/audio/tableAudioVariantInventoryDomain.js';
import { buildTableAudioStagingVariantInventory, filterTableAudioBatchSessionsForPlaylist, filterTableAudioStagingRecordsForPlaylist, filterTableAudioVariantInventoryForPlaylist, isSameLogicalAudioVoice, isTableAudioScopeMatch, resolveBatchSessionAvailability, resolveTableAudioBookId, summarizeAudioStagingRecords } from './domain/audio/audioStagingDomain.js';
import { clearTableAudioFolderRuntimeCache, executeAudioFolderSelectService, executeRememberedAudioFolderOpenService, executeRememberedAudioFolderRestoreService, forgetRememberedAudioFolderHandle, getTableAudioFolderVariantObjectUrl } from './services/audio/audioFolderLifecycleService';
import { clearTableAudioZipRuntimeCache, getTableAudioZipVariantObjectUrl, readTableAudioZipVariantBlob, scanTableAudioZipFiles } from './services/audio/tableAudioZipArchiveService.js';
import { executeAudioSourcePlaybackService, executeBrowserTtsPlaybackService } from './services/audio/audioPlaybackSideEffectService';
import { executeBrowserTtsVoiceLifecycleEffect, executeSilentAudioAnchorEffect } from './services/audio/audioRuntimeLifecycleService';
import { executeGlobalPlaybackSessionService } from './services/playback/globalPlaybackSessionService';
import { executeMediaSessionLifecycleService } from './services/playback/mediaSessionLifecycleService';
import { executeForceStopPlaybackService, executeGlobalPlayInteraction, executeIndependentPlaybackInteraction, executeManualRowPlaybackInteraction, executeSmartPlaybackNavigation } from './services/playback/playbackInteractionService';
import { executeMobileTabSwitch, executeModeSwitch, executeTableViewTabSwitch } from './services/navigation/viewNavigationService';
import { executeMobileHeaderScroll, executePendingScrollRestoration } from './services/navigation/scrollViewportService';
import { executeActiveRowAutoFollowEffect, executeBodyScrollLockEffect, executeBodyThemeBackgroundEffect, executeForegroundPlaybackVisibilityEffect, executeLogAutoScrollEffect, executeMobileHeaderScrollListenerEffect, executeMobileWindowScrollEffect, executeResponsiveViewportLifecycleEffect, executeSidebarHeaderVisibilityEffect, executeUnsavedCsvBeforeUnloadEffect } from './services/navigation/appWindowLifecycleService';
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
import { hasStructuredTextPlayableChannel, normalizeTextStructuredPreferences, TEXT_STRUCTURED_AUDIO_SOURCE_MODES, TEXT_STRUCTURED_RESUME_MODES } from './domain/text/textStructuredPlaybackPreferenceDomain.js';
import { resolveTextStructuredBrowserVoiceState, resolveTextStructuredVoicePreferencePatch } from './domain/text/textStructuredVoiceDomain.js';
import { buildTextStructuredRuntimeAudioStatusMap, resolveTextStructuredRuntimeAudio } from './domain/text/textStructuredAudioRuntimeDomain.js';
import { summarizeTextStructuredAudioRuntimeInventory } from './domain/text/textStructuredAudioInventoryDomain.js';
import { buildTextStructuredAudioCoverageMap, summarizeTextStructuredAudioCoverage, shouldDownloadTextStructuredCoverageSlot } from './domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata, resolveTextStructuredEffectiveDownloadVoice } from './domain/text/textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredGeneratedFilename, buildTextStructuredGenerationJobs, normalizeTextStructuredAudioGenerationPreferences, resolveTextStructuredGenerationVoiceState } from './domain/text/textStructuredAudioGenerationDomain.js';
import { getTextStructuredSpeakerVoiceMap } from './domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { buildTextStructuredSegmentSpeakerIdentityMetadata, buildTextStructuredSpeakerVoiceProfileV2Metadata, collectTextStructuredConversationSpeakerIdentities, getTextStructuredSegmentSpeakerId } from './domain/text/textStructuredSpeakerIdentityDomain.js';
import { buildTextStructuredAudioContentFingerprint } from './domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredVoiceOverrideMetadata, resolveTextStructuredEffectiveVoiceForItem } from './domain/text/textStructuredVoiceAssignmentDomain.js';
import { TEXT_LIBRARY_COMMAND_TYPES } from './domain/text/textLibraryCommandDomain.js';
import { resolveTextLibrarySearchActionTarget, resolveTextLibrarySearchResults, TEXT_LIBRARY_SEARCH_ACTIONS } from './domain/text/textLibrarySearchDomain.js';
import { executeTextLibraryBootstrapEffect, executeTextLibraryCompatibilityPersistenceEffect } from './services/persistence/textLibraryLifecycleService';
import { executeTextLibraryCreateCollection, executeTextLibraryCreateDocument, executeTextLibraryDeleteCollection, executeTextLibraryDeleteDocument, executeTextLibraryMoveDocument, executeTextLibraryRenameCollection, executeTextLibraryRenameDocument, executeTextLibrarySelectDocument, executeTextLibraryStructuredCommand, resolveTextLibraryActiveProjection } from './services/persistence/textLibraryWorkspaceService.js';
import { executeProLingoTextPackExport, executeProLingoTextPackFileAttachOrSync, executeProLingoTextPackFileImportCopy, executeTextSourceDetach, readTextSourceAttachments } from './services/persistence/textPackJsonService.js';
import { executeProLingoTextDatabaseBackupExport, executeProLingoTextDatabaseReplaceRestore, readProLingoTextDatabaseBackupFile } from './services/persistence/textDatabaseBackupService.js';
import { syncLegacyTextProjectionToDatabase } from './services/persistence/textLibraryIndexedDbService.js';
import { APP_CHECKPOINT_ID, APP_VERSION } from './constants/appMetadata.js';
import { executeStructuredTextPlaybackSessionService } from './services/playback/textStructuredPlaybackSessionService.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from './services/playback/textStructuredAudioRuntimeService.js';
import { executeTextStructuredPreferencePersistenceEffect } from './services/persistence/textStructuredPreferenceService.js';
import { executeTextStructuredAudioGenerationPreferencePersistenceEffect, loadTextStructuredAudioGenerationPreferences } from './services/persistence/textStructuredAudioGenerationPreferenceService.js';
import { clearAudioDownloadHistoryForMode, clearPersistedAudioDownloadHistoryForMode, loadAudioDownloadHistory, persistAudioDownloadHistory, recordAudioDownloadHistory } from './services/persistence/audioDownloadHistoryService.js';
import { executeTextStructuredAudioGenerationRequest } from './services/audio/textStructuredAudioGenerationService.js';
import { triggerBrowserZipDownload } from './services/audio/browserZipService.js';
import { exportStagedAudioZipGroups, exportTableAudioRecordZipGroups, DIRECT_MP3_BATCH_LIMIT } from './services/audio/audioBatchExportService.js';
import { clearAudioStagingExportHistoryForMode, clearAudioStagingForMode, clearAudioStagingRuntimeCache, deleteAudioBatchSession, getAudioStagingBlob, getAudioStagingObjectUrl, listAudioBatchSessions, listAudioStagingMetadata, markAudioStagingExported, putAudioStagingBlob, recoverInterruptedAudioBatchSessions, releaseAudioStagingBlobs, requestPersistentAudioStorage, saveAudioBatchSession } from './services/persistence/audioStagingIndexedDbService.js';
import { executeTextStructuredEdgeHealthCheck } from './services/audio/textStructuredEdgeAudioDownloadService.js';
import { executeTextStructuredAudioFolderChoose, executeTextStructuredAudioFolderReconnect, executeTextStructuredAudioFolderRestore, readTextStructuredAudioFolderFiles, scanTextStructuredAudioFolderFiles, writeTextStructuredAudioFile } from './services/audio/textStructuredAudioFolderService.js';
import { clearTextStructuredAudioZipRuntimeCache, getTextStructuredAudioZipRuntimeObjectUrl, scanTextStructuredAudioZipFiles } from './services/audio/textStructuredAudioZipArchiveService.js';


const TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY = 'prolingo_table_local_audio_playback_v1';
const compactVoiceFilenameLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'Voice';
  const tail = raw.split('-').pop() || raw;
  return sanitizeFilename(tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw);
};

const loadTableLocalAudioPlaybackPreference = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY) || '{}');
    return {
      voiceMode: String(parsed?.voiceMode || 'auto'),
      voicePriority: Array.isArray(parsed?.voicePriority) ? parsed.voicePriority.map(String).filter(Boolean) : []
    };
  } catch {
    return { voiceMode: 'auto', voicePriority: [] };
  }
};

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
  // Final Text C2: canonical JSON source attachments live in Text IndexedDB META.
  const [textSourceAttachments, setTextSourceAttachments] = useState([]);
  // Final Text C4: advanced structured playback controls live in a root Text Player workspace opened from the bottom player.
  const [textPlayerWorkspaceOpen, setTextPlayerWorkspaceOpen] = useState(false);
  // C3.4.1 Table-only: Folder remains the stable source; ZIP archives are an
  // additive lazy source. Voice variants are tracked independently per audio slot.
  const [tableAudioFolderVariantInventory, setTableAudioFolderVariantInventory] = useState({});
  const [tableAudioZipVariantInventory, setTableAudioZipVariantInventory] = useState({});
  const [tableAudioZipSources, setTableAudioZipSources] = useState([]);
  const [tableLocalAudioPlaybackPreference, setTableLocalAudioPlaybackPreference] = useState(loadTableLocalAudioPlaybackPreference);
  // C3.4: delivery history persists the fact that a browser download/package was
  // triggered even when mobile Chrome cannot re-open Downloads for verification.
  const [audioDownloadHistory, setAudioDownloadHistory] = useState(loadAudioDownloadHistory);
  const audioDownloadHistoryRef = useRef(audioDownloadHistory);
  const recordAudioDownloadHistoryDurably = useCallback((records) => {
    const next = recordAudioDownloadHistory(audioDownloadHistoryRef.current || {}, records);
    audioDownloadHistoryRef.current = next;
    persistAudioDownloadHistory(next);
    setAudioDownloadHistory(next);
    return next;
  }, []);
  // v5.13.0 / R2: generated Table audio lives in a separate IndexedDB staging
  // database. React keeps metadata only; binary Blobs are resolved lazily.
  const [tableAudioStagingRecords, setTableAudioStagingRecords] = useState([]);
  const [tableAudioBatchSessions, setTableAudioBatchSessions] = useState([]);
  const tableAudioScrollFrameRef = useRef(null);
  const tableAudioPendingScrollTopRef = useRef(0);
  const activeRowFollowRuntimeRef = useRef({ rafId: null, startTimerId: null, unlockTimerId: null, hidden: false, resumePending: false });
  // P4-A4: Text Library UI command state belongs to Text only and never participates in Table busy state.
  const [textLibraryCommandBusy, setTextLibraryCommandBusy] = useState(false);
  const [textLibraryCommandError, setTextLibraryCommandError] = useState(null);
  // P4-A16: Text-only library search/focus state. Search never reuses Table masterSearch.
  const [textLibrarySearchQuery, setTextLibrarySearchQuery] = useState('');
  const [pendingTextLibrarySearchAction, setPendingTextLibrarySearchAction] = useState(null);
  const [textLibrarySearchFocusTarget, setTextLibrarySearchFocusTarget] = useState(null);
  const textLibrarySearchFocusNonceRef = useRef(0);
  // P4-A10: session-only URLs for structured Text audio. IndexedDB stores metadata only.
  const [structuredTextAudioRuntimeUrls, setStructuredTextAudioRuntimeUrls] = useState({});
  const structuredTextAudioRuntimeUrlsRef = useRef({});
  // P4-A12: Text-owned generator/folder state. These preferences never read Table generator settings.
  const [structuredTextAudioGenerationPreferences, setStructuredTextAudioGenerationPreferences] = useState(loadTextStructuredAudioGenerationPreferences);
  const [structuredTextAudioGenerationState, setStructuredTextAudioGenerationState] = useState({ running: false, completed: 0, total: 0, current: null, failedJobs: [], lastStatus: null });
  const [structuredTextEdgeHealth, setStructuredTextEdgeHealth] = useState({ status: 'idle', message: 'Not tested' });
  const [structuredTextAudioFolderState, setStructuredTextAudioFolderState] = useState({ status: 'idle', name: null, matchedCount: 0, orphanCount: 0, legacyCount: 0, aliasMatchedCount: 0 });
  // C3.4.2 Text-only: ZIP audio archives are additive to the remembered Folder.
  // The archive itself is session-bound; only its index is kept in runtime state.
  const [structuredTextAudioZipState, setStructuredTextAudioZipState] = useState({ archives: [], matchedCount: 0, orphanCount: 0, legacyCount: 0, aliasMatchedCount: 0, unsupportedCount: 0 });
  const structuredTextAudioGenerationAbortRef = useRef(null);
  const structuredTextAudioBatchStopRef = useRef(false);
  const structuredTextAudioDirectoryHandleRef = useRef(null);
  const structuredTextAudioRememberedHandleRef = useRef(null);
  const structuredTextAudioFolderRestoreAttemptedRef = useRef(false);

  useEffect(() => {
    structuredTextAudioRuntimeUrlsRef.current = structuredTextAudioRuntimeUrls;
  }, [structuredTextAudioRuntimeUrls]);

  useEffect(() => {
    executeTextStructuredAudioGenerationPreferencePersistenceEffect(structuredTextAudioGenerationPreferences);
  }, [structuredTextAudioGenerationPreferences]);

  useEffect(() => {
    audioDownloadHistoryRef.current = audioDownloadHistory;
    persistAudioDownloadHistory(audioDownloadHistory);
  }, [audioDownloadHistory]);

  useEffect(() => {
    const validIds = new Set((textLibrarySnapshot?.audioVariants || []).map(item => item.id));
    setStructuredTextAudioRuntimeUrls(prev => {
      let changed = false;
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (validIds.has(id)) next[id] = entry;
        else {
          changed = true;
          if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
        }
      });
      return changed ? next : prev;
    });
  }, [textLibrarySnapshot?.audioVariants]);

  useEffect(() => () => {
    Object.values(structuredTextAudioRuntimeUrlsRef.current || {}).forEach(entry => {
      if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
    });
    clearTextStructuredAudioZipRuntimeCache();
  }, []);

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
    activeVocabularyOrderRef, playbackContextRef, currentUtteranceRef, ttsReplayRef, synth, folderInputRef, audioZipInputRef, csvInputRef, sourceInputRef,
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
    setSourcePack,
    setSelectedDeckId,
    setCurrentDeckName,
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
      isSidebarOpen, mobileTab, setShowAppBar, listContainerRef, followRuntimeRef: activeRowFollowRuntimeRef, setScrollTop
  }), [currentIndex, mode, currentPlayerList, isPlaying, playingContext, tableViewMode, independentPlayingId, rowHeights, isMobile, isSidebarOpen, mobileTab, setScrollTop]);

  useEffect(() => executeForegroundPlaybackVisibilityEffect({
      currentPlayerList, playingIndex, isPlaying, independentPlayingId, playingContext, mode, tableViewMode,
      prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling, isSidebarOpen, mobileTab,
      setShowAppBar, listContainerRef, followRuntimeRef: activeRowFollowRuntimeRef, setScrollTop
  }), [currentPlayerList, playingIndex, isPlaying, independentPlayingId, playingContext, mode, tableViewMode, rowHeights, isMobile, isSidebarOpen, mobileTab, setScrollTop]);

  // --- MODIFIED SCROLL LISTENER FOR MOBILE (BLOCKER ADDED) ---
  useEffect(() => executeMobileWindowScrollEffect({
      isMobile, setScrollTop, setContainerHeight
  }), [isMobile]);

  useEffect(() => executeLogAutoScrollEffect({ logContainerRef }), [systemLogs, showLogs, mobileTab]);

  const addLog = useCallback((type, message) => executeSystemLogAppend({ type, message, setSystemLogs }), [setSystemLogs]);

  const refreshTableAudioStaging = useCallback(async () => {
    try {
      const rows = await listAudioStagingMetadata({ mode: 'table', includeReleased: true });
      setTableAudioStagingRecords(rows);
      return rows;
    } catch (error) {
      addLog('Warn', `Audio Staging metadata refresh failed: ${error?.message || error}`);
      return [];
    }
  }, [addLog]);

  const refreshTableAudioBatchSessions = useCallback(async () => {
    try {
      const rows = await listAudioBatchSessions({ mode: 'table' });
      setTableAudioBatchSessions(rows);
      return rows;
    } catch (error) {
      addLog('Warn', `Batch Session refresh failed: ${error?.message || error}`);
      return [];
    }
  }, [addLog]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listAudioStagingMetadata({ mode: 'table', includeReleased: true }),
      recoverInterruptedAudioBatchSessions({ mode: 'table' }),
      requestPersistentAudioStorage()
    ]).then(([staging, sessions]) => {
      if (cancelled) return;
      setTableAudioStagingRecords(staging || []);
      setTableAudioBatchSessions(sessions || []);
    }).catch(error => {
      if (!cancelled) addLog('Warn', `R2 Audio Staging restore: ${error?.message || error}`);
    });
    return () => { cancelled = true; };
  }, [addLog]);

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
    if (textDatabaseStatus !== 'hydrated' && textDatabaseStatus !== 'ready') return undefined;
    let cancelled = false;
    readTextSourceAttachments()
      .then(attachments => { if (!cancelled) setTextSourceAttachments(attachments); })
      .catch(error => { if (!cancelled) addLog('Error', `Text source registry load failed: ${error?.message || error}`); });
    return () => { cancelled = true; };
  }, [textDatabaseStatus, addLog]);

  useEffect(() => {
    setTextIdentityState(prev => reconcileTextIdentityState(prev, textContent));
  }, [textContent, setTextIdentityState]);

  const activeTextEditorModel = textLibrarySnapshot?.documents?.find(document => document.id === activeTextDocumentId)?.editorModel || null;
  const textLibraryCatalog = useMemo(() => textLibrarySnapshot ? resolveTextLibraryCatalog(textLibrarySnapshot) : { rootDocuments: [], collections: [] }, [textLibrarySnapshot]);
  const activeTextDocumentTree = useMemo(() => textLibrarySnapshot && activeTextDocumentId ? resolveTextLibraryDocumentTree(textLibrarySnapshot, activeTextDocumentId) : null, [textLibrarySnapshot, activeTextDocumentId]);
  const activeTextDocument = activeTextDocumentTree ? { ...activeTextDocumentTree, blocks: undefined } : null;
  const textLibrarySearchResults = useMemo(
    () => resolveTextLibrarySearchResults(textLibrarySnapshot, textLibrarySearchQuery),
    [textLibrarySnapshot, textLibrarySearchQuery]
  );
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
  useEffect(() => { if (!structuredTextModeActive) setTextPlayerWorkspaceOpen(false); }, [structuredTextModeActive]);
  // P4-A11: speaker profiles are document metadata, not audio identity. The requested
  // voice can differ per conversation speaker while SEGMENT_ID/TXTAUDIO identity stays stable.
  const structuredTextSpeakerVoiceMap = useMemo(
    () => getTextStructuredSpeakerVoiceMap(activeTextDocumentTree),
    [activeTextDocumentTree?.metadata]
  );
  const defaultStructuredTextVoiceId = textStructuredPreferences.browserTextVoiceName || selectedTextBrowserVoice?.name || null;
  const defaultStructuredMeaningVoiceId = textStructuredPreferences.browserMeaningVoiceName || selectedTextIndonesianVoice?.name || null;
  const resolveStructuredTextChannelVoiceState = useCallback((item, channel) => {
    const isMeaning = channel === 'meaning';
    const defaultVoice = isMeaning ? selectedTextIndonesianVoice : selectedTextBrowserVoice;
    const defaultVoiceId = isMeaning ? defaultStructuredMeaningVoiceId : defaultStructuredTextVoiceId;
    const assignment = resolveTextStructuredEffectiveVoiceForItem({
      documentTree: activeTextDocumentTree,
      item,
      channel,
      defaultVoiceName: defaultVoiceId,
    });
    const requestedVoiceId = assignment.voiceName || defaultVoice?.name || null;
    const pool = isMeaning ? indonesianVoices : voices;
    const exactVoice = requestedVoiceId
      ? (Array.isArray(pool) ? pool : []).find(voice => String(voice?.name || '').trim() === requestedVoiceId)
      : null;
    return {
      requestedVoiceId,
      ttsVoice: exactVoice || defaultVoice || null,
      mappedVoiceAvailable: Boolean(exactVoice),
      assignmentSource: assignment.source
    };
  }, [activeTextDocumentTree, selectedTextBrowserVoice, selectedTextIndonesianVoice, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, voices, indonesianVoices]);
  const structuredTextAudioRuntimeStatusMap = useMemo(() => buildTextStructuredRuntimeAudioStatusMap({
    documentTree: activeTextDocumentTree,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls,
    textVoiceId: defaultStructuredTextVoiceId,
    meaningVoiceId: defaultStructuredMeaningVoiceId,
    speakerVoiceMap: structuredTextSpeakerVoiceMap,
    preferredGeneratedEngine: 'edge',
    downloadPreferences: structuredTextAudioGenerationPreferences
  }), [activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, structuredTextSpeakerVoiceMap, structuredTextAudioGenerationPreferences]);
  const structuredTextAudioCoverageMap = useMemo(() => buildTextStructuredAudioCoverageMap({
    documentTree: activeTextDocumentTree,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls,
    preferences: structuredTextAudioGenerationPreferences
  }), [activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, structuredTextAudioGenerationPreferences]);
  const structuredTextDocumentCoverage = useMemo(() => {
    const channels = [];
    if (structuredTextAudioGenerationPreferences?.generateText !== false) channels.push('text');
    if (structuredTextAudioGenerationPreferences?.generateMeaning !== false) channels.push('meaning');
    return summarizeTextStructuredAudioCoverage({
      documentTree: activeTextDocumentTree,
      coverageMap: structuredTextAudioCoverageMap,
      channels
    });
  }, [activeTextDocumentTree, structuredTextAudioCoverageMap, structuredTextAudioGenerationPreferences?.generateText, structuredTextAudioGenerationPreferences?.generateMeaning]);
  const activeTableAudioStagingRecords = useMemo(
    () => filterTableAudioStagingRecordsForPlaylist(tableAudioStagingRecords, playlist),
    [tableAudioStagingRecords, playlist]
  );
  const tableAudioStagingVariantInventory = useMemo(
    () => buildTableAudioStagingVariantInventory(tableAudioStagingRecords, { playlist }),
    [tableAudioStagingRecords, playlist]
  );
  // System controls report total origin staging usage; the Batch panel below uses
  // active-deck staging only so Book A never appears as loaded inside Book B.
  const tableAudioStagingSummary = useMemo(
    () => summarizeAudioStagingRecords(tableAudioStagingRecords),
    [tableAudioStagingRecords]
  );
  const activeTableAudioStagingSummary = useMemo(
    () => summarizeAudioStagingRecords(activeTableAudioStagingRecords),
    [activeTableAudioStagingRecords]
  );
  const tableAudioGeneratedVariantInventory = useMemo(() => filterTableAudioVariantInventoryForPlaylist(buildTableAudioGeneratedVariantInventory({
    localAudioMapTable,
    generatedAudioMeta
  }), playlist), [localAudioMapTable, generatedAudioMeta, playlist]);
  const activeTableAudioFolderVariantInventory = useMemo(
    () => filterTableAudioVariantInventoryForPlaylist(tableAudioFolderVariantInventory, playlist),
    [tableAudioFolderVariantInventory, playlist]
  );
  const activeTableAudioZipVariantInventory = useMemo(
    () => filterTableAudioVariantInventoryForPlaylist(tableAudioZipVariantInventory, playlist),
    [tableAudioZipVariantInventory, playlist]
  );
  const tableGeneratedSessionAudioCount = useMemo(() => {
    const folderUrls = new Set();
    Object.values(tableAudioFolderVariantInventory || {}).forEach(variants => {
      (Array.isArray(variants) ? variants : []).forEach(variant => {
        if (variant?.sourceType === 'folder' && variant?.url) folderUrls.add(variant.url);
      });
    });
    return Object.values(localAudioMapTable || {}).reduce((count, url) => count + (url && !folderUrls.has(url) ? 1 : 0), 0);
  }, [localAudioMapTable, tableAudioFolderVariantInventory]);
  const tableAudioVariantInventory = useMemo(() => mergeTableAudioVariantInventories(
    tableAudioStagingVariantInventory,
    tableAudioGeneratedVariantInventory,
    activeTableAudioFolderVariantInventory,
    activeTableAudioZipVariantInventory
  ), [tableAudioStagingVariantInventory, tableAudioGeneratedVariantInventory, activeTableAudioFolderVariantInventory, activeTableAudioZipVariantInventory]);
  const tableAudioVoiceOptions = useMemo(() => buildTableAudioVoiceOptions({
    inventory: tableAudioVariantInventory,
    edgeVoices: initialEdgeVoices
  }), [tableAudioVariantInventory]);
  const activeTableAudioBatchSessions = useMemo(
    () => filterTableAudioBatchSessionsForPlaylist(tableAudioBatchSessions, playlist),
    [tableAudioBatchSessions, playlist]
  );
  const tableAudioBatchAvailabilityById = useMemo(() => Object.fromEntries(
    (activeTableAudioBatchSessions || []).map(session => [session.id, resolveBatchSessionAvailability({ session, inventory: tableAudioVariantInventory })])
  ), [activeTableAudioBatchSessions, tableAudioVariantInventory]);
  const tableAudioVoicePriority = tableLocalAudioPlaybackPreference.voicePriority;
  const tableLocalAudioVoiceMode = tableLocalAudioPlaybackPreference.voiceMode || 'auto';
  useEffect(() => {
    const reconciled = reconcileTableAudioVoicePriority({ currentPriority: tableAudioVoicePriority, voiceOptions: tableAudioVoiceOptions });
    const available = new Set(tableAudioVoiceOptions.map(option => String(option.id || '').toLowerCase()));
    const nextMode = tableLocalAudioVoiceMode === 'auto' || available.has(String(tableLocalAudioVoiceMode || '').toLowerCase())
      ? tableLocalAudioVoiceMode
      : 'auto';
    const samePriority = reconciled.length === tableAudioVoicePriority.length && reconciled.every((id, index) => id === tableAudioVoicePriority[index]);
    if (!samePriority || nextMode !== tableLocalAudioVoiceMode) {
      setTableLocalAudioPlaybackPreference(prev => ({ ...prev, voiceMode: nextMode, voicePriority: reconciled }));
    }
  }, [tableAudioVoiceOptions, tableAudioVoicePriority, tableLocalAudioVoiceMode]);
  useEffect(() => {
    try { localStorage.setItem(TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY, JSON.stringify(tableLocalAudioPlaybackPreference)); } catch { /* best effort */ }
  }, [tableLocalAudioPlaybackPreference]);
  const tableAudioInventorySummary = useMemo(() => summarizeTableAudioVariantInventory(tableAudioVariantInventory), [tableAudioVariantInventory]);
  const tableAudioUiMap = useMemo(() => buildTableAudioPresenceMap({
    inventory: tableAudioVariantInventory,
    // R2.2: unscoped legacy NO-only runtime maps must not make a new deck look
    // loaded. Scoped generated audio is already represented in the inventory.
    legacyMap: {}
  }), [tableAudioVariantInventory]);
  const tableAudioZipSummary = useMemo(() => ({
    archiveCount: tableAudioZipSources.length,
    matchedCount: tableAudioZipSources.reduce((sum, archive) => sum + Number(archive?.matchedCount || 0), 0),
    audioFileCount: tableAudioZipSources.reduce((sum, archive) => sum + Number(archive?.audioFileCount || 0), 0),
    unsupportedCount: tableAudioZipSources.reduce((sum, archive) => sum + Number(archive?.unsupportedCount || 0), 0),
    names: tableAudioZipSources.map(archive => archive.name)
  }), [tableAudioZipSources]);
  const setTableLocalAudioVoiceMode = useCallback((voiceMode) => {
    setTableLocalAudioPlaybackPreference(prev => ({ ...prev, voiceMode: voiceMode || 'auto' }));
  }, []);
  const moveTableLocalAudioVoicePriority = useCallback((voiceId, direction) => {
    setTableLocalAudioPlaybackPreference(prev => {
      const list = [...(prev.voicePriority || [])];
      const index = list.findIndex(id => String(id).toLowerCase() === String(voiceId || '').toLowerCase());
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return prev;
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      return { ...prev, voicePriority: list };
    });
  }, []);

  const tableAudioBatchCoverage = useMemo(() => buildTableAudioBatchCoverage({
    playlist,
    batchConfig,
    generatorEngine,
    edgeVoice,
    edgeIndonesianVoice,
    localAudioMapTable,
    generatedAudioMeta,
    tableAudioVariantInventory,
    downloadHistory: audioDownloadHistory,
    stagingRecords: activeTableAudioStagingRecords
  }), [playlist, batchConfig, generatorEngine, edgeVoice, edgeIndonesianVoice, localAudioMapTable, generatedAudioMeta, tableAudioVariantInventory, audioDownloadHistory, activeTableAudioStagingRecords]);
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

  const handleStructuredTextAudioGenerationPreferenceChange = useCallback((patch) => {
    setStructuredTextAudioGenerationPreferences(prev => normalizeTextStructuredAudioGenerationPreferences({ ...prev, ...(patch || {}) }));
  }, []);
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

  const resetFullState = () => {
    // C3.4.1 Table archive/variant state is session runtime state and must leave
    // together with the legacy local-audio maps on a full reset.
    clearTableAudioZipRuntimeCache();
    setTableAudioZipVariantInventory({});
    setTableAudioZipSources([]);
    setTableAudioFolderVariantInventory(prev => {
      Object.values(prev || {}).forEach(variants => {
        (variants || []).forEach(variant => {
          if (!variant?.url) return;
          try { URL.revokeObjectURL(variant.url); } catch { /* noop */ }
        });
      });
      return {};
    });
    return executeResetFullState({
      localAudioMapTable, localAudioMapText, setLocalAudioMapTable, setLocalAudioMapText,
      setAudioStatusTable, setAudioStatusText, setCurrentIndex, setMasterIndex, setStudyIndex,
      setPlayingIndex, setPlayingContext, setStudyQueue, setTableViewMode, forceStopAll, addLog
    });
  };

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
  const getLocalAudioUrl = async (item, part) => {
    if (mode !== 'table') return resolveLocalAudioUrl({ mode, item, part, localAudioMapTable, localAudioMapText });
    const mapKey = `${getStableAudioIdentity(item)}_${part}`;
    const itemScope = { vocabId: getVocabIdentity(item), bookId: resolveTableAudioBookId(item) };
    const variants = (tableAudioVariantInventory?.[mapKey] || []).filter(variant =>
      isTableAudioScopeMatch(variant, itemScope)
    );
    const selectedVariant = resolveTableAudioPlaybackVariant({
      variants,
      voiceMode: tableLocalAudioVoiceMode,
      voicePriority: tableAudioVoicePriority
    });
    if (selectedVariant?.url) return selectedVariant.url;
    if (selectedVariant?.sourceType === 'staging') return getAudioStagingObjectUrl(selectedVariant.stagingId);
    if (selectedVariant?.sourceType === 'folder') return getTableAudioFolderVariantObjectUrl(selectedVariant);
    if (selectedVariant?.sourceType === 'zip') return getTableAudioZipVariantObjectUrl(selectedVariant);
    // R2.2: raw legacy Table maps are NO-based and cannot prove deck scope.
    // Scoped generated audio is already represented in tableAudioVariantInventory;
    // ambiguous raw maps fail closed instead of leaking Book A into Book B.
    return null;
  };

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

  const applyStructuredTextAudioFolderFiles = useCallback(async (files, folderName = null) => {
    const scan = scanTextStructuredAudioFolderFiles({
      files,
      audioVariants: textLibrarySnapshot?.audioVariants || [],
      segments: textLibrarySnapshot?.segments || []
    });
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = { ...prev };
      scan.matches.forEach(({ file, variant }) => {
        const previous = next[variant.id];
        if (previous?.url) { try { URL.revokeObjectURL(previous.url); } catch {} }
        next[variant.id] = {
          url: URL.createObjectURL(file),
          filename: file.name,
          mimeType: file.type || variant.mimeType || null,
          folderBacked: true
        };
      });
      return next;
    });
    setStructuredTextAudioFolderState(prev => ({
      ...prev,
      status: 'connected',
      name: folderName || prev.name,
      matchedCount: scan.matches.length,
      orphanCount: scan.orphans.length,
      legacyCount: scan.legacy?.length || 0,
      aliasMatchedCount: scan.matches.filter(match => match.aliasMatched).length
    }));
    addLog('Text Audio', `Structured audio folder scan: ${scan.matches.length} matched, ${scan.orphans.length} orphan, ${scan.legacy?.length || 0} legacy unresolved.`);
    return scan;
  }, [textLibrarySnapshot?.audioVariants, textLibrarySnapshot?.segments, addLog]);

  const handleStructuredTextAddAudioZipFiles = useCallback(async (files) => {
    const selected = Array.from(files || []).filter(file => /\.zip$/i.test(file?.name || '') || String(file?.type || '').includes('zip'));
    if (!selected.length) return { status: 'no-files' };
    const scan = await scanTextStructuredAudioZipFiles({
      files: selected,
      audioVariants: textLibrarySnapshot?.audioVariants || [],
      segments: textLibrarySnapshot?.segments || []
    });
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = { ...prev };
      scan.matches.forEach(match => {
        const current = next[match.variant.id];
        // Folder/generated runtime remains preferred when already connected.
        if (current?.url || current?.folderBacked || current?.generated || current?.zipBacked) return;
        next[match.variant.id] = {
          url: null,
          filename: match.filename,
          mimeType: match.mimeType || match.variant.mimeType || null,
          zipBacked: true,
          archiveId: match.archiveId,
          archiveName: match.archiveName,
          archiveFile: match.archiveFile,
          entryId: match.entryId,
          zipEntry: match.entry,
          aliasMatched: Boolean(match.aliasMatched)
        };
      });
      return next;
    });
    setStructuredTextAudioZipState(prev => {
      const archiveMap = new Map();
      [...(prev.archives || []), ...(scan.archives || [])].forEach(archive => {
        if (!archive?.id || archiveMap.has(archive.id)) return;
        archiveMap.set(archive.id, archive);
      });
      const archives = [...archiveMap.values()];
      return {
        archives,
        matchedCount: archives.reduce((sum, archive) => sum + Number(archive.matchedCount || 0), 0),
        orphanCount: archives.reduce((sum, archive) => sum + Number(archive.orphanCount || 0), 0),
        legacyCount: archives.reduce((sum, archive) => sum + Number(archive.legacyCount || 0), 0),
        aliasMatchedCount: archives.reduce((sum, archive) => sum + Number(archive.aliasMatchedCount || 0), 0),
        unsupportedCount: archives.reduce((sum, archive) => sum + Number(archive.unsupportedCount || 0), 0)
      };
    });
    addLog('Text Audio', `ZIP archive: ${scan.archiveCount} added • ${scan.matchedCount} matched • ${scan.orphanCount} orphan • ${scan.legacyCount} legacy unresolved.`);
    return { status: 'added', ...scan };
  }, [textLibrarySnapshot?.audioVariants, textLibrarySnapshot?.segments, addLog]);

  const handleStructuredTextClearAudioZipFiles = useCallback(() => {
    clearTextStructuredAudioZipRuntimeCache();
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (!entry?.zipBacked) next[id] = entry;
      });
      return next;
    });
    setStructuredTextAudioZipState({ archives: [], matchedCount: 0, orphanCount: 0, legacyCount: 0, aliasMatchedCount: 0, unsupportedCount: 0 });
    addLog('Text Audio', 'Text ZIP archives cleared. Remembered Audio Folder remains active.');
  }, [addLog]);

  const handleStructuredTextChooseAudioFolder = useCallback(async () => {
    const result = await executeTextStructuredAudioFolderChoose();
    if (result.status === 'unsupported') {
      setStructuredTextAudioFolderState(prev => ({ ...prev, status: 'unsupported' }));
      addLog('Warn', 'Structured audio remembered folder is not supported by this browser; browser downloads/manual reconnect remain available.');
      return result;
    }
    if (!result.handle) {
      if (result.status !== 'cancelled') addLog('Warn', `Structured audio folder: ${result.status}.`);
      return result;
    }
    structuredTextAudioDirectoryHandleRef.current = result.handle;
    structuredTextAudioRememberedHandleRef.current = result.handle;
    const files = await readTextStructuredAudioFolderFiles(result.handle);
    await applyStructuredTextAudioFolderFiles(files, result.name);
    addLog('Text Audio', `Generation folder ready: ${result.name}.`);
    return result;
  }, [applyStructuredTextAudioFolderFiles, addLog]);

  const handleStructuredTextReconnectAudioFolder = useCallback(async () => {
    const result = await executeTextStructuredAudioFolderReconnect(structuredTextAudioRememberedHandleRef.current);
    if (!result.handle) return result;
    structuredTextAudioDirectoryHandleRef.current = result.handle;
    structuredTextAudioRememberedHandleRef.current = result.handle;
    const files = await readTextStructuredAudioFolderFiles(result.handle);
    await applyStructuredTextAudioFolderFiles(files, result.name);
    return result;
  }, [applyStructuredTextAudioFolderFiles]);

  useEffect(() => {
    if (textDatabaseStatus !== 'ready' || structuredTextAudioFolderRestoreAttemptedRef.current) return;
    structuredTextAudioFolderRestoreAttemptedRef.current = true;
    let cancelled = false;
    executeTextStructuredAudioFolderRestore().then(async result => {
      if (cancelled) return;
      if (result.status === 'restored' && result.handle) {
        structuredTextAudioDirectoryHandleRef.current = result.handle;
        structuredTextAudioRememberedHandleRef.current = result.handle;
        const files = await readTextStructuredAudioFolderFiles(result.handle);
        if (!cancelled) await applyStructuredTextAudioFolderFiles(files, result.name);
      } else if (result.status === 'reconnect-required') {
        structuredTextAudioRememberedHandleRef.current = result.rememberedHandle || null;
        setStructuredTextAudioFolderState(prev => ({ ...prev, status: 'reconnect-required', name: result.name || prev.name }));
      } else if (result.status === 'unsupported') {
        setStructuredTextAudioFolderState(prev => ({ ...prev, status: 'unsupported' }));
      }
    }).catch(error => {
      if (!cancelled) addLog('Warn', `Structured audio folder restore failed: ${error?.message || error}`);
    });
    return () => { cancelled = true; };
  }, [textDatabaseStatus, applyStructuredTextAudioFolderFiles, addLog]);

  const registerStructuredTextGeneratedBlob = useCallback(async ({
    item,
    channel,
    blob,
    generationVoiceState,
    deferBrowserDelivery = false
  }) => {
    const segmentId = item?.segmentId || item?.id;
    const engine = generationVoiceState.engine;
    const engineVoiceId = generationVoiceState.engineVoiceId;
    const downloadProfileVoiceId = generationVoiceState.downloadProfileVoiceId || engineVoiceId;
    const playbackProfileVoiceId = generationVoiceState.playbackProfileVoiceId || null;
    const content = channel === 'meaning' ? item?.meaning : item?.text;
    const baseMetadata = {
      generatedBy: 'P4-C3.4',
      generatedAt: Date.now(),
      engineVoiceId,
      downloadProfileVoiceId,
      playbackProfileVoiceId,
      assignmentSource: generationVoiceState.assignmentSource || 'global-download',
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel, content }),
      speaker: item?.speaker || null,
      profileMatched: Boolean(generationVoiceState.matchedProfile)
    };
    const first = await executeTextLibraryStructuredCommand({
      command: {
        type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
        payload: {
          segmentId,
          channel,
          source: 'generated',
          engine,
          voiceId: engineVoiceId,
          language: channel === 'meaning' ? 'id' : 'en',
          mimeType: blob.type || null,
          metadata: { ...baseMetadata, deliveryStatus: 'generated-session' }
        }
      },
      setTextLibrarySnapshot,
      addLog
    });
    const filename = buildTextStructuredGeneratedFilename({
      audioVariantId: first.id,
      segmentId,
      channel,
      engine,
      engineVoiceId,
      mimeType: blob.type
    });

    let deliveryStatus = 'generated-session';
    let packagePending = false;
    const runtimeUrl = URL.createObjectURL(blob);
    setStructuredTextAudioRuntimeUrls(prev => {
      const previous = prev?.[first.id];
      if (previous?.url) { try { URL.revokeObjectURL(previous.url); } catch {} }
      return {
        ...prev,
        [first.id]: { url: runtimeUrl, filename, mimeType: blob.type || null, generated: true }
      };
    });

    const folderHandle = structuredTextAudioDirectoryHandleRef.current;
    if (folderHandle) {
      const writeResult = await writeTextStructuredAudioFile({ directoryHandle: folderHandle, filename, blob });
      if (writeResult.status === 'written') {
        deliveryStatus = 'folder-written';
      } else if (deferBrowserDelivery) {
        deliveryStatus = 'pending-package';
        packagePending = true;
        addLog('Warn', `Generation folder unavailable (${writeResult.status}); adding ${filename} to browser batch package.`);
      } else {
        deliveryStatus = 'browser-direct-triggered';
        triggerBrowserDownload(runtimeUrl, filename);
        addLog('Warn', `Generation folder unavailable (${writeResult.status}); browser download triggered for ${filename}.`);
      }
    } else if (deferBrowserDelivery) {
      deliveryStatus = 'pending-package';
      packagePending = true;
    } else {
      deliveryStatus = 'browser-direct-triggered';
      triggerBrowserDownload(runtimeUrl, filename);
    }

    const metadata = { ...baseMetadata, deliveryStatus, deliveredAt: deliveryStatus === 'pending-package' ? null : Date.now() };
    const completed = await executeTextLibraryStructuredCommand({
      command: {
        type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
        payload: {
          segmentId,
          channel,
          source: 'generated',
          engine,
          voiceId: engineVoiceId,
          language: channel === 'meaning' ? 'id' : 'en',
          filename,
          mimeType: blob.type || null,
          metadata
        }
      },
      setTextLibrarySnapshot,
      addLog
    });

    return { ...completed, filename, engine, engineVoiceId, downloadProfileVoiceId, playbackProfileVoiceId, deliveryStatus, packagePending, blob };
  }, [setTextLibrarySnapshot, addLog]);

  const markStructuredTextPackagedDelivery = useCallback(async (records = []) => {
    for (const record of records) {
      if (!record?.id) continue;
      await executeTextLibraryStructuredCommand({
        command: {
          type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
          payload: {
            segmentId: record.segmentId,
            channel: record.channel,
            source: record.source || 'generated',
            engine: record.engine || 'edge',
            voiceId: record.voiceId || record.engineVoiceId,
            language: record.language || (record.channel === 'meaning' ? 'id' : 'en'),
            filename: record.filename,
            mimeType: record.mimeType || null,
            metadata: { ...(record.metadata || {}), deliveryStatus: 'browser-package-triggered', deliveredAt: Date.now() }
          }
        },
        setTextLibrarySnapshot,
        addLog
      });
    }
  }, [setTextLibrarySnapshot, addLog]);

  const generateStructuredTextAudioJob = useCallback(async ({ segmentId, channel, downloadVoiceId = null, downloadVoiceSource = null }, options = {}) => {
    const item = structuredTextPlaybackList.find(candidate => (candidate?.segmentId || candidate?.id) === segmentId);
    if (!item) throw new Error(`Unknown structured Text segment: ${segmentId}`);
    const content = channel === 'meaning' ? item.meaning : item.text;
    if (!String(content || '').trim()) return { status: 'skipped-empty', segmentId, channel };
    const block = (activeTextDocumentTree?.blocks || []).find(candidate => candidate.id === item.blockId) || null;
    const segment = (block?.segments || []).find(candidate => candidate.id === segmentId) || item;
    const resolvedDownloadVoice = downloadVoiceId
      ? { voiceId: downloadVoiceId, source: downloadVoiceSource || 'job-download' }
      : resolveTextStructuredEffectiveDownloadVoice({ documentTree: activeTextDocumentTree, block, segment, channel, preferences: structuredTextAudioGenerationPreferences });
    const generationVoiceState = {
      ...resolveTextStructuredGenerationVoiceState({
        channel,
        requestedDownloadVoiceId: resolvedDownloadVoice.voiceId,
        preferences: structuredTextAudioGenerationPreferences,
        edgeVoices: initialEdgeVoices
      }),
      assignmentSource: resolvedDownloadVoice.source
    };

    const controller = new AbortController();
    structuredTextAudioGenerationAbortRef.current = controller;
    setStructuredTextAudioGenerationState(prev => ({ ...prev, current: { segmentId, channel, engine: generationVoiceState.engine, voice: generationVoiceState.engineVoiceId } }));
    try {
      const generated = await executeTextStructuredAudioGenerationRequest({
        engine: generationVoiceState.engine,
        text: content,
        engineVoiceId: generationVoiceState.engineVoiceId,
        edgeRate: structuredTextAudioGenerationPreferences.edgeRate,
        edgePitch: structuredTextAudioGenerationPreferences.edgePitch,
        geminiAccessUnlocked: false,
        signal: controller.signal,
        onRetry: options.batch
          ? ({ nextAttempt, maxAttempts, error }) => addLog('Text Generate', `Retry ${nextAttempt}/${maxAttempts}: ${segmentId}/${channel} • ${error.message}`)
          : null
      });
      const registered = await registerStructuredTextGeneratedBlob({
        item,
        channel,
        blob: generated.blob,
        generationVoiceState,
        deferBrowserDelivery: Boolean(options.deferBrowserDelivery)
      });
      addLog('Text Generate', `${segmentId}/${channel} • ${generationVoiceState.engine.toUpperCase()} • ${generationVoiceState.engineVoiceId} → ${registered.filename}.`);
      return { status: 'success', segmentId, channel, ...registered };
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (!options.batch) addLog('Text Generate', `${segmentId}/${channel} cancelled.`);
        return { status: 'cancelled', segmentId, channel };
      }
      if (!options.batch) addLog('Error', `Text Generate ${segmentId}/${channel}: ${error?.message || error}`);
      return { status: 'error', segmentId, channel, error: error?.message || String(error) };
    } finally {
      if (structuredTextAudioGenerationAbortRef.current === controller) structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [structuredTextPlaybackList, activeTextDocumentTree, structuredTextAudioGenerationPreferences, registerStructuredTextGeneratedBlob, addLog]);

  const handleStructuredTextGenerateAudio = useCallback(async (segmentId, channel) => {
    if (structuredTextAudioGenerationState.running) return null;
    forceStopAll();
    setStructuredTextAudioGenerationState({ running: true, completed: 0, total: 1, current: { segmentId, channel }, failedJobs: [], lastStatus: null });
    const result = await generateStructuredTextAudioJob({ segmentId, channel });
    setStructuredTextAudioGenerationState({
      running: false,
      completed: result?.status === 'success' ? 1 : 0,
      total: 1,
      current: null,
      failedJobs: result?.status === 'error' ? [{ segmentId, channel }] : [],
      lastStatus: result?.status || 'unknown'
    });
    return result;
  }, [structuredTextAudioGenerationState.running, forceStopAll, generateStructuredTextAudioJob]);

  const runStructuredTextAudioGenerationBatch = useCallback(async (jobsCandidate = null, options = {}) => {
    if (structuredTextAudioGenerationState.running || !activeTextDocumentTree) return null;
    forceStopAll();
    const allJobs = Array.isArray(jobsCandidate)
      ? jobsCandidate
      : buildTextStructuredGenerationJobs({ documentTree: activeTextDocumentTree, preferences: structuredTextAudioGenerationPreferences });
    const missingOnly = options.missingOnly !== false;
    const jobs = missingOnly
      ? allJobs.filter(job => shouldDownloadTextStructuredCoverageSlot(structuredTextAudioCoverageMap?.[`${String(job.segmentId || '').toUpperCase()}::${job.channel}`]))
      : allJobs;
    if (!jobs.length) {
      addLog('Text Generate', missingOnly ? 'Audio Download: selected scope is already covered.' : 'Audio Download: no jobs in selected scope.');
      return { status: 'up-to-date', completed: 0, total: 0, failedJobs: [] };
    }
    structuredTextAudioBatchStopRef.current = false;
    const failedJobs = [];
    const packageRecords = [];
    let completed = 0;
    setStructuredTextAudioGenerationState({ running: true, completed: 0, total: jobs.length, current: null, failedJobs: [], lastStatus: 'running' });
    try {
      for (const job of jobs) {
        if (structuredTextAudioBatchStopRef.current) break;
        const result = await generateStructuredTextAudioJob(job, { batch: true, deferBrowserDelivery: true });
        if (result?.status === 'success' || result?.status === 'skipped-empty') completed += 1;
        else if (result?.status === 'error') failedJobs.push(job);
        if (result?.status === 'success' && result?.packagePending && result?.blob) packageRecords.push(result);
        if (result?.status === 'cancelled' && structuredTextAudioBatchStopRef.current) break;
        setStructuredTextAudioGenerationState(prev => ({ ...prev, completed, failedJobs: [...failedJobs] }));
        if (!structuredTextAudioBatchStopRef.current) await new Promise(resolve => setTimeout(resolve, 250));
      }

      if (packageRecords.length) {
        const safeTitle = sanitizeFilename(activeTextDocumentTree?.title || 'Text_Document').replace(/\s+/g, '_');
        const packageResult = await triggerBrowserZipDownload({
          entries: packageRecords.map(record => ({ filename: record.filename, blob: record.blob })),
          filename: buildCanonicalTextBrowserAudioPackageFilename({ title: safeTitle, createdAt: Date.now() })
        });
        await markStructuredTextPackagedDelivery(packageRecords);
        addLog('Text Generate', `Browser package: ${packageResult.fileCount} audio → ${packageResult.filename}.`);
      }

      const stopped = structuredTextAudioBatchStopRef.current;
      const status = stopped ? 'cancelled' : failedJobs.length ? 'completed-with-errors' : 'completed';
      setStructuredTextAudioGenerationState({ running: false, completed, total: jobs.length, current: null, failedJobs, lastStatus: status });
      addLog('Text Generate', `Batch ${status}: ${completed}/${jobs.length}, failed ${failedJobs.length}.`);
      return { status, completed, total: jobs.length, failedJobs, packaged: packageRecords.length };
    } finally {
      structuredTextAudioBatchStopRef.current = false;
      structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [structuredTextAudioGenerationState.running, activeTextDocumentTree, structuredTextAudioGenerationPreferences, structuredTextAudioCoverageMap, forceStopAll, generateStructuredTextAudioJob, markStructuredTextPackagedDelivery, addLog]);

  const handleStructuredTextCancelGeneration = useCallback(() => {
    structuredTextAudioBatchStopRef.current = true;
    try { structuredTextAudioGenerationAbortRef.current?.abort(); } catch {}
    setStructuredTextAudioGenerationState(prev => ({ ...prev, lastStatus: 'cancelling' }));
  }, []);

  const handleStructuredTextRetryFailedGeneration = useCallback(() => {
    const jobs = structuredTextAudioGenerationState.failedJobs || [];
    if (!jobs.length) return null;
    return runStructuredTextAudioGenerationBatch(jobs);
  }, [structuredTextAudioGenerationState.failedJobs, runStructuredTextAudioGenerationBatch]);

  const playStructuredTextChannel = async (textToRead, item, channel) => {
    const voiceState = resolveStructuredTextChannelVoiceState(item, channel);
    const targetVoice = voiceState.ttsVoice;
    const targetVoiceId = voiceState.requestedVoiceId;

    if (textStructuredPreferences.audioSourceMode !== TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY && targetVoiceId) {
      const block = (activeTextDocumentTree?.blocks || []).find(candidate => candidate.id === item?.blockId) || null;
      const segment = (block?.segments || []).find(candidate => candidate.id === (item?.segmentId || item?.id)) || item;
      const generatedVoice = resolveTextStructuredEffectiveDownloadVoice({
        documentTree: activeTextDocumentTree,
        block,
        segment,
        channel,
        preferences: structuredTextAudioGenerationPreferences
      });
      const runtimeAudio = resolveTextStructuredRuntimeAudio({
        audioVariants: textLibrarySnapshot?.audioVariants || [],
        runtimeAudioUrls: structuredTextAudioRuntimeUrls,
        segmentId: item?.segmentId || item?.id,
        channel,
        requestedVoiceId: targetVoiceId,
        preferredGeneratedVoiceId: generatedVoice.voiceId,
        preferredGeneratedEngine: 'edge',
        content: textToRead
      });
      if (runtimeAudio?.url || runtimeAudio?.runtime?.zipBacked) {
        let runtimeUrl = runtimeAudio.url;
        if (!runtimeUrl && runtimeAudio.runtime?.zipBacked) {
          try {
            runtimeUrl = await getTextStructuredAudioZipRuntimeObjectUrl(runtimeAudio.runtime);
          } catch (error) {
            addLog('Warn', `Text ZIP audio ${runtimeAudio.filename || runtimeAudio.variant.id} could not be read: ${error?.message || error}. Falling back to Browser TTS.`);
          }
        }
        if (runtimeUrl) {
        const result = await executeStructuredTextRuntimeAudioPlaybackService({
          url: runtimeUrl,
          currentAudioObjRef,
          playbackResolveRef,
          stopSignalRef,
          playbackRate: 1,
          addLog,
          label: `Text Player ${runtimeAudio.variant.id}/${channel}`
        });
        if (result.status === 'played' || result.status === 'stopped' || stopSignalRef.current) return;
        // Error falls through to Browser TTS with the same requested voice.
        }
      }
    }

    if (!targetVoice) {
      addLog('Warn', `Text Player: ${channel === 'meaning' ? 'Meaning/ID' : 'Text/EN'} Browser TTS voice is not ready; channel skipped for ${item?.segmentId || item?.id || 'segment'}.`);
      return;
    }
    if (targetVoiceId && targetVoice?.name !== targetVoiceId && item?.speaker) {
      addLog('Warn', `Text Player: speaker ${item.speaker} requested ${targetVoiceId}, unavailable in Browser TTS; using ${targetVoice.name} fallback.`);
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
      playbackOrderMode: textStructuredPreferences.playbackOrderMode,
      repeatMode: textStructuredPreferences.repeatMode,
      channelDelayMs: textStructuredPreferences.channelDelayMs,
      segmentDelayMs: textStructuredPreferences.segmentDelayMs,
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
    const allowResumeCursor = textStructuredPreferences.resumeMode !== TEXT_STRUCTURED_RESUME_MODES.RESTART;
    const resumeId = allowResumeCursor && structuredTextActivePlaybackList.some(item => item.id === playingIndex) ? playingIndex : null;
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
    const activeSessionOrder = playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      && Array.isArray(playbackContextRef.current?.orderedList)
      && playbackContextRef.current.orderedList.length
        ? playbackContextRef.current.orderedList
        : structuredTextActivePlaybackList;
    const anchorId = activeSessionOrder.some(item => item.id === playingIndex)
      ? playingIndex
      : activeSessionOrder[0]?.id;
    const target = resolveStructuredTextAdjacentSegment({
      list: activeSessionOrder,
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
    if (textLibraryCommandBusy || isSystemBusy || structuredTextAudioGenerationState.running) return null;
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
  }, [textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, addLog]);

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


  const handleTextLibrarySearchAction = useCallback(async (result, requestedAction = TEXT_LIBRARY_SEARCH_ACTIONS.OPEN) => {
    if (!result?.documentId) return null;
    const target = resolveTextLibrarySearchActionTarget(result, requestedAction);
    textLibrarySearchFocusNonceRef.current += 1;
    const request = { ...target, nonce: textLibrarySearchFocusNonceRef.current };
    setPendingTextLibrarySearchAction(request);
    if (target.documentId !== activeTextDocumentId) {
      const selected = await handleTextLibrarySelectDocument(target.documentId);
      if (!selected) {
        setPendingTextLibrarySearchAction(current => current?.nonce === request.nonce ? null : current);
        return null;
      }
    }
    return request;
  }, [activeTextDocumentId, handleTextLibrarySelectDocument]);

  useEffect(() => {
    const request = pendingTextLibrarySearchAction;
    if (!request || mode !== 'text' || activeTextDocumentTree?.id !== request.documentId) return;

    const block = request.blockId
      ? (activeTextDocumentTree.blocks || []).find(item => item.id === request.blockId) || null
      : null;
    const segment = request.segmentId
      ? (block?.segments || []).find(item => item.id === request.segmentId) || null
      : null;

    // Fail closed to the nearest stable parent if an indexed search result became stale
    // after an edit/import between click and document activation.
    const focusTarget = {
      documentId: activeTextDocumentTree.id,
      blockId: block?.id || null,
      segmentId: segment?.id || null,
      nonce: request.nonce
    };
    setTextLibrarySearchFocusTarget(activeTextEditorModel === 'structured-v1' ? focusTarget : null);
    if (isMobile) setIsSidebarOpen(false);

    if (activeTextEditorModel === 'structured-v1') {
      if (request.action === TEXT_LIBRARY_SEARCH_ACTIONS.PLAY) {
        if (segment?.id) {
          startStructuredTextPlayback({ startSegmentId: segment.id, scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT });
        } else if (block?.id) {
          startStructuredTextPlayback({ blockId: block.id, scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD });
        } else {
          startStructuredTextPlayback({ scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT });
        }
      } else if (request.action === TEXT_LIBRARY_SEARCH_ACTIONS.START_HERE && segment?.id) {
        startStructuredTextPlayback({ startSegmentId: segment.id, scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE });
      }
    }

    setPendingTextLibrarySearchAction(current => current?.nonce === request.nonce ? null : current);
  }, [pendingTextLibrarySearchAction, mode, activeTextDocumentTree, activeTextEditorModel, isMobile, setIsSidebarOpen]);

  const handleTextLibrarySearchFocusConsumed = useCallback((nonce) => {
    setTextLibrarySearchFocusTarget(current => current?.nonce === nonce ? null : current);
  }, []);

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
  const handleTextLibraryMoveDocument = useCallback((id, collectionId) => runTextLibraryUiCommand(() => executeTextLibraryMoveDocument({ id, collectionId, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryDeleteDocument = useCallback((id) => runTextLibraryUiCommand(async () => {
    forceStopAll();
    setCurrentIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    return executeTextLibraryDeleteDocument({
      id, activeTextDocumentId, activeTextEditorModel, textIdentityState,
      setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, addLog
    });
  }), [runTextLibraryUiCommand, forceStopAll, activeTextDocumentId, activeTextEditorModel, textIdentityState, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, addLog]);
  const handleTextLibraryRenameCollection = useCallback((id, title) => runTextLibraryUiCommand(() => executeTextLibraryRenameCollection({ id, title, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryDeleteCollection = useCallback((id) => runTextLibraryUiCommand(() => executeTextLibraryDeleteCollection({ id, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryStructuredCommand = useCallback((command) => runTextLibraryUiCommand(() => executeTextLibraryStructuredCommand({ command, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);

  const textPackSourceMetadata = useMemo(() => ({
    appVersion: APP_VERSION,
    checkpoint: 'Final Text T2 — Canonical Source Lifecycle',
    engineeringLine: APP_CHECKPOINT_ID
  }), []);

  const handleTextPackExportDocument = useCallback(() => runTextLibraryUiCommand(async () => {
    if (!textLibrarySnapshot || !activeTextDocument?.id) throw new Error('No active Text Document to export');
    if (activeTextDocument.editorModel !== 'structured-v1') throw new Error('A14 Text Pack export supports structured-v1 Documents only');
    const result = executeProLingoTextPackExport({
      snapshot: textLibrarySnapshot,
      scopeType: 'document',
      rootId: activeTextDocument.id,
      title: activeTextDocument.title,
      source: textPackSourceMetadata
    });
    addLog('Text Pack', `Exported Document ${activeTextDocument.id} → ${result.filename}.`);
    return result;
  }), [runTextLibraryUiCommand, textLibrarySnapshot, activeTextDocument, textPackSourceMetadata, addLog]);

  const handleTextPackExportCollection = useCallback(() => runTextLibraryUiCommand(async () => {
    const collectionId = activeTextDocument?.collectionId || null;
    if (!textLibrarySnapshot || !collectionId) throw new Error('Active Text Document is not inside a Collection');
    const collection = textLibrarySnapshot.collections.find(item => item.id === collectionId);
    if (!collection) throw new Error(`Collection ${collectionId} is missing`);
    const result = executeProLingoTextPackExport({
      snapshot: textLibrarySnapshot,
      scopeType: 'collection',
      rootId: collection.id,
      title: collection.title,
      source: textPackSourceMetadata
    });
    addLog('Text Pack', `Exported Collection ${collection.id} → ${result.filename}.`);
    return result;
  }), [runTextLibraryUiCommand, textLibrarySnapshot, activeTextDocument?.collectionId, textPackSourceMetadata, addLog]);

  const applyTextSourceSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setTextLibrarySnapshot(snapshot);
    const nextActiveId = snapshot.activeDocumentId || null;
    if (nextActiveId !== activeTextDocumentId) {
      const projection = resolveTextLibraryActiveProjection(snapshot);
      setActiveTextDocumentId(nextActiveId);
      setTextIdentityState(projection.textIdentityState);
      setTextContent(projection.textContent);
      setCurrentIndex(null);
      setPlayingIndex(null);
      setPlayingContext(null);
    }
  }, [activeTextDocumentId, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, setCurrentIndex, setPlayingIndex, setPlayingContext]);

  const handleTextPackAttachOrSync = useCallback((file) => runTextLibraryUiCommand(async () => {
    const result = await executeProLingoTextPackFileAttachOrSync({ file });
    applyTextSourceSnapshot(result.snapshot);
    setTextSourceAttachments(result.attachments || []);
    const stats = result.stats || {};
    addLog('Text Source', result.mode === 'attach'
      ? `Attached ${result.packageId}: ${result.counts?.documents || 0} Document, ${result.counts?.blocks || 0} Card, ${result.counts?.segments || 0} Segment.`
      : `Synced ${result.packageId}: +${stats.created || 0} ~${stats.updated || 0} -${stats.deleted || 0}; local-preserved ${stats.preservedLocal || 0}.`);
    return result;
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, addLog]);

  const handleTextPackImportCopy = useCallback((file) => runTextLibraryUiCommand(async () => {
    const merged = await executeProLingoTextPackFileImportCopy({ file });
    setTextLibrarySnapshot(merged.snapshot);
    addLog('Text Pack', `Imported independent copy ${merged.packageId}: +${merged.counts.documents} Document, +${merged.counts.blocks} Card, +${merged.counts.segments} Segment.`);
    return merged;
  }), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);

  const handleTextSourceDetach = useCallback((attachmentId, removeData = false) => runTextLibraryUiCommand(async () => {
    if (removeData) forceStopAll();
    const result = await executeTextSourceDetach({ attachmentId, removeData });
    applyTextSourceSnapshot(result.snapshot);
    setTextSourceAttachments(result.attachments || []);
    addLog('Text Source', removeData
      ? `Removed source-owned local data for ${result.attachment?.packageId || attachmentId} (${result.counts?.removed || 0} records).`
      : `Detached ${result.attachment?.packageId || attachmentId}; local data kept as independent Text data.`);
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, applyTextSourceSnapshot, addLog]);

  const textDatabaseBackupSourceMetadata = useMemo(() => ({
    appVersion: APP_VERSION,
    checkpoint: 'Final Text T2 — Canonical Source Lifecycle',
    engineeringLine: APP_CHECKPOINT_ID
  }), []);

  const handleTextDatabaseBackupExport = useCallback(() => runTextLibraryUiCommand(async () => {
    if (activeTextDocumentId && activeTextEditorModel === 'legacy-line-v1') {
      const flushed = await syncLegacyTextProjectionToDatabase({
        documentId: activeTextDocumentId,
        textIdentityState
      });
      if (flushed?.librarySnapshot) setTextLibrarySnapshot(flushed.librarySnapshot);
    }
    const result = await executeProLingoTextDatabaseBackupExport({ source: textDatabaseBackupSourceMetadata });
    addLog('Text DB', `Full backup exported → ${result.filename}.`);
    return result;
  }), [runTextLibraryUiCommand, activeTextDocumentId, activeTextEditorModel, textIdentityState, setTextLibrarySnapshot, textDatabaseBackupSourceMetadata, addLog]);

  const handleTextDatabaseBackupInspect = useCallback((file) => runTextLibraryUiCommand(async () => {
    const prepared = await readProLingoTextDatabaseBackupFile(file);
    const counts = prepared.diagnostics?.counts || {};
    addLog('Text DB', `Backup validated: ${counts.documents || 0} Document, ${counts.blocks || 0} Card, ${counts.segments || 0} Segment.`);
    return prepared;
  }), [runTextLibraryUiCommand, addLog]);

  const handleTextDatabaseBackupRestore = useCallback((backup) => runTextLibraryUiCommand(async () => {
    forceStopAll();
    setCurrentIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    setSavedIndices(prev => ({ ...prev, text: null }));
    const result = await executeProLingoTextDatabaseReplaceRestore({ backup });
    const projection = resolveTextLibraryActiveProjection(result.snapshot);
    setTextLibrarySnapshot(result.snapshot);
    setActiveTextDocumentId(result.snapshot.activeDocumentId || null);
    setTextIdentityState(projection.textIdentityState);
    setTextContent(projection.textContent);
    setTextSourceAttachments(await readTextSourceAttachments());
    const counts = result.diagnostics?.counts || {};
    addLog('Text DB', `REPLACE restore complete: ${counts.documents || 0} Document, ${counts.blocks || 0} Card, ${counts.segments || 0} Segment, ${counts.audioVariants || 0} audio metadata.`);
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, addLog]);

  const textLibraryShellDocumentTree = useMemo(() => ({
    ...(activeTextDocumentTree || {}),
    blocks: activeTextDocumentTree?.blocks || [],
    __packActions: {
      exportDocument: handleTextPackExportDocument,
      exportCollection: activeTextDocument?.collectionId ? handleTextPackExportCollection : null,
      attachOrSync: handleTextPackAttachOrSync,
      importCopy: handleTextPackImportCopy,
      detachSource: handleTextSourceDetach,
      sourceAttachments: textSourceAttachments
    },
    __databaseBackupActions: {
      exportDatabase: handleTextDatabaseBackupExport,
      inspectBackup: handleTextDatabaseBackupInspect,
      restoreDatabase: handleTextDatabaseBackupRestore
    },
    __search: {
      query: textLibrarySearchQuery,
      results: textLibrarySearchResults,
      onQueryChange: setTextLibrarySearchQuery,
      onAction: handleTextLibrarySearchAction
    }
  }), [activeTextDocumentTree, activeTextDocument?.collectionId, handleTextPackExportDocument, handleTextPackExportCollection, handleTextPackAttachOrSync, handleTextPackImportCopy, handleTextSourceDetach, textSourceAttachments, handleTextDatabaseBackupExport, handleTextDatabaseBackupInspect, handleTextDatabaseBackupRestore, textLibrarySearchQuery, textLibrarySearchResults, handleTextLibrarySearchAction]);

  const handleStructuredTextAttachAudioFile = useCallback(async (segmentId, channel, file) => {
    if (!file || !segmentId || !['text', 'meaning'].includes(channel)) return null;
    const item = structuredTextPlaybackList.find(candidate => (candidate?.segmentId || candidate?.id) === segmentId) || { id: segmentId, segmentId };
    const voiceState = resolveStructuredTextChannelVoiceState(item, channel);
    const voiceId = voiceState.requestedVoiceId;
    if (!voiceId) {
      addLog('Warn', `Text Audio: select a ${channel === 'meaning' ? 'Meaning/ID' : 'Text/EN'} voice before attaching local audio.`);
      return null;
    }
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
      payload: {
        segmentId,
        channel,
        source: 'file',
        engine: 'local',
        voiceId,
        language: channel === 'meaning' ? 'id' : 'en',
        filename: file.name,
        mimeType: file.type || null,
        metadata: {
          runtimeAttachment: true,
          fileSize: file.size,
          lastModified: file.lastModified || null,
          assignmentSource: voiceState.assignmentSource || 'global',
          contentFingerprint: buildTextStructuredAudioContentFingerprint({
            channel,
            content: channel === 'meaning' ? item?.meaning : item?.text
          })
        }
      }
    });
    if (!result?.id) return null;
    const url = URL.createObjectURL(file);
    setStructuredTextAudioRuntimeUrls(prev => {
      const previous = prev?.[result.id];
      if (previous?.url) { try { URL.revokeObjectURL(previous.url); } catch {} }
      return { ...prev, [result.id]: { url, filename: file.name, mimeType: file.type || null } };
    });
    addLog('Text Audio', `${result.id} attached to ${segmentId}/${channel} • ${voiceId}.`);
    return result;
  }, [handleTextLibraryStructuredCommand, structuredTextPlaybackList, resolveStructuredTextChannelVoiceState, addLog]);

  const ensureStructuredTextSpeakerIdentity = useCallback(async (speakerLike) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const candidates = collectTextStructuredConversationSpeakerIdentities(activeTextDocumentTree);
    const requestedId = typeof speakerLike === 'object' ? String(speakerLike?.id || '').trim() : '';
    const requestedLabel = typeof speakerLike === 'object' ? String(speakerLike?.label || '').trim() : String(speakerLike || '').trim();
    const normalizedLabel = requestedLabel.toLowerCase().replace(/\s+/g, ' ');
    const identity = candidates.find(item => requestedId && item.id === requestedId)
      || candidates.find(item => String(item.label || '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedLabel)
      || null;
    if (!identity?.id) return null;
    for (const segmentId of identity.segmentIds || []) {
      const segment = (activeTextDocumentTree.blocks || []).flatMap(block => block.segments || []).find(item => item.id === segmentId);
      if (!segment || getTextStructuredSegmentSpeakerId(segment) === identity.id) continue;
      await handleTextLibraryStructuredCommand({
        type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
        payload: { id: segment.id, metadata: buildTextStructuredSegmentSpeakerIdentityMetadata(segment.metadata, identity.id) }
      });
    }
    return identity;
  }, [activeTextDocumentTree, handleTextLibraryStructuredCommand]);

  const handleStructuredTextSpeakerVoiceChange = useCallback(async (speakerLike, voiceName, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const identity = await ensureStructuredTextSpeakerIdentity(speakerLike);
    if (!identity) return null;
    const metadata = buildTextStructuredSpeakerVoiceProfileV2Metadata({
      metadata: activeTextDocumentTree.metadata,
      speakerId: identity.id,
      channel,
      voiceName
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Voice', `${identity.label} • ${channel} → ${voiceName || 'Document default'} • ${identity.id}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, ensureStructuredTextSpeakerIdentity, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSpeakerDownloadVoiceChange = useCallback(async (speakerLike, voiceId, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const identity = await ensureStructuredTextSpeakerIdentity(speakerLike);
    if (!identity) return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      voiceId,
      speakerId: identity.id
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio', `${identity.label} • ${channel} download → ${voiceId || 'Global default'} • ${identity.id}.`);
    return result;
  }, [activeTextDocumentTree, ensureStructuredTextSpeakerIdentity, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextCardVoiceChange = useCallback(async (blockId, channel = 'text', voiceName = null, speakerLike = null) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(item => item.id === blockId);
    if (!block) return null;
    forceStopAll();
    const speaker = typeof speakerLike === 'object' ? speakerLike?.label : speakerLike;
    const speakerId = typeof speakerLike === 'object' ? speakerLike?.id : null;
    const metadata = buildTextStructuredVoiceOverrideMetadata({
      metadata: block.metadata,
      channel,
      voiceName,
      speaker,
      speakerId
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
      payload: { id: block.id, metadata }
    });
    if (result) addLog('Text Voice', `${block.id}${speaker ? `/${speaker}` : ''} • ${channel} → ${voiceName || 'inherit'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSegmentVoiceChange = useCallback(async (segmentId, channel = 'text', voiceName = null) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(candidate => (candidate.segments || []).some(segment => segment.id === segmentId));
    const segment = (block?.segments || []).find(item => item.id === segmentId);
    if (!segment) return null;
    forceStopAll();
    const metadata = buildTextStructuredVoiceOverrideMetadata({
      metadata: segment.metadata,
      channel,
      voiceName
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
      payload: { id: segment.id, metadata }
    });
    if (result) addLog('Text Voice', `${segment.id} • ${channel} → ${voiceName || 'inherit'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextCardDownloadVoiceChange = useCallback(async (blockId, channel = 'text', voiceId = null, speakerLike = null) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(item => item.id === blockId);
    if (!block) return null;
    const speaker = typeof speakerLike === 'object' ? speakerLike?.label : speakerLike;
    const speakerId = typeof speakerLike === 'object' ? speakerLike?.id : null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({
      metadata: block.metadata,
      channel,
      voiceId,
      speaker,
      speakerId
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
      payload: { id: block.id, metadata }
    });
    if (result) addLog('Text Download', `${block.id}${speaker ? `/${speaker}` : ''} • ${channel} → ${voiceId || 'global Edge default'}.`);
    return result;
  }, [activeTextDocumentTree, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSegmentDownloadVoiceChange = useCallback(async (segmentId, channel = 'text', voiceId = null) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(candidate => (candidate.segments || []).some(segment => segment.id === segmentId));
    const segment = (block?.segments || []).find(item => item.id === segmentId);
    if (!segment) return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({ metadata: segment.metadata, channel, voiceId });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
      payload: { id: segment.id, metadata }
    });
    if (result) addLog('Text Download', `${segment.id} • ${channel} → ${voiceId || 'inherit'}.`);
    return result;
  }, [activeTextDocumentTree, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextPreviewTts = useCallback(async (segmentId, channel = 'text') => {
    if (structuredTextAudioGenerationState.running) return null;
    const item = structuredTextPlaybackList.find(candidate => (candidate?.segmentId || candidate?.id) === segmentId);
    if (!item) return null;
    const content = channel === 'meaning' ? item.meaning : item.text;
    if (!String(content || '').trim()) return null;
    const voiceState = resolveStructuredTextChannelVoiceState(item, channel);
    if (!voiceState.ttsVoice) {
      addLog('Warn', `Text TTS Preview: ${channel} voice unavailable for ${segmentId}.`);
      return null;
    }
    return safePlayTransition(async () => {
      addLog('Text TTS', `${segmentId}/${channel} • ${voiceState.assignmentSource || 'global'} • ${voiceState.requestedVoiceId || voiceState.ttsVoice.name}.`);
      return executeBrowserTtsPlaybackService({
        textToRead: content,
        overrideVoice: voiceState.ttsVoice,
        selectedVoiceRef: { current: voiceState.ttsVoice },
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
    });
  }, [structuredTextAudioGenerationState.running, structuredTextPlaybackList, resolveStructuredTextChannelVoiceState, safePlayTransition, addLog, stopSignalRef, pauseStateRef, synth, currentUtteranceRef, ttsReplayRef, playbackResolveRef, textStructuredPreferences.browserTtsRate]);

  const handleStructuredTextGenerateCardAudio = useCallback((blockId, channels = null, options = {}) => {
    if (!activeTextDocumentTree) return null;
    const jobs = buildTextStructuredGenerationJobs({
      documentTree: activeTextDocumentTree,
      preferences: structuredTextAudioGenerationPreferences,
      blockId,
      channels
    });
    return runStructuredTextAudioGenerationBatch(jobs, { missingOnly: options.missingOnly !== false });
  }, [activeTextDocumentTree, structuredTextAudioGenerationPreferences, runStructuredTextAudioGenerationBatch]);

  const handleStructuredTextGenerateSpeakerAudio = useCallback((blockId, speaker, channels = null, options = {}) => {
    if (!activeTextDocumentTree) return null;
    const jobs = buildTextStructuredGenerationJobs({
      documentTree: activeTextDocumentTree,
      preferences: structuredTextAudioGenerationPreferences,
      blockId,
      speaker,
      channels
    });
    return runStructuredTextAudioGenerationBatch(jobs, { missingOnly: options.missingOnly !== false });
  }, [activeTextDocumentTree, structuredTextAudioGenerationPreferences, runStructuredTextAudioGenerationBatch]);

  const handleStructuredTextEdgeHealthCheck = useCallback(async () => {
    if (structuredTextAudioGenerationState.running || structuredTextEdgeHealth.status === 'testing') return null;
    const generationVoiceState = resolveTextStructuredGenerationVoiceState({
      channel: 'text',
      requestedDownloadVoiceId: structuredTextAudioGenerationPreferences.edgeTextVoiceId,
      preferences: structuredTextAudioGenerationPreferences,
      edgeVoices: initialEdgeVoices
    });
    setStructuredTextEdgeHealth({ status: 'testing', message: `Testing ${generationVoiceState.engineVoiceId}...` });
    try {
      const result = await executeTextStructuredEdgeHealthCheck({ voiceId: generationVoiceState.engineVoiceId });
      const message = `${result.voiceId} • ${Math.max(1, Math.round(result.size / 1024))} KB`;
      setStructuredTextEdgeHealth({ status: 'online', message });
      addLog('Text Edge', `Online • ${message}`);
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      setStructuredTextEdgeHealth({ status: 'error', message });
      addLog('Error', `Text Edge health: ${message}`);
      return { status: 'error', error: message };
    }
  }, [structuredTextAudioGenerationState.running, structuredTextEdgeHealth.status, defaultStructuredTextVoiceId, structuredTextAudioGenerationPreferences, addLog]);

  const handleStructuredTextRemoveAudioVariant = useCallback(async (variantId) => {
    if (!variantId) return null;
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_AUDIO_VARIANT,
      payload: { id: variantId }
    });
    if (!result) return null;
    setStructuredTextAudioRuntimeUrls(prev => {
      const previous = prev?.[variantId];
      if (previous?.url) { try { URL.revokeObjectURL(previous.url); } catch {} }
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    return result;
  }, [handleTextLibraryStructuredCommand]);


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
    const generationScope = mode === 'table'
      ? { vocabId: getVocabIdentity(item), bookId: resolveTableAudioBookId(item) }
      : null;
    const requestedDownloadVoice = generatorEngine === 'edge'
      ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
      : aiVoiceName;
    const selectedExistingVariant = mode === 'table'
      ? resolveTableAudioPlaybackVariant({
          variants: (tableAudioVariantInventory?.[mapKey] || []).filter(variant =>
            isTableAudioScopeMatch(variant, generationScope)
            && String(variant?.voiceId || '').toLowerCase() === String(requestedDownloadVoice || '').toLowerCase()
          ),
          voiceMode: requestedDownloadVoice || 'auto',
          voicePriority: requestedDownloadVoice ? [requestedDownloadVoice] : tableAudioVoicePriority
        })
      : null;
    // R2.3: raw Table runtime maps are NO-only legacy state and cannot prove
    // which VOCAB_ID they belong to. Scoped inventory is authoritative.
    const existingUrl = mode === 'table' ? null : activeMap?.[mapKey];
    const hasExistingAudio = Boolean(selectedExistingVariant || existingUrl);

    if (hasExistingAudio && !options.skipReplaceConfirm) {
      const metaKey = `${mode}:${mapKey}`;
      const existingMeta = generatedAudioMetaRef.current?.[metaKey];
      const currentSource = selectedExistingVariant
        ? `${String(selectedExistingVariant.sourceType || 'local').toUpperCase()} • ${selectedExistingVariant.voiceId || 'voice'}${selectedExistingVariant.filename ? ` • ${selectedExistingVariant.filename}` : ''}`
        : existingMeta
          ? `${String(existingMeta.engine || '').toUpperCase()} • ${existingMeta.voice || 'voice'}${existingMeta.filename ? ` • ${existingMeta.filename}` : ''}`
          : 'Audio Folder / local audio yang sedang ter-load';
      const nextVoice = generatorEngine === 'edge'
        ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
        : aiVoiceName;
      const ok = window.confirm(
        `Audio untuk ${part} sudah ada.\n\nSaat ini: ${currentSource}\nAudio baru: ${generatorEngine.toUpperCase()} • ${nextVoice || 'voice'}\n\nLanjut generate ulang? Audio baru akan disimpan ke Audio Staging IndexedDB. File lama di Folder/ZIP TIDAK dihapus atau ditimpa.`
      );
      if (!ok) return { status: 'replace-cancelled', mapKey };
    }

    const batchQuietMode = Boolean(options.batchQuietMode && mode === 'table');
    const batchQuietLog = batchQuietMode
      ? (type, message) => {
          if (type === 'Error' || type === 'Warn') addLog(type, message);
        }
      : addLog;
    const noopStateUpdate = () => {};
    const batchQuietEdgeHealth = batchQuietMode
      ? (next) => {
          if (next?.status === 'error') setEdgeHealth(next);
        }
      : setEdgeHealth;

    const result = await executeAudioGenerationService({
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
      setAiLoadingId: batchQuietMode ? noopStateUpdate : setAiLoadingId,
      setEdgeHealth: batchQuietEdgeHealth,
      setLocalAudioMapTable,
      setLocalAudioMapText,
      onGeneratedAudio: batchQuietMode ? null : (meta) => {
        const scopedMeta = mode === 'table' ? {
          ...meta,
          vocabId: getVocabIdentity(item),
          bookId: resolveTableAudioBookId(item),
          displayId: item.displayId ?? null
        } : meta;
        const metaKey = `${scopedMeta.mode}:${scopedMeta.mapKey}`;
        generatedAudioMetaRef.current = {
          ...generatedAudioMetaRef.current,
          [metaKey]: scopedMeta
        };
        setGeneratedAudioMeta(prev => ({ ...prev, [metaKey]: scopedMeta }));
      },
      persistGeneratedAudio: mode === 'table' ? async ({ mapKey: generatedMapKey, stableId: generatedStableId, part: generatedPart, engine, voice, filename, blob }) => {
        const stagingRecord = await putAudioStagingBlob({
          mode: 'table',
          mapKey: generatedMapKey,
          stableId: generatedStableId,
          part: generatedPart,
          engine,
          voiceId: voice,
          filename,
          mimeType: blob.type || null,
          blob,
          vocabId: getVocabIdentity(item),
          displayId: item.displayId,
          bookId: resolveTableAudioBookId(item),
          batchSessionId: options.batchSessionId || null,
          metadata: { generatedAt: Date.now(), source: 'tts-r2-staging' }
        });
        if (!batchQuietMode) {
          setTableAudioStagingRecords(prev => [...(prev || []).filter(record => record.id !== stagingRecord.id), stagingRecord]);
        }
        return stagingRecord;
      } : null,
      addLog: batchQuietLog,
      deferBrowserDownload: Boolean(options.deferBrowserDownload),
      suppressFailureAlert: Boolean(options.suppressFailureAlert)
    });
    if (result?.status === 'success' && result?.deliveryStatus === 'browser-direct-triggered') {
      recordAudioDownloadHistoryDurably({
        mode,
        mapKey: result.mapKey,
        vocabId: mode === 'table' ? getVocabIdentity(item) : null,
        bookId: mode === 'table' ? resolveTableAudioBookId(item) : null,
        displayId: mode === 'table' ? (item.displayId ?? null) : null,
        part: result.part || part,
        engine: result.engine || generatorEngine,
        voice: result.voice || (generatorEngine === 'edge' ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice) : aiVoiceName),
        filename: result.filename,
        delivery: 'browser-direct'
      });
    }
    return result;
  };

  const cancelActiveAudioGeneration = useCallback(() => {
    generationAbortControllerRef.current?.abort();
  }, []);

  const runBatchDownload = async (options = {}) => {
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
      playlist,
      generatorEngine,
      edgeVoice,
      edgeIndonesianVoice,
      setIsBatchDownloading,
      generateAIAudio,
      coverageByMapKey: tableAudioBatchCoverage?.byMapKey || null,
      coverageByScopedKey: tableAudioBatchCoverage?.byScopedKey || null,
      missingOnly: options.missingOnly !== false,
      onBatchSessionsChanged: refreshTableAudioBatchSessions,
      onStagingChanged: refreshTableAudioStaging,
      onBatchDelivered: (records) => {
        recordAudioDownloadHistoryDurably(records);
        const updates = {};
        records.forEach(record => {
          const metaKey = `${record.mode || 'table'}:${record.mapKey}`;
          const current = generatedAudioMetaRef.current?.[metaKey] || {};
          updates[metaKey] = { ...current, ...record, deliveryStatus: 'browser-package-triggered' };
        });
        if (Object.keys(updates).length) {
          generatedAudioMetaRef.current = { ...generatedAudioMetaRef.current, ...updates };
          setGeneratedAudioMeta(prev => ({ ...prev, ...updates }));
        }
      }
    });
  };

  const resolveSelectedTableAudioVariant = useCallback((item, part) => {
    const mapKey = `${getStableAudioIdentity(item)}_${part}`;
    const wanted = { vocabId: getVocabIdentity(item), bookId: resolveTableAudioBookId(item) };
    const requiredVoiceId = generatorEngine === 'edge'
      ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
      : aiVoiceName;
    const scoped = (tableAudioVariantInventory?.[mapKey] || []).filter(variant =>
      isTableAudioScopeMatch(variant, wanted)
      && String(variant?.voiceId || '').toLowerCase() === String(requiredVoiceId || '').toLowerCase()
    );
    return resolveTableAudioPlaybackVariant({
      variants: scoped,
      voiceMode: requiredVoiceId || 'auto',
      voicePriority: requiredVoiceId ? [requiredVoiceId] : tableAudioVoicePriority
    });
  }, [tableAudioVariantInventory, generatorEngine, edgeVoice, edgeIndonesianVoice, aiVoiceName, tableAudioVoicePriority]);

  const readTableAudioVariantBlob = useCallback(async variant => {
    if (!variant) return null;
    if (variant.sourceType === 'staging') return getAudioStagingBlob(variant.stagingId);
    if (variant.sourceType === 'zip') return readTableAudioZipVariantBlob(variant);
    if (variant.file instanceof Blob) return variant.file;
    if (variant.url) {
      const response = await fetch(variant.url);
      if (!response.ok) throw new Error(`Unable to read local audio (${response.status}).`);
      return response.blob();
    }
    return null;
  }, []);

  const exportTableAudioMp3 = useCallback(async (item, part) => {
    const mapKey = `${getStableAudioIdentity(item)}_${part}`;
    const variant = resolveSelectedTableAudioVariant(item, part);
    if (!variant) {
      alert('Audio belum tersedia. Generate atau load Folder/ZIP terlebih dahulu.');
      return { status: 'missing' };
    }
    try {
      const blob = await readTableAudioVariantBlob(variant);
      if (!blob) throw new Error('Audio binary tidak tersedia.');
      const filename = variant.filename || `${sanitizeFilename(getAudioFilenameIdentity(item))}_${sanitizeFilename(part)}.mp3`;
      const url = URL.createObjectURL(blob);
      triggerBrowserDownload(url, filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (variant.sourceType === 'staging' && variant.stagingId) {
        await markAudioStagingExported(variant.stagingId, { kind: 'mp3', filename });
        await refreshTableAudioStaging();
      }
      recordAudioDownloadHistoryDurably({
        mode: 'table', mapKey, part, engine: variant.engine || null, voice: variant.voiceId || null,
        vocabId: getVocabIdentity(item), bookId: resolveTableAudioBookId(item), displayId: item.displayId ?? null,
        filename, delivery: 'browser-mp3'
      });
      addLog('Audio', `MP3 export: ${filename} (${variant.sourceType || 'local'} source).`);
      return { status: 'download-triggered', filename, sourceType: variant.sourceType };
    } catch (error) {
      addLog('Error', `MP3 export failed: ${error?.message || error}`);
      alert(`MP3 export gagal: ${error?.message || error}`);
      return { status: 'error', error };
    }
  }, [resolveSelectedTableAudioVariant, readTableAudioVariantBlob, refreshTableAudioStaging, addLog, recordAudioDownloadHistoryDurably]);

  const getTableCardExportParts = useCallback((item) => {
    if (!item) return [];
    const parts = ['word', 'word_idn', 'sentence', 'meaning'];
    for (const pair of getAdvancedExpressionPairs(item)) {
      parts.push(`exp${pair.number}_en`, `exp${pair.number}_idn`);
    }
    return parts.filter(part => String(getItemPartText(item, part) || '').trim());
  }, []);

  const exportTableCardMp3 = useCallback(async (item) => {
    const parts = getTableCardExportParts(item);
    const ready = parts.filter(part => Boolean(resolveSelectedTableAudioVariant(item, part)));
    if (!ready.length) return { status: 'empty', ready: 0, missing: parts.length };
    const totalWaves = Math.max(1, Math.ceil(ready.length / DIRECT_MP3_BATCH_LIMIT));
    const results = [];
    for (let index = 0; index < ready.length; index += 1) {
      const part = ready[index];
      results.push(await exportTableAudioMp3(item, part));
      const isEndOfWave = (index + 1) % DIRECT_MP3_BATCH_LIMIT === 0;
      const hasMore = index + 1 < ready.length;
      if (isEndOfWave && hasMore) await new Promise(resolve => window.setTimeout(resolve, 650));
      else if (hasMore) await new Promise(resolve => window.setTimeout(resolve, 60));
    }
    addLog('Audio', `Card direct MP3 export: ${ready.length} Ready audio • ${totalWaves} wave(s) of max ${DIRECT_MP3_BATCH_LIMIT}.`);
    return { status: 'completed', results, ready: ready.length, missing: Math.max(0, parts.length - ready.length), waves: totalWaves };
  }, [getTableCardExportParts, resolveSelectedTableAudioVariant, exportTableAudioMp3, addLog]);

  const exportTableCardZip = useCallback(async (item) => {
    const parts = getTableCardExportParts(item);
    const resolved = parts.map(part => ({ part, variant: resolveSelectedTableAudioVariant(item, part) })).filter(entry => entry.variant);
    if (!resolved.length) return { status: 'empty', ready: 0, missing: parts.length };

    const entries = [];
    const historyRecords = [];
    const stagedIds = [];
    const voiceLabels = new Set();
    for (const { part, variant } of resolved) {
      const blob = await readTableAudioVariantBlob(variant);
      if (!blob) continue;
      const filename = variant.filename || `${sanitizeFilename(getAudioFilenameIdentity(item))}_${sanitizeFilename(part)}.mp3`;
      entries.push({ filename, blob });
      if (variant.voiceId) voiceLabels.add(compactVoiceFilenameLabel(variant.voiceId));
      if (variant.sourceType === 'staging' && variant.stagingId) stagedIds.push(variant.stagingId);
      historyRecords.push({
        mode: 'table', mapKey: `${getStableAudioIdentity(item)}_${part}`, part,
        engine: variant.engine || null, voice: variant.voiceId || null,
        vocabId: getVocabIdentity(item), bookId: resolveTableAudioBookId(item), displayId: item.displayId ?? null,
        filename, delivery: 'browser-zip'
      });
    }
    if (!entries.length) return { status: 'empty-binary', ready: 0, missing: parts.length };

    const book = sanitizeFilename(resolveTableAudioBookId(item) || 'TABLE');
    const number = Number.isFinite(Number(item?.displayId)) ? String(Number(item.displayId)).padStart(4, '0') : sanitizeFilename(getAudioFilenameIdentity(item));
    const voice = [...voiceLabels].filter(Boolean).join('-') || 'Voice';
    const zipFilename = `${book}__${number}__${voice}__CARD_AUDIO.zip`;
    const result = await triggerBrowserZipDownload({ entries, filename: zipFilename });
    if (stagedIds.length) {
      await Promise.all(stagedIds.map(id => markAudioStagingExported(id, { kind: 'zip', filename: zipFilename })));
      await refreshTableAudioStaging();
    }
    if (historyRecords.length) recordAudioDownloadHistoryDurably(historyRecords.map(record => ({ ...record, filename: zipFilename })));
    addLog('Audio', `Card ZIP export: ${entries.length} Ready audio → ${zipFilename}.`);
    return { status: 'completed', result, filename: zipFilename, ready: entries.length, missing: Math.max(0, parts.length - entries.length) };
  }, [getTableCardExportParts, resolveSelectedTableAudioVariant, readTableAudioVariantBlob, refreshTableAudioStaging, recordAudioDownloadHistoryDurably, addLog]);

  const removeTableStagedAudio = useCallback(async (item, part) => {
    const mapKey = `${getStableAudioIdentity(item)}_${part}`;
    const wanted = { vocabId: getVocabIdentity(item), bookId: resolveTableAudioBookId(item) };
    const requiredVoiceId = generatorEngine === 'edge'
      ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
      : aiVoiceName;
    const candidates = (tableAudioVariantInventory?.[mapKey] || []).filter(variant =>
      variant?.sourceType === 'staging'
      && isTableAudioScopeMatch(variant, wanted)
      && String(variant?.voiceId || '').toLowerCase() === String(requiredVoiceId || '').toLowerCase()
    );
    const selected = resolveTableAudioPlaybackVariant({ variants: candidates, voiceMode: requiredVoiceId || 'auto', voicePriority: requiredVoiceId ? [requiredVoiceId] : tableAudioVoicePriority });
    if (!selected?.stagingId) return { status: 'not-staged' };
    await releaseAudioStagingBlobs([selected.stagingId], { reason: 'per-card-manual-release' });
    await refreshTableAudioStaging();
    addLog('Audio', `Staged audio released: ${mapKey}.`);
    return { status: 'released', id: selected.stagingId };
  }, [tableAudioVariantInventory, generatorEngine, edgeVoice, edgeIndonesianVoice, aiVoiceName, tableAudioVoicePriority, refreshTableAudioStaging, addLog]);

  const resolveTableAudioVariantForSpec = useCallback((spec) => {
    if (!spec?.mapKey) return null;
    const variants = (tableAudioVariantInventory?.[spec.mapKey] || []).filter(variant => {
      if (spec?.vocabId || spec?.bookId) return isTableAudioScopeMatch(variant, spec);
      return true;
    });
    const requiredVoiceId = String(spec.requiredVoiceId || spec.voiceId || '').trim();
    if (requiredVoiceId) {
      const exact = variants.filter(variant => String(variant?.voiceId || '').toLowerCase() === requiredVoiceId.toLowerCase());
      return resolveTableAudioPlaybackVariant({ variants: exact, voiceMode: requiredVoiceId, voicePriority: [requiredVoiceId] });
    }
    return resolveTableAudioPlaybackVariant({ variants, voiceMode: 'auto', voicePriority: tableAudioVoicePriority });
  }, [tableAudioVariantInventory, tableAudioVoicePriority]);

  const buildExportRecordFromSpec = useCallback((spec, variant) => {
    if (!spec?.mapKey || !variant) return null;
    return {
      id: variant.stagingId || `${variant.sourceType || 'local'}:${variant.sourceId || 'source'}:${spec.mapKey}:${variant.voiceId || 'unknown'}`,
      mapKey: spec.mapKey,
      part: spec.part || variant.part || null,
      vocabId: spec.vocabId || variant.vocabId || null,
      bookId: spec.bookId || resolveTableAudioBookId(spec.stableId || spec.mapKey),
      displayId: Number.isFinite(Number(spec.displayId)) ? Number(spec.displayId) : null,
      voiceId: variant.voiceId || spec.requiredVoiceId || spec.voiceId || null,
      engine: variant.engine || spec.engine || null,
      filename: variant.filename || `${sanitizeFilename(spec.mapKey)}.mp3`,
      size: Number(variant.size || variant.file?.size || variant.zipEntry?.uncompressedSize || 0),
      hasBlob: true,
      sourceType: variant.sourceType || 'local',
      variant
    };
  }, []);

  const exportCurrentSelectionMp3 = useCallback(async () => {
    const slots = tableAudioBatchCoverage?.slots || [];
    const logicalSeen = new Set();
    const selected = [];
    for (const slot of slots) {
      const spec = {
        ...slot,
        voiceId: slot.requiredVoiceId || null,
        vocabId: slot.vocabId || null,
        bookId: slot.bookId || resolveTableAudioBookId(slot.vocabId || slot.stableId || slot.mapKey)
      };
      const variant = resolveTableAudioVariantForSpec(spec);
      if (!variant) continue;
      const key = `${slot.mapKey}|${String(variant.voiceId || '').toLowerCase()}`;
      if (logicalSeen.has(key)) continue;
      logicalSeen.add(key);
      selected.push({ spec, variant });
    }
    if (!selected.length) {
      alert('Belum ada audio Ready pada pilihan batch ini. Generate audio atau attach Folder/ZIP terlebih dahulu.');
      return { status: 'empty' };
    }

    const results = [];
    const historyRecords = [];
    const totalWaves = Math.max(1, Math.ceil(selected.length / DIRECT_MP3_BATCH_LIMIT));
    for (let index = 0; index < selected.length; index += 1) {
      const { spec, variant } = selected[index];
      const wave = Math.floor(index / DIRECT_MP3_BATCH_LIMIT) + 1;
      setBatchStatusText(`MP3 wave ${wave}/${totalWaves} • ${index + 1}/${selected.length}`);
      const blob = await readTableAudioVariantBlob(variant);
      if (!blob) continue;
      const filename = variant.filename || `${sanitizeFilename(spec.mapKey)}.mp3`;
      const url = URL.createObjectURL(blob);
      triggerBrowserDownload(url, filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (variant.sourceType === 'staging' && variant.stagingId) {
        await markAudioStagingExported(variant.stagingId, { kind: 'mp3', filename });
      }
      historyRecords.push({
        mode: 'table', mapKey: spec.mapKey, part: spec.part, engine: variant.engine || null,
        voice: variant.voiceId || null, vocabId: spec.vocabId || variant.vocabId || null,
        bookId: spec.bookId || variant.bookId || null, displayId: spec.displayId ?? variant.displayId ?? null,
        filename, delivery: 'browser-mp3'
      });
      results.push({ status: 'download-triggered', filename, sourceType: variant.sourceType, size: blob.size });

      // Direct MP3 export is intentionally throttled in waves of 10 browser
      // downloads. The limit is a dispatch size, not a cap on the selected
      // export. This avoids repeatedly exporting only the first 10 files while
      // still preventing a large selection from being fired at once.
      const isEndOfWave = (index + 1) % DIRECT_MP3_BATCH_LIMIT === 0;
      const hasMore = index + 1 < selected.length;
      if (isEndOfWave && hasMore) {
        await new Promise(resolve => window.setTimeout(resolve, 650));
      } else if (hasMore) {
        await new Promise(resolve => window.setTimeout(resolve, 60));
      }
    }
    if (historyRecords.length) recordAudioDownloadHistoryDurably(historyRecords);
    setBatchStatusText('');
    await refreshTableAudioStaging();
    addLog('Batch', `Direct MP3 export: ${results.length}/${selected.length} Ready file • dispatched in ${totalWaves} wave(s) of max ${DIRECT_MP3_BATCH_LIMIT}.`);
    return { status: 'completed', results, availableCount: selected.length, waves: totalWaves };
  }, [tableAudioBatchCoverage, resolveTableAudioVariantForSpec, readTableAudioVariantBlob, refreshTableAudioStaging, addLog, setBatchStatusText, recordAudioDownloadHistoryDurably]);

  const exportCurrentSelectionZip = useCallback(async () => {
    const slots = tableAudioBatchCoverage?.slots || [];
    if (!slots.length) return { status: 'empty-selection' };
    const exportRecords = [];
    const unavailable = [];
    const logicalSeen = new Set();
    for (const slot of slots) {
      const spec = {
        ...slot,
        voiceId: slot.requiredVoiceId || null,
        vocabId: slot.vocabId || null,
        bookId: slot.bookId || resolveTableAudioBookId(slot.vocabId || slot.stableId || slot.mapKey)
      };
      const variant = resolveTableAudioVariantForSpec(spec);
      if (!variant) { unavailable.push(spec); continue; }
      const key = `${spec.mapKey}|${String(variant.voiceId || '').toLowerCase()}|${String(spec.vocabId || spec.bookId || '').toUpperCase()}`;
      if (logicalSeen.has(key)) continue;
      logicalSeen.add(key);
      const record = buildExportRecordFromSpec(spec, variant);
      if (record) exportRecords.push(record);
    }
    if (unavailable.length || exportRecords.length !== slots.length) {
      alert(`Full consolidated ZIP belum aman: ${exportRecords.length}/${slots.length} audio Ready. Load ZIP/Folder lama atau jalankan DOWNLOAD MISSING untuk ${Math.max(unavailable.length, slots.length - exportRecords.length)} slot yang belum tersedia.`);
      return { status: 'incomplete', ready: exportRecords.length, total: slots.length, unavailableCount: unavailable.length };
    }

    const sessionId = `CONSOLIDATE_${Date.now()}`;
    setBatchStatusText(`Consolidate ZIP • ${exportRecords.length} Ready audio`);
    const results = await exportTableAudioRecordZipGroups({
      records: exportRecords,
      sessionId,
      readBlob: record => readTableAudioVariantBlob(record.variant),
      onProgress: info => { if (info.phase === 'zip') setBatchStatusText(`Consolidate • ${info.filename}`); },
      onChunkExported: async ({ records: chunkRecords, filename }) => {
        const stagingIds = chunkRecords
          .filter(record => record.variant?.sourceType === 'staging' && record.variant?.stagingId)
          .map(record => record.variant.stagingId);
        if (stagingIds.length) await markAudioStagingExported(stagingIds, { kind: 'zip', sessionId, filename });
      }
    });
    recordAudioDownloadHistoryDurably(exportRecords.map(record => ({
      mode: 'table', mapKey: record.mapKey, part: record.part, engine: record.engine,
      voice: record.voiceId, vocabId: record.vocabId || null, bookId: record.bookId || null,
      displayId: record.displayId ?? null, filename: record.filename, delivery: 'browser-zip'
    })));
    setBatchStatusText('');
    await refreshTableAudioStaging();
    addLog('Batch', `Consolidated ZIP: ${exportRecords.length}/${slots.length} Ready audio from Staging/Folder/ZIP → ${results.length} ZIP group(s).`);
    return { status: 'completed', results, exportedCount: exportRecords.length, total: slots.length };
  }, [tableAudioBatchCoverage, resolveTableAudioVariantForSpec, buildExportRecordFromSpec, readTableAudioVariantBlob, refreshTableAudioStaging, addLog, setBatchStatusText, recordAudioDownloadHistoryDurably]);

  const exportBatchSessions = useCallback(async (sessionIds) => {
    const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds]).filter(Boolean))];
    if (!ids.length) return { status: 'empty-selection' };
    const sessions = (await listAudioBatchSessions({ mode: 'table' })).filter(session => ids.includes(session.id));
    if (!sessions.length) return { status: 'missing-session' };

    const specMap = new Map();
    sessions.flatMap(session => session.requestedSpecs || []).forEach(spec => {
      if (!spec?.mapKey) return;
      const voiceKey = String(spec.voiceId || spec.requiredVoiceId || '').toLowerCase();
      specMap.set(`${spec.mapKey}|${voiceKey}|${String(spec.vocabId || spec.bookId || '').toUpperCase()}`, spec);
    });

    const exportRecords = [];
    const unavailable = [];
    for (const spec of specMap.values()) {
      const variant = resolveTableAudioVariantForSpec(spec);
      if (!variant) {
        unavailable.push(spec);
        continue;
      }
      const record = buildExportRecordFromSpec(spec, variant);
      if (record) exportRecords.push(record);
    }
    if (!exportRecords.length) {
      alert('Audio Batch ini sedang tidak tersedia dari IndexedDB Staging, Folder, maupun ZIP attached. Riwayat Batch tetap disimpan, tetapi binary perlu direconnect terlebih dahulu.');
      return { status: 'unavailable', unavailableCount: unavailable.length };
    }

    setBatchStatusText(`Export ${exportRecords.length} Ready audio...`);
    const mergedSessionId = ids.length === 1 ? ids[0] : `MERGE_${Date.now()}`;
    const results = await exportTableAudioRecordZipGroups({
      records: exportRecords,
      sessionId: mergedSessionId,
      readBlob: record => readTableAudioVariantBlob(record.variant),
      onProgress: info => { if (info.phase === 'zip') setBatchStatusText(`ZIP • ${info.filename}`); },
      onChunkExported: async ({ records: chunkRecords, filename }) => {
        const stagingIds = chunkRecords
          .filter(record => record.variant?.sourceType === 'staging' && record.variant?.stagingId)
          .map(record => record.variant.stagingId);
        if (stagingIds.length) await markAudioStagingExported(stagingIds, { kind: 'zip', sessionId: mergedSessionId, filename });
      }
    });

    const now = Date.now();
    for (const session of sessions) {
      await saveAudioBatchSession({
        ...session,
        status: String(session.status || '').startsWith('running') ? 'interrupted-recovered' : session.status,
        lastManualZipExportAt: now,
        manualZipExportCount: Number(session.manualZipExportCount || 0) + results.length,
        lastManualZipUnavailableCount: unavailable.length
      });
    }
    recordAudioDownloadHistoryDurably(exportRecords.map(record => ({
      mode: 'table', mapKey: record.mapKey, part: record.part, engine: record.engine,
      voice: record.voiceId, vocabId: record.vocabId || null, bookId: record.bookId || null,
      displayId: record.displayId ?? null, filename: record.filename, delivery: 'browser-zip'
    })));
    setBatchStatusText('');
    await refreshTableAudioStaging();
    await refreshTableAudioBatchSessions();
    addLog('Batch', `Batch Library export: ${exportRecords.length} Ready audio → ${results.length} ZIP${unavailable.length ? ` • ${unavailable.length} unavailable skipped` : ''}.`);
    return { status: 'completed', results, exportedCount: exportRecords.length, unavailableCount: unavailable.length };
  }, [resolveTableAudioVariantForSpec, buildExportRecordFromSpec, readTableAudioVariantBlob, refreshTableAudioStaging, refreshTableAudioBatchSessions, addLog, setBatchStatusText, recordAudioDownloadHistoryDurably]);

  const clearBatchSessionStaging = useCallback(async sessionId => {
    const session = (await listAudioBatchSessions({ mode: 'table' })).find(row => row.id === sessionId);
    if (!session) return { status: 'missing-session' };
    const released = await releaseAudioStagingBlobs(session.audioIds || [], { reason: `batch-session-release:${sessionId}` });
    await saveAudioBatchSession({ ...session, stagedReleasedAt: Date.now(), stagedReleasedCount: released });
    await refreshTableAudioStaging();
    await refreshTableAudioBatchSessions();
    addLog('Batch', `Batch ${sessionId}: released ${released} staged binary.`);
    return { status: 'released', released };
  }, [refreshTableAudioStaging, refreshTableAudioBatchSessions, addLog]);

  const deleteBatchSessionHistory = useCallback(async sessionId => {
    await deleteAudioBatchSession(sessionId);
    await refreshTableAudioBatchSessions();
    addLog('Batch', `Batch history deleted: ${sessionId}. Staged binary is unchanged.`);
  }, [refreshTableAudioBatchSessions, addLog]);

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

  const handleMatchedAudioInventory = (meta) => {
    if (!meta?.mapKey) return;
    const metaKey = `${meta.mode || mode}:${meta.mapKey}`;
    generatedAudioMetaRef.current = { ...generatedAudioMetaRef.current, [metaKey]: meta };
    setGeneratedAudioMeta(prev => ({ ...prev, [metaKey]: meta }));
  };

  const revokeTableFolderVariantUrls = () => {
    // Folder inventory stores File references only. Playback URLs are created
    // lazily in a bounded cache and can be released independently.
    clearTableAudioFolderRuntimeCache();
  };

  const releaseStagingCoveredByVerifiedSource = useCallback(async (externalVariants, sourceLabel = 'external') => {
    const verified = (Array.isArray(externalVariants) ? externalVariants : []).filter(variant => variant?.verified && variant?.mapKey);
    if (!verified.length) return 0;
    const staged = await listAudioStagingMetadata({ mode: 'table', includeReleased: false });
    const ids = staged.filter(record => verified.some(variant => isSameLogicalAudioVoice(record, variant))).map(record => record.id);
    if (!ids.length) return 0;
    const released = await releaseAudioStagingBlobs(ids, { reason: `verified-${sourceLabel}-replacement` });
    if (released) {
      await refreshTableAudioStaging();
      addLog('Audio', `${sourceLabel}: ${released} duplicate staged audio released after exact source/voice verification.`);
    }
    return released;
  }, [refreshTableAudioStaging, addLog]);

  const loadAudioFolderFiles = async (files, _folderName = '', options = {}) => {
    clearGeneratedAudioMetaForMode(mode);
    if (mode === 'table') revokeTableFolderVariantUrls();
    const result = executeAudioFolderSelectService({
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
      silent: !!options.automatic,
      onMatchedAudio: handleMatchedAudioInventory,
      edgeVoices: initialEdgeVoices
    });
    if (mode === 'table') {
      setTableAudioFolderVariantInventory(tableAudioVariantsFromRecords(result?.variants || []));
      await releaseStagingCoveredByVerifiedSource(result?.variants || [], 'Folder');
    }
    return result;
  };

  const handleAudioZipSelect = async (event) => {
    const selectedFiles = [...(event?.target?.files || [])];
    if (event?.target) event.target.value = '';
    if (!selectedFiles.length) return;
    if (mode !== 'table') {
      alert('Audio ZIP C3.4.1 saat ini difokuskan untuk Table. Text belum diubah.');
      return;
    }
    try {
      const scan = await scanTableAudioZipFiles({
        files: selectedFiles,
        playlist,
        getRecordAudioNo,
        getVocabIdentity,
        getStableAudioIdentity,
        edgeVoices: initialEdgeVoices
      });
      setTableAudioZipVariantInventory(prev => mergeTableAudioVariantInventories(prev, scan.inventory));
      setTableAudioZipSources(prev => {
        const byIdentity = new Map((prev || []).map(item => [item.id, item]));
        scan.archives.forEach(item => byIdentity.set(item.id, item));
        return [...byIdentity.values()];
      });
      setAudioStatusTable(scan.matchedCount > 0 ? 'success' : (Object.keys(tableAudioFolderVariantInventory || {}).length ? 'success' : 'empty'));
      await releaseStagingCoveredByVerifiedSource(scan.records || [], 'ZIP');
      addLog('System', `Table Audio ZIP: ${scan.archiveCount} archive, ${scan.matchedCount} matched audio, ${scan.orphanCount} orphan, ${scan.unsupportedCount} unsupported.`);
      alert(`[Table] Audio ZIP scan: ${scan.archiveCount} archive. Matched: ${scan.matchedCount}. Orphan: ${scan.orphanCount}. Unsupported: ${scan.unsupportedCount}.\nZIP dibaca sebagai archive index; audio diekstrak hanya saat diputar.`);
      return scan;
    } catch (error) {
      console.error(error);
      addLog('Error', `Table Audio ZIP gagal: ${error?.message || error}`);
      alert(`Audio ZIP gagal dibaca: ${error?.message || error}`);
      return { status: 'error', error };
    }
  };

  const clearTableAudioCoverageHistory = () => {
    // Persist synchronously as well as updating React state. This prevents stale
    // Downloaded* records from resurrecting after an immediate browser refresh.
    const persisted = clearPersistedAudioDownloadHistoryForMode('table');
    const stateCleared = clearAudioDownloadHistoryForMode(audioDownloadHistoryRef.current || {}, 'table');
    // Preserve newer non-Table records while synchronously clearing Table history
    // from both the runtime ref and durable localStorage snapshot.
    const next = { ...persisted, ...stateCleared };
    audioDownloadHistoryRef.current = next;
    persistAudioDownloadHistory(next);
    setAudioDownloadHistory(next);
  };

  const resetTableAudioCoverageMemory = async () => {
    clearGeneratedAudioMetaForMode('table');
    clearTableAudioCoverageHistory();
    const stagedExportRowsCleared = await clearAudioStagingExportHistoryForMode('table');
    await refreshTableAudioStaging();
    addLog('System', `Table Audio coverage memory reset. Downloaded*/Exported* history cleared (${stagedExportRowsCleared} staged ledger row${stagedExportRowsCleared === 1 ? '' : 's'}); attached Folder/ZIP and Staged binary availability remain active.`);
  };

  const clearTableGeneratedAudioRam = () => {
    const releasedCount = tableGeneratedSessionAudioCount;
    clearAudioStagingRuntimeCache();
    clearTableAudioFolderRuntimeCache();
    clearTableAudioZipRuntimeCache();
    resetTableAudioTransientCoverageStatePreservingFolder();
    addLog('System', `Table runtime audio cache cleared. Released ${releasedCount} legacy generated ObjectURL slot${releasedCount === 1 ? '' : 's'} plus bounded Staging/Folder/ZIP playback ObjectURL caches; IndexedDB Staging binaries, Folder/ZIP sources, and export history remain unchanged.`);
  };

  const clearTableAudioStaging = async () => {
    const result = await clearAudioStagingForMode('table', { clearHistory: false });
    await refreshTableAudioStaging();
    await refreshTableAudioBatchSessions();
    addLog('System', `Table Audio Staging cleared: ${result.released || 0} binary Blob${result.released === 1 ? '' : 's'} released; lightweight metadata/history retained.`);
    return result;
  };

  const resetTableAudioTransientCoverageStatePreservingFolder = () => {
    // Folder availability lives in tableAudioFolderVariantInventory and no
    // longer requires one ObjectURL per slot in localAudioMapTable.
    Object.values(localAudioMapTable || {}).forEach(url => {
      if (!url) return;
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    });
    setLocalAudioMapTable({});
    clearGeneratedAudioMetaForMode('table');
  };

  const clearTableAudioZipSources = () => {
    clearTableAudioZipRuntimeCache();
    setTableAudioZipVariantInventory({});
    setTableAudioZipSources([]);
    // Detach means the removed source must stop contributing to coverage.
    // Downloaded* is intentionally reset so an old package/history cannot keep
    // slots looking covered after the ZIP itself has been detached.
    resetTableAudioTransientCoverageStatePreservingFolder();
    clearTableAudioCoverageHistory();
    if (!Object.keys(tableAudioFolderVariantInventory || {}).length) setAudioStatusTable('idle');
    addLog('System', 'Table Audio ZIP sources detached. ZIP inventory + Table Downloaded* coverage history cleared. Audio Folder remains unchanged.');
  };

  const detachTableAudioFolderSource = async () => {
    revokeTableFolderVariantUrls();
    setTableAudioFolderVariantInventory({});
    // Legacy Table folder scan still owns the one-URL-per-slot map. Clear it so
    // detached folder files cannot survive through that compatibility path.
    Object.values(localAudioMapTable || {}).forEach(url => {
      try { if (url) URL.revokeObjectURL(url); } catch { /* noop */ }
    });
    setLocalAudioMapTable({});
    clearGeneratedAudioMetaForMode('table');
    clearTableAudioCoverageHistory();
    try { await forgetRememberedAudioFolderHandle('table'); } catch (error) { console.warn('Unable to forget Table audio folder handle:', error); }
    const restoreState = getAudioAutoRestoreState();
    restoreState.generations.table = (restoreState.generations.table || 0) + 1;
    delete restoreState.signatures.table;
    setAudioStatusTable(Object.keys(tableAudioZipVariantInventory || {}).length ? 'success' : 'idle');
    addLog('System', 'Table Audio Folder detached. Folder inventory, remembered handle, legacy local map, and Table Downloaded* coverage history cleared. ZIP sources remain unchanged.');
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
    const files = e?.target?.files;
    if (!files) return;
    const result = loadAudioFolderFiles(files, '', { automatic: false });
    if (e?.target) e.target.value = '';
    return result;
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
  folderInputRef.openAudioZip = () => audioZipInputRef.current?.click();
  folderInputRef.clearAudioZip = clearTableAudioZipSources;
  folderInputRef.detachAudioFolder = detachTableAudioFolderSource;
  folderInputRef.resetAudioCoverageMemory = resetTableAudioCoverageMemory;
  folderInputRef.clearGeneratedAudioRam = clearTableGeneratedAudioRam;
  folderInputRef.clearAudioStaging = clearTableAudioStaging;
  folderInputRef.tableGeneratedAudioSummary = { count: tableGeneratedSessionAudioCount };
  folderInputRef.tableAudioStagingSummary = tableAudioStagingSummary;
  folderInputRef.tableAudioBatchHistoryCount = activeTableAudioBatchSessions.length;
  folderInputRef.tableAudioFolderSummary = { active: Object.keys(tableAudioFolderVariantInventory || {}).length > 0, matchedCount: Object.values(tableAudioFolderVariantInventory || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0) };
  folderInputRef.tableAudioZipSummary = tableAudioZipSummary;

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

  const structuredTextAudioInventorySummary = useMemo(() => summarizeTextStructuredAudioRuntimeInventory({
    documentTree: activeTextDocumentTree,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls
  }), [activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls]);

  const structuredTextAudioLibraryControls = useMemo(() => ({
    folderState: structuredTextAudioFolderState,
    zipState: structuredTextAudioZipState,
    coverage: structuredTextDocumentCoverage,
    inventory: structuredTextAudioInventorySummary,
    onChooseFolder: handleStructuredTextChooseAudioFolder,
    onReconnectFolder: handleStructuredTextReconnectAudioFolder,
    onAddZipFiles: handleStructuredTextAddAudioZipFiles,
    onClearZip: handleStructuredTextClearAudioZipFiles
  }), [structuredTextAudioFolderState, structuredTextAudioZipState, structuredTextDocumentCoverage, structuredTextAudioInventorySummary, handleStructuredTextChooseAudioFolder, handleStructuredTextReconnectAudioFolder, handleStructuredTextAddAudioZipFiles, handleStructuredTextClearAudioZipFiles]);

  const structuredTextRuntimeAudioCount = Object.keys(structuredTextAudioRuntimeUrls || {}).length;
  const currentAudioStatus = structuredTextModeActive
    ? (structuredTextRuntimeAudioCount > 0 ? 'success' : 'idle')
    : (mode === 'table' ? audioStatusTable : audioStatusText);
  const currentMapCount = structuredTextModeActive
    ? structuredTextRuntimeAudioCount
    : (mode === 'table' ? Number(tableAudioInventorySummary?.variants || 0) : Object.keys(localAudioMapText).length);
  const activePreferLocalAudio = structuredTextModeActive
    ? textStructuredPreferences.audioSourceMode !== TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY
    : preferLocalAudio;
  const handleActivePreferLocalAudioChange = (value) => {
    if (structuredTextModeActive) {
      setTextStructuredPreferences(prev => ({
        ...prev,
        audioSourceMode: value ? TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST : TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY
      }));
      return;
    }
    setPreferLocalAudio(value);
  };

  const renderStatusBadge = () => {
      if (currentAudioStatus === 'idle' && currentMapCount === 0) return <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">Belum Load</span>;
      if (currentMapCount > 0) return <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {mode === 'table' ? `${currentMapCount} Audio` : `${currentMapCount} File Aktif`}</span>;
      return <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> 0 File</span>;
  };

  const handleScroll = (e) => {
     // R2: coalesce raw desktop virtual-list scroll events to at most one React
     // state update per animation frame. The DOM scroll itself remains native.
     tableAudioPendingScrollTopRef.current = e.currentTarget.scrollTop;
     if (tableAudioScrollFrameRef.current !== null) return;
     tableAudioScrollFrameRef.current = requestAnimationFrame(() => {
       tableAudioScrollFrameRef.current = null;
       setScrollTop(tableAudioPendingScrollTopRef.current);
     });
  };

  useEffect(() => () => {
    if (tableAudioScrollFrameRef.current !== null) cancelAnimationFrame(tableAudioScrollFrameRef.current);
    tableAudioScrollFrameRef.current = null;
  }, []);

  const structuredTextBatchControls = structuredTextModeActive ? {
    preferences: structuredTextAudioGenerationPreferences,
    voices: initialEdgeVoices,
    coverage: structuredTextDocumentCoverage,
    running: Boolean(structuredTextAudioGenerationState.running),
    statusText: structuredTextAudioGenerationState.running
      ? `${structuredTextAudioGenerationState.completed || 0}/${structuredTextAudioGenerationState.total || 0}`
      : structuredTextAudioGenerationState.lastStatus || '',
    onPreferencesChange: handleStructuredTextAudioGenerationPreferenceChange,
    downloadMissing: () => runStructuredTextAudioGenerationBatch(null, { missingOnly: true }),
    redownloadAll: () => runStructuredTextAudioGenerationBatch(null, { missingOnly: false }),
    cancel: handleStructuredTextCancelGeneration
  } : null;

  const renderBatchPopup = (options = {}) => renderBatchPopupView({
    batchPanelRef, mode, setIsBatchOpen, isBatchDownloading, batchConfig, setBatchConfig,
    generatorEngine, edgeVoice, edgeIndonesianVoice, aiVoiceName, advancedDatasetStats, handleBatchRangeBlur, runBatchDownload,
    isBatchStopping, batchStatusText,
    tableCoverage: tableAudioBatchCoverage, structuredTextBatch: structuredTextBatchControls,
    batchSessions: activeTableAudioBatchSessions, stagingRecords: activeTableAudioStagingRecords, stagingSummary: activeTableAudioStagingSummary, allStagingSummary: tableAudioStagingSummary, batchAvailabilityById: tableAudioBatchAvailabilityById,
    onExportCurrentMp3: exportCurrentSelectionMp3, onExportCurrentZip: exportCurrentSelectionZip, onExportBatchSessions: exportBatchSessions,
    onClearBatchStaging: clearBatchSessionStaging, onClearAllStaging: clearTableAudioStaging, onDeleteBatchHistory: deleteBatchSessionHistory, directMp3Limit: DIRECT_MP3_BATCH_LIMIT,
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
    tableAudioVoiceOptions, tableLocalAudioVoiceMode, setTableLocalAudioVoiceMode, tableAudioVoicePriority, moveTableLocalAudioVoicePriority,
    preferLocalAudio: activePreferLocalAudio, setPreferLocalAudio: handleActivePreferLocalAudioChange, isSystemBusy, voices, selectedVoice: activeBrowserTtsVoice,
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
    batchConfig, setBatchConfig, runBatchDownload, tableCoverage: tableAudioBatchCoverage, structuredTextBatch: structuredTextBatchControls,
    batchSessions: activeTableAudioBatchSessions, stagingRecords: activeTableAudioStagingRecords, stagingSummary: activeTableAudioStagingSummary, batchAvailabilityById: tableAudioBatchAvailabilityById,
    onExportCurrentMp3: exportCurrentSelectionMp3, onExportCurrentZip: exportCurrentSelectionZip, onExportBatchSessions: exportBatchSessions, onClearBatchStaging: clearBatchSessionStaging, onDeleteBatchHistory: deleteBatchSessionHistory, directMp3Limit: DIRECT_MP3_BATCH_LIMIT,
    isBatchOpen, setIsBatchOpen, showLogs, setShowLogs,
    systemLogs, logContainerRef, storageRefreshToken,
    onDatasetCacheCleared: handleStorageDatasetCacheCleared, onMasteryReset: handleStorageMasteryReset,
    onStudyTrackingReset: handleStorageStudyTrackingReset, masteryByVocabId, activityByVocabId,
    currentVocabIds: currentProgressVocabIds, onProgressRestored: handleProgressRestored,
    textLibraryCatalog, activeTextDocument, activeTextDocumentTree: textLibraryShellDocumentTree, activeTextDocumentId, activeTextEditorModel,
    textLibraryCommandBusy: (textLibraryCommandBusy || isSystemBusy || structuredTextAudioGenerationState.running), textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
    handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryMoveDocument, handleTextLibraryDeleteDocument, handleTextLibraryRenameCollection, handleTextLibraryDeleteCollection, handleTextLibraryStructuredCommand,
    structuredTextAudioLibraryControls, structuredTextAudioCoverageMap
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
        playbackPreferences={textStructuredPreferences}
        onDisplayModeChange={(displayMode) => setTextStructuredPreferences(prev => ({ ...prev, displayMode }))}
        onPlaybackChannelModeChange={(playbackChannelMode) => setTextStructuredPreferences(prev => ({ ...prev, playbackChannelMode }))}
        onPlaybackFeelChange={(patch) => setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, ...patch }))}
        onPlayDocument={handleStructuredTextPlayDocument}
        onPlayCard={handleStructuredTextPlayCard}
        onPlaySegment={handleStructuredTextPlaySegment}
        onStartFromSegment={handleStructuredTextStartFromSegment}
        audioRuntimeStatusMap={structuredTextAudioRuntimeStatusMap}
        audioCoverageMap={structuredTextAudioCoverageMap}
        documentCoverage={structuredTextDocumentCoverage}
        onAttachAudioFile={handleStructuredTextAttachAudioFile}
        onRemoveAudioVariant={handleStructuredTextRemoveAudioVariant}
        englishVoices={voices}
        indonesianVoices={indonesianVoices}
        defaultTextVoiceName={defaultStructuredTextVoiceId}
        defaultMeaningVoiceName={defaultStructuredMeaningVoiceId}
        speakerVoiceMap={structuredTextSpeakerVoiceMap}
        onSpeakerVoiceChange={handleStructuredTextSpeakerVoiceChange}
        onSpeakerDownloadVoiceChange={handleStructuredTextSpeakerDownloadVoiceChange}
        onCardVoiceChange={handleStructuredTextCardVoiceChange}
        onSegmentVoiceChange={handleStructuredTextSegmentVoiceChange}
        onCardDownloadVoiceChange={handleStructuredTextCardDownloadVoiceChange}
        onSegmentDownloadVoiceChange={handleStructuredTextSegmentDownloadVoiceChange}
        onPreviewTts={handleStructuredTextPreviewTts}
        generationPreferences={structuredTextAudioGenerationPreferences}
        onGenerationPreferencesChange={handleStructuredTextAudioGenerationPreferenceChange}
        edgeGenerationVoices={initialEdgeVoices}
        edgeHealth={structuredTextEdgeHealth}
        onEdgeHealthCheck={handleStructuredTextEdgeHealthCheck}
        generationState={structuredTextAudioGenerationState}
        folderState={structuredTextAudioFolderState}
        onChooseGenerationFolder={handleStructuredTextChooseAudioFolder}
        onReconnectGenerationFolder={handleStructuredTextReconnectAudioFolder}
        onGenerateDocumentAudio={(options = {}) => runStructuredTextAudioGenerationBatch(null, { missingOnly: options.missingOnly !== false })}
        onGenerateCardAudio={handleStructuredTextGenerateCardAudio}
        onGenerateSpeakerAudio={handleStructuredTextGenerateSpeakerAudio}
        onCancelGeneration={handleStructuredTextCancelGeneration}
        onRetryFailedGeneration={handleStructuredTextRetryFailedGeneration}
        onGenerateAudio={handleStructuredTextGenerateAudio}
        focusTarget={textLibrarySearchFocusTarget}
        onFocusConsumed={handleTextLibrarySearchFocusConsumed}
        controlsWorkspaceOpen={textPlayerWorkspaceOpen}
        onCloseControlsWorkspace={() => setTextPlayerWorkspaceOpen(false)}
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
    isBatchDownloading,
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
    localAudioMapTable: tableAudioUiMap,
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
    generatedAudioMeta,
    tableAudioVariantInventory,
    tableLocalAudioVoiceMode,
    tableAudioVoicePriority,
    edgeVoice,
    edgeIndonesianVoice,
    aiVoiceName,
    audioDownloadHistory,
    exportTableAudioMp3,
    exportTableCardMp3,
    exportTableCardZip,
    removeTableStagedAudio,
    cancelActiveAudioGeneration
    });
  };

  return renderMainAppShellView({
    isMobile, showAppBar, isSidebarOpen, setIsSidebarOpen, goHome,
    isSystemBusy, savedDecks, selectedDeckId, handleLoadDeck, handleDeleteDeckInit,
    currentDeckName, setCurrentDeckName, handleSaveDeck, mode, isCsvDirty,
    csvChangeSummary, saveUpdatedCSV, folderInputRef, audioZipInputRef, sourceInputRef, fullPackInputRef,
    handleFolderSelect, handleAudioZipSelect, handleSourceUpload, handleFullPackUpload, mobileTab, handleMobileTabSwitch,
    renderWorkspaceTabs, theme, setTheme, handleModeSwitch, sidebarSection,
    renderControlSectionTabs, currentMapCount, renderStatusBadge, tableAudioVoiceOptions, tableLocalAudioVoiceMode, setTableLocalAudioVoiceMode, tableAudioVoicePriority, moveTableLocalAudioVoicePriority, preferLocalAudio: activePreferLocalAudio, setPreferLocalAudio: handleActivePreferLocalAudioChange,
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
    cyclePlaybackMode, setPlaybackMode, setShowAppBar, playingContext, structuredTextModeActive, onOpenTextPlayer: () => setTextPlayerWorkspaceOpen(true), isChangeReviewOpen,
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
    textLibraryCatalog, activeTextDocument, activeTextDocumentTree: textLibraryShellDocumentTree, activeTextDocumentId, activeTextEditorModel,
    textLibraryCommandBusy: (textLibraryCommandBusy || structuredTextAudioGenerationState.running), textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
    handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryMoveDocument, handleTextLibraryDeleteDocument, handleTextLibraryRenameCollection, handleTextLibraryDeleteCollection, handleTextLibraryStructuredCommand,
    structuredTextAudioLibraryControls, structuredTextAudioCoverageMap
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