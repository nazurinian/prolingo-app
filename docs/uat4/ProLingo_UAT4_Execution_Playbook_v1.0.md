# ProLingo UAT-4 — Execution Playbook v1.0

**Companion to:** `ProLingo_UAT4_Master_Contract_v1.2_REVIEW_2026-11-24.md`  
**Fixture:** `ProLingo_UAT4_Mixed_Fixture_A_Journey_to_London.md`  
**Design reference:** `ProLingo_UAT4_Mixed_Reader_Reference_v1.2.html` (illustrative only; not production source)  
**Baseline:** `test/text-v2-uat`, historical verified HEAD `0dba2c5de2ec7297a5606d05a2e45206559990d8`; local status must be checked.  
**Target:** `6.0.3-beta.9-uat.3` after acceptance only.  
**Status:** execution policy proposal; no source changes, installs, or runs performed here.

## 1. Ownership and source of truth

Master Contract v1.2 remains the functional source of truth. This playbook adds task limits, grouping, and Focus reference. Latest explicit user corrections supersede historical screenshots and prototype omissions. The HTML is a visual aid, not a specification or code to copy blindly. If requirements conflict, stop the affected work and report the exact conflict; do not invent a solution. Continue independent in-scope work when safe.

- Codex: architecture, domain contracts, playback/session/runtime logic, persistence boundaries, integration, independent regression.
- Gemini 4 Neon: shared presentation, Reader modes, Focus experiment, typography, bilingual layout, Study Box UI and final Player polish. Use existing callback/selector interfaces; no independent playback engine or database changes.
- Hydrogen optionally handles narrowly specified cosmetic fixes only after design acceptance; not architecture, complex carousel, or Notebook.
- User accepts visual/device results. Assistant reviews diffs/reports and issues the next scoped packet. No assumed automatic agent orchestration.

## 2. Global guardrails

Canonical v1/schema v1 unchanged; canonical v2 activation NO-GO. Isolated UAT v2 only. Preserve persisted identities, text, ordering, joinAfter, speaker registry, RF keys/blobs, Full artifacts/fingerprints, import/export/ZIP, and Table/Legacy behaviour. No changes to AI Voice worktree, production deployment, Stable promotion, unrelated settings, or previous accepted features. Memory Mode is post-Stable. No reset/clean of user changes, no force push, no broad cleanup/refactor, no unrelated formatting, no version bump or dependency upgrades by default. No production data used in QA.

Before writing: `git status --short`, `git branch --show-current`, `git rev-parse HEAD`; confirm expected branch and clean/known working tree. Use actual file allowlist from 4A. Exact paths below are starting points, not permission to edit whole directories. Read directly necessary imports/call sites/tests only. If another file is needed, state why and request a narrow expansion; do not scan the repo recursively without a concrete dependency question. No whole-repo dumps, node_modules, dist, binary/audio assets, historical logs, or repeated full-file output. Use targeted rg and line ranges. Do not run network or dependency installs unless approved. One writer per worktree; handoff at a known commit. Never claim PASS for a test not run.

## 3. Execution batches (16 existing subpatches retained)

| Batch | Subpatches | Owner | Gate |
|---|---|---|---|
| A | 4A | Codex | Read-only audit; exact file allowlists, interfaces, dependency map, test commands, blockers; user review |
| B | 4B0 + 4B1 | Neon | Shared Workspace Style, Full/Card; Mixed 4/11/37, alignment both types, settings compatibility; visual checkpoint |
| C | 4B2 + 4B3 | Neon | Focus and Study Box; Focus feasibility first, then one box/card and local selectors; separate commits/checkpoints |
| D | 4C1 | Neon | Bilingual style/typography, context placement, no invalid Segment styles; visual checkpoint |
| E | 4C2 then 4C3 | Neon | Isolated Notebook prototype; STOP for visual/technical approval before integration; if not feasible, report fallback, no silent replacement |
| F | 4D + 4E1 | Codex | Unified Now Playing and scope/channel override contracts; targeted tests |
| G | 4E2 + 4F1 | Codex | Ownership, cancellation, navigation/resume, shared transport; Table/Legacy regression |
| H | 4F2 | Codex | Media Session lifecycle, automated checks and device capability reporting |
| I | 4G | Neon | Integrated UI polish with real playback interfaces, no core edits |
| J | 4H1 + 4H2 | Codex + user | Regression/build then actual device acceptance; separate signoffs; no auto-release |

Ten work packets, not ten releases. A packet may contain multiple subpatches but each retains its own acceptance criteria and traceable commit (or reviewable diff if commit not authorized). E deliberately contains a mandatory stop. Batch C may continue Study Box if carousel experiment is blocked and the independent interface is stable; do not integrate failed carousel. 4A may adjust batching if actual coupling makes it unsafe. Presentation work before core uses existing interfaces or explicitly marked isolated QA stubs, never invented production state. Final integration must wire actual runtime and remove any test-only stub from production paths.

## 4. Focus reference and library gate (4B2)

User reference: https://uiinitiative.com/catalog/expo-slider . It is a premium Swiper effect/template (parallax and scaling), not a standalone free library; documentation says centeredSlides is forced and slidesPerView:auto unsupported. Do not acquire, copy, or use premium source without appropriate authorization/license. Use the public visual concept as reference for independently implemented scale/opacity transitions on a supported library. Baseline package.json at 0dba2c5 uses React ^19.2.0, Vite ^7.2.4, Tailwind ^3.4.1; neither Swiper nor Embla is listed. Exact version/license/bundle size and React compatibility to be checked by Neon before install. No library selected or installed yet.

First candidate: open-source Swiper + custom modest scale transitions; second: Embla if sizing/gesture constraints fail; third: native scroll snap. Do not install all three. Prototype only using current Mixed fixture, not image slides or lorem ipsum. One Unit is one slide, not one Segment or Card. One Unit card hides unnecessary carousel controls. Vertical: previous preview small, centre active Unit large and entirely readable, next preview small, natural scroll/snap. Horizontal: centered active Unit, optional side peeks and navigation rail with unit ordinal/speaker/segment count. No autoplay or looping by default, no audio trigger on swipe. Preserve independent reading selection and actual playback cursor, Return to Playing, reduced motion, keyboard/accessibility. Long and unequal bilingual content, resize, narrow mobile, nested scroll handoff, stable focus, no clipping, no unintended text scaling of active reading, no click interception or layout jump. If long content cannot fit, allow accessible scroll/expanded fallback with visible explanation. Do not impose fixed photo-slide height on text. Measure build delta and device/browser behaviour; distinguish actual Android test from desktop mobile emulation. Present candidate results and exact dependency/lockfile change for approval before integration. No other package changes.

## 5. Scoped agent packet template

Every handoff: baseline SHA + prior accepted SHA; subpatch IDs; only relevant Master Contract sections; explicit edit allowlist and read-only dependencies; invariant list; fixture and expected result; exact test commands from audit; explicit stop criteria; required report. Do not paste entire previous chat or unrelated project history. Provide exact targeted snippets when useful. Review the actual diff before approving next packet.

Return concise report: status PASS/PARTIAL/BLOCKED (per subpatch), changed files and why, tests with command/result, UI evidence desktop/mobile if relevant, remaining blockers, commit SHA or uncommitted status, data/identity/dependency guardrail check. Do not use long generic explanations or speculative fixes. If a test fails, diagnose only the task-related cause; report unrelated baseline failure separately. A failed acceptance cannot be renamed PASS. Do not repeatedly run full builds during cosmetic iteration; targeted checks first, build once at the agreed gate. Final regression remains mandatory.

## 6. First packet — Codex 4A (read-only)

Use this prompt now, after putting the v1.2 Master Contract, fixture, and this playbook where the agent can read them. No implementation in this packet.

```text
ProLingo UAT-4A — targeted read-only architecture audit.

Expected worktree prolingo-p12-integration-qa, branch test/text-v2-uat.
Historical baseline 0dba2c5de2ec7297a5606d05a2e45206559990d8.
Read Master Contract v1.2 and Execution Playbook v1.0. Fixture A Journey to London = 4 Cards / 11 Units / 37 bilingual Segments. HTML reference is illustrative only.

Verify git status, branch, HEAD. If unexpected, report; do not reset or switch automatically.
Audit only these entry points plus directly necessary imports/call sites/tests:
- src/constants/textDatabaseConstants.js
- src/domain/text/textContentUnitDomain.js
- src/domain/text/textCardPresentationDomain.js
- src/domain/text/textCardPresentationStateDomain.js
- src/components/text/presentation/SharedPartAndSegmentViews.jsx
- src/components/text/presentation/SharedBilingualUnitsBody.jsx
- src/domain/text/textStructuredPlaybackDomain.js
- src/domain/text/textStructuredRuntimePlaybackPlanDomain.js
- src/services/playback/textStructuredPlaybackSessionService.js
- src/services/playback/globalPlaybackSessionService.js
- src/services/playback/mediaSessionLifecycleService.js
- src/components/layout/BottomPlayerBar.jsx
- package.json
Locate actual preference/reader owner, tests and UAT wiring by targeted search; do not assume paths or scan unrelated projects.

Deliver:
1. Confirm canonical v1 vs isolated v2, data/audio identity invariants and existing title-role behaviour; distinguish source from runtime.
2. Map existing Reader/Workspace Style/preferences, Full/Card/Focus/Segment reuse, settings inheritance and compatibility. Define narrow interface contracts for Neon (selection, focus, real cursor, play callbacks), including how to safely stage UI before playback patches. No implementation.
3. Map actual active session, Table/Text/Legacy transport, Unit scope gap, representation/channel/precision, Media Session, numbering; distinguish verified vs unknown.
4. For every proposed batch, give exact edit allowlist, read-only dependencies, required acceptance tests/commands and integration dependencies. Flag any ordering change needed. Focus library feasibility belongs to Neon 4B2; only identify relevant integration seam and dependency policy here.
5. Report blockers, risks, GO/CONDITIONAL GO/NO-GO for the next batch; keep canonical v2 activation NO-GO. Provide short evidence references file:line and existing test names.

No file edits, installs, commits, deploy, migrations, schema/data changes, production data, or unrelated refactor. No full repo output; use targeted search and concise evidence. Do not claim runtime PASS without execution. Finish with the audit and STOP. Wait for human review before 4B0.
```

## 7. Release and rollback

Each accepted batch becomes the next baseline. If a new issue appears, patch the smallest responsible layer; do not ask Neon to fix core or Codex to redesign UI silently. Revert only an identified approved change with user authorization; never overwrite existing local work. No release promotion until 4H1 regression/build and 4H2 actual desktop/Android acceptance. A Notebook feasibility failure or Android TTS limitation requires explicit user disposition, not a hidden downgrade. Master Contract v1.2 remains authoritative until an approved revision.
