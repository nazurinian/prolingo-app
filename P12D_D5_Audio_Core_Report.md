# P12-D5 Conversation audio core

Initial HEAD/baseline: `9968a0e2fdba32563614da8bc82c18c6723a0278`; branch `feature/p12-conversation-only`; tree initially clean.

## Focused audit findings recorded before implementation

1. `textStructuredRuntimePlaybackPlanDomain.js` supports per-Segment Split plans, but receives one fallback generation voice for a Card. Full TTS-only / all-TTS fallback combines the Card into a single utterance and ignores Segment overrides. This cannot represent a persistent multi-Speaker Scene correctly. Existing P9 behavior must remain unchanged.
2. `textStructuredAudioRuntimeDomain.js:resolveTextStructuredRuntimeAudio` checks legacy content compatibility and optional profile rate/pitch. It has no exact expected RF input, so an old rendering configuration or unverified legacy variant may be selected despite an RF mismatch. D5 needs an opt-in exact-RF path, without weakening P9 compatibility policy.
3. `textStructuredSplitFullDomain.js` Full schema 1 hashes joined content and one voice/render configuration. It does not identify ordered per-Sentence render inputs or their playback rates. Reassigning speakers with unchanged text can leave this Full identity unchanged. Extend the existing Full artifact contract; do not create another store/cache.
4. `textStructuredAudioZipArchiveService.js:resolveFullMatches` reconstructs a one-voice artifact from manifest data. A composed Full descriptor needs exact current expected requirements before attachment; manifest source IDs alone are not authority. Existing manifest version 2 already carries opaque render descriptors.
5. `textStructuredPlaybackDomain.js:resolveStructuredTextPlaybackList` preserves Card/Sentence order but omits persistent Unit ID/UID and stable speaker ID from cursor items. Source lookup currently recovers voice data; D5 should carry authored identity explicitly for consumers/resume.
6. Staging supports arbitrary Full descriptors under existing `full-sha256-*` physical keys, and the existing WAV service composes readable ordered Split blobs. These are reusable. GC currently drops invalidated Split references unconditionally; if exact RF is valid again after an undo, persistent Conversation reuse must not be followed by accidental orphan classification.

Inspected speaker registry, voice/rate sync, local/download profile precedence, session stop/pause/repeat/from-here, requirements, readiness, staging reconciliation/export, ZIP matching, GC planning and D3/D4 handoffs. No second audio engine, registry, cache, generation provider or live v2 wiring is justified.

## Implemented contracts and bounded fixes

**CONDITIONAL GO for the next isolated D5 UI/playback integration step. Canonical IndexedDB v2 activation remains NO-GO.** The core plans and compatibility checks pass. File composition is deliberately limited to unit playback rates; non-unit rates retain correct per-Sentence playback and an explicit file-assembly block rather than falsely ready output.

1. Added `textConversationAudioDomain.js`, a coordination layer over existing resolvers. It validates persistent Scene → Unit → Segment relationships and builds ordered per-Sentence requirements/steps, including multiple Sentences in one Turn, stable speaker identity, source-independent RFs, existing profile precedence/sync and runtime playback rate. It creates no IDs or persistent state.
2. Existing `buildTextStructuredBlockRuntimePlaybackPlan` / `buildTextStructuredSplitRuntimePlan` delegate **only persistent Conversation blocks** to that layer. Paragraph and v1 branches retain their P9 behavior. Full missing/TTS-only Conversation plans use per-Sentence steps with speaker profiles, never a monolithic Card utterance. Empty Turns/Scenes produce no placeholder audio.
3. Existing runtime resolver gains an opt-in `expectedRenderFingerprint`. D5 uses exact RF plus verified runtime binding and profile identity. Missing RF, wrong renderer/rate/pitch/language/codec, mismatched binding or empty Blob does not count as playable audio. Exact RF can prove reuse even after undo leaves an invalidation marker, without rewriting fingerprints/IDs or requiring optional legacy render-descriptor duplication.
4. Existing Full artifact metadata gains **audio descriptor schema 2**: joined content/channel, ordered input RFs and per-input playback rates, plus explicit derived WAV codec, 48 kHz output and derivation version. The existing `full-sha256-*` namespace, `fullAudioArtifactsV1` container and normalization/readiness APIs are reused. There is no new cache/store. Source IDs, UIDs, Unit grouping and speaker display labels are not physical identity inputs.
5. Composed Full readiness requires exact current schedule and physical runtime binding; generic `binaryReady:true` metadata alone is insufficient. Partial scopes cannot consume/cache a whole-Scene artifact or expose a whole-Scene export requirement. Later-ranked local profile fallback remains playable but cannot masquerade as the primary configured composition.
6. Existing WAV decoder/concatenator is reused through a strict Conversation wrapper. It requires all planned binaries, rejects omitted/empty inputs, fixes output at the fingerprinted 48 kHz, verifies output rate and ties the result to its expected descriptor. It rejects non-unit playback rates because the existing concatenator does not bake time/pitch behavior; it never silently labels unadjusted bytes as a rate-baked composition.
7. Existing portable ZIP schema 2 carries the descriptor unchanged. Composed Full attachment requires caller-supplied exact current `fullArtifactRequirements`; unrecognized/unmatched schedules remain orphans. This survives local ID/UID remapping. Split ZIP behavior remains unchanged.
8. Existing Staging metadata/binding functions accept composed Full descriptors under existing physical keys. GC planning preserves a persistent Conversation RF that becomes valid again after undo, rather than treating it as orphan solely because of a historical invalidation marker. Full GC remains conservative about referenced historical profiles. No physical GC/deletion was executed.
9. Existing flat player items now include Unit ID/UID, Segment UID and stable speaker ID **only when persistent membership exists**. Existing session execution, stop/pause/cancellation, ordering, channel traversal and resume scoping are reused without another engine.

The additional composition-input completeness/rate guards address concrete limits in the reused concatenator, which historically filters absent input blobs. The original Paragraph export behavior is preserved; strict completeness applies through the new Conversation wrapper.

## Identity and invalidation semantics

- Unit split/merge or display-name rename with unchanged audible inputs retains Full identity and existing Split RFs. Reordering empty Units alone is not an audible change.
- Changed audible content/order, speaker render profile, renderer/codec/language, generation rate/pitch or planned playback rate changes expected Full identity. Stored old artifacts/variants are retained, not destructively rewritten.
- Same-render speaker reassignment can reuse audio; different render requirements cannot silently use the old speaker's audio. Moving a Sentence retains its Segment ID/UID and logical variants but recomputes the target speaker requirement.
- Sentence split/merge follows D4 identity rules: retained first identity survives; additional or explicitly removed identities behave as before. New children do not inherit audio variants. Equivalent rejoined content can reuse its exact original RF.
- Readiness is separate from metadata existence and selected source mode. TTS-only routing does not erase inventory availability. Runtime source flags are adapter assertions of physical binding; actual load/decode failure still needs existing fallback handling.

## Test results and evidence

Baseline replay used `git show` through a temporary read-only module loader, without changing files or branches. A four-Sentence Scene produced **one** Full TTS step at baseline versus **four** now. A changed rendering pitch still selected **four** local clips at baseline versus **zero** now. The new persistent exact-RF path is responsible for this correction; legacy P9 behavior remains intentionally unchanged. Logs: `.tmp/d5/before-probes.log`, `after-probes.log`.

New focused suite: `node scripts/audit-v603-p12d-d5-conversation-audio.mjs` — **15 PASS / 0 FAIL**. Coverage includes:

- One multi-Sentence Turn; multiple Speakers in one Scene; empty Turn/zero-Unit Scene; identical Split/Full Sentence traversal.
- Speaker-specific download and Browser profile resolution; speaker rename/reassignment; voice sync, Custom Local pins and explicit ordered-profile fallback/rank.
- Content/order/voice/render configuration Full invalidation; metadata-only/missing/empty binary, stale RF/profile, wrong runtime binding, corrupt hydration and Legacy rejection.
- Turn reorder/split/merge, Sentence reorder/move/split/merge/delete, undo RF reuse and no unrelated ID/UID/variant mutation.
- Meaning channel and Mixed Paragraph isolation; old Paragraph Full TTS behavior; cursor identity and partial scopes.
- Composed descriptor normalization/corruption rejection; portable ZIP exact-schedule matching; real ID collisions/UID remapping during Pack copy; Staging runtime binding and pure GC plans.
- Missing composition binaries and non-unit-rate file assembly fail closed; existing session stop handling retains correct Sentence cursor/Turn membership.

New real-browser suite: `node scripts/audit-v603-p12d-d5-browser.mjs` — **3 PASS / 0 FAIL**, Edge 157, **0 IndexedDB calls**:

1. Real Web Audio decoding/PCM composition of four synthetic WAV inputs, verifying Sentence count, speaker-order sample polarity, 48 kHz output and exact RIFF data length tied to the planned Full identity.
2. Real nonempty Blob bindings work only with matching RF metadata; absent logical references and zero-byte Blobs do not imply readiness.
3. The existing global Text session waits for pause release, stops after the requested step and resumes from a Sentence inside a multi-Sentence Turn without repeats/skips, across the next speaker boundary.

The browser uses a fresh temporary profile and loopback static server, never imports App/startup, blocks IndexedDB calls, and emits no audible speech. Synthetic waveform tests certify assembly/order, not provider speech generation or acoustic voice quality. No network TTS/generation provider, canonical library or real audio storage was used.

Relevant regression suites (`scripts/audit-v603-<suffix>.mjs`):

| Suite | Result |
| --- | --- |
| D4-C real-browser interactions (`p12d-d4c-browser`) | 13 PASS + 4 route gates; all 20 commands covered |
| D4-B UI / D4-A core | 9 / 22 PASS |
| D3-D / D3-C / D3-B / D2 virtual Units | 12 / 5 / 11 / 12 PASS |
| P12 speaker registry / Conversation playback | 14 / 13 PASS |
| P9 playback / bulk / Paragraph acceptance | 24 / 17 / 7 PASS |
| External JSON / reconciliation / P12-A | 30 / 19 / 11 PASS |
| RF portability / Staging GC | 18 / 7 PASS |
| Ordered audio / Split-Full / runtime / Staging-ZIP | 13 / 17 / 15 / 21 PASS |
| D0/D1 identity audit | Same baseline Table hash failure at line 229; expected hash unchanged |
| P9 voice/audio UX | Same baseline failure at line 834 after 9 PASS (`David · US` does not match `/Browser TTS/`) |

The baseline regression batch passed the same D4/D3/P9/P12/audio suites before edits, except the two known failures. External/Paragraph acceptance suites were additionally run after implementation. No existing audit assertions or expected hashes were changed.

**Scoped ESLint:** 3 pre-existing errors remain, **0 new violations**. The same files linted against baseline text have the identical violations: ZIP archive service `no-empty` twice (current lines 403/409), Full export filename helper `no-control-regex` once (line 79). All new code files and the other changed files report zero errors/warnings. Full scoped CLI exits 1; the baseline-comparison check exits 0. No rules were weakened and unrelated lint cleanup was not mixed in.

**Production build:** PASS, 1,897 modules transformed. Existing large-bundle/Browserslist-data warnings remain. `git diff --check`: PASS. Node v24.11.1, Windows. Raw logs are retained locally under `.tmp/d5/*.log`; temporary baseline-loader scripts were removed.

## Changed files and diff summary

Eight production files: **217 insertions / 21 deletions** including the new 92-line coordination module. Seven existing-file changes alone: **125 insertions / 21 deletions**. Four new QA files: **407 lines**. Two documentation artifacts. All changes are uncommitted.

| File | Change |
| --- | --- |
| `src/domain/text/textConversationAudioDomain.js` | New persistent Scene validation, profile/RF/physical readiness coordination and ordered Full composition planning. |
| `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js` | Persistent Conversation delegation only; forwards existing/focused configuration. |
| `src/domain/text/textStructuredAudioRuntimeDomain.js` | Optional exact RF selection and binding checks; unchanged legacy default path. |
| `src/domain/text/textStructuredSplitFullDomain.js` | Existing artifact schema-2 composition descriptor/hash/normalization/readiness support; schema 1 preserved. |
| `src/domain/text/textStructuredPlaybackDomain.js` | Optional persistent Unit/Segment/speaker cursor identity. |
| `src/services/audio/textStructuredAudioZipArchiveService.js` | Current expected composed Full requirements, scoped portable attachment. |
| `src/services/audio/textStructuredFullAudioExportService.js` | Optional requested decode/output rate and strict Conversation wrapper over existing WAV builder. |
| `src/services/persistence/textAudioStagingGcService.js` | Preserve exact-RF-valid persistent Conversation undo references; planner only. |
| `scripts/audit-v603-p12d-d5-conversation-audio.mjs` | New 15-scenario Node regression suite (238 lines). |
| `scripts/audit-v603-p12d-d5-browser.mjs` | New isolated Edge/CDP runner, adapted from the existing browser QA pattern (74 lines). |
| `scripts/fixtures/d5/conversation-audio-fixture.js` | Pure v2 audio/profile fixture (30 lines). |
| `scripts/fixtures/d5/browser-audio-cases.js` | Synthetic WAV/browser decoding/session cases (65 lines). |
| `P12D_D5_Audio_Core_Report.md` | This consolidated audit/implementation/verification record. |
| `P12D_D5_Hydrogen_Audio_Handoff.md` | Integration API, source/readiness/identity semantics, safe QA and explicit file-assembly limitations. |

No UI/App/sidebar/player design, provider defaults, Kokoro/Piper/Edge defaults, global TTS configuration, Track B/AI Voice, dependency, database schema constant or live persistence writer changed. Existing executor/runtime/staging/registry/cache structures are reused. The 48 kHz setting is specific to the new derived artifact format, not a global player/provider default.

## Hydrogen integration and activation boundaries

See [P12D_D5_Hydrogen_Audio_Handoff.md](P12D_D5_Hydrogen_Audio_Handoff.md) for exact inputs/outputs. Remaining UI work is to consume the persistent Scene plan, pass current existing preferences, honor per-step voice/rate/runtime bindings in the existing callbacks, refresh/cancel after edits, display readiness separately from metadata, and attach ZIP/Full metadata only against current expected requirements in isolated QA.

**Conditional GO:** isolated multi-Sentence/multi-speaker playback integration can proceed using those contracts. Cached/file Full assembly must remain disabled when `readyToCompose=false`, particularly for partial scope or non-unit playback rates. The existing unit-rate WAV concatenator is supported; rate-aware file assembly is not implemented or falsely advertised. Per-Sentence Full playback supports those rates through the plan and existing engine.

**Production remains NO-GO:** canonical v2 migration/hydration/command/source/backup/audio metadata writers are still unactivated; real storage durability, cross-tab coordination, quota/crash recovery, browser portability and end-to-end real Staging/ZIP/physical readiness integration remain separate existing activation blockers. This task does not certify speech provider output or invoke production generation/storage. The pre-existing lint/audit failures also remain release-gate debt.

Safety closure: `TEXT_LIBRARY_DB_VERSION = 1` and `TEXT_LIBRARY_SCHEMA_VERSION = 1` remain unchanged. Branch/HEAD remain at the requested baseline; no reset, canonical DB access, live v2 write, startup migration, physical audio deletion/real-data GC, provider generation, commit, push, merge or deployment occurred. Stop after this bounded core implementation, verification and handoff.
