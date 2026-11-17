# P13 Mixed Workspace — A0 contract

Baseline: `feature/p12-a6-main-text-dual-view` at `7f3769f0d042bac93a9dd3ddd2f1630ac25b7c02`. Preflight: clean, no pending Git operation. Work continues in the existing integration worktree on `feature/p13-mixed-workspace`; A6 and AI Voice refs/worktrees are preserved.

## Established structure

`Workspace → Card → Content Unit → Segment`.

A persistent v2 Mixed Workspace contains an ordered sequence of Paragraph and Conversation Cards. A Paragraph Card contains only `kind: 'paragraph'` Sections; a Conversation Card contains only `kind: 'turn'` Speaker Turns. A Card never mixes these kinds. Adjacent same-speaker Turns are distinct persistent Units, including empty Turns. Empty Sections, zero-Unit Cards and zero-Card Workspaces are retained.

Card/Unit/Segment ID and UID, speaker registry ID/UID, parent FK, authored order, raw Text/Meaning and `joinAfter` are authoritative. No grouping by speaker label, punctuation or visual position. AudioVariant, RF, Full artifact and source metadata remain bound to their original persistent IDs. No synthetic entity is persisted.

## Verified reuse and bounded additions

- `src/domain/text/textCardPresentationDomain.js:37` already projects interleaved Mixed Cards and persistent Units. `textContentUnitDomain.js:397` already rejects a Unit kind incompatible with its Card.
- A1 remains the sole visual projection. A thin Mixed selector requires complete v2 + `documentType: 'mixed'`, reuses existing validation, and rejects unresolved assigned speaker IDs. It returns the Shared presentation and a detached frozen existing Document Tree retaining nonvisual metadata/audio references. Neither is a persistence payload.
- The existing Shared Workspace reader and per-Card surfaces already select Section/Turn rendering by Card/Unit type. Only the Workspace toolbar's Mixed terminology needs neutral Section-or-Turn wording.
- `textConversationReaderDomain.js:16` already bridges D5's authoritative observer to A1 without an index fallback; its explicit actions validate projected IDs and preserve `playSentence(id)` / `playScene(cardId, options)` signatures. Reuse them.
- Despite its name, the existing D5 hook delegates through the common structured session/planner and accepts the full hydrated tree. The planner dispatches Paragraph and persistent Conversation Cards through their existing paths. No engine extension or extra per-Card host is needed for this reader pilot. A single QA parent may own the existing hook; the Mixed reader owns none.

## Public boundary

`selectTextMixedReaderState(snapshot, { documentId }) → { presentation, documentTree }`.

`SharedMixedWorkspaceReader({ snapshot, documentId, audioPlayback?, isBusy?, presentationState?, onPresentationStateChange?, focusTarget?, onFocusConsumed? })`.

The optional host must belong to the same validated snapshot/Workspace. A2 play consumers are limited to Split at 1×; an external caller must not enable unrestricted Mixed Full/rate controls before A4 acceptance. Missing host disables play. Audible cursor authority is exclusively the existing D5 observer plus matching session/status and current graph. Cached Full has Card precision; verified per-Sentence Split/Full fallback has Segment precision. Stop/stale/foreign status has none. Browsing, search and layout changes never invoke playback or mutate the snapshot.

## Isolation and later integration gates

Only a DEV-lazy QA route (`?qa=mixed-workspace`, `#qa-mixed-workspace`) may expose this pilot. Fixtures are disposable in-memory v2 snapshots. No DB or preference storage is needed. Main Text/A6 stays Paragraph-only; no real-data Mixed creation, canonical v2 write, upgrade, repair or startup migration is enabled. Canonical DB/schema constants remain 1.

No A0–A2 architecture blocker requires a redesign. A3 must coordinate authoring/order across **all** Card types; the D4 Scene editor projection alone omits Paragraph Cards. A4 must accept full Mixed audio traversal/readiness/configuration against both existing per-Card paths before production host wiring. Neither gate authorizes canonical database activation. Manual visual/device acceptance is deferred by the user; automated regression and isolation checks remain mandatory.

The A2 QA audio capability is deliberately **Split at 1×**. Browser probes confirmed existing host integration gaps for Paragraph Full fallback (no audio step executed) and non-unit Paragraph rate (1.5 requested, 1 observed). These are A4 blockers, not permission to patch the engine in A0–A2. Reading Full/Part/Segment is independent and remains supported. Cached Full/per-Sentence cursor behavior is verified using the existing Conversation path and does not activate unrestricted Mixed Full audio.
