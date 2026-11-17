# P15-S A0 — Structured Text Data Management contract

Baseline: feature/p13-mixed-workspace at 6d481cd3fcf8cad580661552a10c0203ffd30419.
Implementation branch: feature/p15-structured-data-management. Scope: A0–A1 foundation; no Legacy or production v2 activation.

## Authority and page boundary

Workspace → Card → Content Unit → Segment remains authoritative. Collections contain Workspaces, with a separate Root group. Workspace order is per Collection/Root; Card order is global within a Workspace. Paragraph Cards contain Sections; Conversation Cards contain Speaker Turns; Mixed interleaves these Card types, never their Unit kinds within one Card. Adjacent same-speaker Turns remain separate identities.

The future UI is a dedicated full-page Data Management experience. Open Workspace remains lightweight navigation. A1 adds no production route or visual redesign. Hydrogen should consume the headless session and immutable view, use separate drafts, and reuse existing authoring components where compatible. The Reader remains a read-only sibling. Data Management owns no playback host.

Existing authority:

- src/domain/text/textLibraryDomain.js: validated normalized snapshots, catalog and hydrated Document Tree.
- src/domain/text/textCardPresentationDomain.js: validated read-only identity-based projection.
- src/domain/text/textLibraryCommandDomain.js: sole native command engine and ID/UID allocation.
- src/domain/text/textMixedEditorDomain.js: shared structured field/scope guard and staged asynchronous coordinator, reused by A1.
- src/services/persistence/textLibraryCommandService.js: canonical v1 command transaction reads fresh state and allocates inside the transaction.
- src/services/persistence/textLibraryWorkspaceService.js: existing production host actions.
- src/services/persistence/textContentUnitPersistenceService.js: separately named disposable v2 QA databases only.
- P13 Mixed Editor, D4 Conversation Editor, P12 Reader and A6 App integration remain unchanged consumers of their existing contracts.

## Storage capability matrix

| Boundary | Reads | Authoring |
| --- | --- | --- |
| Canonical v1 | Caller supplies existing validated snapshot | A1 adapter is read-only. Existing production services remain unchanged. |
| Disposable v1 Paragraph | Persistent Cards/Segments; virtual Section has null ID/UID | Catalog, Paragraph Card/Segment operations; no virtual Unit writes, Unit move or speaker commands |
| Disposable complete v2 | Paragraph, Conversation, Mixed, persistent Units | Scoped native catalog/content commands, including speakers |
| v1 Conversation/Mixed or Legacy | Catalog and unsupported inspector | Disabled, explicit reason; no migration or conversion |
| Corrupt, partial, future schema | Error state | No repair, migration or authoring |

Canonical DB/schema constants stay 1. A complete snapshot is mandatory: no constructing missing stores or fabricating persistent identities. Browse selection never dispatches document.setActive. Session source replacement invalidates pending results. Source/audio sidecar registries are supplied separately from the library records.

## Identity, editing and transaction rules

IDs/UIDs, parent IDs, order, EN/ID and joinAfter are preserved in detached frozen projections. Speaker identity comes from the persistent registry. Empty Cards/Units and duplicate text survive. Metadata is opaque: only metadata.note is editable; all other source, RF, Full artifact, speaker and identity fields must survive unchanged. No arbitrary AudioVariant/Full upserts, deletes, preference resets or source mutations are exposed as generic commands.

Native commands determine allocation, split/merge restrictions, logical invalidation and deletion. P15 adds scope/permission checks, not another command engine. Workspace content scope covers all its Cards; selected Card/Unit/Segment is navigation context. Cross-Workspace operands are rejected before native execution. Cross-Card Sentence moves remain unsupported. Collection delete requires empty; document reorder requires the complete sibling permutation. No type conversion or Legacy reorder is supported.

The session defaults to read-only and no permissions. Explicit disposable boundary plus catalog/content permission is required for commands. It stages a native immutable result once and uses the existing coordinator's synchronous pending lock and exact async acknowledgement validation. Changes to source, navigation revision or Workspace invalidate pending replies. Failed commands preserve drafts. Acknowledgements cannot supply a replacement snapshot.

**Production integration gate:** do not pass executeTextLibraryCommand as the acknowledgement callback. That service performs its own fresh-state allocation; it has no expected-snapshot/revision precondition. A future canonical writer needs an explicitly approved transactional concurrency contract and native receipt reconciliation. A1 enables no canonical writes, including v1.

## Sources, audio and transfers

Text Pack attachment and External JSON registries remain authoritative sidecars. Inspectors retain opaque ownership metadata. Sync/detach previews use native source planners, require an owned Workspace, and never apply. Multi-Workspace attachment changes remain disabled pending Collection-level review. Detach preview preserves data; destructive removal is not exposed.

AudioVariant associations and Full metadata remain read-only. Metadata or historical download status never means physical readiness. Optional coverage uses the existing RF/profile resolver with caller-supplied preferences and concrete URL bindings; lazy folder/ZIP/Staging markers alone are excluded. No binding evaluation means not-evaluated. Full artifact metadata is presented without a Ready claim; physical Full verification remains an audio service responsibility.

Supported pure entry points: scoped Text Pack export; complete JSON database backup requiring authoritative metaRecords captured consistently with the supplied snapshot (including sidecars and unknown metadata), with no binaries; format inspection for Text Pack, backup and External JSON; native Text Pack copy / External JSON initial import previews; source sync/detach and External reconciliation inspection previews. Missing or mismatched backup metadata is rejected, never synthesized. No preview is automatically applied. JSON backup/export is distinct from physical audio ZIP portability.

Future approved UI actions must call established persistence services rather than write stores:

- textPackJsonService: executeProLingoTextPackAttachOrSync, executeTextSourceDetach, executeProLingoTextPackMerge.
- textExternalJsonService: inspectProLingoTextExternalImport / executeProLingoTextExternalImportDecision.
- textDatabaseBackupService: export and executeProLingoTextDatabaseReplaceRestore (replace is destructive and not bound in A1).
- Existing audio download/Staging/ZIP/GC services keep their current contracts; no cleanup or physical deletion in this phase.

## UI contract and gates

Hydrogen receives catalog, selected Workspace/tree/presentation, speaker registry, source/audio inspectors, diagnostics, capability reasons, pending/error state, identity-scoped drafts and native command receipts. Required full-page states: loading (host), empty library/Collection/Workspace/Unit, ready, unsupported, read-only, pending, rejected/recoverable, stale retry and invalid snapshot.

Acceptance: focused Node and real-browser checks on disposable snapshots; exact identity and immutability; cross-Workspace rejection; catalog navigation; source/audio preservation; locks, stale responses and drafts; v1 virtual compatibility; relevant P12/P13/D3/D4/D5/P9, scoped lint, build and production QA exclusion. No human/device acceptance is implied. UI authoring against real storage, canonical v2, source destructive apply and physical audio management remain separately gated.
