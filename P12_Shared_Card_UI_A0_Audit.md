# P12 Shared Card Presentation — A0 independent audit

**Recommendation: CONDITIONAL GO for incremental presentation implementation; NO-GO for canonical v2 activation or audio changes.** No additional carousel/animation dependency is justified. The shared layer should consume a read-only Card → Unit → Segment projection and host-owned playback state. It must not own persistence, commands or an audio session.

Audited branch: `feature/p12-shared-card-ui`. Approved baseline and observed HEAD: `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd`. HEAD equals the baseline; the initial working tree was clean. Only this report is created by A0. No production source, dependencies, database or audio records were changed.

**Evidence convention:** “Verified” describes inspected source or an executed probe. “Proposed” describes a future interface or implementation choice; the proposed components and preference key below do not exist yet. Line references are to this baseline. This is a source/integration audit, not browser visual acceptance.

## A. Current architecture and reusable inventory

### Verified data and integration boundaries

- Collection → Workspace → Card already corresponds to collections → documents → blocks. Library Root/unfiled Workspaces also exist: `src/components/text/TextLibraryShell.jsx:74`, `:76`, `:80`. Preserve nullable `collectionId`; the new presentation does not require allocating a Book Collection.
- Persistent Unit kinds are **`paragraph`** and **`turn`**. “Section” is a presentation label for `paragraph`, not a new stored kind. Card types remain `paragraph` or `conversation`: `src/constants/textDatabaseConstants.js:49`–`:53`.
- `resolveTextLibraryDocumentTree` validates/normalizes the snapshot, orders Cards and Segments, attaches AudioVariants, and, when Content Units exist, hydrates ordered `block.units[].segments` through **`segment.unitId`**: `src/domain/text/textLibraryDomain.js:573`, `:591`, `:601`, `:614`, `:632`. It preserves Units with no Segments and Cards with no Units. Hydrated objects still share some nested metadata with their source; do not mutate them through presentation props.
- Unit validation checks Card/Workspace foreign keys, Card-monotonic Segment order and speaker agreement: `src/domain/text/textContentUnitDomain.js:279`, `:303`, `:311`, `:318`, `:381`. Persisted `segmentIds[]` on a Unit is prohibited (`:359`). Derived child lists/indexes are safe only as transient projection values.
- A Mixed Workspace can contain both Card types. A **single Card cannot contain both Unit kinds**: validation selects one expected kind from its `blockType` (`src/domain/text/textContentUnitDomain.js:394`), and creation enforces the same rule (`src/domain/text/textContentUnitCommandDomain.js:210`). Same-Card mixed Units are outside this contract.
- The D4 selector is deliberately Conversation-specific: it requires complete isolated v2 state, intact UIDs, and a Conversation/Mixed Workspace (`src/domain/text/textConversationEditorDomain.js:45`, `:61`). It projects only Conversation Cards into `scenes`, retaining all Card IDs separately in `cardOrderIds` (`:70`–`:86`). It is not the complete Mixed presentation selector.
- Canonical DB/schema stay **1**, with six v1 stores: `src/constants/textDatabaseConstants.js:1`–`:18`; canonical open uses those constants at `src/services/persistence/textLibraryIndexedDbService.js:73`. Disposable v2 access rejects the canonical name and bypass flags: `src/services/persistence/textContentUnitPersistenceService.js:47`.
- Production renders `TextStructuredPlayer` through `src/App.jsx:7475`. The newer Conversation editor is behind a development-only QA route at `src/main.jsx:6`–`:23`. Sharing a visual framework does not authorize moving that route or activating its persistence contract.

### Verified component inventory

| Existing source | Responsibility / reusable behavior | Reuse boundary |
| --- | --- | --- |
| `src/components/text/TextParagraphUnifiedReading.jsx:33` | `SentenceFlow`: Segment-ID-based EN/ID rendering, shared logical numbering, active/speaking/search states, availability title, manual activation. | Extract the interaction/content atom; the surrounding layout is not the frozen shared Full layout. |
| `src/components/text/TextParagraphUnifiedReading.jsx:70`–`:103` | Indigo Text / emerald Meaning speaking colors, active underline, focus-visible ring, Enter/Space activation, disabled tab behavior and cloned inline box decoration across wrapped lines. | Preserve these behaviors and target semantics during extraction. |
| `src/components/text/TextParagraphUnifiedReading.jsx:114`, `:133`, `:145`, `:173` | Two separate bordered channel panels; optional active-only Meaning. | Existing layout is closest to Separated. It is neither interlinear nor an unboxed shared Full renderer. |
| `src/components/text/TextStructuredPlayer.jsx:74`, `:148`, `:173` | Card shell, channel quick play, manual-play capability filtering, search reveal, conditional auto-scroll. | Retain host callbacks, audio/status panels and Card actions; extract presentation/follow behavior. |
| `src/components/text/TextStructuredPlayer.jsx:501`–`:571` | Expansion state, active Card resolution, last-Card retention, manual expansion and 1800 ms user-navigation grace. | Expansion is distinct from Full/Part/Segment; preserve it as separate state. |
| `src/domain/text/textStructuredCardExpansionDomain.js:14`, `:28` | Pure active-Card and Follow/All/Custom expansion helpers. | Reuse compatible expansion logic. Do not use its Full cursor as an audible Sentence locator. |
| `src/components/text/TextStructuredEditor.jsx:51`, `:156`, `:309` | Existing Card/Segment authoring, Paragraph role, title editing and reordering through domain commands. | Keep command/form ownership here. This editor uses flat `block.segments` and does not author persistent Sections. |
| `src/components/text/conversation/TextConversationEditor.jsx:213`, `:297`, `:650` | D4 validation, async result validation, pending lock, detached editor state and UID-scoped session/draft lifecycle. | Retain the session and command boundary; do not rebuild it in a shared reader. |
| `src/components/text/conversation/ConversationSceneCard.jsx:255`, `:480`, `:488` | Scene shell, empty Scene, explicit Turn list and Scene audio controls. | Adapt its content surface; keep Scene actions and metadata outside layout-specific duplication. |
| `src/components/text/conversation/ConversationTurnSection.jsx:242`, `:290`, `:399`, `:407` | Persistent Turn identity, speaker/Turn controls, preserved empty Turns and Sentence traversal. | Keep editing controls; use the Turn's ID/UID as Part identity. Current bordered nesting cannot serve shared Full directly. |
| `src/components/text/conversation/ConversationSentenceItem.jsx:325`, `:399`, `:416`, `:474` | D4 Sentence operations, native play buttons, cursor/speaking states, raw EN/ID content and audio badges. | Extract/reuse the display and interaction boundary, not all editor forms as a reading atom. |
| `src/components/text/conversation/useConversationAudioPlayback.js:782` | Host-owned playback state/actions, including current/resume cursors, status, play/pause/stop. | Consume read-only. Do not create a second hook/session per visual mode or Card. |
| `src/services/persistence/textStructuredPreferenceService.js:11` | Guarded localStorage preference load/save; no canonical schema dependency. | Reuse its storage/error-handling approach, with presentation state kept outside audio preferences. |
| `src/components/table/InlineLearningCarousel.jsx:69`, `:95`, `:154` | Native scrolling, CSS snap, reduced-motion handling already used in the repository. | Reference the mechanics only. This component depends on Table expressions, memory mode and Table playback (`:3`–`:7`, `:45`); do not import that contract into Text or edit Table files. |

**Direct reuse:** hydrated identity/order, Segment text/meaning pairing, manual Segment/Card callbacks, transport controls, Paragraph role handling, existing audio/status components and pure expansion helpers. **Extraction required:** the Segment interaction/highlight atom, viewport following, view-only selection/preferences and common Card content layouts. The two existing editors should remain command hosts.

## B. Contract-to-implementation gap matrix

These are integration gaps against the new contract, not claims that every existing behavior is a defect.

| Frozen requirement | Verified current implementation | Gap / required boundary |
| --- | --- | --- |
| One Card framework across Paragraph/Conversation/Mixed | `src/components/text/TextStructuredPlayer.jsx:252`, `:278` branches by Card type; D4 uses its own Scene tree (`src/components/text/conversation/TextConversationEditor.jsx:621`). | Shared content shell and projection needed; do not replace authoring or audio hosts. |
| Full has no nested Section/Turn/Sentence boxes | Paragraph has two channel panels (`src/components/text/TextParagraphUnifiedReading.jsx:145`, `:173`); D4 nests Turn and Sentence boxes (`src/components/text/conversation/ConversationTurnSection.jsx:291`; `src/components/text/conversation/ConversationSentenceItem.jsx:408`). | New Full content layout needs semantic groups/spacing and inline interactions without these nested boxes. |
| Full retains Segment interaction independent of audio | `src/components/text/TextStructuredPlayer.jsx:255` passes `splitMode = !isFullRepresentation`; Full suppresses active Segment (`:257`). `SentenceFlow` adds keyboard/click behavior only in Split (`src/components/text/TextParagraphUnifiedReading.jsx:76`). | Decouple interaction capability from audio representation. A manual Sentence request can still call the existing Split manual-play operation. |
| Combined/interlinear default | Existing Paragraph renders complete Text then complete Meaning panels. D4 pairs EN/ID within each Sentence but uses boxed authoring rows (`src/components/text/conversation/ConversationSentenceItem.jsx:474`). | A shared interlinear layout is missing. Pair by the same Segment record, not by separately filtered positions. |
| Four frozen EN/ID choices | Existing values include `text-active-meaning`, not an interlinear/separated distinction (`src/domain/text/textStructuredPlaybackPreferenceDomain.js:3`). | New presentation layout vocabulary; preserve old preferences without silently reinterpreting them. |
| Part = persistent Section or Turn | D4 already exposes persistent Turns; old Paragraph UI is flat (`src/components/text/TextStructuredEditor.jsx:162`). | Read persistent Units when present. Canonical v1 can only offer a clearly marked virtual one-Section-per-Paragraph-Card compatibility view. |
| Three Part layouts | No equivalent Text Unit focus layouts were found; existing native snap is Table-specific. | Implement layouts with native scrolling and controlled view selection. Do not reuse Table slide identity. |
| Active Part follows audible Segment parent | D4 checks `playingIndex` (`src/components/text/conversation/ConversationTurnSection.jsx:414`), while Full explicitly clears it (`src/services/playback/textStructuredPlaybackSessionService.js:239`). | Read the best existing playback telemetry, resolve Segment → Unit by ID, and expose cursor precision. |
| Segment view uses shared interactions/cursor | Paragraph inline spans and D4 Sentence controls are separate implementations. | One shared content/interaction atom, with host-specific action/status adapters. |
| Empty Units and zero-Unit Cards remain real states | Hydration and D4 preserve them (`src/domain/text/textLibraryDomain.js:632`; `src/components/text/conversation/ConversationSceneCard.jsx:480`; `src/components/text/conversation/ConversationTurnSection.jsx:399`). | Never construct the view from an audible-only list or synthesize placeholder entities. |
| Mixed Workspace combines both Card systems | D4 `scenes` filters Paragraph Cards (`src/domain/text/textConversationEditorDomain.js:72`). | Base the Workspace reader on the full hydrated `tree.blocks`; use D4 scenes only for Conversation authoring. |
| Same-Card mixed Units | Prohibited by `src/domain/text/textContentUnitDomain.js:397`. | Unsupported, separately reported; no schema extension proposed. |
| Presentation preferences without DB changes | Existing normalizer whitelists known fields (`src/domain/text/textStructuredPlaybackPreferenceDomain.js:116`). | New fields passed through it disappear. Use a separate presentation preference record. |
| View changes do not affect sound | D5 cancels when snapshot/config/bindings change (`src/components/text/conversation/useConversationAudioPlayback.js:248`). App audio-representation change explicitly stops playback (`src/App.jsx:1643`). | Presentation changes must not call audio-setting handlers, recreate the audio preferences object or remount the session. |
| Complete visible content, including empty/Meaning-only channels | Playback flattening filters on nonempty Text (`src/domain/text/textStructuredPlaybackDomain.js:54`). D5 audio entries filter each audible channel (`src/domain/text/textConversationAudioDomain.js:38`). | Neither list is the presentation graph. Preserve all structural records, independently of playability. |
| Exact Sentence highlight while cached Full plays | Cached D5 Full step has `segmentId: null` (`src/domain/text/textConversationAudioDomain.js:88`); runtime service returns only terminal status (`src/services/playback/textStructuredAudioRuntimeService.js:31`). | No authoritative intra-file Sentence progress exists. Card-only playing state is truthful; timed Sentence/Part following cannot be promised without separately authorized audio work. |

## C. Proposed component boundaries and public interfaces

### Minimal read-only projection — proposed

Use `resolveTextLibraryDocumentTree` as the source, not `resolveStructuredTextPlaybackList`, the v1 Conversation virtual adapter or the audio composition text. Build only narrow display records and lookup indexes. Do not duplicate command logic or materialize another store.

```ts
// Interface sketch only; the repository remains JavaScript.
CardView = {
  id, uid, documentId, order, blockType, title, paragraphRole,
  units: Array<{
    viewKey, id: string | null, uid: string | null,
    identitySource: 'persistent' | 'v1-paragraph-compat',
    kind: 'paragraph' | 'turn', label: 'Section' | 'Speaker Turn', order,
    speakerId: string | null, speakerLabel: string | null,
    segments: Array<{
      id, uid, unitId: string | null, order, text, meaning, joinAfter
    }>
  }>
}
WorkspaceView = {
  workspace: { id, uid, collectionId, documentType, textLanguage, meaningLanguage },
  cards: CardView[],
  cardById, unitById, segmentById, locationBySegmentId
  // locationBySegmentId -> { cardId, unitId, unitViewKey }
}
```

Rules:

1. Persistent Units retain their existing IDs/UIDs. Resolve children from `segment.unitId`, preserving validated Unit order and Segment order. Do not group adjacent same-speaker Turns, infer boundaries from labels/punctuation, or use array index as identity. `src/domain/text/textContentUnitDomain.js:311` already enforces compatible flat/Unit order.
2. Preserve raw text/meaning and `joinAfter` in the projection. Rendering can preserve Paragraph's current trimmed/inline style versus Conversation's pre-wrapped text until the approved shared layout is applied. Do not split a multi-sentence Segment to make it look like more Sentences.
3. Keep empty Units, empty fields and zero-Unit Cards. `empty` flags/counts, if useful, are derived; they do not create Segments. Show an empty Unit unobtrusively in Full and as an empty Part in Part. A zero-Unit Card has no fabricated selected Unit; Segment view has a view-only empty state.
4. Use registry identity for Turn speaker attribution, with the validated Unit's display label. Missing speaker attribution stays unassigned. Labels can change without changing Part identity. Paragraph role `TITLE` remains a Card role, not a different Unit kind or a generated heading identity (`src/components/text/TextStructuredEditor.jsx:258`).
5. For a genuine pre-v2 Paragraph Card only, reuse the deterministic virtual Paragraph key (`src/domain/text/textContentUnitAdapterDomain.js:66`, `:358`) as `viewKey`; expose `id/uid = null`, not a fabricated persisted Unit. Never set `segment.unitId`, run backfill, allocate counters or save the projection. V1 has no recoverable authored multi-Section grouping.
6. Reject corrupt/partial v2 input through the existing validation/migration inspection; do not disguise it as v1 compatibility. Legacy remains on the existing Legacy surface. Persistent identity requirements are unchanged.
7. Scope React/view keys and transient selections to Workspace ID **and UID**, then Card/Unit/Segment identity. Reorder moves existing keys; deletion invalidates only the removed selection. Do not key the playback/command host by presentation level. D4's existing UID-scoped session is the pattern to preserve (`src/components/text/conversation/TextConversationEditor.jsx:650`).
8. Keep audio readiness/render descriptors out of this projection's authority. Pass existing host-produced status through slots/props. Do not clone an entire audio library for every view render, normalize RFs or deduplicate visible Segments by audio identity.

### Small shared boundary — proposed

| Proposed boundary | Public inputs / outputs | Explicitly excluded |
| --- | --- | --- |
| `SharedCardPresentation` | `card`, `presentation`, `selection`, `playbackCursor`, `focusRequest`, playability/disabled inputs; existing `onPlaySegment(id)`, `onStartFromSegment(id)`, `onPlayCard(id, options)` callbacks; header/actions/status slots. | No snapshot writes, audio hook creation, generation, ZIP/Staging/GC or command dispatch on view changes. |
| `SegmentContent` | One Segment, channel or paired-channel layout, active/speaking/search flags, permitted manual activation, labels and status/action slots. | No independent EN/ID arrays, duplicated authoring forms or derived stored identities. |
| `useCardPresentationState` | Controlled `{level, bilingualLayout, partLayout}` plus transient selected Card/Unit/Segment keys; validated selection callbacks. | No audio preference setters; browsing a Part never implies Play. |
| `useCardPresentationFollow` | Container/element refs, view selection, read-only cursor, explicit search request and user-navigation timestamps. | No parallel competing scroll effects, no keyboard focus theft on each audio step. |
| Read-only playback-cursor adapter | Existing host state → the normalized cursor described in E. | No new playback store, engine or guessed progress timer. |

The three layouts can remain small render branches inside the same Card boundary; separate exported layout components are optional, not a prerequisite. Reuse the same Segment atom and callbacks in every branch. Keep D4 forms, validation and pending lock in their existing host; use slots or sibling panels rather than copying them into each visual layout. An audio/status slot may retain the current P9 coverage badges or D5 exact-RF/failure badges; a generic renderer must not recalculate “Ready.”

`presentation` is view-only:

```js
{
  level: 'full' | 'part' | 'segment',
  bilingualLayout: 'interlinear' | 'separated' | 'text-only' | 'meaning-only',
  partLayout: 'horizontal-focus' | 'vertical-focus' | 'vertical-list'
}
```

Do not overload existing `displayMode`, `splitMode`, `playbackRepresentationMode` or Card expansion values with these meanings. Preserve distinct labels for **Browse previous/next Part** and existing **audio previous/next**. The latter retains its current Split-Sentence/Full-Card contract (`src/domain/text/textStructuredPlaybackDomain.js:131`).

## D. Paragraph-to-Conversation adaptation strategy

**Proposed Paragraph first:** extract `SentenceFlow` interactions and the existing Card reveal/follow logic behind a compatibility wrapper, proving current behavior before changing layout. Keep `TextStructuredPlayer` as the owner of existing manual callbacks, audio panels and expansion state. The canonical v1 reader can consume a nonpersistent one-Section compatibility view; exercise genuine multiple Sections only with complete v2 QA snapshots. Do not make `TextStructuredEditor` author Sections as part of presentation work.

Preserve the Paragraph interaction details exactly:

- Both EN and ID Sentence targets call the existing **Segment ID** callback (`src/components/text/TextParagraphUnifiedReading.jsx:83`). The clicked visual channel is not currently an implicit audio-channel override. Preserve Manual Segment channel/repeat settings; App's manual callback explicitly starts Split without changing the saved global representation (`src/App.jsx:4187`–`:4204`).
- Card EN/ID heading buttons are explicit one-session channel overrides (`src/components/text/TextStructuredPlayer.jsx:266`; `src/App.jsx:4207`). Keep these distinct from passive layout changes and from clicking a Sentence.
- Preserve speaking colors, active underline/line wrapping, focus ring, disabled behavior and stable logical numbering across both channels (`src/components/text/TextParagraphUnifiedReading.jsx:56`–`:103`). Preserve Card/search state and role labels.
- Preserve keyboard Enter/Space and native button behavior, selection/copy, Text/Meaning whitespace and existing available Manual Play targets. Do not wrap child controls in a second clickable button. Off-screen/preview Parts must not contain invisibly clipped tabbable controls.
- Preserve explicit search reveal versus passive playback follow: current reveal centers and expands the Card; normal follow scrolls only outside the safe viewport and yields after user navigation (`src/components/text/TextStructuredPlayer.jsx:43`, `:148`, `:563`, `:571`).

**Proposed Conversation second:** adapt D4's detached Scene/Turn/Sentence state or the complete hydrated tree into the same `CardView`; avoid a second representation-specific domain. The existing D4 host owns all 20 command contracts, failed drafts, pending lock and async result checks (`src/components/text/conversation/TextConversationEditor.jsx:297`). Shared Full replaces only the reading content geometry, while editing controls/panels remain attached to their existing identities. Part maps directly to a Turn, even for two adjacent Alice Turns or an empty Alice Turn. Segment content uses the same shared interaction/highlight atom.

**Mixed:** assemble the Workspace from the complete ordered Card list, dispatching Card-level Paragraph/Conversation adaptation by `blockType`. Do not concatenate `state.scenes` and Paragraphs afterward, which would lose interleaving. Keep card order authoritative and preserve Paragraph Cards during Conversation commands (`src/domain/text/textConversationEditorDomain.js:82`). No same-Card Section/Turn mixture is proposed.

## E. State, preferences and audio-cursor synchronization

### Verified cursor limits

- Split uses `playingIndex` for the actual Segment and tracks `currentIndex`/cursor (`src/services/playback/textStructuredPlaybackSessionService.js:323`–`:340`).
- Full's outer executor anchors `currentIndex` to the Card's first scoped Segment and clears `playingIndex`, including when it executes multiple per-Sentence fallback steps (`:239`–`:253`). The first scoped Segment is not proof that its Unit is currently speaking.
- D5 per-Sentence runtime/TTS status carries document, Unit/Segment and channel information (`src/components/text/conversation/useConversationAudioPlayback.js:363`, `:492`). That is a better live source for D5 Full fallback than the Card anchor. The recovery callback separately updates `resumeCursorSegmentId` (`:612`). A resume cursor identifies where to resume, not universally what is currently audible.
- Cached composed Full publishes no active Sentence (`src/domain/text/textConversationAudioDomain.js:88`). Existing runtime APIs do not expose authoritative per-Sentence timing. This is an existing D5 limitation, also recorded in `P12D_D5_Final_Acceptance_Report.md`, not permission to alter audio in A0.

### Proposed read-only cursor

```ts
PlaybackPresentationCursor = {
  workspaceId, workspaceUid, sessionId,
  state: 'idle' | 'playing' | 'paused',
  cardId: string | null,
  segmentId: string | null,
  unitId: string | null,
  channel: 'text' | 'meaning' | null,
  precision: 'none' | 'card' | 'segment'
}
// Separate view state: selectedUnitKey, selectedSegmentId, searchFocus, resumeCursor.
```

| Host evidence | Proposed presentation state |
| --- | --- |
| Valid active Split Segment in the current Workspace/session | Resolve `segmentId → segment.unitId → Card`; expose Segment precision and channel. |
| Valid active D5 per-Sentence Full fallback status | Resolve the status Segment through the current graph; retain Segment precision even though `playingIndex` is null. |
| Active cached Full or old single-utterance Full with no Segment telemetry | Card precision; `segmentId/unitId = null`. Keep a manually selected Part visible, with a Card/channel playing indicator. Never pretend the first Turn is audible. |
| Paused session | Retain its known position/channel and show paused state; no advancement. |
| Stop, stale session, foreign Workspace, deleted ID or reset UID | Clear audible highlights; reconcile view selection against the current graph. Preserve only the host's valid resume/search state separately. |

Validate both the current Workspace and current session/context before accepting playback status. Resolve Unit/Card from the current graph instead of trusting stale IDs in telemetry. The existing `audioPlayback` object already reaches Scene/Turn components; use that bridge. `onAudioStateReport` currently exposes a narrower subset (`src/components/text/conversation/TextConversationEditor.jsx:263`); if an external shared reader needs more fields, forward existing read-only values rather than adding another audio hook.

Whenever an audible Segment is known, **active Unit is its persistent parent**, independent of visible channel, view level, speaker name or the browsed Part. The selected/browsed Part may temporarily differ during manual exploration; passive highlights still update, while auto-scroll yields to the user. Empty Units cannot become audible without a Segment but remain browsable. Hiding EN does not change an EN playback session, and vice versa.

One follow coordinator should choose the destination for the current layout: Segment/channel target in Full, parent Unit in Part, Sentence target in Segment. Use channel-qualified refs in Separated mode; the existing generic Segment query can otherwise find the EN duplicate first. Preserve existing 1800 ms pointer/touch/wheel grace, add keyboard/focus protection, and honor explicit search requests. Scope scroll operations to the intended viewport, use cancellation/cleanup and reduced-motion behavior. Audio-follow must not call `.focus()` on every step or restart audio after a user scroll.

### Display preference storage — proposed

Use a small, separately normalized localStorage record, e.g. **`prolingo_text_card_presentation_v1`**, for device-level presentation choices only. Keep transient selected IDs/scroll positions in React state scoped by Workspace ID/UID. Per-Card persistence is unnecessary for the minimum contract. Storage denial or corrupt values should return safe defaults with the same guarded behavior as `src/services/persistence/textStructuredPreferenceService.js:13`–`:30`; do not repair/save content entities.

The separation is necessary because the existing audio preference normalizer drops unknown fields (`src/domain/text/textStructuredPlaybackPreferenceDomain.js:123`), and D5 compares the preferences-containing audio configuration by reference before cancelling a session (`src/components/text/conversation/useConversationAudioPlayback.js:210`, `:248`). Do not add display state to `audioConfig.preferences`, derive audio configuration from the new view record, persist through `document.update`, or change `snapshot` just to store the layout. A presentation preference change must produce **zero audio-setting calls and zero session resets**.

Do not redefine the existing broad audio/Display reset action (`src/components/text/TextStructuredPlaybackControls.jsx:384`) to clear new presentation preferences implicitly. Specify a view-only reset separately during implementation; the existing audio reset semantics remain intact.

## F. EN/ID display mode strategy

All layouts read `text` and `meaning` from the **same Segment ID**. EN/ID are UI labels for current `text`/`meaning` channels; retain Workspace language metadata. Never zip independently filtered translations, match duplicate strings, use speaker labels for alignment, parse joined Full text, or allocate “translated Segments.”

| Mode | Proposed rendering | Identity / interaction rule |
| --- | --- | --- |
| Combined / Interlinear — default | Within each Unit, render each Segment's EN with its smaller ID immediately below. Unit boundaries use typography/spacing and a Turn speaker label. | Pair within that record even when either field is blank. Keep Segment targets keyboard accessible without nested visual Sentence boxes in Full. |
| Separated | Complete EN Unit/Segment flow, then complete ID Unit/Segment flow. | Both flows use the same ordered records; use channel-qualified DOM keys/refs. Skipping an empty channel's text never shifts the remaining matches. |
| EN Only | Render Text content and the same structural boundaries. | Do not change playback channel, TTS selection or readiness. |
| ID Only | Render Meaning content and the same structural boundaries. | Blank Meaning stays blank/explicitly unavailable; never substitute another Segment's Meaning. |

Use the same Segment atom for all three levels. Full changes containment, Part changes Unit focus, and Segment changes Sentence focus; none changes the model or playback plan. Preserve `joinAfter` as a read-only formatting input without using audio concatenation as the presentation source: `src/domain/text/textStructuredSplitFullDomain.js:55` is an audio-derived flow, not an interaction graph.

**Compatibility decision before cutover:** the current Paragraph default is `text-meaning` (`src/domain/text/textStructuredPlaybackPreferenceDomain.js:57`) and produces Separated bordered panels, while the frozen new default is Combined without nested boxes. Pixel-identical geometry and the new Full geometry cannot both be the cutover result. First prove extraction parity, then treat the specified layout change as intentional and test typography/colors/interactions separately. Initialize the new shared preference record to Combined; do not rewrite the saved old audio/display record or claim that its old token already means interlinear. The existing `text-active-meaning` behavior is outside the frozen four choices; retain its old setting for the compatibility surface until an explicit new layout is chosen, rather than silently adding a fifth shared mode or deleting user preferences.

## G. Minimal implementation increments and acceptance tests

These are proposed bounded implementation steps, not work performed in A0.

| Increment | Minimal scope | Acceptance required before progressing |
| --- | --- | --- |
| 1. Projection and Paragraph interaction extraction | Narrow pure projection, read-only cursor adapter, shared Segment atom; old Paragraph wrapper retains its current layout. | Frozen-input purity, ID/UID/counter equality; v1 compatibility keys are never persisted; v2 multiple Sections, same-speaker distinct Turns, duplicate text, empty Units and zero-Unit Cards; corrupt FK/partial v2/Legacy rejection. Browser parity for click/Enter/Space, disabled targets, manual channel/repeat behavior, EN/ID quick play, underline/color/line wrap, search, selection/copy and auto-scroll grace. |
| 2. Paragraph shared layouts/preferences | Full four layouts, then Part Vertical List, Horizontal Focus, Vertical Focus and Segment focus; one presentation store and one follow owner. | Default Combined; correct non-positional bilingual pairing, missing/long/multiline content, TITLE role, one persistent Segment rendered in both Separated flows. Test every display level/layout against audio Split and Full, both channels and active/paused/stopped states. Switching views changes neither audio callbacks/config references nor session identity. No nested Part/Sentence boxes in Full. |
| 3. Conversation adapter, isolated only | Mount shared content under the existing D4 host, retaining forms/command locking and D5 playback. | Multiple Sentences in one Turn, Alice→Alice→Bob with distinct Unit IDs, speaker rename/reassignment, reorder/move/split/merge/delete and empty-state retention. Failed edits keep drafts; mode changes do not remount the command/audio host. Split and Full fallback follow the correct Unit from Segment telemetry; cached Full reports Card precision. Run D4-A/D4-C and the accepted D5 Core/UI/browser recovery suites without changing their audio contracts. |
| 4. Mixed Workspace integration and acceptance | Assemble both Card adapters from the same hydrated ordered tree; keep Legacy outside. | Interleaved Paragraph/Conversation order, foreign Workspace/status rejection, UID reset, source attachment/import remapping and restored metadata; no same-Card mixed Unit creation. Run Paragraph/P9/P12/D3 compatibility plus scoped ESLint/build and actual browser acceptance. Confirm production QA gating and unchanged canonical DB/schema/store set. |

Browser layout acceptance must include touch/native swipe, mouse/trackpad, keyboard navigation, 200% zoom, long Turns taller than the viewport, resize, reduced motion and mobile safe areas. Browsing Parts never plays them automatically; playback-driven follow never changes authored ordering. Do not hide inaccessible overflow behind fixed-height previews.

For compatibility regression use the existing accepted suites, not just historic source regexes: `scripts/audit-v603-round-d3-paragraph-acceptance.mjs`, `audit-v603-p9b-playback-marathon.mjs`, `audit-v603-p12c-conversation-playback.mjs`, D4-C and D5 Core/UI/browser suites. Keep historical audit expectations unchanged in this architecture work.

### Carousel/animation decision — proposed, based on inspected dependencies

| Option | Fit | Decision |
| --- | --- | --- |
| Native vertical scrolling | Full, Vertical List, long content and graceful fallback. | Use directly; no animation subsystem. |
| Native scrolling + CSS scroll-snap | Horizontal Focus; optional gentle alignment for Vertical Focus. Existing Table implementations demonstrate the pattern (`src/components/table/InlineLearningCarousel.jsx:154`; `src/components/table/AdvancedExpressionPanel.jsx:241`). | Preferred. Maintain stable Unit keys and small view-only scroll/ref logic. Avoid forced vertical snapping that makes long content hard to read. |
| React state + CSS sizing/emphasis | Active vertical Part larger, previous/next smaller; respect reduced motion. | Sufficient for the requested focus emphasis. Preserve DOM order and readable access; no cloned infinite slides. |
| Additional carousel/animation library | None is present in `package.json:15`–`:36`; no required looping, drag physics or transition choreography has been demonstrated. | Do not add one. Reconsider only if native browser acceptance demonstrates a specific unresolved requirement. |

Native snap alignment and oversized-content behavior are defined by the [W3C CSS Scroll Snap specification](https://www.w3.org/TR/css-scroll-snap-1/#snap-overflow). It also cautions against mandatory snapping that leaves intervening content unreachable. This supports testing long Turns and using ordinary/proximity scrolling where appropriate; it is not a claim of cross-device acceptance. The [W3C APG carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) supports explicit previous/next controls and protecting users from automatic slide changes while interacting. Treat playback-follow scrolling as view behavior with a user override; do not introduce an auto-rotating timer or pause audio merely to satisfy a carousel pattern.

## H. Risks, blockers and compatibility requirements

| Risk / blocker | Assessment and required handling |
| --- | --- |
| Cached Full has no authoritative intra-file Sentence position | **Blocks a universal promise of audible Sentence/Part tracking.** Expose Card precision; do not infer progress from first Segment, labels, approximate timers or Word count. Accurate timed tracking would require separately approved audio evidence and is outside this implementation scope. |
| Canonical v1 cannot hold authored multi-Section/Turn grouping | **Blocks production persistent-Unit activation**, not pure presentation or isolated QA. Preserve the v1 Paragraph compatibility label; no implicit migration/repair. |
| Same-Card mixed Units | **Unsupported data contract.** Mixed means mixed Card types in a Workspace. Report a future schema/domain requirement separately if requested; implement no workaround. |
| Audio-coupled `splitMode` and Full highlight suppression | Directly reusing the old Paragraph wrapper unchanged would violate the new display independence. Extract the interaction contract while leaving audio operations intact. |
| Wrong source list | Audio lists drop structural empties/channel blanks; Conversation scenes omit Mixed Paragraph Cards; virtual Conversation projection splits a multi-Sentence Turn. Use the validated hydrated graph for all view levels. |
| Mode changes remount editor/audio state | Keep the UID-scoped command/playback host stable. Do not include view level in its key, synthesize snapshots or change audio preference references. Preserve D4 pending/draft behavior. |
| Two viewport-follow effects compete | Extract/disable the old content-follow effect when the shared follow coordinator takes over, within one controlled integration step. Keep search reveal and keyboard focus distinct from audible following. |
| Existing Paragraph visuals versus the new Full contract | Preserve interaction/colors/underlines/line wrapping and prove compatibility extraction first. Document intentional container/interlinear changes; do not claim pixel parity across different required layouts. |
| Pref migration/reset ambiguity | New presentation defaults are Combined; preserve old saved audio/display settings and define view-only reset. Do not silently expand the frozen four layouts to include active-only Meaning. |
| UI readiness mistaken for physical audio availability | Reuse current status adapters, including runtime failures. No changes to AudioVariant/RF/Full/Staging/ZIP/GC contracts or provider defaults. |
| Legacy or Track B leakage | Route neither through the new persistent-Unit presentation authority. No changes to Legacy model, Table contracts or AI Voice. |

### Evidence executed in A0

Read-only, in-memory probes against the existing D4 fixture, with IndexedDB access guarded:

| Probe | Observed result |
| --- | --- |
| Persistent first Alice Turn, empty Turn, empty Scene | 2 child Segments; 1 preserved empty Turn; 0 Units in empty Scene. |
| V1 virtual Conversation projection of the same hydrated data | First virtual Turn contains 1 Segment, demonstrating that it cannot preserve authored multi-Sentence grouping/empty Turn identity. Source: `src/domain/text/textContentUnitAdapterDomain.js:393`, `:431`, `:494`. |
| Mixed hydrated tree versus D4 editor projection | 2 ordered Cards in the tree; only 1 Conversation scene in D4; both Card IDs retained in `cardOrderIds`. |
| Paragraph-kind Unit placed in Conversation Card | Rejected by existing validation. |
| New presentation fields through existing preference normalizer | Fields dropped; unknown `displayMode: 'combined'` becomes existing `text-meaning`. |
| Blank Text with nonempty Meaning passed to playback flattening | Row absent from playback list, confirming that it cannot be the complete presentation projection. |
| V1 snapshot passed to D4 selector | `MIGRATION_REQUIRED`; no migration performed. |
| Frozen input and side effects | Snapshot JSON unchanged; 0 IndexedDB calls. |

Executed existing checks:

- `node scripts/audit-v603-p12d-d5-conversation-audio.mjs`: **15 PASS / 0 FAIL**.
- `node scripts/audit-v603-p12d-d4a-conversation-editor.mjs`: **22 PASS / 0 FAIL**.
- `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs`: **7 PASS / 0 FAIL**.
- `node scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs`: **9 checks pass**, then its source assertion at `:82` expects `setPlayingIndex(step.highlight ? ...)`; the current executor explicitly clears the Full highlight at `src/services/playback/textStructuredPlaybackSessionService.js:241`. Remaining checks did not run. This is an observed baseline source-expectation mismatch, not a new A0 regression.
- `node scripts/audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs`: exits at `:33`, expecting version `6.0.3-beta.8-p9-hf4c-r1` while the baseline is `6.0.3-beta.8-p9-hf4d`. Later checks did not run. No version, source regex or expected hash was changed to make it pass.

No A0 production code exists to lint/build. No build, browser UI test, screenshot verification, live database test, audio synthesis or physical GC was performed in this audit. The listed checks are source/domain evidence; they do not prove future focus layouts, native voice output or browser scrolling behavior.

## I. Implementation recommendation

**CONDITIONAL GO** for the four bounded increments above, starting with pure projection and Paragraph interaction extraction. The architecture is sufficient for a shared presentation framework without new stored entities, canonical schema changes or a carousel dependency.

Conditions before integration acceptance:

1. Keep view level, bilingual layout, Part orientation, browse selection, expansion and audio configuration as separate state. Demonstrate that every view change leaves the active audio session and saved audio settings untouched.
2. Use persistent Unit identity whenever available; mark v1 Paragraph compatibility honestly. Keep Conversation development isolated and preserve current D3–D5 contracts.
3. Accept explicit Card-only cursor precision when cached Full lacks Segment telemetry; otherwise the literal all-audio Sentence/Part-following requirement remains **NO-GO** under the no-audio-change boundary.
4. Validate the new default/legacy-preference transition and the intentional Full geometry change, preserving Paragraph interaction, color, underline, keyboard, focus and follow behavior.
5. Complete real-browser acceptance for the new layouts before declaring them accepted. Preserve production QA gating and all canonical DB/schema/store constants.

**NO-GO** for canonical v2 activation, same-Card mixed Unit support, inferred timed cached-Full highlighting, or changes to existing audio/provider/command/Legacy/Track B contracts within this presentation task.

A0 stops with this report. All production files and the accepted D5 checkpoint remain intact; no Git commit, merge, push or deployment was performed.
