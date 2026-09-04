import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  isMemoryPartHidden,
  setAllMemoryFieldsHidden,
  setMemoryPartHidden,
} from '../../utils/memoryModeUtils';

const CellToggle = ({ part, label, memorySettings, setMemorySettings }) => {
  const hidden = isMemoryPartHidden(memorySettings, part);
  return (
    <button
      type="button"
      onClick={() => setMemorySettings(prev => setMemoryPartHidden(prev, part, !hidden))}
      className={`h-7 min-w-0 rounded-lg border px-2 flex items-center justify-center gap-1 text-[9px] font-black transition-colors ${hidden ? 'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/25 text-yellow-700 dark:text-yellow-400' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
      title={`${hidden ? 'Hidden' : 'Visible'}: ${label}`}
    >
      {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      <span className="truncate">{label}</span>
    </button>
  );
};

const MemoryRow = ({ label, enPart, idnPart, memorySettings, setMemorySettings }) => (
  <div className="grid grid-cols-[54px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
    <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 truncate">{label}</span>
    <CellToggle part={enPart} label="EN" memorySettings={memorySettings} setMemorySettings={setMemorySettings} />
    <CellToggle part={idnPart} label="ID" memorySettings={memorySettings} setMemorySettings={setMemorySettings} />
  </div>
);

export default function MemoryModeFieldControls({ memorySettings, setMemorySettings, hasAdvanced }) {
  return (
    <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => setMemorySettings(setAllMemoryFieldsHidden(true))} className="h-7 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-[9px] font-black text-yellow-700 dark:text-yellow-400 flex items-center justify-center gap-1"><EyeOff className="h-3 w-3" /> Hide All</button>
        <button type="button" onClick={() => setMemorySettings(setAllMemoryFieldsHidden(false))} className="h-7 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1"><Eye className="h-3 w-3" /> Show All</button>
      </div>

      <div className="rounded-xl border border-yellow-100 dark:border-yellow-900/50 bg-yellow-50/35 dark:bg-yellow-950/10 p-2 space-y-1.5">
        <div className="grid grid-cols-[54px_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 text-center text-[8px] font-black uppercase tracking-wide text-slate-400">
          <span className="text-left">Field</span><span>English</span><span>Indonesia</span>
        </div>
        <MemoryRow label="Word" enPart="word" idnPart="word_idn" memorySettings={memorySettings} setMemorySettings={setMemorySettings} />
        <MemoryRow label="Sentence" enPart="sentence" idnPart="meaning" memorySettings={memorySettings} setMemorySettings={setMemorySettings} />
        {hasAdvanced && Array.from({ length: 5 }, (_, index) => {
          const number = index + 1;
          return <MemoryRow key={number} label={`EXP${number}`} enPart={`exp${number}_en`} idnPart={`exp${number}_idn`} memorySettings={memorySettings} setMemorySettings={setMemorySettings} />;
        })}
      </div>
      <p className="text-[8px] leading-tight text-yellow-600 dark:text-yellow-500 italic">Each hidden cell reveals independently for 4 seconds. Play buttons stay visible.</p>
    </div>
  );
}
