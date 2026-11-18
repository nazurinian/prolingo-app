# P15-A2 — Codex independent source and transaction safety audit

Date: 2026-11-18. **Final recommendation: CONDITIONAL GO for isolated P15-H2 after the corrections below.** Retain Gemini's implementation and transactional core. No P0 was found; the verified P1/P2 findings below are closed in the tested disposable scope. Canonical storage activation and production Data Management remain outside this acceptance.

## Preflight and documents

- Actual/required starting HEAD: **8eaadeeb503dbac0ddb1a884df2928c67a4837a8**, feature/p15-structured-data-management; working tree clean, no merge/rebase/cherry-pick/revert operation.
- Worktree: C:/Users/HikamSeif/Documents/@ Lain-Lain/2000 Most Frequently Used Words/prolingo-p12-integration-qa. No branch switch or additional worktree.
- Verified history: c166c18 (A0/A1) → 71802b5 (H1) → 8eaadee (A2).
- Read completely: P15_A2_Persistence_Transaction_Contract.md, P15_A2_Persistence_Integration_Report.md, P15_A2_Hydrogen_H2_Handoff.md, P15_Structured_Data_Management_A0_Contract.md and P15_H1_Full_Page_Data_Management_UI_Report.md. Reports were treated as claims, then checked against source and executable behavior.
- Preserved P13 branch 6d481cd3fcf8cad580661552a10c0203ffd30419; Shared UI worktree dc3722c173793aed124ae4bee98092377d62b795; AI Voice fc8e0350c2d911381b47d14e973132e2b42d7f93; backup/p12-conversation-before-shared-a5 a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd.
- Delivery is one local audit-fix commit containing this report. Its exact hash is supplied in the completion message. No remote operation, deployment, H2 implementation or canonical data access.

## Initial findings recorded before remediation

Starting baseline: 8eaadeeb503dbac0ddb1a884df2928c67a4837a8 on feature/p15-structured-data-management; clean integration worktree. Existing A2 Node 6/6 and Edge 6/6 pass independently. New adversarial Edge: 1 PASS / 9 FAIL, zero canonical touches and no QA DBs left behind.

Initial findings (original baseline line references):

| ID / severity | Verified source and reproduction |
| --- | --- |
| A2-I01 / P1 | textDataManagementPersistenceService.js:787–809 validates normalized backups after checking only key presence. Raw lowered text counter, string initialized and malformed source/external registries all restore successfully (AUD-01). |
| A2-I02 / P1 | Persistence service:109–115 and 814 open with requested version before read/restore. Reading v1 with version:2 changes its schema; aborted v2 restore leaves original v1 data in a partially upgraded database (AUD-02/03). |
| A2-I03 / P1 | Persistence adapter:880–886 permits context.boundary/permissions to widen the adapter's read-only/no-permission grant (AUD-04). |
| A2-I04 / P1 | TextDataManagementPage.jsx:172–201 excludes effectiveExecute from lifecycle updates; changing adapters writes to the old DB (AUD-08). Source ref-only comparison at 217–237 also resets accepted edits on equal cloned props (AUD-07). Permission changes recreate the session and discard drafts. |
| A2-I05 / P2 | textMixedEditorDomain.js: authoritative receipt branch validates previousFingerprint only; forged next fingerprint, revision and command type are accepted (AUD-05). |
| A2-I06 / P1 | Coordinator assertStillCurrent discards a successfully committed receipt as ordinary STALE_RESULT. Page reload exists only in invalid-snapshot rendering, not the ready-state conflict banner. Actual committed creation + navigation has no explicit committed/reload-required evidence or reachable conflict reload (AUD-06/09). |

Independent cross-realm simultaneous writers serialize correctly: one winner, one STALE_RESULT before a second ID allocation (AUD-10). Canonical constants remain 1; canonical-name guards hold. No production/source remediation preceded this evidence. Final results and exact patch scope will be appended after focused fixes and regressions.

## Additional focused findings and final dispositions

All source references below are relative to the repository. Baseline references above are at 8eaadee; references here are to the corrected files.

| Finding | Correction and final source reference | Evidence / disposition |
| --- | --- | --- |
| A2-I01 / P1: normalized restore bypass | src/services/persistence/textDataManagementPersistenceService.js:791 reuses strict raw state/meta reconstruction before compatibility parsing | AUD-01 rejected all four previously accepted mutations. Core metadata, store/counter floors and registry array shape are checked before any target opening/write. CLOSED |
| A2-I02 / P1: version changes outside record transaction | Persistence service:109 opens existing DB without a requested upgrade; verifies version afterward. Restore at line 814 opens an existing matching-version target or creates a genuinely missing disposable target | AUD-02/03: existing v1 stays readable at version 1; no partially upgraded target after a failed restore. Version mismatch now requires a separately named QA destination. CLOSED |
| A2-I03 / P1: permission escalation | Persistence service:883 enforces boundary ceiling and requested permission subset | AUD-04: read-only adapter cannot be widened; content-only adapter cannot create Collections. No write. CLOSED |
| A2-I04 / P1: stale executor / prop resets | src/components/text/management/TextDataManagementPage.jsx:174 preserves the owned session; line 208 configures its executor/access; line 223 compares canonical source content and database identity. src/services/textDataManagementSession.js:86 adds configure without replacing source/drafts | AUD-07/08: equal prop clones preserve accepted edits; permission changes preserve drafts; switching adapters writes only the selected new database. CLOSED |
| A2-I05 / P2: weak receipt verification | src/domain/text/textMixedEditorDomain.js:160 checks next fingerprint against supplied snapshot and rejects inconsistent supplied revision/command type; existing snapshot validation remains | AUD-05: forged fingerprint, revision and command are rejected. Native actual receipt equals a separate committed-state read in AUD-11. CLOSED |
| A2-I06 / P1: committed transaction hidden as ordinary stale failure | Coordinator:188 preserves committed:true/reloadRequired:true when a successfully committed authoritative receipt cannot be accepted. Pre-commit conflicts also request reload without claiming commit. Page:532 exposes the supplied reload callback in the ready-state conflict banner | AUD-06/09/14: actual commit remains in DB after navigation/disposal/source or permission change; UI does not publish a stale snapshot; reload reconciles while preserving drafts and does not duplicate creation. CLOSED |
| A2-I07 / P2: stale source inspector after authoritative receipt | Session:50 refreshes sourceAttachments and externalImports through existing normalizers from the accepted receipt's complete metaRecords | AUD-15 first failed with stale fileName after a concurrent metadata-only change; now sees the registry from the same authoritative transaction. CLOSED |
| A2-I08 / P1: loading transition destroys recovery drafts | Page:174 no longer disposes its owned session when the host shows loading; actual host teardown still disposes | AUD-13 first failed independently, then passed: loading true → false preserves the draft. CLOSED |
| A2-I09 / P2: generic coordinator can allocate during authoritative preflight | Coordinator:145 requires an explicit zero-allocation precheck for authoritative execution rather than falling back to allocating prepare | AUD-16 first demonstrated prepare being invoked; now fails closed with INVALID_EXECUTOR, zero prepare/executor calls. P15 already supplies the correct existing precheck. CLOSED |

Severity describes the effect if retained for authorized persistent use. All reproduced writes used separately named disposable QA databases; canonical user data was never exposed.

## What was independently verified as sound

**Atomic command execution.** Persistence service:558 creates one readwrite transaction across every required entity/meta store. Its final read request invokes the synchronous handler while the transaction is active. Validation and expectedSnapshotFingerprint comparison occur before the single native applyTextDataManagementCommand call. Entity diffs and core metadata updates are queued in that transaction; success resolves only on transaction completion. This transaction core was retained.

**Allocation/counters.** P15's precheck validates scope/capabilities without applying a command. Actual Web Crypto instrumentation observed one randomUUID for a new Conversation Card and one further UUID for its new Turn, with exact committed/session identity and one Unit-counter increment (AUD-11). All regular counter floors are checked in reconstruction; Content Unit floors additionally use existing v2 validation. Existing A2 tests reject a lowered regular counter and lowered Content Unit counter. Stale cross-realm loser cannot advance the Card counter.

**Concurrency.** The same-realm Set lock rejects overlapping writes with BUSY. Independent same-origin iframe/module realms have separate module-level locks; simultaneous writes at the same expected fingerprint yield one committed winner and one STALE_RESULT through IndexedDB serialization (AUD-10). Navigation/reconfiguration increments session revision and invalidates late receipts. No asynchronous network/media step was added inside a live IDB transaction.

**Rollback.** Existing tests cover explicit tx.abort and synchronous pre-commit throws for commands/restore. AUD-12 adds an asynchronous real IndexedDB ConstraintError after staged writes: every record and counter/meta value remains unchanged. A UI refusing a receipt after commit does not roll that commit back; this distinction is now explicit.

**Consistent backups/metadata.** The reader captures all stores and complete metaRecords in one readonly transaction. Required metadata, schema/migration, parent relationships, global UIDs and counters are validated. Existing service preserves sidecar and unknown metadata records during ordinary command writes; native backup/export/replace-restore preserves their keys/values through its established envelope. Backup contains logical audio metadata only, not audio binaries. Raw malformed restore input now rejects before compatibility normalization; original backup-domain behavior was not changed.

**Identity and compatibility.** No Card/Unit/Segment UID or native command contract was changed. Existing empty Units, same-speaker Turns, bilingual pairs and Segment-owned AudioVariants remain governed by native selectors/commands. Source ownership, Full/RF metadata and channel-specific logical invalidation regressions pass. v1 Paragraph virtual Sections remain derived/read-only and v1 DB stays v1. Incomplete migrations reject. Legacy and AI Voice behavior were untouched.

**UI lifecycle.** StrictMode initial mount/unchanged rerender keeps revision 1; real source replacement updates deliberately. Equal cloned input props cannot reset accepted edits. Access/executor updates use configure and fence pending replies without discarding drafts. Loading is presentation state, not teardown. The page still owns one headless command session and no additional audio host.

## Changed files and scope

| File | Change |
| --- | --- |
| src/services/persistence/textDataManagementPersistenceService.js | Existing-version protection, strict raw restore validation, adapter capability ceilings |
| src/services/textDataManagementSession.js | Retained-session configure and receipt registry refresh |
| src/domain/text/textMixedEditorDomain.js | Dynamic captured executor per dispatch, strict authoritative precheck, receipt consistency, committed/stale distinction |
| src/components/text/management/TextDataManagementPage.jsx | Stable owned lifecycle, semantic source comparison, executor rebinding, conflict reload button |
| scripts/audit-v603-p15-a2-persistence-browser.mjs | --independent entry selects adversarial fixture; existing default suite retained |
| scripts/fixtures/p15-data-management/a2-independent-browser-cases.jsx | 16 new focused real Edge / real IDB / React adversarial cases |
| scripts/fixtures/p15-data-management/a2-browser-cases.jsx | Replaces obsolete expected reset-to-revision-1 after boundary toggle with stronger retained-draft/current-source and monotonic-revision assertions |
| P15_A2_Codex_Independent_Audit_Report.md | This audit and evidence |

No UI redesign, duplicate persistence engine, provider/audio change, command-engine rewrite, production routing change, dependency update or canonical constants change. The baseline implementation remains recognizable and retained.

The original browser test had deliberately forced boundary toggles to pick up a changed executor and asserted a revision reset. That encoded the session-loss behavior now demonstrated unsafe; it was strengthened to require retained drafts/source instead. Initial-mount/rerender revision-1 assertions, exact content checks, IDB assertions, route gates and all original six cases remain.

## Test execution and evidence

Evidence directory: **C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-p15-a2-audit-55559ac6**.

| Stage | Actual result |
| --- | --- |
| Unmodified baseline A2 Node / Edge | 6/6 and 6/6 PASS; baseline-build.log PASS |
| Initial independent Edge suite | 1/10 PASS, 9 FAIL; adversarial-before.log records exact failures |
| Additional loading regression before correction | AUD-13 FAIL; loading-draft-before.log |
| Additional registry consistency regression before correction | AUD-15 FAIL; sidecar-before.log |
| Generic authoritative precheck regression before correction | AUD-16 FAIL; precheck-before.log |
| Final independent Edge, serial run 1 | **16/16 PASS**, independent-final-1.log |
| Final independent Edge, serial run 2 | **16/16 PASS**, independent-final-2.log |
| Final original A2 Edge | **6/6 PASS**, a2-original-final.log |
| Final A2 / A1 Node | **6/6**, **18/18 PASS**; verified-p15-a2-persistence.log, verified-p15-data-management.log |
| Final targeted shared coordinator/P13 | Mixed Editor **14/14 / 22 native commands**; A5 **8/8 PASS** |
| Scoped ESLint --max-warnings=0 | Exit 0 on all seven changed/new JS/JSX files; verified-lint.log |
| Production npm run build | Exit 0; verified-build.log, 9.15 s |
| Git whitespace/source integrity | git diff --check PASS; protected files absent from patch; backup/AI/source refs unchanged |

Both final adversarial executions: canonicalDbTouches:0, hasCanonicalDb:false, remainingDisposableDbs:0. They use names beginning prolingo_text_library_d3b_qa_p15_independent_; the test deletes only its explicitly created disposable DBs. Original A2 likewise reports no canonical access and no remaining QA DBs.

Node compatibility: **41 suites executed; final disposition 36 PASS and the five established historical failures below.** The first sweep caught an audit-patch error on a transport throwing null in P13 Mixed Editor. It was corrected with null-safe handling, and the unchanged existing null-throw case passes in the final targeted rerun. It was not classified as historical debt. node-results.json retains the first-sweep failure; verified-p13-mixed-editor.log is the final result.

All Node commands use node scripts/audit-v603-<suffix>.mjs. Passing suffixes:

```text
p15-a2-persistence, p15-data-management
p13-integration-a5, p13-mixed-audio, p13-mixed-editor, p13-mixed-workspace
p12-a6-main-reader
p12-shared-card-a1, p12-shared-card-a2, p12-shared-card-a3, p12-shared-card-a4c, p12-shared-card-a4h
p12d-d4a-conversation-editor, p12d-d4b-conversation-editor-ui
p12d-d5-conversation-audio, p12d-d5-audio-ui
p12d-d3d-regression, p12d-d3c-compatibility, p12d-d3b-content-unit-persistence, p12d-virtual-content-units
p12c-conversation-playback, p12b-speaker-registry, p12a-external-reconcile
d2-external-json, d3-d4-external-reconcile, round-d3-paragraph-acceptance
beta8-p9-hf4d-navigation, p9b-playback-marathon, p9c-bulk-marathon
a0-a3-rf-portability, a4-staging-gc, beta8-p4-staging-zip, p10-h5-export-zip-remediation
beta8-p1-ordered-multi-audio, beta8-p2-split-full-domain, beta8-p3-runtime-playback
```

Browser compatibility: **17 serial executions PASS**, including two then-15-case adversarial executions before the final AUD-16 addition. The final two serial 16-case executions above repeat and extend those. Exact commands use node scripts/audit-v603-<suite>.mjs:

| Suite / args | Checks / result |
| --- | --- |
| p15-a2-persistence-browser | 6 PASS |
| p15-a2-persistence-browser --independent (twice in compatibility run) | 15 each PASS; superseded by final 16/16 twice |
| p15-data-management-browser | H1 13 PASS, four DEV/prod route gates |
| p13-mixed-workspace-browser --check-production | 11 PASS, four gates |
| p13-mixed-workspace-browser --editor --check-production | 11 PASS, four gates |
| p13-mixed-workspace-browser --audio --check-production | 10 PASS, four gates |
| p13-mixed-workspace-browser --audio --a5 --check-production | 4 PASS, four gates |
| p12-a6-main-reader-browser | Real App 12 PASS |
| p12-shared-card-a1-browser | 7 PASS |
| p12-shared-card-a2-browser | 10 PASS, four gates |
| p12-shared-card-a3-browser | 8 PASS, four gates |
| p12-shared-card-a4c-browser | 12 PASS, four gates |
| p12-shared-card-a4h-browser | 6 PASS, four gates |
| p12d-d4c-browser --check-production | 13 PASS, four gates |
| p12d-d5-browser | 3 PASS |
| p12d-d5-ui-browser | 15 PASS |

No browser intermittency was observed in the final serial runs. New failures during audit are preserved in before/initial logs, not hidden by overwriting them.

Historical failures, unchanged and not counted as passing:

1. beta8-p9-hf4a-card-ux:82 — obsolete setPlayingIndex source regex.
2. beta8-p9-hf4c-r1-ui-repair:33 — expected hf4c-r1, current hf4d.
3. d0-d1-text-identity:229 — frozen Table hash expected 024aa45b…, actual 10d82e76…; Table files/expectations unchanged.
4. beta8-p9-hf5-voice-audio-ux:834 — expected Browser TTS label, current named David/US voice.
5. beta8-p9-hf4c-player-audio-ux:35 — expected hf4c, current hf4d.

Existing build chunk-size and baseline-browser-mapping age notices remain. Scoped lint passes; this is not a claim that repository-wide lint debt is resolved.

## Safety boundaries and H2 conditions

- TEXT_LIBRARY_DB_VERSION === 1 and TEXT_LIBRARY_SCHEMA_VERSION === 1 verified in src/constants/textDatabaseConstants.js:2.
- Canonical names/handles and non-QA names remain hard-blocked. No canonical DB was opened, seeded, migrated, restored or written. No physical audio deletion, real-data GC, deployment, push, Legacy phase or AI Voice edit.
- Production output remains index-9b3mrNZx.js / index-BeVlWNPw.css. Reported production-route/bundle exclusion gates pass; production App integration was not added.
- Original native entity command/persistence/backup compatibility services, RF/Full/TTS/Staging/ZIP/GC contracts remain intact. Only the scoped A2 persistence boundary and its host/session coordination were corrected.
- H2 must use the reviewed disposable adapter, provide its matching loadState snapshot + complete metaRecords/registries, and bind onReloadValidSource to that adapter's loadState followed by source replacement. Do not treat STALE_RESULT with committed:true as a rollback, and do not automatically replay it. Preserve drafts through reload and inspect the committed result first.
- configure is now the internal direct-host mechanism for executor/access changes. It increments revision and retains data/drafts; it is not another session or write path. Adapter database changes are a source boundary and still load the explicitly supplied source. The persistence adapter's grants are an upper bound.
- Existing target DB versions must match restore input. Explicit v1-backup conversion can target a fresh disposable v2 database; restore/read will not perform an in-place version upgrade of existing v1 data.

Not proven by this bounded audit: OS/power-loss durability, forced browser-process termination during commit, separate physical-device behavior, Android/mobile visual acceptance, or production canonical integration. Cross-realm tests bypass the in-process lock with independent module realms; they are not a multi-process crash test. The optional raw transaction fault hook is trusted QA instrumentation, not an untrusted plugin boundary. Restore/source apply remain unbound in the page.

**Final: CONDITIONAL GO for P15-H2 within isolated DEV/disposable QA scope, retaining Gemini's A2 plus these verified corrections. NO-GO for canonical activation/production writes under this audit.** Stop after the single local audit-fix checkpoint and review.
