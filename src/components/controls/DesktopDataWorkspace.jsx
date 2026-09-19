import { APP_DATA_MANAGER_RELEASE_NOTE } from '../../constants/appMetadata';
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightToLine, BookOpen, Lock, Unlock, Layers, Upload, X, FileDown, History, RotateCcw } from 'lucide-react';
import { V510_SOURCE_KEYS, V510_SOURCE_LABELS } from '../../constants/datasetConstants';
import TextLibraryShell from '../text/TextLibraryShell.jsx';
import TextStructuredEditor from '../text/TextStructuredEditor.jsx';

export default function DesktopDataWorkspace({
  mode, textareaRef, isSystemBusy, isLocked, textContent, handleInputContentChange, handleInsertTab,
  setLockedStates, isMultiSourceMode, dirtySourceKeys, isCsvDirty, openFullPackPicker,
  sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker, removeSourceLayer,
  saveUpdatedSource, exportMergedDataset, csvChangeSummary, setIsChangeReviewOpen, undoStack,
  undoLastDataChange, lastDraftAutoSaveAt, textLibraryCatalog, activeTextDocument, activeTextDocumentTree,
  activeTextDocumentId, activeTextEditorModel, textLibraryCommandBusy, textLibraryCommandError,
  handleTextLibrarySelectDocument, handleTextLibraryCreateDocument, handleTextLibraryCreateCollection, handleTextLibraryRenameDocument,
  handleTextLibraryMoveDocument, handleTextLibraryDeleteDocument, handleTextLibraryRenameCollection, handleTextLibraryDeleteCollection,
  handleTextLibraryStructuredCommand, structuredTextAudioCoverageMap
}) {
  const [textWorkspaceOpen, setTextWorkspaceOpen] = useState(false);
  const [textDataSection, setTextDataSection] = useState('library');
  const textModeLabel = activeTextEditorModel === 'legacy-line-v1' ? 'Legacy' : activeTextDocument?.documentType === 'conversation' ? 'Conversation' : activeTextDocument?.documentType === 'paragraph' ? 'Paragraph' : activeTextEditorModel === 'structured-v1' && activeTextDocument?.documentType === 'mixed' ? 'Conversation MIX' : 'Mixed compatibility';
  const textBlockCount = activeTextDocumentTree?.blocks?.length || 0;
  const textSegmentCount = useMemo(() => (activeTextDocumentTree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length || 0), 0), [activeTextDocumentTree]);
  const textSourceCount = activeTextDocumentTree?.__packActions?.sourceAttachments?.length || 0;
  return (
    mode === 'text' ? (
              <div className="flex-1 p-3 bg-white dark:bg-slate-800">
                <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/45 dark:bg-indigo-950/20 p-3 space-y-3" data-text-data-mini="true">
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-300 mt-0.5"/>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Text Data</p>
                      <p className="mt-0.5 text-[8px] text-slate-400 truncate">{textModeLabel} • {activeTextDocument?.title || 'No active Workspace'}</p>
                    </div>
                    <span className="px-1.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900 text-[8px] font-black text-indigo-600 dark:text-indigo-300">{textModeLabel.toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-center">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2"><p className="text-sm font-black text-slate-700 dark:text-slate-200">{textBlockCount}</p><p className="text-[7px] font-black uppercase text-slate-400">{activeTextEditorModel === 'legacy-line-v1' ? 'Lines' : 'Cards'}</p></div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-2"><p className="text-sm font-black text-slate-700 dark:text-slate-200">{textSegmentCount}</p><p className="text-[7px] font-black uppercase text-slate-400">{activeTextEditorModel === 'legacy-line-v1' ? 'Playable' : 'Segments'}</p></div>
                  </div>
                  <p className="text-[8px] text-slate-400">Sources {textSourceCount} • Library / Create / Manage / Transfer</p>
                  <button type="button" onClick={() => setTextWorkspaceOpen(true)} className="w-full min-h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition active:scale-[0.99]">OPEN DATA WORKSPACE</button>
                </section>

                {typeof document !== 'undefined' && textWorkspaceOpen && createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center p-2 md:p-4 overflow-hidden" data-text-data-workspace="true">
                  <button type="button" aria-label="Close Text Data workspace" onClick={() => setTextWorkspaceOpen(false)} className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"/>
                  <section className="relative z-10 w-full max-w-6xl h-[calc(100dvh-1rem)] md:h-[calc(100dvh-2rem)] max-h-[960px] min-h-0 min-w-0 overflow-hidden rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                      <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-300"/>
                      <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-800 dark:text-white">Text Data Workspace</h2><p className="text-[9px] text-slate-400">Library • Create • Manage • Transfer • content editor stays inside Library</p></div>
                      <button type="button" onClick={() => setTextWorkspaceOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500"><X className="w-4 h-4"/></button>
                    </div>
                    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-3 md:p-4 space-y-3">
                      <TextLibraryShell
                        catalog={textLibraryCatalog}
                        activeDocument={activeTextDocument}
                        activeDocumentTree={activeTextDocumentTree}
                        activeDocumentId={activeTextDocumentId}
                        isBusy={textLibraryCommandBusy}
                        error={textLibraryCommandError}
                        onSelectDocument={handleTextLibrarySelectDocument}
                        onCreateDocument={handleTextLibraryCreateDocument}
                        onCreateCollection={handleTextLibraryCreateCollection}
                        onRenameDocument={handleTextLibraryRenameDocument}
                        onMoveDocument={handleTextLibraryMoveDocument}
                        onDeleteDocument={handleTextLibraryDeleteDocument}
                        onRenameCollection={handleTextLibraryRenameCollection}
                        onDeleteCollection={handleTextLibraryDeleteCollection}
                        onStructuredCommand={handleTextLibraryStructuredCommand}
                        onSectionChange={setTextDataSection}
                      />
                      {textDataSection === 'library' && (activeTextEditorModel === 'legacy-line-v1' ? <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2" data-text-library-content-editor="legacy">
                        <div><p className="text-[10px] font-black text-amber-700 dark:text-amber-300">Legacy pronunciation sandbox</p><p className="text-[8px] text-slate-400">One word, phrase, or sentence per line. Global Player uses browser TTS for fast pronunciation practice; no Paragraph/Conversation Card setup is required.</p></div>
                        <textarea ref={textareaRef} disabled={isSystemBusy || textLibraryCommandBusy} readOnly={isLocked || isSystemBusy || textLibraryCommandBusy} className={`w-full min-h-[220px] text-xs font-mono p-3 border rounded-lg resize-y focus:outline-indigo-500 transition-colors shadow-inner ${isLocked || isSystemBusy || textLibraryCommandBusy ? 'bg-slate-100 dark:bg-slate-950 text-slate-500' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white'} dark:border-slate-700`} placeholder="Type a word, phrase, or sentence to practise pronunciation" value={textContent} onChange={(e) => handleInputContentChange(e.target.value)} />
                        <div className="flex justify-end items-center gap-2"><button disabled={isLocked || isSystemBusy || textLibraryCommandBusy} onClick={handleInsertTab} className="text-[9px] px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"><ArrowRightToLine className="w-3 h-3 inline mr-1"/>Add Tab</button><button disabled={isSystemBusy || textLibraryCommandBusy} onClick={() => setLockedStates(prev => ({ ...prev, [mode]: !prev[mode] }))} className="text-[9px] px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500">{isLocked ? <><Lock className="w-3 h-3 inline mr-1"/>Locked</> : <><Unlock className="w-3 h-3 inline mr-1"/>Unlocked</>}</button></div>
                      </div> : <div className="space-y-2" data-text-library-content-editor="structured"><div className="px-1 text-[8px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Workspace Content • Card/Segment editor</div><TextStructuredEditor documentTree={activeTextDocumentTree} isBusy={textLibraryCommandBusy || isSystemBusy} error={textLibraryCommandError} onCommand={handleTextLibraryStructuredCommand} audioCoverageMap={structuredTextAudioCoverageMap}/></div>)}
                    </div>
                  </section>
                </div>, document.body)}
              </div>
            ) : (
              <div className="flex-1 p-3 min-h-[220px] bg-white dark:bg-slate-800 flex flex-col gap-3">
                  <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-3">
                      <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><Layers className="w-4 h-4 text-violet-600"/><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Source Manager</span></div><span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${isMultiSourceMode ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{isMultiSourceMode ? `MULTI${dirtySourceKeys.length ? ` • ${dirtySourceKeys.length}` : ''}` : 'FLAT'}</span></div>
                      <p className="text-[9px] text-slate-400 mb-2">Load MAIN first, then SENTENCE / EXP1–EXP5.</p>
                      <button disabled={isSystemBusy || isCsvDirty} onClick={openFullPackPicker} className="w-full mb-2 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-bold disabled:opacity-40"><Upload className="w-3 h-3 inline mr-1"/>Load Full Pack (Auto)</button>
                      <div className="space-y-1.5">
                        {V510_SOURCE_KEYS.map(key => { const d = sourceDiagnostics[key]; const dirty = sourceChangeSummaries[key]; return <div key={key} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5">
                          <div className="flex items-center gap-1"><span className="w-14 text-[9px] font-black text-violet-600 dark:text-violet-400">{V510_SOURCE_LABELS[key]}</span><span className="flex-1 truncate text-[8px] text-slate-400">{sourcePack[key]?.filename || 'Not loaded'}</span><button disabled={isSystemBusy} onClick={() => openSourcePicker(key)} className="px-1.5 py-0.5 rounded border dark:border-slate-600 text-[8px] font-bold">{d.loaded ? 'Replace' : 'Load'}</button>{key !== 'main' && d.loaded && <button disabled={isSystemBusy || isCsvDirty} onClick={() => removeSourceLayer(key)} className="p-0.5 text-red-500"><X className="w-3 h-3"/></button>}</div>
                          {d.loaded && <div className="mt-1 flex flex-wrap gap-x-1 text-[7px]"><span className="text-emerald-600">{d.rows} rows</span>{key !== 'main' && <><span className="text-slate-400">{d.matched} match</span>{d.missing > 0 && <span className="text-amber-600">{d.missing} missing</span>}{d.orphan > 0 && <span className="text-red-500">{d.orphan} orphan</span>}</>}{dirty.isDirty && <button onClick={() => saveUpdatedSource(key)} className="ml-auto text-amber-700 dark:text-amber-300 font-black">SAVE +{dirty.added} ~{dirty.modified} -{dirty.deleted}</button>}</div>}
                        </div>; })}
                      </div>
                      {isMultiSourceMode && <button onClick={exportMergedDataset} className="w-full mt-2 py-1.5 rounded border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-[9px] font-bold"><FileDown className="w-3 h-3 inline mr-1"/>Export Merged CSV</button>}
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                      <div className="flex items-center gap-2 mb-2"><History className="w-4 h-4 text-indigo-500"/><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Data Manager</span></div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{APP_DATA_MANAGER_RELEASE_NOTE}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-2"><div className="text-lg font-black text-emerald-600">+{csvChangeSummary.added}</div><div className="text-[9px] text-slate-400">NEW</div></div>
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-2"><div className="text-lg font-black text-amber-600">~{csvChangeSummary.modified}</div><div className="text-[9px] text-slate-400">EDITED</div></div>
                      <div className="rounded-lg border border-red-200 dark:border-red-800 p-2"><div className="text-lg font-black text-red-500">-{csvChangeSummary.deleted}</div><div className="text-[9px] text-slate-400">DELETED</div></div>
                  </div>
                  <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="w-full py-2 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-40"><History className="w-3.5 h-3.5 inline mr-1"/>Open Change Review</button>
                  <button disabled={!undoStack.length} onClick={undoLastDataChange} className="w-full py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 inline mr-1"/>Undo Last Change</button>
                  {lastDraftAutoSaveAt && isCsvDirty && <p className="text-[9px] text-center text-slate-400">Working draft autosaved at {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</p>}
              </div>
            )
  );
}
