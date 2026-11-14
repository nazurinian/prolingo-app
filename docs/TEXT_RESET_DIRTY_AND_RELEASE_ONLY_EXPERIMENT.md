# ProLingo Track A — Reset Intent & Release-Only Sliders (Experiment)

**Date:** 2026-11-14  
**Base:** `f2fe040fda5a9a76cca7f3b3573503856463c125`  
**Branch:** `experiment/text-reset-dirty-commit-on-release`  
**Status:** Experimental. No merge into Track A and no browser acceptance yet.

## Product rules

1. **Reset is an explicit action**: a click opens the existing confirmation; only the confirmed action changes saved values.
2. **Dirty vs Busy are independent**: dirty = saved setting differs from that Reset scope's canonical defaults; busy = write/ZIP/generation guard. Busy can block a click, but cannot animate/dim Reset.
3. **Reset buttons in the Text Audio sidebar are icon-only**, with stable placement, `aria-label`, title tooltip, 40% opacity only when clean and 100% opacity when dirty.
4. **Scope is meaningful**:
   - Global Browser TTS resets voice names, rate and link state to the canonical browser defaults.
   - Global Edge resets Sonia EN / Gadis ID, 0%/0Hz and its other tracked single-generation settings.
   - Workspace Reset clears Workspace-level voice/rate/download/local/audio-order overrides and inherits Global; does not erase Card/Speaker/Segment or Staging data.
   - Speaker Reset is scoped to the speaker, not the entire Workspace.
5. **Dropdown returns to canonical default**, not to the last manually selected value; no Reset operation runs unless explicitly invoked.
6. **Sliders preview locally while dragged**, and publish once at pointer release, keyboard key-up, or blur, only if the final numeric value differs from the saved one.
7. **Workspace/Speaker speed at inherited default clears the stored override**, rather than saving an explicit redundant value.
8. **Edge Stale changes happen after the committed rate/pitch change**, via the unchanged Render Fingerprint and Audio Staging contracts. No audio regeneration or file removal on slide.

## Code scope

- `src/components/common/CommitOnReleaseRange.jsx`: one reusable range input; no persistence in `onChange`.
- `src/domain/text/textStructuredResetPresentationDomain.js`: semantic dirty-state selectors based on existing canonical Reset builders.
- `src/components/text/TextStructuredAudioControls.jsx`: icon-only, dirty-driven Global/Workspace/Speaker/Edge Reset; release-only Workspace/Speaker and Edge sliders.
- `src/components/controls/PlayerBrowserTtsControls.jsx`: release-only Browser TTS speed in Table/Text.
- `src/components/controls/DesktopSystemControls.jsx`: release-only Table Edge rate/pitch.
- `src/App.jsx`: Workspace and Speaker rate values equal to inherited defaults now clear overrides.
- `scripts/audit-v603-reset-dirty-release.mjs`: targeted assertions.
- `scripts/audit-v603-round-d2-reset-ui.mjs`: re-baselined the fixture so buttons expected to be enabled actually have dirty saved preferences.

## Deliberate limitations

- Playback Settings, Card/Segment, and Bulk Reset controls are **not migrated** to the new visual/dirty contract in this experiment. Treat them as further work only if the central behavior passes.
- We have **not proven** that very rapid successive release events while the previous IndexedDB command remains in flight are queued safely. The existing library busy guard may reject a second write; test final saved speed after rapid repeated releases before approving.
- No changes to P11 Audio Provider Gateway, ZIP/MP3 formats, datasets, schema or AI Voice.
- A successful Vercel deployment status, if present, is not a substitute for the full automated regression suite and live Chrome acceptance.

## Acceptance checklist

1. Workspace EN/ID drag from inherited speed to 1.5×: the visible value should preview while dragging; the saved metadata should change **only on release**.
2. Move back to the inherited Global value: the Workspace override must disappear; Reset Workspace should dim to 40% **only if no other Workspace overrides remain**.
3. With a modified Workspace rate, Reset Workspace stays visually opaque through the async write (but its click is guarded while the write is active).
4. Choose a different Workspace voice, then `AUTO · Inherit Global`. Reset should dim only after every relevant override is cleared.
5. Change Global Browser TTS rate/voice and back to default; confirm Reset icon reflects actual saved state, not Busy.
6. Global Edge 0→+10→0 rate and 0→+5→0Hz pitch: Card coverage may update `READY → STALE → READY`; no generation or deletion should occur during drag.
7. Test mouse, touch and keyboard slider interactions, including blur, and verify slider value survives reload.
8. Check two very quick consecutive slider releases, and switching documents while a write is in progress.
9. Ensure Text Player, Card, Segment, Bulk, Table voice dropdowns, Split/Full, Staging and ZIP behavior remain unchanged.
10. Run `node scripts/audit-v603-reset-dirty-release.mjs`, `node scripts/audit-v603-round-d2-reset-ui.mjs`, `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs`, `node scripts/audit-v603-p11-provider-gateway.mjs`, and `npm run build` locally.

**No automatic fast-forward/merge to `fix/text-data-system-boundaries`.**
