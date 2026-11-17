# P12 Shared Card UI — A5-C1 Final Integrity & Integration Audit

Audit date: 2026-11-17. Read-only source/test audit; only this report was added to the repository. Prior reports were treated as claims to verify, not acceptance evidence.

## 1. Executive acceptance verdict

**CONDITIONAL GO for final A5 acceptance and a separately approved, controlled return to the Conversation branch.**

- Automated Shared UI, identity, D4/D5, safety and compatibility checks pass, apart from five independently reproduced historical failures. No P0/P1 defect was demonstrated.
- Two nonblocking P2 findings remain: Scene cast changes can change an existing speaker's palette; the A2 scroll test verifies scroll requests after fixed waits rather than completed visibility. Neither justifies an unapproved production patch during this audit.
- Human desktop/Android visual and real-audio acceptance remains outstanding. Headless screenshots and synthetic/gated playback do not constitute that approval.
- Branch integration requires explicit approval and revalidation of the pinned source/target. It was not executed.
- **Canonical IndexedDB v2 and production Conversation activation remain NO-GO / unauthorized.** Shared UI acceptance does not change that gate.

The starting working tree was clean. HEAD stayed `7456c6377f29a5e238551f426dc8c3c1b4c22680`. At delivery the sole working-tree addition is this uncommitted report; production source and tests remain unchanged.

## 2. Source-control and file integrity

### Exact refs and ancestry

| Ref / phase | Verified SHA |
| --- | --- |
| Local `feature/p12-conversation-only`, local `origin/feature/p12-conversation-only`, original D5 checkpoint | `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd` |
| A0 audit | `cb12f95ea6bf3045502b60ee824abe4c1b23695c` |
| A1 foundation | `ef6b0f636eca987d5c2805581a83468caa965160` |
| A2 Paragraph presentation | `28686f9d31053144498ca3e47bbc1010e5d4604f` |
| A2-HF1 | `c0a7d53e2110af4be4a95a39aea6ec86435d9c36` |
| A3 Part / Segment | `a162a7d357f7380440d97d05128d0fef5dfd29f6` |
| A4-C1 Conversation bridge | `eb2f4000bdd29e366a3ae7c15bd87325d7dc83dd` |
| A4-H2, approved A5 audit baseline, local HEAD and local `origin/feature/p12-shared-card-ui` | `7456c6377f29a5e238551f426dc8c3c1b4c22680` |

`git log --format='%H %P %s' a85bb63..HEAD` proves a linear, seven-commit chain in the order above, with no merge commits. `git merge-base feature/p12-conversation-only HEAD` is the original checkpoint; `git rev-list --left-right --count feature/p12-conversation-only...HEAD` is **0 / 7**. `git ls-files -u` is empty. No branch switch, merge, rebase, cherry-pick, commit, fetch, push or deployment was performed. Remote refs above are **local tracking observations**, not a live remote-tip check.

### Complete integration diff

`git diff a85bb63 HEAD`: **45 files, +11,318 / -52 lines**. Of those, 20 application files account for **+4,638 / -52**; 18 files are tests/fixtures and 7 are reports. The complete binary-capable patch, file list and commit parents were saved to the evidence directory as `complete-diff.patch`, `files.txt` and `commits.txt`.

Only five pre-existing application files were modified:

| File | Verified integration change |
| --- | --- |
| `src/components/text/TextParagraphUnifiedReading.jsx:66` | Inline Segment interaction extracted into the shared primitive. Existing Paragraph wrapper, callbacks, colors, underline and display/audio behavior retained. |
| `src/components/text/TextStructuredPlayer.jsx:141` | Optional Shared Paragraph surface, default **off**, with conservative supplied-cursor validation (`:214`). Original Reader remains the default. |
| `src/components/text/conversation/TextConversationEditor.jsx:170` | Optional reader slot, invoked at `:593`; original authoring/command lifecycle retained. |
| `src/components/text/conversation/useConversationAudioPlayback.js:784` | Read-only current-scope accessor added to the existing hook return. No playback executor/planner/recovery change. |
| `src/main.jsx:6` | DEV-only lazy QA entries/guards; production still falls through to unchanged `App` at `:51`. |

Complete new application-file inventory:

```text
src/components/text/presentation/SharedBilingualLayoutToolbar.jsx
src/components/text/presentation/SharedBilingualUnitsBody.jsx
src/components/text/presentation/SharedConversationReader.jsx
src/components/text/presentation/SharedParagraphCardReader.jsx
src/components/text/presentation/SharedPartAndSegmentViews.jsx
src/components/text/presentation/TextSegmentInteraction.jsx
src/components/text/presentation/TextSharedCardReaderQaPreview.jsx
src/components/text/presentation/TextSharedConversationReaderQaPreview.jsx
src/components/text/presentation/sharedCardPresentationUtils.js
src/components/text/presentation/useCardPresentationFollow.js
src/domain/text/textCardPresentationCursorDomain.js
src/domain/text/textCardPresentationDomain.js
src/domain/text/textCardPresentationStateDomain.js
src/domain/text/textConversationReaderDomain.js
src/services/persistence/textCardPresentationPreferenceService.js
```

Complete test/fixture inventory:

```text
scripts/audit-v603-p12-shared-card-a1.mjs
scripts/audit-v603-p12-shared-card-a1-browser.mjs
scripts/audit-v603-p12-shared-card-a2.mjs
scripts/audit-v603-p12-shared-card-a2-browser.mjs
scripts/audit-v603-p12-shared-card-a3.mjs
scripts/audit-v603-p12-shared-card-a3-browser.mjs
scripts/audit-v603-p12-shared-card-a4c.mjs
scripts/audit-v603-p12-shared-card-a4c-browser.mjs
scripts/audit-v603-p12-shared-card-a4h.mjs
scripts/audit-v603-p12-shared-card-a4h-browser.mjs
scripts/fixtures/shared-card-a1/browser-cases.jsx
scripts/fixtures/shared-card-a1/presentation-fixture.js
scripts/fixtures/shared-card-a2/browser-cases.jsx
scripts/fixtures/shared-card-a2/paragraph-reader-fixture.js
scripts/fixtures/shared-card-a3/browser-cases.jsx
scripts/fixtures/shared-card-a4c/browser-cases.jsx
scripts/fixtures/shared-card-a4h/browser-cases.jsx
scripts/fixtures/shared-card-a4h/conversation-ux-fixture.js
```

The seven report files are `P12_Shared_Card_UI_A0_Audit.md`, `P12_Shared_Card_UI_A1_Foundation_Report.md`, `P12_Shared_Card_UI_A2_Paragraph_Report.md`, `P12_Shared_Card_UI_A2_HF1_Report.md`, `P12_Shared_Card_UI_A3_Part_Segment_Report.md`, `P12_Shared_Card_UI_A4C_Conversation_Bridge_Report.md` and `P12_Shared_Card_UI_A4H_Conversation_UX_Report.md`.

### Protected areas

Diff inspection and `git diff --exit-code a85bb63 HEAD -- ...` confirm no change to:

- `src/App.jsx`, canonical DB constants/stores, D3 hydration/persistence, existing Content Unit/command/speaker domains, coverage/RF domains, audio/playback services and audio defaults.
- Original Conversation Scene/Turn/Sentence authoring panels, Scene audio panel and original Conversation QA page. D4 dispatcher logic is identical; only the optional slot was added to its session component.
- Table/Legacy, sidebar, Open Workspace, Data Management, Mixed activation or AI Voice sources. A separate AI Voice worktree was observed in Git's worktree list and left untouched.
- `package.json` and `package-lock.json`. No new rendering, animation or carousel dependency.

There is no present merge conflict: the target is an ancestor, so the pinned integration can fast-forward. The five modified original application files above are the review-sensitive integration points if the target advances later; divergence requires fresh review rather than assuming this conclusion still applies.

## 3. Architecture and identity audit

Verified source path:

```text
Validated snapshot
 -> D4 selector / existing document-tree hydration
 -> A1 frozen read-only presentation projection
 -> Workspace -> Card -> persistent Section / Speaker Turn -> Segment
 -> shared workspace reader -> shared Card surface
 -> Full bilingual body / Part view / Segment view
```

`src/domain/text/textCardPresentationDomain.js:37` validates migration completeness/schema/UIDs, hydrates the existing tree and constructs detached frozen scalar display records and identity indexes. Card/Unit/Segment IDs, UIDs, order, raw text/meaning and `joinAfter` are retained; it allocates no persisted Unit. `locationBySegmentId` records the actual parent Card/Unit. Empty Units and zero-Unit Cards survive. Duplicate text is not a key and never pairs translation by a separate index.

V1 Paragraph compatibility uses a stable virtual **view key**, null persisted Unit ID/UID and original Segment identity. V1 authored Conversation and Legacy are rejected. Corrupt/partial v2 and invalid UIDs are rejected without database repair. The frozen-snapshot, pairing, corruption and mutation command tests pass.

For Conversation, `src/domain/text/textConversationReaderDomain.js:6` first enforces the complete D4 snapshot contract (`src/domain/text/textConversationEditorDomain.js:45`, `:91`), then invokes A1. `SharedConversationReader.jsx:10` supplies that projection to the existing shared workspace renderer. The wrapper explicitly rejects Mixed; A1's pure Mixed Card-order projection remains available but no new Mixed UI entry is enabled. Existing D4 isolated Mixed compatibility is unchanged.

Speaker Turn identity is `unit.id` / `unit.uid` / `unit.viewKey`, with registry identity `speakerId` / `speakerUid`. Same-speaker consecutive Turns remain separate Units; speaker rename/reassignment does not reconstruct Turns. Full headers, Scene Cast and Segment Spotlight consume these projected fields. The palette is ID-derived, but its cast-membership stability limit is recorded in finding P2-01.

`src/domain/text/textCardPresentationStateDomain.js:1` whitelists independent `{ level, bilingualLayout, partLayout }`. No mapping to audio Split/Full, provider, voice, RF or expansion state exists. The guarded optional preference service (`src/services/persistence/textCardPresentationPreferenceService.js:6`) uses its own `prolingo_text_card_presentation_v1` localStorage key, with normalized view fields only; canonical schema and old audio preferences are not reinterpreted.

## 4. Paragraph and Conversation feature matrix

These results combine source inspection, actual Node/browser runs and a headless screenshot review; they are not user visual approval.

| Contract | Paragraph evidence/result | Conversation evidence/result |
| --- | --- | --- |
| Full, one outer Card without nested Unit/Sentence boxes | Shared continuous body; original Reader remains operational/default | One Scene article, unboxed Turn headings/open rails; separate same-speaker Turns and explicit empties |
| Part Horizontal Focus | Native scroll-snap, identity selection, offscreen inertness, arrow navigation pass | Same renderer, actual Turn IDs, speaker context, consecutive/empty Turns pass |
| Part Vertical Focus / List | Active/neighbor or ordinary list behavior passes | Shared implementation, type-aware Scene/Turn boundaries and speaker headers pass |
| Segment | Focused Sentence, persistent/virtual Section context and explicit play pass | Correct persistent parent Turn, line count and Speaker Spotlight pass |
| Combined / Separated / EN Only / ID Only | All pass; blank meaning and duplicate text retain identity | All pass; attribution in both separated flows, blank meaning and duplicate text handled |
| Manual browse versus audible cursor | A3 selection/grace/follow tests pass | C1/H2 live D5 tests pass; browse does not play or change audible identity |
| Search reveal and user navigation grace | A2/A3 pass; five serial A2 runs and settled-reveal probe below | H2 and supplementary reveal probe pass; 1800 ms grace retained |
| Keyboard/focus/copy/disabled targets | Original and shared primitive checks pass | Inherits primitive; navigator keyboard and inert offscreen checks pass |
| Mobile layout/touch support | 320/375 px, wrapping/large text and native scroll support tested | Same plus speaker chips/Spotlight; actual Android gestures/listening remain manual |
| Highlight and cursor precision | Scoped opt-in cursor required; missing scope yields none | D5 observer/session-scoped adapter; cached Full Card-only, per-Sentence Segment-only |
| Coverage | Exact READY only; HF1 historical/metadata/profile/stale/missing tests pass | Shared surfaces support host coverage; current thin Conversation wrapper does not forward a coverage map, so its integrated header does not claim Ready. Actual readiness remains in the original D5 panel |
| Speaker palette / unassigned / Scene Cast | Not applicable to Section identity | Rename/reorder/reassignment and neutral unassigned presentation pass; membership-change color instability noted below |
| Production availability | Existing Paragraph unchanged by default; new presentation opt-in | QA-only preview; no production Conversation route activated |

`SharedCardReadingSurface` dispatches to the shared body/Part/Segment implementations at `src/components/text/presentation/SharedParagraphCardReader.jsx:169`, `:186`, `:202`. `TextSegmentInteraction.jsx:8` retains Segment-ID-only activation, Enter/Space handling, disabled/tab/focus states, wrapped decoration and indigo/emerald semantics. `SharedPartAndSegmentViews.jsx:325` uses native scroll settling; `:382` makes offscreen slides inert. Scene Cast is rendered at `SharedParagraphCardReader.jsx:405`; Speaker Spotlight at `SharedPartAndSegmentViews.jsx:901`.

Headless screenshots inspected during this audit show the cohesive Full Scene, mobile dark Part navigation and Segment Spotlight with speaker attribution. Human comfort, Android behavior, contrast/accessibility conformance and real audible synchronization are still unverified.

## 5. D4 / D5 and release-boundary safety

- D4 remains the authoritative edit/test host. `TextConversationEditor.jsx:299` locks pending commands; `:327` validates successful async outcomes and Workspace UID before publishing state. Failed drafts and rejection/retry behavior pass with the reader mounted. All 20 supported commands execute successfully in the D4-C browser suite.
- One D5 hook remains at `TextConversationEditor.jsx:253`. The shared reader has no playback hook/session. The optional slot at `:593` receives the same snapshot, validated editor state, audio host and busy flag.
- `useConversationAudioPlayback.js:784` reads existing session refs only. It checks token/context, Workspace, snapshot, bindings and normalized config freshness before exposing current scope. C1's cursor bridge (`textConversationReaderDomain.js:15`) requires matching status/session/document; it supplies no index fallback.
- `textCardPresentationCursorDomain.js:25` keeps cached Full at Card precision without timestamps. Current per-Sentence Split and Full fallback resolve the Segment's actual parent via the projection. Stop, stale/foreign/reset scope and unavailable evidence do not nominate a Sentence.
- Sentence activation delegates exactly to `playSentence(segmentId)`; it does not invent a channel argument. Scene actions delegate to `playScene(cardId)` or the existing one-time `playbackChannelMode` override (`textConversationReaderDomain.js:29`; host signatures at `useConversationAudioPlayback.js:700`, `:718`). Speaker voice, rate, provider and channel resolution were not changed.
- Layout changes preserve the D5 session token, active runtime invocation and cancellation counts in live-host browser tests. View changes do not write content or alter audio config. Real corrupt Full HTMLAudio recovery and cancellation tests also pass.
- QA routing is DEV-gated at `src/main.jsx:6`, `:10`, `:14`, `:19`; production falls through to unchanged `App`. Runtime route tests compile DEV/production entries with a safe App stub to prevent canonical DB startup; production artifacts are separately scanned. This is not a live production-data startup test.
- `src/constants/textDatabaseConstants.js:2` and `:3` are exactly **1**. Dormant v2 constants are not activation. No automatic canonical migration/repair/write was added or executed.
- A1–A4 UI browser tests report zero IndexedDB/storage calls. D3-D persistence tests use only `prolingo_text_library_d3b_qa_d3d_clone_failure`, `_migration`, `_partial`, `_v1_restore` and `_corruption` in a disposable browser profile. No canonical DB was opened by the audit.
- RF/coverage, Full WAV, Staging/ZIP/GC and existing audio services are unchanged against the original checkpoint. Those regressions use disposable fixtures/mock services; no real audio was generated, deleted or garbage-collected.

## 6. Executed regression matrix

Environment: Node **24.11.1**, Vite **7.2.6**, headless Microsoft Edge **157.0.0.0**, Windows. Browser runs were serialized with disposable profiles. Evidence root:

```text
C:\Users\HikamSeif\AppData\Local\Temp\prolingo-a5c-evidence-fcf0d05381d64cec9f3ae3229fdbfd68
```

Commands below use `node scripts/audit-v603-<suffix>.mjs`. Individual stdout/stderr logs, `node-results.json`, `browser-results.json`, `a2-repeat-results.json` and `lint-results.json` are retained in that scratch directory.

| Node suite suffix | Actual result |
| --- | --- |
| `p12-shared-card-a1` | 13 PASS |
| `p12-shared-card-a2` (includes HF1) | 10 PASS |
| `p12-shared-card-a3` | 7 PASS |
| `p12-shared-card-a4c` | 11 PASS |
| `p12-shared-card-a4h` | 6 PASS |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | 22 / 9 PASS |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | 15 / 5 PASS |
| `p12d-d3d-regression` / `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` | 12 / 5 / 11 PASS |
| `p12d-virtual-content-units` | 12 PASS |
| `p12c-conversation-playback` / `p12b-speaker-registry` | 13 / 14 PASS |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | PASS / 30 checks PASS / 19 checks PASS |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | 7 / 20 PASS |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | 24 / 17 PASS |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` | 18 / 7 / 21 checks PASS |
| `p10-h5-export-zip-remediation` | 11 PASS; deliberate rollback-failure logs expected |

**31 Node suite executions: 26 passing suites and 5 historical failures**, detailed below. The A2 denied-storage warning is a deliberately injected test case, not an unexpected failure.

| Browser suite suffix | Actual result |
| --- | --- |
| `p12-shared-card-a1-browser` | 7 PASS, zero DB/storage calls |
| `p12-shared-card-a2-browser --check-production` | Five serial runs: each 8 PASS + 4 gates; production exclusion PASS |
| `p12-shared-card-a3-browser --check-production` | 8 PASS + 4 gates; production exclusion PASS |
| `p12-shared-card-a4c-browser --check-production` | 12 PASS + 4 gates; production exclusion PASS |
| `p12-shared-card-a4h-browser --check-production` | 6 PASS + 4 gates; production exclusion PASS; five screenshots captured |
| `p12d-d4c-browser --check-production` | 13 PASS + 4 gates; **20/20 commands** covered; production exclusion PASS |
| `p12d-d5-browser` | 3 PASS, including real Web Audio decode/composition and binary/RF checks |
| `p12d-d5-ui-browser` | 15 PASS, including real corrupt Cached Full recovery, multiple voices/rates, pause/resume and cancellation |
| `p12d-d3d-browser` | 9 PASS, disposable QA databases only |

There are **81 unique passing browser cases and 20 distinct route-gate checks**, with additional A2 repetitions. No new regression-suite failure occurred. Supplementary scroll probes are described separately rather than counted as existing suite cases.

Build: `npm run build` **PASS**, 1906 modules; `index-Dfn_xuY-.js` 1696.67 kB / 448.62 kB gzip and `index-E2W4hf70.css` 118.56 kB. Existing outdated browser-data and large-chunk advisories remain. DEV preview markers/chunks are absent from production output; common shared-renderer code being present is not Conversation activation.

Scoped ESLint: **19 of 20 changed application files are clean, 0 errors/0 warnings**. `TextStructuredPlayer.jsx` has **17 errors/3 warnings both at the original D5 checkpoint and at audited HEAD**, confirmed with the ESLint API on `git show` source and current source. Existing lint debt is not represented as a newly clean file. `git diff --check` passes.

### Historical failures independently reproduced from D5

All five failures were rerun from an archive of `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd`, using the same installed dependencies. Byte-sensitive Table files used matching checkout line endings. The archive and baseline logs are in the evidence directory; the real source tree was not reset or edited.

| Audit | Baseline and current failure |
| --- | --- |
| `scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs:82` | After 9 passes, old source regex expects `setPlayingIndex(step.highlight ?`. |
| `scripts/audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33` | Expected version `...hf4c-r1`; actual `...hf4d`. |
| `scripts/audit-v603-d0-d1-text-identity.mjs:229` | Expected Table hash `024aa45b...`; actual `faa88212...` in both checkouts. No Table/hash edits. |
| `scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | After 9 passes, expects `/Browser TTS/`; actual `David · US`. |
| Additional old `scripts/audit-v603-beta8-p9-hf4c-player-audio-ux.mjs:35` | Expected version `...hf4c`; actual `...hf4d`; stops at obsolete version assertion. |

## 7. Scroll-focus stability investigation

The observed historical transient was not assumed resolved merely because a prior rerun passed.

### Unmodified test, five consecutive serialized runs

Each run executed the complete original A2 browser script with `--check-production`, a fresh profile, the same final built CSS and the same default 1280×800 test viewport. Build/Node regression work had finished; no other browser suite ran concurrently. No assertions, waits or production code were changed.

| Run | Duration | Browser cases | Gates | Failure |
| --- | --- | --- | --- | --- |
| 1 | 8.16 s | 8/8 | 4/4 | None |
| 2 | 8.44 s | 8/8 | 4/4 | None |
| 3 | 8.03 s | 8/8 | 4/4 | None |
| 4 | 8.62 s | 8/8 | 4/4 | None |
| 5 | 8.39 s | 8/8 | 4/4 | None |

### What the test proves, and what it does not

`scripts/fixtures/shared-card-a2/browser-cases.jsx:34` waits 50 ms after rendering; `:348` adds 100 ms before checking a center-scroll request, and `:381` adds 80 ms before checking channel-qualified follow. `:349` and `:384` assert the target/options received by `scrollIntoView`; they do **not** assert final geometry or animation completion.

Production follow schedules an animation frame and requests smooth center/nearest scrolling (`src/components/text/presentation/useCardPresentationFollow.js:17`, `:31`, `:96`, `:131`). The opt-in host retains its own existing search-reveal effect (`TextStructuredPlayer.jsx:168`). The test's short lifetime can therefore end before smooth scrolling reaches the target.

A sixth, otherwise unchanged A2 suite execution was observed by a separate CDP client. A native `scrollIntoView` wrapper delegated unchanged calls and recorded geometry/timestamps only. It passed 8/8 and all gates. `a2-scroll-observations.json` records six requests. For example, the explicit EN target started around y=1354 in a 240 px scroll container; after approximately 104 ms of a subsequent center request it was still around y=1205 with container scrollTop=153, then the test removed the target. The correct ID `nearest` request also occurred. This confirms that a passing request assertion does not prove settled reveal.

### Supplementary completed-reveal probe

A separate scratch harness bundled the unchanged DEV entry with a safe App stub, mounted the actual Paragraph/Conversation QA previews, clicked their real layout/search controls, and sampled scroll/target geometry through one second. It did not replace or weaken existing tests. All **12/12** cases reached the target inside the viewport and outside any inert slide; DB calls were zero.

1280×800 viewport, document scrollTop=0 before each reveal; one-second results:

| Reader / view | Final scrollY | Target top–bottom | Revealed |
| --- | --- | --- | --- |
| Paragraph Full Combined | 926 | 387.92–411.92 | Yes |
| Paragraph Full Separated | 691 | 388.03–412.03 | Yes |
| Paragraph Part Horizontal Focus | 885 | 387.92–411.92 | Yes |
| Paragraph Part Vertical Focus | 1335 | 387.92–411.92 | Yes |
| Paragraph Part Vertical List | 1305 | 387.92–411.92 | Yes |
| Paragraph Segment | 604 | 384.00–415.00 | Yes |
| Conversation Full Combined | 824 | 372.45–427.77 | Yes |
| Conversation Full Separated | 697 | 371.94–428.33 | Yes |
| Conversation Part Horizontal Focus | 554 | 371.88–427.19 | Yes |
| Conversation Part Vertical Focus | 780 | 372.61–427.92 | Yes |
| Conversation Part Vertical List | 1068 | 372.45–427.77 | Yes |
| Conversation Segment | 531 | 328.88–470.27 | Yes |

Typical smooth scrolling was still moving at 150–300 ms and settled near the viewport center by 600–1000 ms. Reduced-motion behavior is separately covered by the unmodified A2/H2 suites.

**Conclusion:** the original failure did not reproduce. The fixed waits/request-only assertion are a verified timing/coverage weakness; the earlier failure's exact cause remains unproven. No persistent production UI race was observed, and these results do not justify a production fix. Five passing runs cannot exclude rare scheduler/device failures. A future test improvement should retain existing request assertions and also wait for bounded settled visibility; it was not implemented here.

Probe code/logs are external scratch artifacts: `observe-a2-scroll.mjs`, `a2-observed.log`, `a2-scroll-observations.json`, `probe-settled-scroll.mjs`, `scroll-settled-probe-results.json`. Repository tests are unchanged.

## 8. New findings, severity and disposition

**P0: none demonstrated. P1: none demonstrated.** No verified ID/UID loss, canonical DB activation, command lifecycle regression, duplicate audio host or stale audible-highlight defect was found.

### P2-01 — Speaker palette can change when Scene cast membership changes

Source: `src/components/text/presentation/sharedCardPresentationUtils.js:150`, `:162`, `:173`, `:178`; consumed by Full/Part/Spotlight and Scene Cast.

The map hashes persistent speaker keys but resolves collisions against the lexically sorted speakers currently in each Card. Rename and reorder are stable, as tests show. Adding another speaker can occupy an earlier slot and shift an existing speaker's palette, while another Scene using the same registry identity retains its previous color.

Reproduction used the actual validated H2 fixture and existing D4 commands in memory: register `SPK_00000003`, create an empty Turn for that speaker in Scene 1, then reproject. Existing `SPK_A9FC29F9` changed **orange → cyan** in Scene 1 and remained **orange** in Scene 2. Existing Turn UIDs and speaker assignments were unchanged. Evidence: `speaker-palette-probe.json`.

Impact: visual speaker recognition can change after a legitimate cast edit; not audio/data identity corruption. The standard showcase has no initial collision and the existing tests cover rename/reorder/reassignment, not this membership case. Nonblocking for isolated acceptance if Scene-local colors are accepted; do not promise permanent Workspace-wide speaker colors. A palette-policy decision and targeted test can be reviewed later, without changing persistent speaker identity. No patch was made.

### P2-02 — Scroll regression does not verify completed reveal

Source: `scripts/fixtures/shared-card-a2/browser-cases.jsx:34`, `:348`, `:349`, `:381`, `:384`; production timing path above.

The assertion proves a correctly targeted request after fixed waits. It can pass before the target is visible and may be scheduler-sensitive. The prior failure was not reproduced in five serial runs or the extra observed run; all 12 settled-reveal probes succeeded. Treat this as a test reliability/coverage limit, not a proven production race. No production fix or assertion change is required by current evidence; no test was changed.

## 9. Human visual and real-device acceptance

Pending manual checklist; no user approval is implied:

- [ ] On desktop and a real Android device, open the isolated Paragraph and Conversation QA routes in a fresh test profile. Use fixture data only.
- [ ] For both types, inspect Full, Part Horizontal Focus, Part Vertical Focus, Part Vertical List and Segment with Combined, Separated, EN Only and ID Only.
- [ ] Confirm cohesive Full presentation; readable Section/Turn boundaries; same-speaker consecutive Turns remain distinct; empty Units/Scenes, blank meaning and duplicate text remain clear.
- [ ] Inspect Scene Cast, unassigned speakers, speaker names/monograms/palette and Segment Spotlight. Decide whether Scene-local palette shifts in P2-01 are acceptable.
- [ ] Check light/dark, desktop/narrow 320/375 px, 200% text, long URLs/CJK and Android browser font scaling. Verify clipping, wrapping, contrast and touch comfort.
- [ ] Tab/Enter/Space through controls; verify visible focus, text selection/copy, no offscreen horizontal focus targets and sensible screen-reader labeling. Verify TalkBack separately.
- [ ] Swipe/scroll Part views and use Prev/Next; manual browsing must stay silent and preserve audible identity. Confirm the 1800 ms grace and Follow behavior feel usable.
- [ ] Search reveal should visibly finish on the correct Card/Unit/Sentence, including after a layout switch and manual navigation. Test reduced motion and Android scrolling.
- [ ] With existing browser voices and disposable local bindings only, listen to real multi-speaker Split and Full fallback. Check voice/channel/rate and EN/ID highlights; cached Full must remain Card-only without fake Sentence timing.
- [ ] Pause/resume/stop, switch layouts mid-playback, edit/reset/switch Workspace and confirm cancellation/resume behavior. Do not generate/delete real audio or use canonical v2 data.
- [ ] Edit a Conversation through D4: multi-Sentence Turn, same-speaker adjacent Turn, rename/reassign, split/merge/move/reorder/delete and failed-draft retry; confirm updated Reader and retained identities.

Five fresh screenshot artifacts exist only in the local evidence directory's `screenshots` folder:

```text
a4h-full-dialogue-desktop.png
a4h-separated-mobile-light.png
a4h-part-horizontal-mobile.png
a4h-part-vertical-focus-dark.png
a4h-segment-spotlight-desktop.png
```

Reproduce without adding repository artifacts:

```powershell
npm run build
node scripts/audit-v603-p12-shared-card-a4h-browser.mjs --check-production --screenshots-dir="$env:TEMP\prolingo-a5c-manual-shots"
```

For interactive inspection, `npm run dev` and open `http://localhost:5173/?qa=shared-card-reader`, `?qa=shared-conversation-reader`, and the unchanged `?qa=conversation-editor`. If Vite selects another port, use that port. Android LAN access requires deliberately starting the DEV server with an appropriate host binding. Headless fixture screenshots use supplied cursor evidence; they do not prove real listening quality or Android acceptance.

## 10. Exact controlled return-to-Conversation plan — not executed

### Pinned source / target and method

- Source: `feature/p12-shared-card-ui` at **`7456c6377f29a5e238551f426dc8c3c1b4c22680`**.
- Target before integration: `feature/p12-conversation-only` at **`a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd`**.
- Recommended method: **fast-forward only**, retaining all seven reviewed commits and their dependent domains/renderers/fixtures. No squash, selective cherry-pick or synthetic merge commit is necessary for the verified graph.
- This new, uncommitted A5 report is not part of the pinned source SHA. Keep it as review evidence; committing it requires separate approval and, if included in integration, an explicitly updated source SHA.

### Approval and preflight gates

1. Reviewer/user accepts this audit's limitations and P2 dispositions; complete human acceptance or explicitly approve an isolated-only return while human acceptance remains pending.
2. Obtain explicit approval to perform the local branch integration. Recheck clean source/target worktrees and no unresolved operations. A read-only `git fetch origin` may revalidate remote tips at that stage; it was not performed here.
3. Require the target to remain the pinned checkpoint and source to remain the audited SHA. If either moved, stop and review the new graph/diff; do not automatically absorb newer commits.
4. Use a **new dedicated target worktree**, leaving the current Shared UI worktree and the existing AI Voice worktree untouched. Target branch is not currently checked out elsewhere. Resolve and verify the chosen path before creating it; do not overwrite an existing directory.

After those approvals only, the concrete integration is:

```powershell
# Proposed commands only; not executed by this audit.
git branch backup/p12-conversation-before-shared-a5 a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd
$a5IntegrationPath = 'C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa'
git worktree add "$a5IntegrationPath" feature/p12-conversation-only
# Verify HEAD equals a85bb63... and working tree is clean before proceeding.
git -C "$a5IntegrationPath" merge --ff-only 7456c6377f29a5e238551f426dc8c3c1b4c22680
```

Expected postcondition: target HEAD equals `7456c6377f29a5e238551f426dc8c3c1b4c22680`, with no source modifications or merge conflicts. If `--ff-only` refuses, stop; do not switch to another merge strategy without review. Integration dependencies include the shared interaction extraction, conservative cursor adapter, reader slot, observer and DEV guards as a complete set.

### Required post-integration checks and publication gate

- Verify HEAD/tree equals the pinned source; clean status; expected 45-file diff from the checkpoint; protected domains/services/constants/App unchanged; canonical versions still 1.
- Restore dependencies from the unchanged lockfile in the isolated worktree. Re-run the matrix in section 6, A2 serial stability check, scoped lint and production build/artifact exclusion. Record the same five historical failures separately.
- Recheck D4 failed-draft/pending locks/all commands and D5 real Full recovery/session continuity in disposable fixtures, with no canonical DB access. Repeat the desktop/Android smoke checklist against the integrated tree.
- Obtain a **separate explicit approval before pushing** the target or creating any deployment/release. Local integration does not authorize publication, production Conversation routing, database migration or activation.

### Rollback

Preserve the checkpoint backup ref and audited Shared UI branch. If integration fails checks, do not publish or activate it. Keep the dedicated worktree for review and obtain rollback approval.

For a history-preserving rollback, prepare a rollback branch from the integrated target and revert the seven feature commits newest-to-oldest **without committing automatically**:

```powershell
# Proposed rollback only, after approval and clean-worktree checks.
git -C "$a5IntegrationPath" switch -c rollback/p12-shared-card-a5
git -C "$a5IntegrationPath" revert --no-commit 7456c6377f29a5e238551f426dc8c3c1b4c22680 eb2f4000bdd29e366a3ae7c15bd87325d7dc83dd a162a7d357f7380440d97d05128d0fef5dfd29f6 c0a7d53e2110af4be4a95a39aea6ec86435d9c36 28686f9d31053144498ca3e47bbc1010e5d4604f ef6b0f636eca987d5c2805581a83468caa965160 cb12f95ea6bf3045502b60ee824abe4c1b23695c
```

Review the rollback patch/tree against `a85bb63...`, rerun applicable original Conversation checks, and request approval before committing or publishing the rollback. If later target commits create conflicts, stop and preserve unrelated work; do not force-reset a user's checkout or force-push shared history. Rollback changes code only: this plan authorizes no DB/audio operation.

## 11. Final gate status and stop state

| Gate | Recommendation |
| --- | --- |
| Automated isolated Shared UI integrity/integration | GO, with the two documented P2 limitations |
| Complete A5 acceptance, including human/device/listening approval | **CONDITIONAL GO**, pending manual acceptance or an explicit isolated-only waiver |
| Pinned return to Conversation branch | **CONDITIONAL GO**, only through the approved plan and post-integration checks |
| Canonical v2 / production Conversation activation / deployment | **NO-GO / outside authorization** |

No production source/test edit, hotfix, merge, commit, push, deployment or database activation was performed. The audit stops here with this report uncommitted.
