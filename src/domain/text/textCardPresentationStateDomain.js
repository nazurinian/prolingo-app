export const TEXT_CARD_PRESENTATION_LEVELS = Object.freeze(['full', 'part', 'segment']);
export const TEXT_CARD_BILINGUAL_LAYOUTS = Object.freeze(['interlinear', 'separated', 'text-only', 'meaning-only']);
export const TEXT_CARD_PART_LAYOUTS = Object.freeze(['horizontal-focus', 'vertical-focus', 'vertical-list']);
export const DEFAULT_TEXT_CARD_PRESENTATION_STATE = Object.freeze({ level: 'full', bilingualLayout: 'interlinear', partLayout: 'vertical-list' });

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

/** View state only. No translation of old display/audio/expansion preferences. */
export const normalizeTextCardPresentationState = candidate => Object.freeze({
  level: TEXT_CARD_PRESENTATION_LEVELS.includes(candidate?.level) ? candidate.level : DEFAULT_TEXT_CARD_PRESENTATION_STATE.level,
  bilingualLayout: TEXT_CARD_BILINGUAL_LAYOUTS.includes(candidate?.bilingualLayout) ? candidate.bilingualLayout : DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  partLayout: TEXT_CARD_PART_LAYOUTS.includes(candidate?.partLayout) ? candidate.partLayout : DEFAULT_TEXT_CARD_PRESENTATION_STATE.partLayout
});

export const updateTextCardPresentationState = (current, patch) => normalizeTextCardPresentationState({
  ...normalizeTextCardPresentationState(current),
  ...Object.fromEntries(Object.keys(DEFAULT_TEXT_CARD_PRESENTATION_STATE).filter(key => Object.hasOwn(patch || {}, key)).map(key => [key, patch[key]]))
});

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
