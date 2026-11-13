import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { UNSUPPORTED_EDGE_VOICE_IDS } from '../src/constants/voiceConstants.js';

const KNOWN_UNSUPPORTED_VOICE_SET = new Set(UNSUPPORTED_EDGE_VOICE_IDS);
const VALIDATION_ERROR_MESSAGES = new Set([
  'Text is required',
  'Text is too long',
  'Voice is invalid',
  'Rate is invalid',
  'Pitch is invalid'
]);
const UPSTREAM_VOICES_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedUpstreamShortNames = null;
let cachedUpstreamLoadedAt = 0;
let upstreamVoicesPromise = null;

export const getCachedEdgeVoiceShortNames = async () => {
  const now = Date.now();
  if (cachedUpstreamShortNames && now - cachedUpstreamLoadedAt < UPSTREAM_VOICES_CACHE_TTL_MS) {
    return cachedUpstreamShortNames;
  }
  if (!upstreamVoicesPromise) {
    upstreamVoicesPromise = (async () => {
      try {
        const tts = new MsEdgeTTS();
        const voices = await Promise.race([
          tts.getVoices(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Upstream voice lookup timed out')), 4000))
        ]);
        if (!Array.isArray(voices) || !voices.length) return null;
        const shortNames = new Set(
          voices
            .map(entry => String(entry?.ShortName || entry?.shortName || '').trim())
            .filter(Boolean)
        );
        if (!shortNames.size) return null;
        cachedUpstreamShortNames = shortNames;
        cachedUpstreamLoadedAt = Date.now();
        return shortNames;
      } catch {
        return null;
      } finally {
        upstreamVoicesPromise = null;
      }
    })();
  }
  return upstreamVoicesPromise;
};

export const classifyEdgeTtsError = async ({
  error,
  voice = '',
  hadAudioBytes = false,
  fetchUpstreamVoices = getCachedEdgeVoiceShortNames
} = {}) => {
  const rawMessage = String(error?.message || error || 'Edge TTS synthesis failed').trim();
  const cleanVoice = String(voice || '').trim();

  if (VALIDATION_ERROR_MESSAGES.has(rawMessage)) {
    return {
      statusCode: 400,
      code: 'EDGE_INVALID_REQUEST',
      voice: cleanVoice || null,
      error: 'Invalid Edge TTS request',
      details: rawMessage,
      retryable: false
    };
  }

  if (!hadAudioBytes && cleanVoice) {
    const looksLikeClosedOrEmpty = /stream closed|no turn\.end|empty audio|likely truncated|unsupported|not found/i.test(rawMessage);
    let isUnsupported = KNOWN_UNSUPPORTED_VOICE_SET.has(cleanVoice);
    if (!isUnsupported && looksLikeClosedOrEmpty && typeof fetchUpstreamVoices === 'function') {
      const upstreamShortNames = await fetchUpstreamVoices();
      if (upstreamShortNames instanceof Set && upstreamShortNames.size > 0 && !upstreamShortNames.has(cleanVoice)) {
        isUnsupported = true;
      }
    }
    if (isUnsupported) {
      return {
        statusCode: 422,
        code: 'EDGE_VOICE_UNSUPPORTED',
        voice: cleanVoice,
        error: 'Unsupported Edge TTS voice',
        details: `Edge TTS voice "${cleanVoice}" is not supported or has been retired by Microsoft Edge TTS. Please choose another Edge voice (no silent substitution was performed).`,
        retryable: false
      };
    }
  }

  return {
    statusCode: 500,
    code: 'EDGE_TTS_UPSTREAM_ERROR',
    voice: cleanVoice || null,
    error: 'Failed to generate audio',
    details: rawMessage || 'Failed to generate Edge TTS audio',
    retryable: true
  };
};

const collectAudioStream = (audioStream) => new Promise((resolve, reject) => {
  const chunks = [];
  audioStream.on('data', chunk => chunks.push(Buffer.from(chunk)));
  audioStream.on('end', () => resolve(Buffer.concat(chunks)));
  audioStream.on('error', error => {
    if (error && typeof error === 'object') {
      error.hadAudioBytes = chunks.some(chunk => chunk.length > 0);
    }
    reject(error);
  });
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
  const cleanVoice = String(options?.voice || 'en-GB-LibbyNeural').trim();
  try {
    const audioStream = await createEdgeTtsStream(options);
    const audio = await collectAudioStream(audioStream);
    if (!audio.length) throw new Error('Edge TTS returned empty audio');
    return audio;
  } catch (error) {
    const classified = await classifyEdgeTtsError({
      error,
      voice: cleanVoice,
      hadAudioBytes: Boolean(error?.hadAudioBytes)
    });
    const annotated = new Error(classified.details);
    annotated.statusCode = classified.statusCode;
    annotated.code = classified.code;
    annotated.voice = classified.voice;
    annotated.errorTitle = classified.error;
    annotated.retryable = classified.retryable;
    throw annotated;
  }
};
