import React from 'react';
import { normalizeMasteryState } from '../../domain/progress/masteryStateDomain.js';

const MASTERY_VIEW = Object.freeze({
  NEW: {
    label: 'New',
    shortLabel: 'NEW',
    classes: 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
  },
  LEARNING: {
    label: 'Learning',
    shortLabel: 'LEARN',
    classes: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
  },
  FAMILIAR: {
    label: 'Familiar',
    shortLabel: 'FAM',
    classes: 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
  },
  MASTERED: {
    label: 'Mastered',
    shortLabel: 'MASTER',
    classes: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
  }
});

export const MasteryStatusControl = ({
  state,
  onCycle,
  compact = false,
  className = ''
}) => {
  const normalizedState = normalizeMasteryState(state);
  const view = MASTERY_VIEW[normalizedState] || MASTERY_VIEW.NEW;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onCycle?.();
      }}
      className={`${compact ? 'h-[20px] px-1.5 text-[8px]' : 'px-2 py-1 text-[10px]'} inline-flex items-center justify-center gap-1 rounded border font-black tracking-wide transition-colors ${view.classes} ${className}`}
      title={`Mastery: ${view.label}. Klik untuk lanjut ke status berikutnya.`}
      aria-label={`Mastery ${view.label}. Change mastery status.`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{compact ? `M·${view.shortLabel}` : `Mastery: ${view.label}`}</span>
    </button>
  );
};
