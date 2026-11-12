const cleanName = value => String(value ?? '').trim();

export const resolveTextStructuredBrowserVoice = (voices, preferredName = null) => {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;
  const preferred = cleanName(preferredName);
  if (preferred) {
    const exact = list.find(voice => cleanName(voice?.name) === preferred);
    if (exact) return exact;
  }
  return list[0] || null;
};

// Existing saved selections always win. Prefer Sonia / Gadis only when unset
// and present in the browser's reported SpeechSynthesis voice list.
const findNamedBrowserVoice = (voices, name) => (Array.isArray(voices) ? voices : [])
  .find(voice => new RegExp('(^|[^a-z])' + name + '([^a-z]|$)', 'i').test(cleanName(voice?.name))) || null;

export const resolveTextStructuredBrowserVoiceState = ({
  englishVoices,
  indonesianVoices,
  preferences
}) => ({
  textVoice: resolveTextStructuredBrowserVoice(
    englishVoices,
    preferences?.browserTextVoiceName || findNamedBrowserVoice(englishVoices, 'Sonia')?.name
  ),
  meaningVoice: resolveTextStructuredBrowserVoice(
    indonesianVoices,
    preferences?.browserMeaningVoiceName || findNamedBrowserVoice(indonesianVoices, 'Gadis')?.name
  )
});

export const resolveTextStructuredVoicePreferencePatch = ({ channel, voice }) => {
  const name = cleanName(voice?.name) || null;
  if (channel === 'meaning') return { browserMeaningVoiceName: name };
  return { browserTextVoiceName: name };
};
