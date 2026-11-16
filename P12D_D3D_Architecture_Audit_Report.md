# ProLingo P12-D — Gate D3-D consolidated architecture audit

Audit date: 2026-11-16 (Asia/Jakarta). Branch: `feature/p12-conversation-only`.
Approved baseline and audited HEAD: `a143bbaf26a83d5bc1640540ad4fa7229ea65dfb`.
The initial working tree was clean. Changes remain uncommitted.

## Initial findings recorded before production edits

| ID | Severity | Baseline source | Reproduction / consequence |
| --- | --- | --- | --- |
| D3D-01 | P1 | `src/services/persistence/textDatabaseBackupService.js:113` (`executeProLingoTextDatabaseReplaceRestore`) | A valid v2 backup passes the shared validator, then reaches the live v1 opener and replace writer. That writer clears v1 stores, writes schema-2 metadata and Segment Unit FKs, but never writes Content Units. This can replace an intact library with an unreadable, incomplete restore. A sentinel opener confirms that v2 input crosses the canonical boundary. |
| D3D-02 | P1 | `src/domain/text/textSourceAttachmentDomain.js:381–438`; `src/domain/text/textContentUnitCommandDomain.js:316–340` | Attach an empty Paragraph Card in v1, migrate, edit the empty Unit's metadata, then remove the Card upstream or detach with removal. Unit and Card creation/update timestamps still match through ordinary commands, so the heuristic silently deletes the edited Unit. Both cases fail preservation assertions. |
| D3D-03 | P1 | `src/domain/text/textSourceAttachmentDomain.js:185–201, 243–261, 381–438` | Attach a v1 Pack into an already migrated v2 snapshot. Synthetic backfilled Units acquire an ID map but no source Unit baseline. Treating those map entries as proven ownership bypasses the empty-Unit protection. Both sync and detach silently lose edited empty Units. |
| D3D-04 | P2 | `src/services/persistence/textContentUnitPersistenceService.js:323, 329, 433` | The disposable seeding writer accepts a v2 snapshot with default `version=1`, omits the Unit store, and writes dangling FKs/schema-2 metadata. Its raw writer also lacks abort handling for a synchronous `put` failure after queued clears. Browser reproduction pending at initial recording. |
| D3D-05 | P2 / integration blocker | `src/services/persistence/textLibraryIndexedDbService.js`; `textPackJsonService.js`; `textExternalJsonService.js`; `textLibraryCommandService.js` | Canonical readers/writers still use v1 stores. This is intentional dormancy, but enabling constants alone would lose Units or omit required writes. Activation requires a separate integration gate. |
| D3D-06 | P3 | `src/services/persistence/textContentUnitPersistenceService.js:87–95, 176–204` | In-process write exclusion does not coordinate tabs/workers. Schema open/delete lacks blocked/versionchange lifecycle handling. Real-browser transaction/concurrency checks are needed; production cross-tab behavior remains a separate gate. |

No P0 identified. Before remediation, the new independent Node regression has **0 PASS / 5 FAIL**. Existing D3-C (5), D3-B (11), virtual Units/D2 (12), External JSON, P9/P12, audio and GC checks pass. The D0/D1 audit fails at its pre-existing Table hash assertion (`scripts/audit-v603-d0-d1-text-identity.mjs:229`); no hash change is authorized.

Additional evidence recorded before its targeted fix: **D3D-07 (P1)**, `textSourceAttachmentDomain.js:294–331, 575–582` at baseline: promote a v1 source Pack to v2 while a local synthetic empty Unit has been edited. A coincident source `UNIT_000001` reuses the synthetic mapping without any baseline, replaces that local Unit and changes its UID. The independent promotion regression fails (5 PASS / 1 FAIL after earlier fixes). This is a second consequence of synthetic mappings without source ownership evidence, beyond source deletion.

Generalization reproduced before fixing: D3D-02/03 also discard locally added **nonempty Unit metadata** when all child Segments belong to the v1 source. Two additional attachment-direction regressions fail (10 PASS / 2 FAIL after the earlier fixes). The removal guard must protect unmapped Unit annotations even when it is safe to delete their source-owned Segments.

## Demonstrated defects and remediation

1. **D3D-01 fixed:** `src/services/persistence/textDatabaseBackupService.js:115` rejects a backup whose validated DB/schema version differs from the active v1 contract, before opening any database. The shared backup validator still supports dormant v2 portability. The regression uses a sentinel factory, not a canonical database. No production v2 writer was added.
2. **D3D-02 fixed:** `src/domain/text/textContentUnitDomain.js:29, 33, 541` adds explicit `emptyParagraphBackfillV1` provenance only when migration creates an initial empty Paragraph Unit. Source removal requires this evidence, unchanged recorded Unit timestamps, and no additional Unit annotations; equality with mutable Card timestamps is no longer evidence of ownership. Old ambiguous Units without provenance conflict rather than disappear. Proven untouched migration Units still support clean deletion. Existing Units are not retroactively marked or assigned new identities.
3. **D3D-03 and D3D-07 fixed:** `src/domain/text/textSourceAttachmentDomain.js:295, 386, 436` requires a source Unit baseline before treating a synthetic map entry as owned or reusing it during source promotion. Locally annotated nonempty Units also block destructive removal. A promoted source receives a fresh local mapping while the existing local Unit and its UID survive. This does not promise automatic conflict-free promotion for every v1/v2 source schema transition.
4. **D3D-04 fixed:** `src/services/persistence/textContentUnitPersistenceService.js:324, 443` rejects v2-to-v1 seeding and explicitly aborts/awaits completion when staging throws synchronously. Headless Edge confirmed that the baseline really committed partial replacement after a `DataCloneError`; this was not merely an inference from a mock.

The added metadata is a bounded provenance field, not a schema/store redesign. It carries no derived Segment ID list. Existing Segment IDs/UIDs, speaker attribution, AudioVariant references and audio fingerprints are not rewritten by these fixes.

## Architecture assessment and integration boundaries

| Area | Evidence and conclusion |
| --- | --- |
| Persistent identity, FKs, counters | Unit factory/validator and ID-floor allocation enforce Unit format, duplicate Unit IDs/UIDs, parent Card/Workspace consistency, Card kind, Unit/Segment order, and Turn/Segment speaker consistency. Backup and Pack validators additionally check global UID integrity. Counter underflow is repaired on allocation/portable restore rather than reusing occupied IDs. Runtime normalization is not a complete corruption scanner for every older entity. |
| Ordering and empty Units | Segment order remains Card-wide and monotonic by Unit; Unit child membership comes only from `segment.unitId`. `materializedBlockIds` preserves intentionally zero-Unit Cards across repeat migration. Explicit empty Units retain their identity through backup/Pack operations; ambiguous source ownership now fails closed. |
| Migration | Two phases separate physical schema creation from atomic data backfill. Browser evidence confirms that aborting phase 2 leaves physical v2 with original schema-1 rows, and retry recovers. Repeat migration preserves IDs, UIDs and metadata and returns `changed=false`. Adjacent same-speaker v1 Segments remain separate Turns, with no invented speaker IDs. |
| Backup/restore | Disposable v2 restore replaces entities and arbitrary metadata together, removes stale metadata, and rolls back on failure. v1 backup upgrade preserves Segment identities. Live canonical restore is now explicitly v1-only. Metadata-only backups do not include audio binaries. |
| Text Pack/source identity | D3-C covers Copy versus Preserve-UID modes, UID remapping, Unit FKs, empty Cards/Units, attach/sync/detach, local edits and foreign children. New regressions cover v1 attachment in both migration directions and source schema promotion. A synthetic Unit map without a baseline is not source identity evidence. |
| External JSON | Existing external schema identifies Cards/Segments/speakers, not persistent Units. Reconciliation preserves existing compatible Unit membership, multi-Segment Turns, speaker renames and initially empty Units; it can split Turns on speaker divergence. Its upstream format does not express arbitrary authored Unit grouping. D4 must not treat that format as a lossless Unit authoring interchange. |
| Audio, Full artifacts, staging, ZIP, GC | Split render fingerprints depend on content and rendering inputs, not Unit/Segment local IDs. Structural Unit changes can preserve valid Split audio references. Full content/order changes affect derived Full identity. D3-C verifies metadata-only versus physically ready audio, ZIP v2 matching, and GC planning retaining referenced fingerprints. No real staging database or physical GC was used. |
| P9/P12/Mixed/Legacy | Paragraph and Conversation suites remain green. Mixed is supported by domain migration and validation; Legacy cannot own Units and retains its compatibility projection. This does not enable Mixed UI or a new editor. |
| D4 readiness | Domain commands support multi-Segment Turns, splitting, same-speaker adjacent merges, Unit reordering, Segment moves and speaker updates without reallocating retained Segment identities. Cross-Card moves remain explicitly deferred. The v1 virtual adapter still projects one Turn per Segment (`textContentUnitAdapterDomain.js:392`); D4 must consume persistent `resolveTextLibraryDocumentTree(...).blocks[].units` (`textLibraryDomain.js:601`) to retain authored grouping. |
| D5 readiness | Card-wide Segment traversal and speaker metadata support existing multi-speaker playback. Split reuse is compatible with persistent Units. The single-voice Full descriptor (`textStructuredSplitFullDomain.js:89`) does not itself encode a multi-voice schedule; D5 must keep per-Segment voice resolution/composition and define any new multi-voice Full cache contract before use. Existing derived WAV concatenation remains separate. |

## Files changed and diff summary

Four production files: **56 insertions, 7 deletions** (ordinary working-tree diff, before report/test additions).

| File | Change |
| --- | --- |
| `src/domain/text/textContentUnitDomain.js` | Empty migration provenance and conservative ownership predicate; pass provenance through the allocator. |
| `src/domain/text/textSourceAttachmentDomain.js` | Require source baselines for Unit ownership/map reuse; protect local Unit annotations and ambiguous empty Units. |
| `src/services/persistence/textContentUnitPersistenceService.js` | Schema/store guard and atomic abort handling for disposable seeding. |
| `src/services/persistence/textDatabaseBackupService.js` | Reject v2 input at the live v1 restore boundary. |
| `scripts/audit-v603-p12d-d3d-regression.mjs` | 12 independent Node regression cases (124 lines). |
| `scripts/audit-v603-p12d-d3d-browser.mjs` | Dependency-free headless Edge/CDP runner, isolated temporary profile and loopback static server (77 lines). |
| `scripts/fixtures/d3d/browser-cases.js` | 9 real IndexedDB cases; guarded disposable names, independent workers and disposable database cleanup (150 lines). |
| `P12D_D3D_Architecture_Audit_Report.md` | This consolidated report, including the preserved pre-edit findings. |

No existing audit assertions or expected hashes were changed. No dependency, lockfile, UI, Editor, Player or Track B changes.

## Verification results

Node **v24.11.1**; headless **Edge 157** on Windows. Counts below are each script's scenario/check counts, not a count of all assertions inside them.

All scripts below are under `scripts/` and use the `audit-v603-` prefix and `.mjs` suffix.

| Suite suffix | Before | After |
| --- | --- | --- |
| `p12d-d3d-regression` | **2 PASS / 10 FAIL** against baseline implementations | **12 PASS / 0 FAIL** |
| `p12d-d3d-browser` | **7 PASS / 2 FAIL** using baseline persistence writer | **9 PASS / 0 FAIL** |
| `p12d-d3c-compatibility` | 5 PASS | 5 PASS |
| `p12d-d3b-content-unit-persistence` | 11 PASS | 11 PASS |
| `p12d-virtual-content-units` (D2) | 12 PASS | 12 PASS |
| `d2-external-json` | 30 PASS | 30 PASS |
| `d3-d4-external-reconcile` | 19 PASS | 19 PASS |
| `p12a-external-reconcile` | 11 scenarios PASS | 11 scenarios PASS |
| `p12b-speaker-registry` | 14 PASS | 14 PASS |
| `p12c-conversation-playback` | 13 PASS | 13 PASS |
| `round-d3-paragraph-acceptance` | 7 PASS | 7 PASS |
| `p9b-playback-marathon` | 24 PASS | 24 PASS |
| `p9c-bulk-marathon` | 17 PASS | 17 PASS |
| `a0-a3-rf-portability` | 18 PASS | 18 PASS |
| `a4-staging-gc` | 7 PASS | 7 PASS |
| `beta8-p1-ordered-multi-audio` | 13 PASS | 13 PASS |
| `beta8-p2-split-full-domain` | 17 PASS | 17 PASS |
| `beta8-p3-runtime-playback` | 15 PASS | 15 PASS |
| `beta8-p4-staging-zip` | 21 PASS | 21 PASS |
| `round-c1-legacy-empty-audio` | Not separately run | 4 PASS |
| `d0-d1-text-identity` | FAIL at final known Table hash assertion | Same FAIL |
| `beta8-p9-hf5-voice-audio-ux` | Baseline replay: 9 PASS, then assertion at line 834 fails | Same failure: `David · US` does not match `/Browser TTS/` |

The completed 12-case Node suite was replayed against baseline source through a temporary read-only module loader, without replacing working files or changing branches. The first five cases had already failed before production edits. `--baseline-writer` in the permanent browser runner serves the baseline persistence module directly from `git show`; other modules remain current. Thus its before/after comparison specifically demonstrates the two QA writer defects.

| Required check | Result |
| --- | --- |
| Repository-wide `npm run lint` | **FAIL: 506 errors, 81 warnings.** ESLint API comparison using baseline text for all four modified production files yields the identical **506/81** total. Every changed production file and new test fixture has zero lint errors/warnings. Existing lint debt is not remediated in this bounded audit. |
| Production `npm run build` | **PASS**, 1,897 modules transformed. Existing large-chunk and stale Browserslist-data warnings remain. Baseline build was not separately run. |
| `git diff --check` | PASS. |

Local raw logs are retained under `.tmp/d3d/*.log` (ignored by Git), including the initial failing cases, baseline replays, final suites, lint comparison and build. The authoritative review artifact is this report and the reproducible test scripts; temporary lint/loader helpers are removed.

Reproduction commands:

```powershell
node scripts/audit-v603-p12d-d3d-regression.mjs
node scripts/audit-v603-p12d-d3d-browser.mjs
node scripts/audit-v603-p12d-d3d-browser.mjs --baseline-writer
npm run lint
npm run build
```

The baseline-writer command is intentionally expected to fail two assertions. The browser runner defaults to the installed Edge path; another Chromium executable can be selected with `D3D_BROWSER_PATH`. It creates a fresh temporary profile per run and never opens the application entry point.

## Browser coverage and remaining tests

**Verified in real Edge:** v1-to-v2 upgrade/index creation, exact repeat migration, phase-2 failure/recovery, synchronous clone-error rollback, asynchronous ConstraintError rollback, replace metadata restoration and stale-key removal, aborted restore, v1 backup upgrade, persisted broken Unit FK rejection, and concurrent read-modify-write allocation in two independent module workers. Factory calls were restricted to `prolingo_text_library_d3b_qa_d3d_*`; all test databases were deleted through the guarded disposable helper. Temporary browser profiles contain no user profile data and are left in the system temporary directory.

**Still required before canonical activation:**

- Multiple real tabs/windows during blocked upgrade, blocked deletion and `versionchange`, including stale clients and connection shutdown. Worker concurrency is evidence for transaction serialization, not proof of tab lifecycle behavior.
- Browser/process termination and restart between phases, and during writes; current abort injection does not prove operating-system crash durability.
- Storage quota, eviction, large-library migration time/memory, and private/limited-storage environments.
- Firefox and Safari/WebKit transaction-lifetime behavior and migration/restore portability.
- The eventual integrated D4/D5 UI through reloads, backgrounding and canceled operations; current tests exercise dormant services/domains.
- End-to-end audio ZIP/staging recovery and multi-speaker Full playback in an isolated disposable audio environment. Existing audio suites use controlled fixtures/mocks; no real user's audio database was exercised.

## Remaining production blockers and final recommendation

**CONDITIONAL GO for D4/D5 domain development and independent review. NO-GO for canonical v2 activation in this change.** No known reproduced P0/P1 from this audit remains unfixed.

1. Keep the canonical constants at **`TEXT_LIBRARY_DB_VERSION = 1`** and **`TEXT_LIBRARY_SCHEMA_VERSION = 1`**. Production migration, startup hydration, legacy bridging, command diffs, backup, Pack/source operations, External JSON, and audio metadata commits need a coordinated v2 integration change. Merely changing the constants is unsafe.
2. Complete the browser lifecycle/durability coverage above and define old-client/versionchange handling before migration activation. The current in-process lock is not a cross-tab coordination protocol.
3. D4 must use persistent Unit identity/grouping rather than the v1 virtual adapter. Define explicit source-conflict behavior for Unit edits that External JSON v1 cannot represent. Historical ambiguous empty Units intentionally require preservation/conflict handling rather than automatic removal.
4. D5 must validate multi-speaker scheduling, stale voice-profile matching, Full composition/cache identity and physical audio readiness through the integrated implementation. Unit identity must not become an accidental Split render-fingerprint input.
5. Repository release gates remain red due to pre-existing ESLint debt (**P2 validation blocker**) and the two unchanged audit expectation failures (**P3 test maintenance**, outside D3 remediation). The Table hash must not be blindly updated.

Safety closure: audited HEAD and branch are unchanged; the user canonical IndexedDB was never opened or upgraded; no production v2 activation, live wiring, deployment, physical audio deletion, real-data GC, commit, push or merge occurred. All deliverable changes are left uncommitted for GPT-6 independent review.
