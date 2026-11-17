# P13 Mixed Workspace — A0–A2 implementation report

Date: 2026-11-17.

**GO for the isolated A0–A2 presentation foundation and starting isolated A3 Editor work. Unrestricted Mixed Full/rate audio remains NO-GO pending A4. Canonical v2 activation remains NO-GO.**

Mixed Paragraph/Conversation Cards now use the existing Shared reader in a DEV-only QA route. All reading levels/layouts are available. The QA's audio capability is explicitly **Split at 1×**, using one existing D5 host. Two unmet audio expectations were reproduced outside that supported capability and are documented below; they are not hidden among the five historical failures.

Manual visual/device acceptance is deferred at the user's direction, not imposed as a new A0–A2 gate. No A3 Editor implementation, engine modification or production Mixed integration was started.

## 1. Preflight and source integrity

- Existing worktree: `C:\Users\HikamSeif\Documents\@ Lain-Lain\2000 Most Frequently Used Words\prolingo-p12-integration-qa`.
- Starting branch and exact HEAD matched: `feature/p12-a6-main-text-dual-view` at **`7f3769f0d042bac93a9dd3ddd2f1630ac25b7c02`**.
- Working tree was clean; no pending merge/rebase/cherry-pick/revert operation or applicable AGENTS.md was found.
- Created `feature/p13-mixed-workspace` with `git switch -c feature/p13-mixed-workspace`. No additional worktree was created.
- Current committed HEAD is still the same baseline SHA. **All P13 changes remain local, unstaged and uncommitted.** The optional checkpoint permission was not exercised.
- A6 ref remains `7f3769f0d042bac93a9dd3ddd2f1630ac25b7c02`; AI Voice remains `fc8e0350c2d911381b47d14e973132e2b42d7f93`; backup remains `a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd`.
- No branch merge, reset, rebase, remote operation, deployment or database activation occurred.

The A6 report and relevant A1/A4/D3–D5 contracts/source were consulted. This was a focused Mixed implementation, not a repeat of the full P12 architecture audit.

Protected-path diff against the baseline is empty for App/A6 integration and preferences, TextStructuredPlayer, D3 command/Content Unit domains, canonical DB constants/services, D4/D5 Conversation components/hook, all playback/audio services, Table, package and lockfile. No AI Voice worktree file was edited.

## 2. A0 architecture contract

Created **`P13_Mixed_Workspace_A0_Contract.md`**.

`Workspace → Card → Content Unit → Segment` is unchanged:

| Card | Allowed persistent Units | Preserved relationships |
| --- | --- | --- |
| Paragraph | `kind: 'paragraph'`, displayed as Section | Card/Unit/Segment ID/UID, ordering, raw EN/ID, joinAfter, source/audio metadata |
| Conversation | `kind: 'turn'`, displayed as Speaker Turn | Same identity/order fields plus registry Speaker ID/UID and assignment |

Mixed is a **Workspace type**, never a Card or Unit kind. Consecutive same-speaker Turns stay distinct. Empty Sections/Turns, zero-Unit Cards and zero-Card Workspaces remain representable.

Verified existing capabilities:

- `src/domain/text/textCardPresentationDomain.js:37` already preserves interleaved Card order and persistent Units.
- `src/domain/text/textContentUnitDomain.js:397` already rejects incompatible Card/Unit kinds.
- `SharedParagraphWorkspaceReader` and its Card/body/Part/Segment components already select Paragraph/Conversation behavior per Card.
- `textConversationReaderDomain.js:16` already provides a Workspace-independent authoritative D5 cursor bridge, without an index fallback, plus validated explicit play actions.
- The existing structured session/planner can traverse both Card types through one host. Its name does not imply that a second Paragraph host is needed.

No identity/presentation architecture redesign is necessary. The two A4 audio gaps below require bounded audio integration work before broader audio exposure.

## 3. A1 domain and public interfaces

`src/domain/text/textMixedReaderDomain.js:18` exports:

```js
selectTextMixedReaderState(snapshot, { documentId })
// {
//   presentation: existing A1 frozen Workspace/Card/Unit/Segment projection,
//   documentTree: detached, deeply frozen existing hydrated Document Tree
// }
```

The selector delegates projection and graph/UID/migration validation to A1, then requires a Mixed Workspace and complete persistent v2 state. It additionally rejects an assigned Speaker ID that cannot resolve to a registry UID. This closes the Mixed boundary without changing A1's compatibility behavior or D3 validation.

The visual projection retains exact IDs/UIDs, parent mapping, structural order, speaker identity, raw Text/Meaning and `joinAfter`. The detached Document Tree retains nonvisual Workspace/Card/Unit/Segment metadata, per-Segment AudioVariant records/UIDs/RFs and Card Full artifact metadata. It is derived through the existing hydrator, not a second mapping implementation or audio cache.

Cloning before deep freezing prevents freezing or changing nested objects in the caller's snapshot. Neither returned view is a command or persistence payload. Projection never allocates identities, repairs data or performs a migration.

Existing typed errors are reused: invalid snapshot, incomplete migration/persistent Units required, unsupported schema/Workspace and missing Workspace. V1 Paragraph virtual Sections remain available through their existing path only; Mixed never persists or exposes them as authored Units.

Reused function identities:

```js
resolveTextMixedReaderCursor === resolveTextConversationReaderCursor
createTextMixedReaderActions === createTextConversationReaderActions
```

No new cursor/session logic or command dispatcher was created.

## 4. A2 Shared reader and host integration

New `SharedMixedWorkspaceReader` props:

```js
{
  snapshot, documentId,
  audioPlayback = null, isBusy = false,
  presentationState = null, onPresentationStateChange = null,
  focusTarget = null, onFocusConsumed = null
}
```

It renders the existing Shared Workspace reader and Card surfaces. It owns no audio hook, editor session, persistence or configuration. Invalid input yields a readable alert; missing host disables play. The parent must bind the optional host to the same validated snapshot/Workspace and respect the A2 Split/1× capability.

All existing Full/Part/Segment, bilingual and Part layouts work across the same interleaved Card list. Per-Card Section/Turn labels, Speaker palette/cast/spotlight, empty states, identity-based translation pairing, search, navigation and highlights are reused.

The only shared presentation extension is the optional toolbar `workspaceType` prop:

- `SharedBilingualLayoutToolbar.jsx:58` passes Workspace context to the terminology helper.
- `SharedParagraphCardReader.jsx:561` supplies the Workspace type.
- `sharedCardPresentationUtils.js:45` adds neutral “section or speaker turn” wording for the Mixed Workspace toolbar.

Stored `unit.kind` remains only Paragraph/Turn. Paragraph and Conversation per-Card wording/default behavior are unchanged.

### Cursor and action authority

The unchanged D5 observer must prove current snapshot/configuration/binding/session/Workspace scope. Status must match its actual session and document; A1 resolves Segment membership and parent Unit in the current projection.

| Evidence | Precision |
| --- | --- |
| Current Split or per-Sentence Full recovery status | Segment, with actual parent Section/Turn |
| Cached Full without authoritative offsets | Card, null Segment/Unit |
| Missing/stale/foreign/stopped/unavailable evidence | None |
| Browse/search/view state | No audible authority |

Explicit callbacks remain `playSentence(segmentId)` and `playScene(cardId, options)`; the latter name is the existing host API for scoped Card playback. Only valid projected IDs and existing one-shot EN/ID channel options are forwarded. Sentence activation follows existing host channel semantics; no new channel overload is invented.

### QA entry and capability boundary

Run `npm run dev` from this worktree, then open:

- `/?qa=mixed-workspace`
- `/#qa-mixed-workspace`

The route is DEV-lazy in `src/main.jsx:18`; production ignores both forms and excludes the preview/fixture code.

The preview owns **one** `useConversationAudioPlayback` above the entire reader. It offers private fixture reset/Workspace switch, read-only Card reveal and existing pause/resume/stop controls. It has no editor, canonical storage, preference persistence, real-data import or Mixed creation flow.

Audio configuration is fixed to Split/1× in `TextMixedWorkspaceQaPreview.jsx:17`. Full/Part/Segment below it controls **reading**, never audio representation. There is no Full-audio/rate control in the accepted A2 preview.

Main App/A6 remains Paragraph-only and unchanged; the real Text tab's dual-reader pilot is not used to smuggle v2 Mixed data into canonical v1.

## 5. Confirmed A4 audio integration blockers

These probes use the **unchanged existing D5 hook** with disposable Mixed snapshots and injected media I/O. They run separately from bounded A2 acceptance checks and report `expectationMet: false`. They are new findings, not historical debt or successful audio expectations.

| Finding | Verified reproduction and cause | Boundary/action |
| --- | --- | --- |
| **A4-FULL-01 — P1 for unrestricted Mixed audio** | A nonempty Paragraph with no local Split binary requests Full playback. Generic planner emits `full-tts` with null Segment ID (`textStructuredRuntimePlaybackPlanDomain.js:450`, `:466`). D5 Full callback rebuilds a recovery plan and does `items.get(sentenceStep.segmentId)` (`useConversationAudioPlayback.js:610`); no item exists, so it returns. Browser probe: **1 Paragraph Segment, 0 audio/TTS invocations**, with recovery warning/completion. | Full audio is unavailable in the A2 QA. A4 must handle Paragraph whole-Card TTS/failure semantics through the existing P9 contract while retaining Conversation per-Sentence recovery. |
| **A4-RATE-01 — P2, A4 acceptance blocker** | Paragraph Split requested `globalPlaybackRate: 1.5`; observed local playback rate **1**. Generic Paragraph steps do not carry the Conversation rate field, and the hook defaults absent `step.playbackRate` to 1 (`useConversationAudioPlayback.js:482`; speech effective rate at `:359`). | A2 QA is fixed at 1×. A4 must use the existing effective rate/profile resolution for Paragraph and verify global/Card/Segment/channel behavior. |

These reproduce on code unchanged from A6, and do **not** demonstrate a regression in main P9 Paragraph playback, which uses its existing App host. Its main-path browser tests pass.

Do not enable unrestricted Mixed Full/rate controls or claim complete Mixed audio acceptance before these expectations pass. No audio engine/service, RF, artifact metadata or existing file was patched/deleted to hide them.

## 6. Changed files

| File | Purpose |
| --- | --- |
| `P13_Mixed_Workspace_A0_Contract.md` | Concise architecture, public boundaries and later gates |
| `src/domain/text/textMixedReaderDomain.js` | Persistent Mixed guard, immutable metadata-preserving state, existing bridges |
| `src/components/text/presentation/SharedMixedWorkspaceReader.jsx` | Thin read-only adapter to the existing renderer |
| `src/components/text/presentation/TextMixedWorkspaceQaPreview.jsx` | Isolated two-Workspace fixture controller and one existing host |
| `src/components/text/presentation/SharedBilingualLayoutToolbar.jsx` | Optional Workspace terminology context |
| `src/components/text/presentation/SharedParagraphCardReader.jsx` | Pass that context; Card rendering unchanged |
| `src/components/text/presentation/sharedCardPresentationUtils.js` | Mixed toolbar terms |
| `src/main.jsx` | DEV-only query/hash route |
| `scripts/fixtures/p13-mixed/mixed-workspace-fixture.js` | Disposable v2 graph, interleaved/empty/speaker/metadata cases |
| `scripts/fixtures/p13-mixed/browser-cases.jsx` | Browser acceptance plus separately reported A4 diagnostic probes |
| `scripts/audit-v603-p13-mixed-workspace.mjs` | 18 Node checks |
| `scripts/audit-v603-p13-mixed-workspace-browser.mjs` | Existing esbuild/CDP pattern, route gates, forbidden storage and artifact checks |
| This report | Evidence, limitations and handoff |

Four existing files: **26 insertions / 3 deletions**. Nine new files including both reports. No new dependency, rendering/carousel library, database store or stored entity.

## 7. Automated results

Environment: Windows, Node 24.11.1, headless Microsoft Edge 157, Vite 7.2.6. Full logs/geometry/results are local at:

`C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-p13-a0-a2-d4cb7cc4`

### New Mixed checks

`node scripts/audit-v603-p13-mixed-workspace.mjs`: **18/18 PASS**, zero storage calls.

Covers exact interleaved ordering; ID/UID/parent preservation; multiple Sentences and same-speaker Turns; empty Units/Cards; raw EN/ID/joinAfter; immutable source/audio metadata; reorder; existing speaker rename/reassignment; corruption/partial/schema/orphan-speaker rejection; v1 compatibility isolation; cursor precision and stale/foreign scope; validated actions; unchanged A6 eligibility and v1 constants.

`node scripts/audit-v603-p13-mixed-workspace-browser.mjs --check-production`, final three consecutive serial executions:

| Run | Duration | Bounded A2 cases | Completed reveals | Route gates | Separate unmet A4 probes |
| --- | --- | --- | --- | --- | --- |
| 1 | 15.71 s | 11/11 | 15/15 | 4/4 | 2 |
| 2 | 15.55 s | 11/11 | 15/15 | 4/4 | 2 |
| 3 | 15.56 s | 11/11 | 15/15 | 4/4 | 2 |

Each run has **0 IndexedDB calls / 0 preference-storage calls**. Node/browser fixtures are disposable in-memory v2 state. Other compatibility suites use their established disposable QA databases only.

Browser cases cover:

1. Interleaved Card types, empty Sections/Turns/Cards and persistent speaker/Turn identity.
2. All reading levels, four bilingual layouts and three Part layouts, with no audio invocation/cancellation or snapshot writes from view changes.
3. Duplicate English with distinct meaning identity and blank meanings.
4. Fifteen passive completed-visibility checks across both Card types, all levels and Part layouts.
5. Silent Part/Sentence browsing and persistent parent context.
6. One existing host traversing Paragraph → Scene → Paragraph in exact Segment order with Alice/Bob voice profiles.
7. Explicit Paragraph/Scene actions and unchanged session token during layout changes.
8. Actual existing Conversation Cached Full Card precision and failed-artifact per-Sentence recovery; pause/resume and metadata preservation.
9. Workspace switch, Card reorder and fixture reset rejecting stale highlights/completions.
10. Readable invalid-input handling and disabled playback without a host.
11. Zero-Card Workspace without borrowed content or audio.

Media I/O is injected for controlled host observations. These are real browser/DOM/native-scroll tests, not independent native listening/device approval. Existing D5 browser suites separately exercise real binary/Web Audio recovery.

### Search test synchronization investigation

An early copied route test used an incorrect reader selector; that harness-only check was corrected to the actual Mixed marker and bounded DOM completion.

The new multi-layout search harness also had readiness timeouts before issuing a fresh Segment-view reveal after a long-page layout transition. One recorded geometry was root y=-1343, bottom=863.125, document height=2206. Merely clearing its sticky prior focus did not make repeated runs reliable.

Final setup explicitly clears the prior search, ends its document motion at the origin **before changing layouts**, then uses the unchanged committed-layout barrier. Fresh focus requests must subsequently reveal their targets unaided. Completed clipped visibility, exact target/channel, native smooth scrolling and settled geometry assertions remain unchanged. Passive readiness samples are retained on failure.

All final 45 reveal observations pass. No production scroll/follow code or existing R1 helper/assertion was changed. The exact internal Chromium scheduling cause was not established; this report does not claim otherwise. Earlier failures are preserved in the evidence folder rather than called historical debt.

### Compatibility Node matrix

Commands use `node scripts/audit-v603-<suffix>.mjs`.

| Suite suffix | Result |
| --- | --- |
| `p12-shared-card-a1` / `p12-shared-card-a2` / `p12-shared-card-a3` | 13 / 10 / 7 PASS |
| `p12-shared-card-a4c` / `p12-shared-card-a4h` / `p12-a6-main-reader` | 11 / 8 / 10 PASS |
| `p12d-d4a-conversation-editor` / `p12d-d4b-conversation-editor-ui` | 22 / 9 PASS |
| `p12d-d5-conversation-audio` / `p12d-d5-audio-ui` | 15 / 5 PASS |
| `p12d-d3d-regression` / `p12d-d3c-compatibility` / `p12d-d3b-content-unit-persistence` / `p12d-virtual-content-units` | 12 / 5 / 11 / 12 PASS |
| `p12c-conversation-playback` / `p12b-speaker-registry` | 13 / 14 PASS |
| `p12a-external-reconcile` / `d2-external-json` / `d3-d4-external-reconcile` | PASS / 30 / 19 PASS |
| `round-d3-paragraph-acceptance` / `beta8-p9-hf4d-navigation` | 7 / 20 PASS |
| `p9b-playback-marathon` / `p9c-bulk-marathon` | 24 / 17 PASS |
| `a0-a3-rf-portability` / `a4-staging-gc` / `beta8-p4-staging-zip` / `p10-h5-export-zip-remediation` | 18 / 7 / 21 / 11 PASS |

Including the new Mixed suite and established failures: **33 Node suites executed; 28 passing suites and the same five historical failing suites**.

### Compatibility browser matrix

| Suite suffix | Result |
| --- | --- |
| `p12-shared-card-a1-browser` | 7 PASS |
| `p12-shared-card-a2-browser --check-production` | 10 PASS, 15 completed reveals, 4 gates |
| `p12-shared-card-a3-browser --check-production` | 8 PASS + 4 gates |
| `p12-shared-card-a4c-browser --check-production` | 12 PASS + 4 gates |
| `p12-shared-card-a4h-browser --check-production` | 6 PASS + 4 gates |
| `p12d-d4c-browser --check-production` | 13 PASS + 4 gates; all 20 commands and failed-draft preservation |
| `p12d-d5-browser` / `p12d-d5-ui-browser` | 3 / 15 PASS |
| `p12d-d3d-browser` | 9 PASS, disposable QA databases |
| `p12-a6-main-reader-browser` | 12 PASS in the real App path |

All **95 compatibility browser cases** and all 20 requested compatibility route gates pass. A6 dual reader/defaults, Paragraph virtual Sections, audio continuity, existing Editor behavior and production isolation remain covered.

### Five historical failures

| Suite suffix | Unchanged observation |
| --- | --- |
| `beta8-p9-hf4a-card-ux` | `:82`, obsolete `setPlayingIndex(step.highlight ?` source regex |
| `beta8-p9-hf4c-r1-ui-repair` | `:33`, expects `...hf4c-r1`, actual `...hf4d` |
| `d0-d1-text-identity` | `:229`, expected Table hash `024aa45b...`, unchanged LF-checkout actual `10d82e76...` |
| `beta8-p9-hf5-voice-audio-ux` | `:834`, expects `/Browser TTS/`, actual `David · US` |
| `beta8-p9-hf4c-player-audio-ux` | `:35`, expects `...hf4c`, actual `...hf4d` |

No historical expectation, hash or version was edited. The two A4 diagnostic failures above are additional explicitly tracked findings, not part of this historical list.

### Lint, build and boundaries

- Scoped `npx eslint --max-warnings=0` over all changed JS/JSX production modules and both fixture modules: **0 errors / 0 warnings**. Both new audit scripts also pass `node --check`.
- This does not claim the entire repository or untouched App/Player lint debt is clean.
- `npm run build`: **PASS**, 1912 modules. JS `index-Cvqymwjr.js`, 1705.18 kB (451.57 kB gzip); CSS `index-fSxQdqRg.css`, 118.65 kB.
- Existing browser-data/large-chunk advisories remain nonfatal; dependencies unchanged.
- Final production artifact scan: Mixed QA marker/reader/fixture strings absent; A6 main reader control remains present.
- `git diff --check`: PASS.
- Canonical `TEXT_LIBRARY_DB_VERSION === 1` and `TEXT_LIBRARY_SCHEMA_VERSION === 1`; no stores, upgrades, startup migration or canonical v2 writes added.
- No physical real-audio deletion/GC, AI Voice merge, real-data Mixed creation, source synchronization behavior change or production Mixed route activation.

## 8. Recommendations and remaining limits

**A3 Editor:** proceed in isolation. Use the complete Mixed Card order and existing command validation for global Card operations; D4's Scene-only editor projection is insufficient as the whole Mixed Workspace authority. Reuse Paragraph and Conversation commands/forms with their existing pending locks, async response validation and failed-draft behavior. Drafts must not mutate the frozen presentation/tree. Keep Card Unit kinds separate and source identities intact.

**A4 Audio:** first close A4-FULL-01 and A4-RATE-01 with failing-then-passing regressions against the existing host. Validate Paragraph whole-Card TTS/cached failures, all channel/rate overrides, physical binary readiness/exact RF, per-Card Full invalidation, Staging/ZIP/GC and complete interleaved traversal. Reuse the existing planners/session lifecycle; do not add another engine or registry. Do not expose unrestricted Full/rate controls before acceptance.

Metadata in the A1 visual projection is intentionally supplemented by the frozen existing Document Tree. It is not a new physical-audio readiness assertion or cache. Full audio diagnostics use disposable/injected bindings; real listening and device UX remain deferred.

This delivery authorizes neither canonical v2 activation nor production Mixed data. **A0–A2 is complete within the supported isolated scope.** Source/report changes remain uncommitted for review, with no push/deploy/merge. Stop here.
