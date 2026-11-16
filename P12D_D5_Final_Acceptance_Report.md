# P12-D5 final integration acceptance

Baseline: `81221073637e176bc12ef23b538835a6e0886b2c`, branch `feature/p12-conversation-only`. The initial working tree was clean and HEAD equaled the approved baseline. Review and QA are isolated; canonical DB/schema stay 1.

## Initial findings (recorded before production edits)

| Severity | Baseline source | Finding and reproduction |
| --- | --- | --- |
| P1 | `src/components/text/conversation/useConversationAudioPlayback.js:594` | `playStructuredFullStep` sends the complete Scene to one Browser TTS callback when a cached Full binding cannot play. Bind a matching nonempty corrupt WAV to an exact Full descriptor; play a Scene containing Alice and Bob. Recovery loses Sentence identity, local reuse, speaker profiles and rates. Real-browser regression added before patching. |
| P1 | `src/components/text/conversation/useConversationAudioPlayback.js:46` | `resolveSafeSynth` drops the native `speak` method. The existing Browser TTS service tests for that method, so real UI fallback is classified unavailable even when the device supports speech. Existing injected TTS callbacks conceal the failure. Reproduce with a recording speech device and the actual Browser TTS service, without `executeBrowserTts` injection. |
| P2 | `src/components/text/conversation/useConversationAudioPlayback.js:263` | Snapshot/config/binding changes invalidate only sessions already marked playing/paused. A Play within the existing 120 ms safe-transition delay can start a captured stale plan after snapshot/config replacement. Reproduce by changing fixture data immediately after Play. |
| P2 | `src/components/text/conversation/useConversationAudioPlayback.js:550` | Failure checks read captured React state. A repeated pass in one running session can retry the same failed Full binary despite the state update. Also inspect pause between a binary error and its TTS fallback. Validate with controlled runtime completion in the real-browser harness. |
| P2 | `src/components/text/conversation/ConversationSceneAudioPanel.jsx:190` | After a reproduced decoder failure, the Full cache badge still says `ready` and the route still advertises cached WAV playback. Added an assertion after actual HTMLAudio failure; it fails before the telemetry patch. |

The first four findings were recorded before the playback patch. The cache-indicator finding was recorded and reproduced before its separate, minimal display correction. No P0 was found. Optional styling and refactoring were deferred.

## Targeted patches and verified behavior

1. **Per-Sentence recovery:** `useConversationAudioPlayback.js:551` now rebuilds the existing D5 Scene plan with `allowFullArtifact: false`, keeping Full representation. It executes the resulting Sentence steps through the existing `playStructuredChannel` callback under the same session token. Local RF matches remain preferred; TTS uses each Sentence's existing voice resolver, rate, channel and identity. It neither starts another session nor introduces another engine.
2. **Working native speech adapter:** `useConversationAudioPlayback.js:54` forwards `speak` with the original device receiver, only when that method exists. Unsupported devices remain unsupported. Provider defaults, voice inheritance and global settings are unchanged.
3. **Failure and cancellation handling:** `useConversationAudioPlayback.js:127` mirrors the existing failure telemetry in a synchronous ref, avoiding captured-state retries during repeat passes. `:265` invalidates pending as well as active sessions after snapshot/config/binding changes. `:523` and `:608` check pause and session cancellation before fallback. Stale completions cannot mark a replacement session's bindings failed. Recovery updates the current Sentence cursor before each step, so Stop/Resume does not replay completed fallback Sentences.
4. **Honest Full status:** `ConversationSceneAudioPanel.jsx:153`, with the existing telemetry passed by `ConversationSceneCard.jsx:429`, displays `Full Cache: unavailable-binary` and the per-Sentence fallback route after a known cached-Full error. Metadata is unchanged; inventory/planner readiness and observed playback failures remain separate values.

Cached Full success still produces one `full-local` operation at **1.0x**, without multiplying the configured Scene/speaker schedule again. Failure suppression lasts until snapshot, configuration or runtime bindings change; it is memory-only. No artifact, AudioVariant, RF, Staging record, ID, UID or speaker mapping is rewritten or deleted by these patches.

## Real-browser evidence and before/after results

Browser: **Microsoft Edge 157.0.0.0**, headless Chromium, Windows; Node **24.11.1**. Every runner uses its own disposable browser profile. D5 UI/Core and D4-C browser tests forbid IndexedDB access and report **zero calls**. D3-D uses only separately named `prolingo_text_library_d3b_qa_d3d_*` databases in its disposable profile.

Reproduce against the approved source without changing HEAD or the working tree:

```powershell
node scripts/audit-v603-p12d-d5-ui-browser.mjs --baseline
node scripts/audit-v603-p12d-d5-ui-browser.mjs
```

`--baseline` substitutes the three changed production components from the exact approved commit while keeping the new tests. **Before: 8 PASS / 7 FAIL, exit 1. After: 15 PASS / 0 FAIL, exit 0.** The original three Hydrogen browser checks pass in both runs. A further assertion was run after the recovery patch but before the indicator patch: it failed because the known failed Full cache still advertised Ready; it now passes.

The primary regression mounts the actual React editor, clicks Scene Play, and uses a matching Full descriptor/binding with a nonempty, corrupt disposable WAV. It delegates to the actual HTMLAudio runtime service and observes `status: error`. Recovery also plays a valid, silent Sentence WAV through HTMLAudio. Deterministic installed-voice fixtures and a recording TTS callback verify the following trace:

| Order | Operation | Sentence | Voice | Rate |
| --- | --- | --- | --- | --- |
| 1 | Cached Full, actual decoder failure | whole Scene | composed artifact | 1.0x |
| 2 | Browser TTS callback | `Hello. Welcome.` | Alice / `en-GB-RyanNeural` | 1.0x |
| 3 | Actual local WAV | `Please sit.` | Alice's matching local RF | 1.0x |
| 4 | Browser TTS callback | `Tea?` | Alice / `en-GB-RyanNeural` | 1.0x |
| 5 | Browser TTS callback | `Thank you.` | Bob / `en-GB-SoniaNeural` | 1.4x |

Assertions also verify persistent Unit/Sentence identifiers, Text channel, exact order, no duplicate Sentence operation, preserved snapshot JSON, and corrected Full status. A separate test bypasses the injected TTS callback: the actual Browser TTS service creates native `SpeechSynthesisUtterance` instances and sends four ordered utterances to a recording device adapter, retaining Bob's rate.

The 12 added browser scenarios cover: corrupt Full recovery; successful Full at its contracted rate; native utterance service; pause during Full error and Sentence error; Stop while paused; repeated-pass failure suppression; Stop/Resume cursor; deferred failure after snapshot/config/Workspace/reset changes; and cancellation during the pending 120 ms Play transition for snapshot/config changes. Existing checks cover real 48 kHz composition, readiness presets, non-unit composition gating, and editing during playback.

## Complete verification matrix

Each row is an executed `node scripts/<script>` command. Counts below are scenario counts, not independent assertions or a claim of exhaustive coverage.

| Script | Result |
| --- | --- |
| `audit-v603-p12d-d5-conversation-audio.mjs` | 15 PASS |
| `audit-v603-p12d-d5-audio-ui.mjs` | 5 PASS |
| `audit-v603-p12d-d5-ui-browser.mjs` | 15 PASS |
| `audit-v603-p12d-d5-browser.mjs` | 3 PASS |
| `audit-v603-p12d-d4c-browser.mjs` | 13 PASS + 4 route gates PASS; all 20 editor commands committed through UI |
| `audit-v603-p12d-d4a-conversation-editor.mjs` | 22 PASS |
| `audit-v603-p12d-d4b-conversation-editor-ui.mjs` | 9 PASS |
| `audit-v603-p12d-d3d-regression.mjs` | 12 PASS |
| `audit-v603-p12d-d3d-browser.mjs` | 9 PASS; disposable QA IndexedDB only |
| `audit-v603-p12d-d3c-compatibility.mjs` | 5 PASS |
| `audit-v603-p12d-d3b-content-unit-persistence.mjs` | 11 PASS |
| `audit-v603-p12d-virtual-content-units.mjs` | 12 PASS |
| `audit-v603-p12b-speaker-registry.mjs` | 14 PASS |
| `audit-v603-p12c-conversation-playback.mjs` | 13 PASS |
| `audit-v603-p9b-playback-marathon.mjs` | 24 PASS |
| `audit-v603-p9c-bulk-marathon.mjs` | 17 PASS |
| `audit-v603-round-d3-paragraph-acceptance.mjs` | 7 PASS |
| `audit-v603-beta8-p1-ordered-multi-audio.mjs` | 13 PASS |
| `audit-v603-beta8-p2-split-full-domain.mjs` | 17 PASS |
| `audit-v603-beta8-p3-runtime-playback.mjs` | 15 PASS |
| `audit-v603-beta8-p4-staging-zip.mjs` | 21 PASS |
| `audit-v603-a0-a3-rf-portability.mjs` | 18 PASS |
| `audit-v603-a4-staging-gc.mjs` | 7 PASS |
| `audit-v603-d2-external-json.mjs` | 30 PASS |
| `audit-v603-d3-d4-external-reconcile.mjs` | 19 PASS |
| `audit-v603-p12a-external-reconcile.mjs` | 11 PASS |

**26 passing suites, 361 passing scenarios including four route gates.** GC coverage uses test fixtures/plans, with no physical real-data deletion. Compatibility checks include empty Turns/zero-Unit Scenes, Mixed/Paragraph/Legacy isolation, exact RF and physical-binding rejection, speaker rename/reassignment, sentence/Turn operations, source identity, metadata-only audio, ZIP remapping and Staging references. Existing v1 Conversation/P9 Full policies remain intentionally distinct from persistent D5 Conversation behavior.

Two known baseline failures were rerun and remain separate from those passing suites:

| Script | Unchanged failure |
| --- | --- |
| `audit-v603-d0-d1-text-identity.mjs:229` | Table hash expected `024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767`; actual `faa88212c55ed7f1a4ed782f6ed8614ac58ff89b27833bbfb50b013ce3809133`. |
| `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | Nine checks pass before the existing `/Browser TTS/` label assertion receives `David · US`. |

Neither failing script, its expected values, Table components nor the existing P9 audio controls were changed. These failures match the prior accepted D5 Core report; they are not newly introduced D5 failures.

Additional checks:

```powershell
npx eslint src/components/text/conversation/useConversationAudioPlayback.js src/components/text/conversation/ConversationSceneAudioPanel.jsx src/components/text/conversation/ConversationSceneCard.jsx scripts/fixtures/d5/ui-browser-cases.jsx scripts/fixtures/d5/full-recovery-browser-cases.jsx
node --check scripts/audit-v603-p12d-d5-ui-browser.mjs
npm run build
git diff --check
```

All PASS. Scoped ESLint reports **0 errors / 0 warnings**. The production build transforms **1898 modules** and succeeds. Existing tooling notices concern stale browser-mapping/Browserslist data and the large main bundle; no dependency changes were made. The actual built JavaScript was inspected: the QA preview marker/chunk and D5 Ready-WAV fixture label are absent. D4-C separately verifies both query/hash route gates are hidden in production and visible in development. No production route was opened against a real database.

## Changed files and diff summary

| File | Diff | Purpose |
| --- | --- | --- |
| `src/components/text/conversation/useConversationAudioPlayback.js` | +50 / -30 | Existing-planner recovery, native synth forwarding, synchronous failure telemetry, pause/cancellation and cursor handling. |
| `src/components/text/conversation/ConversationSceneAudioPanel.jsx` | +9 / -4 | Full failure badge and effective fallback route. |
| `src/components/text/conversation/ConversationSceneCard.jsx` | +1 / -0 | Pass existing failure telemetry. |
| `scripts/audit-v603-p12d-d5-ui-browser.mjs` | +19 / -4 | Approved-baseline source substitution; isolated browser autoplay for silent WAV verification; baseline flag in output. |
| `scripts/fixtures/d5/ui-browser-cases.jsx` | +3 / -0 | Register the added recovery acceptance cases. |
| `scripts/fixtures/d5/full-recovery-browser-cases.jsx` | new, 253 lines | Disposable Full/partial-local fixture and 12 focused real-browser scenarios. |
| `P12D_D5_Final_Acceptance_Report.md` | new | This consolidated report. |

Production changes total **+60 / -34 lines across three Conversation files**. Tracked-file diff totals **+82 / -38** across five files; including the new browser fixture, code/test changes total **+335 / -38**, excluding this report. No shared engine/domain, Paragraph/P9, App wiring, schema constant, provider configuration, style or dependency file was modified.

Final Git status (all changes unstaged/uncommitted):

```text
 M scripts/audit-v603-p12d-d5-ui-browser.mjs
 M scripts/fixtures/d5/ui-browser-cases.jsx
 M src/components/text/conversation/ConversationSceneAudioPanel.jsx
 M src/components/text/conversation/ConversationSceneCard.jsx
 M src/components/text/conversation/useConversationAudioPlayback.js
?? P12D_D5_Final_Acceptance_Report.md
?? scripts/fixtures/d5/full-recovery-browser-cases.jsx
```

HEAD remains `81221073637e176bc12ef23b538835a6e0886b2c` on the requested branch. No commit, push, merge, deployment or branch switch was performed.

## Remaining limitations and acceptance decision

**CONDITIONAL GO for isolated D5 integration acceptance and independent review. Canonical IndexedDB v2 activation remains NO-GO.** The reproduced cached-Full decode failure and associated functional integration defects are corrected. No additional demonstrated blocker remains in the verified fixture paths.

The conditions and limits are explicit:

- Native audible voice quality, actual device-installed voice availability, mobile/background audio and OS pause/resume require device QA. The browser tests use deterministic voice lists/recording speech devices; they do not claim audible Alice/Bob synthesis on the host.
- The existing runtime service returns only `played/error/stopped` (`textStructuredAudioRuntimeService.js:31`), without completed-Sentence offsets inside one cached Full file. Recovery from a **pre-play decode/start failure**, and nonduplication of completed **recovery Sentences**, are verified. Exact no-replay recovery after a hypothetical **mid-stream Full error following audible completed Sentences** is not certified: the current API provides no authoritative Sentence boundary/progress information. This remains a constraint on stronger production acceptance; no guessed timestamps or artifact metadata changes were introduced.
- Non-unit per-Sentence playback works; rate-aware combined WAV assembly remains unavailable and correctly gated. No export capability was added to bypass that gate.
- Canonical persistence, production migration/startup, live Staging/ZIP adapter writes and real-data GC were neither activated nor tested. They remain behind the existing production activation gate. `TEXT_LIBRARY_DB_VERSION = 1` and `TEXT_LIBRARY_SCHEMA_VERSION = 1` are unchanged.
- The two existing baseline failures above remain open. Optional visual polish and unrelated refactoring remain deferred.

Work stops here for independent review, with all patches uncommitted.
