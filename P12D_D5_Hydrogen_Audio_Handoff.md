# D5 audio core — Hydrogen integration contract

**Scope:** isolated persistent Conversation fixtures only. Canonical DB/schema stay **1**. This is an extension of the existing Text planner, runtime resolver, session executor and Full metadata format, not another playback engine.

## Plan from authoritative data

```js
const tree = resolveTextLibraryDocumentTree(qaSnapshot, documentId);
const block = tree.blocks.find(card => card.id === sceneId);
const plan = buildTextStructuredBlockRuntimePlaybackPlan({
  documentTree: tree, block, channel: 'text', representationMode: 'full',
  audioVariants: qaSnapshot.audioVariants,
  runtimeAudioUrls, runtimeFullAudio,
  preferences: downloadResolutionPreferences,
  globalPlaybackOrder, globalPlaybackRate,
  audioSourceMode: 'local-first'
});
```

Use the **complete hydrated block** (`units`, `segments`) plus optional `segmentIds` array/Set for cursor scoping. Do not truncate the graph before validation or reconstruct Turns from speaker labels. Persistent Conversation blocks delegate to `buildTextConversationAudioPlaybackPlan` in `textConversationAudioDomain.js`; Paragraph/v1 paths keep existing P9 behavior. Direct D5 calls reject Legacy, wrong parents, missing hydration or corrupt Unit membership/speakers/order without repairing identities.

Inputs retain existing meanings: `preferences` is the existing download-resolution preference shape (speaker/card/Segment overrides, follow-player, `edgeRate`, `edgePitch`, etc.); `globalPlaybackOrder` is the existing ordered local profile configuration; `globalPlaybackRate` is runtime speed, default 1. Generation rate/pitch and runtime playback speed are different inputs. No global/provider defaults are changed. `rendererVersion` / `codecProfile` may be supplied for exact-render QA; normal callers use existing defaults.

Plans are read-only derived values, not persisted entities. In particular, do not mutate referenced `entry.segment` or artifact metadata through the plan; apply editor/domain commands to authoritative snapshots instead.

## Returned plan / playback

- `entries[]`: ordered audible Sentences with persistent `segmentId/segmentUid`, `unitId/unitUid`, speaker ID/label, content/channel, resolved `voiceProfile` / `ttsVoiceName`, `playbackRate`, candidate render profiles/RFs, selected `runtimeAudio`, selected profile rank, and readiness status. Empty Turns and empty channel content produce no entry.
- `steps[]`: existing `split-local`, `split-tts` or `full-local` step types. Split and Full composition fallback retain Sentence order and speaker assignments. Full fallback intentionally remains multiple per-Sentence steps, including in TTS-only mode; it must not become one Card utterance.
- `route`: `empty`, `split`, `conversation-composition`, or `full-local`. Counts describe the selected playback route. `entries[].status` independently describes local inventory, so selecting TTS-only does not erase physical availability.
- `fullReadiness`: metadata-only/missing/stale/other-profile/ready under the exact planned composition. Cached Full is usable only for the complete Scene and an exact descriptor with a verified runtime binding.
- `fullArtifactRequirement`: whole-Scene expected fingerprint/descriptor, or null for an empty/unresolved/partial scope. It is a requirement, not evidence of a binary.
- `compositionInputsReady`: all primary configured render inputs have verified bindings. Ordered local fallback can select a later ready profile without falsely claiming the primary Full recipe is composable.
- `readyToCompose`: all whole-Scene inputs are ready **and all playback rates are 1**, matching the existing WAV assembler's supported capabilities. `compositionBlockReason` explains `inputs-not-ready`, `partial-scope`, or `rate-aware-assembly-required`.

Reuse `executeStructuredTextPlaybackSessionService`. Its block-plan callback receives `fullBlock`, scoped `segmentIds`, and `allowFullArtifact`; pass those to the planner. The existing executor supplies pause/stop/session cancellation, ordering, repetition and resume scoping. Cursor items now carry Unit/Segment UIDs and stable speaker ID when `segment.unitId` exists.

**Required callback integration:** honor `step.runtimeAudio`, `step.voiceProfile`/`ttsVoiceName`, and `step.playbackRate` for composed fallback Sentences. Resolve actual installed Browser voice availability through the existing Browser TTS resolver. Do not rerun the old one-voice Full-Card policy or discard Sentence voice overrides merely because the selected representation is Full. For a cached composed `full-local` step, playback rate is **1** because its schedule is already part of the artifact contract; do not multiply a global rate again.

No App/React/player callback wiring is included in D5 core. The current v1 App remains untouched; its existing Full callbacks are not sufficient authority for future v2 composition. After an editor commit, stop/rebuild playback against the latest snapshot and retain only still-existing cursor IDs; do not replay a captured pre-edit graph.

## Exact readiness and identity

The existing runtime resolver gains optional `expectedRenderFingerprint`. D5 always uses it. Exact RF pins content, voice, generation engine/rate/pitch, language, renderer and codec. Missing legacy RF does not count as verified audio. An explicit runtime RF mismatch, empty Blob or a metadata-only row cannot win. Existing URL/Folder/ZIP/Staging flags must be **verified adapter bindings**, not copied database flags. A real nonempty Blob is also accepted. Load/decode failure still requires the existing runtime fallback/error handling.

An unchanged exact RF can be reused after Turn reorder/split/merge, same-render speaker reassignment or an edit/undo, even if old invalidation metadata remains. No identities, fingerprints or invalidation flags are rewritten by planning. Persistent Conversation GC planning also retains that valid historical RF; it remains conservative for stored Full profiles and is not a physical deletion command.

## Full artifacts, files and portability

Existing `fullAudioArtifactsV1.artifacts[]` supports an **audio artifact descriptor schema 2** (unrelated to canonical Text DB activation):

```text
{ schemaVersion: 2, representation: 'full', contentFingerprint, channel,
  engine: 'derived', voiceId: 'multi-speaker',
  composition: [{ renderFingerprint, playbackRate }, ...],
  codecProfile: 'wav-pcm16-derived-v1', sampleRate: 48000,
  derivationVersion: 'prolingo-conversation-full-v1' }
```

`derived` / `multi-speaker` are descriptor tokens, **not a TTS provider or selectable voice**. IDs, UIDs and display labels are absent from physical identity; ordered audible render inputs and output configuration are included. Voice/configuration/content/order changes invalidate matching; label-only rename or unchanged grouping does not. Existing schema-1 Paragraph descriptors and fingerprints retain their format.

For supported file composition, read every verified primary input Blob in `plan.entries` order, then call `buildDerivedTextConversationFullAudioWav({plan, blobs})` from the existing Full export service. It delegates decoding/PCM concatenation to `buildDerivedTextFullAudioWav`, fixes output at the descriptor's 48 kHz, rejects missing inputs, and returns the tied `fullArtifactRequirement`. It does not synthesize speech or write any storage. Decode failures reject the whole composition.

**Non-unit playback rates:** the plan/identity and per-Sentence playback support them, but the current concatenator does not bake time/pitch behavior. `readyToCompose=false` and the file helper rejects; retain per-Sentence Full playback. Do not mislabel an unadjusted WAV as a rate-baked artifact. Rate-aware file assembly is a remaining integration/export limitation, not permission to change global playback behavior or fake readiness.

To create metadata after successful composition, use existing `buildTextStructuredFullArtifactRecord({block, channel, composition: plan.composition, source: 'derived', mimeType:'audio/wav', ...})`. Commit only through an explicitly isolated QA adapter. No canonical commit is authorized.

The existing manifest stays version **2**. Its `render` object carries the descriptor. `scanTextStructuredAudioZipFiles` gains `fullArtifactRequirements: [plan.fullArtifactRequirement, ...]`: schema-2 Full files attach only to exact current expected schedules, even after local ID/UID remapping. Without those requirements they remain orphans; manifest source references cannot override identity. Split ZIP behavior is unchanged.

Existing Staging Full keys, descriptor metadata and pure `reconcileTextAudioStagingRuntimeBindings` support the new record. D5 tests exercise metadata/bindings/GC plans, not real Staging writes. Do not invoke production Staging write/release/GC/download services from the isolated editor. No second cache/store or registry is introduced.

## Safe verification

`createD5AudioFixture()` (`scripts/fixtures/d5/conversation-audio-fixture.js`) supplies disposable snapshots, explicit test preferences, exact RF metadata and fake runtime URL bindings. It wraps the D4-A fixture with multiple Alice Sentences, Bob, an empty Turn/Scene and a separate Mixed Workspace. Fake URLs are plan fixtures, not playable real files.

```powershell
node scripts/audit-v603-p12d-d5-conversation-audio.mjs
node scripts/audit-v603-p12d-d5-browser.mjs
```

The Node suite covers 15 scenarios. The browser suite creates synthetic WAV bytes and uses real Web Audio decoding plus the existing session service with recording callbacks; it emits no audible speech and counts zero IndexedDB access. Use the established D4/D3/P9 regression suites alongside them. Production migration, live writes, real audio deletion, Track B/AI Voice, provider defaults and deployment remain outside this handoff.
