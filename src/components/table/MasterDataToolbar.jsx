import React, { useState } from 'react';
import { ChevronDown, ChevronUp, History, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import ProgressStatisticsSummary from '../progress/ProgressStatisticsSummary';
import StudyActivitySummary from '../progress/StudyActivitySummary';

const SearchField = ({ masterSearch, setMasterSearch }) => (
  <div className="relative flex-1 min-w-0">
    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
    <input
      value={masterSearch}
      onChange={e => setMasterSearch(e.target.value)}
      placeholder="Search word, meaning, NO, VOCAB_ID..."
      className="w-full pl-8 pr-8 py-1.5 md:py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:outline-indigo-500"
    />
    {masterSearch && <button onClick={() => setMasterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-3.5 h-3.5"/></button>}
  </div>
);

const FilterSelects = ({ masterFilter, setMasterFilter, masteryFilter, setMasteryFilter }) => (
  <>
    <select value={masterFilter} onChange={e => setMasterFilter(e.target.value)} className="px-2 py-1.5 md:py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
      <option value="all">All Data</option>
      <option value="csv">CSV / Imported</option>
      <option value="manual">Manual</option>
      <option value="added">Added Rows</option>
      <option value="modified">Edited Rows</option>
    </select>
    <select value={masteryFilter} onChange={e => setMasteryFilter(e.target.value)} aria-label="Mastery progress filter" title="Filter vocabulary by mastery status" className="px-2 py-1.5 md:py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
      <option value="all">All Mastery</option>
      <option value="new">New</option>
      <option value="learning">Learning</option>
      <option value="familiar">Familiar</option>
      <option value="mastered">Mastered</option>
    </select>
  </>
);

export const MasterDataToolbar = ({
  extraClass = '', masterSearch, setMasterSearch, masterFilter, setMasterFilter,
  masteryFilter, setMasteryFilter, masteryProgressStats, studyActivityStats, isCsvDirty,
  setIsChangeReviewOpen, csvChangeSummary, undoStack, undoLastDataChange,
  masterFilteredPlaylist, totalStructured, lastDraftAutoSaveAt, rangeInput,
  setRangeInput, handleRangeAdd
}) => {
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const filtersActive = masterFilter !== 'all' || masteryFilter !== 'all';

  const reviewButton = (
    <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className={`px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${isCsvDirty ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600 cursor-not-allowed'}`}>
      <History className="w-3.5 h-3.5"/> Review {isCsvDirty ? `(${csvChangeSummary.total})` : ''}
    </button>
  );
  const undoButton = (
    <button disabled={!undoStack.length} onClick={undoLastDataChange} className={`px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border ${undoStack.length ? 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 text-slate-400 cursor-not-allowed'}`} title={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label}` : 'Nothing to undo'}>
      <RotateCcw className="w-3.5 h-3.5"/> Undo
    </button>
  );

  return (
    <div className={`${extraClass} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-1.5 md:p-2`}>
      {/* Mobile: search stays visible; study/filter detail is opt-in. */}
      <div className="md:hidden space-y-1.5">
        <SearchField masterSearch={masterSearch} setMasterSearch={setMasterSearch} />
        <div className="flex items-center justify-between gap-2 min-h-8">
          <p className="min-w-0 truncate text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-black text-slate-700 dark:text-slate-200">{masterFilteredPlaylist.length}</span> / {totalStructured} shown
            {filtersActive ? ' • filtered' : ''}{isCsvDirty ? ` • ${csvChangeSummary.total} changes` : ''}
          </p>
          <button type="button" onClick={() => setMobileDetailsOpen(value => !value)} className={`flex-shrink-0 h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-[10px] font-black ${mobileDetailsOpen || filtersActive ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300'}`}>
            <SlidersHorizontal className="w-3.5 h-3.5"/> Study Status {mobileDetailsOpen ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
          </button>
        </div>
        {mobileDetailsOpen && (
          <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/25 p-2 space-y-2 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-1.5"><FilterSelects masterFilter={masterFilter} setMasterFilter={setMasterFilter} masteryFilter={masteryFilter} setMasteryFilter={setMasteryFilter} /></div>
            <div className="grid grid-cols-2 gap-1.5">{reviewButton}{undoButton}</div>
            <ProgressStatisticsSummary stats={masteryProgressStats} />
            <StudyActivitySummary stats={studyActivityStats} />
            <div className="text-[9px] text-slate-400 flex items-center justify-between gap-2">
              <span>{isCsvDirty ? `+${csvChangeSummary.added} • ~${csvChangeSummary.modified} • -${csvChangeSummary.deleted}` : 'CSV synced'}</span>
              {lastDraftAutoSaveAt && isCsvDirty && <span>Draft {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Desktop keeps the full information-dense workspace. */}
      <div className="hidden md:block space-y-2">
        <div className="flex flex-row gap-2">
          <SearchField masterSearch={masterSearch} setMasterSearch={setMasterSearch} />
          <FilterSelects masterFilter={masterFilter} setMasterFilter={setMasterFilter} masteryFilter={masteryFilter} setMasteryFilter={setMasteryFilter} />
          {reviewButton}
          {undoButton}
        </div>
        <ProgressStatisticsSummary stats={masteryProgressStats} />
        <StudyActivitySummary stats={studyActivityStats} />
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
          <span>Showing {masterFilteredPlaylist.length} / {totalStructured} • {isCsvDirty ? `+${csvChangeSummary.added} new • ~${csvChangeSummary.modified} edited • -${csvChangeSummary.deleted} deleted` : 'CSV synced'}</span>
          <div className="flex gap-2 items-center">
            {lastDraftAutoSaveAt && isCsvDirty && <span>Draft autosaved {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</span>}
            <div className="flex items-center gap-1">
              <span>Queue range:</span>
              <input value={rangeInput} onChange={e => setRangeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRangeAdd()} placeholder="1-10, 15" className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
              <button disabled={!rangeInput.trim()} onClick={handleRangeAdd} className="px-2 py-1 rounded bg-indigo-600 text-white disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterDataToolbar;
