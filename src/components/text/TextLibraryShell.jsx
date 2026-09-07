import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronRight, Database, Download, Edit3, FileText, Layers, Loader2, PlayCircle, Plus, RefreshCcw, Save, Search, SkipForward, Upload, X } from 'lucide-react';

const typeLabel = type => type === 'conversation' ? 'Conversation' : type === 'paragraph' ? 'Paragraph' : 'Mixed';

export const TextLibraryShell = ({
  catalog,
  activeDocument,
  activeDocumentTree,
  activeDocumentId,
  isBusy,
  error,
  onSelectDocument,
  onCreateDocument,
  onCreateCollection,
  onRenameDocument,
  compact = false
}) => {
  const [createMode, setCreateMode] = useState(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [newDocumentType, setNewDocumentType] = useState('mixed');
  const [newDocumentCollectionId, setNewDocumentCollectionId] = useState('');
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const textPackInputRef = useRef(null);
  const databaseBackupInputRef = useRef(null);
  const packActions = activeDocumentTree?.__packActions || null;
  const databaseBackupActions = activeDocumentTree?.__databaseBackupActions || null;
  const search = activeDocumentTree?.__search || null;
  const [packStatus, setPackStatus] = useState(null);
  const [databaseBackupStatus, setDatabaseBackupStatus] = useState(null);
  const [preparedDatabaseBackup, setPreparedDatabaseBackup] = useState(null);
  const [databaseRestoreArmed, setDatabaseRestoreArmed] = useState(false);
  const [advancedLibraryToolsExpanded, setAdvancedLibraryToolsExpanded] = useState(false);

  const blockCount = activeDocumentTree?.blocks?.length || 0;
  const segmentCount = useMemo(
    () => (activeDocumentTree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length || 0), 0),
    [activeDocumentTree]
  );
  const documentCount = (catalog?.rootDocuments?.length || 0) + (catalog?.collections || []).reduce((sum, collection) => sum + (collection.documents?.length || 0), 0);
  const showLibraryTools = !compact || advancedLibraryToolsExpanded;

  const submitDocument = async () => {
    const title = newDocumentTitle.trim();
    if (!title || isBusy) return;
    const result = await onCreateDocument?.({
      title,
      documentType: newDocumentType,
      collectionId: newDocumentCollectionId || null
    });
    if (!result) return;
    setNewDocumentTitle('');
    setNewDocumentType('mixed');
    setCreateMode(null);
  };

  const submitCollection = async () => {
    const title = newCollectionTitle.trim();
    if (!title || isBusy) return;
    const result = await onCreateCollection?.(title);
    if (!result) return;
    setNewCollectionTitle('');
    setCreateMode(null);
  };

  const submitRename = async () => {
    const title = renameTitle.trim();
    if (!activeDocument?.id || !title || isBusy) return;
    const result = await onRenameDocument?.(activeDocument.id, title);
    if (!result) return;
    setRenameOpen(false);
  };

  const runPackAction = async (action, successLabel) => {
    if (!action || isBusy) return null;
    setPackStatus(null);
    const result = await action();
    if (!result) return null;
    setPackStatus(successLabel(result));
    return result;
  };

  const handleTextPackFile = async event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !packActions?.importMerge || isBusy) return;
    setPackStatus(null);
    const result = await packActions.importMerge(file);
    if (!result) return;
    const counts = result.counts || {};
    setPackStatus(`Merged ${counts.documents || 0} document(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };


  const runDatabaseBackupExport = async () => {
    if (!databaseBackupActions?.exportDatabase || isBusy) return;
    setDatabaseBackupStatus(null);
    const result = await databaseBackupActions.exportDatabase();
    if (!result) return;
    setDatabaseBackupStatus(`Exported ${result.filename}.`);
  };

  const handleDatabaseBackupFile = async event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !databaseBackupActions?.inspectBackup || isBusy) return;
    setDatabaseBackupStatus(null);
    setPreparedDatabaseBackup(null);
    setDatabaseRestoreArmed(false);
    const result = await databaseBackupActions.inspectBackup(file);
    if (!result) return;
    setPreparedDatabaseBackup(result);
    const counts = result.diagnostics?.counts || {};
    setDatabaseBackupStatus(`Validated ${counts.documents || 0} document(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };

  const applyDatabaseReplaceRestore = async () => {
    if (!preparedDatabaseBackup?.backup || !databaseBackupActions?.restoreDatabase || isBusy) return;
    if (!databaseRestoreArmed) {
      setDatabaseRestoreArmed(true);
      return;
    }
    const result = await databaseBackupActions.restoreDatabase(preparedDatabaseBackup.backup);
    if (!result) return;
    setDatabaseRestoreArmed(false);
    setPreparedDatabaseBackup(null);
    const counts = result.diagnostics?.counts || {};
    setDatabaseBackupStatus(`Replace restore complete: ${counts.documents || 0} document(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };

  return (
    <section className={`rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 ${compact ? 'p-3' : 'p-3'} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-black text-slate-800 dark:text-white">Text Library</h3>
            {!compact && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">INDEXEDDB</span>}
          </div>
          <p className="text-[9px] text-slate-400 mt-1">{documentCount} document{documentCount === 1 ? '' : 's'} • {catalog?.collections?.length || 0} collection{catalog?.collections?.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-1">
          {isBusy && <span className="hidden sm:inline-flex items-center gap-1 text-[8px] font-bold text-indigo-500" role="status" aria-live="polite"><Loader2 className="w-3 h-3 animate-spin"/>Updating…</span>}
          <button type="button" disabled={isBusy} onClick={() => setCreateMode(createMode === 'document' ? null : 'document')} className="w-10 h-10 flex items-center justify-center rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition active:scale-95" title="New Document" aria-label="Create new Text document"><FileText className="w-3.5 h-3.5"/></button>
          <button type="button" disabled={isBusy} onClick={() => setCreateMode(createMode === 'collection' ? null : 'collection')} className="w-10 h-10 flex items-center justify-center rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition active:scale-95" title="New Collection" aria-label="Create new Text collection"><Layers className="w-3.5 h-3.5"/></button>
        </div>
      </div>

      <select
        value={activeDocumentId || ''}
        disabled={isBusy || !documentCount}
        onChange={event => onSelectDocument?.(event.target.value)}
        className="w-full min-h-11 text-sm md:text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50"
      >
        {(catalog?.rootDocuments || []).length > 0 && <optgroup label="Library Root">
          {catalog.rootDocuments.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}
        </optgroup>}
        {(catalog?.collections || []).map(collection => <optgroup key={collection.id} label={collection.title}>
          {(collection.documents || []).map(document => <option key={document.id} value={document.id}>{document.title}</option>)}
        </optgroup>)}
      </select>

      {!documentCount && <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900 bg-white/70 dark:bg-slate-900/30 p-4 text-center" data-text-library-empty="true">
        <FileText className="w-5 h-5 mx-auto text-indigo-300 dark:text-indigo-700"/>
        <p className="mt-2 text-[10px] font-black text-slate-600 dark:text-slate-300">No Text documents yet</p>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Create a Document to start building Cards and Segments. Collections are optional.</p>
        <button type="button" disabled={isBusy} onClick={() => setCreateMode('document')} className="mt-3 min-h-10 px-3 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40 active:scale-95 transition"><Plus className="w-3 h-3 inline mr-1"/>Create first Document</button>
      </div>}

      {search && <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/15 p-2.5 space-y-2" data-text-library-search="true">
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300 shrink-0"/>
          <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Search Text Library</p>
          <span className={`${compact ? 'hidden' : 'ml-auto'} text-[8px] text-slate-400`}>Title • Text • Meaning • Speaker</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
          <input
            type="search"
            value={search.query || ''}
            onChange={event => search.onQueryChange?.(event.target.value)}
            placeholder="Search all Text documents…"
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Search Text Library"
            className="w-full min-h-11 rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 py-2 pl-8 pr-11 text-sm md:text-[10px] text-slate-700 dark:text-slate-200 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-950/40"
            data-text-library-search-input="true"
          />
          {search.query && <button type="button" onClick={() => search.onQueryChange?.('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition" title="Clear search" aria-label="Clear Text Library search"><X className="w-3 h-3"/></button>}
        </div>

        {(search.query || '').trim().length === 1 && <p className="text-[8px] text-slate-400">Type at least 2 characters.</p>}
        {(search.query || '').trim().length >= 2 && <div className="space-y-1.5" data-text-library-search-results="true">
          <div className="flex items-center justify-between text-[8px] text-slate-400" role="status" aria-live="polite"><span>{search.results?.length || 0} result{search.results?.length === 1 ? '' : 's'}</span><span>Library-wide</span></div>
          {(search.results || []).length === 0 && <div className="rounded-lg border border-dashed border-sky-200 dark:border-sky-900 bg-white/70 dark:bg-slate-900/40 p-3 text-center text-[9px] text-slate-400">No matching Text content.</div>}
          <div className={`${compact ? 'max-h-[45dvh]' : 'max-h-72'} space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 custom-scrollbar`}>
            {(search.results || []).map(result => {
              const isSegment = result.resultType === 'segment';
              const isCard = result.resultType === 'card';
              const canPlay = result.editorModel === 'structured-v1';
              const title = isSegment ? (result.blockTitle || result.blockId || 'Segment') : isCard ? (result.blockTitle || result.blockId || 'Card') : result.documentTitle;
              const context = isSegment || isCard ? `${result.documentTitle}${result.blockTitle && isSegment ? ` › ${result.blockTitle}` : ''}` : result.editorModel === 'structured-v1' ? 'Structured Document' : 'Legacy Document';
              return <div key={result.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-2" data-text-library-search-result={result.id}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] font-black text-slate-700 dark:text-slate-200 truncate">{title}</span>
                      <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">{result.resultType}</span>
                      {(result.matchedFields || []).map(field => <span key={field} className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{field}</span>)}
                    </div>
                    <p className="mt-0.5 text-[8px] text-slate-400 truncate">{context}</p>
                    {isSegment && <div className="mt-1 space-y-0.5">
                      {result.speaker && <p className="text-[8px] font-black text-sky-600 dark:text-sky-300">{result.speaker}</p>}
                      <p className="text-[9px] leading-snug text-slate-600 dark:text-slate-300 line-clamp-2">{result.text}</p>
                      {result.meaning && <p className="text-[8px] leading-snug text-slate-400 line-clamp-1">{result.meaning}</p>}
                    </div>}
                    {!compact && <p className="mt-1 text-[7px] font-mono text-slate-300 dark:text-slate-600">{result.segmentId || result.blockId || result.documentId}</p>}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button type="button" disabled={isBusy} onClick={() => search.onAction?.(result, 'open')} className="min-h-10 sm:min-h-9 px-3 py-2 sm:py-1.5 rounded-md border border-sky-200 dark:border-sky-900 text-[9px] sm:text-[8px] font-black text-sky-700 dark:text-sky-300 disabled:opacity-40 active:scale-95 transition"><BookOpen className="w-3 h-3 inline mr-1"/>Open</button>
                  {canPlay && <button type="button" disabled={isBusy} onClick={() => search.onAction?.(result, 'play')} className="min-h-10 sm:min-h-9 px-3 py-2 sm:py-1.5 rounded-md bg-indigo-600 text-white text-[9px] sm:text-[8px] font-black disabled:opacity-40 active:scale-95 transition"><PlayCircle className="w-3 h-3 inline mr-1"/>Play</button>}
                  {canPlay && isSegment && <button type="button" disabled={isBusy} onClick={() => search.onAction?.(result, 'start-here')} className="min-h-10 sm:min-h-9 px-3 py-2 sm:py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] sm:text-[8px] font-black disabled:opacity-40 active:scale-95 transition"><SkipForward className="w-3 h-3 inline mr-1"/>Start Here</button>}
                </div>
              </div>;
            })}
          </div>
        </div>}
      </div>}

      {activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{activeDocument.title}</p>
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{typeLabel(activeDocument.documentType)}</span>
              {!compact && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${activeDocument.editorModel === 'structured-v1' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{activeDocument.editorModel === 'structured-v1' ? 'STRUCTURED V1' : 'LEGACY BRIDGE'}</span>}
            </div>
            {!compact && <p className="text-[8px] font-mono text-slate-400 mt-1">{activeDocument.id}</p>}
            <p className="text-[9px] text-slate-400 mt-1">{blockCount} card{blockCount === 1 ? '' : 's'} • {segmentCount} playable segment{segmentCount === 1 ? '' : 's'}</p>
          </div>
          <button type="button" disabled={isBusy} onClick={() => { setRenameTitle(activeDocument.title); setRenameOpen(true); }} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 disabled:opacity-50 active:scale-95 transition" title="Rename Document" aria-label="Rename active Text document"><Edit3 className="w-3.5 h-3.5"/></button>
        </div>
      </div>}

      {compact && (packActions || databaseBackupActions) && <button type="button" onClick={() => setAdvancedLibraryToolsExpanded(value => !value)} className="w-full min-h-10 flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left text-[10px] font-black text-slate-600 dark:text-slate-300" aria-expanded={advancedLibraryToolsExpanded} data-text-library-advanced-tools-toggle="true">
        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${advancedLibraryToolsExpanded ? 'rotate-90' : ''}`}/>
        Import, export & backup
        <span className="ml-auto text-[8px] font-normal text-slate-400">advanced</span>
      </button>}

      {showLibraryTools && packActions && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2.5 space-y-2 animate-in fade-in duration-150">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">ProLingo Text Pack JSON</p>
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">MERGE ONLY</span>
            </div>
            <p className="text-[8px] text-slate-400 mt-1">Portable Collection/Document/Card/Segment data. Audio identity metadata follows SEGMENT_ID; binary audio is not embedded.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" disabled={isBusy || activeDocument?.editorModel !== 'structured-v1' || !packActions.exportDocument} onClick={() => runPackAction(packActions.exportDocument, result => `Exported ${result.filename}.`)} className="px-2 py-1.5 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-40" title="Export active structured Document"><Download className="w-3 h-3 inline mr-1"/>Document</button>
          <button type="button" disabled={isBusy || !activeDocument?.collectionId || !packActions.exportCollection} onClick={() => runPackAction(packActions.exportCollection, result => `Exported ${result.filename}.`)} className="px-2 py-1.5 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-40" title={activeDocument?.collectionId ? 'Export active Collection' : 'Move this Document into a Collection to export a Collection pack'}><Layers className="w-3 h-3 inline mr-1"/>Collection</button>
          <button type="button" disabled={isBusy} onClick={() => textPackInputRef.current?.click()} className="px-2 py-1.5 rounded bg-indigo-600 text-white text-[9px] font-bold disabled:opacity-40" title="Import Text Pack with safe Merge"><Upload className="w-3 h-3 inline mr-1"/>Import Merge</button>
        </div>
        <input ref={textPackInputRef} type="file" accept=".json,application/json" onChange={handleTextPackFile} className="hidden" />
        {packStatus && <p className="text-[8px] text-emerald-600 dark:text-emerald-400" role="status" aria-live="polite">{packStatus}</p>}
      </div>}


      {showLibraryTools && databaseBackupActions && <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/50 dark:bg-amber-950/10 p-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <Database className="w-3.5 h-3.5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Full Text Database Backup / Restore</p>
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">REPLACE RESTORE</span>
            </div>
            <p className="text-[8px] text-slate-400 mt-1">Safety snapshot of the Text IndexedDB: metadata, Collections, Documents, Cards, Segments, audio identity metadata, counters, and active Document. External audio binaries and preferences are not embedded.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" disabled={isBusy} onClick={runDatabaseBackupExport} className="px-2 py-1.5 rounded border border-emerald-200 dark:border-emerald-800 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-40" title="Export a full Text IndexedDB safety snapshot"><Download className="w-3 h-3 inline mr-1"/>Export DB</button>
          <button type="button" disabled={isBusy} onClick={() => databaseBackupInputRef.current?.click()} className="px-2 py-1.5 rounded border border-amber-300 dark:border-amber-800 text-[9px] font-bold text-amber-700 dark:text-amber-300 disabled:opacity-40" title="Load and validate a full Text Database Backup"><Upload className="w-3 h-3 inline mr-1"/>Load Restore</button>
        </div>
        <input ref={databaseBackupInputRef} type="file" accept=".json,application/json" onChange={handleDatabaseBackupFile} className="hidden" />
        {preparedDatabaseBackup?.diagnostics && <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900/50 p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[8px] text-slate-500 dark:text-slate-400">
            <span>Documents <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.documents || 0}</b></span>
            <span>Cards <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.blocks || 0}</b></span>
            <span>Segments <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.segments || 0}</b></span>
            <span>Audio metadata <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.audioVariants || 0}</b></span>
          </div>
          <p className="text-[8px] text-red-600 dark:text-red-400 flex gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0"/>Restore replaces the entire local Text Library. Use A14 Text Pack Import Merge when you only want to add portable content.</p>
          <button type="button" disabled={isBusy} onClick={applyDatabaseReplaceRestore} className={`w-full px-2 py-1.5 rounded border text-[9px] font-black ${databaseRestoreArmed ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}>
            <RefreshCcw className="w-3 h-3 inline mr-1"/>{databaseRestoreArmed ? 'Confirm Replace Entire Text DB' : 'Arm Replace Restore'}
          </button>
          {databaseRestoreArmed && <button type="button" disabled={isBusy} onClick={() => setDatabaseRestoreArmed(false)} className="w-full text-[8px] text-slate-400 underline">Cancel destructive restore confirmation</button>}
        </div>}
        {databaseBackupStatus && <p className="text-[8px] text-slate-500 dark:text-slate-400 break-words" role="status" aria-live="polite">{databaseBackupStatus}</p>}
      </div>}


      {renameOpen && <div className="flex gap-1.5">
        <input value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitRename()} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white" autoFocus={!compact} />
        <button type="button" disabled={isBusy || !renameTitle.trim()} onClick={submitRename} className="p-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"><Save className="w-3.5 h-3.5"/></button>
        <button type="button" disabled={isBusy} onClick={() => setRenameOpen(false)} className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"><X className="w-3.5 h-3.5"/></button>
      </div>}

      {createMode === 'document' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Structured Document</p>
        <input value={newDocumentTitle} onChange={event => setNewDocumentTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitDocument()} placeholder="Document title" disabled={isBusy} className="w-full min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
        <div className="grid grid-cols-2 gap-2">
          <select value={newDocumentType} onChange={event => setNewDocumentType(event.target.value)} disabled={isBusy} className="min-h-11 text-sm md:text-[10px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="mixed">Mixed</option><option value="paragraph">Paragraph</option><option value="conversation">Conversation</option>
          </select>
          <select value={newDocumentCollectionId} onChange={event => setNewDocumentCollectionId(event.target.value)} disabled={isBusy} className="min-h-11 text-sm md:text-[10px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="">Library Root</option>
            {(catalog?.collections || []).map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </select>
        </div>
        <button type="button" disabled={isBusy || !newDocumentTitle.trim()} onClick={submitDocument} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40"><Plus className="w-3 h-3"/>Create & Open</button>
      </div>}

      {createMode === 'collection' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Collection / Book</p>
        <input value={newCollectionTitle} onChange={event => setNewCollectionTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCollection()} placeholder="Collection title" disabled={isBusy} className="w-full min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
        <button type="button" disabled={isBusy || !newCollectionTitle.trim()} onClick={submitCollection} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40"><Plus className="w-3 h-3"/>Create Collection</button>
      </div>}

      {error && <p className="text-[9px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded p-2" role="alert">{error}</p>}
    </section>
  );
};

export default TextLibraryShell;
