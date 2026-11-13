# Round D3 — Paragraph Final Regression & Acceptance Preparation Report

**Branch:** `fix/text-data-system-boundaries`  
**D2 Baseline Commit:** `60aa021`  
**Production Release Classification:** **AUTOMATED PASS / READY FOR MANUAL BROWSER ACCEPTANCE** (No production code changes required in D3; real browser IndexedDB/WebAudio/SpeechSynthesis verification remains `MANUAL BROWSER PENDING`)

---

## 1. Acceptance Matrix

| Area | Verification Scope | Status | Evidence |
|---|---|---|---|
| Paragraph Derivation & Taxonomy | `resolveTextWorkspaceType`, `buildTextStructuredFullTextPair` (`joinAfter` EN/ID), Title + Paragraph card roles, protected metadata (`paragraphRoleV1`, `sentenceAuthoringV1`, `fullAudioArtifactsV1`, `externalSourceV1`) | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#1), `audit-v603-round-c-taxonomy.mjs`, `audit-v603-beta8-p2-split-full-domain.mjs` |
| Split & Full Runtime Playback | `FULL_LOCAL` vs Hybrid Split fallback vs `FULL_TTS` fallback, Global `TTS_ONLY`, custom local pinning, MediaSession metadata & Clear-on-Stop | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#2), `audit-v603-p9b-playback-marathon.mjs`, `audit-v603-p10-h4-playback-remediation.mjs`, `audit-v603-beta8-p3-runtime-playback.mjs` |
| Navigation & Shuffle | Card-level Full Next/Prev vs sentence-level Split Next/Prev, frozen card-level Shuffle, `FROM_HERE` mid-card slice | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#2), `audit-v603-beta8-p9-hf4d-navigation.mjs`, `audit-v603-p10-h1-h3-remediation.mjs` |
| Browser TTS Hierarchy & Chrome Indonesian Default | `Segment > Card Speaker > Doc Speaker > Card > Doc > Global`, Full-mode Segment override suppression, `Google Bahasa Indonesia` preferred over Windows Andika, compact grouped `<optgroup>` selectors | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#2, #6), `audit-v603-round-d0-final-polish.mjs`, `audit-v603-round-d0-f1-f2-patch.mjs`, `audit-v603-p10-h4-playback-remediation.mjs` |
| Card Audio, D2-C Missing Full & Bulk Generation | Default Split `GENERATE MISSING`, D2-C `buildTextStructuredCardMissingFullRequirements` (OFF by default, skips Ready/Stale/Conversation), Bulk Split+Full RF deduplication & unavailable Edge blocking scoped to active work | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#3), `audit-v603-round-d2-reset-ui.mjs`, `audit-v603-round-d0-closure-guards.mjs`, `audit-v603-beta8-p5-bulk-generation.mjs` |
| Export, Portable ZIP v2 & Staging GC | Ready Card Full MP3 export (`EN Full MP3`/`ID Full MP3`), `buildStoredZipBlob` -> `scanTextStructuredAudioZipFiles` v2 round-trip, Stale/orphan exclusion, two-DB atomic rollback, Staging physical GC | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#4), `audit-v603-p9c-bulk-marathon.mjs`, `audit-v603-p10-h5-export-zip-remediation.mjs`, `audit-v603-a4-staging-gc.mjs`, `audit-v603-beta8-p4-staging-zip.mjs`, `audit-v603-beta8-p6-bulk-export.mjs` |
| Reset Preferences, UI Confirmation & Sync | D1 domain/command builders + D2 `SafetyConfirmDialog` gates (`Playback`, `Global Browser TTS`, `Global Edge Sonia/Gadis 0%/0Hz`, `Bulk Libby/Tuti Split`, `Workspace`, `Speakers`, `Card`, `Segment`), ZIP-busy fail-closed guard, playback stop sync | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#5, #6), `audit-v603-round-d1-reset-preferences.mjs`, `audit-v603-round-d2-reset-ui.mjs` |
| Table, Legacy Text & DB Schema Isolation | `TEXT_LIBRARY_DB_VERSION === 1`, `AUDIO_STAGING_DB_VERSION === 1`, Legacy refusal on structured Reset/Bulk/Folder, empty Legacy workspace audio clear, Table keys & deck behavior preserved | **AUTOMATED PASS** | `audit-v603-round-d3-paragraph-acceptance.mjs` (#7), `audit-v603-round-a-d1-d4.mjs`, `audit-v603-round-b-d2-d3.mjs`, `audit-v603-round-c-taxonomy.mjs`, `audit-v603-round-c1-legacy-empty-audio.mjs` |
| Production Bundle Build (`vite build`) | Production client transform & bundle emission (`1891` modules) | **AUTOMATED PASS** | `npm run build` (`7.45s`) |
| Historical Pre-Beta9 Regex Audits | Two older source-regex scripts (`audit-v603-beta4-runtime-ux.mjs`, `audit-v603-beta8-p7-ui-simplification.mjs`) asserting removed Beta4/Beta7 UI markers (`data-text-global-tts-only`, etc.) | **PRE-EXISTING FAIL (Non-Blocking)** | Historical Beta4/Beta7 assertions superseded by Beta9/P10/D0 UI consolidation; remaining historical scripts (`beta6`, `beta8-p7-hf1/2/3`, `beta8-p9-hf4a/c/r1/5`, `d0-d1-text-identity`) were not part of D3 execution |
| Live Browser E2E Verification | Real Chromium/Android WebView execution: IndexedDB persistence across reload, live Edge `/api/tts` audio synthesis, Chromium async `voiceschanged` timing, WebAudio `AudioContext` WAV fallback, ZIP upload/download UX, modal layering | **MANUAL BROWSER PENDING** | Requires human browser smoke acceptance |

---

## 2. Suite Execution Summary (Observed in D3 Verification)

- **New D3 Suite:** `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs` → **7 PASS, 0 FAIL** (`npx eslint scripts/audit-v603-round-d3-paragraph-acceptance.mjs` → **0 errors**)
- **D0–D2 Regression Gates:**
  - `audit-v603-round-d2-reset-ui.mjs`: **7 PASS, 0 FAIL**
  - `audit-v603-round-d1-reset-preferences.mjs`: **3 PASS, 0 FAIL**
  - `audit-v603-round-d0-closure-guards.mjs`: **4 PASS, 0 FAIL**
  - `audit-v603-round-d0-final-polish.mjs`: **8 PASS, 0 FAIL**
  - `audit-v603-round-d0-f1-f2-patch.mjs`: **12 PASS, 0 FAIL**
- **P9-B / P9-C / P10 / Download-Batch Gates:**
  - `audit-v603-dl-b1-download-batch.mjs`: **PASS (35 checks)**
  - `audit-v603-p9b-playback-marathon.mjs`: **24 PASS, 0 FAIL**
  - `audit-v603-p9c-bulk-marathon.mjs`: **17 PASS, 0 FAIL**
  - `audit-v603-p10-h1-h3-remediation.mjs`: **8 PASS, 0 FAIL**
  - `audit-v603-p10-h4-playback-remediation.mjs`: **8/8 PASS**
  - `audit-v603-p10-h5-export-zip-remediation.mjs`: **11 PASS, 0 FAIL**
- **Domain, Beta5–Beta8 & Boundary Suites:**
  - `audit-v603-a0-a3-rf-portability.mjs` (18 PASS), `audit-v603-a4-staging-gc.mjs` (7 PASS), `audit-v603-beta5-testing-clarity.mjs` (19 PASS), `audit-v603-beta7-shared-rf-consumer-sync.mjs` (13 PASS), `audit-v603-d2-external-json.mjs` (30 PASS), `audit-v603-d3-d4-external-reconcile.mjs` (19 PASS), `audit-v603-beta8-p1-ordered-multi-audio.mjs` (13 PASS), `audit-v603-beta8-p2-split-full-domain.mjs` (17 PASS), `audit-v603-beta8-p3-runtime-playback.mjs` (15 PASS), `audit-v603-beta8-p4-staging-zip.mjs` (21 PASS), `audit-v603-beta8-p5-bulk-generation.mjs` (17 PASS), `audit-v603-beta8-p6-bulk-export.mjs` (17 PASS), `audit-v603-beta8-p9-hf4d-navigation.mjs` (20/20 PASS), `audit-v603-round-a-d1-d4.mjs` (7 PASS), `audit-v603-round-b-d2-d3.mjs` (6 PASS), `audit-v603-round-c-taxonomy.mjs` (10 PASS), `audit-v603-round-c1-legacy-empty-audio.mjs` (4 PASS).

---

## 3. Manual Browser Acceptance Checklist (`MANUAL BROWSER PENDING`)

1. Open a Paragraph workspace; verify **Title** and **Paragraph** cards render, switch between **Split** and **Full** playback, and confirm Shuffle + Next/Prev wrap cleanly without splitting sentences out of cards.
2. In Chrome with Microsoft/Google voices loaded asynchronously, verify Indonesian Browser TTS defaults to **Google Bahasa Indonesia** (or **Gadis** if present) instead of **Microsoft Andika**, and inspect `<optgroup>` region groups in Global, Workspace, and Card voice selectors.
3. Open a Paragraph card with Ready Split audio and missing Full audio: verify *"Also generate missing Full audio"* defaults **OFF**, toggle it **ON**, run `GENERATE MISSING`, and export `EN Full MP3` / `ID Full MP3` + Portable ZIP v2.
4. Trigger Reset flows across Playback, Global Browser TTS, Global Edge, Bulk Audio, Workspace, Card, and Segment via `SafetyConfirmDialog` during idle and active playback; confirm Table Mode, Legacy Text Mode, and Staging MP3 binaries remain intact after reload.
