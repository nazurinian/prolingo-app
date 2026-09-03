import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const collectAudioStream = (audioStream) => new Promise((resolve, reject) => {
  const chunks = [];
  audioStream.on('data', chunk => chunks.push(Buffer.from(chunk)));
  audioStream.on('end', () => resolve(Buffer.concat(chunks)));
  audioStream.on('error', reject);
});

export const createEdgeTtsStream = async ({
  text,
  voice = 'en-GB-LibbyNeural',
  rate = '+0%',
  pitch = '+0Hz'
} = {}) => {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('Text is required');
  if (cleanText.length > 20000) throw new Error('Text is too long');
  const cleanVoice = String(voice || 'en-GB-LibbyNeural').trim();
  const cleanRate = String(rate || '+0%').trim();
  const cleanPitch = String(pitch || '+0Hz').trim();
  if (!/^[A-Za-z0-9-]{2,100}$/.test(cleanVoice)) throw new Error('Voice is invalid');
  if (!/^[+-]?\d{1,3}%$/.test(cleanRate)) throw new Error('Rate is invalid');
  if (!/^[+-]?\d{1,4}Hz$/.test(cleanPitch)) throw new Error('Pitch is invalid');

  const tts = new MsEdgeTTS();
  await tts.setMetadata(cleanVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(cleanText, { rate: cleanRate, pitch: cleanPitch });
  return audioStream;
};

export const synthesizeEdgeTtsBuffer = async (options = {}) => {
  const audioStream = await createEdgeTtsStream(options);
  const audio = await collectAudioStream(audioStream);
  if (!audio.length) throw new Error('Edge TTS returned empty audio');
  return audio;
};
