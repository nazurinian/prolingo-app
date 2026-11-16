# P12-D4-C integration and acceptance

Baseline/initial HEAD: `2fbee534d62bc861ed33906ec99e929eef887d64`. Branch: `feature/p12-conversation-only`; initial working tree clean.

## Initial integration findings (before fixes)

1. `src/main.jsx:10`: query/hash QA route has no environment gate and includes the isolated preview in a production build.
2. `TextConversationEditor.jsx:185`: external `onCommand` results such as `undefined`, `false`, `{error}` and `{ok:true}` are treated as successful commits. Draft forms close without a valid D4-A outcome.
3. Same handler has no internal pending lock. Overlapping callbacks can run when the parent does not synchronously supply `isBusy`, risking stale snapshot replacement/lost edits.
4. Editor local state is keyed by reusable local IDs. Fixture reset generates new UIDs but can reuse existing Scene/Turn/Sentence component state. Workspace-level draft/error state can also survive switching back to a prior Workspace.
5. Async completions have no session/unmount guard; an old response can reach `onStateChange` after switching/resetting.
6. `ConversationSentenceItem.jsx:311`: failed Sentence merge unconditionally closes its merge panel. The fallback reducer also reports success with no `onStateChange` receiver.

These are focused functional findings; styling/polish and domain redesign are outside this change. Initial D4-B 9, D4-A 22, D3-D 12, D3-C 5, D3-B 11 and D2 12 all pass. D0/D1 hash and P9 voice-label failures reproduce at baseline and will remain unchanged.

## Verified fixes and integration contract

**GO for completing D4 within its accepted isolated-development scope.** No D4 acceptance blocker remains in the tested scope. Canonical v2 activation remains **NO-GO**, as required by D3-D; this change does not expand that authorization.

| Finding | Evidence / minimal correction |
| --- | --- |
| Production QA route | Both query/hash URLs expose QA at baseline. `src/main.jsx:6,11` now gates the lazy import and route predicate on Vite's compile-time `import.meta.env.DEV`. Development servers (including `stable-test`) and the isolated test bundle can display it; default production builds and their preview cannot. No public query/hash can enable a production-disabled route. |
| Malformed async success | `TextConversationEditor.jsx:195` now requires a valid outcome: `{snapshot, result}` with optional `ok:true`; explicit failure is `{ok:false, error}`. It validates the snapshot through the D4-A selector, requires receipt entity/action/selected document ID, verifies Workspace UID, and derives state from the returned snapshot rather than trusting callback projection data. Undefined/scalar/error-only/ack-only/invalid snapshot/invalid receipt/wrong-identity responses cannot close drafts or reach `onStateChange`. |
| Pending concurrency | Synchronous `pendingRef` excludes same-tick duplicate calls, while local pending state disables all existing mutation controls. It composes with parent `isBusy`, releases in `finally`, and does not require a parent to supply its own lock. A repeated click does not overwrite the first operation's result. |
| Reset / Workspace state | `TextConversationEditor.jsx:527` scopes the existing editor session to selected Workspace ID **and UID**. Switching Workspaces or resetting a fixture clears obsolete local drafts, errors, focus and child forms even when local Card/Unit/Segment IDs are reused. It does not rebuild or restyle those components. |
| Late responses | An unmounted-session ref guard ignores completions after switch/reset and prevents stale `onStateChange` publication. Awaited state-receiver rejection is surfaced as failure. Input drafts stay open on rejected commands within the active session. |
| Failed merge / no receiver | `ConversationSentenceItem.jsx:313` closes the merge panel only on acknowledged success. Pure local fallback requires an `onStateChange` receiver; it cannot pretend a discarded snapshot was saved. |

For controlled callback hosts, `onCommand` must return its complete D4-A outcome (or explicit failure). If the host commits internally, it must publish that snapshot through controlled props; if it delegates publication, use `onStateChange`. The editor validates the returned result but cannot undo side effects already performed inside an external callback. Future asynchronous persistence owners must also scope/cancel their own writes; none are wired here.

No D4-A domain logic, commands, identity allocator, source reconciler, audio implementation or style/class names changed. Failure does not trigger any optimistic domain mutation by the UI boundary. Existing Scene/Turn/Sentence forms, selection helpers and command builders were reused.

## Full browser interaction evidence

New reproducible entry: `node scripts/audit-v603-p12d-d4c-browser.mjs --check-production` (run `npm run build` first). It uses installed Edge by default; `D4C_BROWSER_PATH` may select another Chromium executable. It runs real React/ReactDOM and existing components in a real headless Edge DOM, including StrictMode; interaction helpers dispatch DOM clicks, input/change and focused selection events. It is not the minimal DOM used by the 9 D4-B checks.

The runner bundles tests only in memory with existing esbuild, serves them on loopback, uses a fresh temporary browser profile, blocks IndexedDB access with a counted throwing factory proxy, and closes its server/browser. Route tests compile **actual `src/main.jsx`** under DEV true/false with an **App stub**, so normal application startup cannot open the canonical library. Actual production output is separately checked for QA-preview absence. This verifies route selection, not a full production App boot.

Final result: **13 PASS / 0 FAIL**, **4/4 environment route checks**, **20/20 command types successfully committed through UI**, **0 IndexedDB calls**. Production output: `qaPreviewAbsent=true`, one application JS asset, no preview chunk/marker. Browser: headless Edge 157; Node v24.11.1, Windows.

| Browser scenario | Verified behavior |
| --- | --- |
| Async responses | Ten cases: undefined, false, error-only, ack-only, invalid snapshot, invalid receipt, changed Workspace UID, explicit rejection, thrown callback, rejected state receiver. Every failure retains entered draft text, shows an error and publishes no state. |
| Pending double click | Two same-tick submissions invoke one callback. Controls disable until the deferred response resolves; one Scene is created and the draft closes only on success. |
| Workspace switch | Pending old response cannot publish after switching. Returning to the original Workspace does not resurrect its old form. |
| Fixture identity reset | Pending old response cannot replace the reset fixture; new UIDs distinguish reused local IDs. |
| Actual QA preview controls | Reset Fixture removes open drafts; compact/dark switches retain the editor; migration/corrupt/unsupported/missing Workspace guards render expected recovery states and return to Live Fixture. |
| Failed Sentence merge | Correction panel remains mounted on rejection. |
| No state receiver | Unhandled local fallback shows failure and retains the draft rather than claiming a save. |
| Scene workflow | Create zero-Unit Scene, edit title/note, Mixed Scene reorder, explicit Scene deletion, zero-Scene Workspace. Paragraph identity/content/order slot remain intact (the existing domain may update reorder timestamps). |
| Turn / Sentence workflow | Create empty Turn, add multiple Sentences, edit, reorder within Turn without displacing an empty Turn, split/merge/reorder Turns, reassign/reset speakers, move a Sentence, delete audio-backed last Sentence while retaining Turn UID, explicitly delete Turn. |
| Bilingual source workflow | Auto split/merge preserves retained Segment UID/external key, creates local child provenance without copied audio, retains existing RF/AudioVariant UIDs while marking retained audio stale, blocks mismatched translation Auto Split and requires confirmation for explicit blank Meaning parts. |
| Speaker registry | Register, rename across populated/empty Turns while preserving speaker UID, reject in-use removal visibly, remove unused speaker. |
| Manual cursor split | Focused EN and Meaning cursor selections are both required; the created Sentence receives the correct translated tail. Headless focus emulation is enabled for native selection events. |
| Coverage assertion | The successful receipt set equals all 20 exported D4-A command types; attempted/rejected commands alone do not satisfy coverage. |

Command coverage: `block.create/update/delete/reorder`; `contentUnit.create/update/delete/split/merge/reorder/reorderSegments`; `segment.create/update/delete/move`; `conversationSegment.split`; `conversationSegments.merge`; `speaker.register/rename/remove`. The final browser log lists all 20 individually and reports `missingCommands: []`.

Before/after comparison: `--baseline` serves the three audited source files directly from `git show 2fbee534d62bc861ed33906ec99e929eef887d64:<path>`, without altering the worktree or branch. Final suite against baseline: **6 PASS / 7 FAIL**, plus **both production query/hash checks fail**. Final current suite: **13 PASS / 0 FAIL**, all four route checks pass. The original pre-edit run already reproduced the lifecycle failures and exposed both production routes; the corrected/full baseline replay provides the complete comparable evidence.

Raw logs remain locally in `.tmp/d4c/` (Git-ignored): `before-browser.log`, `baseline-final-browser.log`, `after-browser.log`, `before-*.log`, `after-*.log`, `scoped-lint.log`, `build.log`. Browser profiles are isolated in the system temporary directory and contain no user profile data.

## Compatibility verification

All scripts are `scripts/audit-v603-<suffix>.mjs`; counts are script-reported scenarios/checks, not the number of nested assertions.

| Suite | Result |
| --- | --- |
| D4-C real browser (`p12d-d4c-browser --check-production`) | **13 PASS**, 4 route checks PASS, 20/20 successful command coverage |
| D4-B UI (`p12d-d4b-conversation-editor-ui`) | **9 PASS**, unchanged from baseline |
| D4-A (`p12d-d4a-conversation-editor`) | **22 PASS**, unchanged from baseline |
| D3-D (`p12d-d3d-regression`) | 12 PASS |
| D3-D disposable IndexedDB browser (`p12d-d3d-browser`) | 9 PASS in a separate fresh profile / disposable QA DBs |
| D3-C (`p12d-d3c-compatibility`) | 5 PASS |
| D3-B (`p12d-d3b-content-unit-persistence`) | 11 PASS |
| D2 (`p12d-virtual-content-units`) | 12 PASS |
| External JSON (`d2-external-json`, `d3-d4-external-reconcile`, `p12a-external-reconcile`) | 30 / 19 / 11 PASS |
| Speakers / Conversation playback (`p12b-speaker-registry`, `p12c-conversation-playback`) | 14 / 13 PASS |
| Paragraph / P9 (`round-d3-paragraph-acceptance`, `p9b-playback-marathon`, `p9c-bulk-marathon`) | 7 / 24 / 17 PASS |
| Audio / GC (`a0-a3-rf-portability`, `a4-staging-gc`) | 18 / 7 PASS |
| Split/Full / runtime / ZIP (`beta8-p2-split-full-domain`, `beta8-p3-runtime-playback`, `beta8-p4-staging-zip`) | 17 / 15 / 21 PASS |
| D0/D1 Text identity | **Baseline failure unchanged**: final Table hash assertion at line 229. Expected hash was not updated. |
| P9 voice/audio UX (`beta8-p9-hf5-voice-audio-ux`) | **Baseline failure unchanged**: 9 checks pass, then line 834 expects `/Browser TTS/` while output is `David · US`. |

Scoped ESLint across all changed production/QA code: **PASS (0 errors, 0 ESLint warnings)**. The baseline-browser-mapping package emits an existing data-age notice. The standalone test entry has a narrowly documented Fast Refresh exception; no lint config or production rules were weakened. Repository-wide historical lint debt was not part of this scoped check.

`npm run build`: **PASS**, 1,897 modules transformed. Existing stale Browserslist-data and large-chunk warnings remain. Artifact QA absence is asserted by the browser runner after this build. `git diff --check`: **PASS**.

## Changed files, full diff and Git status

Three production files: **53 insertions / 19 deletions**. Two new QA files: **346 lines**. One report and a generated review patch. No dependency/lockfile, domain, persistence service, CSS, Paragraph/Legacy component or Track B file changed.

| File | Change |
| --- | --- |
| `src/main.jsx` | +3/-3: compile-time DEV gating of route and lazy QA import. |
| `src/components/text/conversation/TextConversationEditor.jsx` | +48/-14: strict response validation, ref lock/local busy state, awaited receiver handling, scoped UID session and stale-completion guard. |
| `src/components/text/conversation/ConversationSentenceItem.jsx` | +2/-2: close merge panel on success only. |
| `scripts/audit-v603-p12d-d4c-browser.mjs` | New, 83 lines: isolated Edge/CDP runner, before/after source loading, route-gate and actual build artifact checks. |
| `scripts/fixtures/d4c/browser-interactions.jsx` | New, 263 lines: 13 real-browser scenarios, fixture controller, successful-command coverage assertion. |
| `P12D_D4C_Integration_Acceptance_Report.md` | This consolidated acceptance record. |
| `P12D_D4C_Changes.patch` | Full implementation/test/report diff, excluding the generated patch itself. Reverse applicability checked without applying it. |

Git status on delivery (all changes uncommitted):

```text
 M src/components/text/conversation/ConversationSentenceItem.jsx
 M src/components/text/conversation/TextConversationEditor.jsx
 M src/main.jsx
?? P12D_D4C_Changes.patch
?? P12D_D4C_Integration_Acceptance_Report.md
?? scripts/audit-v603-p12d-d4c-browser.mjs
?? scripts/fixtures/d4c/
```

## D4 closure and remaining D5 boundaries

**GO to close D4 for isolated fixtures/development.** The requested UI/core integration paths now pass real-browser interaction tests. Nonblocking visual/copy polish remains deferred to consolidated review; no redesign was performed.

D5 remains limited by the existing architecture gate: canonical schema/DB v2 migration, live hydration/read/write integration and durability/cross-tab/quota/browser portability are not approved or implemented here. D5 still needs its own multi-speaker voice scheduling, Full composition/cache identity and physical audio-readiness verification. The editor's logical references and stored fingerprints are preserved, but this test does not certify audio generation/playback or real audio storage.

Future async callback owners must protect their own side effects from stale sessions; UI result rejection is not a rollback mechanism for an already-performed external write. Tests cover actual React interaction in Edge and controlled fixture callbacks; mobile touch behavior and other browser engines are not claimed as verified. These are integration limits for later approved work, not unfinished D4 fixes.

Safety closure: branch and HEAD remain at the requested baseline; `TEXT_LIBRARY_DB_VERSION = 1` and `TEXT_LIBRARY_SCHEMA_VERSION = 1` are unchanged. No canonical IndexedDB access, live v2 writes, upgrades, startup migration, audio generation, real audio deletion, real-data GC, Track B changes, commit, push, merge or deployment occurred. D4-C stops after this implementation and verification.
