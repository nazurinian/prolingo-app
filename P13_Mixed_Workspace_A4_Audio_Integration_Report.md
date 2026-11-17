# P13-A4 — Mixed Workspace Audio Integration

Date: 2026-11-17. **GO for the isolated P13-A5 integration audit.** A4-FULL-01 and A4-RATE-01 are closed with independently failing-then-passing Node and browser regressions. No core audio invariant remains unresolved in the executed matrix. Production Mixed/canonical v2 activation is not authorized.

## Source integrity and execution scope

- Worktree: `C:/Users/HikamSeif/Documents/@ Lain-Lain/2000 Most Frequently Used Words/prolingo-p12-integration-qa`.
- Branch: `feature/p13-mixed-workspace`.
- Required, actual starting and final committed SHA: **`dde282e1bab6ed6c9884435f6d59f435bb2a4c00`**.
- Initial tree was clean. No pending merge/rebase/cherry-pick/revert/sequencer operation was found. No reset, pull, branch switch or additional worktree was used.
- Shared UI worktree remains at `dc3722c173793aed124ae4bee98092377d62b795`; AI Voice remains at `fc8e0350c2d911381b47d14e973132e2b42d7f93`. Existing refs/backups were preserved.
- Read the A0, A0–A2 and A3 reports, then traced the common planner/session, P9 App callbacks, rate/voice resolvers, D5 hook and cursor contract. No broad architecture audit was restarted.
- Both internal checkpoints were completed. Optional checkpoint commits were not created; **all changes remain local and uncommitted**. No push, deployment, merge, P13-A5 implementation or production activation occurred.

## Root causes and before/after evidence

| Finding | Demonstrated cause | Correction and evidence |
| --- | --- | --- |
| **A4-FULL-01, P1** | Paragraph Full legitimately emits `full-tts`, assembled Card content and `segmentId: null`. D5 rebuilt a recovery plan and attempted `items.get(null)`, returning without executing audio. | Execute whole-Card TTS through the existing speech callback with null Sentence/Unit identity. Failed cached Full replans without that artifact and executes either native per-Sentence steps or the planned Paragraph Full utterance. |
| **A4-RATE-01, P2/blocker** | Generic Paragraph steps omitted `playbackRate`; nested Split planning also dropped the caller's rate. D5 defaulted missing step rate to 1. | Generic steps carry the unchanged P9 effective-rate resolver's result. Nested planning forwards rate/preferences/render options. D5 distinguishes raw Full physical rate from composed Full's baked schedule. |
| **Exact-RF gap, P1 for persistent Mixed audio** | A new negative test showed that generic Paragraph compatibility matching accepted a URL whose supplied binding RF contradicted the current render. That legacy route also permitted an otherwise available generated voice outside the current Mixed profile. | Persistent Mixed Paragraphs use the existing download/profile and exact-RF runtime resolver. No RF algorithm/store changed. V1 Paragraph compatibility stays on the existing compatibility branch. Wrong voice/generation rate and physical RF bindings now reject local playback. |
| **Speech failure observability, P2** | Native utterance error completion could leave the source status reporting TTS. | Optional `onError` notification in the existing speech service; D5 records `source: 'unavailable'`, existing `mode: 'unavailable'`, error detail and a log. Missing Speech API likewise remains explicitly unavailable. Completed-utterance late events are ignored. |

The Node regression instantiates the **actual D5 React hook** using React server rendering and executes its existing session callbacks with controlled media functions. Esbuild only resolves the repository's existing extensionless imports; it does not replace the hook or engine. Browser regressions independently exercise effects, state publication and cursor authority.

| Checkpoint | New Node assertions | Real-browser blocker assertions |
| --- | --- | --- |
| Before production edits | **0 PASS / 3 FAIL**: Full had 0 invocations; physical Split rate was 1; planner rate was undefined | **0 PASS / 2 FAIL**: Full had 0 invocations; requested 1.5, observed 1 |
| A4-F only | Full assertion passes; both rate assertions still fail | Full passes at Card precision; rate still fails |
| A4-R | **3/3 PASS** | **2/2 PASS** |
| Expanded final coverage | **11/11 PASS** | **10/10 PASS**, including eight representation/channel traversal combinations and native binary cases |

Original A2 diagnostic probes now observe **1 Full TTS invocation** and **1.5× Split playback**, both `expectationMet: true`. The runner now fails if either original expectation regresses; they are no longer informational unmet expectations.

Additional failing-then-passing checks recorded mismatched Paragraph RF acceptance, native TTS failure status, and a late completed-utterance error notification. These were corrected within this A4 task, without separate hotfix phases.

## Changed files and public contracts

Nine existing code/test files: **+204 / -59**. Two new QA files: **415 lines**. Total excluding this report: **+619 / -59**, eleven code/test files. No dependencies or lockfiles changed.

| File / source reference | Change |
| --- | --- |
| `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js:94` | Reject contradictory supplied Full binding identity. |
| Same file, `:132`, `:156`, `:158`, `:335` | Persistent Mixed Paragraph exact-RF selection; existing effective rates on Split and Full steps; forward nested options; resolve existing download/profile defaults for raw Paragraph Full. |
| `src/components/text/conversation/useConversationAudioPlayback.js:230`, `:318` | Derived `inheritChannelRates` config provenance; use existing EN/ID global-rate preference resolver when no explicit scalar host rate is supplied. This flag participates in existing configuration cancellation. |
| Same file, `:388`, `:549`, `:578`, `:598`, `:645` | Scoped speech errors; respect planner Full voice policy; execute null-Sentence Card TTS; raw versus composed Full rate; retain current planner's recovery sequence. |
| `src/services/audio/audioPlaybackSideEffectService.js:19`, `:45` | Optional `onError` callback; settled-event guard. Existing callers without the callback retain their behavior and speech defaults. |
| `src/components/text/presentation/TextMixedWorkspaceQaPreview.jsx:17`, `:46` | Controlled DEV-only representation/rate/channel controls and Workspace Play using the same host, plus explicit unavailable-state feedback. |
| `scripts/audit-v603-p13-mixed-audio.mjs:1` (new, 176 lines) | Eleven Node scenarios using actual planner/hook/service; rate/profile/cache/source immutability assertions. |
| `scripts/fixtures/p13-mixed/audio-browser-cases.jsx:1` (new, 239 lines) | Ten browser scenarios; traversal, cursor/session, unavailable/error and real WAV playback evidence. |
| `scripts/audit-v603-p13-mixed-workspace-browser.mjs:11` | `--audio` entry, safe headless media policy for that entry, real QA control/DOM continuity gates, original diagnostic failure enforcement. |
| `scripts/fixtures/p13-mixed/browser-cases.jsx` | Preserve original two blocker probes as passing-required regressions; wait for invocation/completion rather than the obsolete recovery warning. |
| `scripts/fixtures/p13-mixed/editor-browser-cases.jsx` | Remove obsolete claim that A4 findings remain unresolved. A3 does not claim Full/rate coverage; it points to this suite. |
| `scripts/fixtures/d4c/browser-interactions.jsx:63`, `:178` | Bounded receiver-snapshot/DOM synchronization and diagnostics for an observed compatibility harness race; assertions unchanged. |
| `scripts/audit-v603-p12d-d4c-browser.mjs:11` | Read-only `--p13-a4-baseline` source comparison against the pinned A3 SHA. No branch/worktree mutation. |
| `P13_Mixed_Workspace_A4_Audio_Integration_Report.md` | This report. |

The command/editor model, persistent hierarchy, UIDs, Segment ownership, AudioVariant associations, stored RFs and Full artifacts are unchanged. New audio-plan fields and transient status/configuration are derived only. No second registry, cache, engine or audio host was introduced.

### Full / Split fallback matrix

| Card/path | Audio policy | Audible precision |
| --- | --- | --- |
| Paragraph Split | Exact current local match in persistent Mixed; otherwise existing Browser TTS voice resolution per Sentence | Segment + actual parent Section |
| Paragraph Full, compatible raw cache | Reuse binary at effective P9 physical rate | Card only |
| Paragraph Full, no cache, some valid Split locals | Existing planner's authored sequence of local Split and individual TTS steps; Full voice policy ignores Sentence override | Segment for the actual per-Sentence step |
| Paragraph Full, no usable Split locals / TTS-only | One existing P9 assembled Full utterance per channel; null Sentence and Unit IDs | Card only |
| Paragraph cached Full fails | Exclude failed artifact for active attempt; replan with `allowFullArtifact: false`; use the two preceding fallback routes | Actual fallback's precision |
| Conversation Split | Existing per-Sentence exact local or speaker-specific TTS steps | Segment + actual Speaker Turn |
| Conversation Full, current composed cache | Exact composition fingerprint and physical binding; playback **1×** because schedule rates are baked | Card only |
| Conversation Full, missing/stale/unusable cache | Existing ordered per-Sentence local/TTS plan with each speaker/rate/channel preserved | Authoritative Segment precision |
| Missing speech API / failed native utterance with no usable local source | Explicit unavailable/error status and log; no fabricated success or audible highlight | None |

Failure records are transient host state. Playback never deletes or rewrites cache files, RFs, artifact metadata or Staging records. Completed recovery Sentences are not replayed; pause holds advancement, and stop/new session/snapshot/Workspace/configuration changes invalidate old callbacks.

Manual Sentence Play retains D5's existing Split-scoped behavior even when Workspace representation is Full. Manual Card Play honors current representation and existing one-shot channel signatures.

### Effective-rate precedence

The existing `resolveTextStructuredEffectivePlaybackRate` remains authoritative and unchanged:

| Priority | Existing setting |
| --- | --- |
| 1 | Card speaker ID channel rate |
| 2 | Card legacy speaker-label channel rate |
| 3 | Card channel rate |
| 4 | Workspace speaker ID channel rate |
| 5 | Workspace legacy speaker-label channel rate |
| 6 | Workspace channel rate |
| 7 | Explicit host global rate, or existing P9 EN/ID global preferences when the scalar is omitted |

Conversation sync/master-speaker resolution remains unchanged. Values retain the existing 0.5–2 clamp and tenth rounding. Direct Segment channel-rate metadata is **not supported by the existing resolver**; the regression proves it does not silently become a new override. Segment speaker identity can participate in the existing speaker profiles. No new rate policy was invented.

Local and TTS steps consume the same resolved playback rate. EN/ID profiles remain independent. A test with Card rates 1.7/1.3 overrides Workspace 1.2/0.8 and global 1.5; with Card overrides removed it uses 1.2/0.8. Omitted scalar host rate correctly uses legacy global channel preferences 1.4/0.7.

Provider generation rate/pitch are distinct RF inputs. Changing them rejects incompatible stored renders. Changing a raw Full physical playback rate does not pretend that it was baked into the file. Changing a composed schedule changes its Full fingerprint; a matching composed artifact always plays physically at 1×.

## Browser binary, session and integrity evidence

The new browser fixture renders a one-second tone with **real OfflineAudioContext**, encodes it with the existing WAV encoder, then uses the existing runtime service and a **real HTMLAudioElement**. The Audio constructor is observed, not simulated; its play/decode/end/error/pause/resume behavior is native. Named-provider TTS is separately deterministic/injected; no listening or provider-quality approval is claimed.

| Native case | Recorded result |
| --- | --- |
| Split local | 48,000 Hz, 48,000 frames, 96,044 bytes, duration 1 s; physical **1.5×**, native pause holds position, resume advances, ended true; no TTS fallback |
| Raw Paragraph Full | Same valid WAV, physical **1.5×**, Card precision, ended true; cache reused once |
| Composed Conversation Full | Fixture declares 1.5× schedule inputs; physical **1×**, Card precision, ended true; no double rate |
| Corrupt cached Full | Native media error code **4**; then valid local Split ends and two TTS Sentences run in order at 1.5×; no artifact mutation |

The composed fixture verifies playback of a declared already-baked schedule; it does not claim that this task implemented non-unit-rate WAV composition.

Traversal covers **Paragraph → Conversation → Paragraph → Conversation**, skipping empty Cards/Units, with Split and Full crossed with EN only, ID only, EN→ID and ID→EN. It verifies actual Segment/channel order, repeated-text identity, blank-meaning omission, parent Section/Turn, Alice/Bob voices, rate, and truthful Card/Segment cursor changes.

Reading Full/Part/Segment changes leave the host/session/active audio intact. Audio representation/rate changes use the existing cancellation policy: stop stale playback, then explicit Play restarts; they do not remount the host or auto-start another session. Workspace switches, accepted Card reorder and Segment edits reject old completions. Restart follows new Card order; edited content cannot reuse its old RF. Late native events from completed utterances cannot overwrite the next Sentence's status.

Every disposable fixture snapshot is checked for immutability. Browser audio/Reader tests deny IndexedDB/localStorage and report **zero calls**. Other D3 browser checks use only separately named disposable QA databases.

## Regression results

Raw evidence: `C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-p13-a4-325a40c9/`.

- Before/after: `before-node.log`, `before-browser.log`, `a4-f-node.log`, `a4-f-browser.log`, `a4-r-node.log`, `a4-r-browser.log`.
- Added integrity negatives: `before-paragraph-rf.log`, `before-native-tts-error.log`, `before-late-tts-event.log`.
- Final core: `p13-mixed-audio.log`, `audio-final-current.log`; earlier serial audio runs `audio-final-1.log` through `audio-final-3.log` each pass 10/10.
- Batch records: `node-summary.json`, `browser-summary.json`. The browser batch retains its original D4 failure; final D4 reruns are separately recorded, not overwritten as green.

### Node — 38 suites, 33 passing and the five established failures

All names below are `scripts/audit-v603-<suffix>.mjs`.

| Suite suffix | Actual result |
| --- | --- |
| `p13-mixed-audio` | **11 PASS**, 0 storage calls |
| `p13-mixed-editor` / `p13-mixed-workspace` | 14 / 18 PASS |
| `p12-a6-main-reader` | 10 PASS |
| `p12-shared-card-a1` / `a2` / `a3` / `a4c` / `a4h` (same prefix) | 13 / 10 / 7 / 11 / 8 PASS |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | 22 / 9 PASS |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | 15 / 5 PASS |
| `p12d-d3d-regression` / `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` / `p12d-virtual-content-units` | 12 / 5 / 11 / 12 PASS |
| `p12c-conversation-playback` / `p12b-speaker-registry` | 13 / 14 PASS |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | PASS / 30 / 19 PASS |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | 7 / 20 PASS |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | 24 / 17 PASS |
| `beta8-p1-ordered-multi-audio` / `beta8-p2-split-full-domain` / `beta8-p3-runtime-playback` | 13 / 17 / 15 PASS |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` / `p10-h5-export-zip-remediation` | 18 / 7 / 21 / 11 PASS; fixture/mocked storage only |

The five historical failures were rerun and left unchanged:

| Suite suffix | Established failure signature |
| --- | --- |
| `beta8-p9-hf4a-card-ux` | Obsolete `setPlayingIndex(step.highlight ?` source-regex assertion at line 82 |
| `beta8-p9-hf4c-r1-ui-repair` | Expected version `...hf4c-r1`, actual `...hf4d` |
| `d0-d1-text-identity` | Existing Table checkout hash mismatch at line 229, expected `024aa45b...`, actual `10d82e76...` |
| `beta8-p9-hf5-voice-audio-ux` | Expected `/Browser TTS/`, actual `David · US` |
| `beta8-p9-hf4c-player-audio-ux` | Expected version `...hf4c`, actual `...hf4d` |

No expected hash, version or historical assertion was changed.

### Browser matrix

| Suite suffix / arguments | Final evidence |
| --- | --- |
| `p13-mixed-workspace-browser --audio --check-production` | **10 PASS**, native evidence above, 4 route/control gates, production exclusion PASS; repeated serially |
| `p13-mixed-workspace-browser --check-production` | 11 PASS, 15 completed reveals, 4 gates; both original audio probes now pass |
| `p13-mixed-workspace-browser --editor --check-production` | 11 PASS, failed-draft/async locks and Reader integration, 4 gates |
| `p12-a6-main-reader-browser` | 12 PASS, real App Text path |
| `p12d-d5-browser` / `p12d-d5-ui-browser` | 3 / 15 PASS; Cached Full recovery, native runtime, pause/resume and stale-session cancellation |
| `p12d-d4c-browser --check-production` | Final **five consecutive 13/13 PASS** after the harness synchronization correction below; all 20 commands and 4 route gates |
| `p12-shared-card-a1-browser` / `a2-browser` / `a3-browser` / `a4c-browser` / `a4h-browser` (same prefix) | 7 / 10 / 8 / 12 / 6 PASS; includes original Paragraph interactions, completed reveal and D4/D5 Reader bridges |
| `p12d-d3d-browser` | 9 PASS, disposable QA databases only |

### Investigated compatibility timing failure

The initial D4 browser batch returned **11/13**, at Turn merge and its dependent all-command coverage check. An unchanged rerun passed. Four more runs produced pass/fail/pass/pass. This was investigated separately from historical debt.

Five controlled source-pinned runs against A3 passed. Current-source diagnostics then reproduced the failure with an **enabled, connected** Merge button, `contentUnit.merge` submitted, a successful receipt explicitly removing `UNIT_000006`, and no UI error. The test still read the preceding snapshot from `control`, which Harness updates in a React effect after its synchronous receiver records the receipt. Its fixed 20 ms sleep was not a committed-state guarantee.

A first narrow merge wait exposed the same observation problem in the next bilingual split assertion. The final test-only correction waits, after an acknowledged click, for the **exact receiver snapshot** to reach the effect observer. The merge also waits for the removed Unit to disappear from DOM. Both are bounded to three seconds; existing content, identity, draft, pending and command-coverage assertions are retained. Deferred/rejected commands without a receipt are not silently treated as successful. No D4 production code changed.

Final controlled series: **5/5 executions, each 13 PASS / 0 FAIL** (`d4c-final-1.log` through `d4c-final-5.log`). Earlier failures and diagnostics remain preserved. This was a newly exposed test synchronization defect, not a sixth historical failure or an unresolved audio defect.

## QA capability gate and production boundaries

Only after the two original blocker regressions passed was the DEV preview widened. Open `?qa=mixed-workspace` or `#qa-mixed-workspace` using `npm run dev`.

- Defaults remain Split / 1× / EN only. Controlled rates are 0.5, 1, 1.5 and 2; both representations and all four channel orders are available.
- The preview owns one existing D5 hook above Editor/Reader. Controls change its existing configuration, without a second host or remount. Settings are in memory, not audio/global/IndexedDB preferences.
- Reading controls remain independent. Audio setting changes stop the current attempt under D5's existing stale-config rule; explicit Play restarts. Pending editor commands disable audio controls.
- Missing/unusable local binaries fall back through existing plans; unavailable API/utterance errors are visible. Metadata alone is not described as physical playback success.
- Non-unit-rate **derived WAV assembly remains gated** by the existing `rate-aware-assembly-required` restriction. This QA exposes playback, not an unsupported composer; Full can still use a compatible already-baked artifact or its normal fallback.

Canonical `TEXT_LIBRARY_DB_VERSION === 1` and `TEXT_LIBRARY_SCHEMA_VERSION === 1` remain unchanged. There are no changes to App/main routing, canonical persistence/stores/startup, D3/D4 command contracts, source ownership, stored identities, RF algorithms, Staging/ZIP/GC implementation, Table/Legacy/Data Management, A6 dual-reader integration or AI Voice. No actual user audio was generated, deleted or garbage-collected. Native WAVs/invalid blobs are disposable QA data; their temporary URLs are revoked.

Scoped ESLint across all eleven changed code/test files: **exit 0**, no ESLint errors/warnings. The existing stale browser-data notice remains. `npm run build`: **exit 0**, 1,912 modules, `index-CXWrHVQa.js` 1,707.16 kB / gzip 452.03 kB, CSS 118.65 kB. Existing bundle-size/Browserslist advisories remain; repository-wide lint debt is not claimed clean. `git diff --check`: PASS. Production scans exclude the QA editor/preview and its controls.

## Reproduction and remaining limits

```powershell
node scripts/audit-v603-p13-mixed-audio.mjs
npm run build
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --audio --check-production
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --check-production
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --editor --check-production
node scripts/audit-v603-p12d-d4c-browser.mjs --check-production
# Read-only source comparison; does not reset or switch branches:
node scripts/audit-v603-p12d-d4c-browser.mjs --p13-a4-baseline
```

Manual visual/Android/device acceptance and real speech-provider listening remain deferred at the user's direction. Native binary decode/rate/pause/error paths are exercised; deterministic named-speaker TTS assertions do not certify device-installed voice quality. Existing runtime URL/Blob bindings are used; this isolated QA does not open the user's Staging/ZIP/folder sources. Their portability and GC domains pass controlled compatibility tests. Production runtime sourcing and canonical v2 activation remain separate gates.

**Final recommendation: GO for P13-A5's isolated integration audit.** Both A4 checkpoints and the bounded Mixed audio matrix are complete. Preserve the five historical failures as separate debt. All task changes remain uncommitted for review; no P13-A5 implementation, push, deployment or canonical migration has started.
