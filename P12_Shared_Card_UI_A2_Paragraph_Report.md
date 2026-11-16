# ProLingo P12 — Shared Card UI / A2 Paragraph Reader Report

**Recommendation: CONDITIONAL GO for A3 (Part / Segment focus & Conversation adaptation).**

A2 delivers the new cohesive **Shared Full Card** Paragraph reading experience and all four view-only bilingual layouts (`Combined / Interlinear`, `Separated`, `EN Only`, `ID Only`) through an isolated development QA preview (`?qa=shared-card-reader` / `#qa-shared-card-reader`) and an off-by-default opt-in path on `TextStructuredPlayer` (`useSharedCardReader = false`). Production Paragraph routing (`App.jsx`), canonical IndexedDB/schema versions (`1`), domain command contracts, Split/Full audio behavior, Legacy/Table modes, AI Voice, and Conversation production routing remain unchanged. All changes are uncommitted on branch `feature/p12-shared-card-ui` (baseline `ef6b0f636eca987d5c2805581a83468caa965160`).

---

## 1. Implementation & Source File List

### Created Production & Presentation Modules
- `src/components/text/presentation/SharedParagraphCardReader.jsx` — Exports `SharedFullCardBody`, `SharedCardReadingSurface` (`variant="card" | "embedded"`), and `SharedParagraphWorkspaceReader`. Renders a unified unboxed Full Card surface across persistent Sections (`v2`) and virtual Compatibility Sections (`v1-paragraph-compat`), supporting `interlinear`, `separated`, `text-only`, and `meaning-only` layouts while reading exclusively from A1's frozen `selectTextCardPresentation` projection and `resolveTextCardPresentationCursor` cursor.
- `src/components/text/presentation/SharedBilingualLayoutToolbar.jsx` — View-only segmented layout selector (`Combined`, `Separated`, `EN Only`, `ID Only`) with `role="group"`, native `<button aria-pressed>` controls, optional `Reset View`, zero audio side effects, and responsive mobile `2x2` grid layout.
- `src/components/text/presentation/useCardPresentationFollow.js` — Single workspace viewport-follow and search-reveal coordinator: handles `focusTarget` explicit centering (`onEnsureCardExpanded`, `onFocusConsumed`), channel-qualified follow for Separated EN vs ID flows, 1,800 ms pointer/wheel/touch/keyboard-navigation grace, `prefers-reduced-motion` (`behavior: 'auto'`), and zero focus stealing.
- `src/components/text/presentation/sharedCardPresentationUtils.js` — Shared Card presentation utilities (`SHARED_BILINGUAL_LAYOUT_OPTIONS`, segment index mapping invariant to blank channels, `joinAfter` separator resolution, host-coverage summary reader without recalculating RF identity, and reduced-motion/scroll container detection).
- `src/components/text/presentation/TextSharedCardReaderQaPreview.jsx` — Dev-only interactive sandbox showcasing v2 multi-section Editorial Paragraph (`TITLE` + 3 Sections + Empty Section + Zero-Unit Empty Card + Duplicate EN disambiguation + Missing Meaning + Multilingual accents/CJK/Arabic/URL wrapping), A1 Paragraph fixture, v1 Compatibility fixture, Before/After visual comparison against `TextParagraphUnifiedReading`, Mobile `375px` / Narrow `320px` / Desktop viewports, Dark theme, `200%` text scaling, Reduced Motion toggle, Search reveal simulator, and an in-memory Host Audio simulator proving view changes never disturb playback sessions.
- `src/services/persistence/textCardPresentationPreferenceService.js` — Guarded view-only `localStorage` preference helper (`prolingo_text_card_presentation_v1`), isolated from `prolingo_text_structured_preferences_v1` and safe under denied/corrupt storage (not wired automatically inside headless/App runtime in A2).

### Updated Existing Source Files
- `src/components/text/presentation/TextSegmentInteraction.jsx` (+5 / -4 lines) — Preserves byte-for-byte identical DOM classes for all A1 Paragraph compatibility states while adding optional `className`, amber search highlight support when `interactive && focused`, and `:focus-visible` ring styling on interactive `fullChannelHighlighted` targets.
- `src/components/text/TextStructuredPlayer.jsx` (+86 insertions; opt-in only) — Adds optional opt-in props (`useSharedCardReader = false`, `sharedPresentation`, `sharedPresentationState`, `onSharedPresentationStateChange`, `sharedPlaybackCursor`) rendering `SharedBilingualLayoutToolbar` + `SharedCardReadingSurface` (`variant="embedded"`) when enabled; when omitted (`false`, default in `App.jsx`), the original Paragraph reader executes unchanged.
- `src/main.jsx` (+21 / -4 lines) — Registers dev-only lazy QA route `?qa=shared-card-reader` / `#qa-shared-card-reader` strictly behind `import.meta.env.DEV`, keeping existing `?qa=conversation-editor` / `#qa-conversation-editor` intact and stripping all QA code from production bundles.

### Fixtures & Acceptance Verification Scripts
- `scripts/fixtures/shared-card-a2/paragraph-reader-fixture.js` — Isolated in-memory v2 and v1 Paragraph builders (using `backfillTextContentUnits` and `applyTextLibraryCommand`, zero IndexedDB).
- `scripts/audit-v603-p12-shared-card-a2.mjs` — 8 Node acceptance scenarios covering immutability, multi-section & v1 compat, all 4 layouts, non-shifting blank Meaning pairing, Cached Full `card` cursor truthfulness, coverage/joinAfter, preference service resilience, and v1 constants.
- `scripts/fixtures/shared-card-a2/browser-cases.jsx` & `scripts/audit-v603-p12-shared-card-a2-browser.mjs` — 6 comprehensive Headless Edge scenarios + 4 dev/prod route-gate checks + production bundle verification.

---

## 2. Major UX & Architectural Design Decisions

1. **Editorial Unboxed Card Surface Over Nested Chrome:** Replaced nested bordered channel cards and justified `text-align: justify` text rivers with a clean single-sheet card canvas, left-aligned natural prose (`text-left`, `whitespace-pre-line`, `overflow-wrap: break-word`), and a comfortable desktop reading column (`max-w-[66ch]`). Section boundaries communicate hierarchy via quiet `SECTION N` eyebrows, open spacing, and thin horizontal hairlines instead of nested boxes.
2. **Default Combined / Interlinear Couplets:** English (`1.0625rem`–`1.125rem`, `1.74` line-height) sits directly above its paired Indonesian meaning (`0.9375rem`–`0.96875rem`, `1.62` line-height) in an alignment grid (`1.6rem` tabular `select-none` index + `minmax(0, 1fr)` prose column). Dragging across prose copies clean sentences without numeric badges or HTML clutter, while proportional `rem` units reflow cleanly under `200%` text scaling.
3. **Separated & Single-Channel Flows via Shared Renderer (`CardChannelFlowBody`):** `separated`, `text-only`, and `meaning-only` reuse one inline flow renderer honoring `joinAfter` (`'none'`, `'line'`, `'paragraph'`), keeping Segment IDs and logical numbering strictly invariant when individual translations are blank (`meaning-only` renders an explicit muted placeholder; `separated` skips blank channels without shifting subsequent Segment matches).
4. **TITLE Role & Quiet Metadata Restraint:** `paragraphRole === 'title'` receives a subtle slate atmospheric wash, bold `TITLE` eyebrow label, and larger balance-wrapped heading/prose scale (`text-[1.125rem]`–`text-[1.25rem]`) so opening title cards feel distinct from regular narrative cards. Header chrome condenses readiness into concise inline text (`Audio 2/2 ready`) rather than dense badge clusters.
5. **Responsive Mobile Ergonomics Caught via Visual Review:** Real Edge screenshot inspection revealed that wide desktop header rows compress narrow mobile card titles next to `EN / ID / Play` actions and wrap a 4-button horizontal bar as 3+1. Stacking card headers vertically on `< 640px` (`flex-col sm:flex-row`) gives titles full mobile width, converting `SharedBilingualLayoutToolbar` to `grid-cols-2 sm:inline-flex` yields a symmetrical `2x2` phone control grid, and mobile touch controls enforce `min-h-11` (`>= 44px`).
6. **Strict Audio / Presentation Decoupling:** Switching layouts never modifies `audioConfig`, calls playback setters, cancels synthesis, or remounts the reading host. Full cached audio (`precision === 'card'`) displays a truthful `Playing/Paused [EN|ID] · Full Card` pill and channel-level highlighting without falsely lighting Segment #1, while Segment targets remain manually clickable and keyboard-focusable (`:focus-visible` ring preserved) even during Full playback.

---

## 3. Isolated Preview & Opt-In Paths for Visual Evaluation

1. **Dev-Only QA Route:** Run `npm run dev` (or Vite dev server) and open `/?qa=shared-card-reader` or `/#qa-shared-card-reader`. Includes live fixture switching (`v2 Editorial`, `A1 Multi-Section`, `v1 Compatibility`), `Before / After` side-by-side comparison with existing `TextParagraphUnifiedReading`, Desktop / Mobile (`375px`) / `320px` width modes, Light / Dark toggle, `200% Text` scaling, `Reduced Motion`, Search reveal trigger, and simulated Split/Full audio host telemetry.
2. **Host Opt-In API:** `<TextStructuredPlayer useSharedCardReader sharedPresentation={selectTextCardPresentation(snapshot, { documentId })} />` renders the new Shared Card UI inside `StructuredPlayerCard` while retaining host expansion modes (`Follow`, `Expand All`, `Custom`), search reveal, and `1800ms` scroll grace. Omitting `useSharedCardReader` leaves legacy Paragraph active.
3. **Production Safety:** Verified in compiled Vite output (`dist/assets/index-DLgWGxdZ.js`) and Headless Edge `/gate-prod?qa=shared-card-reader` + `/gate-prod#qa-shared-card-reader` checks that QA preview code and DOM markers are completely absent outside `import.meta.env.DEV`.

---

## 4. Before / After Visual & Structural Comparison

Inspectable side-by-side in `?qa=shared-card-reader` (`Before / After` mode) and verified by headless Edge 157 computed style checks and visual screenshots:

- **Before (`TextParagraphUnifiedReading`):** Renders two bordered channel panels stacked vertically (`TEXT` box above `MEANING` box), `text-align: justify` creating uneven spacing gaps, full-bleed desktop line widths, coupled `splitMode = !isFullRepresentation` disabling sentence click/focus during Full audio, and no interlinear pairing.
- **After (`SharedParagraphCardReader`):** Renders one cohesive unboxed Card paper, default sentence-paired `Combined` EN/ID reading (`Separated` / `EN Only` / `ID Only` selectable view-only), constrained `max-w-[66ch]` reading measure on desktop, open typographic `SECTION N` dividers, distinct `TITLE` editorial typography, stacking mobile header preventing title squish at `320px`/`375px`, native `:focus-visible` ring even under Full channel highlight, and full Segment interactivity independent of Split vs Full audio representation.

---

## 5. Preserved Paragraph Behaviors

All functional behaviors from existing `TextParagraphUnifiedReading` / `TextStructuredPlayer` remain preserved and verified in browser tests:
- Original persistent Segment IDs passed unchanged on click and `Enter` / `Space` (`onPlaySegment(segmentId)`), without implicitly overriding audio channel when Indonesian meaning is clicked.
- Disabled / non-playable targets set `tabIndex=-1`, `aria-disabled="true"`, and suppress activation.
- Explicit one-shot `EN` / `ID` card channel buttons call `onPlayCard(cardId, { playbackChannelMode: 'text-only' | 'meaning-only' })`, kept distinct from `Play` card and passive display switches.
- Indigo (`text`) / Emerald (`meaning`) semantic speaking colors, active underline on partner channel, wrapped `box-decoration-break: clone`, amber search highlighting (`data-text-search-focus-segment`), `1800ms` user-navigation passive follow grace, and native text selection/copy (`window.getSelection()`) excluding numeric markers.

---

## 6. Verification Results & Baseline Records

All checks below ran cleanly after the final code edit (Environment: Node `24.11.1`, Vite `7.2.6`, Headless Microsoft Edge `157.0.0.0`, Windows; zero IndexedDB or production localStorage calls across QA suites).

### Lint, Build & A1/A2 Verification
| Check | Command | Result |
| --- | --- | --- |
| Scoped ESLint | `npx eslint --max-warnings=0 src/main.jsx src/services/persistence/textCardPresentationPreferenceService.js src/components/text/presentation/ scripts/fixtures/shared-card-a2/ scripts/audit-v603-p12-shared-card-a2*.mjs` | **PASS** (0 errors, 0 warnings) |
| Production build | `npm run build` | **PASS** (`1904` modules, `dist/assets/index-DLgWGxdZ.js 1,646.45 kB`, `index-eMBiiGxI.css 108.30 kB`) |
| A2 Node acceptance | `node scripts/audit-v603-p12-shared-card-a2.mjs` | **PASS** (`8 PASS, 0 FAIL`; `0` IndexedDB) |
| A2 Browser acceptance | `node scripts/audit-v603-p12-shared-card-a2-browser.mjs --check-production` | **PASS** (`6/6` browser cases, `4/4` dev/prod QA gates, `qaPreviewAbsent: true`, `0` IndexedDB, `0` storage calls) |
| A1 Node foundation | `node scripts/audit-v603-p12-shared-card-a1.mjs` | **PASS** (`13 PASS, 0 FAIL`; `0` IndexedDB) |
| A1 Browser parity | `node scripts/audit-v603-p12-shared-card-a1-browser.mjs` | **PASS** (`7/7`, including 10-state approved-source DOM & geometry identity, `0` IndexedDB, `0` storage calls) |

### Full Ecosystem Regression Suites (Post-Final Edit)
| Suite | Result |
| --- | --- |
| `audit-v603-p12d-d4c-browser.mjs --check-production` | **PASS** (`13/13` browser cases, `4/4` QA gates, `qaPreviewAbsent: true`, `0` IndexedDB) |
| `audit-v603-p12d-d5-ui-browser.mjs` | **PASS** (`15/15` browser cases, `0` IndexedDB) |
| `audit-v603-p12d-d5-browser.mjs` | **PASS** (`3/3` browser cases, `0` IndexedDB) |
| `audit-v603-p12d-d5-conversation-audio.mjs` | **PASS** (`15 PASS, 0 FAIL`) |
| `audit-v603-p12d-d5-audio-ui.mjs` | **PASS** (`5 PASS, 0 FAIL`) |
| `audit-v603-p12d-d4a-conversation-editor.mjs` | **PASS** (`22 PASS, 0 FAIL`) |
| `audit-v603-p12d-d4b-conversation-editor-ui.mjs` | **PASS** (`9 PASS, 0 FAIL`) |
| `audit-v603-p12d-d3d-regression.mjs` | **PASS** (`12 PASS, 0 FAIL`) |
| `audit-v603-p12d-d3c-compatibility.mjs` | **PASS** (`5 PASS, 0 FAIL`) |
| `audit-v603-p12d-d3b-content-unit-persistence.mjs` | **PASS** (`11 PASS, 0 FAIL`) |
| `audit-v603-p12d-virtual-content-units.mjs` | **PASS** (`12 PASS, 0 FAIL`) |
| `audit-v603-p12b-speaker-registry.mjs` | **PASS** (`14 passed, 0 failed`) |
| `audit-v603-p12c-conversation-playback.mjs` | **PASS** (`13 passed, 0 failed`) |
| `audit-v603-round-d3-paragraph-acceptance.mjs` | **PASS** (`7 PASS, 0 FAIL`) |
| `audit-v603-p9b-playback-marathon.mjs` | **PASS** (`24 PASS, 0 FAIL`) |
| `audit-v603-p9c-bulk-marathon.mjs` | **PASS** (`17 PASS, 0 FAIL`) |
| `audit-v603-beta8-p9-hf4d-navigation.mjs` | **PASS** (`20/20 PASS`) |

### Historical Baseline Failures (Unchanged Pre-Existing Expectations)
- `audit-v603-beta8-p9-hf4a-card-ux.mjs` — Passes checks 1–9, exits at legacy source regex `/setPlayingIndex\(step\.highlight \?/` (superseded by accepted Full highlight clearing in `textStructuredPlaybackSessionService.js`).
- `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs` — Exits at line 32 expecting version `6.0.3-beta.8-p9-hf4c-r1` (`package.json` is `6.0.3-beta.8-p9-hf4d`).
- `audit-v603-d0-d1-text-identity.mjs` — Fails at line 229 Table SHA-256 check (`faa88212...` actual vs `024aa45b...` historical expectation; `src/components/table/` is untouched).
- `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs` — Passes checks 1–9, exits at line 834 expecting `/Browser TTS/` vs `'David · US'`.

---

## 7. Known Limitations & A3 Recommendation

### Known Scope Boundaries / Limitations
- Canonical `TEXT_LIBRARY_DB_VERSION` and `TEXT_LIBRARY_SCHEMA_VERSION` remain `1`; authored multi-Section Paragraphs use isolated v2 fixtures while canonical v1 Paragraph cards retain virtual single-Section compatibility (`identitySource: 'v1-paragraph-compat'`).
- Part-level carousel/focus layouts (`horizontal-focus`, `vertical-focus`, `vertical-list`), Segment-focus view (`level: 'segment'`), and Conversation/Mixed reader integration remain unimplemented in A2 (reserved for A3/A4).
- Cached Full audio playback has Card-level precision only (`cursor.precision === 'card'`); intra-file Sentence timing is not inferred without separate audio timing work.
- `textCardPresentationPreferenceService.js` (`prolingo_text_card_presentation_v1`) is tested and ready for opt-in production wiring when A3/Cutover enables persistent device-level view preferences.
- `TextStructuredPlayer.jsx` retains its pre-existing ESLint debt on older props/effects (`17` errors, `3` warnings unrelated to A2); A2 added zero new lint issues.

### Recommendation for A3
**CONDITIONAL GO to proceed to P12 Shared Card UI — A3**, under the following conditions:
1. Build Part (`vertical-list`, `horizontal-focus`, `vertical-focus`) and Segment (`level: 'segment'`) views strictly on top of A1's immutable `selectTextCardPresentation`, `updateTextCardPresentationState`, `TextSegmentInteraction`, and `resolveTextCardPresentationCursor` without introducing any third-party animation/carousel dependency or audio mutations.
2. Keep existing legacy Paragraph (`App.jsx` + `TextParagraphUnifiedReading`) working untouched until final cutover acceptance.
3. Keep Conversation editing commands and D5 audio hooks isolated inside their host boundaries while adapting Conversation/Mixed Cards cleanly in isolated preview first.
