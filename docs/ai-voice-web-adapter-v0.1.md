# ProLingo AI Voice — Web adapter checkpoint v0.1

Branch: `feature/ai-voice`. Base: `v6-beta` snapshot. This checkpoint is **additive only**.

## Current scope

1. `voiceEngineRegistry.js`: register/unregister/query and resolve an engine; fallback to an available Browser TTS adapter.
2. `browserVoiceAdapter.js`: wraps the **existing** ProLingo `playTTS(text, voice)` callback without replacing its playback, pause/resume, replay, MediaSession or P9 ownership.
3. `scripts/audit-ai-voice-adapter-v0.1.mjs`: offline contract test, including a mock chunk-streaming AI engine.
4. **No changes to App.jsx, old audio services, package.json, v6-beta or main.** No Kokoro/Piper model is downloaded, and no AI controls are visible yet.

## API and intended use (future integration, not wired into the UI yet)

```js
const registry = createVoiceEngineRegistry({ fallbackId: 'browser' });
registry.register(createLegacyBrowserVoiceAdapter({
  playTTS, // existing callback in App.jsx
  getVoices: () => voices,
  isSupported: () => typeof window !== 'undefined' && 'speechSynthesis' in window
}));
const engine = registry.resolve('kokoro'); // browser fallback until Kokoro is installed
if (engine?.output === 'direct-playback') await engine.play({ text, voice: targetVoice });
```

The future Kokoro/Piper adapter uses `output: 'audio-chunks'` and `stream({text, voiceId, signal})`, returning an **AsyncIterable** of chunks. Each chunk should contain `audio` (PCM), `sampleRate`, and `text` (chunk-local text); the *future playback queue* will convert and schedule those chunks. A chunk source is not itself a player.

Do not route existing P9 audio through the registry before P9 acceptance. This checkpoint intentionally does **not** change the global player.

## Test

```powershell
node scripts/audit-ai-voice-adapter-v0.1.mjs
```

## Separate development (Windows, Git worktrees)

From the existing **Beta checkout**:

```powershell
git fetch origin
git worktree add -b feature/ai-voice ..\prolingo-ai origin/feature/ai-voice
code ..\prolingo-ai
```

If the local branch `feature/ai-voice` already exists, omit `-b ... origin/...` and run `git worktree add ..\prolingo-ai feature/ai-voice`. Each worktree is a separate folder and can be open in a different VS Code window. Run different dev ports (e.g. Beta 5173 / AI 5174).

## Next milestones (AI chat only)

- Benchmark Kokoro Web WASM/WebGPU voice quality, latency, CPU/RAM and offline model cache.
- Implement Kokoro adapter and streaming PCM playback queue behind an explicit experiment flag.
- Add Piper and Kitten only after their runtime, voice, size, performance and licensing pass review.
- Wait for P9 baseline acceptance, then sync Beta into feature, resolve conflicts, test and propose PR.
- Capacitor/Android TTS/native file storage belongs to a **later phase**, not this Web adapter checkpoint.
