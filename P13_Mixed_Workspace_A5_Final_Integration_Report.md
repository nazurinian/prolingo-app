# P13-A5 — Final Mixed Workspace Integration Audit

Date: 2026-11-17. **GO for P13 technical closure within isolated QA, and for separately authorized P14 entry.** Two verified playback defects were reproduced and corrected during this audit. All current suites in the executed matrix pass; the five established historical failures remain separate. This verdict does not authorize production Mixed routing, canonical v2 activation, deployment or device certification.

## 1. Exact source and Git integrity

- Worktree: `C:/Users/HikamSeif/Documents/@ Lain-Lain/2000 Most Frequently Used Words/prolingo-p12-integration-qa`.
- Branch: `feature/p13-mixed-workspace`.
- Required, actual starting and final committed HEAD: **`0c3602c6b907ba8155cef7710057448dc68cc346`**. The initial working tree was clean.
- Accepted lineage, verified against Git: `7f3769f0d042bac93a9dd3ddd2f1630ac25b7c02` (P12-A6) → `8b586c6e13375bff57cb8e92712b1726b206b3d1` (A0–A2) → `dde282e1bab6ed6c9884435f6d59f435bb2a4c00` (A3) → `0c3602c6b907ba8155cef7710057448dc68cc346` (A4).
- A6 and original D5 checkpoint `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd` are ancestors. There are no merge commits in the P13 range and no pending merge/rebase/cherry-pick/revert/sequencer operation.
- Preserved refs/worktrees: A6 branch at `7f3769f…`; Conversation branch at `4a7ecff…`; `backup/p12-conversation-before-shared-a5` at `a85bb63…`; Shared UI worktree at `dc3722c173793aed124ae4bee98092377d62b795`; AI Voice worktree at `fc8e0350c2d911381b47d14e973132e2b42d7f93`.
- Committed P13 diff against A6: **31 files, +3,089 / -77**: 17 production files, 10 QA files and four reports. Reviewed changes include the A3 Paragraph split source-detachment correction and the A4 shared planner/TTS changes.
- `git fsck --connectivity-only --no-dangling`, ancestry checks and `git diff --check`: PASS.
- No pull, reset, rebase, branch switch, merge, push or deployment was performed. Optional A5 checkpoint permission was not exercised. **The report, targeted fixes and regression additions remain uncommitted for review.**

All four requested P13 reports were read. Historical statements that A2/A3 audio is limited to Split/1× are checkpoint history; the actual A4 code adds controlled DEV Full/rate playback. Their reports were not rewritten to claim later work retroactively.

## 2. A0–A4 acceptance summary

| Area | Independently verified result |
| --- | --- |
| A0 hierarchy and isolation | Workspace → Card → persistent Unit → Segment. Mixed combines Card types in Workspace order, never Section and Turn kinds inside one Card. |
| A1 projection | Existing A1 selector remains authoritative. Mixed selector requires complete v2, validates graph/UID/speaker references and freezes a detached hydrated tree. No allocation, repair, storage or migration occurs. |
| A2 Reader | Existing shared Full/Part/Segment, bilingual and Part layouts render both Card types. Exact Segment identity pairs EN/ID. Browse/search remain separate from playback. |
| A3 Editor | All-Card state, 22 existing native command types, immutable staging, pending locks, exact async acknowledgement, stale-scope rejection and separate drafts. Reader updates from accepted snapshots. |
| A4 audio | Both original blockers remain fixed: Full invokes audio once with Card precision; requested Paragraph Split rate is 1.5×. Raw/composed Full, fallback order, RF/profile readiness and one-host traversal pass. |
| A5 corrections | Native Android replay event ownership and raw Full renderer/codec propagation now pass new negative and positive regressions. |

## 3. Architecture, identity and authoring findings

Verified source boundaries:

- `src/domain/text/textMixedReaderDomain.js:18` delegates validation/projection to A1, rejects unresolved assigned speaker IDs, and clones before freezing the existing Document Tree.
- `src/domain/text/textMixedEditorDomain.js:19` combines the complete ordered Card list with D4's Conversation-only Scene view. It does not reinterpret `scenes` as the whole Mixed Workspace.
- Same file, `:28`, `:106`, `:118`: scope validation, native command delegation and coordinator. Mutations call `applyTextLibraryCommand` on detached input. Unknown fields, foreign parents/speakers, cross-Card moves, mixed Unit kinds, unsupported conversion and opaque metadata replacement are rejected.
- `src/components/text/mixed/TextMixedWorkspaceEditor.jsx:77` uses separate drafts and the coordinator. It owns no audio hook or storage. Conversation forms and Paragraph Sentence forms reuse D4 implementations.
- `src/components/text/presentation/SharedMixedWorkspaceReader.jsx:11` owns neither commands nor playback. It uses existing validated actions and authoritative cursor adapters.

The executed native command and browser cases verify global Paragraph → Scene → Paragraph creation/reorder/deletion; multiple Sections/Turns/Sentences; intentionally empty Units and zero-Unit Cards; same-speaker adjacent Turns; repeated English text with distinct IDs; blank meanings; `joinAfter`; split/merge adjacency and kind constraints; Speaker registry rename/reassignment/reset/removal; failed-draft recovery; rejected/malformed/duplicate/stale async results; and immediate Reader reprojection after accepted edits.

Retained Card/Unit/Segment IDs and UIDs remain stable. Segment membership comes from `unitId`, not text, speaker label or position. Native creation allocates identities; explicit merges/deletes retire only their documented logical entities. Last-Sentence deletion preserves an empty Unit. Empty Card materialization survives subsequent selection/commands.

Audio/source checks verify channel-specific invalidation rather than broad metadata destruction. The new A5 test edits only English: matching text audio is invalidated, meaning audio remains exact, Segment UID/parent/meaning/joinAfter/source metadata remain intact, and Scene Full metadata is retained for subsequent readiness validation. Existing A3 tests additionally verify Text Pack sync and External JSON reconciliation after Paragraph splits.

V1 Paragraph virtual Sections remain read-only and are not persisted. Mixed requires complete persistent v2. Corrupt/partial/foreign data fails closed. No production identity or data-model defect remains demonstrated after the targeted corrections below.

## 4. New findings, reproduction and dispositions

### A5-F1 — P1: old Android utterance events could complete a resumed logical Sentence

**Baseline references:** `src/services/audio/audioPlaybackSideEffectService.js:45` and `:88–106`.

The suspended guard ignored cancellation events only while `replayState.suspended` was true. Resume cleared that flag before the 25 ms replacement deferral elapsed. A delayed error/end from the cancelled utterance could then finish the still-active logical Sentence, remove its replay resolver and prevent replacement speech from starting. It could also finish a replacement after it had started. The A4 settled guard protected already-completed promises, not successive native utterances within one pending promise.

Reproduced through the actual shared pause/resume services with `onError` both present and absent. Real-browser tests reproduce it in D5 whole-Card Full, D5 Sentence Split and a legacy service caller without the callback. No claim is made that A4 originally introduced this older edge condition; it is verified at the pinned A4 baseline and directly concerns the shared lifecycle under audit.

**Minimal fix:** a private native-utterance generation is captured by each end/error callback and invalidated before Resume unsuspends/restarts. Only the active native utterance can complete the logical promise. This does not create a playback session, engine, stored ID or cursor authority. Current utterance errors still report unavailable; obsolete cancellation events do not.

Final source references: service `:35`, `:46`, `:67`, `:99`. Tests also cover repeated replay, desktop native pause/resume, explicit cancellation before deferred startup, selected voice fallback, live `rateRef` precedence, normal completion and callers without `onError`.

### A5-F2 — P2: raw Full readiness ignored requested codec/renderer configuration

**Baseline references:** `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js:77`, `:429`; `src/domain/text/textStructuredSplitFullDomain.js:273`.

The planner accepted `codecProfile` and `rendererVersion`, but the raw Full readiness chain did not forward them into the existing expected-artifact descriptor. A cache matching default settings remained `full-local` after the caller requested different settings.

**Minimal fix:** forward both optional values through the existing planner/readiness helpers into `buildTextStructuredFullArtifactIdentity`. Defaults and fingerprint algorithms are unchanged. Stored metadata/UIDs/RFs are not rewritten. Negative tests now reject the old cache, while positive tests accept a matching artifact for the requested non-default configuration and retain the original artifact.

Final source references: runtime planner `:82–95`, `:437`; Split/Full domain `:279–301`. Composed Conversation schedules retain their existing RF/rate identity and non-unit assembly restriction.

### Before/after evidence

| Verification | Before production fixes | After fixes |
| --- | --- | --- |
| Initial A5 Node suite, seven scenarios | **3 PASS / 4 FAIL**: two replay variants, codec and renderer failures | Original seven PASS; expanded final suite **8/8 PASS** |
| New browser suite | **0 PASS / 4 FAIL**: D5 Full replay, D5 Split replay, legacy replay, raw Full configuration | **4/4 PASS**, repeated five times serially |
| Original A4 blockers | Closed in pinned code; rerun required | A2 probes again report 1 Full invocation and 1.5×, both expected behaviors true |

An early post-fix browser assertion compared native SpeechSynthesis's float readback directly with JS `1.2`. Both original and replay read back **1.2000000476837158**. The final test requires exact original/replay equality, the same null/default voice, and a small numeric representation tolerance to the intended input. No source rate/default was changed and no playback assertion was dropped.

## 5. A5 changes

Five existing files: **+29 / -8**. Two new QA files: **179 lines**. Total excluding this report: **+208 / -8**, seven code/test files.

| File | Purpose |
| --- | --- |
| `src/services/audio/audioPlaybackSideEffectService.js` | Fence old native utterance callbacks across Android Resume. No default voice/rate/pitch changes. |
| `src/domain/text/textStructuredRuntimePlaybackPlanDomain.js` | Forward requested raw Full renderer/codec configuration. |
| `src/domain/text/textStructuredSplitFullDomain.js` | Include those existing descriptor inputs in readiness expectations. |
| `scripts/audit-v603-p13-integration-a5.mjs` (new, 114 lines) | Eight focused lifecycle/configuration/data-integrity scenarios. |
| `scripts/fixtures/p13-mixed/a5-browser-cases.jsx` (new, 65 lines) | Four browser reproductions using existing D5 host and native SpeechSynthesisUtterance objects with deterministic provider callbacks. |
| `scripts/fixtures/p13-mixed/audio-browser-cases.jsx` | Optional mobile/native-speech fixture controls and helper exports; default A4 cases unchanged. |
| `scripts/audit-v603-p13-mixed-workspace-browser.mjs` | `--a5` selects the audit cases. No application route added. |
| `P13_Mixed_Workspace_A5_Final_Integration_Report.md` | This report. |

## 6. Audio cross-system acceptance

| Contract | Verification |
| --- | --- |
| Paragraph Split / Full | Exact local or TTS Split steps, mixed local/TTS Full recovery, whole-Card Full TTS assembly, and raw Full cache reuse pass. |
| Conversation Split / Full | Existing per-Sentence speaker voice/rate resolution and composed Full schedule identity pass. Same-speaker Turns remain distinct. |
| Mixed traversal | Paragraph → Scene → Paragraph → Scene in authored order, crossed with both representations and all four channel orders. |
| Rate precedence | Existing Card speaker/channel → Workspace speaker/channel → global hierarchy preserved. EN/ID remain independent. Unsupported Segment channel-rate metadata does not become a new policy. |
| Cached rates | Raw Full uses effective physical rate; composed Full plays physically at **1×**, without applying baked rates twice. |
| Readiness | Metadata-only, missing binary, mismatched voice/generation rate/RF, contradictory binding, stale content/order and now codec/renderer changes reject incompatible cache use. |
| Runtime recovery | Corrupt native cached Full produces media error 4, then ordered valid Split/TTS recovery. No file, RF, metadata or Staging deletion occurs. |
| Cursor | Cached/whole-Card Full has Card precision only. Actual per-Sentence execution resolves its persistent Unit. Stop/stale/foreign/unavailable evidence has none. |
| Sessions | Reading layouts/browsing do not start, reconfigure or cancel audio. Audio settings/snapshot/Workspace changes invalidate stale attempts under the existing host policy. One host remains above Reader/Editor. |
| Speech lifecycle | Desktop pause/resume, mobile logical replay, cancellation, native errors, delayed old callbacks and callback-free callers pass. Live `rateRef` and selected voice behavior remain intact. |

The A4 browser suite again exercises real OfflineAudioContext → WAV → HTMLAudioElement playback: 48 kHz, 48,000 frames, 96,044 bytes; Split/raw Full physical 1.5×, composed Full physical 1×, native pause/resume/end and corrupt-binary recovery. New A5 mobile tests use the production mobile-control branch in headless Edge with deliberately delayed native callbacks; they are not real Android device approval.

## 7. Exact automated matrix

Environment: Windows, Node v24.11.1, headless Microsoft Edge, Vite production build. Raw logs:

`C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-p13-a5-a3681748/`

`baseline-node-summary.json` records the accepted 38-suite baseline. `node-summary.json` records 39 final suites; `p13-integration-a5.log` contains the expanded final eight-scenario run. `browser-summary.json` records every serial browser process. Before/after evidence is retained in `a5-before.log`, `a5-after.log`, `a5-browser-before.log`, `a5-browser-after.log`, and `a5-browser-after-2.log`.

### Node — 39 suites: 34 passing, five historical failures

Every suffix below is an exact `scripts/audit-v603-<suffix>.mjs` command.

| Suite suffix | Result |
| --- | --- |
| `p13-integration-a5` | **8 PASS**, 0 storage calls |
| `p13-mixed-audio` | 11 PASS |
| `p13-mixed-editor` | 14 PASS, all 22 commands |
| `p13-mixed-workspace` | 18 PASS |
| `p12-a6-main-reader` | 10 PASS |
| `p12-shared-card-a1` | 13 PASS |
| `p12-shared-card-a2` | 10 PASS |
| `p12-shared-card-a3` | 7 PASS |
| `p12-shared-card-a4c` | 11 PASS |
| `p12-shared-card-a4h` | 8 PASS |
| `p12d-d4a-conversation-editor` | 22 PASS |
| `p12d-d4b-conversation-editor-ui` | 9 PASS |
| `p12d-d5-conversation-audio` | 15 PASS |
| `p12d-d5-audio-ui` | 5 PASS |
| `p12d-d3d-regression` | 12 PASS |
| `p12d-d3c-compatibility` | 5 PASS |
| `p12d-d3b-content-unit-persistence` | 11 PASS |
| `p12d-virtual-content-units` | 12 PASS |
| `p12c-conversation-playback` | 13 PASS |
| `p12b-speaker-registry` | 14 PASS |
| `p12a-external-reconcile` | PASS |
| `d2-external-json` | 30 PASS |
| `d3-d4-external-reconcile` | 19 PASS |
| `round-d3-paragraph-acceptance` | 7 PASS |
| `beta8-p9-hf4d-navigation` | 20 PASS |
| `p9b-playback-marathon` | 24 PASS |
| `p9c-bulk-marathon` | 17 PASS |
| `a0-a3-rf-portability` | 18 PASS |
| `a4-staging-gc` | 7 PASS, fixture only |
| `beta8-p4-staging-zip` | 21 PASS, fixture only |
| `p10-h5-export-zip-remediation` | 11 PASS |
| `beta8-p1-ordered-multi-audio` | 13 PASS |
| `beta8-p2-split-full-domain` | 17 PASS |
| `beta8-p3-runtime-playback` | 15 PASS |

The five historical failures were verified separately, with unchanged signatures:

| Suite suffix | Actual failure |
| --- | --- |
| `beta8-p9-hf4a-card-ux` | Obsolete `setPlayingIndex(step.highlight ?` source-regex assertion, line 82 |
| `beta8-p9-hf4c-r1-ui-repair` | Expected version `...hf4c-r1`, actual `...hf4d` |
| `d0-d1-text-identity` | Existing Table hash mismatch, line 229: expected `024aa45b...`, actual `10d82e76...` |
| `beta8-p9-hf5-voice-audio-ux` | Expected `/Browser TTS/`, actual `David · US` |
| `beta8-p9-hf4c-player-audio-ux` | Expected version `...hf4c`, actual `...hf4d` |

No historical expected hash/version/assertion was edited. The newly found defects were not classified as historical debt.

### Browser — every final process exits 0

| Exact suite suffix / arguments | Result |
| --- | --- |
| `p13-mixed-workspace-browser --audio --a5 --check-production` | **4/4 PASS in five consecutive serial runs**, 4 DEV/production/control gates per run |
| `p13-mixed-workspace-browser --audio --check-production` | 10 PASS, real binary evidence, 4 gates |
| `p13-mixed-workspace-browser --check-production` | 11 PASS, 15 completed reveals, 4 gates; original Full/rate probes both true |
| `p13-mixed-workspace-browser --editor --check-production` | 11 PASS, native authoring, drafts/async races and Reader update, 4 gates |
| `p12-a6-main-reader-browser` | 12 PASS in real App Text path |
| `p12d-d4c-browser --check-production` | **13/13 PASS in five consecutive serial runs**, all 20 D4 commands and 4 gates per run |
| `p12d-d5-browser` | 3 PASS |
| `p12d-d5-ui-browser` | 15 PASS |
| `p12-shared-card-a1-browser` | 7 PASS |
| `p12-shared-card-a2-browser` | 10 PASS, completed visibility/negative control and routing |
| `p12-shared-card-a3-browser` | 8 PASS |
| `p12-shared-card-a4c-browser` | 12 PASS |
| `p12-shared-card-a4h-browser` | 6 PASS |
| `p12d-d3d-browser` | 9 PASS, disposable named QA databases only |

P12's prior A5/HF1 coverage is retained through the existing palette/presentation and completed-reveal suites; there is no separate new P12-A5 feature under this task. The previously intermittent D4 observer case did not recur in this audit's five-run series. Its A4 committed-state wait and all content/coverage assertions remain unchanged. No production scroll code, fixed sleep workaround or assertion relaxation was added.

### Lint, build and Git checks

- Scoped ESLint covers **30 JS/JSX/MJS files** across the P13 delta and A5 additions: exit 0, no ESLint errors/warnings. The final expanded A5 test files were checked again. Exact file list: `lint-files.txt` in the evidence directory.
- This does not claim untouched App/player/repository-wide lint debt is clean. Existing stale browser-data notices remain.
- `npm run build`: exit 0, 1,912 modules, `index-Bna7SLo-.js` **1,707.37 kB / gzip 452.09 kB**, CSS 118.65 kB. Existing Browserslist and large-chunk advisories remain; no dependency update was attempted.
- Production scans and actual query/hash route gates exclude the Mixed QA preview/editor/controls. Source has both DEV-only lazy import and DEV-only route selection guards.
- Git object connectivity, ancestry, protected-path review and whitespace checks pass. Only the listed A5 files/report differ from the pinned committed HEAD.

## 8. Database, audio and release boundaries

Confirmed unchanged:

- `TEXT_LIBRARY_DB_VERSION === 1`, `TEXT_LIBRARY_SCHEMA_VERSION === 1` (`src/constants/textDatabaseConstants.js:2–3`). Dormant disposable-v2 constants are not canonical activation.
- No canonical store/version/opening/persistence/startup code changed across P13. No automatic migration, repair or real-user Mixed authoring was wired.
- App/A6, package/lockfile, Table/Legacy feature files and Data Management remain unchanged from the A6 baseline. The shared TTS fix enforces the existing replay contract for its callers; it does not change their models, UI or voice/rate defaults.
- No AudioVariant/RF/source ownership rewrite, physical real-audio deletion, Staging cleanup, live GC, provider generation or AI Voice merge occurred.
- P13 Node/browser fixtures are disposable; P13 browser cases reject IndexedDB/localStorage access and report zero calls. D3/A6 persistence checks use controlled disposable QA state, not the user's canonical database.
- Native tone/corrupt binary fixtures are temporary QA blobs; no existing user audio is used or deleted.

## 9. Restrictions and deferred acceptance

1. **Canonical v2 and production Mixed activation remain NO-GO under this task's boundary.** P13 technical closure is not production activation, branch integration or deployment approval.
2. `rate-aware-assembly-required` remains enforced. Non-unit-rate derived WAV assembly is not implemented or exposed. Playback may reuse an already-baked compatible composition at physical 1× or use existing per-Sentence fallback.
3. Mixed editing and audio remain in the disposable DEV preview. Cross-Card Sentence moves and same-Card Section/Turn mixing remain unsupported; source synchronization remains an explicit separate workflow.
4. Manual visual, Android and real-device acceptance are explicitly deferred by the user. Named voice quality, native OS speech timing, background notifications and acoustic correctness are not certified by headless callbacks or tone fixtures.
5. Coverage is precise: the new mobile tests explicitly pass `isMobile: true`. The disposable Mixed preview currently leaves that host prop at its desktop default, whereas D4 passes `compact`. Automatic mobile strategy selection in that preview and actual Android notification behavior remain device-integration checks, not claims established by this audit. The shared mobile branch itself is now regression-tested with and without the optional observer.
6. Runtime URL/Blob bindings and fixture ZIP/Staging/GC contracts pass; this audit does not open or certify real-user lazy Staging/ZIP/folder sources.

These restrictions do not require starting another implementation phase or reversing the user's manual-acceptance deferral. They remain explicit gates before broader device/production claims.

## 10. Reproduction and closure recommendation

```powershell
node scripts/audit-v603-p13-integration-a5.mjs
node scripts/audit-v603-p13-mixed-editor.mjs
node scripts/audit-v603-p13-mixed-audio.mjs
npm run build
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --audio --a5 --check-production
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --audio --check-production
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --editor --check-production
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --check-production
node scripts/audit-v603-p12d-d4c-browser.mjs --check-production
node scripts/audit-v603-p12-a6-main-reader-browser.mjs
```

**Final recommendation: GO for isolated P13 technical closure and separately authorized P14 entry.** A5-F1 and A5-F2 are fixed, current automated verification passes, data/identity boundaries are preserved, and the five historical failures remain documented. Manual/device acceptance and production/canonical activation are separate gates. Changes are left uncommitted; no P14 work has begun.
