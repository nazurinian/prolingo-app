# ProLingo — Reset, Slider and Dropdown Visual Audit
**Date:** 2026-11-14  
**Official baseline:** `fix/text-data-system-boundaries` @ `f2fe040fda5a9a76cca7f3b3573503856463c125`  
**Experiment:** `experiment/text-browser-reset-flicker`  
**Status:** User-video visual diagnosis + code trace; revised one-line fix AWAITING MANUAL ACCEPTANCE; no production merge.

## Confirmed target from user's video

The uploaded 8.8-second 30 FPS screen recording shows **`Reset Workspace`** in **`This Workspace Narrator (Browser TTS)`** alternating dim/bright while dragging **EN (Text) Playback Speed**. This is **NOT** the `Text Global Browser TTS` Reset button. A previous experimental change targeted the wrong reset button and did not resolve the reported video symptom. That previous change has now been **reverted** in this experiment.

## Why it happens

- `TextStructuredAudioControls.jsx` / `RateControl`: the native range slider triggers `onDocumentRateChange` on every `onChange`.
- `App.jsx` / `handleStructuredTextDocumentRateChange`: constructs Workspace rate metadata and invokes `handleTextLibraryStructuredCommand`.
- `App.jsx` / `runTextLibraryUiCommand`: sets `textLibraryCommandBusy=true` while persisting the command, and false afterward.
- `App.jsx` / `structuredTextResetGuard` and `structuredTextAudioSidebarControls.resetDisabled`: temporarily block Reset while a database transaction is in progress. Reset guarding is needed to prevent concurrent conflicting mutations.
- `TextStructuredAudioControls.jsx`: `Reset Workspace` has `disabled={disabled || resetDisabled}` AND `disabled:opacity-40 transition-colors`; the CSS dim/bright transition creates the visual flicker seen in the video.
- This is **an unintended visual dependency**, not the Reset operation being invoked. Reset should only change settings on intentional click + confirmation.

## Current revised experiment

Exactly one line of production code differs from the official baseline:

```diff
  data-text-reset-workspace="true"
- hover:bg-indigo-100 disabled:opacity-40 transition-colors
+ hover:bg-indigo-100 disabled:opacity-100 transition-colors
```

- Keeps `disabled={disabled || resetDisabled}` and all existing transaction/reset guards.
- Keeps confirmation dialog and `RESET_AUDIO_PREFERENCES` semantics.
- Does not modify Slider events, IndexedDB persistence, Staging MP3, Render Fingerprints or Audio Provider Gateway.
- Does not alter any Global Browser TTS Reset button.

**This patch only removes the dim/bright pulse from the correct Workspace Reset control.** It does not prove that multiple rapid slider updates are correctly queued; the current `runTextLibraryUiCommand` busy guard may reject competing commands. A separate slider commit-on-release / queueing study may be warranted if the saved speed skips or snaps back, and must be tested in isolation.

## Contract for future Reset UX

- Reset is an explicit action to restore default/inheritance **only when the user invokes it and confirms**.
- A reset may be temporarily blocked while persistence/generation is running; blocking must not unnecessarily animate adjacent unrelated controls.
- Availability state and Reset's action semantics are separate from visual treatment. Do not remove database concurrency guards just to stop flashing.
- Intentionally disabled `Global Edge Reset` at canonical Sonia/Gadis, 0%/0Hz is not the same as the unwanted Workspace busy-state pulse.

## Edge Stale behavior

- Global Edge Download `edgeRate` / `edgePitch` update generation preferences, which change the canonical audio Render Fingerprint.
- An older MP3 with a different fingerprint is categorized Stale/Other Profile; this is expected, **not** automatic audio deletion or regeneration.
- Returning to the exact matching voice/rate/pitch can restore Ready if the matching binary still exists.
- Card coverage/status and generate eligibility may legitimately re-render. Do not alter Staging or fingerprint rules to fix Reset flicker.

## Other selector surfaces reviewed (source only)

| Surface | Current assessment |
|---|---|
| Text Global Browser TTS Reset / EN/ID voice | Direct preference updates; not the control shown flashing in video |
| Workspace Narrator voice/rate and Reset | Source-confirmed busy-opacity coupling; revised experiment targets this |
| Conversation Speaker voice/rate and Reset | Similar guard + disabled opacity present; no user video confirming flicker yet |
| Card / Segment Audio Reset | Same busy-and-opacity pattern possible; review if observed; no edits |
| Bulk Audio Reset | Guarded, dimmed while busy; no edits |
| Edge Global Reset | Availability also intentionally depends on canonical default, separate behavior |
| Table Browser / Edge dropdowns | No Text Library transaction coupling found; prior optimizations retained |
| Card and Bulk voice selectors | Previously optimized; no new changes made |

## Manual verification before merge

1. Compare original `f2fe040` and experiment in real browser with `This Workspace Narrator` expanded. Drag EN/ID Workspace speed rapidly; `Reset Workspace` should stay visually stable.
2. Verify pressing Reset Workspace still opens the confirmation dialog, resets only the scoped preference metadata, and does not touch Staging.
3. Verify the slider's final shown and persisted speed agree after refresh. If it snaps back/skips updates, **do not declare the rate interaction fixed**; investigate write scheduling separately.
4. Compare Global Browser TTS Reset, Edge rate/pitch `0→10→0` and `0→5→0`, Card status `Ready→Stale→Ready`, and Table/Conversation/Card dropdowns as available.
5. No source changes to `main`, `v6-beta`, `feature/ai-voice`, or the official Text track until acceptance.

**Acceptance:** not yet verified after this revised patch.
