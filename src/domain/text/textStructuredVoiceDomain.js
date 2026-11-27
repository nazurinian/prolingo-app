import { resolveDefaultEnglishBrowserVoice, resolveDefaultIndonesianBrowserVoice } from '../audio/browserTtsVoiceDecisionDomain.js';

const cleanName = value => String(value ?? '').trim();

export const resolveTextStructuredBrowserVoice = (voices, preferredName = null, fallback = null) => {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;
  const preferred = cleanName(preferredName);
  if (preferred) {
    const exact = list.find(voice => cleanName(voice?.name) === preferred);
    if (exact) return exact;
  }
  return fallback || list[0] || null;
};

export const resolveTextStructuredBrowserVoiceState = ({
  englishVoices,
  indonesianVoices,
  preferences,
  browser
}) => ({
  textVoice: resolveTextStructuredBrowserVoice(englishVoices, preferences?.browserTextVoiceName,
    resolveDefaultEnglishBrowserVoice(englishVoices, browser)),
  meaningVoice: resolveTextStructuredBrowserVoice(indonesianVoices, preferences?.browserMeaningVoiceName,
    resolveDefaultIndonesianBrowserVoice(indonesianVoices, browser))
});

export const resolveTextStructuredVoicePreferencePatch = ({ channel, voice }) => {
  const name = cleanName(voice?.name) || null;
  if (channel === 'meaning') return { browserMeaningVoiceName: name };
  return { browserTextVoiceName: name };
};
