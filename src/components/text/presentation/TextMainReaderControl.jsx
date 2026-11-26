import React from 'react';
import { SHARED_CONTROL_TOKENS, SHARED_SURFACE_TOKENS } from './sharedDesignTokens.js';

export default function TextMainReaderControl({ reader, eligible, reason, onChange, compact = false }) {
  if (compact) {
    return (
      <div
        role="group"
        aria-label="Reader UI switch"
        data-text-main-reader-control
        className={`inline-flex items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact} shrink-0`}
      >
        {[
          { value: 'legacy', label: 'Classic', title: 'Switch to Classic Reader (Tampilan Lama)' },
          { value: 'shared', label: 'Shared', title: 'Shared Reader UI (Beta)' }
        ].map(option => {
          const active = reader === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-text-main-reader-option={option.value}
              aria-pressed={active}
              disabled={option.value === 'shared' && !eligible}
              title={option.title}
              onClick={() => onChange(option.value)}
              className={`min-h-8 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.focusRing} ${
                active ? SHARED_CONTROL_TOKENS.segmentActiveNeutral : SHARED_CONTROL_TOKENS.segmentInactive
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95"
      data-text-main-reader-control
    >
      <div
        role="group"
        aria-label="Tampilan pembaca Text"
        className={`inline-flex flex-wrap items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
      >
        {[['legacy', 'Tampilan Lama'], ['shared', 'Shared UI (Beta)']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-text-main-reader-option={value}
            aria-pressed={reader === value}
            disabled={value === 'shared' && !eligible}
            aria-describedby={!eligible ? 'text-main-reader-unavailable' : undefined}
            onClick={() => onChange(value)}
            className={`min-h-9 sm:min-h-8 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.focusRing} ${
              reader === value ? SHARED_CONTROL_TOKENS.segmentActivePrimary : SHARED_CONTROL_TOKENS.segmentInactive
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {!eligible && <p id="text-main-reader-unavailable" className="text-xs text-slate-500 dark:text-slate-400">{reason}</p>}
    </div>
  );
}
