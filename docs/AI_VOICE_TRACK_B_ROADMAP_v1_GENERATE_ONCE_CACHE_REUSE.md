# ProLingo — AI Voice Track B Roadmap v1
**Architecture:** Generate Once → Cache & Reuse  
**Decision date:** 2026-11-13  
**Status:** Experimental / planning and feasibility (NOT production integrated)  
**Branch/worktree:** `feature/ai-voice` / `prolingo-ai`  
**Independent Track A:** `fix/text-data-system-boundaries`

> **Scope guard:** This roadmap replaces mandatory real-time neural streaming as the v1 delivery goal. Existing v0.1/v0.2 streaming labs remain historical diagnostics, not the production playback contract. Do not modify, merge, cherry-pick into, or release Track A, Beta, Stable, or `main` as part of this roadmap.

## 1. Decision and non-goals

**AI Voice v1 = Generate Once, Cache & Reuse.** Generated speech is treated as a reusable asset that goes through **Audio Staging**, the same fingerprint/cache identity rules, normal Split/Full playback, and the supported download/ZIP export pipeline. Generation and playback are separate concerns.

Reasons: inference load is non-trivial; repeated synthesis wastes CPU/GPU; Android model execution remains unproven; existing Audio Staging, fingerprints, and export infrastructure are more valuable for v1 than mandatory low-latency neural streaming.

**Not required for v1:** neural live streaming; word-level alignment; automatic model downloads on Play; an Edge-model download; cloud inference as an offline dependency; a new player replacing P9; mobile/APK deployment; integration into the Text branch. Keep optional streaming experiments isolated as research.

## 2. Workstream boundary

| Track | Branch | Owns | May not change without review |
| --- | --- | --- | --- |
| A — Text | `fix/text-data-system-boundaries` | P10-H6, Round D Global & Workspace/Card Reset, existing Audio Staging/player/export, initial Audio Provider Gateway, Conversation/Mixed compatibility | Track B lab internals |
| B — AI Voice | `feature/ai-voice` | Model experiments, Kokoro/Piper one-shot adapters, measurement harnesses, provider-neutral draft contract, isolated output validation | Track A production player, Staging schema, application UI, Beta/Stable/main |

**Integration gate:** Track A must first finish P10-H6, Round D reset work, the first Audio Provider Gateway contract, and a Conversation/Mixed compatibility review. Track B must independently pass feasibility and contract tests. Only then coordinate a small **Beta-only** integration proposal with acceptance/regression tests. **No automatic merge.**

## 3. Required workflows

### A. Optional Generate on First Play
1. Build the exact audio identity from the selected provider, model, voice, text, channel, settings, and contract/normalisation versions.
2. Look up a compatible, validated Audio Staging entry.
3. If found, play the stored audio Blob through normal playback; **do not run inference**.
4. On a miss, generate **only when** the user enabled first-play generation, a compatible locally installed model is available, and that engine is currently supported.
5. Validate the produced audio; atomically save the Blob plus metadata to persistent Audio Staging; then play the **saved** asset.
6. Every subsequent play uses the stored audio until identity changes or the asset is deliberately removed/invalidated.

**Never trigger a large-model download merely by pressing Play.** Missing model, unsupported runtime, cancellation, or generation failure must leave the regular app usable. Direct Browser/Device TTS may be a non-generating fallback; it does not pretend to return a cacheable audio Blob.

### B. Generate via Download / Batch
1. Choose Segment, Card, Workspace, or Collection scope.
2. Resolve each actual spoken text and channel against the selected provider/voice/render settings.
3. Compute the **same** identity used by first-play generation; skip validated compatible Staging assets.
4. Generate only missing or incompatible entries, with bounded concurrency and progress/cancellation controls.
5. Validate, stage, and index each finished asset atomically. Failed/cancelled items remain retryable without corrupting completed items.
6. Reuse staged assets for normal playback; export only truthful formats (WAV/MP3 as actually encoded) and Portable ZIP where supported.

**Invariant:** the same request must generate the same cache key in both workflows. Playback and exports consume the same staged asset instead of synthesising again.

## 4. Provider strategy

| Provider | Class | Requirement / behaviour |
| --- | --- | --- |
| Browser / Device TTS | Direct speech fallback | Keep existing playback semantics. No Blob or export capability assumed. Device voices may be online; offline suitability must be checked per installed voice. |
| Edge TTS | Online generation | Keep separate from local models; only expose permitted, working generation endpoints. Service availability and terms require review. Generated audio can be staged only when a real audio file is obtained. |
| Kokoro | Optional offline generator | Primary AI one-shot feasibility study; lazy model load, WASM/CPU path first for Android compatibility, GPU as optional acceleration. |
| Piper | Optional offline generator | Lightweight alternative; verify actual Android/browser runtime, chosen English voice model, licence, quality and output before promising support. |
| Gemini paid TTS | Out of scope | Not a dependency or priority for v1. |

The app must work without either local AI model installed. Do not make local model installation compulsory at application launch.

## 5. Provider-neutral Audio Generation Contract — draft for Track A review

This is a **proposal**, not a claim that the current Audio Provider Gateway already implements it.

### Request
```ts
type AudioGenerateRequestV1 = {
  schemaVersion: 1;
  providerId: string;            // e.g. 'kokoro', 'piper', 'edge'
  engineId: string;              // specific runtime/implementation
  modelId: string;               // actual model/variant; explicit 'managed' if remote
  modelVersion: string;          // immutable release/hash when known
  voiceId: string;               // canonical provider voice ID
  language: string;              // BCP-47
  input: {
    text: string;                // exact synthesis input after declared transforms
    channel: string;             // text/meaning/etc — don't omit
  };
  render: {
    rate: number;
    pitch?: number;
    style?: string;
    volume?: number;
    targetMimeType?: string;
    sampleRate?: number;
    channels?: number;
    [key: string]: unknown;       // versioned, canonical provider-specific fields
  };
  textTransformVersion: string;
  segmentationVersion: string;
  adapterVersion: string;
};
```

### Result
```ts
type AudioGenerateResultV1 =
  | {
      status: 'success';
      request: AudioGenerateRequestV1;
      fingerprint: string;
      audio: {
        blob: Blob;               // actual audio bytes
        mimeType: string;         // validated, e.g. audio/wav
        codec: string;            // actual encoding, e.g. pcm_s16le
        sampleRate: number;
        channels: number;
        durationMs?: number;
        byteLength: number;
        contentSha256?: string;
      };
      createdAt: string;
    }
  | {
      status: 'cancelled' | 'failed';
      fingerprint?: string;
      errorCode?: string;
      message?: string;
      retryable?: boolean;
    };
```

Provider capability discovery is separate: `isAvailable()`, installed-model status, supported voices/languages, supported formats, and `generate(request, {signal, onProgress})`. A direct speech engine reports `direct-playback` capability instead of returning invented Blobs. `AbortSignal` is advisory to the backend but cancellation must suppress staging of unfinished outputs.

**Serialization:** Keep Blob bytes in the Staging asset store; persist a serializable manifest/asset reference with the metadata. Never JSON-serialise a Blob or treat a direct-speech fallback as exported audio.

### Fingerprint and cache safety

Use canonical serialisation + a strong digest (e.g. SHA-256) across:
- schema/fingerprint version and exact rendered text or explicitly versioned text transform;
- channel and segmentation/pausing policy;
- provider, engine/adapter, model ID/version (or managed-provider revision), voice ID, language;
- *every* sound-affecting render setting, including provider-specific options;
- output-format/resampling configuration when it changes the stored artifact.

Do **not** use merely a card ID, display string, voice display name, or unversioned provider label as identity. Two different providers/models/voices/settings must never collide. Distinguish source identity from output encoding if the gateway later supports transcoding; never silently reuse an incompatible codec.

Validation before declaring a cache hit: manifest and Blob both present; non-zero length; MIME/codec agree with sniffed/header bytes where possible; sensible sample rate/channels; optional checksum matches. Cache misses, invalid data and version mismatches must regenerate or fall back safely. Prevent simultaneous duplicate generation for the same fingerprint (single-flight/locking).

**WAV is not MP3:** PCM output requires valid WAV headers for `audio/wav` or explicit raw PCM handling. Export `audio/mpeg` / `.mp3` only after actual MP3 encoding. Portable ZIP filenames, manifest MIME and file extensions must match bytes.

## 6. Model files vs generated audio

- **Model files:** separate model manager; explicit first-time install/download, version/hash/size reporting and integrity checks; lazy load on demand; release heavy worker/session/GPU resources after generation or idle policy; no mandatory background download.
- **Generated audio:** independent Audio Staging asset store with fingerprint index, metadata and export. Can remain usable after the model is unloaded or uninstalled.
- **Browser web:** browser-managed Cache Storage/IndexedDB may be evicted/cleared. `localStorage` is not suitable for large models. Persistent-storage requests can reduce but not eliminate risk; document the limitations and offer safe fallback.
- **Future Capacitor APK:** install models and save generated audio into durable app file storage (not WebView cache), with explicit quota, model verification, migration and cleanup policy. Bundle all app/runtime/data assets needed to open offline so Vercel is not required. Note app-data deletion/uninstall behaviour.
- **Offline status:** distinguish application offline availability, model installed, runtime loaded, generation ready, and existing staged audio playable. These are not the same state.

## 7. Research and test plan — Track B only

### B0 — Scope and contract freeze
- [x] Adopt `Generate Once → Cache & Reuse` for v1.
- [x] Preserve v0.1/v0.2 streaming diagnostic documents as historical experiments.
- [ ] Compare current Track A Audio Staging/fingerprint/ZIP interfaces **read-only** and resolve contract ambiguities with Track A before integration.

### B1 — One-shot model validation on PC
- [ ] Kokoro one-shot output: short vocabulary, one sentence, multi-sentence text, punctuation, and both text/meaning channels where relevant.
- [ ] Piper voice/runtime selection with model/version/license and output format verified.
- [ ] Record model download size, hash, warm/cold load times, first generation, total generation, audio duration, ratio `generate_ms / audio_ms`, file size and subjective pronunciation.
- [ ] Record CPU/GPU utilisation and peak memory where instrumentation is available; compare WASM Q8 vs WebGPU only when both are supported.
- [ ] Validate playable Blob, correct MIME/codec, audio header, no truncation, repeatability and device release.

### B2 — Android and offline feasibility
- [ ] Determine worker secure-context and WASM CPU viability; **do not treat WebGPU availability as proof of Kokoro inference**.
- [ ] Trial short + paragraph one-shot Kokoro via WASM/CPU, record memory/latency/thermal behaviour and errors.
- [ ] Test a Piper path independently; report unsupported runtime honestly.
- [ ] Offline test **after explicit model installation** with a freshly generated text; prove no network request is required for generation.
- [ ] Document browser eviction risk and future APK file-storage interface without implementing Capacitor yet.

### B3 — Isolated Staging/adapter lab
- [ ] Produce draft provider adapter and mock Audio Staging harness in Track B only.
- [ ] First-play cache hit/miss with no automatic model installation.
- [ ] Batch Segment/Card/Workspace/Collection: dedupe, resume, partial failure and cancellation.
- [ ] Check cache separation for voice, model version, channel, render speed, text revisions and output codec.
- [ ] Reopen/reload and reuse staged Blob without any inference; verify playable WAV and ZIP export metadata.
- [ ] Prevent audio overlapping, duplicate generation, broken/empty assets and stale fingerprints.

### B4 — Cross-track contract review (later)
**Blocked by:** Track A P10-H6; Round D Global and Workspace/Card Reset; initial Audio Provider Gateway; Conversation + Mixed compatibility review.

- [ ] Compare gateway ownership, audio identity and reset semantics; update adapter proposal by agreement.
- [ ] Acceptance test plan for Split/Full, global player, Staging, ZIP and Conversation/Mixed.
- [ ] Approval for narrow Beta-only integration. No implicit merge from lab branch.

### B5 — Beta-only integration (not authorised yet)
- [ ] Separate small reviewed PR/patch; feature flag disabled by default.
- [ ] Regression suite and explicit user acceptance; only then discuss wider release.

## 8. Acceptance gates for v1 experiment

**Pass requires**: real one-shot audio; valid playable format; stable identity; cache-hit playback without inference; failed/cancelled generation leaves no corrupt Staging record; repeated batch generation skips correct cached entries; offline generation with preinstalled local model; documented device-specific memory/latency/limitations; no changes to existing Text production playback.

**No-go:** Android unsupported, OOM, corrupted/truncated audio, wrong MP3/WAV labelling, fingerprint collision, unexpected download on Play, or regressions in Track A. These are explicit blocked items, not reasons to silently switch to cloud.

## 9. Current evidence and unresolved questions

Earlier experimental docs establish a *PC* WebGPU FP32 12-chunk Kokoro checkpoint of 4,589 ms generation vs 31,875 ms audio (ratio 0.144×) and an Android WebGPU/FP32 loading problem. **This does not prove Android one-shot inference, offline model stability, or v1 caching.** Existing streaming tests may inform performance but are not v1 acceptance.

Open: stable Kokoro CPU/WASM on the target Android device; Piper feasibility and licence; selected file-storage contract per platform; sound-setting canonicalisation; whether Edge generation is an allowed/available online provider; exact Track A Gateway integration shape.

## 10. Safe next action

In `prolingo-ai` only, run the existing offline audits and standalone AI lab, then add a **one-shot Kokoro output validation benchmark** that records format and cold/warm performance without changing ProLingo's production player or Audio Staging. After that, test Piper independently. Capture findings in new Track B docs; do not start a production gateway integration or a merge.

**Supersedes as roadmap:** streaming-first "next milestones" in `docs/ai-voice-web-adapter-v0.1.md` and `docs/ai-voice-web-kokoro-v0.2*.md` for v1 planning. Those files are retained as historical technical checkpoints.
