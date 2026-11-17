import React from 'react';

export default function TextMainReaderControl({ reader, eligible, reason, onChange }) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" data-text-main-reader-control>
      <div role="group" aria-label="Tampilan pembaca Text" className="flex flex-wrap gap-1">
        {[['legacy', 'Tampilan Lama'], ['shared', 'Shared UI (Beta)']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-text-main-reader-option={value}
            aria-pressed={reader === value}
            disabled={value === 'shared' && !eligible}
            aria-describedby={!eligible ? 'text-main-reader-unavailable' : undefined}
            onClick={() => onChange(value)}
            className={`min-h-11 px-3 py-2 rounded-lg border text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${reader === value ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'}`}
          >{label}</button>
        ))}
      </div>
      {!eligible && <p id="text-main-reader-unavailable" className="text-xs text-slate-500 dark:text-slate-400">{reason}</p>}
    </div>
  );
}
