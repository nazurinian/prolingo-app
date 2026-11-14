import React from 'react';
import { AlertTriangle, CheckSquare, Circle, CheckCircle2, FileArchive, Loader2, Music, RotateCcw, Square, X, Download, FolderTree, Layers, Sparkles } from 'lucide-react';
import { SafetyConfirmDialog } from '../modals/ConfirmDialog.jsx';
import { getTextStructuredBatchTelemetrySnapshot, subscribeTextStructuredBatchTelemetry } from '../../services/audio/textStructuredBatchTelemetryService.js';
import {
  TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES,
  applyTextStructuredBulkVoiceSelectionChange,
  validateTextStructuredBulkVoiceDraft
} from '../../domain/text/textStructuredBulkGenerationDomain.js';
import { TEXT_STRUCTURED_EDITOR_MODEL } from '../../constants/textDatabaseConstants.js';
import { getTextWorkspaceLabel } from '../../domain/text/textWorkspaceTaxonomyDomain.js';
import { isEdgeVoiceUnavailable } from '../../constants/voiceConstants.js';
import { formatEdgeVoiceLabel, groupEdgeVoicesByRegion } from '../../domain/audio/voicePresentationDomain.js';
import { EdgeVoiceOptgroups } from '../common/GroupedVoiceSelect.jsx';
import { getTextResetButtonState, isTextBulkGenerationDirty } from '../../domain/text/textStructuredResetPresentationDomain.js';

const compactVoiceLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const tail = raw.split('-').pop() || raw;
  return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw;
};

const memoComponent = typeof React.memo === 'function' ? React.memo : fn => fn;

const ToggleRow = memoComponent(({ checked, disabled = false, onClick, children, tone = 'indigo', selectionMode = 'multiple', testId = undefined }) => {
  const activeClass = tone === 'amber'
    ? 'text-amber-700 dark:text-amber-300'
    : 'text-indigo-700 dark:text-indigo-300';
  const isSingle = selectionMode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-text-bulk-voice-option={testId}
      aria-pressed={checked}
      className={`flex min-w-0 w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[10px] font-bold transition-colors ${checked ? `${activeClass} bg-slate-100/80 dark:bg-slate-800/80` : 'text-slate-500 dark:text-slate-400'} ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
    >
      {isSingle
        ? (checked ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0"/> : <Circle className="h-3.5 w-3.5 flex-shrink-0"/>)
        : (checked ? <CheckSquare className="h-3.5 w-3.5 flex-shrink-0"/> : <Square className="h-3.5 w-3.5 flex-shrink-0"/>)}
      <span className="truncate">{children}</span>
    </button>
  );
});

const ScopeButton = memoComponent(({ active, disabled, onClick, children }) => <button
  type="button"
  disabled={disabled}
  onClick={onClick}
  className={`min-h-9 rounded-lg border px-2.5 py-1.5 text-[9px] font-black transition ${active ? 'border-cyan-600 bg-cyan-600 text-white shadow-sm' : 'border-cyan-200 dark:border-cyan-900 bg-white dark:bg-slate-900 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-50/60'} disabled:opacity-35`}
>{children}</button>);

const TextBatchLiveTelemetry = memoComponent(({ fallbackTotal = 0 }) => {
  const liveTelemetry = React.useSyncExternalStore(
    subscribeTextStructuredBatchTelemetry,
    getTextStructuredBatchTelemetrySnapshot,
    getTextStructuredBatchTelemetrySnapshot
  );
  if (!liveTelemetry?.sessionId) return null;
  const progressTotal = Number(liveTelemetry?.total || fallbackTotal || 0);
  const progressDone = Number(liveTelemetry?.processed || 0);
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0;

  return (
    <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/15 p-3 text-[9px] space-y-2" data-live-batch-telemetry="text">
      <div className="flex items-center justify-between gap-2 font-black text-cyan-800 dark:text-cyan-300">
        <span>Live Bulk Audio • {String(liveTelemetry.status || 'idle').replaceAll('-', ' ')}</span>
        <span>{progressDone}/{progressTotal} ({progressPercent}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950">
        <div className="h-full rounded-full bg-cyan-600 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-[8px] text-slate-600 dark:text-slate-300">
        <span>Ready est.: {liveTelemetry.readyEstimate || 0}</span><span>Missing est.: {liveTelemetry.missingEstimate || 0}</span>
        <span>Stale est.: {liveTelemetry.staleEstimate || 0}</span><span>Failed: {liveTelemetry.failed || 0}</span>
        <span>Logical scope: {liveTelemetry.logicalRequirements || 0}</span><span>Unique physical: {liveTelemetry.uniquePhysicalRequirements || 0}</span>
        <span>Selected logical: {liveTelemetry.selectedLogicalRequirements || 0}</span><span>Selected physical: {liveTelemetry.selectedUniquePhysicalRequirements || 0}</span>
        <span>Generated physical: {liveTelemetry.generatedPhysical ?? liveTelemetry.generated ?? 0}</span><span>Reused physical: {liveTelemetry.reusedPhysical || 0}</span>
        <span>Skipped Ready: {liveTelemetry.skippedReady || 0}</span><span>Skipped Stale: {liveTelemetry.skippedStale || 0}</span>
        <span>Remaining selected: {liveTelemetry.remaining || 0}</span>
      </div>
      <p className="text-[8px] text-cyan-700/80 dark:text-cyan-300/80">Counter UI only • no per-audio IndexedDB inventory scan{liveTelemetry.reconciled ? ' • final durable commit reconciled' : ''}.</p>
    </div>
  );
});

const TextBatchStopButtonContent = memoComponent(({ fallbackTotal = 0, fallbackStatusText = '' }) => {
  const liveTelemetry = React.useSyncExternalStore(
    subscribeTextStructuredBatchTelemetry,
    getTextStructuredBatchTelemetrySnapshot,
    getTextStructuredBatchTelemetrySnapshot
  );
  if (!liveTelemetry?.sessionId) {
    return <>{fallbackStatusText || 'STOP BULK JOB'}</>;
  }
  const progressTotal = Number(liveTelemetry?.total || fallbackTotal || 0);
  const progressDone = Number(liveTelemetry?.processed || 0);
  const status = String(liveTelemetry?.status || '').toLowerCase();
  if (status === 'cancelling') {
    return <>Stopping… {progressDone}/{progressTotal}</>;
  }
  if (status === 'completed' || status === 'completed-with-errors') {
    return <>Completing {progressDone}/{progressTotal}</>;
  }
  return <>STOP {progressDone}/{progressTotal}</>;
});

export const TextBatchPopup = memoComponent(({
  batchPanelRef,
  setIsBatchOpen,
  structuredTextBatch,
  inline = false,
  showClose = true
}) => {
  const [bulkExportConfirmFormat, setBulkExportConfirmFormat] = React.useState(null);
  const [bulkResetConfirmOpen, setBulkResetConfirmOpen] = React.useState(false);
  const savedTextVoiceIds = Array.isArray(structuredTextBatch?.preferences?.bulkTextVoiceIds)
    ? structuredTextBatch.preferences.bulkTextVoiceIds
    : [];
  const savedMeaningVoiceIds = Array.isArray(structuredTextBatch?.preferences?.bulkMeaningVoiceIds)
    ? structuredTextBatch.preferences.bulkMeaningVoiceIds
    : [];

  const [textVoiceMode, setTextVoiceMode] = React.useState(() => (
    savedTextVoiceIds.length > 1
      ? TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE
      : TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE
  ));
  const [meaningVoiceMode, setMeaningVoiceMode] = React.useState(() => (
    savedMeaningVoiceIds.length > 1
      ? TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE
      : TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE
  ));
  const [draftTextEmpty, setDraftTextEmpty] = React.useState(() => savedTextVoiceIds.length === 0 && Boolean(structuredTextBatch?.preferences?.bulkTextVoiceIds));
  const [draftMeaningEmpty, setDraftMeaningEmpty] = React.useState(() => savedMeaningVoiceIds.length === 0 && Boolean(structuredTextBatch?.preferences?.bulkMeaningVoiceIds));

  React.useEffect(() => {
    if (Array.isArray(structuredTextBatch?.preferences?.bulkTextVoiceIds)) {
      if (structuredTextBatch.preferences.bulkTextVoiceIds.length === 0) {
        setDraftTextEmpty(true);
      }
    }
  }, [structuredTextBatch?.preferences?.bulkTextVoiceIds]);

  React.useEffect(() => {
    if (Array.isArray(structuredTextBatch?.preferences?.bulkMeaningVoiceIds)) {
      if (structuredTextBatch.preferences.bulkMeaningVoiceIds.length === 0) {
        setDraftMeaningEmpty(true);
      }
    }
  }, [structuredTextBatch?.preferences?.bulkMeaningVoiceIds]);

  const rawGenerationCoverage = structuredTextBatch?.generationCoverage || structuredTextBatch?.coverage || {};
  const exportCoverage = structuredTextBatch?.exportCoverage || {};
  const exportFormat = structuredTextBatch?.preferences?.bulkExportFormat || 'portable-zip';
  const exportVoicePolicy = structuredTextBatch?.preferences?.bulkExportVoicePolicy || 'all-selected';
  const exportRepresentation = structuredTextBatch?.preferences?.bulkExportRepresentation || 'split';
  const textScope = structuredTextBatch?.scope || { scopeMode: 'workspace', cardId: null };
  const scopeMode = textScope?.scopeMode || 'workspace';

  const includeTextChannel = structuredTextBatch?.preferences?.generateText !== false;
  const includeMeaningChannel = structuredTextBatch?.preferences?.generateMeaning !== false;

  const bulkTextVoiceIds = draftTextEmpty ? [] : savedTextVoiceIds;
  const bulkMeaningVoiceIds = draftMeaningEmpty ? [] : savedMeaningVoiceIds;

  const voiceValidation = validateTextStructuredBulkVoiceDraft({
    includeText: includeTextChannel,
    includeMeaning: includeMeaningChannel,
    textVoiceIds: bulkTextVoiceIds,
    meaningVoiceIds: bulkMeaningVoiceIds,
    edgeVoices: structuredTextBatch?.voices
  });

  // Never silently substitute previous/default voices when UI draft is empty (0 selected).
  const bulkTextVoiceSummary = draftTextEmpty
    ? []
    : (structuredTextBatch?.bulkTextVoicesResolved?.length && !draftTextEmpty
      ? structuredTextBatch.bulkTextVoicesResolved
      : bulkTextVoiceIds
    ).map(compactVoiceLabel);

  const bulkMeaningVoiceSummary = draftMeaningEmpty
    ? []
    : (structuredTextBatch?.bulkMeaningVoicesResolved?.length && !draftMeaningEmpty
      ? structuredTextBatch.bulkMeaningVoicesResolved
      : bulkMeaningVoiceIds
    ).map(compactVoiceLabel);

  // If the user has an invalid enabled channel (0 voices selected) and parent coverage was not
  // recomputed with allowEmptyVoiceSelection, ensure UI coverage never misleads with substituted counts.
  const generationCoverage = voiceValidation.hasInvalidEnabledChannel && !structuredTextBatch?.allowEmptyVoiceSelectionApplied
    ? {
        ...rawGenerationCoverage,
        total: 0,
        covered: 0,
        ready: 0,
        reusable: 0,
        stale: 0,
        missing: 0,
        needDownload: 0,
        needGenerate: 0,
        needGenerateMissing: 0,
        needGenerateWithStale: 0,
        logicalRequirements: 0,
        uniquePhysicalRequirements: 0,
        splitLogical: 0,
        fullLogical: 0
      }
    : rawGenerationCoverage;

  const batchVoices = structuredTextBatch?.voices;
  const {
    englishBulkVoices,
    meaningBulkVoices,
    englishBulkGroups,
    meaningBulkGroups
  } = React.useMemo(() => {
    const allVoices = Array.isArray(batchVoices) ? batchVoices : [];
    const enVoices = allVoices.filter(v => String(v?.lang || '').startsWith('en-'));
    const idVoices = allVoices.filter(v => /-ID$/i.test(String(v?.lang || '')));
    return {
      englishBulkVoices: enVoices,
      meaningBulkVoices: idVoices,
      englishBulkGroups: Object.entries(groupEdgeVoicesByRegion(enVoices, 'main'))
        .filter(([, items]) => items.length > 0),
      meaningBulkGroups: Object.entries(groupEdgeVoicesByRegion(idVoices, 'meaning'))
        .filter(([, items]) => items.length > 0)
    };
  }, [batchVoices]);
  const missingBulkTextVoiceIds = bulkTextVoiceIds.filter(voiceId => !englishBulkVoices.some(voice => voice.id === voiceId));
  const missingBulkMeaningVoiceIds = bulkMeaningVoiceIds.filter(voiceId => !meaningBulkVoices.some(voice => voice.id === voiceId));
  const missingGlobalTextEdgeVoiceId = structuredTextBatch?.preferences?.edgeTextVoiceId
    && !englishBulkVoices.some(voice => voice.id === structuredTextBatch.preferences.edgeTextVoiceId)
    ? structuredTextBatch.preferences.edgeTextVoiceId
    : '';
  const missingGlobalMeaningEdgeVoiceId = structuredTextBatch?.preferences?.edgeMeaningVoiceId
    && !meaningBulkVoices.some(voice => voice.id === structuredTextBatch.preferences.edgeMeaningVoiceId)
    ? structuredTextBatch.preferences.edgeMeaningVoiceId
    : '';
  const selectedExportTextVoiceId = structuredTextBatch?.preferences?.bulkExportTextVoiceId || bulkTextVoiceIds[0] || '';
  const missingExportTextVoiceId = selectedExportTextVoiceId
    && !englishBulkVoices.some(voice => voice.id === selectedExportTextVoiceId)
    ? selectedExportTextVoiceId
    : '';
  const selectedExportMeaningVoiceId = structuredTextBatch?.preferences?.bulkExportMeaningVoiceId || bulkMeaningVoiceIds[0] || '';
  const missingExportMeaningVoiceId = selectedExportMeaningVoiceId
    && !meaningBulkVoices.some(voice => voice.id === selectedExportMeaningVoiceId)
    ? selectedExportMeaningVoiceId
    : '';
  const cardOptions = structuredTextBatch?.cardOptions || [];
  const workspaceOptions = structuredTextBatch?.workspaceOptions || structuredTextBatch?.documentOptions || [];
  const selectedWorkspaceIds = textScope?.selectedDocumentIds || [];
  const resolvedWorkspaces = structuredTextBatch?.workspacesResolved || structuredTextBatch?.documentsResolved || [];
  const running = Boolean(structuredTextBatch?.running);
  const resetDisabled = Boolean(structuredTextBatch?.resetDisabled);
  const bulkDirty = isTextBulkGenerationDirty(structuredTextBatch?.preferences || {});
  const bulkResetState = getTextResetButtonState({ dirty: bulkDirty, busyBlocked: running || resetDisabled });
  const hasCollectionScope = Boolean(structuredTextBatch?.activeCollectionId) && workspaceOptions.some(workspace => workspace.collectionId === structuredTextBatch.activeCollectionId);
  const selectedCard = cardOptions.find(card => card.id === textScope?.cardId) || cardOptions[0] || null;
  const failedJobs = structuredTextBatch?.generationState?.failedJobs || [];

  const splitSelected = structuredTextBatch?.preferences?.bulkGenerateSplit !== false;
  const fullSelected = structuredTextBatch?.preferences?.bulkGenerateFull === true;
  const activeRepresentationPreset = splitSelected && fullSelected
    ? 'both'
    : fullSelected
      ? 'full'
      : 'split';

  const setRepresentationPreset = preset => {
    if (preset === 'both') {
      structuredTextBatch?.onPreferencesChange?.({ bulkGenerateSplit: true, bulkGenerateFull: true });
    } else if (preset === 'full') {
      structuredTextBatch?.onPreferencesChange?.({ bulkGenerateSplit: false, bulkGenerateFull: true });
    } else {
      structuredTextBatch?.onPreferencesChange?.({ bulkGenerateSplit: true, bulkGenerateFull: false });
    }
  };

  const handleVoiceModeChange = (channel, nextMode) => {
    const normalizedMode = nextMode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE
      ? TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE
      : TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE;
    if (channel === 'text') {
      setTextVoiceMode(normalizedMode);
      if (normalizedMode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE && bulkTextVoiceIds.length > 1) {
        const single = [bulkTextVoiceIds[0]];
        setDraftTextEmpty(false);
        structuredTextBatch?.onVoiceDraftChange?.({ channel: 'text', empty: false, voiceIds: single, mode: normalizedMode });
        structuredTextBatch?.onPreferencesChange?.({ bulkTextVoiceIds: single });
      }
    } else {
      setMeaningVoiceMode(normalizedMode);
      if (normalizedMode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE && bulkMeaningVoiceIds.length > 1) {
        const single = [bulkMeaningVoiceIds[0]];
        setDraftMeaningEmpty(false);
        structuredTextBatch?.onVoiceDraftChange?.({ channel: 'meaning', empty: false, voiceIds: single, mode: normalizedMode });
        structuredTextBatch?.onPreferencesChange?.({ bulkMeaningVoiceIds: single });
      }
    }
  };

  const toggleBulkVoice = (key, voiceId, explicitMode = null) => {
    const isMeaning = key === 'bulkMeaningVoiceIds';
    const mode = explicitMode || (isMeaning ? meaningVoiceMode : textVoiceMode);
    const current = isMeaning ? bulkMeaningVoiceIds : bulkTextVoiceIds;
    const next = applyTextStructuredBulkVoiceSelectionChange({
      currentVoiceIds: current,
      targetVoiceId: voiceId,
      mode
    });

    if (isMeaning) {
      const isEmpty = next.length === 0;
      setDraftMeaningEmpty(isEmpty);
      structuredTextBatch?.onVoiceDraftChange?.({ channel: 'meaning', empty: isEmpty, voiceIds: next, mode });
      if (!isEmpty) {
        structuredTextBatch?.onPreferencesChange?.({ [key]: next });
      }
      return;
    }

    const isEmpty = next.length === 0;
    setDraftTextEmpty(isEmpty);
    structuredTextBatch?.onVoiceDraftChange?.({ channel: 'text', empty: isEmpty, voiceIds: next, mode });
    if (!isEmpty) {
      structuredTextBatch?.onPreferencesChange?.({ [key]: next });
    }
  };

  const toggleBulkRepresentation = key => {
    const split = structuredTextBatch?.preferences?.bulkGenerateSplit !== false;
    const full = structuredTextBatch?.preferences?.bulkGenerateFull === true;
    if (key === 'bulkGenerateSplit') {
      if (split && !full) return;
      structuredTextBatch?.onPreferencesChange?.({ bulkGenerateSplit: !split });
      return;
    }
    if (full && !split) return;
    structuredTextBatch?.onPreferencesChange?.({ bulkGenerateFull: !full });
  };
  const setScopeMode = nextMode => structuredTextBatch?.onScopeChange?.({ scopeMode: nextMode });
  const selectCard = cardId => structuredTextBatch?.onScopeChange?.({ scopeMode: 'card', cardId });
  const toggleSelectedWorkspace = workspaceId => {
    const next = selectedWorkspaceIds.includes(workspaceId)
      ? selectedWorkspaceIds.filter(id => id !== workspaceId)
      : [...selectedWorkspaceIds, workspaceId];
    structuredTextBatch?.onScopeChange?.({ selectedDocumentIds: next });
  };
  const scopeSummary = scopeMode === 'card'
    ? `${structuredTextBatch?.workspaceTitle || 'Text Workspace'} • Card ${selectedCard?.index || '—'}${selectedCard?.title ? ` • ${selectedCard.title}` : ''}`
    : scopeMode === 'workspace'
      ? `${structuredTextBatch?.workspaceTitle || 'Text Workspace'} • Full Workspace`
      : scopeMode === 'collection'
        ? `${structuredTextBatch?.activeCollectionTitle || 'Book Collection'} • ${resolvedWorkspaces.length} Workspace${resolvedWorkspaces.length === 1 ? '' : 's'}`
        : scopeMode === 'selected'
          ? `${resolvedWorkspaces.length} selected Workspace${resolvedWorkspaces.length === 1 ? '' : 's'} • ${generationCoverage?.logicalRequirements || generationCoverage?.total || 0} generation requirements`
          : `All Book Collections + Unfiled • ${resolvedWorkspaces.length} Workspaces • ${generationCoverage?.logicalRequirements || generationCoverage?.total || 0} generation requirements`;

  const panelClass = inline
    ? 'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col animate-in fade-in duration-150'
    : 'absolute top-full left-0 mt-2 w-[22rem] sm:w-[25rem] max-h-[82vh] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200';

  const enPlanStatusText = !includeTextChannel
    ? 'Channel disabled (not generated)'
    : bulkTextVoiceSummary.length > 0
      ? bulkTextVoiceSummary.join(' + ')
      : '0 selected (choose at least 1 EN voice)';

  const idPlanStatusText = !includeMeaningChannel
    ? 'Channel disabled (not generated)'
    : bulkMeaningVoiceSummary.length > 0
      ? bulkMeaningVoiceSummary.join(' + ')
      : '0 selected (choose at least 1 ID voice)';

  const draftBlocked = voiceValidation.noChannelsEnabled || voiceValidation.hasInvalidEnabledChannel;
  const opVoiceValidation = structuredTextBatch?.operationVoiceValidation || structuredTextBatch?.bulkPlan?.operationVoiceValidation || null;
  const canGenerateMissing = !draftBlocked && !(opVoiceValidation ? opVoiceValidation.missing?.hasUnavailableVoice : voiceValidation.hasUnavailableVoice);
  const canGenerateMissingAndStale = !draftBlocked && !(opVoiceValidation ? opVoiceValidation.missingAndStale?.hasUnavailableVoice : voiceValidation.hasUnavailableVoice);
  const canRegenerateSelected = !draftBlocked && !(opVoiceValidation ? opVoiceValidation.all?.hasUnavailableVoice : voiceValidation.hasUnavailableVoice);
  const hasAnyBlockedOpVoice = opVoiceValidation
    ? Boolean(
        ((generationCoverage?.needGenerateMissing || 0) > 0 && opVoiceValidation.missing?.hasUnavailableVoice)
        || ((generationCoverage?.stale || 0) > 0 && opVoiceValidation.missingAndStale?.hasUnavailableVoice)
        || ((generationCoverage?.total || 0) > 0 && opVoiceValidation.all?.hasUnavailableVoice)
      )
    : voiceValidation.hasUnavailableVoice;
  const showBlockedGenerateBanner = draftBlocked || hasAnyBlockedOpVoice;

  return (
    <div ref={batchPanelRef} className={panelClass} data-text-batch-workspace="true">
      {/* Header */}
      <div className="bg-slate-800 text-white px-3.5 py-2.5 text-xs font-bold flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-teal-400 shrink-0"/>
          <span className="truncate">Bulk Audio • Structured Text</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="rounded-full bg-teal-500/25 px-2 py-0.5 text-[8px] font-black uppercase text-teal-100">Edge • Workspace-aware</span>
          {structuredTextBatch?.resetPreferences && (
            <button
              type="button"
              disabled={bulkResetState.disabled}
              onClick={() => setBulkResetConfirmOpen(true)}
              data-text-reset-bulk-preferences="true"
              className={`inline-flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-500/20 px-2 py-1 text-[9px] font-black text-amber-100 ${bulkResetState.dirty && !bulkResetState.busyBlocked ? 'hover:bg-amber-500/35' : ''} ${bulkResetState.opacityClass} ${bulkResetState.interactionClass}`}
              title="Reset Bulk Audio generation and export preferences to defaults"
            >
              <RotateCcw className="w-3 h-3"/>
              <span>Reset Bulk</span>
            </button>
          )}
        </div>
        {showClose && <button type="button" onClick={() => setIsBatchOpen(false)} className="rounded-lg p-1 hover:bg-white/10" aria-label="Close Text Batch"><X className="w-4 h-4"/></button>}
      </div>

      <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
        {/* Relationship Banner: Card Audio vs Bulk Audio vs Audio Library */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-3 py-2 text-[9px] leading-relaxed text-slate-600 dark:text-slate-300">
          <span className="font-black text-slate-700 dark:text-slate-100">Audio Workflow:</span> Use <b>Card Audio</b> for single-card voice overrides, <b>Bulk Audio</b> here for multi-voice / Full+Split batch generation & ZIP exports, and <b>Audio Library</b> (Sidebar) to inspect Staging or import Portable ZIPs.
        </div>

        {/* 1. Scope Selection */}
        <div className="rounded-xl border border-cyan-200/80 dark:border-cyan-900 bg-cyan-50/45 dark:bg-cyan-950/15 p-3 text-[9px] space-y-2.5" data-text-batch-scope="true">
          <div className="flex items-center gap-2">
            <FolderTree className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400"/>
            <span className="text-[10px] font-black uppercase tracking-wide text-cyan-800 dark:text-cyan-300">1. Target Scope</span>
            <span className="ml-auto rounded bg-cyan-100/80 dark:bg-cyan-900/50 px-1.5 py-0.5 text-[8px] font-black text-cyan-800 dark:text-cyan-200">{resolvedWorkspaces.length} Workspace{resolvedWorkspaces.length === 1 ? '' : 's'}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5" data-text-batch-scope-tabs="true">
            <ScopeButton active={scopeMode === 'card'} disabled={running || !structuredTextBatch?.activeWorkspaceId || !cardOptions.length} onClick={() => setScopeMode('card')}>CURRENT CARD</ScopeButton>
            <ScopeButton active={scopeMode === 'workspace'} disabled={running || !structuredTextBatch?.activeWorkspaceId} onClick={() => setScopeMode('workspace')}>CURRENT WORKSPACE</ScopeButton>
            <ScopeButton active={scopeMode === 'collection'} disabled={running || !hasCollectionScope} onClick={() => setScopeMode('collection')}>BOOK COLLECTION</ScopeButton>
            <ScopeButton active={scopeMode === 'selected'} disabled={running || !workspaceOptions.length} onClick={() => setScopeMode('selected')}>SELECTED WORKSPACES</ScopeButton>
          </div>

          {scopeMode === 'card' && <div className="pt-1" data-text-batch-card-select="true">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300">Card in current Workspace
              <select disabled={running || !cardOptions.length} value={selectedCard?.id || ''} onChange={event => selectCard(event.target.value)} className="mt-1 w-full rounded-lg border border-cyan-200 dark:border-cyan-900 bg-white dark:bg-slate-900 p-2 text-[10px] font-medium dark:text-white">
                {cardOptions.map(card => <option key={card.id} value={card.id}>Card {card.index} • {card.title} • {card.blockType === 'conversation' ? 'Conversation' : 'Paragraph'}</option>)}
              </select>
            </label>
            <p className="mt-1 text-[8px] text-slate-500 dark:text-slate-400">Only this Card is targeted. Per-Segment and per-Speaker download profiles remain authoritative.</p>
          </div>}

          {scopeMode === 'workspace' && <p className="text-[8px] text-slate-500 dark:text-slate-400">Includes all eligible Paragraph Cards in the active Workspace.</p>}
          {scopeMode === 'collection' && <p className="text-[8px] text-slate-500 dark:text-slate-400">Includes every structured Workspace in <span className="font-bold">{structuredTextBatch?.activeCollectionTitle || 'the active Book Collection'}</span>.</p>}

          {scopeMode === 'selected' && <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-cyan-100 dark:border-cyan-900 bg-white/80 dark:bg-slate-900/45 p-2" data-text-batch-selected-workspaces="true">
            {workspaceOptions.map(workspace => <ToggleRow key={workspace.id} checked={selectedWorkspaceIds.includes(workspace.id)} disabled={running} onClick={() => toggleSelectedWorkspace(workspace.id)}>
              {workspace.title} • {workspace.collectionTitle || 'Unfiled'} • {getTextWorkspaceLabel(workspace, TEXT_STRUCTURED_EDITOR_MODEL)}
            </ToggleRow>)}
            {!workspaceOptions.length && <p className="text-[8px] text-slate-400">No structured Workspaces available.</p>}
          </div>}

          <details className="rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/35 p-2" data-text-batch-advanced-scope="true">
            <summary className="cursor-pointer text-[8px] font-black uppercase tracking-wide text-slate-500">Advanced Global Scope</summary>
            <div className="mt-2">
              <ScopeButton active={scopeMode === 'all'} disabled={running || !workspaceOptions.length} onClick={() => setScopeMode('all')}>ALL BOOK COLLECTIONS + UNFILED</ScopeButton>
              <p className="mt-1.5 text-[8px] text-slate-400">Includes every structured Workspace across all Book Collections and Unfiled Root.</p>
            </div>
          </details>

          <div className="rounded-lg border border-cyan-100 dark:border-cyan-900/60 bg-white/80 dark:bg-slate-900/45 p-2 text-[8px] text-slate-500" data-text-batch-workspace-summary="true">
            <div className="font-black text-cyan-800 dark:text-cyan-300">{scopeSummary}</div>
            {resolvedWorkspaces.slice(0, 4).map(workspace => <div key={workspace.id} className="mt-0.5 flex gap-2"><span className="truncate">{workspace.title}</span><span className="ml-auto shrink-0 font-semibold text-slate-400">{workspace.jobCount || 0} jobs</span></div>)}
            {resolvedWorkspaces.length > 4 && <div className="mt-0.5 text-slate-400">+{resolvedWorkspaces.length - 4} more Workspaces</div>}
          </div>
        </div>

        {/* 2. Generation Configuration (Channels, Full/Split Representation, Voices) */}
        <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-3 space-y-2.5" data-text-bulk-p5-selection="true">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"/>
              <span className="text-[10px] font-black uppercase tracking-wide text-indigo-800 dark:text-indigo-300">2. Generate Selection</span>
            </div>
            <span className="rounded bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 text-[8px] font-black text-indigo-700 dark:text-indigo-300">Paragraph Cards</span>
          </div>

          {/* Language Channels */}
          <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/60 bg-white/85 dark:bg-slate-900/40 p-2 space-y-1">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Channels to Generate</p>
            <div className="grid grid-cols-2 gap-1.5">
              <ToggleRow checked={includeTextChannel} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateText: !includeTextChannel })}>EN (Text)</ToggleRow>
              <ToggleRow checked={includeMeaningChannel} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateMeaning: !includeMeaningChannel })} tone="amber">ID (Meaning)</ToggleRow>
            </div>
          </div>

          {/* Representation Mode (Full + Split Recommended, Full Only, Split Only) */}
          <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/60 bg-white/85 dark:bg-slate-900/40 p-2 space-y-2" data-text-bulk-representations="true">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[8px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Audio Representation</p>
              <span className="text-[8px] font-semibold text-indigo-600 dark:text-indigo-300">Full + Split recommended</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'both', label: 'Full + Split', sub: 'Recommended' },
                { id: 'full', label: 'Full Only', sub: 'Card MP3' },
                { id: 'split', label: 'Split Only', sub: 'Sentences' }
              ].map(option => (
                <button
                  key={option.id}
                  type="button"
                  disabled={running}
                  onClick={() => setRepresentationPreset(option.id)}
                  aria-pressed={activeRepresentationPreset === option.id}
                  className={`rounded-lg border px-2 py-1.5 text-center transition-all disabled:opacity-40 ${
                    activeRepresentationPreset === option.id
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <span className="block text-[9px] font-black leading-tight">{option.label}</span>
                  <span className={`block text-[7px] font-bold ${activeRepresentationPreset === option.id ? 'text-indigo-100' : 'text-slate-400'}`}>{option.sub}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
              <ToggleRow checked={splitSelected} disabled={running} onClick={() => toggleBulkRepresentation('bulkGenerateSplit')}>Split</ToggleRow>
              <ToggleRow checked={fullSelected} disabled={running} onClick={() => toggleBulkRepresentation('bulkGenerateFull')}>Full</ToggleRow>
              <span className="ml-auto text-[8px] text-slate-400">At least one stays selected</span>
            </div>
          </div>

          {/* EN Edge Voices: Single Voice vs Multiple Voices */}
          <div className={`rounded-lg border p-2.5 space-y-2 ${!includeTextChannel ? 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/25 opacity-65' : (voiceValidation.textEmptyWarning || voiceValidation.unavailableTextWarning) ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' : 'border-indigo-100 dark:border-indigo-900 bg-white/85 dark:bg-slate-900/40'}`} data-text-bulk-en-voice-section="true">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="min-w-0">
                <p className="text-[9px] font-black text-indigo-700 dark:text-indigo-300">
                  EN Edge Voices ({includeTextChannel ? bulkTextVoiceIds.length : 'Channel Off'}) • {includeTextChannel ? (bulkTextVoiceSummary.join(' + ') || 'None selected') : 'Disabled'}
                </p>
                <p className="text-[8px] text-slate-500 dark:text-slate-400">
                  {textVoiceMode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE
                    ? 'Single Voice mode: tapping any voice directly replaces the active EN voice.'
                    : 'Multiple Voices mode: check one or more EN voices to generate in parallel.'}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-indigo-200 dark:border-indigo-800 bg-slate-100 dark:bg-slate-800 p-0.5" data-text-bulk-en-voice-mode="true">
                {[
                  [TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE, 'Single Voice'],
                  [TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE, 'Multiple Voices']
                ].map(([modeId, modeLabel]) => (
                  <button
                    key={modeId}
                    type="button"
                    disabled={running || !includeTextChannel}
                    aria-pressed={textVoiceMode === modeId}
                    onClick={() => handleVoiceModeChange('text', modeId)}
                    data-text-bulk-en-mode-btn={modeId}
                    className={`rounded-md px-2 py-1 text-[8px] font-black transition ${
                      textVoiceMode === modeId
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
                    } disabled:opacity-40`}
                  >
                    {modeLabel}
                  </button>
                ))}
              </div>
            </div>

            {includeTextChannel ? (
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1" data-text-bulk-en-voices="true">
                {missingBulkTextVoiceIds.map(voiceId => (
                  <div key={`missing-text-${voiceId}`} className="flex items-center gap-1">
                    <ToggleRow
                      checked={true}
                      disabled={running}
                      selectionMode={textVoiceMode}
                      testId={`text:${voiceId}`}
                      onClick={() => toggleBulkVoice('bulkTextVoiceIds', voiceId, textVoiceMode)}
                    >
                      Unavailable · {voiceId}
                    </ToggleRow>
                    {!running && (
                      <button
                        type="button"
                        onClick={() => toggleBulkVoice('bulkTextVoiceIds', voiceId, TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE)}
                        data-text-bulk-remove-unavailable={`text:${voiceId}`}
                        className="shrink-0 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-1 text-[8px] font-black text-amber-800 dark:text-amber-200 hover:bg-amber-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {englishBulkGroups.map(([groupLabel, groupVoices]) => (
                  <div key={groupLabel} className="space-y-0.5 pt-1 first:pt-0" data-text-bulk-region-group={groupLabel}>
                    <div className="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {groupLabel}
                    </div>
                    {groupVoices.map(voice => {
                      const isChecked = bulkTextVoiceIds.includes(voice.id);
                      const voiceUnavailable = isEdgeVoiceUnavailable(voice, structuredTextBatch?.voices);
                      return (
                        <div key={voice.id} className="flex items-center gap-1">
                          <ToggleRow
                            checked={isChecked}
                            disabled={running || (voiceUnavailable && !isChecked)}
                            selectionMode={textVoiceMode}
                            testId={`text:${voice.id}`}
                            onClick={() => {
                              if (voiceUnavailable && !isChecked) return;
                              toggleBulkVoice('bulkTextVoiceIds', voice.id, textVoiceMode);
                            }}
                          >
                            {formatEdgeVoiceLabel(voice, { edgeVoices: structuredTextBatch?.voices })}
                          </ToggleRow>
                          {isChecked && voiceUnavailable && !running && (
                            <button
                              type="button"
                              onClick={() => toggleBulkVoice('bulkTextVoiceIds', voice.id, TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE)}
                              data-text-bulk-remove-unavailable={`text:${voice.id}`}
                              className="shrink-0 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-1 text-[8px] font-black text-amber-800 dark:text-amber-200 hover:bg-amber-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[8px] italic text-slate-500 dark:text-slate-400" data-text-bulk-en-disabled-note="true">
                EN (Text) channel is unchecked above and will be skipped during generation.
              </p>
            )}

            {(voiceValidation.textEmptyWarning || voiceValidation.unavailableTextWarning) && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-100/80 dark:bg-amber-950/50 px-2.5 py-1.5 text-[8px] font-bold text-amber-900 dark:text-amber-200 flex items-start gap-1.5" role="alert" data-text-bulk-voice-warning="text">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"/>
                <span>{[voiceValidation.textEmptyWarning, voiceValidation.unavailableTextWarning].filter(Boolean).join(' ')}</span>
              </div>
            )}
          </div>

          {/* ID Edge Voices: Single Voice vs Multiple Voices */}
          <div className={`rounded-lg border p-2.5 space-y-2 ${!includeMeaningChannel ? 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/25 opacity-65' : (voiceValidation.meaningEmptyWarning || voiceValidation.unavailableMeaningWarning) ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' : 'border-amber-100 dark:border-amber-900 bg-white/85 dark:bg-slate-900/40'}`} data-text-bulk-id-voice-section="true">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="min-w-0">
                <p className="text-[9px] font-black text-amber-700 dark:text-amber-300">
                  ID Edge Voices ({includeMeaningChannel ? bulkMeaningVoiceIds.length : 'Channel Off'}) • {includeMeaningChannel ? (bulkMeaningVoiceSummary.join(' + ') || 'None selected') : 'Disabled'}
                </p>
                <p className="text-[8px] text-slate-500 dark:text-slate-400">
                  {meaningVoiceMode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE
                    ? 'Single Voice mode: tapping any voice directly replaces the active ID voice.'
                    : 'Multiple Voices mode: check one or more ID voices to generate in parallel.'}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-amber-200 dark:border-amber-800 bg-slate-100 dark:bg-slate-800 p-0.5" data-text-bulk-id-voice-mode="true">
                {[
                  [TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE, 'Single Voice'],
                  [TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE, 'Multiple Voices']
                ].map(([modeId, modeLabel]) => (
                  <button
                    key={modeId}
                    type="button"
                    disabled={running || !includeMeaningChannel}
                    aria-pressed={meaningVoiceMode === modeId}
                    onClick={() => handleVoiceModeChange('meaning', modeId)}
                    data-text-bulk-id-mode-btn={modeId}
                    className={`rounded-md px-2 py-1 text-[8px] font-black transition ${
                      meaningVoiceMode === modeId
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'
                    } disabled:opacity-40`}
                  >
                    {modeLabel}
                  </button>
                ))}
              </div>
            </div>

            {includeMeaningChannel ? (
              <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1" data-text-bulk-id-voices="true">
                {missingBulkMeaningVoiceIds.map(voiceId => (
                  <div key={`missing-meaning-${voiceId}`} className="flex items-center gap-1">
                    <ToggleRow
                      checked={true}
                      disabled={running}
                      tone="amber"
                      selectionMode={meaningVoiceMode}
                      testId={`meaning:${voiceId}`}
                      onClick={() => toggleBulkVoice('bulkMeaningVoiceIds', voiceId, meaningVoiceMode)}
                    >
                      Unavailable · {voiceId}
                    </ToggleRow>
                    {!running && (
                      <button
                        type="button"
                        onClick={() => toggleBulkVoice('bulkMeaningVoiceIds', voiceId, TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE)}
                        data-text-bulk-remove-unavailable={`meaning:${voiceId}`}
                        className="shrink-0 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-1 text-[8px] font-black text-amber-800 dark:text-amber-200 hover:bg-amber-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {meaningBulkGroups.map(([groupLabel, groupVoices]) => (
                  <div key={groupLabel} className="space-y-0.5 pt-1 first:pt-0" data-text-bulk-region-group={groupLabel}>
                    <div className="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {groupLabel}
                    </div>
                    {groupVoices.map(voice => {
                      const isChecked = bulkMeaningVoiceIds.includes(voice.id);
                      const voiceUnavailable = isEdgeVoiceUnavailable(voice, structuredTextBatch?.voices);
                      return (
                        <div key={voice.id} className="flex items-center gap-1">
                          <ToggleRow
                            checked={isChecked}
                            disabled={running || (voiceUnavailable && !isChecked)}
                            tone="amber"
                            selectionMode={meaningVoiceMode}
                            testId={`meaning:${voice.id}`}
                            onClick={() => {
                              if (voiceUnavailable && !isChecked) return;
                              toggleBulkVoice('bulkMeaningVoiceIds', voice.id, meaningVoiceMode);
                            }}
                          >
                            {formatEdgeVoiceLabel(voice, { edgeVoices: structuredTextBatch?.voices })}
                          </ToggleRow>
                          {isChecked && voiceUnavailable && !running && (
                            <button
                              type="button"
                              onClick={() => toggleBulkVoice('bulkMeaningVoiceIds', voice.id, TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE)}
                              data-text-bulk-remove-unavailable={`meaning:${voice.id}`}
                              className="shrink-0 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-1 text-[8px] font-black text-amber-800 dark:text-amber-200 hover:bg-amber-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[8px] italic text-slate-500 dark:text-slate-400" data-text-bulk-id-disabled-note="true">
                ID (Meaning) channel is unchecked above and will be skipped during generation.
              </p>
            )}

            {(voiceValidation.meaningEmptyWarning || voiceValidation.unavailableMeaningWarning) && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-100/80 dark:bg-amber-950/50 px-2.5 py-1.5 text-[8px] font-bold text-amber-900 dark:text-amber-200 flex items-start gap-1.5" role="alert" data-text-bulk-voice-warning="meaning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"/>
                <span>{[voiceValidation.meaningEmptyWarning, voiceValidation.unavailableMeaningWarning].filter(Boolean).join(' ')}</span>
              </div>
            )}
          </div>

          {/* Part F: Renamed & Clarified Global Edge Generation Defaults (Shared with Sidebar) */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/30 p-2.5" data-text-bulk-global-edge-defaults="true">
            <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Global Edge Generation Defaults (Shared with Sidebar)
            </summary>
            <p className="mt-1.5 text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">
              Shared with the Audio Sidebar&apos;s <b>Generate Audio</b> tab and ordinary manual / single-Card generation. Also acts as the fallback voice when <b>FOLLOW PLAYER</b> cannot be mapped to an Edge voice.
            </p>
            <div className="mt-2 grid gap-2">
              <label className="text-[8px] font-bold text-slate-600 dark:text-slate-300">Global Edge EN Default Voice
                <select disabled={running} value={structuredTextBatch?.preferences?.edgeTextVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeTextVoiceId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[10px] dark:text-white">
                  {missingGlobalTextEdgeVoiceId && <option value={missingGlobalTextEdgeVoiceId} disabled>Unavailable · {missingGlobalTextEdgeVoiceId}</option>}
                  <EdgeVoiceOptgroups voices={structuredTextBatch?.voices} context="main" />
                </select>
              </label>
              <label className="text-[8px] font-bold text-slate-600 dark:text-slate-300">Global Edge ID / Meaning Default Voice
                <select disabled={running} value={structuredTextBatch?.preferences?.edgeMeaningVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeMeaningVoiceId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[10px] dark:text-white">
                  {missingGlobalMeaningEdgeVoiceId && <option value={missingGlobalMeaningEdgeVoiceId} disabled>Unavailable · {missingGlobalMeaningEdgeVoiceId}</option>}
                  <EdgeVoiceOptgroups voices={structuredTextBatch?.voices} context="meaning" />
                </select>
              </label>
            </div>
          </details>
        </div>

        {/* 3. Resolved Generate Plan Summary */}
        <div className="rounded-xl border border-sky-200/80 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/15 p-2.5 text-[9px]" data-text-batch-resolved-voices="true">
          <div className="font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Generate Plan</div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-600 dark:text-slate-300">
            <p className="truncate" title={enPlanStatusText} data-text-bulk-plan-en="true">
              <b>EN:</b> <span className={voiceValidation.textEmptyWarning ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>{enPlanStatusText}</span>
            </p>
            <p className="truncate" title={idPlanStatusText} data-text-bulk-plan-id="true">
              <b>ID:</b> <span className={voiceValidation.meaningEmptyWarning ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>{idPlanStatusText}</span>
            </p>
          </div>
          <p className="mt-0.5 text-slate-600 dark:text-slate-300"><b>Representation:</b> {splitSelected ? 'Split' : ''}{splitSelected && fullSelected ? ' + ' : ''}{fullSelected ? 'Full' : ''}</p>
          <p className="mt-1 text-[8px] font-bold text-sky-700 dark:text-sky-300">Generation selection never changes playback priority.</p>
        </div>

        {/* 4. Generation Coverage & Primary Batch Actions */}
        <div className="rounded-xl border border-violet-200/80 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/15 p-3 text-[9px] space-y-2.5" data-audio-generation-coverage-summary="text">
          <div className="flex items-center justify-between font-black text-violet-800 dark:text-violet-300">
            <span className="text-[10px] uppercase tracking-wide">Generation Coverage</span>
            <span className="rounded-md bg-white dark:bg-slate-900 px-2 py-0.5 text-[9px] shadow-sm">{generationCoverage?.ready || 0}/{generationCoverage?.total || 0} Ready</span>
          </div>

          {/* Visual 4-pill status summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/30 p-1.5">
              <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">{generationCoverage?.ready || 0}</p>
              <p className="text-[7px] font-black uppercase text-emerald-800 dark:text-emerald-400">Ready Logical</p>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30 p-1.5">
              <p className="text-xs font-black text-amber-700 dark:text-amber-300">{generationCoverage?.missing || 0}</p>
              <p className="text-[7px] font-black uppercase text-amber-800 dark:text-amber-400">Missing</p>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 p-1.5">
              <p className="text-xs font-black text-rose-700 dark:text-rose-300">{generationCoverage?.stale || 0}</p>
              <p className="text-[7px] font-black uppercase text-rose-800 dark:text-rose-400">Stale</p>
            </div>
            <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/80 dark:bg-sky-950/30 p-1.5" title="Physical audio already exists in Staging/ZIP and only needs logical linking">
              <p className="text-xs font-black text-sky-700 dark:text-sky-300">{generationCoverage?.reusable || 0}</p>
              <p className="text-[7px] font-black uppercase text-sky-800 dark:text-emerald-400">Reusable Physical</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-lg border border-violet-100 dark:border-violet-900/60 bg-white/80 dark:bg-slate-900/40 p-2 text-[8px] text-slate-600 dark:text-slate-300" data-text-bulk-coverage-breakdown="true">
            <span><b>Ready logical:</b> {generationCoverage?.ready || 0}</span>
            <span><b>Reusable physical:</b> {generationCoverage?.reusable || 0}</span>
            <span><b>Missing:</b> {generationCoverage?.missing || 0}</span>
            <span><b>Stale:</b> {generationCoverage?.stale || 0}</span>
            <span><b>Logical requirements:</b> {generationCoverage?.logicalRequirements || 0}</span>
            <span><b>Unique physical requirements:</b> {generationCoverage?.uniquePhysicalRequirements || 0}</span>
            <span><b>Split requirements:</b> {generationCoverage?.splitLogical || 0}</span>
            <span><b>Full requirements:</b> {generationCoverage?.fullLogical || 0}</span>
          </div>
          <p className="text-[8px] leading-relaxed text-slate-500 dark:text-slate-400" data-text-bulk-coverage-explanation="true">
            <b>Logical requirements</b> count every selected Split sentence + Full card slot across chosen voices. <b>Unique physical requirements</b> count deduplicated renders (shared RF / Full identity synthesized once). <b>Reusable physical</b> means the audio binary is already staged and only needs linking. Eligible Paragraph Cards: {generationCoverage?.eligibleBlockCount || 0}{generationCoverage?.skippedConversationBlockCount ? ` • Conversation skipped: ${generationCoverage.skippedConversationBlockCount} (use Card Audio)` : ''}.
          </p>

          {showBlockedGenerateBanner && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-2 text-[8px] font-bold text-amber-800 dark:text-amber-200" data-text-bulk-generate-blocked-reason="true">
              {voiceValidation.noChannelsEnabled
                ? 'Enable at least one channel (EN or ID) to generate audio.'
                : voiceValidation.warnings.join(' ')}
            </div>
          )}

          {/* Primary Generation / Stop Controls */}
          <div className="space-y-1.5 pt-1">
            {running ? (
              <button type="button" onClick={structuredTextBatch?.cancel} data-text-batch-stop-button="true" className="w-full min-h-10 rounded-xl bg-red-600 hover:bg-red-700 py-2 px-3 text-xs font-black text-white shadow-sm transition-colors">
                <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin"/>
                <TextBatchStopButtonContent fallbackTotal={generationCoverage?.total || 0} fallbackStatusText={structuredTextBatch?.statusText} />
              </button>
            ) : (
              <>
                <button type="button" disabled={!canGenerateMissing || !(generationCoverage?.needGenerateMissing || 0)} onClick={structuredTextBatch?.downloadMissing} data-text-bulk-generate-missing="true" className="w-full min-h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2 px-3 text-xs font-black text-white shadow-sm disabled:opacity-35 transition-colors">
                  <Download className="mr-1.5 inline h-3.5 w-3.5"/>
                  GENERATE MISSING ({generationCoverage?.needGenerateMissing || 0})
                </button>
                {(generationCoverage?.stale || 0) > 0 && (
                  <button type="button" disabled={!canGenerateMissingAndStale || !(generationCoverage?.needGenerateWithStale || 0)} onClick={structuredTextBatch?.downloadMissingAndStale} data-text-bulk-generate-missing-stale="true" className="w-full min-h-9 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 py-1.5 text-[10px] font-black text-amber-800 dark:text-amber-300 disabled:opacity-35">
                    GENERATE MISSING + STALE ({generationCoverage?.needGenerateWithStale || 0})
                  </button>
                )}
                <button type="button" disabled={!canRegenerateSelected || !(generationCoverage?.total || 0)} onClick={structuredTextBatch?.redownloadAll} data-text-bulk-regenerate-selected="true" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 text-[9px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-35">
                  REGENERATE SELECTED ({generationCoverage?.total || 0})
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Telemetry & Progress Bar */}
        <TextBatchLiveTelemetry fallbackTotal={generationCoverage?.total || 0} />

        {/* Failed Jobs */}
        {failedJobs.length > 0 && <details className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/15 p-3 text-[9px]" data-text-bulk-failures="true" open>
          <summary className="cursor-pointer font-black text-red-700 dark:text-red-300">Failed items • {failedJobs.length}</summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {failedJobs.map((job, index) => <div key={`${job?.segmentId || job?.id || 'job'}-${job?.channel || 'text'}-${index}`} className="rounded-lg border border-red-100 dark:border-red-900/70 bg-white/80 dark:bg-slate-900/40 px-2.5 py-1.5">
              <p className="font-bold text-slate-700 dark:text-slate-200">{job?.representation === 'full' ? `FULL ${job?.blockId || 'Card'}` : (job?.segmentId || job?.id || 'Unknown Segment')} • {job?.channel === 'meaning' ? 'ID / Meaning' : 'EN / Text'} • {compactVoiceLabel(job?.voiceId || job?.resolvedVoiceId)}</p>
              <p className="mt-0.5 text-[8px] text-red-600/80 dark:text-red-300/80">{job?.error || job?.reason || 'Generation failed. Retry uses the same resolved job.'}</p>
            </div>)}
          </div>
          <button type="button" disabled={running || !structuredTextBatch?.retryFailed} onClick={structuredTextBatch?.retryFailed} className="mt-2 w-full rounded-lg border border-red-300 dark:border-red-800 py-2 text-[9px] font-black text-red-700 dark:text-red-300 disabled:opacity-35">RETRY FAILED ONLY ({failedJobs.length})</button>
        </details>}

        {/* 5. Export / Auto Export */}
        <div className="rounded-xl border border-teal-200/80 dark:border-teal-900 bg-teal-50/45 dark:bg-teal-950/15 p-3 space-y-2.5" data-text-bulk-export-p6="true">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-teal-800 dark:text-teal-300">Export / Auto Export</span>
            <button type="button" disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ bulkAutoExport: !structuredTextBatch?.preferences?.bulkAutoExport })} className={`rounded-full border px-2.5 py-1 text-[8px] font-black transition-colors ${structuredTextBatch?.preferences?.bulkAutoExport ? 'border-teal-500 bg-teal-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>AUTO EXPORT {structuredTextBatch?.preferences?.bulkAutoExport ? 'ON' : 'OFF'}</button>
          </div>
          <p className="text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">
            Exports Ready local Staging binaries to your device. Portable ZIP preserves canonical identity + manifest for re-importing into Audio Library.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[8px] font-bold text-slate-600 dark:text-slate-300">Voice policy
              <select disabled={running} value={exportVoicePolicy} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportVoicePolicy: event.target.value })} className="mt-1 w-full rounded-lg border border-teal-200 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] font-medium dark:text-white">
                <option value="preferred">Preferred playback voice</option>
                <option value="selected">One selected voice</option>
                <option value="all-selected">All selected generation voices</option>
              </select>
            </label>
            <label className="text-[8px] font-bold text-slate-600 dark:text-slate-300">Representation
              <select disabled={running} value={exportRepresentation} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportRepresentation: event.target.value })} className="mt-1 w-full rounded-lg border border-teal-200 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] font-medium dark:text-white">
                <option value="split">Split only</option>
                <option value="full">Full only</option>
                <option value="both">Split + Full</option>
              </select>
            </label>
          </div>

          {exportVoicePolicy === 'selected' && <div className="grid grid-cols-2 gap-2" data-text-bulk-export-selected-voices="true">
            <label className="text-[8px] font-bold text-slate-600 dark:text-slate-300">EN selected voice
              <select disabled={running} value={selectedExportTextVoiceId} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportTextVoiceId: event.target.value })} className="mt-1 w-full rounded-lg border border-teal-200 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
                {missingExportTextVoiceId && <option value={missingExportTextVoiceId} disabled>Unavailable · {missingExportTextVoiceId}</option>}
                <EdgeVoiceOptgroups voices={structuredTextBatch?.voices} context="main" disableUnavailable={false} />
              </select>
            </label>
            <label className="text-[8px] font-bold text-slate-600 dark:text-slate-300">ID selected voice
              <select disabled={running} value={selectedExportMeaningVoiceId} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportMeaningVoiceId: event.target.value })} className="mt-1 w-full rounded-lg border border-teal-200 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
                {missingExportMeaningVoiceId && <option value={missingExportMeaningVoiceId} disabled>Unavailable · {missingExportMeaningVoiceId}</option>}
                <EdgeVoiceOptgroups voices={structuredTextBatch?.voices} context="meaning" disableUnavailable={false} />
              </select>
            </label>
          </div>}

          <div className="grid grid-cols-2 gap-1 rounded-lg border border-teal-100 dark:border-teal-900/60 bg-white/80 dark:bg-slate-900/40 p-2 text-[8px] font-semibold text-slate-600 dark:text-slate-300">
            <span>Ready logical: {exportCoverage?.logicalReady || 0}</span><span>Unique physical: {exportCoverage?.uniquePhysicalReady || 0}</span>
            <span>Split physical: {exportCoverage?.splitPhysical || 0}</span><span>Full physical: {exportCoverage?.fullPhysical || 0}</span>
          </div>

          <label className="block text-[8px] font-bold text-slate-600 dark:text-slate-300">Auto Export / quick export format
            <select disabled={running} value={exportFormat} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportFormat: event.target.value })} className="mt-1 w-full rounded-lg border border-teal-200 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] font-medium dark:text-white">
              <option value="audio-only-direct">Audio-Only • Direct files</option>
              <option value="audio-only-zip">Audio-Only • One ZIP</option>
              <option value="portable-zip">Portable ProLingo ZIP</option>
            </select>
          </label>

          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" disabled={running || !(exportCoverage?.uniquePhysicalReady > 0)} onClick={() => setBulkExportConfirmFormat('audio-only-direct')} className="min-h-9 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 py-1.5 text-[8px] font-black text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 disabled:opacity-35"><Music className="mr-1 inline h-3 w-3"/>DIRECT</button>
            <button type="button" disabled={running || !(exportCoverage?.uniquePhysicalReady > 0)} onClick={() => setBulkExportConfirmFormat('audio-only-zip')} className="min-h-9 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 py-1.5 text-[8px] font-black text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>AUDIO ZIP</button>
            <button type="button" disabled={running || !(exportCoverage?.uniquePhysicalReady > 0)} onClick={() => setBulkExportConfirmFormat('portable-zip')} className="min-h-9 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/30 py-1.5 text-[8px] font-black text-violet-700 dark:text-violet-300 hover:bg-violet-100 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>PORTABLE</button>
          </div>
        </div>
      </div>

      <SafetyConfirmDialog
        open={Boolean(bulkExportConfirmFormat)}
        title={bulkExportConfirmFormat === 'portable-zip' ? 'Export Portable ProLingo Audio ZIP?' : bulkExportConfirmFormat === 'audio-only-zip' ? 'Export Audio-Only ZIP?' : 'Export Audio-Only direct files?'}
        message={`${scopeSummary} • ${exportCoverage?.logicalReady || 0} logical Ready → ${exportCoverage?.uniquePhysicalReady || 0} unique physical • voice policy ${exportVoicePolicy} • ${exportRepresentation}. ${bulkExportConfirmFormat === 'portable-zip' ? 'Portable ZIP keeps canonical identity + manifest + AUDIO_INDEX.csv for re-import.' : 'Audio-Only uses human-readable filenames for external playback and is not the canonical re-import format.'}`}
        confirmLabel={bulkExportConfirmFormat === 'portable-zip' ? 'Export Portable ZIP' : bulkExportConfirmFormat === 'audio-only-zip' ? 'Export Audio ZIP' : 'Export Direct Files'}
        onCancel={() => setBulkExportConfirmFormat(null)}
        onConfirm={() => { const format = bulkExportConfirmFormat; setBulkExportConfirmFormat(null); structuredTextBatch?.exportBulk?.({ format }); }}
      />

      <SafetyConfirmDialog
        open={bulkResetConfirmOpen}
        title="Reset Bulk Audio Preferences to Defaults?"
        message="Restores Bulk Audio defaults: Split ON, Full OFF, EN + ID channels enabled, Libby EN / Tuti ID voices, and default export preferences (Auto Export OFF). Global Edge defaults (Sonia/Gadis, rate/pitch), Staging MP3 binaries, and Workspace/Card overrides stay intact."
        confirmLabel="Reset Bulk"
        tone="amber"
        onCancel={() => setBulkResetConfirmOpen(false)}
        onConfirm={() => {
          setBulkResetConfirmOpen(false);
          setDraftTextEmpty(false);
          setDraftMeaningEmpty(false);
          setTextVoiceMode(TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE);
          setMeaningVoiceMode(TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE);
          structuredTextBatch?.resetPreferences?.();
        }}
      />

    </div>
  );
});

export default TextBatchPopup;
