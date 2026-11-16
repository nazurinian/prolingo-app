# P12 Shared Card UI — A1 foundation report

**CONDITIONAL GO for A2 presentation design/integration. A1 is complete; no A2/A3/A4 layouts or activation were implemented.** The existing Paragraph wrapper remains operational with matching browser DOM and appearance. Canonical IndexedDB/schema remain **1**; production Conversation activation remains outside approval.

Branch: `feature/p12-shared-card-ui`. Approved A0 commit and starting HEAD: `cb12f95ea6bf3045502b60ee824abe4c1b23695c`. The complete `P12_Shared_Card_UI_A0_Audit.md` was read before implementation. The initial working tree was clean. All changes below remain unstaged/uncommitted.

## 1. Files changed and purpose

| File | Change / purpose |
| --- | --- |
| `src/domain/text/textCardPresentationDomain.js` | New pure snapshot selector. Reuses existing validation/migration inspection, UID diagnostics and hydrated Document Tree; returns detached, recursively frozen Workspace/Card/Unit/Segment display records and lookup indexes. |
| `src/domain/text/textCardPresentationStateDomain.js` | New whitelisted, immutable presentation-state constants, normalization and patch operation. No storage or audio preference translation. |
| `src/domain/text/textCardPresentationCursorDomain.js` | New pure, scope-checked adapter for host telemetry; returns `none`, `card` or `segment` precision without inferring Full Sentence timing. |
| `src/components/text/presentation/TextSegmentInteraction.jsx` | New reusable inline Segment interaction primitive extracted from Paragraph: original classes, highlighting, underline, wrapped decoration, keyboard and disabled semantics. |
| `src/components/text/TextParagraphUnifiedReading.jsx` | The only modified existing production file: delegates its Sentence span to the primitive; retains channel panels, normalization, coverage titles, numbering, callbacks and existing Split/Full behavior. **+16 / -42 lines.** |
| `scripts/fixtures/shared-card-a1/presentation-fixture.js` | Disposable v2 Sections/Turns/Mixed graph and genuine v1 Paragraph fixtures, using existing commands. Includes raw restored whitespace, empty Units and zero-Unit Cards. |
| `scripts/audit-v603-p12-shared-card-a1.mjs` | 13 focused Node scenarios for identity, immutability, validation, v1 compatibility, view/audio separation and cursor precision. |
| `scripts/fixtures/shared-card-a1/browser-cases.jsx` | Seven browser scenarios, including approved-source Paragraph comparison and existing D5 session continuity under view/browse changes. |
| `scripts/audit-v603-p12-shared-card-a1-browser.mjs` | Isolated Edge/CDP runner; bundles the approved Paragraph source beside current source, uses actual built CSS and native browser key events, and blocks IndexedDB/localStorage. |
| `P12_Shared_Card_UI_A1_Foundation_Report.md` | This consolidated report and exact Hydrogen handoff. |

No changes to `TextStructuredPlayer`, either editor host, main routing, CSS, Sidebar/Data Management, commands, schema constants, D4/D5 playback logic/services, audio matching, RFs, Staging/ZIP/GC, provider configuration, Legacy/Table or AI Voice. No new dependencies. Generated `dist` output is ignored by Git.

## 2. Shared interfaces and current consumers

### Read-only projection

Export: `selectTextCardPresentation(candidate, { documentId } = {})` from `src/domain/text/textCardPresentationDomain.js:37`.

The input is the existing snapshot; `documentId` defaults to its active Workspace through the existing hydrator. The selector first uses `normalizeTextLibraryRuntimeSnapshot`, `inspectTextContentUnitMigrationState`, and persistent UID diagnostics, then obtains the authoritative tree through `resolveTextLibraryDocumentTree`. Snapshot context is intentional: a hydrated tree alone does not carry enough evidence to distinguish a complete v2 migration from partial state. No separate tree-only bypass is exposed.

Returned shape:

```js
{
  workspace: {
    id, uid, collectionId, title, documentType, textLanguage, meaningLanguage
  },
  cards: [{
    id, uid, documentId, order, blockType, title, paragraphRole,
    units: [{
      viewKey, id, uid, identitySource, kind, label, order,
      speakerId, speakerUid, speakerLabel,
      segments: [{
        id, uid, unitId, order, text, meaning, joinAfter, speakerId, speaker
      }]
    }]
  }],
  cardById, unitById, segmentById, locationBySegmentId
}
// locationBySegmentId[id] = { cardId, unitId, unitViewKey }
```

The output and its arrays/records/indexes are frozen. Indexes are null-prototype objects accessed with `[id]`; they share the same projected records used in the hierarchy. No source metadata/AudioVariant object is exposed or frozen through these display records. Unexpected non-scalar display fields fail rather than freezing a caller-owned object.

Persistent Units keep exact IDs/UIDs, raw text/meaning/`joinAfter`, validated structural order and speaker identity. Unit labels are presentation-only: stored `paragraph` → `Section`, stored `turn` → `Speaker Turn`. Speaker UID comes from the existing registry by speaker ID; no label-based identity inference occurs. Same-speaker adjacent/empty Turns stay distinct. Paired channels remain fields of one Segment record, including blank Meaning and repeated EN text. Mixed projection preserves the hydrated interleaved Card order; it does not implement Mixed UI or same-Card mixed Units.

For a genuine v1 Paragraph, each Card receives one compatibility Section with:

```js
{
  viewKey: `virtual:paragraph:${cardId}`, // existing virtual-key helper
  id: null,
  uid: null,
  identitySource: 'v1-paragraph-compat',
  kind: 'paragraph'
}
```

No virtual Section is inserted into `unitById`; no `segment.unitId`, counters or stored rows are created. Resolve its view location through `unitViewKey`. Empty v1 Cards retain an empty compatibility Section. Persistent zero-Unit Cards remain zero-Unit Cards. V1 Conversation is rejected rather than projected into false authored Turns; v1 Mixed containing Conversation Cards is likewise rejected.

`TextCardPresentationError` exposes these stable `code` values:

| Code | Meaning / recovery |
| --- | --- |
| `INVALID_SNAPSHOT` | Existing validation/UID checks fail, or display fields are malformed. Display an error; do not repair or write data. |
| `MIGRATION_REQUIRED` | Partial upgrade/incomplete Content Unit state. Keep the production gate; no automatic migration/retry through v1. |
| `UNSUPPORTED_SCHEMA` | Future persistent schema is unsupported. Preserve input and stop this projection. |
| `WORKSPACE_NOT_FOUND` | Select an existing Workspace. |
| `UNSUPPORTED_WORKSPACE` | Legacy stays on its existing surface. |
| `PERSISTENT_UNITS_REQUIRED` | Authored Conversation requires persistent Units. Use an approved complete isolated v2 fixture. |

**Consumers in A1:** Node/browser fixtures and the future-facing contract. The canonical App is not rewired to this selector. That avoids activating persistent Conversation or changing the existing Paragraph data path merely to prepare A2.

### Segment interaction primitive

Export: `TextSegmentInteraction` (named and default) from `src/components/text/presentation/TextSegmentInteraction.jsx:8`.

```jsx
<TextSegmentInteraction
  segmentId={segment.id}
  channel="text"                   // 'text' | 'meaning'; visual semantics
  interactive={canManuallyPlay}     // capability, independent of view/audio mode
  disabled={false}
  active={isActiveSegment}
  speaking={isSpeakingChannel}
  focused={isSearchTarget}
  fullChannelHighlighted={false}
  accessibleLabel="Play sentence 1 only"
  title={existingCoverageTitle}
  dataAttributes={{ 'data-reader-channel': 'text' }}
  onActivate={existingOnPlaySegment}
>
  {segment.text}
</TextSegmentInteraction>
```

`onActivate` receives **only `segmentId`**, once per click or Enter/Space keydown. Clicking Meaning does not implicitly change audio channel. The host keeps manual-play preferences, repeat behavior, TTS/local choice and session ownership. The primitive supplies no audio or presentation state. `interactive` defaults false; when true it preserves `role=button`, tab index, `aria-disabled`, focus-visible classes, Space default prevention and inherited inline style/clone decoration. Canonical Segment/search data attributes cannot be overridden by `dataAttributes`.

**Production consumer:** `TextParagraphUnifiedReading.jsx:69`. Its existing `splitMode` is translated only into the primitive's capability for compatibility with the old wrapper. No new `level`/layout state is mapped to `splitMode`. Thus A1 intentionally does not change the accepted legacy wrapper's Full interaction policy; A2 can use the primitive's independent capability for new layouts.

### Presentation state

Exports from `src/domain/text/textCardPresentationStateDomain.js`:

- `TEXT_CARD_PRESENTATION_LEVELS`, `TEXT_CARD_BILINGUAL_LAYOUTS`, `TEXT_CARD_PART_LAYOUTS`.
- `DEFAULT_TEXT_CARD_PRESENTATION_STATE` = `{ level: 'full', bilingualLayout: 'interlinear', partLayout: 'vertical-list' }`.
- `normalizeTextCardPresentationState(candidate)` returns a frozen object containing exactly those three fields; invalid values use defaults.
- `updateTextCardPresentationState(current, patch)` returns a normalized/frozen new value, applying only owned presentation fields. Audio, expansion and browse fields are ignored.

**Consumers in A1:** focused tests and the browser separation harness. No production view controls, hook, persistence service or preference migration was necessary. Saved `displayMode`, manual/audio preferences and Card expansion settings remain untouched and retain their old meanings.

## 3. Paragraph compatibility evidence

The isolated browser runner loads the exact approved Paragraph source via `git show cb12f95ea6bf3045502b60ee824abe4c1b23695c:src/components/text/TextParagraphUnifiedReading.jsx`, alongside the current component. No branch checkout/reset is used. Both run with the actual production CSS in the same fresh Edge profile.

For ten states, it compares complete semantic DOM/attributes/classes/inline styles and computed color, background, font, line height, text decoration, box decoration and element geometry. DOM attribute serialization order is normalized; no rendered element or style difference is permitted. Cases cover Text/Meaning speaking, disabled/unplayable targets, cached-Full channel highlighting, search focus, EN Only, ID Only and active-only Meaning. **All comparisons pass.**

Additional real-browser checks pass for:

- EN and ID target clicks forwarding only the original Segment ID, while header channel buttons separately request `text`/`meaning`.
- Native CDP Enter/Space events, keyboard focus-visible/ring and prevention of Space page scrolling.
- Disabled/nonplayable targets: `tabIndex=-1`, `aria-disabled=true`, no manual callback.
- Indigo/emerald speaking classes, computed active underline and actual multi-line wrapping with `box-decoration-break: clone`.
- Native selectable text and exact selected content; search focus data/amber state.
- The actual unchanged `TextStructuredPlayer` explicitly revealing a Segment and respecting user-navigation grace for passive following.
- The new primitive remaining manually interactive under each independent view level.

The scroll test explicitly retires its search request before measuring passive playback follow, avoiding counting a delayed search RAF as an unwanted follow. This synchronization correction affects only the new test. The final seven-scenario suite passed on two consecutive runs after that correction.

No screenshot/pixel-diff or operating-system clipboard transfer is claimed. Evidence is browser DOM, computed appearance/geometry, actual native key events and native text selection. Existing viewport-follow and editor host code are unchanged.

## 4. Read-only playback cursor contract

Export: `resolveTextCardPresentationCursor({ presentation, playback })` from `src/domain/text/textCardPresentationCursorDomain.js:11`.

Required scope evidence belongs to the **owning playback host**, not to the selected/browsed Part:

```js
playback = {
  workspaceId, workspaceUid, sessionId, // current host/session scope
  playingContext,                      // must be 'text-structured'
  isPlaying, isPaused,
  playbackRepresentationMode,           // actual session mode, not saved global mode
  playingIndex, currentIndex, activeBlockId,
  speakingPart, playbackSourceStatus
};
```

The frozen result always has:

```js
{
  workspaceId, workspaceUid, sessionId,
  state: 'idle' | 'playing' | 'paused',
  cardId, unitId, segmentId,
  channel: 'text' | 'meaning' | null,
  precision: 'none' | 'card' | 'segment'
}
```

Rules verified by Node tests:

1. Missing/mismatched Workspace ID/UID, absent session token, wrong playback context or stopped state yields idle/no precision. Nothing guesses the current token from old status.
2. Current-session, same-Workspace per-Sentence status outranks the Full Card anchor. The current projection resolves Segment → Unit → Card; a supplied stale/wrong Unit ID is not authority.
3. In actual Split mode, `playingIndex` is Segment evidence. In Full mode, `currentIndex` can identify a Card only. A global Full preference must not override the actual manual Split session mode supplied by the host.
4. Cached `full-local` and single `full-tts` report Card precision, with `segmentId/unitId = null`, even if an old highlight index exists. No timestamps/word counts or first-Turn inference.
5. Foreign/stale status is ignored. Missing Segment IDs or contradictory Card membership cannot fabricate a position. An explicit unavailable speech status produces no audible position.
6. Paused state retains available evidence without advancing. Browse selection and resume selection are not accepted as audible evidence. A v1 audible Segment may have Segment precision with **null persistent Unit ID**; its virtual view Part remains separately addressable by `unitViewKey`.

**Integration requirement:** callers must forward the current host scope and token. The adapter cannot prove freshness if a caller labels an old event with a new token/UID. Where these scalars are not exposed by a host yet, keep the cursor at `none` until a read-only bridge exists; do not introduce another playback store or modify D5 playback to manufacture timing. A1 changes no host telemetry or playback services.

## 5. Actual test matrix

Environment: Node **24.11.1**, real headless Microsoft Edge **157.0.0.0**, Windows. All commands below completed. Counts are scenarios, not a claim of exhaustive assertions.

| `node scripts/<script>` | Actual result |
| --- | --- |
| `audit-v603-p12-shared-card-a1.mjs` | 13 PASS / 0 FAIL |
| `audit-v603-p12-shared-card-a1-browser.mjs` | 7 PASS / 0 FAIL, including 10-state approved-source comparison |
| `audit-v603-round-d3-paragraph-acceptance.mjs` | 7 PASS |
| `audit-v603-p9b-playback-marathon.mjs` | 24 PASS |
| `audit-v603-p9c-bulk-marathon.mjs` | 17 PASS |
| `audit-v603-p12b-speaker-registry.mjs` | 14 PASS |
| `audit-v603-p12c-conversation-playback.mjs` | 13 PASS |
| `audit-v603-p12d-d4a-conversation-editor.mjs` | 22 PASS |
| `audit-v603-p12d-d4b-conversation-editor-ui.mjs` | 9 PASS |
| `audit-v603-p12d-d4c-browser.mjs` | 13 PASS + 4 route gates PASS; all 20 command paths covered |
| `audit-v603-p12d-d5-conversation-audio.mjs` | 15 PASS |
| `audit-v603-p12d-d5-audio-ui.mjs` | 5 PASS |
| `audit-v603-p12d-d5-ui-browser.mjs` | 15 PASS, including failing-Cached-Full recovery |
| `audit-v603-p12d-d5-browser.mjs` | 3 PASS |
| `audit-v603-p12d-d3d-regression.mjs` | 12 PASS |
| `audit-v603-p12d-d3c-compatibility.mjs` | 5 PASS |
| `audit-v603-p12d-d3b-content-unit-persistence.mjs` | 11 PASS |
| `audit-v603-p12d-d3d-browser.mjs` | 9 PASS; separately named disposable QA databases only |
| `audit-v603-p12d-virtual-content-units.mjs` | 12 PASS |
| `audit-v603-a0-a3-rf-portability.mjs` | 18 PASS |
| `audit-v603-a4-staging-gc.mjs` | 7 PASS |
| `audit-v603-beta8-p1-ordered-multi-audio.mjs` | 13 PASS |
| `audit-v603-beta8-p2-split-full-domain.mjs` | 17 PASS |
| `audit-v603-beta8-p3-runtime-playback.mjs` | 15 PASS |
| `audit-v603-beta8-p4-staging-zip.mjs` | 21 PASS |
| `audit-v603-d2-external-json.mjs` | 30 PASS |
| `audit-v603-d3-d4-external-reconcile.mjs` | 19 PASS |
| `audit-v603-p12a-external-reconcile.mjs` | 11 PASS |

**28 passing suites, 381 passing scenarios including the four route gates.** Partial successes in the failing historical scripts below are not included in that total.

The A1 Node checks preserve frozen snapshots and exact source fields/IDs/UIDs, retain empty/zero states, reject partial/corrupt v2 and missing UIDs, preserve v1 virtual identity, and verify scope/precision. The A1 browser harness blocks both IndexedDB and localStorage and reports **0 accesses to either**. It runs the existing D5 hook with a gated/recording runtime: six view changes and independent browsing leave the active step, cursor, preference reference and snapshot JSON unchanged, with no additional synth cancellation or playback start.

D4-C/D5 browser suites likewise report zero IndexedDB access. D3-D uses fresh disposable browser profiles and only `prolingo_text_library_d3b_qa_d3d_*` databases. No canonical IndexedDB was opened/upgraded, no existing physical audio was deleted, and GC coverage operated on fixtures/plans.

### Historical baseline failures — unchanged

| Script / failing reference | Result |
| --- | --- |
| `audit-v603-beta8-p9-hf4a-card-ux.mjs:82` | Nine checks pass, then the old source regex expects `setPlayingIndex(step.highlight ? ...)`; the accepted Full executor clears the highlight explicitly. Same A0 failure; remaining checks do not run. |
| `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs:33` | Expects version `6.0.3-beta.8-p9-hf4c-r1`; approved baseline is `6.0.3-beta.8-p9-hf4d`. Same A0 failure; later checks do not run. |
| `audit-v603-d0-d1-text-identity.mjs:229` | Existing Table hash mismatch: expected `024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767`, actual `faa88212c55ed7f1a4ed782f6ed8614ac58ff89b27833bbfb50b013ce3809133`. |
| `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs:834` | Nine checks pass, then `/Browser TTS/` is expected while the existing label is `David · US`. Same accepted D5 baseline failure. |

All four were rerun. No historical expected value, test source, version, Table file or P9 audio control was changed. These remain separate from the passing suites and from the new functional Paragraph browser evidence.

Additional executed verification:

```powershell
npx eslint src/domain/text/textCardPresentationDomain.js src/domain/text/textCardPresentationStateDomain.js src/domain/text/textCardPresentationCursorDomain.js src/components/text/presentation/TextSegmentInteraction.jsx src/components/text/TextParagraphUnifiedReading.jsx scripts/fixtures/shared-card-a1/presentation-fixture.js scripts/fixtures/shared-card-a1/browser-cases.jsx
node --check scripts/audit-v603-p12-shared-card-a1.mjs
node --check scripts/audit-v603-p12-shared-card-a1-browser.mjs
npm run build
git diff --check
```

All PASS. Scoped ESLint has **0 errors / 0 warnings**. Production build succeeds with **1899 modules**; existing stale browser-data notices and the main-bundle size warning remain. Actual built JavaScript contains neither the Conversation QA preview marker nor the A1 browser entry point. No production route or feature was added.

## 6. Remaining limits and risks

- No Full/Part/Segment reading layouts, carousel, new visual design, Mixed UI, preference controls or production routing were added. Hydrogen owns later design/integration.
- The new view-state module is memory-only. A separate guarded presentation preference service can be considered when the UI needs persistence; no old settings are migrated or reinterpreted in A1.
- The legacy Paragraph wrapper intentionally retains its original audio-linked `splitMode` behavior for compatibility. Only the new primitive exposes the independent capability needed by later layouts.
- Cursor accuracy depends on truthful current host scope/session evidence. Cached Full remains Card-only; there is no authoritative Sentence offset to expose. This is an existing D5 boundary.
- V1 Paragraph has one nonpersistent Section per Card, not authored multi-Section data. Persistent Conversation and Sections are tested with complete isolated v2 snapshots only. Same-Card mixed Units, Legacy and invalid partial migration remain unsupported.
- Projection validates/hydrates the existing snapshot, including existing UID diagnostics. Consumers should memoize by authoritative snapshot and Workspace identity rather than rebuild it on every view-only change. Never feed the presentation projection back as an audio Document Tree or persisted snapshot.
- New browser evidence covers desktop Edge and deterministic recording/gated audio paths. Cross-device scrolling, mobile keyboard/safe areas, OS clipboard transfer and audible voice quality remain later UI/device acceptance, not claims of A1.
- Four historical failures above remain open. None is hidden by changing expected values.

## 7. Exact Hydrogen handoff

Use these four boundaries; no new data/playback engine is needed:

```jsx
import { selectTextCardPresentation } from './domain/text/textCardPresentationDomain.js';
import { normalizeTextCardPresentationState, updateTextCardPresentationState } from './domain/text/textCardPresentationStateDomain.js';
import { resolveTextCardPresentationCursor } from './domain/text/textCardPresentationCursorDomain.js';
import TextSegmentInteraction from './components/text/presentation/TextSegmentInteraction.jsx';

// In the existing host: stable across view/browse changes.
const presentation = useMemo(
  () => selectTextCardPresentation(snapshot, { documentId }),
  [snapshot, documentId]
);
const [view, setView] = useState(normalizeTextCardPresentationState);
const [browsedUnitKey, setBrowsedUnitKey] = useState(null); // separate from sound
const changeView = patch => setView(previous => updateTextCardPresentationState(previous, patch));

// Forward the actual current host/session evidence, never browse state.
const cursor = resolveTextCardPresentationCursor({
  presentation,
  playback: {
    workspaceId: currentHostWorkspaceId,
    workspaceUid: currentHostWorkspaceUid,
    sessionId: currentHostSessionId,
    playingContext, isPlaying, isPaused,
    playbackRepresentationMode: actualSessionRepresentation,
    playingIndex, currentIndex, activeBlockId, speakingPart, playbackSourceStatus
  }
});

const location = cursor.segmentId ? presentation.locationBySegmentId[cursor.segmentId] : null;
// location.unitViewKey supports v1 virtual Sections; cursor.unitId stays truthful.
// Build visual shells/layouts using view + presentation; reuse existing callbacks.
```

The `currentHost*` and actual-session-mode variables above are placeholders for **existing host telemetry**, not new state to infer or allocate. Keep the editor/audio host mounted under its existing Workspace UID key. Do not put `view` in that key, replace `snapshot`, change audio preference references, call Stop/Play on a layout change, or derive audio channel/voice from visible EN/ID choice.

For each paired Segment, use `segment.text` and `segment.meaning` from that same projected record. Invoke `TextSegmentInteraction` with `onActivate={existingOnPlaySegment}` and an independently chosen interaction capability. Preserve existing Card EN/ID quick-play callbacks as explicit one-session overrides. Use stable persistent Unit identity or a virtual `viewKey` for browsing; never persist that key as a Unit ID.

Safe QA entry points:

```powershell
node scripts/audit-v603-p12-shared-card-a1.mjs
npm run build
node scripts/audit-v603-p12-shared-card-a1-browser.mjs
```

The browser runner defaults to installed Edge; `A1_BROWSER_PATH` may point to another Chromium executable. It uses a separate temporary profile and never starts App, canonical persistence or live audio generation. Fixtures are at `scripts/fixtures/shared-card-a1/presentation-fixture.js`; D4/D5 fixtures remain available unchanged for later isolated integration.

## 8. Recommendation and final state

**CONDITIONAL GO for A2** using these interfaces. Conditions are to preserve the existing command/audio lifecycle, maintain truthful cursor precision, keep v1 compatibility explicit, and validate the later visual layouts independently. No new architecture or carousel dependency is needed to begin that work.

Canonical v2 activation, production Conversation wiring, audio/command changes, Mixed integration and same-Card mixed Units remain outside this acceptance. A1 stops here. All changes are uncommitted; HEAD remains the approved A0 commit on the requested branch. No push, merge or deployment was performed.
