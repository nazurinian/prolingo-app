# P12 Shared Card UI — A5-HF1 P2 Closure

Date: 2026-11-17. Branch: `feature/p12-shared-card-ui`. Starting and final HEAD: `69d42a622ff8c6bef2a2979c9ff7dad35a948a3e`. Starting working tree was clean. `P12_Shared_Card_UI_A5C_Final_Integrity_Audit.md` was read completely before implementation.

**Both confirmed P2 findings are closed. GO for HF1 and proceeding to final manual acceptance.** Overall A5 acceptance still requires the human/device/listening checks from A5-C1. No branch integration or production/database activation is authorized by this result.

## 1. Exact changes and scope

| File and final lines | Purpose |
| --- | --- |
| `src/components/text/presentation/sharedCardPresentationUtils.js:157` | Replace Scene-cast collision probing with deterministic identity-only palette selection. This is the sole application-source change. |
| `scripts/audit-v603-p12-shared-card-a4h.mjs:162` | Update the old fixture-specific uniqueness expectation to the approved hue-reuse policy. Existing rename/reorder, neutral styling and presentation checks remain. |
| `scripts/audit-v603-p12-shared-card-a4h.mjs:237` | Add the exact A5-C1 cast-addition collision regression, cast removal, cross-Scene consistency, snapshot/Turn identity and audio preservation checks. |
| `scripts/audit-v603-p12-shared-card-a4h.mjs:266` | Add eight-speaker hue reuse, distinct names/monograms/cast identities, singleton/cast-independent mapping, UID fallback and neutral checks. |
| `scripts/fixtures/shared-card-a2/completed-reveal.js:1` | New test-only clipping/geometry observer and bounded completed-reveal assertion (`:30`). It never scrolls or focuses the target. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:352` | Preserve the existing exact-target center request and amber-focus assertions; additionally require completed visibility in the real 240 px nested scroll container. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:389` | Preserve channel-qualified ID follow request; additionally verify visible, settled ID target in the 220 px container. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:395` | Add Full Combined/Separated, all three Part styles and Segment search-reveal cases, each under native smooth and reduced-motion behavior. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:438` | Add a negative control: a correct request with native scrolling suppressed must fail completed visibility. |
| `scripts/fixtures/shared-card-a2/browser-cases.jsx:522` | Retain the reduced-motion `behavior: 'auto'` assertion and additionally verify its completed reveal in the 300 px viewport. |
| `P12_Shared_Card_UI_A5_HF1_P2_Closure_Report.md:1` | This closure and verification report. |

There are **five changed/new files**: one application file, three test files and this report. Code/test diff excluding this report: **+191 / -28 lines**. Application diff alone: **+4 / -21**; tests: **+187 / -7**. No new dependency or stored entity was introduced.

## 2. P2-01 — Stable speaker palette

The existing `getStableTurnSpeakerKey` contract is unchanged: persistent Speaker ID first, UID fallback. Its existing FNV hash now selects a palette slot directly:

```js
SPEAKER_ACCENT_PALETTE[hashSpeakerKey(key) % SPEAKER_ACCENT_PALETTE.length]
```

The choice no longer depends on the other speakers present in a Card. The same identity key receives the same color across Scenes, cast additions/removals, label changes and Turn reorders. Reassignment continues to use the assigned speaker's key. Unassigned speakers retain the existing neutral appearance.

**Trade-off:** six hues are intentionally reused. Colors are supporting cues; speaker names, monograms, persistent Turn identity and labels remain the means of distinguishing speakers. There is no uniqueness guarantee for arbitrary casts and no persisted palette assignment. A speaker previously shifted by collision probing returns to its identity's base hue; future cast changes do not shift it again. Existing renderer/style/voice logic is unchanged.

### Failure before the fix, success after it

The new regression was written and run before changing application code. Registering `SPK_00000003` and adding an empty Turn to Scene 1 reproduced A5-C1 exactly: existing `SPK_A9FC29F9` changed from **orange to cyan**, causing the new stability assertion to fail after the first two existing checks. Evidence: `palette-before-fix.log`.

With identity-only mapping, the same test passes: the existing speaker remains orange across both Scenes and after removing the added Turn. Every retained projected Turn/Segment record is compared with the original, audio variants are unchanged, and the original snapshot remains unchanged. The additional eight-speaker test proves hue reuse does not merge Scene Cast entries or discard names/monograms. Existing browser rename, reorder and reassignment regressions also pass.

The A4H Node suite now has **8 passing checks**, including two new HF1 checks. Three old pairwise hue-inequality assertions were replaced by valid-palette/readable-attribution assertions to match the explicitly approved policy. No historical failure expectation or hash was changed.

## 3. P2-02 — Completed search reveal

Existing target identity, channel-qualified follow, center-scroll request, search-highlight and reduced-motion assertions remain. Fixed 100/80 ms success delays in those scroll checks were replaced with bounded condition waits, followed by geometry verification. Existing generic render setup delays are not used as proof of success.

The new observer intersects the browser viewport with every clipping ancestor's actual client area, including nested vertical containers and the horizontal Part track. It rejects disconnected, inert, aria-hidden or nonvisible targets. A target must be fully inside those bounds (1 px rounding tolerance), with target geometry and all observed document/container scroll positions stable within 0.5 px for at least **120 ms**. The overall deadline is **4 seconds**. The 20 ms polling interval is an observation cadence, not a success condition.

The matrix checks Full Combined/Separated, Part Horizontal Focus/Vertical Focus/Vertical List and Segment in both normal and reduced motion: **12 cases**, plus the existing opt-in Full, separated ID follow and reduced-motion viewport paths, yielding **15 completed-reveal observations per suite run**. The matrix also requires the 260 px container to have actually scrolled and the correct Segment/channel request to occur. Reduced motion still requires `auto`; normal search still requires `smooth`.

The negative control records the correct native API request but deliberately does not delegate scrolling. The original request condition succeeds; the new visibility assertion times out as expected after its 300 ms negative-control deadline. This proves the strengthened check detects the former request-only false positive.

**No production scrolling defect was demonstrated. Production scrolling/follow code was not modified.** The existing A3 and Conversation/H2 browser suites remain green.

### Representative completed-reveal evidence

First serial run, all values in CSS pixels. `top–bottom` is the final target rectangle; `clip` is the actual intersected vertical visibility area.

| Path | Target top–bottom | Clip | Scrolled container / track | Completion wait |
| --- | --- | --- | --- | --- |
| Opt-in Full | 110.97–134.97 | 0–240 | scrollTop 1247 in 240 px container | 736 ms |
| Separated ID follow | 198.92–219.92 | 0–220 | scrollTop 1080 in 220 px container | 651 ms |
| Smooth Full Combined | 117.53–141.53 | 0–260 | scrollTop 969 | 625 ms |
| Smooth Full Separated | 117.53–141.53 | 0–260 | scrollTop 725 | 545 ms |
| Smooth Part Horizontal | 117.53–141.53 | 0–209.95 | outer scrollTop 928, track scrollLeft 1215 | 656 ms |
| Smooth Part Vertical Focus | 117.53–141.53 | 0–260 | scrollTop 1378 | 717 ms |
| Smooth Part Vertical List | 117.53–141.53 | 0–260 | scrollTop 1348 | 737 ms |
| Smooth Segment | 114.50–145.50 | 0–260 | scrollTop 637 | 549 ms |
| Reduced-motion variants | Same visible destinations | Corresponding clip above | Actual native scroll positions checked | 125–128 ms |
| Reduced-motion viewport | 137.53–161.53 | 0–300 | document scrollY 949 | 126 ms |

Full per-target geometry, horizontal bounds, scroll offsets, stable durations and motion flags are emitted as `completedReveals` in the original A2 runner's JSON report.

## 4. Repeated real-browser results

Five consecutive runs of:

```powershell
node scripts/audit-v603-p12-shared-card-a2-browser.mjs --check-production
```

Runs were serialized after build/Node checks finished, with fresh disposable Edge profiles and the final built CSS. No other browser suite ran concurrently.

| Run | Duration | Browser checks | Completed reveals | Gates | Slowest reveal |
| --- | --- | --- | --- | --- | --- |
| 1 | 15.45 s | 10/10 PASS | 15/15 | 4/4 PASS | 737 ms |
| 2 | 15.53 s | 10/10 PASS | 15/15 | 4/4 PASS | 731 ms |
| 3 | 15.64 s | 10/10 PASS | 15/15 | 4/4 PASS | 738 ms |
| 4 | 15.34 s | 10/10 PASS | 15/15 | 4/4 PASS | 745 ms |
| 5 | 15.23 s | 10/10 PASS | 15/15 | 4/4 PASS | 742 ms |

All **75 positive completed-reveal checks passed**, and the request-without-movement negative control was rejected in every run. Every run reported zero IndexedDB calls and zero storage calls; production QA exclusion passed. No browser retry was needed to obtain these five consecutive passes.

## 5. Regression, lint and build results

Environment: Node 24.11.1, Vite 7.2.6, headless Microsoft Edge 157.0.0.0, Windows. Commands use `node scripts/audit-v603-<suffix>.mjs`.

| Node suite suffix | Actual result |
| --- | --- |
| `p12-shared-card-a1` / `p12-shared-card-a2` | 13 / 10 PASS, including earlier HF1 coverage/cursor guards |
| `p12-shared-card-a3` / `p12-shared-card-a4c` / `p12-shared-card-a4h` | 7 / 11 / **8** PASS |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | 22 / 9 PASS |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | 15 / 5 PASS |
| `p12d-d3d-regression` / `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` / `p12d-virtual-content-units` | 12 / 5 / 11 / 12 PASS |
| `p12c-conversation-playback` / `p12b-speaker-registry` | 13 / 14 PASS |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | PASS / 30 checks PASS / 19 checks PASS |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | 7 / 20 PASS |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | 24 / 17 PASS |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` / `p10-h5-export-zip-remediation` | 18 / 7 / 21 / 11 PASS |

31 Node suites: **26 passing suites, five unchanged historical failures**, listed separately below. Intentional denied-storage and rollback-failure logs in failure-injection tests are expected.

| Browser suite suffix | Actual result |
| --- | --- |
| `p12-shared-card-a1-browser` | 7 PASS |
| `p12-shared-card-a2-browser --check-production` | Five serial runs above: 10 PASS + 4 gates each |
| `p12-shared-card-a3-browser --check-production` | 8 PASS + 4 gates |
| `p12-shared-card-a4c-browser --check-production` | 12 PASS + 4 gates |
| `p12-shared-card-a4h-browser --check-production` | 6 PASS + 4 gates; rename/reorder/reassignment remain correct |
| `p12d-d4c-browser --check-production` | 13 PASS + 4 gates; all 20 supported commands covered |
| `p12d-d5-browser` / `p12d-d5-ui-browser` | 3 / 15 PASS, including real Web Audio and corrupt Cached Full recovery |
| `p12d-d3d-browser` | 9 PASS, disposable QA databases only |

There are **83 unique passing browser checks and 20 distinct route gates**, with the additional A2 repetitions detailed above. No new regression failure remains.

- Scoped ESLint with `--max-warnings=0` on the changed application utility and both browser test JS/JSX files: **0 errors / 0 warnings**. The changed Node script passes `node --check`.
- Existing `TextStructuredPlayer.jsx` lint remains **17 errors / 3 warnings before and after**; the file was not edited. This debt is not reported as clean.
- `npm run build`: **PASS**, 1906 modules; final `index-D6HylpNV.js` 1696.54 kB / 448.56 kB gzip. CSS remains `index-E2W4hf70.css`. Existing browser-data and large-chunk advisories remain.
- `git diff --check`: **PASS**. The only changed `src` path is the palette utility.

### Five historical failures, kept separate

These were rerun and match the failures documented and reproduced in the accepted A5-C1 audit. No historical expectation was changed.

| Audit | Unchanged result |
| --- | --- |
| `audit-v603-beta8-p9-hf4a-card-ux.mjs:82` | Old regex `setPlayingIndex(step.highlight ?`, after 9 passes |
| `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33` | Expected version `...hf4c-r1`; actual `...hf4d` |
| `audit-v603-d0-d1-text-identity.mjs:229` | Expected Table hash `024aa45b...`; actual `faa88212...` |
| `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | Expected `/Browser TTS/`; actual `David · US`, after 9 passes |
| `audit-v603-beta8-p9-hf4c-player-audio-ux.mjs:35` | Expected version `...hf4c`; actual `...hf4d` |

## 6. Evidence, safety and final acceptance recommendation

Logs and machine-readable results are retained outside the repository:

```text
C:\Users\HikamSeif\AppData\Local\Temp\prolingo-a5-hf1-evidence-4f2bd5bd86e944f4b8f856dd5de3b94e
```

Key artifacts: `palette-before-fix.log`, `node-results.json`, `a2-repeat-results.json`, five `a2-repeat-*.log` files containing complete reveal geometry, `browser-results.json`, and per-suite logs.

Protected-source comparison against HEAD confirms no change to D3/D4 domains/persistence, D5 hook/session observer/cursor authority, canonical constants, audio services, original Paragraph/Editor, routing/App or Table. Canonical DB/schema remain **1**. No new palette storage, snapshot mutation, migration, live DB write, audio generation/deletion or real-data GC was introduced or performed. No production scroll/focus, Mixed, Legacy, Data Management or AI Voice code changed.

**Recommendation: accept HF1 as closing both P2 items and proceed to final manual acceptance.** On desktop and Android, check shared-hue speaker names/monograms/Turn labels, Full/Part/Segment search reveal in smooth/reduced motion, large text and real TTS/highlight behavior using isolated fixtures. The remaining A5 human visual/audio checklist and explicit branch-integration approval still apply; headless results do not supply user approval.

All five files remain uncommitted. No commit, merge, push, deployment or database v2 activation was performed. Work stops after HF1.
