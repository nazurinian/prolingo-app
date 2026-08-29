export const resolveBrowserTtsVoiceState = (allVoices) => {
  if (allVoices.length === 0) return null;

  // Filter and Sort English Voices: UK > US > AU > SG > Others
  let engVoices = allVoices.filter(v => v.lang.startsWith('en'));
  engVoices.sort((a, b) => {
      const getPriority = (lang) => {
          if (lang.includes('GB') || lang.includes('UK')) return 1;
          if (lang.includes('US')) return 2;
          if (lang.includes('AU')) return 3;
          if (lang.includes('SG')) return 4;
          return 5;
      };
      return getPriority(a.lang) - getPriority(b.lang);
  });

  // Default English Voice Logic
  const defaultEng = engVoices[0]; // First item (UK preferred)

  // Filter and Sort Indonesian Voices
  let idVoices = allVoices.filter(v => v.lang.includes('ID') || v.lang.includes('id') || v.lang.toLowerCase().includes('indones'));
  const defaultId = idVoices.find(v => v.name.includes('Google') || v.name.includes('Indonesia')) || idVoices[0];

  return { engVoices, defaultEng, idVoices, defaultId };
};
