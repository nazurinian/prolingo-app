# P14 Legacy A0 architecture contract

Separate track, reached only after H3-S/R1/R2/R3 passing checkpoints. **GO for an isolated read-only A1 foundation; authoring/production integration remains gated.**

Verified ownership:

- src/domain/text/textLibraryDomain.js:236 creates the original legacy-line-v1 library migration plan. Workspace.documentType may be mixed, but editorModel=legacy-line-v1 is the authoritative Legacy discriminator. Do not identify Legacy by documentType or by the reader label Tampilan Lama.
- textLibraryDomain.js:312 resolves Legacy compatibility: each TEXT_ Card/line must have exactly one Segment; textIdentityState.items use Card TEXT_ IDs and the library text counter high-water. Duplicate line text is not identity.
- src/services/persistence/textIdentityPersistenceService.js:7 retains prolingo_text_identity_v1 compatibility state; this is separate from Structured Content Units. Existing startup/bootstrap and textarea bridge remain owned by textLibraryLifecycleService.js, with sync restricted to editorModel=legacy-line-v1 (line 61).
- src/services/persistence/textLibraryIndexedDbService.js:258 syncs Legacy projections in the canonical v1 stores, checks global Card ownership and retains counters. This track must not call it from a new management read.
- src/domain/audio/audioSourceRoutingDomain.js:3 keeps Table audio in localAudioMapTable and Legacy Text in localAudioMapText. src/domain/view/dataSystemBoundaryDomain.js scopes Legacy audio by explicit model and active document signature, clears stale runtime maps on document changes, and gates Table storage/generation controls separately. These compatibility maps are not Structured AudioVariant/RF readiness.
- Existing structured native commands refuse Legacy documents. Existing D3 v2 backfill excludes Legacy from Content Units. P14 must retain that boundary.

Read-only A1 public contract: caller supplies a complete validated library snapshot and optional Legacy documentId. Return a detached/frozen catalog and selected Workspace with line Card/Segment IDs/UIDs, exact text/raw meaning/metadata, structural order, existing logical AudioVariant associations and explicit not-evaluated physical readiness. Reuse the existing Legacy compatibility selector for its one-Segment-per-Card validation. Never invent Content Units or mutate compatibility storage.

Typed states: ready, no selection, unsupported Structured Workspace, invalid snapshot/Legacy line cardinality. Capabilities edit/delete/migrate/audioGenerate/physicalDelete are all false. No database opener, localStorage access, audio host or background effect in the foundation.

Future authoring gates: define native Legacy command/receipt ownership, stable line-ID split/merge rules, compatibility-state conflict recovery, source attachment effects, Table/Legacy runtime audio scoping and logical deletion rules before implementing writes. A shared store or helper is not permission to share Table behavior. No implicit Legacy conversion, canonical migration, Table rewrite or large management UI in A0/A1.

Human Legacy UX, production integration, real-data audio reconciliation and any new destructive operation need separate authorization. This contract does not change the completed Text QA checkpoint.
