import React from 'react';
import { Database, Server } from 'lucide-react';

/**
 * Compact informational panel for Text System audio architecture (D2).
 */
export function TextSystemAudioCard({ summary, compact = false }) {
  if (!summary) return null;
  const wrapperClass = compact
    ? 'space-y-2 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600'
    : 'space-y-2';
  const titleClass = compact
    ? 'text-[10px] font-bold text-slate-600 dark:text-slate-200 uppercase flex items-center gap-1'
    : 'text-xs font-bold text-slate-700 dark:text-slate-200 uppercase flex items-center gap-1.5';
  const badgeClass = summary.variant === 'structured'
    ? 'px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-[9px] font-black uppercase tracking-wide'
    : summary.variant === 'legacy'
      ? 'px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase tracking-wide'
      : 'px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 text-[9px] font-black uppercase tracking-wide';

  return (
    <div data-text-system-audio-card={summary.variant} className={wrapperClass}>
      <div className="flex items-center justify-between gap-2">
        <p className={titleClass}>
          <Server className="w-3 h-3 text-teal-500 shrink-0" />
          <span>{summary.audioTitle}</span>
        </p>
        <span className={badgeClass}>{summary.audioBadge}</span>
      </div>
      <p className="text-[11px] font-medium leading-snug text-slate-700 dark:text-slate-200">
        {summary.audioSummary}
      </p>
      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-300">
        {summary.audioDetail}
      </p>
    </div>
  );
}

/**
 * Compact informational panel explaining Text Data & Storage location in Text -> Data (D3).
 * Avoids inventing IndexedDB usage numbers or exposing Table storage/backup operations.
 */
export function TextSystemStorageCard({ summary, compact = false }) {
  if (!summary) return null;
  const wrapperClass = compact
    ? 'space-y-1.5 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600'
    : 'bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1.5 transition-colors';

  return (
    <div data-text-system-storage-card={summary.variant} className={wrapperClass}>
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <span>{summary.storageTitle}</span>
      </p>
      <p className="text-[11px] font-medium leading-snug text-slate-700 dark:text-slate-200">
        {summary.storageSummary}
      </p>
      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-300">
        {summary.storageDetail}
      </p>
    </div>
  );
}
