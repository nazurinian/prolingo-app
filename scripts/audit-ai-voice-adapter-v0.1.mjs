// Run: node scripts/audit-ai-voice-adapter-v0.1.mjs
// No network, model download or changes to the live P9 player.
import assert from 'node:assert/strict';
import { createVoiceEngineRegistry, VOICE_OUTPUT } from '../src/services/audio/voiceEngines/voiceEngineRegistry.js';
import { createLegacyBrowserVoiceAdapter } from '../src/services/audio/voiceEngines/browserVoiceAdapter.js';

const events = [];
const voice = { name: 'Libby', lang: 'en-GB' };
const browser = createLegacyBrowserVoiceAdapter({
  playTTS: async (text, target) => events.push({ text, target }),
  getVoices: () => [voice],
  isSupported: () => true
});

const registry = createVoiceEngineRegistry();
registry.register(browser);
assert.equal(registry.resolve('browser'), browser);
assert.equal(registry.resolve('kokoro'), browser, 'Missing AI engine must fall back to browser.');
assert.equal(registry.resolve('kokoro', { allowFallback: false }), null);
assert.equal(registry.list()[0].capabilities.rawAudio, false);
assert.equal(registry.list()[0].available, true);
assert.equal(browser.getVoices()[0], voice);
await browser.play({ text: 'Good morning!', voice });
assert.deepEqual(events, [{ text: 'Good morning!', target: voice }]);
await browser.play({ text: '  ' });
assert.equal(events.length, 1, 'Empty requests must not invoke legacy speech.');
assert.throws(() => registry.register(browser), /already registered/);

let ready = false;
const ai = {
  id: 'kokoro',
  label: 'Kokoro (mock)',
  output: VOICE_OUTPUT.STREAM,
  capabilities: { offline: true, streamingChunks: true },
  isAvailable: () => ready,
  async *stream({ text }) { yield { text, audio: new Float32Array([0, 0.2]), sampleRate: 24000 }; }
};
registry.register(ai);
assert.equal(registry.resolve('kokoro'), browser, 'Unavailable AI must not take over.');
ready = true;
assert.equal(registry.resolve('kokoro'), ai);
const parts = [];
for await (const part of ai.stream({ text: 'Hello!' })) parts.push(part);
assert.equal(parts[0].text, 'Hello!');
assert.equal(parts[0].sampleRate, 24000);
assert.equal(registry.list().find(x => x.id === 'kokoro').available, true);
assert.equal(registry.unregister('kokoro'), true);
assert.equal(registry.resolve('kokoro'), browser);

assert.throws(() => registry.register({
  id: 'broken', label: 'Broken', output: VOICE_OUTPUT.STREAM
}), /stream/);
assert.equal(createVoiceEngineRegistry().resolve('browser'), null);
console.log('PASS: AI Voice registry, browser bridge, fallback, streaming contract and no-op safety.');
