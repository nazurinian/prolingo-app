import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignJustify,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Columns,
  Database,
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
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Target,
  Type,
  X
} from 'lucide-react';
import {
  OVERLAY_SOURCES,
  announcePresentationOverlayOpen,
  openReadingHistoryEntry,
  subscribeOtherPresentationOverlayOpen
} from './sharedOverlayCoordinator.js';
import { usePresentationOverlayFocus } from './usePresentationOverlayFocus.js';
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
import {
  SHARED_CONTROL_TOKENS,
  SHARED_SPACING_TOKENS,
  SHARED_SURFACE_TOKENS,
  SHARED_UI_TERMINOLOGY
} from './sharedDesignTokens.js';

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
  notebook: BookOpen,
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

const STYLE_BADGE_LABELS = Object.freeze({
  separated: 'Separated',
  interlinear: 'Interlinear',
  notebook: 'Notebook',
  contextual: 'Contextual'
});

const adaptDescription = (text, terms) => (
  terms.label === 'Section'
    ? text
    : text
        .replace(/\bsections\b/g, terms.plural)
        .replace(/\bsection\b/g, terms.lower)
        .replace(/\bcard\b/g, terms.cardLower)
);

const useIsCompactViewport = () => {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = event => setCompact(event.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  return compact;
};

const AppearanceOptionRow = ({ label, ariaLabel, options, activeId, attrName, onSelect }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
      {label}
    </span>
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
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
            className={`min-h-9 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
              active
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/80 dark:ring-slate-600'
                : SHARED_CONTROL_TOKENS.segmentInactive
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
 * Notebook spacing/guide options + independent Reset Appearance that never mutates
 * Workspace Style, bilingual choices, or audio).
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
      className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-left"
      data-shared-appearance-panel="true"
      data-shared-appearance-dirty={dirty ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Type aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Typography &amp; Contrast
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden md:inline">
            · View-only, live preview below
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
          className={`min-h-9 sm:min-h-7 px-2.5 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
        >
          <RotateCcw aria-hidden="true" className="w-3 h-3" />
          <span>Reset Appearance</span>
        </button>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 ${SHARED_SURFACE_TOKENS.panelInset} p-2.5`}>
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
            <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 min-h-9 sm:min-h-7 cursor-pointer">
              <span>Notebook Guide Lines</span>
              <input
                type="checkbox"
                data-shared-notebook-guides-option="true"
                checked={appearance.notebookGuideLines}
                onChange={event => onChangeAppearance({ notebookGuideLines: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Compact, grouped Workspace Style bar separate from Reader Mode, Reading Language /
 * Reading Style, Appearance / Typography, Card Visibility, and Playback Settings.
 * Displays explicit Inherited vs Workspace Override status badges.
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
    : (dirty ? 'Restore default Workspace Style without changing Reader Mode, Appearance, or Audio settings' : 'Workspace Style is already using accepted defaults');

  return (
    <div
      className="space-y-2.5 text-left"
      data-shared-workspace-style-bar="true"
      data-shared-workspace-style-scope={isWorkspaceScope ? 'workspace' : 'shared'}
      data-shared-workspace-style-override={hasWorkspaceOverride ? 'true' : 'false'}
      data-shared-workspace-style-status={hasWorkspaceOverride ? 'override' : 'inherited'}
      data-shared-workspace-style-align={activeStyle.textAlign}
      data-shared-workspace-style-indent={activeStyle.paragraphIndent ? 'on' : 'off'}
      data-shared-workspace-style-speaker={activeStyle.speakerLayout}
      data-shared-workspace-style-accents={activeStyle.showAccents ? 'on' : 'off'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 shrink-0">
            <Palette aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
            <span>Workspace Style</span>
          </div>

          {canOverrideWorkspace ? (
            <span
              data-shared-workspace-style-inheritance-badge={hasWorkspaceOverride ? 'override' : 'inherited'}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                hasWorkspaceOverride
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {hasWorkspaceOverride ? 'Workspace Override Active' : 'Inherited from Shared Default'}
            </span>
          ) : scopeLabel ? (
            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {scopeLabel}
            </span>
          ) : null}
        </div>

        {onResetWorkspaceStyle && (
          <button
            type="button"
            disabled={!dirty}
            onClick={onResetWorkspaceStyle}
            data-shared-workspace-style-reset="true"
            title={resetTitle}
            className={`min-h-9 sm:min-h-7 px-2.5 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
          >
            <RotateCcw aria-hidden="true" className="w-3 h-3" />
            <span>{resetLabel}</span>
          </button>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-2.5 ${SHARED_SURFACE_TOKENS.panelInset} p-2.5`}>
        {showScopeSwitcher && (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Scope
            </span>
            <div
              role="group"
              aria-label="Workspace style target scope (display only)"
              data-shared-workspace-style-scope-group="true"
              className={`inline-flex items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
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
                    className={`min-h-9 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                      active
                        ? SHARED_CONTROL_TOKENS.segmentActivePrimary
                        : SHARED_CONTROL_TOKENS.segmentInactive
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
          </div>
        )}

        {/* Shared Text Alignment: Left | Justify */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Align
          </span>
          <div
            role="group"
            aria-label="Shared reading text alignment (display only)"
            className={`inline-flex items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
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
                  className={`min-h-9 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/80 dark:ring-slate-600'
                      : SHARED_CONTROL_TOKENS.segmentInactive
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
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Speakers
            </span>
            <div
              role="group"
              aria-label="Conversation speaker arrangement (display only)"
              className={`inline-flex flex-wrap items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
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
                    className={`min-h-9 sm:min-h-7 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/80 dark:ring-slate-600'
                        : SHARED_CONTROL_TOKENS.segmentInactive
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
              className={`min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
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
            className={`min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
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
    </div>
  );
};

/**
 * Reading-First Shell & Progressive-Disclosure Reading Settings bar.
 *
 * Default closed state prioritizes immediate prose visibility on desktop and mobile:
 * Reader Mode + Reading Language + Focus Orientation (when Focus active) + Reading Settings toggle.
 *
 * Opening Reading Settings exposes Reading Style, Contextual Position, Card Visibility,
 * Appearance / Typography, and Workspace Style without mutating audio, selection, or scroll.
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
  workspaceTitle = null,
  workspaceBadge = null,
  mobileWorkspaceDocuments = null,
  activeWorkspaceId = null,
  onSelectWorkspace = null,
  workspaceCommandBusy = false,
  onOpenMobileData = null,
  mobilePlayAction = null,
  mobileReaderSwitchSlot = null,
  subtitle = null,
  rightSlot = null,
  workspaceHeaderSlot = null,
  cardVisibilitySlot = null,
  divergedBannerSlot = null
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('reading');
  const [overlayTopPx, setOverlayTopPx] = useState(108);
  const isCompactViewport = useIsCompactViewport();
  const settingsPanelId = useId();
  const toolbarRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const overlayPanelRef = useRef(null);
  const releaseHistoryRef = useRef(null);

  const measureOverlayAnchor = useCallback(() => {
    if (typeof window === 'undefined' || !toolbarRef.current) return;
    const rect = toolbarRef.current.getBoundingClientRect();
    const minTop = 56;
    const maxTop = Math.max(minTop + 20, Math.round(window.innerHeight * 0.36));
    const nextTop = Math.round(Math.max(minTop, Math.min(maxTop, rect.bottom + 6)));
    setOverlayTopPx(nextTop);
  }, []);

  const closeSettings = useCallback(() => {
    releaseHistoryRef.current?.();
    releaseHistoryRef.current = null;
    setSettingsOpen(false);
  }, []);

  useEffect(() => subscribeOtherPresentationOverlayOpen(OVERLAY_SOURCES.READING_VIEW, closeSettings), [closeSettings]);
  useLayoutEffect(() => () => releaseHistoryRef.current?.(), []);
  useLayoutEffect(() => {
    if (!isCompactViewport && releaseHistoryRef.current) closeSettings();
  }, [isCompactViewport, closeSettings]);
  const returnToToggle = useCallback(() => toggleBtnRef.current, []);
  usePresentationOverlayFocus({ open: settingsOpen && isCompactViewport, panelRef: overlayPanelRef, onClose: closeSettings, returnFocus: returnToToggle });

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeSettings();
        toggleBtnRef.current?.focus({ preventScroll: true });
      }
    };
    if (!isCompactViewport) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    window.addEventListener('resize', measureOverlayAnchor);
    window.addEventListener('scroll', measureOverlayAnchor, { passive: true });
    return () => {
      window.removeEventListener('resize', measureOverlayAnchor);
      window.removeEventListener('scroll', measureOverlayAnchor);
    };
  }, [settingsOpen, isCompactViewport, measureOverlayAnchor, closeSettings]);

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
    // Selecting a Reading Style while on single-language automatically promotes
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

  const handleToggleReadingSettings = () => {
    if (settingsOpen) {
      closeSettings();
      return;
    }
    setSettingsTab('reading');
    announcePresentationOverlayOpen(OVERLAY_SOURCES.READING_VIEW);
    if (isCompactViewport) {
      measureOverlayAnchor();
      releaseHistoryRef.current = openReadingHistoryEntry(closeSettings);
    }
    setSettingsOpen(true);
  };

  const shouldShowWorkspaceStyle = Boolean(
    showWorkspaceStyle
    || workspaceStyle !== null
    || typeof onChangeWorkspaceStyle === 'function'
  );
  const showContextualFocusBar = supportsFourModes
    ? activeReaderMode === 'focus'
    : activeState.level === 'part';

  const activeStyleSummary = STYLE_BADGE_LABELS[bilingualResolution.effectiveBilingualStyle]
    || STYLE_BADGE_LABELS[activeState.bilingualStyle]
    || 'Interlinear';
  const activeModeLabel = supportsFourModes
    ? (READER_MODE_OPTIONS.find(option => option.id === activeReaderMode)?.label || 'Full')
    : (SHARED_LEVEL_OPTIONS.find(option => option.id === activeState.level)?.label || 'Full');
  const activeLanguageSummary = SHARED_READING_LANGUAGE_OPTIONS.find(
    option => option.id === activeState.readingLanguage
  )?.label || 'EN Only';
  const mobileEffectiveSummaryParts = [
    activeModeLabel,
    activeLanguageSummary,
    bilingualResolution.isBilingual && activeReaderMode !== 'segment' ? activeStyleSummary : null,
    activeReaderMode === 'focus'
      ? (focusOrientation === 'horizontal-focus' ? 'Horizontal' : 'Vertical')
      : null
  ].filter(Boolean);
  const mobileEffectiveViewSummary = mobileEffectiveSummaryParts.join(' · ');
  const hasSettingsCustomizations = Boolean(appearanceDirty || hasWorkspaceStyleOverride);

  const mobileReaderControlsBlock = (
    <div className="space-y-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800" data-mobile-overlay-primary-controls="true">
      {/* Reader Mode */}
      <div className="space-y-1 text-left">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {supportsFourModes ? SHARED_UI_TERMINOLOGY.readerMode : 'View'}
        </span>
        {supportsFourModes ? (
          <div
            role="group"
            aria-label="Reader presentation mode (display only)"
            className={`grid grid-cols-4 w-full items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
          >
            {READER_MODE_OPTIONS.map(item => {
              const active = activeReaderMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectReaderMode(item.id)}
                  title={item.description}
                  data-shared-reader-mode-option={item.id}
                  className={`min-h-9 px-1.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                    active ? SHARED_CONTROL_TOKENS.segmentActivePrimary : SHARED_CONTROL_TOKENS.segmentInactive
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div
            role="group"
            aria-label="Reading view level (display only)"
            className={`grid grid-cols-3 w-full items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
          >
            {SHARED_LEVEL_OPTIONS.map(option => {
              const active = activeState.level === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => emitPatch({ level: option.id })}
                  title={describe(option)}
                  data-shared-card-level-option={option.id}
                  className={`min-h-9 px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                    active ? SHARED_CONTROL_TOKENS.segmentActivePrimary : SHARED_CONTROL_TOKENS.segmentInactive
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Focus Orientation (contextually shown only when Focus mode is active) */}
      {showContextualFocusBar && (
        <div
          className="flex items-center justify-between gap-2 text-left"
          data-shared-part-layout-bar="true"
          data-shared-focus-orientation-bar={supportsFourModes ? 'true' : undefined}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
            Focus Flow
          </span>
          <div
            role="group"
            aria-label={supportsFourModes ? `Focus ${terms.lower} orientation (display only)` : `Part ${terms.lower} layout (display only)`}
            className={`inline-flex items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
          >
            {(supportsFourModes ? SHARED_FOCUS_ORIENTATION_OPTIONS : SHARED_PART_LAYOUT_OPTIONS).map(option => {
              const active = supportsFourModes ? focusOrientation === option.id : activeState.partLayout === option.id;
              const Icon = PART_LAYOUT_ICONS[option.id] || List;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (supportsFourModes && readerMode !== 'focus') onChangeReaderMode?.('focus');
                    emitPatch(supportsFourModes ? { level: 'part', partLayout: option.id } : { partLayout: option.id });
                  }}
                  title={describe(option)}
                  data-shared-card-part-layout-option={option.id}
                  data-shared-focus-orientation-option={supportsFourModes ? option.id : undefined}
                  className={`min-h-8 px-2.5 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/70 dark:ring-slate-600'
                      : SHARED_CONTROL_TOKENS.segmentInactive
                  }`}
                >
                  <Icon aria-hidden="true" className="w-3 h-3 shrink-0" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reading Language */}
      <div className="space-y-1 text-left">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Language
        </span>
        <div
          role="group"
          aria-label="Reading language and display order (display only)"
          data-shared-reading-language-group="true"
          className={`grid grid-cols-4 w-full items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
        >
          {SHARED_READING_LANGUAGE_OPTIONS.map(option => {
            const active = activeState.readingLanguage === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                aria-label={option.label}
                onClick={() => handleSelectReadingLanguage(option.id)}
                title={option.description}
                data-shared-reading-language-option={option.id}
                data-shared-card-layout-option={option.legacyLayoutId || undefined}
                className={`min-h-9 px-1 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap inline-flex items-center justify-center transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                  active ? SHARED_CONTROL_TOKENS.segmentActiveNeutral : SHARED_CONTROL_TOKENS.segmentInactive
                }`}
              >
                <span>{option.shortLabel || option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const readingSettingsBody = (
    <div className="space-y-3">
      {/* Panel Header: Tabs + Reset View + Close (single compact row on mobile & desktop) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {shouldShowWorkspaceStyle ? (
            <div
              role="tablist"
              aria-label="Reading Settings sections"
              className={`inline-flex items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
              data-shared-reading-settings-tabs="true"
            >
              {[
                { id: 'reading', label: 'Style & Typography', compactLabel: 'Reading' },
                { id: 'workspace', label: 'Workspace Style', compactLabel: 'Style', badge: hasWorkspaceStyleOverride }
              ].map(tab => {
                const active = settingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-shared-reading-settings-tab={tab.id}
                    onClick={() => setSettingsTab(tab.id)}
                    className={`min-h-8 sm:min-h-7 px-2 sm:px-2.5 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors motion-reduce:transition-none whitespace-nowrap ${SHARED_CONTROL_TOKENS.focusRing} ${
                      active ? SHARED_CONTROL_TOKENS.segmentActiveNeutral : SHARED_CONTROL_TOKENS.segmentInactive
                    }`}
                  >
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.compactLabel}</span>
                    {tab.badge && (
                      <span
                        aria-label="Workspace override active"
                        className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-300"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {SHARED_UI_TERMINOLOGY.readingSettings}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onResetView && isCustomView && (
            <button
              type="button"
              onClick={onResetView}
              className={`min-h-8 sm:min-h-7 px-2 sm:px-2.5 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1 ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
              title="Restore default reader view and typography without changing Workspace Style or audio"
              data-shared-card-reset-view="true"
            >
              <RotateCcw aria-hidden="true" className="w-3 h-3" />
              <span className="hidden sm:inline">Reset View</span>
              <span className="sm:hidden">Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeSettings}
            data-shared-reading-settings-close="true"
            aria-label="Close Reading Settings"
            className={`min-h-8 sm:min-h-7 px-2 sm:px-2.5 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1 ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
          >
            <X aria-hidden="true" className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>
      </div>

      {/* Mobile-only Workspace identity + Switcher inside the overlay so long titles & Workspace management stay accessible */}
      {isCompactViewport && (workspaceTitle || (Array.isArray(mobileWorkspaceDocuments) && mobileWorkspaceDocuments.length > 0)) && (
        <div
          className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 px-2.5 py-2 space-y-2 text-left"
          data-mobile-overlay-workspace-section="true"
        >
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Active Workspace
              </p>
              <p className="text-xs font-bold text-slate-900 dark:text-slate-50 break-words [overflow-wrap:anywhere]">
                {workspaceTitle || 'Workspace'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {workspaceBadge && (
                <span className="rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                  {workspaceBadge}
                </span>
              )}
              {typeof onOpenMobileData === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    closeSettings();
                    onOpenMobileData();
                  }}
                  className={`min-h-8 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
                >
                  <Database aria-hidden="true" className="w-3 h-3 text-indigo-600 dark:text-indigo-300" />
                  <span>Data</span>
                </button>
              )}
            </div>
          </div>

          {Array.isArray(mobileWorkspaceDocuments) && mobileWorkspaceDocuments.length > 1 && typeof onSelectWorkspace === 'function' && (
            <div
              className="flex items-center gap-1 overflow-x-auto pb-0.5"
              data-mobile-overlay-workspace-switcher="true"
            >
              {mobileWorkspaceDocuments.map(doc => {
                const selectedDoc = doc.id === activeWorkspaceId;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    disabled={workspaceCommandBusy}
                    aria-pressed={selectedDoc}
                    onClick={() => {
                      if (!workspaceCommandBusy && !selectedDoc) {
                        closeSettings();
                        onSelectWorkspace(doc.id);
                      }
                    }}
                    className={`shrink-0 min-h-8 max-w-[190px] rounded-lg border px-2 py-0.5 text-left inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                      selectedDoc
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{doc.title}</span>
                  </button>
                );
              })}
            </div>
          )}

          {mobileReaderSwitchSlot && (
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Reader UI</span>
              {mobileReaderSwitchSlot}
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Mobile Mode/Language + Reading Style + Contextual Position + Card Visibility + Appearance / Typography */}
      <div
        hidden={shouldShowWorkspaceStyle && settingsTab !== 'reading'}
        className="space-y-2.5"
        data-shared-reading-settings-reading-tab="true"
      >
        {isCompactViewport && mobileReaderControlsBlock}
        {/* Reading Style: Separated | Sentence Interlinear | Notebook | Contextual */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2.5 text-left">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
            {SHARED_UI_TERMINOLOGY.readingStyle}
          </span>
          <div
            role="group"
            aria-label="Bilingual reading style (display only)"
            data-shared-bilingual-style-group="true"
            className={`grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
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
                  className={`min-h-10 sm:min-h-8 px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors duration-150 motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.focusRing} ${
                    active
                      ? SHARED_CONTROL_TOKENS.segmentActiveNeutral
                      : SHARED_CONTROL_TOKENS.segmentInactive
                  }`}
                >
                  <Icon aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-400'}`} />
                  <span className="truncate">{option.shortLabel || option.label}</span>
                  {savedRemembered && (
                    <span
                      aria-hidden="true"
                      title="Saved reading style (restored when bilingual reading is active)"
                      className="h-1.5 w-1.5 rounded-full bg-indigo-400/80 shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode-aware fallback notice in Segment Mode when saved style is Separated or Contextual */}
        {bilingualResolution.fallbackActive && (
          <div
            data-shared-bilingual-fallback-notice="true"
            data-shared-bilingual-fallback-reason={bilingualResolution.fallbackReason}
            className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 px-2.5 py-1.5 text-left text-[11px] text-slate-600 dark:text-slate-300"
          >
            Segment Mode keeps primary text ({bilingualResolution.primaryChannel === 'meaning' ? 'ID' : 'EN'}) above the bilingual Study Box. Your saved{' '}
            <strong className="font-semibold text-slate-800 dark:text-slate-100">
              {activeState.bilingualStyle === 'contextual' ? 'Contextual' : 'Separated'}
            </strong>{' '}
            style is preserved for Full, Card, and Focus modes.
          </div>
        )}

        {/* Contextual Translation Position Bar (Above | Below | Inline) — shown only when Contextual is active */}
        {bilingualResolution.isContextualActive && (
          <div
            className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2 text-left"
            data-shared-contextual-placement-bar="true"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
              Contextual Position
            </span>
            <div
              role="group"
              aria-label="Contextual translation position (display only)"
              className={`grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrackCompact}`}
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
                    className={`min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-md text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/70 dark:ring-slate-600'
                        : SHARED_CONTROL_TOKENS.segmentInactive
                    }`}
                  >
                    <Icon aria-hidden="true" className="w-3 h-3 shrink-0" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Tap a sentence&apos;s translate icon to inspect without playing audio
            </span>
          </div>
        )}

        {/* Card Visibility Controls (Card / Focus / Segment modes) */}
        {cardVisibilitySlot}

        {/* Appearance / Typography Panel (mounted only while Reading Settings is open) */}
        {settingsOpen && (
          <SharedAppearanceTypographyPanel
            appearance={activeState.appearance}
            showNotebook={bilingualResolution.effectiveRenderMode === 'notebook'}
            onChangeAppearance={handleChangeAppearance}
            onResetAppearance={handleResetAppearance}
          />
        )}
      </div>

      {/* Tab 2: Workspace Style */}
      {shouldShowWorkspaceStyle && (
        <div
          hidden={settingsTab !== 'workspace'}
          data-shared-reading-settings-workspace-tab="true"
        >
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
        </div>
      )}
    </div>
  );

  const workspaceAccentDot = workspaceType === 'paragraph'
    ? 'bg-teal-500 dark:bg-teal-400'
    : 'bg-indigo-500 dark:bg-indigo-400';

  return (
    <div
      ref={toolbarRef}
      className={`${SHARED_SURFACE_TOKENS.shellCard} overflow-hidden`}
      data-shared-card-bilingual-toolbar="true"
      data-shared-reader-mode={activeReaderMode}
      data-shared-reading-language={activeState.readingLanguage}
      data-shared-bilingual-style-saved={activeState.bilingualStyle}
      data-shared-bilingual-style-effective={bilingualResolution.effectiveRenderMode}
      data-shared-contextual-placement={activeState.contextualPlacement}
      data-shared-reading-settings-open={settingsOpen ? 'true' : 'false'}
    >
      {/* MOBILE (E2): Single-Row Concise Workspace Toolbar when closed */}
      {isCompactViewport ? (
        <div
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 min-h-[48px]"
          data-mobile-workspace-toolbar="true"
        >
          <button
            type="button"
            onClick={handleToggleReadingSettings}
            title={`${workspaceTitle || 'Workspace'} — ${mobileEffectiveViewSummary}`}
            aria-label={`Reading view: ${workspaceTitle || 'Workspace'}, ${mobileEffectiveViewSummary}. Tap to open Reading View settings.`}
            className={`min-w-0 flex-1 text-left rounded-lg px-1 py-0.5 -ml-1 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors ${SHARED_CONTROL_TOKENS.focusRing}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${workspaceAccentDot}`} />
              <span
                data-mobile-workspace-title="true"
                className="truncate text-xs font-bold leading-4 text-slate-900 dark:text-slate-50"
              >
                {workspaceTitle || (workspaceType === 'conversation' ? 'Conversation' : workspaceType === 'mixed' ? 'Mixed Workspace' : 'Workspace')}
              </span>
              {mobilePlayAction?.activeStatusLabel && (
                <span data-mobile-workspace-playback-status="true" className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold leading-none ${mobilePlayAction.activeToneClass}`}>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current" />
                  <span>{mobilePlayAction.activeStatusLabel}</span>
                </span>
              )}
            </div>
            <p
              data-mobile-workspace-view-summary="true"
              className="truncate text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400"
            >
              {mobileEffectiveViewSummary}
            </p>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {mobilePlayAction && (
              <button
                type="button"
                disabled={mobilePlayAction.disabled}
                onClick={mobilePlayAction.onPlay}
                data-mobile-workspace-play="true"
                aria-label={mobilePlayAction.stopsWorkspace ? 'Stop Workspace playback' : 'Play entire Workspace'}
                title={mobilePlayAction.stopsWorkspace ? 'Stop All' : 'Play All'}
                className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 disabled:opacity-35 transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                  mobilePlayAction.stopsWorkspace
                    ? (mobilePlayAction.activeToneClass || 'bg-blue-600 text-white')
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                }`}
              >
                {mobilePlayAction.stopsWorkspace
                  ? <Square aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
                  : <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />}
              </button>
            )}

            {typeof onOpenMobileData === 'function' && (
              <button
                type="button"
                onClick={() => {
                  closeSettings();
                  onOpenMobileData();
                }}
                data-mobile-workspace-data="true"
                aria-label="Open Workspace Data"
                title="Manage Workspaces & Data"
                className={`h-9 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
              >
                <Database aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300 shrink-0" />
                <span className="hidden min-[380px]:inline">Data</span>
              </button>
            )}

            <button
              ref={toggleBtnRef}
              type="button"
              aria-expanded={settingsOpen}
              aria-controls={settingsPanelId}
              onClick={handleToggleReadingSettings}
              data-shared-reading-settings-toggle="true"
              data-shared-appearance-toggle="true"
              title="Open Reading View & Settings"
              aria-label={settingsOpen ? 'Close Reading View settings' : 'Open Reading View settings'}
              className={`h-9 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                settingsOpen || hasSettingsCustomizations
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700'
              }`}
            >
              <SlidersHorizontal aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
              <span>View</span>
              {hasSettingsCustomizations && (
                <span
                  aria-label="Custom view active"
                  data-shared-appearance-dirty-dot={appearanceDirty ? 'true' : undefined}
                  className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-300 shrink-0"
                />
              )}
              <ChevronDown
                aria-hidden="true"
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${settingsOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* DESKTOP: Accepted 4G-A compact Workspace header strip + Reading-First Bar */}
          {workspaceHeaderSlot && (
            <div className={`border-b ${SHARED_SURFACE_TOKENS.dividerHairline}`}>
              {workspaceHeaderSlot}
            </div>
          )}

          <div className="px-2 py-1.5 sm:px-3 sm:py-2 space-y-1.5 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-1.5 sm:gap-2">
              {/* Reader Mode (Full | Card | Focus | Segment) */}
              <div className="flex items-center gap-1.5 min-w-0 w-full sm:w-auto">
                <span className="hidden xl:inline text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
                  {supportsFourModes ? SHARED_UI_TERMINOLOGY.readerMode : 'View'}
                </span>
                {supportsFourModes ? (
                  <div
                    role="group"
                    aria-label="Reader presentation mode (display only)"
                    className={`grid grid-cols-4 sm:inline-flex w-full sm:w-auto items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
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
                          className={`min-h-9 sm:min-h-8 px-1.5 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                            active
                              ? SHARED_CONTROL_TOKENS.segmentActivePrimary
                              : SHARED_CONTROL_TOKENS.segmentInactive
                          }`}
                        >
                          <Icon aria-hidden="true" className="hidden sm:inline-block w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    role="group"
                    aria-label="Reading view level (display only)"
                    className={`grid grid-cols-3 sm:inline-flex w-full sm:w-auto items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
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
                          className={`min-h-9 sm:min-h-8 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                            active
                              ? SHARED_CONTROL_TOKENS.segmentActivePrimary
                              : SHARED_CONTROL_TOKENS.segmentInactive
                          }`}
                        >
                          <Icon aria-hidden="true" className="hidden sm:inline-block w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Language + Focus Orientation (when Focus) + Reading Settings Trigger */}
              <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 min-w-0 flex-1">
                <div
                  role="group"
                  aria-label="Reading language and display order (display only)"
                  data-shared-reading-language-group="true"
                  className={`grid grid-cols-4 sm:inline-flex flex-1 sm:flex-initial items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
                >
                  {SHARED_READING_LANGUAGE_OPTIONS.map(option => {
                    const active = activeState.readingLanguage === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        aria-label={option.label}
                        onClick={() => handleSelectReadingLanguage(option.id)}
                        title={option.description}
                        data-shared-reading-language-option={option.id}
                        data-shared-card-layout-option={option.legacyLayoutId || undefined}
                        className={`min-h-9 sm:min-h-8 px-1 sm:px-2 py-1 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                          active
                            ? SHARED_CONTROL_TOKENS.segmentActiveNeutral
                            : SHARED_CONTROL_TOKENS.segmentInactive
                        }`}
                      >
                        <span className="sm:hidden">{option.shortLabel || option.label}</span>
                        <span className="hidden sm:inline">{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {showContextualFocusBar && (
                  <div
                    className="inline-flex items-center gap-1 shrink-0"
                    data-shared-part-layout-bar="true"
                    data-shared-focus-orientation-bar={supportsFourModes ? 'true' : undefined}
                  >
                    <div
                      role="group"
                      aria-label={supportsFourModes ? `Focus ${terms.lower} orientation (display only)` : `Part ${terms.lower} layout (display only)`}
                      className={`inline-flex items-center gap-0.5 ${SHARED_SURFACE_TOKENS.segmentedTrack}`}
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
                            className={`min-h-8 px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                              active
                                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-200/70 dark:ring-slate-600'
                                : SHARED_CONTROL_TOKENS.segmentInactive
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

                <button
                  ref={toggleBtnRef}
                  type="button"
                  aria-expanded={settingsOpen}
                  aria-controls={settingsPanelId}
                  onClick={handleToggleReadingSettings}
                  data-shared-reading-settings-toggle="true"
                  data-shared-appearance-toggle="true"
                  title="Open Reading Settings: Reading Style, Typography, Card Visibility, and Workspace Style"
                  className={`min-h-9 sm:min-h-8 px-2 sm:px-2.5 py-1 rounded-xl border text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors duration-150 motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                    settingsOpen || hasSettingsCustomizations
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/85 dark:bg-indigo-950/55 text-indigo-800 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
                >
                  <SlidersHorizontal aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                  <span>{SHARED_UI_TERMINOLOGY.readingSettings}</span>
                  <span className="hidden md:inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {activeStyleSummary}
                  </span>
                  {appearanceDirty && (
                    <span
                      aria-label="Custom typography active"
                      data-shared-appearance-dirty-dot="true"
                      className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-300 shrink-0"
                    />
                  )}
                  {!appearanceDirty && hasWorkspaceStyleOverride && (
                    <span
                      aria-label="Workspace style override active"
                      className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-300 shrink-0"
                    />
                  )}
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${settingsOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {rightSlot}
              </div>
            </div>

            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-left">{subtitle}</p>
            )}
          </div>
        </>
      )}

      {/* Visible return-to-playing banner when user manually diverges from playing Card */}
      {divergedBannerSlot && (
        <div className={`px-3 py-1.5 border-t ${SHARED_SURFACE_TOKENS.dividerHairline} bg-indigo-50/45 dark:bg-indigo-950/25 flex flex-wrap items-center justify-between gap-2`}>
          {divergedBannerSlot}
        </div>
      )}

      {/* Reading View / Settings Overlay (E3):
          - Closed: hidden inline container (0px height, excluded from AT/tab flow, preserves selector stability)
          - Open Desktop: clean inline disclosure panel with live reading preview underneath
          - Open Mobile: anchored directly below the Workspace toolbar over a dimmed backdrop, clearing the fixed Global Player */}
      {settingsOpen && isCompactViewport && typeof document !== 'undefined' ? (
        createPortal(
          <div
            className="fixed inset-0 z-[60]"
            data-shared-reading-settings-mobile-overlay="true"
          >
            <button
              type="button"
              aria-label="Close Reading Settings backdrop"
              tabIndex={-1}
              data-shared-reading-settings-backdrop="true"
              onClick={closeSettings}
              className="fixed inset-0 bg-slate-950/50 dark:bg-slate-950/70 backdrop-blur-[1px]"
            />
            <div
              ref={overlayPanelRef}
              tabIndex={-1}
              id={settingsPanelId}
              role="dialog"
              aria-modal="true"
              aria-label="Reading View and Settings"
              data-shared-reading-settings-panel="true"
              data-shared-reading-overlay-anchored="true"
              className={`fixed inset-x-2 z-[65] flex flex-col overflow-hidden outline-none ${SHARED_SURFACE_TOKENS.mobileSheet}`}
              style={{
                top: `${overlayTopPx}px`,
                maxHeight: `calc(100dvh - ${overlayTopPx}px - 108px - env(safe-area-inset-bottom, 0px))`
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-3">
                {readingSettingsBody}
              </div>
            </div>
          </div>,
          document.body
        )
      ) : (
        <div
          id={settingsPanelId}
          hidden={!settingsOpen}
          data-shared-reading-settings-panel="true"
          className={`px-3 py-2.5 border-t ${SHARED_SURFACE_TOKENS.dividerHairline} bg-slate-50/45 dark:bg-slate-900/60`}
        >
          {readingSettingsBody}
        </div>
      )}
    </div>
  );
};

export default SharedBilingualLayoutToolbar;
