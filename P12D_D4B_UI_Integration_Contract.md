# D4-B Conversation Editor UI contract — proposed handoff to Hydrogen

D4-A contract version **1**; input is a complete, isolated **Text schema v2 snapshot**. Canonical IndexedDB remains **v1**. D4-B implements UI only; production persistence/migration remains gated for independent review and D4-C.

## Entry points and data

Import from `src/domain/text/textConversationEditorDomain.js`:

```js
const state = selectTextConversationEditorState(qaSnapshot, { documentId });
const outcome = applyTextConversationEditorCommand(
  qaSnapshot,
  { type: 'segment.create', payload: { blockId, unitId, text: 'Hello.', meaning: 'Halo.' } },
  { documentId } // optional now: finite timestamp for deterministic QA
);
// Publish outcome.snapshot and outcome.state together only on success.
// outcome.result is the existing native command receipt (created/retained/removed IDs, etc.).
```

`documentId` defaults to the snapshot's active document. Selecting a different editor Workspace does not change `activeDocumentId` in the snapshot. A missing Workspace throws `WORKSPACE_NOT_FOUND`; render a selection prompt rather than creating or migrating anything.

```text
state = {
  version: 1,
  workspace: { id, uid, title, documentType, textLanguage, meaningLanguage },
  cardOrderIds: [Card IDs in Workspace order],
  speakerRegistry: [{ id, uid?, label, externalKey? }],
  scenes: [{ ...persistedCard, empty, turnCount, sentenceCount,
    turns: [{ ...persistedContentUnit, empty, sentenceCount,
      sentences: [{ ...persistedSegment, audioVariants: [...] }]
    }]
  }],
  empty, counts: { scenes, turns, sentences }
}
```

The projection is detached from input metadata. Draft mutations cannot change the authoritative snapshot, but **only commands save edits**. Never persist `state`, derived counts, `turns`, `sentences`, or a duplicate `segmentIds` membership array. Use `selectTextConversationScene(state, blockId)` / `selectTextConversationTurn(state, unitId)` for lookups; missing IDs return `null`.

React keys must use persistent `Card.id`, `Unit.id`, and `Segment.id`. `segment.unitId` is the sole authored parent relation. Do not regroup by speaker label or use the v1 virtual adapter. Adjacent Turns with the same speaker remain distinct.

## Operations

`TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS` exports the complete, frozen allowed-field map. Unknown command/field names are rejected. The table lists required fields and common optional fields; all IDs must be the exact IDs returned by selectors.

| Operation / native type | Payload |
| --- | --- |
| Create Scene — `block.create` | `documentId`; optional `title`, `metadata`. Type is forced to `conversation`. |
| Edit Scene — `block.update` | `id`; optional `title`, `metadata`. Cannot convert to Paragraph. |
| Delete Scene — `block.delete` | `id`. Explicitly removes its Units, Segments and logical AudioVariant references. |
| Reorder Cards — `block.reorder` | `documentId`, `orderedIds`: exact full Workspace Card permutation. |
| Create Turn — `contentUnit.create` | `blockId`; optional `speakerId` or `speaker` label, `afterUnitId` or one-based `order`, `metadata`, optional first `text`/`meaning`/`joinAfter`. Without nonblank text creates an empty Turn. |
| Edit/reassign Turn — `contentUnit.update` | `id`; optional `speakerId`, `speaker`, `resetSpeaker: true`, `metadata`. Assigning by ID alone resolves its registered label. |
| Delete Turn — `contentUnit.delete` | `id`. Explicit cascade of its Sentences and their logical audio references. |
| Split Turn — `contentUnit.split` | `id`, exactly one of `beforeSegmentId`, `afterSegmentId`, `splitAtIndex`. Index is the zero-based first child of the new Turn, strictly inside the child list. |
| Merge Turns — `contentUnit.merge` | `ids`: at least two adjacent Turns on one Scene, same canonical speaker ID/label. Earliest Turn in Scene order retains ID/UID; argument order does not choose the retained identity. |
| Reorder Turns — `contentUnit.reorder` | `blockId`, `orderedIds`: exact full Unit permutation, including empty Turns. |
| Reorder Sentences in Turn — `contentUnit.reorderSegments` | `id` (Unit ID), `orderedIds`: exact child Segment permutation, `[]` for an empty Turn. Preserves every Unit's position. |
| Create Sentence — `segment.create` | `blockId`, explicit `unitId`, nonblank `text`; optional `meaning`, `joinAfter`, `metadata`. Inherits Turn speaker. |
| Edit Sentence — `segment.update` | `id`; optional `text`, `meaning`, `joinAfter`, `metadata`. Speaker changes must go through the Turn operation. |
| Delete Sentence — `segment.delete` | `id`. Editor automatically supplies native `preserveEmptyUnit: true`. Last-child removal retains the Turn, UID and speaker reference. |
| Move Sentence — `segment.move` | `segmentId`, `targetUnitId`; optional `beforeSegmentId`, `afterSegmentId`, one-based `orderInUnit`. Same Scene only. Inherits target speaker and retains empty source Turn. |
| Split Sentence — `conversationSegment.split` | `id`, `parts: [{text, meaning?, joinAfter?}, ...]`, at least two nonblank text parts. If original meaning is nonblank, every part must explicitly provide meaning (empty string is an explicit choice). |
| Merge Sentences — `conversationSegments.merge` | `ids`: adjacent child Segments in one Turn. Earliest Segment retains ID/UID; other selected Segments and their logical audio references are removed. Cross-Turn merging is rejected even for the same speaker. |
| Register / rename / remove speaker — `speaker.register`, `speaker.rename`, `speaker.remove` | `documentId`, `speakerId` (optional on register), `label` (register/rename). Removal rejects speakers used by Sentences **or empty Turns**. |

`metadata` is a plain-object **replacement**, not a patch. Preserve existing provenance/custom keys when editing one field: `{ ...current.metadata, note }`. `{}` explicitly clears it. IDs, UIDs, parent changes and audio writes are not accepted through arbitrary payload fields.

Existing sentence proposal helpers in `textParagraphSentenceAuthoringDomain.js` can preview automatic/manual splits of a selected Sentence. Honor `canApply=false` and translation alignment warnings; do not silently split/erase meanings. Submit the confirmed explicit `parts` to the Conversation command.

## Ordering, speakers and empty states

- Units have contiguous `order` within a Card. Sentences have contiguous **Card-wide** Segment `order`, not a separately persisted Turn-local order. Unit membership remains authoritative and Card order is monotonic by Unit. Use the dedicated Turn-local reorder; the older `segment.reorder` is deliberately unavailable in this editor contract because it moves empty Turns.
- Scene creation starts with **zero Units**. Explicit Turn creation may produce **zero Sentences**. `scene.empty` means zero Turns; `turn.empty` means zero Sentences. A Scene containing only empty Turns has `scene.empty=false` and `sentenceCount=0`.
- Deleting the last Turn preserves the Scene and its materialization marker. Neither selection nor edits synthesize placeholder Turns. Re-running backfill must not resurrect deleted Units.
- Speaker reassignment updates the Turn and every child `speaker` / `metadata.speakerIdentityV1`. Renames preserve canonical speaker ID/UID and update display labels, including empty Turns. Reset clears attribution without deleting the speaker registry entry. Existing label-only/null-ID speakers are displayed as stored; selection does not invent IDs.
- In Mixed Workspaces the selector shows only Conversation Cards. `cardOrderIds` includes Paragraph Cards so full Card reordering remains explicit. Paragraph content cannot be edited through this reducer. Legacy and Paragraph-only Workspaces are rejected.

## Identity, source and audio expectations

Structural Turn splits/merges/moves/reorders retain existing Segment IDs/UIDs. Sentence splitting retains the first Segment identity and allocates new child IDs/UIDs; Sentence merging necessarily removes the explicitly merged-away identities. All creation uses existing ID-floor allocation.

A new Conversation split child is a **local addition**: it does not clone `externalEntityV1`, and inherited Text Pack provenance becomes `detached-local` with no attachment ID. The retained Sentence keeps source identity; `sentenceAuthoringV1` records lineage. Source sync/External JSON reconciliation are separate explicit workflows with existing conflict policies. Do not automatically run them after editor keystrokes; External JSON v1 cannot encode arbitrary authored Unit grouping or provide editor tombstones for all local deletions.

Stored audio render fingerprints, Split variants and Full artifact metadata are retained for unaffected content. Text/meaning edits invalidate the changed channel; sentence split/merge invalidate retained audio metadata without rewriting its stored RF. New split children receive no copied AudioVariants. Explicit deletion/merge removes only associated logical records. **No physical audio deletion or GC occurs.** Existing readiness checks must still compare content/profile/RF and physical availability; retained Full metadata does not prove that a reordered/edited Scene is ready. D5 owns playback/composition changes.

## Errors and recovery

Errors are `TextConversationEditorError` with stable `code`, human-readable `message`, optional `details`. Do not parse message strings or use them as the error code. Native validation failures are wrapped; failed calls leave the input snapshot unchanged.

| Code | Recovery |
| --- | --- |
| `MIGRATION_REQUIRED` | Show the isolated-preview/unavailable state. Obtain a complete disposable v2 snapshot through QA setup. Never upgrade the real library. |
| `INVALID_SNAPSHOT` | Stop editing and preserve the input. Investigate corruption, UID integrity or partial persisted relationships in QA. No silent repair/reidentification. |
| `WORKSPACE_NOT_FOUND` | Select an existing eligible Workspace. |
| `UNSUPPORTED_WORKSPACE` | Route Paragraph/Legacy elsewhere. |
| `OUT_OF_SCOPE` | Refresh selection after deletion or reject a cross-Workspace/Paragraph target. Do not select a replacement ID implicitly. |
| `INVALID_COMMAND` | Correct the payload/field names, explicit Turn selection, speaker assignment or split translation parts. |
| `COMMAND_REJECTED` | Resolve the native constraint: adjacency, identical speaker, exact reorder membership, nonblank Sentence text, split boundary, or in-use speaker. Keep the draft for correction. |

## Safe QA entry points and boundaries

Use `createD4aConversationFixture()` from `scripts/fixtures/d4a/conversation-editor-fixture.js`. It returns `{snapshot, ids}`: two Conversation Scenes (one zero-Unit), four Turns (one empty), multiple Alice Sentences, Bob, audio RF metadata, and a separate Mixed Workspace. It performs no storage/audio I/O.

Run `node scripts/audit-v603-p12d-d4a-conversation-editor.mjs` (22 scenarios). D3-C/B/D, P12 and portability audits remain independent compatibility coverage. Existing real-browser migration/rollback checks: `node scripts/audit-v603-p12d-d3d-browser.mjs` (fresh profile, disposable databases only).

For explicitly isolated browser QA, existing `textContentUnitPersistenceService.js` helpers enforce names such as `prolingo_text_library_d3b_qa_d4a_hydrogen`. Seed with `writeTextLibrarySnapshotToDisposableDb({dbName, version: 2, snapshot})`. `executeDisposableTextLibraryV2Command` accepts native commands (use `preserveEmptyUnit: true` for direct native Sentence deletion); it does not apply editor scoping. Run that only in a controlled QA harness, using the latest transaction state. Never compute a preview identity and then assume a separately executed command will allocate the same new UID.

The pure editor module imports no services, UI, virtual adapter, storage opener or startup lifecycle. **Do not connect it to canonical `executeTextLibraryCommand`, live backup/source services, or real audio services.** Both `TEXT_LIBRARY_DB_VERSION` and `TEXT_LIBRARY_SCHEMA_VERSION` stay **1**. Production startup auto-migration, v2 writes, deployment and AI Voice work remain outside D4-A/B. Hydrogen should build the isolated UI against this contract; independent review and D4-C must precede any production integration.
