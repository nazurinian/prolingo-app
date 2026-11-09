// ProLingo AI Voice v0.2 — dedicated experimental Web Worker.
// Do not import this worker from App.jsx or the P9 player.
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let loader = null;
let kokoro = null;
const cancelled = new Set();

const notify = (message, transfer = []) => self.postMessage(message, transfer);
const toError = error => error instanceof Error ? error.message : String(error);

async function loadModel(id) {
  if (!loader) {
    loader = (async () => {
      kokoro = await import('kokoro-js');
      tts = await kokoro.KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: detail => notify({ type: 'progress', id, detail })
      });
      return tts;
    })().catch(error => {
      loader = null;
      tts = null;
      throw error;
    });
  }
  await loader;
}

function emitAudio(id, text, rawAudio) {
  if (cancelled.has(id)) return;
  const samples = Float32Array.from(rawAudio.audio);
  notify({
    type: 'chunk',
    id,
    text,
    samples,
    sampleRate: rawAudio.sampling_rate
  }, [samples.buffer]);
}

async function processMessage(message) {
  const { type, id, text = '', voiceId = 'bf_emma' } = message;
  try {
    if (type === 'load') {
      await loadModel(id);
      notify({ type: 'ready', id });
      return;
    }
    if (type !== 'generate' && type !== 'stream') return;
    await loadModel(id);
    if (cancelled.has(id)) return;

    if (type === 'generate') {
      const audio = await tts.generate(text, { voice: voiceId });
      emitAudio(id, text, audio);
    } else {
      // A plain string can leave kokoro-js 1.2.1 awaiting more text forever.
      // A closed splitter makes the last segment and final completion deterministic.
      const splitter = new kokoro.TextSplitterStream();
      splitter.push(text);
      splitter.close();
      for await (const segment of tts.stream(splitter, { voice: voiceId })) {
        if (cancelled.has(id)) break;
        emitAudio(id, segment.text, segment.audio);
      }
    }
    if (!cancelled.has(id)) notify({ type: 'done', id });
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
