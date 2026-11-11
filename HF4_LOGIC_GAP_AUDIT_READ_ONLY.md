# ProLingo v6-beta (HF4) — Phase 2 Logic Gap Audit (Read-Only)

- **Repository:** `nazurinian/prolingo-app`
- **Branch:** `v6-beta` (`v6.0.3-beta.8-p9-hf4d`)
- **Audit Scope:** Strictly **READ-ONLY** behavioural and architectural inspection. None of the domain, service, or state-machine gaps documented below were modified during Phase 1 UI/UX refinement.

---

## Executive Summary of Identified Logic Gaps

| # | Audit Area | Severity | Summary of Confirmed Logic Gap |
|---|---|---|---|
| 1 | Full vs Split Navigation Semantics | **Medium** | Starting playback via a segment's `From here` button on segment 2+ of a Card sets `group.wholeBlock = false`, which disables the Card's Full Audio artifact (`allowFullArtifact: false`) on that first Card even when `playbackRepresentationMode === 'full'`. |
| 2 | Prev/Next & Manual Toggle Behaviour | **Medium** | (a) Clicking `Play Card` (`handleStructuredTextPlayCard`) while that same Card is already playing restarts the Card instead of toggle-stopping it (unlike `handleStructuredTextPlaySegment`). (b) Pressing `Prev`/`Next` during active `CARD` or `SEGMENT` manual playback converts the session into `DOCUMENT` scope (`handleStructuredTextNavigate`). |
| 3 | Stop/Resume vs Natural Completion | **Medium** | In `textStructuredPlaybackSessionService.js`, `onPlaybackCursor` updates `structuredTextResumeCursorRef.current` during `CARD` and `SEGMENT` manual runs, but `onPlaybackCompleted` is only called for `DOCUMENT` and `FROM_HERE` scopes. Manual Card/Segment playback therefore overwrites the document resume cursor and leaves it at the manual target after natural completion. |
| 4 | Sequential & Shuffle Traversal | **Low / Medium** | On multi-pass repeat (`TWICE` / `LOOP`), `overrideValid` in `textStructuredPlaybackSessionService.js` is gated by `pass === 0`. Consequently, Shuffle mode re-shuffles the Card order on pass 2+ instead of preserving the frozen shuffle order across repeat passes. |
| 5 | Card & Segment Playback Inheritance | **High** | `CUSTOM_LOCAL` (`audioSourceMode === 'custom-local'`) is respected in Split playback (`playStructuredTextChannel` in `App.jsx`), but is **ignored in Full playback** (`resolveStructuredTextBlockChannelPlaybackPlan` → `buildTextStructuredBlockRuntimePlaybackPlan`), which only consults `globalPlaybackOrder` and never `resolveTextStructuredCustomLocalAudioVoice`. |
| 6 | Full/Split Fallback & Readiness Badges | **High** | Workspace and Card header `READY X/Y` badges (`summarizeTextStructuredAudioCoverage`) evaluate **Split segment variants only** against the **Edge download target voice** (`resolveTextStructuredEffectiveDownloadVoice`), NOT against `globalAudioPlaybackOrderV1` or Full Card artifacts (`fullAudioArtifactsV1`). A Card can play 100% locally in Full mode or via a #1 priority voice while its header badge still reports `MISSING`. |
| 7 | Full + Split (Both) Generation Feasibility | **Medium** | (a) Persisted defaults in `TEXT_STRUCTURED_GENERATION_DEFAULTS` remain `bulkGenerateSplit: true, bulkGenerateFull: false` and `bulkExportRepresentation: 'split'` rather than `Both`. (b) Single-card `GENERATE MISSING` (`handleStructuredTextGenerateCardAudio`) only generates Split segment jobs, never Full Card artifacts. (c) Bulk generation (`buildTextStructuredBulkGenerationPlan`) skips Conversation cards (`isP5EligibleBlock`). |
| 8 | Audio Download, Export, Import, ZIP & Staging | **Medium** | (a) Bulk Export (`buildTextStructuredBulkExportPlan`) filters Ready audio by `matchesCurrentRenderProfile` (`preferences.edgeRate`/`edgePitch`), causing previously generated Ready audio to show `0 Ready` for export if the user later adjusts the rate/pitch sliders. (b) Legacy `handleStructuredTextExportFullCardAudio` synthesizes a client-side WAV from Split blobs rather than exporting the P2/P5 Full MP3 artifact from Staging. |
| 9 | UI State & Playback Engine Desynchronisation | **Low / Medium** | `activeCursorSegmentId` passed to `TextStructuredPlayer` and `BottomPlayerBar` reads from `structuredTextResumeCursorRef.current?.segmentId` (a React ref, not state) alongside `playbackContextRef.current`. While usually masked by accompanying `isPlaying`/`currentIndex` state updates, ref mutations alone do not schedule a React re-render. |
| 10 | Regressions / Drift in Earlier HF4 Scripts | **Low** | `audit-v603-beta8-p9-hf4a-card-ux.mjs` check 10 asserts `/setPlayingIndex\(step\.highlight \?/` against `textStructuredPlaybackSessionService.js`, which HF4-D (`9610ac2`) changed to optional chaining `setPlayingIndex(step?.highlight ?`. |

---

## Detailed Technical Findings

### 1. Full vs Split Navigation Semantics

- **Files & Lines:**
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L30-L43) (`buildScopedBlockGroups`)
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L196-L201) (`resolveBlockChannelPlaybackPlan` call)
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3646-L3649) (`handleStructuredTextStartFromSegment`)
- **Behavioural Analysis:**
  - When Global Play starts (`handlePlayerGlobalPlay`, `scope: DOCUMENT` with `cursorSegmentId`), `scopedList` contains the entire document, so `group.wholeBlock` is `true` for every Card, and Full mode starts at `cursorGroupIndex` playing the full Card artifact from segment 1.
  - However, when the user clicks `From here` on segment 2 or later of a Card (`handleStructuredTextStartFromSegment`), `scope` is `TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE`. `resolveStructuredTextPlaybackScopeList` slices the list starting at `startSegmentId`, so the first Card in `scopedList` is missing segment 1.
  - `buildScopedBlockGroups` computes `wholeBlock = fullBlockItems.every(item => scopedIds.has(item.id))` (`false` for that first Card) and passes `allowFullArtifact: group.wholeBlock` (`false`).
  - **Result:** In Full mode, clicking `From here` on sentence #2 of Card 1 forces Card 1 into Split/TTS fallback for its remaining sentences, then switches to Full Card artifacts starting at Card 2.

---

### 2. Prev/Next Behaviour & Manual Play Toggle

- **Files & Lines:**
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3612-L3644) (`handleStructuredTextPlaySegment` vs `handleStructuredTextPlayCard`)
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3692-L3741) (`handleStructuredTextNavigate`)
- **Behavioural Analysis:**
  1. **Missing Toggle-Stop on Card Play:**
     - `handleStructuredTextPlaySegment` (lines 3613–3620) explicitly checks if `isPlaying && playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && playbackContextRef.current?.scope === SEGMENT && playingIndex === segmentId`, and calls `forceStopAll()` to toggle-stop.
     - `handleStructuredTextPlayCard` (lines 3629–3644) has **no toggle-stop check**. Clicking the Card header Play button (or `Play EN` / `Play ID`) while that Card is already playing immediately restarts the Card from the beginning instead of stopping it.
  2. **Scope Promotion on Prev/Next During Manual Play:**
     - If a user starts a manual `CARD` or `SEGMENT` session and then clicks `Prev` or `Next` in the bottom Global Player (`handleStructuredTextNavigate`), `startStructuredTextPlaybackSession` is invoked with `scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT` (line 3728), silently promoting a single-card/single-segment manual session into full-document playback.

---

### 3. Stop/Resume vs Natural Completion

- **Files & Lines:**
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L189-L194) (Full mode `onPlaybackCursor`)
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L254-L259) (Split mode `onPlaybackCursor`)
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L330-L338) (`onPlaybackCompleted`)
- **Behavioural Analysis:**
  - Every step in `executeStructuredTextPlaybackSessionService` calls `onPlaybackCursor({ documentId, segmentId, blockId, orderedList })` regardless of `scope` (`DOCUMENT`, `FROM_HERE`, `CARD`, or `SEGMENT`).
  - In `App.jsx` (lines 3592–3594), `onPlaybackCursor` unconditionally overwrites `structuredTextResumeCursorRef.current`.
  - When a session finishes naturally (`!shouldStop(...)` at line 330), `onPlaybackCompleted` is only called when `scope === DOCUMENT || scope === FROM_HERE`.
  - **Result:** If a user stops Global Playback at Card 2 (`structuredTextResumeCursorRef` = Card 2), then clicks a manual sentence in Card 5 (`scope: SEGMENT`), `structuredTextResumeCursorRef` is overwritten to Card 5 and is *not* reset when the sentence finishes. Pressing the bottom Global Play button afterwards (`resumeMode: 'continue'`) resumes Global Playback from Card 5 instead of Card 2.

---

### 4. Sequential and Shuffle Traversal

- **Files & Lines:**
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L131-L144)
- **Behavioural Analysis:**
  - Inside the `for (let pass = 0; pass < repeatLimit; pass += 1)` loop:
    ```js
    const overrideValid = pass === 0 && Array.isArray(orderedListOverride) ...
    ```
  - On `pass === 0`, if `orderedListOverride` was supplied (e.g. from prior navigation in Shuffle mode), it is used; otherwise `resolveStructuredTextPlaybackOrder` shuffles the Cards with `anchorId: cursorId`.
  - On `pass >= 1` (`REPEAT_MODES.TWICE` or `REPEAT_MODES.LOOP`), `overrideValid` becomes `false` and `resolveStructuredTextPlaybackOrder` is called again with `anchorId: null`, generating a **new random Card permutation on every repeat pass** and overwriting `playbackContextRef.current.orderedList`.

---

### 5. Card and Segment Playback Inheritance (`CUSTOM_LOCAL` in Full Mode)

- **Files & Lines:**
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3241-L3260) (`resolveStructuredTextBlockChannelPlaybackPlan`)
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3376-L3424) (`playStructuredTextChannel`)
  - [`src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L194-L289) (`buildTextStructuredBlockRuntimePlaybackPlan`)
- **Behavioural Analysis:**
  - When the user selects `CUSTOM (Pin Local Voice)` in the Audio Sidebar (`preferences.audioSourceMode === 'custom-local'`), `playStructuredTextChannel` (used for Split playback) calls `resolveTextStructuredCustomLocalAudioVoice` and plays the pinned local voice (or falls back to Browser TTS).
  - However, `resolveStructuredTextBlockChannelPlaybackPlan` (used for Full playback) calls `buildTextStructuredBlockRuntimePlaybackPlan` without passing `audioSourceMode` or `customLocalVoiceId`. `buildTextStructuredBlockRuntimePlaybackPlan` only checks `globalTtsOnly` and `resolveTextStructuredRuntimePlaybackOrder`.
  - **Result:** Switching to `CUSTOM (Pin Local Voice)` in the Audio Sidebar has no effect on Full Card artifact selection when `playbackRepresentationMode === 'full'`.

---

### 6. Full/Split Fallback and Local Audio Readiness Badges

- **Files & Lines:**
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3179-L3197) (`structuredTextAudioCoverageMap`, `structuredTextDocumentCoverage`)
  - [`src/domain/text/textStructuredAudioCoverageDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioCoverageDomain.js#L41-L165) (`buildTextStructuredAudioCoverageMap`, `summarizeTextStructuredAudioCoverage`)
  - [`src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L304-L360) (`summarizeTextStructuredWorkspacePlaybackReadiness`)
- **Behavioural Analysis:**
  - The domain layer actually has a representation-aware function `summarizeTextStructuredWorkspacePlaybackReadiness` in `textStructuredRuntimePlaybackPlanDomain.js`, which checks Full artifacts when `representationMode === 'full'` and uses `globalPlaybackOrder`.
  - However, `App.jsx` (lines 3179–3197) computes `structuredTextAudioCoverageMap` and `structuredTextDocumentCoverage` using `buildTextStructuredAudioCoverageMap` and `summarizeTextStructuredAudioCoverage` from `textStructuredAudioCoverageDomain.js`.
  - `buildTextStructuredAudioCoverageMap` checks **only Split segment `audioVariants`** and requires them to match `resolveTextStructuredEffectiveDownloadVoice` (the Edge generation target voice, e.g., `SoniaNeural`).
  - **Result:**
    1. If a user generated Bulk Audio with `LibbyNeural` (default Bulk EN voice) and added `LibbyNeural` to their Local Voice Priority, `structuredTextDocumentCoverage` and Card header `READY X/Y` badges still evaluate against `SoniaNeural` (default manual Edge voice) and display `MISSING` (`OTHER_VOICE`) even though playback is 100% local Ready!
    2. If a user generated `Full Only` audio (so `fullAudioArtifactsV1` is Ready on every Card, with 0 Split variants), the Card and Workspace headers still report `READY 0/N • MISSING N` even when the player is in `FULL` mode!

---

### 7. Full + Split (Both) Generation Feasibility

- **Files & Lines:**
  - [`src/domain/text/textStructuredAudioGenerationDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L18-L32) (`TEXT_STRUCTURED_GENERATION_DEFAULTS`)
  - [`src/domain/text/textStructuredBulkGenerationDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredBulkGenerationDomain.js#L19-L20) (`isP5EligibleBlock`)
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4525-L4545) (`handleStructuredTextGenerateCardAudio`)
- **Behavioural Analysis:**
  1. **Domain Default is Split-Only:** In `TEXT_STRUCTURED_GENERATION_DEFAULTS`, `bulkGenerateSplit` defaults to `true`, `bulkGenerateFull` defaults to `false`, and `bulkExportRepresentation` defaults to `'split'` (enforced by `audit-v603-beta8-p5-bulk-generation.mjs` and `audit-v603-beta8-p6-bulk-export.mjs`). Making `Full + Split (Both)` the default for fresh profiles will require updating `TEXT_STRUCTURED_GENERATION_DEFAULTS` (and bumping `TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION`) in a future domain phase.
  2. **Single-Card Audio Panel Generates Split Only:** `handleStructuredTextGenerateCardAudio` in `App.jsx` uses `buildTextStructuredGenerationJobs`, which only creates Split segment jobs (`representation` is not configurable per-card in `handleStructuredTextGenerateCardAudio`). Full Card Edge artifacts can currently only be generated via `TextBatchPopup` (`Bulk Audio`).
  3. **Conversation Cards Skipped in Bulk Audio:** `isP5EligibleBlock` in `textStructuredBulkGenerationDomain.js` restricts Bulk Audio (`Split` and `Full`) to `blockType === 'paragraph'`, skipping `conversation` blocks (`skippedConversationBlockCount`).

---

### 8. Audio Download, Export, Import, ZIP, and Staging Consistency

- **Files & Lines:**
  - [`src/domain/text/textStructuredBulkExportDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredBulkExportDomain.js#L39-L47) (`matchesCurrentRenderProfile`)
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L4676-L4706) (`handleStructuredTextExportFullCardAudio`)
- **Behavioural Analysis:**
  1. **Strict Rate/Pitch Filter on Bulk Export:** `buildTextStructuredBulkExportPlan` filters both Split variants and Full artifacts through `matchesCurrentRenderProfile(descriptor, preferences)`, requiring `descriptor.rate` and `descriptor.pitch` to match the current `generationPreferences.edgeRate` and `edgePitch`. If a user generates audio at `0%` rate and later changes the `Download Rate` slider in the sidebar to `+10%`, Bulk Export (`exportCoverage.uniquePhysicalReady`) drops to `0` for those files even though they are physically present in Staging and playable at runtime.
  2. **Unused Legacy WAV Concatenation Handler:** `handleStructuredTextExportFullCardAudio` in `App.jsx` (lines 4676–4706) builds a client-side concatenated WAV (`buildDerivedTextFullAudioWav`) from Split blobs rather than reading the canonical P2/P5 Full MP3 artifact from Staging. (It is no longer wired to the simplified Card Audio UI, which delegates scope exports to Bulk Audio.)

---

### 9. Potential UI State and Playback Engine Desynchronisation

- **Files & Lines:**
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3222-L3225) (`structuredTextResumeCursorRef`)
  - [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6622-L6628) & [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L6769-L6771)
- **Behavioural Analysis:**
  - `activeCursorSegmentId` and `textActiveCursorSegmentId` are computed during render from `playbackContextRef.current` and `structuredTextResumeCursorRef.current`. Because both are `useRef` objects rather than React `useState`, mutating `structuredTextResumeCursorRef.current` (for example inside `onPlaybackCompleted` or `handleStructuredTextNavigate` when stopped) relies on an accompanying state change (`currentIndex`, `playingIndex`, or `isPlaying`) to trigger a component re-render. Storing the active document cursor in React state (synchronized with a ref for async callbacks) would guarantee deterministic UI updates even when navigating while stopped.

---

### 10. Regressions / Drift in Earlier HF4 Patch Scripts

- **Files & Lines:**
  - [`scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-beta8-p9-hf4a-card-ux.mjs#L82-L83)
  - [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L207)
- **Behavioural Analysis:**
  - In commit `9610ac2` (`HF4-D`), line 207 of `textStructuredPlaybackSessionService.js` was updated from `setPlayingIndex(step.highlight ? ...)` to `setPlayingIndex(step?.highlight ? ...)`, which causes the older `audit-v603-beta8-p9-hf4a-card-ux.mjs` regex `/setPlayingIndex\(step\.highlight \?/` to fail.
  - Additionally, historical checkpoint scripts (`p7-ui-simplification`, `p7-hf2`, `p7-hf3`, `hf4a`, `hf4c`, `hf4c-r1`) assert their own historical `APP_VERSION` strings (`6.0.3-beta.8-p7`, `6.0.3-beta.8-p9-hf4c`, etc.) against `src/constants/appMetadata.js` and `package.json` (`6.0.3-beta.8-p9-hf4d`).

