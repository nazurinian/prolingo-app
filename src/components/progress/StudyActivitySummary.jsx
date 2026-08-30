import React from 'react';
import { Activity, Clock3 } from 'lucide-react';

const formatLastStudied = (timestamp) => {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '—';
  }
};

export default function StudyActivitySummary({ stats }) {
  if (!stats) return null;
  return (
    <div className="rounded-lg border border-sky-100 dark:border-sky-900/70 bg-sky-50/60 dark:bg-sky-950/20 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-500 dark:text-slate-400">
        <span className="font-black uppercase tracking-wide text-sky-700 dark:text-sky-300 flex items-center gap-1"><Activity className="w-3 h-3"/> Study Activity</span>
        <span><b className="text-slate-700 dark:text-slate-200 tabular-nums">{stats.studied}</b> studied</span>
        <span><b className="text-slate-700 dark:text-slate-200 tabular-nums">{stats.unstudied}</b> unstudied</span>
        <span><b className="text-slate-700 dark:text-slate-200 tabular-nums">{stats.totalStudyEvents}</b> events</span>
        <span><b className="text-slate-700 dark:text-slate-200 tabular-nums">{stats.studiedPercentage}%</b> coverage</span>
        <span className="flex items-center gap-1"><Clock3 className="w-3 h-3"/>Last: <b className="text-slate-700 dark:text-slate-200">{formatLastStudied(stats.lastStudiedAt)}</b></span>
      </div>
    </div>
  );
}
