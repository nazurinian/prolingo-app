import {
  DEFAULT_TEXT_CONTENT,
  normalizeTextIdentityState
} from '../../domain/text/textIdentityDomain';

export const TEXT_IDENTITY_STORAGE_KEY = 'prolingo_text_identity_v1';

export const loadTextIdentityState = (fallbackContent = DEFAULT_TEXT_CONTENT) => {
  if (typeof localStorage === 'undefined') {
    return normalizeTextIdentityState(null, fallbackContent);
  }
  try {
    const raw = localStorage.getItem(TEXT_IDENTITY_STORAGE_KEY);
    if (!raw) return normalizeTextIdentityState(null, fallbackContent);
    return normalizeTextIdentityState(JSON.parse(raw), fallbackContent);
  } catch (error) {
    console.warn('Text identity restore failed; using safe fallback.', error);
    return normalizeTextIdentityState(null, fallbackContent);
  }
};

export const executeTextIdentityPersistenceEffect = ({ textIdentityState }) => {
  if (typeof localStorage === 'undefined') return undefined;
  const timer = window.setTimeout(() => {
    try {
      localStorage.setItem(TEXT_IDENTITY_STORAGE_KEY, JSON.stringify(textIdentityState));
    } catch (error) {
      console.warn('Text identity persistence failed.', error);
    }
  }, 250);
  return () => window.clearTimeout(timer);
};
