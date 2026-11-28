# A3-G Book QA implementation and acceptance

Branch `test/text-v2-uat`, worktree `prolingo-p12-integration-qa`, baseline `2d3e435d30c912902b45955ab2b3c95de4a15175`. The owner authorized A3-G after the conditional independent A3 engineering GO and combined owner acceptance into one A3 + A3-G manual UAT. A2-HF2 remains owner-accepted 4/4. A3 and A3-G human acceptance remain **NOT CONFIRMED**. Production activation remains **NO-GO**.

The recovery kept 19 tracked edits and four new source files. Recovered builds passed but did not establish package behavior. Continuation added fixture-backed verification, corrected transition publication and extended the existing tab-disposal fence. It kept the A3 commit and prior reports and evidence intact. [Recovery checkpoint](A3G_Book_QA_Recovery_Checkpoint.md)

## Initial audit and package matrix

The recovered architecture reuses the shared player, source verifier, SpeechSynthesis lifecycle, Media Session binder and playback refs. The former generic structured path remembered a Sentence and sometimes Card order, rebuilt Workspace scope for idle Play, wrapped transport modulo the list, and recomputed shuffle every pass. Its channel and Sentence timers could not distinguish headings or structural boundaries. Reader position logic already separated passive scrolling from selection but lacked the new independent Book tap and follow contract. The canonical Legacy startup calls native Text v1 initialization and UID backfill, so loading it just to show a tab would risk an unauthorized write. [Existing executor and Book adapter](src/services/playback/textStructuredPlaybackSessionService.js) · [Legacy bootstrap](src/services/persistence/textLibraryLifecycleService.js)

| Package | Engineering status | Scope |
| --- | --- | --- |
| G-P1 | PASS | Validated intent and Workspace, channel-only, Sentence, Unit, Card, From Here boundaries, atomic headings and Full/Split policy. London Mixed, pure workspaces and stress fixtures. |
| G-P2 | PASS | Frozen Card shuffle, bounded repeat and navigation, exact actual ID Continue, original-start Restart, pause-safe transport, Ready and stale-content rejection. |
| G-P3 | PASS | Tap/Continue truth table, explicit pending priority, independent manual Focus, shared four-view controls, Follow and one-shot Return. |
| G-P4 | PASS | Seven normalized delays, one edge per transition, no trailing delay, grouped Reset and pause during wait. |
| G-N | PASS within the authorized boundary | Book and Table run through separate UAT documents with independent storage authority. Legacy tab intentionally gates live access. Production normal Table/Legacy smoke passed. |
| Live Legacy inside combined UAT | DEFERRED | Existing Legacy bootstrap may initialize or backfill canonical Text v1. It needs a separately approved authority or isolated adapter. |
| Combined manual UAT | NOT CONFIRMED | The owner has yet to exercise the integrated build. Physical/mobile background and provider checks remain separately tracked. |

## Intent, queue and ownership

- The Book resolver consumes the current Workspace UID, validated scope and preferences. A selected Sentence, its clicked channel, a scope boundary and the media cursor are distinct. Global shuffle reorders Cards only, including each owning Heading. The pass plan is frozen for all repeat passes, Restart and Continue. From Here uses the authored suffix starting at the selected Sentence and never shuffles. The Unit header action finds the first eligible Sentence for its configured channel sequence. Unit and From Here default to Once and Follow Global for channels. [Book intent and policy](src/domain/text/bookPlaybackDomain.js)
- Opening Main Title and applicable Card Headings are real atomic entries, separate from authored Sentences. A Workspace pass includes its openings on each repeat. Card playback can include its own Heading. Sentence, Unit and the starting Card of From Here skip earlier introductions. Later Cards honor their Read policy. Show and Reader display language remain separate. Blank channel entries are skipped. Full slots use Card precision if actual Full media is used. Sentence and Unit scopes and partial Cards retain the Full request with a Split command where necessary. Full source fallback reports actual Split precision. [Plan and delay policy](src/domain/text/bookPlaybackDomain.js)
- The existing structured executor owns execution tokens, verified reads, preparation stamps and the same local/TTS runtimes. Only actual media starts advance the replay cursor. Active Previous/Next preserves the presentation owner and fences the prior execution token. While paused the cursor can be repositioned without playing audio. Previous stops at the first target of the current pass. Next can advance into a remaining finite pass or loop pass. A naturally completed session becomes Ready at its original start. Stop clears media and active highlight. Continue replays the last actual channel and keeps the remaining pass; Restart begins at the original plan start and pass one. Browser TTS resumes or replays the owned part through its native lifecycle and has no timestamp claim. [Session executor](src/services/playback/textStructuredPlaybackSessionService.js) · [Shared transport](src/services/playback/playbackRuntimeControlService.js)
- Book uses a playback observation subscription to keep Global Player timeline publication aligned with the live media-binding lifecycle. Between-step observation retains authored identity and source as historical context. The live timeline is sampled only from an owned media element. Configured waits, encoded audio silence and the Silent Audio Anchor have independent lifecycles. Final waiting-copy and styling stay with A5. [Now Playing](src/domain/playback/nowPlayingDomain.js) · [Global Player presentation](src/domain/playback/globalPlayerPresentationDomain.js)

## Reader and timing

| Tap to Play | Continue From Here | Text action | Idle transport |
| --- | --- | --- | --- |
| Off | Off | Select Sentence/channel | Manual Segment from the explicit selection |
| Off | On | Select From Here target | From Here using the configured suffix and repeat |
| On | Off | Play clicked channel once | Normal pending/resume priority |
| On | On | Play Manual Segment channel order on the starting Sentence, then the From Here sequence | Normal pending/resume priority |

Explicit pending selection wins over Ready resume when idle. During active playback, transport owns Pause/Resume and a Tap Off selection can browse independently. Follow restores the actual position on the next meaningful started step or Resume. Return is one-shot and never changes the Follow preference or the owned playback. Reader View changes retain the same session. Card expansion and Focus remain independently controlled. [Shared interaction context](src/components/text/presentation/BookReaderInteractionContext.js) · [Reader host](src/components/text/TextStructuredPlayer.jsx)

| Delay | Default |
| --- | ---: |
| Channel | 0 ms |
| Sentence | 0 ms |
| Section / Turn | 200 ms |
| Card | 350 ms |
| Main Title | 750 ms |
| Card Heading | 400 ms |
| Repeat | 500 ms |

Precedence is Repeat → channel of the same item → outgoing Main Title → outgoing Card Heading → widest ordinary boundary (Card, Unit, Sentence). Crossing a Card boundary into its Heading applies Card Delay. The next Heading-to-Body edge uses Card Heading Delay. The executor skips absent heading entries and has no trailing configured delay. Values are 0–5000 ms in 50 ms increments, matching the existing bound and normalization for Channel and Sentence. Existing explicit values take precedence over defaults. Grouped timing selectors commit on selection and the Reset button is enabled only while normalized values differ from defaults. A Reset applies just the timing group. [Book settings](src/components/text/BookPlaybackSettings.jsx)

## Persistence and integration

| State | Lifetime |
| --- | --- |
| Active owner, actual cursor and media | Pause/Resume and Reader View changes retain them. Explicit compatible navigation updates the scoped execution. Switching tabs or replacing the lifecycle releases them. |
| Ready plan and selected target | In memory for the connected Book App. Returning to the owning Workspace can reuse a valid plan. A Refresh retains it only when its authored scope stamp still matches. Reconnect, reload and UAT tab exit release it. |
| Book playback and Reader preferences | Existing session-only authority. Added timing, interaction and Unit/From Here settings are session-only. No canonical preference keys are read or written by the Book path. |
| Authored hierarchy, Headings Read policy, profiles and verified recordings | Existing P15 Book library and its scoped staging stop/recovery boundaries. Retained across Book reconnect and UAT documents. |
| Table | Explicit entry on the approved test origin uses existing Table preferences, data and audio paths. The Table UAT entry skips native Text bootstrap, Text preference writes and native Text mode switch. |
| Legacy | Gate document opens no native data or player. Standard Legacy remains accessible through the normal app under its existing authority. |

In the browser audit, tab navigation released the old presentation, the native Table tab spoke the Table fixture and opened only the accepted Table/shared audio staging and folder namespaces, and Book returned idle with the same persisted snapshot. No new database delete or unauthorized write was observed. Normal build excludes the UAT tab shell and still opens canonical Text schema v1 on its ordinary path. [Tab authority](src/components/text/management/BookUatTabs.jsx) · [Book connect and teardown](src/components/text/management/BookQaHost.jsx)

The A3 regression restored eight exact bindings and added zero references on reimport. A subsequent Full request for the imported Scene reported actual Split, Segment precision and a verified generated source. The retained Full WAV digest was unchanged and destination trust remained false. The Book runtime’s composition gate still requires valid local trust before playing derived Full. [Verified source gate](src/services/audio/bookQaBodyAudioService.js) · [Browser evidence](artifacts/a3g-book-qa-evidence.json)

The first recovered HF2 run exposed one waiting frame that still rendered a live timeline. The final run recorded zero such frames and one owner per measured transition. Recorded EN→ID took 21.5 ms with zero configured channel delay and 523.4 ms with 500 ms configured. Media startup in those samples was 17.7 ms and 10.0 ms respectively. One separate zero-delay recorded transition spent 201.8 ms in media startup. Default Section and Turn boundaries took 215.9 ms and 217.3 ms from end to next start. Fixture MP3 leading and trailing silence was 28.0 ms and 10.3 ms at a 1%-of-peak threshold. The native Edge run queued Indonesian fallback 3.8 ms after the recorded media ended, then started it 101.0 ms later with no live timeline. Browser-only startup was 88.0 ms for installed English and 47.5 ms for installed Indonesian in this run. These host samples keep configured timing, media startup and encoded silence separate. [Transition evidence](artifacts/a3g-book-qa-evidence.json)

## Verification

| Command | Evidence | Exit |
| --- | --- | ---: |
| `node scripts/audit-book-qa-a3g.mjs` | Five focused groups for plan, stress, transport, truth table and deterministic scheduled timing | 0 |
| `node scripts/audit-book-qa-a3.mjs`, `node scripts/audit-book-qa-hf1-session.mjs` | A3 catalog/authoring/transfer and prior session authority | 0 / 0 |
| `node scripts/audit-text-uat4-4d-now-playing.mjs`, `node scripts/audit-text-uat4-4e2.mjs`, `node scripts/audit-text-uat4-4f2.mjs` | Shared Now Playing, player and Media Session regressions | 0 / 0 / 0 |
| `node scripts/audit-book-qa-a1a-browser.mjs` with `BOOK_QA_A3_AUDIT=1`, `BOOK_QA_A3G_AUDIT=1`, `BOOK_QA_AUDIT_PORT=5173` | Scoped authoring, real JSON/ZIP import, Full trust boundary, Reader interaction, Table/Book authority and production Table/Legacy | 0 |
| Same browser command with `BOOK_QA_HF1_READER_AUDIT=hf2-final` and port 5173 | Five targeted HF2 groups including native recorded transitions, controlled fallback, passive scroll, exact profile and export | 0 |
| Same browser command with `BOOK_QA_HF1_READER_AUDIT=hf2-native` and port 5173 | Installed EN/ID native speech and recorded-to-ID fallback | 0 |
| `npm.cmd run build`, then with `VITE_ENABLE_TEXT_UAT=true` `npm.cmd run build:uat` | Sequential normal and UAT builds | 0 / 0 |
| `npm.cmd exec -- vite preview --mode text-uat --host 127.0.0.1 --port 5173 --strictPort` and `Invoke-WebRequest` | Both checklist Book URLs, Table and Legacy all returned HTTP 200 with the UAT identity | 0 (HTTP checks) |
| Changed-file ESLint comparison against baseline and `git diff --check` | 23 JS/JSX paths, 206 baseline diagnostics, 205 current, zero new. Added test scripts also passed `node --check`. | 0 / 0 |

Set each environment variable in PowerShell as `$env:NAME = 'value'`. The existing listener on 4173 was left in place. The harness used disposable browser profiles and libraries. Normal and UAT builds retained the existing Swiper nesting, browser-data age and large-chunk warnings. The owner's London library remained outside the test targets.

## Handoff for Neon

- Use `resolveBookPlaybackIntent`, `normalizeBookInteraction` and `normalizeBookTiming` for command preparation. The App and existing structured executor own runtime state and effects.
- Consume `readGlobalPlayer()` for Now Playing and transport. Treat `transport.ready` as inactive and `transport.canPrevious/canNext` as directional capabilities. Observed channel, representation, precision, source and timeline come from `nowPlaying`. Repeat pass and count are separate from Card and Sentence ordinals. Preserve stable media identity while the separate waiting state is presented.
- Use the shared Reader's activation, pending target, follow behavior and existing Unit/Card presentation resolution. Changes to controls and layout can call the same actions without composing a new cursor or queue. Exact recording profile management remains A4 and final Player/Reader presentation remains A5.

## Changed-file inventory

| Area | Paths |
| --- | --- |
| Host and navigation | `src/App.jsx`, `src/main.jsx`, `src/hooks/useMainAppPrimaryState.js`, `src/components/layout/Header.jsx`, `src/components/layout/MainAppShellView.jsx`, `src/components/layout/SidebarTopControls.jsx`, `src/components/text/management/BookQaHost.jsx`, `src/components/text/management/BookUatTabs.jsx` |
| Player, Reader and settings | `src/components/layout/BottomPlayerBar.jsx`, `src/components/text/TextStructuredPlayer.jsx`, `src/components/text/BookPlaybackSettings.jsx`, `src/components/text/presentation/BookReaderInteractionContext.js`, `src/components/text/presentation/SharedBilingualUnitsBody.jsx`, `src/components/text/presentation/SharedParagraphCardReader.jsx`, `src/components/text/presentation/SharedSegmentStudyBox.jsx`, `src/components/text/presentation/TextSegmentInteraction.jsx`, `src/components/text/presentation/sharedCardPresentationUtils.js` |
| Domain and services | `src/domain/playback/globalPlayerPresentationDomain.js`, `src/domain/playback/nowPlayingDomain.js`, `src/domain/text/bookPlaybackDomain.js`, `src/domain/text/textCardPresentationCursorDomain.js`, `src/services/playback/playbackRuntimeControlService.js`, `src/services/playback/textStructuredPlaybackSessionService.js` |
| Tests | `scripts/audit-book-qa-a3g.mjs`, `scripts/audit-book-qa-a1a-browser.mjs`, `scripts/fixtures/book-qa/check-a3g-browser.mjs`, `scripts/fixtures/book-qa/check-a3-browser.mjs` |
| Handoff | `A3G_Book_QA_Recovery_Checkpoint.md`, `A3G_Book_QA_Implementation_Report.md`, `A3_A3G_Book_QA_Integrated_Manual_UAT_ID.md`, `ProLingo_V6_Post_A2_UAT_Contract_and_Patch_Roadmap_v1.0.md`, `A1a_Book_QA_Persistence_Capability_Ledger.md`, `artifacts/a3g-book-qa-evidence.json` |

Stop at A3-G independent review and the [combined Indonesian owner checklist](A3_A3G_Book_QA_Integrated_Manual_UAT_ID.md). A4, A5, A6 and production approval remain separate gates.
