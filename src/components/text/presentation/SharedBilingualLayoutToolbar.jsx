import React from 'react';
import { BookOpen, Columns2, Languages, RotateCcw } from 'lucide-react';
import { DEFAULT_TEXT_CARD_PRESENTATION_STATE } from '../../../domain/text/textCardPresentationStateDomain.js';
import { SHARED_BILINGUAL_LAYOUT_OPTIONS } from './sharedCardPresentationUtils.js';

const LAYOUT_ICONS = {
  interlinear: Columns2,
  separated: BookOpen,
  'text-only': Languages,
  'meaning-only': Languages
};

/**
 * View-only bilingual layout selector. Never modifies audio configuration, playback session,
 * or saved audio preferences.
 */
export const SharedBilingualLayoutToolbar = ({
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  onChangeLayout,
  onResetView = null,
  rightSlot = null,
  subtitle = null
}) => {
  const isCustomLayout = bilingualLayout !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout;

  return (
    <div
      className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-sm transition-colors motion-reduce:transition-none"
      data-shared-card-bilingual-toolbar="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0 w-full sm:w-auto">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Reading Layout
          </span>
          <div
            role="group"
            aria-label="Bilingual reading layout (display only)"
            className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-1"
          >
            {SHARED_BILINGUAL_LAYOUT_OPTIONS.map(option => {
              const active = bilingualLayout === option.id;
              const Icon = LAYOUT_ICONS[option.id] || BookOpen;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeLayout?.(option.id)}
                  title={option.description}
                  data-shared-card-layout-option={option.id}
                  className={`min-h-11 sm:min-h-9 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600/80'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <Icon aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-400'}`} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>

          {onResetView && isCustomLayout && (
            <button
              type="button"
              onClick={onResetView}
              className="min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-300 inline-flex items-center gap-1 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Restore default Combined layout without changing audio"
              data-shared-card-reset-view="true"
            >
              <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Reset View</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subtitle && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
          )}
          {rightSlot}
        </div>
      </div>
    </div>
  );
};

export default SharedBilingualLayoutToolbar;
