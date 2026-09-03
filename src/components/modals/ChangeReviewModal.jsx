import React from 'react';
import { History, X, CheckCircle, RotateCcw, FileDown } from 'lucide-react';

const ChangeReviewModal = ({
  setIsChangeReviewOpen,
  isCsvDirty,
  csvChangeSummary,
  applyChangeRevert,
  undoStack,
  undoLastDataChange,
  setIsRevertAllConfirmOpen,
  saveUpdatedCSV,
  isMultiSourceMode
}) => (
  <div className="fixed inset-0 bg-black/50 z-[140] flex items-center justify-center p-3 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => setIsChangeReviewOpen(false)}>
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85dvh] flex flex-col overscroll-contain animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2"><History className="w-4 h-4 text-indigo-500"/>Change Review</h3>
          <p className="text-[10px] text-slate-400 mt-1">Compared with the last saved/imported CSV snapshot.</p>
        </div>
        <button onClick={() => setIsChangeReviewOpen(false)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4 text-slate-500"/></button>
      </div>
      <div className="p-4 overflow-y-auto space-y-4">
        {!isCsvDirty ? (
          <div className="text-center py-10 text-emerald-600 dark:text-emerald-400"><CheckCircle className="w-10 h-10 mx-auto mb-2"/><p className="font-bold">CSV is synced</p></div>
        ) : (
          <>
            {csvChangeSummary.addedItems.length > 0 && <div>
              <h4 className="text-xs font-black text-emerald-600 mb-2">NEW ({csvChangeSummary.addedItems.length})</h4>
              <div className="space-y-1">{csvChangeSummary.addedItems.map(item => <div key={`add-${item.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/10"><span className="text-[10px] font-mono text-slate-400 w-12">#{item.displayId}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.word}</p><p className="text-[9px] font-mono text-slate-400 truncate">{item.vocabId || item.id}</p></div><button onClick={() => applyChangeRevert(item.id, 'added')} className="px-2 py-1 text-[10px] rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Remove</button></div>)}</div>
            </div>}
            {csvChangeSummary.modifiedItems.length > 0 && <div>
              <h4 className="text-xs font-black text-amber-600 mb-2">EDITED ({csvChangeSummary.modifiedItems.length})</h4>
              <div className="space-y-1">{csvChangeSummary.modifiedItems.map(change => <div key={`mod-${change.after.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-amber-100 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10"><span className="text-[10px] font-mono text-slate-400 w-12">#{change.after.displayId}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{change.after.word}</p><p className="text-[9px] text-slate-400 truncate">from “{change.before.word}” • {change.after.vocabId || change.after.id}</p></div><button onClick={() => applyChangeRevert(change.after.id, 'modified')} className="px-2 py-1 text-[10px] rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Revert</button></div>)}</div>
            </div>}
            {csvChangeSummary.deletedItems.length > 0 && <div>
              <h4 className="text-xs font-black text-red-500 mb-2">DELETED ({csvChangeSummary.deletedItems.length})</h4>
              <div className="space-y-1">{csvChangeSummary.deletedItems.map(item => <div key={`del-${item.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-red-100 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10"><span className="text-[10px] font-mono text-slate-400 w-12">#{item.displayId}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.word}</p><p className="text-[9px] font-mono text-slate-400 truncate">{item.vocabId || item.id}</p></div><button onClick={() => applyChangeRevert(item.id, 'deleted')} className="px-2 py-1 text-[10px] rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">Restore</button></div>)}</div>
            </div>}
          </>
        )}
      </div>
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-2 justify-between">
        <button disabled={!undoStack.length} onClick={undoLastDataChange} className="px-3 py-2 rounded text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 inline mr-1"/>Undo Last</button>
        <div className="flex gap-2">
          <button disabled={!isCsvDirty} onClick={() => setIsRevertAllConfirmOpen(true)} className="px-3 py-2 rounded text-xs font-bold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 disabled:opacity-40">Revert All</button>
          <button disabled={!isCsvDirty} onClick={saveUpdatedCSV} className="px-3 py-2 rounded text-xs font-bold bg-amber-600 text-white disabled:opacity-40"><FileDown className="w-3.5 h-3.5 inline mr-1"/>{isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
        </div>
      </div>
    </div>
  </div>
);

export default ChangeReviewModal;
