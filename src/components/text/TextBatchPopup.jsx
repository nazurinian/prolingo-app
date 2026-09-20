import React from 'react';
import { CheckSquare, FileArchive, Loader2, Music, Square, X, Download, FolderTree } from 'lucide-react';
import { SafetyConfirmDialog } from '../modals/ConfirmDialog.jsx';
import { getTextStructuredBatchTelemetrySnapshot, subscribeTextStructuredBatchTelemetry } from '../../services/audio/textStructuredBatchTelemetryService.js';

const compactVoiceLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const tail = raw.split('-').pop() || raw;
  return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw;
};

const ToggleRow = ({ checked, disabled = false, onClick, children, tone = 'indigo' }) => {
  const activeClass = tone === 'amber'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-indigo-600 dark:text-indigo-400';
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex min-w-0 items-center gap-1.5 text-left text-[11px] font-semibold ${checked ? activeClass : 'text-slate-400 dark:text-slate-500'} ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:opacity-80'}`}>
      {checked ? <CheckSquare className="h-4 w-4 flex-shrink-0"/> : <Square className="h-4 w-4 flex-shrink-0"/>}
      <span className="truncate">{children}</span>
    </button>
  );
};

const ScopeButton = ({ active, disabled, onClick, children }) => <button
  type="button"
  disabled={disabled}
  onClick={onClick}
  className={`min-h-10 rounded-lg border px-2 text-[8px] font-black transition ${active ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-cyan-100 dark:border-cyan-900 bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300'} disabled:opacity-35`}
>{children}</button>;

export const TextBatchPopup = ({
  batchPanelRef,
  setIsBatchOpen,
  structuredTextBatch,
  inline = false,
  showClose = true
}) => {
  const [bulkExportConfirmFormat, setBulkExportConfirmFormat] = React.useState(null);
  const liveTelemetry = React.useSyncExternalStore(
    subscribeTextStructuredBatchTelemetry,
    getTextStructuredBatchTelemetrySnapshot,
    getTextStructuredBatchTelemetrySnapshot
  );
  const generationCoverage = structuredTextBatch?.generationCoverage || structuredTextBatch?.coverage || {};
  const exportCoverage = structuredTextBatch?.exportCoverage || {};
  const exportFormat = structuredTextBatch?.preferences?.bulkExportFormat || 'portable-zip';
  const exportVoicePolicy = structuredTextBatch?.preferences?.bulkExportVoicePolicy || 'all-selected';
  const exportRepresentation = structuredTextBatch?.preferences?.bulkExportRepresentation || 'split';
  const textScope = structuredTextBatch?.scope || { scopeMode: 'workspace', cardId: null };
  const scopeMode = textScope?.scopeMode || 'workspace';
  const bulkTextVoiceIds = structuredTextBatch?.preferences?.bulkTextVoiceIds || [];
  const bulkMeaningVoiceIds = structuredTextBatch?.preferences?.bulkMeaningVoiceIds || [];
  const bulkTextVoiceSummary = (structuredTextBatch?.bulkTextVoicesResolved || bulkTextVoiceIds).map(compactVoiceLabel);
  const bulkMeaningVoiceSummary = (structuredTextBatch?.bulkMeaningVoicesResolved || bulkMeaningVoiceIds).map(compactVoiceLabel);
  const englishBulkVoices = (structuredTextBatch?.voices || []).filter(v => String(v?.lang || '').startsWith('en-'));
  const meaningBulkVoices = (structuredTextBatch?.voices || []).filter(v => /-ID$/i.test(String(v?.lang || '')));
  const textSpeakerSummary = structuredTextBatch?.speakersResolved || [];
  const cardOptions = structuredTextBatch?.cardOptions || [];
  const workspaceOptions = structuredTextBatch?.workspaceOptions || structuredTextBatch?.documentOptions || [];
  const selectedWorkspaceIds = textScope?.selectedDocumentIds || [];
  const resolvedWorkspaces = structuredTextBatch?.workspacesResolved || structuredTextBatch?.documentsResolved || [];
  const running = Boolean(structuredTextBatch?.running);
  const hasCollectionScope = Boolean(structuredTextBatch?.activeCollectionId) && workspaceOptions.some(workspace => workspace.collectionId === structuredTextBatch.activeCollectionId);
  const selectedCard = cardOptions.find(card => card.id === textScope?.cardId) || cardOptions[0] || null;
  const failedJobs = structuredTextBatch?.generationState?.failedJobs || [];

  const toggleBulkVoice = (key, voiceId) => {
    const current = Array.isArray(structuredTextBatch?.preferences?.[key]) ? structuredTextBatch.preferences[key] : [];
    const exists = current.includes(voiceId);
    if (exists && current.length <= 1) return;
    const next = exists ? current.filter(id => id !== voiceId) : [...current, voiceId];
    structuredTextBatch?.onPreferencesChange?.({ [key]: next });
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
      ? `${structuredTextBatch?.workspaceTitle || 'Text Workspace'} • full Workspace`
      : scopeMode === 'collection'
        ? `${structuredTextBatch?.activeCollectionTitle || 'Book Collection'} • ${resolvedWorkspaces.length} Workspace${resolvedWorkspaces.length === 1 ? '' : 's'}`
        : scopeMode === 'selected'
          ? `${resolvedWorkspaces.length} selected Workspace${resolvedWorkspaces.length === 1 ? '' : 's'} • ${generationCoverage?.logicalRequirements || generationCoverage?.total || 0} generation requirements`
          : `All Book Collections + Unfiled • ${resolvedWorkspaces.length} Workspaces • ${generationCoverage?.logicalRequirements || generationCoverage?.total || 0} generation requirements`;
  const panelClass = inline
    ? 'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col animate-in fade-in duration-150'
    : 'absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200';

  return (
    <div ref={batchPanelRef} className={panelClass} data-text-batch-workspace="true">
      <div className="bg-slate-800 text-white px-3 py-2 text-xs font-bold flex items-center justify-between gap-2">
        <span>Bulk Audio • Structured Text</span>
        <span className="ml-auto rounded-full bg-teal-500/25 px-2 py-0.5 text-[8px] font-black uppercase text-teal-100">Edge • Workspace-aware</span>
        {showClose && <button type="button" onClick={() => setIsBatchOpen(false)} className="rounded p-1 hover:bg-white/10" aria-label="Close Text Batch"><X className="w-3.5 h-3.5"/></button>}
      </div>

      <div className="p-3 space-y-3">
        <div className="rounded-lg border border-cyan-100 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/15 p-2.5 text-[9px]" data-text-batch-scope="true">
          <div className="flex items-center gap-2"><FolderTree className="h-3.5 w-3.5 text-cyan-600"/><span className="font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Bulk Scope</span><span className="ml-auto text-[8px] font-bold text-slate-400">{resolvedWorkspaces.length} workspace</span></div>
          <div className="mt-2 grid grid-cols-2 gap-1" data-text-batch-scope-tabs="true">
            <ScopeButton active={scopeMode === 'card'} disabled={running || !structuredTextBatch?.activeWorkspaceId || !cardOptions.length} onClick={() => setScopeMode('card')}>CURRENT CARD</ScopeButton>
            <ScopeButton active={scopeMode === 'workspace'} disabled={running || !structuredTextBatch?.activeWorkspaceId} onClick={() => setScopeMode('workspace')}>CURRENT WORKSPACE</ScopeButton>
            <ScopeButton active={scopeMode === 'collection'} disabled={running || !hasCollectionScope} onClick={() => setScopeMode('collection')}>BOOK COLLECTION</ScopeButton>
            <ScopeButton active={scopeMode === 'selected'} disabled={running || !workspaceOptions.length} onClick={() => setScopeMode('selected')}>SELECTED WORKSPACES</ScopeButton>
          </div>

          {scopeMode === 'card' && <div className="mt-2" data-text-batch-card-select="true">
            <label className="text-[8px] font-black text-slate-500">Card in current Workspace
              <select disabled={running || !cardOptions.length} value={selectedCard?.id || ''} onChange={event => selectCard(event.target.value)} className="mt-1 w-full rounded border border-cyan-100 dark:border-cyan-900 bg-white dark:bg-slate-900 p-2 text-[10px] dark:text-white">
                {cardOptions.map(card => <option key={card.id} value={card.id}>Card {card.index} • {card.title} • {card.blockType === 'conversation' ? 'Conversation' : 'Paragraph'}</option>)}
              </select>
            </label>
            <p className="mt-1.5 text-[8px] text-slate-400">Only this Card is selected. Segment IDs and per-Segment/per-speaker AUDIO download profiles stay authoritative.</p>
          </div>}

          {scopeMode === 'workspace' && <p className="mt-2 text-[8px] text-slate-400">Uses every Card in the active Workspace. Paragraph narrator and Conversation speakers resolve independently per Segment.</p>}
          {scopeMode === 'collection' && <p className="mt-2 text-[8px] text-slate-400">Book Collection-first scope: every structured Workspace in <span className="font-bold">{structuredTextBatch?.activeCollectionTitle || 'the active Book Collection'}</span> is included.</p>}

          {scopeMode === 'selected' && <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-cyan-100 dark:border-cyan-900 bg-white/70 dark:bg-slate-900/40 p-2" data-text-batch-selected-workspaces="true">
            {workspaceOptions.map(workspace => <ToggleRow key={workspace.id} checked={selectedWorkspaceIds.includes(workspace.id)} disabled={running} onClick={() => toggleSelectedWorkspace(workspace.id)}>
              {workspace.title} • {workspace.collectionTitle || 'Unfiled / Library Root'} • {workspace.documentType === 'mixed' ? 'Conversation MIX' : workspace.documentType || 'text'}
            </ToggleRow>)}
            {!workspaceOptions.length && <p className="text-[8px] text-slate-400">No structured Workspaces available.</p>}
          </div>}

          <details className="mt-2 rounded-md border border-slate-200/80 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-2" data-text-batch-advanced-scope="true">
            <summary className="cursor-pointer text-[8px] font-black uppercase tracking-wide text-slate-500">Advanced scope</summary>
            <div className="mt-2">
              <ScopeButton active={scopeMode === 'all'} disabled={running || !workspaceOptions.length} onClick={() => setScopeMode('all')}>ALL BOOK COLLECTIONS + UNFILED</ScopeButton>
              <p className="mt-1.5 text-[8px] text-slate-400">Explicit global Text scope. It includes every structured Workspace, including Unfiled / Library Root. Legacy Workspaces remain outside structured Batch.</p>
            </div>
          </details>

          <div className="mt-2 rounded-md bg-white/70 dark:bg-slate-900/40 p-2 text-[8px] text-slate-500" data-text-batch-workspace-summary="true">
            <div className="font-black text-cyan-700 dark:text-cyan-300">{scopeSummary}</div>
            {resolvedWorkspaces.slice(0, 4).map(workspace => <div key={workspace.id} className="mt-0.5 flex gap-2"><span className="truncate">{workspace.title}</span><span className="ml-auto shrink-0 text-slate-400">{workspace.jobCount || 0} jobs</span></div>)}
            {resolvedWorkspaces.length > 4 && <div className="mt-0.5 text-slate-400">+{resolvedWorkspaces.length - 4} more Workspaces</div>}
          </div>
        </div>

        <div className="rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-2.5 space-y-2" data-text-bulk-p5-selection="true">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Generate Selection</span>
            <span className="text-[8px] font-bold text-slate-400">Paragraph only</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-white/70 dark:bg-slate-900/35 p-2">
            <ToggleRow checked={structuredTextBatch?.preferences?.generateText !== false} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateText: structuredTextBatch?.preferences?.generateText === false })}>EN / Text</ToggleRow>
            <ToggleRow checked={structuredTextBatch?.preferences?.generateMeaning !== false} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateMeaning: structuredTextBatch?.preferences?.generateMeaning === false })} tone="amber">ID / Meaning</ToggleRow>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-white/70 dark:bg-slate-900/35 p-2" data-text-bulk-representations="true">
            <ToggleRow checked={structuredTextBatch?.preferences?.bulkGenerateSplit !== false} disabled={running} onClick={() => toggleBulkRepresentation('bulkGenerateSplit')}>Split</ToggleRow>
            <ToggleRow checked={structuredTextBatch?.preferences?.bulkGenerateFull === true} disabled={running} onClick={() => toggleBulkRepresentation('bulkGenerateFull')}>Full</ToggleRow>
            <span className="ml-auto text-[8px] text-slate-400">At least one stays selected</span>
          </div>

          <details className="rounded-md border border-indigo-100 dark:border-indigo-900 bg-white/70 dark:bg-slate-900/35 p-2" open={bulkTextVoiceIds.length > 1}>
            <summary className="cursor-pointer text-[8px] font-black text-indigo-700 dark:text-indigo-300">EN bulk voices • {bulkTextVoiceSummary.join(' + ') || '—'}</summary>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1" data-text-bulk-en-voices="true">
              {englishBulkVoices.map(voice => <ToggleRow key={voice.id} checked={bulkTextVoiceIds.includes(voice.id)} disabled={running} onClick={() => toggleBulkVoice('bulkTextVoiceIds', voice.id)}>{voice.label || voice.id}</ToggleRow>)}
            </div>
          </details>

          <details className="rounded-md border border-amber-100 dark:border-amber-900 bg-white/70 dark:bg-slate-900/35 p-2" open={bulkMeaningVoiceIds.length > 1}>
            <summary className="cursor-pointer text-[8px] font-black text-amber-700 dark:text-amber-300">ID bulk voices • {bulkMeaningVoiceSummary.join(' + ') || '—'}</summary>
            <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1" data-text-bulk-id-voices="true">
              {meaningBulkVoices.map(voice => <ToggleRow key={voice.id} checked={bulkMeaningVoiceIds.includes(voice.id)} disabled={running} onClick={() => toggleBulkVoice('bulkMeaningVoiceIds', voice.id)} tone="amber">{voice.label || voice.id}</ToggleRow>)}
            </div>
          </details>

          <details className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-2">
            <summary className="cursor-pointer text-[8px] font-black uppercase tracking-wide text-slate-500">Manual / legacy fallback voice</summary>
            <div className="mt-2 grid gap-2">
              <label className="text-[8px] font-bold text-slate-500">Edge EN fallback
                <select disabled={running} value={structuredTextBatch?.preferences?.edgeTextVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeTextVoiceId: e.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[10px] dark:text-white">
                  {englishBulkVoices.map(v => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
                </select>
              </label>
              <label className="text-[8px] font-bold text-slate-500">Edge ID / Meaning fallback
                <select disabled={running} value={structuredTextBatch?.preferences?.edgeMeaningVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeMeaningVoiceId: e.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[10px] dark:text-white">
                  {meaningBulkVoices.map(v => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
                </select>
              </label>
            </div>
          </details>
          <p className="text-[8px] leading-relaxed text-slate-400">Generation voice selection is independent from Workspace playback order. It writes Split/Full output to Staging first. Conversation adaptation is intentionally deferred until Paragraph P1–P7 is accepted.</p>
        </div>

        <div className="rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/15 p-2.5 text-[9px]" data-text-batch-resolved-voices="true">
          <div className="font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Generate Plan</div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">EN: {bulkTextVoiceSummary.length ? bulkTextVoiceSummary.join(' + ') : '—'}</p>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">ID: {bulkMeaningVoiceSummary.length ? bulkMeaningVoiceSummary.join(' + ') : '—'}</p>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">Representation: {structuredTextBatch?.preferences?.bulkGenerateSplit !== false ? 'Split' : ''}{structuredTextBatch?.preferences?.bulkGenerateSplit !== false && structuredTextBatch?.preferences?.bulkGenerateFull === true ? ' + ' : ''}{structuredTextBatch?.preferences?.bulkGenerateFull === true ? 'Full' : ''}</p>
          <p className="mt-1 text-[8px] font-bold text-sky-600/80 dark:text-sky-300/80">Generation selection never changes playback priority.</p>
        </div>

        <div className="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/15 p-2.5 text-[9px]" data-audio-generation-coverage-summary="text">
          <div className="flex justify-between font-black text-violet-700 dark:text-violet-300"><span>Generation Coverage</span><span>{generationCoverage?.ready || 0}/{generationCoverage?.total || 0}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 dark:text-slate-400">
            <span>Ready logical: {generationCoverage?.ready || 0}</span><span>Reusable physical: {generationCoverage?.reusable || 0}</span>
            <span>Missing: {generationCoverage?.missing || 0}</span><span>Stale: {generationCoverage?.stale || 0}</span>
            <span>Logical req.: {generationCoverage?.logicalRequirements || 0}</span><span>Unique physical: {generationCoverage?.uniquePhysicalRequirements || 0}</span>
            <span>Split logical: {generationCoverage?.splitLogical || 0}</span><span>Full logical: {generationCoverage?.fullLogical || 0}</span>
          </div>
          <p className="mt-1.5 text-[8px] text-slate-400">Eligible Paragraph Cards: {generationCoverage?.eligibleBlockCount || 0}{generationCoverage?.skippedConversationBlockCount ? ` • Conversation skipped: ${generationCoverage.skippedConversationBlockCount}` : ''}. Shared Split RF / identical Full identity is counted once physically even when several logical consumers need it.</p>
        </div>

        {liveTelemetry?.sessionId && <div className="rounded-lg border border-cyan-100 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/15 p-2.5 text-[9px]" data-live-batch-telemetry="text">
          <div className="flex items-center justify-between gap-2 font-black text-cyan-700 dark:text-cyan-300"><span>Live Bulk Audio • {String(liveTelemetry.status || 'idle').replaceAll('-', ' ')}</span><span>{liveTelemetry.processed || 0}/{liveTelemetry.total || 0}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 dark:text-slate-400"><span>Ready est.: {liveTelemetry.readyEstimate || 0}</span><span>Missing est.: {liveTelemetry.missingEstimate || 0}</span><span>Stale est.: {liveTelemetry.staleEstimate || 0}</span><span>Failed: {liveTelemetry.failed || 0}</span><span>Logical scope: {liveTelemetry.logicalRequirements || 0}</span><span>Unique physical: {liveTelemetry.uniquePhysicalRequirements || 0}</span><span>Selected logical: {liveTelemetry.selectedLogicalRequirements || 0}</span><span>Selected physical: {liveTelemetry.selectedUniquePhysicalRequirements || 0}</span><span>Generated physical: {liveTelemetry.generatedPhysical ?? liveTelemetry.generated ?? 0}</span><span>Reused physical: {liveTelemetry.reusedPhysical || 0}</span><span>Skipped Ready: {liveTelemetry.skippedReady || 0}</span><span>Skipped Stale: {liveTelemetry.skippedStale || 0}</span><span>Remaining selected: {liveTelemetry.remaining || 0}</span></div>
          <p className="mt-1 text-[8px] text-cyan-600/80 dark:text-cyan-300/80">Counter UI only • no per-audio IndexedDB inventory scan{liveTelemetry.reconciled ? ' • final durable commit reconciled' : ''}.</p>
        </div>}

        {failedJobs.length > 0 && <details className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/15 p-2.5 text-[9px]" data-text-bulk-failures="true">
          <summary className="cursor-pointer font-black text-red-700 dark:text-red-300">Failed items • {failedJobs.length}</summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {failedJobs.map((job, index) => <div key={`${job?.segmentId || job?.id || 'job'}-${job?.channel || 'text'}-${index}`} className="rounded border border-red-100 dark:border-red-900/70 bg-white/70 dark:bg-slate-900/40 px-2 py-1.5">
              <p className="font-bold text-slate-700 dark:text-slate-200">{job?.representation === 'full' ? `FULL ${job?.blockId || 'Card'}` : (job?.segmentId || job?.id || 'Unknown Segment')} • {job?.channel === 'meaning' ? 'ID / Meaning' : 'EN / Text'} • {compactVoiceLabel(job?.voiceId || job?.resolvedVoiceId)}</p>
              <p className="mt-0.5 text-[8px] text-red-600/80 dark:text-red-300/80">{job?.error || job?.reason || 'Generation failed. Retry uses the same resolved job.'}</p>
            </div>)}
          </div>
          <button type="button" disabled={running || !structuredTextBatch?.retryFailed} onClick={structuredTextBatch?.retryFailed} className="mt-2 w-full rounded border border-red-300 dark:border-red-800 py-2 text-[9px] font-black text-red-700 dark:text-red-300 disabled:opacity-35">RETRY FAILED ONLY ({failedJobs.length})</button>
        </details>}

        <div className="rounded-lg border border-teal-100 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/15 p-2.5 space-y-2" data-text-bulk-export-p6="true">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">Export / Auto Export</span>
            <button type="button" disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ bulkAutoExport: !structuredTextBatch?.preferences?.bulkAutoExport })} className={`rounded-full border px-2 py-1 text-[8px] font-black ${structuredTextBatch?.preferences?.bulkAutoExport ? 'border-teal-400 bg-teal-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>AUTO EXPORT {structuredTextBatch?.preferences?.bulkAutoExport ? 'ON' : 'OFF'}</button>
          </div>
          <p className="text-[8px] leading-relaxed text-slate-400">Export reads only Ready app-owned Staging binaries. Selection does not change Workspace playback priority. Auto Export is OFF by default and runs only after generation/preflight finishes.</p>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[8px] font-bold text-slate-500">Voice policy
              <select disabled={running} value={exportVoicePolicy} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportVoicePolicy: event.target.value })} className="mt-1 w-full rounded border border-teal-100 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
                <option value="preferred">Preferred playback voice</option>
                <option value="selected">One selected voice</option>
                <option value="all-selected">All selected generation voices</option>
              </select>
            </label>
            <label className="text-[8px] font-bold text-slate-500">Representation
              <select disabled={running} value={exportRepresentation} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportRepresentation: event.target.value })} className="mt-1 w-full rounded border border-teal-100 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
                <option value="split">Split only</option>
                <option value="full">Full only</option>
                <option value="both">Split + Full</option>
              </select>
            </label>
          </div>

          {exportVoicePolicy === 'selected' && <div className="grid grid-cols-2 gap-2" data-text-bulk-export-selected-voices="true">
            <label className="text-[8px] font-bold text-slate-500">EN selected voice
              <select disabled={running} value={structuredTextBatch?.preferences?.bulkExportTextVoiceId || bulkTextVoiceIds[0] || ''} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportTextVoiceId: event.target.value })} className="mt-1 w-full rounded border border-teal-100 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
                {englishBulkVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.label || voice.id}</option>)}
              </select>
            </label>
            <label className="text-[8px] font-bold text-slate-500">ID selected voice
              <select disabled={running} value={structuredTextBatch?.preferences?.bulkExportMeaningVoiceId || bulkMeaningVoiceIds[0] || ''} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportMeaningVoiceId: event.target.value })} className="mt-1 w-full rounded border border-teal-100 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
                {meaningBulkVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.label || voice.id}</option>)}
              </select>
            </label>
          </div>}

          <div className="grid grid-cols-2 gap-1 text-[8px] text-slate-500 dark:text-slate-400">
            <span>Ready logical: {exportCoverage?.logicalReady || 0}</span><span>Unique physical: {exportCoverage?.uniquePhysicalReady || 0}</span>
            <span>Split physical: {exportCoverage?.splitPhysical || 0}</span><span>Full physical: {exportCoverage?.fullPhysical || 0}</span>
          </div>

          <label className="block text-[8px] font-bold text-slate-500">Auto Export / quick export format
            <select disabled={running} value={exportFormat} onChange={event => structuredTextBatch?.onPreferencesChange?.({ bulkExportFormat: event.target.value })} className="mt-1 w-full rounded border border-teal-100 dark:border-teal-900 bg-white dark:bg-slate-900 p-2 text-[9px] dark:text-white">
              <option value="audio-only-direct">Audio-Only • Direct files</option>
              <option value="audio-only-zip">Audio-Only • One ZIP</option>
              <option value="portable-zip">Portable ProLingo ZIP</option>
            </select>
          </label>

          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" disabled={running || !(exportCoverage?.uniquePhysicalReady > 0)} onClick={() => setBulkExportConfirmFormat('audio-only-direct')} className="rounded border border-emerald-200 dark:border-emerald-800 py-2 text-[8px] font-black text-emerald-700 dark:text-emerald-300 disabled:opacity-35"><Music className="mr-1 inline h-3 w-3"/>DIRECT</button>
            <button type="button" disabled={running || !(exportCoverage?.uniquePhysicalReady > 0)} onClick={() => setBulkExportConfirmFormat('audio-only-zip')} className="rounded border border-emerald-200 dark:border-emerald-800 py-2 text-[8px] font-black text-emerald-700 dark:text-emerald-300 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>AUDIO ZIP</button>
            <button type="button" disabled={running || !(exportCoverage?.uniquePhysicalReady > 0)} onClick={() => setBulkExportConfirmFormat('portable-zip')} className="rounded border border-violet-200 dark:border-violet-800 py-2 text-[8px] font-black text-violet-700 dark:text-violet-300 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>PORTABLE</button>
          </div>
        </div>



        {running ? <button type="button" onClick={structuredTextBatch?.cancel} className="w-full rounded bg-red-500 py-2 text-xs font-bold text-white"><Loader2 className="mr-1 inline h-3 w-3 animate-spin"/>{structuredTextBatch?.statusText || 'STOP BULK JOB'}</button> : <>
          <button type="button" disabled={!(generationCoverage?.needGenerateMissing || 0)} onClick={structuredTextBatch?.downloadMissing} className="w-full rounded bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-35"><Download className="mr-1 inline h-3 w-3"/>GENERATE MISSING ({generationCoverage?.needGenerateMissing || 0})</button>
          {(generationCoverage?.stale || 0) > 0 && <button type="button" disabled={!(generationCoverage?.needGenerateWithStale || 0)} onClick={structuredTextBatch?.downloadMissingAndStale} className="w-full rounded border border-amber-300 dark:border-amber-800 py-2 text-[10px] font-black text-amber-700 dark:text-amber-300 disabled:opacity-35">GENERATE MISSING + STALE ({generationCoverage?.needGenerateWithStale || 0})</button>}
          <button type="button" disabled={!(generationCoverage?.total || 0)} onClick={structuredTextBatch?.redownloadAll} className="w-full rounded border border-slate-200 dark:border-slate-700 py-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-35">REGENERATE SELECTED ({generationCoverage?.total || 0})</button>
        </>}
      </div>

      <SafetyConfirmDialog
        open={Boolean(bulkExportConfirmFormat)}
        title={bulkExportConfirmFormat === 'portable-zip' ? 'Export Portable ProLingo Audio ZIP?' : bulkExportConfirmFormat === 'audio-only-zip' ? 'Export Audio-Only ZIP?' : 'Export Audio-Only direct files?'}
        message={`${scopeSummary} • ${exportCoverage?.logicalReady || 0} logical Ready → ${exportCoverage?.uniquePhysicalReady || 0} unique physical • voice policy ${exportVoicePolicy} • ${exportRepresentation}. ${bulkExportConfirmFormat === 'portable-zip' ? 'Portable ZIP keeps canonical identity + manifest + AUDIO_INDEX.csv for re-import.' : 'Audio-Only uses human-readable filenames for external playback and is not the canonical re-import format.'}`}
        confirmLabel={bulkExportConfirmFormat === 'portable-zip' ? 'Export Portable ZIP' : bulkExportConfirmFormat === 'audio-only-zip' ? 'Export Audio ZIP' : 'Export Direct Files'}
        onCancel={() => setBulkExportConfirmFormat(null)}
        onConfirm={() => { const format = bulkExportConfirmFormat; setBulkExportConfirmFormat(null); structuredTextBatch?.exportBulk?.({ format }); }}
      />

    </div>
  );
};

export default TextBatchPopup;
