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

export const resolveTextStructuredBrowserVoiceState = ({
  englishVoices,
  indonesianVoices,
  preferences
}) => ({
  textVoice: resolveTextStructuredBrowserVoice(englishVoices, preferences?.browserTextVoiceName),
  meaningVoice: resolveTextStructuredBrowserVoice(indonesianVoices, preferences?.browserMeaningVoiceName)
});

export const resolveTextStructuredVoicePreferencePatch = ({ channel, voice }) => {
  const name = cleanName(voice?.name) || null;
  if (channel === 'meaning') return { browserMeaningVoiceName: name };
  return { browserTextVoiceName: name };
};
