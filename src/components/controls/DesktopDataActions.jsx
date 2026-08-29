import React from 'react';
import { Upload, Plus, FileDown, Trash2, History, RotateCcw } from 'lucide-react';

export default function DesktopDataActions({
  mode, isSystemBusy, csvInputRef, handleCSVUpload, openManualAdd, playlist, tableViewMode,
  exportTableCSV, setIsClearDialogOpen, isCsvDirty, csvChangeSummary, setIsChangeReviewOpen,
  undoStack, undoLastDataChange, saveUpdatedCSV, isMultiSourceMode
}) {
  return (
              <div className="grid grid-cols-2 gap-2">
                {mode === 'table' ? (
                  <>
                    <button disabled={isSystemBusy} onClick={() => csvInputRef.current.click()} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs dark:text-slate-300 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Upload className="w-3 h-3"/> Import CSV</button>
                    <input type="file" ref={csvInputRef} accept=".csv,.tsv,.txt" className="hidden" onChange={handleCSVUpload} />
                    <button disabled={isSystemBusy} onClick={openManualAdd} className={`flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Plus className="w-3 h-3"/> Add Manual</button>
                    <button disabled={isSystemBusy || playlist.filter(i => i.isStructured).length === 0} onClick={() => exportTableCSV(tableViewMode === 'study' ? 'study' : 'master')} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><FileDown className="w-3 h-3"/> Export Copy</button>
                    <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                    <div className={`col-span-2 px-2 py-1.5 rounded border text-[10px] font-bold text-center ${isCsvDirty ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'}`}>
                        {isCsvDirty ? `Unsaved CSV: +${csvChangeSummary.added} new / ~${csvChangeSummary.modified} edited / -${csvChangeSummary.deleted} deleted` : 'CSV saved / no pending changes'}
                    </div>
                    <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="flex items-center justify-center gap-1 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-2 rounded text-xs disabled:opacity-50"><History className="w-3 h-3"/> Review Changes</button>
                    <button disabled={!undoStack.length} onClick={undoLastDataChange} className="flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 p-2 rounded text-xs disabled:opacity-50"><RotateCcw className="w-3 h-3"/> Undo</button>
                    <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`col-span-2 flex items-center justify-center gap-1 p-2 rounded text-xs font-bold ${isCsvDirty ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'} ${(isSystemBusy || !isCsvDirty) ? 'cursor-not-allowed opacity-70' : ''}`}><FileDown className="w-3 h-3"/> {isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
                  </>
                ) : (
                   <>
                       <div className="col-span-2 mb-1">
                          <p className="text-[10px] text-slate-400 italic text-center border dark:border-slate-700 p-1 rounded bg-slate-50 dark:bg-slate-800">Gunakan kotak input di atas daftar untuk menambah item.</p>
                       </div>
                       <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`col-span-2 flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                   </>
                )}
              </div>
  );
}
