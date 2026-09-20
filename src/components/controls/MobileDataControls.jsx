import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Upload, X, FileDown, Database, Save, Trash2, Plus, BookOpen } from 'lucide-react';
import { V510_SOURCE_KEYS, V510_SOURCE_LABELS } from '../../constants/datasetConstants';
import TextLibraryShell from '../text/TextLibraryShell.jsx';
import TextStructuredEditor from '../text/TextStructuredEditor.jsx';

export default function MobileDataControls({
  mode, isMultiSourceMode, dirtySourceKeys, isSystemBusy, isCsvDirty, openFullPackPicker,
  sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker, removeSourceLayer,
  saveUpdatedSource, exportMergedDataset, savedDecks, selectedDeckId, handleLoadDeck,
  currentDeckName, setCurrentDeckName, handleSaveDeck, handleDeleteDeckInit, csvInputRef,
  openManualAdd, playlist, tableViewMode, exportTableCSV, setIsClearDialogOpen, csvChangeSummary,
  setIsChangeReviewOpen, undoStack, undoLastDataChange, saveUpdatedCSV,
  textLibraryCatalog, activeTextDocument, activeTextDocumentTree, activeTextDocumentId,
  textLibraryCommandBusy, textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
  handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryMoveDocument, handleTextLibraryDeleteDocument,
  handleTextLibraryRenameCollection, handleTextLibraryDeleteCollection, handleTextLibraryStructuredCommand,
  structuredTextAudioCoverageMap, isBatchOpen = false, setIsBatchOpen, isBatchDownloading = false
}) {
  const [textMobileSurface, setTextMobileSurface] = useState('library');
  const [textWorkspaceOpen, setTextWorkspaceOpen] = useState(false);
  const textModeLabel = activeTextDocument?.editorModel === 'legacy-line-v1' ? 'Legacy' : activeTextDocument?.documentType === 'conversation' ? 'Conversation' : activeTextDocument?.documentType === 'paragraph' ? 'Paragraph' : 'Mixed compatibility';
  const textBlockCount = activeTextDocumentTree?.blocks?.length || 0;
  const textSegmentCount = useMemo(() => (activeTextDocumentTree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length || 0), 0), [activeTextDocumentTree]);

  useEffect(() => {
    if (mode !== 'text') return;
    if (textMobileSurface === 'edit' && activeTextDocument?.editorModel !== 'structured-v1') setTextMobileSurface('library');
  }, [mode, activeTextDocument?.editorModel, textMobileSurface]);

  if (mode === 'text') {
    const canEditStructured = activeTextDocument?.editorModel === 'structured-v1';
    const workspace = <div className="space-y-3" data-text-mobile-workspace="true">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/70 p-1" role="tablist" aria-label="Text mobile workspace">
        <button type="button" role="tab" aria-selected={textMobileSurface === 'library'} onClick={() => setTextMobileSurface('library')} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-black transition active:scale-[0.98] ${textMobileSurface === 'library' ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Library & Sources</button>
        <button type="button" role="tab" aria-selected={textMobileSurface === 'edit'} disabled={!canEditStructured} onClick={() => canEditStructured && setTextMobileSurface('edit')} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-black transition active:scale-[0.98] disabled:opacity-35 ${textMobileSurface === 'edit' ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Edit Cards</button>
      </div>
      <button type="button" disabled={isSystemBusy && !isBatchDownloading} onClick={() => setIsBatchOpen?.(!isBatchOpen)} className={`w-full min-h-11 rounded-xl border text-[10px] font-black flex items-center justify-center gap-2 ${isBatchOpen ? 'bg-purple-600 border-purple-600 text-white' : 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300'} disabled:opacity-50`}><Layers className="w-4 h-4"/>{isBatchDownloading ? 'BULK AUDIO • RUNNING' : 'BULK AUDIO'}</button>
      {textMobileSurface === 'library' && <TextLibraryShell
        catalog={textLibraryCatalog} activeDocument={activeTextDocument} activeDocumentTree={activeTextDocumentTree} activeDocumentId={activeTextDocumentId}
        isBusy={textLibraryCommandBusy} error={textLibraryCommandError} onSelectDocument={handleTextLibrarySelectDocument}
        onCreateDocument={handleTextLibraryCreateDocument} onCreateCollection={handleTextLibraryCreateCollection} onRenameDocument={handleTextLibraryRenameDocument}
        onMoveDocument={handleTextLibraryMoveDocument} onDeleteDocument={handleTextLibraryDeleteDocument} onRenameCollection={handleTextLibraryRenameCollection}
        onDeleteCollection={handleTextLibraryDeleteCollection} onStructuredCommand={handleTextLibraryStructuredCommand}
      />}
      {textMobileSurface === 'edit' && canEditStructured && <TextStructuredEditor compact documentTree={activeTextDocumentTree} isBusy={textLibraryCommandBusy} error={textLibraryCommandError} onCommand={handleTextLibraryStructuredCommand} audioCoverageMap={structuredTextAudioCoverageMap}/>}
      {!canEditStructured && <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">Legacy stays a pronunciation sandbox. Use the main Text view for line editing; Library, source lifecycle, backup/audio tools, and CRUD remain available here.</div>}
    </div>;
    return <div className="space-y-3" data-text-mobile-mini="true">
      <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
        <div className="flex items-start gap-2"><BookOpen className="w-4 h-4 mt-0.5 text-indigo-600 dark:text-indigo-300"/><div className="min-w-0 flex-1"><p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Text Data</p><p className="text-[8px] text-slate-400 truncate">{textModeLabel} • {activeTextDocument?.title || 'No active document'}</p></div><span className="rounded-md border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800 px-1.5 py-1 text-[8px] font-black text-indigo-600 dark:text-indigo-300">{textModeLabel.toUpperCase()}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2"><p className="text-sm font-black">{textBlockCount}</p><p className="text-[7px] uppercase text-slate-400">{activeTextDocument?.editorModel === 'legacy-line-v1' ? 'Lines' : 'Cards'}</p></div><div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2"><p className="text-sm font-black">{textSegmentCount}</p><p className="text-[7px] uppercase text-slate-400">{activeTextDocument?.editorModel === 'legacy-line-v1' ? 'Playable' : 'Segments'}</p></div></div>
        <p className="mt-2 text-[8px] text-slate-400">DATA = Library • JSON Sources • CRUD • Backup • Bulk Audio</p>
        <button type="button" onClick={() => setTextWorkspaceOpen(true)} className="mt-3 w-full min-h-11 rounded-lg bg-indigo-600 text-white text-[10px] font-black active:scale-[0.99]" data-text-mobile-open-workspace="true">OPEN DATA WORKSPACE</button>
      </section>
      {typeof document !== 'undefined' && textWorkspaceOpen && createPortal(<div className="fixed inset-0 z-[160] bg-slate-950/60 backdrop-blur-[1px] p-0 sm:p-2" data-text-mobile-full-workspace="true"><section className="ml-auto h-[100dvh] w-full max-w-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xl sm:h-[calc(100dvh-1rem)] sm:rounded-2xl flex flex-col"><div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-3"><BookOpen className="w-5 h-5 text-indigo-600"/><div className="min-w-0 flex-1"><h2 className="text-sm font-black">Text Data Workspace</h2><p className="text-[9px] text-slate-400">Library • JSON Sources • CRUD • Backup • Bulk Audio</p></div><button type="button" onClick={() => setTextWorkspaceOpen(false)} className="min-h-11 min-w-11 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center" aria-label="Close Text Data workspace"><X className="w-4 h-4"/></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-28">{workspace}</div></section></div>, document.body)}
    </div>;
  }
  return (
    <>
              {mode === 'table' && <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-violet-200 dark:border-violet-900 shadow-sm">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><Layers className="w-4 h-4 text-violet-600"/> Source Manager</h3><span className={`text-[9px] font-black px-2 py-1 rounded ${isMultiSourceMode ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{isMultiSourceMode ? `MULTI-SOURCE${dirtySourceKeys.length ? ` • ${dirtySourceKeys.length} DIRTY` : ''}` : 'FLAT'}</span></div>
                  <p className="text-[10px] text-slate-400 mb-3">MAIN owns VOCAB_ID + NO. Other files join by VOCAB_ID.</p>
                  <button disabled={isSystemBusy || isCsvDirty} onClick={openFullPackPicker} className="w-full mb-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-40"><Upload className="w-3.5 h-3.5 inline mr-1"/>Load Full Pack (Auto)</button>
                  <div className="space-y-2">{V510_SOURCE_KEYS.map(key => { const d = sourceDiagnostics[key]; const dirty = sourceChangeSummaries[key]; return <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2"><div className="flex items-center gap-2"><span className="w-16 text-[10px] font-black text-violet-600 dark:text-violet-400">{V510_SOURCE_LABELS[key]}</span><span className="flex-1 text-[9px] text-slate-400 truncate">{sourcePack[key]?.filename || 'Not loaded'}</span><button disabled={isSystemBusy} onClick={() => openSourcePicker(key)} className="px-2 py-1 text-[9px] font-bold border rounded dark:border-slate-600">{d.loaded ? 'Replace' : 'Load'}</button>{key !== 'main' && d.loaded && <button disabled={isSystemBusy || isCsvDirty} onClick={() => removeSourceLayer(key)} className="p-1 text-red-500"><X className="w-3 h-3"/></button>}</div>{d.loaded && <div className="mt-1 flex flex-wrap gap-1 text-[8px]"><span className="text-emerald-600">{d.rows} rows</span>{key !== 'main' && <><span className="text-slate-400">• {d.matched} matched</span>{d.missing > 0 && <span className="text-amber-600">• {d.missing} missing</span>}{d.orphan > 0 && <span className="text-red-500">• {d.orphan} orphan</span>}</>}{d.duplicates.length > 0 && <span className="text-red-500">• {d.duplicates.length} duplicate</span>}{dirty.isDirty && <button onClick={() => saveUpdatedSource(key)} className="ml-auto text-amber-700 dark:text-amber-300 font-bold">Save +{dirty.added} ~{dirty.modified} -{dirty.deleted}</button>}</div>}</div>; })}</div>
                  {isMultiSourceMode && <button onClick={exportMergedDataset} className="w-full mt-3 py-2 rounded border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-xs font-bold"><FileDown className="w-3.5 h-3.5 inline mr-1"/>Export Merged CSV</button>}
              </div>}

              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Database className="w-4 h-4"/> Deck & Data</h3>
                  <select disabled={isSystemBusy} className={`w-full text-xs p-2 border border-slate-200 dark:border-slate-600 rounded mb-2 bg-slate-50 dark:bg-slate-700 dark:text-white ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}><option value="" disabled>Load Saved...</option>{Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}</select>
                  <div className="flex gap-2"><input disabled={isSystemBusy} className={`flex-1 border border-slate-200 dark:border-slate-600 rounded px-2 text-xs dark:bg-slate-700 dark:text-white ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="Deck Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} /><button disabled={isSystemBusy} onClick={handleSaveDeck} title="Save Draft to Cache" className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded disabled:opacity-50"><Save className="w-4 h-4"/></button>{selectedDeckId && <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded disabled:opacity-50"><Trash2 className="w-4 h-4"/></button>}</div>
                  {mode === 'table' && <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2"><button disabled={isSystemBusy} onClick={() => csvInputRef.current?.click()} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50"><Upload className="w-3.5 h-3.5"/> Import CSV</button><button disabled={isSystemBusy} onClick={openManualAdd} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold bg-indigo-600 text-white disabled:opacity-50"><Plus className="w-3.5 h-3.5"/> Add Manual</button></div>
                      <div className="grid grid-cols-2 gap-2"><button disabled={isSystemBusy || playlist.filter(i => i.isStructured).length === 0} onClick={() => exportTableCSV(tableViewMode === 'study' ? 'study' : 'master')} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50"><FileDown className="w-3.5 h-3.5"/> Export Copy</button><button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold border border-red-100 dark:border-red-900/50 text-red-500 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5"/> Clear View</button></div>
                      <div className={`px-3 py-2 rounded-lg border text-[10px] font-bold ${isCsvDirty ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'}`}>{isCsvDirty ? `Unsaved CSV • +${csvChangeSummary.added} new • ~${csvChangeSummary.modified} edited • -${csvChangeSummary.deleted} deleted` : 'CSV synced with last saved snapshot'}</div>
                      <div className="grid grid-cols-2 gap-2"><button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="px-3 py-2 rounded text-xs font-bold border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 disabled:opacity-50">Review</button><button disabled={!undoStack.length} onClick={undoLastDataChange} className="px-3 py-2 rounded text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-50">Undo</button></div>
                      <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`w-full px-3 py-2 rounded text-xs font-bold ${isCsvDirty ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'} disabled:opacity-60`}>{isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
                  </div>}
              </div>

    </>
  );
}
