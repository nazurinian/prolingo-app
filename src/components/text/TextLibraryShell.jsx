import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TEXT_LIBRARY_COMMAND_TYPES } from '../../domain/text/textLibraryCommandDomain.js';
import { AlertTriangle, BookOpen, ChevronRight, Copy, Database, Download, Edit3, FileText, Layers, Link2, Loader2, PlayCircle, Plus, RefreshCcw, Save, Search, SkipForward, Trash2, Unlink, Upload, X } from 'lucide-react';

const typeLabel = document => document?.editorModel === 'legacy-line-v1' ? 'Legacy' : document?.documentType === 'conversation' ? 'Conversation' : document?.documentType === 'paragraph' ? 'Paragraph' : document?.editorModel === 'structured-v1' && document?.documentType === 'mixed' ? 'Conversation • MIX' : 'Mixed (compatibility)';
const typeKey = document => document?.editorModel === 'legacy-line-v1' ? 'legacy' : document?.documentType === 'paragraph' ? 'paragraph' : document?.editorModel === 'structured-v1' && ['conversation', 'mixed'].includes(document?.documentType) ? 'conversation' : 'mixed';

const formatBytes = value => { const bytes = Math.max(0, Number(value || 0)); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; };

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
  onStructuredCommand,
  onSectionChange,
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
  const [renameTitle, setRenameTitle] = useState('');
  const sourceAttachInputRef = useRef(null);
  const sourceCopyInputRef = useRef(null);
  const externalJsonInputRef = useRef(null);
  const databaseBackupInputRef = useRef(null);
  const packActions = activeDocumentTree?.__packActions || null;
  const databaseBackupActions = activeDocumentTree?.__databaseBackupActions || null;
  const search = activeDocumentTree?.__search || null;
  const runtimeHardening = activeDocumentTree?.__runtimeHardening || null;
  const [packStatus, setPackStatus] = useState(null);
  const [pendingExternalImport, setPendingExternalImport] = useState(null);
  const [databaseBackupStatus, setDatabaseBackupStatus] = useState(null);
  const [runtimeAuditStatus, setRuntimeAuditStatus] = useState(null);
  const [preparedDatabaseBackup, setPreparedDatabaseBackup] = useState(null);
  const [databaseRestoreArmed, setDatabaseRestoreArmed] = useState(false);
  const [advancedLibraryToolsExpanded, setAdvancedLibraryToolsExpanded] = useState(false);
  const [sourceActionArmed, setSourceActionArmed] = useState(null);
  const [dataSection, setDataSection] = useState('library');
  const [libraryFilter, setLibraryFilter] = useState('all');
  const [demoBusy, setDemoBusy] = useState(null);

  useEffect(() => {
    onSectionChange?.(dataSection);
  }, [dataSection, onSectionChange]);

  const blockCount = activeDocumentTree?.blocks?.length || 0;
  const segmentCount = useMemo(
    () => (activeDocumentTree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length || 0), 0),
    [activeDocumentTree]
  );
  const documentCount = (catalog?.rootDocuments?.length || 0) + (catalog?.collections || []).reduce((sum, collection) => sum + (collection.documents?.length || 0), 0);
  const showLibraryTools = dataSection === 'transfer' && (!compact || advancedLibraryToolsExpanded);
  const activeCollection = activeDocument?.collectionId ? (catalog?.collections || []).find(item => item.id === activeDocument.collectionId) || null : null;
  const sourceAttachments = Array.isArray(packActions?.sourceAttachments) ? packActions.sourceAttachments : [];
  const activeDocumentAttachment = activeDocument?.id ? sourceAttachments.find(item => Object.values(item.idMap?.documents || {}).includes(activeDocument.id)) || null : null;
  const allDocuments = useMemo(() => [
    ...(catalog?.rootDocuments || []).map(document => ({ ...document, collectionTitle: 'Unfiled / Library Root' })),
    ...(catalog?.collections || []).flatMap(collection => (collection.documents || []).map(document => ({ ...document, collectionTitle: collection.title })))
  ], [catalog]);
  const filteredDocuments = libraryFilter === 'all' ? allDocuments : allDocuments.filter(document => typeKey(document) === libraryFilter);

  const createDemo = async mode => {
    if (isBusy || demoBusy) return;
    setDemoBusy(mode);
    try {
      const result = await onCreateDocument?.({
        title: mode === 'legacy' ? 'Demo • Legacy Pronunciation' : mode === 'paragraph' ? 'Demo • Paragraph' : 'Demo • Conversation • 3 Speakers',
        documentType: mode === 'legacy' ? 'mixed' : mode,
        editorModel: mode === 'legacy' ? 'legacy-line-v1' : 'structured-v1',
        collectionId: null
      });
      if (!result?.id || mode === 'legacy' || !onStructuredCommand) return;
      const block = await onStructuredCommand({
        type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
        payload: { documentId: result.id, blockType: mode, title: mode === 'paragraph' ? 'Daily Practice' : 'Three-speaker practice' }
      });
      if (!block?.id) return;
      const rows = mode === 'paragraph'
        ? [
            { text: 'I practise English every day.', meaning: 'Saya berlatih bahasa Inggris setiap hari.' },
            { text: 'Today I am testing the ProLingo player.', meaning: 'Hari ini saya sedang menguji pemutar ProLingo.' }
          ]
        : [
            { speaker: 'David', text: 'Hi, shall we start our practice?', meaning: 'Hai, apakah kita mulai latihan kita?' },
            { speaker: 'Maya', text: 'Yes, I am ready.', meaning: 'Ya, saya siap.' },
            { speaker: 'Nina', text: 'Great. I will listen carefully.', meaning: 'Bagus. Saya akan mendengarkan dengan saksama.' }
          ];
      for (const row of rows) {
        await onStructuredCommand({ type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT, payload: { blockId: block.id, ...row } });
      }
    } finally {
      setDemoBusy(null);
    }
  };

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
    setPackStatus(`Imported independent copy: ${counts.documents || 0} workspace(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };

  const handleExternalJsonImportFile = async event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !packActions?.importExternalJson || isBusy) return;
    setPackStatus(null);
    setPendingExternalImport(null);
    const result = await packActions.importExternalJson(file);
    if (!result) return;
    if (result.inspectionStatus === 'up-to-date' || result.mode === 'external-up-to-date') {
      setPackStatus(`${result.externalSourceKey}: already up to date. Exact duplicate skipped.`);
      return;
    }
    if (result.mode === 'external-decision-required' || result.inspectionStatus === 'decision-required') {
      setPendingExternalImport({ file, inspection: result });
      const summary = result.summary || {};
      setPackStatus(`${result.externalSourceKey}: changed source detected. Review Update / New Copy / Keep Existing below.`);
      return;
    }
    const counts = result.counts || {};
    setPackStatus(`Imported AI/external source ${result.externalSourceKey}: ${counts.documents || 0} workspace, ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };

  const applyExternalImportDecision = async decision => {
    if (!pendingExternalImport?.file || !packActions?.applyExternalJsonDecision || isBusy) return;
    const inspection = pendingExternalImport.inspection || {};
    const result = await packActions.applyExternalJsonDecision(pendingExternalImport.file, decision);
    if (!result) return;
    setPendingExternalImport(null);
    if (decision === 'keep-existing') {
      setPackStatus(`${inspection.externalSourceKey}: kept existing local data; incoming import cancelled.`);
      return;
    }
    if (decision === 'import-as-copy') {
      setPackStatus(`${inspection.externalSourceKey}: imported as an independent copy.`);
      return;
    }
    const stats = result.stats || {};
    setPackStatus(`${inspection.externalSourceKey}: updated existing Workspace (+${stats.created || 0}, ~${stats.updated || 0}, -${stats.deleted || 0}, local kept ${stats.preservedLocal || 0}).`);
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


  const runRuntimeHardeningAudit = async () => {
    if (!runtimeHardening?.onAuditAndGc || isBusy) return;
    setRuntimeAuditStatus('Auditing Split/Full physical references, Staging GC, and Portable ZIP reconciliation…');
    const result = await runtimeHardening.onAuditAndGc();
    if (!result) {
      setRuntimeAuditStatus('Runtime audit did not complete.');
      return;
    }
    const released = result.gc?.released || 0;
    const saved = result.gc?.orphanBytes || 0;
    setRuntimeAuditStatus(`Audit complete • GC ${released} physical (${formatBytes(saved)}) • Portable ZIP ${result.external?.zipSplitMatched || 0} Split + ${result.external?.zipFullMatched || 0} Full matched • Folder LOCKED.`);
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
    setDatabaseBackupStatus(`Validated ${counts.documents || 0} workspace(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
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
    setDatabaseBackupStatus(`Replace restore complete: ${counts.documents || 0} workspace(s), ${counts.blocks || 0} card(s), ${counts.segments || 0} segment(s).`);
  };

  return (
    <section className={`w-full min-w-0 overflow-hidden rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 ${compact ? 'p-3' : 'p-3'} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-black text-slate-800 dark:text-white">Text Workspaces</h3>
            {!compact && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">INDEXEDDB</span>}
          </div>
          <p className="text-[9px] text-slate-400 mt-1">{documentCount} workspace{documentCount === 1 ? '' : 's'} • {catalog?.collections?.length || 0} book collection{catalog?.collections?.length === 1 ? '' : 's'}</p>
        </div>
        {isBusy && <span className="inline-flex items-center gap-1 text-[8px] font-bold text-indigo-500" role="status" aria-live="polite"><Loader2 className="w-3 h-3 animate-spin"/>Updating…</span>}
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white/80 dark:bg-slate-900/50 p-1" role="tablist" aria-label="Text data workspace" data-text-data-section-tabs="true">
        {[['library','Library'],['create','Create'],['manage','Manage'],['transfer','Transfer']].map(([key,label]) => <button key={key} type="button" role="tab" aria-selected={dataSection === key} onClick={() => setDataSection(key)} className={`min-h-10 rounded-lg px-1.5 py-2 text-[9px] font-black uppercase tracking-wide transition ${dataSection === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'}`}>{label}</button>)}
      </div>

      <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/30 px-2.5 py-2" data-text-data-section-description="true">
        <p className="text-[9px] text-slate-500 dark:text-slate-400">{dataSection === 'library' ? 'Read and find Workspaces, then jump directly to their content.' : dataSection === 'create' ? 'Create Workspaces or Book Collections, or load isolated starter demos.' : dataSection === 'manage' ? 'Rename, move, organise, or safely delete existing local data.' : 'Import, export, attach/sync JSON sources, and manage full database backup/restore.'}</p>
      </div>

      {dataSection === 'library' && <div className="space-y-2" data-text-library-mode-tabs="true">
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/60 p-1" role="tablist" aria-label="Text Library mode filter">
          {[['all','All'],['legacy','Legacy'],['paragraph','Paragraph'],['conversation','Conversation']].map(([key,label]) => <button key={key} type="button" role="tab" aria-selected={libraryFilter === key} onClick={() => setLibraryFilter(key)} className={`min-h-10 rounded-lg px-1.5 py-2 text-[9px] font-black transition ${libraryFilter === key ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>{label}</button>)}
        </div>
        {filteredDocuments.length > 0 ? <div className="max-h-48 overflow-y-auto overscroll-contain custom-scrollbar space-y-1" data-text-library-unified-list="true">
          {filteredDocuments.map(document => <button key={document.id} type="button" disabled={isBusy} onClick={() => onSelectDocument?.(document.id)} className={`w-full min-h-11 rounded-lg border px-2.5 py-2 text-left transition ${document.id === activeDocumentId ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-300'}`}>
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[10px] font-black">{document.title}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${document.id === activeDocumentId ? 'bg-white/15 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{typeLabel(document)}</span></div>
            <p className={`mt-0.5 truncate text-[8px] ${document.id === activeDocumentId ? 'text-indigo-100' : 'text-slate-400'}`}>{document.collectionTitle} • {document.id}</p>
          </button>)}
        </div> : <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900 bg-white/70 dark:bg-slate-900/30 p-3 text-center" data-text-library-empty-filter="true"><p className="text-[10px] font-black text-slate-600 dark:text-slate-300">No {libraryFilter === 'all' ? 'Text' : typeLabel({ editorModel: libraryFilter === 'legacy' ? 'legacy-line-v1' : 'structured-v1', documentType: libraryFilter })} workspaces</p><p className="mt-1 text-[8px] text-slate-400">Create fresh data in CREATE, import an existing JSON source in TRANSFER, or load a starter demo.</p></div>}
      </div>}

      {dataSection === 'create' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-text-create-actions="true">
        <button type="button" disabled={isBusy} onClick={() => setCreateMode(current => current === 'document' ? null : 'document')} className={`min-h-11 rounded-xl border px-3 py-2 text-left transition ${createMode === 'document' ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300'}`}>
          <span className="block text-[10px] font-black"><Plus className="w-3 h-3 inline mr-1"/>Create Workspace</span><span className={`mt-0.5 block text-[8px] ${createMode === 'document' ? 'text-indigo-100' : 'text-slate-400'}`}>Legacy, Paragraph, Conversation, or Conversation MIX</span>
        </button>
        <button type="button" disabled={isBusy} onClick={() => setCreateMode(current => current === 'collection' ? null : 'collection')} className={`min-h-11 rounded-xl border px-3 py-2 text-left transition ${createMode === 'collection' ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300'}`}>
          <span className="block text-[10px] font-black"><Layers className="w-3 h-3 inline mr-1"/>Create Book Collection</span><span className={`mt-0.5 block text-[8px] ${createMode === 'collection' ? 'text-indigo-100' : 'text-slate-400'}`}>Optional organiser; Workspaces may stay Unfiled</span>
        </button>
      </div>}

      {dataSection === 'create' && <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/15 p-2.5" data-text-library-demos="true">
        <div className="flex items-center justify-between gap-2"><div><p className="text-[9px] font-black text-violet-700 dark:text-violet-300">Starter Demos</p><p className="text-[8px] text-slate-400">Create isolated local samples for Player/Audio testing.</p></div><PlayCircle className="w-4 h-4 text-violet-500"/></div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">{[['legacy','Legacy'],['paragraph','Paragraph'],['conversation','Conversation • 3']].map(([key,label]) => <button key={key} type="button" disabled={isBusy || Boolean(demoBusy)} onClick={() => createDemo(key)} className="min-h-10 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-1 py-2 text-[8px] font-black text-violet-700 dark:text-violet-300 disabled:opacity-40">{demoBusy === key ? 'Creating…' : label}</button>)}</div>
        <p className="mt-1.5 text-[7px] leading-relaxed text-slate-400">Paragraph and Conversation demos include EN + ID/Meaning segments. Conversation uses David, Maya, and Nina. Legacy creates a clean pronunciation sandbox so you can paste/type any word or phrase without structured Cards.</p>
      </div>}

      {dataSection === 'library' && !documentCount && <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900 bg-white/70 dark:bg-slate-900/30 p-4 text-center" data-text-library-empty="true">
        <FileText className="w-5 h-5 mx-auto text-indigo-300 dark:text-indigo-700"/>
        <p className="mt-2 text-[10px] font-black text-slate-600 dark:text-slate-300">No Text workspaces yet</p>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Create fresh data in CREATE, import an existing JSON source in TRANSFER, or load a starter demo.</p>
        <button type="button" disabled={isBusy} onClick={() => { setDataSection('create'); setCreateMode('document'); }} className="mt-3 min-h-10 px-3 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40 active:scale-95 transition"><Plus className="w-3 h-3 inline mr-1"/>Create first Workspace</button>
      </div>}

      {dataSection === 'library' && search && <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/15 p-2.5 space-y-2" data-text-library-search="true">
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300 shrink-0"/>
          <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Search Workspaces</p>
          <span className={`${compact ? 'hidden' : 'ml-auto'} text-[8px] text-slate-400`}>Title • Text • Meaning • Speaker</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
          <input
            type="search"
            value={search.query || ''}
            onChange={event => search.onQueryChange?.(event.target.value)}
            placeholder="Search all Text workspaces…"
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Search Workspaces"
            className="w-full min-h-11 rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 py-2 pl-8 pr-11 text-sm md:text-[10px] text-slate-700 dark:text-slate-200 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-950/40"
            data-text-library-search-input="true"
          />
          {search.query && <button type="button" onClick={() => search.onQueryChange?.('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition" title="Clear search" aria-label="Clear Text Workspace search"><X className="w-3 h-3"/></button>}
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
              const context = isSegment || isCard ? `${result.documentTitle}${result.blockTitle && isSegment ? ` › ${result.blockTitle}` : ''}` : result.editorModel === 'structured-v1' ? 'Structured Workspace' : 'Legacy Workspace';
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


      {dataSection === 'library' && activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5" data-text-library-active-workspace="true">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{activeDocument.title}</p>
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{typeLabel(activeDocument)}</span>
              {!compact && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${activeDocument.editorModel === 'structured-v1' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{activeDocument.editorModel === 'structured-v1' ? 'STRUCTURED V1' : 'LEGACY'}</span>}
            </div>
            {!compact && <p className="text-[8px] font-mono text-slate-400 mt-1">{activeDocument.id}</p>}
            <p className="text-[9px] text-slate-400 mt-1">{activeDocument.editorModel === 'legacy-line-v1' ? `${blockCount} pronunciation line${blockCount === 1 ? '' : 's'} • lightweight manual TTS` : `${blockCount} card${blockCount === 1 ? '' : 's'} • ${segmentCount} playable segment${segmentCount === 1 ? '' : 's'}`}</p>
          </div>
        </div>
      </div>}

      {dataSection === 'transfer' && compact && (packActions || databaseBackupActions) && <button type="button" onClick={() => setAdvancedLibraryToolsExpanded(value => !value)} className="w-full min-h-10 flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left text-[10px] font-black text-slate-600 dark:text-slate-300" aria-expanded={advancedLibraryToolsExpanded} data-text-library-advanced-tools-toggle="true">
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
            <p className="text-[8px] text-slate-400 mt-1 break-words">AI JSON imports external authoring packages. ProLingo Text Pack Attach/Sync is reserved for ProLingo-originated canonical sources; Import as Copy remains an explicit independent-copy path.</p>
            <p className="mt-1 text-[8px] leading-relaxed text-sky-600 dark:text-sky-300">Workspace Text Packs are standalone scope packages and attach into <b>Unfiled / Library Root</b> by design. Collection Text Packs preserve their Book Collection. To relocate a standalone attached Workspace, Detach it first, then use MANAGE → Move.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5">
          <button type="button" disabled={isBusy || !packActions.importExternalJson} onClick={() => externalJsonInputRef.current?.click()} className="min-w-0 px-2 py-2 rounded bg-emerald-600 text-white text-[9px] font-bold disabled:opacity-40" title="Import AI-authored prolingo-text-external JSON. Exact duplicates are skipped; changed sources require an explicit update/copy/keep decision."><Upload className="w-3 h-3 inline mr-1"/>Import AI JSON</button>
          <button type="button" disabled={isBusy || activeDocument?.editorModel !== 'structured-v1' || !packActions.exportDocument} onClick={() => runPackAction(packActions.exportDocument, result => `Exported ${result.filename}.`)} className="min-w-0 px-2 py-2 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-40" title="Export active structured Workspace"><Download className="w-3 h-3 inline mr-1"/>Export Workspace Pack</button>
          <button type="button" disabled={isBusy || !activeDocument?.collectionId || !packActions.exportCollection} onClick={() => runPackAction(packActions.exportCollection, result => `Exported ${result.filename}.`)} className="min-w-0 px-2 py-2 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-40" title={activeDocument?.collectionId ? 'Export active Book Collection' : 'Move this Workspace into a Book Collection to export a Book Collection pack'}><Layers className="w-3 h-3 inline mr-1"/>Export Collection Pack</button>
          <button type="button" disabled={isBusy || !packActions.attachOrSync} onClick={() => sourceAttachInputRef.current?.click()} className="min-w-0 px-2 py-2 rounded bg-indigo-600 text-white text-[9px] font-bold disabled:opacity-40" title="Attach a ProLingo-originated canonical Text Pack source, or Sync/Replace an already attached package"><Link2 className="w-3 h-3 inline mr-1"/>Attach ProLingo Pack</button>
          <button type="button" disabled={isBusy || !packActions.importCopy} onClick={() => sourceCopyInputRef.current?.click()} className="min-w-0 px-2 py-2 rounded border border-slate-300 dark:border-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40" title="Create a separate independent local copy from a ProLingo Text Pack"><Copy className="w-3 h-3 inline mr-1"/>Import Pack as Copy</button>
        </div>
        <input ref={externalJsonInputRef} type="file" accept=".json,application/json" onChange={handleExternalJsonImportFile} className="hidden" />
        <input ref={sourceAttachInputRef} type="file" accept=".json,application/json" onChange={handleSourceAttachOrSyncFile} className="hidden" />
        <input ref={sourceCopyInputRef} type="file" accept=".json,application/json" onChange={handleSourceImportCopyFile} className="hidden" />

        {pendingExternalImport && <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-2.5" data-text-external-import-decision="true">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0"/>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-amber-800 dark:text-amber-300">Existing external source found</p>
              <p className="text-[8px] text-slate-500 dark:text-slate-400 break-all">{pendingExternalImport.inspection?.externalSourceKey}</p>
            </div>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${pendingExternalImport.inspection?.summary?.conflicts ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}`}>{pendingExternalImport.inspection?.summary?.conflicts ? 'CONFLICT' : 'SAFE UPDATE'}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center" data-text-external-import-summary="true">
            {[['Added', pendingExternalImport.inspection?.summary?.added || 0], ['Updated', pendingExternalImport.inspection?.summary?.updated || 0], ['Removed', pendingExternalImport.inspection?.summary?.removed || 0], ['Unchanged', pendingExternalImport.inspection?.summary?.unchanged || 0], ['Local only', pendingExternalImport.inspection?.summary?.localOnly || 0], ['Conflicts', pendingExternalImport.inspection?.summary?.conflicts || 0]].map(([label,value]) => <div key={label} className="rounded-lg border border-amber-200/80 dark:border-amber-900 bg-white/70 dark:bg-slate-900/40 px-1.5 py-2"><p className="text-[11px] font-black text-slate-700 dark:text-slate-200">{value}</p><p className="text-[7px] font-black uppercase text-slate-400">{label}</p></div>)}
          </div>
          <p className="text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">Matched <b>cardKey / segmentKey / speakerKey</b> keep their internal UIDs. Only changed content invalidates the affected audio render; unchanged Segments keep their Ready RF audio.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <button type="button" disabled={isBusy} onClick={() => applyExternalImportDecision('update-keep-local')} className="min-h-11 rounded-lg bg-indigo-600 text-white px-2 text-[8px] font-black">UPDATE EXISTING • keep local conflicts</button>
            <button type="button" disabled={isBusy} onClick={() => applyExternalImportDecision('update-use-incoming')} className="min-h-11 rounded-lg border border-amber-400 text-amber-700 dark:text-amber-300 px-2 text-[8px] font-black">UPDATE • use incoming conflicts</button>
            <button type="button" disabled={isBusy} onClick={() => applyExternalImportDecision('import-as-copy')} className="min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2 text-[8px] font-black">IMPORT AS NEW COPY</button>
            <button type="button" disabled={isBusy} onClick={() => applyExternalImportDecision('keep-existing')} className="min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 px-2 text-[8px] font-black">KEEP EXISTING • cancel import</button>
          </div>
        </div>}

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


      {dataSection === 'transfer' && runtimeHardening && <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/45 dark:bg-cyan-950/10 p-3 space-y-2.5" data-text-runtime-hardening="true">
        <div className="flex items-start gap-2">
          <Database className="w-4 h-4 mt-0.5 text-cyan-600 dark:text-cyan-300 shrink-0"/>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Runtime & Storage Diagnostics</p>
            <p className="mt-0.5 text-[8px] leading-relaxed text-slate-400">Read-only counters plus a safe audit action. Audit may garbage-collect only unreferenced app-owned Split/Full Staging binaries; Folder/ZIP files are never deleted. Folder is locked in beta.8.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
          {[['Workspaces', runtimeHardening.database?.workspaces || 0], ['Cards', runtimeHardening.database?.cards || 0], ['Segments', runtimeHardening.database?.segments || 0], ['Audio slots', runtimeHardening.database?.audioVariants || 0], ['Staged audio', runtimeHardening.staging?.count || 0], ['Staging', formatBytes(runtimeHardening.staging?.bytes || 0)]].map(([label,value]) => <div key={label} className="rounded-lg border border-cyan-100 dark:border-cyan-900 bg-white/75 dark:bg-slate-900/45 px-1.5 py-2"><p className="text-[10px] font-black text-slate-700 dark:text-slate-200">{value}</p><p className="text-[7px] font-black uppercase text-slate-400">{label}</p></div>)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[8px]">
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-2"><p className="font-black text-emerald-700 dark:text-emerald-300">Ready</p><p className="mt-0.5 text-slate-500 dark:text-slate-400">{runtimeHardening.activeCoverage?.ready || 0}/{runtimeHardening.activeCoverage?.total || 0} active Workspace slots</p></div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-2"><p className="font-black text-amber-700 dark:text-amber-300">Need attention</p><p className="mt-0.5 text-slate-500 dark:text-slate-400">Missing {runtimeHardening.activeCoverage?.missing || 0} • stale {runtimeHardening.activeCoverage?.stale || 0}</p></div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/20 p-2"><p className="font-black text-slate-600 dark:text-slate-300">Audio Folder</p><p className="mt-0.5 text-slate-500 dark:text-slate-400">Deprecated • LOCKED in beta.8</p></div>
          <div className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/20 p-2"><p className="font-black text-violet-700 dark:text-violet-300">Portable ZIP</p><p className="mt-0.5 text-slate-500 dark:text-slate-400">{runtimeHardening.zip?.archives?.length ? `${runtimeHardening.zip.archives.length} source ZIP • Split ${runtimeHardening.zip?.splitMatchedCount || 0} • Full ${runtimeHardening.zip?.fullMatchedCount || 0}` : 'No source ZIP loaded'}</p></div>
        </div>
        <button type="button" disabled={isBusy || !runtimeHardening.onAuditAndGc} onClick={runRuntimeHardeningAudit} className="w-full min-h-11 rounded-lg border border-cyan-300 dark:border-cyan-800 bg-white dark:bg-slate-900 text-[9px] font-black text-cyan-700 dark:text-cyan-300 disabled:opacity-40"><RefreshCcw className="w-3 h-3 inline mr-1"/>AUDIT + RECONCILE + SAFE STAGING GC</button>
        {runtimeAuditStatus && <p className="text-[8px] text-cyan-700 dark:text-cyan-300" role="status" aria-live="polite">{runtimeAuditStatus}</p>}
      </div>}


      {showLibraryTools && databaseBackupActions && <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/50 dark:bg-amber-950/10 p-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <Database className="w-3.5 h-3.5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Full Text Database Backup / Restore</p>
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">REPLACE RESTORE</span>
            </div>
            <p className="text-[8px] text-slate-400 mt-1">Safety snapshot of the Text IndexedDB: metadata, Book Collections, Workspaces, Cards, Segments, audio identity metadata, counters, and active Workspace. External audio binaries and preferences are not embedded.</p>
            <p className="mt-1 text-[8px] leading-relaxed text-amber-600 dark:text-amber-300">Load DB Backup accepts only files exported by <b>Export DB</b>. AI JSON and Text Pack JSON are intentionally rejected here.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <button type="button" disabled={isBusy} onClick={runDatabaseBackupExport} className="px-2 py-1.5 rounded border border-emerald-200 dark:border-emerald-800 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-40" title="Export a full Text IndexedDB safety snapshot"><Download className="w-3 h-3 inline mr-1"/>Export DB</button>
          <button type="button" disabled={isBusy} onClick={() => databaseBackupInputRef.current?.click()} className="px-2 py-1.5 rounded border border-amber-300 dark:border-amber-800 text-[9px] font-bold text-amber-700 dark:text-amber-300 disabled:opacity-40" title="Load and validate a full Text Database Backup"><Upload className="w-3 h-3 inline mr-1"/>Load DB Backup</button>
        </div>
        <input ref={databaseBackupInputRef} type="file" accept=".json,application/json" onChange={handleDatabaseBackupFile} className="hidden" />
        {preparedDatabaseBackup?.diagnostics && <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900/50 p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[8px] text-slate-500 dark:text-slate-400">
            <span>Workspaces <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.documents || 0}</b></span>
            <span>Cards <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.blocks || 0}</b></span>
            <span>Segments <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.segments || 0}</b></span>
            <span>Audio metadata <b className="text-slate-700 dark:text-slate-200">{preparedDatabaseBackup.diagnostics.counts?.audioVariants || 0}</b></span>
          </div>
          <p className="text-[8px] text-red-600 dark:text-red-400 flex gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0"/>Restore replaces the entire local Text database. Canonical source attachments are included through Text DB metadata; use Import as Copy only for intentional independent duplicates.</p>
          <button type="button" disabled={isBusy} onClick={applyDatabaseReplaceRestore} className={`w-full px-2 py-1.5 rounded border text-[9px] font-black ${databaseRestoreArmed ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}>
            <RefreshCcw className="w-3 h-3 inline mr-1"/>{databaseRestoreArmed ? 'Confirm Replace Entire Text DB' : 'Arm Replace Restore'}
          </button>
          {databaseRestoreArmed && <button type="button" disabled={isBusy} onClick={() => setDatabaseRestoreArmed(false)} className="w-full text-[8px] text-slate-400 underline">Cancel destructive restore confirmation</button>}
        </div>}
        {databaseBackupStatus && <p className="text-[8px] text-slate-500 dark:text-slate-400 break-words" role="status" aria-live="polite">{databaseBackupStatus}</p>}
      </div>}


      {dataSection === 'manage' && activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2.5 space-y-2" data-text-library-crud="true">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[12rem] flex-1">
            <p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Workspace actions</p>
            <p className="text-[8px] text-slate-400 truncate">{typeLabel(activeDocument)} • {activeDocument.id}</p>
          </div>
          <button type="button" disabled={isBusy} onClick={() => { setRenameTitle(activeDocument.title || ''); setRenameOpen(value => !value); setDeleteDocumentArmed(false); }} className="min-h-10 px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[8px] font-black text-indigo-600 dark:text-indigo-300"><Edit3 className="w-3 h-3 inline mr-1"/>Rename</button>
          {onMoveDocument && <button type="button" disabled={isBusy || Boolean(activeDocumentAttachment)} onClick={() => { setMoveCollectionId(activeDocument.collectionId || ''); setMoveOpen(value => !value); setDeleteDocumentArmed(false); }} className="min-h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[8px] font-black text-slate-600 dark:text-slate-300 disabled:opacity-40" title={activeDocumentAttachment ? 'Attached source Workspaces keep source ownership location. Detach first before moving.' : 'Move Workspace to Unfiled / Library Root or another Book Collection'}><Layers className="w-3 h-3 inline mr-1"/>Move</button>}
          <button type="button" disabled={isBusy || Boolean(activeDocumentAttachment)} onClick={requestDeleteDocument} className={`min-h-10 px-2.5 rounded-lg border text-[8px] font-black disabled:opacity-40 ${deleteDocumentArmed ? 'border-red-500 bg-red-600 text-white' : 'border-red-200 dark:border-red-900 text-red-500'}`} title={activeDocumentAttachment ? 'This Workspace belongs to an attached source. Detach or Remove Source Data first.' : 'Delete local Workspace'}><Trash2 className="w-3 h-3 inline mr-1"/>{deleteDocumentArmed ? 'Confirm delete Workspace' : 'Delete Workspace'}</button>
        </div>
        {activeDocumentAttachment && <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-2 text-[8px] leading-relaxed text-amber-700 dark:text-amber-300">This Workspace is owned by attached source <b>{activeDocumentAttachment.packageId}</b>. Direct Move/Delete is intentionally locked. Use TRANSFER → Attached sources → <b>Detach (keep local)</b> or <b>Remove Source Data</b>.</p>}
        {activeCollection && <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Book Collection</p><p className="text-[8px] text-slate-400 truncate">{activeCollection.title} • {activeCollection.id}</p></div>
          <button type="button" disabled={isBusy} onClick={() => { setCollectionRenameTitle(activeCollection.title || ''); setCollectionRenameOpen(value => !value); }} className="min-h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[8px] font-black text-slate-600 dark:text-slate-300">Rename</button>
          <span className="text-[7px] text-slate-400">Delete is available below only when a Book Collection is empty.</span>
        </div>}
      </div>}

      {dataSection === 'manage' && (catalog?.collections || []).length > 0 && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2.5" data-text-collection-manager="true">
        <p className="text-[9px] font-black text-slate-600 dark:text-slate-300 mb-1">Book Collections</p>
        <p className="mb-2 text-[7px] leading-relaxed text-slate-400">Cleanup order for testing: remove/detach Workspaces first, then delete the empty Book Collection. Attached-source data must be removed from TRANSFER → Attached sources.</p>
        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
          {(catalog.collections || []).map(collection => <div key={collection.id} className="flex items-center gap-2 rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5">
            <div className="min-w-0 flex-1"><p className="text-[8px] font-black text-slate-600 dark:text-slate-300 truncate">{collection.title}</p><p className="text-[7px] text-slate-400">{collection.documents?.length || 0} workspace(s) • {collection.id}</p></div>
            {(collection.documents?.length || 0) === 0 ? <button type="button" disabled={isBusy} onClick={async () => { if (typeof window !== 'undefined' && !window.confirm(`Delete empty Book Collection “${collection.title}”?`)) return; await onDeleteCollection?.(collection.id); }} className="min-h-9 px-2 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900 text-[7px] font-black text-red-500 disabled:opacity-40" title="Delete empty Book Collection"><Trash2 className="mr-1 h-3 w-3"/>DELETE EMPTY</button> : <span className="shrink-0 text-[7px] font-semibold text-slate-400">Remove {collection.documents?.length || 0} Workspace(s) first</span>}
          </div>)}
        </div>
      </div>}

      {dataSection === 'manage' && collectionRenameOpen && activeCollection && <div className="flex gap-1.5">
        <input value={collectionRenameTitle} onChange={event => setCollectionRenameTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCollectionRename()} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white" />
        <button type="button" disabled={isBusy || !collectionRenameTitle.trim()} onClick={submitCollectionRename} className="p-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"><Save className="w-3.5 h-3.5"/></button>
        <button type="button" onClick={() => setCollectionRenameOpen(false)} className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400"><X className="w-3.5 h-3.5"/></button>
      </div>}

      {dataSection === 'manage' && renameOpen && <div className="flex gap-1.5">
        <input value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitRename()} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white" autoFocus={!compact} />
        <button type="button" disabled={isBusy || !renameTitle.trim()} onClick={submitRename} className="p-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"><Save className="w-3.5 h-3.5"/></button>
        <button type="button" disabled={isBusy} onClick={() => setRenameOpen(false)} className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"><X className="w-3.5 h-3.5"/></button>
      </div>}

      {dataSection === 'manage' && moveOpen && activeDocument && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2.5 space-y-2" data-text-document-move="true">
        <div><p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Move Workspace</p><p className="text-[8px] text-slate-400">Permanent DOC_ID stays unchanged. Only its Library/Book Collection location changes.</p></div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={moveCollectionId} onChange={event => setMoveCollectionId(event.target.value)} disabled={isBusy} className="flex-1 min-w-0 min-h-11 text-sm md:text-[10px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="">Unfiled / Library Root</option>
            {(catalog?.collections || []).map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </select>
          <button type="button" disabled={isBusy || (activeDocument.collectionId || '') === moveCollectionId} onClick={submitMove} className="min-h-11 px-3 rounded bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">Move Here</button>
          <button type="button" disabled={isBusy} onClick={() => setMoveOpen(false)} className="min-h-11 px-3 rounded border border-slate-200 dark:border-slate-700 text-[9px] font-black text-slate-500">Cancel</button>
        </div>
      </div>}

      {dataSection === 'create' && createMode === 'document' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Structured Workspace</p>
        <input value={newDocumentTitle} onChange={event => setNewDocumentTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitDocument()} placeholder="Workspace title" disabled={isBusy} className="w-full min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-1" data-text-create-mode-tabs="true">
            {[['legacy','Legacy'],['paragraph','Paragraph'],['conversation','Conversation'],['mixed','Conversation MIX']].map(([key,label]) => <button key={key} type="button" disabled={isBusy} onClick={() => setNewDocumentType(key)} className={`min-h-10 rounded-md px-1 text-[8px] font-black ${newDocumentType === key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>{label}</button>)}
          </div>
          <select value={newDocumentCollectionId} onChange={event => setNewDocumentCollectionId(event.target.value)} disabled={isBusy} className="min-h-11 text-sm md:text-[10px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="">Unfiled / Library Root</option>
            {(catalog?.collections || []).map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </select>
        </div>
        {newDocumentType === 'mixed' && <p className="text-[8px] leading-relaxed text-sky-600 dark:text-sky-300">Conversation MIX can order Paragraph TITLE/PARAGRAPH Cards and Conversation Cards inside one Workspace. Paragraph uses narrator rules; each Conversation Card uses only its referenced speakers.</p>}
        <button type="button" disabled={isBusy || !newDocumentTitle.trim()} onClick={submitDocument} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40"><Plus className="w-3 h-3"/>Create & Open</button>
      </div>}

      {dataSection === 'create' && createMode === 'collection' && <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-2 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">New Book Collection</p>
        <input value={newCollectionTitle} onChange={event => setNewCollectionTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCollection()} placeholder="Book Collection title" disabled={isBusy} className="w-full min-h-11 text-sm md:text-xs px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
        <button type="button" disabled={isBusy || !newCollectionTitle.trim()} onClick={submitCollection} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40"><Plus className="w-3 h-3"/>Create Book Collection</button>
      </div>}

      {error && <p className="text-[9px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded p-2" role="alert">{error}</p>}
    </section>
  );
};

export default TextLibraryShell;
