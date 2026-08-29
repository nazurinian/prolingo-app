import React from 'react';
import { Database, ListPlus, Eraser } from 'lucide-react';

export const WorkspaceTabs = ({
  mobileContext = false,
  handleTabSwitch,
  tableViewMode,
  studyQueue,
  clearStudyQueue
}) => (
    <div className={`flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 relative ${mobileContext ? '' : 'sticky top-[43px] md:static z-30'}`} data-prolingo-workspace-shell="true">
      <button onClick={() => handleTabSwitch('master')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors duration-150 ${tableViewMode === 'master' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Database className="w-4 h-4"/> MASTER DATA</button>
      <button onClick={() => handleTabSwitch('study')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors duration-150 ${tableViewMode === 'study' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
        <ListPlus className="w-4 h-4"/> STUDY QUEUE
        {studyQueue.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{studyQueue.length}</span>}
      </button>
      {tableViewMode === 'study' && studyQueue.length > 0 && <button onClick={clearStudyQueue} className="absolute right-2 top-2 p-1.5 bg-red-50 dark:bg-red-900/50 text-red-500 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors" title="Clear Queue"><Eraser className="w-4 h-4"/></button>}
    </div>
);

export default WorkspaceTabs;
