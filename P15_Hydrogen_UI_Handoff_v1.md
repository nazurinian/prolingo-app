# P15-S Hydrogen UI handoff v1

A0–A1 functional foundation on feature/p15-structured-data-management. This is the actual implemented API, not permission to activate canonical v2 or write real-user Mixed data. Full-page creative UI is your next separately reviewed task. Keep Open Workspace lightweight.

## Mounting and component ownership

Create one headless session per Data Management page host. It owns one **disposable working snapshot**, command lock and drafts. It owns no database, audio host, provider, global preferences or navigation route. Canonical data supplied by the App is read-only in this adapter. Do not mount a second D5 host.

Suggested page boundaries: DataManagementPage (session/error boundary), CollectionWorkspaceNavigation, WorkspaceInspector, Card/Unit/Segment authoring, SpeakerRegistry, SourceInspector, AudioInspector, TransferPreview. These names are proposed UI boundaries, not new implemented visual components. Existing D4/P13 forms may be reused only through the scoped dispatcher. Do not mount an independent editor command coordinator that publishes to a different working snapshot.

```jsx
import { useSyncExternalStore } from 'react';
import { createTextDataManagementSession } from './src/services/textDataManagementSession.js';

// Construct outside render / memoize at a stable host boundary.
const session = createTextDataManagementSession({
  snapshot,                 // complete validated library snapshot
  selection: {},            // whole library
  boundary: 'disposable',   // omit for read-only
  permissions: ['catalog', 'content'], // omit for no authoring
  sourceAttachments: [], externalImports: [],
  audio: null               // optional, see audio section
});
// In React:
const state = useSyncExternalStore(session.subscribe, session.getState);
// Dispose on host teardown, not on inspector/layout changes.
```

No production route or polished Data Management UI is implemented in A1. The browser fixture demonstrates the adapter with real React, the accepted Mixed Reader and disposable data.

## Read contract

- getState(): stable frozen object until an event; {revision,pending,disposed,error,view,draftCount}.
- view: {version:1,schemaVersion,selection,catalog,workspace,capabilities,diagnostics}.
- catalog: {rootDocuments,collections:[{...collection,documents}]}; records keep ID/UID, title, order, opaque metadata; documents add supported/reason.
- workspace: null until selected; otherwise {document,documentTree,presentation,speakers,unsupportedReason,audio,sources}.
- documentTree is the existing hydrated tree with ordered blocks → units → segments and logical audioVariants.
- presentation is the existing A1 frozen Card/Unit/Segment projection, or null for unsupported Workspaces. It includes cardById, unitById, segmentById, locationBySegmentId.
- All data is detached/frozen. Never edit it. Clone form fields into drafts.
- EN/ID are text/meaning on the **same** Segment, identified by id/uid. Never zip independent text arrays. joinAfter is retained.
- v1 Paragraph virtual Section has id:null, uid:null, identitySource:'v1-paragraph-compat'. Its viewKey is for rendering only; never send it as unitId.
- Legacy and v1 Conversation/Mixed are catalog-visible, authoring-disabled with UNSUPPORTED_WORKSPACE. No migration is offered.
- diagnostics reports migration status, entity counts, unresolved source-registry Workspace IDs and canonicalWrites:false.

## Navigation

session.navigate(selection) returns boolean; failures set state.error and preserve the previous selection. Pass a complete desired selection, not a patch:

```js
session.navigate({});                            // whole library
session.navigate({collectionId: null});          // Root
session.navigate({collectionId});                // a Collection
session.navigate({workspaceId});                 // resolves its real Collection
session.navigate({workspaceId, segmentId});      // resolves actual Card/Unit parents
session.navigate({workspaceId, cardId, unitId}); // persistent v2 Unit only
```

Explicit mismatched ancestors are rejected. Browsing never dispatches document.setActive or writes content. Content command scope is the selected Workspace; Card/Unit/Segment selections are context, not a different authoring authority. Navigation changes invalidate outstanding asynchronous results, even within the same Workspace.

## Commands

await session.dispatch({type,payload}) returns {ok:true,snapshot,result} or {ok:false,error:{code,message}}. snapshot is the frozen native result; result is the native receipt. The session publishes accepted results itself. Do not allocate IDs, apply commands again, or publish an external acknowledgement.

Actual field allowlist: TEXT_DATA_MANAGEMENT_COMMAND_FIELDS in src/domain/text/textDataManagementDomain.js (31 commands). Capabilities have {enabled,reason}; they gate broad availability. Operand validity is checked at dispatch.

| Group | Supported native operations |
| --- | --- |
| Collections | collection.create/update/delete/reorder |
| Workspaces | document.create/update/delete/reorder |
| Cards | block.create/update/delete/reorder |
| Units | contentUnit.create/update/delete/split/merge/reorder/reorderSegments |
| Sentences | segment.create/update/delete/move; paragraphSegment.split / paragraphSegments.merge; conversationSegment.split / conversationSegments.merge |
| Speakers | speaker.register/rename/remove |
| v1 Paragraph ordering | segment.reorder (v2 uses contentUnit.reorderSegments) |

Catalog create/reorder requires catalog scope; Collection create/reorder requires whole-library {}. Workspace update/delete requires that selected Workspace; its collectionId may move it to an existing Collection or Root. Collection update/delete requires its selected Collection. Delete requires empty Collection. Reorders use complete sibling ID permutations. Groups containing unsupported Workspaces cannot be reordered. No Workspace kind conversion.

Content examples:

```js
await session.dispatch({type:'contentUnit.create', payload:{blockId,kind:'turn',speakerId}});
await session.dispatch({type:'segment.create', payload:{blockId,unitId,text,meaning,joinAfter}});
await session.dispatch({type:'segment.update', payload:{id:segmentId,text,meaning,joinAfter}});
await session.dispatch({type:'contentUnit.reorderSegments',payload:{id:unitId,orderedIds}});
// v1 Paragraph create: omit unitId entirely.
```

Create Paragraph Cards only in Paragraph Workspaces, Conversation Cards only in Conversation Workspaces, either in complete v2 Mixed. Never mix Unit kinds within a Card. Cross-Card Sentence moves remain unsupported. Split parts explicitly pair meanings when the original has a translation. Native merge/adjacency/speaker restrictions remain authoritative. Last-Sentence deletion preserves intentionally empty Units.

Only metadata.note is editable. If sending metadata on update, send {...currentRecord.metadata,note}; dropping another key is rejected. Source/RF/Full/speaker-profile metadata cannot be directly edited. AudioVariant/Full writes and audioPreferences.reset are not exposed. Native edits perform existing logical invalidation; no physical deletion occurs.

## Drafts, pending state and asynchronous errors

```js
const key = {workspaceId,entityId:segmentId,field:'text'};
session.setDraft(key, value);       // clones; validates actual entity ownership
session.getDraft(key);              // cloned value or undefined
session.clearDraft(key);            // explicit, after your accepted form outcome
const newCollection = {catalog:true,field:'newCollectionTitle'};
const newWorkspace = {catalog:true,collectionId,field:'newWorkspaceTitle'};
```

Drafts survive rejected commands, browsing, invalid source replacement and session source resets. Clear them explicitly when appropriate. They are memory-only and not automatic localStorage persistence. getDraft can recover a retained draft even after its source becomes unavailable. Do not clear a form merely because a Promise resolved; inspect result.ok.

Pending locks immediately, before asynchronous execution. Disable command submit/delete controls while pending; double submissions return BUSY. Navigation remains allowed and invalidates late results. Rejections preserve the snapshot and draft. Async replies must exactly match the immutable staged snapshot and receipt; otherwise INVALID_RESPONSE. Changes in source/Workspace/revision or disposal return STALE_RESULT. Retry explicitly against the current view; do not auto-replay destructive commands.

replaceSource(snapshot,{selection:{},sourceAttachments:[],externalImports:[]}) replaces the detached source, increments revision, retains drafts and invalidates pending results. Bad snapshots enter an error state with view:null; no stale previous projection is shown.

Optional execute(command,{preparedOutcome,documentId}) is **only an isolated QA acknowledgement hook**. It must return preparedOutcome or an explicit {ok:false,error}. Never pass canonical executeTextLibraryCommand here: it independently allocates identities inside its transaction and has no expected-revision precondition.

Typed codes include READ_ONLY, PERMISSION_DENIED, UNINITIALIZED, SELECT_WORKSPACE/COLLECTION/CATALOG_SCOPE/LIBRARY_SCOPE, OUT_OF_SCOPE, INVALID_COMMAND, PROTECTED_METADATA, UNSUPPORTED_WORKSPACE/SCHEMA, PERSISTENT_UNITS_REQUIRED, MIGRATION_REQUIRED, INVALID_SNAPSHOT, BUSY, STALE_RESULT, INVALID_RESPONSE, COMMAND_REJECTED. Show message and preserve drafts. Capability reasons are not guaranteed final operand validity.

## Audio and source inspectors

workspace.audio contains scoped variants, Full artifact metadata by Card, coverage and readiness. Without supplied audio.preferences, coverage:null and readiness:'not-evaluated'. With {preferences,runtimeAudioUrls}, coverage uses the existing audio domain; only concrete nonempty URL bindings are forwarded. The host must have verified these bindings; a URL string is not an independent filesystem check. Folder/ZIP/Staging lazy markers alone cannot produce Ready. Only exact status 'ready' is Ready. Historical, metadata-only, stale and other-profile statuses remain distinct. Full artifact metadata alone is never labelled Ready.

workspace.sources retains Workspace ownership metadata and owned Text Pack/External registry records. Unresolved registry references appear in diagnostics. These are read-only. Speaker registry ID/UID is authoritative across Scenes; labels and colors are presentation only.

## Exports and workflow previews

session.exportData({kind:'text-pack'}) exports the selected Workspace or Collection using the native pack domain.
session.exportData({kind:'database-backup',metaRecords}) requires the **complete authoritative metaRecords captured consistently with the snapshot**; core fields must match. Unknown metadata and source registries are preserved, never synthesized. Missing/mismatched metadata raises METADATA_REQUIRED/METADATA_MISMATCH. No binaries are included.

session.inspectTransfer({kind:'database-backup'|'text-pack'|'external-json',data}) accepts parsed JSON or a JSON string and returns the native validation/diagnostics with applyEnabled:false.

session.previewTransfer({operation,data,attachmentId?}) supports:

- text-pack-copy, external-json-import: whole-library {} selection only.
- source-sync/source-detach: selected Workspace, owned attachment from supplied registry; detach preserves data.
- external-json-inspect: selected Workspace and matching registered source key.

All previews are pure, frozen, {operation,applyEnabled:false,plan}. They never commit. Multi-Workspace source attachment preview is disabled (COLLECTION_SOURCE_SCOPE_REQUIRED); destructive removal, workflow apply and replace restore are not bound. Native parse/planner failures become INVALID_TRANSFER. No zip extraction, audio generation, Staging cleanup or GC entry is bound.

## Required UI states and safe QA

Implement loading in the host; empty library/Collection/Workspace/Unit; ready; pending; read-only/capability reason; unsupported; recoverable command error/stale retry; invalid snapshot with explicit source reload. Avoid a blank page.

Fixtures: scripts/fixtures/p15-data-management/fixture.js, createP15Fixture(). Browser example: browser-cases.jsx, test-only page (not a production route). Commands:

```text
node scripts/audit-v603-p15-data-management.mjs
node scripts/audit-v603-p15-data-management-browser.mjs
```

Before UI acceptance rerun focused tests, P13 A3/A4/A5 and relevant P12/D3/D4/D5/P9 regressions, scoped lint/build and production route exclusion. Canonical constants remain 1. No real-user Mixed authoring, v2 migration, Legacy/AI Voice changes or production write wiring is authorized by this handoff.
