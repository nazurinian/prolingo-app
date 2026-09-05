import { APP_DATA_MANAGER_RELEASE_NOTE } from '../../constants/appMetadata';
import React from 'react';
import { ArrowRightToLine, Lock, Unlock, Layers, Upload, X, FileDown, History, RotateCcw } from 'lucide-react';
import { V510_SOURCE_KEYS, V510_SOURCE_LABELS } from '../../constants/datasetConstants';
import TextLibraryShell from '../text/TextLibraryShell.jsx';

export default function DesktopDataWorkspace({
  mode, textareaRef, isSystemBusy, isLocked, textContent, handleInputContentChange, handleInsertTab,
  setLockedStates, isMultiSourceMode, dirtySourceKeys, isCsvDirty, openFullPackPicker,
  sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker, removeSourceLayer,
  saveUpdatedSource, exportMergedDataset, csvChangeSummary, setIsChangeReviewOpen, undoStack,
  undoLastDataChange, lastDraftAutoSaveAt, textLibraryCatalog, activeTextDocument, activeTextDocumentTree,
  activeTextDocumentId, activeTextEditorModel, textLibraryCommandBusy, textLibraryCommandError,
  handleTextLibrarySelectDocument, handleTextLibraryCreateDocument, handleTextLibraryCreateCollection, handleTextLibraryRenameDocument
}) {
  return (
    mode === 'text' ? (
              <div className="flex-1 p-2 relative flex flex-col min-h-[300px] bg-white dark:bg-slate-800 gap-2 overflow-y-auto">
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
                />
                {activeTextEditorModel === 'legacy-line-v1' ? <>
                  <textarea ref={textareaRef} disabled={isSystemBusy || textLibraryCommandBusy} readOnly={isLocked || isSystemBusy || textLibraryCommandBusy} className={`w-full flex-1 min-h-[180px] text-xs font-mono p-2 border rounded resize-none focus:outline-indigo-500 transition-colors shadow-inner ${isLocked || isSystemBusy || textLibraryCommandBusy ? 'bg-slate-100 dark:bg-slate-900 text-slate-500' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white'} dark:border-slate-600`} placeholder="Legacy Text import/editor bridge" value={textContent} onChange={(e) => handleInputContentChange(e.target.value)} />
                  <div className="flex justify-end items-center px-1 flex-shrink-0 gap-2">
                     <span className="mr-auto text-[8px] text-amber-600 dark:text-amber-400">Legacy bridge • temporary migration/editor surface</span>
                     <button disabled={isLocked || isSystemBusy || textLibraryCommandBusy} onClick={handleInsertTab} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded border transition ${isLocked || isSystemBusy || textLibraryCommandBusy ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-700 text-slate-400' : 'bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 text-slate-600 dark:text-white border-slate-200 dark:border-slate-500'}`} title="Insert Tab Character (Legacy)"><ArrowRightToLine className="w-3 h-3" /> Add Tab</button>
                     <button disabled={isSystemBusy || textLibraryCommandBusy} onClick={() => setLockedStates(prev => ({ ...prev, [mode]: !prev[mode] }))} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded ${isSystemBusy || textLibraryCommandBusy ? 'opacity-50 cursor-not-allowed text-slate-400' : (isLocked ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700')}`}>{isLocked ? <><Lock className="w-3 h-3"/> Locked</> : <><Unlock className="w-3 h-3"/> Unlocked</>}</button>
                  </div>
                </> : <div className="flex-1 min-h-[180px] rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 flex flex-col items-center justify-center text-center">
                  <FileDown className="w-5 h-5 text-emerald-600 dark:text-emerald-300 mb-2"/>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Structured Document aktif</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Textarea legacy tidak boleh menulis ke document ini. Editor Card/Segment akan masuk pada patch setelah Library shell stabil.</p>
                </div>}
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
