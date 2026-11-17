import React from 'react';
import {
  BookOpen,
  Columns2,
  GalleryHorizontalEnd,
  Languages,
  Layers,
  List,
  RotateCcw,
  Rows3,
  Target
} from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState,
  updateTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import {
  SHARED_BILINGUAL_LAYOUT_OPTIONS,
  SHARED_LEVEL_OPTIONS,
  SHARED_PART_LAYOUT_OPTIONS,
  getSharedUnitTerms
} from './sharedCardPresentationUtils.js';

const LAYOUT_ICONS = {
  interlinear: Columns2,
  separated: BookOpen,
  'text-only': Languages,
  'meaning-only': Languages
};

const LEVEL_ICONS = {
  full: BookOpen,
  part: Layers,
  segment: Target
};

const PART_LAYOUT_ICONS = {
  'horizontal-focus': GalleryHorizontalEnd,
  'vertical-focus': Rows3,
  'vertical-list': List
};

/**
 * View-only presentation toolbar controlling display level (Full / Part / Segment),
 * bilingual layout (Combined / Separated / EN Only / ID Only), and contextual Part
 * layout (Horizontal / Focus Stack / List). Never modifies audio configuration or playback.
 */
export const SharedBilingualLayoutToolbar = ({
  presentationState = null,
  bilingualLayout = null,
  onChangePresentationState = null,
  onChangeLayout = null,
  onResetView = null,
  rightSlot = null,
  subtitle = null,
  unitKind = 'paragraph'
}) => {
  const terms = getSharedUnitTerms({ kind: unitKind });
  const describe = option => option.description
    .replaceAll('sections', terms.plural)
    .replaceAll('section', terms.lower)
    .replaceAll('passage', terms.collectionNoun)
    .replaceAll('card', terms.cardLower);
  const activeState = presentationState
    ? normalizeTextCardPresentationState(presentationState)
    : normalizeTextCardPresentationState({
        bilingualLayout: bilingualLayout || DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout
      });

  const isCustomView = (
    activeState.level !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.level
    || activeState.bilingualLayout !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout
    || (activeState.level === 'part' && activeState.partLayout !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.partLayout)
  );

  const emitPatch = patch => {
    const next = updateTextCardPresentationState(activeState, patch);
    if (onChangePresentationState) {
      onChangePresentationState(next);
    }
    if (patch.bilingualLayout && onChangeLayout) {
      onChangeLayout(patch.bilingualLayout);
    }
  };

  return (
    <div
      className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-sm transition-colors motion-reduce:transition-none space-y-2.5"
      data-shared-card-bilingual-toolbar="true"
      data-shared-card-toolbar-level={activeState.level}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0 w-full lg:w-auto">
          {/* Display Level Selector: Full | Part | Segment */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              View
            </span>
            <div
              role="group"
              aria-label="Reading view level (display only)"
              className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-1"
            >
              {SHARED_LEVEL_OPTIONS.map(option => {
                const active = activeState.level === option.id;
                const Icon = LEVEL_ICONS[option.id] || BookOpen;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => emitPatch({ level: option.id })}
                    title={describe(option)}
                    data-shared-card-level-option={option.id}
                    className={`min-h-11 sm:min-h-9 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      active
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span aria-hidden="true" className="hidden sm:inline-block h-5 w-px bg-slate-200 dark:bg-slate-800" />

          {/* Bilingual Layout Selector: Combined | Separated | EN Only | ID Only */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Layout
            </span>
            <div
              role="group"
              aria-label="Bilingual reading layout (display only)"
              className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-1"
            >
              {SHARED_BILINGUAL_LAYOUT_OPTIONS.map(option => {
                const active = activeState.bilingualLayout === option.id;
                const Icon = LAYOUT_ICONS[option.id] || BookOpen;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => emitPatch({ bilingualLayout: option.id })}
                    title={describe(option)}
                    data-shared-card-layout-option={option.id}
                    className={`min-h-11 sm:min-h-9 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
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
          </div>

          {onResetView && isCustomView && (
            <button
              type="button"
              onClick={onResetView}
              className="min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-300 inline-flex items-center gap-1 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Restore default Full Combined view without changing audio"
              data-shared-card-reset-view="true"
            >
              <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Reset View</span>
            </button>
          )}
        </div>

        {(subtitle || rightSlot) && (
          <div className="flex flex-wrap items-center gap-2">
            {subtitle && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
            )}
            {rightSlot}
          </div>
        )}
      </div>

      {/* Contextual Part Layout Switch (visible strictly in Part view) */}
      {activeState.level === 'part' && (
        <div
          className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2"
          data-shared-part-layout-bar="true"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Part Style
          </span>
          <div
            role="group"
            aria-label={`Part ${terms.lower} layout (display only)`}
            className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/75 dark:bg-slate-800/60 p-1"
          >
            {SHARED_PART_LAYOUT_OPTIONS.map(option => {
              const active = activeState.partLayout === option.id;
              const Icon = PART_LAYOUT_ICONS[option.id] || List;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => emitPatch({ partLayout: option.id })}
                  title={describe(option)}
                  data-shared-card-part-layout-option={option.id}
                  className={`min-h-11 sm:min-h-8 px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-sm ring-1 ring-indigo-200/70 dark:ring-slate-600'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedBilingualLayoutToolbar;
