# ProLingo AI Voice v0.2.1 — Kokoro latency diagnostic

Experimental branch: `feature/ai-voice`, separate page `/ai-voice-lab.html`. No main App.jsx or P9 player integration.

## Changes
- Runtime profiles: WASM/Q8 (~92 MB model) versus WebGPU/FP32 (~326 MB model). Changing profile disposes old worker/model context and requires clicking **Load** again.
- Web Worker reports wall-clock milliseconds per generated chunk and duration of its audio. A generation/audio ratio greater than 1 indicates generation took longer than the returned chunk's play time, **not necessarily** an audible gap.
- Lab can delay playback until 1, 2, or 3 chunks have been generated. It flushes shorter texts at stream completion.
- Independent Web Audio player reports *estimated* playback underrun time; it is not an instrumented P9 player.
- Existing v0.2 generate and stream modes remain available.

## Manual procedure
Run **only from prolingo-ai** worktree:
```powershell
git pull --ff-only
npm run build
node scripts/audit-ai-voice-kokoro-v0.2.mjs
npm run dev -- --port 5174
```
If Vite is already running on 5174, don't start another server: refresh `http://localhost:5174/ai-voice-lab.html`.

Test the **same three-sentence text and voice** in sequence:
1. WASM Q8 / initial buffer 1 / Stream & Play.
2. WASM Q8 / buffer 2 / Stream & Play.
3. WASM Q8 / Generate & Play.
4. Optional after confirming WebGPU support and sufficient download/RAM: WebGPU FP32 / buffer 1 / Stream & Play.

Record the *first audio chunk latency*, per-chunk generation (ms), PCM audio duration (ms), total estimated gap, device/browser, and perceived smoothness. A full audio gap and processing performance should be assessed separately.

## Limitations and future phases
- WebGPU can be unavailable in workers or on some devices; selection then reports an explicit error.
- FP32 is a separate large download. Do not require the WebGPU test on low-storage devices.
- Initial buffering improves continuity only when enough generation headroom exists; it cannot make inference faster.
- Existing direct Browser TTS / Edge / Gemini / P9 flows remain untouched.
- This is not a release pass. Browser real-device benchmarking and smoke tests remain necessary.
