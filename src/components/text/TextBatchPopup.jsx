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
  const textScope = structuredTextBatch?.scope || { scopeMode: 'document', startCard: 0, endCard: 0, cardCount: 0 };
  const scopeMode = textScope?.scopeMode || 'document';
  const textCardMax = Math.max(1, Number(structuredTextBatch?.cardCount || textScope?.cardCount || 1));
  const textVoiceSummary = (structuredTextBatch?.voicesResolved || []).map(compactVoiceLabel);
  const textSpeakerSummary = structuredTextBatch?.speakersResolved || [];
  const documentOptions = structuredTextBatch?.documentOptions || [];
  const selectedDocumentIds = textScope?.selectedDocumentIds || [];
  const resolvedDocuments = structuredTextBatch?.documentsResolved || [];
  const running = Boolean(structuredTextBatch?.running);
  const directMp3Limit = Number(structuredTextBatch?.directMp3Limit || 10);
  const hasCollectionScope = Boolean(structuredTextBatch?.activeCollectionId) && documentOptions.some(document => (document.collectionId || null) === structuredTextBatch.activeCollectionId);

  const updateTextScope = (field, rawValue) => {
    const number = Math.min(textCardMax, Math.max(1, Math.round(Number(rawValue || 1))));
    const next = field === 'startCard'
      ? { startCard: Math.min(number, Number(textScope?.endCard || textCardMax)) }
      : { endCard: Math.max(number, Number(textScope?.startCard || 1)) };
    structuredTextBatch?.onScopeChange?.(next);
  };
  const setScopeMode = nextMode => structuredTextBatch?.onScopeChange?.({ scopeMode: nextMode });
  const toggleSelectedDocument = documentId => {
    const next = selectedDocumentIds.includes(documentId)
      ? selectedDocumentIds.filter(id => id !== documentId)
      : [...selectedDocumentIds, documentId];
    structuredTextBatch?.onScopeChange?.({ selectedDocumentIds: next });
  };
  const scopeSummary = scopeMode === 'document'
    ? `${structuredTextBatch?.documentTitle || 'Text Document'} • Cards ${textScope?.startCard || 1}–${textScope?.endCard || textCardMax}`
    : `${resolvedDocuments.length} Document${resolvedDocuments.length === 1 ? '' : 's'} • ${coverage?.total || 0} audio slots`;
  const panelClass = inline
    ? 'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col animate-in fade-in duration-150'
    : 'absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200';

  return (
    <div ref={batchPanelRef} className={panelClass} data-text-batch-workspace="true">
      <div className="bg-slate-800 text-white px-3 py-2 text-xs font-bold flex items-center justify-between gap-2">
        <span>Batch Audio (Structured Text)</span>
        <span className="ml-auto rounded-full bg-teal-500/25 px-2 py-0.5 text-[8px] font-black uppercase text-teal-100">Edge • Multi-Document</span>
        {showClose && <button type="button" onClick={() => setIsBatchOpen(false)} className="rounded p-1 hover:bg-white/10" aria-label="Close Text Batch"><X className="w-3.5 h-3.5"/></button>}
      </div>

      <div className="p-3 space-y-3">
        <div className="rounded-lg border border-cyan-100 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/15 p-2.5 text-[9px]" data-text-batch-scope="true">
          <div className="flex items-center gap-2"><FolderTree className="h-3.5 w-3.5 text-cyan-600"/><span className="font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Batch Scope</span><span className="ml-auto text-[8px] font-bold text-slate-400">{resolvedDocuments.length} doc</span></div>
          <div className="mt-2 grid grid-cols-2 gap-1" data-text-batch-scope-tabs="true">
            <ScopeButton active={scopeMode === 'document'} disabled={running || !structuredTextBatch?.activeDocumentId} onClick={() => setScopeMode('document')}>ACTIVE DOCUMENT</ScopeButton>
            <ScopeButton active={scopeMode === 'collection'} disabled={running || !hasCollectionScope} onClick={() => setScopeMode('collection')}>CURRENT COLLECTION</ScopeButton>
            <ScopeButton active={scopeMode === 'selected'} disabled={running || !documentOptions.length} onClick={() => setScopeMode('selected')}>SELECTED DOCS</ScopeButton>
            <ScopeButton active={scopeMode === 'all'} disabled={running || !documentOptions.length} onClick={() => setScopeMode('all')}>ALL STRUCTURED</ScopeButton>
          </div>

          {scopeMode === 'document' && <div className="mt-2" data-text-batch-card-range="true">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Cards</span>
              <input type="number" min={1} max={textCardMax} value={textScope?.startCard || 1} disabled={running} onChange={event => updateTextScope('startCard', event.target.value)} className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-xs dark:text-white"/>
              <span className="text-slate-400">–</span>
              <input type="number" min={1} max={textCardMax} value={textScope?.endCard || textCardMax} disabled={running} onChange={event => updateTextScope('endCard', event.target.value)} className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-xs dark:text-white"/>
              <span className="ml-auto text-[8px] font-bold text-slate-400">1–{textCardMax}</span>
            </div>
            <p className="mt-1.5 truncate text-[8px] text-slate-400" title={structuredTextBatch?.documentTitle || ''}>Active: {structuredTextBatch?.documentTitle || 'Text Document'} • range affects this Document only.</p>
          </div>}

          {scopeMode === 'selected' && <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-cyan-100 dark:border-cyan-900 bg-white/70 dark:bg-slate-900/40 p-2" data-text-batch-selected-documents="true">
            {documentOptions.map(document => <ToggleRow key={document.id} checked={selectedDocumentIds.includes(document.id)} disabled={running} onClick={() => toggleSelectedDocument(document.id)}>
              {document.title} • {document.documentType || 'text'}
            </ToggleRow>)}
          </div>}

          {scopeMode !== 'document' && scopeMode !== 'selected' && <p className="mt-2 text-[8px] text-slate-400">Every targeted Document uses its full Card range. Each job keeps its own DOC_ID / SEGMENT_ID and resolved download voice.</p>}
          <div className="mt-2 rounded-md bg-white/70 dark:bg-slate-900/40 p-2 text-[8px] text-slate-500" data-text-batch-document-summary="true">
            <div className="font-black text-cyan-700 dark:text-cyan-300">{scopeSummary}</div>
            {resolvedDocuments.slice(0, 4).map(document => <div key={document.id} className="mt-0.5 flex gap-2"><span className="truncate">{document.title}</span><span className="ml-auto shrink-0 text-slate-400">{document.jobCount || 0} jobs</span></div>)}
            {resolvedDocuments.length > 4 && <div className="mt-0.5 text-slate-400">+{resolvedDocuments.length - 4} more Documents</div>}
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-[9px] font-bold text-slate-500">Global Edge EN download fallback
            <select disabled={running} value={structuredTextBatch?.preferences?.edgeTextVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeTextVoiceId: e.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs dark:text-white">
              {(structuredTextBatch?.voices || []).filter(v => String(v?.lang || '').startsWith('en-')).map(v => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
            </select>
          </label>
          <label className="text-[9px] font-bold text-slate-500">Global Edge ID / Meaning download fallback
            <select disabled={running} value={structuredTextBatch?.preferences?.edgeMeaningVoiceId || ''} onChange={e => structuredTextBatch?.onPreferencesChange?.({ edgeMeaningVoiceId: e.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs dark:text-white">
              {(structuredTextBatch?.voices || []).filter(v => !String(v?.lang || '').startsWith('en-')).map(v => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
            </select>
          </label>
          <p className="text-[8px] text-slate-400">Document / speaker / Card / Segment download profiles configured in AUDIO remain higher priority; these are global fallbacks.</p>
        </div>

        <div className="flex gap-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-2.5">
          <ToggleRow checked={structuredTextBatch?.preferences?.generateText !== false} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateText: structuredTextBatch?.preferences?.generateText === false })}>EN / Text</ToggleRow>
          <ToggleRow checked={structuredTextBatch?.preferences?.generateMeaning !== false} disabled={running} onClick={() => structuredTextBatch?.onPreferencesChange?.({ generateMeaning: structuredTextBatch?.preferences?.generateMeaning === false })} tone="amber">ID / Meaning</ToggleRow>
        </div>

        <div className="rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/15 p-2.5 text-[9px]" data-text-batch-resolved-voices="true">
          <div className="font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Resolved Multi-Voice Plan</div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Voices: {textVoiceSummary.length ? textVoiceSummary.join(' + ') : '—'}</p>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">Speakers: {textSpeakerSummary.length ? textSpeakerSummary.join(', ') : 'single narrator / no speaker labels'}</p>
          <p className="mt-1 text-[8px] text-slate-400">Conversation keeps each Segment's exact speaker/channel download voice. Paragraph narrator defaults stay independent. Multi-Document output is separated again by Document during ZIP packaging.</p>
          <p className="mt-1 text-[8px] font-bold text-sky-600/80 dark:text-sky-300/80">Batch follows AUDIO download profiles. Bottom Player Settings never changes generated/downloaded voice, rate, or pitch.</p>
        </div>

        <div className="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/15 p-2.5 text-[9px]" data-audio-coverage-summary="text">
          <div className="flex justify-between font-black text-violet-700 dark:text-violet-300"><span>Selected Coverage</span><span>{coverage?.covered || 0}/{coverage?.total || 0}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 dark:text-slate-400">
            <span>Ready: {coverage?.ready || 0}</span><span>History only*: {coverage?.downloaded || 0}</span>
            <span>Other voice: {coverage?.otherVoice || 0}</span><span>Stale: {coverage?.stale || 0}</span>
            <span>Missing: {coverage?.missing || 0}</span><span className="font-black text-amber-600 dark:text-amber-300">Need: {coverage?.needDownload || 0}</span>
          </div>
          <p className="mt-1.5 text-[8px] text-slate-400">Only binary currently readable from Staging, Folder, mounted ZIP, or runtime is Ready. Export history never suppresses regeneration.</p>
        </div>

        {liveTelemetry?.sessionId && <div className="rounded-lg border border-cyan-100 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/15 p-2.5 text-[9px]" data-live-batch-telemetry="text">
          <div className="flex items-center justify-between gap-2 font-black text-cyan-700 dark:text-cyan-300"><span>Live Text Batch • {String(liveTelemetry.status || 'idle').replaceAll('-', ' ')}</span><span>{liveTelemetry.processed || 0}/{liveTelemetry.total || 0}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 dark:text-slate-400"><span>Ready est.: {liveTelemetry.readyEstimate || 0}</span><span>Need est.: {liveTelemetry.missingEstimate || 0}</span><span>Generated: {liveTelemetry.generated || 0}</span><span>Skipped Ready: {liveTelemetry.skippedReady || 0}</span><span>Failed: {liveTelemetry.failed || 0}</span><span>Remaining: {liveTelemetry.remaining || 0}</span></div>
          <p className="mt-1 text-[8px] text-cyan-600/80 dark:text-cyan-300/80">Counter UI only • no per-audio IndexedDB inventory scan{liveTelemetry.reconciled ? ' • final durable commit reconciled' : ''}.</p>
        </div>}

        <div className="rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/15 p-2.5 space-y-2" data-text-batch-export="true">
          <button type="button" disabled={running || !(coverage?.ready > 0)} onClick={() => setDirectMp3ConfirmOpen(true)} className="w-full rounded border border-emerald-200 dark:border-emerald-800 py-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-35"><Music className="mr-1 inline h-3 w-3"/>EXPORT READY MP3 • {coverage?.ready || 0}</button>
          <p className="text-[8px] leading-relaxed text-slate-400">Exports all Ready exact-voice slots in waves of max {directMp3Limit}. Missing/Other/Stale are skipped; no TTS starts.</p>
          <button type="button" disabled={running || !(coverage?.total > 0) || coverage?.ready !== coverage?.total} onClick={() => setConsolidatedZipConfirmOpen(true)} className="w-full rounded border border-sky-200 dark:border-sky-800 py-2 text-[10px] font-bold text-sky-700 dark:text-sky-300 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>{coverage?.ready === coverage?.total && coverage?.total > 0 ? `BUILD FULL CONSOLIDATED ZIP • ${coverage.ready}/${coverage.total}` : `FULL ZIP PENDING • ${coverage?.needDownload || 0} need source`}</button>
          {coverage?.ready > 0 && coverage?.ready < coverage?.total && <button type="button" disabled={running} onClick={() => setPartialZipConfirmOpen(true)} className="w-full rounded border border-amber-200 dark:border-amber-800 py-2 text-[9px] font-black text-amber-700 dark:text-amber-300 disabled:opacity-35"><FileArchive className="mr-1 inline h-3 w-3"/>EXPORT PARTIAL ZIP • {coverage.ready}/{coverage.total} READY</button>}
          <p className="text-[8px] leading-relaxed text-slate-400">Consolidation lazily combines Ready Text Staging + Folder + mounted ZIP binaries without TTS. Full output stays locked until the selected scope is complete.</p>
        </div>

        {running ? <button type="button" onClick={structuredTextBatch?.cancel} className="w-full rounded bg-red-500 py-2 text-xs font-bold text-white"><Loader2 className="mr-1 inline h-3 w-3 animate-spin"/>{structuredTextBatch?.statusText || 'STOP BATCH'}</button> : <>
          <button type="button" disabled={!(coverage?.needDownload || 0)} onClick={structuredTextBatch?.downloadMissing} className="w-full rounded bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-35"><Download className="mr-1 inline h-3 w-3"/>DOWNLOAD MISSING ({coverage?.needDownload || 0})</button>
          <button type="button" disabled={!(coverage?.total || 0)} onClick={structuredTextBatch?.redownloadAll} className="w-full rounded border border-slate-200 dark:border-slate-700 py-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-35">REDOWNLOAD SELECTED ({coverage?.total || 0})</button>
        </>}
      </div>

      <SafetyConfirmDialog
        open={consolidatedZipConfirmOpen}
        title="Build complete Text consolidated ZIP?"
        message={`${scopeSummary} • Ready ${coverage?.ready || 0}/${coverage?.total || 0} • resolved voices ${textVoiceSummary.join(' + ') || '—'}. ProLingo lazily reads exact Ready binaries from Text Staging, Folder, and mounted ZIP sources and creates resource-bounded ZIP group(s) separated by Document. No TTS is generated and source ZIP files are not modified.`}
        confirmLabel="Build Full ZIP"
        onCancel={() => setConsolidatedZipConfirmOpen(false)}
        onConfirm={() => { setConsolidatedZipConfirmOpen(false); structuredTextBatch?.exportFullZip?.(); }}
      />
      <SafetyConfirmDialog
        open={partialZipConfirmOpen}
        title="Export explicitly partial Text ZIP?"
        message={`${scopeSummary} • Ready ${coverage?.ready || 0}/${coverage?.total || 0}. Only currently readable exact-voice binaries are included, separated by Document. Archive filenames are marked PARTIAL. No TTS is generated.`}
        confirmLabel={`Export PARTIAL ${coverage?.ready || 0}/${coverage?.total || 0}`}
        onCancel={() => setPartialZipConfirmOpen(false)}
        onConfirm={() => { setPartialZipConfirmOpen(false); structuredTextBatch?.exportPartialZip?.(); }}
      />
      <SafetyConfirmDialog
        open={directMp3ConfirmOpen}
        title="Export all Ready Text audio as direct MP3?"
        message={`${scopeSummary} • Ready ${coverage?.ready || 0}/${coverage?.total || 0} • resolved voices ${textVoiceSummary.join(' + ') || '—'}. All Ready exact-voice Text audio downloads directly in waves of max ${directMp3Limit} files. Missing/Other/Stale are skipped and never generated.`}
        confirmLabel={`Export ${coverage?.ready || 0} MP3`}
        onCancel={() => setDirectMp3ConfirmOpen(false)}
        onConfirm={() => { setDirectMp3ConfirmOpen(false); structuredTextBatch?.exportReadyMp3?.(); }}
      />
    </div>
  );
};

export default TextBatchPopup;
