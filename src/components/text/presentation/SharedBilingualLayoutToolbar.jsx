import React, { useState } from 'react';
import {
  AlignJustify,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Columns,
  Eye,
  Focus,
  GalleryHorizontalEnd,
  Indent,
  Languages,
  LayoutGrid,
  LayoutList,
  List,
  MessageSquareText,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Target,
  Type
} from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  isTextReaderAppearanceDirty,
  isTextWorkspaceStyleDirty,
  normalizeTextCardPresentationState,
  normalizeTextWorkspaceStyleState,
  resetTextCardAppearanceInPresentationState,
  resolveEffectiveBilingualPresentation,
  resolveTextReaderModeFromState,
  updateTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import {
  SHARED_APPEARANCE_CONTRAST_OPTIONS,
  SHARED_APPEARANCE_FONT_FAMILY_OPTIONS,
  SHARED_APPEARANCE_LINE_HEIGHT_OPTIONS,
  SHARED_APPEARANCE_PRIMARY_SIZE_OPTIONS,
  SHARED_APPEARANCE_SECONDARY_SIZE_OPTIONS,
  SHARED_APPEARANCE_SPACING_OPTIONS,
  SHARED_BILINGUAL_STYLE_OPTIONS,
  SHARED_CONTEXTUAL_PLACEMENT_OPTIONS,
  SHARED_CONVERSATION_SPEAKER_LAYOUT_OPTIONS,
  SHARED_FOCUS_ORIENTATION_OPTIONS,
  SHARED_LEVEL_OPTIONS,
  SHARED_PART_LAYOUT_OPTIONS,
  SHARED_READING_LANGUAGE_OPTIONS,
  SHARED_WORKSPACE_ALIGNMENT_OPTIONS,
  getSharedUnitTerms
} from './sharedCardPresentationUtils.js';

const LEVEL_ICONS = {
  full: BookOpen,
  part: LayoutList,
  segment: Target
};

const READER_MODE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'full',
    label: 'Full',
    icon: BookOpen,
    description: 'Read the entire Workspace continuously as one clean book page'
  }),
  Object.freeze({
    id: 'card',
    label: 'Card',
    icon: LayoutGrid,
    description: 'Read each Card with clear boundaries and independent open/collapse controls'
  }),
  Object.freeze({
    id: 'focus',
    label: 'Focus',
    icon: Focus,
    description: 'Focus on one Section or Speaker Turn at a time (Vertical or Horizontal)'
  }),
  Object.freeze({
    id: 'segment',
    label: 'Segment',
    icon: Target,
    description: 'Keep natural reading text above one Study Box per Card'
  })
]);

const PART_LAYOUT_ICONS = {
  'horizontal-focus': GalleryHorizontalEnd,
  'vertical-focus': Focus,
  'vertical-list': List
};

const BILINGUAL_STYLE_ICONS = {
  separated: Columns,
  interlinear: Languages,
  contextual: Eye
};

const CONTEXTUAL_PLACEMENT_ICONS = {
  above: ArrowUp,
  below: ArrowDown,
  inline: MessageSquareText
};

const ALIGNMENT_ICONS = {
  left: AlignLeft,
  justify: AlignJustify
};

const adaptDescription = (text, terms) => (
  terms.label === 'Section'
    ? text
    : text
        .replace(/\bsections\b/g, terms.plural)
        .replace(/\bsection\b/g, terms.lower)
        .replace(/\bcard\b/g, terms.cardLower)
);

const AppearanceOptionRow = ({ label, ariaLabel, options, activeId, attrName, onSelect }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
      {label}
    </span>
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 p-0.5"
    >
      {options.map(option => {
        const active = activeId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(option.id)}
            {...{ [attrName]: option.id }}
            className={`min-h-10 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              active
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/80 dark:ring-slate-600'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);

/**
 * Compact, grouped, view-only Appearance / Typography panel (6 independent controls +
 * independent Reset Appearance that never mutates Workspace Style, bilingual choices, or audio).
 */
export const SharedAppearanceTypographyPanel = ({
  appearance,
  showNotebook = false,
  onChangeAppearance,
  onResetAppearance
}) => {
  const dirty = isTextReaderAppearanceDirty(appearance);

  return (
    <div
      className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5 text-left"
      data-shared-appearance-panel="true"
      data-shared-appearance-dirty={dirty ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Type aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Appearance &amp; Typography
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
            · View-only, independent of Workspace Style &amp; audio
          </span>
        </div>
        <button
          type="button"
          disabled={!dirty}
          onClick={onResetAppearance}
          data-shared-appearance-reset="true"
          title={dirty
            ? 'Reset only Appearance & Typography defaults without changing Workspace Style, reading style, or audio'
            : 'Appearance & Typography already matches defaults'}
          className="min-h-10 sm:min-h-7 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-300 inline-flex items-center gap-1 transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <RotateCcw aria-hidden="true" className="w-3 h-3" />
          <span>Reset Appearance</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2 rounded-xl bg-slate-50/75 dark:bg-slate-800/35 border border-slate-200/70 dark:border-slate-800 p-3">
        <AppearanceOptionRow
          label="Primary Size"
          ariaLabel="Primary reading font size (display only)"
          options={SHARED_APPEARANCE_PRIMARY_SIZE_OPTIONS}
          activeId={appearance.primaryFontSize}
          attrName="data-shared-appearance-primary-size"
          onSelect={primaryFontSize => onChangeAppearance({ primaryFontSize })}
        />
        <AppearanceOptionRow
          label="Translation Size"
          ariaLabel="Secondary translation font size (display only)"
          options={SHARED_APPEARANCE_SECONDARY_SIZE_OPTIONS}
          activeId={appearance.secondaryFontSize}
          attrName="data-shared-appearance-secondary-size"
          onSelect={secondaryFontSize => onChangeAppearance({ secondaryFontSize })}
        />
        <AppearanceOptionRow
          label="Font Family"
          ariaLabel="Reading font family (display only)"
          options={SHARED_APPEARANCE_FONT_FAMILY_OPTIONS}
          activeId={appearance.fontFamily}
          attrName="data-shared-appearance-font-family"
          onSelect={fontFamily => onChangeAppearance({ fontFamily })}
        />
        <AppearanceOptionRow
          label="Line Height"
          ariaLabel="Reading line height (display only)"
          options={SHARED_APPEARANCE_LINE_HEIGHT_OPTIONS}
          activeId={appearance.lineHeight}
          attrName="data-shared-appearance-line-height"
          onSelect={lineHeight => onChangeAppearance({ lineHeight })}
        />
        <AppearanceOptionRow
          label="Translation Contrast"
          ariaLabel="Secondary translation contrast (display only)"
          options={SHARED_APPEARANCE_CONTRAST_OPTIONS}
          activeId={appearance.translationContrast}
          attrName="data-shared-appearance-contrast"
          onSelect={translationContrast => onChangeAppearance({ translationContrast })}
        />
        <AppearanceOptionRow
          label="Text Spacing"
          ariaLabel="Reading text spacing (display only)"
          options={SHARED_APPEARANCE_SPACING_OPTIONS}
          activeId={appearance.textSpacing}
          attrName="data-shared-appearance-spacing"
          onSelect={textSpacing => onChangeAppearance({ textSpacing })}
        />
        {showNotebook && (
          <>
            <AppearanceOptionRow
              label="Notebook Spacing"
              ariaLabel="Notebook text spacing"
              options={SHARED_APPEARANCE_SPACING_OPTIONS}
              activeId={appearance.notebookSpacing}
              attrName="data-shared-notebook-spacing-option"
              onSelect={notebookSpacing => onChangeAppearance({ notebookSpacing })}
            />
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                data-shared-notebook-guides-option="true"
                checked={appearance.notebookGuideLines}
                onChange={event => onChangeAppearance({ notebookGuideLines: event.target.checked })}
              />
              Notebook Guide Lines
            </label>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Compact, grouped Workspace Style bar separate from Reader Mode, Reading Language /
 * Bilingual Style, Appearance / Typography, Card Visibility, and Playback Settings.
 */
export const SharedWorkspaceStyleBar = ({
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  effectiveDefaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  onChangeWorkspaceStyle,
  onResetWorkspaceStyle = null,
  workspaceType = null,
  workspaceStyleScope = 'shared',
  onChangeWorkspaceStyleScope = null,
  canOverrideWorkspace = false,
  hasWorkspaceOverride = false,
  scopeLabel = null
}) => {
  const activeStyle = normalizeTextWorkspaceStyleState(workspaceStyle, effectiveDefaults);
  const dirty = isTextWorkspaceStyleDirty(activeStyle, effectiveDefaults);
  const showParagraphIndent = workspaceType !== 'conversation';
  const showSpeakerLayout = workspaceType !== 'paragraph';
  const isWorkspaceScope = workspaceStyleScope === 'workspace' && canOverrideWorkspace;
  const showScopeSwitcher = Boolean(typeof onChangeWorkspaceStyleScope === 'function' && canOverrideWorkspace);

  const emitStylePatch = patch => {
    onChangeWorkspaceStyle?.(patch);
  };

  const resetLabel = isWorkspaceScope ? 'Reset Override' : 'Reset Style';
  const resetTitle = isWorkspaceScope
    ? (dirty ? 'Remove this Workspace override and inherit Shared Style defaults' : 'This Workspace already inherits Shared Style defaults')
    : (dirty ? 'Restore default Workspace Style without changing Reading Mode, Appearance, or Audio settings' : 'Workspace Style is already using accepted defaults');

  return (
    <div
      className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5"
      data-shared-workspace-style-bar="true"
      data-shared-workspace-style-scope={isWorkspaceScope ? 'workspace' : 'shared'}
      data-shared-workspace-style-override={hasWorkspaceOverride ? 'true' : 'false'}
      data-shared-workspace-style-align={activeStyle.textAlign}
      data-shared-workspace-style-indent={activeStyle.paragraphIndent ? 'on' : 'off'}
      data-shared-workspace-style-speaker={activeStyle.speakerLayout}
      data-shared-workspace-style-accents={activeStyle.showAccents ? 'on' : 'off'}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
          <Palette aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
          <span>Workspace Style</span>
          {scopeLabel && !showScopeSwitcher && (
            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500 dark:text-slate-400">
              {scopeLabel}
            </span>
          )}
        </div>

        {showScopeSwitcher && (
          <div
            role="group"
            aria-label="Workspace style target scope (display only)"
            data-shared-workspace-style-scope-group="true"
            className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 p-0.5"
          >
            {[
              { id: 'shared', label: 'Shared Default', title: 'Edit shared Workspace Style defaults for all unoverridden Workspaces' },
              { id: 'workspace', label: 'This Workspace', title: 'Edit an optional Workspace-specific style override for this Workspace only' }
            ].map(item => {
              const active = (item.id === 'workspace') === isWorkspaceScope;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeWorkspaceStyleScope(item.id)}
                  title={item.title}
                  data-shared-workspace-style-scope-option={item.id}
                  className={`min-h-10 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'workspace' && hasWorkspaceOverride && (
                    <span
                      aria-label="Custom override active"
                      data-shared-workspace-style-override-dot="true"
                      className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-indigo-500 dark:bg-indigo-300'}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Shared Text Alignment: Left | Justify */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            Align
          </span>
          <div
            role="group"
            aria-label="Shared reading text alignment (display only)"
            className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 p-0.5"
          >
            {SHARED_WORKSPACE_ALIGNMENT_OPTIONS.map(option => {
              const active = activeStyle.textAlign === option.id;
              const Icon = ALIGNMENT_ICONS[option.id] || AlignLeft;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => emitStylePatch({ textAlign: option.id })}
                  title={option.description}
                  data-shared-workspace-align-option={option.id}
                  className={`min-h-10 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/80 dark:ring-slate-600'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon aria-hidden="true" className="w-3 h-3 shrink-0" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation Speaker Arrangement: Aligned | Stacked | Inline */}
        {showSpeakerLayout && (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              Speakers
            </span>
            <div
              role="group"
              aria-label="Conversation speaker arrangement (display only)"
              className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 p-0.5"
            >
              {SHARED_CONVERSATION_SPEAKER_LAYOUT_OPTIONS.map(option => {
                const active = activeStyle.speakerLayout === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => emitStylePatch({ speakerLayout: option.id })}
                    title={option.description}
                    data-shared-workspace-speaker-option={option.id}
                    className={`min-h-10 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/80 dark:ring-slate-600'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Paragraph First-Line Indent & Left Accents */}
        <div className="flex flex-wrap items-center gap-1.5">
          {showParagraphIndent && (
            <button
              type="button"
              aria-pressed={activeStyle.paragraphIndent}
              onClick={() => emitStylePatch({ paragraphIndent: !activeStyle.paragraphIndent })}
              title="Toggle first-line indentation on Paragraph body Sections (never indents Title Cards or Dialogue Turns)"
              data-shared-workspace-indent-toggle="true"
              className={`min-h-10 sm:min-h-7 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeStyle.paragraphIndent
                  ? 'border-teal-300/90 dark:border-teal-700/80 bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              <Indent aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>Indent {activeStyle.paragraphIndent ? 'On' : 'Off'}</span>
            </button>
          )}

          <button
            type="button"
            aria-pressed={activeStyle.showAccents}
            onClick={() => emitStylePatch({ showAccents: !activeStyle.showAccents })}
            title="Toggle subtle Paragraph/Speaker left accent rails and speaker dots"
            data-shared-workspace-accents-toggle="true"
            className={`min-h-10 sm:min-h-7 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              activeStyle.showAccents
                ? 'border-indigo-300/90 dark:border-indigo-700/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
            }`}
          >
            <Sparkles aria-hidden="true" className="w-3 h-3 shrink-0" />
            <span>Accents {activeStyle.showAccents ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {onResetWorkspaceStyle && (
        <button
          type="button"
          disabled={!dirty}
          onClick={onResetWorkspaceStyle}
          data-shared-workspace-style-reset="true"
          title={resetTitle}
          className="min-h-10 sm:min-h-7 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-300 inline-flex items-center gap-1 transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <RotateCcw aria-hidden="true" className="w-3 h-3" />
          <span>{resetLabel}</span>
        </button>
      )}
    </div>
  );
};

/**
 * Shared view-only reading controls for Mode, Reading Language / Order,
 * Bilingual Style (mode-aware without mutating saved preferences), Contextual
 * Placement, collapsible Appearance / Typography, and Workspace Style.
 */
export const SharedBilingualLayoutToolbar = ({
  presentationState,
  onChangePresentationState,
  onResetView = null,
  readerMode = null,
  onChangeReaderMode = null,
  workspaceStyle = null,
  effectiveWorkspaceStyleDefaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  onChangeWorkspaceStyle = null,
  onResetWorkspaceStyle = null,
  workspaceStyleScope = 'shared',
  onChangeWorkspaceStyleScope = null,
  canOverrideWorkspaceStyle = false,
  hasWorkspaceStyleOverride = false,
  showWorkspaceStyle = false,
  workspaceStyleScopeLabel = null,
  unitKind = 'paragraph',
  workspaceType = null,
  subtitle = null,
  rightSlot = null
}) => {
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const activeState = normalizeTextCardPresentationState(presentationState);
  const terms = getSharedUnitTerms(workspaceType === 'mixed' ? { documentType: 'mixed' } : unitKind);
  const describe = option => adaptDescription(option.description, terms);
  const supportsFourModes = Boolean(readerMode !== null || onChangeReaderMode !== null);
  const modeResolution = resolveTextReaderModeFromState({
    readerMode,
    view: activeState,
    supportsFourModes
  });
  const activeReaderMode = modeResolution.mode;
  const focusOrientation = modeResolution.focusOrientation;

  const bilingualResolution = resolveEffectiveBilingualPresentation({
    readerMode: activeReaderMode,
    view: activeState
  });
  const appearanceDirty = isTextReaderAppearanceDirty(activeState.appearance);

  const isCustomView = (
    activeState.level !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.level
    || activeState.readingLanguage !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.readingLanguage
    || activeState.bilingualStyle !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualStyle
    || activeState.contextualPlacement !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.contextualPlacement
    || activeState.partLayout !== DEFAULT_TEXT_CARD_PRESENTATION_STATE.partLayout
    || appearanceDirty
    || (supportsFourModes && activeReaderMode !== 'full')
  );

  const emitPatch = patch => {
    const next = updateTextCardPresentationState(activeState, patch);
    onChangePresentationState?.(next);
  };

  const handleSelectReaderMode = nextMode => {
    onChangeReaderMode?.(nextMode);
    if (nextMode === 'full' || nextMode === 'card') {
      if (activeState.level !== 'full') {
        emitPatch({ level: 'full' });
      }
      return;
    }
    if (nextMode === 'focus') {
      emitPatch({ level: 'part', partLayout: focusOrientation });
      return;
    }
    if (nextMode === 'segment') {
      emitPatch({ level: 'segment' });
    }
  };

  const handleSelectReadingLanguage = nextLanguage => {
    emitPatch({ readingLanguage: nextLanguage });
  };

  const handleSelectBilingualStyle = nextStyle => {
    if (!bilingualResolution.allowedBilingualStyles.includes(nextStyle)) return;
    // Selecting a Bilingual Style while on single-language automatically promotes
    // EN Only -> EN–ID or ID Only -> ID–EN so style choice applies in one click.
    const nextReadingLanguage = bilingualResolution.isBilingual
      ? activeState.readingLanguage
      : (activeState.readingLanguage === 'id-only' ? 'id-en' : 'en-id');
    emitPatch({
      readingLanguage: nextReadingLanguage,
      bilingualStyle: nextStyle
    });
  };

  const handleChangeAppearance = patch => {
    emitPatch({ appearance: patch });
  };

  const handleResetAppearance = () => {
    onChangePresentationState?.(resetTextCardAppearanceInPresentationState(activeState));
  };

  const shouldShowWorkspaceStyle = Boolean(
    showWorkspaceStyle
    || workspaceStyle !== null
    || typeof onChangeWorkspaceStyle === 'function'
  );
  const showContextualFocusBar = supportsFourModes
    ? activeReaderMode === 'focus'
    : activeState.level === 'part';

  return (
    <div
      className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 shadow-sm px-3.5 py-2.5 sm:px-4 sm:py-3 space-y-2.5"
      data-shared-card-bilingual-toolbar="true"
      data-shared-reader-mode={activeReaderMode}
      data-shared-reading-language={activeState.readingLanguage}
      data-shared-bilingual-style-saved={activeState.bilingualStyle}
      data-shared-bilingual-style-effective={bilingualResolution.effectiveRenderMode}
      data-shared-contextual-placement={activeState.contextualPlacement}
    >
      {/* Row 1: Reader Mode + Reading Language + Bilingual Style + Appearance Toggle + Reset View */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          {/* Reader Mode Selector */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {supportsFourModes ? 'Mode' : 'View'}
            </span>
            {supportsFourModes ? (
              <div
                role="group"
                aria-label="Reader presentation mode (display only)"
                className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-1"
              >
                {READER_MODE_OPTIONS.map(item => {
                  const active = activeReaderMode === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectReaderMode(item.id)}
                      title={item.description}
                      data-shared-reader-mode-option={item.id}
                      className={`min-h-11 sm:min-h-9 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        active
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
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
            )}
          </div>

          <span aria-hidden="true" className="hidden sm:inline-block h-5 w-px bg-slate-200 dark:bg-slate-800" />

          {/* Reading Language & Order: EN Only | ID Only | EN–ID | ID–EN */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Language
            </span>
            <div
              role="group"
              aria-label="Reading language and display order (display only)"
              data-shared-reading-language-group="true"
              className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-1"
            >
              {SHARED_READING_LANGUAGE_OPTIONS.map(option => {
                const active = activeState.readingLanguage === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectReadingLanguage(option.id)}
                    title={option.description}
                    data-shared-reading-language-option={option.id}
                    data-shared-card-layout-option={option.legacyLayoutId || undefined}
                    className={`min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600/80'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span aria-hidden="true" className="hidden sm:inline-block h-5 w-px bg-slate-200 dark:bg-slate-800" />

          {/* Bilingual Style: Separated | Sentence Interlinear | Contextual (Notebook deferred to 4C2-4C3) */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Style
            </span>
            <div
              role="group"
              aria-label="Bilingual reading style (display only)"
              data-shared-bilingual-style-group="true"
              className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-1"
            >
              {SHARED_BILINGUAL_STYLE_OPTIONS.map(option => {
                const unavailable = !bilingualResolution.allowedBilingualStyles.includes(option.id);
                const active = bilingualResolution.effectiveBilingualStyle === option.id;
                const savedRemembered = !active && activeState.bilingualStyle === option.id;
                const Icon = BILINGUAL_STYLE_ICONS[option.id] || Languages;
                const unavailableTitle = option.id === 'contextual'
                  ? 'Contextual is unavailable in Segment Mode (represented by the Study Box); saved preference is preserved when you return'
                  : 'Separated is unavailable in Segment Mode; saved preference is preserved when you return';
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={unavailable}
                    aria-pressed={active}
                    aria-disabled={unavailable ? 'true' : undefined}
                    onClick={() => handleSelectBilingualStyle(option.id)}
                    title={unavailable ? unavailableTitle : option.description}
                    data-shared-bilingual-style-option={option.id}
                    data-shared-bilingual-style-unavailable={unavailable ? 'true' : undefined}
                    data-shared-card-layout-option={option.legacyLayoutId || undefined}
                    className={`min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600/80'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-400'}`} />
                    <span className="truncate">{option.shortLabel || option.label}</span>
                    {savedRemembered && (
                      <span
                        aria-hidden="true"
                        title="Saved bilingual style (restored when bilingual reading is active)"
                        className="h-1.5 w-1.5 rounded-full bg-indigo-400/80 shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Appearance / Typography Trigger */}
          <button
            type="button"
            aria-expanded={appearanceOpen}
            onClick={() => setAppearanceOpen(open => !open)}
            data-shared-appearance-toggle="true"
            title="Adjust reading font sizes, font family, line height, translation contrast, and spacing"
            className={`min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              appearanceOpen || appearanceDirty
                ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            <span>Typography</span>
            {appearanceDirty && (
              <span
                aria-label="Custom typography active"
                data-shared-appearance-dirty-dot="true"
                className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-300"
              />
            )}
            <ChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 transition-transform duration-150 ${appearanceOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {onResetView && isCustomView && (
            <button
              type="button"
              onClick={onResetView}
              className="min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-300 inline-flex items-center gap-1 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Restore default reader view and typography without changing Workspace Style or audio"
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

      {/* Mode-aware fallback notice in Segment Mode when saved style is Separated or Contextual */}
      {bilingualResolution.fallbackActive && (
        <div
          data-shared-bilingual-fallback-notice="true"
          data-shared-bilingual-fallback-reason={bilingualResolution.fallbackReason}
          className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-left text-xs text-slate-500 dark:text-slate-400"
        >
          <span>
            Segment Mode uses primary-only reading context ({bilingualResolution.primaryChannel === 'meaning' ? 'ID' : 'EN'}) above the bilingual Study Box. Your saved{' '}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">
              {activeState.bilingualStyle === 'contextual' ? 'Contextual' : 'Separated'}
            </strong>{' '}
            style is preserved for Full, Card, and Focus modes.
          </span>
        </div>
      )}

      {/* Contextual Translation Position Bar (Above | Below | Inline) — shown only when Contextual is active */}
      {bilingualResolution.isContextualActive && (
        <div
          className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2 text-left"
          data-shared-contextual-placement-bar="true"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Contextual Position
          </span>
          <div
            role="group"
            aria-label="Contextual translation position (display only)"
            className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/65 p-1"
          >
            {SHARED_CONTEXTUAL_PLACEMENT_OPTIONS.map(option => {
              const active = activeState.contextualPlacement === option.id;
              const Icon = CONTEXTUAL_PLACEMENT_ICONS[option.id] || ArrowDown;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => emitPatch({ contextualPlacement: option.id })}
                  title={option.description}
                  data-shared-contextual-placement-option={option.id}
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
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            All primary text stays visible · tap any sentence&apos;s translate icon to inspect without playing audio
          </span>
        </div>
      )}

      {/* Contextual Focus Orientation (4-mode) or legacy Part Style (3-mode) Switch */}
      {showContextualFocusBar && (
        <div
          className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2"
          data-shared-part-layout-bar="true"
          data-shared-focus-orientation-bar={supportsFourModes ? 'true' : undefined}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {supportsFourModes ? 'Focus Style' : 'Part Style'}
          </span>
          <div
            role="group"
            aria-label={supportsFourModes ? `Focus ${terms.lower} orientation (display only)` : `Part ${terms.lower} layout (display only)`}
            className={`${supportsFourModes ? 'grid grid-cols-2' : 'grid grid-cols-3'} sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-slate-100/75 dark:bg-slate-800/60 p-1`}
          >
            {(supportsFourModes ? SHARED_FOCUS_ORIENTATION_OPTIONS : SHARED_PART_LAYOUT_OPTIONS).map(option => {
              const active = supportsFourModes
                ? focusOrientation === option.id
                : activeState.partLayout === option.id;
              const Icon = PART_LAYOUT_ICONS[option.id] || List;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (supportsFourModes && readerMode !== 'focus') {
                      onChangeReaderMode?.('focus');
                    }
                    emitPatch(supportsFourModes ? { level: 'part', partLayout: option.id } : { partLayout: option.id });
                  }}
                  title={describe(option)}
                  data-shared-card-part-layout-option={option.id}
                  data-shared-focus-orientation-option={supportsFourModes ? option.id : undefined}
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

      {/* Collapsible Appearance / Typography Panel */}
      {appearanceOpen && (
        <SharedAppearanceTypographyPanel
          appearance={activeState.appearance}
          showNotebook={bilingualResolution.effectiveRenderMode === 'notebook'}
          onChangeAppearance={handleChangeAppearance}
          onResetAppearance={handleResetAppearance}
        />
      )}

      {shouldShowWorkspaceStyle && (
        <SharedWorkspaceStyleBar
          workspaceStyle={workspaceStyle}
          effectiveDefaults={effectiveWorkspaceStyleDefaults}
          onChangeWorkspaceStyle={onChangeWorkspaceStyle}
          onResetWorkspaceStyle={onResetWorkspaceStyle}
          workspaceType={workspaceType}
          workspaceStyleScope={workspaceStyleScope}
          onChangeWorkspaceStyleScope={onChangeWorkspaceStyleScope}
          canOverrideWorkspace={canOverrideWorkspaceStyle}
          hasWorkspaceOverride={hasWorkspaceStyleOverride}
          scopeLabel={workspaceStyleScopeLabel}
        />
      )}
    </div>
  );
};

export default SharedBilingualLayoutToolbar;
