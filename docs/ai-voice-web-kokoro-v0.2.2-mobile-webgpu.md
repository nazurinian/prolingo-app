# ProLingo AI Voice v0.2.2 — Mobile WebGPU preflight

Branch: `feature/ai-voice`. Only the standalone `ai-voice-lab.html`, Kokoro lab adapter, worker and mock audit are changed. No main app, P9, Beta or Stable integration.

## Confirmed PC checkpoint (user benchmark, 12 sentences)
- WebGPU FP32: 12 chunks, **4,589 ms generation**, **31,875 ms audio**, total ratio **0.144×**, approximately **6.95× faster than real time** for generation.
- This establishes PC inference performance on the tested system, **not** Android capability.
- On phone: FP32 WebGPU model could not be downloaded/loaded; no Android inference benchmark yet.

## Changes
- `Cek WebGPU HP (tanpa download)` button tests whether the same Worker context used for inference has access to `navigator.gpu.requestAdapter()`.
- Reports secure context, page `navigator.gpu`, worker adapter availability, shader-f16 capability and maximum GPU buffer limit (when exposed).
- The preflight does **not** fetch the Kokoro model, and a positive preflight is **not** a guarantee that the 326 MB FP32 model fits device memory.
- The worker now uses the same preflight for WebGPU before attempting to download the large model, and gives a more explicit error if unsupported.
- A mock-worker audit covers probe messaging.

## Test procedure
In `prolingo-ai` worktree:
```powershell
git pull --ff-only
node scripts/audit-ai-voice-kokoro-v0.2.mjs
npm run build
```
Refresh the running Vite URL on PC or the phone's Tailscale HTTPS address, then press **Cek WebGPU HP (tanpa download)**. Capture both the probe result and the original download failure message if one was shown. Do not retry the FP32 download until the preflight is successful.

## Important limitations
- Browser security, device GPU driver, Android version and Chrome implementation can prevent WebGPU in Workers.
- Even with WebGPU available, FP32 memory requirements, network interruptions, browser cache and runtime support may fail.
- Tailscale only serves the web page from the PC; with the current architecture the inference still runs in the **phone browser**, not on PC GPU.
- Do not automatically fall back to a remote server or install Android/Capacitor components during this Web phase.

## Next
If the phone probe succeeds but FP32 model fails, capture error and inspect specific failed resource; evaluate smaller compatible WebGPU model variant or model/runtime memory. If it fails, keep PC WebGPU as primary and phone fallback or other TTS candidate as an independent experiment.
