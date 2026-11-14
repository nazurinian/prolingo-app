# ProLingo v6 — Performance Remediation & Reset Architecture Alignment Report

**Repository:** `nazurinian/prolingo-app`  
**Branch:** `fix/text-data-system-boundaries`  
**Baseline Commit:** `3dc80744e7fd641148436af0583f2309f5c48cfb` (from `Dropdown_Flicker_Performance_Audit.md` on `fcc8c17`)  
**Remediation Checkpoints:** `92285ea` (P1) → `6dc7e87` (P2) → `72727d8` (P3) → `e7115d1` (P4)  
**Live Browser Acceptance:** **PENDING** (real Chromium DevTools run still required by user)

---

## 1. Executive Summary

All four planned remediation waves (P1–P4) have been implemented, verified in Node (`v24.11.1`, `react` `19.2.0`, `react-dom/client`), and committed as separate checkpoints while preserving D0–D3, P9-B/C, P10 H1–H6, P11, Table mode, Legacy Text mode, SHA-256 identity contracts, and native `<select>` UI:

1. **P1 (`92285ea`) — Root `App.jsx` Dependency Decoupling & Domain Indexing:** Split single-profile Edge coverage dependencies from Bulk/Playback fields, gated heavy Batch coverage/plan memos when the Bulk popup is inactive (`allowEmpty` / lazy computation while keeping synchronous fallback when invoked closed), added a bounded LRU/FIFO cache (`4096` entries) in `textStructuredAudioRenderFingerprintDomain.js`, and replaced repeated linear `audioVariants` filtering with O(1) hash-map indexing in `textStructuredAudioCoverageDomain.js` and `textStructuredBulkGenerationDomain.js`.
2. **P2 (`6dc7e87`) — Voice Sorting Schwartzian Cache & Selector Memoization:** Replaced per-comparator `localeCompare` calls in `voicePresentationDomain.js` and `browserTtsVoicePresentationDomain.js` with `Intl.Collator` singletons, Schwartzian precomputed sort keys, and `WeakMap`/bounded signature caches that invalidate on length changes, array replacement, and in-place `.unavailable`/`.lang` mutations. Wrapped `GroupedVoiceSelect`, `EdgeVoiceOptgroups`, `BrowserTtsVoiceOptgroups`, `PlayerBrowserTtsControls`, `TextBatchPopup`, `TextStructuredAudioControls`, and `TextStructuredCardAudioPanel` selectors/subcomponents in `React.memo` with `useMemo`/`useCallback`, and fixed `GroupedVoiceSelect` to route Edge voice lists directly to `groupEdgeVoicesByRegion`.
3. **P3 (`72727d8`) — Card Audio Player Draft Stabilization:** Reconciled `playerDraft` in `TextStructuredCardAudioPanel.jsx` via a deterministic semantic baseline signature (`buildSavedPlayerBaselineSignature`) instead of object-identity `useEffect([block, segments])`. Eliminated double-commit on mount (`2` → `1` commit) and preserved unsaved Player edits across unrelated Download/coverage/snapshot identity updates while keeping the `Unsaved Draft` badge header row stabilized (`min-h-6 flex-nowrap`). Card/Segment Reset and `block.id` changes still reconcile cleanly.
4. **P4 (`e7115d1`) — Reset Architecture Alignment & Rate Null-Clamping Fix:** Converged Desktop/Mobile/Text Global Browser TTS Dropdown updates onto one shared `handleStructuredTextGlobalBrowserTtsVoiceChange` (`useCallback`) backed by `resolveTextStructuredVoicePreferencePatch` + `normalizeTextStructuredPreferences`, stabilized `useCallback` Reset handlers (`handleStructuredTextResetGlobalBrowserTts`, `handleStructuredTextResetGlobalPlaybackOnly`, `handleStructuredTextResetGlobalEdgeOnly`, `handleStructuredTextResetBulkOnly`, `handleStructuredTextResetWorkspaceDefault`) in `src/App.jsx`, removed unused `buildTextStructuredBatchSelection` import, and fixed a latent `Number(null) === 0` bug in `normalizeRate` (`src/domain/text/textStructuredPlaybackRateProfileDomain.js` and `src/domain/text/textStructuredPlaybackPreferenceDomain.js`) where picking `"Inherit (Default)"` (`null`/`""`) on Workspace/Speaker/Card/Segment speed selectors clamped `0` up to `0.5x` instead of clearing to inheritance (`null` / `1.0x`).

---

## 2. Before vs. After Performance Metrics

Measured against synthetic datasets (**Small:** `1×3×4 = 12` segs; **Medium:** `5×6×8 = 240` segs; **Heavy:** `10×10×10 = 1,000` segs, `500` existing variants, `2 EN + 1 ID` bulk voices, Split+Full = `3,300` bulk requirements) in `Node v24.11.1` + `React 19.2.0` (`React.Profiler` + FakeDOM mutation counters):

### 2.1 Voice Grouping & Sorting (`profile-dropdowns.mjs`)

| Operation & Dataset | Pre-P1 (`fcc8c17`)* Avg | Post-P4 (`e7115d1`) Avg | Speedup | `localeCompare` Calls |
|---|---:|---:|---:|---:|
| `groupBrowserTtsVoicesByRegion` (`25` voices) | `0.4725 ms` | **`0.0123 ms`** | **~38×** | `32` → **`0`** |
| `groupBrowserTtsVoicesByRegion` (`60` voices) | `2.0708 ms` | **`0.0217 ms`** | **~95×** | `185` → **`0`** |
| `groupEdgeVoicesByRegion` (`76` Edge voices) | `0.4691 ms` | **`0.0183 ms`** | **~26×** | `53` → **`0`** |

\* Pre-P1 figures from `Dropdown_Flicker_Performance_Audit.md` (`L67-69`); post-P4 measured after commit `e7115d1`.

### 2.2 Synchronous Domain Coverage & Bulk Planning

| Domain Computation | Pre-P1 (`fcc8c17`)* Avg | Post-P4 (`e7115d1`) Avg | Notes |
|---|---:|---:|---|
| `buildTextStructuredAudioCoverageMap` (`Small: 12 segs`) | `0.925 ms` | **`0.1226 ms`** | **~7.5× faster** |
| `buildTextStructuredAudioCoverageMap` (`Heavy doc: 100 segs`) | `18.665 ms` | **`0.921 ms`** | **~20× faster** |
| All-workspace `BatchCoverageMaps` (`Heavy: 1,000 segs, 500 variants`) | `183.740 ms` | **`12.0453 ms`** | **~15× faster**; also gated when Bulk popup is closed |
| `buildTextStructuredBulkGenerationPlan` (`Medium: 5×6×8`) | `51.634 ms` | **`10.6031 ms`** | **~4.9× faster** |
| `buildTextStructuredBulkGenerationPlan` (`Heavy: 10×10×10`, `3,300` reqs) | `333.777 ms` | **`44.0428 ms`** | **~7.6× faster**; isolated from non-Bulk dropdowns |
| `buildTextStructuredBulkExportPlan` (`Heavy: 10×10×10`) | `1.275 ms` | **`1.9686 ms`** | Executed only when Batch popup / export needs it |

\* Pre-P1 figures from `Dropdown_Flicker_Performance_Audit.md` (`L77-82`); post-P4 measured after commit `e7115d1`.

### 2.3 React 19 `Profiler` & DOM Mutation Telemetry (Post-P4 `e7115d1`)

| Harness | Pre-P1 Behavior (`fcc8c17`)* | Post-P4 Behavior (`e7115d1`) | Update DOM Churn (`created` / `removed`) |
|---|---|---|---|
| `GroupedVoiceSelect-Edge` (`1/9/57`) | Mount `7.89 ms`, updates `2.09–2.55 ms` | Mount `7.937 ms`, updates **`0.691 / 0.106 / 0.128 ms`** | `0` / `0` |
| `TableVoiceSelectors` (`4/20/81`) | Mount `12.26 ms`, updates `3.77–10.87 ms` | Mount `12.242 ms`, updates `5.52–12.738 ms` | `0` / `0` |
| `TextStructuredAudioControls` (`6/18/54`) | Mount `13.78 ms`, updates `6.87–7.00 ms` | Mount `12.673 ms`, updates `9.047 / 5.44 ms` | `0` / `0` (`textSet: 1`) |
| `TextStructuredCardAudioPanel-player` (`24/99/288`) | **2 mount commits (`67.10 ms`)**, **2 churn commits (`63.39 ms`)** | **1 mount commit (`40.666 ms`)**, **1 churn commit (`16.806 ms`)** | `0` / `0` (`churnDomOps` all `0`) |
| `TextStructuredCardAudioPanel-download` (`2/0/6`) | **2 mount commits (`19.26 ms`)**, **2 churn commits (`14.42 ms`)** | **1 mount commit (`10.64 ms`)**, **1 churn commit (`11.889 ms`)** | `0` / `0` (`churnDomOps` all `0`) |
| `TextStructuredCardAudioPanel-download-custom` (`4/11/65`) | Mount `19.85 ms`, update `11.97–12.88 ms` | Mount `17.021 ms`, update `11.282 ms` | `0` / `0` (`attrSet: 10`) |
| `TextBatchPopup` (`5/11/66`) | Mount `36.39 ms`, updates `25.71–34.18 ms` | Mount `51.564 ms`, updates `49.599 / 25.327 ms` | `0` / `0` |

\* Pre-P1 figures from `Dropdown_Flicker_Performance_Audit.md` (`L91-97`); `mountRenderCount` on both `TextStructuredCardAudioPanel` harnesses dropped from **`2`** to **`1`**, eliminating the `useEffect` double commit and draft reset on parent identity churn.

---

## 3. Reset Architecture Alignment Summary

Confirmed canonical pipeline across all Structured Text scopes:

`Dropdown / Reset -> Shared Preference Update -> Effective Preference Resolver -> Playback / Generation`

- **Global Browser TTS (`EN`/`ID` & Rates):** Both `Desktop/MobileSystemControls` and `TextStructuredAudioControls` (`TextGlobalVoiceSelect`) now route through `handleStructuredTextGlobalBrowserTtsVoiceChange` → `resolveTextStructuredVoicePreferencePatch` + `normalizeTextStructuredPreferences`. Reset (`GLOBAL_BROWSER_TTS`) restores canonical `null` / `1.0×` linked values through `normalizeTextStructuredPreferences` and persistence service `resetTextStructuredPreferences`, converging with `"Auto"` selection in `resolveTextStructuredBrowserVoiceState` (`Sonia` / `Gadis` or fallback).
- **Global Playback, Edge & Bulk:** Reset produces normalized state equivalent to manually choosing canonical defaults via the shared normalizers (`DEFAULT_TEXT_STRUCTURED_PREFERENCES` and `TEXT_STRUCTURED_GENERATION_DEFAULTS`), keeping Sonia/Gadis (`Edge`) vs Libby/Tuti (`Bulk`) separation intact and using stabilized `useCallback` Reset handlers in `App.jsx`.
- **Workspace, Speaker, Card & Segment:** `RESET_AUDIO_PREFERENCES` (`textLibraryCommandDomain.js`) and manual `"Inherit"` (`UPDATE_DOCUMENT` / `UPDATE_BLOCK` / `UPDATE_SEGMENT`) converge on identical resolved voices, rates, local pins, download voices, and playback orders across `resolveTextStructuredEffectiveVoiceProfile`, `resolveTextStructuredBrowserVoiceResolution`, `resolveTextStructuredEffectiveDownloadVoice`, `resolveTextStructuredEffectivePlaybackRate`, `resolveTextStructuredEffectiveCustomLocalVoice`, and `resolveTextStructuredEffectivePlaybackOrder`, while preserving protected metadata (`speakerRegistryV1`, `speakerIdentityV1`, `paragraphRoleV1`, `sentenceAuthoringV1`, `fullAudioArtifactsV1`, `externalSourceV1`, `externalEntityV1`).

---

## 4. Verification Results (Executed Post-`e7115d1`)

### 4.1 Automated Suites (`16/16` Scripts Passed — `130 PASS, 0 FAIL`)

- `scripts/audit-v603-round-d0-final-polish.mjs`: `8 PASS, 0 FAIL`
- `scripts/audit-v603-round-d0-closure-guards.mjs`: `4 PASS, 0 FAIL`
- `scripts/audit-v603-round-d0-f1-f2-patch.mjs`: `12 PASS, 0 FAIL`
- `scripts/audit-v603-round-d1-reset-preferences.mjs`: `3 PASS, 0 FAIL`
- `scripts/audit-v603-round-d2-reset-ui.mjs`: `7 PASS, 0 FAIL`
- `scripts/audit-v603-round-d3-paragraph-acceptance.mjs`: `7 PASS, 0 FAIL`
- `scripts/audit-v603-p9b-playback-marathon.mjs`: `24 PASS, 0 FAIL`
- `scripts/audit-v603-p9c-bulk-marathon.mjs`: `17 PASS, 0 FAIL`
- `scripts/audit-v603-p10-h1-h3-remediation.mjs`: `8 PASS, 0 FAIL`
- `scripts/audit-v603-p10-h4-playback-remediation.mjs`: `8/8 PASS` (`8 PASS, 0 FAIL`)
- `scripts/audit-v603-p10-h5-export-zip-remediation.mjs`: `11 PASS, 0 FAIL`
- `scripts/audit-v603-p11-provider-gateway.mjs`: `4 PASS, 0 FAIL`
- `scripts/audit-v603-p1-app-cascade.mjs`: `5 PASS, 0 FAIL` (`P1`: memoized SHA-256 cache eviction parity, coverage/bulk O(1) parity, `FOLLOW_PLAYER` gating, `App.jsx` dependency isolation, workspace selection scope)
- `scripts/audit-v603-p2-selector-memo.mjs`: `4 PASS, 0 FAIL` (`P2`: Edge & Browser cache hits/invalidation on length/array/flag mutations, React 19 Profiler `0` option DOM node churn, Schwartzian speed gate)
- `scripts/audit-v603-p3-card-draft.mjs`: `3 PASS, 0 FAIL` (`P3`: single-commit mount on Paragraph & Conversation panels, unsaved Player draft survival across parent identity churn & Download tab switches, Apply/Card Reset/Segment Reset/`block.id` switch reconciliation)
- `scripts/audit-v603-p4-reset-alignment.mjs`: `5 PASS, 0 FAIL` (`P4`: Dropdown vs Reset equivalence across Global Browser TTS/Playback/Edge/Bulk and Workspace/Speaker/Card/Segment hierarchies, rate `null` inheritance parity, `App.jsx` shared handler/callback convergence)

### 4.2 Build & ESLint Status

- **`npm run build`:** Passed after `e7115d1` (`vite build`, `1893 modules transformed`, `✓ built in 7.39s`).
- **Focused ESLint (`16` touched domain/selector/panel/audit files):** `0 errors, 0 warnings` across `voicePresentationDomain.js`, `browserTtsVoicePresentationDomain.js`, `textStructuredAudioRenderFingerprintDomain.js`, `textStructuredAudioCoverageDomain.js`, `textStructuredBulkGenerationDomain.js`, `textStructuredAudioDownloadProfileDomain.js`, `textStructuredPlaybackRateProfileDomain.js`, `textStructuredPlaybackPreferenceDomain.js`, `GroupedVoiceSelect.jsx`, `PlayerBrowserTtsControls.jsx`, `TextBatchPopup.jsx`, `TextStructuredCardAudioPanel.jsx`, `audit-v603-p1-app-cascade.mjs`, `audit-v603-p2-selector-memo.mjs`, `audit-v603-p3-card-draft.mjs`, and `audit-v603-p4-reset-alignment.mjs`.
- **`src/components/text/TextStructuredAudioControls.jsx` ESLint:** `9 problems (4 errors, 5 warnings)` — all pre-existing (`edgeEnglish`, `edgeMeaning`, `folderLocked`, `edgeStatusBadge` unused vars; `documentTree` `exhaustive-deps` warnings).
- **`src/App.jsx` ESLint:** `171 problems (109 errors, 62 warnings)` — pre-existing repo lint debt (zero new errors/warnings introduced by P1/P4 edits).

---

## 5. Manual Chrome Acceptance Checklist (**PENDING**)

Chrome DevTools live attachment was unavailable in the CLI environment; execute the following manual checks in real desktop Chrome (`http://localhost:5173/`) before closing acceptance:

1. **Table & Global Text Dropdown Responsiveness:** Switch EN/ID Browser TTS and Edge TTS voices `5×` rapidly; verify popup dismissal has no composite flash, sidebar scroll stays pinned, and React DevTools Profiler commit times stay crisp without long main-thread stalls even on multi-workspace collections.
2. **Card Audio Modal Draft & Scroll Stability:** Open a 10+ segment Card → edit Player Card or Segment voice (`Unsaved Draft` appears without header line-wrap jump) → switch to Download tab (`Custom`) and pick a Download voice → return to Player tab and confirm unsaved Player edits and modal scroll position remain intact.
3. **Dropdown `"Inherit"` Speed & Reset Equivalence:** Set a Workspace or Speaker speed override to `1.4×`, switch back to `"Inherit (Default)"` in the dropdown and confirm normal `1.0×` playback speed (verifying the P4 `normalizeRate(null)` fix), then repeat using Reset and verify identical behavior and preserved Staging/Full audio artifacts.
