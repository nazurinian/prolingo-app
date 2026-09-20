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
import { hasStructuredTextPlayableChannel, normalizeTextStructuredPreferences, resolveTextStructuredManualPlaybackProfile, resolveTextStructuredPlaybackRate, TEXT_STRUCTURED_AUDIO_SOURCE_MODES, TEXT_STRUCTURED_ORDER_MODES, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES, TEXT_STRUCTURED_RESUME_MODES } from './domain/text/textStructuredPlaybackPreferenceDomain.js';
import { resolveTextStructuredBrowserVoiceState, resolveTextStructuredVoicePreferencePatch } from './domain/text/textStructuredVoiceDomain.js';
import { buildTextStructuredRuntimeAudioKey, buildTextStructuredRuntimeAudioStatusMap, resolveTextStructuredRuntimeAudio } from './domain/text/textStructuredAudioRuntimeDomain.js';
import { summarizeTextStructuredAudioRuntimeInventory } from './domain/text/textStructuredAudioInventoryDomain.js';
import { buildTextStructuredAudioCoverageMap, summarizeTextStructuredAudioCoverage, shouldDownloadTextStructuredCoverageSlot } from './domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata, resolveTextStructuredEffectiveDownloadVoice } from './domain/text/textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredAudioPlaybackOrderMetadata, getTextStructuredAudioPlaybackOrder, resolveTextStructuredEffectivePlaybackOrder, resolveTextStructuredEffectiveTtsOnly } from './domain/text/textStructuredAudioPlaybackOrderDomain.js';
import { buildTextStructuredGeneratedFilename, buildTextStructuredGenerationJobs, normalizeTextStructuredAudioGenerationPreferences, resolveTextStructuredGenerationVoiceState } from './domain/text/textStructuredAudioGenerationDomain.js';
import { getTextStructuredSpeakerAssignedVoiceName, getTextStructuredSpeakerVoiceMap } from './domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { buildTextStructuredSegmentSpeakerIdentityMetadata, buildTextStructuredSpeakerVoiceProfileV2Metadata, buildTextStructuredUpsertSpeakerRegistryMetadata, collectTextStructuredConversationSpeakerIdentities, getTextStructuredSegmentSpeakerId } from './domain/text/textStructuredSpeakerIdentityDomain.js';
import { buildTextStructuredAudioContentFingerprint } from './domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredAudioRenderFingerprint, TEXT_AUDIO_CODEC_PROFILE, TEXT_AUDIO_RENDERER_PROFILE_VERSION } from './domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredAudioRequirementsForSnapshot } from './domain/text/textStructuredAudioRequirementDomain.js';
import { buildTextStructuredBatchSelection, buildTextStructuredBatchWorkspaceSelection, resolveTextStructuredBatchTargetWorkspaceIds } from './domain/text/textStructuredBatchDomain.js';
import { buildTextStructuredBulkGenerationPlan, selectTextStructuredBulkGenerationRequirements, summarizeTextStructuredBulkPhysicalWork, TEXT_STRUCTURED_BULK_REPRESENTATIONS, TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS } from './domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredBulkExportPlan, TEXT_STRUCTURED_BULK_EXPORT_FORMATS } from './domain/text/textStructuredBulkExportDomain.js';
import { publishTextStructuredBatchTelemetry, resetTextStructuredBatchTelemetry } from './services/audio/textStructuredBatchTelemetryService.js';
import { buildTextStructuredVoiceOverrideMetadata, resolveTextStructuredEffectiveVoiceForItem } from './domain/text/textStructuredVoiceAssignmentDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata, getTextStructuredPlaybackRateProfile, resolveTextStructuredEffectivePlaybackRate } from './domain/text/textStructuredPlaybackRateProfileDomain.js';
import { buildTextStructuredLocalAudioProfileMetadata, collectTextStructuredAvailableLocalVoices, getTextStructuredLocalAudioProfile, resolveTextStructuredCustomLocalAudioVoice } from './domain/text/textStructuredLocalAudioProfileDomain.js';
import { buildTextStructuredAudioSyncProfileMetadata, getTextStructuredAudioSyncProfile } from './domain/text/textStructuredAudioSyncProfileDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES } from './domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { TEXT_LIBRARY_COMMAND_TYPES } from './domain/text/textLibraryCommandDomain.js';
import { resolveTextLibrarySearchActionTarget, resolveTextLibrarySearchResults, TEXT_LIBRARY_SEARCH_ACTIONS } from './domain/text/textLibrarySearchDomain.js';
import { executeTextLibraryBootstrapEffect, executeTextLibraryCompatibilityPersistenceEffect } from './services/persistence/textLibraryLifecycleService';
import { executeTextLibraryCreateCollection, executeTextLibraryCreateDocument, executeTextLibraryDeleteCollection, executeTextLibraryDeleteDocument, executeTextLibraryMoveDocument, executeTextLibraryRenameCollection, executeTextLibraryRenameDocument, executeTextLibrarySelectDocument, executeTextLibraryStructuredCommand, resolveTextLibraryActiveProjection } from './services/persistence/textLibraryWorkspaceService.js';
import { executeProLingoTextPackExport, executeProLingoTextPackFileAttachOrSync, executeProLingoTextPackFileImportCopy, executeTextSourceDetach, readTextSourceAttachments } from './services/persistence/textPackJsonService.js';
import { executeProLingoTextExternalJsonFileDecision, executeProLingoTextExternalJsonFileInitialImport, inspectProLingoTextExternalJsonFile } from './services/persistence/textExternalJsonService.js';
import { executeProLingoTextDatabaseBackupExport, executeProLingoTextDatabaseReplaceRestore, readProLingoTextDatabaseBackupFile } from './services/persistence/textDatabaseBackupService.js';
import { executeTextAudioVariantBulkUpsert, executeTextFullAudioArtifactBulkUpsert } from './services/persistence/textLibraryCommandService.js';
import { syncLegacyTextProjectionToDatabase } from './services/persistence/textLibraryIndexedDbService.js';
import { APP_CHECKPOINT_ID, APP_VERSION } from './constants/appMetadata.js';
import { executeStructuredTextPlaybackSessionService } from './services/playback/textStructuredPlaybackSessionService.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from './services/playback/textStructuredAudioRuntimeService.js';
import { executeTextStructuredPreferencePersistenceEffect } from './services/persistence/textStructuredPreferenceService.js';
import { executeTextStructuredAudioGenerationPreferencePersistenceEffect, loadTextStructuredAudioGenerationPreferences } from './services/persistence/textStructuredAudioGenerationPreferenceService.js';
import { clearAudioDownloadHistoryForMode, clearPersistedAudioDownloadHistoryForMode, loadAudioDownloadHistory, persistAudioDownloadHistory, recordAudioDownloadHistory } from './services/persistence/audioDownloadHistoryService.js';
import { executeTextStructuredAudioGenerationRequest } from './services/audio/textStructuredAudioGenerationService.js';
import { buildCanonicalTextCardZipFilename, buildCanonicalTextConsolidatedZipFilename, buildCanonicalTextFullArtifactFilename } from './domain/text/textFilenameDomain.js';
import { buildProLingoTextAudioManifest, TEXT_AUDIO_MANIFEST_FILENAME } from './domain/text/textAudioManifestDomain.js';
import { buildTextAudioIndexCsv, TEXT_AUDIO_INDEX_FILENAME } from './domain/text/textAudioIndexDomain.js';
import { buildTextStructuredFullArtifactRecord, getTextStructuredFullAudioArtifacts } from './domain/text/textStructuredSplitFullDomain.js';
import { triggerBrowserZipDownload } from './services/audio/browserZipService.js';
import { exportStagedAudioZipGroups, exportTableAudioRecordZipGroups, DIRECT_MP3_BATCH_LIMIT } from './services/audio/audioBatchExportService.js';
import { clearAudioStagingExportHistoryForMode, clearAudioStagingForMode, clearAudioStagingRuntimeCache, deleteAudioBatchSession, getAudioStagingBlob, getAudioStagingObjectUrl, listAudioBatchSessions, listAudioStagingMetadata, markAudioStagingExported, putAudioStagingBlob, recoverInterruptedAudioBatchSessions, releaseAudioStagingBlobs, requestPersistentAudioStorage, saveAudioBatchSession } from './services/persistence/audioStagingIndexedDbService.js';
import { executeTextStructuredEdgeHealthCheck } from './services/audio/textStructuredEdgeAudioDownloadService.js';
import { buildDerivedTextFullAudioFilename, buildDerivedTextFullAudioWav } from './services/audio/textStructuredFullAudioExportService.js';
import { clearTextStructuredAudioFolderRuntimeCache, executeTextStructuredAudioFolderChoose, executeTextStructuredAudioFolderReconnect, executeTextStructuredAudioFolderRestore, getTextStructuredAudioFolderRuntimeObjectUrl, readTextStructuredAudioFolderFiles, readTextStructuredAudioFolderRuntimeBlob, scanTextStructuredAudioFolderFiles, writeTextStructuredAudioFile } from './services/audio/textStructuredAudioFolderService.js';
import { clearTextStructuredAudioZipRuntimeCache, getTextStructuredAudioZipRuntimeObjectUrl, readTextStructuredAudioZipRuntimeBlob, scanTextStructuredAudioZipFiles } from './services/audio/textStructuredAudioZipArchiveService.js';
import { clearTextAudioStagingRuntimeCache, exportTextAudioStagingZipChunks, getTextAudioStagingBlob, getTextAudioStagingObjectUrl, listTextAudioStagingMetadata, putTextAudioStagingBlob, putTextFullAudioStagingBlob, releaseTextAudioStaging, releaseTextAudioStagingRecords, resolveTextAudioStagingPhysicalIdentity, summarizeTextAudioStaging, TEXT_AUDIO_STAGING_ZIP_MAX_BYTES } from './services/persistence/textAudioStagingService.js';
import { executeTextAudioStagingGarbageCollection } from './services/persistence/textAudioStagingGcService.js';


const TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY = 'prolingo_table_local_audio_playback_v1';
const TEXT_BATCH_RUNTIME_FLUSH_INTERVAL = 256;
const TEXT_BATCH_STATUS_RENDER_INTERVAL = 10;
const compactVoiceFilenameLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'Voice';
  const tail = raw.split('-').pop() || raw;
  return sanitizeFilename(tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw);
};

const buildTextBulkAudioOnlyFilename = (entry, index = 0) => {
  const reference = entry?.references?.[0] || {};
  const seq = String(index + 1).padStart(3, '0');
  const channel = entry?.channel === 'meaning' ? 'ID' : 'EN';
  const voice = compactVoiceFilenameLabel(entry?.voiceId);
  const card = sanitizeFilename(reference?.cardTitle || reference?.cardId || 'Card');
  const segment = sanitizeFilename(reference?.segmentId || 'Segment');
  const ext = String(entry?.canonicalFilename || '').split('.').pop()?.toLowerCase() || (String(entry?.mimeType || '').includes('wav') ? 'wav' : 'mp3');
  if (entry?.representation === 'full') return `${seq}_${card}_FULL_${channel}_${voice}.${ext}`;
  return `${seq}_${card}_${segment}_${channel}_${voice}.${ext}`;
};

const buildTextBulkArchiveFilename = ({ kind = 'portable', scopeLabel = 'Text', partNo = null } = {}) => {
  const safe = sanitizeFilename(scopeLabel || 'Text');
  const prefix = kind === 'audio-only' ? 'ProLingo_Audio_Only' : 'ProLingo_Text_Audio_Portable';
  return `${prefix}_${safe}${partNo ? `_PART_${String(partNo).padStart(2, '0')}` : ''}.zip`;
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
  // beta.8/P3: Full Audio Artifacts are block-level derived binaries, not Segment AudioVariants.
  // Keep their session runtime handles separate so existing Split pruning cannot discard them.
  const [structuredTextFullAudioRuntimeUrls, setStructuredTextFullAudioRuntimeUrls] = useState({});
  const [structuredTextPlaybackSourceStatus, setStructuredTextPlaybackSourceStatus] = useState(null);
  const structuredTextAudioRuntimeUrlsRef = useRef({});
  const structuredTextFullAudioRuntimeUrlsRef = useRef({});
  // Final Text C6: Text binary staging is separate from core Text DB and keeps Blob data out of React state.
  const [structuredTextAudioStagingSummary, setStructuredTextAudioStagingSummary] = useState({ count: 0, bytes: 0, voices: {} });
  const structuredTextAudioStagingSummaryRef = useRef({ count: 0, bytes: 0, voices: {} });
  const structuredTextAudioStagingRecordsRef = useRef(new Map());
  const structuredTextAudioPendingRuntimeRef = useRef(new Map());
  const structuredTextAudioPendingVariantRef = useRef(new Map());
  const structuredTextAudioPendingCountersRef = useRef(null);
  const structuredTextAudioStagingHydratedRef = useRef(false);
  // P4-A12: Text-owned generator/folder state. These preferences never read Table generator settings.
  const [structuredTextAudioGenerationPreferences, setStructuredTextAudioGenerationPreferences] = useState(loadTextStructuredAudioGenerationPreferences);
  const [structuredTextAudioGenerationState, setStructuredTextAudioGenerationState] = useState({ running: false, completed: 0, total: 0, current: null, failedJobs: [], lastStatus: null, processed: 0, generated: 0, skippedReady: 0, failed: 0, remaining: 0, readyEstimate: 0, missingEstimate: 0 });
  const [structuredTextBatchScope, setStructuredTextBatchScope] = useState({ scopeMode: 'collection', documentId: null, collectionId: null, selectedDocumentIds: [], cardId: null, startCard: 1, endCard: 1 });
  const [structuredTextEdgeHealth, setStructuredTextEdgeHealth] = useState({ status: 'idle', message: 'Not tested' });
  const [structuredTextAudioFolderState, setStructuredTextAudioFolderState] = useState({ status: 'deprecated-locked', name: null, matchedCount: 0, physicalAudioCount: 0, physicalRfCount: 0, orphanCount: 0, legacyCount: 0, aliasMatchedCount: 0, deprecated: true, locked: true });
  // beta.8/P4: Portable ZIP sources are additive imports into canonical Text Staging; Folder is deprecated/locked.
  // The archive itself is session-bound; only its index is kept in runtime state.
  const [structuredTextAudioZipState, setStructuredTextAudioZipState] = useState({ archives: [], matchedCount: 0, splitMatchedCount: 0, fullMatchedCount: 0, orphanCount: 0, legacyCount: 0, aliasMatchedCount: 0, unsupportedCount: 0, physicalImportedCount: 0 });
  const structuredTextAudioGenerationAbortRef = useRef(null);
  const structuredTextAudioBatchStopRef = useRef(false);
  // beta.8/P6: arm Auto Export as React state so export preflight runs only after
  // logical metadata + durable Staging reconciliation have produced a fresh export plan.
  const [structuredTextPendingAutoExport, setStructuredTextPendingAutoExport] = useState(null);
  const structuredTextAudioDirectoryHandleRef = useRef(null);
  const structuredTextAudioRememberedHandleRef = useRef(null);
  const structuredTextAudioFolderRestoreAttemptedRef = useRef(false);

  useEffect(() => {
    structuredTextAudioRuntimeUrlsRef.current = structuredTextAudioRuntimeUrls;
  }, [structuredTextAudioRuntimeUrls]);

  useEffect(() => {
    structuredTextFullAudioRuntimeUrlsRef.current = structuredTextFullAudioRuntimeUrls;
  }, [structuredTextFullAudioRuntimeUrls]);

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


  useEffect(() => {
    const validFull = new Set();
    (textLibrarySnapshot?.blocks || []).forEach(block => {
      getTextStructuredFullAudioArtifacts(block).forEach(artifact => validFull.add(artifact.fullArtifactFingerprint));
    });
    setStructuredTextFullAudioRuntimeUrls(prev => {
      let changed = false;
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (validFull.has(id)) next[id] = entry;
        else {
          changed = true;
          if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
        }
      });
      return changed ? next : prev;
    });
  }, [textLibrarySnapshot?.blocks]);

  useEffect(() => () => {
    Object.values(structuredTextAudioRuntimeUrlsRef.current || {}).forEach(entry => {
      if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
    });
    Object.values(structuredTextFullAudioRuntimeUrlsRef.current || {}).forEach(entry => {
      if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
    });
    clearTextStructuredAudioZipRuntimeCache();
    clearTextStructuredAudioFolderRuntimeCache();
    clearTextAudioStagingRuntimeCache();
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

  useEffect(() => {
    if (textDatabaseStatus !== 'ready' || structuredTextAudioStagingHydratedRef.current) return;
    if (!Array.isArray(textLibrarySnapshot?.audioVariants) || !Array.isArray(textLibrarySnapshot?.blocks)) return;
    structuredTextAudioStagingHydratedRef.current = true;
    let cancelled = false;
    listTextAudioStagingMetadata({ includeReleased: false }).then(rows => {
      if (cancelled) return;
      const active = (rows || []).filter(record => record?.hasBlob);
      structuredTextAudioStagingRecordsRef.current = new Map(active.map(record => [record.id, record]));
      const stagingSummary = summarizeTextAudioStaging(active);
      structuredTextAudioStagingSummaryRef.current = stagingSummary;
      setStructuredTextAudioStagingSummary(stagingSummary);

      const variants = textLibrarySnapshot?.audioVariants || [];
      const variantsById = new Map(variants.map(item => [String(item?.id || '').toUpperCase(), item]));
      const variantsByRf = new Map();
      variants.forEach(variant => {
        const rf = String(variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
        if (!rf) return;
        const list = variantsByRf.get(rf) || [];
        list.push(variant);
        variantsByRf.set(rf, list);
      });

      const fullArtifactsByFingerprint = new Map();
      (textLibrarySnapshot?.blocks || []).forEach(block => {
        getTextStructuredFullAudioArtifacts(block).forEach(artifact => {
          const fingerprint = String(artifact?.fullArtifactFingerprint || '').toLowerCase();
          if (!fingerprint) return;
          const list = fullArtifactsByFingerprint.get(fingerprint) || [];
          list.push({ block, artifact });
          fullArtifactsByFingerprint.set(fingerprint, list);
        });
      });

      setStructuredTextAudioRuntimeUrls(prev => {
        const next = { ...prev };
        active.forEach(record => {
          const physical = resolveTextAudioStagingPhysicalIdentity(record);
          if (physical.representation !== 'split') return;
          const recordRf = physical.identity;
          const rfVariants = recordRf?.startsWith('rf-sha256-') ? (variantsByRf.get(recordRf) || []) : [];
          const legacyVariantId = String(record?.metadata?.audioVariantId || record?.mapKey || '').toUpperCase();
          const candidates = rfVariants.length ? rfVariants : [variantsById.get(legacyVariantId)].filter(Boolean);
          candidates.forEach(variant => {
            const variantId = String(variant?.id || '').toUpperCase();
            if (!variantId) return;
            if (rfVariants.length) {
              if (String(variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase() !== recordRf) return;
            } else {
              const recordFingerprint = String(record?.metadata?.contentFingerprint || '');
              const variantFingerprint = String(variant?.metadata?.contentFingerprint || '');
              if (!recordFingerprint || !variantFingerprint || recordFingerprint !== variantFingerprint) return;
              if (String(record?.voiceId || '').toLowerCase() !== String(variant?.voiceId || '').toLowerCase()) return;
              if (String(record?.engine || '').toLowerCase() !== String(variant?.engine || '').toLowerCase()) return;
              if (String(record?.part || '').toLowerCase() !== String(variant?.channel || '').toLowerCase()) return;
            }
            const current = next[variantId];
            if (current?.url) return;
            next[variantId] = {
              ...(current?.zipBacked ? { zipFallback: current } : current?.zipFallback ? { zipFallback: current.zipFallback } : {}),
              stagingBacked: true,
              stagingId: record.id,
              renderFingerprint: recordRf?.startsWith('rf-sha256-') ? recordRf : null,
              filename: record.filename || current?.filename || null,
              mimeType: record.mimeType || current?.mimeType || null,
              representation: 'split'
            };
          });
        });
        return next;
      });

      setStructuredTextFullAudioRuntimeUrls(prev => {
        const next = { ...prev };
        active.forEach(record => {
          const physical = resolveTextAudioStagingPhysicalIdentity(record);
          if (physical.representation !== 'full') return;
          const consumers = fullArtifactsByFingerprint.get(physical.identity) || [];
          if (!consumers.length) return;
          next[physical.identity] = {
            stagingBacked: true,
            stagingId: record.id,
            fullArtifactFingerprint: physical.identity,
            filename: record.filename || consumers[0]?.artifact?.filename || null,
            mimeType: record.mimeType || consumers[0]?.artifact?.mimeType || null,
            representation: 'full',
            consumerBlockIds: consumers.map(item => item.block?.id).filter(Boolean)
          };
        });
        return next;
      });
    }).catch(error => {
      structuredTextAudioStagingHydratedRef.current = false;
      addLog('Warn', `Text Staging restore failed: ${error?.message || error}`);
    });
    return () => { cancelled = true; };
  }, [textDatabaseStatus, textLibrarySnapshot?.audioVariants, textLibrarySnapshot?.blocks, addLog]);


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
  useEffect(() => { setStructuredTextPlaybackSourceStatus(null); }, [activeTextDocumentTree?.id]);
  // P4-A11: speaker profiles are document metadata, not audio identity. The requested
  // voice can differ per conversation speaker while SEGMENT_ID/TXTAUDIO identity stays stable.
  const structuredTextSpeakerVoiceMap = useMemo(
    () => getTextStructuredSpeakerVoiceMap(activeTextDocumentTree),
    [activeTextDocumentTree?.metadata]
  );
  const structuredTextAudioSyncProfile = useMemo(
    () => getTextStructuredAudioSyncProfile(activeTextDocumentTree),
    [activeTextDocumentTree?.metadata]
  );
  const structuredTextAudioPlaybackOrder = useMemo(
    () => getTextStructuredAudioPlaybackOrder(activeTextDocumentTree),
    [activeTextDocumentTree?.metadata]
  );
  const structuredTextConversationSpeakers = useMemo(
    () => collectTextStructuredConversationSpeakerIdentities(activeTextDocumentTree),
    [activeTextDocumentTree]
  );
  const defaultStructuredTextVoiceId = textStructuredPreferences.browserTextVoiceName || selectedTextBrowserVoice?.name || null;
  const defaultStructuredMeaningVoiceId = textStructuredPreferences.browserMeaningVoiceName || selectedTextIndonesianVoice?.name || null;
  const structuredTextDownloadResolutionPreferences = useMemo(() => ({
    ...structuredTextAudioGenerationPreferences,
    playbackTextVoiceName: defaultStructuredTextVoiceId,
    playbackMeaningVoiceName: defaultStructuredMeaningVoiceId,
    edgeVoices: initialEdgeVoices
  }), [structuredTextAudioGenerationPreferences, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId]);
  const resolveStructuredTextChannelVoiceState = useCallback((item, channel) => {
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const isMeaning = normalizedChannel === 'meaning';
    const defaultVoice = isMeaning ? selectedTextIndonesianVoice : selectedTextBrowserVoice;
    const defaultVoiceId = isMeaning ? defaultStructuredMeaningVoiceId : defaultStructuredTextVoiceId;
    const syncVoice = item?.blockType === 'conversation'
      && structuredTextAudioSyncProfile.voice?.[normalizedChannel] === true
      && structuredTextConversationSpeakers.length > 0;
    let assignment;
    if (syncVoice) {
      const firstSpeaker = structuredTextConversationSpeakers[0];
      const firstVoice = getTextStructuredSpeakerAssignedVoiceName({
        documentTree: activeTextDocumentTree,
        speaker: firstSpeaker.label,
        speakerId: firstSpeaker.id,
        channel: normalizedChannel
      });
      assignment = { voiceName: firstVoice || defaultVoiceId, source: 'sync-speaker-1' };
    } else {
      assignment = resolveTextStructuredEffectiveVoiceForItem({
        documentTree: activeTextDocumentTree,
        item,
        channel: normalizedChannel,
        defaultVoiceName: defaultVoiceId,
      });
    }
    const requestedVoiceId = assignment.voiceName || defaultVoice?.name || null;
    const pool = isMeaning ? indonesianVoices : voices;
    const exactVoice = requestedVoiceId
      ? (Array.isArray(pool) ? pool : []).find(voice => String(voice?.name || '').trim() === requestedVoiceId)
      : null;
    return {
      requestedVoiceId,
      ttsVoice: exactVoice || defaultVoice || null,
      mappedVoiceAvailable: Boolean(exactVoice),
      assignmentSource: assignment.source,
      syncedToFirstSpeaker: syncVoice
    };
  }, [activeTextDocumentTree, structuredTextAudioSyncProfile, structuredTextConversationSpeakers, selectedTextBrowserVoice, selectedTextIndonesianVoice, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, voices, indonesianVoices]);
  const resolveStructuredTextItemPlaybackRate = useCallback((item, channel = 'text') => {
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const syncRate = item?.blockType === 'conversation'
      && structuredTextAudioSyncProfile.rate?.[normalizedChannel] === true
      && structuredTextConversationSpeakers.length > 0;
    if (syncRate) {
      const firstSpeaker = structuredTextConversationSpeakers[0];
      const rateProfile = getTextStructuredPlaybackRateProfile(activeTextDocumentTree);
      return rateProfile?.speakerIds?.[normalizedChannel]?.[firstSpeaker.id]
        || rateProfile?.speakers?.[normalizedChannel]?.[String(firstSpeaker.label || '').trim().toLowerCase()]
        || rateProfile?.channels?.[normalizedChannel]
        || resolveTextStructuredPlaybackRate(textStructuredPreferences, normalizedChannel);
    }
    const blockId = item?.blockId || item?.textId;
    const segmentId = item?.segmentId || item?.id;
    const block = (activeTextDocumentTree?.blocks || []).find(candidate => candidate?.id === blockId) || null;
    const segment = (block?.segments || []).find(candidate => candidate?.id === segmentId) || item || null;
    return resolveTextStructuredEffectivePlaybackRate({
      documentTree: activeTextDocumentTree,
      block,
      segment,
      channel: normalizedChannel,
      globalRate: resolveTextStructuredPlaybackRate(textStructuredPreferences, normalizedChannel)
    });
  }, [activeTextDocumentTree, structuredTextAudioSyncProfile, structuredTextConversationSpeakers, textStructuredPreferences]);
  const structuredTextAudioRuntimeStatusMap = useMemo(() => buildTextStructuredRuntimeAudioStatusMap({
    documentTree: activeTextDocumentTree,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls,
    textVoiceId: defaultStructuredTextVoiceId,
    meaningVoiceId: defaultStructuredMeaningVoiceId,
    speakerVoiceMap: structuredTextSpeakerVoiceMap,
    preferredGeneratedEngine: 'edge',
    downloadPreferences: structuredTextDownloadResolutionPreferences
  }), [activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, structuredTextSpeakerVoiceMap, structuredTextDownloadResolutionPreferences]);
  const structuredTextAudioCoverageMap = useMemo(() => buildTextStructuredAudioCoverageMap({
    documentTree: activeTextDocumentTree,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls,
    preferences: structuredTextDownloadResolutionPreferences
  }), [activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, structuredTextDownloadResolutionPreferences]);
  const structuredTextAvailableLocalVoices = useMemo(() => collectTextStructuredAvailableLocalVoices({
    documentTree: activeTextDocumentTree,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls
  }), [activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls]);
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
  const structuredTextBatchCollectionOptions = useMemo(() => {
    if (!textLibrarySnapshot) return [];
    const structuredCounts = new Map();
    (textLibrarySnapshot.documents || []).filter(document => document?.editorModel === 'structured-v1').forEach(document => {
      const key = document.collectionId || '__root__';
      structuredCounts.set(key, (structuredCounts.get(key) || 0) + 1);
    });
    return (textLibrarySnapshot.collections || []).map(collection => ({
      id: collection.id,
      title: collection.title || 'Book Collection',
      workspaceCount: structuredCounts.get(collection.id) || 0
    }));
  }, [textLibrarySnapshot]);

  const structuredTextBatchDocumentOptions = useMemo(() => {
    if (!textLibrarySnapshot) return [];
    const collectionTitleById = new Map((textLibrarySnapshot.collections || []).map(collection => [collection.id, collection.title || 'Book Collection']));
    return (textLibrarySnapshot.documents || [])
      .filter(document => document?.editorModel === 'structured-v1')
      .map(document => ({
        id: document.id,
        title: document.title || 'Text Workspace',
        collectionId: document.collectionId || null,
        collectionTitle: document.collectionId ? (collectionTitleById.get(document.collectionId) || 'Book Collection') : 'Unfiled / Library Root',
        documentType: document.documentType || 'mixed'
      }));
  }, [textLibrarySnapshot]);

  const structuredTextBatchCardOptions = useMemo(() => (activeTextDocumentTree?.blocks || []).map((block, index) => ({
    id: block.id,
    index: index + 1,
    title: block.title || `Card ${index + 1}`,
    blockType: block.blockType || 'paragraph'
  })), [activeTextDocumentTree?.blocks]);

  useEffect(() => {
    const documentId = activeTextDocumentTree?.id || null;
    const collectionId = activeTextDocumentTree?.collectionId || null;
    const cardCount = Math.max(1, activeTextDocumentTree?.blocks?.length || 1);
    const cardIds = new Set((activeTextDocumentTree?.blocks || []).map(block => block?.id).filter(Boolean));
    setStructuredTextBatchScope(prev => {
      const startCard = Math.min(cardCount, Math.max(1, Number(prev?.startCard || 1)));
      const endCard = Math.min(cardCount, Math.max(startCard, Number(prev?.endCard || cardCount)));
      const validSelected = (prev?.selectedDocumentIds || []).filter(id => structuredTextBatchDocumentOptions.some(document => document.id === id));
      const documentChanged = prev?.documentId !== documentId;
      const cardId = !documentChanged && prev?.cardId && cardIds.has(prev.cardId)
        ? prev.cardId
        : (activeTextDocumentTree?.blocks?.[0]?.id || null);
      const scopeMode = prev?.scopeMode === 'collection' && !collectionId ? 'workspace' : (prev?.scopeMode || (collectionId ? 'collection' : 'workspace'));
      if (prev?.documentId === documentId && prev?.collectionId === collectionId && prev?.cardId === cardId && prev?.scopeMode === scopeMode && startCard === prev.startCard && endCard === prev.endCard && validSelected.length === (prev?.selectedDocumentIds || []).length) return prev;
      return { ...prev, documentId, collectionId, cardId, scopeMode, startCard, endCard, selectedDocumentIds: validSelected };
    });
  }, [activeTextDocumentTree?.id, activeTextDocumentTree?.collectionId, activeTextDocumentTree?.blocks, structuredTextBatchDocumentOptions]);

  const structuredTextBatchTargetDocumentIds = useMemo(() => resolveTextStructuredBatchTargetWorkspaceIds({
    workspaceOptions: structuredTextBatchDocumentOptions,
    activeWorkspaceId: activeTextDocumentTree?.id || null,
    activeCollectionId: activeTextDocumentTree?.collectionId || null,
    scope: structuredTextBatchScope
  }), [structuredTextBatchScope, structuredTextBatchDocumentOptions, activeTextDocumentTree?.id, activeTextDocumentTree?.collectionId]);

  const structuredTextBatchTargetTrees = useMemo(() => {
    if (!textLibrarySnapshot) return [];
    return structuredTextBatchTargetDocumentIds
      .map(documentId => resolveTextLibraryDocumentTree(textLibrarySnapshot, documentId))
      .filter(documentTree => documentTree?.editorModel === 'structured-v1');
  }, [textLibrarySnapshot, structuredTextBatchTargetDocumentIds]);

  const structuredTextBatchCoverageMaps = useMemo(() => {
    const maps = {};
    structuredTextBatchTargetTrees.forEach(documentTree => {
      maps[documentTree.id] = buildTextStructuredAudioCoverageMap({
        documentTree,
        audioVariants: textLibrarySnapshot?.audioVariants || [],
        runtimeAudioUrls: structuredTextAudioRuntimeUrls,
        preferences: structuredTextDownloadResolutionPreferences
      });
    });
    return maps;
  }, [structuredTextBatchTargetTrees, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, structuredTextDownloadResolutionPreferences]);

  const structuredTextBatchSelection = useMemo(() => buildTextStructuredBatchWorkspaceSelection({
    documentTrees: structuredTextBatchTargetTrees,
    preferences: structuredTextDownloadResolutionPreferences,
    coverageMapsByDocument: structuredTextBatchCoverageMaps,
    activeDocumentId: activeTextDocumentTree?.id || null,
    activeScope: (structuredTextBatchScope?.scopeMode || 'workspace') === 'card' ? { cardId: structuredTextBatchScope?.cardId || null } : null
  }), [structuredTextBatchTargetTrees, structuredTextDownloadResolutionPreferences, structuredTextBatchCoverageMaps, activeTextDocumentTree?.id, structuredTextBatchScope?.scopeMode, structuredTextBatchScope?.cardId]);

  // beta.8/P5: Bulk generation has its own explicit voice + Split/Full selection.
  // It consumes the already-resolved scope but never mutates playback priority.
  const structuredTextBulkGenerationPlan = useMemo(() => buildTextStructuredBulkGenerationPlan({
    documentTrees: structuredTextBatchTargetTrees,
    selection: structuredTextBatchSelection,
    preferences: structuredTextAudioGenerationPreferences,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    runtimeAudioUrls: structuredTextAudioRuntimeUrls,
    runtimeFullAudio: structuredTextFullAudioRuntimeUrls,
    stagingRecords: [...structuredTextAudioStagingRecordsRef.current.values()]
  }), [structuredTextBatchTargetTrees, structuredTextBatchSelection, structuredTextAudioGenerationPreferences, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, structuredTextFullAudioRuntimeUrls, structuredTextAudioStagingSummary]);

  // beta.8/P6: export is planned independently from generation order and playback
  // priority, but consumes the same resolved Paragraph scope and canonical Staging.
  const structuredTextBulkExportPlan = useMemo(() => buildTextStructuredBulkExportPlan({
    documentTrees: structuredTextBatchTargetTrees,
    selection: structuredTextBatchSelection,
    preferences: structuredTextAudioGenerationPreferences,
    audioVariants: textLibrarySnapshot?.audioVariants || [],
    stagingRecords: [...structuredTextAudioStagingRecordsRef.current.values()]
  }), [structuredTextBatchTargetTrees, structuredTextBatchSelection, structuredTextAudioGenerationPreferences, textLibrarySnapshot?.audioVariants, structuredTextAudioStagingSummary]);
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
  const activeBrowserTtsRate = structuredTextModeActive ? textStructuredPreferences.browserTextRate : rate;
  const activeBrowserTtsMeaningRate = structuredTextModeActive ? textStructuredPreferences.browserMeaningRate : rate;
  const activeBrowserTtsRatesLinked = structuredTextModeActive ? textStructuredPreferences.browserRatesLinked !== false : true;
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
  const handleActiveBrowserTtsRateChange = (value, channel = 'text') => {
    if (structuredTextModeActive) {
      const numericRate = Number(value);
      const nextRate = Number.isFinite(numericRate) ? Math.min(2, Math.max(0.5, Math.round(numericRate * 10) / 10)) : 1;
      setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({
        ...prev,
        ...(channel === 'meaning'
          ? { browserMeaningRate: nextRate, ...(prev.browserRatesLinked !== false ? { browserTextRate: nextRate } : {}) }
          : { browserTextRate: nextRate, browserTtsRate: nextRate, ...(prev.browserRatesLinked !== false ? { browserMeaningRate: nextRate } : {}) })
      }));
      return;
    }
    setRate(value);
  };
  const handleActiveBrowserTtsRatesLinkedChange = (linked) => {
    if (!structuredTextModeActive) return;
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({
      ...prev,
      browserRatesLinked: Boolean(linked),
      ...(linked ? { browserMeaningRate: prev.browserTextRate ?? prev.browserTtsRate ?? 1 } : {})
    }));
  };
  const handleStructuredTextDisplayModeChange = useCallback((displayMode) => {
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, displayMode }));
  }, []);
  const handleStructuredTextPlaybackChannelModeChange = useCallback((playbackChannelMode) => {
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, playbackChannelMode }));
  }, []);
  const handleStructuredTextPlaybackRepresentationModeChange = useCallback((playbackRepresentationMode) => {
    forceStopAll();
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, playbackRepresentationMode }));
  }, [forceStopAll]);
  const handleStructuredTextPlaybackFeelChange = useCallback((patch) => {
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, ...(patch || {}) }));
  }, []);
  const handleStructuredTextAudioSourceModeChange = (audioSourceMode) => {
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, audioSourceMode }));
    setStructuredTextPlaybackSourceStatus(null);
    forceStopAll();
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

  const rememberStructuredTextStagingRecord = useCallback((record, { deferUi = false } = {}) => {
    if (!record?.id) return;
    const map = structuredTextAudioStagingRecordsRef.current;
    const previous = map.get(record.id) || null;
    map.set(record.id, record);
    const current = structuredTextAudioStagingSummaryRef.current || { count: 0, bytes: 0, voices: {} };
    const previousActive = previous?.hasBlob ? 1 : 0;
    const nextActive = record?.hasBlob ? 1 : 0;
    const voices = { ...(current?.voices || {}) };
    if (previous?.hasBlob && previous?.voiceId) {
      const key = String(previous.voiceId);
      voices[key] = Math.max(0, Number(voices[key] || 0) - 1);
      if (!voices[key]) delete voices[key];
    }
    if (record?.hasBlob && record?.voiceId) {
      const key = String(record.voiceId);
      voices[key] = Number(voices[key] || 0) + 1;
    }
    const nextSummary = {
      count: Math.max(0, Number(current?.count || 0) - previousActive + nextActive),
      bytes: Math.max(0, Number(current?.bytes || 0) - Number(previous?.hasBlob ? previous?.size || 0 : 0) + Number(record?.hasBlob ? record?.size || 0 : 0)),
      voices
    };
    structuredTextAudioStagingSummaryRef.current = nextSummary;
    if (!deferUi) setStructuredTextAudioStagingSummary(nextSummary);
  }, []);

  const forgetStructuredTextStagingRecord = useCallback((record, { deferUi = false } = {}) => {
    if (!record?.id) return;
    structuredTextAudioStagingRecordsRef.current.delete(record.id);
    const current = structuredTextAudioStagingSummaryRef.current || { count: 0, bytes: 0, voices: {} };
    const voices = { ...(current?.voices || {}) };
    if (record?.hasBlob && record?.voiceId) {
      const key = String(record.voiceId);
      voices[key] = Math.max(0, Number(voices[key] || 0) - 1);
      if (!voices[key]) delete voices[key];
    }
    const nextSummary = {
      count: Math.max(0, Number(current?.count || 0) - (record?.hasBlob ? 1 : 0)),
      bytes: Math.max(0, Number(current?.bytes || 0) - Number(record?.hasBlob ? record?.size || 0 : 0)),
      voices
    };
    structuredTextAudioStagingSummaryRef.current = nextSummary;
    if (!deferUi) setStructuredTextAudioStagingSummary(nextSummary);
  }, []);

  const runStructuredTextAudioStagingGc = useCallback(async (snapshot, reason = 'text-rf-gc') => {
    if (!snapshot) return null;
    const result = await executeTextAudioStagingGarbageCollection(snapshot, { reason });
    if (result?.released) {
      (result.orphanRecords || []).forEach(record => forgetStructuredTextStagingRecord(record, { deferUi: true }));
      setStructuredTextAudioStagingSummary({ ...(structuredTextAudioStagingSummaryRef.current || { count: 0, bytes: 0, voices: {} }) });
      addLog('Text Audio', `Text Staging GC: released ${result.released} unreferenced Split/Full physical file${result.released === 1 ? '' : 's'} (${result.orphanBytes || 0} bytes). Legacy staging kept.`);
    }
    return result;
  }, [forgetStructuredTextStagingRecord, addLog]);

  const flushStructuredTextStagingSummary = useCallback(() => {
    setStructuredTextAudioStagingSummary({ ...(structuredTextAudioStagingSummaryRef.current || { count: 0, bytes: 0, voices: {} }) });
  }, []);

  const queueStructuredTextRuntimeEntry = useCallback((variantId, entry, { immediate = false } = {}) => {
    const id = String(variantId || '').toUpperCase();
    if (!id || !entry) return;
    if (!immediate) {
      structuredTextAudioPendingRuntimeRef.current.set(id, entry);
      return;
    }
    setStructuredTextAudioRuntimeUrls(prev => ({ ...prev, [id]: entry }));
  }, []);

  const flushStructuredTextPendingRuntimeEntries = useCallback(() => {
    const pending = structuredTextAudioPendingRuntimeRef.current;
    if (!pending.size) return 0;
    const entries = [...pending.entries()];
    pending.clear();
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = { ...prev };
      entries.forEach(([id, entry]) => { next[id] = entry; });
      return next;
    });
    return entries.length;
  }, []);

  const flushStructuredTextPendingAudioVariants = useCallback(() => {
    const pending = structuredTextAudioPendingVariantRef.current;
    if (!pending.size) return 0;
    const updates = new Map(pending);
    pending.clear();
    const counters = structuredTextAudioPendingCountersRef.current;
    structuredTextAudioPendingCountersRef.current = null;
    setTextLibrarySnapshot(previous => {
      if (!previous) return previous;
      const existing = Array.isArray(previous.audioVariants) ? previous.audioVariants : [];
      const nextVariants = existing.map(item => updates.get(item.id) || item);
      const known = new Set(existing.map(item => item.id));
      updates.forEach((record, id) => { if (!known.has(id)) nextVariants.push(record); });
      return { ...previous, counters: counters || previous.counters, audioVariants: nextVariants };
    });
    return updates.size;
  }, [setTextLibrarySnapshot]);

  const materializeStructuredTextExternalRfRequirementsBulk = useCallback(async (entries = [], deliveryStatus = 'external-rf-ready', { deferSnapshot = false } = {}) => {
    const candidates = (Array.isArray(entries) ? entries : []).filter(entry => entry?.requirement?.segmentId && entry?.requirement?.channel && entry?.requirement?.renderFingerprint && entry?.requirement?.voiceId);
    if (!candidates.length) return new Map();
    const payloads = candidates.map(({ requirement, filename = null, mimeType = null }) => ({
      segmentId: requirement.segmentId,
      channel: requirement.channel,
      source: 'generated',
      engine: requirement.engine || 'edge',
      voiceId: requirement.voiceId,
      language: requirement.language || (requirement.channel === 'meaning' ? 'id' : 'en'),
      filename,
      mimeType,
      metadata: {
        generatedBy: 'TEXT_RF_RECONNECT_V2',
        generatedAt: null,
        engineVoiceId: requirement.voiceId,
        downloadProfileVoiceId: requirement.voiceId,
        playbackProfileVoiceId: null,
        assignmentSource: requirement.voiceSource || 'rf-reconnect',
        contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: requirement.channel, content: requirement.content }),
        contentFingerprintV2: requirement.contentFingerprintV2 || null,
        audioRenderFingerprintV1: requirement.renderFingerprint,
        audioRenderDescriptorV1: requirement.renderDescriptor || null,
        profileMatched: true,
        externalRfReconnected: true,
        reusedPhysicalRender: true,
        deliveryStatus
      }
    }));
    const result = await executeTextAudioVariantBulkUpsert(payloads);
    const records = result?.audioVariants || [];
    if (records.length) {
      if (deferSnapshot) {
        records.forEach(record => structuredTextAudioPendingVariantRef.current.set(record.id, record));
        structuredTextAudioPendingCountersRef.current = result.counters || structuredTextAudioPendingCountersRef.current;
      } else {
        setTextLibrarySnapshot(previous => {
          if (!previous) return previous;
          const updates = new Map(records.map(record => [record.id, record]));
          const existing = Array.isArray(previous.audioVariants) ? previous.audioVariants : [];
          const seen = new Set(existing.map(record => record.id));
          const next = existing.map(record => updates.get(record.id) || record);
          records.forEach(record => { if (!seen.has(record.id)) next.push(record); });
          return { ...previous, counters: result.counters || previous.counters, audioVariants: next };
        });
      }
    }
    const byRequirement = new Map();
    candidates.forEach((entry, index) => {
      const requirement = entry.requirement;
      const key = `${String(requirement.segmentId).toUpperCase()}|${String(requirement.channel).toLowerCase()}|${String(requirement.renderFingerprint).toLowerCase()}`;
      if (records[index]) byRequirement.set(key, records[index]);
    });
    return byRequirement;
  }, [setTextLibrarySnapshot]);

  const fanOutStructuredTextSharedRfLogicalSlots = useCallback(async ({
    renderFingerprint,
    sourceSegmentId,
    sourceChannel,
    runtimeEntry,
    filename = null,
    mimeType = null,
    deliveryStatus = 'shared-rf-ready',
    deferRuntimeState = false
  } = {}) => {
    const rf = String(renderFingerprint || '').toLowerCase();
    if (!rf || !textLibrarySnapshot || !runtimeEntry) return { materialized: 0 };
    const requirements = buildTextStructuredAudioRequirementsForSnapshot({
      snapshot: textLibrarySnapshot,
      preferences: structuredTextDownloadResolutionPreferences
    }).filter(requirement => String(requirement?.renderFingerprint || '').toLowerCase() === rf)
      .filter(requirement => !(String(requirement.segmentId).toUpperCase() === String(sourceSegmentId || '').toUpperCase() && String(requirement.channel).toLowerCase() === String(sourceChannel || '').toLowerCase()));
    if (!requirements.length) return { materialized: 0 };

    const entries = requirements.map(requirement => ({ requirement, filename: filename || runtimeEntry.filename || null, mimeType: mimeType || runtimeEntry.mimeType || null }));
    const byRequirement = await materializeStructuredTextExternalRfRequirementsBulk(entries, deliveryStatus, { deferSnapshot: deferRuntimeState });
    const runtimeUpdates = [];
    requirements.forEach(requirement => {
      const key = `${String(requirement.segmentId).toUpperCase()}|${String(requirement.channel).toLowerCase()}|${rf}`;
      const variant = byRequirement.get(key);
      if (variant) runtimeUpdates.push({ requirement, variant });
    });
    if (runtimeUpdates.length) {
      const buildRuntime = variant => ({
        ...runtimeEntry,
        filename: filename || runtimeEntry.filename || variant.filename || null,
        mimeType: mimeType || runtimeEntry.mimeType || variant.mimeType || null,
        variantId: variant.id,
        renderFingerprint: rf,
        reusedPhysicalRender: true
      });
      if (deferRuntimeState) {
        runtimeUpdates.forEach(({ variant }) => queueStructuredTextRuntimeEntry(variant.id, buildRuntime(variant), { immediate: false }));
      } else {
        setStructuredTextAudioRuntimeUrls(prev => {
          const next = { ...prev };
          runtimeUpdates.forEach(({ variant }) => { next[variant.id] = buildRuntime(variant); });
          return next;
        });
      }
      addLog('Text Audio', `Shared RF auto-linked ${runtimeUpdates.length} additional logical slot${runtimeUpdates.length === 1 ? '' : 's'} from one physical render${deferRuntimeState ? ' (deferred batch sync)' : ''}.`);
    }
    return { materialized: runtimeUpdates.length, variants: runtimeUpdates.map(item => item.variant) };
  }, [textLibrarySnapshot, structuredTextDownloadResolutionPreferences, materializeStructuredTextExternalRfRequirementsBulk, queueStructuredTextRuntimeEntry, addLog]);

  const applyStructuredTextAudioFolderFiles = useCallback(async (files, folderName = null, snapshotOverride = null) => {
    const sourceSnapshot = snapshotOverride || textLibrarySnapshot;
    const requirements = buildTextStructuredAudioRequirementsForSnapshot({
      snapshot: sourceSnapshot,
      preferences: structuredTextDownloadResolutionPreferences
    });
    const scan = await scanTextStructuredAudioFolderFiles({
      files,
      audioVariants: sourceSnapshot?.audioVariants || [],
      segments: sourceSnapshot?.segments || [],
      requirements
    });
    const missingEntries = scan.matches.filter(match => !match.variant && match.requirement).map(match => ({
      requirement: match.requirement,
      filename: match.file?.name || null,
      mimeType: match.file?.type || null
    }));
    const materializedByRequirement = await materializeStructuredTextExternalRfRequirementsBulk(missingEntries, 'folder-rf-ready');
    const boundMatches = [];
    const seenLogicalSlots = new Set();
    for (const match of scan.matches) {
      const requirementKey = match.requirement
        ? `${String(match.requirement.segmentId).toUpperCase()}|${String(match.requirement.channel).toLowerCase()}|${String(match.requirement.renderFingerprint).toLowerCase()}`
        : null;
      const variant = match.variant || (requirementKey ? materializedByRequirement.get(requirementKey) : null);
      if (!variant) continue;
      const logicalKey = `${variant.id}|${match.file?.name || ''}`;
      if (seenLogicalSlots.has(logicalKey)) continue;
      seenLogicalSlots.add(logicalKey);
      boundMatches.push({ ...match, variant });
    }
    // Folder scan indexes File references only. ObjectURLs are created lazily
    // on playback and kept in a small bounded cache inside the Folder service.
    clearTextStructuredAudioFolderRuntimeCache();
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = { ...prev };
      boundMatches.forEach(({ file, variant, renderFingerprint, manifestBacked }) => {
        const previous = next[variant.id];
        if (previous?.url) { try { URL.revokeObjectURL(previous.url); } catch {} }
        next[variant.id] = {
          filename: file.name,
          mimeType: file.type || variant.mimeType || null,
          folderBacked: true,
          folderFile: file,
          folderCacheKey: `${renderFingerprint || variant.id}|${file.name}|${file.size}|${file.lastModified || 0}`,
          variantId: variant.id,
          renderFingerprint: renderFingerprint || variant?.metadata?.audioRenderFingerprintV1 || null,
          manifestBacked: Boolean(manifestBacked),
          ...(previous?.stagingBacked ? { stagingFallbackId: previous.stagingId } : {}),
          ...(previous?.zipBacked ? { zipFallback: previous } : previous?.zipFallback ? { zipFallback: previous.zipFallback } : {})
        };
      });
      return next;
    });
    setStructuredTextAudioFolderState(prev => ({
      ...prev,
      status: 'connected',
      name: folderName || prev.name,
      matchedCount: boundMatches.length,
      physicalAudioCount: Number(scan.physicalAudioCount || 0),
      physicalRfCount: Number(scan.physicalRfCount || 0),
      orphanCount: scan.orphans.length,
      legacyCount: scan.legacy?.length || 0,
      aliasMatchedCount: boundMatches.filter(match => match.aliasMatched).length
    }));
    addLog('Text Audio', `Structured audio folder scan: ${scan.physicalRfCount || 0} physical RF file${Number(scan.physicalRfCount || 0) === 1 ? '' : 's'} → ${boundMatches.length} logical slot${boundMatches.length === 1 ? '' : 's'}, ${scan.orphans.length} orphan, ${scan.legacy?.length || 0} legacy unresolved${scan.manifestError ? ` • manifest warning: ${scan.manifestError}` : ''}.`);
    return { ...scan, matches: boundMatches };
  }, [textLibrarySnapshot, structuredTextDownloadResolutionPreferences, materializeStructuredTextExternalRfRequirementsBulk, addLog]);

  const handleStructuredTextAddAudioZipFiles = useCallback(async (files, snapshotOverride = null) => {
    const sourceSnapshot = snapshotOverride || textLibrarySnapshot;
    const selected = Array.from(files || []).filter(file => /\.zip$/i.test(file?.name || '') || String(file?.type || '').includes('zip'));
    if (!selected.length) return { status: 'no-files' };
    const requirements = buildTextStructuredAudioRequirementsForSnapshot({
      snapshot: sourceSnapshot,
      preferences: structuredTextDownloadResolutionPreferences
    });
    const scan = await scanTextStructuredAudioZipFiles({
      files: selected,
      audioVariants: sourceSnapshot?.audioVariants || [],
      segments: sourceSnapshot?.segments || [],
      requirements,
      blocks: sourceSnapshot?.blocks || [],
      documents: sourceSnapshot?.documents || []
    });

    // Split matches may refer to logical slots that do not have an AudioVariant
    // yet. Materialize those identities first, then import the ZIP Blob into the
    // canonical Text Staging store. ZIP becomes a portable source, not a runtime
    // dependency after import.
    const missingEntries = scan.matches.filter(match => !match.variant && match.requirement).map(match => ({
      requirement: match.requirement,
      filename: match.filename || null,
      mimeType: match.mimeType || null
    }));
    const materializedByRequirement = await materializeStructuredTextExternalRfRequirementsBulk(missingEntries, 'zip-imported-staging-ready');
    const boundMatches = [];
    const seenLogicalSlots = new Set();
    for (const match of scan.matches) {
      const requirementKey = match.requirement
        ? `${String(match.requirement.segmentId).toUpperCase()}|${String(match.requirement.channel).toLowerCase()}|${String(match.requirement.renderFingerprint).toLowerCase()}`
        : null;
      const variant = match.variant || (requirementKey ? materializedByRequirement.get(requirementKey) : null);
      if (!variant) continue;
      const logicalKey = `${variant.id}|${String(match.renderFingerprint || '').toLowerCase()}`;
      if (seenLogicalSlots.has(logicalKey)) continue;
      seenLogicalSlots.add(logicalKey);
      boundMatches.push({ ...match, variant });
    }

    const stagedSplitByRf = new Map();
    const splitGroups = new Map();
    boundMatches.forEach(match => {
      const rf = String(match.renderFingerprint || match.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
      if (!rf) return;
      const list = splitGroups.get(rf) || [];
      list.push(match);
      splitGroups.set(rf, list);
    });
    for (const [rf, group] of splitGroups.entries()) {
      const first = group[0];
      const variant = first.variant;
      const segment = (sourceSnapshot?.segments || []).find(item => String(item?.id || '').toUpperCase() === String(variant?.segmentId || '').toUpperCase()) || null;
      const blob = await readTextStructuredAudioZipRuntimeBlob({
        archiveFile: first.archiveFile,
        entry: first.entry,
        filename: first.filename,
        mimeType: first.mimeType
      });
      const stagingRecord = await putTextAudioStagingBlob({
        audioVariantId: variant.id,
        renderFingerprint: rf,
        documentId: segment?.documentId || null,
        segmentId: variant.segmentId,
        channel: variant.channel,
        engine: variant.engine,
        voiceId: variant.voiceId,
        filename: first.filename || variant.filename || null,
        mimeType: blob.type || first.mimeType || variant.mimeType || null,
        blob,
        metadata: {
          ...(variant.metadata || {}),
          deliveryStatus: 'zip-imported-staging-ready',
          importedFromPortableZip: true,
          sourceArchiveName: first.archiveName || null,
          sourceArchiveId: first.archiveId || null
        }
      });
      rememberStructuredTextStagingRecord(stagingRecord, { deferUi: true });
      stagedSplitByRf.set(rf, stagingRecord);
    }
    if (stagedSplitByRf.size) {
      setStructuredTextAudioRuntimeUrls(prev => {
        const next = { ...prev };
        boundMatches.forEach(match => {
          const rf = String(match.renderFingerprint || match.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
          const stagingRecord = stagedSplitByRf.get(rf);
          if (!stagingRecord) return;
          next[match.variant.id] = {
            stagingBacked: true,
            stagingId: stagingRecord.id,
            filename: stagingRecord.filename || match.filename || match.variant.filename || null,
            mimeType: stagingRecord.mimeType || match.mimeType || match.variant.mimeType || null,
            variantId: match.variant.id,
            renderFingerprint: rf,
            representation: 'split',
            importedFromPortableZip: true,
            sourceArchiveName: match.archiveName || null
          };
        });
        return next;
      });
    }

    // Full entries use block-level artifact metadata and the same Staging DB.
    // One physical Full fingerprint may be referenced by multiple Cards with
    // identical current content/profile, so persist all logical consumers in one
    // Text DB transaction while storing the Blob only once.
    const uniqueFullLogical = new Map();
    (scan.fullMatches || []).forEach(match => {
      const key = `${String(match.block?.id || '').toUpperCase()}|${String(match.fullArtifactFingerprint || '').toLowerCase()}`;
      if (!uniqueFullLogical.has(key)) uniqueFullLogical.set(key, match);
    });
    const fullLogical = [...uniqueFullLogical.values()];
    let persistedFull = { artifacts: [], blocks: [], updated: 0 };
    if (fullLogical.length) {
      persistedFull = await executeTextFullAudioArtifactBulkUpsert(fullLogical.map(match => ({
        blockId: match.block.id,
        artifact: match.artifact
      })));
      if (persistedFull.blocks.length) {
        setTextLibrarySnapshot(previous => {
          if (!previous) return previous;
          const updates = new Map(persistedFull.blocks.map(block => [block.id, block]));
          return { ...previous, blocks: (previous.blocks || []).map(block => updates.get(block.id) || block) };
        });
      }
    }

    const fullGroups = new Map();
    fullLogical.forEach(match => {
      const fingerprint = String(match.fullArtifactFingerprint || '').toLowerCase();
      const list = fullGroups.get(fingerprint) || [];
      list.push(match);
      fullGroups.set(fingerprint, list);
    });
    const stagedFullByFingerprint = new Map();
    for (const [fingerprint, group] of fullGroups.entries()) {
      const first = group[0];
      const blob = await readTextStructuredAudioZipRuntimeBlob({
        archiveFile: first.archiveFile,
        entry: first.entry,
        filename: first.filename,
        mimeType: first.mimeType
      });
      const descriptor = first.artifact?.descriptor || null;
      const stagingRecord = await putTextFullAudioStagingBlob({
        fullArtifactFingerprint: fingerprint,
        documentId: first.block?.documentId || first.document?.id || null,
        blockId: first.block?.id,
        channel: descriptor?.channel || 'text',
        engine: descriptor?.engine || 'edge',
        voiceId: descriptor?.voiceId,
        filename: first.filename || first.artifact?.filename || null,
        mimeType: blob.type || first.mimeType || first.artifact?.mimeType || null,
        blob,
        descriptor,
        metadata: {
          deliveryStatus: 'zip-imported-staging-ready',
          importedFromPortableZip: true,
          sourceArchiveName: first.archiveName || null,
          sourceArchiveId: first.archiveId || null,
          consumerBlockIds: group.map(item => item.block?.id).filter(Boolean)
        }
      });
      rememberStructuredTextStagingRecord(stagingRecord, { deferUi: true });
      stagedFullByFingerprint.set(fingerprint, stagingRecord);
    }
    if (stagedFullByFingerprint.size) {
      setStructuredTextFullAudioRuntimeUrls(prev => {
        const next = { ...prev };
        fullGroups.forEach((group, fingerprint) => {
          const stagingRecord = stagedFullByFingerprint.get(fingerprint);
          if (!stagingRecord) return;
          next[fingerprint] = {
            stagingBacked: true,
            stagingId: stagingRecord.id,
            fullArtifactFingerprint: fingerprint,
            filename: stagingRecord.filename || group[0]?.filename || null,
            mimeType: stagingRecord.mimeType || group[0]?.mimeType || null,
            representation: 'full',
            importedFromPortableZip: true,
            sourceArchiveName: group[0]?.archiveName || null,
            consumerBlockIds: group.map(item => item.block?.id).filter(Boolean)
          };
        });
        return next;
      });
    }
    flushStructuredTextStagingSummary();

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
        splitMatchedCount: archives.reduce((sum, archive) => sum + Number(archive.splitMatchedCount || 0), 0),
        fullMatchedCount: archives.reduce((sum, archive) => sum + Number(archive.fullMatchedCount || 0), 0),
        orphanCount: archives.reduce((sum, archive) => sum + Number(archive.orphanCount || 0), 0),
        legacyCount: archives.reduce((sum, archive) => sum + Number(archive.legacyCount || 0), 0),
        aliasMatchedCount: archives.reduce((sum, archive) => sum + Number(archive.aliasMatchedCount || 0), 0),
        unsupportedCount: archives.reduce((sum, archive) => sum + Number(archive.unsupportedCount || 0), 0),
        physicalImportedCount: stagedSplitByRf.size + stagedFullByFingerprint.size
      };
    });
    addLog('Text Audio', `Portable ZIP import: ${scan.archiveCount} archive(s) • Split ${boundMatches.length} logical / ${stagedSplitByRf.size} physical • Full ${fullLogical.length} logical / ${stagedFullByFingerprint.size} physical • ${scan.orphanCount} orphan. Imported audio now lives in Text Staging.`);
    return {
      status: 'added',
      ...scan,
      matches: boundMatches,
      fullMatches: fullLogical,
      matchedCount: boundMatches.length + fullLogical.length,
      stagedSplitPhysical: stagedSplitByRf.size,
      stagedFullPhysical: stagedFullByFingerprint.size
    };
  }, [textLibrarySnapshot, structuredTextDownloadResolutionPreferences, materializeStructuredTextExternalRfRequirementsBulk, rememberStructuredTextStagingRecord, flushStructuredTextStagingSummary, setTextLibrarySnapshot, addLog]);

  const reconcileStructuredTextExternalAudioSources = useCallback(async (snapshot) => {
    if (!snapshot) return { folder: null, zip: null };
    // beta.8/P4: Structured Text Folder is deprecated/locked. Portable ZIP is
    // the only external audio source reconciled into canonical Text Staging.
    let zip = null;
    const archiveFiles = [...new Map((structuredTextAudioZipState.archives || [])
      .filter(archive => archive?.archiveFile)
      .map(archive => [archive.id, archive.archiveFile])).values()];
    if (archiveFiles.length) {
      try { zip = await handleStructuredTextAddAudioZipFiles(archiveFiles, snapshot); }
      catch (error) { addLog('Warn', `Portable ZIP reconcile failed: ${error?.message || error}`); }
    }
    return { folder: null, zip };
  }, [handleStructuredTextAddAudioZipFiles, structuredTextAudioZipState.archives, addLog]);

  const handleStructuredTextClearAudioZipFiles = useCallback(() => {
    clearTextStructuredAudioZipRuntimeCache();
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (entry?.zipBacked) return;
        if (entry?.zipFallback) {
          const { zipFallback: _removed, ...rest } = entry;
          next[id] = rest;
        } else next[id] = entry;
      });
      return next;
    });
    setStructuredTextFullAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (!entry?.zipBacked) next[id] = entry;
      });
      return next;
    });
    setStructuredTextAudioZipState({ archives: [], matchedCount: 0, splitMatchedCount: 0, fullMatchedCount: 0, orphanCount: 0, legacyCount: 0, aliasMatchedCount: 0, unsupportedCount: 0, physicalImportedCount: 0 });
    addLog('Text Audio', 'Portable ZIP source list cleared. Audio already imported into Text Staging remains available.');
  }, [addLog]);

  const handleStructuredTextClearStaging = useCallback(async () => {
    forceStopAll();
    const result = await releaseTextAudioStaging({ clearHistory: false });
    clearTextAudioStagingRuntimeCache();
    structuredTextAudioStagingRecordsRef.current = new Map();
    structuredTextAudioPendingRuntimeRef.current.clear();
    structuredTextAudioStagingSummaryRef.current = { count: 0, bytes: 0, voices: {} };
    setStructuredTextAudioStagingSummary(structuredTextAudioStagingSummaryRef.current);
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (!entry?.stagingBacked) {
          next[id] = entry;
          return;
        }
        if (entry?.zipFallback) next[id] = entry.zipFallback;
      });
      return next;
    });
    setStructuredTextFullAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (!entry?.stagingBacked) next[id] = entry;
      });
      return next;
    });
    addLog('Text Audio', `Text Staging released (${result?.released || 0} physical binary file${Number(result?.released || 0) === 1 ? '' : 's'}). Split/Full metadata history remains.`);
    return result;
  }, [forceStopAll, addLog]);

  const handleStructuredTextClearRuntimeCache = useCallback(() => {
    forceStopAll();
    clearTextStructuredAudioZipRuntimeCache();
    clearTextStructuredAudioFolderRuntimeCache();
    clearTextAudioStagingRuntimeCache();
    setStructuredTextAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
        if (entry?.stagingBacked || entry?.folderBacked || entry?.zipBacked) {
          const { url: _url, ...rest } = entry;
          next[id] = rest;
        }
      });
      return next;
    });
    setStructuredTextFullAudioRuntimeUrls(prev => {
      const next = {};
      Object.entries(prev || {}).forEach(([id, entry]) => {
        if (entry?.url) { try { URL.revokeObjectURL(entry.url); } catch {} }
        const { url: _url, ...rest } = entry || {};
        next[id] = rest;
      });
      return next;
    });
    addLog('Text Audio', 'Text runtime URL cache cleared. IndexedDB Staging and portable ZIP import metadata remain attached; Folder is deprecated/locked.');
  }, [forceStopAll, addLog]);

  const handleStructuredTextChooseAudioFolder = useCallback(async () => {
    setStructuredTextAudioFolderState(prev => ({ ...prev, status: 'deprecated-locked', deprecated: true, locked: true, matchedCount: 0 }));
    addLog('Text Audio', 'Structured Text Audio Folder is deprecated and temporarily locked in beta.8. Use Portable Audio ZIP; imported ZIP audio is merged into Text Staging.');
    return { status: 'deprecated-locked' };
  }, [addLog]);

  const handleStructuredTextReconnectAudioFolder = useCallback(async () => {
    setStructuredTextAudioFolderState(prev => ({ ...prev, status: 'deprecated-locked', deprecated: true, locked: true, matchedCount: 0 }));
    addLog('Text Audio', 'Structured Text Folder reconnect is locked in beta.8.');
    return { status: 'deprecated-locked' };
  }, [addLog]);

  useEffect(() => {
    if (textDatabaseStatus !== 'ready' || structuredTextAudioFolderRestoreAttemptedRef.current) return;
    structuredTextAudioFolderRestoreAttemptedRef.current = true;
    structuredTextAudioDirectoryHandleRef.current = null;
    structuredTextAudioRememberedHandleRef.current = null;
    setStructuredTextAudioFolderState(prev => ({
      ...prev,
      status: 'deprecated-locked',
      deprecated: true,
      locked: true,
      matchedCount: 0,
      physicalAudioCount: 0,
      physicalRfCount: 0
    }));
  }, [textDatabaseStatus]);

  const registerStructuredTextGeneratedBlob = useCallback(async ({
    item,
    channel,
    blob,
    generationVoiceState,
    deferBrowserDelivery = false,
    deferRuntimeState = false
  }) => {
    const segmentId = item?.segmentId || item?.id;
    const engine = generationVoiceState.engine;
    const engineVoiceId = generationVoiceState.engineVoiceId;
    const downloadProfileVoiceId = generationVoiceState.downloadProfileVoiceId || engineVoiceId;
    const playbackProfileVoiceId = generationVoiceState.playbackProfileVoiceId || null;
    const content = channel === 'meaning' ? item?.meaning : item?.text;
    const baseMetadata = {
      generatedBy: 'FINAL_TEXT_C6',
      generatedAt: Date.now(),
      engineVoiceId,
      downloadProfileVoiceId,
      playbackProfileVoiceId,
      assignmentSource: generationVoiceState.assignmentSource || 'global-download',
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel, content }),
      contentFingerprintV2: generationVoiceState.contentFingerprintV2 || null,
      audioRenderFingerprintV1: generationVoiceState.renderFingerprint || null,
      audioRenderDescriptorV1: generationVoiceState.renderDescriptor || null,
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
          metadata: { ...baseMetadata, deliveryStatus: 'generating' }
        }
      },
      setTextLibrarySnapshot,
      addLog,
      deferSnapshot: deferRuntimeState
    });
    const filename = buildTextStructuredGeneratedFilename({
      audioVariantId: first.id,
      segmentId,
      channel,
      engine,
      engineVoiceId,
      renderFingerprint: generationVoiceState.renderFingerprint || null,
      mimeType: blob.type
    });

    let deliveryStatus = 'staged-ready';
    let packagePending = false;
    let stagingRecord = null;
    let runtimeEntry = null;
    const folderHandle = structuredTextAudioDirectoryHandleRef.current;
    if (folderHandle) {
      const writeResult = await writeTextStructuredAudioFile({ directoryHandle: folderHandle, filename, blob });
      if (writeResult.status === 'written') {
        deliveryStatus = 'folder-written';
        const previousRuntime = structuredTextAudioRuntimeUrlsRef.current?.[first.id] || null;
        runtimeEntry = {
          filename,
          mimeType: blob.type || null,
          folderBacked: true,
          folderFile: writeResult.file,
          folderFileHandle: writeResult.fileHandle,
          folderCacheKey: `${generationVoiceState.renderFingerprint || first.id}|${filename}|${writeResult.file?.size || blob.size}|${writeResult.file?.lastModified || Date.now()}`,
          renderFingerprint: generationVoiceState.renderFingerprint || null,
          variantId: first.id,
          generated: true,
          ...(previousRuntime?.zipBacked ? { zipFallback: previousRuntime } : previousRuntime?.zipFallback ? { zipFallback: previousRuntime.zipFallback } : {})
        };
        // Folder is the selected durable destination. Remove any older staged
        // binary for this exact TXTAUDIO variant so the two stores cannot drift.
        const previousStaging = [...structuredTextAudioStagingRecordsRef.current.values()].find(record =>
          record?.hasBlob
          && String(record?.mapKey || '').toUpperCase() === String(first.id || '').toUpperCase()
          && String(record?.engine || '').toLowerCase() === String(engine || '').toLowerCase()
          && String(record?.voiceId || '').toLowerCase() === String(engineVoiceId || '').toLowerCase()
        );
        if (previousStaging) {
          await releaseTextAudioStagingRecords([previousStaging], 'replaced-by-folder');
          forgetStructuredTextStagingRecord(previousStaging, { deferUi: deferRuntimeState });
        }
      } else if (!deferRuntimeState) {
        addLog('Warn', `Generation folder unavailable (${writeResult.status}); ${filename} moved to Text Staging.`);
      }
    }

    if (!runtimeEntry) {
      stagingRecord = await putTextAudioStagingBlob({
        audioVariantId: first.id,
        renderFingerprint: generationVoiceState.renderFingerprint || null,
        documentId: item?.documentId || activeTextDocumentTree?.id || null,
        segmentId,
        channel,
        engine,
        voiceId: engineVoiceId,
        filename,
        mimeType: blob.type || null,
        blob,
        metadata: { ...baseMetadata, deliveryStatus: 'staged-ready' }
      });
      rememberStructuredTextStagingRecord(stagingRecord, { deferUi: deferRuntimeState });
      runtimeEntry = {
        filename,
        mimeType: blob.type || null,
        stagingBacked: true,
        stagingId: stagingRecord.id,
        generated: true,
        variantId: first.id
      };
      packagePending = Boolean(deferBrowserDelivery);
      if (!deferBrowserDelivery) {
        const temporaryUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(temporaryUrl, filename);
        window.setTimeout(() => URL.revokeObjectURL(temporaryUrl), 5000);
      }
    }

    queueStructuredTextRuntimeEntry(first.id, runtimeEntry, { immediate: !deferRuntimeState });
    const metadata = {
      ...baseMetadata,
      deliveryStatus,
      stagingId: stagingRecord?.id || null,
      deliveredAt: deliveryStatus === 'folder-written' ? Date.now() : null
    };
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
      addLog,
      deferSnapshot: deferRuntimeState
    });
    if (deferRuntimeState && completed?.audioVariant) {
      structuredTextAudioPendingVariantRef.current.set(completed.audioVariant.id, completed.audioVariant);
      structuredTextAudioPendingCountersRef.current = completed.counters || structuredTextAudioPendingCountersRef.current;
    }

    if (generationVoiceState.renderFingerprint && runtimeEntry) {
      try {
        await fanOutStructuredTextSharedRfLogicalSlots({
          renderFingerprint: generationVoiceState.renderFingerprint,
          sourceSegmentId: segmentId,
          sourceChannel: channel,
          runtimeEntry,
          filename,
          mimeType: blob.type || null,
          deliveryStatus: runtimeEntry.folderBacked ? 'folder-shared-rf-ready' : 'staging-shared-rf-ready',
          deferRuntimeState
        });
      } catch (error) {
        addLog('Warn', `Shared RF auto-link failed for ${segmentId}/${channel}: ${error?.message || error}`);
      }
    }

    return {
      ...completed,
      segmentId,
      channel,
      source: 'generated',
      voiceId: engineVoiceId,
      language: channel === 'meaning' ? 'id' : 'en',
      mimeType: blob.type || null,
      metadata,
      filename,
      engine,
      engineVoiceId,
      downloadProfileVoiceId,
      playbackProfileVoiceId,
      deliveryStatus,
      packagePending,
      stagingRecord
    };
  }, [activeTextDocumentTree?.id, setTextLibrarySnapshot, addLog, rememberStructuredTextStagingRecord, forgetStructuredTextStagingRecord, queueStructuredTextRuntimeEntry, fanOutStructuredTextSharedRfLogicalSlots]);

  const markStructuredTextPackagedDelivery = useCallback(async (records = []) => {
    for (const record of records) {
      if (!record?.id) continue;
      const updated = await executeTextLibraryStructuredCommand({
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
            metadata: { ...(record.metadata || {}), deliveryStatus: 'browser-package-triggered', deliveredAt: Date.now(), stagingId: record.stagingRecord?.id || record.metadata?.stagingId || null }
          }
        },
        setTextLibrarySnapshot,
        addLog,
        deferSnapshot: true
      });
      if (updated?.audioVariant) {
        structuredTextAudioPendingVariantRef.current.set(updated.audioVariant.id, updated.audioVariant);
        structuredTextAudioPendingCountersRef.current = updated.counters || structuredTextAudioPendingCountersRef.current;
      }
    }
    flushStructuredTextPendingAudioVariants();
  }, [setTextLibrarySnapshot, addLog, flushStructuredTextPendingAudioVariants]);

  const generateStructuredTextAudioJob = useCallback(async ({ documentId = null, segmentId, channel, downloadVoiceId = null, downloadVoiceSource = null }, options = {}) => {
    const jobDocumentTree = documentId && textLibrarySnapshot
      ? resolveTextLibraryDocumentTree(textLibrarySnapshot, documentId)
      : activeTextDocumentTree;
    const jobPlaybackList = resolveStructuredTextPlaybackList(jobDocumentTree);
    const sourceItem = jobPlaybackList.find(candidate => (candidate?.segmentId || candidate?.id) === segmentId);
    if (!sourceItem) throw new Error(`Unknown structured Text segment: ${segmentId}${documentId ? ` in ${documentId}` : ''}`);
    const item = { ...sourceItem, documentId: jobDocumentTree?.id || documentId || sourceItem?.documentId || null };
    const content = channel === 'meaning' ? item.meaning : item.text;
    if (!String(content || '').trim()) return { status: 'skipped-empty', documentId: item.documentId, segmentId, channel };
    const block = (jobDocumentTree?.blocks || []).find(candidate => candidate.id === item.blockId) || null;
    const segment = (block?.segments || []).find(candidate => candidate.id === segmentId) || item;
    const resolvedDownloadVoice = downloadVoiceId
      ? { voiceId: downloadVoiceId, source: downloadVoiceSource || 'job-download' }
      : resolveTextStructuredEffectiveDownloadVoice({ documentTree: jobDocumentTree, block, segment, channel, preferences: structuredTextDownloadResolutionPreferences });
    const generationVoiceStateBase = {
      ...resolveTextStructuredGenerationVoiceState({
        channel,
        requestedDownloadVoiceId: resolvedDownloadVoice.voiceId,
        preferences: structuredTextAudioGenerationPreferences,
        edgeVoices: initialEdgeVoices
      }),
      assignmentSource: resolvedDownloadVoice.source
    };
    const render = buildTextStructuredAudioRenderFingerprint({
      channel,
      content,
      language: channel === 'meaning' ? (jobDocumentTree?.meaningLanguage || 'id') : (jobDocumentTree?.textLanguage || 'en'),
      engine: generationVoiceStateBase.engine,
      voiceId: generationVoiceStateBase.engineVoiceId,
      rate: structuredTextAudioGenerationPreferences.edgeRate,
      pitch: structuredTextAudioGenerationPreferences.edgePitch,
      rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
      codecProfile: TEXT_AUDIO_CODEC_PROFILE
    });
    const generationVoiceState = {
      ...generationVoiceStateBase,
      renderFingerprint: render.renderFingerprint,
      contentFingerprintV2: render.contentFingerprintV2,
      renderDescriptor: render.descriptor
    };

    // B1/A1 foundation: RF is the physical render identity. If the exact render
    // already exists in app-owned Text Staging, create/update only the logical
    // AudioVariant for this Segment and reuse the same staged binary. No TTS call.
    const reusableStaging = !options.forceRegenerate
      ? [...structuredTextAudioStagingRecordsRef.current.values()].find(record =>
          record?.hasBlob
          && String(record?.mapKey || '').toLowerCase() === String(render.renderFingerprint || '').toLowerCase()
        ) || null
      : null;
    if (reusableStaging) {
      const filename = reusableStaging.filename || buildTextStructuredGeneratedFilename({
        audioVariantId: null,
        segmentId,
        channel,
        engine: generationVoiceState.engine,
        engineVoiceId: generationVoiceState.engineVoiceId,
        renderFingerprint: render.renderFingerprint,
        mimeType: reusableStaging.mimeType || 'audio/mpeg'
      });
      const reused = await executeTextLibraryStructuredCommand({
        command: {
          type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
          payload: {
            segmentId,
            channel,
            source: 'generated',
            engine: generationVoiceState.engine,
            voiceId: generationVoiceState.engineVoiceId,
            language: channel === 'meaning' ? 'id' : 'en',
            filename,
            mimeType: reusableStaging.mimeType || null,
            metadata: {
              generatedBy: 'TEXT_RF_REUSE_V1',
              generatedAt: reusableStaging?.metadata?.generatedAt || null,
              engineVoiceId: generationVoiceState.engineVoiceId,
              downloadProfileVoiceId: generationVoiceState.downloadProfileVoiceId || generationVoiceState.engineVoiceId,
              playbackProfileVoiceId: generationVoiceState.playbackProfileVoiceId || null,
              assignmentSource: generationVoiceState.assignmentSource || 'global-download',
              contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel, content }),
              contentFingerprintV2: render.contentFingerprintV2,
              audioRenderFingerprintV1: render.renderFingerprint,
              audioRenderDescriptorV1: render.descriptor,
              speaker: item?.speaker || null,
              profileMatched: Boolean(generationVoiceState.matchedProfile),
              reusedPhysicalRender: true,
              deliveryStatus: 'staged-rf-reused',
              stagingId: reusableStaging.id
            }
          }
        },
        setTextLibrarySnapshot,
        addLog,
        deferSnapshot: Boolean(options.batch)
      });
      const variant = reused?.audioVariant || null;
      if (options.batch && variant) {
        structuredTextAudioPendingVariantRef.current.set(variant.id, variant);
        structuredTextAudioPendingCountersRef.current = reused.counters || structuredTextAudioPendingCountersRef.current;
      }
      if (variant) {
        queueStructuredTextRuntimeEntry(variant.id, {
          filename,
          mimeType: reusableStaging.mimeType || variant.mimeType || null,
          stagingBacked: true,
          stagingId: reusableStaging.id,
          renderFingerprint: render.renderFingerprint,
          generated: true,
          reusedPhysicalRender: true,
          variantId: variant.id
        }, { immediate: !options.batch });
      }
      try {
        const sharedRuntimeEntry = variant ? {
          filename,
          mimeType: reusableStaging.mimeType || variant.mimeType || null,
          stagingBacked: true,
          stagingId: reusableStaging.id,
          renderFingerprint: render.renderFingerprint,
          generated: true,
          reusedPhysicalRender: true,
          variantId: variant.id
        } : null;
        if (sharedRuntimeEntry) {
          await fanOutStructuredTextSharedRfLogicalSlots({
            renderFingerprint: render.renderFingerprint,
            sourceSegmentId: segmentId,
            sourceChannel: channel,
            runtimeEntry: sharedRuntimeEntry,
            filename,
            mimeType: reusableStaging.mimeType || null,
            deliveryStatus: 'staging-shared-rf-ready',
            deferRuntimeState: Boolean(options.batch)
          });
        }
      } catch (error) {
        addLog('Warn', `Shared RF reuse fan-out failed for ${segmentId}/${channel}: ${error?.message || error}`);
      }
      if (!options.batch) addLog('Text Generate', `${segmentId}/${channel} reused existing RF ${String(render.renderFingerprint).slice(-12)}; TTS skipped.`);
      return {
        status: 'reused-rf',
        documentId: item.documentId,
        segmentId,
        channel,
        ...(reused || {}),
        filename,
        engine: generationVoiceState.engine,
        engineVoiceId: generationVoiceState.engineVoiceId,
        downloadProfileVoiceId: generationVoiceState.downloadProfileVoiceId || generationVoiceState.engineVoiceId,
        deliveryStatus: 'staged-rf-reused',
        packagePending: Boolean(options.deferBrowserDelivery),
        stagingRecord: reusableStaging,
        reusedPhysicalRender: true
      };
    }


    // Legacy compatibility only: pre-P4 sessions may still expose direct Folder/ZIP
    // runtime handles. New beta.8/P4 Portable ZIP imports are committed to Staging,
    // and Folder is deprecated/locked. Reuse legacy exact RF without TTS if present.
    const currentExternalRuntimeEntries = Object.values(structuredTextAudioRuntimeUrlsRef.current || {});
    const reusableExternalRuntime = options.forceRegenerate ? null : currentExternalRuntimeEntries.find(entry =>
      entry?.folderBacked
      && String(entry?.renderFingerprint || '').toLowerCase() === String(render.renderFingerprint || '').toLowerCase()
    ) || currentExternalRuntimeEntries.find(entry =>
      entry?.zipBacked
      && String(entry?.renderFingerprint || '').toLowerCase() === String(render.renderFingerprint || '').toLowerCase()
    ) || null;
    if (reusableExternalRuntime) {
      const externalOrigin = reusableExternalRuntime.folderBacked ? 'folder' : 'zip';
      const filename = reusableExternalRuntime.filename || buildTextStructuredGeneratedFilename({
        audioVariantId: null,
        segmentId,
        channel,
        engine: generationVoiceState.engine,
        engineVoiceId: generationVoiceState.engineVoiceId,
        renderFingerprint: render.renderFingerprint,
        mimeType: reusableExternalRuntime.mimeType || 'audio/mpeg'
      });
      const reused = await executeTextLibraryStructuredCommand({
        command: {
          type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
          payload: {
            segmentId,
            channel,
            source: 'generated',
            engine: generationVoiceState.engine,
            voiceId: generationVoiceState.engineVoiceId,
            language: channel === 'meaning' ? 'id' : 'en',
            filename,
            mimeType: reusableExternalRuntime.mimeType || null,
            metadata: {
              generatedBy: 'TEXT_RF_EXTERNAL_REUSE_V1',
              generatedAt: null,
              engineVoiceId: generationVoiceState.engineVoiceId,
              downloadProfileVoiceId: generationVoiceState.downloadProfileVoiceId || generationVoiceState.engineVoiceId,
              playbackProfileVoiceId: generationVoiceState.playbackProfileVoiceId || null,
              assignmentSource: generationVoiceState.assignmentSource || 'global-download',
              contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel, content }),
              contentFingerprintV2: render.contentFingerprintV2,
              audioRenderFingerprintV1: render.renderFingerprint,
              audioRenderDescriptorV1: render.descriptor,
              speaker: item?.speaker || null,
              profileMatched: Boolean(generationVoiceState.matchedProfile),
              reusedPhysicalRender: true,
              externalRfReconnected: true,
              deliveryStatus: `${externalOrigin}-rf-reused`
            }
          }
        },
        setTextLibrarySnapshot,
        addLog,
        deferSnapshot: Boolean(options.batch)
      });
      const variant = reused?.audioVariant || null;
      if (options.batch && variant) {
        structuredTextAudioPendingVariantRef.current.set(variant.id, variant);
        structuredTextAudioPendingCountersRef.current = reused.counters || structuredTextAudioPendingCountersRef.current;
      }
      if (variant) {
        queueStructuredTextRuntimeEntry(variant.id, {
          ...reusableExternalRuntime,
          filename,
          mimeType: reusableExternalRuntime.mimeType || variant.mimeType || null,
          variantId: variant.id,
          renderFingerprint: render.renderFingerprint,
          generated: true,
          reusedPhysicalRender: true
        }, { immediate: !options.batch });
      }
      try {
        if (variant) {
          await fanOutStructuredTextSharedRfLogicalSlots({
            renderFingerprint: render.renderFingerprint,
            sourceSegmentId: segmentId,
            sourceChannel: channel,
            runtimeEntry: {
              ...reusableExternalRuntime,
              filename,
              mimeType: reusableExternalRuntime.mimeType || variant.mimeType || null,
              variantId: variant.id,
              renderFingerprint: render.renderFingerprint,
              generated: true,
              reusedPhysicalRender: true
            },
            filename,
            mimeType: reusableExternalRuntime.mimeType || null,
            deliveryStatus: `${externalOrigin}-shared-rf-ready`,
            deferRuntimeState: Boolean(options.batch)
          });
        }
      } catch (error) {
        addLog('Warn', `Shared external RF fan-out failed for ${segmentId}/${channel}: ${error?.message || error}`);
      }
      if (!options.batch) addLog('Text Generate', `${segmentId}/${channel} reused ${externalOrigin.toUpperCase()} RF ${String(render.renderFingerprint).slice(-12)}; TTS skipped.`);
      return {
        status: 'reused-rf',
        documentId: item.documentId,
        segmentId,
        channel,
        ...(reused || {}),
        filename,
        engine: generationVoiceState.engine,
        engineVoiceId: generationVoiceState.engineVoiceId,
        downloadProfileVoiceId: generationVoiceState.downloadProfileVoiceId || generationVoiceState.engineVoiceId,
        deliveryStatus: `${externalOrigin}-rf-reused`,
        packagePending: false,
        stagingRecord: null,
        reusedPhysicalRender: true,
        externalOrigin
      };
    }

    const controller = new AbortController();
    structuredTextAudioGenerationAbortRef.current = controller;
    if (!options.batch || options.renderProgress) {
      setStructuredTextAudioGenerationState(prev => ({ ...prev, current: { segmentId, channel, engine: generationVoiceState.engine, voice: generationVoiceState.engineVoiceId } }));
    }
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
        deferBrowserDelivery: Boolean(options.deferBrowserDelivery),
        deferRuntimeState: Boolean(options.batch)
      });
      if (!options.batch) addLog('Text Generate', `${segmentId}/${channel} • ${generationVoiceState.engine.toUpperCase()} • ${generationVoiceState.engineVoiceId} → ${registered.filename}.`);
      return { status: 'success', documentId: item.documentId, segmentId, channel, ...registered };
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (!options.batch) addLog('Text Generate', `${segmentId}/${channel} cancelled.`);
        return { status: 'cancelled', documentId: item.documentId, segmentId, channel };
      }
      if (!options.batch) addLog('Error', `Text Generate ${segmentId}/${channel}: ${error?.message || error}`);
      return { status: 'error', documentId: item.documentId, segmentId, channel, error: error?.message || String(error) };
    } finally {
      if (structuredTextAudioGenerationAbortRef.current === controller) structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [textLibrarySnapshot, activeTextDocumentTree, structuredTextAudioGenerationPreferences, structuredTextDownloadResolutionPreferences, registerStructuredTextGeneratedBlob, queueStructuredTextRuntimeEntry, fanOutStructuredTextSharedRfLogicalSlots, setTextLibrarySnapshot, addLog]);

  const generateStructuredTextFullAudioJob = useCallback(async (job, options = {}) => {
    const documentId = job?.documentId || null;
    const blockId = job?.blockId || null;
    const channel = job?.channel === 'meaning' ? 'meaning' : 'text';
    const jobDocumentTree = documentId && textLibrarySnapshot
      ? resolveTextLibraryDocumentTree(textLibrarySnapshot, documentId)
      : activeTextDocumentTree;
    const block = (jobDocumentTree?.blocks || []).find(candidate => candidate.id === blockId) || null;
    if (!block) throw new Error(`Unknown structured Text block: ${blockId || '—'}${documentId ? ` in ${documentId}` : ''}`);

    const content = String(job?.content || '').trim();
    if (!content) return { status: 'skipped-empty', representation: 'full', documentId: jobDocumentTree?.id || documentId, blockId, channel };
    const generationVoiceStateBase = {
      ...resolveTextStructuredGenerationVoiceState({
        channel,
        requestedDownloadVoiceId: job?.voiceId || job?.downloadVoiceId,
        preferences: structuredTextAudioGenerationPreferences,
        edgeVoices: initialEdgeVoices
      }),
      assignmentSource: job?.downloadVoiceSource || 'bulk-selection'
    };
    const artifact = buildTextStructuredFullArtifactRecord({
      block,
      channel,
      language: job?.language || (channel === 'meaning' ? (jobDocumentTree?.meaningLanguage || 'id') : (jobDocumentTree?.textLanguage || 'en')),
      engine: generationVoiceStateBase.engine,
      voiceId: generationVoiceStateBase.engineVoiceId,
      rate: structuredTextAudioGenerationPreferences.edgeRate,
      pitch: structuredTextAudioGenerationPreferences.edgePitch,
      source: 'generated',
      metadata: { assignmentSource: generationVoiceStateBase.assignmentSource }
    });
    const fingerprint = String(artifact.fullArtifactFingerprint || '').toLowerCase();
    if (job?.fullArtifactFingerprint && fingerprint !== String(job.fullArtifactFingerprint).toLowerCase()) {
      throw new Error(`Full Artifact identity drift for ${blockId}/${channel}/${generationVoiceStateBase.engineVoiceId}.`);
    }

    const commitArtifact = async ({ filename, mimeType, stagingRecord, reusedPhysicalRender = false }) => {
      const now = Date.now();
      const completedArtifact = buildTextStructuredFullArtifactRecord({
        block,
        channel,
        language: artifact.descriptor.language,
        engine: artifact.descriptor.engine,
        voiceId: artifact.descriptor.voiceId,
        rate: artifact.descriptor.rate,
        pitch: artifact.descriptor.pitch,
        rendererVersion: artifact.descriptor.rendererVersion,
        codecProfile: artifact.descriptor.codecProfile,
        derivationVersion: artifact.descriptor.derivationVersion,
        filename,
        mimeType,
        source: 'generated',
        createdAt: artifact.createdAt || now,
        updatedAt: now,
        metadata: {
          generatedBy: reusedPhysicalRender ? 'TEXT_FULL_RF_REUSE_V1' : 'TEXT_FULL_GENERATION_V1',
          generatedAt: reusedPhysicalRender ? (stagingRecord?.metadata?.generatedAt || null) : now,
          assignmentSource: generationVoiceStateBase.assignmentSource,
          deliveryStatus: reusedPhysicalRender ? 'staged-full-reused' : 'staged-ready',
          stagingId: stagingRecord?.id || null,
          reusedPhysicalRender
        }
      });
      const persisted = await executeTextFullAudioArtifactBulkUpsert([{ blockId, artifact: completedArtifact }]);
      if (persisted.blocks.length) {
        setTextLibrarySnapshot(previous => {
          if (!previous) return previous;
          const updates = new Map(persisted.blocks.map(record => [record.id, record]));
          return { ...previous, blocks: (previous.blocks || []).map(record => updates.get(record.id) || record) };
        });
      }
      setStructuredTextFullAudioRuntimeUrls(prev => {
        const current = prev?.[fingerprint] || {};
        const consumers = new Set([...(current.consumerBlockIds || []), blockId].filter(Boolean));
        return {
          ...prev,
          [fingerprint]: {
            ...current,
            stagingBacked: true,
            stagingId: stagingRecord?.id || current.stagingId || null,
            fullArtifactFingerprint: fingerprint,
            filename,
            mimeType,
            representation: 'full',
            generated: true,
            reusedPhysicalRender,
            consumerBlockIds: [...consumers]
          }
        };
      });
      return completedArtifact;
    };

    const reusableStaging = !options.forceRegenerate
      ? [...structuredTextAudioStagingRecordsRef.current.values()].find(record =>
          record?.hasBlob && String(record?.mapKey || '').toLowerCase() === fingerprint
        ) || null
      : null;
    if (reusableStaging) {
      const filename = reusableStaging.filename || buildCanonicalTextFullArtifactFilename({
        fullArtifactFingerprint: fingerprint,
        engine: generationVoiceStateBase.engine,
        voiceId: generationVoiceStateBase.engineVoiceId,
        extension: 'mp3'
      });
      await commitArtifact({ filename, mimeType: reusableStaging.mimeType || 'audio/mpeg', stagingRecord: reusableStaging, reusedPhysicalRender: true });
      return {
        status: 'reused-rf',
        representation: 'full',
        documentId: jobDocumentTree?.id || documentId,
        blockId,
        channel,
        voiceId: generationVoiceStateBase.engineVoiceId,
        fullArtifactFingerprint: fingerprint,
        stagingRecord: reusableStaging,
        reusedPhysicalRender: true,
        packagePending: false
      };
    }

    const controller = new AbortController();
    structuredTextAudioGenerationAbortRef.current = controller;
    if (!options.batch || options.renderProgress) {
      setStructuredTextAudioGenerationState(prev => ({ ...prev, current: { blockId, channel, representation: 'full', voice: generationVoiceStateBase.engineVoiceId } }));
    }
    try {
      const generated = await executeTextStructuredAudioGenerationRequest({
        engine: generationVoiceStateBase.engine,
        text: content,
        engineVoiceId: generationVoiceStateBase.engineVoiceId,
        edgeRate: structuredTextAudioGenerationPreferences.edgeRate,
        edgePitch: structuredTextAudioGenerationPreferences.edgePitch,
        signal: controller.signal,
        onRetry: options.batch
          ? ({ nextAttempt, maxAttempts, error }) => addLog('Text Generate', `Retry ${nextAttempt}/${maxAttempts}: FULL ${blockId}/${channel} • ${error.message}`)
          : null
      });
      const filename = buildCanonicalTextFullArtifactFilename({
        fullArtifactFingerprint: fingerprint,
        engine: generationVoiceStateBase.engine,
        voiceId: generationVoiceStateBase.engineVoiceId,
        extension: generated?.blob?.type?.includes('wav') ? 'wav' : 'mp3'
      });
      const stagingRecord = await putTextFullAudioStagingBlob({
        fullArtifactFingerprint: fingerprint,
        documentId: jobDocumentTree?.id || documentId,
        blockId,
        channel,
        engine: generationVoiceStateBase.engine,
        voiceId: generationVoiceStateBase.engineVoiceId,
        filename,
        mimeType: generated.blob.type || 'audio/mpeg',
        blob: generated.blob,
        descriptor: artifact.descriptor,
        metadata: { generatedAt: Date.now(), deliveryStatus: 'staged-ready', consumerBlockIds: [blockId] }
      });
      rememberStructuredTextStagingRecord(stagingRecord, { deferUi: Boolean(options.batch) });
      await commitArtifact({ filename, mimeType: generated.blob.type || 'audio/mpeg', stagingRecord, reusedPhysicalRender: false });
      return {
        status: 'success',
        representation: 'full',
        documentId: jobDocumentTree?.id || documentId,
        blockId,
        channel,
        voiceId: generationVoiceStateBase.engineVoiceId,
        fullArtifactFingerprint: fingerprint,
        stagingRecord,
        reusedPhysicalRender: false,
        packagePending: false
      };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', representation: 'full', documentId, blockId, channel };
      return { status: 'error', representation: 'full', documentId, blockId, channel, voiceId: generationVoiceStateBase.engineVoiceId, error: error?.message || String(error) };
    } finally {
      if (structuredTextAudioGenerationAbortRef.current === controller) structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [textLibrarySnapshot, activeTextDocumentTree, structuredTextAudioGenerationPreferences, setTextLibrarySnapshot, rememberStructuredTextStagingRecord, addLog]);

  const handleStructuredTextGenerateAudio = useCallback(async (segmentId, channel) => {
    if (structuredTextAudioGenerationState.running) return null;
    forceStopAll();
    setStructuredTextAudioGenerationState({ running: true, completed: 0, total: 1, current: { segmentId, channel }, failedJobs: [], lastStatus: null });
    const result = await generateStructuredTextAudioJob({ segmentId, channel });
    setStructuredTextAudioGenerationState({
      running: false,
      completed: ['success', 'reused-rf'].includes(result?.status) ? 1 : 0,
      total: 1,
      current: null,
      failedJobs: result?.status === 'error' ? [{ segmentId, channel }] : [],
      lastStatus: result?.status || 'unknown'
    });
    return result;
  }, [structuredTextAudioGenerationState.running, forceStopAll, generateStructuredTextAudioJob]);

  const runStructuredTextAudioGenerationBatch = useCallback(async (requirementsCandidate = null, options = {}) => {
    if (structuredTextAudioGenerationState.running || !(structuredTextBatchSelection?.documentCount > 0)) return null;
    forceStopAll();
    const suppliedRequirements = Array.isArray(requirementsCandidate);
    const allRequirements = suppliedRequirements
      ? requirementsCandidate
      : (structuredTextBulkGenerationPlan?.requirements || []);
    const suppliedP5Requirements = suppliedRequirements && allRequirements.some(item =>
      Boolean(item?.physicalKey || item?.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL || item?.status)
    );
    const selectionMode = suppliedP5Requirements
      ? 'retry'
      : (options.selectionMode || (options.missingOnly === false ? 'all' : 'missing'));
    const requirements = suppliedP5Requirements
      ? allRequirements
      : suppliedRequirements
        ? (selectionMode === 'all'
            ? allRequirements
            : allRequirements.filter(job => shouldDownloadTextStructuredCoverageSlot(job?.coverage || { status: job?.coverageStatus || 'missing' })))
        : selectTextStructuredBulkGenerationRequirements(structuredTextBulkGenerationPlan, { mode: selectionMode });

    const readRequirementStatus = item => suppliedRequirements && !suppliedP5Requirements
      ? (item?.coverage?.status || item?.coverageStatus || TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING)
      : item?.status;
    const countStatus = status => allRequirements.filter(item => readRequirementStatus(item) === status).length;
    const readyBefore = countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY);
    const reusableBefore = countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE);
    const staleBefore = countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE);
    const missingBefore = suppliedRequirements && !suppliedP5Requirements
      ? Math.max(0, allRequirements.length - readyBefore - staleBefore)
      : countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING);
    const excludedCount = Math.max(0, allRequirements.length - requirements.length);
    const skippedReady = selectionMode === 'all' || selectionMode === 'retry' ? 0 : readyBefore;
    const skippedStale = selectionMode === 'missing' ? staleBefore : 0;
    const physicalWork = summarizeTextStructuredBulkPhysicalWork(allRequirements);
    const selectedPhysicalWork = summarizeTextStructuredBulkPhysicalWork(requirements);
    const sessionId = `TEXT_BULK_P5_${Date.now()}`;

    if (!requirements.length) {
      const status = !allRequirements.length
        ? 'empty-scope'
        : (selectionMode === 'missing' && staleBefore > 0 ? 'stale-only' : 'up-to-date');
      const snapshot = {
        running: false, completed: excludedCount, total: allRequirements.length, current: null, failedJobs: [], lastStatus: status,
        processed: excludedCount, generated: 0, generatedPhysical: 0, reusedPhysical: 0, skippedReady, skippedStale, failed: 0, remaining: 0,
        readyEstimate: readyBefore, missingEstimate: missingBefore + reusableBefore, staleEstimate: staleBefore, sessionId,
        logicalRequirements: allRequirements.length, uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements,
        selectedLogicalRequirements: 0, selectedUniquePhysicalRequirements: 0, selectionMode
      };
      setStructuredTextAudioGenerationState(snapshot);
      resetTextStructuredBatchTelemetry({
        sessionId, status, total: allRequirements.length, processed: excludedCount, generated: 0, generatedPhysical: 0, reusedPhysical: 0,
        skippedReady, skippedStale, failed: 0, remaining: 0, readyEstimate: readyBefore,
        missingEstimate: missingBefore + reusableBefore, staleEstimate: staleBefore, logicalRequirements: allRequirements.length,
        uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements, selectedLogicalRequirements: 0,
        selectedUniquePhysicalRequirements: 0, selectionMode, reconciled: true
      });
      addLog('Text Generate', status === 'stale-only'
        ? 'Bulk Audio: no Missing requirements; Stale requirements remain. Use Generate Missing + Stale if you want to refresh them.'
        : (status === 'up-to-date'
          ? 'Bulk Audio: selected Split/Full + voice requirements are already Ready.'
          : 'Bulk Audio: no eligible Paragraph requirements in the selected scope.'));
      if (status !== 'empty-scope' && structuredTextAudioGenerationPreferences.bulkAutoExport) {
        setStructuredTextPendingAutoExport({ sessionId, format: structuredTextAudioGenerationPreferences.bulkExportFormat || TEXT_STRUCTURED_BULK_EXPORT_FORMATS.PORTABLE_ZIP });
      }
      return { status, completed: excludedCount, total: allRequirements.length, failedJobs: [] };
    }

    structuredTextAudioBatchStopRef.current = false;
    const failedJobs = [];
    const processedPhysicalKeys = new Set();
    const generatedPhysicalKeys = new Set();
    const reusedPhysicalKeys = new Set();
    const successfulByStatus = {
      [TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY]: 0,
      [TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE]: 0,
      [TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE]: 0,
      [TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING]: 0
    };
    let attempts = 0;
    let successfulLogical = 0;
    const initialProcessed = excludedCount;
    const initialReadyEstimate = readyBefore;
    setStructuredTextAudioGenerationState({
      running: true, completed: initialProcessed, total: allRequirements.length, current: null, failedJobs: [], lastStatus: 'running',
      processed: initialProcessed, generated: 0, generatedPhysical: 0, reusedPhysical: 0, skippedReady, skippedStale, failed: 0,
      remaining: requirements.length, readyEstimate: initialReadyEstimate, missingEstimate: missingBefore + reusableBefore, staleEstimate: staleBefore, sessionId,
      logicalRequirements: allRequirements.length, uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements,
      selectedLogicalRequirements: requirements.length, selectedUniquePhysicalRequirements: selectedPhysicalWork.uniquePhysicalRequirements, selectionMode
    });
    resetTextStructuredBatchTelemetry({
      sessionId, status: 'running', total: allRequirements.length, processed: initialProcessed, generated: 0, generatedPhysical: 0, reusedPhysical: 0,
      skippedReady, skippedStale, failed: 0, remaining: requirements.length, readyEstimate: initialReadyEstimate,
      missingEstimate: missingBefore + reusableBefore, staleEstimate: staleBefore, logicalRequirements: allRequirements.length,
      uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements, selectedLogicalRequirements: requirements.length,
      selectedUniquePhysicalRequirements: selectedPhysicalWork.uniquePhysicalRequirements, selectionMode, reconciled: false
    });

    const estimateReady = () => selectionMode === 'all'
      ? Math.min(allRequirements.length, Math.max(readyBefore, successfulLogical))
      : Math.min(allRequirements.length, readyBefore + successfulLogical);
    const estimateMissing = () => Math.max(0,
      (missingBefore + reusableBefore)
      - successfulByStatus[TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING]
      - successfulByStatus[TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE]
    );
    const estimateStale = () => Math.max(0,
      staleBefore - successfulByStatus[TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE]
    );

    try {
      for (let requirementIndex = 0; requirementIndex < requirements.length; requirementIndex += 1) {
        if (structuredTextAudioBatchStopRef.current) break;
        const requirement = requirements[requirementIndex];
        const physicalKey = String(requirement?.physicalKey || requirement?.coverage?.renderFingerprint || requirement?.renderFingerprint || '');
        const firstPhysicalVisit = physicalKey ? !processedPhysicalKeys.has(physicalKey) : true;
        const forceRegenerate = selectionMode === 'all' && firstPhysicalVisit;
        const generationOptions = {
          batch: true,
          deferBrowserDelivery: true,
          renderProgress: requirementIndex % TEXT_BATCH_STATUS_RENDER_INTERVAL === 0,
          forceRegenerate
        };
        const result = requirement?.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL
          ? await generateStructuredTextFullAudioJob(requirement, generationOptions)
          : await generateStructuredTextAudioJob(requirement, generationOptions);
        attempts += 1;
        if (physicalKey) processedPhysicalKeys.add(physicalKey);
        if (result?.status === 'success') {
          if (physicalKey) generatedPhysicalKeys.add(physicalKey);
          successfulLogical += 1;
          if (requirement?.status && successfulByStatus[requirement.status] !== undefined) successfulByStatus[requirement.status] += 1;
        } else if (result?.status === 'reused-rf') {
          if (physicalKey && !generatedPhysicalKeys.has(physicalKey)) reusedPhysicalKeys.add(physicalKey);
          successfulLogical += 1;
          if (requirement?.status && successfulByStatus[requirement.status] !== undefined) successfulByStatus[requirement.status] += 1;
        } else if (result?.status === 'skipped-empty') {
          successfulLogical += 1;
          if (requirement?.status && successfulByStatus[requirement.status] !== undefined) successfulByStatus[requirement.status] += 1;
        } else if (result?.status === 'error') {
          failedJobs.push({ ...requirement, error: result?.error || 'Generation failed.' });
        }
        if (result?.status === 'cancelled' && structuredTextAudioBatchStopRef.current) break;

        if ((requirementIndex + 1) % TEXT_BATCH_RUNTIME_FLUSH_INTERVAL === 0) {
          flushStructuredTextPendingRuntimeEntries();
          flushStructuredTextPendingAudioVariants();
        }
        const processed = Math.min(allRequirements.length, excludedCount + attempts);
        const readyEstimate = estimateReady();
        const telemetryPatch = {
          status: structuredTextAudioBatchStopRef.current ? 'cancelling' : 'running',
          total: allRequirements.length,
          logicalRequirements: allRequirements.length,
          uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements,
          selectedLogicalRequirements: requirements.length,
          selectedUniquePhysicalRequirements: selectedPhysicalWork.uniquePhysicalRequirements,
          selectionMode,
          processed,
          generated: generatedPhysicalKeys.size,
          generatedPhysical: generatedPhysicalKeys.size,
          reusedPhysical: reusedPhysicalKeys.size,
          skippedReady,
          skippedStale,
          failed: failedJobs.length,
          remaining: Math.max(0, requirements.length - attempts),
          readyEstimate,
          missingEstimate: estimateMissing(),
          staleEstimate: estimateStale(),
          currentSegmentId: requirement.segmentId || null,
          currentBlockId: requirement.blockId || null,
          currentChannel: requirement.channel,
          currentVoiceId: requirement.voiceId || requirement.downloadVoiceId || null,
          currentRepresentation: requirement.representation || 'split',
          reconciled: false
        };
        if ((requirementIndex + 1) % TEXT_BATCH_STATUS_RENDER_INTERVAL === 0 || requirementIndex + 1 === requirements.length || structuredTextAudioBatchStopRef.current) {
          flushStructuredTextStagingSummary();
          setStructuredTextAudioGenerationState(prev => ({
            ...prev,
            completed: processed, processed, generated: generatedPhysicalKeys.size, generatedPhysical: generatedPhysicalKeys.size,
            reusedPhysical: reusedPhysicalKeys.size, skippedReady, skippedStale, failed: failedJobs.length, remaining: telemetryPatch.remaining,
            readyEstimate, missingEstimate: telemetryPatch.missingEstimate, staleEstimate: telemetryPatch.staleEstimate, failedJobs: [...failedJobs]
          }));
          publishTextStructuredBatchTelemetry(telemetryPatch);
        }
        if (!structuredTextAudioBatchStopRef.current) await new Promise(resolve => setTimeout(resolve, 250));
      }

      flushStructuredTextPendingRuntimeEntries();
      flushStructuredTextPendingAudioVariants();
      flushStructuredTextStagingSummary();
      const stopped = structuredTextAudioBatchStopRef.current;
      const status = stopped ? 'cancelled' : failedJobs.length ? 'completed-with-errors' : 'completed';
      const processed = Math.min(allRequirements.length, excludedCount + attempts);
      const readyEstimate = estimateReady();
      const finalState = {
        running: false, completed: processed, total: allRequirements.length, current: null, failedJobs, lastStatus: status,
        processed, generated: generatedPhysicalKeys.size, generatedPhysical: generatedPhysicalKeys.size, reusedPhysical: reusedPhysicalKeys.size,
        skippedReady, skippedStale, failed: failedJobs.length, remaining: Math.max(0, requirements.length - attempts),
        readyEstimate, missingEstimate: estimateMissing(), staleEstimate: estimateStale(), sessionId,
        logicalRequirements: allRequirements.length, uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements,
        selectedLogicalRequirements: requirements.length, selectedUniquePhysicalRequirements: selectedPhysicalWork.uniquePhysicalRequirements, selectionMode
      };
      setStructuredTextAudioGenerationState(finalState);
      publishTextStructuredBatchTelemetry({
        status, total: allRequirements.length, logicalRequirements: allRequirements.length, uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements,
        selectedLogicalRequirements: requirements.length, selectedUniquePhysicalRequirements: selectedPhysicalWork.uniquePhysicalRequirements, selectionMode,
        processed, generated: generatedPhysicalKeys.size, generatedPhysical: generatedPhysicalKeys.size, reusedPhysical: reusedPhysicalKeys.size,
        skippedReady, skippedStale, failed: failedJobs.length, remaining: finalState.remaining, readyEstimate,
        missingEstimate: finalState.missingEstimate, staleEstimate: finalState.staleEstimate,
        currentSegmentId: null, currentBlockId: null, currentChannel: null, currentVoiceId: null, currentRepresentation: null, reconciled: true
      });
      addLog('Text Generate', `Bulk ${status}: ${requirements.length} selected / ${allRequirements.length} logical • ${selectedPhysicalWork.uniquePhysicalRequirements} selected unique physical • generated ${generatedPhysicalKeys.size} • reused ${reusedPhysicalKeys.size} • Ready skipped ${skippedReady} • Stale skipped ${skippedStale} • failed ${failedJobs.length}.${structuredTextAudioGenerationPreferences.bulkAutoExport ? ' Auto Export preflight follows after durable Staging reconciliation.' : ' Auto Export OFF; output remains in Staging.'}`);
      if (!stopped && failedJobs.length === 0 && structuredTextAudioGenerationPreferences.bulkAutoExport) {
        setStructuredTextPendingAutoExport({ sessionId, format: structuredTextAudioGenerationPreferences.bulkExportFormat || TEXT_STRUCTURED_BULK_EXPORT_FORMATS.PORTABLE_ZIP });
      }
      return {
        status,
        completed: processed,
        total: allRequirements.length,
        logicalRequirements: allRequirements.length,
        uniquePhysicalRequirements: physicalWork.uniquePhysicalRequirements,
        selectedLogicalRequirements: requirements.length,
        selectedUniquePhysicalRequirements: selectedPhysicalWork.uniquePhysicalRequirements,
        generatedPhysical: generatedPhysicalKeys.size,
        reusedPhysical: reusedPhysicalKeys.size,
        skippedReady,
        skippedStale,
        failedJobs
      };
    } finally {
      flushStructuredTextPendingRuntimeEntries();
      flushStructuredTextPendingAudioVariants();
      flushStructuredTextStagingSummary();
      structuredTextAudioBatchStopRef.current = false;
      structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [structuredTextAudioGenerationState.running, structuredTextBatchSelection, structuredTextBulkGenerationPlan, structuredTextAudioGenerationPreferences.bulkAutoExport, forceStopAll, generateStructuredTextAudioJob, generateStructuredTextFullAudioJob, flushStructuredTextPendingRuntimeEntries, flushStructuredTextPendingAudioVariants, flushStructuredTextStagingSummary, addLog]);

  const handleStructuredTextCancelGeneration = useCallback(() => {
    structuredTextAudioBatchStopRef.current = true;
    try { structuredTextAudioGenerationAbortRef.current?.abort(); } catch {}
    setStructuredTextAudioGenerationState(prev => ({ ...prev, lastStatus: 'cancelling' }));
    publishTextStructuredBatchTelemetry({ status: 'cancelling', reconciled: false });
  }, []);

  const handleStructuredTextRetryFailedGeneration = useCallback(() => {
    const jobs = structuredTextAudioGenerationState.failedJobs || [];
    if (!jobs.length) return null;
    return runStructuredTextAudioGenerationBatch(jobs);
  }, [structuredTextAudioGenerationState.failedJobs, runStructuredTextAudioGenerationBatch]);

  const resolveStructuredTextBlockChannelPlaybackPlan = ({ block, channel, allowFullArtifact = true } = {}) => {
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const firstSegment = (block?.segments || []).find(segment => String(normalizedChannel === 'meaning' ? segment?.meaning : segment?.text || '').trim()) || block?.segments?.[0] || null;
    const generatedVoice = resolveTextStructuredEffectiveDownloadVoice({
      documentTree: activeTextDocumentTree,
      block,
      segment: firstSegment,
      channel: normalizedChannel,
      preferences: structuredTextDownloadResolutionPreferences
    });
    return buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree: activeTextDocumentTree,
      block,
      channel: normalizedChannel,
      representationMode: textStructuredPreferences.playbackRepresentationMode,
      audioVariants: textLibrarySnapshot?.audioVariants || [],
      runtimeAudioUrls: structuredTextAudioRuntimeUrls,
      runtimeFullAudio: structuredTextFullAudioRuntimeUrls,
      fallbackVoiceId: generatedVoice.voiceId,
      fallbackEngine: 'edge',
      fallbackRate: structuredTextAudioGenerationPreferences.edgeRate,
      fallbackPitch: structuredTextAudioGenerationPreferences.edgePitch,
      language: normalizedChannel === 'meaning' ? activeTextDocumentTree?.meaningLanguage : activeTextDocumentTree?.textLanguage,
      globalTtsOnly: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY,
      allowFullArtifact
    });
  };

  const playStructuredTextFullStep = async (step, block, item) => {
    const normalizedChannel = step?.channel === 'meaning' ? 'meaning' : 'text';
    const playbackSessionId = playbackSessionRef.current;
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    const firstSegmentItem = item || {
      blockId: block?.id || null,
      segmentId: block?.segments?.[0]?.id || null,
      id: block?.segments?.[0]?.id || null,
      blockType: block?.blockType,
      speaker: block?.segments?.[0]?.speaker || null
    };

    if (step?.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL) {
      const runtimeFull = step?.runtimeFull || null;
      const runtime = runtimeFull?.runtime || null;
      let runtimeUrl = runtime?.url || null;
      if (!runtimeUrl && runtime?.stagingBacked && runtime?.stagingId) {
        try { runtimeUrl = await getTextAudioStagingObjectUrl(runtime.stagingId); }
        catch (error) { addLog('Warn', `Full Text staged audio could not be read: ${error?.message || error}. Falling back to Browser TTS.`); }
      }
      if (!runtimeUrl && runtime?.zipBacked) {
        try { runtimeUrl = await getTextStructuredAudioZipRuntimeObjectUrl(runtime); }
        catch (error) { addLog('Warn', `Full Text ZIP audio could not be read: ${error?.message || error}. Falling back to Browser TTS.`); }
      }
      // Folder remains compatibility-only until P4 locks it in the normal UI.
      if (!runtimeUrl && runtime?.folderBacked) {
        try { runtimeUrl = await getTextStructuredAudioFolderRuntimeObjectUrl(runtime); }
        catch (error) { addLog('Warn', `Full Text legacy Folder audio could not be read: ${error?.message || error}. Falling back to Browser TTS.`); }
      }
      if (!playbackStillCurrent()) return;
      if (runtimeUrl) {
        const origin = runtime?.zipBacked ? 'ZIP' : runtime?.stagingBacked ? 'Staging' : runtime?.folderBacked ? 'Folder (legacy)' : 'Local';
        setStructuredTextPlaybackSourceStatus({
          source: 'local',
          origin,
          representation: 'full',
          channel: normalizedChannel,
          blockId: block?.id || null,
          segmentId: null,
          voiceId: runtimeFull?.profile?.voiceId || runtimeFull?.artifact?.descriptor?.voiceId || null,
          filename: runtime?.filename || runtimeFull?.artifact?.filename || null,
          updatedAt: Date.now()
        });
        const result = await executeStructuredTextRuntimeAudioPlaybackService({
          url: runtimeUrl,
          currentAudioObjRef,
          playbackResolveRef,
          stopSignalRef,
          playbackRate: resolveStructuredTextItemPlaybackRate(firstSegmentItem, normalizedChannel),
          addLog,
          label: `Full Text ${block?.id || 'card'}/${normalizedChannel}`
        });
        if (result.status === 'played' || result.status === 'stopped' || stopSignalRef.current) return;
      }
    }

    if (!playbackStillCurrent()) return;
    const voiceState = resolveStructuredTextChannelVoiceState(firstSegmentItem, normalizedChannel);
    const targetVoice = voiceState.ttsVoice;
    const targetVoiceId = voiceState.requestedVoiceId;
    if (!targetVoice) {
      setStructuredTextPlaybackSourceStatus({
        source: 'unavailable',
        origin: 'Browser TTS',
        representation: 'full',
        channel: normalizedChannel,
        blockId: block?.id || null,
        segmentId: null,
        voiceId: targetVoiceId || null,
        updatedAt: Date.now()
      });
      addLog('Warn', `Full Text ${normalizedChannel === 'meaning' ? 'Meaning/ID' : 'Text/EN'} Browser TTS voice is not ready; full channel skipped.`);
      return;
    }
    setStructuredTextPlaybackSourceStatus({
      source: 'tts',
      origin: 'Browser TTS',
      representation: 'full',
      channel: normalizedChannel,
      blockId: block?.id || null,
      segmentId: null,
      voiceId: targetVoice?.name || targetVoiceId || null,
      updatedAt: Date.now()
    });
    return executeBrowserTtsPlaybackService({
      textToRead: step?.content || '',
      overrideVoice: targetVoice,
      selectedVoiceRef: { current: targetVoice },
      stopSignalRef,
      pauseStateRef,
      synth,
      currentUtteranceRef,
      ttsReplayRef,
      playbackResolveRef,
      rateRef: null,
      rate: resolveStructuredTextItemPlaybackRate(firstSegmentItem, normalizedChannel),
      pitch: 1
    });
  };

  const playStructuredTextChannel = async (textToRead, item, channel) => {
    const voiceState = resolveStructuredTextChannelVoiceState(item, channel);
    const targetVoice = voiceState.ttsVoice;
    const targetVoiceId = voiceState.requestedVoiceId;
    const playbackSessionId = playbackSessionRef.current;
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    const block = (activeTextDocumentTree?.blocks || []).find(candidate => candidate.id === item?.blockId) || null;
    const segment = (block?.segments || []).find(candidate => candidate.id === (item?.segmentId || item?.id)) || item;
    const effectiveTtsOnly = resolveTextStructuredEffectiveTtsOnly({
      documentTree: activeTextDocumentTree,
      block,
      globalTtsOnly: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY
    });

    if (!effectiveTtsOnly.enabled) {
      const generatedVoice = resolveTextStructuredEffectiveDownloadVoice({
        documentTree: activeTextDocumentTree,
        block,
        segment,
        channel,
        preferences: structuredTextDownloadResolutionPreferences
      });
      const playbackOrder = resolveTextStructuredEffectivePlaybackOrder({
        documentTree: activeTextDocumentTree,
        block,
        channel,
        fallbackProfiles: [{
          engine: 'edge',
          voiceId: generatedVoice.voiceId,
          rate: structuredTextAudioGenerationPreferences.edgeRate,
          pitch: structuredTextAudioGenerationPreferences.edgePitch
        }]
      });
      const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
      const syncLocalToFirstSpeaker = activeTextDocumentTree?.documentType === 'conversation'
        && structuredTextAudioSyncProfile.voice?.[normalizedChannel] === true
        && structuredTextConversationSpeakers.length > 0;
      const customLocalVoiceId = textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL
        ? (() => {
            if (!syncLocalToFirstSpeaker) return resolveTextStructuredCustomLocalAudioVoice({ documentTree: activeTextDocumentTree, block, segment, channel: normalizedChannel });
            const firstSpeaker = structuredTextConversationSpeakers[0];
            const localProfile = getTextStructuredLocalAudioProfile(activeTextDocumentTree);
            return localProfile?.speakerIds?.[normalizedChannel]?.[firstSpeaker.id]
              || localProfile?.speakers?.[normalizedChannel]?.[String(firstSpeaker.label || '').trim().toLowerCase()]
              || localProfile?.channels?.[normalizedChannel]
              || null;
          })()
        : null;
      const localAllowed = textStructuredPreferences.audioSourceMode !== TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL || Boolean(customLocalVoiceId);
      const runtimeAudio = localAllowed ? resolveTextStructuredRuntimeAudio({
        audioVariants: textLibrarySnapshot?.audioVariants || [],
        runtimeAudioUrls: structuredTextAudioRuntimeUrls,
        segmentId: item?.segmentId || item?.id,
        channel,
        requestedVoiceId: customLocalVoiceId || targetVoiceId,
        preferredGeneratedVoiceId: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL ? customLocalVoiceId : generatedVoice.voiceId,
        preferredGeneratedEngine: 'edge',
        preferredGeneratedProfiles: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL ? [] : playbackOrder.profiles,
        strictProfileOrder: textStructuredPreferences.audioSourceMode !== TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL && playbackOrder.explicit,
        allowAnyGenerated: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST && !playbackOrder.explicit,
        content: textToRead
      }) : null;
      if (runtimeAudio) {
        let runtimeUrl = runtimeAudio.url;
        if (!runtimeUrl && runtimeAudio.runtime?.stagingBacked) {
          try {
            runtimeUrl = await getTextAudioStagingObjectUrl(runtimeAudio.runtime.stagingId);
          } catch (error) {
            addLog('Warn', `Text Staging audio ${runtimeAudio.filename || runtimeAudio.variant.id} could not be read: ${error?.message || error}. Falling back to Browser TTS.`);
          }
        }
        if (!runtimeUrl && runtimeAudio.runtime?.folderBacked) {
          try {
            runtimeUrl = await getTextStructuredAudioFolderRuntimeObjectUrl(runtimeAudio.runtime);
          } catch (error) {
            addLog('Warn', `Text Folder audio ${runtimeAudio.filename || runtimeAudio.variant.id} could not be read: ${error?.message || error}. Falling back to Browser TTS.`);
          }
        }
        if (!runtimeUrl && runtimeAudio.runtime?.zipBacked) {
          try {
            runtimeUrl = await getTextStructuredAudioZipRuntimeObjectUrl(runtimeAudio.runtime);
          } catch (error) {
            addLog('Warn', `Text ZIP audio ${runtimeAudio.filename || runtimeAudio.variant.id} could not be read: ${error?.message || error}. Falling back to Browser TTS.`);
          }
        }
        if (!runtimeUrl && runtimeAudio.runtime?.stagingFallbackId) {
          try {
            runtimeUrl = await getTextAudioStagingObjectUrl(runtimeAudio.runtime.stagingFallbackId);
          } catch { /* try the next durable source */ }
        }
        if (!runtimeUrl && runtimeAudio.runtime?.zipFallback?.zipBacked) {
          try {
            runtimeUrl = await getTextStructuredAudioZipRuntimeObjectUrl(runtimeAudio.runtime.zipFallback);
          } catch { /* Browser TTS remains the final fallback */ }
        }
        // Session safety: Folder/ZIP/Staging resolution is asynchronous. A newer
        // playback session may have started while the binary was being resolved.
        // Never allow the older session to start audio afterwards.
        if (!playbackStillCurrent()) return;
        if (runtimeUrl) {
          const localOrigin = runtimeAudio.runtime?.folderBacked
            ? 'Folder'
            : runtimeAudio.runtime?.zipBacked
              ? 'ZIP'
              : runtimeAudio.runtime?.stagingBacked
                ? 'Staging'
                : runtimeAudio.variant?.source === 'generated'
                  ? 'Generated'
                  : 'Local';
          setStructuredTextPlaybackSourceStatus({
            source: 'local',
            origin: localOrigin,
            channel: normalizedChannel,
            segmentId: item?.segmentId || item?.id || null,
            voiceId: runtimeAudio.variant?.voiceId || customLocalVoiceId || targetVoiceId || null,
            filename: runtimeAudio.filename || null,
            syncedToFirstSpeaker: Boolean(voiceState.syncedToFirstSpeaker),
            updatedAt: Date.now()
          });
          const result = await executeStructuredTextRuntimeAudioPlaybackService({
            url: runtimeUrl,
            currentAudioObjRef,
            playbackResolveRef,
            stopSignalRef,
            playbackRate: resolveStructuredTextItemPlaybackRate(item, channel),
            addLog,
            label: `Text Player ${runtimeAudio.variant.id}/${channel}`
          });
          if (result.status === 'played' || result.status === 'stopped' || stopSignalRef.current) return;
          // Error falls through to Browser TTS with the same requested voice.
        }
      }
    }

    if (!playbackStillCurrent()) return;
    if (!targetVoice) {
      setStructuredTextPlaybackSourceStatus({
        source: 'unavailable',
        origin: 'Browser TTS',
        channel: channel === 'meaning' ? 'meaning' : 'text',
        segmentId: item?.segmentId || item?.id || null,
        voiceId: targetVoiceId || null,
        syncedToFirstSpeaker: Boolean(voiceState.syncedToFirstSpeaker),
        updatedAt: Date.now()
      });
      addLog('Warn', `Text Player: ${channel === 'meaning' ? 'Meaning/ID' : 'Text/EN'} Browser TTS voice is not ready; channel skipped for ${item?.segmentId || item?.id || 'segment'}.`);
      return;
    }
    if (targetVoiceId && targetVoice?.name !== targetVoiceId && item?.speaker) {
      addLog('Warn', `Text Player: speaker ${item.speaker} requested ${targetVoiceId}, unavailable in Browser TTS; using ${targetVoice.name} fallback.`);
    }
    setStructuredTextPlaybackSourceStatus({
      source: 'tts',
      origin: 'Browser TTS',
      channel: channel === 'meaning' ? 'meaning' : 'text',
      segmentId: item?.segmentId || item?.id || null,
      voiceId: targetVoice?.name || targetVoiceId || null,
      syncedToFirstSpeaker: Boolean(voiceState.syncedToFirstSpeaker),
      updatedAt: Date.now()
    });
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
      rate: resolveStructuredTextItemPlaybackRate(item, channel),
      pitch: 1
    });
  };

  const startStructuredTextPlayback = ({
    startSegmentId = null,
    cursorSegmentId = null,
    blockId = null,
    scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
    playbackChannelMode = textStructuredPreferences.playbackChannelMode,
    playbackOrderMode = textStructuredPreferences.playbackOrderMode,
    playbackRepresentationMode = textStructuredPreferences.playbackRepresentationMode,
    repeatMode = textStructuredPreferences.repeatMode,
    repeatCount = null
  } = {}) => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1' || !activeTextDocumentTree) return false;
    return executeStructuredTextPlaybackSessionService({
      documentTree: activeTextDocumentTree,
      startSegmentId,
      cursorSegmentId,
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
      playbackChannelMode,
      playbackOrderMode,
      playbackRepresentationMode,
      repeatMode,
      repeatCount,
      channelDelayMs: textStructuredPreferences.channelDelayMs,
      segmentDelayMs: textStructuredPreferences.segmentDelayMs,
      playStructuredChannel: playStructuredTextChannel,
      resolveBlockChannelPlaybackPlan: resolveStructuredTextBlockChannelPlaybackPlan,
      playStructuredFullStep: playStructuredTextFullStep,
      forceStopAll,
      addLog
    });
  };

  const handleStructuredTextPlaySegment = (segmentId) => {
    const currentScope = playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      ? playbackContextRef.current?.scope
      : null;
    if ((isPlaying || isPaused) && playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && currentScope === TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT && playingIndex === segmentId) {
      forceStopAll();
      return true;
    }
    const manual = resolveTextStructuredManualPlaybackProfile(textStructuredPreferences, 'segment');
    return startStructuredTextPlayback({
      startSegmentId: segmentId,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT,
      playbackChannelMode: manual.playbackChannelMode,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
      repeatMode: manual.repeatMode,
      repeatCount: manual.repeatMode === 'custom' ? manual.repeatCount : null
    });
  };

  const handleStructuredTextPlayCard = (blockId) => {
    const manual = resolveTextStructuredManualPlaybackProfile(textStructuredPreferences, 'card');
    return startStructuredTextPlayback({
      blockId,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
      playbackChannelMode: manual.playbackChannelMode,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      repeatMode: manual.repeatMode,
      repeatCount: manual.repeatMode === 'custom' ? manual.repeatCount : null
    });
  };

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
    const playbackContext = playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      ? playbackContextRef.current
      : null;
    const activeSessionOrder = Array.isArray(playbackContext?.orderedList) && playbackContext.orderedList.length
      ? playbackContext.orderedList
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

    const currentScope = playbackContext?.scope || TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT;
    const preservedPlayback = playbackContext ? {
      playbackChannelMode: playbackContext.playbackChannelMode,
      playbackOrderMode: playbackContext.playbackOrderMode,
      playbackRepresentationMode: playbackContext.playbackRepresentationMode,
      repeatMode: playbackContext.repeatMode,
      repeatCount: playbackContext.repeatCount
    } : {};
    if (currentScope === TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT) return;
    if (currentScope === TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD) {
      startStructuredTextPlayback({
        blockId: playbackContext?.blockId || target.blockId,
        cursorSegmentId: target.id,
        scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
        ...preservedPlayback
      });
      return;
    }
    if (currentScope === TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE) {
      startStructuredTextPlayback({
        startSegmentId: playbackContext?.scopeStartSegmentId || activeSessionOrder[0]?.id || target.id,
        cursorSegmentId: target.id,
        scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
        ...preservedPlayback
      });
      return;
    }
    startStructuredTextPlayback({
      cursorSegmentId: target.id,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
      ...preservedPlayback
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
    const result = await executeTextLibraryDeleteDocument({
      id, activeTextDocumentId, activeTextEditorModel, textIdentityState,
      setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, addLog
    });
    if (result?.librarySnapshot) await runStructuredTextAudioStagingGc(result.librarySnapshot, 'document-delete');
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, activeTextDocumentId, activeTextEditorModel, textIdentityState, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, runStructuredTextAudioStagingGc, addLog]);
  const handleTextLibraryRenameCollection = useCallback((id, title) => runTextLibraryUiCommand(() => executeTextLibraryRenameCollection({ id, title, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryDeleteCollection = useCallback((id) => runTextLibraryUiCommand(() => executeTextLibraryDeleteCollection({ id, setTextLibrarySnapshot, addLog })), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);
  const handleTextLibraryStructuredCommand = useCallback((command) => runTextLibraryUiCommand(async () => {
    const result = await executeTextLibraryStructuredCommand({ command, setTextLibrarySnapshot, addLog });
    const gcTypes = new Set([
      TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
      TEXT_LIBRARY_COMMAND_TYPES.DELETE_SEGMENT,
      TEXT_LIBRARY_COMMAND_TYPES.DELETE_BLOCK,
      TEXT_LIBRARY_COMMAND_TYPES.SPLIT_PARAGRAPH_SEGMENT,
      TEXT_LIBRARY_COMMAND_TYPES.MERGE_PARAGRAPH_SEGMENTS,
      TEXT_LIBRARY_COMMAND_TYPES.DELETE_AUDIO_VARIANT,
      TEXT_LIBRARY_COMMAND_TYPES.DELETE_FULL_AUDIO_ARTIFACT
    ]);
    if (result?.librarySnapshot && gcTypes.has(command?.type)) await runStructuredTextAudioStagingGc(result.librarySnapshot, `command-${command.type}`);
    return result;
  }), [runTextLibraryUiCommand, setTextLibrarySnapshot, runStructuredTextAudioStagingGc, addLog]);

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
    if (result?.snapshot) {
      await runStructuredTextAudioStagingGc(result.snapshot, 'text-pack-sync');
      await reconcileStructuredTextExternalAudioSources(result.snapshot);
    }
    return result;
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, runStructuredTextAudioStagingGc, reconcileStructuredTextExternalAudioSources, addLog]);

  const handleTextPackImportCopy = useCallback((file) => runTextLibraryUiCommand(async () => {
    const merged = await executeProLingoTextPackFileImportCopy({ file });
    setTextLibrarySnapshot(merged.snapshot);
    addLog('Text Pack', `Imported independent copy ${merged.packageId}: +${merged.counts.documents} Document, +${merged.counts.blocks} Card, +${merged.counts.segments} Segment.`);
    return merged;
  }), [runTextLibraryUiCommand, setTextLibrarySnapshot, addLog]);

  const handleTextExternalInitialImport = useCallback((file) => runTextLibraryUiCommand(async () => {
    const inspection = await inspectProLingoTextExternalJsonFile(file);
    if (inspection.status === 'new-source') {
      const result = await executeProLingoTextExternalJsonFileInitialImport({ file });
      applyTextSourceSnapshot(result.snapshot);
      await reconcileStructuredTextExternalAudioSources(result.snapshot);
      addLog('External Text', `Imported ${result.externalSourceKey}: ${result.counts.documents} Workspace, ${result.counts.blocks} Card, ${result.counts.segments} Segment, ${result.counts.speakers} speaker(s).`);
      return { ...result, inspectionStatus: 'new-source' };
    }
    if (inspection.status === 'up-to-date') {
      addLog('External Text', `${inspection.externalSourceKey} is already up to date; duplicate import skipped.`);
      return { mode: 'external-up-to-date', inspectionStatus: 'up-to-date', ...inspection };
    }
    addLog('External Text', `${inspection.externalSourceKey} changed: import decision required (${inspection.summary?.conflicts || 0} conflict(s)).`);
    return { mode: 'external-decision-required', inspectionStatus: inspection.status, ...inspection };
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, reconcileStructuredTextExternalAudioSources, addLog]);

  const handleTextExternalImportDecision = useCallback((file, decision) => runTextLibraryUiCommand(async () => {
    const result = await executeProLingoTextExternalJsonFileDecision({ file, decision });
    if (result?.snapshot) {
      applyTextSourceSnapshot(result.snapshot);
      await runStructuredTextAudioStagingGc(result.snapshot, 'external-reconcile');
      await reconcileStructuredTextExternalAudioSources(result.snapshot);
    }
    const stats = result?.stats || {};
    addLog('External Text', `${result.externalSourceKey || file?.name || 'External source'} → ${decision}; +${stats.created || 0} ~${stats.updated || 0} -${stats.deleted || 0}, local ${stats.preservedLocal || 0}.`);
    return result;
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, runStructuredTextAudioStagingGc, reconcileStructuredTextExternalAudioSources, addLog]);

  const handleTextSourceDetach = useCallback((attachmentId, removeData = false) => runTextLibraryUiCommand(async () => {
    if (removeData) forceStopAll();
    const result = await executeTextSourceDetach({ attachmentId, removeData });
    applyTextSourceSnapshot(result.snapshot);
    setTextSourceAttachments(result.attachments || []);
    addLog('Text Source', removeData
      ? `Removed source-owned local data for ${result.attachment?.packageId || attachmentId} (${result.counts?.removed || 0} records).`
      : `Detached ${result.attachment?.packageId || attachmentId}; local data kept as independent Text data.`);
    if (removeData && result?.snapshot) await runStructuredTextAudioStagingGc(result.snapshot, 'source-data-remove');
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, applyTextSourceSnapshot, runStructuredTextAudioStagingGc, addLog]);

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
    await runStructuredTextAudioStagingGc(result.snapshot, 'database-replace-restore');
    await reconcileStructuredTextExternalAudioSources(result.snapshot);
    addLog('Text DB', `REPLACE restore complete: ${counts.documents || 0} Document, ${counts.blocks || 0} Card, ${counts.segments || 0} Segment, ${counts.audioVariants || 0} audio metadata.`);
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, runStructuredTextAudioStagingGc, reconcileStructuredTextExternalAudioSources, addLog]);


  const handleStructuredTextRuntimeHardeningAudit = useCallback(() => runTextLibraryUiCommand(async () => {
    const snapshot = textLibrarySnapshot;
    if (!snapshot) return null;
    const before = { ...(structuredTextAudioStagingSummaryRef.current || { count: 0, bytes: 0, voices: {} }) };
    const gc = await runStructuredTextAudioStagingGc(snapshot, 'manual-runtime-hardening-audit');
    const external = await reconcileStructuredTextExternalAudioSources(snapshot);
    const after = { ...(structuredTextAudioStagingSummaryRef.current || { count: 0, bytes: 0, voices: {} }) };
    const result = {
      status: 'ok',
      auditedAt: Date.now(),
      gc: {
        released: Number(gc?.released || 0),
        orphanBytes: Number(gc?.orphanBytes || 0),
        legacyKept: Number(gc?.legacyKept || 0)
      },
      stagingBefore: before,
      stagingAfter: after,
      external: {
        folderStatus: 'deprecated-locked',
        zipMatched: Number(external?.zip?.matchedCount || 0),
        zipSplitMatched: Number(external?.zip?.splitMatchedCount || 0),
        zipFullMatched: Number(external?.zip?.fullMatchedCount || 0),
        zipOrphan: Number(external?.zip?.orphanCount || external?.zip?.orphans?.length || 0),
        zipPhysicalImported: Number(structuredTextAudioZipState?.physicalImportedCount || 0)
      }
    };
    addLog('Text Audio', `Runtime audit: GC ${result.gc.released} physical • Portable ZIP ${result.external.zipSplitMatched} Split + ${result.external.zipFullMatched} Full match • Folder LOCKED.`);
    return result;
  }), [runTextLibraryUiCommand, textLibrarySnapshot, runStructuredTextAudioStagingGc, reconcileStructuredTextExternalAudioSources, structuredTextAudioZipState, addLog]);

  const textLibraryShellDocumentTree = useMemo(() => ({
    ...(activeTextDocumentTree || {}),
    blocks: activeTextDocumentTree?.blocks || [],
    __packActions: {
      exportDocument: handleTextPackExportDocument,
      exportCollection: activeTextDocument?.collectionId ? handleTextPackExportCollection : null,
      attachOrSync: handleTextPackAttachOrSync,
      importCopy: handleTextPackImportCopy,
      importExternalJson: handleTextExternalInitialImport,
      applyExternalJsonDecision: handleTextExternalImportDecision,
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
    },
    __runtimeHardening: {
      database: {
        collections: textLibrarySnapshot?.collections?.length || 0,
        workspaces: textLibrarySnapshot?.documents?.length || 0,
        cards: textLibrarySnapshot?.blocks?.length || 0,
        segments: textLibrarySnapshot?.segments?.length || 0,
        audioVariants: textLibrarySnapshot?.audioVariants?.length || 0
      },
      activeCoverage: structuredTextDocumentCoverage,
      staging: structuredTextAudioStagingSummary,
      folder: structuredTextAudioFolderState,
      zip: structuredTextAudioZipState,
      onAuditAndGc: handleStructuredTextRuntimeHardeningAudit
    }
  }), [activeTextDocumentTree, activeTextDocument?.collectionId, handleTextPackExportDocument, handleTextPackExportCollection, handleTextPackAttachOrSync, handleTextPackImportCopy, handleTextExternalInitialImport, handleTextExternalImportDecision, handleTextSourceDetach, textSourceAttachments, handleTextDatabaseBackupExport, handleTextDatabaseBackupInspect, handleTextDatabaseBackupRestore, textLibrarySearchQuery, textLibrarySearchResults, handleTextLibrarySearchAction, textLibrarySnapshot, structuredTextDocumentCoverage, structuredTextAudioStagingSummary, structuredTextAudioFolderState, structuredTextAudioZipState, handleStructuredTextRuntimeHardeningAudit]);

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
    const registryMetadata = buildTextStructuredUpsertSpeakerRegistryMetadata({
      metadata: activeTextDocumentTree.metadata,
      documentId: activeTextDocumentTree.id,
      speakerId: identity.id,
      label: identity.label
    });
    await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata: registryMetadata }
    });
    return identity;
  }, [activeTextDocumentTree, handleTextLibraryStructuredCommand]);

  const handleStructuredTextDocumentVoiceChange = useCallback(async (voiceName, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const metadata = buildTextStructuredVoiceOverrideMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      voiceName
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Voice', `${activeTextDocumentTree.documentType === 'paragraph' ? 'Paragraph narrator' : 'Document fallback'} • ${channel} → ${voiceName || 'Global default'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextDocumentRateChange = useCallback(async (rateValue, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const metadata = buildTextStructuredPlaybackRateProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      rate: rateValue
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio', `${activeTextDocumentTree.documentType === 'paragraph' ? 'Paragraph narrator' : 'Document fallback'} • ${channel} speed → ${Number(rateValue || 1).toFixed(1)}×.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextDocumentDownloadVoiceChange = useCallback(async (voiceId, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      voiceId
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Download', `${activeTextDocumentTree.documentType === 'paragraph' ? 'Paragraph narrator' : 'Document fallback'} • ${channel} → ${voiceId || 'Global Edge default'}.`);
    return result;
  }, [activeTextDocumentTree, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextDocumentDownloadModeChange = useCallback(async (mode, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      mode
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Download', `Workspace • ${channel} preset → ${mode || 'default'}.`);
    return result;
  }, [activeTextDocumentTree, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextDocumentPlaybackOrderChange = useCallback(async (profiles, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const metadata = buildTextStructuredAudioPlaybackOrderMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      profiles
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio Order', `Workspace • ${channel} → ${(Array.isArray(profiles) ? profiles : []).map(item => typeof item === 'string' ? item : item?.voiceId).filter(Boolean).join(' > ') || 'compatibility fallback'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextDocumentTtsOnlyChange = useCallback(async (enabled) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const metadata = buildTextStructuredAudioPlaybackOrderMetadata({
      metadata: activeTextDocumentTree.metadata,
      ttsOnly: Boolean(enabled)
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio Order', `Workspace TTS Only → ${enabled ? 'ON' : 'OFF'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextCardPlaybackOrderChange = useCallback(async (blockId, profiles, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1' || !blockId) return null;
    const block = (activeTextDocumentTree.blocks || []).find(item => item.id === blockId);
    if (!block) return null;
    forceStopAll();
    const metadata = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: block.metadata, channel, profiles });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
      payload: { id: blockId, metadata }
    });
    if (result) addLog('Text Audio Order', `Card ${blockId} • ${channel} custom order updated.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

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

  const handleStructuredTextSpeakerRateChange = useCallback(async (speakerLike, rateValue, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const identity = await ensureStructuredTextSpeakerIdentity(speakerLike);
    if (!identity) return null;
    const metadata = buildTextStructuredPlaybackRateProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      speakerId: identity.id,
      channel,
      rate: rateValue
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio', `${identity.label} • ${channel} speed → ${Number(rateValue || 1).toFixed(1)}× • ${identity.id}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, ensureStructuredTextSpeakerIdentity, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSyncSpeakerVoice = useCallback(async (channel = 'text', enabled = null) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const speakers = collectTextStructuredConversationSpeakerIdentities(activeTextDocumentTree);
    if (speakers.length < 2) return null;
    forceStopAll();
    setStructuredTextPlaybackSourceStatus(null);
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const current = getTextStructuredAudioSyncProfile(activeTextDocumentTree);
    const nextEnabled = typeof enabled === 'boolean' ? enabled : !current.voice?.[normalizedChannel];
    const metadata = buildTextStructuredAudioSyncProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      kind: 'voice',
      channel: normalizedChannel,
      enabled: nextEnabled
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio', `${normalizedChannel} voice sync ${nextEnabled ? 'ON' : 'OFF'} • followers ${nextEnabled ? `use ${speakers[0].label} without overwriting their saved voices` : 'restored to their saved voices'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSyncSpeakerRate = useCallback(async (channel = 'text', enabled = null) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const speakers = collectTextStructuredConversationSpeakerIdentities(activeTextDocumentTree);
    if (speakers.length < 2) return null;
    forceStopAll();
    setStructuredTextPlaybackSourceStatus(null);
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const current = getTextStructuredAudioSyncProfile(activeTextDocumentTree);
    const nextEnabled = typeof enabled === 'boolean' ? enabled : !current.rate?.[normalizedChannel];
    const metadata = buildTextStructuredAudioSyncProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      kind: 'rate',
      channel: normalizedChannel,
      enabled: nextEnabled
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) addLog('Text Audio', `${normalizedChannel} speed sync ${nextEnabled ? 'ON' : 'OFF'} • followers ${nextEnabled ? `use ${speakers[0].label} without overwriting their saved speeds` : 'restored to their saved speeds'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextDocumentLocalAudioVoiceChange = useCallback(async (voiceId, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const metadata = buildTextStructuredLocalAudioProfileMetadata({ metadata: activeTextDocumentTree.metadata, channel, voiceId });
    const result = await handleTextLibraryStructuredCommand({ type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT, payload: { id: activeTextDocumentTree.id, metadata } });
    if (result) addLog('Text Audio', `Custom local ${channel} → ${voiceId || 'Global TTS'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSpeakerLocalAudioVoiceChange = useCallback(async (speakerLike, voiceId, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    forceStopAll();
    const identity = await ensureStructuredTextSpeakerIdentity(speakerLike);
    if (!identity) return null;
    const metadata = buildTextStructuredLocalAudioProfileMetadata({ metadata: activeTextDocumentTree.metadata, channel, voiceId, speakerId: identity.id });
    const result = await handleTextLibraryStructuredCommand({ type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT, payload: { id: activeTextDocumentTree.id, metadata } });
    if (result) addLog('Text Audio', `${identity.label} custom local ${channel} → ${voiceId || 'Global TTS'}.`);
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

  const handleStructuredTextCardDownloadModeChange = useCallback(async (blockId, channel = 'text', mode = 'default') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(item => item.id === blockId);
    if (!block) return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({ metadata: block.metadata, channel, mode });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
      payload: { id: block.id, metadata }
    });
    if (result) addLog('Text Download', `${block.id} • ${channel} preset → ${mode}.`);
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

  const handleStructuredTextSegmentDownloadModeChange = useCallback(async (segmentId, channel = 'text', mode = 'default') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(candidate => (candidate.segments || []).some(segment => segment.id === segmentId));
    const segment = (block?.segments || []).find(item => item.id === segmentId);
    if (!segment) return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({ metadata: segment.metadata, channel, mode });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
      payload: { id: segment.id, metadata }
    });
    if (result) addLog('Text Download', `${segment.id} • ${channel} preset → ${mode}.`);
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
        rate: resolveStructuredTextItemPlaybackRate(item, channel),
        pitch: 1
      });
    });
  }, [structuredTextAudioGenerationState.running, structuredTextPlaybackList, resolveStructuredTextChannelVoiceState, resolveStructuredTextItemPlaybackRate, safePlayTransition, addLog, stopSignalRef, pauseStateRef, synth, currentUtteranceRef, ttsReplayRef, playbackResolveRef]);

  const handleStructuredTextGenerateCardAudio = useCallback((blockId, channels = null, options = {}) => {
    if (!activeTextDocumentTree) return null;
    const jobs = buildTextStructuredGenerationJobs({
      documentTree: activeTextDocumentTree,
      preferences: structuredTextDownloadResolutionPreferences,
      blockId,
      channels,
      segmentIds: options.segmentIds || null
    });
    return runStructuredTextAudioGenerationBatch(jobs, { missingOnly: options.missingOnly !== false });
  }, [activeTextDocumentTree, structuredTextDownloadResolutionPreferences, runStructuredTextAudioGenerationBatch]);

  const handleStructuredTextGenerateSpeakerAudio = useCallback((blockId, speaker, channels = null, options = {}) => {
    if (!activeTextDocumentTree) return null;
    const jobs = buildTextStructuredGenerationJobs({
      documentTree: activeTextDocumentTree,
      preferences: structuredTextDownloadResolutionPreferences,
      blockId,
      speaker,
      channels
    });
    return runStructuredTextAudioGenerationBatch(jobs, { missingOnly: options.missingOnly !== false });
  }, [activeTextDocumentTree, structuredTextDownloadResolutionPreferences, runStructuredTextAudioGenerationBatch]);

  const resolveStructuredTextManualReadySlot = useCallback((segmentId, channel = 'text') => {
    const key = buildTextStructuredRuntimeAudioKey(segmentId, channel);
    const coverage = structuredTextAudioCoverageMap?.[key] || null;
    if (!coverage || coverage.status !== 'ready' || !coverage.variantId) return null;
    const variantId = String(coverage.variantId || '').toUpperCase();
    const variant = (textLibrarySnapshot?.audioVariants || []).find(item => String(item?.id || '').toUpperCase() === variantId) || null;
    const runtime = structuredTextAudioRuntimeUrlsRef.current?.[variantId] || null;
    if (!variant || !runtime) return null;
    return { key, coverage, variant, runtime };
  }, [structuredTextAudioCoverageMap, textLibrarySnapshot?.audioVariants]);

  const resolveStructuredTextBatchReadySlot = useCallback(slot => {
    const coverage = slot?.coverage || null;
    if (!coverage || coverage.status !== 'ready' || !coverage.variantId) return null;
    const variantId = String(coverage.variantId || '').toUpperCase();
    const variant = (textLibrarySnapshot?.audioVariants || []).find(item => String(item?.id || '').toUpperCase() === variantId) || null;
    const runtime = structuredTextAudioRuntimeUrlsRef.current?.[variantId] || null;
    if (!variant || !runtime) return null;
    return { key: slot?.key || buildTextStructuredRuntimeAudioKey(slot?.segmentId, slot?.channel), coverage, variant, runtime };
  }, [textLibrarySnapshot?.audioVariants]);

  const readStructuredTextManualReadyBlob = useCallback(async runtime => {
    if (!runtime) return null;
    if (runtime.stagingBacked && runtime.stagingId) return getTextAudioStagingBlob(runtime.stagingId);
    if (runtime.folderBacked) return readTextStructuredAudioFolderRuntimeBlob(runtime);
    if (runtime.zipBacked) return readTextStructuredAudioZipRuntimeBlob(runtime);
    if (runtime.url) {
      const response = await fetch(runtime.url);
      if (!response.ok) throw new Error(`Unable to read Text audio (${response.status}).`);
      return response.blob();
    }
    if (runtime.zipFallback?.zipBacked) return readTextStructuredAudioZipRuntimeBlob(runtime.zipFallback);
    return null;
  }, []);

  const handleStructuredTextExportAudioMp3 = useCallback(async (segmentId, channel = 'text') => {
    const resolved = resolveStructuredTextManualReadySlot(segmentId, channel);
    if (!resolved) {
      addLog('Warn', `Text MP3 export: ${segmentId}/${channel} is not Ready on the resolved download voice.`);
      return { status: 'missing' };
    }
    try {
      const blob = await readStructuredTextManualReadyBlob(resolved.runtime);
      if (!blob) throw new Error('Ready metadata exists but binary audio is unavailable. Check Text Staging or re-import the Portable ZIP.');
      const filename = resolved.runtime.filename || resolved.coverage.filename || resolved.variant.filename || `${String(segmentId).toUpperCase()}__${String(channel).toUpperCase()}.mp3`;
      const url = URL.createObjectURL(blob);
      triggerBrowserDownload(url, filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (resolved.runtime.stagingBacked && resolved.runtime.stagingId) {
        await markAudioStagingExported(resolved.runtime.stagingId, { kind: 'mp3', filename });
      }
      addLog('Text Audio', `MP3 export: ${segmentId}/${channel} • ${resolved.coverage.sourceType || 'runtime'} • ${filename}.`);
      return { status: 'download-triggered', filename, sourceType: resolved.coverage.sourceType || 'runtime' };
    } catch (error) {
      addLog('Error', `Text MP3 export failed: ${error?.message || error}`);
      return { status: 'error', error };
    }
  }, [resolveStructuredTextManualReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextExportCardZip = useCallback(async (blockId, options = {}) => {
    const block = (activeTextDocumentTree?.blocks || []).find(item => item.id === blockId) || null;
    if (!block) return { status: 'missing-card' };
    const selectedIds = Array.isArray(options?.segmentIds) && options.segmentIds.length ? new Set(options.segmentIds) : null;
    const selectedSegments = (block.segments || []).filter(segment => !selectedIds || selectedIds.has(segment.id));
    const slots = [];
    for (const segment of selectedSegments) {
      for (const channel of ['text', 'meaning']) {
        const content = String(channel === 'meaning' ? segment?.meaning || '' : segment?.text || '').trim();
        if (!content) continue;
        const resolved = resolveStructuredTextManualReadySlot(segment.id, channel);
        slots.push({ segment, channel, resolved });
      }
    }
    const missing = slots.filter(item => !item.resolved);
    if (missing.length) {
      addLog('Warn', `Split ZIP blocked: ${slots.length - missing.length}/${slots.length} Ready • ${missing.length} Missing.`);
      return { status: 'incomplete', ready: slots.length - missing.length, total: slots.length, missing: missing.length };
    }
    try {
      const physicalByRf = new Map();
      const stagedIds = new Set();
      const voiceIds = [];
      for (const item of slots) {
        const rf = String(item.resolved.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
        if (!rf) throw new Error(`Split ZIP requires RF-verified audio: ${item.segment.id}/${item.channel}.`);
        let physical = physicalByRf.get(rf);
        if (!physical) {
          const blob = await readStructuredTextManualReadyBlob(item.resolved.runtime);
          if (!blob) throw new Error(`Ready binary unavailable for ${item.segment.id}/${item.channel}.`);
          const filename = item.resolved.runtime.filename || item.resolved.coverage.filename || item.resolved.variant.filename;
          if (!filename) throw new Error(`RF ${rf} has no canonical filename.`);
          physical = { rf, filename, blob, mimeType: blob.type || item.resolved.variant.mimeType || null, render: item.resolved.variant?.metadata?.audioRenderDescriptorV1 || null, references: [] };
          physicalByRf.set(rf, physical);
        }
        physical.references.push({
          documentId: activeTextDocumentTree?.id || null,
          documentUid: activeTextDocumentTree?.uid || null,
          cardId: block.id,
          cardUid: block.uid || null,
          segmentId: item.segment.id,
          segmentUid: item.segment.uid || null,
          channel: item.channel,
          audioVariantId: item.resolved.variant.id,
          audioVariantUid: item.resolved.variant.uid || null,
          voiceId: item.resolved.coverage.requiredVoiceId || item.resolved.variant.voiceId || null
        });
        if (item.resolved.coverage.requiredVoiceId) voiceIds.push(item.resolved.coverage.requiredVoiceId);
        if (item.resolved.runtime.stagingBacked && item.resolved.runtime.stagingId) stagedIds.add(item.resolved.runtime.stagingId);
      }
      const manifest = buildProLingoTextAudioManifest({
        entries: [...physicalByRf.values()].map(item => ({ rf: item.rf, filename: item.filename, mimeType: item.mimeType, size: item.blob.size, render: item.render, references: item.references })),
        source: { kind: selectedIds ? 'selected-card-split' : 'card-split', documentId: activeTextDocumentTree?.id || null, cardId: block.id }
      });
      const entries = [...physicalByRf.values()].map(item => ({ filename: item.filename, blob: item.blob }));
      entries.push({ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
      entries.push({ filename: TEXT_AUDIO_INDEX_FILENAME, blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv;charset=utf-8' }) });
      const zipFilename = buildCanonicalTextCardZipFilename({ documentTitle: activeTextDocumentTree?.title || 'Text', blockId, voiceIds });
      const result = await triggerBrowserZipDownload({ entries, filename: zipFilename });
      if (stagedIds.size) await markAudioStagingExported([...stagedIds], { kind: 'zip', filename: zipFilename });
      addLog('Text Audio', `Split ZIP: ${slots.length} logical audio slot(s) → ${physicalByRf.size} unique RF binary file(s) + manifest → ${zipFilename}.`);
      return { status: 'completed', result, filename: zipFilename, logical: slots.length, physical: physicalByRf.size, total: slots.length };
    } catch (error) {
      addLog('Error', `Split ZIP export failed: ${error?.message || error}`);
      return { status: 'error', error };
    }
  }, [activeTextDocumentTree, resolveStructuredTextManualReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextExportFullCardAudio = useCallback(async (blockId, channel = 'text') => {
    const block = (activeTextDocumentTree?.blocks || []).find(item => item.id === blockId) || null;
    if (!block) return { status: 'missing-card' };
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const segments = (block.segments || []).filter(segment => String(normalizedChannel === 'meaning' ? segment?.meaning || '' : segment?.text || '').trim());
    if (!segments.length) return { status: 'empty' };
    const resolved = segments.map(segment => ({ segment, slot: resolveStructuredTextManualReadySlot(segment.id, normalizedChannel) }));
    const missing = resolved.filter(item => !item.slot);
    if (missing.length) {
      addLog('Warn', `Full ${normalizedChannel === 'meaning' ? 'ID' : 'EN'} blocked: ${segments.length - missing.length}/${segments.length} Sentence audio Ready.`);
      return { status: 'incomplete', ready: segments.length - missing.length, total: segments.length };
    }
    try {
      const blobs = [];
      for (const item of resolved) {
        const blob = await readStructuredTextManualReadyBlob(item.slot.runtime);
        if (!blob) throw new Error(`Binary unavailable for ${item.segment.id}/${normalizedChannel}.`);
        blobs.push(blob);
      }
      const derived = await buildDerivedTextFullAudioWav({ blobs });
      const filename = buildDerivedTextFullAudioFilename({ documentTitle: activeTextDocumentTree?.title || 'Text', blockId, channel: normalizedChannel });
      const url = URL.createObjectURL(derived.blob);
      triggerBrowserDownload(url, filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      addLog('Text Audio', `Full derived ${normalizedChannel === 'meaning' ? 'ID' : 'EN'}: ${derived.segmentCount} Segment audio → ${filename}; no new AudioVariant.`);
      return { status: 'download-triggered', filename, ...derived };
    } catch (error) {
      addLog('Error', `Full derived audio failed: ${error?.message || error}`);
      return { status: 'error', error };
    }
  }, [activeTextDocumentTree, resolveStructuredTextManualReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextBatchExportReadyMp3 = useCallback(async () => {
    const slots = structuredTextBatchSelection?.slots || [];
    const readyLogical = slots.map(slot => ({ slot, resolved: resolveStructuredTextBatchReadySlot(slot) })).filter(item => item.resolved);
    if (!readyLogical.length) {
      addLog('Warn', 'Text Batch MP3 export: no Ready binary in the selected scope/current exact voices.');
      return { status: 'empty', exported: 0, total: slots.length };
    }

    // B1: physical export is RF-centric. Several logical Segment slots may use the
    // exact same render; export that physical binary once instead of triggering
    // duplicate downloads with the same canonical RF filename.
    const physicalMap = new Map();
    readyLogical.forEach(item => {
      const rf = String(item.resolved.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
      const physicalKey = rf || `legacy:${item.resolved.variant.id}`;
      const current = physicalMap.get(physicalKey);
      if (current) {
        current.references.push(item);
      } else {
        physicalMap.set(physicalKey, { physicalKey, rf: rf || null, item, references: [item] });
      }
    });
    const physicalReady = [...physicalMap.values()];
    let exported = 0;
    let failed = 0;
    for (let offset = 0; offset < physicalReady.length; offset += DIRECT_MP3_BATCH_LIMIT) {
      const wave = physicalReady.slice(offset, offset + DIRECT_MP3_BATCH_LIMIT);
      for (const physical of wave) {
        const item = physical.item;
        try {
          const blob = await readStructuredTextManualReadyBlob(item.resolved.runtime);
          if (!blob) throw new Error('binary unavailable');
          const filename = item.resolved.runtime.filename || item.resolved.coverage.filename || item.resolved.variant.filename || `${item.slot.segmentId}__${item.slot.channel}.mp3`;
          const url = URL.createObjectURL(blob);
          triggerBrowserDownload(url, filename);
          window.setTimeout(() => URL.revokeObjectURL(url), 5000);
          if (item.resolved.runtime.stagingBacked && item.resolved.runtime.stagingId) {
            await markAudioStagingExported(item.resolved.runtime.stagingId, { kind: 'mp3', filename });
          }
          exported += 1;
        } catch (error) {
          failed += 1;
          addLog('Warn', `Text Batch MP3 skipped ${item.slot.segmentId}/${item.slot.channel}: ${error?.message || error}`);
        }
      }
      if (offset + DIRECT_MP3_BATCH_LIMIT < physicalReady.length) await new Promise(resolve => setTimeout(resolve, 300));
    }
    addLog('Text Audio', `Text Batch direct MP3: ${readyLogical.length} Ready logical slot(s) → ${physicalReady.length} unique physical RF file(s); exported ${exported}${failed ? ` • failed ${failed}` : ''}.`);
    return { status: failed ? 'completed-with-errors' : 'completed', exported, failed, logicalReady: readyLogical.length, physicalReady: physicalReady.length, total: slots.length };
  }, [structuredTextBatchSelection, resolveStructuredTextBatchReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextBatchExportConsolidatedZip = useCallback(async ({ partial = false } = {}) => {
    const slots = structuredTextBatchSelection?.slots || [];
    const ready = slots.map(slot => ({ slot, resolved: resolveStructuredTextBatchReadySlot(slot) })).filter(item => item.resolved);
    if (!slots.length) return { status: 'empty', ready: 0, total: 0 };
    if (!partial && ready.length !== slots.length) {
      addLog('Warn', `Text Full ZIP blocked: ${ready.length}/${slots.length} Ready • ${slots.length - ready.length} Missing/other/stale.`);
      return { status: 'incomplete', ready: ready.length, total: slots.length };
    }
    if (partial && !ready.length) return { status: 'empty', ready: 0, total: slots.length };

    const readyByDocument = new Map();
    ready.forEach(item => {
      const documentId = item.slot?.documentId || 'TEXT_DOCUMENT';
      const list = readyByDocument.get(documentId) || [];
      list.push(item);
      readyByDocument.set(documentId, list);
    });
    const exportedChunks = [];
    try {
      for (const [documentId, documentReady] of readyByDocument.entries()) {
        const documentDescriptor = structuredTextBatchSelection?.documents?.find(document => document.id === documentId);
        const documentSlots = slots.filter(slot => (slot.documentId || 'TEXT_DOCUMENT') === documentId);
        const documentComplete = documentReady.length === documentSlots.length;
        if (!partial && !documentComplete) throw new Error(`Workspace ${documentDescriptor?.title || documentId} is incomplete.`);
        const voiceIds = [...new Set(documentReady.map(item => item.resolved.coverage.requiredVoiceId).filter(Boolean))];

        // RF-deduplicate the physical package while keeping every logical usage in
        // the manifest. This lets one render serve repeated text across Cards,
        // speakers or Segments without duplicating the Blob in the ZIP.
        const physicalByRf = new Map();
        for (const item of documentReady) {
          const rf = String(item.resolved.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
          if (!rf) throw new Error(`Batch ZIP requires RF-verified audio: ${item.slot.segmentId}/${item.slot.channel}.`);
          let physical = physicalByRf.get(rf);
          if (!physical) {
            const blob = await readStructuredTextManualReadyBlob(item.resolved.runtime);
            if (!blob) throw new Error(`Ready binary unavailable for ${item.slot.segmentId}/${item.slot.channel}.`);
            const filename = item.resolved.runtime.filename || item.resolved.coverage.filename || item.resolved.variant.filename;
            if (!filename) throw new Error(`RF ${rf} has no canonical filename.`);
            physical = {
              rf,
              filename,
              blob,
              mimeType: blob.type || item.resolved.variant.mimeType || null,
              render: item.resolved.variant?.metadata?.audioRenderDescriptorV1 || null,
              stagingIds: new Set(),
              references: []
            };
            physicalByRf.set(rf, physical);
          }
          if (item.resolved.runtime.stagingBacked && item.resolved.runtime.stagingId) physical.stagingIds.add(item.resolved.runtime.stagingId);
          physical.references.push({
            documentId,
            documentUid: documentDescriptor?.uid || null,
            cardId: item.slot?.blockId || null,
            segmentId: item.slot?.segmentId || null,
            segmentUid: item.slot?.segmentUid || null,
            channel: item.slot?.channel || null,
            audioVariantId: item.resolved.variant.id,
            audioVariantUid: item.resolved.variant.uid || null,
            voiceId: item.resolved.coverage.requiredVoiceId || item.resolved.variant.voiceId || null
          });
        }

        const physicalList = [...physicalByRf.values()];
        const chunks = [];
        let chunk = [];
        let chunkBytes = 0;
        for (const physical of physicalList) {
          const bytes = Number(physical.blob?.size || 0);
          if (chunk.length && chunkBytes + bytes > TEXT_AUDIO_STAGING_ZIP_MAX_BYTES) {
            chunks.push({ physical: chunk, bytes: chunkBytes });
            chunk = [];
            chunkBytes = 0;
          }
          chunk.push(physical);
          chunkBytes += bytes;
        }
        if (chunk.length) chunks.push({ physical: chunk, bytes: chunkBytes });

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          const current = chunks[chunkIndex];
          const entries = current.physical.map(item => ({ filename: item.filename, blob: item.blob }));
          const manifest = buildProLingoTextAudioManifest({
            entries: current.physical.map(item => ({
              rf: item.rf,
              filename: item.filename,
              mimeType: item.mimeType,
              size: Number(item.blob?.size || 0),
              render: item.render,
              references: item.references
            })),
            source: {
              kind: partial || !documentComplete ? 'batch-partial-rf-package' : 'batch-full-rf-package',
              documentId,
              documentUid: documentDescriptor?.uid || null,
              documentTitle: documentDescriptor?.title || null,
              logicalSlots: documentReady.length,
              physicalRenders: physicalList.length
            }
          });
          entries.push({ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
          entries.push({ filename: TEXT_AUDIO_INDEX_FILENAME, blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv;charset=utf-8' }) });
          const filename = buildCanonicalTextConsolidatedZipFilename({
            documentTitle: documentDescriptor?.title || documentReady[0]?.slot?.documentTitle || 'Text',
            voiceIds,
            partial: partial || !documentComplete,
            partNo: chunks.length > 1 ? chunkIndex + 1 : null
          });
          const result = await triggerBrowserZipDownload({ entries, filename });
          const stagingIds = [...new Set(current.physical.flatMap(item => [...item.stagingIds]))];
          if (stagingIds.length) await markAudioStagingExported(stagingIds, { kind: 'zip', filename });
          exportedChunks.push({
            ...result,
            documentId,
            documentTitle: documentDescriptor?.title || documentId,
            filename,
            fileCount: current.physical.length,
            manifestEntries: manifest.entries.length,
            logicalSlots: current.physical.reduce((sum, item) => sum + item.references.length, 0),
            physicalRenders: current.physical.length,
            bytes: current.bytes
          });
        }
      }
      const physicalTotal = exportedChunks.reduce((sum, chunkItem) => sum + Number(chunkItem.physicalRenders || 0), 0);
      addLog('Text Audio', `${partial ? 'Partial' : 'Full'} Text ZIP: ${ready.length}/${slots.length} Ready logical slot(s) → ${physicalTotal} packaged RF render(s) across ${readyByDocument.size} Workspace(s), with manifest; no TTS.`);
      return { status: 'completed', ready: ready.length, total: slots.length, physical: physicalTotal, chunks: exportedChunks, documents: readyByDocument.size };
    } catch (error) {
      addLog('Error', `Text consolidated ZIP failed: ${error?.message || error}`);
      return { status: 'error', error, ready: ready.length, total: slots.length, chunks: exportedChunks };
    }
  }, [structuredTextBatchSelection, resolveStructuredTextBatchReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextBulkExport = useCallback(async ({ format = null, auto = false } = {}) => {
    const exportPlan = structuredTextBulkExportPlan || { physical: [], coverage: {} };
    const physical = Array.isArray(exportPlan.physical) ? exportPlan.physical : [];
    const targetFormat = format || structuredTextAudioGenerationPreferences.bulkExportFormat || TEXT_STRUCTURED_BULK_EXPORT_FORMATS.PORTABLE_ZIP;
    if (!physical.length) {
      addLog('Warn', `Bulk Export${auto ? ' (Auto)' : ''}: no Ready Staging physical audio matches the current scope / voice / representation policy.`);
      return { status: 'empty', format: targetFormat, exported: 0 };
    }

    const scopeLabel = structuredTextBatchSelection?.documents?.length === 1
      ? (structuredTextBatchSelection.documents[0]?.title || activeTextDocumentTree?.title || 'Text')
      : `${structuredTextBatchSelection?.documents?.length || 0}_Workspaces`;
    const readPhysical = async (entry, index) => {
      const blob = await getTextAudioStagingBlob(entry?.stagingRecord?.id);
      if (!blob) throw new Error(`Staging binary unavailable for ${entry?.physicalKey || `entry ${index + 1}`}.`);
      return { entry, blob, index };
    };

    try {
      if (targetFormat === TEXT_STRUCTURED_BULK_EXPORT_FORMATS.AUDIO_ONLY_DIRECT) {
        let exported = 0;
        let failed = 0;
        for (let offset = 0; offset < physical.length; offset += DIRECT_MP3_BATCH_LIMIT) {
          const wave = physical.slice(offset, offset + DIRECT_MP3_BATCH_LIMIT);
          for (let waveIndex = 0; waveIndex < wave.length; waveIndex += 1) {
            const index = offset + waveIndex;
            const entry = wave[waveIndex];
            try {
              const { blob } = await readPhysical(entry, index);
              const filename = buildTextBulkAudioOnlyFilename(entry, index);
              const url = URL.createObjectURL(blob);
              triggerBrowserDownload(url, filename);
              window.setTimeout(() => URL.revokeObjectURL(url), 5000);
              if (entry?.stagingRecord?.id) await markAudioStagingExported(entry.stagingRecord.id, { kind: 'audio-only-direct', filename });
              exported += 1;
            } catch (error) {
              failed += 1;
              addLog('Warn', `Bulk Audio-Only direct skipped ${entry?.physicalKey || index}: ${error?.message || error}`);
            }
          }
          if (offset + DIRECT_MP3_BATCH_LIMIT < physical.length) await new Promise(resolve => setTimeout(resolve, 300));
        }
        addLog('Text Audio', `Bulk Audio-Only Direct${auto ? ' Auto Export' : ''}: ${exportPlan.coverage?.logicalReady || 0} logical Ready → ${physical.length} unique physical • exported ${exported}${failed ? ` • failed ${failed}` : ''}.`);
        return { status: failed ? 'completed-with-errors' : 'completed', format: targetFormat, exported, failed, logicalReady: exportPlan.coverage?.logicalReady || 0, physicalReady: physical.length };
      }

      const chunks = [];
      let current = [];
      let currentBytes = 0;
      for (const entry of physical) {
        const bytes = Math.max(0, Number(entry?.stagingRecord?.size || 0));
        if (current.length && currentBytes + bytes > TEXT_AUDIO_STAGING_ZIP_MAX_BYTES) {
          chunks.push(current);
          current = [];
          currentBytes = 0;
        }
        current.push(entry);
        currentBytes += bytes;
      }
      if (current.length) chunks.push(current);

      const results = [];
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        const loaded = [];
        for (const entry of chunk) loaded.push(await readPhysical(entry, physical.indexOf(entry)));
        const partNo = chunks.length > 1 ? chunkIndex + 1 : null;

        if (targetFormat === TEXT_STRUCTURED_BULK_EXPORT_FORMATS.AUDIO_ONLY_ZIP) {
          const entries = loaded.map(({ entry, blob, index }) => ({ filename: buildTextBulkAudioOnlyFilename(entry, index), blob }));
          const filename = buildTextBulkArchiveFilename({ kind: 'audio-only', scopeLabel, partNo });
          const result = await triggerBrowserZipDownload({ entries, filename });
          const ids = chunk.map(entry => entry?.stagingRecord?.id).filter(Boolean);
          if (ids.length) await markAudioStagingExported(ids, { kind: 'audio-only-zip', filename });
          results.push({ ...result, filename, physical: chunk.length });
          continue;
        }

        const manifest = buildProLingoTextAudioManifest({
          entries: loaded.map(({ entry, blob }) => {
            const isFull = entry.representation === 'full';
            return {
              representation: entry.representation,
              identity: entry.physicalKey,
              rf: isFull ? null : entry.physicalKey,
              fullArtifactFingerprint: isFull ? entry.physicalKey : null,
              filename: entry.canonicalFilename || entry.stagingRecord?.filename || `${entry.physicalKey}.${String(blob.type || '').includes('wav') ? 'wav' : 'mp3'}`,
              mimeType: blob.type || entry.mimeType || null,
              size: Number(blob.size || 0),
              render: isFull
                ? entry.stagingRecord?.metadata?.fullArtifactDescriptorV1 || null
                : entry.stagingRecord?.metadata?.audioRenderDescriptorV1 || entry.stagingRecord?.metadata?.renderDescriptor || null,
              references: entry.references || []
            };
          }),
          source: {
            kind: 'bulk-portable-audio',
            appVersion: APP_VERSION,
            checkpointId: APP_CHECKPOINT_ID,
            scope: structuredTextBatchScope?.scopeMode || 'workspace',
            voicePolicy: structuredTextAudioGenerationPreferences.bulkExportVoicePolicy || 'all-selected',
            representation: structuredTextAudioGenerationPreferences.bulkExportRepresentation || 'split',
            logicalReady: exportPlan.coverage?.logicalReady || 0,
            uniquePhysicalReady: exportPlan.coverage?.uniquePhysicalReady || physical.length
          }
        });
        const entries = loaded.map(({ entry, blob }) => ({ filename: entry.canonicalFilename || entry.stagingRecord?.filename || `${entry.physicalKey}.mp3`, blob }));
        entries.push({ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
        entries.push({ filename: TEXT_AUDIO_INDEX_FILENAME, blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv;charset=utf-8' }) });
        const filename = buildTextBulkArchiveFilename({ kind: 'portable', scopeLabel, partNo });
        const result = await triggerBrowserZipDownload({ entries, filename });
        const ids = chunk.map(entry => entry?.stagingRecord?.id).filter(Boolean);
        if (ids.length) await markAudioStagingExported(ids, { kind: 'portable-zip', filename });
        results.push({ ...result, filename, physical: chunk.length, manifestEntries: manifest.entries.length });
      }

      const label = targetFormat === TEXT_STRUCTURED_BULK_EXPORT_FORMATS.AUDIO_ONLY_ZIP ? 'Audio-Only ZIP' : 'Portable ZIP';
      addLog('Text Audio', `Bulk ${label}${auto ? ' Auto Export' : ''}: ${exportPlan.coverage?.logicalReady || 0} logical Ready → ${physical.length} unique physical • ${results.length} ZIP${results.length === 1 ? '' : 's'}.`);
      return { status: 'completed', format: targetFormat, logicalReady: exportPlan.coverage?.logicalReady || 0, physicalReady: physical.length, results };
    } catch (error) {
      addLog('Error', `Bulk Export failed: ${error?.message || error}`);
      return { status: 'error', format: targetFormat, error };
    }
  }, [structuredTextBulkExportPlan, structuredTextAudioGenerationPreferences, structuredTextBatchSelection, structuredTextBatchScope?.scopeMode, activeTextDocumentTree?.title, addLog]);

  useEffect(() => {
    if (!structuredTextPendingAutoExport || structuredTextAudioGenerationState.running) return;
    const pending = structuredTextPendingAutoExport;
    // Clear before dispatch to make this edge-triggered even if export fails. A new generation
    // session may arm a new request independently.
    setStructuredTextPendingAutoExport(null);
    void handleStructuredTextBulkExport({
      format: pending.format || structuredTextAudioGenerationPreferences.bulkExportFormat,
      auto: true
    });
  }, [structuredTextPendingAutoExport, structuredTextAudioGenerationState.running, structuredTextBulkExportPlan, handleStructuredTextBulkExport, structuredTextAudioGenerationPreferences.bulkExportFormat]);

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
    const id = String(variantId || '').toUpperCase();
    if (!id) return null;
    const runtime = structuredTextAudioRuntimeUrlsRef.current?.[id] || null;
    const variant = (textLibrarySnapshot?.audioVariants || []).find(item => String(item?.id || '').toUpperCase() === id) || null;

    // Legacy compatibility: old direct Folder/ZIP runtime handles remain source-owned.
    // New P4 Portable ZIP audio is Staging-backed and follows the shared-release path.
    if (runtime?.folderBacked || runtime?.zipBacked) {
      addLog('Warn', `${id}: legacy external audio is source-owned. Portable ZIP imports should be Staging-backed; detach the legacy source instead of deleting it here.`);
      return { status: 'protected-external-source' };
    }

    if (runtime?.stagingBacked && runtime?.stagingId) {
      const stagingId = runtime.stagingId;
      const rf = String(runtime?.renderFingerprint || variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
      const sharedRuntimeIds = Object.entries(structuredTextAudioRuntimeUrlsRef.current || {})
        .filter(([, entry]) => entry?.stagingBacked && (
          String(entry?.stagingId || '') === String(stagingId)
          || (rf && String(entry?.renderFingerprint || '').toLowerCase() === rf)
        ))
        .map(([variantKey]) => String(variantKey || '').toUpperCase())
        .filter(Boolean);
      if (sharedRuntimeIds.length > 1 && typeof window !== 'undefined') {
        const confirmed = window.confirm(`This staged RF is shared by ${sharedRuntimeIds.length} logical audio slot(s). Releasing the physical staged file will make every shared slot no longer Ready until Portable ZIP re-import or regeneration. Continue?`);
        if (!confirmed) return { status: 'cancelled-shared-release', variantId: id, stagingId, sharedCount: sharedRuntimeIds.length };
      }
      await releaseAudioStagingBlobs([stagingId], { reason: 'text-manual-shared-rf-release' });
      const stagedRecord = structuredTextAudioStagingRecordsRef.current.get(stagingId) || null;
      if (stagedRecord) forgetStructuredTextStagingRecord(stagedRecord);
      const affected = new Set(sharedRuntimeIds.length ? sharedRuntimeIds : [id]);
      for (const [pendingId, entry] of [...structuredTextAudioPendingRuntimeRef.current.entries()]) {
        if (affected.has(String(pendingId || '').toUpperCase())
          || (entry?.stagingBacked && String(entry?.stagingId || '') === String(stagingId))
          || (rf && entry?.stagingBacked && String(entry?.renderFingerprint || '').toLowerCase() === rf)) {
          structuredTextAudioPendingRuntimeRef.current.delete(pendingId);
        }
      }
      setStructuredTextAudioRuntimeUrls(prev => {
        const next = { ...prev };
        Object.entries(prev || {}).forEach(([variantKey, entry]) => {
          const samePhysical = entry?.stagingBacked && (
            String(entry?.stagingId || '') === String(stagingId)
            || (rf && String(entry?.renderFingerprint || '').toLowerCase() === rf)
          );
          if (!samePhysical) return;
          if (entry?.zipFallback?.zipBacked) next[variantKey] = entry.zipFallback;
          else delete next[variantKey];
        });
        return next;
      });
      addLog('Text Audio', `Released one shared staged RF for ${affected.size} logical slot${affected.size === 1 ? '' : 's'}. Core audio metadata/history remains; coverage is now metadata-only unless a legacy external source still resolves it.`);
      return { status: 'released-shared-staging', variantId: id, stagingId, sharedCount: affected.size, renderFingerprint: rf || null };
    }

    // Manually attached local runtime files remain removable. Generated history
    // without an owned staged binary is intentionally kept as history-only metadata.
    if (String(variant?.source || '').toLowerCase() !== 'file' && !runtime?.url) {
      return { status: 'history-only' };
    }
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_AUDIO_VARIANT,
      payload: { id }
    });
    if (!result) return null;
    setStructuredTextAudioRuntimeUrls(prev => {
      const previous = prev?.[id];
      if (previous?.url) { try { URL.revokeObjectURL(previous.url); } catch {} }
      const next = { ...prev };
      delete next[id];
      return next;
    });
    addLog('Text Audio', `Removed local manual audio variant ${id}.`);
    return result;
  }, [textLibrarySnapshot?.audioVariants, handleTextLibraryStructuredCommand, forgetStructuredTextStagingRecord, addLog]);


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
    staging: structuredTextAudioStagingSummary,
    folderState: structuredTextAudioFolderState,
    zipState: structuredTextAudioZipState,
    coverage: structuredTextDocumentCoverage,
    inventory: structuredTextAudioInventorySummary,
    onChooseFolder: handleStructuredTextChooseAudioFolder,
    onReconnectFolder: handleStructuredTextReconnectAudioFolder,
    onAddZipFiles: handleStructuredTextAddAudioZipFiles,
    onClearZip: handleStructuredTextClearAudioZipFiles,
    onClearStaging: handleStructuredTextClearStaging,
    onClearRuntimeCache: handleStructuredTextClearRuntimeCache
  }), [structuredTextAudioStagingSummary, structuredTextAudioFolderState, structuredTextAudioZipState, structuredTextDocumentCoverage, structuredTextAudioInventorySummary, handleStructuredTextChooseAudioFolder, handleStructuredTextReconnectAudioFolder, handleStructuredTextAddAudioZipFiles, handleStructuredTextClearAudioZipFiles, handleStructuredTextClearStaging, handleStructuredTextClearRuntimeCache]);

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
    // Existing Split export coverage stays separate until P6. P5 generation uses the
    // explicit multi-voice Split/Full plan below.
    coverage: structuredTextBatchSelection?.coverage || structuredTextDocumentCoverage,
    generationCoverage: structuredTextBulkGenerationPlan?.coverage || {},
    exportCoverage: structuredTextBulkExportPlan?.coverage || {},
    exportPlan: structuredTextBulkExportPlan,
    bulkTextVoicesResolved: structuredTextBulkGenerationPlan?.selectedVoices?.text || [],
    bulkMeaningVoicesResolved: structuredTextBulkGenerationPlan?.selectedVoices?.meaning || [],
    bulkRepresentations: structuredTextBulkGenerationPlan?.representations || { split: true, full: false },
    scope: structuredTextBatchScope,
    cardCount: activeTextDocumentTree?.blocks?.length || 0,
    workspaceTitle: activeTextDocumentTree?.title || 'Text Workspace',
    documentTitle: activeTextDocumentTree?.title || 'Text Workspace',
    activeWorkspaceId: activeTextDocumentTree?.id || null,
    activeDocumentId: activeTextDocumentTree?.id || null,
    activeCollectionId: activeTextDocumentTree?.collectionId || null,
    activeCollectionTitle: structuredTextBatchDocumentOptions.find(document => document.id === activeTextDocumentTree?.id)?.collectionTitle || 'Unfiled / Library Root',
    cardOptions: structuredTextBatchCardOptions,
    workspaceOptions: structuredTextBatchDocumentOptions,
    documentOptions: structuredTextBatchDocumentOptions,
    collectionOptions: structuredTextBatchCollectionOptions,
    workspacesResolved: structuredTextBatchSelection?.workspaces || structuredTextBatchSelection?.documents || [],
    documentsResolved: structuredTextBatchSelection?.documents || [],
    targetWorkspaceIds: structuredTextBatchTargetDocumentIds,
    targetDocumentIds: structuredTextBatchTargetDocumentIds,
    voicesResolved: structuredTextBatchSelection?.voices || [],
    speakersResolved: structuredTextBatchSelection?.speakers || [],
    running: Boolean(structuredTextAudioGenerationState.running),
    statusText: structuredTextAudioGenerationState.running
      ? `${structuredTextAudioGenerationState.processed ?? structuredTextAudioGenerationState.completed ?? 0}/${structuredTextAudioGenerationState.total || 0}`
      : structuredTextAudioGenerationState.lastStatus || '',
    generationState: structuredTextAudioGenerationState,
    onPreferencesChange: handleStructuredTextAudioGenerationPreferenceChange,
    onScopeChange: patch => setStructuredTextBatchScope(prev => ({ ...prev, ...(patch || {}) })),
    downloadMissing: () => runStructuredTextAudioGenerationBatch(null, { selectionMode: 'missing' }),
    downloadMissingAndStale: () => runStructuredTextAudioGenerationBatch(null, { selectionMode: 'missing-and-stale' }),
    redownloadAll: () => runStructuredTextAudioGenerationBatch(null, { selectionMode: 'all' }),
    exportBulk: options => handleStructuredTextBulkExport(options),
    exportReadyMp3: handleStructuredTextBatchExportReadyMp3,
    exportFullZip: () => handleStructuredTextBatchExportConsolidatedZip({ partial: false }),
    exportPartialZip: () => handleStructuredTextBatchExportConsolidatedZip({ partial: true }),
    directMp3Limit: DIRECT_MP3_BATCH_LIMIT,
    cancel: handleStructuredTextCancelGeneration,
    retryFailed: handleStructuredTextRetryFailedGeneration
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

  useEffect(() => {
    if (mode === 'text' && (sidebarSection === 'player' || sidebarSection === 'learn')) setSidebarSection('audio');
    if (mode === 'table' && sidebarSection === 'audio') setSidebarSection('player');
  }, [mode, sidebarSection, setSidebarSection]);

  const renderControlSectionTabs = (compact = false) => renderControlSectionTabsView({
    compact, sidebarSection, setSidebarSection, mode
  });

  const structuredTextAudioSidebarControls = {
    documentTree: activeTextDocumentTree,
    preferences: textStructuredPreferences,
    englishVoices: voices,
    indonesianVoices,
    defaultTextVoiceName: defaultStructuredTextVoiceId,
    defaultMeaningVoiceName: defaultStructuredMeaningVoiceId,
    globalTextRate: textStructuredPreferences.browserTextRate || 1,
    globalMeaningRate: textStructuredPreferences.browserMeaningRate || 1,
    availableLocalVoices: structuredTextAvailableLocalVoices,
    disabled: isSystemBusy || structuredTextAudioGenerationState.running,
    onAudioSourceModeChange: handleStructuredTextAudioSourceModeChange,
    onDocumentVoiceChange: handleStructuredTextDocumentVoiceChange,
    onSpeakerVoiceChange: handleStructuredTextSpeakerVoiceChange,
    onDocumentRateChange: handleStructuredTextDocumentRateChange,
    onSpeakerRateChange: handleStructuredTextSpeakerRateChange,
    onSyncSpeakerVoice: handleStructuredTextSyncSpeakerVoice,
    onSyncSpeakerRate: handleStructuredTextSyncSpeakerRate,
    onDocumentLocalAudioVoiceChange: handleStructuredTextDocumentLocalAudioVoiceChange,
    onSpeakerLocalAudioVoiceChange: handleStructuredTextSpeakerLocalAudioVoiceChange,
    generationPreferences: structuredTextDownloadResolutionPreferences,
    edgeGenerationVoices: initialEdgeVoices,
    onGenerationPreferencesChange: handleStructuredTextAudioGenerationPreferenceChange,
    onDocumentDownloadVoiceChange: handleStructuredTextDocumentDownloadVoiceChange,
    onDocumentDownloadModeChange: handleStructuredTextDocumentDownloadModeChange,
    playbackOrder: structuredTextAudioPlaybackOrder,
    onDocumentPlaybackOrderChange: handleStructuredTextDocumentPlaybackOrderChange,
    onDocumentTtsOnlyChange: handleStructuredTextDocumentTtsOnlyChange,
    onCardPlaybackOrderChange: handleStructuredTextCardPlaybackOrderChange,
    onSpeakerDownloadVoiceChange: handleStructuredTextSpeakerDownloadVoiceChange,
    edgeHealth: structuredTextEdgeHealth,
    onEdgeHealthCheck: handleStructuredTextEdgeHealthCheck,
    audioLibrary: structuredTextAudioLibraryControls,
    playbackSourceStatus: structuredTextPlaybackSourceStatus
  };

  const renderMobileTools = () => renderMobileToolsView({
    sidebarSection, renderControlSectionTabs, currentMapCount, mode, renderStatusBadge,
    tableAudioVoiceOptions, tableLocalAudioVoiceMode, setTableLocalAudioVoiceMode, tableAudioVoicePriority, moveTableLocalAudioVoicePriority,
    preferLocalAudio: activePreferLocalAudio, setPreferLocalAudio: handleActivePreferLocalAudioChange, isSystemBusy, voices, selectedVoice: activeBrowserTtsVoice,
    setSelectedVoice: handleActiveBrowserTtsVoiceChange, indonesianVoices, selectedIndonesianVoice: activeBrowserTtsIndonesianVoice,
    setSelectedIndonesianVoice: handleActiveBrowserTtsIndonesianVoiceChange, rate: activeBrowserTtsRate,
    setRate: (value) => handleActiveBrowserTtsRateChange(value, 'text'), meaningRate: activeBrowserTtsMeaningRate, setMeaningRate: (value) => handleActiveBrowserTtsRateChange(value, 'meaning'), ratesLinked: activeBrowserTtsRatesLinked, setRatesLinked: handleActiveBrowserTtsRatesLinkedChange, showIndonesianBrowserVoice: (mode === 'table' || structuredTextModeActive),
    structuredTextModeActive, textStructuredPreferences, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, handleStructuredTextDocumentVoiceChange, handleStructuredTextSpeakerVoiceChange, handleStructuredTextDisplayModeChange, handleStructuredTextPlaybackChannelModeChange, handleStructuredTextPlaybackRepresentationModeChange, handleStructuredTextPlaybackFeelChange,
    renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode, memorySettings,
    setMemorySettings, advancedDatasetStats, isMultiSourceMode, dirtySourceKeys, isCsvDirty,
    openFullPackPicker, sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker,
    removeSourceLayer, saveUpdatedSource, exportMergedDataset, savedDecks, selectedDeckId,
    handleLoadDeck, currentDeckName, setCurrentDeckName, handleSaveDeck, handleDeleteDeckInit,
    csvInputRef, openManualAdd, playlist, tableViewMode, exportTableCSV,
    setIsClearDialogOpen, csvChangeSummary, setIsChangeReviewOpen, undoStack, undoLastDataChange,
    saveUpdatedCSV, generatorEngine,
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
    structuredTextAudioSidebarControls,
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
        playingScope={playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT ? playbackContextRef.current?.scope || null : null}
        playingIndex={playingIndex}
        displayMode={textStructuredPreferences.displayMode}
        playbackChannelMode={textStructuredPreferences.playbackChannelMode}
        playbackRepresentationMode={textStructuredPreferences.playbackRepresentationMode}
        playbackPreferences={textStructuredPreferences}
        onDisplayModeChange={handleStructuredTextDisplayModeChange}
        onPlaybackChannelModeChange={handleStructuredTextPlaybackChannelModeChange}
        onPlaybackRepresentationModeChange={handleStructuredTextPlaybackRepresentationModeChange}
        onPlaybackFeelChange={handleStructuredTextPlaybackFeelChange}
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
        onDocumentVoiceChange={handleStructuredTextDocumentVoiceChange}
        onDocumentDownloadVoiceChange={handleStructuredTextDocumentDownloadVoiceChange}
        onDocumentDownloadModeChange={handleStructuredTextDocumentDownloadModeChange}
        playbackOrder={structuredTextAudioPlaybackOrder}
        availableLocalVoices={structuredTextAvailableLocalVoices}
        onDocumentPlaybackOrderChange={handleStructuredTextDocumentPlaybackOrderChange}
        onDocumentTtsOnlyChange={handleStructuredTextDocumentTtsOnlyChange}
        onCardPlaybackOrderChange={handleStructuredTextCardPlaybackOrderChange}
        onSpeakerVoiceChange={handleStructuredTextSpeakerVoiceChange}
        onSpeakerDownloadVoiceChange={handleStructuredTextSpeakerDownloadVoiceChange}
        onCardVoiceChange={handleStructuredTextCardVoiceChange}
        onSegmentVoiceChange={handleStructuredTextSegmentVoiceChange}
        onCardDownloadVoiceChange={handleStructuredTextCardDownloadVoiceChange}
        onCardDownloadModeChange={handleStructuredTextCardDownloadModeChange}
        onSegmentDownloadVoiceChange={handleStructuredTextSegmentDownloadVoiceChange}
        onSegmentDownloadModeChange={handleStructuredTextSegmentDownloadModeChange}
        onPreviewTts={handleStructuredTextPreviewTts}
        generationPreferences={structuredTextDownloadResolutionPreferences}
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
        onExportSegmentAudio={handleStructuredTextExportAudioMp3}
        onExportCardZip={handleStructuredTextExportCardZip}
        onExportFullCardAudio={handleStructuredTextExportFullCardAudio}
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
    renderWorkspaceTabs, theme, setTheme, handleModeSwitch, sidebarSection, setSidebarSection,
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
    rate: activeBrowserTtsRate, setRate: (value) => handleActiveBrowserTtsRateChange(value, 'text'), meaningRate: activeBrowserTtsMeaningRate, setMeaningRate: (value) => handleActiveBrowserTtsRateChange(value, 'meaning'), ratesLinked: activeBrowserTtsRatesLinked, setRatesLinked: handleActiveBrowserTtsRatesLinkedChange,
    showIndonesianBrowserVoice: (mode === 'table' || structuredTextModeActive),
    textStructuredPreferences, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, handleStructuredTextDocumentVoiceChange, handleStructuredTextSpeakerVoiceChange, handleStructuredTextDisplayModeChange, handleStructuredTextPlaybackChannelModeChange, handleStructuredTextPlaybackRepresentationModeChange, handleStructuredTextPlaybackFeelChange,
    renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode,
    memorySettings, setMemorySettings, advancedDatasetStats, csvInputRef, handleCSVUpload,
    openManualAdd, playlist, tableViewMode, exportTableCSV, rangeInput, setRangeInput, handleRangeAdd, setIsClearDialogOpen,
    setIsChangeReviewOpen, undoStack, undoLastDataChange, isMultiSourceMode, textareaRef,
    isLocked, textContent, handleInputContentChange, handleInsertTab, setLockedStates,
    dirtySourceKeys, openFullPackPicker, sourceDiagnostics, sourceChangeSummaries, sourcePack,
    openSourcePicker, removeSourceLayer, saveUpdatedSource, exportMergedDataset, lastDraftAutoSaveAt,
    renderMobileTools, renderPlaylist, isPaused, isPlaying, playingIndex, speakingPart,
    activePlaybackList, handleSmartNav: handlePlayerSmartNav, handleGlobalPlay: handlePlayerGlobalPlay, forceStopAll, playbackMode,
    cyclePlaybackMode, setPlaybackMode, setShowAppBar, playingContext, structuredTextModeActive,
    onOpenTextPlayer: () => setTextPlayerWorkspaceOpen(true),
    isChangeReviewOpen,
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
    structuredTextAudioSidebarControls, structuredTextAudioLibraryControls, structuredTextAudioCoverageMap
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