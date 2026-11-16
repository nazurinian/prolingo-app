# P12-D4-A Conversation Editor Core

Baseline/HEAD at start: `e33736a8ca272d8ea613a5f4bc5929a870189a55`, branch `feature/p12-conversation-only`. Initial tree clean. No repository AGENTS.md found.

## Initial command/selector audit (before implementation)

- `textContentUnitCommandDomain.js` already provides Turn create/update/delete/split/adjacent same-speaker merge/reorder and intra-Card Segment moves. Reuse these operations.
- `textLibraryCommandDomain.js` already provides Scene Card CRUD/order, Segment CRUD and speaker registry operations. Text edits already mark the affected channel's audio metadata stale without changing its fingerprint or retained identity.
- Sentence split/merge currently require Paragraph Cards (`requireParagraphSegment`, `splitParagraphSegment`, `mergeParagraphSegments`). Conversation sentences need the same algorithms with persistent Turn membership and speaker preservation.
- `segment.reorder` derives Unit ordering from nonempty Segments and moves empty Units to the end. A Turn-local reorder must instead retain Unit order, including empty Turns.
- `segment.delete` removes a Turn when its last Segment disappears. D4 needs an explicit keep-empty option without changing existing callers' default behavior.
- `resolveTextLibraryDocumentTree` already hydrates persistent `blocks[].units[].segments`; the v1 virtual adapter is unsuitable for authored multi-sentence Turns. A small Conversation projection and scoped, typed-error command entry point are missing.

Additional source-boundary finding recorded before its fix: reusing the Paragraph split algorithm verbatim clones `externalEntityV1.segmentKey` into new Conversation sentences. Reconciliation indexes this key with a Map and silently loses the retained original Sentence. A targeted split → keep-local External JSON reconciliation test reproduces this failure (21 PASS / 1 FAIL). New Conversation split children must be local additions; the retained Sentence alone keeps the original source identity.

## Result and design decisions

**D4-A implemented and verified for isolated development.** Proposed D4-B handoff: [P12D_D4B_UI_Integration_Contract.md](P12D_D4B_UI_Integration_Contract.md). Production v2 activation remains **NO-GO** under the existing D3-D gate. No React integration is included.

- Added `textConversationEditorDomain.js`: a pure, Workspace-scoped reducer, detached persistent-Unit projection, Scene/Turn lookup selectors, frozen allowed-field map, and typed validation errors. It accepts only complete schema-2 Conversation/Mixed snapshots with intact global UIDs; it performs no migration, identity repair or storage access. It delegates all mutations to `applyTextLibraryCommand`.
- Added native `conversationSegment.split` / `conversationSegments.merge` by generalizing the existing Paragraph implementation, with Conversation Card/Turn guards and speaker preservation. Paragraph command names, default validation wording, metadata and behavior remain compatible. Shared utilities only gain an optional context label.
- Added native `contentUnit.reorderSegments`, reusing `syncCardUnitsAndSegmentsOrder` so Sentence order can change without moving empty Turns or altering membership. It supports Paragraph Units through the native API, while the Conversation editor rejects Paragraph targets.
- Added native `segment.delete` option `preserveEmptyUnit: true`. The editor always supplies it. Existing callers retain their previous last-Sentence deletion behavior, as required by D3-B.
- Fixed the demonstrated new source-boundary hazard: created Conversation split children remove `externalEntityV1` and detach inherited Text Pack ownership. Retained Segment source identity stays intact. Source sync and External JSON reconciliation regressions demonstrate survival of both split identities. Paragraph source-provenance behavior was not changed in this bounded Conversation scope.
- The editor requires explicit parent Turn selection for Sentence creation, whole-Turn speaker reassignment, complete reorder membership, and explicit translated split parts. Unknown fields and attempts to change IDs/UIDs/parents through edit payloads are rejected.

## Identity, ordering, audio and compatibility

Turn grouping comes exclusively from `ContentUnit.id` and `segment.unitId`. The selector hydrates `resolveTextLibraryDocumentTree(...).blocks[].units`; it never imports the v1 virtual adapter. Same-speaker adjacent Turns do not collapse. Empty Turns and zero-Unit Cards are visible and retained until explicitly deleted; the materialization marker prevents recreation during repeated backfill.

Scene/Turn structural operations retain existing Segment IDs/UIDs and speaker mappings, except the explicit target speaker change on a move/reassignment. Sentence splitting retains the first Segment ID/UID and creates new identities for additional children. Sentence merging retains the earliest Segment and necessarily removes the explicitly merged-away identities. Scene/Turn/Sentence deletion removes corresponding logical references only. Input snapshots remain unchanged, including on failure.

AudioVariant identities and stored render fingerprints remain unchanged for retained references. Text/meaning edits invalidate only the changed channel. Sentence splits/merges reuse existing invalidation behavior; created children inherit no audio variants, and merged-away/deleted children lose only their logical records. Full artifact metadata is retained and must still pass the existing content/profile/readiness checks. No generation, playback changes, physical audio deletion or GC is introduced.

Mixed projections expose Conversation Scenes while preserving full Workspace Card order for explicit reordering. Paragraph authoring commands remain available independently. Legacy cannot enter the editor. The entire library is validated before editing; unrelated malformed UID/FK state also blocks editing rather than being silently rewritten.

## Files changed and full diff summary

Eight deliverable files: **4 production files, 2 QA files, 2 documents**. Production diff including the new module: **254 insertions / 29 deletions**. Existing tracked-file diff alone: **73 insertions / 29 deletions**. Added test code: **405 lines**. No existing tests were modified.

| File | Diff | Purpose / review references |
| --- | --- | --- |
| `src/domain/text/textConversationEditorDomain.js` | New, 181 lines | Contract/field map at line 11; error class at 34; selectors at 91/99/100; pure scoped reducer at 170. |
| `src/domain/text/textContentUnitCommandDomain.js` | +22 / -0 | Export and native Turn-local reorder implementation at line 409. |
| `src/domain/text/textLibraryCommandDomain.js` | +47 / -25 | New native command dispatch; optional last-child preservation at 871; shared guarded sentence operations at 935/959/1036; created-child source identity handling. |
| `src/domain/text/textParagraphSentenceAuthoringDomain.js` | +4 / -4 | Optional error-context label on existing split normalization / join helpers. |
| `scripts/audit-v603-p12d-d4a-conversation-editor.mjs` | New, 365 lines | 22 focused scenarios spanning native gaps, editor contract, malformed input, audio metadata, portability, source reconciliation and safety. |
| `scripts/fixtures/d4a/conversation-editor-fixture.js` | New, 40 lines | Disposable in-memory v2 fixture with multiple/empty Turns, multi-Sentence Turn, zero-Unit Scene, speaker/audio metadata and separate Mixed Workspace. |
| `P12D_D4B_UI_Integration_Contract.md` | New | Proposed concise Hydrogen integration contract, operations, state, errors, ordering, QA examples and production boundaries. |
| `P12D_D4A_Core_Report.md` | New | Findings, implementation rationale, complete diff inventory and verification record. |

No persistence service, version constant, startup lifecycle, React component, visual/CSS/sidebar/mobile file, dependency, lockfile or AI Voice branch was changed. No feature was wired into the application.

## Before/after verification

Node v24.11.1 on Windows. Raw logs are retained locally in `.tmp/d4a/*.log` (Git-ignored).

- Before production edits, four targeted native gap regressions: **0 PASS / 4 FAIL**. Those four now pass within the full suite.
- During source integration testing, split/reconcile identity regression: **21 PASS / 1 FAIL** before its targeted fix; final suite: **22 PASS / 0 FAIL**.
- Baseline compatibility suites were run before edits and after implementation. Two pre-existing failures are unchanged and were not “fixed” by weakening assertions.

All suite names below are `scripts/audit-v603-<suffix>.mjs`. Counts are scenario/check counts reported by each script, not all individual assertions.

| Suite suffix | Before | Final |
| --- | --- | --- |
| `p12d-d4a-conversation-editor` | First 4 repros fail | **22 PASS / 0 FAIL** |
| `p12d-d3d-regression` | 12 PASS | 12 PASS |
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
| `beta8-p1-ordered-multi-audio` | Not separately run this phase | 13 PASS |
| `beta8-p2-split-full-domain` | 17 PASS | 17 PASS |
| `beta8-p3-runtime-playback` | 15 PASS | 15 PASS |
| `beta8-p4-staging-zip` | 21 PASS | 21 PASS |
| `d0-d1-text-identity` | FAIL, known final Table hash assertion | Same FAIL at line 229 |
| `beta8-p9-hf5-voice-audio-ux` | 9 PASS then voice-label assertion fails | Same FAIL at line 834 (`David · US` does not match `/Browser TTS/`) |

Additional real-browser D3-D regression run: **9 PASS / 0 FAIL** in a fresh headless Edge profile with only guarded `prolingo_text_library_d3b_qa_d3d_*` disposable databases. This verifies the existing migration/transaction/restore/concurrency contract; it is not a D4 UI browser test. New D4-A tests mutate disposable **in-memory v2 snapshots**, with negative v1/partial/corruption rejection cases, rather than the user's database.

Scoped ESLint: **PASS, exit 0**, across all four production files and both new QA files. Command:

```powershell
npx eslint src/domain/text/textConversationEditorDomain.js src/domain/text/textContentUnitCommandDomain.js src/domain/text/textLibraryCommandDomain.js src/domain/text/textParagraphSentenceAuthoringDomain.js scripts/fixtures/d4a/conversation-editor-fixture.js scripts/audit-v603-p12d-d4a-conversation-editor.mjs
```

Production `npm run build`: **PASS**, 1,897 modules transformed. Existing stale Browserslist-data and large-bundle warnings remain. The new editor façade has no production imports/callers. `git diff --check`: **PASS**. Repository-wide ESLint debt from D3-D was not re-audited; this assignment requested scoped lint.

Reproduce D4-A: `node scripts/audit-v603-p12d-d4a-conversation-editor.mjs`. Re-run existing browser checks with `node scripts/audit-v603-p12d-d3d-browser.mjs`. No test invokes real audio deletion/GC; audio/ZIP coverage uses controlled metadata/binary fixtures and mocks.

## Proposed Hydrogen handoff and remaining boundaries

Use [the D4-B contract](P12D_D4B_UI_Integration_Contract.md) for the isolated UI. It documents all 20 allowed native command types, parameter/identity semantics, typed errors, persistent Scene → Turn → Sentence data shape, empty-state behavior, translation-aware split input, read-only draft projection and safe QA setup. Do not persist the projection or route editor commands through the live v1 command service.

Remaining work belongs to later gates: D4-B UI, independent review, D4-C controlled integration, canonical persistence migration/hydration/write coverage, cross-tab/crash/quota/browser durability tests, and D5 voice scheduling/readiness/composition. External JSON v1 cannot encode arbitrary authored Turn grouping or complete local-deletion tombstones; source workflows remain explicit and conflict-aware. Cross-Card Sentence moves remain deferred. None of these are activated by D4-A.

Both **`TEXT_LIBRARY_DB_VERSION = 1`** and **`TEXT_LIBRARY_SCHEMA_VERSION = 1`** remain unchanged. The canonical IndexedDB was never opened, modified or upgraded. No commit, push, merge, deployment, branch change, production v2 write or startup auto-migration occurred. All changes remain uncommitted for independent review; D4-A work stops here.
