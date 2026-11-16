# ProLingo P12 — Shared Card UI / A3 Part & Segment Experience Report

**Branch:** `feature/p12-shared-card-ui`  
**Accepted Baseline Commit:** `c0a7d53e2110af4be4a95a39aea6ec86435d9c36`  
**Date:** 2026-11-17  
**Recommendation for A4 (Shared Conversation Reader):** **GO** (uncommitted working tree verified clean against ESLint, Vite production build, Edge visual alignment, and all automated suites).

---

## 1. Executive Summary

Phase **A3** extends the accepted A1/A2/A2-HF1 Shared Card foundation with interactive **Part View** (`horizontal-focus`, `vertical-focus`, `vertical-list`) and **Segment Focus View** (`segment`), controlled independently alongside **Full View** (`full`) and the four bilingual layouts (`interlinear`, `separated`, `text-only`, `meaning-only`).

All implementation remains strictly non-invasive:
- **Canonical DB & Schema Versions Untouched:** `TEXT_LIBRARY_DB_VERSION === 1`, `TEXT_LIBRARY_SCHEMA_VERSION === 1` (`TEXT_LIBRARY_V2_SCHEMA_VERSION === 2` remains test/opt-in only).
- **Zero Default Production Cutover:** Exposed through the dev-gated QA preview (`?qa=shared-card-reader` / `#qa-shared-card-reader`) and opt-in `useSharedCardReader = false` path on `TextStructuredPlayer.jsx`.
- **Audio & Domain Purity Preserved:** Switching view levels, Part styles, or bilingual layouts never mutates IndexedDB, snapshots, `audioConfig.preferences`, playback Split/Full settings, or running D5 audio sessions, and never remounts reader hosts.

---

## 2. Files Added & Modified

### Created
- [SharedBilingualUnitsBody.jsx](src/components/text/presentation/SharedBilingualUnitsBody.jsx) — Extracted single-source unit & bilingual segment flow renderer (`SharedBilingualUnitsBody`), shared across Full View and all Part Views with `unitsOverride`, `forceSectionHeaders`, and Card-anchored logical Sentence indices (`1..N`).
- [SharedPartAndSegmentViews.jsx](src/components/text/presentation/SharedPartAndSegmentViews.jsx) — Implements `SharedCardPartView` (with internal `PartSectionNavigator`, `PartHorizontalFocusView`, `PartVerticalFocusView`, `PartVerticalListView`) and `SharedCardSegmentView`.
- [audit-v603-p12-shared-card-a3.mjs](scripts/audit-v603-p12-shared-card-a3.mjs) — Node verification suite (`7/7` pass).
- [browser-cases.jsx](scripts/fixtures/shared-card-a3/browser-cases.jsx) & [audit-v603-p12-shared-card-a3-browser.mjs](scripts/audit-v603-p12-shared-card-a3-browser.mjs) — Real headless Edge verification suite (`8/8` browser cases + `4/4` dev/prod gate routes + production bundle check + zero IDB/localStorage touches).

### Modified
- [sharedCardPresentationUtils.js](src/components/text/presentation/sharedCardPresentationUtils.js) — Added `SHARED_LEVEL_OPTIONS`, `SHARED_PART_LAYOUT_OPTIONS`, `IDLE_SHARED_CURSOR`, `buildSharedSegmentRenderFlags`, `buildCardUnitLookup`, `stepCardUnitViewKey`, `stepCardSegmentId`, `resolveEffectiveCardSelection`, and `resolveSegmentCoverageStatuses`.
- [SharedBilingualLayoutToolbar.jsx](src/components/text/presentation/SharedBilingualLayoutToolbar.jsx) — Added View Level (`Full | Part | Segment`), contextual Part Style bar (`Horizontal | Focus | List`, visible only when `level === 'part'`), and `Reset View` across `{ level, bilingualLayout, partLayout }`, while keeping backwards compatibility for `bilingualLayout`/`onChangeLayout` callers.
- [SharedParagraphCardReader.jsx](src/components/text/presentation/SharedParagraphCardReader.jsx) — Integrated `Full | Part | Segment` switching, workspace-scoped `manualAnchor` & `1,800 ms` manual navigation grace without `useEffect` `setState`, `Follow Audio` affordance, and exported `SharedFullCardBody`, `SharedCardReadingSurface`, and `SharedParagraphWorkspaceReader`.
- [useCardPresentationFollow.js](src/components/text/presentation/useCardPresentationFollow.js) — Guarded vertical `scrollIntoView` against targeting segments inside inactive horizontal slides (`data-shared-part-active !== 'true'`).
- [TextStructuredPlayer.jsx](src/components/text/TextStructuredPlayer.jsx) — Forwarded `presentationState`, `onChangePresentationState`, `onResetView`, and `focusTarget` through the opt-in `useSharedCardReader` path while keeping HF1 conservative cursor validation untouched and introducing zero new ESLint diagnostics (`17 errors / 3 warnings` baseline unchanged).
- [TextSharedCardReaderQaPreview.jsx](src/components/text/presentation/TextSharedCardReaderQaPreview.jsx) — Updated QA banner (`A3 Shared Card QA · Canonical DB Untouched`), telemetry (`level` & `part`), and comparison heading.

---

## 3. Architecture & UX Design Highlights

### 3.1 Five-Tier Deterministic Selection Model (`resolveEffectiveCardSelection`)
Browsing, search focus, manual navigation grace, and audible playback remain strictly separated:
1. **Undismissed Search Focus (`focusTarget`)**: Jumps Part View directly to the parent Section and Segment View to the exact Sentence when `documentId` & `blockId` match and `nonce !== dismissedFocusNonce`.
2. **Manual Browse + `1,800 ms` Grace (`manualGraceActive` / same `audiblePlayingKey`)**: Browsing sections/sentences never triggers playback (`0` `onPlaySegment` calls), holds user position during active `precision === 'segment'` playback, and exposes an explicit `Follow Audio` action when diverged from the speaking unit/sentence.
3. **Active Playing Segment Cursor (`precision === 'segment'`)**: Automatically follows playback across Sections/Sentences once manual grace settles and audio advances to a subsequent segment.
4. **Paused Cursor / Manual Fallback**: Retains paused or last-valid section/sentence position safely.
5. **Cached Full Card & Default/Empty Honesty**: When `cursor.precision === 'card'`, renders explicit `"Playing cached full card audio"` notices (`data-shared-part-full-notice` / `data-shared-segment-full-notice`) and never spoofs an active Section or Sentence highlight.

### 3.2 Part Views (`SharedCardPartView`)
- **Horizontal Focus (`horizontal-focus`)**: Native CSS `snap-x snap-mandatory` track (`relative` container so slide `offsetLeft` aligns at `0` without right-edge shift/clipping, `snap-start snap-always`), `behavior: 'instant'` on initial mount and reduced motion, smooth scroll for user step transitions, swipe debounced via `onScroll` + gesture reset, `ArrowLeft`/`ArrowRight` pill keyboard navigation, `aria-hidden` + `inert` on non-active slides so Tab never pulls focus offscreen, and natural full slide height for long sections.
- **Vertical Focus (`vertical-focus`)**: Displays `Previous` + emphasized `Focused` Current + `Next` Sections vertically with explicit `"Start of card"` / `"End of card"` boundary notices and non-nested neighbor `"Focus section"` buttons.
- **Vertical List (`vertical-list`)**: Displays all Card Sections vertically as scannable surfaces distinguishing **Audible** (`data-shared-part-audible="true"`) from **Selected** (`data-shared-part-active="true"`), preserving empty Sections and v1 compatibility (`data-shared-part-compat-badge="true"`).

### 3.3 Segment Focus View (`SharedCardSegmentView`)
- Dedicated spotlight reading surface respecting all 4 bilingual layouts (`interlinear`, `separated`, `text-only`, `meaning-only`) with `>= 44 px` mobile touch targets.
- Displays Section context (`data-shared-segment-unit-context`), Card-anchored Sentence index (`Sentence i of N`, keeping duplicate English strings distinct), explicit Blank Meaning placeholder (`No Indonesian meaning for this sentence.`), HF1-accurate coverage status badges (`READY`, `STALE`, `OTHER`, `HISTORY`, `META-ONLY`, `UNVERIFIED`, `OTHER PROFILE`, `MISSING`), passive Previous/Next/Jump controls, and explicit `Play Sentence` + `TextSegmentInteraction` buttons.

---

## 4. Verification Results

All checks below were executed cleanly **in series after the final source edit**:

### Lint & Production Build
- `npx eslint --max-warnings=0 src/components/text/presentation/ src/domain/text/textCardPresentation*.js src/services/persistence/textCardPresentationPreferenceService.js scripts/audit-v603-p12-shared-card-a*.mjs scripts/fixtures/shared-card-a1/ scripts/fixtures/shared-card-a2/ scripts/fixtures/shared-card-a3/` -> **PASS (`0 errors, 0 warnings`)**
- `npx eslint --format json src/components/text/TextStructuredPlayer.jsx` -> **17 errors, 3 warnings** (exact pre-existing baseline; zero new diagnostics).
- `npm run build` (`vite build`) -> **PASS** (`1906 modules`, `✓ built in 8.50s`).

### Shared Card UI Suites (Node & Real Headless Edge 157)
- `node scripts/audit-v603-p12-shared-card-a1.mjs` -> **13 PASS, 0 FAIL** (`IndexedDB calls: 0`)
- `node scripts/audit-v603-p12-shared-card-a2.mjs` -> **10 PASS, 0 FAIL** (`IndexedDB calls: 0`)
- `node scripts/audit-v603-p12-shared-card-a3.mjs` -> **7 PASS, 0 FAIL** (`IndexedDB calls: 0`)
- `node scripts/audit-v603-p12-shared-card-a1-browser.mjs` -> **7 PASS, 0 FAIL** (`indexedDbCalls: 0`, `storageCalls: 0`)
- `node scripts/audit-v603-p12-shared-card-a2-browser.mjs --check-production` -> **8 PASS, 0 FAIL**, `4/4` gates, `qaPreviewAbsent: true`
- `node scripts/audit-v603-p12-shared-card-a3-browser.mjs --check-production` -> **8 PASS, 0 FAIL**, `4/4` gates (`?qa=shared-card-reader` and `#qa-shared-card-reader` gated in prod, active in dev), `qaPreviewAbsent: true`, `indexedDbCalls: 0`, `storageCalls: 0`
- Visual inspection of Edge mobile (`390x844` light & dark) and desktop (`1024x800`) screenshots confirmed clean alignment after fixing horizontal `relative` + `behavior: 'instant'` initial scroll alignment.

### Regression Suites (D2 / D3 / D4 / D5 / P12 / Round-D3 / P9)
- `node scripts/audit-v603-p12d-d4c-browser.mjs --check-production` -> **13 PASS, 0 FAIL**, `4/4` gates, `qaPreviewAbsent: true`
- `node scripts/audit-v603-p12d-d5-ui-browser.mjs` -> **15 PASS, 0 FAIL** (`indexedDbCalls: 0`)
- `node scripts/audit-v603-p12d-d5-browser.mjs` -> **3 PASS, 0 FAIL** (`indexedDbCalls: 0`)
- `node scripts/audit-v603-p12d-d3d-browser.mjs` -> **9 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d5-audio-ui.mjs` -> **5 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d5-conversation-audio.mjs` -> **15 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d4a-conversation-editor.mjs` -> **22 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d4b-conversation-editor-ui.mjs` -> **9 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d3b-content-unit-persistence.mjs` -> **11 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d3c-compatibility.mjs` -> **5 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d3d-regression.mjs` -> **12 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-virtual-content-units.mjs` -> **12 PASS, 0 FAIL**
- `node scripts/audit-v603-p12b-speaker-registry.mjs` -> **14 PASS, 0 FAIL**
- `node scripts/audit-v603-p12c-conversation-playback.mjs` -> **13 PASS, 0 FAIL**
- `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs` -> **7 PASS, 0 FAIL**
- `node scripts/audit-v603-p9b-playback-marathon.mjs` -> **24 PASS, 0 FAIL**
- `node scripts/audit-v603-p9c-bulk-marathon.mjs` -> **17 PASS, 0 FAIL**
- `node scripts/audit-v603-beta8-p9-hf4d-navigation.mjs` -> **20/20 PASS**

### Pre-Existing Baseline Failures (Verified Unchanged)
- `audit-v603-beta8-p9-hf4a-card-ux.mjs` (PASS 1–9, historical `setPlayingIndex(step.highlight ?` assertion)
- `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs` (`6.0.3-beta.8-p9-hf4d` vs expected `6.0.3-beta.8-p9-hf4c-r1`)
- `audit-v603-d0-d1-text-identity.mjs` (historical Table hash mismatch on clean baseline)
- `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs` (PASS 1–9, `'David · US'` vs `/Browser TTS/` at line 834)

---

## 5. Readiness for A4

**Recommendation: GO for A4 (Conversation & Mixed Shared Card Reader).**  
`SharedBilingualUnitsBody`, `SharedBilingualLayoutToolbar`, `SharedCardPartView`, `SharedCardSegmentView`, `resolveEffectiveCardSelection`, and `TextStructuredPlayer` opt-in presentation wiring provide reusable Full/Part/Segment primitives ready to accept Conversation Speaker Turn groupings and Speaker badges in A4 without altering IndexedDB v1 or default production paths.
