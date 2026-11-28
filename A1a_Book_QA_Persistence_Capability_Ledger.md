# ProLingo v6.0 A1a — Book QA Persistence Capability Ledger

**Status:** A1b-2B is coordinator-approved. The approved A1b-G voice policy and A2 isolated manual library are documented in the [A2 acceptance report](A2_Book_QA_Persistent_Demo_Report.md). Production activation remains NO-GO.

## A2 persistent manual demo

The Book QA host can create the four native v2 A2 Workspaces in `prolingo_text_library_d3b_qa_book_a2_manual`. This path uses the existing explicit opt-in, origin and name checks, create-only initialization, and authoritative reconnect. It keeps London’s original Body and provides Paragraph, Conversation and Stress Workspaces. Initialization publishes no audio references. The scoped Body and Heading generation and Portable import controls support separate explicit actions to build partial coverage. [Indonesian manual UAT checklist](docs/uat4/ProLingo_A2_UAT_Manual_ID.md)

Fresh Edge manual, bulk and export defaults use Sonia/Gadis. Browser TTS chooses from its available catalog, with Edge preferring Sonia/Gadis and Chrome preferring UK Female/Indonesian. Previously stored choices and native audio bindings retain their existing precedence. The proposed Table / Legacy / Book UAT navigation and wider authoring belong to A3/A3-G.

## A1b-G integrated audio hardening

| Capability | Behavior |
| --- | --- |
| Card and Workspace Split generation | One explicit operation traverses the captured authored targets in order. Every publication retains the 32-logical-entry and 64 MiB unique-byte limits. Exact verified recordings skip synthesis and metadata publication. The next batch verifies the authoritative snapshot and exact owner identities. Cancellation or a failed batch retains accepted work. A stale, uncertain or committed-unaccepted receipt stops further publication until Refresh or reconnect reconciles the library. |
| Damaged provisional generation | A new explicit generation may replace the bytes for one damaged provisional fingerprint in its scoped companion database. The originating job must be an exact journal match in a reconciled precommit-failed state, with no accepted marker or protected reference. Current authoritative bindings and matching committed journal entries protect the fingerprint across logical owners. The stage transaction checks the same asset metadata and origin job again before updating the blob and adding the new job. Intact provisional bytes are reused. Committed bytes can be restored only with the accepted exact byte proof. |
| Body playback | Book QA Split fallback updates the actual Sentence, Section or Turn and resume cursor while preserving the user's Full preference. Full-scope Previous and Next navigate Cards. The Global Player derives the source, exact Speaker/voice and any seek range from the running media, with no inferred Sentence times for a Full artifact. Trusted derived Full verifies its scoped dependencies and uses 1× playback. Imported untrusted Full uses per-Sentence playback. |
| Transfer | Text Pack identity and lineage can be restored independently of audio. Portable transfer retains exact binary proof, scoped logical references and additive profiles. A reconnect can read verified recorded audio offline and export Normal ZIP files within the selected scope. |

The executor results, known historical audit failures and review prerequisites are tracked in [the integrated acceptance report](A1b_Integrated_Book_Audio_Acceptance_Report.md).

## A1b-2B listening and portable exports

Portable export uses the manifest's exact nested `Audio/RF/EN`, `Audio/RF/ID`, `Audio/Full/EN`, and `Audio/Full/ID` paths, with one physical entry per fingerprint and one index row per logical reference. The normal listening archive emits one entry per verified logical occurrence and has no portable manifest. Workspace, channel, representation, and alternate-profile choices apply within the connected QA library. Alternate listening filenames carry complete fingerprints to distinguish profiles. All reads use the connection's existing snapshot and recovery guard.

Full Section and Turn files are export-time WAV compositions from complete current Split inputs, verified scoped bytes and effective 1× rates. Browser decoding and output validation are required. Each Unit is limited to 32 inputs, 64 MiB of input and two minutes of decoded audio. Missing or unavailable inputs, non-unit rates and composition errors are reported as omissions. No Unit audio is persisted. Derived Conversation Full is omitted unless its existing trusted-composition marker is present. QA export does not request provider synthesis.

Normal ZIP admits up to 2,048 logical entries and 128 MiB of total stored archive bytes. Every repeated occurrence contributes its full payload, both UTF-8 path copies and both ZIP headers. Generated WAVs are checked before PCM allocation. The ZIP writer rejects count, size and offset overflow before serialization. Oversize operations have a typed retry diagnostic. Cancellation is checked during input reads, Unit decoding, CRC streaming and after the final authoritative snapshot read. The session releases its library lock before the UI reports the result.

The corresponding A1b-G follow-ups are tracked in the integrated audio hardening section above.

## A1b-2A Portable Audio ZIP

| Boundary | Scope and behavior |
| --- | --- |
| v3 physical identity | The root manifest `prolingo-text-audio-manifest.json` contains `assets` and `references`. Assets contain `fingerprint`, `descriptor`, `digest`, `codec`, `mimeType`, `size`, `sampleRate`, and exact archive `path`. Existing RF and Full SHA-256 identities and provider IDs remain exact. Byte SHA-256 is separate from render identity and provider provenance. |
| v3 logical identity | Each reference carries `fingerprint`, `representation`, `workspaceUid`, `ownerUid`, `channel`, and `order` (Workspace, Card, Unit, Sentence). Supported representations are `main-title`, `paragraph-heading`, `scene-heading`, `split`, `full-paragraph`, and `full-conversation`. One physical RF can have many logical consumers. |
| Archive boundary | Read the central and local ZIP records together. Reject unsafe names, case/normalization collisions, unsupported compression/encryption, overlapping ranges, inconsistent sizes, bad CRC, ambiguous manifests and undeclared v3 audio. Stored and bounded deflate are supported. Limits are eight input files, 256 MiB each for combined input and declared audio expansion, 128 MiB per archive and per archive expansion, 64 MiB per entry, 4 MiB per manifest, 2,046 asset entries and 8,192 logical references per operation. Validate actual MP3 or PCM WAV through the existing browser decoder and byte proof. |
| Scope and selection | Opted-in connected Book QA only. Choose the Workspace or Library. Export uses current and compatible alternate committed references with a current-only option, and includes necessary Split dependencies. Stale, missing, mismatched or unverified assets are reported as omissions. Existing references and bytes are retained. |
| Destination matching | An exact owner UID takes precedence. A v2 new-copy Text Pack may supply its original owner and Workspace UIDs as hints. Every match still requires the current destination content and reconstructed descriptor. If the original Workspace is outside the scope or absent and no lineage applies, only a unique exact content/descriptor match can bind. Missing, stale and ambiguous owners are reported. No destination records are created or reordered. |
| Legacy | The Book reader recognizes manifest v1/v2, manifestless canonical ZIP entries and directly selected canonical RF/Full files. It checks the bytes and uses a complete legacy descriptor or an exactly matching locally reconstructable requirement. Undeclared RF ownership must yield exactly one target across Main Title, Card Headings and Split. A historical manifest with stable Workspace and segment or Card UIDs can identify its declared target. Loose derived Full requires an existing known composition descriptor. Unresolved legacy files stay unverified. Existing normal ZIP readers and canonical services retain their prior entry points. |
| Coverage | Transfer reports enumerate current authored requirements independently of stored references. Each representation and channel reports expected, available, exported, alternate exported and status counts. Blank optional channels are excluded. Alternate profiles stay outside the current numerator. An unverified composition can contribute a verified export when it has all durable inputs and still counts as unavailable for playback. Missing or unsupported inputs have distinct statuses. These diagnostics stay outside manifest v3. |
| Derived Full | Import the exact ordered Split bindings first. A matching WAV can then be stored with verified bytes and an unverified composition binding. Imported evidence supplies no trusted-composition flag, so playback uses per-Sentence fallback. If required inputs are unavailable, the Full is reported and can be imported again after those inputs. Accepted bytes are immutable. Local composition can establish trust when its bytes agree. Cross-browser differences can require keeping the imported unverified WAV and continuing to use Split. |
| Publication and counts | Each batch has at most 32 logical entries and 64 MiB of unique physical bytes. Publication uses the companion database, Web Lock, journal and one authoritative Text transition per batch. Cancellation and stale or uncertain results stop the package. Refresh reconciles any possible commit before a new user action. Earlier accepted batches remain usable. Reimport verifies exact committed bytes and skips redundant metadata writes. Discovery and validation count package occurrences, while stored, reused and repaired count unique physical fingerprints. Logical coverage counts owners separately. |

### A1b-2B handoff

- Preserve the manifest type, version, exact provider voice IDs, descriptors, fingerprints, byte proofs and stable UID semantics. The archive paths in the manifest and index must always agree with the actual ZIP entries.
- A1b-2A emits portable assets at the ZIP root with the existing complete RF/Full names. A later path renderer can use safe bounded relative folders. The reader matches each entry by its exact path. Reject case collisions and keep Windows component and full path bounds. Keep all 64 hash characters and lowercase actual codec extensions. Apply the approved uppercase engine and voice labels only to the filename tokens.
- Preserve one portable archive entry per physical fingerprint and one index row per logical reference. The index columns are `archive_path`, `fingerprint`, `representation`, `workspace_uid`, `owner_uid`, `channel`, `workspace_order`, `card_order`, `unit_order`, `segment_order`, `engine`, `voice_id`, `render_rate`, `render_pitch`, `codec`, `mime_type`, `byte_size`, `sample_rate`, and `byte_sha256`. Normal listening ZIPs can deliberately repeat bytes for separate authored occurrences.
- Preserve report-only coverage diagnostics. Files and manifest references represent verified archived bytes. Keep stable owner references when a physical RF has multiple logical consumers so future imports can resolve its destinations.
- Edit filename renderers in `textFilenameDomain.js`, human-readable index presentation in `textAudioIndexDomain.js` or `buildBookPortableAudioIndex`, and the export-side path/file entry mapping. Preserve strict ZIP admission, manifest identity validation, the scoped audio session and transaction boundaries. If folders are written, the ZIP writer must explicitly preserve validated relative paths.
- Full Section/Turn is an export-time derivation candidate. Require complete compatible Split bytes in authored order with supported 1× inputs. The accepted composition emits 48 kHz PCM WAV. Persistent Section/Turn artifact identities stay deferred.
- Body follow-ups remain open for A1b-G. These include multi-batch Card generation, damaged provisional recovery, Full-to-Split presentation and wider bilingual and multi-speaker coverage.

## A1b-1C Atomic Title and Heading audio

| Boundary | Book QA contract |
| --- | --- |
| Logical identity | Main Title uses the Workspace UID, `mainTitle` slot and channel. Card Heading uses the Card UID, `heading` slot and channel. Native IDs and the Workspace UID scope every transaction. Linked Titles resolve from the Workspace Name. Custom Titles resolve from authored text. Blank Heading channels, unsaved Title previews and historical Title-role Cards have no atomic requirement. Historical content remains readable with its existing semantics. |
| Binding | Document or block metadata `bookHeadingAudioV1` stores `{ text?, meaning? }`, with up to 64 exact RF references per channel. Each reference stores the engine descriptor and independent byte proof. Typed publication uses the existing Book QA journal, lock, snapshot/owner checks and verified readback. Split and Heading can refer to the same physical scoped RF and object URL. Stored keys contain no duplicated owner UID. |
| Editing and transfer | Current requirements derive from the resulting resolved text. EN edits leave ID and Body unchanged. Cleared or changed Headings retain old references for safe reuse and future reference accounting. Reorder preserves ownership. Existing metadata transfer retains the binding payload and the destination UID determines logical ownership. Destination readiness still requires the destination library's durable bytes. |
| Global preferences | Browser voice and channel playback speed come from Global playback state. Edge voice, render rate and pitch come from Global generation state. Recorded playback uses exact Global ordered RFs or the Global Edge render where local-first has no explicit order. Browser-only reads no recorded files. Custom local requires an eligible explicit Global order for atomic playback. Workspace and Body overrides never feed these resolvers. Global preferences remain session-only. |
| Show and Read | Show controls use the existing in-memory Workspace UID Reader preference. Read uses a typed Workspace command and `bookHeadingReadV1`. Both default to Main Title on, Paragraph Heading off, Scene Heading on in QA. They are independent. |
| Transport | A fresh Workspace start reads the enabled Main Title once. Enabled Card Headings precede Body Cards on each pass. Card play includes its Heading and excludes the Main Title. Direct Section, Turn and Sentence stay local. Resume, Continue and From Here skip the starting Heading and the Main Title. Later Card boundaries may read enabled Headings. Explicit playback plays only the selected atomic target in the requested language order. Heading-only playback runs once. |
| Shuffle and navigation | Body shuffle preserves authored order within each Card and moves the Card Heading with it. On a fresh Workspace run, heading-only Cards follow their closest authored predecessor that has playable Body, or go before the first Body if there is no predecessor. Next/Prev during Main Title enters the first/last Body position. Other manual transport uses the existing Split Sentence or Full Card traversal, without replaying the destination Heading for the jump. Headings have no Body ordinal or queue position. |
| Readiness and lifecycle | Exact recorded reads verify durable bytes. Browser TTS is the fallback. Actual Heading identity, channel and voice feed the same Global Player and Media Session. Only the actual recorded media timeline is seekable. Navigation preserves the starting owner and session. Disposal revokes connection URLs and invalidates pending playback. |
| Future reference collection | Include every retained Heading and Body RF reference, Full artifacts and their composition inputs, provisional/uncertain journal entries and active playback leases. Deduplicate physical RFs only within the exact library namespace. Destructive maintenance stays disabled. |

Portable manifests and ZIP transfers require a separate logical Heading representation before portable coverage can count these references. Body follow-ups remain open for the A1b-G gate, including generation spanning multiple bounded batches, damaged provisional repair, Full-to-Split source presentation, and wider bilingual/multi-speaker acceptance.

## A1b-1B Body audio

The Book QA host supplies the same Reader panel to desktop and mobile. It exposes single-Sentence and bounded Card Split generation, Full Paragraph generation, Conversation Full composition, current-profile verification, and exact committed-byte restoration. The connection supplies the audio capability after origin, opt-in and v2 library validation. Startup still skips companion hydration. The Reader checks durable bytes on demand for playback and when the Body audio panel enables coverage. The normal bundle excludes the panel and Book QA host.

| Path | Ownership and precedence |
| --- | --- |
| Paragraph Browser TTS | Split uses Sentence → Card → Workspace narrator → Global browser voice. Full uses Card → Workspace narrator → Global. Existing browser voice fallback and browser pitch controls apply. |
| Conversation Browser TTS | Sentence → supported Card/Speaker override → stable Workspace Speaker → legacy name fallback → Global. Existing link/sync behavior remains available. Full fallback uses each Sentence's Speaker and override. |
| Edge generation | Paragraph Split uses Sentence → Card → Workspace narrator → Global Edge voice. Paragraph Full starts at Card. Conversation resolves each Sentence with its stable Speaker, supported overrides and compatibility fallback. Render rate and pitch come from session defaults. |
| Recorded source | Local-first uses native Card, Global and legacy Workspace order, then the effective Edge profile when that order is empty. Each candidate uses its exact channel, content, voice, rate and pitch fingerprint. Custom local uses the effective local pin. Browser-only bypasses recorded reads. A profile may use Browser TTS when compatible recorded bytes are unavailable. |
| Playback speed | Card and supported Workspace narrator/Speaker rates inherit Global. Existing Conversation synchronization applies. Composed Full WAV uses 1× playback. |
| Preference writes | The typed `document.update` profile operation checks Workspace UID, channel, kind and registered Speaker identity within the existing command transaction. Reset clears the selected profile's overrides for resolution and preserves all audio and other scopes. Global settings remain session-only in Book QA. A playback session keeps its starting Workspace and profile during browsing and resets. |
| Readiness | Exact durable bindings distinguish ready, missing, metadata-only, other-profile, stale, legacy-unverified and corrupt. Stable variants retain up to 64 distinct exact RF references. An overflow rejects the entire batch. A recorded URL belongs to its connection and exact staged key. |
| Conversation composition | The scoped publisher reads the first expected compatible Split RF for every audible Sentence in authored order and verifies the bytes. The existing composer emits 48 kHz PCM WAV for 1× inputs. Publication records composition proof on the Full artifact. Earlier untrusted derived rows stay unverified. If composition is unavailable, playback uses per-Sentence recorded audio or Browser TTS. |
| Recovery and repair | Generation reuses intact provisional bytes for the same exact RF. Failed cold recovery fences reads and writes until a successful Refresh. Explicit restoration requires locally supplied bytes that decode and match the committed SHA-256 and other binary proof. Restoration has no Text mutation and cannot replace another accepted digest. Targeted damaged provisional recovery is described under A1b-G. |
| Deferred | Title and Heading audio, ZIP, folder access, general metadata editing, manual attachment, storage clear, release and destructive GC remain disabled. The panel uses existing Edge and Browser playback services. No new store, schema, fingerprint format or preference storage key is required. |

## A1b-1A audio foundation

The accepted A1a gates below continue to apply to the Main App. This packet adds an internal host-bound audio capability for persistence verification. It does not add an audio control, a public editor command, or startup hydration.

| Boundary | A1b-1A treatment |
| --- | --- |
| Companion storage | The exact validated Text library name maps to `prolingo_book_qa_audio_staging_v1__<lowercase SHA-256 of the exact name>`. The Text library validator rejects those names. The companion reuses the Staging v1 `audioMeta`, `audioBlob`, and `batchSessions` stores. The shared normal App database and its behavior stay as before. A connected host opens its companion only on audio use or requested audio recovery. |
| Typed audio publication | The internal capability accepts bounded arrays of Split Segment and Full Card targets with native IDs and UIDs, full render identities and Blobs. The P15 transaction validates v2, the bound library and connection, targets, descriptors, and the expected snapshot. The public editor allowlist remains unchanged. Saved reference maps keep stable variant IDs and replace the legacy pointer only when promoted. Legacy references without a byte proof remain unverified. |
| Physical bytes and runtime | Fully framed MP3 Layer III or integer PCM WAV is browser-decoded on admission. The expected codec is derived from the render profile. A separate SHA-256 byte digest and durable readback govern readiness. A matching RF with different accepted bytes rejects. The per-connection object URL cache is revoked on disposal. No user-facing recorded readiness is wired here. Limits are 32 entries, 64 MiB per operation, ten minutes per decoded asset, and 64 RF references per stable variant. Reaching the reference limit rejects the operation and preserves every entry. |
| Publisher and recovery | A library-specific Web Lock fences stage, commit and reconciliation across tabs. Audio writes fail closed when this lock is unavailable. An IndexedDB transaction commits provisional assets and their job together. A separate Text transaction writes references and a uniquely keyed commit marker together. A verified commit requires matching receipt, authoritative readback and durable bytes. A known precommit failure, unaccepted commit and uncertain commit have separate job states. Explicit Refresh after a failure and first audio use after reconnect reconcile from the Text marker. Unresolved work blocks dependent writes and a failed read retains the last valid projection. |
| Disabled features | Recorded playback/generation/attachment UI, Heading audio, ZIP import/export, folder selection/reconnect/writes, manual release, destructive GC, bulk clear and general P15 editor operations remain disabled. No companion or canonical database deletion is performed. |

No cross-database atomicity is assumed. Recovery never replays a command, rolls back a Text row/counter, overwrites an accepted binary, or deletes a provisional/orphan binary. A future GC must validate fresh references across the whole library, including all retained RF profiles, Heading ownership, Full composition inputs, provisional/uncertain jobs and active playback leases. It must use the same publisher fence and honor active consumers before any physical reclamation. Global preferences remain session-only in Book QA and the packet adds no download-history writes.

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

## A2-HF1 capability update

The following rows supersede the A1a limitations for the named Book QA capabilities. The [A2 acceptance report](A2_Book_QA_Persistent_Demo_Report.md) records the intervening integration.

| Capability | Book QA entry and boundary |
| --- | --- |
| Narrator and Speaker voices | Body audio exposes browser and Edge catalogs per channel. Workspace profile edits go through the existing scoped document transaction. Browser selection and fallback use the live browser catalog. Recorded selection uses the existing render and playback precedence. |
| Record and verify | Sentence, Card Split, Workspace Split, Paragraph Full and derived Conversation Full use the existing scoped generator. Card and Workspace verification check current render coverage. An explicit generate action can contact Edge. |
| Download | Portable and Normal ZIP actions download verified audio through the existing scoped exporters. Portable retains manifest v3 and alternate-reference handling. |
| Continuous runtime | The Book owner retains its last started target between steps. Verified lookahead is bounded to upcoming work and subject to readable snapshot and exact binding checks at playback. During silence the Global Player has no current media timeline. |
| Boundaries and acceptance | The manual A2 library still connects explicitly at its original database name. Canonical Text remains v1. The [HF1 report](A2_HF1_Book_QA_Manual_UAT_Refinement_Report.md) records automated evidence and open manual checks. Final design remains in the A5 backlog. Production activation is NO-GO. |

## A2-HF2 capability update

| Capability | Review-gate boundary |
| --- | --- |
| Portable ZIP | Scoped transfer and additive import. Alternates are included by default. Manifest v3, AUDIO_INDEX.csv, canonical names, RF/FULL identity and exact byte proofs continue to apply. |
| Listening ZIP | Scoped listening download. Current profiles are the default. Compatible alternates and an exact verified Edge render profile are explicit choices. Authored occurrences retain order, including shared physical recordings. Full Section/Turn WAVs are composed for export from verified current inputs. |
| Coverage | Read-only verification can group a connected Library, Workspace or a selected Card by EN/ID and representation. Persisted readiness and Unit composition eligibility are separate. The existing recovery lock, snapshot fence and exact byte checks govern the read. |
| Playback and Focus | Global Player Details keeps the timeline section in place during the Book session and shows live timing only when an owned source supplies it. Paragraph Split fallback scans until the first verified source, then uses existing bounded lookahead. Outer scrolling leaves Unit selection to explicit navigation and playback-follow behavior. |
| Authorization | Playback settings remain session-only. Workspace profiles continue through native scoped commands. Document transfer, canonical system/audio tools, the complete profile manager and final carousel remain assigned to their existing roadmap phases. |

See the [HF2 report](A2_HF2_Book_QA_Targeted_Correction_Report.md) for the review gate, fixture archive trees and remaining device checks. Production activation is **NO-GO**.
