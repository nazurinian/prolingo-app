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
import { applyEdgeVoiceCompatibilityResult, getEdgeVoiceDiagnostic, isEdgeVoiceUnavailable } from './constants/voiceConstants';
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
import { buildTableAudioBatchCoverage, resolveTableBatchUnavailableVoices, shouldDownloadTableCoverageSlot } from './domain/audio/audioDownloadCoverageDomain.js';
import { buildTableAudioGeneratedVariantInventory, buildTableAudioPresenceMap, buildTableAudioVoiceOptions, mergeTableAudioVariantInventories, reconcileTableAudioVoicePriority, resolveTableAudioPlaybackVariant, summarizeTableAudioVariantInventory, tableAudioVariantsFromRecords } from './domain/audio/tableAudioVariantInventoryDomain.js';
import { buildTableAudioStagingVariantInventory, filterTableAudioBatchSessionsForPlaylist, filterTableAudioStagingRecordsForPlaylist, filterTableAudioVariantInventoryForPlaylist, isSameLogicalAudioVoice, isTableAudioScopeMatch, resolveBatchSessionAvailability, resolveTableAudioBookId, summarizeAudioStagingRecords } from './domain/audio/audioStagingDomain.js';
import { clearTableAudioFolderRuntimeCache, executeAudioFolderSelectService, executeRememberedAudioFolderOpenService, executeRememberedAudioFolderRestoreService, forgetRememberedAudioFolderHandle, getTableAudioFolderVariantObjectUrl } from './services/audio/audioFolderLifecycleService';
import { clearTableAudioZipRuntimeCache, getTableAudioZipVariantObjectUrl, readTableAudioZipVariantBlob, scanTableAudioZipFiles } from './services/audio/tableAudioZipArchiveService.js';
import { executeAudioSourcePlaybackService, executeBrowserTtsPlaybackService, isBrowserTtsSpeechSupported } from './services/audio/audioPlaybackSideEffectService';
import { executeBrowserTtsVoiceLifecycleEffect, executeSilentAudioAnchorEffect } from './services/audio/audioRuntimeLifecycleService';
import { executeGlobalPlaybackSessionService } from './services/playback/globalPlaybackSessionService';
import { executeMediaSessionLifecycleService } from './services/playback/mediaSessionLifecycleService';
import { executeForceStopPlaybackService, executeGlobalPlayInteraction, executeIndependentPlaybackInteraction, executeManualRowPlaybackInteraction, executeSmartPlaybackNavigation } from './services/playback/playbackInteractionService';
import { executeMobileTabSwitch, executeModeSwitch, executeTableViewTabSwitch } from './services/navigation/viewNavigationService';
import { buildLegacyTextAudioDatasetSignature, getBatchScopeKey, isBatchPopupAllowed, isLegacyAudioFolderSupported, isLegacyTextMode, isMatchingAudioFolderScope, resolveGuardedBatchOpenValue, shouldClearLegacyTextAudioOnDocumentState } from './domain/view/dataSystemBoundaryDomain';
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
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT, TEXT_STRUCTURED_PLAYBACK_SCOPES, resolveScopedStructuredTextPlaybackSourceStatus, resolveStructuredTextNavigationTarget, resolveStructuredTextSmartNavigationContext, resolveStructuredTextPlaybackList } from './domain/text/textStructuredPlaybackDomain.js';
import { hasStructuredTextPlayableChannel, normalizeTextStructuredPreferences, resolveTextStructuredManualPlaybackProfile, resolveTextStructuredPlaybackRate, TEXT_STRUCTURED_AUDIO_SOURCE_MODES, TEXT_STRUCTURED_ORDER_MODES, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES, TEXT_STRUCTURED_RESUME_MODES } from './domain/text/textStructuredPlaybackPreferenceDomain.js';
import { resolveTextStructuredBrowserVoiceState, resolveTextStructuredVoicePreferencePatch } from './domain/text/textStructuredVoiceDomain.js';
import { buildTextStructuredRuntimeAudioKey, buildTextStructuredRuntimeAudioStatusMap, resolveTextStructuredRuntimeAudio } from './domain/text/textStructuredAudioRuntimeDomain.js';
import { summarizeTextStructuredAudioRuntimeInventory } from './domain/text/textStructuredAudioInventoryDomain.js';
import { buildTextStructuredAudioCoverageMap, summarizeTextStructuredAudioCoverage, shouldDownloadTextStructuredCoverageSlot } from './domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata, getTextStructuredTreeFollowPlayerUsage, getTextStructuredTreesFollowPlayerUsage, resolveTextStructuredEffectiveDownloadVoice } from './domain/text/textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredAudioPlaybackOrderMetadata, buildTextStructuredGlobalAudioPlaybackOrderPreference, getTextStructuredGlobalAudioPlaybackOrder, resolveTextStructuredEffectivePlaybackOrder, resolveTextStructuredEffectiveTtsOnly } from './domain/text/textStructuredAudioPlaybackOrderDomain.js';
import { buildTextStructuredGeneratedFilename, buildTextStructuredGenerationJobs, normalizeTextStructuredAudioGenerationPreferences, resolveTextStructuredGenerationVoiceState } from './domain/text/textStructuredAudioGenerationDomain.js';
import { getTextStructuredSpeakerAssignedVoiceName, getTextStructuredSpeakerVoiceMap } from './domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { buildTextStructuredSpeakerVoiceProfileV2Metadata, collectTextStructuredConversationSpeakerIdentities } from './domain/text/textStructuredSpeakerIdentityDomain.js';
import { buildTextStructuredAudioContentFingerprint } from './domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredAudioRenderFingerprint, TEXT_AUDIO_CODEC_PROFILE, TEXT_AUDIO_RENDERER_PROFILE_VERSION } from './domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredAudioRequirementsForSnapshot } from './domain/text/textStructuredAudioRequirementDomain.js';
import { buildTextStructuredBatchWorkspaceSelection, normalizeTextStructuredBatchScope, resolveTextStructuredBatchTargetWorkspaceIds } from './domain/text/textStructuredBatchDomain.js';
import { buildTextStructuredBulkGenerationPlan, buildTextStructuredCardMissingFullRequirements, selectTextStructuredBulkGenerationRequirements, summarizeTextStructuredBulkPhysicalWork, TEXT_STRUCTURED_BULK_REPRESENTATIONS, TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS } from './domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredBulkExportPlan, TEXT_STRUCTURED_BULK_EXPORT_FORMATS } from './domain/text/textStructuredBulkExportDomain.js';
import { publishTextStructuredBatchTelemetry, publishTextStructuredBatchTelemetryThrottled, resetTextStructuredBatchTelemetry } from './services/audio/textStructuredBatchTelemetryService.js';
import { buildTextStructuredVoiceOverrideMetadata, resolveTextStructuredBrowserVoiceResolution } from './domain/text/textStructuredVoiceAssignmentDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata, getTextStructuredPlaybackRateProfile, resolveTextStructuredEffectivePlaybackRate } from './domain/text/textStructuredPlaybackRateProfileDomain.js';
import { buildTextStructuredLocalAudioProfileMetadata, collectTextStructuredAvailableLocalVoices, resolveTextStructuredEffectiveCustomLocalVoice } from './domain/text/textStructuredLocalAudioProfileDomain.js';
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
import { readTextLibrarySnapshot, syncLegacyTextProjectionToDatabase } from './services/persistence/textLibraryIndexedDbService.js';
import { APP_CHECKPOINT_ID, APP_VERSION } from './constants/appMetadata.js';
import { executeStructuredTextPlaybackSessionService } from './services/playback/textStructuredPlaybackSessionService.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from './services/playback/textStructuredAudioRuntimeService.js';
import {
  canExecuteTextStructuredReset,
  TEXT_STRUCTURED_RESET_SCOPES
} from './domain/text/textStructuredResetDomain.js';
import { executeTextStructuredPreferencePersistenceEffect, resetTextStructuredPreferences } from './services/persistence/textStructuredPreferenceService.js';
import { executeTextStructuredAudioGenerationPreferencePersistenceEffect, loadTextStructuredAudioGenerationPreferences, resetTextStructuredAudioGenerationPreferences } from './services/persistence/textStructuredAudioGenerationPreferenceService.js';
import { clearAudioDownloadHistoryForMode, clearPersistedAudioDownloadHistoryForMode, loadAudioDownloadHistory, persistAudioDownloadHistory, recordAudioDownloadHistory } from './services/persistence/audioDownloadHistoryService.js';
import { executeTextStructuredAudioGenerationRequest } from './services/audio/textStructuredAudioGenerationService.js';
import { buildCanonicalTextFullArtifactFilename } from './domain/text/textFilenameDomain.js';
import { buildProLingoTextAudioManifest, TEXT_AUDIO_MANIFEST_FILENAME } from './domain/text/textAudioManifestDomain.js';
import { buildTextAudioIndexCsv, TEXT_AUDIO_INDEX_FILENAME } from './domain/text/textAudioIndexDomain.js';
import { buildTextStructuredFullArtifactRecord, getTextStructuredFullAudioArtifacts } from './domain/text/textStructuredSplitFullDomain.js';
import { triggerBrowserZipDownload } from './services/audio/browserZipService.js';
import { exportStagedAudioZipGroups, exportTableAudioRecordZipGroups, DIRECT_MP3_BATCH_LIMIT } from './services/audio/audioBatchExportService.js';
import { clearAudioStagingExportHistoryForMode, clearAudioStagingForMode, clearAudioStagingRuntimeCacheForMode, deleteAudioBatchSession, getAudioStagingBlob, getAudioStagingObjectUrl, listAudioBatchSessions, listAudioStagingMetadata, markAudioStagingExported, putAudioStagingBlob, recoverInterruptedAudioBatchSessions, releaseAudioStagingBlobs, requestPersistentAudioStorage, saveAudioBatchSession } from './services/persistence/audioStagingIndexedDbService.js';
import { executeTextStructuredEdgeHealthCheck } from './services/audio/textStructuredEdgeAudioDownloadService.js';
import {
  executeStructuredTextBatchConsolidatedZipExport,
  executeStructuredTextBatchReadyMp3Export,
  executeStructuredTextCardZipExport,
  executeStructuredTextFullCardAudioExport,
  TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS
} from './services/audio/textStructuredCardExportService.js';
import { clearTextStructuredAudioFolderRuntimeCache, executeTextStructuredAudioFolderChoose, executeTextStructuredAudioFolderReconnect, executeTextStructuredAudioFolderRestore, getTextStructuredAudioFolderRuntimeObjectUrl, readTextStructuredAudioFolderFiles, readTextStructuredAudioFolderRuntimeBlob, scanTextStructuredAudioFolderFiles, writeTextStructuredAudioFile } from './services/audio/textStructuredAudioFolderService.js';
import { clearTextStructuredAudioZipRuntimeCache, getTextStructuredAudioZipRuntimeObjectUrl, readTextStructuredAudioZipRuntimeBlob } from './services/audio/textStructuredAudioZipArchiveService.js';
import {
  createTextStructuredAudioZipImportCoordinator,
  executeTextStructuredAudioZipImport,
  mergeTextLibraryZipMetadataCommitIntoSnapshot,
  rollbackCompletedTextStructuredAudioZipImport
} from './services/audio/textStructuredAudioZipImportService.js';
import { clearTextAudioStagingRuntimeCache, getTextAudioStagingBlob, getTextAudioStagingObjectUrl, listTextAudioStagingMetadata, putTextAudioStagingBlob, putTextFullAudioStagingBlob, reconcileTextAudioStagingRuntimeBindings, releaseTextAudioStaging, releaseTextAudioStagingRecords, TEXT_AUDIO_STAGING_ZIP_MAX_BYTES } from './services/persistence/textAudioStagingService.js';
import { executeTextAudioStagingGarbageCollection } from './services/persistence/textAudioStagingGcService.js';


const TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY = 'prolingo_table_local_audio_playback_v1';
const TEXT_BATCH_RUNTIME_FLUSH_INTERVAL = 256;
const TEXT_BATCH_STATUS_RENDER_INTERVAL = 10;
const EMPTY_STRUCTURED_MAP = Object.freeze({});
const EMPTY_STRUCTURED_LIST = Object.freeze([]);
const EMPTY_STRUCTURED_LOCAL_VOICES = Object.freeze({
  channels: Object.freeze({ text: EMPTY_STRUCTURED_LIST, meaning: EMPTY_STRUCTURED_LIST }),
  segments: EMPTY_STRUCTURED_MAP,
  speakerIds: EMPTY_STRUCTURED_MAP
});
const EMPTY_STRUCTURED_DOCUMENT_COVERAGE = Object.freeze({
  total: 0, ready: 0, downloaded: 0, metadataOnly: 0, legacyUnverified: 0,
  otherVoice: 0, otherProfile: 0, stale: 0, missing: 0, needDownload: 0, covered: 0
});

const resolveStructuredTextBatchTargetTreesList = ({ snapshot, targetIds, activeTree }) => {
  if (!snapshot || !Array.isArray(targetIds) || !targetIds.length) return EMPTY_STRUCTURED_LIST;
  if (activeTree && targetIds.length === 1 && targetIds[0] === activeTree.id) return [activeTree];
  return targetIds
    .map(documentId => (activeTree && documentId === activeTree.id ? activeTree : resolveTextLibraryDocumentTree(snapshot, documentId)))
    .filter(documentTree => documentTree?.editorModel === 'structured-v1');
};

const buildStructuredTextBatchScopeSelection = ({ targetTrees, activeDocumentId, scopeMode, cardId }) => ({
  documents: (Array.isArray(targetTrees) ? targetTrees : [])
    .filter(tree => Boolean(tree?.id))
    .map(tree => ({
      id: tree.id,
      title: tree.title || 'Text Workspace',
      scope: normalizeTextStructuredBatchScope({
        documentTree: tree,
        scope: tree.id === activeDocumentId && (scopeMode || 'workspace') === 'card'
          ? { cardId: cardId || null }
          : null
      })
    }))
});
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
  const selectedVoiceExplicitRef = useRef(false);
  const selectedIndonesianVoiceExplicitRef = useRef(false);
  // P4-A10: session-only URLs for structured Text audio. IndexedDB stores metadata only.
  const [structuredTextAudioRuntimeUrls, setStructuredTextAudioRuntimeUrls] = useState({});
  // beta.8/P3: Full Audio Artifacts are block-level derived binaries, not Segment AudioVariants.
  // Keep their session runtime handles separate so existing Split pruning cannot discard them.
  const [structuredTextFullAudioRuntimeUrls, setStructuredTextFullAudioRuntimeUrls] = useState({});
  const [structuredTextPlaybackSourceStatus, setStructuredTextPlaybackSourceStatus] = useState(null);
  const structuredTextAudioRuntimeUrlsRef = useRef({});
  const structuredTextFullAudioRuntimeUrlsRef = useRef({});
  // HF4-D: Text-only cursor and shuffled card order survive Stop, while
  // Table and other documents keep their independent navigation state.
  const structuredTextResumeCursorRef = useRef({ documentId: null, segmentId: null, orderedList: null });
  // Final Text C6: Text binary staging is separate from core Text DB and keeps Blob data out of React state.
  const [structuredTextAudioStagingSummary, setStructuredTextAudioStagingSummary] = useState({ count: 0, bytes: 0, voices: {} });
  const structuredTextAudioStagingSummaryRef = useRef({ count: 0, bytes: 0, voices: {} });
  const structuredTextAudioStagingRecordsRef = useRef(new Map());
  const structuredTextAudioPendingRuntimeRef = useRef(new Map());
  const structuredTextAudioPendingVariantRef = useRef(new Map());
  const structuredTextAudioPendingCountersRef = useRef(null);
  const structuredTextAudioStagingHydratedRef = useRef(false);
  const structuredTextAudioStagingHydrationTokenRef = useRef(0);
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
  const textLibrarySnapshotRef = useRef(textLibrarySnapshot);
  const [structuredTextZipImportBusy, setStructuredTextZipImportBusy] = useState(false);
  const structuredTextZipImportPendingCountRef = useRef(0);
  const structuredTextZipImportCoordinatorRef = useRef(null);
  if (!structuredTextZipImportCoordinatorRef.current) {
    structuredTextZipImportCoordinatorRef.current = createTextStructuredAudioZipImportCoordinator();
  }

  useEffect(() => {
    textLibrarySnapshotRef.current = textLibrarySnapshot;
  }, [textLibrarySnapshot]);

  useEffect(() => () => {
    structuredTextZipImportCoordinatorRef.current?.cancelActive('Structured Text unmounted during Portable ZIP import.');
  }, []);

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
    synth, selectedVoiceRef, selectedIndonesianVoiceRef, selectedVoiceExplicitRef,
    selectedIndonesianVoiceExplicitRef, setVoices, setSelectedVoice,
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

  const rehydrateStructuredTextAudioStagingRuntime = useCallback(async (
    snapshot,
    { resetExisting = false, markHydrated = true } = {}
  ) => {
    if (!Array.isArray(snapshot?.audioVariants) || !Array.isArray(snapshot?.blocks)) return null;
    const hydrationToken = ++structuredTextAudioStagingHydrationTokenRef.current;
    if (markHydrated) structuredTextAudioStagingHydratedRef.current = true;
    try {
      if (resetExisting) clearTextAudioStagingRuntimeCache();
      const rows = await listTextAudioStagingMetadata({ includeReleased: false });
      if (hydrationToken !== structuredTextAudioStagingHydrationTokenRef.current) return null;
      const plan = reconcileTextAudioStagingRuntimeBindings({
        snapshot,
        activeRecords: rows || [],
        prevRuntimeAudioUrls: structuredTextAudioRuntimeUrlsRef.current,
        prevRuntimeFullAudioUrls: structuredTextFullAudioRuntimeUrlsRef.current,
        resetExisting
      });
      structuredTextAudioStagingRecordsRef.current = plan.stagingRecordsMap;
      structuredTextAudioStagingSummaryRef.current = plan.stagingSummary;
      setStructuredTextAudioStagingSummary(plan.stagingSummary);
      structuredTextAudioRuntimeUrlsRef.current = plan.runtimeAudioUrls;
      structuredTextFullAudioRuntimeUrlsRef.current = plan.runtimeFullAudioUrls;
      setStructuredTextAudioRuntimeUrls(plan.runtimeAudioUrls);
      setStructuredTextFullAudioRuntimeUrls(plan.runtimeFullAudioUrls);
      (plan.revokedUrls || []).forEach(url => {
        try { URL.revokeObjectURL(url); } catch { /* noop */ }
      });
      return plan;
    } catch (error) {
      if (hydrationToken === structuredTextAudioStagingHydrationTokenRef.current) {
        structuredTextAudioStagingHydratedRef.current = false;
      }
      addLog('Warn', `Text Staging restore failed: ${error?.message || error}`);
      return null;
    }
  }, [addLog]);

  useEffect(() => {
    if (textDatabaseStatus !== 'ready' || structuredTextAudioStagingHydratedRef.current) return;
    if (!Array.isArray(textLibrarySnapshot?.audioVariants) || !Array.isArray(textLibrarySnapshot?.blocks)) return;
    rehydrateStructuredTextAudioStagingRuntime(textLibrarySnapshot, { resetExisting: false, markHydrated: true });
  }, [textDatabaseStatus, textLibrarySnapshot, rehydrateStructuredTextAudioStagingRuntime]);


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
  const legacyTextModeActive = isLegacyTextMode(mode, activeTextEditorModel);
  const legacyTextAudioCount = legacyTextModeActive ? Object.keys(localAudioMapText || {}).length : 0;
  const batchScopeKey = getBatchScopeKey({ mode, activeTextEditorModel, activeTextDocumentId });
  const [openBatchScopeKey, setOpenBatchScopeKey] = useState(null);
  const previousBatchScopeKeyRef = useRef(batchScopeKey);
  const canOpenBatchPopup = isBatchPopupAllowed({ mode, activeTextEditorModel });
  const effectiveIsBatchOpen = Boolean(isBatchOpen && canOpenBatchPopup && openBatchScopeKey === batchScopeKey);
  const latestAudioFolderScopeRef = useRef({
    mode,
    activeTextEditorModel,
    activeTextDocumentId,
    batchScopeKey,
    effectiveIsBatchOpen
  });
  useLayoutEffect(() => {
    latestAudioFolderScopeRef.current = {
      mode,
      activeTextEditorModel,
      activeTextDocumentId,
      batchScopeKey,
      effectiveIsBatchOpen
    };
  });
  useEffect(() => { if (!structuredTextModeActive) setTextPlayerWorkspaceOpen(false); }, [structuredTextModeActive]);
  useEffect(() => {
    if (previousBatchScopeKeyRef.current !== batchScopeKey) {
      previousBatchScopeKeyRef.current = batchScopeKey;
      setIsBatchOpen(false);
      setOpenBatchScopeKey(null);
    }
  }, [batchScopeKey, setIsBatchOpen]);
  const setBatchOpenGuarded = useCallback((nextValue) => {
    const currentScope = latestAudioFolderScopeRef.current;
    const resolved = resolveGuardedBatchOpenValue({
      nextValue,
      prevOpen: currentScope.effectiveIsBatchOpen,
      mode: currentScope.mode,
      activeTextEditorModel: currentScope.activeTextEditorModel
    });
    currentScope.effectiveIsBatchOpen = resolved;
    setOpenBatchScopeKey(resolved ? currentScope.batchScopeKey : null);
    setIsBatchOpen(resolved);
  }, [setIsBatchOpen]);
  useEffect(() => {
    setStructuredTextPlaybackSourceStatus(null);
  }, [activeTextDocumentTree?.id, mode, activeTextEditorModel]);
  useEffect(() => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1') {
      structuredTextZipImportCoordinatorRef.current?.cancelActive('Left structured Text mode during Portable ZIP import.');
    }
  }, [mode, activeTextEditorModel]);
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
  const structuredTextGlobalAudioPlaybackOrder = useMemo(
    () => getTextStructuredGlobalAudioPlaybackOrder(textStructuredPreferences),
    [textStructuredPreferences.globalAudioPlaybackOrderV1]
  );
  const structuredTextAudioPlaybackOrder = useMemo(() => ({
    ...structuredTextGlobalAudioPlaybackOrder,
    ttsOnly: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY
  }), [structuredTextGlobalAudioPlaybackOrder, textStructuredPreferences.audioSourceMode]);
  const structuredTextConversationSpeakers = useMemo(
    () => collectTextStructuredConversationSpeakerIdentities(activeTextDocumentTree),
    [activeTextDocumentTree]
  );
  const defaultStructuredTextVoiceId = textStructuredPreferences.browserTextVoiceName || selectedTextBrowserVoice?.name || null;
  const defaultStructuredMeaningVoiceId = textStructuredPreferences.browserMeaningVoiceName || selectedTextIndonesianVoice?.name || null;
  const structuredTextSingleEdgePreferences = useMemo(() => ({
    defaultsVersion: structuredTextAudioGenerationPreferences.defaultsVersion,
    engine: structuredTextAudioGenerationPreferences.engine,
    edgeTextVoiceId: structuredTextAudioGenerationPreferences.edgeTextVoiceId,
    edgeMeaningVoiceId: structuredTextAudioGenerationPreferences.edgeMeaningVoiceId,
    geminiVoiceName: structuredTextAudioGenerationPreferences.geminiVoiceName,
    edgeRate: structuredTextAudioGenerationPreferences.edgeRate,
    edgePitch: structuredTextAudioGenerationPreferences.edgePitch
  }), [
    structuredTextAudioGenerationPreferences.defaultsVersion,
    structuredTextAudioGenerationPreferences.engine,
    structuredTextAudioGenerationPreferences.edgeTextVoiceId,
    structuredTextAudioGenerationPreferences.edgeMeaningVoiceId,
    structuredTextAudioGenerationPreferences.geminiVoiceName,
    structuredTextAudioGenerationPreferences.edgeRate,
    structuredTextAudioGenerationPreferences.edgePitch
  ]);
  const activeTreeFollowPlayerUsage = useMemo(
    () => (structuredTextModeActive && activeTextDocumentTree
      ? getTextStructuredTreeFollowPlayerUsage(activeTextDocumentTree)
      : { text: false, meaning: false, any: false }),
    [structuredTextModeActive, activeTextDocumentTree]
  );
  const resolvedStructuredFollowTextVoiceId = activeTreeFollowPlayerUsage.text ? defaultStructuredTextVoiceId : null;
  const resolvedStructuredFollowMeaningVoiceId = activeTreeFollowPlayerUsage.meaning ? defaultStructuredMeaningVoiceId : null;
  const resolvedStructuredFollowEdgeVoices = activeTreeFollowPlayerUsage.any ? edgeVoices : null;
  const structuredTextDownloadResolutionPreferences = useMemo(() => ({
    ...structuredTextSingleEdgePreferences,
    playbackTextVoiceName: resolvedStructuredFollowTextVoiceId,
    playbackMeaningVoiceName: resolvedStructuredFollowMeaningVoiceId,
    edgeVoices: resolvedStructuredFollowEdgeVoices
  }), [
    structuredTextSingleEdgePreferences,
    resolvedStructuredFollowTextVoiceId,
    resolvedStructuredFollowMeaningVoiceId,
    resolvedStructuredFollowEdgeVoices
  ]);
  const structuredTextFullDownloadResolutionPreferencesRef = useRef(null);
  structuredTextFullDownloadResolutionPreferencesRef.current = {
    ...structuredTextSingleEdgePreferences,
    generateText: structuredTextAudioGenerationPreferences.generateText,
    generateMeaning: structuredTextAudioGenerationPreferences.generateMeaning,
    playbackTextVoiceName: defaultStructuredTextVoiceId,
    playbackMeaningVoiceName: defaultStructuredMeaningVoiceId,
    edgeVoices
  };
  const resolveStructuredTextChannelVoiceState = useCallback((item, channel, options = {}) => {
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const isMeaning = normalizedChannel === 'meaning';
    const defaultVoice = isMeaning ? selectedTextIndonesianVoice : selectedTextBrowserVoice;
    const configuredGlobalVoice = isMeaning
      ? textStructuredPreferences.browserMeaningVoiceName
      : textStructuredPreferences.browserTextVoiceName;
    const globalVoiceName = configuredGlobalVoice || defaultVoice?.name || null;
    const representationMode = options?.representationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
      || options?.representationMode === 'full'
      ? 'full'
      : 'split';
    const ignoreSegmentOverride = Boolean(options?.ignoreSegmentOverride) || representationMode === 'full';
    const syncVoice = item?.blockType === 'conversation'
      && structuredTextAudioSyncProfile.voice?.[normalizedChannel] === true
      && structuredTextConversationSpeakers.length > 0;
    const pool = Array.isArray(isMeaning ? indonesianVoices : voices)
      ? (isMeaning ? indonesianVoices : voices)
      : [];
    const targetBlock = options?.block
      || (activeTextDocumentTree?.blocks || []).find(candidate => candidate?.id === (item?.blockId || item?.textId))
      || null;
    const targetSegment = (Array.isArray(targetBlock?.segments) ? targetBlock.segments : [])
      .find(candidate => candidate?.id === (item?.segmentId || item?.id))
      || null;

    let resolved;
    if (syncVoice) {
      const firstSpeaker = structuredTextConversationSpeakers[0];
      const firstVoice = getTextStructuredSpeakerAssignedVoiceName({
        documentTree: activeTextDocumentTree,
        speaker: firstSpeaker.label,
        speakerId: firstSpeaker.id,
        channel: normalizedChannel
      });
      resolved = resolveTextStructuredBrowserVoiceResolution({
        documentTree: activeTextDocumentTree,
        block: targetBlock,
        segment: targetSegment,
        channel: normalizedChannel,
        globalVoiceName,
        defaultVoiceName: defaultVoice?.name || null,
        requestedVoiceName: firstVoice || null,
        requestedSource: firstVoice ? 'sync-speaker-1' : null,
        availableBrowserVoices: pool,
        ignoreSegmentOverride: true,
        representationMode
      });
    } else {
      resolved = resolveTextStructuredBrowserVoiceResolution({
        documentTree: activeTextDocumentTree,
        block: targetBlock,
        segment: targetSegment,
        channel: normalizedChannel,
        globalVoiceName,
        defaultVoiceName: defaultVoice?.name || null,
        availableBrowserVoices: pool,
        ignoreSegmentOverride,
        representationMode
      });
    }

    const effectiveVoice = resolved.effectiveVoiceName
      ? pool.find(voice => String(voice?.name || '').trim() === resolved.effectiveVoiceName) || null
      : null;
    return {
      requestedVoiceId: resolved.requestedVoiceName,
      requestedSource: resolved.requestedSource,
      requestedSourceLabel: resolved.requestedSourceLabel,
      effectiveVoiceName: effectiveVoice?.name || resolved.effectiveVoiceName || null,
      effectiveSource: resolved.effectiveSource,
      effectiveSourceLabel: resolved.effectiveSourceLabel,
      fallbackUsed: resolved.fallbackUsed,
      fallbackReason: resolved.fallbackReason,
      ttsVoice: effectiveVoice,
      mappedVoiceAvailable: resolved.requestedVoiceAvailable,
      assignmentSource: resolved.requestedSource,
      syncedToFirstSpeaker: syncVoice,
      ignoreSegmentOverride,
      representationMode
    };
  }, [activeTextDocumentTree, structuredTextAudioSyncProfile, structuredTextConversationSpeakers, selectedTextBrowserVoice, selectedTextIndonesianVoice, textStructuredPreferences.browserTextVoiceName, textStructuredPreferences.browserMeaningVoiceName, voices, indonesianVoices]);
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
  const structuredTextAudioRuntimeStatusMap = useMemo(() => (
    structuredTextModeActive && activeTextDocumentTree
      ? buildTextStructuredRuntimeAudioStatusMap({
          documentTree: activeTextDocumentTree,
          audioVariants: textLibrarySnapshot?.audioVariants || [],
          runtimeAudioUrls: structuredTextAudioRuntimeUrls,
          textVoiceId: defaultStructuredTextVoiceId,
          meaningVoiceId: defaultStructuredMeaningVoiceId,
          speakerVoiceMap: structuredTextSpeakerVoiceMap,
          preferredGeneratedEngine: 'edge',
          downloadPreferences: structuredTextDownloadResolutionPreferences,
          globalPlaybackOrder: structuredTextGlobalAudioPlaybackOrder
        })
      : EMPTY_STRUCTURED_MAP
  ), [structuredTextModeActive, activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, structuredTextSpeakerVoiceMap, structuredTextDownloadResolutionPreferences, structuredTextGlobalAudioPlaybackOrder]);
  const structuredTextAudioCoverageMap = useMemo(() => (
    structuredTextModeActive && activeTextDocumentTree
      ? buildTextStructuredAudioCoverageMap({
          documentTree: activeTextDocumentTree,
          audioVariants: textLibrarySnapshot?.audioVariants || [],
          runtimeAudioUrls: structuredTextAudioRuntimeUrls,
          preferences: structuredTextDownloadResolutionPreferences
        })
      : EMPTY_STRUCTURED_MAP
  ), [structuredTextModeActive, activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls, structuredTextDownloadResolutionPreferences]);
  const structuredTextAvailableLocalVoices = useMemo(() => (
    structuredTextModeActive && activeTextDocumentTree
      ? collectTextStructuredAvailableLocalVoices({
          documentTree: activeTextDocumentTree,
          audioVariants: textLibrarySnapshot?.audioVariants || [],
          runtimeAudioUrls: structuredTextAudioRuntimeUrls
        })
      : EMPTY_STRUCTURED_LOCAL_VOICES
  ), [structuredTextModeActive, activeTextDocumentTree, textLibrarySnapshot?.audioVariants, structuredTextAudioRuntimeUrls]);
  const structuredTextDocumentCoverage = useMemo(() => {
    if (!structuredTextModeActive || !activeTextDocumentTree) return EMPTY_STRUCTURED_DOCUMENT_COVERAGE;
    const channels = [];
    if (structuredTextAudioGenerationPreferences?.generateText !== false) channels.push('text');
    if (structuredTextAudioGenerationPreferences?.generateMeaning !== false) channels.push('meaning');
    return summarizeTextStructuredAudioCoverage({
      documentTree: activeTextDocumentTree,
      coverageMap: structuredTextAudioCoverageMap,
      channels
    });
  }, [structuredTextModeActive, activeTextDocumentTree, structuredTextAudioCoverageMap, structuredTextAudioGenerationPreferences?.generateText, structuredTextAudioGenerationPreferences?.generateMeaning]);
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

  const structuredTextBatchActive = Boolean(
    structuredTextModeActive && (
      effectiveIsBatchOpen
      || structuredTextAudioGenerationState.running
      || structuredTextPendingAutoExport
    )
  );

  const structuredTextBatchTargetDocumentIds = useMemo(() => (
    structuredTextModeActive
      ? resolveTextStructuredBatchTargetWorkspaceIds({
          workspaceOptions: structuredTextBatchDocumentOptions,
          activeWorkspaceId: activeTextDocumentTree?.id || null,
          activeCollectionId: activeTextDocumentTree?.collectionId || null,
          scope: structuredTextBatchScope
        })
      : EMPTY_STRUCTURED_LIST
  ), [structuredTextModeActive, structuredTextBatchScope, structuredTextBatchDocumentOptions, activeTextDocumentTree?.id, activeTextDocumentTree?.collectionId]);

  const structuredTextBatchTargetTrees = useMemo(() => (
    structuredTextBatchActive
      ? resolveStructuredTextBatchTargetTreesList({
          snapshot: textLibrarySnapshot,
          targetIds: structuredTextBatchTargetDocumentIds,
          activeTree: activeTextDocumentTree
        })
      : EMPTY_STRUCTURED_LIST
  ), [structuredTextBatchActive, textLibrarySnapshot, structuredTextBatchTargetDocumentIds, activeTextDocumentTree]);

  const structuredTextBatchTargetTreesFollowUsage = useMemo(() => (
    structuredTextBatchActive
      ? getTextStructuredTreesFollowPlayerUsage(structuredTextBatchTargetTrees)
      : { text: false, meaning: false, any: false }
  ), [structuredTextBatchActive, structuredTextBatchTargetTrees]);

  const resolvedBatchFollowTextVoiceId = structuredTextBatchTargetTreesFollowUsage.text ? defaultStructuredTextVoiceId : null;
  const resolvedBatchFollowMeaningVoiceId = structuredTextBatchTargetTreesFollowUsage.meaning ? defaultStructuredMeaningVoiceId : null;
  const resolvedBatchFollowEdgeVoices = structuredTextBatchTargetTreesFollowUsage.any ? edgeVoices : null;

  const structuredTextBatchResolutionPreferences = useMemo(() => ({
    ...structuredTextSingleEdgePreferences,
    playbackTextVoiceName: resolvedBatchFollowTextVoiceId,
    playbackMeaningVoiceName: resolvedBatchFollowMeaningVoiceId,
    edgeVoices: resolvedBatchFollowEdgeVoices
  }), [
    structuredTextSingleEdgePreferences,
    resolvedBatchFollowTextVoiceId,
    resolvedBatchFollowMeaningVoiceId,
    resolvedBatchFollowEdgeVoices
  ]);

  const structuredTextBatchCoverageMaps = useMemo(() => {
    if (!structuredTextBatchActive) return EMPTY_STRUCTURED_MAP;
    const maps = {};
    const audioVariants = textLibrarySnapshot?.audioVariants || [];
    structuredTextBatchTargetTrees.forEach(documentTree => {
      maps[documentTree.id] = documentTree === activeTextDocumentTree
        ? structuredTextAudioCoverageMap
        : buildTextStructuredAudioCoverageMap({
            documentTree,
            audioVariants,
            runtimeAudioUrls: structuredTextAudioRuntimeUrls,
            preferences: structuredTextBatchResolutionPreferences
          });
    });
    return maps;
  }, [
    structuredTextBatchActive,
    structuredTextBatchTargetTrees,
    activeTextDocumentTree,
    structuredTextAudioCoverageMap,
    textLibrarySnapshot?.audioVariants,
    structuredTextAudioRuntimeUrls,
    structuredTextBatchResolutionPreferences
  ]);

  const structuredTextBatchSelectionPreferences = useMemo(() => ({
    ...structuredTextBatchResolutionPreferences,
    generateText: structuredTextAudioGenerationPreferences.generateText,
    generateMeaning: structuredTextAudioGenerationPreferences.generateMeaning
  }), [
    structuredTextBatchResolutionPreferences,
    structuredTextAudioGenerationPreferences.generateText,
    structuredTextAudioGenerationPreferences.generateMeaning
  ]);

  const structuredTextBatchSelection = useMemo(() => (
    structuredTextBatchActive
      ? buildTextStructuredBatchWorkspaceSelection({
          documentTrees: structuredTextBatchTargetTrees,
          preferences: structuredTextBatchSelectionPreferences,
          coverageMapsByDocument: structuredTextBatchCoverageMaps,
          activeDocumentId: activeTextDocumentTree?.id || null,
          activeScope: (structuredTextBatchScope?.scopeMode || 'workspace') === 'card' ? { cardId: structuredTextBatchScope?.cardId || null } : null
        })
      : null
  ), [
    structuredTextBatchActive,
    structuredTextBatchTargetTrees,
    structuredTextBatchSelectionPreferences,
    structuredTextBatchCoverageMaps,
    activeTextDocumentTree?.id,
    structuredTextBatchScope?.scopeMode,
    structuredTextBatchScope?.cardId
  ]);

  const structuredTextBatchSelectionScope = useMemo(() => (
    structuredTextBatchActive
      ? buildStructuredTextBatchScopeSelection({
          targetTrees: structuredTextBatchTargetTrees,
          activeDocumentId: activeTextDocumentTree?.id || null,
          scopeMode: structuredTextBatchScope?.scopeMode,
          cardId: structuredTextBatchScope?.cardId
        })
      : null
  ), [
    structuredTextBatchActive,
    structuredTextBatchTargetTrees,
    activeTextDocumentTree?.id,
    structuredTextBatchScope?.scopeMode,
    structuredTextBatchScope?.cardId
  ]);

  const structuredTextBulkGenerationPreferences = useMemo(() => ({
    ...structuredTextSingleEdgePreferences,
    generateText: structuredTextAudioGenerationPreferences.generateText,
    generateMeaning: structuredTextAudioGenerationPreferences.generateMeaning,
    bulkTextVoiceIds: structuredTextAudioGenerationPreferences.bulkTextVoiceIds,
    bulkMeaningVoiceIds: structuredTextAudioGenerationPreferences.bulkMeaningVoiceIds,
    bulkGenerateSplit: structuredTextAudioGenerationPreferences.bulkGenerateSplit,
    bulkGenerateFull: structuredTextAudioGenerationPreferences.bulkGenerateFull,
    edgeVoices
  }), [
    structuredTextSingleEdgePreferences,
    structuredTextAudioGenerationPreferences.generateText,
    structuredTextAudioGenerationPreferences.generateMeaning,
    structuredTextAudioGenerationPreferences.bulkTextVoiceIds,
    structuredTextAudioGenerationPreferences.bulkMeaningVoiceIds,
    structuredTextAudioGenerationPreferences.bulkGenerateSplit,
    structuredTextAudioGenerationPreferences.bulkGenerateFull,
    edgeVoices
  ]);

  // beta.8/P5: Bulk generation has its own explicit voice + Split/Full selection.
  // It consumes the already-resolved scope but never mutates playback priority.
  const structuredTextBulkGenerationPlan = useMemo(() => (
    structuredTextBatchActive
      ? buildTextStructuredBulkGenerationPlan({
          documentTrees: structuredTextBatchTargetTrees,
          selection: structuredTextBatchSelectionScope,
          preferences: structuredTextBulkGenerationPreferences,
          audioVariants: textLibrarySnapshot?.audioVariants || [],
          runtimeAudioUrls: structuredTextAudioRuntimeUrls,
          runtimeFullAudio: structuredTextFullAudioRuntimeUrls,
          stagingRecords: [...structuredTextAudioStagingRecordsRef.current.values()]
        })
      : null
  ), [
    structuredTextBatchActive,
    structuredTextBatchTargetTrees,
    structuredTextBatchSelectionScope,
    structuredTextBulkGenerationPreferences,
    textLibrarySnapshot?.audioVariants,
    structuredTextAudioRuntimeUrls,
    structuredTextFullAudioRuntimeUrls,
    structuredTextAudioStagingSummary
  ]);

  const structuredTextBulkExportPreferences = useMemo(() => ({
    ...structuredTextSingleEdgePreferences,
    generateText: structuredTextAudioGenerationPreferences.generateText,
    generateMeaning: structuredTextAudioGenerationPreferences.generateMeaning,
    bulkTextVoiceIds: structuredTextAudioGenerationPreferences.bulkTextVoiceIds,
    bulkMeaningVoiceIds: structuredTextAudioGenerationPreferences.bulkMeaningVoiceIds,
    bulkExportVoicePolicy: structuredTextAudioGenerationPreferences.bulkExportVoicePolicy,
    bulkExportTextVoiceId: structuredTextAudioGenerationPreferences.bulkExportTextVoiceId,
    bulkExportMeaningVoiceId: structuredTextAudioGenerationPreferences.bulkExportMeaningVoiceId,
    bulkExportRepresentation: structuredTextAudioGenerationPreferences.bulkExportRepresentation
  }), [
    structuredTextSingleEdgePreferences,
    structuredTextAudioGenerationPreferences.generateText,
    structuredTextAudioGenerationPreferences.generateMeaning,
    structuredTextAudioGenerationPreferences.bulkTextVoiceIds,
    structuredTextAudioGenerationPreferences.bulkMeaningVoiceIds,
    structuredTextAudioGenerationPreferences.bulkExportVoicePolicy,
    structuredTextAudioGenerationPreferences.bulkExportTextVoiceId,
    structuredTextAudioGenerationPreferences.bulkExportMeaningVoiceId,
    structuredTextAudioGenerationPreferences.bulkExportRepresentation
  ]);

  const structuredTextBulkExportGlobalPlaybackOrder = structuredTextBulkExportPreferences.bulkExportVoicePolicy === 'preferred'
    ? structuredTextGlobalAudioPlaybackOrder
    : null;

  // beta.8/P6: export is planned independently from generation order and playback
  // priority, but consumes the same resolved Paragraph scope and canonical Staging.
  const structuredTextBulkExportPlan = useMemo(() => (
    structuredTextBatchActive
      ? buildTextStructuredBulkExportPlan({
          documentTrees: structuredTextBatchTargetTrees,
          selection: structuredTextBatchSelectionScope,
          preferences: structuredTextBulkExportPreferences,
          audioVariants: textLibrarySnapshot?.audioVariants || [],
          stagingRecords: [...structuredTextAudioStagingRecordsRef.current.values()],
          globalPlaybackOrder: structuredTextBulkExportGlobalPlaybackOrder
        })
      : null
  ), [
    structuredTextBatchActive,
    structuredTextBatchTargetTrees,
    structuredTextBatchSelectionScope,
    structuredTextBulkExportPreferences,
    textLibrarySnapshot?.audioVariants,
    structuredTextAudioStagingSummary,
    structuredTextBulkExportGlobalPlaybackOrder
  ]);

  const resolveLiveStructuredTextBatchContext = useCallback(() => {
    if (structuredTextBatchActive && structuredTextBatchSelection) {
      return {
        targetTrees: structuredTextBatchTargetTrees,
        selection: structuredTextBatchSelection,
        getBulkGenerationPlan: () => structuredTextBulkGenerationPlan,
        getBulkExportPlan: () => structuredTextBulkExportPlan
      };
    }
    const targetTrees = resolveStructuredTextBatchTargetTreesList({
      snapshot: textLibrarySnapshot,
      targetIds: structuredTextBatchTargetDocumentIds,
      activeTree: activeTextDocumentTree
    });
    const fullPrefs = structuredTextFullDownloadResolutionPreferencesRef.current;
    const audioVariants = textLibrarySnapshot?.audioVariants || [];
    const coverageMaps = {};
    targetTrees.forEach(documentTree => {
      coverageMaps[documentTree.id] = (structuredTextModeActive && documentTree === activeTextDocumentTree)
        ? structuredTextAudioCoverageMap
        : buildTextStructuredAudioCoverageMap({
            documentTree,
            audioVariants,
            runtimeAudioUrls: structuredTextAudioRuntimeUrls,
            preferences: fullPrefs
          });
    });
    const scopeSelection = buildStructuredTextBatchScopeSelection({
      targetTrees,
      activeDocumentId: activeTextDocumentTree?.id || null,
      scopeMode: structuredTextBatchScope?.scopeMode,
      cardId: structuredTextBatchScope?.cardId
    });
    const selection = buildTextStructuredBatchWorkspaceSelection({
      documentTrees: targetTrees,
      preferences: fullPrefs,
      coverageMapsByDocument: coverageMaps,
      activeDocumentId: activeTextDocumentTree?.id || null,
      activeScope: (structuredTextBatchScope?.scopeMode || 'workspace') === 'card' ? { cardId: structuredTextBatchScope?.cardId || null } : null
    });
    let cachedGenPlan = null;
    let cachedExportPlan = null;
    return {
      targetTrees,
      selection,
      getBulkGenerationPlan: () => {
        if (!cachedGenPlan) {
          cachedGenPlan = buildTextStructuredBulkGenerationPlan({
            documentTrees: targetTrees,
            selection: scopeSelection,
            preferences: structuredTextBulkGenerationPreferences,
            audioVariants,
            runtimeAudioUrls: structuredTextAudioRuntimeUrls,
            runtimeFullAudio: structuredTextFullAudioRuntimeUrls,
            stagingRecords: [...structuredTextAudioStagingRecordsRef.current.values()]
          });
        }
        return cachedGenPlan;
      },
      getBulkExportPlan: () => {
        if (!cachedExportPlan) {
          cachedExportPlan = buildTextStructuredBulkExportPlan({
            documentTrees: targetTrees,
            selection: scopeSelection,
            preferences: structuredTextBulkExportPreferences,
            audioVariants,
            stagingRecords: [...structuredTextAudioStagingRecordsRef.current.values()],
            globalPlaybackOrder: structuredTextBulkExportGlobalPlaybackOrder
          });
        }
        return cachedExportPlan;
      }
    };
  }, [
    structuredTextBatchActive,
    structuredTextBatchTargetTrees,
    structuredTextBatchSelection,
    structuredTextBulkGenerationPlan,
    structuredTextBulkExportPlan,
    textLibrarySnapshot,
    structuredTextBatchTargetDocumentIds,
    activeTextDocumentTree,
    structuredTextModeActive,
    structuredTextAudioCoverageMap,
    structuredTextAudioRuntimeUrls,
    structuredTextFullAudioRuntimeUrls,
    structuredTextBatchScope?.scopeMode,
    structuredTextBatchScope?.cardId,
    structuredTextBulkGenerationPreferences,
    structuredTextBulkExportPreferences,
    structuredTextBulkExportGlobalPlaybackOrder
  ]);
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
    edgeVoices
  }), [tableAudioVariantInventory, edgeVoices]);
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
  const handleStructuredTextGlobalBrowserTtsVoiceChange = useCallback((voiceOrName, channel = 'text') => {
    const voiceInput = typeof voiceOrName === 'string' ? { name: voiceOrName } : voiceOrName;
    const patch = resolveTextStructuredVoicePreferencePatch({ channel, voice: voiceInput });
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, ...patch }));
  }, [setTextStructuredPreferences]);
  const handleActiveBrowserTtsVoiceChange = (voice) => {
    if (structuredTextModeActive) {
      handleStructuredTextGlobalBrowserTtsVoiceChange(voice, 'text');
      return;
    }
    selectedVoiceExplicitRef.current = true;
    setSelectedVoice(voice);
  };
  const handleActiveBrowserTtsIndonesianVoiceChange = (voice) => {
    if (structuredTextModeActive) {
      handleStructuredTextGlobalBrowserTtsVoiceChange(voice, 'meaning');
      return;
    }
    selectedIndonesianVoiceExplicitRef.current = true;
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
  const handleStructuredTextPlaybackRepresentationModeChange = (playbackRepresentationMode) => {
    forceStopAll();
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({ ...prev, playbackRepresentationMode }));
  };
  const handleStructuredTextPlaybackFeelChange = useCallback((patch) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'playbackOrderMode')
      && patch.playbackOrderMode !== TEXT_STRUCTURED_ORDER_MODES.SHUFFLE
      && structuredTextResumeCursorRef.current?.orderedList) {
      structuredTextResumeCursorRef.current = {
        ...structuredTextResumeCursorRef.current,
        orderedList: null
      };
    }
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

  const forceStopAll = () => {
    executeForceStopPlaybackService({
      playbackSessionRef, stopSignalRef, pauseStateRef, currentAudioObjRef, synth,
      settlePlaybackPromise, currentUtteranceRef, silentAudioRef, setIsPlaying,
      setIsPaused, setSpeakingPart, setIndependentPlayingId, playbackContextRef
    });
    setStructuredTextPlaybackSourceStatus(null);
  };

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
      preferences: structuredTextFullDownloadResolutionPreferencesRef.current
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
  }, [textLibrarySnapshot, materializeStructuredTextExternalRfRequirementsBulk, queueStructuredTextRuntimeEntry, addLog]);

  const applyStructuredTextAudioFolderFiles = useCallback(async (files, folderName = null, snapshotOverride = null) => {
    const sourceSnapshot = snapshotOverride || textLibrarySnapshot;
    const requirements = buildTextStructuredAudioRequirementsForSnapshot({
      snapshot: sourceSnapshot,
      preferences: structuredTextFullDownloadResolutionPreferencesRef.current
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
  }, [textLibrarySnapshot, materializeStructuredTextExternalRfRequirementsBulk, addLog]);

  const handleStructuredTextAddAudioZipFiles = useCallback(async (files, snapshotOverride = null) => {
    const coordinator = structuredTextZipImportCoordinatorRef.current;
    const expectedMode = latestAudioFolderScopeRef.current?.mode || mode;
    const expectedEditorModel = latestAudioFolderScopeRef.current?.activeTextEditorModel || activeTextEditorModel;
    const expectedDocumentId = snapshotOverride
      ? (snapshotOverride.activeDocumentId || null)
      : (latestAudioFolderScopeRef.current?.activeTextDocumentId || activeTextDocumentId || null);

    structuredTextZipImportPendingCountRef.current += 1;
    setStructuredTextZipImportBusy(true);
    try {
      return await coordinator.runExclusive({
      getContextVersion: () => {
        if (snapshotOverride) return `override:${snapshotOverride.activeDocumentId || ''}`;
        const scope = latestAudioFolderScopeRef.current;
        return `${scope?.mode || 'table'}:${scope?.activeTextEditorModel || 'legacy'}:${scope?.activeTextDocumentId || ''}`;
      },
      run: async ({ signal, isStaleContext }) => {
        const liveSnapshot = snapshotOverride ? null : await readTextLibrarySnapshot().catch(() => null);
        const sourceSnapshot = snapshotOverride || liveSnapshot || textLibrarySnapshotRef.current || textLibrarySnapshot;
        let imported;
        try {
          imported = await executeTextStructuredAudioZipImport({
            files,
            snapshot: sourceSnapshot,
            preferences: structuredTextFullDownloadResolutionPreferencesRef.current,
            signal
          });
        } catch (error) {
          const recovery = error?.zipImportRecovery || null;
          if (recovery?.cleanRollback === false) {
            const failures = [
              recovery.metadataRollback === 'failed' ? `Text Library metadata rollback failed (${recovery.metadataRollbackError || 'unknown'})` : null,
              recovery.stagingRollback === 'failed' ? `Audio Staging rollback failed (${recovery.stagingRollbackError || 'unknown'})` : null
            ].filter(Boolean).join('; ');
            addLog('Error', `Portable ZIP import failed with incomplete rollback (${failures || 'check storage'}): ${error?.message || error}`);
          } else if (error?.name === 'AbortError' || recovery?.aborted) {
            addLog('Warn', `Portable ZIP import cancelled and rolled back cleanly: ${error?.message || 'aborted'}`);
          } else {
            addLog('Warn', `Portable ZIP import failed and rolled back cleanly: ${error?.message || error}`);
          }
          throw error;
        }
        if (imported?.status === 'no-files') return { status: 'no-files' };

        const scope = latestAudioFolderScopeRef.current;
        const contextChangedAfterReturn = !snapshotOverride && (
          scope?.mode !== expectedMode
          || scope?.activeTextEditorModel !== expectedEditorModel
          || (scope?.activeTextDocumentId || null) !== (expectedDocumentId || null)
        );
        if (isStaleContext() || contextChangedAfterReturn) {
          const recovery = await rollbackCompletedTextStructuredAudioZipImport(imported);
          const cancelError = new Error('Portable ZIP import cancelled due to workspace or mode change.');
          cancelError.name = 'AbortError';
          cancelError.zipImportRecovery = recovery;
          if (recovery.cleanRollback === false) {
            addLog('Error', 'Portable ZIP import interrupted by workspace switch with incomplete rollback; retry or reload recommended.');
          } else {
            addLog('Warn', 'Portable ZIP import cancelled on workspace switch and rolled back cleanly.');
          }
          throw cancelError;
        }

        const {
          scan,
          boundMatches,
          fullLogical,
          splitGroups,
          fullGroups,
          stagedSplitByRf,
          stagedFullByFingerprint,
          stagedSplitRecords,
          stagedFullRecords,
          metadataCommit
        } = imported;

        if (metadataCommit?.audioVariants?.length || metadataCommit?.blocks?.length) {
          if (!snapshotOverride && (textLibrarySnapshotRef.current || sourceSnapshot)) {
            textLibrarySnapshotRef.current = mergeTextLibraryZipMetadataCommitIntoSnapshot(
              textLibrarySnapshotRef.current || sourceSnapshot,
              metadataCommit
            );
          }
          setTextLibrarySnapshot(previous => {
            const updatedSnapshot = mergeTextLibraryZipMetadataCommitIntoSnapshot(previous, metadataCommit);
            if (!snapshotOverride && updatedSnapshot) textLibrarySnapshotRef.current = updatedSnapshot;
            return updatedSnapshot;
          });
        }

        stagedSplitRecords.forEach(record => rememberStructuredTextStagingRecord(record, { deferUi: true }));
        stagedFullRecords.forEach(record => rememberStructuredTextStagingRecord(record, { deferUi: true }));

        if (stagedSplitByRf.size) {
          const staleUrls = [];
          Object.entries(structuredTextAudioRuntimeUrlsRef.current || {}).forEach(([id, entry]) => {
            if (!entry?.url) return;
            const matched = boundMatches.find(m => m.variant.id === id);
            if (!matched) return;
            const rf = String(matched.renderFingerprint || matched.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
            if (stagedSplitByRf.has(rf)) staleUrls.push(entry.url);
          });
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
          staleUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch { /* noop */ } });
        }

        if (stagedFullByFingerprint.size) {
          const staleFullUrls = [];
          Object.entries(structuredTextFullAudioRuntimeUrlsRef.current || {}).forEach(([fp, entry]) => {
            if (entry?.url && stagedFullByFingerprint.has(fp)) staleFullUrls.push(entry.url);
          });
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
          staleFullUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch { /* noop */ } });
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
        addLog('Text Audio', `Portable ZIP import: ${scan.archiveCount} archive(s) • Split ${boundMatches.length} logical / ${splitGroups.size} physical • Full ${fullLogical.length} logical / ${stagedFullByFingerprint.size} physical • ${scan.orphanCount} orphan. Imported audio now lives in Text Staging.`);
        return {
          status: 'added',
          ...scan,
          matches: boundMatches,
          fullMatches: fullLogical,
          matchedCount: boundMatches.length + fullLogical.length,
          stagedSplitPhysical: stagedSplitByRf.size,
          stagedFullPhysical: stagedFullByFingerprint.size
        };
      }
      });
    } finally {
      structuredTextZipImportPendingCountRef.current = Math.max(0, structuredTextZipImportPendingCountRef.current - 1);
      if (structuredTextZipImportPendingCountRef.current === 0 && !coordinator.isActive()) {
        setStructuredTextZipImportBusy(false);
      }
    }
  }, [mode, activeTextEditorModel, activeTextDocumentId, textLibrarySnapshot, rememberStructuredTextStagingRecord, flushStructuredTextStagingSummary, setTextLibrarySnapshot, addLog]);

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
      : resolveTextStructuredEffectiveDownloadVoice({ documentTree: jobDocumentTree, block, segment, channel, preferences: structuredTextFullDownloadResolutionPreferencesRef.current });
    const generationVoiceStateBase = {
      ...resolveTextStructuredGenerationVoiceState({
        channel,
        requestedDownloadVoiceId: resolvedDownloadVoice.voiceId,
        preferences: structuredTextAudioGenerationPreferences,
        edgeVoices
      }),
      assignmentSource: resolvedDownloadVoice.source
    };
    if (generationVoiceStateBase.engine === 'edge' && generationVoiceStateBase.unavailable) {
      const diagnostic = generationVoiceStateBase.diagnostic
        || getEdgeVoiceDiagnostic(generationVoiceStateBase.engineVoiceId, edgeVoices)
        || `Voice "${generationVoiceStateBase.engineVoiceId}" is unavailable in Edge TTS.`;
      if (!options.batch) addLog('Error', `Text Generate ${segmentId}/${channel}: ${diagnostic}`);
      return {
        status: 'error',
        unavailable: true,
        blocked: true,
        documentId: item.documentId,
        segmentId,
        channel,
        voiceId: generationVoiceStateBase.engineVoiceId,
        error: diagnostic
      };
    }
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
      if (generationVoiceState.engine === 'edge' && generationVoiceState.engineVoiceId) {
        setEdgeVoices(prev => (
          isEdgeVoiceUnavailable(generationVoiceState.engineVoiceId, prev)
            ? applyEdgeVoiceCompatibilityResult(prev, generationVoiceState.engineVoiceId, { available: true })
            : prev
        ));
      }
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
      if (
        generationVoiceState.engine === 'edge'
        && generationVoiceState.engineVoiceId
        && (error?.status === 422 || error?.code === 'EDGE_VOICE_UNSUPPORTED')
      ) {
        setEdgeVoices(prev => applyEdgeVoiceCompatibilityResult(prev, generationVoiceState.engineVoiceId, {
          available: false,
          diagnostic: error?.message || null
        }));
      }
      if (!options.batch) addLog('Error', `Text Generate ${segmentId}/${channel}: ${error?.message || error}`);
      return {
        status: 'error',
        documentId: item.documentId,
        segmentId,
        channel,
        httpStatus: error?.status ?? null,
        code: error?.code || null,
        error: error?.message || String(error)
      };
    } finally {
      if (structuredTextAudioGenerationAbortRef.current === controller) structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [textLibrarySnapshot, activeTextDocumentTree, structuredTextAudioGenerationPreferences, edgeVoices, setEdgeVoices, registerStructuredTextGeneratedBlob, queueStructuredTextRuntimeEntry, fanOutStructuredTextSharedRfLogicalSlots, setTextLibrarySnapshot, addLog]);

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
        edgeVoices
      }),
      assignmentSource: job?.downloadVoiceSource || 'bulk-selection'
    };
    if (generationVoiceStateBase.engine === 'edge' && generationVoiceStateBase.unavailable) {
      const diagnostic = generationVoiceStateBase.diagnostic
        || getEdgeVoiceDiagnostic(generationVoiceStateBase.engineVoiceId, edgeVoices)
        || `Voice "${generationVoiceStateBase.engineVoiceId}" is unavailable in Edge TTS.`;
      if (!options.batch) addLog('Error', `Text Full Generate ${blockId}/${channel}: ${diagnostic}`);
      return {
        status: 'error',
        representation: 'full',
        unavailable: true,
        blocked: true,
        documentId: jobDocumentTree?.id || documentId,
        blockId,
        channel,
        voiceId: generationVoiceStateBase.engineVoiceId,
        error: diagnostic
      };
    }
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
      if (generationVoiceStateBase.engine === 'edge' && generationVoiceStateBase.engineVoiceId) {
        setEdgeVoices(prev => (
          isEdgeVoiceUnavailable(generationVoiceStateBase.engineVoiceId, prev)
            ? applyEdgeVoiceCompatibilityResult(prev, generationVoiceStateBase.engineVoiceId, { available: true })
            : prev
        ));
      }
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
      if (
        generationVoiceStateBase.engine === 'edge'
        && generationVoiceStateBase.engineVoiceId
        && (error?.status === 422 || error?.code === 'EDGE_VOICE_UNSUPPORTED')
      ) {
        setEdgeVoices(prev => applyEdgeVoiceCompatibilityResult(prev, generationVoiceStateBase.engineVoiceId, {
          available: false,
          diagnostic: error?.message || null
        }));
      }
      return {
        status: 'error',
        representation: 'full',
        documentId,
        blockId,
        channel,
        voiceId: generationVoiceStateBase.engineVoiceId,
        httpStatus: error?.status ?? null,
        code: error?.code || null,
        error: error?.message || String(error)
      };
    } finally {
      if (structuredTextAudioGenerationAbortRef.current === controller) structuredTextAudioGenerationAbortRef.current = null;
    }
  }, [textLibrarySnapshot, activeTextDocumentTree, structuredTextAudioGenerationPreferences, edgeVoices, setEdgeVoices, setTextLibrarySnapshot, rememberStructuredTextStagingRecord, addLog]);

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
    const batchContext = resolveLiveStructuredTextBatchContext();
    if (structuredTextAudioGenerationState.running || !(batchContext.selection?.documentCount > 0)) return null;
    forceStopAll();
    const suppliedRequirements = Array.isArray(requirementsCandidate);
    const bulkGenerationPlan = suppliedRequirements ? null : batchContext.getBulkGenerationPlan();
    const allRequirements = suppliedRequirements
      ? requirementsCandidate
      : (bulkGenerationPlan?.requirements || []);
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
        : selectTextStructuredBulkGenerationRequirements(bulkGenerationPlan, { mode: selectionMode });

    const blockedBulkVoiceIds = [...new Set(
      requirements
        .map(req => {
          const targetVoiceId = req?.voiceId || req?.downloadVoiceId || resolveTextStructuredGenerationVoiceState({
            channel: req?.channel === 'meaning' ? 'meaning' : 'text',
            requestedDownloadVoiceId: req?.voiceId || req?.downloadVoiceId,
            preferences: structuredTextAudioGenerationPreferences,
            edgeVoices
          }).engineVoiceId;
          return isEdgeVoiceUnavailable(targetVoiceId, edgeVoices) ? targetVoiceId : null;
        })
        .filter(Boolean)
    )];
    if (blockedBulkVoiceIds.length > 0) {
      const diagnostic = blockedBulkVoiceIds
        .map(voiceId => `${voiceId} (${getEdgeVoiceDiagnostic(voiceId, edgeVoices) || 'Unavailable'})`)
        .join('; ');
      const message = `Bulk Audio blocked: unavailable Edge voice selected — ${diagnostic}. Remove or switch voice before generating.`;
      const blockedSessionId = `TEXT_BULK_P5_${Date.now()}`;
      addLog('Error', message);
      setStructuredTextAudioGenerationState({
        running: false, completed: 0, total: allRequirements.length, current: null, failedJobs: [], lastStatus: 'unavailable-voice',
        processed: 0, generated: 0, generatedPhysical: 0, reusedPhysical: 0, skippedReady: 0, skippedStale: 0, failed: 0, remaining: 0,
        readyEstimate: 0, missingEstimate: 0, staleEstimate: 0, sessionId: blockedSessionId,
        logicalRequirements: allRequirements.length, uniquePhysicalRequirements: 0,
        selectedLogicalRequirements: 0, selectedUniquePhysicalRequirements: 0, selectionMode
      });
      resetTextStructuredBatchTelemetry({
        sessionId: blockedSessionId, status: 'unavailable-voice', total: allRequirements.length, processed: 0, generated: 0, generatedPhysical: 0, reusedPhysical: 0,
        skippedReady: 0, skippedStale: 0, failed: 0, remaining: 0, readyEstimate: 0, missingEstimate: 0, staleEstimate: 0,
        logicalRequirements: allRequirements.length, uniquePhysicalRequirements: 0, selectedLogicalRequirements: 0,
        selectedUniquePhysicalRequirements: 0, selectionMode, reconciled: true
      });
      return { status: 'unavailable-voice', completed: 0, total: allRequirements.length, failedJobs: [], blockedVoices: blockedBulkVoiceIds, error: diagnostic };
    }

    const readRequirementStatus = item => item?.representation
      ? (item?.status || TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING)
      : (item?.coverage?.status || item?.coverageStatus || item?.status || TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING);
    const countStatus = status => allRequirements.filter(item => readRequirementStatus(item) === status).length;
    const readyBefore = countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY);
    const reusableBefore = countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE);
    const staleBefore = countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE);
    const missingBefore = suppliedRequirements && !suppliedP5Requirements
      ? Math.max(0, allRequirements.length - readyBefore - staleBefore)
      : (countStatus(TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING)
        + allRequirements.filter(item => !item?.representation && readRequirementStatus(item) === 'other-voice').length);
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
        const isCheckpoint = (requirementIndex + 1) % TEXT_BATCH_STATUS_RENDER_INTERVAL === 0
          || requirementIndex + 1 === requirements.length
          || Boolean(structuredTextAudioBatchStopRef.current);
        publishTextStructuredBatchTelemetryThrottled(telemetryPatch, {
          minIntervalMs: 80,
          force: requirementIndex === 0 || isCheckpoint
        });
        if (isCheckpoint) {
          flushStructuredTextStagingSummary();
          setStructuredTextAudioGenerationState(prev => ({
            ...prev,
            completed: processed, processed, generated: generatedPhysicalKeys.size, generatedPhysical: generatedPhysicalKeys.size,
            reusedPhysical: reusedPhysicalKeys.size, skippedReady, skippedStale, failed: failedJobs.length, remaining: telemetryPatch.remaining,
            readyEstimate, missingEstimate: telemetryPatch.missingEstimate, staleEstimate: telemetryPatch.staleEstimate, failedJobs: [...failedJobs]
          }));
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
  }, [structuredTextAudioGenerationState.running, resolveLiveStructuredTextBatchContext, structuredTextAudioGenerationPreferences, edgeVoices, forceStopAll, generateStructuredTextAudioJob, generateStructuredTextFullAudioJob, flushStructuredTextPendingRuntimeEntries, flushStructuredTextPendingAudioVariants, flushStructuredTextStagingSummary, addLog]);

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

  const resolveStructuredTextBlockChannelPlaybackPlan = ({ block, fullBlock = null, channel, allowFullArtifact = true, segmentIds = null } = {}) => {
    const targetBlock = fullBlock || block;
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const firstSegment = (block?.segments || []).find(segment => String(normalizedChannel === 'meaning' ? segment?.meaning : segment?.text || '').trim()) || block?.segments?.[0] || null;
    const generatedVoice = resolveTextStructuredEffectiveDownloadVoice({
      documentTree: activeTextDocumentTree,
      block: targetBlock,
      segment: firstSegment,
      channel: normalizedChannel,
      preferences: structuredTextDownloadResolutionPreferences
    });
    const customLocalVoiceId = textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL
      ? resolveTextStructuredEffectiveCustomLocalVoice({
          documentTree: activeTextDocumentTree,
          block: targetBlock,
          segment: firstSegment,
          channel: normalizedChannel,
          conversationSpeakers: structuredTextConversationSpeakers
        })
      : null;
    return buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree: activeTextDocumentTree,
      block: targetBlock,
      channel: normalizedChannel,
      segmentIds,
      representationMode: textStructuredPreferences.playbackRepresentationMode,
      audioVariants: textLibrarySnapshot?.audioVariants || [],
      runtimeAudioUrls: structuredTextAudioRuntimeUrls,
      runtimeFullAudio: structuredTextFullAudioRuntimeUrls,
      fallbackVoiceId: generatedVoice.voiceId,
      fallbackEngine: 'edge',
      fallbackRate: structuredTextAudioGenerationPreferences.edgeRate,
      fallbackPitch: structuredTextAudioGenerationPreferences.edgePitch,
      language: normalizedChannel === 'meaning' ? activeTextDocumentTree?.meaningLanguage : activeTextDocumentTree?.textLanguage,
      globalPlaybackOrder: structuredTextGlobalAudioPlaybackOrder,
      audioSourceMode: textStructuredPreferences.audioSourceMode,
      customLocalVoiceId,
      globalTtsOnly: textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY,
      allowFullArtifact
    });
  };

  const speakStructuredTextBrowserTts = ({
    textToRead,
    voiceState,
    channel,
    blockId = null,
    segmentId = null,
    representation = null,
    item = null,
    speaker = null,
    documentId = null,
    playbackSessionId = null
  }) => {
    const resolvedDocumentId = documentId || activeTextDocumentTree?.id || item?.documentId || null;
    const resolvedSessionId = playbackSessionId ?? playbackSessionRef.current;
    if (playbackSessionId !== null && playbackSessionId !== undefined && (stopSignalRef.current || playbackSessionRef.current !== playbackSessionId)) {
      return Promise.resolve();
    }
    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const targetVoice = voiceState?.ttsVoice || null;
    const targetVoiceId = voiceState?.requestedVoiceId || null;
    const speechSupported = isBrowserTtsSpeechSupported({ synth });
    const statusBase = {
      channel: normalizedChannel,
      ...(representation ? { representation } : {}),
      blockId,
      segmentId,
      requestedVoice: targetVoiceId || null,
      requestedSourceLabel: voiceState?.requestedSourceLabel || null,
      ...(representation !== 'full' ? { syncedToFirstSpeaker: Boolean(voiceState?.syncedToFirstSpeaker) } : {})
    };
    if (!speechSupported) {
      setStructuredTextPlaybackSourceStatus({
        documentId: resolvedDocumentId,
        sessionId: resolvedSessionId,
        ...statusBase,
        source: 'unavailable',
        mode: 'unavailable',
        origin: 'Browser TTS',
        voiceId: targetVoiceId || null,
        effectiveVoice: null,
        effectiveSourceLabel: 'Browser TTS unavailable',
        fallbackUsed: Boolean(voiceState?.fallbackUsed),
        fallbackReason: voiceState?.fallbackReason || 'Browser SpeechSynthesis API is not available on this device.',
        updatedAt: Date.now()
      });
      addLog('Warn', `${representation === 'full' ? 'Full Text' : 'Text Player'}: ${normalizedChannel === 'meaning' ? 'Meaning/ID' : 'Text/EN'} Browser TTS API is unavailable; skipped.`);
      return Promise.resolve();
    }
    const usingNativeDefault = !targetVoice;
    const fallbackUsed = Boolean(voiceState?.fallbackUsed || (usingNativeDefault && targetVoiceId));
    const effectiveVoiceName = targetVoice?.name || null;
    if (targetVoiceId && targetVoice?.name !== targetVoiceId && speaker) {
      addLog('Warn', `Text Player: speaker ${speaker} requested ${targetVoiceId}, unavailable in Browser TTS; using ${effectiveVoiceName || 'Browser system default'} fallback.`);
    }
    setStructuredTextPlaybackSourceStatus({
      documentId: resolvedDocumentId,
      sessionId: resolvedSessionId,
      ...statusBase,
      source: 'tts',
      mode: 'tts',
      origin: 'Browser TTS',
      voiceId: effectiveVoiceName,
      effectiveVoice: effectiveVoiceName,
      effectiveSourceLabel: usingNativeDefault ? 'Browser system default' : (voiceState?.effectiveSourceLabel || null),
      fallbackUsed,
      fallbackReason: voiceState?.fallbackReason || (usingNativeDefault && targetVoiceId
        ? `Requested browser voice "${targetVoiceId}" is unavailable on this device; using Browser system default.`
        : null),
      updatedAt: Date.now()
    });
    return executeBrowserTtsPlaybackService({
      textToRead: textToRead || '',
      overrideVoice: targetVoice,
      selectedVoiceRef: { current: targetVoice },
      stopSignalRef,
      pauseStateRef,
      synth,
      currentUtteranceRef,
      ttsReplayRef,
      playbackResolveRef,
      rateRef: null,
      rate: resolveStructuredTextItemPlaybackRate(item, normalizedChannel),
      pitch: 1
    });
  };

  const playStructuredTextFullStep = async (step, block, item) => {
    const normalizedChannel = step?.channel === 'meaning' ? 'meaning' : 'text';
    const playbackSessionId = playbackSessionRef.current;
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    const resolvedDocumentId = activeTextDocumentTree?.id || block?.documentId || item?.documentId || null;
    const firstSegmentItem = item || {
      documentId: resolvedDocumentId,
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
        const localVoiceId = runtimeFull?.profile?.voiceId || runtimeFull?.artifact?.descriptor?.voiceId || null;
        setStructuredTextPlaybackSourceStatus({
          documentId: resolvedDocumentId,
          sessionId: playbackSessionId,
          source: 'local',
          mode: 'local',
          origin,
          representation: 'full',
          channel: normalizedChannel,
          blockId: block?.id || null,
          segmentId: null,
          voiceId: localVoiceId,
          effectiveVoice: localVoiceId,
          effectiveSourceLabel: `Local MP3 (${origin})`,
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
    const voiceState = resolveStructuredTextChannelVoiceState(firstSegmentItem, normalizedChannel, {
      representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      ignoreSegmentOverride: true,
      block
    });
    return speakStructuredTextBrowserTts({
      textToRead: step?.content || '',
      voiceState,
      channel: normalizedChannel,
      blockId: block?.id || null,
      segmentId: null,
      representation: 'full',
      item: firstSegmentItem,
      documentId: resolvedDocumentId,
      playbackSessionId
    });
  };

  const playStructuredTextChannel = async (textToRead, item, channel, options = {}) => {
    const voiceState = resolveStructuredTextChannelVoiceState(item, channel, options);
    const targetVoiceId = voiceState.requestedVoiceId;
    const playbackSessionId = playbackSessionRef.current;
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    const block = options?.block || (activeTextDocumentTree?.blocks || []).find(candidate => candidate.id === item?.blockId) || null;
    const resolvedDocumentId = activeTextDocumentTree?.id || block?.documentId || item?.documentId || null;
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
        globalProfiles: structuredTextGlobalAudioPlaybackOrder?.channels?.[channel === 'meaning' ? 'meaning' : 'text'] || [],
        fallbackProfiles: [{
          engine: 'edge',
          voiceId: generatedVoice.voiceId,
          rate: structuredTextAudioGenerationPreferences.edgeRate,
          pitch: structuredTextAudioGenerationPreferences.edgePitch
        }]
      });
      const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
      const customLocalVoiceId = textStructuredPreferences.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL
        ? resolveTextStructuredEffectiveCustomLocalVoice({
            documentTree: activeTextDocumentTree,
            block,
            segment,
            channel: normalizedChannel,
            conversationSpeakers: structuredTextConversationSpeakers
          })
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
          const localVoiceId = runtimeAudio.variant?.voiceId || customLocalVoiceId || targetVoiceId || null;
          setStructuredTextPlaybackSourceStatus({
            documentId: resolvedDocumentId,
            sessionId: playbackSessionId,
            source: 'local',
            mode: 'local',
            origin: localOrigin,
            channel: normalizedChannel,
            blockId: block?.id || item?.blockId || null,
            segmentId: item?.segmentId || item?.id || null,
            voiceId: localVoiceId,
            effectiveVoice: localVoiceId,
            effectiveSourceLabel: `Local MP3 (${localOrigin})`,
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
    return speakStructuredTextBrowserTts({
      textToRead,
      voiceState,
      channel,
      blockId: block?.id || item?.blockId || null,
      segmentId: item?.segmentId || item?.id || null,
      item,
      speaker: item?.speaker || null,
      documentId: resolvedDocumentId,
      playbackSessionId
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
    repeatCount = null,
    orderedListOverride = null
  } = {}) => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1' || !activeTextDocumentTree) return false;
    setStructuredTextPlaybackSourceStatus(null);
    // Remember an explicit manual Card/Segment target before the 120ms async
    // transition. An immediate Stop must still resume at the chosen Card.
    const requestedSegmentId = cursorSegmentId || startSegmentId
      || (blockId ? activeTextDocumentTree.blocks?.find(block => block.id === blockId)?.segments?.[0]?.id : null);
    const isManualUnitScope = scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT
      || scope === TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD;
    const globalShuffleActive = textStructuredPreferences.playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE;
    const preservedManualShuffleList = isManualUnitScope
      && globalShuffleActive
      && structuredTextResumeCursorRef.current.documentId === activeTextDocumentTree.id
      && Array.isArray(structuredTextResumeCursorRef.current.orderedList)
      ? structuredTextResumeCursorRef.current.orderedList
      : null;
    if (requestedSegmentId) {
      structuredTextResumeCursorRef.current = {
        documentId: activeTextDocumentTree.id,
        segmentId: requestedSegmentId,
        orderedList: playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE && Array.isArray(orderedListOverride)
          ? [...orderedListOverride]
          : preservedManualShuffleList
      };
    }
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
      orderedListOverride,
      onPlaybackCursor: ({ documentId, segmentId, orderedList }) => {
        if (documentId !== activeTextDocumentTree?.id || !segmentId) return;
        const retainedManualShuffleList = isManualUnitScope
          && globalShuffleActive
          && structuredTextResumeCursorRef.current.documentId === documentId
          && Array.isArray(structuredTextResumeCursorRef.current.orderedList)
          ? structuredTextResumeCursorRef.current.orderedList
          : null;
        structuredTextResumeCursorRef.current = {
          documentId, segmentId,
          orderedList: playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE && Array.isArray(orderedList)
            ? [...orderedList]
            : retainedManualShuffleList
        };
      },
      onPlaybackCompleted: ({ documentId, segmentId }) => {
        if (documentId !== activeTextDocumentTree?.id) return;
        structuredTextResumeCursorRef.current = { documentId, segmentId, orderedList: null };
      },
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

  const handleStructuredTextPlayCard = (blockId, channelOverride = null) => {
    const manual = resolveTextStructuredManualPlaybackProfile(textStructuredPreferences, 'card');
    // Heading quick-play overrides EN/ID for this one session; never mutates saved preferences.
    const requestedChannel = channelOverride?.playbackChannelMode;
    const oneShotChannel = requestedChannel === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY
      || requestedChannel === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY
      ? requestedChannel : manual.playbackChannelMode;
    return startStructuredTextPlayback({
      blockId,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
      playbackChannelMode: oneShotChannel,
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
    const saved = structuredTextResumeCursorRef.current;
    const allowResumeCursor = textStructuredPreferences.resumeMode !== TEXT_STRUCTURED_RESUME_MODES.RESTART;
    const cursorId = allowResumeCursor && saved.documentId === activeTextDocumentId
      && structuredTextActivePlaybackList.some(item => item.id === saved.segmentId)
      ? saved.segmentId : null;
    const savedOrderedList = cursorId
      && textStructuredPreferences.playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SHUFFLE
      && Array.isArray(saved.orderedList)
      ? saved.orderedList : null;
    // DOCUMENT (rather than FROM_HERE) includes the complete current card in
    // Full mode and keeps the user free to navigate Prev back to earlier cards.
    startStructuredTextPlayback({
      cursorSegmentId: cursorId,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
      orderedListOverride: savedOrderedList
    });
  };

  const handlePlayerSmartNav = (direction) => {
    if (mode !== 'text' || activeTextEditorModel !== 'structured-v1') {
      handleSmartNav(direction);
      return;
    }
    if (!structuredTextActivePlaybackList.length) return;
    const session = playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      && playbackContextRef.current?.documentId === activeTextDocumentId
      ? playbackContextRef.current : null;
    // Freeze one Shuffle order for the whole navigation session when Shuffle is
    // active, and never inherit manual Segment/Card overrides or stale Shuffle
    // lists after switching back to Sequential.
    const nav = resolveStructuredTextSmartNavigationContext({
      completeList: structuredTextActivePlaybackList,
      activeDocumentId: activeTextDocumentId,
      session,
      savedResume: structuredTextResumeCursorRef.current,
      preferences: textStructuredPreferences
    });
    if (!nav) return;
    const target = resolveStructuredTextNavigationTarget({
      list: nav.ordered,
      currentId: nav.cursorId,
      direction,
      representationMode: nav.representationMode
    });
    if (!target) return;
    // Synchronous cursor update avoids two quick Next taps targeting the same
    // old card before React/async audio start has committed its state.
    structuredTextResumeCursorRef.current = {
      documentId: activeTextDocumentId,
      segmentId: target.id,
      orderedList: nav.persistedOrderedList ? [...nav.persistedOrderedList] : null
    };
    // Force an exact new cursor, so Full navigates by Card and Split by sentence.
    // A manual Card/Sentence play can also escape its previous restricted scope.
    startStructuredTextPlayback({
      cursorSegmentId: target.id,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
      orderedListOverride: nav.orderedListOverride ? [...nav.orderedListOverride] : null,
      playbackRepresentationMode: nav.representationMode,
      playbackOrderMode: nav.playbackOrderMode,
      playbackChannelMode: nav.playbackChannelMode,
      repeatMode: nav.repeatMode,
      repeatCount: nav.repeatCount
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
    structuredTextZipImportCoordinatorRef.current?.cancelActive('Workspace switched during Portable ZIP import.');
    setStructuredTextPlaybackSourceStatus(null);
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
      structuredTextAudioStagingHydratedRef.current = false;
      await runStructuredTextAudioStagingGc(result.snapshot, 'text-pack-sync');
      await rehydrateStructuredTextAudioStagingRuntime(result.snapshot, { resetExisting: false });
      await reconcileStructuredTextExternalAudioSources(result.snapshot);
    }
    return result;
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, runStructuredTextAudioStagingGc, rehydrateStructuredTextAudioStagingRuntime, reconcileStructuredTextExternalAudioSources, addLog]);

  const handleTextPackImportCopy = useCallback((file) => runTextLibraryUiCommand(async () => {
    const merged = await executeProLingoTextPackFileImportCopy({ file });
    setTextLibrarySnapshot(merged.snapshot);
    if (merged?.snapshot) {
      structuredTextAudioStagingHydratedRef.current = false;
      await rehydrateStructuredTextAudioStagingRuntime(merged.snapshot, { resetExisting: false });
    }
    addLog('Text Pack', `Imported independent copy ${merged.packageId}: +${merged.counts.documents} Document, +${merged.counts.blocks} Card, +${merged.counts.segments} Segment.`);
    return merged;
  }), [runTextLibraryUiCommand, setTextLibrarySnapshot, rehydrateStructuredTextAudioStagingRuntime, addLog]);

  const handleTextExternalInitialImport = useCallback((file) => runTextLibraryUiCommand(async () => {
    const inspection = await inspectProLingoTextExternalJsonFile(file);
    if (inspection.status === 'new-source') {
      const result = await executeProLingoTextExternalJsonFileInitialImport({ file });
      applyTextSourceSnapshot(result.snapshot);
      structuredTextAudioStagingHydratedRef.current = false;
      await rehydrateStructuredTextAudioStagingRuntime(result.snapshot, { resetExisting: false });
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
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, rehydrateStructuredTextAudioStagingRuntime, reconcileStructuredTextExternalAudioSources, addLog]);

  const handleTextExternalImportDecision = useCallback((file, decision) => runTextLibraryUiCommand(async () => {
    const result = await executeProLingoTextExternalJsonFileDecision({ file, decision });
    if (result?.snapshot) {
      structuredTextAudioStagingHydratedRef.current = false;
      applyTextSourceSnapshot(result.snapshot);
      await runStructuredTextAudioStagingGc(result.snapshot, 'external-reconcile');
      await rehydrateStructuredTextAudioStagingRuntime(result.snapshot, { resetExisting: false });
      await reconcileStructuredTextExternalAudioSources(result.snapshot);
    }
    const stats = result?.stats || {};
    addLog('External Text', `${result.externalSourceKey || file?.name || 'External source'} → ${decision}; +${stats.created || 0} ~${stats.updated || 0} -${stats.deleted || 0}, local ${stats.preservedLocal || 0}.`);
    return result;
  }), [runTextLibraryUiCommand, applyTextSourceSnapshot, runStructuredTextAudioStagingGc, rehydrateStructuredTextAudioStagingRuntime, reconcileStructuredTextExternalAudioSources, addLog]);

  const handleTextSourceDetach = useCallback((attachmentId, removeData = false) => runTextLibraryUiCommand(async () => {
    if (removeData) forceStopAll();
    const result = await executeTextSourceDetach({ attachmentId, removeData });
    applyTextSourceSnapshot(result.snapshot);
    setTextSourceAttachments(result.attachments || []);
    addLog('Text Source', removeData
      ? `Removed source-owned local data for ${result.attachment?.packageId || attachmentId} (${result.counts?.removed || 0} records).`
      : `Detached ${result.attachment?.packageId || attachmentId}; local data kept as independent Text data.`);
    if (removeData && result?.snapshot) {
      structuredTextAudioStagingHydratedRef.current = false;
      await runStructuredTextAudioStagingGc(result.snapshot, 'source-data-remove');
      await rehydrateStructuredTextAudioStagingRuntime(result.snapshot, { resetExisting: false });
    }
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, applyTextSourceSnapshot, runStructuredTextAudioStagingGc, rehydrateStructuredTextAudioStagingRuntime, addLog]);

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
    structuredTextAudioStagingHydratedRef.current = false;
    await runStructuredTextAudioStagingGc(result.snapshot, 'database-replace-restore');
    await rehydrateStructuredTextAudioStagingRuntime(result.snapshot, { resetExisting: true });
    await reconcileStructuredTextExternalAudioSources(result.snapshot);
    addLog('Text DB', `REPLACE restore complete: ${counts.documents || 0} Document, ${counts.blocks || 0} Card, ${counts.segments || 0} Segment, ${counts.audioVariants || 0} audio metadata.`);
    return result;
  }), [runTextLibraryUiCommand, forceStopAll, setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices, setTextLibrarySnapshot, setActiveTextDocumentId, setTextIdentityState, setTextContent, runStructuredTextAudioStagingGc, rehydrateStructuredTextAudioStagingRuntime, reconcileStructuredTextExternalAudioSources, addLog]);


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
    const rawSpeakerText = typeof speakerLike === 'object' ? '' : String(speakerLike || '').trim();
    const requestedId = typeof speakerLike === 'object' ? String(speakerLike?.id || '').trim() : rawSpeakerText;
    const requestedLabel = typeof speakerLike === 'object' ? String(speakerLike?.label || '').trim() : rawSpeakerText;
    const normalizedLabel = requestedLabel.toLowerCase().replace(/\s+/g, ' ');
    const identity = candidates.find(item => requestedId && item.id === requestedId)
      || candidates.find(item => String(item.label || '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedLabel)
      || null;
    if (!identity?.id) return null;
    const ensureResult = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
      payload: {
        documentId: activeTextDocumentTree.id,
        speakerId: identity.id,
        label: identity.label,
        segmentIds: identity.segmentIds || []
      }
    });
    if (!ensureResult) return null;
    const latestDoc = ensureResult?.librarySnapshot?.documents?.find(item => item.id === activeTextDocumentTree.id)
      || ensureResult?.snapshot?.documents?.find(item => item.id === activeTextDocumentTree.id)
      || null;
    return {
      ...identity,
      documentMetadata: latestDoc?.metadata ?? activeTextDocumentTree.metadata
    };
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
    const globalChannelRate = Number(
      channel === 'meaning'
        ? (textStructuredPreferences?.browserMeaningRate || textStructuredPreferences?.browserTtsRate || 1)
        : (textStructuredPreferences?.browserTextRate || textStructuredPreferences?.browserTtsRate || 1)
    ) || 1;
    const numericRate = rateValue === null || rateValue === undefined || rateValue === '' ? null : Number(rateValue);
    const rateOverride = numericRate === null || !Number.isFinite(numericRate) || Math.abs(numericRate - globalChannelRate) < 1e-6
      ? null
      : numericRate;
    const metadata = buildTextStructuredPlaybackRateProfileMetadata({
      metadata: activeTextDocumentTree.metadata,
      channel,
      rate: rateOverride
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) {
      const rateLabel = rateOverride === null
        ? `Inherit Global (${globalChannelRate.toFixed(1)}×)`
        : `${Number(rateOverride).toFixed(1)}×`;
      addLog('Text Audio', `${activeTextDocumentTree.documentType === 'paragraph' ? 'Paragraph narrator' : 'Document fallback'} • ${channel} speed → ${rateLabel}.`);
    }
    return result;
  }, [activeTextDocumentTree, textStructuredPreferences, forceStopAll, handleTextLibraryStructuredCommand, addLog]);

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

  const handleStructuredTextGlobalPlaybackOrderChange = useCallback((profiles, channel = 'text') => {
    forceStopAll();
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences(
      buildTextStructuredGlobalAudioPlaybackOrderPreference({ preferences: prev, channel, profiles })
    ));
    addLog('Text Audio Order', `Global • ${channel} → ${(Array.isArray(profiles) ? profiles : []).map(item => typeof item === 'string' ? item : item?.voiceId).filter(Boolean).join(' > ') || 'compatibility fallback'}.`);
    return true;
  }, [forceStopAll, addLog]);

  const handleStructuredTextGlobalTtsOnlyChange = useCallback((enabled) => {
    forceStopAll();
    setTextStructuredPreferences(prev => normalizeTextStructuredPreferences({
      ...prev,
      audioSourceMode: enabled ? TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY : TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST
    }));
    setStructuredTextPlaybackSourceStatus(null);
    addLog('Text Audio Order', `Global TTS Only → ${enabled ? 'ON' : 'OFF'}.`);
    return true;
  }, [forceStopAll, addLog]);

  const structuredTextResetGuard = canExecuteTextStructuredReset({
    zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
    textLibraryCommandBusy,
    isSystemBusy
  });

  const clearStructuredTextResetRuntimePlaybackState = useCallback(() => {
    forceStopAll();
    setStructuredTextPlaybackSourceStatus(null);
    const docId = activeTextDocumentTree?.id || activeTextDocumentId || null;
    structuredTextResumeCursorRef.current = { documentId: docId, segmentId: null, orderedList: null };
    if (playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT) {
      playbackContextRef.current = { ...playbackContextRef.current, orderedListOverride: null };
    }
  }, [forceStopAll, activeTextDocumentTree?.id, activeTextDocumentId]);

  const handleStructuredTextResetGlobalPlaybackPreferences = useCallback((target = 'playback') => {
    const guard = canExecuteTextStructuredReset({
      zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
      textLibraryCommandBusy,
      isSystemBusy
    });
    if (!guard.allowed) {
      addLog('Warn', guard.reason);
      return null;
    }
    clearStructuredTextResetRuntimePlaybackState();
    if (structuredTextAudioGenerationState.running) handleStructuredTextCancelGeneration();
    const mappedScope = target === 'browser-tts'
      ? TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS
      : target === 'all'
        ? TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS_AND_PLAYBACK
        : TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_PLAYBACK;
    const nextPrefs = resetTextStructuredPreferences(textStructuredPreferences, { scope: mappedScope });
    setTextStructuredPreferences(nextPrefs);
    addLog('Text Audio Reset', `Reset ${target === 'browser-tts' ? 'Global Browser TTS voices & speeds' : target === 'all' ? 'Global Browser TTS & Playback defaults' : 'Text Player Playback defaults'} without deleting Staging audio.`);
    return nextPrefs;
  }, [structuredTextZipImportBusy, textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, clearStructuredTextResetRuntimePlaybackState, handleStructuredTextCancelGeneration, textStructuredPreferences, addLog]);

  const handleStructuredTextResetGlobalGenerationPreferences = useCallback((target = 'edge') => {
    const guard = canExecuteTextStructuredReset({
      zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
      textLibraryCommandBusy,
      isSystemBusy
    });
    if (!guard.allowed) {
      addLog('Warn', guard.reason);
      return null;
    }
    clearStructuredTextResetRuntimePlaybackState();
    if (structuredTextAudioGenerationState.running) handleStructuredTextCancelGeneration();
    const mappedScope = target === 'bulk'
      ? TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BULK
      : target === 'all'
        ? TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_EDGE_AND_BULK
        : TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_EDGE;
    const nextPrefs = resetTextStructuredAudioGenerationPreferences(structuredTextAudioGenerationPreferences, { scope: mappedScope });
    setStructuredTextAudioGenerationPreferences(nextPrefs);
    addLog('Text Audio Reset', `Reset ${target === 'bulk' ? 'Bulk Audio defaults (Libby EN / Tuti ID, Split)' : target === 'all' ? 'Global Edge & Bulk defaults' : 'Global Edge Generation defaults (Sonia EN / Gadis ID, 0% rate, 0Hz pitch)'}.`);
    return nextPrefs;
  }, [structuredTextZipImportBusy, textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, clearStructuredTextResetRuntimePlaybackState, handleStructuredTextCancelGeneration, structuredTextAudioGenerationPreferences, addLog]);

  const handleStructuredTextResetWorkspaceAudioPreferences = useCallback(async ({ includeSpeakers = false, includeCardsAndSegments = false, scope = TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE } = {}) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const guard = canExecuteTextStructuredReset({
      zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
      textLibraryCommandBusy,
      isSystemBusy,
      generationRunning: structuredTextAudioGenerationState.running,
      requireGenerationIdle: true
    });
    if (!guard.allowed) {
      if (structuredTextAudioGenerationState.running) handleStructuredTextCancelGeneration();
      addLog('Warn', guard.reason);
      return null;
    }
    // Match normal per-setting behaviour: narrator changes stop live playback,
    // but Edge Download preset changes do not reset transport or resume cursor.
    if (scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS) forceStopAll();
    else if (scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE) clearStructuredTextResetRuntimePlaybackState();
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
      payload: {
        scope,
        documentId: activeTextDocumentTree.id,
        includeSpeakers: Boolean(includeSpeakers),
        includeCardsAndSegments: Boolean(includeCardsAndSegments)
      }
    });
    if (result) addLog('Text Audio Reset', `Workspace "${activeTextDocumentTree.title || activeTextDocumentTree.id}" ${scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_EDGE_PRESET ? 'Edge MP3 presets' : scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS ? 'Browser TTS narrator and speed' : 'audio preferences'} reset to Global inheritance.`);
    return result;
  }, [activeTextDocumentTree, structuredTextZipImportBusy, textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, clearStructuredTextResetRuntimePlaybackState, forceStopAll, handleStructuredTextCancelGeneration, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextResetSpeakerAudioPreferences = useCallback(async ({ speakerId = null, speaker = null, includeSync = true } = {}) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const guard = canExecuteTextStructuredReset({
      zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
      textLibraryCommandBusy,
      isSystemBusy,
      generationRunning: structuredTextAudioGenerationState.running,
      requireGenerationIdle: true
    });
    if (!guard.allowed) {
      if (structuredTextAudioGenerationState.running) handleStructuredTextCancelGeneration();
      addLog('Warn', guard.reason);
      return null;
    }
    clearStructuredTextResetRuntimePlaybackState();
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
      payload: {
        scope: TEXT_STRUCTURED_RESET_SCOPES.SPEAKERS,
        documentId: activeTextDocumentTree.id,
        speakerId: speakerId || null,
        speaker: speaker || null,
        includeSync: includeSync !== false
      }
    });
    if (result) addLog('Text Audio Reset', `${speaker || speakerId ? `Speaker "${speaker || speakerId}"` : 'All Conversation Speakers'} audio preferences reset.`);
    return result;
  }, [activeTextDocumentTree, structuredTextZipImportBusy, textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, clearStructuredTextResetRuntimePlaybackState, handleStructuredTextCancelGeneration, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextResetCardAudioPreferences = useCallback(async (blockId, { includeSpeakers = true, includeSegments = true } = {}) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1' || !blockId) return null;
    const guard = canExecuteTextStructuredReset({
      zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
      textLibraryCommandBusy,
      isSystemBusy,
      generationRunning: structuredTextAudioGenerationState.running,
      requireGenerationIdle: true
    });
    if (!guard.allowed) {
      if (structuredTextAudioGenerationState.running) handleStructuredTextCancelGeneration();
      addLog('Warn', guard.reason);
      return null;
    }
    clearStructuredTextResetRuntimePlaybackState();
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
      payload: {
        scope: TEXT_STRUCTURED_RESET_SCOPES.CARD,
        documentId: activeTextDocumentTree.id,
        blockId,
        includeSpeakers: includeSpeakers !== false,
        includeSegments: includeSegments !== false
      }
    });
    if (result) addLog('Text Audio Reset', `Card ${blockId} & its Segment audio overrides reset to Workspace/Global inheritance.`);
    return result;
  }, [activeTextDocumentTree, structuredTextZipImportBusy, textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, clearStructuredTextResetRuntimePlaybackState, handleStructuredTextCancelGeneration, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextResetSegmentAudioPreferences = useCallback(async (segmentId) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1' || !segmentId) return null;
    const guard = canExecuteTextStructuredReset({
      zipImportActive: structuredTextZipImportBusy || Boolean(structuredTextZipImportCoordinatorRef.current?.isActive?.()),
      textLibraryCommandBusy,
      isSystemBusy,
      generationRunning: structuredTextAudioGenerationState.running,
      requireGenerationIdle: true
    });
    if (!guard.allowed) {
      if (structuredTextAudioGenerationState.running) handleStructuredTextCancelGeneration();
      addLog('Warn', guard.reason);
      return null;
    }
    clearStructuredTextResetRuntimePlaybackState();
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
      payload: {
        scope: TEXT_STRUCTURED_RESET_SCOPES.SEGMENT,
        documentId: activeTextDocumentTree.id,
        segmentId
      }
    });
    if (result) addLog('Text Audio Reset', `Segment ${segmentId} audio overrides reset to Card/Workspace inheritance.`);
    return result;
  }, [activeTextDocumentTree, structuredTextZipImportBusy, textLibraryCommandBusy, isSystemBusy, structuredTextAudioGenerationState.running, clearStructuredTextResetRuntimePlaybackState, handleStructuredTextCancelGeneration, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextResetGlobalBrowserTts = useCallback(
    () => handleStructuredTextResetGlobalPlaybackPreferences('browser-tts'),
    [handleStructuredTextResetGlobalPlaybackPreferences]
  );
  const handleStructuredTextResetGlobalPlaybackOnly = useCallback(
    () => handleStructuredTextResetGlobalPlaybackPreferences('playback'),
    [handleStructuredTextResetGlobalPlaybackPreferences]
  );
  const handleStructuredTextResetGlobalEdgeOnly = useCallback(
    () => handleStructuredTextResetGlobalGenerationPreferences('edge'),
    [handleStructuredTextResetGlobalGenerationPreferences]
  );
  const handleStructuredTextResetBulkOnly = useCallback(
    () => handleStructuredTextResetGlobalGenerationPreferences('bulk'),
    [handleStructuredTextResetGlobalGenerationPreferences]
  );
  const handleStructuredTextResetWorkspaceDefault = useCallback(
    () => handleStructuredTextResetWorkspaceAudioPreferences({ scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS }),
    [handleStructuredTextResetWorkspaceAudioPreferences]
  );
  const handleStructuredTextResetWorkspaceEdgePreset = useCallback(
    () => handleStructuredTextResetWorkspaceAudioPreferences({ scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_EDGE_PRESET }),
    [handleStructuredTextResetWorkspaceAudioPreferences]
  );

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
      metadata: identity.documentMetadata ?? activeTextDocumentTree.metadata,
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
    const globalChannelRate = Number(
      channel === 'meaning'
        ? (textStructuredPreferences?.browserMeaningRate || textStructuredPreferences?.browserTtsRate || 1)
        : (textStructuredPreferences?.browserTextRate || textStructuredPreferences?.browserTtsRate || 1)
    ) || 1;
    const docRateProfile = getTextStructuredPlaybackRateProfile(activeTextDocumentTree);
    const inheritedRate = Number(docRateProfile?.channels?.[channel] || globalChannelRate) || 1;
    const numericRate = rateValue === null || rateValue === undefined || rateValue === '' ? null : Number(rateValue);
    const rateOverride = numericRate === null || !Number.isFinite(numericRate) || Math.abs(numericRate - inheritedRate) < 1e-6
      ? null
      : numericRate;
    const metadata = buildTextStructuredPlaybackRateProfileMetadata({
      metadata: identity.documentMetadata ?? activeTextDocumentTree.metadata,
      speakerId: identity.id,
      channel,
      rate: rateOverride
    });
    const result = await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: activeTextDocumentTree.id, metadata }
    });
    if (result) {
      const rateLabel = rateOverride === null
        ? `Inherit Default (${inheritedRate.toFixed(1)}×)`
        : `${Number(rateOverride).toFixed(1)}×`;
      addLog('Text Audio', `${identity.label} • ${channel} speed → ${rateLabel} • ${identity.id}.`);
    }
    return result;
  }, [activeTextDocumentTree, textStructuredPreferences, forceStopAll, ensureStructuredTextSpeakerIdentity, handleTextLibraryStructuredCommand, addLog]);

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
    const metadata = buildTextStructuredLocalAudioProfileMetadata({ metadata: identity.documentMetadata ?? activeTextDocumentTree.metadata, channel, voiceId, speakerId: identity.id });
    const result = await handleTextLibraryStructuredCommand({ type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT, payload: { id: activeTextDocumentTree.id, metadata } });
    if (result) addLog('Text Audio', `${identity.label} custom local ${channel} → ${voiceId || 'Global TTS'}.`);
    return result;
  }, [activeTextDocumentTree, forceStopAll, ensureStructuredTextSpeakerIdentity, handleTextLibraryStructuredCommand, addLog]);

  const handleStructuredTextSpeakerDownloadVoiceChange = useCallback(async (speakerLike, voiceId, channel = 'text') => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const identity = await ensureStructuredTextSpeakerIdentity(speakerLike);
    if (!identity) return null;
    const metadata = buildTextStructuredAudioDownloadProfileMetadata({
      metadata: identity.documentMetadata ?? activeTextDocumentTree.metadata,
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

  const handleStructuredTextApplyCardPlayerChanges = useCallback(async (blockId, draftChanges = {}) => {
    if (!activeTextDocumentTree?.id || activeTextDocumentTree.editorModel !== 'structured-v1') return null;
    const block = (activeTextDocumentTree.blocks || []).find(item => item.id === blockId);
    if (!block) return null;
    forceStopAll();
    let nextBlockMetadata = { ...(block.metadata || {}) };
    const cardChannels = draftChanges.cardChannels || draftChanges.cardVoices;
    if (cardChannels && typeof cardChannels === 'object') {
      ['text', 'meaning'].forEach(ch => {
        if (Object.prototype.hasOwnProperty.call(cardChannels, ch)) {
          nextBlockMetadata = buildTextStructuredVoiceOverrideMetadata({
            metadata: nextBlockMetadata,
            channel: ch,
            voiceName: cardChannels[ch] || null
          });
        }
      });
    }
    if (draftChanges.speakerIds && typeof draftChanges.speakerIds === 'object') {
      ['text', 'meaning'].forEach(ch => {
        const chMap = draftChanges.speakerIds[ch];
        if (chMap && typeof chMap === 'object') {
          Object.entries(chMap).forEach(([speakerId, voiceName]) => {
            nextBlockMetadata = buildTextStructuredVoiceOverrideMetadata({
              metadata: nextBlockMetadata,
              channel: ch,
              voiceName: voiceName || null,
              speakerId
            });
          });
        }
      });
    }
    const speakersMap = draftChanges.speakers || draftChanges.speakerVoices;
    if (speakersMap && typeof speakersMap === 'object') {
      ['text', 'meaning'].forEach(ch => {
        const chMap = speakersMap[ch];
        if (chMap && typeof chMap === 'object') {
          Object.entries(chMap).forEach(([speakerKey, voiceName]) => {
            nextBlockMetadata = buildTextStructuredVoiceOverrideMetadata({
              metadata: nextBlockMetadata,
              channel: ch,
              voiceName: voiceName || null,
              speaker: speakerKey,
              speakerId: speakerKey.startsWith('SPK_') ? speakerKey : null
            });
          });
        }
      });
    }
    if (Object.prototype.hasOwnProperty.call(draftChanges, 'playbackOrder')) {
      ['text', 'meaning'].forEach(ch => {
        if (draftChanges.playbackOrder && Object.prototype.hasOwnProperty.call(draftChanges.playbackOrder, ch)) {
          nextBlockMetadata = buildTextStructuredAudioPlaybackOrderMetadata({
            metadata: nextBlockMetadata,
            channel: ch,
            profiles: draftChanges.playbackOrder[ch] || []
          });
        }
      });
    } else if (Object.prototype.hasOwnProperty.call(draftChanges, 'cardPlaybackOrder')) {
      nextBlockMetadata = buildTextStructuredAudioPlaybackOrderMetadata({
        metadata: nextBlockMetadata,
        order: draftChanges.cardPlaybackOrder || null
      });
    }
    await handleTextLibraryStructuredCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
      payload: { id: block.id, metadata: nextBlockMetadata }
    });
    const segmentMap = draftChanges.segmentChannels || draftChanges.segmentVoices;
    if (segmentMap && typeof segmentMap === 'object') {
      for (const segment of block.segments || []) {
        const segDraft = segmentMap[segment.id];
        if (!segDraft || typeof segDraft !== 'object') continue;
        let nextSegMetadata = { ...(segment.metadata || {}) };
        ['text', 'meaning'].forEach(ch => {
          if (Object.prototype.hasOwnProperty.call(segDraft, ch)) {
            nextSegMetadata = buildTextStructuredVoiceOverrideMetadata({
              metadata: nextSegMetadata,
              channel: ch,
              voiceName: segDraft[ch] || null
            });
          }
        });
        const prevOverride = JSON.stringify(segment.metadata?.audioVoiceOverrideV1 || null);
        const nextOverride = JSON.stringify(nextSegMetadata?.audioVoiceOverrideV1 || null);
        if (prevOverride !== nextOverride) {
          await handleTextLibraryStructuredCommand({
            type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
            payload: { id: segment.id, metadata: nextSegMetadata }
          });
        }
      }
    }
    addLog('Text Voice', `Applied Card Player settings for ${block.id}.`);
    return true;
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
    if (!isBrowserTtsSpeechSupported({ synth })) {
      addLog('Warn', `Text TTS Preview: Browser TTS API is unavailable for ${segmentId}/${channel}.`);
      return null;
    }
    return safePlayTransition(async () => {
      addLog('Text TTS', `${segmentId}/${channel} • ${voiceState.assignmentSource || 'global'} • ${voiceState.requestedVoiceId || voiceState.ttsVoice?.name || 'Browser system default'}.`);
      return executeBrowserTtsPlaybackService({
        textToRead: content,
        overrideVoice: voiceState.ttsVoice || null,
        selectedVoiceRef: { current: voiceState.ttsVoice || null },
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
    const missingOnly = options.missingOnly !== false;
    const resolutionPreferences = structuredTextFullDownloadResolutionPreferencesRef.current;
    const splitJobs = buildTextStructuredGenerationJobs({
      documentTree: activeTextDocumentTree,
      preferences: resolutionPreferences,
      blockId,
      channels,
      segmentIds: options.segmentIds || null
    });
    const targetBlock = (activeTextDocumentTree.blocks || []).find(item => item.id === blockId) || null;
    const missingFullJobs = (options.includeMissingFull === true && missingOnly && targetBlock)
      ? buildTextStructuredCardMissingFullRequirements({
          documentTree: activeTextDocumentTree,
          block: targetBlock,
          channels,
          preferences: resolutionPreferences,
          runtimeFullAudio: structuredTextFullAudioRuntimeUrlsRef.current,
          stagingRecords: structuredTextAudioStagingRecordsRef.current
        })
      : [];
    if (!missingFullJobs.length) {
      return runStructuredTextAudioGenerationBatch(splitJobs, { missingOnly });
    }
    const selectedSplitJobs = splitJobs.filter(job =>
      shouldDownloadTextStructuredCoverageSlot(job?.coverage || { status: job?.coverageStatus || 'missing' })
    );
    return runStructuredTextAudioGenerationBatch([...selectedSplitJobs, ...missingFullJobs], { missingOnly: true });
  }, [activeTextDocumentTree, runStructuredTextAudioGenerationBatch]);

  const handleStructuredTextGenerateSpeakerAudio = useCallback((blockId, speaker, channels = null, options = {}) => {
    if (!activeTextDocumentTree) return null;
    const jobs = buildTextStructuredGenerationJobs({
      documentTree: activeTextDocumentTree,
      preferences: structuredTextFullDownloadResolutionPreferencesRef.current,
      blockId,
      speaker,
      channels
    });
    return runStructuredTextAudioGenerationBatch(jobs, { missingOnly: options.missingOnly !== false });
  }, [activeTextDocumentTree, runStructuredTextAudioGenerationBatch]);

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

  const handleStructuredTextExportCardZip = useCallback((blockId, options = {}) => executeStructuredTextCardZipExport({
    documentTree: activeTextDocumentTree,
    blockId,
    options,
    preferences: structuredTextDownloadResolutionPreferences,
    runtimeFullAudio: structuredTextFullAudioRuntimeUrlsRef.current,
    resolveManualReadySlot: resolveStructuredTextManualReadySlot,
    readBlob: readStructuredTextManualReadyBlob,
    addLog
  }), [activeTextDocumentTree, structuredTextDownloadResolutionPreferences, resolveStructuredTextManualReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextExportFullCardAudio = useCallback((blockId, channel = 'text') => executeStructuredTextFullCardAudioExport({
    documentTree: activeTextDocumentTree,
    blockId,
    channel,
    preferences: structuredTextDownloadResolutionPreferences,
    runtimeFullAudio: structuredTextFullAudioRuntimeUrlsRef.current,
    resolveManualReadySlot: resolveStructuredTextManualReadySlot,
    readBlob: readStructuredTextManualReadyBlob,
    addLog
  }), [activeTextDocumentTree, structuredTextDownloadResolutionPreferences, resolveStructuredTextManualReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextBatchExportReadyMp3 = useCallback(() => {
    const batchContext = resolveLiveStructuredTextBatchContext();
    return executeStructuredTextBatchReadyMp3Export({
      batchSelection: batchContext.selection,
      targetTrees: batchContext.targetTrees,
      preferences: structuredTextFullDownloadResolutionPreferencesRef.current,
      runtimeFullAudio: structuredTextFullAudioRuntimeUrlsRef.current,
      resolveBatchReadySlot: resolveStructuredTextBatchReadySlot,
      readBlob: readStructuredTextManualReadyBlob,
      addLog
    });
  }, [resolveLiveStructuredTextBatchContext, resolveStructuredTextBatchReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextBatchExportConsolidatedZip = useCallback(({ partial = false } = {}) => {
    const batchContext = resolveLiveStructuredTextBatchContext();
    return executeStructuredTextBatchConsolidatedZipExport({
      partial,
      batchSelection: batchContext.selection,
      targetTrees: batchContext.targetTrees,
      preferences: structuredTextFullDownloadResolutionPreferencesRef.current,
      runtimeFullAudio: structuredTextFullAudioRuntimeUrlsRef.current,
      resolveBatchReadySlot: resolveStructuredTextBatchReadySlot,
      readBlob: readStructuredTextManualReadyBlob,
      addLog
    });
  }, [resolveLiveStructuredTextBatchContext, resolveStructuredTextBatchReadySlot, readStructuredTextManualReadyBlob, addLog]);

  const handleStructuredTextBulkExport = useCallback(async ({ format = null, auto = false } = {}) => {
    const batchContext = resolveLiveStructuredTextBatchContext();
    const exportPlan = batchContext.getBulkExportPlan() || { physical: [], coverage: {} };
    const physical = Array.isArray(exportPlan.physical) ? exportPlan.physical : [];
    const targetFormat = format || structuredTextAudioGenerationPreferences.bulkExportFormat || TEXT_STRUCTURED_BULK_EXPORT_FORMATS.PORTABLE_ZIP;
    if (!physical.length) {
      addLog('Warn', `Bulk Export${auto ? ' (Auto)' : ''}: no Ready Staging physical audio matches the current scope / voice / representation policy.`);
      return { status: 'empty', format: targetFormat, exported: 0 };
    }

    const batchSelection = batchContext.selection;
    const scopeLabel = batchSelection?.documents?.length === 1
      ? (batchSelection.documents[0]?.title || activeTextDocumentTree?.title || 'Text')
      : `${batchSelection?.documents?.length || 0}_Workspaces`;
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
        if (chunkIndex > 0) await new Promise(resolve => setTimeout(resolve, TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS));
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
  }, [resolveLiveStructuredTextBatchContext, structuredTextAudioGenerationPreferences, structuredTextBatchScope?.scopeMode, activeTextDocumentTree?.title, addLog]);

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
      edgeVoices
    });
    setStructuredTextEdgeHealth({ status: 'testing', message: `Testing ${generationVoiceState.engineVoiceId}...` });
    try {
      const result = await executeTextStructuredEdgeHealthCheck({ voiceId: generationVoiceState.engineVoiceId });
      const testedVoiceId = result?.voiceId || generationVoiceState.engineVoiceId;
      if (testedVoiceId && isEdgeVoiceUnavailable(testedVoiceId, edgeVoices)) {
        setEdgeVoices(prev => applyEdgeVoiceCompatibilityResult(prev, testedVoiceId, { available: true }));
      }
      const message = `${testedVoiceId} • ${Math.max(1, Math.round(result.size / 1024))} KB`;
      setStructuredTextEdgeHealth({ status: 'online', message });
      addLog('Text Edge', `Online • ${message}`);
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      if (generationVoiceState.engineVoiceId && (error?.status === 422 || error?.code === 'EDGE_VOICE_UNSUPPORTED')) {
        setEdgeVoices(prev => applyEdgeVoiceCompatibilityResult(prev, generationVoiceState.engineVoiceId, {
          available: false,
          diagnostic: message
        }));
      }
      setStructuredTextEdgeHealth({ status: 'error', message });
      addLog('Error', `Text Edge health: ${message}`);
      return { status: 'error', error: message, httpStatus: error?.status ?? null, code: error?.code || null };
    }
  }, [structuredTextAudioGenerationState.running, structuredTextEdgeHealth.status, defaultStructuredTextVoiceId, structuredTextAudioGenerationPreferences, edgeVoices, setEdgeVoices, addLog]);

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

    const activeStructuredFullCursorKey = (isPlaying || isPaused)
      && playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      && (playingIndex === null || playingIndex === undefined)
      ? `${activeTextDocumentTree?.id || ''}:${playbackContextRef.current?.blockId || ''}:${playbackContextRef.current?.cursorSegmentId || currentIndex || ''}`
      : null;

    useEffect(() => {
        return executeMediaSessionLifecycleService({
            currentPlayerList, playbackContextRef, playingIndex, currentIndex, speakingPart, currentDeckName, isPlaying, isPaused,
            currentAudioObjRef, mediaIntervalRef, resumePlaybackRef, playRef, pausePlaybackRef, navRef, stopRef, pauseStateRef
        });
    }, [
        playingIndex,
        currentIndex,
        activeStructuredFullCursorKey,
        activeTextDocumentTree?.id,
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
    const result = await executeEdgeBackendHealthService({
      edgeHealth,
      edgeTestAbortControllerRef,
      setEdgeHealth,
      edgeVoice,
      addLog
    });
    if (result?.status === 'online' && result?.voiceId) {
      setEdgeVoices(prev => (
        isEdgeVoiceUnavailable(result.voiceId, prev)
          ? applyEdgeVoiceCompatibilityResult(prev, result.voiceId, { available: true })
          : prev
      ));
    } else if (
      result?.status === 'error'
      && result?.voiceId
      && (result?.httpStatus === 422 || result?.code === 'EDGE_VOICE_UNSUPPORTED')
    ) {
      setEdgeVoices(prev => applyEdgeVoiceCompatibilityResult(prev, result.voiceId, {
        available: false,
        diagnostic: result?.message || null
      }));
    }
    return result;
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
    if (generatorEngine === 'edge' && requestedDownloadVoice && isEdgeVoiceUnavailable(requestedDownloadVoice, edgeVoices)) {
      const diagnostic = getEdgeVoiceDiagnostic(requestedDownloadVoice, edgeVoices) || `Voice "${requestedDownloadVoice}" is unavailable in Edge TTS.`;
      addLog('Error', `Edge blocked (${part}): ${diagnostic}`);
      if (!options.suppressFailureAlert) {
        alert(`Edge voice "${requestedDownloadVoice}" sedang tidak tersedia (${diagnostic}). Pilih voice Edge lain atau uji ulang di Health Check.`);
      }
      return { status: 'error', unavailable: true, blocked: true, part, voice: requestedDownloadVoice, error: diagnostic };
    }
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
    if (generatorEngine === 'edge') {
      const targetVoiceId = result?.voice || requestedDownloadVoice;
      if (result?.status === 'success' && targetVoiceId) {
        setEdgeVoices(prev => (
          isEdgeVoiceUnavailable(targetVoiceId, prev)
            ? applyEdgeVoiceCompatibilityResult(prev, targetVoiceId, { available: true })
            : prev
        ));
      } else if (
        result?.status === 'error'
        && targetVoiceId
        && (result?.httpStatus === 422 || result?.code === 'EDGE_VOICE_UNSUPPORTED')
      ) {
        setEdgeVoices(prev => applyEdgeVoiceCompatibilityResult(prev, targetVoiceId, {
          available: false,
          diagnostic: result?.error || null
        }));
      }
    }
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
    if (mode !== 'table') {
      addLog?.('Info', 'Blocked Table Batch download outside Table mode.');
      return { status: 'table-only-r2' };
    }
    if (generatorEngine === 'gemini' && !geminiOwnerState.unlocked && !geminiOwnerState.byokRegistered) {
      alert('Gemini terkunci. Daftarkan API key Anda atau unlock Owner Access.');
      return;
    }
    if (generatorEngine === 'edge') {
      const blockedVoices = resolveTableBatchUnavailableVoices({
        batchConfig,
        generatorEngine,
        edgeVoice,
        edgeIndonesianVoice,
        edgeVoices,
        slots: Array.isArray(tableAudioBatchCoverage?.slots) ? tableAudioBatchCoverage.slots : null,
        missingOnly: options.missingOnly !== false
      });
      if (blockedVoices.length) {
        const diagnostic = blockedVoices
          .map(voiceId => `${voiceId} (${getEdgeVoiceDiagnostic(voiceId, edgeVoices) || 'Unavailable'})`)
          .join('; ');
        addLog('Error', `Table Batch blocked: ${diagnostic}`);
        alert(`Edge voice tidak tersedia untuk Batch (${blockedVoices.join(', ')}). Pilih voice Edge lain yang aktif sebelum menjalankan Batch.`);
        return { status: 'unavailable-voice', blockedVoices, error: diagnostic };
      }
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
    const liveScope = latestAudioFolderScopeRef.current;
    if (
      !isLegacyAudioFolderSupported({ mode, activeTextEditorModel })
      || !isLegacyAudioFolderSupported(liveScope)
      || liveScope.mode !== mode
      || (mode === 'text' && (
        liveScope.activeTextEditorModel !== activeTextEditorModel
        || (activeTextDocumentId && liveScope.activeTextDocumentId !== activeTextDocumentId)
      ))
    ) {
      addLog?.('Info', 'Skipped Legacy Audio Folder load: workspace scope changed before scan completed.');
      return { count: 0, orphanCount: 0, blocked: true, stale: true, reason: 'legacy-audio-folder-unsupported' };
    }
    clearGeneratedAudioMetaForMode(mode);
    if (mode === 'table') revokeTableFolderVariantUrls();
    const result = executeAudioFolderSelectService({
      e: { target: { files, value: '' } },
      mode,
      activeTextEditorModel: liveScope.activeTextEditorModel,
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
      edgeVoices
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
        edgeVoices
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
    clearAudioStagingRuntimeCacheForMode('table');
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
    if (!isLegacyAudioFolderSupported({ mode, activeTextEditorModel })) return '';
    if (mode === 'table') {
      if (!playlist.length) return '';
      return playlist
        .filter(item => item?.isStructured)
        .map(item => `${getVocabIdentity(item)}:${getRecordAudioNo(item) || ''}`)
        .join('|');
    }
    return buildLegacyTextAudioDatasetSignature({
      mode,
      activeTextEditorModel,
      activeTextDocumentId,
      textDatabaseStatus,
      textIdentityState,
      playlist
    });
  }, [mode, activeTextEditorModel, activeTextDocumentId, textDatabaseStatus, textIdentityState, playlist]);

  const getAudioAutoRestoreState = () => {
    if (!folderInputRef.audioAutoRestoreState) {
      folderInputRef.audioAutoRestoreState = { signatures: {}, generations: {} };
    }
    return folderInputRef.audioAutoRestoreState;
  };

  const localAudioMapTableRef = useRef(localAudioMapTable);
  const localAudioMapTextRef = useRef(localAudioMapText);
  const previousLegacyAudioDocumentIdRef = useRef(activeTextDocumentId);
  useLayoutEffect(() => {
    localAudioMapTableRef.current = localAudioMapTable;
    localAudioMapTextRef.current = localAudioMapText;
  });

  useEffect(() => () => {
    Object.values(localAudioMapTableRef.current || {}).forEach(url => {
      if (url) { try { URL.revokeObjectURL(url); } catch { /* noop */ } }
    });
    Object.values(localAudioMapTextRef.current || {}).forEach(url => {
      if (url) { try { URL.revokeObjectURL(url); } catch { /* noop */ } }
    });
    clearTableAudioFolderRuntimeCache();
    clearTableAudioZipRuntimeCache();
    clearAudioStagingRuntimeCacheForMode('table');
  }, []);

  const handleFolderSelect = (e) => {
    const liveScope = latestAudioFolderScopeRef.current;
    if (
      !isLegacyAudioFolderSupported({ mode, activeTextEditorModel })
      || !isLegacyAudioFolderSupported(liveScope)
    ) {
      if (e?.target) e.target.value = '';
      addLog?.('Info', 'Legacy Audio Folder is only available in Table or Legacy Text mode.');
      return { count: 0, orphanCount: 0, blocked: true, reason: 'legacy-audio-folder-unsupported' };
    }
    const files = e?.target?.files;
    if (!files) return;
    const result = loadAudioFolderFiles(files, '', { automatic: false });
    if (e?.target) e.target.value = '';
    return result;
  };

  const handleRememberedAudioFolderOpen = ({ forcePicker = false } = {}) => {
    const liveScope = latestAudioFolderScopeRef.current;
    if (
      !isLegacyAudioFolderSupported({ mode, activeTextEditorModel })
      || !isLegacyAudioFolderSupported(liveScope)
    ) {
      addLog?.('Info', 'Legacy Audio Folder is disabled for Structured Text; use Audio Library / Portable ZIP in the Audio tab.');
      return { status: 'blocked', reason: 'legacy-audio-folder-unsupported' };
    }
    // Manual reconnect/change always supersedes any slower automatic scan.
    const restoreState = getAudioAutoRestoreState();
    const generation = (restoreState.generations[mode] || 0) + 1;
    restoreState.generations[mode] = generation;
    const expectedMode = mode;
    const expectedEditorModel = liveScope.activeTextEditorModel;
    const expectedDocumentId = expectedMode === 'text' ? liveScope.activeTextDocumentId : null;
    const shouldContinue = () => (
      getAudioAutoRestoreState().generations[expectedMode] === generation
      && isMatchingAudioFolderScope(latestAudioFolderScopeRef.current, expectedMode, expectedEditorModel, expectedDocumentId)
    );
    return executeRememberedAudioFolderOpenService({
      mode,
      activeTextEditorModel: expectedEditorModel,
      forcePicker,
      shouldContinue,
      onFiles: (files, folderName, options = {}) => {
        if (!shouldContinue()) return { stale: true };
        return loadAudioFolderFiles(files, folderName, options);
      },
      fallbackOpen: () => {
        if (!shouldContinue()) return;
        folderInputRef.current?.click();
      },
      addLog
    });
  };

  const handleRememberedAudioFolderRefresh = () => {
    const liveScope = latestAudioFolderScopeRef.current;
    if (
      !isLegacyAudioFolderSupported({ mode, activeTextEditorModel })
      || !isLegacyAudioFolderSupported(liveScope)
    ) {
      addLog?.('Info', 'Legacy Audio Folder is disabled for Structured Text; use Audio Library / Portable ZIP in the Audio tab.');
      return { status: 'blocked', reason: 'legacy-audio-folder-unsupported' };
    }
    // Re-scan the remembered folder against the current dataset without forcing
    // the user to pick the folder again. This also supersedes slower auto scans.
    const restoreState = getAudioAutoRestoreState();
    const generation = (restoreState.generations[mode] || 0) + 1;
    restoreState.generations[mode] = generation;
    const expectedMode = mode;
    const expectedEditorModel = liveScope.activeTextEditorModel;
    const expectedDocumentId = expectedMode === 'text' ? liveScope.activeTextDocumentId : null;
    const shouldContinue = () => (
      getAudioAutoRestoreState().generations[expectedMode] === generation
      && isMatchingAudioFolderScope(latestAudioFolderScopeRef.current, expectedMode, expectedEditorModel, expectedDocumentId)
    );

    return executeRememberedAudioFolderOpenService({
      mode,
      activeTextEditorModel: expectedEditorModel,
      forcePicker: false,
      shouldContinue,
      onFiles: (files, folderName, options = {}) => {
        if (!shouldContinue()) return { stale: true };
        return loadAudioFolderFiles(files, folderName, { ...options, automatic: true });
      },
      fallbackOpen: () => {
        if (!shouldContinue()) return;
        folderInputRef.current?.click();
      },
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
    const previousDocumentId = previousLegacyAudioDocumentIdRef.current;
    previousLegacyAudioDocumentIdRef.current = activeTextDocumentId;

    const { shouldClear, reason } = shouldClearLegacyTextAudioOnDocumentState({
      previousDocumentId,
      activeTextDocumentId,
      mode,
      activeTextEditorModel,
      textDatabaseStatus,
      textIdentityState
    });
    if (!shouldClear) return;

    const currentMap = localAudioMapTextRef.current || {};
    const urls = Object.values(currentMap);
    const restoreState = getAudioAutoRestoreState();
    const hasLegacyMeta = Object.keys(generatedAudioMetaRef.current || {}).some(key => key.startsWith('text:'));
    const hasStaleLegacyRuntime = urls.length > 0 || Boolean(restoreState.signatures.text) || hasLegacyMeta;
    if (reason === 'empty-legacy-workspace' && !hasStaleLegacyRuntime) return;

    urls.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (err) { console.warn('Failed to revoke URL:', err); }
    });
    localAudioMapTextRef.current = {};
    restoreState.signatures.text = '';
    restoreState.generations.text = (restoreState.generations.text || 0) + 1;
    if (urls.length > 0) setLocalAudioMapText({});
    setAudioStatusText(prev => (prev === 'idle' ? prev : 'idle'));
    if (hasLegacyMeta) clearGeneratedAudioMetaForMode('text');
  // Clears stale Legacy Text local-audio state on document switch or empty-line
  // state while leaving remembered IndexedDB handles, original files, Table, and
  // Structured Text audio untouched.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeTextEditorModel, activeTextDocumentId, textDatabaseStatus, textIdentityState]);

  useEffect(() => {
    if (!isLegacyAudioFolderSupported({ mode, activeTextEditorModel })) return;
    if (!playlist.length || !audioDatasetIdentitySignature) return;

    const restoreState = getAudioAutoRestoreState();
    if (restoreState.signatures[mode] === audioDatasetIdentitySignature) return;

    restoreState.signatures[mode] = audioDatasetIdentitySignature;
    const generation = (restoreState.generations[mode] || 0) + 1;
    restoreState.generations[mode] = generation;
    const expectedMode = mode;
    const expectedEditorModel = activeTextEditorModel;
    const expectedDocumentId = expectedMode === 'text' ? activeTextDocumentId : null;
    const shouldContinue = () => (
      getAudioAutoRestoreState().generations[expectedMode] === generation
      && isMatchingAudioFolderScope(latestAudioFolderScopeRef.current, expectedMode, expectedEditorModel, expectedDocumentId)
    );

    executeRememberedAudioFolderRestoreService({
      mode,
      activeTextEditorModel: expectedEditorModel,
      shouldContinue,
      onFiles: (files, folderName, options = {}) => {
        if (!shouldContinue()) {
          return { stale: true };
        }
        return loadAudioFolderFiles(files, folderName, options);
      },
      addLog
    });
  // Auto-rescan only when the dataset's audio identities change. Search/filter/sort
  // do not change this signature, while CSV import/add/delete do.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeTextEditorModel, audioDatasetIdentitySignature]);

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
    voices: edgeVoices,
    // Existing Split export coverage stays separate until P6. P5 generation uses the
    // explicit multi-voice Split/Full plan below.
    coverage: structuredTextBatchSelection?.coverage || structuredTextDocumentCoverage,
    generationCoverage: structuredTextBulkGenerationPlan?.coverage || {},
    operationVoiceValidation: structuredTextBulkGenerationPlan?.operationVoiceValidation || null,
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
    retryFailed: handleStructuredTextRetryFailedGeneration,
    resetDisabled: !structuredTextResetGuard.allowed || Boolean(structuredTextAudioGenerationState.running),
    resetPreferences: handleStructuredTextResetBulkOnly
  } : null;

  const renderBatchPopup = (options = {}) => renderBatchPopupView({
    batchPanelRef, mode, activeTextEditorModel, setIsBatchOpen: setBatchOpenGuarded, isBatchDownloading, batchConfig, setBatchConfig,
    generatorEngine, edgeVoice, edgeIndonesianVoice, aiVoiceName, advancedDatasetStats, handleBatchRangeBlur, runBatchDownload,
    isBatchStopping, batchStatusText,
    tableCoverage: tableAudioBatchCoverage, structuredTextBatch: structuredTextBatchControls,
    batchSessions: activeTableAudioBatchSessions, stagingRecords: activeTableAudioStagingRecords, stagingSummary: activeTableAudioStagingSummary, allStagingSummary: tableAudioStagingSummary, batchAvailabilityById: tableAudioBatchAvailabilityById,
    onExportCurrentMp3: exportCurrentSelectionMp3, onExportCurrentZip: exportCurrentSelectionZip, onExportBatchSessions: exportBatchSessions,
    onClearBatchStaging: clearBatchSessionStaging, onClearAllStaging: clearTableAudioStaging, onDeleteBatchHistory: deleteBatchSessionHistory, directMp3Limit: DIRECT_MP3_BATCH_LIMIT,
    edgeVoices,
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

  const scopedStructuredTextPlaybackSourceStatus = resolveScopedStructuredTextPlaybackSourceStatus({
    status: structuredTextPlaybackSourceStatus,
    mode,
    activeEditorModel: activeTextEditorModel,
    activeDocumentId: activeTextDocumentTree?.id || activeTextDocumentId || null,
    activeSessionId: playbackSessionRef.current
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
    onGlobalBrowserTtsVoiceChange: handleStructuredTextGlobalBrowserTtsVoiceChange,
    onSpeakerVoiceChange: handleStructuredTextSpeakerVoiceChange,
    onDocumentRateChange: handleStructuredTextDocumentRateChange,
    onSpeakerRateChange: handleStructuredTextSpeakerRateChange,
    onSyncSpeakerVoice: handleStructuredTextSyncSpeakerVoice,
    onSyncSpeakerRate: handleStructuredTextSyncSpeakerRate,
    onDocumentLocalAudioVoiceChange: handleStructuredTextDocumentLocalAudioVoiceChange,
    onSpeakerLocalAudioVoiceChange: handleStructuredTextSpeakerLocalAudioVoiceChange,
    generationPreferences: structuredTextDownloadResolutionPreferences,
    edgeGenerationVoices: edgeVoices,
    onGenerationPreferencesChange: handleStructuredTextAudioGenerationPreferenceChange,
    onDocumentDownloadVoiceChange: handleStructuredTextDocumentDownloadVoiceChange,
    onDocumentDownloadModeChange: handleStructuredTextDocumentDownloadModeChange,
    playbackOrder: structuredTextAudioPlaybackOrder,
    onGlobalPlaybackOrderChange: handleStructuredTextGlobalPlaybackOrderChange,
    onGlobalTtsOnlyChange: handleStructuredTextGlobalTtsOnlyChange,
    onCardPlaybackOrderChange: handleStructuredTextCardPlaybackOrderChange,
    onSpeakerDownloadVoiceChange: handleStructuredTextSpeakerDownloadVoiceChange,
    edgeHealth: structuredTextEdgeHealth,
    onEdgeHealthCheck: handleStructuredTextEdgeHealthCheck,
    audioLibrary: structuredTextAudioLibraryControls,
    playbackSourceStatus: scopedStructuredTextPlaybackSourceStatus,
    resetDisabled: !structuredTextResetGuard.allowed || Boolean(structuredTextAudioGenerationState.running),
    onResetGlobalBrowserTts: handleStructuredTextResetGlobalBrowserTts,
    onResetGlobalEdge: handleStructuredTextResetGlobalEdgeOnly,
    onResetWorkspaceAudio: handleStructuredTextResetWorkspaceDefault,
    onResetWorkspaceEdgePreset: handleStructuredTextResetWorkspaceEdgePreset,
    onResetSpeakersAudio: handleStructuredTextResetSpeakerAudioPreferences
  };

  const renderMobileTools = () => renderMobileToolsView({
    sidebarSection, renderControlSectionTabs, currentMapCount, legacyTextAudioCount, mode, renderStatusBadge,
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
    isBatchOpen: effectiveIsBatchOpen, setIsBatchOpen: setBatchOpenGuarded, showLogs, setShowLogs,
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
        activeCursorSegmentId={playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT && playbackContextRef.current?.documentId === activeTextDocumentTree?.id ? currentIndex : null}
        activeSessionRepresentationMode={playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT && playbackContextRef.current?.documentId === activeTextDocumentTree?.id ? playbackContextRef.current?.playbackRepresentationMode : null}
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
        runtimeFullAudio={structuredTextFullAudioRuntimeUrls}
        playbackSourceStatus={scopedStructuredTextPlaybackSourceStatus}
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
        onGlobalPlaybackOrderChange={handleStructuredTextGlobalPlaybackOrderChange}
        onGlobalTtsOnlyChange={handleStructuredTextGlobalTtsOnlyChange}
        onCardPlaybackOrderChange={handleStructuredTextCardPlaybackOrderChange}
        onApplyCardPlayerChanges={handleStructuredTextApplyCardPlayerChanges}
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
        edgeGenerationVoices={edgeVoices}
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
        onStopPlayback={forceStopAll}
        resetDisabled={!structuredTextResetGuard.allowed || Boolean(structuredTextAudioGenerationState.running)}
        onResetPlaybackPreferences={handleStructuredTextResetGlobalPlaybackOnly}
        onResetCardAudioPreferences={handleStructuredTextResetCardAudioPreferences}
        onResetSegmentAudioPreferences={handleStructuredTextResetSegmentAudioPreferences}
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
    renderControlSectionTabs, currentMapCount, legacyTextAudioCount, renderStatusBadge, tableAudioVoiceOptions, tableLocalAudioVoiceMode, setTableLocalAudioVoiceMode, tableAudioVoicePriority, moveTableLocalAudioVoicePriority, preferLocalAudio: activePreferLocalAudio, setPreferLocalAudio: handleActivePreferLocalAudioChange,
    generatorEngine, setGeneratorEngine, aiVoiceName, setAiVoiceName, aiVoices,
    edgeVoices, edgeVoice, setEdgeVoice, edgeIndonesianVoice, setEdgeIndonesianVoice,
    edgeRate, setEdgeRate, edgePitch, setEdgePitch, edgeHealth,
    testEdgeBackend, userApiKey, onUserApiKeyChange: handleUserApiKeyChange,
    geminiOwnerConfigured: geminiOwnerState.configured, geminiOwnerUnlocked: geminiOwnerState.unlocked,
    onGeminiOwnerUnlock: handleGeminiOwnerUnlock, onGeminiOwnerLock: handleGeminiOwnerLock, geminiByokAvailable: geminiOwnerState.byokAvailable,
    geminiByokRegistered: geminiOwnerState.byokRegistered, onGeminiByokRegister: handleGeminiByokRegister,
    onGeminiByokClear: handleGeminiByokClear, batchButtonRef,
    isBatchDownloading, setIsBatchOpen: setBatchOpenGuarded, isBatchOpen: effectiveIsBatchOpen, renderBatchPopup, debugButtonRef,
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
    textPlaybackRepresentationMode: textStructuredPreferences.playbackRepresentationMode,
    textPlaybackOrder: structuredTextAudioPlaybackOrder,
    textPlaybackChannelMode: textStructuredPreferences.playbackChannelMode,
    textActiveCursorSegmentId: playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT ? currentIndex : null,
    onTextPlaybackRepresentationModeChange: handleStructuredTextPlaybackRepresentationModeChange,
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