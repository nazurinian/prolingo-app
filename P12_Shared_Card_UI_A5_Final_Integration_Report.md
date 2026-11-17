# P12 Shared Card UI — A5 Final Local Integration

Date: 2026-11-17. Repository: `nazurinian/prolingo-app`. Authorization: local fast-forward-only integration and verification. User-reported Functional Smoke Acceptance: **9/9 PASS** across Paragraph Reader, Conversation Reader and D4 Editor; A5-C1 and A5-HF1 technical reviews accepted.

**Local integration completed successfully. Post-integration acceptance is CONDITIONAL because one newly observed, intermittent A2 completed-reveal failure remains open.** It is reported separately from the five established historical failures. No source/test patch, rollback, push, deployment, production activation or canonical migration was performed.

**P13 entry recommendation: CONDITIONAL GO.** Resolve or explicitly accept the narrowly scoped R1 finding below before expanding implementation into Mixed UI. The integration itself is complete and matches the approved source exactly; this report does not claim an entirely green verification matrix or begin P13.

## 1. Verified preflight and exact resulting refs

| Item | Verified value |
| --- | --- |
| Source branch | `feature/p12-shared-card-ui` |
| Required and actual source before integration | `dc3722c173793aed124ae4bee98092377d62b795` |
| Target branch | `feature/p12-conversation-only` |
| Required and actual target before integration | `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd` |
| Backup reference | `backup/p12-conversation-before-shared-a5` |
| Backup SHA, verified after integration and QA | `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd` |
| Target SHA after integration and QA | **`dc3722c173793aed124ae4bee98092377d62b795`** |
| Source SHA after integration and QA | **`dc3722c173793aed124ae4bee98092377d62b795`**, unchanged |
| Merge method | `--ff-only`; no merge commit |

All preflight requirements passed before branch mutation:

- Actual refs matched the required SHAs exactly; target was an ancestor of source.
- Source worktree was clean, including untracked files. Target had no existing checkout/worktree.
- No merge, rebase, cherry-pick or revert operation was pending. No unmerged index entries were encountered.
- Proposed sibling directory did not exist; the selected backup ref did not exist.
- Existing worktrees were identified. The separate AI Voice worktree was left untouched.

Source worktree, retained clean:

```text
C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-app
```

New target worktree:

```text
C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa
```

The target was clean immediately after the fast-forward and after all verification, before writing this report. At delivery its only untracked addition is this requested report. No tracked source, test or lockfile modification was made. Source and backup branches were retained.

## 2. Exact integration and setup commands

These three branch/worktree mutation commands were executed, in order, from the source worktree:

```powershell
git branch backup/p12-conversation-before-shared-a5 a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd
git worktree add "C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa" feature/p12-conversation-only
git -C "C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa" merge --ff-only dc3722c173793aed124ae4bee98092377d62b795
```

Every command exited 0. Backup and both branch SHAs were checked before/after the merge. No alternative strategy was attempted. Nine reviewed commits were fast-forwarded: A0, A1, A2, A2-HF1, A3, A4-C1, A4-H2, A5-C1 report and A5-HF1.

Integrated diff against the checkpoint: **48 files, +12,029 / -52 lines**. Target tree equals the pinned source tree. Protected `App`, DB constants, D4 command domains, audio/playback services, Table and package/lockfile diffs against the checkpoint are empty. Expected Shared UI host adapters are the previously reviewed changes.

All dependency installation, build, lint and suite processes ran with the **new target worktree as their working directory**, not the source worktree. Fresh dependencies were installed from its unchanged lockfile; no dependency junction or source `node_modules` reuse was used.

```powershell
cmd.exe /d /c npm ci --no-audit --no-fund
cmd.exe /d /c npm run build
node --check scripts/audit-v603-p12-shared-card-a4h.mjs
git diff --check
```

`npm ci` installed 317 packages successfully in 57.84 seconds. The existing `node-domexception` deprecation warning was nonfatal. No package/lockfile changes resulted.

Read-only verification included `git rev-parse`, `git status --porcelain --untracked-files=all`, `git worktree list --porcelain`, `git merge-base --is-ancestor`, ref verification and protected-path/tree comparisons. Source worktree and pending-operation state were rechecked after QA.

## 3. Complete Node regression results

For every suffix below, the exact process command was `node scripts/audit-v603-<suffix>.mjs`, with target-worktree cwd. Full argv, cwd, exit codes and logs are retained in the evidence directory.

| Suite suffix | Result |
| --- | --- |
| `p12-shared-card-a1` | 13 PASS |
| `p12-shared-card-a2` | 10 PASS, including earlier HF1 coverage/cursor checks |
| `p12-shared-card-a3` | 7 PASS |
| `p12-shared-card-a4c` | 11 PASS |
| `p12-shared-card-a4h` | **8 PASS**, including A5-HF1 exact palette collision, cross-Scene cast changes, hue reuse and UID fallback |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | 22 / 9 PASS |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | 15 / 5 PASS |
| `p12d-d3d-regression` / `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` | 12 / 5 / 11 PASS |
| `p12d-virtual-content-units` | 12 PASS; v1 compatibility retained |
| `p12c-conversation-playback` / `p12b-speaker-registry` | 13 / 14 PASS |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | PASS / 30 checks PASS / 19 checks PASS |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | 7 / 20 PASS |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | 24 / 17 PASS |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` / `p10-h5-export-zip-remediation` | 18 / 7 / 21 / 11 PASS |

**31 Node suites: 26 passing suites and the five established failures below.** Denied-storage and rollback-failure logs in the successful failure-injection suites are intentional.

### Established historical failures

The following exact commands were also run: `node scripts/audit-v603-<suffix>.mjs` for each suffix in this table. No expectation or expected hash was edited.

| Suite suffix | Observed failure |
| --- | --- |
| `beta8-p9-hf4a-card-ux` | At `:82`, after 9 passes, old source regex expects `setPlayingIndex(step.highlight ?`. |
| `beta8-p9-hf4c-r1-ui-repair` | At `:33`, expects `...hf4c-r1`; actual version `...hf4d`. |
| `d0-d1-text-identity` | At `:229`, expected Table byte hash `024aa45b...`; fresh target checkout actual `10d82e76...`. See investigation below. |
| `beta8-p9-hf5-voice-audio-ux` | At `:834`, after 9 passes, expects `/Browser TTS/`; actual `David · US`. |
| `beta8-p9-hf4c-player-audio-ux` | At `:35`, expects `...hf4c`; actual version `...hf4d`. |

The Table result was investigated because its raw actual hash differs from the prior source-worktree value `faa88212...`. Three source-working-copy files contain CRLF while the new worktree follows the repository's LF checkout policy: `AudioDownloadPanel.jsx`, `MemoizedRow.jsx`, `PlaylistViewport.jsx`. Every raw difference disappears after newline normalization; all Table Git blobs are unchanged against the original checkpoint. Evidence is in `table-checkout-eol-evidence.json`. This remains the known obsolete byte-sensitive Table assertion, not a Table code change. No Table file was rewritten to make it pass.

## 4. Browser, reveal, lint and build results

Environment: Node 24.11.1, Vite 7.2.6, headless Microsoft Edge 157.0.0.0, Windows. Browser suites ran serially with fresh disposable profiles and the target worktree's built CSS.

Exact browser commands use `node scripts/audit-v603-<suffix>.mjs`, with the flags shown:

| Browser suite suffix / flags | Result |
| --- | --- |
| `p12-shared-card-a1-browser` | 7 PASS |
| `p12-shared-card-a3-browser --check-production` | 8 PASS + 4 gates |
| `p12-shared-card-a4c-browser --check-production` | 12 PASS + 4 gates |
| `p12-shared-card-a4h-browser --check-production` | 6 PASS + 4 gates |
| `p12d-d4c-browser --check-production` | 13 PASS + 4 gates; **20/20 commands** covered, async validation and failed-draft preservation |
| `p12d-d5-browser` | 3 PASS; real Web Audio/binary/RF and session checks |
| `p12d-d5-ui-browser` | 15 PASS; real corrupt Cached Full recovery, speaker/rate ordering, pause/resume, stale-session cancellation |
| `p12d-d3d-browser` | 9 PASS; disposable QA databases only |

Those eight suites passed **73/73 browser checks**. All tested DEV/production gates and production artifact scans passed. They do not erase the A2 failure below.

### A2/HF1 repeated integrated reveal checks

Exact command, five consecutive unmodified runs:

```powershell
node scripts/audit-v603-p12-shared-card-a2-browser.mjs --check-production
```

| Run | Duration | Browser checks | Completed reveals | Gates | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | 16.53 s | 10/10 | 15/15 | 4/4 | PASS |
| 2 | 16.53 s | 10/10 | 15/15 | 4/4 | PASS |
| 3 | 16.97 s | 10/10 | 15/15 | 4/4 | PASS |
| 4 | 19.67 s | **9/10** | **14/15** | 4/4 | **FAIL: R1** |
| 5 | 15.61 s | 10/10 | 15/15 | 4/4 | PASS |

Every run reported zero IndexedDB and storage calls. The palette, Full/Part/Segment reveal matrix and no-movement negative control pass; run 4 fails in the later reduced-motion/300 px viewport path. This is **not** a sixth historical Node failure and is **not** classified as established baseline debt.

### New finding R1 — intermittent reduced-motion reveal after viewport/font changes

Severity: **P2 / open integration-QA finding**. Affected assertion: `scripts/fixtures/shared-card-a2/browser-cases.jsx:522`, using `completed-reveal.js:30`.

In run 4, the case combining v1 compatibility, desktop/mobile viewport changes, dark mode, 200% font size and reduced motion failed the 4-second completed-visibility deadline. The final geometry was genuinely offscreen:

```text
Target: SEGMENT_000006, text channel
Viewport: 1024 × 300
document.scrollTop: 1517
target top/bottom: -430.46875 / -406.46875
intersected bounds top/bottom: 0 / -253.421875
```

The check correctly refused to treat a scroll request as success. The preceding request/`auto` motion checks had succeeded, but the final visible position was wrong. The original failure, full stack and all other reveal geometry are preserved in `a2-repeat-4.log`.

Bounded investigation:

- Rechecked exact target/source refs, target tree equality, source/test cleanliness, final JS/CSS output and protected paths. No merge conflict or post-merge code change exists.
- Inspected the test sequence: 200% font scaling is reset immediately before emulated reduced motion and the 1024×300 viewport change; the production follow effect schedules a native center-scroll on an animation frame.
- Ran **three additional diagnostic suite executions**, serially, with a separate CDP observer. Repository tests and assertions were unchanged. The observer delegated the native scroll call unchanged and recorded viewport, font, document height, target rectangle and scroll offsets; its code lives only in the external evidence directory.
- All three instrumented runs passed 10/10. Normal native behavior moved document scrollTop **0 → 949**, revealing the target at **137.53125–161.53125**. One resize observation still had a 32 px root font before it returned to 16 px at the native call; document height also changed substantially during setup.

The transition-sensitive sequence suggests a viewport/font-layout/scroll-anchoring or harness timing interaction. **The exact cause is not proven, and a production versus harness-only cause has not been established.** Diagnostic observation can affect scheduling. Later passes do not close the original failure, so this report does not claim five stable passes or unconditional post-integration acceptance. No source/test change or weakened assertion was made. Preserve the worktree/evidence for a targeted disposition.

Exact diagnostic commands were `node <evidence>\observe-reduced-motion.mjs 1`, then `2`, then `3`. That external observer ran the same A2 command from the target worktree. Logs are `a2-diagnostic-*.log` and `a2-diagnostic-*-scroll.json`.

### ESLint and build

- Scoped ESLint was executed with `node --input-type=module -e <program>` using the installed ESLint API on all 20 application paths changed since the checkpoint plus the two HF1 browser fixture/helper files. The full executed program is archived in `lint-program.txt` and its literal argv in `executed-command-manifest.json`. It also linted original checkpoint versions for debt comparison. **21 files are clean: 0 errors / 0 warnings.**
- The remaining file, `TextStructuredPlayer.jsx`, has **17 errors / 3 warnings before and after**. This is existing lint debt; no new lint error was introduced and no entirely-clean global lint result is claimed. Full per-file/rule results and cwd are in `lint-results.json`.
- `node --check scripts/audit-v603-p12-shared-card-a4h.mjs`: PASS.
- `npm run build`: **PASS**, 1906 modules, `index-D6HylpNV.js` 1696.54 kB / 448.56 kB gzip and `index-E2W4hf70.css` 118.56 kB. JS/CSS fingerprints match the accepted HF1 output. Existing browser-data/large-chunk advisories remain nonfatal.
- `git diff --check`: PASS; no tracked working-tree change.

## 5. Database and production boundaries

Verified from the integrated target:

```js
TEXT_LIBRARY_DB_VERSION === 1
TEXT_LIBRARY_SCHEMA_VERSION === 1
```

Canonical constants and stores are unchanged against the original checkpoint. No canonical IndexedDB v2 activation, upgrade, startup migration, live data repair or production Conversation routing was introduced or executed.

`src/App.jsx` is unchanged; new QA entries in `src/main.jsx` remain DEV-only. Compiled route checks use a safe App stub to avoid canonical startup, and final production assets were separately scanned for QA marker/chunk exclusion. All such checks passed.

UI browser suites used disposable in-memory snapshots and reported zero DB/storage calls. D3-D browser persistence tests used only `prolingo_text_library_d3b_qa_d3d_clone_failure`, `_migration`, `_partial`, `_v1_restore` and `_corruption` in a disposable profile. No canonical database was opened by verification.

Audio/voice defaults, AudioVariant/RF matching, Cached Full, Staging/ZIP/GC and D4 command implementations were not modified during integration. Tests use QA blobs/fixtures/mock file systems; no real audio generation, real-data GC or existing audio deletion was performed. AI Voice, Table/Legacy and Data Management remain untouched.

## 6. Rollback instructions — not executed

No automatic rollback was performed. The backup remains available, and both source and target stay at the approved integrated SHA. Do not discard user changes, delete the source/backup branches or force-reset shared history.

If rollback is separately authorized:

1. Preserve this uncommitted report and external evidence. Require a clean target working tree and recheck the actual target SHA; stop if later user commits/changes require review.
2. Create a nonconflicting rollback branch in the dedicated worktree, retaining the integrated target and backup refs.
3. Prepare a history-preserving revert of the nine integrated commits, newest first, without committing automatically:

```powershell
# Proposed only; these commands were NOT executed.
git -C "C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa" switch -c rollback/p12-shared-final-dc3722c dc3722c173793aed124ae4bee98092377d62b795
git -C "C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa" revert --no-commit dc3722c173793aed124ae4bee98092377d62b795 69d42a622ff8c6bef2a2979c9ff7dad35a948a3e 7456c6377f29a5e238551f426dc8c3c1b4c22680 eb2f4000bdd29e366a3ae7c15bd87325d7dc83dd a162a7d357f7380440d97d05128d0fef5dfd29f6 c0a7d53e2110af4be4a95a39aea6ec86435d9c36 28686f9d31053144498ca3e47bbc1010e5d4604f ef6b0f636eca987d5c2805581a83468caa965160 cb12f95ea6bf3045502b60ee824abe4c1b23695c
```

4. Review the staged result against backup SHA `a85bb63...`, run the original Conversation regressions, then obtain separate approval before committing, integrating or publishing the rollback. Stop on conflicts; preserve unrelated work. No DB/audio rollback is part of this procedure.

## 7. Acceptance limits, evidence and final recommendation

The user's 9/9 Functional Smoke Acceptance is recorded as completed, not reset to pending by this report. The target contains the exact same pinned code. Headless automation does not independently establish Android/TalkBack behavior, every browser/device, long listening sessions or every real voice/backend combination; the user did not specify all those dimensions of the smoke test. R1's specific combined viewport/font/reduced-motion sequence remains an open verification limitation.

**GO for the authorized local fast-forward integration: completed. CONDITIONAL GO for beginning P13 Mixed Workspace:** the next scoped decision must close R1 or explicitly accept it as a limited QA carry-forward; do not silently count it among the five historical failures. No P13 implementation was started. Production v2/Conversation activation, deployment and pushing either branch remain unauthorized.

Evidence root:

```text
C:\Users\HIKAMS~1\AppData\Local\Temp\prolingo-p12-final-integration-fbvzgzzc
```

Key artifacts: `preflight.json`, `integration-commands.json` (exact Git argv/stdout/stderr), `after-fast-forward.json`, `executed-command-manifest.json` (suite/install/build argv and cwd), `node-results.json`, `a2-repeat-results.json`, `browser-results.json`, `lint-results.json`, `production-build.log`, `table-checkout-eol-evidence.json`, diagnostic scripts/logs and `verification-summary.json`. All failure evidence is retained; no failure-driven cleanup or destructive rollback was attempted.

This report is local and uncommitted in the target worktree. Source worktree remains clean; source and backup branches remain present and unchanged. No push, deployment or database migration occurred. Work stops after local integration, verification and reporting.
