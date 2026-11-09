// ProLingo AI Voice v0.2 — dedicated experimental Web Worker.
// Do not import this worker from App.jsx or the P9 player.
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let loader = null;
let kokoro = null;
let loadedProfile = null;
const PROFILES = Object.freeze({
  'wasm-q8': { device: 'wasm', dtype: 'q8' },
  'webgpu-fp32': { device: 'webgpu', dtype: 'fp32' }
});
const cancelled = new Set();

const notify = (message, transfer = []) => self.postMessage(message, transfer);
const toError = error => error instanceof Error ? error.message : String(error);

async function loadModel(id, profile = 'wasm-q8') {
  const selected = PROFILES[profile];
  if (!selected) throw new Error('Profil Kokoro tidak tersedia.');
  if (loader && loadedProfile !== profile) {
    throw new Error('Model lain sedang dimuat. Ganti profil melalui tombol pilihan di lab.');
  }
  if (!loader) {
    loadedProfile = profile;
    loader = (async () => {
      if (selected.device === 'webgpu') {
        const gpu = self.navigator?.gpu;
        const gpuAdapter = gpu && await gpu.requestAdapter().catch(() => null);
        if (!gpuAdapter) throw new Error('WebGPU adapter tidak tersedia di worker/browser ini. Pilih WASM Q8.');
      }
      kokoro = await import('kokoro-js');
      tts = await kokoro.KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: selected.dtype,
        device: selected.device,
        progress_callback: detail => notify({ type: 'progress', id, detail })
      });
      return tts;
    })().catch(error => {
      loader = null;
      tts = null;
      loadedProfile = null;
      throw error;
    });
  }
  await loader;
}

function emitAudio(id, text, rawAudio, generationMs) {
  if (cancelled.has(id)) return;
  const samples = Float32Array.from(rawAudio.audio);
  notify({
    type: 'chunk',
    id,
    text,
    samples,
    sampleRate: rawAudio.sampling_rate,
    generationMs: Math.round(generationMs),
    durationMs: Math.round(samples.length / rawAudio.sampling_rate * 1000)
  }, [samples.buffer]);
}

async function processMessage(message) {
  const { type, id, text = '', voiceId = 'bf_emma', profile = 'wasm-q8' } = message;
  try {
    if (type === 'load') {
      await loadModel(id, profile);
      notify({ type: 'ready', id, profile });
      return;
    }
    if (type !== 'generate' && type !== 'stream') return;
    await loadModel(id, profile);
    if (cancelled.has(id)) return;
    const generationStart = performance.now();
    let lastChunkAt = generationStart;

    if (type === 'generate') {
      const audio = await tts.generate(text, { voice: voiceId });
      const now = performance.now();
      emitAudio(id, text, audio, now - lastChunkAt);
      lastChunkAt = now;
    } else {
      // A plain string can leave kokoro-js 1.2.1 awaiting more text forever.
      // A closed splitter makes the last segment and final completion deterministic.
      const splitter = new kokoro.TextSplitterStream();
      splitter.push(text);
      splitter.close();
      for await (const segment of tts.stream(splitter, { voice: voiceId })) {
        if (cancelled.has(id)) break;
        const now = performance.now();
        emitAudio(id, segment.text, segment.audio, now - lastChunkAt);
        lastChunkAt = now;
      }
    }
    if (!cancelled.has(id)) notify({ type: 'done', id, totalGenerationMs: Math.round(performance.now() - generationStart) });
  } catch (error) {
    if (!cancelled.has(id)) notify({ type: 'error', id, message: toError(error) });
  } finally {
    cancelled.delete(id);
  }
}

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type === 'cancel') {
    cancelled.add(message.id);
    return;
  }
  void processMessage(message);
});
