# ProLingo P12 — A4-H2 Shared Conversation Reader UX Report

**Branch:** `feature/p12-shared-card-ui`  
**Accepted Baseline Commit:** `eb2f4000bdd29e366a3ae7c15bd87325d7dc83dd`  
**Date:** 2026-11-17  
**Recommendation for A5:** **GO (Conditional on maintaining v1 production boundary until explicit P12 cutover/activation approval)**

---

## 1. Design Direction & Rationale

**Core principle:** *One shared reading infrastructure, two tailored experiences.*  
While Paragraph prose values uninterrupted editorial continuity across numbered Sections, multi-speaker Conversations benefit from immediate **speaker voice rhythm**—knowing who is speaking at a glance, when the same speaker takes a consecutive Turn, and where a Scene pauses or introduces an unattributed line—without turning a language-learning reader into a heavy administrative form or nesting boxes inside boxes.

Key visual and interaction choices:
- **Cohesive Outer Scene Card + Open Left Script Gutter:** Instead of wrapping each Turn or Sentence inside bordered boxes, each Speaker Turn uses generous dialogue spacing, a clean speaker monogram + bold name + `Speaker Turn N` header (`UnitHeadingBlock`), and an open left accent rail (`border-l-2` in Full View; `border-l-4` in Part/Segment Views). One outer `<article>` remains the single cohesive Card surface.
- **Scene Cast Strip in Header:** Scene headers show Turn count (`N speaker turns`), Sentence count, readiness summary, and a quiet `Cast:` participant row (`summarizeSceneSpeakers`) displaying every speaker's deterministic color indicator cleanly above the script.
- **Non-Colliding Chromatic System:** Spoken English uses Indigo (`indigo`), Spoken Indonesian uses Emerald (`emerald`), and Search reveals use Amber (`amber`). The 6-hue speaker palette (`sky`, `teal`, `rose`, `violet`, `orange`, `cyan`) plus muted `neutral` for unassigned speakers avoids confusing visual collisions with active audio highlights or search reveals.
- **Type-Aware Language Throughout:** Every fallback label, aria-label, tooltip, navigator notice, boundary string (`Start of scene` / `End of scene`), and empty-state prompt adapts cleanly between Paragraph (`Section` / `Card` / `passage`) and Conversation (`Speaker Turn` / `Scene` / `dialogue`), eliminating accidental `'Section'` fallback leaks (`SharedPartAndSegmentViews.jsx`).

---

## 2. Files Added & Modified

### Modified Application Files (`src/components/text/presentation/`)
1. [sharedCardPresentationUtils.js](src/components/text/presentation/sharedCardPresentationUtils.js)
   - Extended `getSharedUnitTerms` (`cardLabel`, `cardLower`, `collectionNoun`), `SPEAKER_ACCENT_PALETTE` (with specific `border-l-*` rail tokens so speaker stripes do not collide with outer active indigo card borders), `UNASSIGNED_SPEAKER_APPEARANCE`, `getSpeakerMonogram`, `getStableTurnSpeakerKey`, `buildCardSpeakerAppearanceMap`, `resolveTurnSpeakerPresentation`, and `summarizeSceneSpeakers`.
2. [SharedBilingualLayoutToolbar.jsx](src/components/text/presentation/SharedBilingualLayoutToolbar.jsx)
   - Extended layout/level tooltip descriptions for `card`/`scene` and `passage`/`dialogue`, and updated the Part layout group `aria-label` to use `terms.lower` (`Part speaker turn layout (display only)`).
3. [SharedBilingualUnitsBody.jsx](src/components/text/presentation/SharedBilingualUnitsBody.jsx)
   - Added `UnitHeadingBlock` and open left speaker rails inside both `CardChannelFlowBody` (`separated`, `text-only`, `meaning-only`) and `CardInterlinearBody` (`interlinear` default), rendering speaker monograms, bold names, `Speaker Turn N`, `consecutive turn` cues on adjacent same-speaker Turns, live `Speaking`/`Paused` pills (`data-shared-turn-audible`), tasteful `Unassigned speaker` presentation, and preserved Empty Turn rows while keeping Paragraph styling unchanged.
4. [SharedPartAndSegmentViews.jsx](src/components/text/presentation/SharedPartAndSegmentViews.jsx)
   - Added `PartUnitIdentityHeader` across Horizontal Focus, Vertical Focus, and Vertical List; updated `PartSectionNavigator` to surface active speaker badges (`data-shared-part-nav-speaker`), color-coded Turn jump dots, speaker-aware `Follow` labels (`Playing Turn k (Name) · Follow`), and Scene Full notices; fixed `SharedCardSegmentView` fallback label (`unitTerms.label` instead of `'Section'`), added Turn-local line context (`Line i of M`), added the Speaker Spotlight header inside the focused Sentence card (`data-shared-segment-speaker-stage`), and stabilized responsive `order-*` Prev/Next mobile button wrapping.
5. [SharedParagraphCardReader.jsx](src/components/text/presentation/SharedParagraphCardReader.jsx)
   - Added `speakerAppearanceMap` and `sceneCast` (`data-shared-scene-cast`), Subtle Scene header tint, Scene Turn count display (including 1-Turn Scenes), Scene cast chips, and type-aware Scene Play / Expand / Full Scene pill wording (while keeping collapsed `'No speaker turns in this card yet.'` compatibility).
6. [TextSharedConversationReaderQaPreview.jsx](src/components/text/presentation/TextSharedConversationReaderQaPreview.jsx)
   - Upgraded the DEV-only QA harness (`?qa=shared-conversation-reader`) with Showcase vs Baseline fixture presets, Desktop / `375px` / `320px` frame toggles, Light / Dark mode toggle, `200% Text` scaling toggle, Search reveal trigger, `Reset View`, and live `TextConversationEditor` D4/D5 controls.

### New Verification Fixtures & Suites
- [conversation-ux-fixture.js](scripts/fixtures/shared-card-a4h/conversation-ux-fixture.js) — In-memory A4-H2 multi-scene Conversation fixture (`Barista`, `Maya`, `Tari`, unassigned speaker, consecutive Maya Turn, Empty Barista Turn, Duplicate EN with distinct ID meanings, Missing Meaning, multilingual CJK/umlaut + long URL tokens, Zero-Turn Empty Scene, and optional derived Full WAV).
- [audit-v603-p12-shared-card-a4h.mjs](scripts/audit-v603-p12-shared-card-a4h.mjs) — Node verification suite (`6/6` pass).
- [browser-cases.jsx](scripts/fixtures/shared-card-a4h/browser-cases.jsx) & [audit-v603-p12-shared-card-a4h-browser.mjs](scripts/audit-v603-p12-shared-card-a4h-browser.mjs) — Real headless Edge 157 interactive suite (`6/6` browser suites + `4/4` dev/prod gate routes + production exclusion verification).

### Protected Baseline Files Untouched
- Zero changes to [SharedConversationReader.jsx](src/components/text/presentation/SharedConversationReader.jsx), [textConversationReaderDomain.js](src/domain/text/textConversationReaderDomain.js), [TextConversationEditor.jsx](src/components/text/conversation/TextConversationEditor.jsx), [useConversationAudioPlayback.js](src/components/text/conversation/useConversationAudioPlayback.js), [TextSegmentInteraction.jsx](src/components/text/presentation/TextSegmentInteraction.jsx), [TextStructuredPlayer.jsx](src/components/text/TextStructuredPlayer.jsx), [textDatabaseConstants.js](src/constants/textDatabaseConstants.js), `src/App.jsx`, or `src/main.jsx`.

---

## 3. How Full / Part / Segment Support Speaker Turns

- **Full View (`level === 'full'`):**
  - Renders one cohesive Scene `<article>` with zero nested Turn or Sentence boxes.
  - Supports **Combined (default)**, **Separated** (speaker monogram, name, `Speaker Turn N`, and left accent rail shown in BOTH English and Indonesian dialogue blocks), **EN Only**, and **ID Only**.
  - Consecutive same-speaker Turns retain separate persistent Unit wrappers (`data-shared-card-unit`), headers, left accent rails, and quiet `· consecutive turn` indicators. Empty Turns remain explicitly visible; Zero-Turn Scenes remain rendered and non-playable.
- **Part View (`level === 'part'`):**
  - **Horizontal Focus:** Native `snap-x snap-mandatory` carousel (`1` Turn per slide), clear Speaker header & left speaker accent stripe, multi-sentence unclipped height, `inert` + `aria-hidden` offscreen slides, swipe settle sync, and arrow-key navigation.
  - **Vertical Focus:** Emphasized Focused Turn between Previous and Next Turn context cards, non-nested `Focus speaker turn` actions, and explicit `Start of scene` / `End of scene` boundaries.
  - **Vertical List:** All Turns stacked vertically with speaker stripes/monograms and distinct `Audible` vs `Selected` states.
  - All Part navigation surfaces `Speaker Turn k of N` + active speaker badge (`data-shared-part-nav-speaker`) and keeps manual browsing passive (`1,800 ms` manual grace + explicit `Follow`).
- **Segment Focus (`level === 'segment'`):**
  - Spotlight Sentence card includes a dedicated Speaker Attribution header (`[Monogram] Speaker · Speaker Turn k (i/m)`), Scene-wide `Sentence p of total`, Turn-local line position (`Line i of m`), honest host coverage badges, `Playing Full Scene audio · Browse freely` notice without faking active position, missing-meaning placeholder, passive Previous/Next/Jump navigation (with speaker dots), and explicit `Play Sentence` + `TextSegmentInteraction` activation.

---

## 4. Speaker Identity & Visual Consistency

- `getStableTurnSpeakerKey(unit)` derives identity strictly from persistent registry identifiers (`id:${unit.speakerId}` / `uid:${unit.speakerUid}`), never from mutable display labels or Turn indices.
- `buildCardSpeakerAppearanceMap(card)` collects unique keys, sorts lexicographically (invariant to Turn reordering and speaker renames), hashes deterministically via FNV-1a across the 6-color `SPEAKER_ACCENT_PALETTE`, and linearly probes collisions so speakers in the same Scene receive distinct hues.
- Renaming a speaker (`speaker.rename`) updates displayed names and initials (`Maya` -> `Maya Putri`, `'MP'`) while retaining the exact palette ID (`data-shared-turn-speaker-palette`). Reassigning a Turn (`contentUnit.update` `speakerId`) updates both label and palette cleanly. Unassigned Turns (`speakerId: null`, `speakerLabel: null`) render with dashed neutral avatars and italic `Unassigned speaker`.

---

## 5. Accessibility & Mobile Ergonomics

- **WCAG / Modern Web Standards:** `>= 44 px` minimum touch targets on mobile controls (`min-h-11`), logical `order-1 / order-2 / order-3` responsive flex wrapping so `Prev` and `Next` stay paired cleanly above Turn/Sentence pills at `375px` and `320px`, `lang={textLang}` / `lang={meaningLang}` per prose flow, wrapped long URL/CJK/umlaut tokens without horizontal overflow (`scrollWidth <= viewportWidth` at `320px`, `375px`, `1280px`, and `200%` text scaling), `:focus-visible` outlines, `motion-reduce:transition-none` & instant scroll under `prefers-reduced-motion: reduce`, `aria-hidden` decorative monograms, and `inert` offscreen horizontal slides preventing keyboard Tab focus leaks.
- **No Nested Interactive Elements:** Neighbor `Focus speaker turn` buttons sit in card headers completely outside inline `<TextSegmentInteraction>` buttons.

---

## 6. Verification Results (Executed in Series After Final Edit)

Environment: Node `24.11.1`, Vite `7.2.6`, Headless Microsoft Edge `157.0.0.0`, Windows; canonical constants confirmed `{ DB: 1, SCHEMA: 1, V2_SCHEMA: 2 }`.

### Lint, Build & Boundary Checks
- `npx eslint --max-warnings=0 src/components/text/presentation/ src/components/text/conversation/TextConversationEditor.jsx src/components/text/conversation/useConversationAudioPlayback.js src/domain/text/textCardPresentation*.js src/domain/text/textConversationReaderDomain.js src/services/persistence/textCardPresentationPreferenceService.js scripts/audit-v603-p12-shared-card-a*.mjs scripts/fixtures/shared-card-a1/ scripts/fixtures/shared-card-a2/ scripts/fixtures/shared-card-a3/ scripts/fixtures/shared-card-a4c/ scripts/fixtures/shared-card-a4h/` -> **PASS (`0 errors, 0 warnings`)**
- `npm run build` -> **PASS** (`1906` modules, `dist/assets/index-Dfn_xuY-.js`, `dist/assets/index-E2W4hf70.css`)
- `git diff --check` -> **PASS**

### Shared Card UI Suites (Node & Real Headless Edge 157)
- `node scripts/audit-v603-p12-shared-card-a1.mjs` -> **13 PASS, 0 FAIL** (`IndexedDB calls: 0`)
- `node scripts/audit-v603-p12-shared-card-a2.mjs` -> **10 PASS, 0 FAIL** (`IndexedDB calls: 0`)
- `node scripts/audit-v603-p12-shared-card-a3.mjs` -> **7 PASS, 0 FAIL** (`IndexedDB calls: 0`)
- `node scripts/audit-v603-p12-shared-card-a4c.mjs` -> **11 PASS, 0 FAIL** (`dbCalls: 0`)
- `node scripts/audit-v603-p12-shared-card-a4h.mjs` -> **6 PASS, 0 FAIL** (`dbCalls: 0`)
- `node scripts/audit-v603-p12-shared-card-a1-browser.mjs` -> **7 PASS, 0 FAIL** (`indexedDbCalls: 0`, `storageCalls: 0`)
- `node scripts/audit-v603-p12-shared-card-a2-browser.mjs --check-production` -> **8 PASS, 0 FAIL**, `4/4` gates, `qaPreviewAbsent: true`
- `node scripts/audit-v603-p12-shared-card-a3-browser.mjs --check-production` -> **8 PASS, 0 FAIL**, `4/4` gates, `qaPreviewAbsent: true`
- `node scripts/audit-v603-p12-shared-card-a4c-browser.mjs --check-production` -> **12 PASS, 0 FAIL**, `4/4` gates, `qaPreviewAbsent: true`
- `node scripts/audit-v603-p12-shared-card-a4h-browser.mjs --check-production` -> **6 PASS, 0 FAIL**, `4/4` dev/prod gates (`?qa=shared-conversation-reader` and `#qa-shared-conversation-reader`), `qaPreviewAbsent: true`, `indexedDbCalls: 0`, `storageCalls: 0`

### Ecosystem Regressions (D2 / D3 / D4 / D5 / P12 / Round-D3 / P9)
- `node scripts/audit-v603-p12d-d4c-browser.mjs --check-production` -> **13 PASS, 0 FAIL**, `4/4` gates, `qaPreviewAbsent: true`
- `node scripts/audit-v603-p12d-d5-ui-browser.mjs` -> **15 PASS, 0 FAIL** (`indexedDbCalls: 0`)
- `node scripts/audit-v603-p12d-d5-browser.mjs` -> **3 PASS, 0 FAIL** (`indexedDbCalls: 0`)
- `node scripts/audit-v603-p12d-d3d-browser.mjs` -> **9 PASS, 0 FAIL** (disposable QA DBs only)
- `node scripts/audit-v603-p12d-d4a-conversation-editor.mjs` -> **22 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d4b-conversation-editor-ui.mjs` -> **9 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d5-audio-ui.mjs` -> **5 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d5-conversation-audio.mjs` -> **15 PASS, 0 FAIL**
- `node scripts/audit-v603-p12b-speaker-registry.mjs` -> **14 passed, 0 failed**
- `node scripts/audit-v603-p12c-conversation-playback.mjs` -> **13 passed, 0 failed**
- `node scripts/audit-v603-p12d-d3b-content-unit-persistence.mjs` -> **11 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d3c-compatibility.mjs` -> **5 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-d3d-regression.mjs` -> **12 PASS, 0 FAIL**
- `node scripts/audit-v603-p12d-virtual-content-units.mjs` -> **12 PASS, 0 FAIL**
- `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs` -> **7 PASS, 0 FAIL**
- `node scripts/audit-v603-p9b-playback-marathon.mjs` -> **24 PASS, 0 FAIL**
- `node scripts/audit-v603-p9c-bulk-marathon.mjs` -> **17 PASS, 0 FAIL**
- `node scripts/audit-v603-beta8-p9-hf4d-navigation.mjs` -> **20/20 PASS**

### Historical Baseline Failures (Reproduced Separately, Unchanged)
- `audit-v603-beta8-p9-hf4a-card-ux.mjs` (PASS 1–9, fails on legacy regex `/setPlayingIndex\(step\.highlight \?/`)
- `audit-v603-beta8-p9-hf4c-r1-ui-repair.mjs` (expects version `6.0.3-beta.8-p9-hf4c-r1` vs `6.0.3-beta.8-p9-hf4d`)
- `audit-v603-d0-d1-text-identity.mjs` (pre-existing Table SHA-256 mismatch at line 229)
- `audit-v603-beta8-p9-hf5-voice-audio-ux.mjs` (PASS 1–9, `'David · US'` vs `/Browser TTS/` at line 834)

---

## 7. Preview & Screenshot Instructions

- **Interactive DEV Preview:**
  ```powershell
  npm run dev
  ```
  Open `http://localhost:5173/?qa=shared-conversation-reader` (or `/#qa-shared-conversation-reader`). Toggle between **Showcase Dialogue** and **D4-A Baseline**, switch view levels (`Full`, `Part`, `Segment`), test `Combined / Separated / EN Only / ID Only`, switch viewports (`Desktop Full`, `Mobile 375px`, `Narrow 320px`), `Dark Mode`, `200% Text`, `Reveal Search Target`, and live D4/D5 editor & playback actions.
- **Reproducible Edge Screenshot Capture:**
  ```powershell
  npm run build
  node scripts/audit-v603-p12-shared-card-a4h-browser.mjs --check-production --screenshots-dir="./tmp-a4h-shots"
  ```
  Visual screenshots verified in Edge across Desktop Full Dialogue, Mobile Separated (`390px`), Mobile Part Horizontal Focus (`390px`), Dark Mobile Part Vertical Focus (`390px`), and Desktop Segment Spotlight (`1024px`).

---

## 8. Known Limitations & Remaining A5 Scope

- **Isolated / Pre-Activation State:** Production `src/App.jsx` and canonical IndexedDB (`v1`) remain untouched; Conversation persistence (`v2`) and production Conversation activation remain gated until P12 cutover authorization.
- **Cached Full Timing:** Cached `full-local` audio continues to report Card/Scene-level precision without guessing intra-file timestamps; per-Sentence fallback cleanly upgrades precision to active Turn and Sentence.
- **Mixed Workspaces (P13):** Mixed interleaved Paragraph + Conversation reader UI remains intentionally excluded here (`UNSUPPORTED_WORKSPACE` guard preserved in `textConversationReaderDomain.js`).
- **Large Conversation Scenes (>6 Speakers):** If a future Scene has >6 distinct registered speakers, the 6-hue palette cycles gracefully while keeping names, monograms, and Turn numbers distinct.

---

## 9. Recommendation

**GO for A5** (within isolated/staged integration scope). The A4-H2 Shared Conversation Reader delivers distinct multi-speaker dialogue readability, full type-aware clarity, deterministic speaker identity, mobile/keyboard accessibility, and zero regressions across A1–A4-C1 and D2–D5 suites while respecting all architectural and database boundaries.
