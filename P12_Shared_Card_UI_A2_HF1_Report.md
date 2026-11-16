# P12 Shared Card UI — A2-HF1 targeted acceptance

Baseline: `28686f9d31053144498ca3e47bbc1010e5d4604f`, branch `feature/p12-shared-card-ui`. Initial HEAD equals the approved baseline and the working tree was clean.

## Initial verified findings (before production edits)

1. `src/components/text/presentation/sharedCardPresentationUtils.js:76` counts both `ready` and historical `downloaded` as Ready. It also drops metadata-only, legacy-unverified and other-profile into missing. The existing coverage domain already distinguishes all these categories (`src/domain/text/textStructuredAudioCoverageDomain.js:147`); its logic must remain unchanged.
2. `src/components/text/TextStructuredPlayer.jsx:206` fabricates a `sessionId: 'host'` fallback and infers Segment precision from `playingIndex` without an authoritative A1 cursor. The embedded opt-in Shared Reader can therefore display an unsupported exact audible position. Missing/invalid shared cursor input should fail conservatively without touching playback.

## Targeted changes and exact source lines

| File | Baseline lines → current lines | Correction |
| --- | --- | --- |
| `src/components/text/presentation/sharedCardPresentationUtils.js` | `2 → 2`; `64–89 → 64–69`; new `77–79` | Reuses the unchanged `summarizeTextStructuredAudioCoverage` for host-provided statuses. Only `READY` increments ready; `downloaded`, `metadataOnly`, `legacyUnverified`, `otherVoice`, `otherProfile`, `stale` and `missing` retain distinct counts. Existing fields are retained, with the domain's additional `covered`/`needDownload` counters. Adds accurate metadata/unverified/profile tooltip labels. |
| `src/components/text/TextStructuredPlayer.jsx` | `206–216 → 206–220` | Deletes the synthetic `'host'` session fallback. Consumes the supplied cursor only with a session token, matching Workspace ID/UID, active state, matching Card and valid precision/Segment-to-Unit membership. Otherwise passes null; the existing reader renders its idle/`none` cursor. No position is derived from the legacy highlight index. |
| `scripts/audit-v603-p12-shared-card-a2.mjs` | New `13–15`, `323–376` | Adds exhaustive status counts/visible label checks and opt-in host cursor cases using the actual A1 adapter. Existing eight scenarios/expectations are unchanged. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx` | Changed `3`; new `11–12`, `457–508` | Adds visible Ready-label coverage and real opt-in/opt-out rendering with valid, missing and malformed cursors. Existing six browser cases are unchanged. |
| `P12_Shared_Card_UI_A2_HF1_Report.md` | New | This consolidated evidence/report. |

Production diff is **+25 / -38 lines across two files**. Test diff is **+112 / -1 lines**. `SharedParagraphCardReader.jsx` itself is unchanged: its visible label at `:654` now receives the corrected summary. `textStructuredAudioCoverageDomain.js` is unchanged. No coverage/RF matching logic, AudioVariants, provider, cache, audio file, actual session/`playingIndex`, D5 hook, audio preference, routing, CSS or schema code was changed.

The cursor guard checks supplied evidence; it does not manufacture freshness. The caller still owns the current authoritative A1 cursor/session scope. If that evidence is unavailable, the shared body displays no audible position. Existing outer host controls and the default Paragraph path keep their accepted behavior.

## Demonstrated before/after evidence

Tests were added and run **before production edits**:

- A2 Node: original **8 PASS**, then the new coverage case failed. Actual summary counted `ready: 2` and `missing: 6`; expected `ready: 1`, with separate historical/metadata/unverified/profile categories and `missing: 3`.
- Real Edge A2 browser: original **6 PASS**, both new cases **FAIL**. A historical-only Card visibly rendered **`Audio 9/9 ready`**, expected **`Audio 0/9 ready`**. Opt-in Split with no cursor rendered **`precision: segment`**, expected **`none`**. All four QA route gates passed; DB/storage calls were zero.

After the patch:

- A2 Node: **10 PASS / 0 FAIL**.
- A2 browser: **8 PASS / 0 FAIL**, plus **4/4 route gates** and `qaPreviewAbsent: true` in actual production artifacts.
- Coverage exercises every status defined by the existing coverage domain, an unknown status and an absent entry. The mixed ten-slot summary is `ready:1`, `downloaded:1`, `metadataOnly:1`, `legacyUnverified:1`, `otherVoice:1`, `otherProfile:1`, `stale:1`, `missing:3`. Visible label: **`Audio 1/10 ready`**. An all-Ready Card remains fully Ready; each other status produces zero Ready, including history.
- Cursor tests exercise both Split and Full host modes with absent prop, empty object, missing token, foreign Workspace/UID and missing Segment. These display **none**. Supplied A1 Split cursors retain **Segment** precision; cached Full retains **Card** precision without an invented Sentence; authoritative per-Sentence Full fallback retains **Segment** precision. Opt-out retains `TextParagraphUnifiedReading`.

## Verification results

Node **24.11.1**, Microsoft Edge **157.0.0.0**, Windows, separate disposable browser profiles. Commands below were executed with current code. Counts are scenario counts, not independent assertions.

| Command (`node scripts/…`) | Final result |
| --- | --- |
| `audit-v603-p12-shared-card-a1.mjs` | 13 PASS |
| `audit-v603-p12-shared-card-a1-browser.mjs` | 7 PASS; 10-state approved Paragraph DOM/classes/computed-geometry parity |
| `audit-v603-p12-shared-card-a2.mjs` | 10 PASS |
| `audit-v603-p12-shared-card-a2-browser.mjs --check-production` | 8 PASS + 4 gates PASS; production QA absent |
| `audit-v603-p12d-d4a-conversation-editor.mjs` | 22 PASS |
| `audit-v603-p12d-d4c-browser.mjs --check-production` | 13 PASS + 4 gates PASS; all 20 commands; production QA absent |
| `audit-v603-p12d-d5-conversation-audio.mjs` | 15 PASS |
| `audit-v603-p12d-d5-audio-ui.mjs` | 5 PASS |
| `audit-v603-p12d-d5-ui-browser.mjs` | 15 PASS |
| `audit-v603-p12d-d5-browser.mjs` | 3 PASS |
| `audit-v603-round-d3-paragraph-acceptance.mjs` | 7 PASS |
| `audit-v603-p9b-playback-marathon.mjs` | 24 PASS |
| `audit-v603-p12c-conversation-playback.mjs` | 13 PASS |

**13 suites pass, 163 scenarios including eight route gates.** Browser suites report zero IndexedDB accesses; A1/A2 also report zero localStorage accesses. Existing D5 session tests verify unchanged start/cancel counts, current cursor and preference references through view changes. The new opt-in rendering checks assert zero stop/play requests and unchanged snapshot JSON. No real audio deletion/GC was run.

**Transient concurrent-run results, kept explicit:** the first parallel browser batch returned D4-C **11 PASS / 2 FAIL** (merge did not settle, then command-coverage assertion lacked that merge) and D5 UI **14 PASS / 1 FAIL** (Full preview still showed `Assembling...` at the fixed check). Both suites were rerun serially, with no changes to their source or expectations, and passed as listed above. These observed timing-sensitive failures are not relabelled as any of the four historical failures below.

The A2 Node suite intentionally logs `QuotaExceeded` while testing denied view-preference storage, then passes that scenario. No storage error was suppressed or expectation changed.

### Scoped ESLint and build — debt distinguished

- `npx eslint src/components/text/presentation/sharedCardPresentationUtils.js scripts/fixtures/shared-card-a2/browser-cases.jsx`: **0 errors / 0 warnings**.
- `TextStructuredPlayer.jsx` was linted through the ESLint API against `git show 28686f9d31053144498ca3e47bbc1010e5d4604f:…` and current source using the same config: **baseline 17 errors / 3 warnings; current 17 errors / 3 warnings; zero added or removed diagnostics**. The diagnostic multiset comparison ignores shifted source line numbers. **This file is not lint-clean.** Existing unused props, dependency warnings and state-in-effect errors remain untouched.
- `node --check scripts/audit-v603-p12-shared-card-a2.mjs`: PASS.
- `npm run build`: PASS, **1904 modules**; `index-DXgY9X0L.js`, unchanged stylesheet name `index-eMBiiGxI.css`. Existing stale browser-data notices and main-bundle size warning remain.
- `git diff --check`: PASS.

### Four known historical baseline failures — rerun, unchanged

| Script | Existing failure |
| --- | --- |
| `audit-v603-beta8-p9-hf4a-card-ux.mjs:82` | Nine checks pass, then obsolete source regex expects `setPlayingIndex(step.highlight ? …)`. |
| `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33` | Expected version `6.0.3-beta.8-p9-hf4c-r1`; actual baseline `6.0.3-beta.8-p9-hf4d`. |
| `audit-v603-d0-d1-text-identity.mjs:229` | Table hash expected `024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767`; actual `faa88212c55ed7f1a4ed782f6ed8614ac58ff89b27833bbfb50b013ce3809133`. |
| `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | Nine checks pass, then `/Browser TTS/` expected while existing label is `David · US`. |

Each exits 1 at its existing assertion; later checks are unverified. None of these scripts, expected values, Table files or version metadata was changed.

## Acceptance and final state

**GO for the two targeted HF1 fixes within isolated/opt-in A2 acceptance.** No new production activation is approved. Hosts without authoritative shared-cursor evidence intentionally get no shared audible highlight; they must supply the existing A1 cursor to expose precise position. The host remains responsible for supplying a fresh cursor. Cached Full without Sentence offsets remains Card-only.

Canonical DB/schema remain **1**. No DB writes, audio-session changes, RF/artifact changes, UI redesign, new dependency or A3 implementation was introduced. Known lint debt, historical failures and the concurrent test timing observations above remain documented limitations.

Final working-tree changes:

```text
 M scripts/audit-v603-p12-shared-card-a2.mjs
 M scripts/fixtures/shared-card-a2/browser-cases.jsx
 M src/components/text/TextStructuredPlayer.jsx
 M src/components/text/presentation/sharedCardPresentationUtils.js
?? P12_Shared_Card_UI_A2_HF1_Report.md
```

HEAD remains `28686f9d31053144498ca3e47bbc1010e5d4604f` on `feature/p12-shared-card-ui`. All changes are unstaged/uncommitted. No branch change, commit, push, merge, deployment or DB v2 activation was performed. Work stops after this hotfix.
