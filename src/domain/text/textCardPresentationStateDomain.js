export const TEXT_CARD_PRESENTATION_LEVELS = Object.freeze(['full', 'part', 'segment']);
export const TEXT_CARD_BILINGUAL_LAYOUTS = Object.freeze(['interlinear', 'separated', 'text-only', 'meaning-only']);
export const TEXT_CARD_PART_LAYOUTS = Object.freeze(['horizontal-focus', 'vertical-focus', 'vertical-list']);
export const DEFAULT_TEXT_CARD_PRESENTATION_STATE = Object.freeze({ level: 'full', bilingualLayout: 'interlinear', partLayout: 'vertical-list' });

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
