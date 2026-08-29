import { getAudioFilenameIdentity, getItemPartText, getStableAudioIdentity, isIndonesianAudioPart, sanitizeFilename } from '../../utils/audioUtils';

export const resolveAudioGenerationPreparation = ({
  item,
  part,
  mode,
  generatorEngine,
  edgeIndonesianVoice,
  edgeVoice,
  aiVoiceName
}) => {
  let textToSpeak = "";
  const voiceLabel = generatorEngine === 'edge'
    ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
    : aiVoiceName;
  const safeVoice = sanitizeFilename(voiceLabel || 'Voice');
  const stableId = getStableAudioIdentity(item);
  const filenameIdentity = getAudioFilenameIdentity(item);
  let filename = "";

  if (mode === 'table') {
    const safeWord = sanitizeFilename(item.word);
    textToSpeak = getItemPartText(item, part);
    filename = `${filenameIdentity}_${safeWord}_${safeVoice}_${sanitizeFilename(part)}.wav`;
  } else {
    textToSpeak = item.text;
    filename = `${stableId}_${safeVoice}_text.wav`;
  }

  return { textToSpeak, filename, stableId };
};

export const resolveTtsGenerationProvider = (generatorEngine) =>
  generatorEngine === 'edge' ? 'edge' : 'gemini';

export const resolveEdgeHealthCheckRequest = (edgeVoice) => ({
  url: '/api/tts',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: {
    text: 'Edge TTS health check.',
    voice: edgeVoice,
    rate: '+0%',
    pitch: '+0Hz'
  }
});

export const resolveEdgeTtsRequestState = ({
  part,
  textToSpeak,
  edgeRate,
  edgePitch,
  edgeIndonesianVoice,
  edgeVoice
}) => {
  const rateStr = edgeRate >= 0 ? `+${edgeRate}%` : `${edgeRate}%`;
  const pitchStr = edgePitch >= 0 ? `+${edgePitch}Hz` : `${edgePitch}Hz`;
  const activeVoiceId = isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice;

  return {
    url: '/api/tts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      text: textToSpeak,
      voice: activeVoiceId,
      rate: rateStr,
      pitch: pitchStr
    }
  };
};

export const resolveGeminiTtsApiKey = (apiKey, userApiKey) => apiKey || userApiKey;

export const resolveGeminiTtsRequestState = ({ textToSpeak, aiVoiceName, keyToUse }) => {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${keyToUse}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      contents: [{ parts: [{ text: textToSpeak }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: aiVoiceName } } } }
    }
  };
};
