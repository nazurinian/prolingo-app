import React, { useMemo, useRef, useState } from 'react';
import TextAudioDataPanel from './TextAudioDataPanel.jsx';
import { AlertTriangle, BookOpen, ChevronRight, Copy, Database, Download, Edit3, FileText, Layers, Link2, Loader2, PlayCircle, Plus, RefreshCcw, Save, Search, SkipForward, Trash2, Unlink, Upload, X } from 'lucide-react';

const typeLabel = document => document?.editorModel === 'legacy-line-v1' ? 'Legacy' : document?.documentType === 'conversation' ? 'Conversation' : document?.documentType === 'paragraph' ? 'Paragraph' : 'Mixed (compatibility)';

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
  onMoveDocument,
  onDeleteDocument,
  onRenameCollection,
  onDeleteCollection,
  audioLibrary = null,
  compact = false
}) => {
  const [createMode, setCreateMode] = useState(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [newDocumentType, setNewDocumentType] = useState('paragraph');
  const [newDocumentCollectionId, setNewDocumentCollectionId] = useState('');
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCollectionId, setMoveCollectionId] = useState('');
  const [collectionRenameOpen, setCollectionRenameOpen] = useState(false);
  const [collectionRenameTitle, setCollectionRenameTitle] = useState('');
  const [deleteDocumentArmed, setDeleteDocumentArmed] = useState(false);
  const [deleteCollectionArmed, setDeleteCollectionArmed] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const sourceAttachInputRef = useRef(null);
  const sourceCopyInputRef = useRef(null);
  const databaseBackupInputRef = useRef(null);
  const packActions = activeDocumentTree?.__packActions || null;
  const databaseBackupActions = activeDocumentTree?.__databaseBackupActions || null;
  const search = activeDocumentTree?.__search || null;
  const [packStatus, setPackStatus] = useState(null);
  const [databaseBackupStatus, setDatabaseBackupStatus] = useState(null);
  const [preparedDatabaseBackup, setPreparedDatabaseBackup] = useState(null);
  const [databaseRestoreArmed, setDatabaseRestoreArmed] = useState(false);
  const [advancedLibraryToolsExpanded, setAdvancedLibraryToolsExpanded] = useState(false);
  const [sourceActionArmed, setSourceActionArmed] = useState(null);

  const blockCount = activeDocumentTree?.blocks?.length || 0;
  const segmentCount = useMemo(
    () => (activeDocumentTree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length || 0), 0),
    [activeDocumentTree]
  );
  const documentCount = (catalog?.rootDocuments?.length || 0) + (catalog?.collections || []).reduce((sum, collection) => sum + (collection.documents?.length || 0), 0);
  const showLibraryTools = !compact || advancedLibraryToolsExpanded;
  const activeCollection = activeDocument?.collectionId ? (catalog?.collections || []).find(item => item.id === activeDocument.collectionId) || null : null;
  const sourceAttachments = Array.isArray(packActions?.sourceAttachments) ? packActions.sourceAttachments : [];
  const activeDocumentAttachment = activeDocument?.id ? sourceAttachments.find(item => Object.values(item.idMap?.documents || {}).includes(activeDocument.id)) || null : null;
  const activeCollectionAttachment = activeCollection?.id ? sourceAttachments.find(item => Object.values(item.idMap?.collections || {}).includes(activeCollection.id)) || null : null;

  const submitDocument = async () => {
    const title = newDocumentTitle.trim();
    if (!title || isBusy) return;
    const result = await onCreateDocument?.({
      title,
      documentType: newDocumentType === 'legacy' ? 'mixed' : newDocumentType,
      editorModel: newDocumentType === 'legacy' ? 'legacy-line-v1' : 'structured-v1',
      collectionId: newDocumentCollectionId || null
    });
    if (!result) return;
    setNewDocumentTitle('');
    setNewDocumentType('paragraph');
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

  const submitMove = async () => {
    if (!activeDocument?.id || isBusy) return;
    const targetCollectionId = moveCollectionId || null;
    if ((activeDocument.collectionId || null) === targetCollectionId) {
      setMoveOpen(false);
      return;
    }
    const result = await onMoveDocument?.(activeDocument.id, targetCollectionId);
    if (!result) return;
    setMoveOpen(false);
  };


  const submitCollectionRename = async () => {
    const title = collectionRenameTitle.trim();
    if (!activeCollection?.id || !title || isBusy) return;
    const result = await onRenameCollection?.(activeCollection.id, title);
    if (!result) return;
    setCollectionRenameOpen(false);
  };

  const requestDeleteDocument = async () => {
    if (!activeDocument?.id || isBusy) return;
    if (!deleteDocumentArmed) {
      setDeleteDocumentArmed(true);
      return;
    }
    const result = await onDeleteDocument?.(activeDocument.id);
    if (result) setDeleteDocumentArmed(false);
  };

  const requestDeleteCollection = async () => {
    if (!activeCollection?.id || isBusy) return;
    if (!deleteCollectionArmed) {
      setDeleteCollectionArmed(true);
      return;
    }
    const result = await onDeleteCollection?.(activeCollection.id);
    if (result) setDeleteCollectionArmed(false);
  };

  const runPackAction = async (action, successLabel) => {
    if (!action || isBusy) return null;
    setPackStatus(null);
    const result = await action();
    if (!result) return null;
    setPackStatus(successLabel(result));
    return result;
  };

  const handleSourceAttachOrSyncFile = async event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !packActions?.attachOrSync || isBusy) return;
    setPackStatus(null);
    const result = await packActions.attachOrSync(file);
    if (!result) return;
    if (result.mode === 'attach') {
      setPackStatus(`Attached canonical source: ${result.packageId}. Repeat load of the same source will Sync/Replace.`);
    } else {
      const stats = result.stats || {};
      setPackStatus(`Synced ${result.packageId}: +${stats.created || 0} created, ~${stats.updated || 0} updated, -${stats.deleted || 0} removed, ${stats.preservedLocal || 0} local change(s) preserved.`);
    }
  };

  const handleSourceImportCopyFile = async event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !packActions?.importCopy || isBusy) return;
    setPackStatus(null);
    const result = await packActions.importCopy(file);
    if (!result) return;
    const counts = result.counts || {};
    setPackStatus(`Imported independent copy: ${counts.documents || 0} document(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };

  const runSourceDetach = async (attachment, removeData) => {
    if (!attachment?.attachmentId || !packActions?.detachSource || isBusy) return;
    const key = `${attachment.attachmentId}:${removeData ? 'remove' : 'detach'}`;
    if (sourceActionArmed !== key) {
      setSourceActionArmed(key);
      return;
    }
    setPackStatus(null);
    const result = await packActions.detachSource(attachment.attachmentId, removeData);
    if (!result) return;
    setSourceActionArmed(null);
    setPackStatus(removeData
      ? `Removed source-owned local data for ${attachment.packageId}.`
      : `Detached ${attachment.packageId}; local data was kept as independent Text data.`);
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
    <section className={`w-full min-w-0 overflow-hidden rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 ${compact ? 'p-3' : 'p-3'} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-black text-slate-800 dark:text-white">Text Library</h3>
            {!compact && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">INDEXEDDB</span>}
          </div>
          <p className="text-[9px] text-slate-400 mt-1">{documentCount} document{documentCount === 1 ? '' : 's'} • {catalog?.collections?.length || 0} collection{catalog?.collections?.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
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

      {activeDocument?.editorModel === 'structured-v1' && <TextAudioDataPanel audioLibrary={audioLibrary} compact={compact} disabled={isBusy} />}

      {activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{activeDocument.title}</p>
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{typeLabel(activeDocument)}</span>
              {!compact && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${activeDocument.editorModel === 'structured-v1' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{activeDocument.editorModel === 'structured-v1' ? 'STRUCTURED V1' : 'LEGACY'}</span>}
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

      {showLibraryTools && packActions && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2.5 space-y-2 animate-in fade-in duration-150" data-text-source-lifecycle="true">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Text Sources / JSON</p>
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">ATTACH • SYNC • DETACH</span>
            </div>
            <p className="text-[8px] text-slate-400 mt-1 break-words">Canonical load keeps one attached source. Loading the same package again Syncs in place. Import as Copy remains an explicit independent-copy path.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
          <button type="button" disabled={isBusy || activeDocument?.editorModel !== 'structured-v1' || !packActions.exportDocument} onClick={() => runPackAction(packActions.exportDocument, result => `Exported ${result.filename}.`)} className="min-w-0 px-2 py-2 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-40" title="Export active structured Document"><Download className="w-3 h-3 inline mr-1"/>Document JSON</button>
          <button type="button" disabled={isBusy || !activeDocument?.collectionId || !packActions.exportCollection} onClick={() => runPackAction(packActions.exportCollection, result => `Exported ${result.filename}.`)} className="min-w-0 px-2 py-2 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-40" title={activeDocument?.collectionId ? 'Export active Collection' : 'Move this Document into a Collection to export a Collection pack'}><Layers className="w-3 h-3 inline mr-1"/>Collection JSON</button>
          <button type="button" disabled={isBusy || !packActions.attachOrSync} onClick={() => sourceAttachInputRef.current?.click()} className="min-w-0 px-2 py-2 rounded bg-indigo-600 text-white text-[9px] font-bold disabled:opacity-40" title="Attach a new canonical Text source, or Sync/Replace an already attached package"><Link2 className="w-3 h-3 inline mr-1"/>Attach / Sync</button>
          <button type="button" disabled={isBusy || !packActions.importCopy} onClick={() => sourceCopyInputRef.current?.click()} className="min-w-0 px-2 py-2 rounded border border-slate-300 dark:border-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40" title="Create a separate independent local copy using legacy merge/remap semantics"><Copy className="w-3 h-3 inline mr-1"/>Import as Copy</button>
        </div>
        <input ref={sourceAttachInputRef} type="file" accept=".json,application/json" onChange={handleSourceAttachOrSyncFile} className="hidden" />
        <input ref={sourceCopyInputRef} type="file" accept=".json,application/json" onChange={handleSourceImportCopyFile} className="hidden" />

        <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2 space-y-1.5" data-text-source-registry="true">
          <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Attached sources</p><span className="text-[8px] text-slate-400">{sourceAttachments.length}</span></div>
          {sourceAttachments.length === 0 ? <p className="text-[8px] text-slate-400">No canonical JSON source attached yet.</p> : <div className="max-h-44 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-1.5 pr-0.5">
            {sourceAttachments.map(attachment => {
              const detachKey = `${attachment.attachmentId}:detach`;
              const removeKey = `${attachment.attachmentId}:remove`;
              return <div key={attachment.attachmentId} className="min-w-0 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] font-black text-slate-700 dark:text-slate-200 truncate">{attachment.fileName || attachment.packageId}</p>
                    <p className="text-[7px] text-slate-400 break-all">{attachment.packageId}</p>
                    <p className="mt-0.5 text-[7px] text-slate-400">{attachment.scopeType} • {attachment.counts?.documents || 0} doc • {attachment.counts?.blocks || 0} card • {attachment.counts?.segments || 0} segment • <span className={attachment.status === 'conflict' ? 'text-red-500' : attachment.status === 'local-changed' ? 'text-amber-600' : 'text-emerald-600'}>{attachment.status || 'attached'}</span></p>
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button type="button" disabled={isBusy} onClick={() => runSourceDetach(attachment, false)} className={`min-h-9 px-2 rounded border text-[8px] font-black ${sourceActionArmed === detachKey ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`} title="Stop tracking this source but keep its local data"><Unlink className="w-3 h-3 inline mr-1"/>{sourceActionArmed === detachKey ? 'Confirm Detach' : 'Detach • Keep Local'}</button>
                  <button type="button" disabled={isBusy} onClick={() => runSourceDetach(attachment, true)} className={`min-h-9 px-2 rounded border text-[8px] font-black ${sourceActionArmed === removeKey ? 'border-red-500 bg-red-600 text-white' : 'border-red-200 dark:border-red-900 text-red-500'}`} title="Remove this attached source and its unchanged source-owned local data. Local edits fail closed."><Trash2 className="w-3 h-3 inline mr-1"/>{sourceActionArmed === removeKey ? 'Confirm Remove' : 'Remove Source Data'}</button>
                </div>
              </div>;
            })}
          </div>}
        </div>
        {packStatus && <p className="text-[8px] text-emerald-600 dark:text-emerald-400 break-words" role="status" aria-live="polite">{packStatus}</p>}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
          <p className="text-[8px] text-red-600 dark:text-red-400 flex gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0"/>Restore replaces the entire local Text Library. Canonical source attachments are included through Text DB metadata; use Import as Copy only for intentional independent duplicates.</p>
          <button type="button" disabled={isBusy} onClick={applyDatabaseReplaceRestore} className={`w-full px-2 py-1.5 rounded border text-[9px] font-black ${databaseRestoreArmed ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}>
            <RefreshCcw className="w-3 h-3 inline mr-1"/>{databaseRestoreArmed ? 'Confirm Replace Entire Text DB' : 'Arm Replace Restore'}
          </button>
          {databaseRestoreArmed && <button type="button" disabled={isBusy} onClick={() => setDatabaseRestoreArmed(false)} className="w-full text-[8px] text-slate-400 underline">Cancel destructive restore confirmation</button>}
        </div>}
        {databaseBackupStatus && <p className="text-[8px] text-slate-500 dark:text-slate-400 break-words" role="status" aria-live="polite">{databaseBackupStatus}</p>}
      </div>}


      {activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2.5 space-y-2" data-text-library-crud="true">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[12rem] flex-1">
            <p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Document actions</p>
            <p className="text-[8px] text-slate-400 truncate">{typeLabel(activeDocument)} • {activeDocument.id}</p>
          </div>
          <button type="button" disabled={isBusy} onClick={() => { setRenameTitle(activeDocument.title || ''); setRenameOpen(value => !value); setDeleteDocumentArmed(false); }} className="min-h-10 px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[8px] font-black text-indigo-600 dark:text-indigo-300"><Edit3 className="w-3 h-3 inline mr-1"/>Rename</button>
          {onMoveDocument && <button type="button" disabled={isBusy || Boolean(activeDocumentAttachment)} onClick={() => { setMoveCollectionId(activeDocument.collectionId || ''); setMoveOpen(value => !value); setDeleteDocumentArmed(false); }} className="min-h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[8px] font-black text-slate-600 dark:text-slate-300 disabled:opacity-40" title={activeDocumentAttachment ? 'Attached source Documents keep source ownership location. Detach first before moving.' : 'Move Document to Library Root or another Collection'}><Layers className="w-3 h-3 inline mr-1"/>Move</button>}
          <button type="button" disabled={isBusy || Boolean(activeDocumentAttachment)} onClick={requestDeleteDocument} className={`min-h-10 px-2.5 rounded-lg border text-[8px] font-black disabled:opacity-40 ${deleteDocumentArmed ? 'border-red-500 bg-red-600 text-white' : 'border-red-200 dark:border-red-900 text-red-500'}`} title={activeDocumentAttachment ? 'This Document belongs to an attached source. Detach or Remove Source Data first.' : 'Delete local Document'}><Trash2 className="w-3 h-3 inline mr-1"/>{deleteDocumentArmed ? 'Confirm delete' : 'Delete'}</button>
        </div>
        {activeCollection && <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Collection</p><p className="text-[8px] text-slate-400 truncate">{activeCollection.title} • {activeCollection.id}</p></div>
          <button type="button" disabled={isBusy} onClick={() => { setCollectionRenameTitle(activeCollection.title || ''); setCollectionRenameOpen(value => !value); setDeleteCollectionArmed(false); }} className="min-h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[8px] font-black text-slate-600 dark:text-slate-300">Rename</button>
          <button type="button" disabled={isBusy || Boolean(activeCollectionAttachment) || (activeCollection.documents?.length || 0) > 0} onClick={requestDeleteCollection} className={`min-h-10 px-2 rounded-lg border text-[8px] font-black disabled:opacity-40 ${deleteCollectionArmed ? 'border-red-500 bg-red-600 text-white' : 'border-red-200 dark:border-red-900 text-red-500'}`} title={(activeCollection.documents?.length || 0) > 0 ? 'Collection must be empty before deletion' : 'Delete empty collection'}>{deleteCollectionArmed ? 'Confirm' : 'Delete'}</button>
        </div>}
      </div>}

      {(catalog?.collections || []).length > 0 && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2.5" data-text-collection-manager="true">
        <p className="text-[9px] font-black text-slate-600 dark:text-slate-300 mb-2">Collections</p>
        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
          {(catalog.collections || []).map(collection => <div key={collection.id} className="flex items-center gap-2 rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5">
            <div className="min-w-0 flex-1"><p className="text-[8px] font-black text-slate-600 dark:text-slate-300 truncate">{collection.title}</p><p className="text-[7px] text-slate-400">{collection.documents?.length || 0} document(s) • {collection.id}</p></div>
            {(collection.documents?.length || 0) === 0 && <button type="button" disabled={isBusy} onClick={async () => { if (typeof window !== 'undefined' && !window.confirm(`Delete empty Collection “${collection.title}”?`)) return; await onDeleteCollection?.(collection.id); }} className="w-9 h-9 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900 text-red-500 disabled:opacity-40" title="Delete empty Collection"><Trash2 className="w-3.5 h-3.5"/></button>}
          </div>)}
        </div>
      </div>}

      {collectionRenameOpen && activeCollection && <div className="flex gap-1.5">
        <input value={collectionRenameTitle} onChange={event => setCollectionRenameTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCollectionRename()} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white" />
        <button type="button" disabled={isBusy || !collectionRenameTitle.trim()} onClick={submitCollectionRename} className="p-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"><Save className="w-3.5 h-3.5"/></button>
        <button type="button" onClick={() => setCollectionRenameOpen(false)} className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400"><X className="w-3.5 h-3.5"/></button>
      </div>}

      {renameOpen && <div className="flex gap-1.5">
        <input value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitRename()} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white" autoFocus={!compact} />
        <button type="button" disabled={isBusy || !renameTitle.trim()} onClick={submitRename} className="p-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"><Save className="w-3.5 h-3.5"/></button>
        <button type="button" disabled={isBusy} onClick={() => setRenameOpen(false)} className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"><X className="w-3.5 h-3.5"/></button>
      </div>}

      {moveOpen && activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2.5 space-y-2" data-text-document-move="true">
        <div><p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Move Document</p><p className="text-[8px] text-slate-400">Permanent DOC_ID stays unchanged. Only its Library/Collection location changes.</p></div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={moveCollectionId} onChange={event => setMoveCollectionId(event.target.value)} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-[10px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="">Library Root</option>
            {(catalog?.collections || []).map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </select>
          <button type="button" disabled={isBusy || (activeDocument.collectionId || '') === moveCollectionId} onClick={submitMove} className="min-h-11 px-3 rounded bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">Move Here</button>
          <button type="button" disabled={isBusy} onClick={() => setMoveOpen(false)} className="min-h-11 px-3 rounded border border-slate-200 dark:border-slate-700 text-[9px] font-black text-slate-500">Cancel</button>
        </div>
      </div>}

      {createMode === 'document' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Structured Document</p>
        <input value={newDocumentTitle} onChange={event => setNewDocumentTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitDocument()} placeholder="Document title" disabled={isBusy} className="w-full min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={newDocumentType} onChange={event => setNewDocumentType(event.target.value)} disabled={isBusy} className="min-h-11 text-sm md:text-[10px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="legacy">Legacy • pronunciation sandbox</option><option value="paragraph">Paragraph</option><option value="conversation">Conversation</option>
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
