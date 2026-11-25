export const TEXT_CARD_PRESENTATION_LEVELS = Object.freeze(['full', 'part', 'segment']);
export const TEXT_CARD_BILINGUAL_LAYOUTS = Object.freeze(['interlinear', 'separated', 'text-only', 'meaning-only']);
export const TEXT_CARD_PART_LAYOUTS = Object.freeze(['horizontal-focus', 'vertical-focus', 'vertical-list']);

export const TEXT_READING_LANGUAGE_MODES = Object.freeze(['en-only', 'id-only', 'en-id', 'id-en']);
export const TEXT_BILINGUAL_STYLES = Object.freeze(['separated', 'interlinear', 'contextual']);
export const TEXT_CONTEXTUAL_PLACEMENTS = Object.freeze(['above', 'below', 'inline']);

export const TEXT_APPEARANCE_PRIMARY_FONT_SIZES = Object.freeze(['sm', 'md', 'lg', 'xl']);
export const TEXT_APPEARANCE_SECONDARY_FONT_SIZES = Object.freeze(['xs', 'sm', 'md', 'lg']);
export const TEXT_APPEARANCE_FONT_FAMILIES = Object.freeze(['sans', 'serif', 'humanist']);
export const TEXT_APPEARANCE_LINE_HEIGHTS = Object.freeze(['compact', 'normal', 'relaxed', 'loose']);
export const TEXT_APPEARANCE_TRANSLATION_CONTRASTS = Object.freeze(['subtle', 'balanced', 'high']);
export const TEXT_APPEARANCE_TEXT_SPACINGS = Object.freeze(['compact', 'normal', 'relaxed']);

export const DEFAULT_TEXT_READER_APPEARANCE_STATE = Object.freeze({
  primaryFontSize: 'md',
  secondaryFontSize: 'sm',
  fontFamily: 'sans',
  lineHeight: 'relaxed',
  translationContrast: 'balanced',
  textSpacing: 'normal'
});
const TEXT_READER_APPEARANCE_KEYS = Object.freeze(Object.keys(DEFAULT_TEXT_READER_APPEARANCE_STATE));

export const DEFAULT_TEXT_CARD_PRESENTATION_STATE = Object.freeze({
  level: 'full',
  bilingualLayout: 'text-only',
  partLayout: 'vertical-list',
  readingLanguage: 'en-only',
  bilingualStyle: 'interlinear',
  contextualPlacement: 'below',
  appearance: DEFAULT_TEXT_READER_APPEARANCE_STATE
});

export const TEXT_READER_MODES = Object.freeze(['full', 'card', 'focus', 'segment']);
export const TEXT_FOCUS_ORIENTATIONS = Object.freeze(['vertical-focus', 'horizontal-focus']);
export const DEFAULT_TEXT_FOCUS_ORIENTATION = 'vertical-focus';

export const TEXT_WORKSPACE_STYLE_ALIGNMENTS = Object.freeze(['left', 'justify']);
export const TEXT_WORKSPACE_STYLE_SPEAKER_LAYOUTS = Object.freeze(['stacked', 'aligned', 'inline']);
export const DEFAULT_TEXT_WORKSPACE_STYLE_STATE = Object.freeze({
  textAlign: 'justify',
  paragraphIndent: true,
  speakerLayout: 'aligned',
  showAccents: true
});
const TEXT_WORKSPACE_STYLE_KEYS = Object.freeze(Object.keys(DEFAULT_TEXT_WORKSPACE_STYLE_STATE));

export const normalizeTextReaderAppearanceState = candidate => Object.freeze({
  primaryFontSize: TEXT_APPEARANCE_PRIMARY_FONT_SIZES.includes(candidate?.primaryFontSize)
    ? candidate.primaryFontSize
    : DEFAULT_TEXT_READER_APPEARANCE_STATE.primaryFontSize,
  secondaryFontSize: TEXT_APPEARANCE_SECONDARY_FONT_SIZES.includes(candidate?.secondaryFontSize)
    ? candidate.secondaryFontSize
    : DEFAULT_TEXT_READER_APPEARANCE_STATE.secondaryFontSize,
  fontFamily: TEXT_APPEARANCE_FONT_FAMILIES.includes(candidate?.fontFamily)
    ? candidate.fontFamily
    : DEFAULT_TEXT_READER_APPEARANCE_STATE.fontFamily,
  lineHeight: TEXT_APPEARANCE_LINE_HEIGHTS.includes(candidate?.lineHeight)
    ? candidate.lineHeight
    : DEFAULT_TEXT_READER_APPEARANCE_STATE.lineHeight,
  translationContrast: TEXT_APPEARANCE_TRANSLATION_CONTRASTS.includes(candidate?.translationContrast)
    ? candidate.translationContrast
    : DEFAULT_TEXT_READER_APPEARANCE_STATE.translationContrast,
  textSpacing: TEXT_APPEARANCE_TEXT_SPACINGS.includes(candidate?.textSpacing)
    ? candidate.textSpacing
    : DEFAULT_TEXT_READER_APPEARANCE_STATE.textSpacing
});

export const updateTextReaderAppearanceState = (current, patch) => {
  const base = normalizeTextReaderAppearanceState(current);
  const filteredPatch = Object.fromEntries(
    TEXT_READER_APPEARANCE_KEYS
      .filter(key => Object.hasOwn(patch || {}, key))
      .map(key => [key, patch[key]])
  );
  return normalizeTextReaderAppearanceState({ ...base, ...filteredPatch });
};

export const resetTextReaderAppearanceState = () => DEFAULT_TEXT_READER_APPEARANCE_STATE;

export const isTextReaderAppearanceDirty = candidate => {
  const normalized = normalizeTextReaderAppearanceState(candidate);
  return TEXT_READER_APPEARANCE_KEYS.some(key => normalized[key] !== DEFAULT_TEXT_READER_APPEARANCE_STATE[key]);
};

export const deriveLegacyBilingualLayout = (readingLanguage, bilingualStyle) => {
  if (readingLanguage === 'en-only') return 'text-only';
  if (readingLanguage === 'id-only') return 'meaning-only';
  if (bilingualStyle === 'separated') return 'separated';
  return 'interlinear';
};

const mapLegacyBilingualLayout = legacyLayout => {
  if (legacyLayout === 'text-only') {
    return { readingLanguage: 'en-only', bilingualStyle: DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualStyle };
  }
  if (legacyLayout === 'meaning-only') {
    return { readingLanguage: 'id-only', bilingualStyle: DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualStyle };
  }
  if (legacyLayout === 'separated') {
    return { readingLanguage: 'en-id', bilingualStyle: 'separated' };
  }
  if (legacyLayout === 'interlinear') {
    return { readingLanguage: 'en-id', bilingualStyle: 'interlinear' };
  }
  return null;
};

/**
 * View state only (display reading language, bilingual style, contextual placement,
 * reader view level/partLayout, and independent typography appearance).
 *
 * Backward compatibility:
 * - Truly fresh readers (no saved readingLanguage or bilingualLayout) default to EN Only.
 * - Existing saved preferences with legacy bilingualLayout ('interlinear' | 'separated' |
 *   'text-only' | 'meaning-only') map deterministically without overwriting the user's choice.
 */
export const normalizeTextCardPresentationState = candidate => {
  const hasExplicitReadingLanguage = TEXT_READING_LANGUAGE_MODES.includes(candidate?.readingLanguage);
  const hasExplicitBilingualStyle = TEXT_BILINGUAL_STYLES.includes(candidate?.bilingualStyle);
  const hasValidLegacyLayout = TEXT_CARD_BILINGUAL_LAYOUTS.includes(candidate?.bilingualLayout);
  const legacyMapped = !hasExplicitReadingLanguage && hasValidLegacyLayout
    ? mapLegacyBilingualLayout(candidate.bilingualLayout)
    : null;

  const readingLanguage = hasExplicitReadingLanguage
    ? candidate.readingLanguage
    : (legacyMapped ? legacyMapped.readingLanguage : DEFAULT_TEXT_CARD_PRESENTATION_STATE.readingLanguage);

  const bilingualStyle = hasExplicitBilingualStyle
    ? candidate.bilingualStyle
    : (legacyMapped
        ? legacyMapped.bilingualStyle
        : (candidate?.bilingualLayout === 'separated'
            ? 'separated'
            : DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualStyle));

  const contextualPlacement = TEXT_CONTEXTUAL_PLACEMENTS.includes(candidate?.contextualPlacement)
    ? candidate.contextualPlacement
    : DEFAULT_TEXT_CARD_PRESENTATION_STATE.contextualPlacement;

  const bilingualLayout = deriveLegacyBilingualLayout(readingLanguage, bilingualStyle);

  return Object.freeze({
    level: TEXT_CARD_PRESENTATION_LEVELS.includes(candidate?.level)
      ? candidate.level
      : DEFAULT_TEXT_CARD_PRESENTATION_STATE.level,
    bilingualLayout,
    partLayout: TEXT_CARD_PART_LAYOUTS.includes(candidate?.partLayout)
      ? candidate.partLayout
      : DEFAULT_TEXT_CARD_PRESENTATION_STATE.partLayout,
    readingLanguage,
    bilingualStyle,
    contextualPlacement,
    appearance: normalizeTextReaderAppearanceState(candidate?.appearance)
  });
};

export const updateTextCardPresentationState = (current, patch) => {
  const base = normalizeTextCardPresentationState(current);
  if (!patch || typeof patch !== 'object') return base;

  const next = {
    level: Object.hasOwn(patch, 'level') ? patch.level : base.level,
    partLayout: Object.hasOwn(patch, 'partLayout') ? patch.partLayout : base.partLayout,
    readingLanguage: base.readingLanguage,
    bilingualStyle: base.bilingualStyle,
    contextualPlacement: Object.hasOwn(patch, 'contextualPlacement')
      ? patch.contextualPlacement
      : base.contextualPlacement,
    appearance: Object.hasOwn(patch, 'appearance')
      ? updateTextReaderAppearanceState(base.appearance, patch.appearance)
      : base.appearance
  };

  const hasNewAxisPatch = Object.hasOwn(patch, 'readingLanguage') || Object.hasOwn(patch, 'bilingualStyle');
  if (hasNewAxisPatch) {
    if (Object.hasOwn(patch, 'readingLanguage')) next.readingLanguage = patch.readingLanguage;
    if (Object.hasOwn(patch, 'bilingualStyle')) next.bilingualStyle = patch.bilingualStyle;
  } else if (Object.hasOwn(patch, 'bilingualLayout') && TEXT_CARD_BILINGUAL_LAYOUTS.includes(patch.bilingualLayout)) {
    if (patch.bilingualLayout === 'text-only') {
      next.readingLanguage = 'en-only';
    } else if (patch.bilingualLayout === 'meaning-only') {
      next.readingLanguage = 'id-only';
    } else if (patch.bilingualLayout === 'separated') {
      next.readingLanguage = base.readingLanguage === 'id-en' ? 'id-en' : 'en-id';
      next.bilingualStyle = 'separated';
    } else if (patch.bilingualLayout === 'interlinear') {
      next.readingLanguage = base.readingLanguage === 'id-en' ? 'id-en' : 'en-id';
      next.bilingualStyle = 'interlinear';
    }
  }

  return normalizeTextCardPresentationState(next);
};

export const resetTextCardAppearanceInPresentationState = current => {
  const base = normalizeTextCardPresentationState(current);
  return normalizeTextCardPresentationState({
    ...base,
    appearance: DEFAULT_TEXT_READER_APPEARANCE_STATE
  });
};

/**
 * Resolves effective bilingual rendering rules for the active Reader Mode WITHOUT
 * mutating or overwriting the user's saved bilingualStyle preference.
 *
 * Capability contract (Master Contract v1.2 §4, 4C1 §3):
 * - Full / Card / Focus: Separated, Sentence Interlinear, Contextual (Above/Below/Inline)
 * - Segment: primary-only reading context + optional Sentence Interlinear above one Study Box;
 *   Separated and Contextual are unavailable and fall back cleanly to primary-only context
 *   while preserving the saved preference for return to Full/Card/Focus.
 */
export const resolveEffectiveBilingualPresentation = ({
  readerMode = null,
  view = null
} = {}) => {
  const normalized = normalizeTextCardPresentationState(view);
  const effectiveMode = TEXT_READER_MODES.includes(readerMode)
    ? readerMode
    : (normalized.level === 'segment' ? 'segment' : 'card');
  const isSegmentMode = effectiveMode === 'segment';

  const readingLanguage = normalized.readingLanguage;
  const savedBilingualStyle = normalized.bilingualStyle;
  const contextualPlacement = normalized.contextualPlacement;
  const isBilingual = readingLanguage === 'en-id' || readingLanguage === 'id-en';
  const primaryChannel = readingLanguage === 'id-only' || readingLanguage === 'id-en' ? 'meaning' : 'text';
  const secondaryChannel = primaryChannel === 'text' ? 'meaning' : 'text';

  const allowedBilingualStyles = isSegmentMode
    ? Object.freeze(['interlinear'])
    : TEXT_BILINGUAL_STYLES;
  const unavailableBilingualStyles = isSegmentMode
    ? Object.freeze(['separated', 'contextual'])
    : Object.freeze([]);

  let effectiveRenderMode = 'single';
  let effectiveBilingualStyle = null;
  let fallbackActive = false;
  let fallbackReason = null;

  if (isBilingual) {
    if (isSegmentMode) {
      if (savedBilingualStyle === 'interlinear') {
        effectiveRenderMode = 'interlinear';
        effectiveBilingualStyle = 'interlinear';
      } else {
        effectiveRenderMode = 'single';
        effectiveBilingualStyle = null;
        fallbackActive = true;
        fallbackReason = savedBilingualStyle === 'contextual'
          ? 'contextual-represented-by-study-box'
          : 'separated-unavailable-in-segment';
      }
    } else {
      effectiveRenderMode = savedBilingualStyle;
      effectiveBilingualStyle = savedBilingualStyle;
    }
  }

  return Object.freeze({
    readerMode: effectiveMode,
    isSegmentMode,
    readingLanguage,
    isBilingual,
    primaryChannel,
    secondaryChannel,
    savedBilingualStyle,
    effectiveBilingualStyle,
    effectiveRenderMode,
    contextualPlacement,
    isContextualActive: effectiveRenderMode === 'contextual',
    allowedBilingualStyles,
    unavailableBilingualStyles,
    fallbackActive,
    fallbackReason,
    appearance: normalized.appearance
  });
};

/**
 * Deterministically resolves the 4-mode Reader surface ('full' | 'card' | 'focus' | 'segment')
 * and Focus orientation ('vertical-focus' | 'horizontal-focus') from saved/runtime
 * readerMode + view ({ level, partLayout }) without migrating content data.
 *
 * Historical compatibility mapping:
 * - level: 'part', partLayout: 'vertical-list'    -> mode: 'card' (effectiveLevel: 'full')
 * - level: 'part', partLayout: 'vertical-focus'   -> mode: 'focus', focusOrientation: 'vertical-focus'
 * - level: 'part', partLayout: 'horizontal-focus' -> mode: 'focus', focusOrientation: 'horizontal-focus'
 * - level: 'segment'                              -> mode: 'segment'
 * - level: 'full', readerMode: 'card'             -> mode: 'card'
 * - level: 'full', readerMode: 'full' (or unset)  -> mode: 'full'
 */
export const resolveTextReaderModeFromState = ({
  readerMode = null,
  view = null,
  supportsFourModes = true
} = {}) => {
  const normalizedView = normalizeTextCardPresentationState(view);
  const focusOrientation = normalizedView.partLayout === 'horizontal-focus'
    ? 'horizontal-focus'
    : DEFAULT_TEXT_FOCUS_ORIENTATION;

  if (!supportsFourModes) {
    return Object.freeze({
      mode: normalizedView.level === 'part'
        ? (normalizedView.partLayout === 'vertical-list' ? 'card' : 'focus')
        : normalizedView.level === 'segment'
          ? 'segment'
          : 'card',
      effectiveLevel: normalizedView.level,
      effectivePartLayout: normalizedView.partLayout,
      focusOrientation,
      mappedFromLegacyPart: false
    });
  }

  if (normalizedView.level === 'segment') {
    return Object.freeze({
      mode: 'segment',
      effectiveLevel: 'segment',
      effectivePartLayout: normalizedView.partLayout,
      focusOrientation,
      mappedFromLegacyPart: false
    });
  }

  if (normalizedView.level === 'part') {
    if (normalizedView.partLayout === 'vertical-list') {
      return Object.freeze({
        mode: 'card',
        effectiveLevel: 'full',
        effectivePartLayout: 'vertical-list',
        focusOrientation,
        mappedFromLegacyPart: true
      });
    }
    return Object.freeze({
      mode: 'focus',
      effectiveLevel: 'part',
      effectivePartLayout: focusOrientation,
      focusOrientation,
      mappedFromLegacyPart: readerMode !== 'focus'
    });
  }

  if (readerMode === 'focus') {
    return Object.freeze({
      mode: 'focus',
      effectiveLevel: 'part',
      effectivePartLayout: focusOrientation,
      focusOrientation,
      mappedFromLegacyPart: false
    });
  }

  if (readerMode === 'segment') {
    return Object.freeze({
      mode: 'segment',
      effectiveLevel: 'segment',
      effectivePartLayout: normalizedView.partLayout,
      focusOrientation,
      mappedFromLegacyPart: false
    });
  }

  if (readerMode === 'card') {
    return Object.freeze({
      mode: 'card',
      effectiveLevel: 'full',
      effectivePartLayout: normalizedView.partLayout,
      focusOrientation,
      mappedFromLegacyPart: false
    });
  }

  return Object.freeze({
    mode: 'full',
    effectiveLevel: 'full',
    effectivePartLayout: normalizedView.partLayout,
    focusOrientation,
    mappedFromLegacyPart: false
  });
};

const resolveWorkspaceStyleDefaults = defaults => {
  if (!defaults || defaults === DEFAULT_TEXT_WORKSPACE_STYLE_STATE) {
    return DEFAULT_TEXT_WORKSPACE_STYLE_STATE;
  }
  return Object.freeze({
    textAlign: TEXT_WORKSPACE_STYLE_ALIGNMENTS.includes(defaults.textAlign)
      ? defaults.textAlign
      : DEFAULT_TEXT_WORKSPACE_STYLE_STATE.textAlign,
    paragraphIndent: typeof defaults.paragraphIndent === 'boolean'
      ? defaults.paragraphIndent
      : DEFAULT_TEXT_WORKSPACE_STYLE_STATE.paragraphIndent,
    speakerLayout: TEXT_WORKSPACE_STYLE_SPEAKER_LAYOUTS.includes(defaults.speakerLayout)
      ? defaults.speakerLayout
      : DEFAULT_TEXT_WORKSPACE_STYLE_STATE.speakerLayout,
    showAccents: typeof defaults.showAccents === 'boolean'
      ? defaults.showAccents
      : DEFAULT_TEXT_WORKSPACE_STYLE_STATE.showAccents
  });
};

/**
 * Shared Workspace Style view state only. Applies across Paragraph and Conversation
 * reading bodies in all Reader modes without touching content data or audio state.
 */
export const normalizeTextWorkspaceStyleState = (candidate, defaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE) => {
  const base = resolveWorkspaceStyleDefaults(defaults);
  return Object.freeze({
    textAlign: TEXT_WORKSPACE_STYLE_ALIGNMENTS.includes(candidate?.textAlign)
      ? candidate.textAlign
      : base.textAlign,
    paragraphIndent: typeof candidate?.paragraphIndent === 'boolean'
      ? candidate.paragraphIndent
      : base.paragraphIndent,
    speakerLayout: TEXT_WORKSPACE_STYLE_SPEAKER_LAYOUTS.includes(candidate?.speakerLayout)
      ? candidate.speakerLayout
      : base.speakerLayout,
    showAccents: typeof candidate?.showAccents === 'boolean'
      ? candidate.showAccents
      : base.showAccents
  });
};

/**
 * Extracts only valid overridden Workspace Style keys for future per-Workspace overrides,
 * allowing unset keys to continue inheriting Shared Reader defaults.
 */
export const normalizeTextWorkspaceStyleOverride = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return Object.freeze({});
  }
  const override = {};
  if (TEXT_WORKSPACE_STYLE_ALIGNMENTS.includes(candidate.textAlign)) {
    override.textAlign = candidate.textAlign;
  }
  if (typeof candidate.paragraphIndent === 'boolean') {
    override.paragraphIndent = candidate.paragraphIndent;
  }
  if (TEXT_WORKSPACE_STYLE_SPEAKER_LAYOUTS.includes(candidate.speakerLayout)) {
    override.speakerLayout = candidate.speakerLayout;
  }
  if (typeof candidate.showAccents === 'boolean') {
    override.showAccents = candidate.showAccents;
  }
  return Object.freeze(override);
};

export const resolveEffectiveTextWorkspaceStyle = ({
  sharedStyle = null,
  workspaceOverride = null,
  defaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE
} = {}) => {
  const base = normalizeTextWorkspaceStyleState(sharedStyle, defaults);
  const override = normalizeTextWorkspaceStyleOverride(workspaceOverride);
  return normalizeTextWorkspaceStyleState({ ...base, ...override }, base);
};

export const updateTextWorkspaceStyleState = (current, patch, defaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE) => {
  const base = normalizeTextWorkspaceStyleState(current, defaults);
  const filteredPatch = Object.fromEntries(
    TEXT_WORKSPACE_STYLE_KEYS
      .filter(key => Object.hasOwn(patch || {}, key))
      .map(key => [key, patch[key]])
  );
  return normalizeTextWorkspaceStyleState({ ...base, ...filteredPatch }, defaults);
};

export const resetTextWorkspaceStyleState = (defaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE) => (
  normalizeTextWorkspaceStyleState(defaults)
);

export const isTextWorkspaceStyleDirty = (current, effectiveDefaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE) => {
  const normalizedCurrent = normalizeTextWorkspaceStyleState(current, effectiveDefaults);
  const normalizedDefaults = normalizeTextWorkspaceStyleState(effectiveDefaults);
  return TEXT_WORKSPACE_STYLE_KEYS.some(key => normalizedCurrent[key] !== normalizedDefaults[key]);
};
