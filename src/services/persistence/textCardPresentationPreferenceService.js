import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState
} from '../../domain/text/textCardPresentationStateDomain.js';

export const TEXT_CARD_PRESENTATION_PREFERENCE_STORAGE_KEY = 'prolingo_text_card_presentation_v1';

/**
 * Loads view-only presentation preferences cleanly from localStorage.
 * Completely independent from Structured Text audio preferences and IndexedDB.
 */
export const loadTextCardPresentationPreferences = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_TEXT_CARD_PRESENTATION_STATE;
    }
    const raw = window.localStorage.getItem(TEXT_CARD_PRESENTATION_PREFERENCE_STORAGE_KEY);
    return normalizeTextCardPresentationState(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_TEXT_CARD_PRESENTATION_STATE;
  }
};

/**
 * Persists only normalized view-only presentation choices to localStorage.
 */
export const saveTextCardPresentationPreferences = candidate => {
  const normalized = normalizeTextCardPresentationState(candidate);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        TEXT_CARD_PRESENTATION_PREFERENCE_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    }
  } catch (error) {
    console.warn('Unable to persist shared card presentation preferences:', error);
  }
  return normalized;
};

/**
 * Resets only view-only presentation preferences without affecting audio settings.
 */
export const resetTextCardPresentationPreferences = () => (
  saveTextCardPresentationPreferences(DEFAULT_TEXT_CARD_PRESENTATION_STATE)
);
