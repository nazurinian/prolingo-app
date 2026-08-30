import React from 'react';
import { Search, X, History, RotateCcw } from 'lucide-react';
import ProgressStatisticsSummary from '../progress/ProgressStatisticsSummary';

export const MasterDataToolbar = ({
  extraClass = '',
  masterSearch,
  setMasterSearch,
  masterFilter,
  setMasterFilter,
  masteryFilter,
  setMasteryFilter,
  masteryProgressStats,
  isCsvDirty,
  setIsChangeReviewOpen,
  csvChangeSummary,
  undoStack,
  undoLastDataChange,
  masterFilteredPlaylist,
  totalStructured,
  lastDraftAutoSaveAt,
  rangeInput,
  setRangeInput,
  handleRangeAdd
}) => (
          <div className={`${extraClass} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-2 space-y-2`}>
              <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-1 relative">
                      <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input
                          value={masterSearch}
                          onChange={e => setMasterSearch(e.target.value)}
                          placeholder="Search NO, VOCAB_ID, word, meaning, sentence..."
                          className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:outline-indigo-500"
                      />
                      {masterSearch && <button onClick={() => setMasterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-3.5 h-3.5"/></button>}
                  </div>
                  <select value={masterFilter} onChange={e => setMasterFilter(e.target.value)} className="px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                      <option value="all">All Data</option>
                      <option value="csv">CSV / Imported</option>
                      <option value="manual">Manual</option>
                      <option value="added">Added Rows</option>
                      <option value="modified">Edited Rows</option>
                  </select>
                  <select value={masteryFilter} onChange={e => setMasteryFilter(e.target.value)} aria-label="Mastery progress filter" title="Filter vocabulary by mastery status" className="px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                      <option value="all">All Mastery</option>
                      <option value="new">New</option>
                      <option value="learning">Learning</option>
                      <option value="familiar">Familiar</option>
                      <option value="mastered">Mastered</option>
                  </select>
                  <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${isCsvDirty ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600 cursor-not-allowed'}`}>
                      <History className="w-3.5 h-3.5"/> Review {isCsvDirty ? `(${csvChangeSummary.total})` : ''}
                  </button>
                  <button disabled={!undoStack.length} onClick={undoLastDataChange} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border ${undoStack.length ? 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 text-slate-400 cursor-not-allowed'}`} title={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label}` : 'Nothing to undo'}>
                      <RotateCcw className="w-3.5 h-3.5"/> Undo
                  </button>
              </div>
              <ProgressStatisticsSummary stats={masteryProgressStats} />
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span>Showing {masterFilteredPlaylist.length} / {totalStructured} • {isCsvDirty ? `+${csvChangeSummary.added} new • ~${csvChangeSummary.modified} edited • -${csvChangeSummary.deleted} deleted` : 'CSV synced'}</span>
                  <div className="flex gap-2 items-center">
                      {lastDraftAutoSaveAt && isCsvDirty && <span>Draft autosaved {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</span>}
                      <div className="hidden md:flex items-center gap-1">
                          <span>Queue range:</span>
                          <input value={rangeInput} onChange={e => setRangeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRangeAdd()} placeholder="1-10, 15" className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                          <button disabled={!rangeInput.trim()} onClick={handleRangeAdd} className="px-2 py-1 rounded bg-indigo-600 text-white disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700">Add</button>
                      </div>
                  </div>
              </div>
          </div>
);

export default MasterDataToolbar;
