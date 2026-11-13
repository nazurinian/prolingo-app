# Phase P11 — Audio Provider Gateway Architecture Readiness Report

**Branch:** `fix/text-data-system-boundaries`  
**D3 Baseline Commit:** `b190927`  
**Status:** AUTOMATED PASS (Gateway domain, service adapters, capability boundaries, `/api/tts` preservation, ESLint & Build verified)

---

## 1. Architecture Summary

P11 establishes a minimal capability-aware provider gateway contract without integrating local neural TTS runtimes (`Kokoro`/`Piper` model weights, Web Workers, ONNX/WASM, or WebGPU), without enforcing a universal Blob requirement on Browser TTS, and without touching Table Mode, Legacy Text, Gemini, Staging schemas, Render Fingerprints, Full Artifacts, or AI Voice worktrees.

### Files Added / Modified
1. **`src/domain/audio/audioProviderGatewayDomain.js`** (New)
   - Defines `AUDIO_PROVIDER_IDS` (`browser-tts`, `edge-tts`, `local-ai-kokoro`, `local-ai-piper`), `AUDIO_PROVIDER_FAMILIES`, `AUDIO_PROVIDER_OPERATIONS`, and `AUDIO_PROVIDER_ERROR_CODES`.
   - Publishes frozen `AUDIO_PROVIDER_CAPABILITIES` distinguishing:
     - **`browser-tts`**: `supportsLivePlayback: true`, `supportsBlobSynthesis: false`, `supportsOfflineDownload: false`, `supportsStagingPersistence: false`, `renderProfile: null`.
     - **`edge-tts`**: `supportsLivePlayback: false`, `supportsBlobSynthesis: true`, `supportsOfflineDownload: true`, `supportsStagingPersistence: true`, `supportsHealthCheck: true`, `endpoint: '/api/tts'`, `renderProfile` pinned to `TEXT_AUDIO_RENDERER_PROFILE_VERSION` (`prolingo-edge-v1`) and `TEXT_AUDIO_CODEC_PROFILE` (`mp3-default-v1`).
     - **`local-ai-kokoro` & `local-ai-piper`**: explicitly marked `reserved: true`, `implemented: false`, `active: false` with isolated `futureRenderProfileNamespace` (`prolingo-kokoro-reserved-v1` / `prolingo-piper-reserved-v1`) so existing Edge Staging/RF identities never collide.
   - Exports `normalizeAudioProviderId`, `getAudioProviderCapability`, `listAudioProviderCapabilities`, `canProviderSynthesizeBlob`, `canProviderPlayLiveUtterance`, `validateAudioProviderOperation`, and `resolveAudioProviderGatewayRoute`.

2. **`src/services/audio/audioProviderGatewayService.js`** (New)
   - Exports `AudioProviderCapabilityError`, `createAudioProviderGatewayRegistry({ customAdapters })`, `defaultAudioProviderGateway`, `getAudioProviderGatewayAdapter`, `executeGatewayBlobSynthesis`, `executeGatewayHealthCheck`, and `executeGatewayLivePlayback`.
   - Wraps existing `/api/tts` Edge synthesis/health checks (`textStructuredEdgeAudioDownloadService.js`) and Web `speechSynthesis` live playback (`audioPlaybackSideEffectService.js`) without changing playback scheduling or `/api/tts` payloads.
   - Fails closed with `PROVIDER_PLAYBACK_ONLY` when Blob synthesis/download/staging is requested for `browser-tts`, and with `PROVIDER_RESERVED_NOT_IMPLEMENTED` for `local-ai-kokoro` / `local-ai-piper`.

3. **`src/services/audio/textStructuredAudioGenerationService.js`** (Updated)
   - Routes `executeTextStructuredAudioGenerationRequest` through `defaultAudioProviderGateway.synthesizeBlob(...)` while preserving the `engine === 'gemini'` isolation guard and existing Edge return signature.

4. **`scripts/audit-v603-p11-provider-gateway.mjs`** (New)
   - Verifies provider capabilities, fail-closed validation, `/api/tts` payload fidelity via mocked `fetch`, Browser TTS live playback via mocked `SpeechSynthesisUtterance`, custom adapter injection for future P15 plugins, Gemini/Table/Legacy isolation, and absence of model/worker/WebGPU/WASM dependencies.

---

## 2. Verification & Commands Run (All executed after final P11 edit)

| Check | Command | Result |
|---|---|---|
| P11 Provider Gateway Suite | `node scripts/audit-v603-p11-provider-gateway.mjs` | **4 PASS, 0 FAIL** |
| ESLint on P11 Domain, Service & Audit Files | `npx eslint src/domain/audio/audioProviderGatewayDomain.js src/services/audio/audioProviderGatewayService.js src/services/audio/textStructuredAudioGenerationService.js scripts/audit-v603-p11-provider-gateway.mjs` | **0 errors, 0 warnings** |
| D0–D3 Regression Gates | `audit-v603-round-d0-closure-guards.mjs` (4 PASS), `d0-final-polish` (8 PASS), `d0-f1-f2-patch` (12 PASS), `d1` (3 PASS), `d2` (7 PASS), `d3` (7 PASS) | **PASS (0 failures)** |
| P9-B, P9-C & P10 H1–H5 Regression Gates | `p9b` (24 PASS), `p9c` (17 PASS), `p10-h1-h3` (8 PASS), `p10-h4` (8/8 PASS), `p10-h5` (11 PASS) | **PASS (0 failures)** |
| Production Bundle Build | `npm run build` | **PASS** (`1893 modules transformed`, built in `7.49s`) |
