# ProLingo v6 — Dropdown Flicker & Render Performance Audit

**Repository:** `nazurinian/prolingo-app`  
**Branch:** `fix/text-data-system-boundaries`  
**Audited Baseline:** `fcc8c17` (P11)  
**Comparison Checkpoints:** `7ab50b6` (P10-H6) → `b475f38` (D0-F1/F2) → `033c83a` (D0 Final Polish) → `60aa021` (D2 Reset UI) → `fcc8c17` (P11)  
**Scope:** Strictly **READ-ONLY audit**. Zero production source (`src/`), persistence, schema, or test files modified.

---

## 1. Executive Verdict

**Confirmed Performance & Flicker Causes (Not a single bug — a compounded 3-layer stall + layout/commit cascade):**

1. **No Wholesale `<select>` Option Teardown on Value Change (Hypothesis Ruled Out for Same-Engine Switches):**  
   React 19 DOM reconciliation keeps existing `<optgroup>` and `<option>` elements mounted in-place (`0` created / `0` removed) when changing selected voice values within the same dropdown—*except* when a fallback `"Unavailable · ..."` `<option>` mounts/unmounts, or when switching Engine/Audio Source/Export Policy conditionally mounts/unmounts an entire selector block (`DesktopSystemControls.jsx:61,69`, `Sidebar.jsx:239,246`, `TextBatchPopup.jsx:905,911`).
2. **Primary Cause of Visible Stutter/Flicker During Selection (`P1`):**  
   Changing **almost any** voice dropdown or checkbox in Text Mode (`Global Browser TTS`, `Edge TTS`, `Workspace/Speaker/Card Audio`, or `Bulk Audio`) synchronously invalidates `App.jsx`'s overly broad `structuredTextDownloadResolutionPreferences` memo (`src/App.jsx:909-916`) and root `MainApp` props. At realistic collection scale (`10 workspaces × 10 cards × 10 segments`, `500` variants, `2 EN + 1 ID` bulk voices), this triggers **~537 ms of synchronous pure-JS SHA-256 fingerprint recomputation** (`183.74 ms` in `buildTextStructuredAudioCoverageMap` across workspaces + `333.78 ms` in `buildTextStructuredBulkGenerationPlan`) *plus* un-memoized UI re-renders (`7–34 ms` per component) **before the browser can paint the post-selection frame**. Blocking the main thread after native `<select>` `change` stalls OS dropdown dismissal and composite paint, producing visible popup flash/tear and sluggish UI response.
3. **O(N log N) Comparator & Un-Memoized Optgroups Regression (`b475f38` + `033c83a`, `P1`):**  
   `groupBrowserTtsVoicesByRegion` (`src/domain/audio/browserTtsVoicePresentationDomain.js:221-309`) and `groupEdgeVoicesByRegion` (`src/domain/audio/voicePresentationDomain.js:207-269`) allocate label/locale/country helpers and invoke `String.prototype.localeCompare(..., 'en', { sensitivity: 'base', numeric: true })` **inside the `.sort((a, b) => ...)` comparator**, slowing grouping by **41×–253×** vs `7ab50b6` (`0.0057–0.0115 ms` → `0.469–2.071 ms` per call). Because `EdgeVoiceOptgroups`, `BrowserTtsVoiceOptgroups`, `GroupedVoiceSelect` (`src/components/common/GroupedVoiceSelect.jsx`), and their host panels have no `React.memo`/`useMemo`, **all mounted `<select>` controls**—including those hidden inside closed `<details>` tags and `24` simultaneous selects on the Card Audio Player tab—re-run this sorting and virtual DOM construction on every single interaction.
4. **Card Audio Panel Cascading Double-Render & Draft Clobbering (`P1`):**  
   `TextStructuredCardAudioPanel.jsx:249-251` runs `useEffect(() => { setPlayerDraft(buildInitialPlayerDraft(block, segments)); }, [block, segments]);`. Because `resolveTextLibraryDocumentTree` (`src/domain/text/textLibraryDomain.js:560-609`) allocates fresh `block` and `segments` object/array identities on every `textLibrarySnapshot` change, **Card Audio commits twice on initial mount** (`39.42 ms + 27.68 ms = 67.10 ms` on a 10-segment card) and **twice on every snapshot update** (`30.72 ms + 32.67 ms = 63.39 ms`), while **overwriting unsaved Player draft changes** and toggling the conditional `Unsaved Draft` header badge.

### Verification Scope Note
- **Verified in Node (`React 19.2.0` + `React.Profiler` + DOM Mutation Counters + Domain Microbenchmarks):** Exact execution timings, `.localeCompare` call counts, `Profiler` commit phases (`mount` vs `update`), `actualDuration`/`baseDuration`, and DOM `createElement`/`appendChild`/`removeChild` counts executed on unmodified `src/` modules via an isolated scratch harness in the artifact `scratch/` folder.
- **Unverified in Live Chromium (`Blocked by Environment`):** Live Chrome DevTools MCP automation (`mcp_chrome_devtools_list_pages`) could not attach because `DevToolsActivePort` does not exist (`C:\Users\HikamSeif\AppData\Local\Google\Chrome\User Data\DevToolsActivePort` ENOENT — Chrome remote debugging not enabled, and page interaction DevTools MCP tools were not active in the session toolset). Consequently, real Chromium CLS scores, native `<select>` OS-popup paint compositing frames, `scrollTop` deltas under user scrolling, and live heap snapshots remain **unmeasured** and are explicitly listed in the Manual Acceptance Checklist (Section 8).

---

## 2. Historical Checkpoint Regression Matrix

Git history verified across `7ab50b6..fcc8c17`:

| Checkpoint | Summary | Dropdown / Render Performance Impact | Root Cause Introduced |
|---|---|---|---|
| `7ab50b6` (P10-H6) | Consolidated P10 baseline | **Fast baseline.** `groupVoicesByRegion` (`src/utils/audioUtils.js`) performed O(N) bucketing without `.sort(localeCompare)` (`0.0057–0.0115 ms`). Bulk/Card/Sidebar used fewer `EdgeVoiceOptgroups` mounts. | None |
| **`b475f38` (D0-F1/F2)** | Shared Browser TTS grouping & `EdgeVoiceOptgroups` | **First regression step.** Added `browserTtsVoicePresentationDomain.js` calling `formatBrowserTtsVoiceLabel` + `localeCompare(..., { sensitivity: 'base', numeric: true })` inside `.sort()` (**83×–253× slower** for Browser TTS). Added `<EdgeVoiceOptgroups>` across `TextBatchPopup`, `BatchPopup`, `TextStructuredAudioControls`, and `TextStructuredCardAudioPanel`. Positive offset: `TextBatchPopup` telemetry (`TextBatchLiveTelemetry`) moved to `useSyncExternalStore`, avoiding polling re-renders during active generation. | **Primary UI & Browser-sort regression** |
| **`033c83a` (D0 Final Polish)** | Unified Voice Sorting & Edge Compatibility `edgeVoices` state | **Main Edge & `App` cascade inflection point.** Rewrote `voicePresentationDomain.js` with `compareVoicesWithinGroup` (`extractEdgeVoiceLocaleInfo` + `getEnglishRegionCountryName` + `localeCompare` inside `.sort()`, **41× slower** for 76 Edge voices). Wired `[edgeVoices]` and `{ ...structuredTextAudioGenerationPreferences, edgeVoices }` into `App.jsx`'s `structuredTextDownloadResolutionPreferences`, `structuredTextBulkGenerationPlan`, and `tableAudioVoiceOptions`. | **Primary Edge-sort & `App` memo cascade regression** |
| `c0d9717` → `60aa021` (D0 Closure + D1 + D2) | Scoped Edge guards, Reset UI/dialogs, Card `includeMissingFullByBlockId` | Added extra per-channel validation (`opVoiceValidation`) and reset confirmation UI branches inside `TextBatchPopup`, `TextStructuredAudioControls`, and `TextStructuredCardAudioPanel`, increasing render cost per update slightly, but **did not alter grouping or `App` coverage loops**. | Minor additive render work |
| `b190927` → `fcc8c17` (D3 + P11) | Regression suite + P11 Audio Provider Gateway domain/service | `git diff 60aa021..fcc8c17 -- src/components src/App.jsx` shows **zero UI dropdown, sorting, or `App` memo wiring changes** (note P11 touches domain/gateway service layers, not selector rendering). | **Not the source of dropdown flicker** |

---

## 3. Selector Inventory & Mount/Update Behaviour

| Surface | Component & File | Selector Type & Grouping | Mounted `<select>` / `<optgroup>` / `<option>` (Measured) | Mount/Unmount Behaviour on Value Change | Animation / Disable Pulse |
|---|---|---|---|---|---|
| **Table Player (Browser TTS)** | `PlayerBrowserTtsControls.jsx:1-84` (`GroupedVoiceSelect.jsx`) | `<GroupedVoiceSelect>` (EN + optional ID + Global Rate) | Measured with `DesktopSystemControls` (below) | Reuses DOM nodes in place; inserts/removes 1 `<option>` only when `missingSavedValue` clears. | None during voice switch |
| **Table Edge / Gemini** | `DesktopSystemControls.jsx:60-76`, `MobileSystemControls.jsx:60-76` | `<GroupedVoiceSelect>` (2 Edge or 1 Gemini) | Combined Table harness (`2` Browser + `2` Edge): `4` selects, `20` optgroups, `81` options | In-place update when changing EN/ID Edge voice (`0` created/removed); **unmounts/remounts wrapper `<div>` with `animate-in fade-in zoom-in-95 duration-200`** when switching `gemini` ↔ `edge`. | 200 ms fade+zoom on Engine toggle; same in `Sidebar.jsx:239,246` on Audio Source toggle |
| **Text Global Browser TTS** | `TextStructuredAudioControls.jsx:78-98` (`TextGlobalVoiceSelect`) | `<BrowserTtsVoiceOptgroups>` (EN + ID) + per-instance `dedupeBrowserTtsVoices` | Playback tab initial mount (`2` speakers, `25` mock Browser voices): **`6` selects, `18` optgroups, `54` options** | `<option>`/`<optgroup>` reused in place (`0` created/removed). **Closed HTML `<details>` (`L373`, `L571`, `L627`, `L646`) still mounts `<select>` children eagerly in React.** | Switching Playback/Edge/Library subtabs mounts/unmounts tab sections |
| **Workspace Narrator & Speakers** | `TextStructuredAudioControls.jsx:57-76, 520-660` (`VoiceSelect`, `DownloadPresetSelect`) | `<BrowserTtsVoiceOptgroups>`, `<EdgeVoiceOptgroups>` (Global Edge, Custom Preset, Speaker overrides) | Adds `2` Edge selects in closed `<details>` on Download tab (`2` more per speaker) + Custom selects | Switching Workspace Preset from `default` → `custom` conditionally mounts `<select>` with `<EdgeVoiceOptgroups>`; Speaker `<details>` mounts eagerly. | Helper/fallback banners (`L262`) conditionally shift vertical flow |
| **Header Workspace Switcher** | `Header.jsx:79` | Native `<select>` | 1 per header (`N` workspaces) | Reuses DOM nodes, **temporarily sets `disabled={textLibraryCommandBusy}`** (`App.jsx:7078`) across `runTextLibraryUiCommand` IndexedDB load. | `disabled:opacity-50` brief pulse on workspace switch |
| **Card Audio — Player Tab** | `TextStructuredCardAudioPanel.jsx:137-153, 838-950` | `VoiceSelect` → `<BrowserTtsVoiceOptgroups>` (Card + Speakers + **all** Segments) | 10-segment / 2-speaker Card (`25` voices): **`24` selects, `99` optgroups, `288` options** | Reuses DOM nodes in place (`0` DOM churn), **but double-renders (`mount` + `update`) via `useEffect([block, segments])` and re-sorts 24× per render**. | Conditional `Unsaved Draft` badge (`L644`) + fallback warning alerts; modal root `.prolingo-text-audio-sheet` animates `200ms` on open only |
| **Card Audio — Download Tab** | `TextStructuredCardAudioPanel.jsx:155-182, 1150-1325` | `DownloadPresetSelect` + conditional `EdgeVoiceSelect` (`<EdgeVoiceOptgroups>`) | Default preset (`showSegments=false`): `2` selects, `6` options; Custom Card preset: **`4` selects, `11` optgroups, `65` options** (plus `2 × segments` more when `Segment overrides` expanded) | Toggling `Custom` or `Show Segment overrides` mounts `<EdgeVoiceOptgroups>` selects; changing card download voice updates `block` ref → **double-render via Player `useEffect([block, segments])`**. | Multi-line Edge compatibility warnings (`L1381`) shift footer/scroll geometry |
| **Bulk Audio Popup** | `TextBatchPopup.jsx:213-218, 756-920` (fallback in `BatchPopup.jsx:201,207`) | Multi-voice button chips + 2 Global Edge `<details>` selects + 2 conditional Export selects (`<EdgeVoiceOptgroups>`) | **`5` selects, `11` optgroups, `66` options** (with `exportVoicePolicy === 'selected'`) | Closed `<details>` (`L748`) still mounts 2 `<EdgeVoiceOptgroups>` selects. Toggling `exportVoicePolicy` mounts/unmounts Export `<EdgeVoiceOptgroups>` selects. | Conditional `data-text-bulk-generate-blocked-reason` warning (`L825`) |

---

## 4. Measured Benchmark & React `Profiler` Evidence

All timings below were directly measured on Windows (Node `v24.11.1`, `react` `19.2.0`, `react-dom/client`) against the unmodified `fcc8c17` source modules (plus `git show 7ab50b6:src/utils/audioUtils.js` loaded purely in-memory for historical comparison). Synthetic datasets: **Small** (`1×3×4` = `12` segs), **Medium** (`5×6×8` = `240` segs), **Heavy** (`10×10×10` = `1,000` segs, `500` existing variants, `2 EN + 1 ID` bulk voices, Split+Full = `3,300` bulk plan requirements).

### 4.1 Grouping & Sorting Regression (`groupBrowserTtsVoicesByRegion` / `groupEdgeVoicesByRegion`)

| Function & Dataset | Baseline (`7ab50b6`) Avg | Current (`fcc8c17`) Avg | Slowdown Factor | `String.prototype.localeCompare` Calls / Render Pass |
|---|---:|---:|---:|---:|
| `groupBrowserTtsVoicesByRegion` (`25` Browser voices) | `0.0057 ms` | **`0.4725 ms`** | **~83×** | `0` → **`32`** |
| `groupBrowserTtsVoicesByRegion` (`60` Browser voices) | `0.0082 ms` | **`2.0708 ms`** | **~253×** | `0` → **`185`** |
| `groupEdgeVoicesByRegion` (`76` `initialEdgeVoices`) | `0.0115 ms` | **`0.4691 ms`** | **~41×** | `0` → **`53`** |

**Why:** Every comparator invocation `(a, b)` inside `.sort(...)` re-runs label extraction, region inference, and `Intl`-backed `.localeCompare(keyB, 'en', { sensitivity: 'base', numeric: true })` (`browserTtsVoicePresentationDomain.js:276-306`, `voicePresentationDomain.js:178-205`), plus `O(selects)` multiplication across un-memoized `<select>` trees (`24×` on Card Audio Player = `~11.3 ms` in sorting comparators alone even with only `25` voices!).

### 4.2 Root `App` Synchronous Domain Recomputation (`structuredTextDownloadResolutionPreferences` Cascade)

| Pure Domain Computation (Fired Synchronously on Preference Change) | Measured Avg Time | Evaluated Scale |
|---|---:|---|
| `buildTextStructuredAudioCoverageMap` (Small: 1 doc, 12 segs) | `0.925 ms` | `12` segs |
| `buildTextStructuredAudioCoverageMap` (Heavy single doc: 100 segs) | **`18.665 ms`** | `100` segs (>1 frame budget alone) |
| `structuredTextBatchCoverageMaps` (`App.jsx:1124-1135`, Heavy collection) | **`183.740 ms`** | `10×10×10` (`1,000` segs, `500` variants) |
| `buildTextStructuredBulkGenerationPlan` (Medium collection) | **`51.634 ms`** | `5×6×8`, Split+Full |
| `buildTextStructuredBulkGenerationPlan` (Heavy collection) | **`333.777 ms`** | `10×10×10`, `3,300` requirements |
| `buildTextStructuredBulkExportPlan` (Heavy collection) | `1.275 ms` | `10×10×10`, Split+Full |
| **Combined `App` Synchronous Memo Cascade (Heavy `10×10×10`)** | **~537.5 ms** | **Triggered even by Browser TTS or Bulk checkbox change!** |

**Why it scales poorly:** Every slot calls `buildTextStructuredAudioRenderFingerprint` (`src/domain/text/textStructuredAudioRenderFingerprintDomain.js:46-54`) → `buildCanonicalSha256Fingerprint` (`src/domain/text/textCanonicalFingerprintDomain.js:38-78`), executing pure-JS SHA-256 bit-mixing + `Uint8Array`/`Uint32Array(64)` allocations + `canonicalJsonStringify` (object key sorting) synchronously on the UI thread, alongside linear scans over `audioVariants` (`textStructuredAudioCoverageDomain.js:104-113`, `textStructuredBulkGenerationDomain.js:323`).

### 4.3 React 19 `Profiler` Commit Timings & DOM Mutation Telemetry

| Component Harness | Selects / Optgroups / Options | Mount (`actualDuration`) | Update (`actualDuration`) | In-Place Value Update DOM Churn (`created` / `removed`) | Notes |
|---|---:|---:|---:|---|---|
| `GroupedVoiceSelect` (1× Edge list) | `1 / 9 / 57` | `7.89 ms` | `2.09 – 2.55 ms` | `0 / 0` (`attrSet: 0, textSet: 0`) | Note: `L74` routes Edge objects through `groupVoicesByRegion` (Browser grouping) instead of `groupEdgeVoicesByRegion`. |
| `TableVoiceSelectors` (`PlayerBrowserTtsControls` + `DesktopSystemControls`) | `4 / 20 / 81` | `12.26 ms` | `3.77 – 10.87 ms` (Browser switch `6.44 ms`, Edge switch `10.87 ms`) | `0 / 0` | Re-sorts all 4 selects even when only 1 changes. |
| `TextStructuredAudioControls` (Playback tab, 2 speakers) | `6 / 18 / 54` | `13.78 ms` | `6.87 – 7.00 ms` | `0 / 0` (`textSet: 1`) | Closed `<details>` mounts selects eagerly; `VoiceSelect` re-dedupes inside each instance (`L70`). |
| `TextStructuredCardAudioPanel` — **Player tab** (10 segs, 2 spks) | **`24 / 99 / 288`** | **`39.42 ms` + `27.68 ms`** (`2` commits = **`67.10 ms`**) | **`30.72 ms` + `32.67 ms`** (`2` commits = **`63.39 ms`**) on tree identity update | `0 / 0` | **Double commit confirmed** via `useEffect([block, segments])` (`L249-251`). Re-runs `groupBrowserTtsVoicesByRegion` + `dedupeBrowserTtsVoices` `24×` per commit. |
| `TextStructuredCardAudioPanel` — **Download Default** | `2 / 0 / 6` | `12.26 ms` + `7.00 ms` (`2` commits = `19.26 ms`) | `7.20 ms` + `7.22 ms` (`2` commits = `14.42 ms`) | `0 / 0` | Hidden Player `useEffect` double commit STILL fires while user is on Download tab! |
| `TextStructuredCardAudioPanel` — **Download Custom** | `4 / 11 / 65` | `19.85 ms` (`+` effect pass) | `11.97 – 12.88 ms` | `0 / 0` (`attrSet: 10`) | Expanding `Segment overrides` multiplies `<EdgeVoiceOptgroups>` selects by `2 × segments`. |
| `TextBatchPopup` (`medium` dataset, `selected` export) | `5 / 11 / 66` | `36.39 ms` | `25.71 – 34.18 ms` | `0 / 0` | Re-runs `groupEdgeVoicesByRegion` in body (`L213-218`) + renders 4+ `<EdgeVoiceOptgroups>` selects (2 in closed `<details>`). |

---

## 5. Deep Root-Cause Breakdown

### 5.1 Root `App.jsx` State & Memoization Bottlenecks (`P1`)
1. **Over-coupled `structuredTextDownloadResolutionPreferences` (`src/App.jsx:909-916`):**
   - Spreads `...structuredTextAudioGenerationPreferences` (which holds `bulkTextVoiceIds`, `bulkMeaningVoiceIds`, `bulkGenerateSplit`, `bulkGenerateFull`, `generateText`, `generateMeaning`, `exportFormat`, `exportVoicePolicy`, `exportTextVoiceId`, `exportMeaningVoiceId`, `edgeTextVoiceName`, `edgeMeaningVoiceName`, `edgeRate`, `edgePitch`) **together with** `playbackTextVoiceName`, `playbackMeaningVoiceName`, and `edgeVoices`.
   - Changing a **Browser TTS playback voice** (`textStructuredPreferences`) recreates `structuredTextDownloadResolutionPreferences` → forces `structuredTextAudioCoverageMap`, `structuredTextBatchCoverageMaps` across ALL workspaces, `structuredTextBatchSelection`, `structuredTextBulkGenerationPlan`, and `structuredTextBulkExportPlan` to recompute even though Edge download fingerprints do not depend on Browser TTS unless a block/segment specifically uses `FOLLOW_PLAYER` mode!
   - Changing **Bulk Audio checkboxes** (`bulkTextVoiceIds`, `bulkGenerateFull`, `exportFormat`, etc.) likewise mutates `structuredTextAudioGenerationPreferences` → recreates `structuredTextDownloadResolutionPreferences` → forces `structuredTextAudioCoverageMap` and `structuredTextBatchCoverageMaps` (all-workspace coverage) to recompute unnecessarily, even though coverage maps represent the *current single-profile Download/Play resolution*, NOT Bulk multi-voice matrices!
2. **Unstable Props & Zero Component Boundaries (`src/App.jsx:6857-7080`):**
   - `structuredTextBatchControls` (`L6857-6907`) and `structuredTextAudioSidebarControls` (`L6998-7043`) are freshly allocated object literals on every `MainApp` render with inline arrow handlers (`onGlobalBrowserTtsVoiceChange`, `onGenerationPreferencesChange`, `onScopeChange`, etc.).
   - `App.jsx:1150` recreates `{ ...structuredTextAudioGenerationPreferences, edgeVoices }` inline for `structuredTextBulkGenerationPlan` rather than memoizing the bulk-plan preference slice cleanly.
   - Changing **Table** Browser TTS (`setSelectedVoice`/`setSelectedIndonesianVoice`) or Edge TTS (`setEdgeVoice`/`setEdgeIndonesianVoice`) updates state inside the monolithic `7,402`-line `MainApp`, re-rendering `MainApp` and all open panels/sidebars synchronously.

### 5.2 Shared Voice Selector & Sorting Bottlenecks (`P1`)
1. **Comparator Allocation & Repeated `Intl` `localeCompare` (`browserTtsVoicePresentationDomain.js:276-306`, `voicePresentationDomain.js:178-268`):**
   - Neither grouping utility precomputes `{ sortCountry, sortName }` sort keys once per item (`Schwartzian transform`), nor caches sorted grouped results keyed by `(voicesRef, context)` (`WeakMap` or component `useMemo`).
   - With `60` browser voices, a single `groupBrowserTtsVoicesByRegion` call triggers `185` `localeCompare` calls + repeated regex string replacements inside `.sort()`.
2. **Redundant `dedupeBrowserTtsVoices` Calls Inside Child Helpers (`TextStructuredAudioControls.jsx:70,92`, `TextStructuredCardAudioPanel.jsx:144`):**
   - `TextStructuredAudioControls` already memoizes `englishVoiceOptions` / `indonesianVoiceOptions` (`L210-211`), yet `VoiceSelect` and `TextGlobalVoiceSelect` call `dedupeBrowserTtsVoices(voices)` again per selector instance. `TextStructuredCardAudioPanel` never memoizes `dedupeBrowserTtsVoices(englishVoices)` / `(indonesianVoices)` at the panel level at all—running it `24+` times per commit!
3. **`GroupedVoiceSelect` Calls Browser Grouper for Edge Lists (`GroupedVoiceSelect.jsx:74`):**
   - `GroupedVoiceSelect` detects `isEdgeVoiceList` at `L84` to format labels with `formatEdgeVoiceLabel`, **after** line `74` already called `groupVoicesByRegion` (aliased to `groupBrowserTtsVoicesByRegion` in `audioUtils.js:81`), instead of `groupEdgeVoicesByRegion`.
4. **Eager Mounting Inside Closed `<details>` (`TextStructuredAudioControls.jsx`, `TextBatchPopup.jsx`):**
   - Native HTML `<details>` keeps `<select>` + `<EdgeVoiceOptgroups>` / `<BrowserTtsVoiceOptgroups>` mounted and actively reconciled in React even when collapsed (`Global Edge Defaults` in `TextBatchPopup.jsx:748`; `Workspace` / `Speakers` in `TextStructuredAudioControls.jsx`).

### 5.3 Card Audio Panel Draft Sync, Effects & Layout Geometry (`P1`)
1. **Unconditional `useEffect` Draft Reset (`TextStructuredCardAudioPanel.jsx:245-251`):**
   ```js
   const savedPlayerBaseline = useMemo(() => buildInitialPlayerDraft(block, segments), [block, segments]);
   const [playerDraft, setPlayerDraft] = useState(() => buildInitialPlayerDraft(block, segments));
   useEffect(() => {
     setPlayerDraft(buildInitialPlayerDraft(block, segments));
   }, [block, segments]);
   ```
   - `resolveTextLibraryDocumentTree` always returns newly-allocated `block` and `segments` arrays (`textLibraryDomain.js:560-609`).
   - Consequences:
     - Guaranteed **double commit** on initial mount (`67.10 ms` total on Player tab) and on any external `textLibrarySnapshot` change (`63.39 ms`).
     - Any non-Player mutation (e.g., changing Card Download Preset/Edge voice on the Download tab, or background variant/staging state refresh) **clobbers unsaved `playerDraft` edits** back to baseline.
2. **Inline Per-Segment Resolution in Render (`TextStructuredCardAudioPanel.jsx:918-926, 1194-1212`):**
   - Computes `resolveTextStructuredEffectiveVoiceProfile` (`×2` channels per segment) and `resolveTextStructuredEffectiveDownloadVoice` (`×2` channels per segment, *even while `showSegments === false` and `Segment overrides` is collapsed!*) inline on every render.
3. **Modal Viewport & Geometry Isolation (`useStableOverlayViewport.js`, `index.css`):**
   - **Verified clean:** `useLiveOverlayViewportRef(true)` attaches only on `[open]` / `visualViewport` resize, so dropdown changes do *not* re-run viewport measurement or restart `.prolingo-text-audio-sheet animate-in fade-in zoom-in-95 duration-200`.
   - **Layout-shift contributors inside modal:** Conditional rendering of the `Unsaved Draft` pill in the sticky header (`L644-648`) when `isPlayerDirty` toggles, and multi-line fallback / unavailable Edge voice alert banners (`resolution.fallbackUsed`, `hasUnavailableCardPlaybackEdgeVoice`, `hasUnavailableMissingEffectiveCardEdgeVoice`) that push lower controls vertically.
   - Note also a potential UX conflict: native `<select>` inside `.prolingo-text-audio-sheet` works cleanly while open, *except* when synchronous post-change React commits exceed 1–3 frames or when fallback/warning elements shift container height immediately under the pointer/scroll position.

### 5.4 Harmless Work vs Expensive Stalls / Flash Risks

| Category | Observed Mechanism | Severity |
|---|---|---|
| **Expensive Synchronous CPU Stall** | `structuredTextBatchCoverageMaps` (`183.7 ms`) + `structuredTextBulkGenerationPlan` (`333.8 ms`) synchronous pure-JS SHA-256 recomputation triggered by unrelated Browser TTS or Bulk UI selections (`App.jsx:909-1166`). | **P1 — High** |
| **O(N log N) Comparator + Un-memoized Optgroup Multiplication** | `groupBrowserTtsVoicesByRegion` (`83×–253×` slower) & `groupEdgeVoicesByRegion` (`41×` slower) running inside `.sort()` across `6–24+` un-memoized `<select>` mounts (`TextStructuredCardAudioPanel`: `30–39 ms/render`, `TextBatchPopup`: `26–36 ms/render`). | **P1 — High** |
| **Card Audio `useEffect([block, segments])` Double-Commit & Clobber** | Doubles every Card Audio mount (`67.1 ms`) & parent snapshot update (`63.4 ms`) and discards unsaved Player drafts on Download/snapshot updates (`TextStructuredCardAudioPanel.jsx:249-251`). | **P1 — High** |
| **Conditional Container `animate-in` / Header Busy Pulse / Warning Banner Shift** | 200ms fade+zoom when toggling Engine/Source (`DesktopSystemControls.jsx:61,69`, `Sidebar.jsx:239,246`), `Header.jsx:79` `disabled:opacity-50` across workspace switch, and conditional warning/badge insertions in Card/Bulk panels. | **P2 — Medium** |
| **Memory Allocation Churn (Not Persistent Leak)** | Transient `Uint8Array`, `Uint32Array`, sorted string keys, and React elements GC'd per interaction. No persistent leak observed in DOM node counts (`0` orphaned `<option>`/`<optgroup>` nodes in React updates). Live Chrome heap snapshot not run (environment-blocked). | **Low (GC Churn Only)** |
| **Harmless React Behavior** | In-place `<select value>` attribute reconciliation on an isolated `GroupedVoiceSelect` (`0` DOM element recreation, `~2.1 ms` if memoized), `useLiveOverlayViewportRef` resize listeners, P11 `TextBatchLiveTelemetry` `useSyncExternalStore` updates. | **Harmless** |

---

## 6. Recommended Minimal Fix Plan (Architectural Proposals — Not Applied Yet)

1. **Schwartzian Precompute + `WeakMap`/Memo Caching in Presentation Domains (Zero UI Behaviour Change):**
   - Precompute `{ sortCountry, sortName, formattedLabel, optionValue }` once per voice **before** calling `.sort(...)` in `browserTtsVoicePresentationDomain.js` and `voicePresentationDomain.js` (avoid `.localeCompare` option object allocations/regex inside the comparator, or use a reusable `Intl.Collator('en', { sensitivity: 'base', numeric: true }).compare` on precomputed keys).
   - Cache grouped structures in a module-level `WeakMap` keyed by `voices` array ref + `context` (ensuring compatibility with mutable/immutable voice lists, e.g., checking `(voicesRef, context)` when `voices` is replaced immutably by `applyEdgeVoiceCompatibilityResult`).
2. **Memoize Optgroup Components & Shared Voice Subtrees (`GroupedVoiceSelect.jsx` + Consumers):**
   - Wrap `EdgeVoiceOptgroups`, `BrowserTtsVoiceOptgroups`, and `GroupedVoiceSelect` in `React.memo` and `useMemo(..., [voices, context, includeEngineHint, disableUnavailable])`.
   - Fix `GroupedVoiceSelect.jsx:74` to route `isEdgeVoiceList === true` through `groupEdgeVoicesByRegion` instead of `groupBrowserTtsVoicesByRegion`.
   - Deduplicate Browser TTS lists once in `TextStructuredCardAudioPanel` (via `useMemo`) instead of per-select inside `VoiceSelect`, and only render `Segment overrides` `<EdgeVoiceOptgroups>` + download resolution rows inside `TextStructuredCardAudioPanel` when `showSegments === true`. Consider lazy-rendering closed `<details>` `<EdgeVoiceOptgroups>` children (using `onToggle` state) in `TextStructuredAudioControls` and `TextBatchPopup`, or relying on `React.memo` + O(N log N) cache so closed `<details>` cost near `0 ms` on parent updates.
3. **Decouple `App.jsx` Coverage, Bulk Generation Plan, and Export Plan Dependencies:**
   - Split `structuredTextDownloadResolutionPreferences` (`App.jsx:909-916`) so it **only** includes fields that actually affect Edge download coverage (`edgeTextVoiceName`, `edgeMeaningVoiceName`, `edgeRate`, `edgePitch`, `edgeVoices`, plus `playbackTextVoiceName`/`playbackMeaningVoiceName` ONLY if needed for `FOLLOW_PLAYER`, or separate playback vs download preference memos). Crucially, exclude bulk-only fields (`bulkTextVoiceIds`, `bulkMeaningVoiceIds`, `bulkGenerateSplit`, `bulkGenerateFull`, `exportFormat`, `exportVoicePolicy`, `exportTextVoiceId`, `exportMeaningVoiceId`).
   - Only recompute `structuredTextBatchCoverageMaps` / `structuredTextBulkGenerationPlan` / `structuredTextBulkExportPlan` when **Bulk popup (`isBatchOpen`) is open** or an active batch run needs it (or cache segment render-fingerprint calculations in a `WeakMap` / content-hash-indexed memo so switching an unrelated Browser TTS or Export dropdown reuses previously computed SHA-256 render fingerprints without re-hashing 1,000+ strings!).
   - Wrap `StructuredPlayerCard` (`TextStructuredPlayer.jsx:74`) and sidebar/panel props (`structuredTextAudioSidebarControls`, `structuredTextBatchControls`) cleanly or stabilize handler callbacks via `useCallback` + `useMemo` where child `React.memo` boundaries depend on them.
4. **Fix `TextStructuredCardAudioPanel` Draft Sync Effect (`TextStructuredCardAudioPanel.jsx:245-251`):**
   - Key the draft reset strictly on `block?.id` (plus a deterministic content/voice signature of saved player fields, *not* raw `block`/`segments` object references), or reconcile only when `block.id` changes or `savedPlayerBaseline` values actually change — preserving unsaved Player edits across Download tab actions and eliminating the 2nd commit on mount and snapshot churn.
   - Reserve a fixed-width slot or compact inline indicator for `Unsaved Draft` if header wrapping occurs on mobile widths.

---

## 7. Regression Risks & Non-Regression Guards

Fixing these bottlenecks touches hot UI/memo paths; preserve the following invariants explicitly covered in Rounds D0–D3 & P11:
- **Edge Voice Compatibility Guards (`D0` / `D0 Closure`):** `applyEdgeVoiceCompatibilityResult` returns a new `edgeVoices` array when marking a voice `unavailable: true`; any cache on `groupEdgeVoicesByRegion` MUST key by array reference (e.g. `WeakMap<Array, ...>`) or include `unavailable` flags so `Unavailable ·` labels and disabled states stay immediately accurate.
- **Scoped Reset & Draft State (`D1` / `D2`):** Fixing `TextStructuredCardAudioPanel`'s `useEffect` must still reset `playerDraft` immediately when switching cards (`block.id` changes) OR when Reset (`onResetCardAudioPreferences` / `onResetSegmentAudioPreferences`) mutates the saved playback fields on the active `block`! A serialized signature of saved player fields (card + speaker + segment playback voice IDs) handles both without double-firing on unrelated Download/variant updates.
- **Bulk Live Progress & Selection (`P5` / `P6` / `D0`):** Preserve `TextBatchLiveTelemetry` (`useSyncExternalStore`) isolation; if deferring `structuredTextBatchCoverageMaps` / `structuredTextBulkGenerationPlan` until `isBatchOpen`, ensure Toolbar/Bulk trigger actions (`startBatch` / `export` handlers) still have valid plans when invoked or initialize synchronously on popup open.
- **Table & Legacy Isolation (`HF6` / `C.1`):** Do not change `tableAudioVoiceOptions` filtering, Table playback priority reconciliation, or `BrowserTtsVoiceOptgroups` / `EdgeVoiceOptgroups` option `value` keys or sorting rules.
- **Audio Provider Gateway (`P11`):** Keep gateway/manifest/capabilities boundaries untouched (`fcc8c17`).

---

## 8. Browser & Automated Acceptance Checklist

Because Chrome DevTools live attachment was unavailable in this audit environment, run these checks in real desktop Chrome (`http://localhost:5173/`) both **before** and **after** applying any fix patch:

1. **Table Mode Dropdowns (`Browser TTS` & `Edge TTS`):**
   - Switch EN and ID Browser TTS voices `5×` rapidly: verify `<option>` popup closes crisply without composite flash, sidebar scroll stays pinned, and React DevTools Profiler commit time drops below `< 5 ms`.
   - Switch Edge EN/ID voices `5×` cleanly: confirm `< 5 ms` commit and no unexpected `gemini`↔`edge` container re-animation.
2. **Text Mode Global & Workspace Controls:**
   - With a multi-workspace Collection (`>= 5` workspaces, `>= 50` cards), switch **Global Browser TTS EN/ID** and **Global Edge EN/ID**: verify main thread (`Performance` → Long Tasks) stays **under 25 ms** (down from `>500 ms` SHA-256 cascade) and active `<select>` keeps keyboard focus.
3. **Card Audio Modal (`TextStructuredCardAudioPanel`):**
   - Open on a 10+ segment card: verify single-commit mount (`no double render`), switch Player Card voice → confirm `Unsaved Draft` appears without shifting modal scroll (`scrollTop` delta = `0`).
   - Switch to **Download** tab (`Custom` voice), modify Card Download voice → verify **no Player draft loss** and **no scroll jump** inside `.prolingo-text-audio-sheet`.
   - Trigger **Reset Card Audio Preferences**: verify saved baseline signature cleanly syncs `playerDraft` back to default.
4. **Bulk Audio Popup (`TextBatchPopup`):**
   - Open on a multi-workspace Collection, toggle `Bulk EN` / `Bulk ID` voice chips and switch `Global Edge Defaults` + `Export voice` (`Auto` ↔ `Selected Voice`): measure interaction-to-next-paint (`INP < 50 ms`) and CLS (`0.00`).
5. **Automated Regression Gate After Any Fix:**
   - Re-run existing D0–D3 + P11 audit scripts (`scripts/audit-v603-round-d0-closure-guards.mjs`, `audit-v603-round-d1-reset-preferences.mjs`, `audit-v603-round-d2-reset-ui.mjs`, `audit-v603-round-d3-paragraph-acceptance.mjs`, and P11 test suite) plus add React `Profiler` commit-count + WeakMap cache invalidation tests for `GroupedVoiceSelect` and `TextStructuredCardAudioPanel`.
