# ProLingo Track A — Baseline decision & App Bar flicker closure
**Date:** 2026-11-14
**Repository:** `nazurinian/prolingo-app`
**Authoritative continuation branch:** `fix/text-data-system-boundaries`

## Decision

Continue **the second D1–D3 + P11 update** (commit `06ee9ee7d7dec3ed2505adc57bd68530700406dc`), plus the independently verified App Bar flicker hotfix (commit `bad39318a93b612d1bf60e549dde88bd294fd5e7`).

Do **not** restart D1–D3 or P11 or revert to the earlier `fcc8c17` checkpoint. That earlier checkpoint remains in Git history; it is not a separate development track.

## Accepted single-line flicker change

- `src/components/layout/Header.jsx` — the Text-mode document switcher (`DOC · PARAGRAPH` in the top App Bar).
- Replace `disabled:opacity-50` with `disabled:opacity-100` **only for the Text document selector**.
- The `disabled={textLibraryCommandBusy || !activeTextDocumentId}` behavior **remains unchanged**.
- No data writes, reset defaults, Staging changes, Audio Provider Gateway changes or schema changes are part of this hotfix.
- The user manually confirmed that the App Bar flicker disappeared and switching Workspace A → B → A remained safe. Browser/Edge TTS selectors in Table/Text and Reset interactions were reported unaffected.

## Evidence and scope of verification

- GitHub compare `fcc8c17..06ee9ee7`: the second update includes the performance and reset-alignment remediation; it does not replace D1–D3/P11 functionality.
- `Header.jsx` document selector was identical at `033c83a`, `fcc8c17`, and `06ee9ee7`; the visual fade predated the second update.
- `App.jsx` `runTextLibraryUiCommand` toggles `textLibraryCommandBusy` during library edits, which temporarily disables the Header selector; the former `disabled:opacity-50` visibly faded it.
- The test branch `experiment/appbar-document-flicker-opacity` and Track A shared identical code at `bad3931`, verified by GitHub comparison.
- The available prior performance report documented Node/React/DOM benchmarking and its limits. **No new end-to-end Chromium automation, full build, or audit suite is claimed as executed by this decision record.**

## What stays isolated

- **Track A**: `fix/text-data-system-boundaries` — continue Text/Paragraph, Conversation/Mixed reviews and future scoped acceptance work.
- **Track B**: `feature/ai-voice` — offline model experiments only; never automatically merge into Track A.
- `main` and `v6-beta`: **not modified** by this decision.
- The former experiment branch can be treated as **historical / superseded** (no active follow-up). It is safe to delete after confirming no local worktree depends on it; deleting the remote ref is not required for correctness.

## Regression guardrails

For future Text changes:
1. Keep document switcher visually stable when Workspace/Edge settings or Reset commands set the library busy state.
2. Maintain disabled interaction protection for in-flight document commands.
3. Verify selected document remains correct after A → B → A, with no changes to user content, metadata, preferences, or staged audio.
4. Do not conflate this one-control visual fix with separate Browser/Edge selector performance analysis.
5. Avoid broad UI refactors or schema changes unless new reproducible evidence justifies them.

**Status:** Accepted by user manual smoke test; documentation of the selected continuation baseline.
