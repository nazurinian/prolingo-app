# P12 R1 — Reduced-Motion Reveal Stabilization

Date: 2026-11-17. Workspace: `prolingo-p12-integration-qa`. Branch: `feature/p12-conversation-only`.

**R1 is closed by a test-setup synchronization correction. GO for P12 technical closure and proceeding to P13-A0 as a separately scoped task.** No production scrolling change was required. Ten consecutive serial A2 runs pass all completed-reveal checks and route gates. User Functional Smoke Acceptance remains accepted at 9/9 PASS.

## 1. Preflight and preserved state

- Actual starting/final HEAD: `7712866a42620b5b31043978e9424ea0d576f082`, matching the provided latest GitHub SHA.
- This is one documentation-only commit above integrated application SHA `dc3722c173793aed124ae4bee98092377d62b795`: it adds the final integration report. No pull, reset, rebase or synchronization was needed or performed.
- Starting target working tree was clean; no pending merge/rebase/cherry-pick/revert operation. The integration report was read completely before investigation.
- Backup `backup/p12-conversation-before-shared-a5` remains at `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd`. The Shared UI and AI Voice worktrees were left untouched.
- Only two browser-test files and this report are changed. All changes remain uncommitted. `git diff HEAD -- src` is empty.

## 2. Reproduction and confirmed cause

The unchanged A2 suite was executed with its original desktop/mobile, dark-mode, 200% root-font, font-reset, reduced-motion and final **1024×300** sequence targeting **SEGMENT_000006**.

Initial ordinary runs produced one complete pass and one existing keyboard scroll-timing failure. Then two observational executions of the original suite produced a pass and an exact R1 failure. The observer was a separate CDP client: it delegated the original native scroll call unchanged and recorded geometry and browser layout-shift events. No repository source/test code had been edited at that point.

### Exact R1 trace

From `diagnostic-2-events.json`, times relative to that browser page:

| Event | Document height / maximum scrollY | ScrollY | Target top–bottom |
| --- | --- | --- | --- |
| Native center request, t≈19202.0 ms | 4388 / 4088 | 0 | 2599.42–2647.42 |
| Native call returned, t≈19202.4 ms | 4388 / 4088 | 2473 | **126.42–174.42**, correctly centered |
| Next recorded layout shift, t≈19217.3 ms | **1817 / 1517** | **1517** | **−430.47–−406.47**, offscreen |
| Later samples through 2500 ms | 1817 / 1517 | 1517 | Still offscreen |

The native request used the required `{ behavior: 'auto', block: 'center' }`. It centered the target correctly for the current, transitional layout. About 15 ms later, the document shrank; the prior scroll position exceeded the new scroll range and was clamped to its maximum, 1517. This reproduces the integration report's exact failure geometry. The completed-visibility assertion correctly failed after four seconds.

**Confirmed cause:** the test initiated reveal before the viewport/font reflow and reader layout had finished committing. A CDP viewport acknowledgement and a short render delay did not establish layout readiness. Even though the root's computed font had returned to 16 px at the native call, the target/document geometry was still transitional: the target was 48 px high before the subsequent reflow, then 24 px high afterward.

This establishes a test ordering/synchronization race. The production utility made the correct native request and initially achieved centering. The precise internal Chromium style-invalidation/anchoring scheduling is not claimed; the measured post-scroll document shrink/range clamp is sufficient to identify the setup error. No wrong target, identity, motion option or clipping calculation was demonstrated.

### Related setup observation

The second ordinary baseline execution failed the existing Space assertion while native focus/playback-follow scrolling was still moving: scrollY changed from 0 after focus, to 250 before Space, then 274. The same test-only readiness barrier now waits for this outstanding native motion before the keyboard baseline is measured. The Space equality, focus-visible checks and exact callback-count assertions are unchanged; production keyboard/follow behavior is unchanged.

Before logs are retained as `before-1.log`, `before-2.log`, `diagnostic-1.log`, `diagnostic-2.log` and their event JSON. The diagnostic scripts/observations live outside the repository; none were enabled during the ten final runs.

## 3. Minimal correction and exact changed files

| File / final reference | Change |
| --- | --- |
| `scripts/fixtures/shared-card-a2/completed-reveal.js:56` | Add `waitForStableBrowserLayout`, a passive test-setup barrier. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:225` | Replace the 60 ms keyboard setup delay with measured native-motion/layout quiescence. Assertions unchanged. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:471` | Capture the original normal root-font size before 200% scaling. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:504` | After resetting font/motion/viewport, commit the reader **without focusTarget**, then wait for stable intended layout before requesting reveal. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:593` | Emit `preparedLayouts` evidence alongside existing completed-reveal geometry. |
| `P12_R1_Reduced_Motion_Stabilization_Report.md:1` | This report. |

Test-code diff: **+60 / −2 lines**, plus this report. No production-source file changed.

The setup barrier requires:

- A connected target in the committed reader DOM.
- The requested viewport, reset root-font size and reduced-motion state.
- Loaded fonts and stable target font size, document height, rectangles, clipping bounds and document/container scroll offsets.
- Real animation-frame observations, at least three stable frames, and at least 120 ms of measured stability within a four-second deadline.

It does not scroll, focus, change the snapshot, retry the reveal, disable anchoring or change browser motion settings to manufacture a pass. Its interval is a **conditional stability window**, not an arbitrary sleep. Deadline handling fails closed if paint/layout readiness is not reached.

The R1 target is intentionally still offscreen when preparation completes. Only then is `focusTarget` introduced, so the original production effect performs the native reveal against the final layout. The existing `waitForCompletedReveal` implementation, four-second deadline, clipped-visibility/settled-geometry requirements and negative control are unchanged. All native motion, identity/channel and route assertions remain in force.

## 4. Ten consecutive serial A2 runs

Final command, from the target worktree:

```powershell
node scripts/audit-v603-p12-shared-card-a2-browser.mjs --check-production
```

Ten runs were executed consecutively after the final correction/build, with fresh disposable Edge profiles and no concurrent browser suite or diagnostic observer. Every execution has a separate log and complete before/after visibility geometry.

| Run | Duration | Suite checks | Completed reveals | Route gates | R1 preparation frames | R1 final scrollY / top–bottom |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 16.88 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 2 | 17.11 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 3 | 15.55 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 4 | 16.62 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 5 | 16.88 s | 10/10 | 15/15 | 4/4 | 10 | 949 / 137.53–161.53 |
| 6 | 17.20 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 7 | 15.91 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 8 | 15.61 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 9 | 16.03 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |
| 10 | 16.16 s | 10/10 | 15/15 | 4/4 | 9 | 949 / 137.53–161.53 |

All ten prepared layouts had viewport **1024×300**, root font **16 px**, target font **18 px**, document height **1817**, and scrollY **0** before the reveal. Measured preparation stability was 122–135 ms. After the native request, the target was visible at **137.53125–161.53125** within **0–300**, scrollY **949**, and remained stable for the original completed-reveal requirement.

Totals: **100/100 suite checks, 150/150 positive completed reveals and 40/40 repeated route gates passed**. The no-native-movement negative control was rejected as expected in every execution. All runs reported zero IndexedDB/storage calls and successful production QA exclusion. No failed run was dropped or retried within this ten-run sequence.

## 5. Regression, lint and build results

Environment: Node 24.11.1, Vite 7.2.6, headless Microsoft Edge 157.0.0.0, Windows. Commands below use `node scripts/audit-v603-<suffix>.mjs` unless flags are shown.

| Node suites | Actual result |
| --- | --- |
| `p12-shared-card-a1` / `p12-shared-card-a2` / `p12-shared-card-a3` | 13 / 10 / 7 PASS |
| `p12-shared-card-a4c` / `p12-shared-card-a4h` | 11 / 8 PASS |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | 22 / 9 PASS |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | 15 / 5 PASS |
| `p12d-d3d-regression` / `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` / `p12d-virtual-content-units` | 12 / 5 / 11 / 12 PASS |
| `p12c-conversation-playback` / `p12b-speaker-registry` | 13 / 14 PASS |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | PASS / 30 checks PASS / 19 checks PASS |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | 7 / 20 PASS |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | 24 / 17 PASS |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` / `p10-h5-export-zip-remediation` | 18 / 7 / 21 / 11 PASS |

31 Node suites: **26 pass and the five established failures below remain**. Deliberate denied-storage/rollback-error logs remain expected failure-injection evidence.

| Other browser suites | Actual result |
| --- | --- |
| `p12-shared-card-a1-browser` | 7 PASS |
| `p12-shared-card-a3-browser --check-production` | 8 PASS + 4 gates |
| `p12-shared-card-a4c-browser --check-production` | 12 PASS + 4 gates |
| `p12-shared-card-a4h-browser --check-production` | 6 PASS + 4 gates |
| `p12d-d4c-browser --check-production` | 13 PASS + 4 gates; all 20 commands covered |
| `p12d-d5-browser` / `p12d-d5-ui-browser` | 3 / 15 PASS, including real audio recovery and session controls |
| `p12d-d3d-browser` | 9 PASS; disposable QA databases only |

These eight suites passed all 73 browser checks. Production artifact exclusion passed wherever requested.

```powershell
npx eslint --max-warnings=0 scripts/fixtures/shared-card-a2/browser-cases.jsx scripts/fixtures/shared-card-a2/completed-reveal.js
npm run build
git diff --check
```

Scoped ESLint: **0 errors / 0 warnings**. Build: **PASS**, 1906 modules; unchanged production JS `index-D6HylpNV.js` and CSS `index-E2W4hf70.css`. Existing browser-data/large-chunk advisories remain nonfatal. Whitespace check: PASS. Existing Player lint debt was not edited or represented as newly clean.

### Five historical failures, separate from R1

| Audit | Unchanged failure |
| --- | --- |
| `audit-v603-beta8-p9-hf4a-card-ux.mjs:82` | Old `setPlayingIndex(step.highlight ?` regex, after 9 passes |
| `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33` | Expected `...hf4c-r1`, actual `...hf4d` |
| `audit-v603-d0-d1-text-identity.mjs:229` | Expected Table hash `024aa45b...`; LF target checkout actual `10d82e76...`, as already investigated during integration |
| `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | Expected `/Browser TTS/`, actual `David · US`, after 9 passes |
| `audit-v603-beta8-p9-hf4c-player-audio-ux.mjs:35` | Expected `...hf4c`, actual `...hf4d` |

No historical expectation or hash was updated. R1 is not reclassified as baseline debt; it was reproduced and corrected.

## 6. Evidence, remaining risks and closure recommendation

Evidence directory:

```text
C:\Users\HikamSeif\AppData\Local\Temp\prolingo-r1-stabilization-ef67fb5b94064408b45a53b4a38fb10c
```

Key artifacts: `preflight.json`, `before-results.json`, original-run logs, `diagnostic-2-events.json` with the causal native/reflow trace, the external observer script, `ten-run-results.json`, ten separate `after-*.log` files with full `preparedLayouts` and `completedReveals` geometry, `node-results.json`, `browser-results.json` and `build.log`.

The ten-run result demonstrates stability of the specified scenario under this environment, not an unlimited guarantee against scheduler starvation or every browser/device. The readiness and completed-reveal assertions continue to fail closed on their bounded deadlines. This work does not claim that an application must automatically recenter a past search while its layout is actively changing; it correctly orders the test's search **after** the requested transitions finish.

No `src` file changed. Focus identity, manual-navigation grace, playback-follow semantics, D4 commands, Content Unit identity, D5 services/session authority, canonical constants and all excluded features remain untouched. Canonical DB/schema remain **1**; no live database, migration, real audio deletion/GC, AI Voice, Mixed UI or Legacy change was performed. User smoke acceptance remains valid; no new human/device approval is fabricated.

**Recommendation: accept R1 stabilization for P12 technical closure and proceed to P13-A0 under the existing isolated-development boundaries.** The application tree is unchanged; the small uncommitted test patch is ready for review. No P13 implementation, commit, push, deployment or database v2 activation was performed. Work stops here.
