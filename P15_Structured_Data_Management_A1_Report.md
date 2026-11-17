# P15-S A0–A1 — implementation and verification

Date: 2026-11-18. **GO for Hydrogen to implement the isolated full-page UI against this foundation.** Canonical write binding, workflow apply and production persistent-v2 activation remain gated. This is not a completed visual Data Management page.

## Source and scope

- Starting and final committed HEAD: **6d481cd3fcf8cad580661552a10c0203ffd30419**.
- Started on clean feature/p13-mixed-workspace in C:/Users/HikamSeif/Documents/@ Lain-Lain/2000 Most Frequently Used Words/prolingo-p12-integration-qa.
- Created feature/p15-structured-data-management with git switch -c. No extra worktree, reset, pull, rebase, merge, commit, push or deployment.
- P13 source branch remains 6d481cd3fcf8cad580661552a10c0203ffd30419.
- Shared UI worktree/ref remains dc3722c173793aed124ae4bee98092377d62b795; AI Voice remains fc8e0350c2d911381b47d14e973132e2b42d7f93; backup/p12-conversation-before-shared-a5 remains a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd. No other worktree was edited.
- Read the accepted P13 context and traced library catalog/hydration/commands, canonical transaction service, source/backup transfer domains, P13/D4 authoring boundaries, Shared projection and A6 integration. No broad P12/P13 re-audit or Legacy work.
- Final working tree has the 11 files below, all local and uncommitted. No existing user changes were overwritten.

## Implemented files and interfaces

| File | Purpose / exact entry points |
| --- | --- |
| src/domain/text/textDataManagementDomain.js (new, 180 lines) | Error/frozen view helpers; field allowlist at line 28; complete snapshot validation at 38; identity navigation at 58; capabilities at 82; read-only selector at 103; disposable command boundary at 137 |
| src/domain/text/textDataManagementTransferDomain.js (new, 73 lines) | Native pure export/inspect/preview adapters, exported at lines 71–73; complete backup metadata requirement, typed transfer errors, owned source previews, no apply |
| src/services/textDataManagementSession.js (new, 91 lines) | Headless UI adapter at line 11; immutable source, selection, one staged coordinator, stable subscribe/getState, drafts and recovery (line 53), no persistence/audio host |
| src/domain/text/textMixedEditorDomain.js (existing) | 10 added / 5 removed lines: expose existing scope guard at 29; parameterize staged coordinator at 119; preserve original Mixed coordinator API through wrapper at 150. No command engine duplication or D4 command change |
| scripts/fixtures/p15-data-management/fixture.js (new, 22 lines) | Existing native-command P13 disposable v2 fixture plus Collection, Paragraph, protected Legacy summary and real native Text Pack attachment |
| scripts/audit-v603-p15-data-management.mjs (new, 216 lines) | 18 focused Node cases, including failure-before-fix draft/audio regressions |
| scripts/fixtures/p15-data-management/browser-cases.jsx (new, 103 lines) | Real React adapter harness and accepted Shared Mixed Reader; navigation, draft input, command failure/retry, pending, stale replies, unsupported/reset recovery, audio association |
| scripts/audit-v603-p15-data-management-browser.mjs (new, 54 lines) | Disposable Edge/CDP fixture page; denies IDB/localStorage/sessionStorage; production bundle exclusion check |
| P15_Structured_Data_Management_A0_Contract.md | Architecture, authority, storage capability matrix and future production gates |
| P15_Hydrogen_UI_Handoff_v1.md | Actual APIs, component ownership, states, supported interactions, safe QA and explicit restrictions |
| P15_Structured_Data_Management_A1_Report.md | This report |

No dependencies, App/route, visual components, persistence services, D5 engine, RF matching, ZIP/Staging/GC, Table/Legacy behavior or AI Voice files changed.

## Data and command contract

The selector validates a complete explicit schema-1 or schema-2 input before projecting a detached frozen catalog and selected Workspace. Existing normalizer, migration inspection, UID diagnostics, hydrator and A1 Card presentation provide the authority. Partial/corrupt/future snapshots fail closed. Unsupported Legacy/v1 Conversation/Mixed remain catalog-visible with a readable reason. Selected Segment resolves its real Card/Unit; explicit foreign ancestors reject.

Persistent Sections/Turns and Card/Segment IDs/UIDs, order, speaker registry, EN/ID and joinAfter are retained. Empty Units/Cards and consecutive same-speaker Turns remain distinct. v1 Paragraph compatibility uses the existing null-ID/null-UID virtual Section projection; Card/Segment commands omit unitId and never persist that view key.

There are **31 allowlisted native commands**: eight Collection/Workspace commands, 22 existing structured content/speaker commands and v1 Segment reorder. Workspace content commands reuse the existing structured guard, then the one native library command engine. All old P13 22-command checks still pass. Workspace type conversions, Legacy authoring, cross-Workspace operands, cross-Card moves, arbitrary source/audio metadata changes and generic audio writes are rejected. Metadata updates preserve all opaque fields and may change note only. Collection deletion retains native nonempty rejection; sibling reorder remains a complete permutation.

The session defaults to read-only with no permissions. Explicit disposable boundary and catalog/content permission are required. Native result stages once. The reused coordinator locks synchronously, validates exact asynchronous acknowledgement and refuses stale snapshot/Workspace/revision results. Navigation invalidates outstanding replies. Failed commands preserve separate identity-scoped drafts, including when source replacement fails validation. No browsing operation changes activeDocumentId.

**Canonical integration gate:** existing executeTextLibraryCommand reads fresh v1 state and allocates inside its transaction. Passing it as the staged acknowledgement would execute a second allocation and lacks expected-snapshot concurrency protection. This adapter deliberately does not bind it. Hydrogen can implement the entire isolated UI using actual supported APIs; real persistence needs a separately approved transaction/receipt integration. Existing v1 production behavior is unchanged.

## Sources, audio and transfers

- AudioVariant ownership resolves through its persistent Segment FK; there is no documentId field on the native variant. The inspector retains the exact original variant records/order scoped by those Segment IDs.
- Full artifact metadata and source ownership remain opaque/read-only. Metadata presence never produces a Full Ready claim.
- Optional coverage reuses existing RF/voice/profile coverage logic with caller-provided preferences and concrete runtime URL bindings. Lazy location flags are filtered out. No preferences means not-evaluated. This is not an independent filesystem or decoded-binary probe; the caller must verify physical bindings.
- Scoped Text Pack export and complete backup export use native format domains. Backup export requires complete authoritative metaRecords from the same read as the snapshot; missing/mismatched metadata rejects. Unknown metadata and supplied source registries survive. Binaries are not included.
- Format inspection supports backup, Text Pack and External JSON. Copy/initial-import, owned single-Workspace source sync/detach, and registered External reconciliation inspection are pure previews with applyEnabled:false.
- Source detach preview preserves data. Multi-Workspace attachments, destructive source removal, import/restore apply, physical audio generation/deletion/GC and live writer binding remain disabled with explicit reasons. Existing production service entry points are documented rather than duplicated.

## Findings closed during implementation

| New foundation finding | Before evidence | Correction / after |
| --- | --- | --- |
| Retained draft unreadable after invalid source replacement | Initial browser: 5 PASS / 1 FAIL, invalid-source recovery timed out because React draft getter threw. Added Node case reproduced OUT_OF_SCOPE in getDraft | Owner validation remains on draft writes; existing draft reads/clears can recover without a current valid source. Final Node 18/18 and browser 6/6 |
| Audio inspector initially filtered a nonexistent variant.documentId | Added identity regression failed: scoped variants were empty despite existing variants | Scope through actual Segment IDs, retaining native variant order. An intermediate flattened-tree attempt also failed exact-array ordering; final source-order filter passes exact Node equality and browser ownership checks |
| Backup snapshot lacks complete database metadata | Identified while defining the new API, before release | Require consistent complete metaRecords; test missing metadata rejection, sidecar and unknown-key roundtrip. No synthesized full-backup claim |

Before/failure logs were preserved, not reclassified as historical failures. No existing playback or persistence defect was patched.

## Executed verification

Evidence directory: **C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-p15-a1-3e461236**.

New tests:

- Node final: **18 PASS, 0 FAIL**, zero DB calls. Snapshot immutability; identity/order/empties; Collection/Workspace CRUD/navigation; foreign scope; permissions; typed errors; Section/Turn/Sentence native edits; speakers; exact audio association; v1 virtual compatibility; corrupt/partial/future inputs; real Text Pack attachment/External previews; backup metadata; duplicate/stale/malformed/rejected async results; selected-entity deletion; invalid-source draft recovery.
- Browser initial: **5 PASS, 1 FAIL** as described above. After draft repair: **6/6**; another serial compatibility execution **6/6**; final run after exact audio association assertion **6/6**. Zero IDB, localStorage and sessionStorage calls; productionFoundationUnwired:true.
- Final scoped ESLint: exit 0, all eight changed/new JS/JSX files. Existing baseline-browser-mapping age warning remains; no dependency update. This is not a whole-repository lint-clean claim.
- npm run build: exit 0, final 8.26 s. Assets index-Bna7SLo-.js (1707.37 kB, gzip 452.09 kB), index-fSxQdqRg.css (118.65 kB). Existing chunk-size warning remains.
- git diff --check: PASS. Source/target/backup/AI refs and worktree integrity rechecked.

### Node compatibility matrix

Executed as node scripts/audit-v603-<suffix>.mjs, with one log per suffix. **40 suites: 35 exit 0, exactly five established historical exit-1 failures.** Initial P15 run had 17 tests; final added regression run has 18 passing tests (p15-final-node.log). Shared coordinator regression suites passed after its extraction; subsequent edits affect only the new P15 modules/tests.

| Suffix | Result |
| --- | --- |
| p15-data-management | PASS; final 18 checks |
| p13-integration-a5 | PASS; 8 checks |
| p13-mixed-audio | PASS |
| p13-mixed-editor | PASS; 14 checks / 22 native command kinds |
| p13-mixed-workspace | PASS |
| p12-a6-main-reader | PASS |
| p12-shared-card-a1 | PASS |
| p12-shared-card-a2 | PASS |
| p12-shared-card-a3 | PASS |
| p12-shared-card-a4c | PASS |
| p12-shared-card-a4h | PASS |
| p12d-d4a-conversation-editor | PASS; 22 checks |
| p12d-d4b-conversation-editor-ui | PASS |
| p12d-d5-conversation-audio | PASS; 15 checks |
| p12d-d5-audio-ui | PASS |
| p12d-d3d-regression | PASS |
| p12d-d3c-compatibility | PASS |
| p12d-d3b-content-unit-persistence | PASS; 11 checks |
| p12d-virtual-content-units | PASS |
| p12c-conversation-playback | PASS |
| p12b-speaker-registry | PASS |
| p12a-external-reconcile | PASS |
| d2-external-json | PASS |
| d3-d4-external-reconcile | PASS |
| round-d3-paragraph-acceptance | PASS |
| beta8-p9-hf4d-navigation | PASS |
| p9b-playback-marathon | PASS |
| p9c-bulk-marathon | PASS |
| a0-a3-rf-portability | PASS |
| a4-staging-gc | PASS |
| beta8-p4-staging-zip | PASS |
| p10-h5-export-zip-remediation | PASS |
| beta8-p1-ordered-multi-audio | PASS |
| beta8-p2-split-full-domain | PASS |
| beta8-p3-runtime-playback | PASS |
| beta8-p9-hf4a-card-ux | Historical FAIL: obsolete setPlayingIndex regex, line 82 |
| beta8-p9-hf4c-r1-ui-repair | Historical FAIL: hf4c-r1 expected; current hf4d, line 33 |
| d0-d1-text-identity | Historical FAIL: frozen Table hash, line 229; actual 10d82e76… vs expected 024aa45b… |
| beta8-p9-hf5-voice-audio-ux | Historical FAIL: Browser TTS label expected; current named David/US voice, line 834 |
| beta8-p9-hf4c-player-audio-ux | Historical FAIL: hf4c expected; current hf4d, line 35 |

The five failures match the accepted P13 debt and untouched source/expectations. They were not repaired or counted as PASS. No new compatibility failure.

### Serial real-browser matrix

Run scripts/audit-v603-<suite>.mjs with the arguments below. All **15 suites passed**, including all route gates they report. No intermittent compatibility failure required a rerun.

| Suite / arguments | Checks | Result |
| --- | ---: | --- |
| p15-data-management-browser | 6 | PASS; zero storage, production-unwired check |
| p13-mixed-workspace-browser --check-production | 11 | PASS; four DEV/prod gates, production QA absent |
| p13-mixed-workspace-browser --editor --check-production | 11 | PASS; native editor/draft/async lifecycle and four gates |
| p13-mixed-workspace-browser --audio --check-production | 10 | PASS; Full/rate/local/TTS/session evidence and four gates |
| p13-mixed-workspace-browser --audio --a5 --check-production | 4 | PASS; native TTS lifecycle/codec regression and four gates |
| p12-a6-main-reader-browser | 12 | PASS; real App dual-reader path |
| p12-shared-card-a1-browser | 7 | PASS |
| p12-shared-card-a2-browser | 10 | PASS; completed reveals and four gates |
| p12-shared-card-a3-browser | 8 | PASS; four gates |
| p12-shared-card-a4c-browser | 12 | PASS; four gates |
| p12-shared-card-a4h-browser | 6 | PASS; four gates |
| p12d-d4c-browser --check-production | 13 | PASS; four gates |
| p12d-d5-browser | 3 | PASS |
| p12d-d5-ui-browser | 15 | PASS |
| p12d-d3d-browser | 9 | PASS; separately named disposable QA databases |

Key final logs: p15-final-node.log, p15-browser-initial.log, p15-draft-before.log, p15-draft-after.log, p15-audio-association-before.log, p15-browser-final-after-association.log, node-results.json, browser-results.json, lint-final.log, build-final.log. The intermediate p15-audio-association-after.log records the rejected ordering implementation; final exact equality is in p15-final-node.log. Browser profiles remain named disposable directories shown in their logs. No live canonical DB or real audio was used.

## Remaining gates and recommendation

**GO for the isolated Hydrogen full-page UI phase.** The actual handoff covers selectors, component ownership, command fields/parameters, capability reasons, drafts, async failures, source/audio inspectors and transfer previews. It does not promise workflow apply or canonical storage capabilities that are not bound.

Remaining limits:

1. No full-page visual interface or production route yet. Main App A6 and Open Workspace are unchanged.
2. Real-user canonical write concurrency/receipt integration needs separate approval and tests; canonical DB/schema remain 1.
3. Import/sync/restore apply, multi-Workspace source actions and destructive removal are not enabled. Metadata-complete backup requires a consistent host read.
4. Physical audio readiness relies on verified supplied runtime bindings and existing coverage logic. Full artifacts are metadata-only in this inspector; no new media/filesystem probe or engine.
5. Manual UX, Android/real-device, assistive-technology and final visual acceptance remain deferred. Headless React fixtures are functional evidence, not human approval.
6. The five historical failures, existing repository lint debt and build warnings remain separate debt.

No push, deployment, canonical upgrade, real-user Mixed write, physical audio deletion, AI Voice/Legacy phase or Hydrogen worktree edit was started. Stop here for review.
