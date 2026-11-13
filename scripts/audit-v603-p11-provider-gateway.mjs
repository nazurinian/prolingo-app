import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIO_PROVIDER_CAPABILITIES,
  AUDIO_PROVIDER_ERROR_CODES,
  AUDIO_PROVIDER_FAMILIES,
  AUDIO_PROVIDER_IDS,
  AUDIO_PROVIDER_OPERATIONS,
  canProviderPlayLiveUtterance,
  canProviderSynthesizeBlob,
  getAudioProviderCapability,
  listAudioProviderCapabilities,
  normalizeAudioProviderId,
  resolveAudioProviderGatewayRoute,
  validateAudioProviderOperation
} from '../src/domain/audio/audioProviderGatewayDomain.js';
import {
  AudioProviderCapabilityError,
  createAudioProviderGatewayRegistry,
  defaultAudioProviderGateway,
  executeGatewayBlobSynthesis,
  getAudioProviderGatewayAdapter
} from '../src/services/audio/audioProviderGatewayService.js';
import { executeTextStructuredAudioGenerationRequest } from '../src/services/audio/textStructuredAudioGenerationService.js';
import {
  TEXT_AUDIO_CODEC_PROFILE,
  TEXT_AUDIO_RENDERER_PROFILE_VERSION
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

const results = [];
const run = async (name, fn) => {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS: ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error });
    console.error(`FAIL: ${name}`);
    console.error(error?.stack || error);
  }
};

await run('1. Provider capability registry separates Browser TTS, Edge TTS & reserved Local AI (Kokoro/Piper)', () => {
  const all = listAudioProviderCapabilities();
  assert.equal(all.length, 4);
  const activeOnly = listAudioProviderCapabilities({ includeReserved: false });
  assert.deepEqual(activeOnly.map(c => c.id), [AUDIO_PROVIDER_IDS.BROWSER_TTS, AUDIO_PROVIDER_IDS.EDGE_TTS]);

  const browserCap = getAudioProviderCapability('browser');
  assert.equal(browserCap.id, AUDIO_PROVIDER_IDS.BROWSER_TTS);
  assert.equal(browserCap.supportsLivePlayback, true);
  assert.equal(browserCap.supportsBlobSynthesis, false);
  assert.equal(browserCap.supportsOfflineDownload, false);
  assert.equal(browserCap.supportsStagingPersistence, false);
  assert.equal(browserCap.renderProfile, null);
  assert.equal(canProviderPlayLiveUtterance('browser-tts'), true);
  assert.equal(canProviderSynthesizeBlob('browser-tts'), false);

  const edgeCap = getAudioProviderCapability('edge');
  assert.equal(edgeCap.id, AUDIO_PROVIDER_IDS.EDGE_TTS);
  assert.equal(edgeCap.supportsLivePlayback, false);
  assert.equal(edgeCap.supportsBlobSynthesis, true);
  assert.equal(edgeCap.supportsOfflineDownload, true);
  assert.equal(edgeCap.supportsStagingPersistence, true);
  assert.equal(edgeCap.supportsHealthCheck, true);
  assert.equal(edgeCap.endpoint, '/api/tts');
  assert.equal(edgeCap.renderProfile.rendererVersion, TEXT_AUDIO_RENDERER_PROFILE_VERSION);
  assert.equal(edgeCap.renderProfile.codecProfile, TEXT_AUDIO_CODEC_PROFILE);
  assert.equal(canProviderSynthesizeBlob('edge'), true);

  for (const [id, expectedEngine] of [[AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO, 'kokoro'], [AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER, 'piper']]) {
    const cap = AUDIO_PROVIDER_CAPABILITIES[id];
    assert.equal(cap.family, AUDIO_PROVIDER_FAMILIES.LOCAL_AI);
    assert.equal(cap.reserved, true);
    assert.equal(cap.implemented, false);
    assert.equal(cap.active, false);
    assert.equal(cap.supportsBlobSynthesis, false);
    assert.equal(cap.futureRenderProfileNamespace.engine, expectedEngine);
    assert.notEqual(cap.futureRenderProfileNamespace.rendererVersion, TEXT_AUDIO_RENDERER_PROFILE_VERSION);
    assert.equal(canProviderSynthesizeBlob(id), false);
    assert.equal(canProviderPlayLiveUtterance(id), false);
  }

  assert.equal(normalizeAudioProviderId('gemini'), null);
  assert.equal(normalizeAudioProviderId('kokoro'), AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO);
  assert.equal(normalizeAudioProviderId('piper'), AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER);
});

await run('2. Fail-closed capability validation & routing never enforce universal Blob on Browser TTS or execute stubs', () => {
  const browserBlob = validateAudioProviderOperation({
    providerId: 'browser-tts',
    operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS
  });
  assert.equal(browserBlob.allowed, false);
  assert.equal(browserBlob.code, AUDIO_PROVIDER_ERROR_CODES.PROVIDER_PLAYBACK_ONLY);

  const browserDownload = validateAudioProviderOperation({
    providerId: 'browser-tts',
    operation: AUDIO_PROVIDER_OPERATIONS.OFFLINE_DOWNLOAD
  });
  assert.equal(browserDownload.allowed, false);
  assert.equal(browserDownload.code, AUDIO_PROVIDER_ERROR_CODES.PROVIDER_PLAYBACK_ONLY);

  const browserNoSpeech = validateAudioProviderOperation({
    providerId: 'browser-tts',
    operation: AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK,
    runtimeSupport: { speechSynthesisSupported: false }
  });
  assert.equal(browserNoSpeech.allowed, false);
  assert.equal(browserNoSpeech.code, AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RUNTIME_UNSUPPORTED);

  const edgeLive = validateAudioProviderOperation({
    providerId: 'edge',
    operation: AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK
  });
  assert.equal(edgeLive.allowed, false);
  assert.equal(edgeLive.code, AUDIO_PROVIDER_ERROR_CODES.PROVIDER_BLOB_SYNTHESIS_ONLY);

  for (const reservedId of ['kokoro', 'piper']) {
    const res = validateAudioProviderOperation({
      providerId: reservedId,
      operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS
    });
    assert.equal(res.allowed, false);
    assert.equal(res.code, AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RESERVED_NOT_IMPLEMENTED);
  }

  const strictUnknown = resolveAudioProviderGatewayRoute({ engine: 'gemini', operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS });
  assert.equal(strictUnknown.allowed, false);
  assert.equal(strictUnknown.code, AUDIO_PROVIDER_ERROR_CODES.UNKNOWN_PROVIDER);
});

await run('3. Gateway service enforces capabilities, preserves /api/tts Edge contract & supports live Browser TTS + custom adapter extension', async () => {
  assert.equal(getAudioProviderGatewayAdapter('edge').id, AUDIO_PROVIDER_IDS.EDGE_TTS);
  assert.equal((await defaultAudioProviderGateway.checkAvailability('edge')).available, true);
  assert.equal((await defaultAudioProviderGateway.checkAvailability('kokoro')).reserved, true);
  assert.equal((await defaultAudioProviderGateway.checkAvailability('kokoro')).available, false);
  assert.equal((await defaultAudioProviderGateway.checkAvailability('piper')).available, false);

  await assert.rejects(
    () => executeGatewayBlobSynthesis({ providerId: 'browser-tts', text: 'Hello', voiceId: 'Google UK English Female' }),
    err => err instanceof AudioProviderCapabilityError && err.code === AUDIO_PROVIDER_ERROR_CODES.PROVIDER_PLAYBACK_ONLY
  );

  await assert.rejects(
    () => executeGatewayBlobSynthesis({ providerId: 'local-ai-kokoro', text: 'Hello', voiceId: 'af_heart' }),
    err => err instanceof AudioProviderCapabilityError && err.code === AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RESERVED_NOT_IMPLEMENTED
  );

  await assert.rejects(
    () => defaultAudioProviderGateway.speak({ providerId: 'local-ai-piper', text: 'Hello' }),
    err => err instanceof AudioProviderCapabilityError && err.code === AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RESERVED_NOT_IMPLEMENTED
  );

  // Mock fetch to verify executeTextStructuredAudioGenerationRequest preserves /api/tts contract via gateway
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(new Blob([new Uint8Array([0x49, 0x44, 0x33, 0x05])], { type: 'audio/mpeg' }), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  };

  try {
    const generated = await executeTextStructuredAudioGenerationRequest({
      engine: 'edge',
      text: 'Gateway Edge test.',
      engineVoiceId: 'en-GB-SoniaNeural',
      edgeRate: 10,
      edgePitch: -5
    });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, '/api/tts');
    assert.deepEqual(fetchCalls[0].body, {
      text: 'Gateway Edge test.',
      voice: 'en-GB-SoniaNeural',
      rate: '+10%',
      pitch: '-5Hz'
    });
    assert.equal(generated.engine, 'edge');
    assert.equal(generated.engineVoiceId, 'en-GB-SoniaNeural');
    assert.equal(generated.providerId, AUDIO_PROVIDER_IDS.EDGE_TTS);
    assert.equal(generated.renderProfile.rendererVersion, TEXT_AUDIO_RENDERER_PROFILE_VERSION);
    assert.equal(generated.blob.size, 4);

    // Gemini remains cleanly isolated without accidental Edge substitution
    await assert.rejects(
      () => executeTextStructuredAudioGenerationRequest({
        engine: 'gemini',
        text: 'Hello',
        engineVoiceId: 'Kore'
      }),
      /Edge-only/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Verify custom adapter injection works for future P15 without touching callers
  const customGateway = createAudioProviderGatewayRegistry({
    customAdapters: {
      'local-ai-kokoro': {
        id: 'local-ai-kokoro',
        async checkAvailability() { return { available: true, reserved: false, implemented: true }; },
        async synthesizeBlob({ text, voiceId }) {
          return { blob: new Blob([text]), engine: 'kokoro', engineVoiceId: voiceId, contentType: 'audio/wav', providerId: 'local-ai-kokoro' };
        }
      }
    }
  });
  const customRes = await customGateway.synthesizeBlob({ providerId: 'kokoro', text: 'Future local AI', voiceId: 'af_bella' });
  assert.equal(customRes.providerId, 'local-ai-kokoro');
  assert.equal(customRes.engine, 'kokoro');

  // Verify live Browser TTS utterance execution via gateway with mocked SpeechSynthesisUtterance
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const spoken = [];
  class MockUtterance {
    constructor(text) { this.text = text; this.rate = 1; this.pitch = 1; }
  }
  globalThis.SpeechSynthesisUtterance = MockUtterance;
  try {
    const mockSynth = {
      paused: false,
      cancel: () => {},
      speak: utterance => {
        spoken.push(utterance.text);
        queueMicrotask(() => utterance.onend?.());
      }
    };
    const avail = await defaultAudioProviderGateway.checkAvailability('browser-tts', { synth: mockSynth, Utterance: MockUtterance });
    assert.equal(avail.available, true);
    await defaultAudioProviderGateway.speak({
      providerId: 'browser-tts',
      textToRead: 'Browser TTS live path',
      synth: mockSynth,
      Utterance: MockUtterance,
      selectedVoiceRef: { current: null },
      stopSignalRef: { current: false },
      pauseStateRef: { current: false },
      currentUtteranceRef: { current: null },
      ttsReplayRef: { current: null },
      playbackResolveRef: { current: null },
      rateRef: { current: 1 },
      rate: 1,
      pitch: 1
    });
    assert.deepEqual(spoken, ['Browser TTS live path']);
  } finally {
    globalThis.SpeechSynthesisUtterance = originalUtterance;
  }
});

await run('4. P11 architecture readiness introduces zero Kokoro/Piper model/worker/WebGPU/WASM dependencies & keeps Table/Legacy/RF isolated', () => {
  const gatewayDomain = read('src/domain/audio/audioProviderGatewayDomain.js');
  const gatewayService = read('src/services/audio/audioProviderGatewayService.js');
  const combined = `${gatewayDomain}\n${gatewayService}`.toLowerCase();
  assert.ok(!combined.includes('new worker('));
  assert.ok(!combined.includes('onnx'));
  assert.ok(!combined.includes('navigator.gpu'));
  assert.ok(!combined.includes('huggingface'));
  assert.ok(!combined.includes('.wasm'));
  assert.ok(!combined.includes('table_local_audio'));
  assert.ok(!combined.includes('pronunciation_decks'));

  const tableRequestDomain = read('src/domain/audio/ttsRequestProviderDomain.js');
  assert.ok(tableRequestDomain.includes('/api/gemini-tts'), 'Table/legacy Gemini route must remain untouched');
  assert.ok(tableRequestDomain.includes('/api/tts'), 'Table/legacy Edge route must remain untouched');
});

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`P11_SUMMARY: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
