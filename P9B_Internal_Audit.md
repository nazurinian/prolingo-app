# ProLingo v6 — P9-B Internal Playback & Voice Routing Audit

**Repository:** `nazurinian/prolingo-app`  
**Branch / Baseline:** `fix/text-data-system-boundaries` (`c3b8f4f`)  
**Mode:** Read-only code audit + non-destructive deterministic Node regression harness  
**Automated Test Script:** [`scripts/audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs)

---

## 1. Executive Summary

Stage 1 audited the P9-B Structured Text playback runtime across Scenarios 1–10 using domain inspection, service/`App.jsx`/UI wiring tracing, and the newly added deterministic harness [`scripts/audit-v603-p9b-playback-marathon.mjs`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/scripts/audit-v603-p9b-playback-marathon.mjs).

- **Marathon Run Result (`node scripts/audit-v603-p9b-playback-marathon.mjs`):** **14 PASS / 10 FAIL (24 checks total)** — all 14 contract checks (`[CONTRACT]`) passed; all 10 explicit defect probes (`[DEFECT S1-A .. S10-A]`) reproduced genuine implementation defects.
- **Accepted HF5 / Domain Core:** Split vs Full planning routes (`split`, `full-local`, `split-fallback`, `full-tts-fallback`, `full-tts-only`), 6-level Split Browser TTS voice resolution (`segment > card-speaker / card-speaker-legacy > document-speaker / document-speaker-legacy > card > document > global`), Full-mode suppression of segment voice overrides, card-scoped Shuffle preservation of intra-card sentence order, playback transition `120ms` cancellation guard, and mobile suspend/resume TTS replay all hold in domain and runtime unit behavior.
- **Confirmed P9-B Runtime Defects (10 total, including 1 UI freeze hazard `S6-A` and 2 high-impact routing/media bugs `S1-A`, `S1-B`):**
  1. **S1-A (`FROM_HERE` mid-card Full replay):** Starting `FROM_HERE` on Segment >= 2 in Full mode replays earlier skipped segments of that starting card because `buildTextStructuredSplitRuntimePlan` iterates all segments in the block rather than the scoped `group.items` slice.
  2. **S1-B (`MediaSession` black-out in Full mode):** Full playback sets `playingIndex` to `null`, causing `executeMediaSessionLifecycleService` to return early without updating lock-screen/hardware metadata.
  3. **S2-A (`CUSTOM_LOCAL` omitted in Full planner):** `resolveStructuredTextBlockChannelPlaybackPlan` ignores pinned Custom Local profiles, whereas Split `playStructuredTextChannel` handles them.
  4. **S4-A (Unavailable browser-voice fallback skips speakers):** `resolveTextStructuredBrowserVoiceResolution` fallback hierarchy checks `[segment, card, document, global]` only, jumping over `card-speaker` and `document-speaker`.
  5. **S6-A (`repeatMode === 'loop'` microtask spin / UI freeze):** Zero delays plus synchronous/instant TTS settlement inside `while (pass < Infinity)` creates an unthrottled infinite loop starving JS timers and UI input.
  6. **S6-B (`handlePlayerSmartNav` scope bleed):** Next/Prev smart navigation from a temporary Manual Segment/Card session carries `repeatMode`, `playbackRepresentationMode`, and `playbackChannelMode` into Global Document playback.
  7. **S7-A (`orderedListOverride` overrides `Sequential`):** `handlePlayerSmartNav` and `executeStructuredTextPlaybackSessionService` reuse a saved shuffled `orderedList` even when `playbackOrderMode` was switched back to `'sequential'`.
  8. **S8-A (`structuredTextPlaybackSourceStatus` leaks across workspaces/stop):** Badge state omits `documentId` and is not cleared on `forceStopAll`, document switch, or mode switch.
  9. **S9-A (`!targetVoice` skips native Browser TTS fallback):** `playStructuredTextFullStep` and `playStructuredTextChannel` return early when `ttsVoice` is `null` instead of letting `executeBrowserTtsPlaybackService` speak using the browser system default voice.
  10. **S10-A (`BottomPlayerBar` dead props):** `MainAppShellView` passes `textTtsOnly` / `onTextTtsOnlyChange` to `BottomPlayerBar`, which neither destructures nor renders any control for them.

---

## 2. Exact Test Command Output

Command executed:
```powershell
node scripts/audit-v603-p9b-playback-marathon.mjs
```

Verbatim observed output (exit code `1` because `[DEFECT]` probes intentionally fail until fixed):
```text
PASS [S1][CONTRACT] Split plays segment-by-segment with highlight index and allows segment override
PASS [S1][CONTRACT] Full plays single FULL_LOCAL step when ready Full exists, sets playingIndex=null, sets currentIndex to card first segment
FAIL [S1][DEFECT] [DEFECT S1-A] FROM_HERE starting at Seg 2 in Full mode must NOT replay Seg 1
   -> Seg 1 was replayed unexpectedly in FROM_HERE: ["SEGMENT_000001","SEGMENT_000002","SEGMENT_000003","FULL:Card two line one. Card two line two.","FULL:Card three line one."]

true !== false

FAIL [S1][DEFECT] [DEFECT S1-B] MediaSession updates metadata while Structured Text Full mode is actively playing (playingIndex=null)
   -> MediaSession metadata stayed null during active Full mode playback because playingIndex is null
PASS [S2][CONTRACT] Playback order precedence: card-order > global-order > document-order-legacy > compatibility-fallback, and strict fail-closed rejection
PASS [S2][CONTRACT] Global TTS Only overrides Card/Doc local preference and forces FULL_TTS / SPLIT_TTS
FAIL [S2][DEFECT] [DEFECT S2-A] Full block playback planner in App.jsx (resolveStructuredTextBlockChannelPlaybackPlan) ignores CUSTOM_LOCAL pin mode
   -> resolveStructuredTextBlockChannelPlaybackPlan completely omits CUSTOM_LOCAL / localAudioPlaybackProfileV1 handling
PASS [S3][CONTRACT] Browser TTS inheritance in Split respects Segment > Card Speaker > Doc Speaker > Card > Document > Global
PASS [S4][CONTRACT] Full representation ignores Segment Browser TTS overrides in domain resolver and split-fallback steps
FAIL [S4][DEFECT] [DEFECT S4-A] resolveTextStructuredBrowserVoiceResolution skips card-speaker & document-speaker on unavailable segment fallback
   -> Expected fallback to CardAliceVoice / SpeakerAliceVoice before DocVoice, got DocVoice (document)
+ actual - expected

+ 'DocVoice'
- 'CardAliceVoice'

PASS [S5][CONTRACT] Full MP3 fallback chooses full-local -> split-fallback (partial) -> full-tts-fallback (0 local)
PASS [S6][CONTRACT] Navigation wraps by sentence in Split and by card in Full
PASS [S6][CONTRACT] Stop/Play transition race guard cancels superseded 120ms transitions cleanly
PASS [S6][CONTRACT] Manual target profile supports custom repeat clamping and documents omitted channel fallback quirk
FAIL [S6][DEFECT] [DEFECT S6-A] repeatMode=loop with unavailable TTS voice / missing SpeechSynthesisUtterance causes unthrottled tight spin
   -> Unthrottled tight loop detected: 100 consecutive loop passes ran without any inter-pass yield/throttle when channel resolves immediately
FAIL [S6][DEFECT] [DEFECT S6-B] handlePlayerSmartNav inherits temporary Manual Segment/Card settings (e.g., Loop/Split) into Global Document session
   -> handlePlayerSmartNav unconditionally inherits session.repeatMode / playbackRepresentationMode / playbackChannelMode even when active session was a manual Segment/Card play

false !== true

PASS [S7][CONTRACT] Shuffle reorders cards only, preserves sentence sequence within every card, anchors current card first
FAIL [S7][DEFECT] [DEFECT S7-A] Stale Shuffle orderedListOverride overrides Sequential playbackOrderMode in App.jsx & playback session service
   -> Sequential mode still used stale orderedListOverride order: ["SEGMENT_000006","SEGMENT_000004","SEGMENT_000005","SEGMENT_000001","SEGMENT_000002","SEGMENT_000003"]
+ actual - expected

  [
+   'SEGMENT_000006',
+   'SEGMENT_000004',
+   'SEGMENT_000005',
    'SEGMENT_000001',
    'SEGMENT_000002',
    'SEGMENT_000003',
-   'SEGMENT_000004',
-   'SEGMENT_000005',
-   'SEGMENT_000006'
  ]

PASS [S8][CONTRACT] Mode switch & mid-playback workspace stop abort active session and suppress completion cursor overwrite
FAIL [S8][DEFECT] [DEFECT S8-A] structuredTextPlaybackSourceStatus omits documentId and is not cleared on stop or workspace switch
   -> Source status badge omits documentId and survives document switches

false !== true

PASS [S9][CONTRACT] Missing audio URL, audio play error, mobile TTS suspend/resume replay settle deterministically
FAIL [S9][DEFECT] [DEFECT S9-A] playStructuredTextChannel/FullStep skip Browser TTS completely when voiceState.ttsVoice is null instead of native system default
   -> App.jsx returns early skipping Browser TTS when !targetVoice, contradicting executeBrowserTtsPlaybackService native default policy

true !== false

PASS [S10][CONTRACT] Desktop (MainAppShellView) and Mobile (MobileTools) both mount TextStructuredAudioControls & BottomPlayerBar Text controls
FAIL [S10][DEFECT] [DEFECT S10-A] BottomPlayerBar receives textTtsOnly / onTextTtsOnlyChange from MainAppShellView but neither renders nor invokes them
   -> Clicking every rendered button on BottomPlayerBar never invoked onTextTtsOnlyChange

false !== true


P9-B MARATHON SUMMARY: 14 PASS, 10 FAIL (24 total)
```

---

## 3. Scenario 1–10 Matrix

| Scenario | Scope | Status | Contract Checks | Confirmed Defects |
| :--- | :--- | :---: | :---: | :--- |
| **S1** | Split vs Full playback + MediaSession | **FAIL** | 2 PASS | `S1-A` (`FROM_HERE` mid-card replays skipped Seg 1), `S1-B` (`MediaSession` metadata null in Full mode) |
| **S2** | Source modes, precedence & fail-closed rejection | **FAIL** | 2 PASS | `S2-A` (Full planner ignores `CUSTOM_LOCAL` pin) |
| **S3** | Doc/Card/Speaker/Segment Browser TTS + Sync | **PASS** | 1 PASS | *(None; noted minor metadata quirk: `audioVoiceOverrideV1.speakers` works on card/block only, while document speakers live in `speakerVoiceMapV1` / `speakerVoiceProfileV2`, and `'document-speaker-legacy'` sets `inherited: false`)* |
| **S4** | Full ignores Segment overrides + Fallback chain | **FAIL** | 1 PASS | `S4-A` (Unavailable-voice fallback skips `card-speaker` & `document-speaker`) |
| **S5** | Full MP3 fallback chain (`full-local` -> `split-fallback` -> `full-tts-fallback`) | **PASS** | 1 PASS | *(Runtime domain contract passes; see `S2-A` and `S9-A` for App integration gaps around Custom Local & null-voice Browser TTS)* |
| **S6** | Next/Prev, Stop/Pause/Resume, Cursor & Repeat | **FAIL** | 3 PASS | `S6-A` (`repeatMode='loop'` unthrottled spin), `S6-B` (`handlePlayerSmartNav` leaks Manual repeat/rep/channel into Global) |
| **S7** | Sequential vs Shuffle order & card framing | **FAIL** | 1 PASS | `S7-A` (`orderedListOverride` overrides `Sequential` mode on Resume / SmartNav) |
| **S8** | Workspace switch, Table/Text switch & badge hygiene | **FAIL** | 1 PASS | `S8-A` (`structuredTextPlaybackSourceStatus` omits `documentId`, not cleared on Stop / Doc switch / Mode switch) |
| **S9** | Missing audio, error settle, mobile TTS replay, null voice | **FAIL** | 1 PASS | `S9-A` (`!targetVoice` skips Browser TTS completely instead of native default) |
| **S10** | Desktop vs Mobile control & player parity | **FAIL** | 1 PASS | `S10-A` (`BottomPlayerBar` ignores `textTtsOnly` / `onTextTtsOnlyChange`) |

---

## 4. Detailed Findings & Evidence

### Defect S1-A — `FROM_HERE` Starting Mid-Card in Full Mode Replays Skipped Segments
- **Evidence:** [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L196-L200) passes `allowFullArtifact: group.wholeBlock` (`false` when starting mid-card), while [`src/domain/text/textStructuredRuntimePlaybackPlanDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredRuntimePlaybackPlanDomain.js#L113) (`buildTextStructuredSplitRuntimePlan`, `L113` and `L323-L336`) iterates all `resolveTextStructuredOrderedSegments(block)` instead of restricting to `group.items`.
- **Repro:** Start Full playback with `scope = 'from-here'` and `startSegmentId = 'SEGMENT_000002'` inside Card 1 (3 segments). Reproduced output played `["SEGMENT_000001","SEGMENT_000002","SEGMENT_000003", ...]` — replaying Segment 1 even though the cursor started at Segment 2.

### Defect S1-B — `MediaSession` Metadata Suppressed During Full Mode Playback
- **Evidence:** [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L216) explicitly executes `setPlayingIndex(null)` during Full playback steps so segment-level highlighting stays off. However, [`src/services/playback/mediaSessionLifecycleService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/mediaSessionLifecycleService.js#L14-L16) looks up `activeItem` only by `p.id === playingIndex` and returns early (`setPositionState?.({})`) when `!activeItem`, leaving `navigator.mediaSession.metadata` null/stale instead of falling back to `playbackContextRef.current.cursorSegmentId`.

### Defect S2-A — Full Playback Planner Ignores `CUSTOM_LOCAL` Pin Mode
- **Evidence:** Split playback in [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3491-L3515) (`playStructuredTextChannel`) explicitly inspects `TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL` / `localAudioPlaybackProfileV1`, whereas [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3302-L3329) (`resolveStructuredTextBlockChannelPlaybackPlan`) passes `fallbackVoiceId: generatedVoice.voiceId` and `globalPlaybackOrder` without checking `CUSTOM_LOCAL`.

### Note on S3 Inheritance Storage Keys
- **Observed Behavior:** [`src/domain/text/textStructuredVoiceAssignmentDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredVoiceAssignmentDomain.js#L149-L165) resolves `segment > card-speaker > card-speaker-legacy > document-speaker > document-speaker-legacy > card > document > global`. Note two implementation nuances:
  1. Document speaker maps live in `speakerVoiceProfileV2` (`document-speaker`) and `speakerVoiceMapV1` (`document-speaker-legacy` via [`src/domain/text/textStructuredSpeakerVoiceProfileDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredSpeakerVoiceProfileDomain.js#L7)), whereas card/block speaker legacy maps live inside `audioVoiceOverrideV1.speakers`.
  2. Line `L164` computes `inherited` using `global`, `document`, and `document-speaker`, omitting `'document-speaker-legacy'`.

### Defect S4-A — Unavailable Browser Voice Fallback Skips Speaker Profiles
- **Evidence:** [`src/domain/text/textStructuredVoiceAssignmentDomain.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredVoiceAssignmentDomain.js#L359-L364) (`resolveTextStructuredBrowserVoiceResolution`) builds `hierarchyFallbacks` strictly from `[segment, card, document, global]`. When a segment's explicit browser voice override is unavailable in `availableBrowserVoices`, fallback skips both `card-speaker` (`CardAliceVoice`) and `document-speaker` (`SpeakerAliceVoice`) and drops straight to `document` (`DocVoice`).

### Defect S6-A — `repeatMode === 'loop'` Tight Spin Hazard When Channel Settles Immediately
- **Evidence:** [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L131) loops `while (pass < repeatLimit && ...)` (`Infinity` for `'loop'`). When delays are `0ms` and every step resolves immediately as a microtask (e.g., unavailable Browser TTS voice + early return `S9-A`, missing `SpeechSynthesisUtterance`, or missing audio), the marathon probe recorded `100` consecutive full passes before force-stop, starving macrotask timers and risking a main-thread freeze.

### Defect S6-B — `handlePlayerSmartNav` Leaks Manual Segment/Card Settings Into Global Document Session
- **Evidence:** [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3793-L3847) (`L3841-L3845`) forwards `session?.playbackRepresentationMode`, `session?.playbackChannelMode`, `session?.repeatMode`, and `session?.repeatCount` into `scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT` without verifying whether `session.scope` was temporary `SEGMENT` or `CARD` manual playback.

### Defect S7-A — Stale Shuffle `orderedListOverride` Overrides `Sequential` Mode
- **Evidence:** [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3777-L3790) passes `saved.orderedList`, and [`src/services/playback/textStructuredPlaybackSessionService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/playback/textStructuredPlaybackSessionService.js#L133-L138) validates `orderedListOverride` purely by matching segment IDs, ignoring whether `playbackOrderMode` was changed back to `'sequential'`. Reproduced output played cards in reversed/shuffled order `["SEGMENT_000006","SEGMENT_000004","SEGMENT_000005","SEGMENT_000001","SEGMENT_000002","SEGMENT_000003"]`.

### Defect S8-A — Stale `structuredTextPlaybackSourceStatus` Across Stop / Document Switch / Mode Switch
- **Evidence:** State updates in [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3364) (`L3364, L3400, L3420, L3564, L3595, L3618`) omit `documentId`; neither `forceStopAll` ([`L1685`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L1685)), `handleTextLibrarySelectDocument` ([`L3865`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3865)), nor `executeModeSwitch` ([`src/services/navigation/viewNavigationService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/navigation/viewNavigationService.js#L135)) clears it.

### Defect S9-A — Null `ttsVoice` Skips Native Browser Default Instead of Speaking
- **Evidence:** [`src/App.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3397-L3419) (`playStructuredTextFullStep`) and [`L3594-L3614`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/App.jsx#L3594-L3614) (`playStructuredTextChannel`) execute early `return;` when `!targetVoice`, whereas [`src/services/audio/audioPlaybackSideEffectService.js`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/services/audio/audioPlaybackSideEffectService.js#L18) (`executeBrowserTtsPlaybackService`) intentionally supports native system-default speech when `overrideVoice` / `selectedVoiceRef.current` is null. Combined with `S6-A`, null voice + Loop creates silent tight-loop hazard.

### Defect S10-A — `BottomPlayerBar` Drops `textTtsOnly` / `onTextTtsOnlyChange` Props
- **Evidence:** [`src/components/layout/MainAppShellView.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/MainAppShellView.jsx#L390-L395) passes `textTtsOnly` and `onTextTtsOnlyChange`, while [`src/components/layout/BottomPlayerBar.jsx`](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/components/layout/BottomPlayerBar.jsx#L6-L27) (`L6-27`, `L101-188`) never destructures or renders any UI button wired to them (verified both via `git grep` and simulated button-click sweep).
