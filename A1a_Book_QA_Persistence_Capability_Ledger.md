# ProLingo v6.0 A1a — Book QA Persistence Capability Ledger

**Status:** A1a-R-HF1 implementation and verification ledger.

## Host and authority

The UAT-only `?qa=book-qa` route mounts the real Main App, Reader, and Global Player after explicit opt-in and connection to one named disposable database. The exact origin allowlist is `https://text-uat.prolingo.web.id` and HTTP on `localhost`, `127.0.0.1`, or `[::1]` on ports `4173` and `5173`. The gate rejects every other origin before opening storage. Physical-device access is deferred. The Book QA host module is included only in the explicit `text-uat` build.

`createTextDataManagementPersistenceAdapter` binds one validated database name with disposable catalogue and content permissions. The P15 session owns the authoritative snapshot, and writes use its fingerprint, revision, transaction and committed-readback checks. The Book QA connection validates the incoming v2 snapshot and sidecars, resolves the deepest surviving selection against current parent relationships, and replaces the projection only after validation. A surviving Collection, the first supported Workspace, or the empty library provides the fallback selection. A stale result, invalid read or uncertain receipt locks writes until a successful explicit Refresh. Connected errors carry a code and message. P15's shared APIs and other callers retain their existing semantics.

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
| Create Card, Content Unit/Section, Speaker, and Segment | **Safely adapted for QA samples** | The desktop and mobile catalogue invoke a dedicated sample action that dispatches fixed `block.create`, `contentUnit.create`, `speaker.register`, and `segment.create` commands against the new Workspace. Ordinary editor callbacks reject before dispatch. |
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
| Text playback presentation preferences | **Session-only** | Reader and permitted playback controls initialize from defaults and update App memory. |

## Preference and startup isolation

| Surface | Book QA behavior |
| --- | --- |
| Reader and Workspace presentation | `prolingo_text_main_reader_v1` stays outside the QA path. Reader mode, presentation options, shared style, per-Workspace style and reset use the same normalization with in-memory state. |
| Structured Text playback and Browser TTS | `prolingo_text_structured_preferences_v1` stays outside the QA path, including global playback resets. The browser supplies the available TTS voices. The App keeps voice and transport selections in memory. Workspace-authored preferences already present in the connected snapshot can be projected for playback. |
| Global sequence, delays and vocabulary order | The `prolingo_playback_sequence_v511`, `prolingo_playback_delays_v511` and `prolingo_vocabulary_play_order_v511` keys stay outside the QA path. Defaults, live refs and order recalculation stay active in memory. |
| Generation, diagnostics and audio lifecycle | Shared Text generation and Table local audio preference keys are skipped. Generation changes and resets, Edge backend diagnostics, ZIP, staging, folder and bulk callbacks fail closed. Audio and System panels show the same capability limits on desktop and mobile. |
| Sidebar and theme | The control section defaults to Data and the theme follows the system. Changes remain in memory. The shared sidebar and `theme` keys are skipped. |
| Table cache, draft and legacy bootstrap | `pronunciation_decks` and `prolingo_text_identity_v1` are skipped. Table restoration, draft autosave, Legacy migration and source attachment hydration are bypassed. Empty QA libraries have a Workspace prompt with no Legacy editor. |
| Mastery, activity and download history | `prolingo_mastery_state_v1`, `prolingo_study_activity_v1` and `prolingo_audio_download_history_v1` stay outside the QA path. State starts empty. |
| Credentials and app view | QA starts directly in the connected App. It skips the normal `prolingo:view:v1` session key, Gemini credential migration and cleanup, and credential endpoints. Normal App credential cleanup remains in its startup effect. |
| Durable exceptions | The opted-in QA IndexedDB stores the Workspace data and native command receipts. The selected database name is kept in the URL for explicit reconnect. Theme media queries, browser voices and transient media objects use browser runtime APIs. No QA preference namespace is needed. |

The browser harness instruments storage only in its disposable test profile. It checks shared-key accesses and sentinels, exact database names, full refused-initialization readback, independent libraries, mobile execution, refresh and controlled playback. The session audit covers origin allowlist and refresh races.

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
