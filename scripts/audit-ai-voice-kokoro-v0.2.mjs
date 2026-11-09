// AI Voice v0.2 contract tests. No TTS download and no browser required.
// Run: node scripts/audit-ai-voice-kokoro-v0.2.mjs
import assert from 'node:assert/strict';
import {
  createAsyncChunkQueue,
  createKokoroWebAdapter,
  KOKORO_BRITISH_VOICES,
  validateKokoroLabText
} from '../src/services/audio/voiceEngines/kokoroWebAdapter.js';

assert.equal(validateKokoroLabText(' Good morning. '), 'Good morning.');
assert.throws(() => validateKokoroLabText('  '), /Masukkan teks/);
assert.throws(() => validateKokoroLabText('x'.repeat(451)), /450 karakter/);
assert.ok(KOKORO_BRITISH_VOICES.some(voice => voice.id === 'bf_emma'));

const queue = createAsyncChunkQueue();
const yielded = [];
const waiting = (async () => {
  for await (const chunk of queue) yielded.push(chunk);
})();
queue.push(1);
queue.push(2);
queue.finish();
await waiting;
assert.deepEqual(yielded, [1, 2]);

const sent = [];
const mockWorker = {
  onmessage: null,
  onerror: null,
  postMessage(payload) {
    sent.push(payload);
    queueMicrotask(() => {
      if (payload.type === 'probe-webgpu') this.onmessage({ data: {
        type: 'probe', id: payload.id, detail: { supported: true, reason: 'mock adapter', shaderF16: false, maxBufferMB: 128 }
      } });
      if (payload.type === 'load') this.onmessage({ data: { type: 'ready', id: payload.id } });
      if (payload.type === 'generate' || payload.type === 'stream') {
        this.onmessage({
          data: {
            type: 'chunk', id: payload.id,
            text: 'Hello!', samples: new Float32Array([0, 0.1, 0]),
            sampleRate: 24000
          }
        });
        this.onmessage({ data: { type: 'done', id: payload.id } });
      }
    });
  },
  terminate() {}
};
const kokoro = createKokoroWebAdapter({ workerFactory: () => mockWorker });
const gpuProbe = await kokoro.probeWebGPU();
assert.equal(gpuProbe.supported, true);
assert.equal(gpuProbe.maxBufferMB, 128);
await kokoro.load();
assert.equal(kokoro.isLoaded(), true);
let result = [];
for await (const chunk of kokoro.stream({ text: 'Hello!', voiceId: 'bf_emma' })) result.push(chunk);
assert.equal(result.length, 1);
assert.ok(result[0].samples instanceof Float32Array);
assert.equal(result[0].sampleRate, 24000);
result = [];
for await (const chunk of kokoro.stream({ text: 'Hello!', mode: 'generate' })) result.push(chunk);
assert.equal(result.length, 1);
assert.equal(sent.filter(item => item.type === 'load').length, 1);
await assert.rejects(async () => {
  for await (const _ of kokoro.stream({ text: 'Hello!', voiceId: 'not-real' })) { /* no-op */ }
}, /tidak dikenal/);
kokoro.dispose();
console.log('PASS: Kokoro lab text, asynchronous queue, worker load, generate and streaming contracts.');
