import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Database, Download, Edit3, FileText, Layers, Plus, RefreshCcw, Save, Upload, X } from 'lucide-react';

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
  const [packStatus, setPackStatus] = useState(null);
  const [databaseBackupStatus, setDatabaseBackupStatus] = useState(null);
  const [preparedDatabaseBackup, setPreparedDatabaseBackup] = useState(null);
  const [databaseRestoreArmed, setDatabaseRestoreArmed] = useState(false);

  const blockCount = activeDocumentTree?.blocks?.length || 0;
  const segmentCount = useMemo(
    () => (activeDocumentTree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length || 0), 0),
    [activeDocumentTree]
  );
  const documentCount = (catalog?.rootDocuments?.length || 0) + (catalog?.collections || []).reduce((sum, collection) => sum + (collection.documents?.length || 0), 0);

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
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">INDEXEDDB</span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">{documentCount} document{documentCount === 1 ? '' : 's'} • {catalog?.collections?.length || 0} collection{catalog?.collections?.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" disabled={isBusy} onClick={() => setCreateMode(createMode === 'document' ? null : 'document')} className="p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50" title="New Document"><FileText className="w-3.5 h-3.5"/></button>
          <button type="button" disabled={isBusy} onClick={() => setCreateMode(createMode === 'collection' ? null : 'collection')} className="p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50" title="New Collection"><Layers className="w-3.5 h-3.5"/></button>
        </div>
      </div>

      <select
        value={activeDocumentId || ''}
        disabled={isBusy || !documentCount}
        onChange={event => onSelectDocument?.(event.target.value)}
        className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50"
      >
        {(catalog?.rootDocuments || []).length > 0 && <optgroup label="Library Root">
          {catalog.rootDocuments.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}
        </optgroup>}
        {(catalog?.collections || []).map(collection => <optgroup key={collection.id} label={collection.title}>
          {(collection.documents || []).map(document => <option key={document.id} value={document.id}>{document.title}</option>)}
        </optgroup>)}
      </select>

      {activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{activeDocument.title}</p>
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{typeLabel(activeDocument.documentType)}</span>
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${activeDocument.editorModel === 'structured-v1' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{activeDocument.editorModel === 'structured-v1' ? 'STRUCTURED V1' : 'LEGACY BRIDGE'}</span>
            </div>
            <p className="text-[8px] font-mono text-slate-400 mt-1">{activeDocument.id}</p>
            <p className="text-[9px] text-slate-400 mt-1">{blockCount} card{blockCount === 1 ? '' : 's'} • {segmentCount} playable segment{segmentCount === 1 ? '' : 's'}</p>
          </div>
          <button type="button" disabled={isBusy} onClick={() => { setRenameTitle(activeDocument.title); setRenameOpen(true); }} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 disabled:opacity-50" title="Rename Document"><Edit3 className="w-3.5 h-3.5"/></button>
        </div>
      </div>}

      {packActions && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2.5 space-y-2">
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
        {packStatus && <p className="text-[8px] text-emerald-600 dark:text-emerald-400">{packStatus}</p>}
      </div>}


      {databaseBackupActions && <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/50 dark:bg-amber-950/10 p-2.5 space-y-2">
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
        {databaseBackupStatus && <p className="text-[8px] text-slate-500 dark:text-slate-400 break-words">{databaseBackupStatus}</p>}
      </div>}


      {renameOpen && <div className="flex gap-1.5">
        <input value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitRename()} disabled={isBusy} className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white" autoFocus />
        <button type="button" disabled={isBusy || !renameTitle.trim()} onClick={submitRename} className="p-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"><Save className="w-3.5 h-3.5"/></button>
        <button type="button" disabled={isBusy} onClick={() => setRenameOpen(false)} className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"><X className="w-3.5 h-3.5"/></button>
      </div>}

      {createMode === 'document' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Structured Document</p>
        <input value={newDocumentTitle} onChange={event => setNewDocumentTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitDocument()} placeholder="Document title" disabled={isBusy} className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <select value={newDocumentType} onChange={event => setNewDocumentType(event.target.value)} disabled={isBusy} className="text-[10px] p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="mixed">Mixed</option><option value="paragraph">Paragraph</option><option value="conversation">Conversation</option>
          </select>
          <select value={newDocumentCollectionId} onChange={event => setNewDocumentCollectionId(event.target.value)} disabled={isBusy} className="text-[10px] p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="">Library Root</option>
            {(catalog?.collections || []).map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </select>
        </div>
        <button type="button" disabled={isBusy || !newDocumentTitle.trim()} onClick={submitDocument} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40"><Plus className="w-3 h-3"/>Create & Open</button>
      </div>}

      {createMode === 'collection' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Collection / Book</p>
        <input value={newCollectionTitle} onChange={event => setNewCollectionTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCollection()} placeholder="Collection title" disabled={isBusy} className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus />
        <button type="button" disabled={isBusy || !newCollectionTitle.trim()} onClick={submitCollection} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40"><Plus className="w-3 h-3"/>Create Collection</button>
      </div>}

      {error && <p className="text-[9px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded p-2">{error}</p>}
    </section>
  );
};

export default TextLibraryShell;
