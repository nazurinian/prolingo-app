# ProLingo v6.0 A1a — Book QA Persistence Capability Ledger

**Status:** implementation ledger for the A1a candidate; browser/build evidence is recorded in the handoff.

## Host and authority

The UAT-only `?qa=book-qa` route mounts the real `App.jsx`, `MainAppShellView`, `Reader`, and Global Player after explicit opt-in and a successful connection to one validated disposable database. It is compiled only when the dedicated `text-uat` build flag is enabled. The host refuses the known Stable origins and permits localhost for local UAT execution. Normal App and Text Beta routing remain in place.

`createTextDataManagementPersistenceAdapter` is bound to the validated database name with `boundary: 'disposable'` and `catalog` plus `content` permissions. `createTextDataManagementSession` owns the single authoritative snapshot. App projections read the session snapshot; Book QA's legacy snapshot setters throw. Every supported write goes through the P15 session coordinator, adapter transaction, expected snapshot fingerprint/revision, authoritative receipt validation, and committed readback. A stale or uncertain receipt requires an explicit Refresh; no command is replayed automatically. Refresh also rejects a result if the session revision changes during its persisted read.

Initialization is create-only. Existing names are never overwritten; existing v1 or otherwise unsupported QA libraries cannot be connected as Book QA v2. The demo initializer strips fixture audio variants and Full artifact readiness. Connection does not rewrite an existing library's audio metadata.

## Persistence namespaces and isolation

| Namespace | Scope and A1a treatment |
| --- | --- |
| `prolingo_text_library` | Canonical Text database. `TEXT_LIBRARY_DB_VERSION` and `TEXT_LIBRARY_SCHEMA_VERSION` remain `1`. The QA startup skips legacy Text bootstrap and compatibility persistence; Book QA routes no operation to this service. |
| `prolingo_text_library_d3b_qa_*` | Explicit disposable Book QA target. Name is validated at the host and persistence adapter. A1a requires a fully readable v2 snapshot; initialization is create-only and uses the existing v2 seeding service. |
| `prolingo_audio_staging_v1` | Shared Text/Table audio staging database, mode-keyed internally and shared by all QA database names on one origin. Book QA does not hydrate, write, clear, export, or garbage-collect it. The UAT origin gives origin-level separation from other origins but does not separate multiple QA database names on that same origin. |
| `prolingo_text_structured_audio_folder_v1` | Remembered Structured Text folder handle database. No open/read/write is performed by Book QA. Folder selection and reconnect remain unavailable. |
| `prolingo_audio_folder_handles_v1` | Shared Table/Text folder-handle lifecycle database. Not used by the Book QA startup path; folder controls remain unavailable. |

An origin boundary isolates browser storage only. It does not isolate a physical folder selected through the File System Access API. Book QA therefore does not restore, request, write, or delete through external filesystem handles. A1b must add database-scoped staging identity and an explicit filesystem ownership/selection policy before enabling audio or transfer workflows.

The QA host and all adapters retain explicit DB names; no global mutable database name/version switch was added. No canonical constant was changed.

## Capability ledger

| Capability | A1a status | Entry/execution boundary |
| --- | --- | --- |
| Read authoritative v2 snapshot and supported Paragraph, Conversation, Mixed Workspaces | **Safely adapted** | Adapter `loadState`; schema-v2 validation; catalog filters out Legacy/unsupported document types. |
| Initialize empty v2 library | **Safely adapted** | Explicit opt-in, validated name, create-only seeding; existing database is rejected. |
| Initialize temporary clean demo library | **Safely adapted** | Same create-only path; supported fixture records only, with audio variants and Full artifacts removed. |
| Load/connect and Refresh/reconnect | **Safely adapted** | Connect requires a complete v2 library; Refresh rereads authoritative state and rejects a stale read/session race. |
| Workspace selection/navigation | **Safely adapted** | Session navigation only; selected workspace must exist in the authoritative snapshot and be supported v2. |
| Create/rename/move Workspace; create/rename Collection | **Safely adapted** | Allowlisted `document.create`, `document.update`, `collection.create`, and `collection.update` commands through the session. |
| Create Card, Content Unit/Section, Speaker, and Segment | **Safely adapted** | Allowlisted `block.create`, `contentUnit.create`, `speaker.register`, and `segment.create` commands. QA sample actions use these commands and persist each receipt. |
| Direct editor changes, field edits, ordering/reordering, segment update/delete, arbitrary bulk edits | **Temporarily unavailable** | Structured editor is read-only in QA; native command allowlist rejects types outside A1a. Full editor/P15 parity is deferred to A3. |
| Delete Workspace/Collection and other destructive catalogue operations | **Temporarily unavailable** | Delete controls are hidden in QA; generic Text command wrapper rejects execution without an explicit QA capability; native allowlist excludes deletes. |
| Search and search-to-play navigation | **Temporarily unavailable** | Search projection/actions are omitted in QA; P15 integration parity is deferred to A3. |
| Legacy Text reads, migration bootstrap, compatibility writes | **Temporarily unavailable** | `useMainAppPrimaryState` skips legacy identity loading in QA; Main App bootstrap and source-attachment hydration effects return before service calls; no Legacy document is selectable. |
| Audio generation, generation preferences, TTS artifact metadata writes | **Temporarily unavailable** | Audio/System sections show A1a boundary notices; generation entry points reject in QA; command allowlist excludes audio metadata commands. Browser TTS playback for actual reader playback remains available. |
| Split/Full audio hydration, staging reads/writes/GC/clear, Full artifact writes/deletes | **Temporarily unavailable** | Staging hydration and table staging startup effects skip QA; generation/GC/clear/delete callbacks reject in QA. Persisted metadata is not presented as Ready without runtime bytes. |
| Recorded audio attachment, folder handles, ZIP import/reconciliation, source removal | **Temporarily unavailable** | Reader audio authoring is disabled; execution callbacks reject before reading canonical snapshots, staging, or filesystem handles. |
| Audio MP3/ZIP exports and bulk audio export | **Temporarily unavailable** | UI entry points are hidden/disabled; individual and bulk export callbacks reject in QA. |
| Text Pack import/export/attach/sync; external JSON import; source attachments | **Temporarily unavailable** | Pack/backup action projections are null; generic command wrapper rejects before service invocation; source attachment startup read is skipped. |
| Database backup/restore/replace, rollback, transfer/merge | **Temporarily unavailable** | UI actions are absent; command wrapper rejects before backup, restore, canonical snapshot read, or import service calls. |
| Reset/delete QA library | **Deferred to later QA maintenance work** | No A1a UI or host action is exposed. There is no automatic cleanup or overwrite. A later maintenance control must require explicit confirmation and remain separate from ordinary library management. |
| Table vocabulary, Table audio controls, Legacy routes | **Temporarily unavailable in Book QA** | QA mode starts in Text, blocks switching to Table, and substitutes explanatory controls. Normal App/Text Beta routes are unchanged. |
| Text playback presentation preferences | **Safely adapted as session-only** | Reader controls remain usable; Book QA does not persist Structured Text playback preferences to the shared origin localStorage key. |

## Canonical service dependency audit

- `executeTextLibraryBootstrapEffect` is not invoked in QA. `loadTextIdentityState()` is skipped in the primary-state hook; legacy content cannot flash or be projected into the v2 view.
- `readTextLibrarySnapshot()` is used by the normal Portable ZIP path, which is rejected before that read in QA. `syncLegacyTextProjectionToDatabase()` is used by normal backup export, which is rejected before execution in QA.
- `readTextSourceAttachments()` is skipped during QA startup. Text Pack attach/sync/import/detach and external JSON import controls have no QA action projection, and their callbacks pass through the fail-closed command wrapper.
- `listTextAudioStagingMetadata()` is not called in QA. Shared staging reconciliation, staging mutations, clear/release, GC, and audio-variant deletion reject at their execution entry points. Table staging recovery is skipped in the Book QA startup effect.
- ZIP import/rollback and Full artifact flows are unavailable. The Portable ZIP callback rejects before canonical Text snapshot reads or staging transactions. The generic native command allowlist does not include audio metadata or Full artifact commands.
- Canonical v1 constants are unchanged; Book QA only opens the explicitly validated disposable name through the P15 adapter/seeding service. The host exposes no database delete action.

## Known limits for A1b/A3

Audio staging is currently shared between Text and Table in one origin-level database. The isolated testing origin prevents sharing with Stable origin storage, but separate QA database names on that same origin still share this staging namespace. No A1a flow touches it. Physical folders also outlive origin separation, so folder handles and external source ownership need an explicit A1b policy.

The clean sample creator executes a sequence of individually transactional commands. If a later command fails, earlier successful commands remain committed; Refresh is available and no command sequence is auto-replayed. A future complete acceptance library is A2. Direct editing, search, bulk operations, transfer, backup/restore, audio metadata/identity, staging and supported recorded audio workflows remain outside A1a; P15 completion is A3.
