import { defaultAudioProviderGateway } from './audioProviderGatewayService.js';

const clean = value => String(value ?? '').trim();

export const executeTextStructuredAudioGenerationRequest = async ({
  engine = 'edge',
  providerId = null,
  text,
  engineVoiceId,
  edgeRate = 0,
  edgePitch = 0,
  signal,
  onRetry = null
}) => {
  const content = clean(text);
  if (!content) throw new Error('Structured Text generation requires non-empty content.');
  const voiceId = clean(engineVoiceId);
  if (!voiceId) throw new Error('Structured Text generation requires a voice.');
  if (String(engine || '').trim().toLowerCase() === 'gemini') {
    throw new Error('P4-A12.1 Text generation is Edge-only. Gemini remains frozen for a later provider patch.');
  }
  return defaultAudioProviderGateway.synthesizeBlob({
    providerId: providerId || engine,
    engine,
    text: content,
    voiceId,
    rate: edgeRate,
    pitch: edgePitch,
    signal,
    onRetry
  });
};
