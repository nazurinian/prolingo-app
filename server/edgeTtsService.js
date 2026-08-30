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

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(cleanText, { rate, pitch });
  return audioStream;
};

export const synthesizeEdgeTtsBuffer = async (options = {}) => {
  const audioStream = await createEdgeTtsStream(options);
  const audio = await collectAudioStream(audioStream);
  if (!audio.length) throw new Error('Edge TTS returned empty audio');
  return audio;
};
