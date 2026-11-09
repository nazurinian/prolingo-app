# ProLingo AI Voice v0.2 — isolated Kokoro Web lab

Branch: `feature/ai-voice`. **Scope: experiment only.** Nothing is wired to the stable/ongoing P9 player.

## Files

- `ai-voice-lab.html` — separate Vite entry; open `http://localhost:5174/ai-voice-lab.html`.
- `src/ai-voice-lab/main.jsx` — voice selector, load button, generate/stream comparison, telemetry and stop.
- `src/ai-voice-lab/style.css` — mobile-friendly lab styling.
- `src/ai-voice-lab/pcmLabPlayer.js` — Web Audio PCM scheduler **for lab only**.
- `src/services/audio/voiceEngines/kokoroWebAdapter.js` — adapter and async chunk queue.
- `src/services/audio/voiceEngines/kokoroVoice.worker.js` — model initialization and inference off the UI thread.
- `scripts/audit-ai-voice-kokoro-v0.2.mjs` — deterministic mock test requiring no model download.

## Install and test

The source uses a *dynamic import* of Kokoro. The dependency is not added to the repository lockfile from this remote-only change because doing that without running npm could leave npm ci inconsistent. From the **prolingo-ai** worktree:

```powershell
git pull --ff-only
npm install kokoro-js@1.2.1
node scripts/audit-ai-voice-adapter-v0.1.mjs
node scripts/audit-ai-voice-kokoro-v0.2.mjs
npm run build
npm run dev -- --port 5174
```

After a successful install/build, commit **both** `package.json` and `package-lock.json` on `feature/ai-voice` so subsequent `npm ci` works:

```powershell
git add package.json package-lock.json
git commit -m "chore(ai-voice): lock Kokoro Web lab dependency"
git push origin feature/ai-voice
```

The model is only downloaded when the user clicks **Load Kokoro**. First load requires internet and approximately ~90 MB plus voice/runtime assets. WASM Q8 is used initially for conservative compatibility; GPU benchmarking comes later. The browser may evict model cache: true durable file storage belongs to the future Android phase.

## Lab acceptance checklist

1. Existing `http://localhost:5174/` still opens ProLingo unchanged.
2. The separate `/ai-voice-lab.html` opens and loads Kokoro.
3. Generate & Play reads text completely.
4. Stream & Play reads sentences in order and reports >0 chunks.
5. Stop interrupts audio; subsequent playback succeeds.
6. Refresh and load again: check whether previously cached data avoids a full download.
7. Test short text, 3 sentences, mobile Chrome, desktop Edge and offline *after all assets are cached*.
8. Check for memory leaks and audio overlap; log first-audio latency. The lab displays the **last generated segment**, not production-grade word alignment.

This v0.2 checkpoint is **not release-ready**: the actual browser/model test and performance measurements must still pass. Future work: test concurrency/cancellation and improve progressive metrics, then introduce Piper independently. Do not merge into Beta before P9 acceptance.
