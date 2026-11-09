// ProLingo AI Voice v0.2 — Web Kokoro adapter with an isolated worker.
// Never route the established P9 player through this experimental engine yet.
import { VOICE_OUTPUT } from './voiceEngineRegistry.js';

export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const KOKORO_BRITISH_VOICES = Object.freeze([
  { id: 'bf_emma', name: 'Emma', locale: 'en-GB' },
  { id: 'bf_isabella', name: 'Isabella', locale: 'en-GB' },
  { id: 'bf_alice', name: 'Alice', locale: 'en-GB' },
  { id: 'bf_lily', name: 'Lily', locale: 'en-GB' },
  { id: 'bm_george', name: 'George', locale: 'en-GB' },
  { id: 'bm_lewis', name: 'Lewis', locale: 'en-GB' },
  { id: 'bm_daniel', name: 'Daniel', locale: 'en-GB' },
  { id: 'bm_fable', name: 'Fable', locale: 'en-GB' }
]);
export const KOKORO_MAX_LAB_TEXT = 450;
export const KOKORO_LAB_PROFILES = Object.freeze([
  { id: 'wasm-q8', label: 'WASM / CPU · Q8 (~92 MB)', device: 'wasm', dtype: 'q8' },
  { id: 'webgpu-fp32', label: 'WebGPU / GPU · FP32 (~326 MB)', device: 'webgpu', dtype: 'fp32' }
]);

export function validateKokoroLabText(text) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new Error('Masukkan teks untuk dibacakan.');
  if (clean.length > KOKORO_MAX_LAB_TEXT) {
    throw new Error('Demo dibatasi hingga 450 karakter agar memori dan antrean audio tetap terkendali.');
  }
  return clean;
}

export function createAsyncChunkQueue() {
  const chunks = [];
  const waiters = [];
  let finished = false;
  let failure = null;
  return {
    push(value) {
      if (finished) return;
      const waiter = waiters.shift();
      if (waiter) waiter.resolve({ value, done: false });
      else chunks.push(value);
    },
    finish(error = null) {
      if (finished) return;
      finished = true;
      failure = error;
      while (waiters.length) {
        const waiter = waiters.shift();
        if (failure) waiter.reject(failure);
        else waiter.resolve({ done: true, value: undefined });
      }
    },
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (chunks.length) return { value: chunks.shift(), done: false };
          if (finished) {
            if (failure) throw failure;
            return { done: true, value: undefined };
          }
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        }
      };
    }
  };
}

const makeError = data => new Error(data?.message || 'Kokoro worker gagal.');
const aborted = () => {
  const error = new Error('Audio dihentikan.');
  error.name = 'AbortError';
  return error;
};

export function createKokoroWebAdapter({
  profile = 'wasm-q8',
  workerFactory = () => new Worker(new URL('./kokoroVoice.worker.js', import.meta.url), { type: 'module' })
} = {}) {
  if (!KOKORO_LAB_PROFILES.some(item => item.id === profile)) {
    throw new TypeError('Profil Kokoro tidak dikenal.');
  }
  let worker = null;
  let ready = false;
  let loading = null;
  let serial = 0;
  let activeStreamId = null;
  let lastGenerationMs = null;
  const requests = new Map();

  const rejectAll = error => {
    for (const request of requests.values()) {
      if (request.kind === 'load' || request.kind === 'probe') request.reject(error);
      else request.queue.finish(error);
    }
    requests.clear();
    activeStreamId = null;
    ready = false;
    loading = null;
  };

  const ensureWorker = () => {
    if (worker) return worker;
    worker = workerFactory();
    worker.onmessage = event => {
      const data = event.data || {};
      const request = requests.get(data.id);
      if (!request) return; // Older/cancelled session; ignore late messages.
      if (data.type === 'progress') {
        request.onProgress?.(data.detail);
      } else if (data.type === 'probe' && request.kind === 'probe') {
        requests.delete(data.id);
        request.resolve(data.detail);
      } else if (data.type === 'ready' && request.kind === 'load') {
        requests.delete(data.id);
        ready = true;
        request.resolve();
      } else if (data.type === 'chunk' && request.kind === 'stream') {
        request.queue.push({
          text: data.text,
          samples: data.samples,
          sampleRate: data.sampleRate,
          generationMs: data.generationMs,
          durationMs: data.durationMs
        });
      } else if (data.type === 'done' && request.kind === 'stream') {
        lastGenerationMs = data.totalGenerationMs ?? null;
        requests.delete(data.id);
        request.queue.finish();
      } else if (data.type === 'error') {
        requests.delete(data.id);
        const error = makeError(data);
        if (request.kind === 'load' || request.kind === 'probe') request.reject(error);
        else request.queue.finish(error);
      }
    };
    worker.onerror = event => rejectAll(new Error(event?.message || 'Kokoro Worker tidak dapat dijalankan.'));
    return worker;
  };

  // Performs WebGPU capability check without fetching any model or voice files.
  const probeWebGPU = () => {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      requests.set(id, { kind: 'probe', resolve, reject });
      try {
        ensureWorker().postMessage({ type: 'probe-webgpu', id });
      } catch (error) {
        requests.delete(id);
        reject(error);
      }
    });
  };

  const load = ({ onProgress } = {}) => {
    if (ready) return Promise.resolve();
    if (loading) return loading;
    const id = ++serial;
    loading = new Promise((resolve, reject) => {
      requests.set(id, { kind: 'load', resolve, reject, onProgress });
      try {
        ensureWorker().postMessage({ type: 'load', id, profile });
      } catch (error) {
        requests.delete(id);
        reject(error);
      }
    }).finally(() => { loading = null; });
    return loading;
  };

  const cancel = () => {
    if (activeStreamId === null) return;
    const id = activeStreamId;
    const request = requests.get(id);
    requests.delete(id);
    activeStreamId = null;
    request?.queue.finish();
    worker?.postMessage({ type: 'cancel', id });
  };

  const stream = async function* ({ text, voiceId = 'bf_emma', mode = 'stream', signal } = {}) {
    const content = validateKokoroLabText(text);
    if (!KOKORO_BRITISH_VOICES.some(voice => voice.id === voiceId)) {
      throw new Error('Voice Kokoro tidak dikenal.');
    }
    if (mode !== 'stream' && mode !== 'generate') throw new Error('Mode TTS tidak dikenal.');
    if (activeStreamId !== null) throw new Error('Satu sesi audio harus selesai sebelum sesi baru.');
    if (signal?.aborted) throw aborted();
    await load();
    if (signal?.aborted) throw aborted();
    if (activeStreamId !== null) throw new Error('Engine sedang digunakan.');

    const id = ++serial;
    const queue = createAsyncChunkQueue();
    const stop = () => {
      if (requests.has(id)) {
        requests.delete(id);
        worker?.postMessage({ type: 'cancel', id });
        queue.finish();
      }
    };
    activeStreamId = id;
    requests.set(id, { kind: 'stream', queue });
    lastGenerationMs = null;
    signal?.addEventListener('abort', stop, { once: true });
    try {
      ensureWorker().postMessage({ type: mode, id, text: content, voiceId, profile });
      for await (const chunk of queue) {
        if (signal?.aborted) break;
        yield chunk;
      }
    } finally {
      stop();
      signal?.removeEventListener('abort', stop);
      if (activeStreamId === id) activeStreamId = null;
    }
  };

  const dispose = () => {
    rejectAll(new Error('Kokoro adapter dibongkar.'));
    worker?.terminate();
    worker = null;
  };

  return Object.freeze({
    id: 'kokoro',
    label: 'Kokoro Local AI (Web Lab)',
    profile,
    output: VOICE_OUTPUT.STREAM,
    capabilities: Object.freeze({
      offline: 'after-model-and-runtime-cached',
      rawAudio: true,
      streamingChunks: true,
      voiceSelection: true,
      rate: false,
      pitch: false,
      experimental: true
    }),
    isAvailable: () => typeof Worker !== 'undefined',
    getVoices: () => KOKORO_BRITISH_VOICES,
    probeWebGPU,
    load,
    stream,
    cancel,
    dispose,
    isLoaded: () => ready,
    getTotalGenerationMs: () => lastGenerationMs
  });
}
