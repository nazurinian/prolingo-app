import { normalizeTextCardPresentationState } from '../../domain/text/textCardPresentationStateDomain.js';

// Separate from both the historical Shared QA view preference and audio settings.
export const TEXT_MAIN_READER_PREFERENCE_KEY = 'prolingo_text_main_reader_v1';
export const normalizeTextMainReaderPreference = candidate => ({
  version: 1,
  reader: candidate?.version === 1 && candidate.reader === 'shared' ? 'shared' : 'legacy',
  view: normalizeTextCardPresentationState(candidate?.version === 1 ? candidate.view : null)
});

export const loadTextMainReaderPreference = () => {
  try {
    return normalizeTextMainReaderPreference(JSON.parse(window.localStorage.getItem(TEXT_MAIN_READER_PREFERENCE_KEY)));
  } catch {
    return normalizeTextMainReaderPreference();
  }
};

export const saveTextMainReaderPreference = candidate => {
  const normalized = normalizeTextMainReaderPreference(candidate);
  try {
    window.localStorage.setItem(TEXT_MAIN_READER_PREFERENCE_KEY, JSON.stringify(normalized));
  } catch { /* Optional view preferences must never block reading. */ }
  return normalized;
};
