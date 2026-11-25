export const TEXT_CARD_PRESENTATION_LEVELS = Object.freeze(['full', 'part', 'segment']);
export const TEXT_CARD_BILINGUAL_LAYOUTS = Object.freeze(['interlinear', 'separated', 'text-only', 'meaning-only']);
export const TEXT_CARD_PART_LAYOUTS = Object.freeze(['horizontal-focus', 'vertical-focus', 'vertical-list']);
export const DEFAULT_TEXT_CARD_PRESENTATION_STATE = Object.freeze({ level: 'full', bilingualLayout: 'interlinear', partLayout: 'vertical-list' });

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
