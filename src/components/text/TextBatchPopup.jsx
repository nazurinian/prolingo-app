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
  const [directMp3ConfirmOpen, setDirectMp3ConfirmOpen] = React.useState(false);
  const [consolidatedZipConfirmOpen, setConsolidatedZipConfirmOpen] = React.useState(false);
  const [partialZipConfirmOpen, setPartialZipConfirmOpen] = React.useState(false);
  const liveTelemetry = React.useSyncExternalStore(
    subscribeTextStructuredBatchTelemetry,
    getTextStructuredBatchTelemetrySnapshot,
    getTextStructuredBatchTelemetrySnapshot
  );
  const coverage = structuredTextBatch?.coverage || {};
  const textScope = structuredTextBatch?.scope || { scopeMode: 'workspace', cardId: null };
  const scopeMode = textScope?.scopeMode || 'workspace';
  const textVoiceSummary = (structuredTextBatch?.voicesResolved || []).map(compactVoiceLabel);
  const textSpeakerSummary = structuredTextBatch?.speakersResolved || [];
  const cardOptions = structuredTextBatch?.cardOptions || [];
  const workspaceOptions = structuredTextBatch?.workspaceOptions || structuredTextBatch?.documentOptions || [];
  const selectedWorkspaceIds = textScope?.selectedDocumentIds || [];
  const resolvedWorkspaces = structuredTextBatch?.workspacesResolved || structuredTextBatch?.documentsResolved || [];
  const running = Boolean(structuredTextBatch?.running);
  const directMp3Limit = Number(structuredTextBatch?.directMp3Limit || 10);
  const hasCollectionScope = Boolean(structuredTextBatch?.activeCollectionId) && workspaceOptions.some(workspace => workspace.collectionId === structuredTextBatch.activeCollectionId);
  const selectedCard = cardOptions.find(card => card.id === textScope?.cardId) || cardOptions[0] || null;
  const failedJobs = structuredTextBatch?.generationState?.failedJobs || [];

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
          ? `${resolvedWorkspaces.length} selected Workspace${resolvedWorkspaces.length === 1 ? '' : 's'} • ${coverage?.total || 0} audio slots`
          : `All Book Collections + Unfiled • ${resolvedWorkspaces.length} Workspaces • ${coverage?.total || 0} audio slots`;
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

        <div className="grid gap-2">
          <label className="text-[9px] font-bold text-slate-500">Global Edge EN download fallback
            <select disabled={running} value={structuredTextBatch?.preferences?.edgeTextVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeTextVoiceId: e.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs dark:text-white">
              {(structuredTextBatch?.voices || []).filter(v => String(v?.lang || '').startsWith('en-')).map(v => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
            </select>
          </label>
          <label className="text-[9px] font-bold text-slate-500">Global Edge ID / Meaning fallback (Indonesia locales)
            <select disabled={running} value={structuredTextBatch?.preferences?.edgeMeaningVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeMeaningVoiceId: e.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs dark:text-white">
              {(structuredTextBatch?.voices || []).filter(v => /-ID$/i.test(String(v?.lang || ''))).map(v => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
            </select>
          </label>
          <p className="text-[8px] text-slate-400">Workspace / speaker / Card / Segment download profiles configured in AUDIO remain higher priority; these are global fallbacks.</p>
        </div>

        <div className="flex gap-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-2.5">
          <ToggleRow checked={structuredTextBatch?.preferences?.generateText !== false} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateText: structuredTextBatch?.preferences?.generateText === false })}>EN / Text</ToggleRow>
          <ToggleRow checked={structuredTextBatch?.preferences?.generateMeaning !== false} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateMeaning: structuredTextBatch?.preferences?.generateMeaning === false })} tone="amber">ID / Meaning</ToggleRow>
        </div>

        <div className="rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/15 p-2.5 text-[9px]" data-text-batch-resolved-voices="true">
          <div className="font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Resolved Multi-Voice Plan</div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Voices: {textVoiceSummary.length ? textVoiceSummary.join(' + ') : '—'}</p>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">Speakers: {textSpeakerSummary.length ? textSpeakerSummary.join(', ') : 'single narrator / no speaker labels'}</p>
          <p className="mt-1 text-[8px] text-slate-400">Conversation keeps each Segment's exact speaker/channel download voice. Paragraph narrator defaults stay independent. Multi-Workspace output is separated again by Workspace during ZIP packaging.</p>
          <p className="mt-1 text-[8px] font-bold text-sky-600/80 dark:text-sky-300/80">Bulk Audio follows AUDIO Setup & Sources profiles. Bottom Player Settings never changes generated/downloaded voice, rate, or pitch.</p>
        </div>

        <div className="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/15 p-2.5 text-[9px]" data-audio-coverage-summary="text">
          <div className="flex justify-between font-black text-violet-700 dark:text-violet-300"><span>Selected Coverage</span><span>{coverage?.covered || 0}/{coverage?.total || 0}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 dark:text-slate-400">
            <span>Ready: {coverage?.ready || 0}</span><span>History only*: {coverage?.downloaded || 0}</span>
            <span>Other voice: {coverage?.otherVoice || 0}</span><span>Stale: {coverage?.stale || 0}</span>
            <span>Missing: {coverage?.missing || 0}</span><span className="font-black text-amber-600 dark:text-amber-300">Need: {coverage?.needDownload || 0}</span>
          </div>
          <p className="mt-1.5 text-[8px] text-slate-400">Only binary currently readable from Text Staging (including Portable ZIP imports) or active runtime is Ready. Folder is deprecated/locked. Export history never suppresses regeneration.</p>
        </div>

        {liveTelemetry?.sessionId && <div className="rounded-lg border border-cyan-100 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/15 p-2.5 text-[9px]" data-live-batch-telemetry="text">
          <div className="flex items-center justify-between gap-2 font-black text-cyan-700 dark:text-cyan-300"><span>Live Bulk Audio • {String(liveTelemetry.status || 'idle').replaceAll('-', ' ')}</span><span>{liveTelemetry.processed || 0}/{liveTelemetry.total || 0}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 dark:text-slate-400"><span>Ready est.: {liveTelemetry.readyEstimate || 0}</span><span>Need est.: {liveTelemetry.missingEstimate || 0}</span><span>Generated RF: {liveTelemetry.generated || 0}</span><span>RF reused: {liveTelemetry.reusedPhysical || 0}</span><span>Skipped Ready: {liveTelemetry.skippedReady || 0}</span><span>Failed: {liveTelemetry.failed || 0}</span><span>Remaining: {liveTelemetry.remaining || 0}</span></div>
          <p className="mt-1 text-[8px] text-cyan-600/80 dark:text-cyan-300/80">Counter UI only • no per-audio IndexedDB inventory scan{liveTelemetry.reconciled ? ' • final durable commit reconciled' : ''}.</p>
        </div>}

        {failedJobs.length > 0 && <details className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/15 p-2.5 text-[9px]" data-text-bulk-failures="true">
          <summary className="cursor-pointer font-black text-red-700 dark:text-red-300">Failed items • {failedJobs.length}</summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {failedJobs.map((job, index) => <div key={`${job?.segmentId || job?.id || 'job'}-${job?.channel || 'text'}-${index}`} className="rounded border border-red-100 dark:border-red-900/70 bg-white/70 dark:bg-slate-900/40 px-2 py-1.5">
              <p className="font-bold text-slate-700 dark:text-slate-200">{job?.segmentId || job?.id || 'Unknown Segment'} • {job?.channel === 'meaning' ? 'ID / Meaning' : 'EN / Text'} • {compactVoiceLabel(job?.voiceId || job?.resolvedVoiceId)}</p>
              <p className="mt-0.5 text-[8px] text-red-600/80 dark:text-red-300/80">{job?.error || job?.reason || 'Generation failed. Retry uses the same resolved job.'}</p>
            </div>)}
          </div>
          <button type="button" disabled={running || !structuredTextBatch?.retryFailed} onClick={structuredTextBatch?.retryFailed} className="mt-2 w-full rounded border border-red-300 dark:border-red-800 py-2 text-[9px] font-black text-red-700 dark:text-red-300 disabled:opacity-35">RETRY FAILED ONLY ({failedJobs.length})</button>
        </details>}

        <div className="rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/15 p-2.5 space-y-2" data-text-batch-export="true">
          <button type="button" disabled={running || !(coverage?.ready > 0)} onClick={() => setDirectMp3ConfirmOpen(true)} className="w-full rounded border border-emerald-200 dark:border-emerald-800 py-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-35"><Music className="mr-1 inline h-3 w-3"/>EXPORT READY MP3 • {coverage?.ready || 0}</button>
          <p className="text-[8px] leading-relaxed text-slate-400">Exports Ready physical RF files once in waves of max {directMp3Limit}. Multiple logical Segments sharing the same RF do not create duplicate downloads. Missing/Other/Stale are skipped; no TTS starts.</p>
          <button type="button" disabled={running || !(coverage?.total > 0) || coverage?.ready !== coverage?.total} onClick={() => setConsolidatedZipConfirmOpen(true)} className="w-full rounded border border-sky-200 dark:border-sky-800 py-2 text-[10px] font-bold text-sky-700 dark:text-sky-300 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>{coverage?.ready === coverage?.total && coverage?.total > 0 ? `BUILD FULL CONSOLIDATED ZIP • ${coverage.ready}/${coverage.total}` : `FULL ZIP PENDING • ${coverage?.needDownload || 0} need source`}</button>
          {coverage?.ready > 0 && coverage?.ready < coverage?.total && <button type="button" disabled={running} onClick={() => setPartialZipConfirmOpen(true)} className="w-full rounded border border-amber-200 dark:border-amber-800 py-2 text-[9px] font-black text-amber-700 dark:text-amber-300 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>EXPORT PARTIAL ZIP • {coverage.ready}/{coverage.total} READY</button>}
          <p className="text-[8px] leading-relaxed text-slate-400">Consolidation uses Ready Text Staging binaries (including Portable ZIP imports) without TTS, deduplicates physical identities, and writes a Text Audio Manifest with logical references. Folder is deprecated/locked. Full output stays locked until the selected scope is complete.</p>
        </div>

        {running ? <button type="button" onClick={structuredTextBatch?.cancel} className="w-full rounded bg-red-500 py-2 text-xs font-bold text-white"><Loader2 className="mr-1 inline h-3 w-3 animate-spin"/>{structuredTextBatch?.statusText || 'STOP BULK JOB'}</button> : <>
          <button type="button" disabled={!(coverage?.needDownload || 0)} onClick={structuredTextBatch?.downloadMissing} className="w-full rounded bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-35"><Download className="mr-1 inline h-3 w-3"/>GENERATE MISSING ({coverage?.needDownload || 0})</button>
          <button type="button" disabled={!(coverage?.total || 0)} onClick={structuredTextBatch?.redownloadAll} className="w-full rounded border border-slate-200 dark:border-slate-700 py-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-35">REGENERATE SELECTED ({coverage?.total || 0})</button>
        </>}
      </div>

      <SafetyConfirmDialog
        open={consolidatedZipConfirmOpen}
        title="Build complete Text consolidated ZIP?"
        message={`${scopeSummary} • Ready ${coverage?.ready || 0}/${coverage?.total || 0} • resolved voices ${textVoiceSummary.join(' + ') || '—'}. ProLingo reads exact Ready binaries from Text Staging (including Portable ZIP imports) and creates resource-bounded ZIP group(s) separated by Workspace. No TTS is generated and source ZIP files are not modified.`}
        confirmLabel="Build Full ZIP"
        onCancel={() => setConsolidatedZipConfirmOpen(false)}
        onConfirm={() => { setConsolidatedZipConfirmOpen(false); structuredTextBatch?.exportFullZip?.(); }}
      />
      <SafetyConfirmDialog
        open={partialZipConfirmOpen}
        title="Export explicitly partial Text ZIP?"
        message={`${scopeSummary} • Ready ${coverage?.ready || 0}/${coverage?.total || 0}. Only currently readable exact-voice binaries are included, separated by Workspace. Archive filenames are marked PARTIAL. No TTS is generated.`}
        confirmLabel={`Export PARTIAL ${coverage?.ready || 0}/${coverage?.total || 0}`}
        onCancel={() => setPartialZipConfirmOpen(false)}
        onConfirm={() => { setPartialZipConfirmOpen(false); structuredTextBatch?.exportPartialZip?.(); }}
      />
      <SafetyConfirmDialog
        open={directMp3ConfirmOpen}
        title="Export all Ready Text audio as direct MP3?"
        message={`${scopeSummary} • Ready ${coverage?.ready || 0}/${coverage?.total || 0} • resolved voices ${textVoiceSummary.join(' + ') || '—'}. Ready exact-voice Text audio downloads by unique physical RF in waves of max ${directMp3Limit} files. Shared RF renders are exported once; Missing/Other/Stale are skipped and never generated.`}
        confirmLabel={`Export ${coverage?.ready || 0} MP3`}
        onCancel={() => setDirectMp3ConfirmOpen(false)}
        onConfirm={() => { setDirectMp3ConfirmOpen(false); structuredTextBatch?.exportReadyMp3?.(); }}
      />
    </div>
  );
};

export default TextBatchPopup;
