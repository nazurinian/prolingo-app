# P12 A4-C1 Conversation integration foundation

Approved baseline and initial HEAD: `a162a7d357f7380440d97d05128d0fef5dfd29f6`; branch `feature/p12-shared-card-ui`; initial working tree clean. A0, A1, A2, A2-HF1 and A3 reports were read before implementation. Current C1 instructions exclude Mixed UI, overriding older reports' broader roadmap suggestions.

## Contract findings recorded before edits

- D4 authority is `selectTextConversationEditorState(snapshot, {documentId})` in `src/domain/text/textConversationEditorDomain.js:45`–`:99`: complete isolated v2 migration, valid graph/UIDs and a detached Scene → Turn → Sentence projection. The editor validates every successful async command outcome before publishing state (`TextConversationEditor.jsx:297`–`:350`). No presentation code may replace that lifecycle.
- A1 `selectTextCardPresentation` already maps persistent `turn` Units, speaker ID/UID/labels, empty Units and multi-Sentence children from the same validated hydrated snapshot. No Conversation-specific projection reconstruction is needed. C1 must reject Mixed as a reader Workspace rather than activate Mixed UI.
- D5's single hook is instantiated at `TextConversationEditor.jsx:252`. Existing callbacks are `playSentence(segmentId)`, `playFromSentence(segmentId)`, `playScene(blockId, options = {})`, `playWorkspace()`, `pausePlayback()`, `resumePlayback()`, `stopPlayback()`. Scene options accept existing `playbackChannelMode` and `playbackRepresentationMode`; reader channel quick-play uses the former only.
- D5 returns active state, indices and per-step status, but the **current session token and actual session mode remain private refs** (`useConversationAudioPlayback.js:101`–`:102`, `:782`). A1 requires those fields. The minimal missing bridge is an immutable read-only scope accessor over existing refs; no new event, inferred token, session, engine or timer is authorized.
- A3 shared Full/Part/Segment code already accepts Units generically, but several labels/empty states still say Section/Paragraph, and a single Turn's Full heading may be hidden. Make those labels type-aware while preserving Paragraph text/styles and using one renderer.
- Canonical constants/stores remain v1; disposable v2 helpers hard-block the canonical database (`src/constants/textDatabaseConstants.js:1`–`:18`; `textContentUnitPersistenceService.js:47`). No persistence service is required by the bridge.

The references above describe the approved baseline before editing. Findings are integration gaps, not evidence that the accepted D4/D5 engine needs replacement.

## Result and recommendation

**GO for isolated A4-H2 presentation work.** C1 supplies the minimum validated Conversation bridge to the existing shared renderer and the existing D5 host. No unresolved C1 functional blocker was found. This is **not approval for canonical v2 activation or production Conversation activation**; those remain blocked under the existing acceptance boundaries.

Verification date: 2026-11-17. Branch and HEAD remain unchanged from the approved baseline. All changes are uncommitted.

## 1. Changed files and interfaces

References below are final working-tree line numbers. Existing Paragraph presentation classes, interaction primitive, follow/selection behavior and audio configuration semantics remain intact.

| File | Change and exact interface/location |
| --- | --- |
| `src/domain/text/textConversationReaderDomain.js:6` | New `selectTextConversationReaderPresentation(snapshot, { documentId })`: D4 validation followed by the unchanged frozen A1 projection. Conversation-only reader gate; no Mixed UI. |
| `src/domain/text/textConversationReaderDomain.js:15` | New `resolveTextConversationReaderCursor({ presentation, audioPlayback })`: validates current host scope and matching status before calling the unchanged A1 adapter. |
| `src/domain/text/textConversationReaderDomain.js:29` | New `createTextConversationReaderActions({ presentation, audioPlayback, disabled })`: validates projected IDs and delegates explicit play to existing D5 actions. |
| `src/components/text/presentation/SharedConversationReader.jsx:10` | New thin read-only wrapper. Reuses `SharedParagraphWorkspaceReader` from its historical filename; no new renderer, command dispatcher or playback hook. |
| `src/components/text/conversation/TextConversationEditor.jsx:170` | Optional `renderReader` prop; invoked at `:593` with `{ snapshot, editorState, audioPlayback, isBusy }`. Default is null. The original authoring route opts into nothing. |
| `src/components/text/conversation/useConversationAudioPlayback.js:784` | Additive `readPresentationPlaybackScope()` observer over existing session refs; returned at `:804`. No executor, start/stop, planner, recovery, rate or voice logic changed. |
| `src/components/text/presentation/sharedCardPresentationUtils.js:29` | Frozen Section/Speaker Turn terminology and `getSharedUnitHeading(unit, index)` helpers. Speaker labels are display fields, never keys. |
| `src/components/text/presentation/SharedBilingualUnitsBody.jsx:70` | Full headings/empty states become type-aware; a single Conversation Turn also shows its heading (`:349`). Existing paired Segment rendering is reused. |
| `src/components/text/presentation/SharedPartAndSegmentViews.jsx:59` | Part navigation, headings and empty states use Section/Turn terminology. Segment speaker context reads the persistent parent Turn (`:677`). Same three Part views and Segment view. |
| `src/components/text/presentation/SharedParagraphCardReader.jsx:210` | Conversation Card role/labels use Scene; counts/empty previews use Speaker Turns. Paragraph output remains Section/Paragraph. Shared workspace toolbar receives type context at `:526`. |
| `src/components/text/presentation/SharedBilingualLayoutToolbar.jsx:57` | Optional `unitKind = 'paragraph'` changes only explanatory titles. Level, bilingual and Part layout operations remain presentation-only. |
| `src/components/text/presentation/TextSharedConversationReaderQaPreview.jsx:12` | New in-memory sibling preview: existing D4 editor plus reader slot, with explicit fixture reset. |
| `src/main.jsx:14` | DEV-only lazy preview, query/hash guard at `:28`, rendering at `:46`. Production `App` fallback and `src/App.jsx` are unchanged. |
| `scripts/audit-v603-p12-shared-card-a4c.mjs:1` | 11 focused Node checks using disposable snapshot fixtures. |
| `scripts/fixtures/shared-card-a4c/browser-cases.jsx:1` | 12 real-browser cases, including the real D4 editor and its sole D5 host with gated QA runtimes. |
| `scripts/audit-v603-p12-shared-card-a4c-browser.mjs:1` | Edge/CDP runner, compiled DEV/production route checks, forbidden storage probes, production artifact check, disposable browser profile. Reuses established esbuild/CDP test approach; no new dependency. |
| `P12_Shared_Card_UI_A4C_Conversation_Bridge_Report.md:1` | This audit, implementation and acceptance report. |

There are **15 changed/new files**: 11 application files, 3 test files and this report. The new preview is included in the application count. See the final diff summary below.

## 2. Authoritative D4 to shared projection path

```text
Controlled isolated v2 snapshot + selected documentId
  -> existing D4 selector validates complete migration, graph, IDs/UIDs
  -> existing ConversationEditorSession owns commands/pending/errors/audio
  -> optional renderReader slot receives that snapshot and validated editorState
  -> selectTextConversationReaderPresentation validates the D4 boundary again
  -> existing selectTextCardPresentation(snapshot, { documentId })
  -> frozen Workspace / Card / Unit / Segment projection
  -> existing SharedParagraphWorkspaceReader
  -> SharedCardReadingSurface
  -> SharedBilingualUnitsBody / SharedCardPartView / SharedCardSegmentView
```

The authoritative validators remain `src/domain/text/textConversationEditorDomain.js:45` and `:91`; A1 hydration/projection remains `src/domain/text/textCardPresentationDomain.js:37`. Neither domain was edited. The new wrapper accepts the snapshot, not an arbitrary partially hydrated tree that cannot prove migration completion. Corrupt, incomplete and v1 inputs are rejected, never repaired or migrated. Mixed remains supported by the underlying A1 projection only; the new Conversation reader rejects it explicitly with `UNSUPPORTED_WORKSPACE`.

The slot at `TextConversationEditor.jsx:593` is below the existing transport and above the original speaker/authoring panels. It has no command callback or persistence ownership. D4 still verifies async command responses and preserves failed drafts. Pending commands disable reader play targets. Existing Scene/Turn/Sentence forms, speaker controls, split/merge/move/reorder handlers and audio panel files are untouched.

## 3. Speaker / Turn identity

- Scene is the existing Conversation Card: `card.id`, `card.uid`, `card.order`.
- Speaker Turn is the existing persistent `kind: 'turn'` Content Unit: `unit.id`, `unit.uid`, `unit.viewKey = unit:<uid>`, `unit.order`.
- Sentence is the existing Segment: `segment.id`, `segment.uid`, `segment.unitId`, `segment.order`, `text`, `meaning`, `joinAfter`.
- Speaker is the existing registry identity/assignment: `unit.speakerId`, `unit.speakerUid`, `unit.speakerLabel`. Labels may change; IDs/UIDs and Turn boundaries do not depend on them.
- The current parent of an audible Sentence comes from A1 `locationBySegmentId`, not from a speaker name, visual position or untrusted status `unitId`.
- Adjacent Alice Turns remain separate Units, including an intentionally empty Alice Turn. Multiple Sentences remain under their actual Turn. Zero-Unit Scenes remain visible and non-playable.
- EN and ID use the same Segment record. Duplicate text does not merge identity; blank meanings remain blank. Existing renderer trimming is display-only; the frozen projection preserves exact raw strings and `joinAfter`.

Speaker rename, reassignment, Turn reorder, Sentence reorder/move, both kinds of split/merge, and deletion were exercised through existing D4 commands. Read-only projection never rewrites source metadata, counters, Segment identities or audio records.

## 4. D5 cursor and callback bridge

The editor still instantiates **one** `useConversationAudioPlayback` at `src/components/text/conversation/TextConversationEditor.jsx:253`. The reader imports no audio hook and starts no session of its own.

The new host observer returns frozen scalar evidence:

```js
audioPlayback.readPresentationPlaybackScope() // existing ref values only
// {
//   current, workspaceId, workspaceUid, sessionId, playingContext,
//   isPlaying, isPaused, playbackRepresentationMode
// }
```

`current` requires the actual context/token to match and the host's snapshot, Workspace identity, audio bindings and normalized audio configuration to remain current. This also rejects the render before D5's existing cancellation effect has processed a changed snapshot/configuration. Old closures cannot authorize an old status after a switch/reset. Session creation and invalidation still belong entirely to the existing D5 lifecycle; see existing context construction in `src/services/playback/textStructuredPlaybackSessionService.js:167` and `:290`.

The bridge additionally requires `playbackSourceStatus.sessionId` to equal the current token and `documentId` to equal the projected Workspace. The unchanged A1 adapter also validates optional Workspace UID and current graph membership. C1 supplies **no index fallback**: `playingIndex`, `currentIndex`, resume cursor and browse anchors cannot nominate an audible Sentence. Missing observer/status, foreign scope, stop or stale token yields `precision: 'none'`. Paused verified evidence stays paused, with traversal controlled by D5.

The resulting public cursor is unchanged from A1:

```js
{ workspaceId, workspaceUid, sessionId, state,
  cardId, unitId, segmentId, channel, precision } // none | card | segment
```

| Actual host evidence | Reader result |
| --- | --- |
| Current per-Sentence Split local/TTS status | Segment precision; parent Turn resolved from current projection |
| Current Full per-Sentence plan or failed-Cached-Full recovery status | Segment precision for the Sentence D5 actually started |
| Cached Full (`full-local`) without offsets | Card precision, null Segment/Turn; no guessed timing or active Turn |
| Unavailable audio or unmatched scope/status | No audible Segment/Turn highlight |
| Manual browsing/search/selection | Existing A3 browse/focus state only; never an audio action |

Exact play signatures:

```js
onPlaySegment(segmentId)                 // -> audioPlayback.playSentence(segmentId)
onPlayCard(cardId)                       // -> audioPlayback.playScene(cardId)
onPlayCard(cardId, {
  playbackChannelMode: 'text-only'       // or 'meaning-only'
})                                      // -> playScene(cardId, same channel option)
```

Only current projected IDs are forwarded; busy/unknown IDs do nothing. Arbitrary representation/options are not forwarded. **Clicking EN or ID Sentence text forwards only its Segment ID** and follows D5's current manual/session channel semantics. It does not invent a `playSentence(id, channel)` overload. Scene EN/ID quick-play uses D5's existing one-time channel override and does not alter preferences. Existing pause/resume/stop, `playFromSentence(segmentId)` and workspace controls remain available in the unchanged authoring transport; the shared reader does not duplicate them.

Changing Full/Part/Segment, Part layout or bilingual layout changes local reader view state. It does not remount the editor/audio host, change a playback representation or provider, stop/start playback or modify a snapshot. Browser evidence checks the same session token, runtime invocation count and synth cancellation count through these changes.

## 5. QA preview and Hydrogen integration contract

Run `npm run dev`; open `?qa=shared-conversation-reader` or `#qa-shared-conversation-reader`. The fixture is constructed in memory by the existing D4 fixture factory. No persistence service is imported. The original `?qa=conversation-editor` preview remains unchanged. Reset replaces only the disposable fixture and remounts its editor so D5's existing cleanup cancels the old session.

The preview is guarded by `import.meta.env.DEV` both at lazy import and route resolution. Query and hash paths were tested in compiled DEV and production modes. Production artifacts contain no new QA preview marker/chunk. No change was made to `src/App.jsx` or production activation policy.

Hydrogen can use the existing slot without changing D4 ownership:

```jsx
const renderReader = ({ snapshot, editorState, audioPlayback, isBusy }) => (
  <SharedConversationReader
    snapshot={snapshot}
    documentId={editorState.workspace.id}
    audioPlayback={audioPlayback}
    isBusy={isBusy}
    // Optional controlled view/focus props:
    // presentationState={viewState}
    // onPresentationStateChange={setViewState}
    // focusTarget={focusTarget} onFocusConsumed={onFocusConsumed}
  />
);
<TextConversationEditor {...existingProps} renderReader={renderReader} />
```

The view contract remains `{ level, bilingualLayout, partLayout }` with existing A1 enums/defaults. It is not audio configuration. The adapter's underlying frozen projection/indexes and cursor/actions can also be consumed directly by the approved shared surfaces. The historical `SharedParagraphWorkspaceReader` name/data attribute does not mean a separate Conversation renderer is required.

For isolated interaction QA, `scripts/fixtures/shared-card-a4c/browser-cases.jsx:1` uses existing D4/D5 factories and the real editor with a single D5 host. Audio callbacks are gated in-memory promises; the original D5 suite separately exercises real corrupt HTMLAudio recovery. The new preview has no physical bindings by default; any explicit playback uses the existing D5 fallback path. It generates, deletes and persists no audio.

## 6. Actual verification

Node v24.11.1; headless Microsoft Edge 157.0.0.0; Vite 7.2.6. Browser suites were run serially with separate disposable profiles. Log files are in the local scratch directory `C:\Users\HikamSeif\AppData\Local\Temp\prolingo-a4c-evidence-e010f419d7e24305a2e863096a0e9929` (not committed).

Commands use `node scripts/audit-v603-<suffix>.mjs` unless stated otherwise.

| Suite suffix | Actual result |
| --- | --- |
| `p12-shared-card-a4c` | **11/11 PASS**: frozen exact identity/pairing; adjacent same-speaker/multi-Sentence/empty states; rename/reassign; D4 structural operations; corruption/partial/v1/Mixed gates; cursor precision/stale scopes; callback contracts; canonical v1. |
| `p12-shared-card-a4c-browser --check-production` | **12/12 PASS + 4/4 route gates**; zero IndexedDB and storage calls; final production QA exclusion PASS. |
| `p12-shared-card-a1` / `p12-shared-card-a1-browser` | **13/13 / 7/7 PASS**. Existing Paragraph click/Enter/Space, highlight/underline, focus, selection/copy and callback checks preserved. |
| `p12-shared-card-a2` / `p12-shared-card-a2-browser` | **10/10 / 8/8 + 4 gates PASS**, including HF1 exact-ready categories and conservative missing-cursor behavior. |
| `p12-shared-card-a3` / `p12-shared-card-a3-browser` | **7/7 / 8/8 + 4 gates PASS**: all Part styles, Segment focus, browse/audio separation and Paragraph/v1 behavior. |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | **22/22 / 9/9 PASS**. |
| `p12d-d4c-browser` | **13/13 + 4 gates PASS**; all **20/20 supported commands** covered, async response validation and failed-draft/lock tests preserved. |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | **15/15 / 5/5 PASS**. |
| `p12d-d5-browser` / `p12d-d5-ui-browser` | **3/3 / 15/15 PASS**, including real corrupt Cached Full HTMLAudio recovery with multiple voices/rates and cancellation. |
| `p12d-d3d-regression` / `p12d-d3d-browser` | **12/12 / 9/9 PASS**. Browser persistence tests used only separately named `prolingo_text_library_d3b_qa_d3d_*` databases in a disposable profile. |
| `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` / `p12d-virtual-content-units` | **5/5 / 11/11 / 12/12 PASS**. |
| `p12c-conversation-playback` / `p12b-speaker-registry` | **13/13 / 14/14 PASS**. |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | **PASS / 30 checks PASS / 19 checks PASS**. |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | **7/7 / 20/20 PASS**. |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | **24/24 / 17/17 PASS**. |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` | **18 / 7 / 21 checks PASS**, using fixture/planning services only. |
| `p10-h5-export-zip-remediation` | **11/11 PASS**; rollback-error logs are deliberate failure-injection evidence. |
| Scoped ESLint: all 11 changed/new application JS/JSX files plus the new browser fixture | **0 errors, 0 warnings**. The two new `.mjs` runners also pass `node --check`. |
| Existing `TextStructuredPlayer.jsx` lint comparison against `git show HEAD:...` | **17 errors / 3 warnings before and after**, unchanged, outside this patch. D4 editor and D5 hook: **0/0 before and after**. |
| `npm run build` | **PASS**, 1906 modules; final `index-CBGFmDEo.js`, 1683.28 kB (445.41 kB gzip). Existing stale browser-data / large-chunk advisories remain. |
| `git diff --check` and protected-source comparison | **PASS**. Canonical constants, A1 domains, D4 commands, services, original authoring panels/QA preview, existing Paragraph reader and player, and `src/App.jsx` have no diff. |

The new browser cases specifically cover collapsed Paragraph/Conversation zero-Unit labels; all bilingual layouts with duplicates/blank meanings; current Turn identity; silent manual browsing; unchanged session during every layout; rename/reassign/reorder/move/split/merge/delete; absent/foreign/stale observer; cached Full Card precision and paused per-Sentence recovery; exact Sentence/Scene callback signatures; failed-draft retry; snapshot, Workspace, configuration and reset cancellation.

During implementation, one new test initially inspected the injected local-runtime arguments for a channel field that belongs to `playbackSourceStatus`; the test was corrected to inspect authoritative host telemetry. A source diff review also caught a quoted interpolation in the collapsed empty-state text; it was corrected and a real-browser Paragraph/Conversation regression added. Neither change required changing an existing test expectation.

### Historical failures, reproduced separately

30 Node suites were run: **25 passed; 5 retain baseline failures**. The four previously documented failures remain separate below; the additional old HF4-C audit was included in the broader compatibility run. All five failures were reproduced from an archive of approved HEAD, without changing branches, working-tree sources or expectations. Baseline reproduction used installed dependencies and matching checkout line endings for the byte-sensitive Table hash.

| Historical audit | Same baseline / current failure |
| --- | --- |
| `scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs:82` | After 9 passes, historical source regex expects `setPlayingIndex(step.highlight ?`. |
| `scripts/audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33` | Expects app version `...hf4c-r1`; baseline/current is `...hf4d`. |
| `scripts/audit-v603-d0-d1-text-identity.mjs:229` | Known Table hash: expected `024aa45b...`, actual `faa88212...` in both matching checkouts. No Table changes or hash updates. |
| `scripts/audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | After 9 passes, expects `/Browser TTS/`; baseline/current rendered value is `David · US`. |
| Additional: `scripts/audit-v603-beta8-p9-hf4c-player-audio-ux.mjs:35` | Expects app version `...hf4c`; baseline/current is `...hf4d`. No tests execute past that obsolete version assertion. |

## 7. Remaining H2 work and limits

Hydrogen owns speaker-label composition, dialogue spacing/rhythm and creative Full/Part/Segment presentation. C1 adds only existing-style headings and correct identity/context/terminology. Reuse the shared surfaces, `TextSegmentInteraction`, follow/selection utilities and the bridge; do not regroup by speaker or replace D4/D5 hosts.

- No production integration/activation is included. Canonical DB and schema constants remain **1**; no startup migration or live v2 writes.
- No Mixed reader UI or same-Card Section+Turn support. A1's existing projection-level Mixed ordering remains unchanged.
- No new offsets are available for cached Full. H2 must preserve Card-only precision and let browsing remain distinct from audible position.
- The observer is an additive live-host capability. A host lacking it must keep `none` precision; do not fabricate session IDs from status or indices.
- C1 does not add readiness computation to the new wrapper. Existing D5 panel readiness/binary/RF verification remains authoritative; H2 must not derive Ready from metadata or the mere availability of a Play callback.
- No renderer redesign, mobile UX acceptance, screen-reader study or cross-browser/device listening acceptance is claimed. The established Paragraph keyboard/focus regressions pass; H2 visuals still need their own review.
- New C1 playback interactions use controlled QA runtimes; the existing D5 real HTMLAudio recovery suite also passed. No real user audio was generated, deleted or garbage-collected. No provider/default/voice profile, AudioVariant, RF, Full WAV, Staging/ZIP/GC or command contract was edited.
- View state remains local or caller-controlled; C1 introduces no storage key or reinterpretation of existing preferences.

## 8. Diff and stop state

Diff summary including untracked files: **15 files, +1082 / -38 lines**. Application code: **11 files, +194 / -38**; tests: **3 new files, 671 lines**; report: **1 new file, 217 lines**. Git status is 8 modified tracked files and 7 untracked files, all listed in section 1. `git diff --check` passes. The approved HEAD and branch remain unchanged; no commit, push, merge, deployment, production activation or A4-H2 design work was performed.

**Final recommendation: GO for isolated A4-H2 using this bridge. Canonical v2 and production Conversation activation remain NO-GO.**
