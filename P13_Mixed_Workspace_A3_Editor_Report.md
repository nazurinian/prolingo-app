# P13-A3 — Mixed Workspace Editor

Date: 2026-11-17. Recommendation: **GO for isolated A3 acceptance**. A3-D and A3-U are complete. No new failing regression remains in the executed matrix. This is not production Mixed activation or acceptance of unrestricted Mixed audio. Manual UX/device review remains deferred as requested.

## Source and scope

- Worktree: `C:/Users/HikamSeif/Documents/@ Lain-Lain/2000 Most Frequently Used Words/prolingo-p12-integration-qa`.
- Branch: `feature/p13-mixed-workspace`.
- Required, initial and final committed HEAD: `8b586c6e13375bff57cb8e92712b1726b206b3d1`.
- Initial working tree was clean; no merge/rebase/cherry-pick/revert operation was pending. All task changes are left **uncommitted**. No branch switch, commit, push, merge or deployment was performed.
- Existing source worktree stays on Shared UI at `dc3722c173793aed124ae4bee98092377d62b795`; AI Voice worktree stays at `fc8e0350c2d911381b47d14e973132e2b42d7f93`. The Conversation backup reference was preserved.
- Read the A0 contract, A0–A2 report, D4 command/selector implementation and D4-B integration contract, plus the native Paragraph/Content Unit commands. This task did not restart the P12 architecture audit.

All editing below uses disposable persistent-v2 **in-memory snapshots**. There is no editor persistence adapter. The browser migration regression independently uses separately named disposable QA databases; it never opens the canonical database.

## Internal checkpoints

**A3-D:** implemented and verified before building A3-U. The initial 12 grouped integrity scenarios passed after correcting the demonstrated Paragraph source-ownership defect. The final expanded suite passes **14 scenarios**, exercising **all 22 supported command types**, including actual External JSON reconciliation and Text Pack attachment/sync. There was no data-model blocker.

**A3-U:** added the isolated editor and reused the accepted D4 forms. The final browser suite passes **11 scenarios**, with four DEV/production route gates and production artifact exclusion. Earlier browser runs failed on test selectors/assumptions (`Confirm Merge`, `Add Turn`, exact registry button text, nonexistent `audio.playbackStatus`, and an assumption that in-use speaker removal is disabled). Those test mistakes were corrected against the actual D4 contract; no D4 behavior or assertions were weakened. In-use speaker removal is deliberately clickable and must be rejected by the native command. The test now verifies that rejection and unchanged data.

## Changed files and interfaces

Seven existing files: **+57 / -32 lines**. Four new implementation/QA files: **733 lines**. Total excluding this report: **+790 / -32**, eleven code/test files. No dependency or lockfile changes.

| File / final source reference | Change and purpose |
| --- | --- |
| `src/domain/text/textMixedEditorDomain.js:12` (new, 147 lines) | Shared D4 field allowlist plus two native Paragraph Sentence operations; all-Card selector at line 19; Workspace/kind/source scoping at line 28; pure reducer at line 106; async command coordinator at line 118. |
| `src/components/text/mixed/TextMixedWorkspaceEditor.jsx:13` (new, 121 lines) | Separate metadata drafts; small Paragraph Section/Card wrappers at lines 36/57; controlled Mixed Editor at line 77. Reuses D4 speaker, Scene, Sentence, split and add-Sentence components. No audio hook or storage imports. |
| `src/components/text/conversation/ConversationSceneCard.jsx:259` (+2/-1) | Optional `cardOrderPeers` makes Scene up/down operate against all Mixed Cards. Existing D4 default remains its Scene list. |
| `src/components/text/conversation/ConversationSentenceItem.jsx:178` (+19/-15) | Type-aware Section/Turn terminology and Sentence merge command; passes actual Unit kind to existing split/move forms. No second authoring form or playback implementation. |
| `src/components/text/conversation/ConversationSentenceSplitPanel.jsx:38` (+2/-2) | Optional `unitKind`, default `turn`; dispatches the appropriate existing Paragraph/Conversation split command. |
| `src/components/text/conversation/ConversationTurnSection.jsx:25` (+2/-2) | Exports the existing `AddSentenceForm` for reuse; Section-aware label. |
| `src/components/text/presentation/TextMixedWorkspaceQaPreview.jsx:15` (+13/-2) | Show/Hide Editor sibling, guarded immutable snapshot acceptance, pending Reader controls, reset/switch cleanup. Existing single D5 host remains the only host. |
| `src/domain/text/textLibraryCommandDomain.js:964` (+5/-7) | Applies existing D4 split-child source detachment to Paragraphs as well. Retained Segment keeps source identity. |
| `scripts/audit-v603-p13-mixed-editor.mjs:1` (new, 227 lines) | Fourteen domain/coordinator scenarios, all 22 commands, negative cases, source reconciliation/sync and metadata invariants. |
| `scripts/fixtures/p13-mixed/editor-browser-cases.jsx:1` (new, 238 lines) | Eleven real React/Edge interaction scenarios with controlled transport/audio, StrictMode, storage denied, and one D5 host. |
| `scripts/audit-v603-p13-mixed-workspace-browser.mjs:10` (+14/-3) | `--editor` selects the new cases and exercises the actual DEV QA preview editor. Existing A2 mode remains intact. Production scan also excludes the new editor marker. |
| `P13_Mixed_Workspace_A3_Editor_Report.md` (new) | This report. |

### Authoritative data and command path

```text
complete disposable v2 snapshot
  → existing validated Mixed reader selector + existing D4 editor selector
  → immutable Mixed editor state: all Cards in global order
  → scoped command → existing applyTextLibraryCommand (once)
  → validated immutable staged snapshot/result
  → exact async acknowledgement + current scope checks
  → parent publishes snapshot → existing Shared Reader reprojects
```

`selectTextMixedEditorState(snapshot, { documentId })` returns the D4 Workspace/registry/Scene view plus `cards` containing the detached hydrated `units` and `segments`, in actual global order. `scenes` remains Conversation-only for D4 component compatibility; it is not the Mixed Card list. `cardOrderIds` covers every Card. Counts include Cards, Sections and all Sentences. No projection is a persistence payload, and no UI draft mutates it.

`applyTextMixedEditorCommand(snapshot, { type, payload }, { documentId, now? })` returns `{ snapshot, result, state }`. Input and output are detached; all identity allocation, parent synchronization, ordering, deletion and invalidation use the native command engine. The source snapshot is neither frozen nor mutated by staging.

`createTextMixedEditorCoordinator({ getScope, onCommit, onPending?, execute? })` exposes `dispatch(command)` and `dispose()`. `getScope()` provides `{ snapshot, documentId, revision? }`. It locks synchronously, stages once, and waits for optional `execute(command, { preparedOutcome, documentId })`. The acknowledgement must contain the exact staged `snapshot` and `result`, optionally `ok: true`. Explicit failures, malformed/foreign results and thrown transport errors never publish. The coordinator publishes its immutable staged value, never a caller-supplied mutable replacement.

`onCommit(outcome, capturedScope)` is a synchronous controlled-state publisher. It is not a persistence or async transaction callback. Workspace changes, snapshot replacement, in-place snapshot changes, revision changes and disposal reject late results. Disposal also releases the owning Reader's pending lock. The UI parent additionally compares the current snapshot reference before replacing it. An optional future persistence integration would require its own acceptance; none is wired here.

### Operations and restrictions

The exported `TEXT_MIXED_EDITOR_COMMAND_FIELDS` enumerates all 22 types:

| Group | Commands / supported behavior |
| --- | --- |
| Cards | `block.create/update/delete/reorder`: explicit Paragraph/Conversation creation, title and note editing, native cascade deletion, full Workspace permutation. Kind conversion is rejected. |
| Units | `contentUnit.create/update/delete/split/merge/reorder/reorderSegments`: actual persistent Sections or Turns; same-Card/kind boundaries; Turn merge requires compatible canonical speaker identity. Split uses exactly one native boundary. |
| Sentences | `segment.create/update/delete/move`, `paragraphSegment.split`, `paragraphSegments.merge`, `conversationSegment.split`, `conversationSegments.merge`: explicit Unit/Card FKs, paired EN/ID and `joinAfter`, native identity retention/allocation and adjacency constraints. |
| Speakers | `speaker.register/rename/remove`; assignment/reset through `contentUnit.update`. Registered identity is Workspace-scoped. Existing native registration from a custom Turn label is retained. |

- A Card contains Sections **or** Turns. Cross-Card and cross-Workspace Sentence moves are rejected; native D3 has explicitly deferred cross-Card moves. The UI does not offer them.
- Native Paragraph Card creation initializes one empty Section. Native Conversation creation initializes zero Turns. Removing the last Unit preserves the empty Card; deleting the last Sentence always supplies native `preserveEmptyUnit: true`.
- Section editing supports `metadata.note`; Segment editing supports text, meaning, `joinAfter` and note; Card editing supports title and note. Existing non-note metadata must be preserved exactly, including provenance, speaker identity and Full artifacts. Unsupported arbitrary metadata replacement is rejected.
- Split translations require explicit meanings for every part when the original is translated. Blank meanings are explicit supported values. Existing split proposal/alignment controls are reused.
- Reorders and structural Unit splits/merges preserve retained Segment IDs/UIDs. Sentence splits retain the original and allocate additional identities; merges and explicit deletions retire only the intended logical records. This is native behavior, not a promise to retain deleted entities.
- Errors include existing snapshot/scope/command errors plus `BUSY`, `STALE_RESULT` and `INVALID_RESPONSE`. Failed commands leave drafts open and show a retryable error. New Workspace/reset identities intentionally start new editor drafts rather than carrying drafts into foreign data.

## Demonstrated source defect and correction

**P1 source-identity collision risk, `textLibraryCommandDomain.js` baseline lines 963–972.** The common Sentence split helper detached newly created Conversation parts, but left Paragraph parts owning the same `externalEntityV1` and attached Text Pack source identity as the retained Segment.

Before editing that helper, the new regression failed: the new Paragraph child had `{ documentKey: 'source', segmentKey: 'original-source-key' }` where `undefined` was required. This demonstrates duplicate source identity; no claim is made that real user data was lost.

The correction removes the Card-kind guard around the existing detachment rule. The retained Segment ID/UID and source metadata remain exact. New children have new native IDs/UIDs, no external entity key, and `attachmentId: null` / `ownership: 'detached-local'` while retaining lineage. No artifact or RF is rewritten. The final regression also runs real pure External JSON keep-local reconciliation and Text Pack attachment/sync, proving both split identities survive.

No D3/D4 command signature changed. Paragraph splitting now follows the source-ownership rule already required by D4 Conversation splitting. Relevant P9, External JSON, D3 and source compatibility suites pass.

## UI and playback safety

Run `npm run dev`, then open `?qa=mixed-workspace` or `#qa-mixed-workspace` and select **Show Editor**. This is the existing DEV-only route, with Reader and Editor as siblings. Both Card types can be edited in global order. Changes are lost on fixture reset/reload. No real-data creation is exposed in the main Text tab.

`TextMixedWorkspaceEditor` props are `{ snapshot, documentId, revision?, onStateChange, executeCommand?, onPendingChange? }`. The owning host keys it by Workspace ID/UID. The existing QA parent owns the snapshot and the **single** `useConversationAudioPlayback` call; the editor owns neither audio nor persistence. Conversation editing components receive no Scene composition panels or additional audio host.

The A2 audio configuration remains **Split / text-only / 1×**. Full/Part/Segment and bilingual settings remain reading controls. Browser tests verify authoritative session identity, no duplicate playback and no cancellation across reading layout changes. Snapshot mutations use the existing D5 stale-snapshot cancellation behavior; this task does not redefine it. Pending commands disable Reader playback controls without creating or stopping a session.

## Actual verification

Environment: Node v24.11.1, Windows, headless Microsoft Edge, production Vite build. Raw logs are local at:

`C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-p13-a3-d94ba971/`

`node-summary.json` and `browser-summary.json` record the batched process exits. `p13-mixed-editor.log` contains the final expanded 14-case run; `mixed-editor-final.log` contains the final browser run. Earlier selector failures are retained in `browser-initial-selectors.log` and `browser-second-selector.log`.

All suite names below use `node scripts/audit-v603-<suffix>.mjs`.

### Node — 29 passing suites, five historical failures

| Suite suffix | Actual result |
| --- | --- |
| `p13-mixed-editor` | **14 PASS**, all 22 command types exercised, 0 DB calls |
| `p13-mixed-workspace` | 18 PASS |
| `p12-a6-main-reader` | 10 PASS |
| `p12-shared-card-a1` | 13 PASS |
| `p12-shared-card-a2` | 10 PASS, includes HF1 |
| `p12-shared-card-a3` | 7 PASS |
| `p12-shared-card-a4c` | 11 PASS |
| `p12-shared-card-a4h` | 8 PASS, includes stable speaker presentation checks |
| `p12d-d4a-conversation-editor` | 22 PASS |
| `p12d-d4b-conversation-editor-ui` | 9 PASS |
| `p12d-d5-conversation-audio` | 15 PASS |
| `p12d-d5-audio-ui` | 5 PASS |
| `p12d-d3d-regression` | 12 PASS |
| `p12d-d3c-compatibility` | 5 PASS |
| `p12d-d3b-content-unit-persistence` | 11 PASS |
| `p12d-virtual-content-units` | 12 PASS |
| `p12c-conversation-playback` | 13 PASS |
| `p12b-speaker-registry` | 14 PASS |
| `p12a-external-reconcile` | PASS |
| `d2-external-json` | 30 PASS |
| `d3-d4-external-reconcile` | 19 PASS |
| `round-d3-paragraph-acceptance` | 7 PASS |
| `beta8-p9-hf4d-navigation` | 20 PASS |
| `p9b-playback-marathon` | 24 PASS |
| `p9c-bulk-marathon` | 17 PASS |
| `a0-a3-rf-portability` | 18 PASS |
| `a4-staging-gc` | 7 PASS, controlled fixtures only |
| `beta8-p4-staging-zip` | 21 PASS, controlled fixtures only |
| `p10-h5-export-zip-remediation` | 11 PASS |

The **five historical failures** were rerun and retain their established signatures. They are not passing and no expectation was changed:

| Suite suffix | Failure |
| --- | --- |
| `beta8-p9-hf4a-card-ux` | Obsolete source regex `/setPlayingIndex\(step\.highlight \?/`, line 82. |
| `beta8-p9-hf4c-r1-ui-repair` | Version assertion expects `6.0.3-beta.8-p9-hf4c-r1`, actual `6.0.3-beta.8-p9-hf4d`. |
| `d0-d1-text-identity` | Existing Table checkout hash mismatch at line 229: expected `024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767`; actual `10d82e76e23bde23b2d11c531d348f9e2f53b1ec874047acdb3ab8f36759dc92`. Table was not edited. |
| `beta8-p9-hf5-voice-audio-ux` | Expected `/Browser TTS/`; actual label `David · US`. |
| `beta8-p9-hf4c-player-audio-ux` | Version assertion expects `6.0.3-beta.8-p9-hf4c`, actual `6.0.3-beta.8-p9-hf4d`. |

### Browser — real React interactions and unchanged compatibility

Browser processes were run serially in fresh disposable profiles. Four QA query/hash route gates pass in the new editor run; DEV shows both editor Card types, production excludes the preview/editor. Editor/Reader tests deny IndexedDB/localStorage and report **zero calls**.

| Suite suffix / arguments | Actual result |
| --- | --- |
| `p13-mixed-workspace-browser --editor --check-production` | **11 PASS / 0 FAIL**, 4 route gates, production exclusion PASS |
| Same new editor suite, serial repeats | Two batched repeats: 11/11 each; first green and final expanded-assertion runs also 11/11. Final log verifies Reader play buttons are disabled and do not start audio during pending commands. |
| `p13-mixed-workspace-browser --check-production` | 11 PASS, 15 completed reveals, 4 gates; **two audio diagnostics still fail their expectations**, below |
| `p12-a6-main-reader-browser` | 12 PASS, actual App Text path |
| `p12-shared-card-a1-browser` | 7 PASS |
| `p12-shared-card-a2-browser` | 10 PASS, completed reveals/negative control and route gates PASS |
| `p12-shared-card-a3-browser` | 8 PASS |
| `p12-shared-card-a4c-browser` | 12 PASS |
| `p12-shared-card-a4h-browser` | 6 PASS |
| `p12d-d4c-browser --check-production` | 13 PASS, original 20 commands, async validation, failed drafts, routing |
| `p12d-d5-browser` | 3 PASS |
| `p12d-d5-ui-browser` | 15 PASS, Cached Full recovery, pause/resume, stale cancellation |
| `p12d-d3d-browser` | 9 PASS, disposable QA databases only |

The new browser cases cover global Paragraph/Conversation creation/reorder/delete, empty structures, bilingual identity and `joinAfter`, Sentence split/merge, Section split/merge/move/reorder/edit/delete, native Turn forms, speaker register/rename/reassign/reset/removal and in-use rejection, failed-draft retry, malformed acknowledgement, duplicate clicks, stale snapshot/Workspace/reset responses, Reader updates and one-host audio continuity. Native command tests supply the remaining combinatorial constraints, including foreign boundaries and speaker mismatches.

### Lint, build and integrity

- Scoped ESLint across **all eleven changed code/test files**: exit 0, no ESLint errors/warnings. Toolchain emits its existing stale `baseline-browser-mapping` notice. Repository-wide lint debt in untouched App/player files is not claimed clean.
- `npm run build`: exit 0, **1,912 modules**, `index-Cr7NaZXI.js` 1,705.15 kB / gzip 451.56 kB; CSS 118.65 kB. Existing Browserslist-age and bundle-size warnings remain. No dependency update was attempted.
- `git diff --check`: PASS.
- `TEXT_LIBRARY_DB_VERSION === 1` and `TEXT_LIBRARY_SCHEMA_VERSION === 1`, unchanged at `src/constants/textDatabaseConstants.js:2–3`.
- No changes to canonical persistence services/stores, migration/startup, main App routing, D4 command domain, Content Unit command domain, D5 hook/services/cursor authority, RF/variants, Staging/ZIP/GC, AI Voice, Table/Legacy, Data Management or A6 dual-reader selection.
- Existing frozen A1 projection and hydrated tree are only read; mutation uses detached command inputs and separately published outcomes. No virtual Paragraph Section ID is persisted.

Reproduce the focused checks:

```powershell
node scripts/audit-v603-p13-mixed-editor.mjs
npm run build
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --editor --check-production
node scripts/audit-v603-p13-mixed-workspace-browser.mjs --check-production
```

Scoped lint command:

```powershell
npx eslint src/domain/text/textMixedEditorDomain.js src/domain/text/textLibraryCommandDomain.js src/components/text/mixed/TextMixedWorkspaceEditor.jsx src/components/text/conversation/ConversationSceneCard.jsx src/components/text/conversation/ConversationSentenceItem.jsx src/components/text/conversation/ConversationSentenceSplitPanel.jsx src/components/text/conversation/ConversationTurnSection.jsx src/components/text/presentation/TextMixedWorkspaceQaPreview.jsx scripts/audit-v603-p13-mixed-editor.mjs scripts/fixtures/p13-mixed/editor-browser-cases.jsx scripts/audit-v603-p13-mixed-workspace-browser.mjs
```

## Remaining limitations and gates

1. **A4-FULL-01 remains unresolved.** Existing unrestricted Mixed Paragraph Full diagnostic observes **zero audio invocations** for a nonempty Paragraph (`expectationMet: false`). It is not an A3 pass and was not patched.
2. **A4-RATE-01 remains unresolved.** Existing unrestricted Mixed Paragraph rate diagnostic expects **1.5×**, observes **1×** (`expectationMet: false`). It is not an A3 pass and was not patched.
3. The preview intentionally retains Split at 1×. Broader Full/rate controls are unavailable. P13-A4 must resolve and verify those known findings before lifting the gate; this task did not begin A4 implementation.
4. Commands are local snapshot operations. No canonical v2 transaction, real-user write, startup migration, production Mixed route or database repair is authorized or implemented. Canonical activation remains **NO-GO** under the current v1 boundary.
5. Source synchronization and External JSON updates remain separate explicit workflows. In particular, external v1 cannot represent arbitrary authored Unit grouping/tombstones; A3 does not add automatic sync or claim that limitation solved.
6. Manual visual/Android/device acceptance and real audible TTS quality are deferred. Browser tests use injected deterministic audio execution with the existing D5 host, not real provider generation. Existing Editor/Reader designs were reused without a UX redesign.

**Final recommendation:** accept A3-D and A3-U for isolated development. Preserve the two audio findings for a separately authorized A4 task and the five historical tests as separate debt. Changes remain local and uncommitted for review; no P13-A4, production activation or deployment has been started.
