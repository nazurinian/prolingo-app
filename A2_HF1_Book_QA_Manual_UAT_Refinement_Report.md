# ProLingo V6 A2-HF1 Book QA refinement

Branch `test/text-v2-uat`, worktree `prolingo-p12-integration-qa`, starting HEAD `cbef9f50f2976352dbc438ef4729c1428b42bb50`. The starting worktree was clean. The owner's A2 tally remains 12 PASS and 10 NOT CONFIRMED. The results below describe engineering verification of the HF1 changes.

## RF01–RF11

| RF | Automated status | Evidence and remaining acceptance |
| --- | --- | --- |
| RF01 Voice separation | PASS | Native Browser TTS started and completed distinct Narrator and Speaker voices. The scoped recording test verified different Edge profiles with different fixture audio bytes. Listening on the owner's device and live upstream Edge voice rendering remain NOT CONFIRMED. |
| RF02 Voice controls and fallback | PASS | Per-channel Narrator and Speaker controls select the existing catalogs. A saved unavailable Browser choice remained visible and selected. The actual fallback voice and reason appeared in Now Playing. Manual listening and confirmation remain NOT CONFIRMED. |
| RF03 Generation and ZIP | PASS | The Reader exercised Sentence, Card and Workspace requests, coverage verification, derived Full composition, cancellation, a recoverable provider error, and both download actions. The real provider process passed its local health check. Live Edge synthesis remains NOT CONFIRMED. |
| RF04 Continuous playback | PASS | One presentation session survives channel, Sentence, Section, Turn and Card transitions, including configured gaps. Pause and transport retain the owner. Full-to-Split evidence covers all three Workspace types. Physical playback and perceived continuity remain NOT CONFIRMED. |
| RF05 Passive scroll | PASS | Vertical scrolling changed the page position while the playing Unit and playback cursor stayed fixed. Physical touch and wheel behavior remain NOT CONFIRMED. |
| RF06 Card, Unit and cursor | PASS | An explicit Unit selection kept the current playback cursor. Return to Playing restored the active Unit. The 3D carousel and final gesture design are DEFERRED to A5. |
| RF07 Follow Playback | PASS | Existing Follow Playback Card expansion passes the Reader smoke. Explicit manual Unit browsing and return preserve playback ownership. Optional viewport following and the stable Card anchor are DEFERRED to A5. |
| RF08 Reader Toolbar | PASS | Reproduced overlap on the starting build with Sidebar expanded. HF1 kept all 11 desktop controls visible without overlap or clipping from 768 to 1440 px. The mobile settings path exposed all 10 mode/language/orientation controls at 390 px. Physical viewport acceptance remains NOT CONFIRMED. |
| RF09 Notebook Guide Lines | PASS | Browser-computed guide styles appeared in Full, Card, Focus and Segment. Final contrast, spacing and visual acceptance are DEFERRED to A5. |
| RF10 Bilingual playback indicators | PASS | EN and ID swapped the active highlight and paired underline. Notebook was tested in all four modes. Interlinear, Separated and Contextual were also tested in Card. Whole-Card Full playback retained Card precision. Physical visual acceptance remains NOT CONFIRMED. |
| RF11 Start From Here | PASS | Scoped start and authored continuation ran across Sections, Turns and Cards in Paragraph, Conversation and Mixed. The existing Unit/Card/Workspace command boundaries remain covered by the structured playback regression. Owner retest remains NOT CONFIRMED. |

PASS means the named automated check passed. FAIL identifies a reproduced failed check. NOT CONFIRMED is retained for device, provider or manual evidence that has yet to be collected. DEFERRED identifies the A5 design work.

## Reproductions and fixes

| Reproduced on the starting branch | Owning source and HF1 change |
| --- | --- |
| A2 profiles assigned Edge IDs while the fixture inherited Browser voices. The QA fields required typing provider identifiers. | [Voice resolution](src/App.jsx#L1125) still projects native Browser precedence. [Body audio](src/components/text/BookQaBodyAudioPanel.jsx#L136) and [Heading audio](src/components/text/BookQaHeadingAudioPanel.jsx#L117) use catalog dropdowns. Saved unavailable entries remain selectable and runtime Browser fallback includes its reason. |
| Record and ZIP controls existed in separate panels with little indication of what generation saved. | [Body audio](src/components/text/BookQaBodyAudioPanel.jsx#L148) guides selection, scoped save and coverage verification. [Portable and Normal ZIP](src/components/text/BookQaPortableAudioPanel.jsx) downloads follow verification. Provider errors include a recovery action. |
| Each step settled its source observation, causing the shared Reader and Global Player to drop the current target during a gap. Recorded verification ran serially before the next clip. Previous/Next used the full Stop/120 ms startup path. | [Now Playing](src/domain/playback/nowPlayingDomain.js#L25) retains the last started target for the Book session. [Book transport](src/App.jsx#L2100) replaces only the current execution step on Previous/Next. [Session lookahead](src/services/playback/textStructuredPlaybackSessionService.js#L209) prepares the next supported step during active playback. [Recorded runtime](src/services/playback/textStructuredAudioRuntimeService.js) checks the binding again before start. |
| Vertical Focus called the explicit Unit selection path after a passive scroll observation. It could establish a manual anchor over the audible Unit. | [Vertical Focus](src/components/text/presentation/SharedFocusCarousel.jsx#L499) keeps the Book selection stable during owned playback. Rail/arrow actions still navigate explicitly. |
| The desktop language/orientation/Settings flex group shrank into the Reader mode group. | [Toolbar](src/components/text/presentation/SharedBilingualLayoutToolbar.jsx#L1425) wraps the groups at the available container width. |
| Notebook fallback rows lacked guides and the paired text had no common live marker. | [Notebook rules](src/components/text/presentation/sharedNotebookParallelFlow.css#L30) cover measured lines and fallback rows. [Shared segment flags](src/components/text/presentation/sharedCardPresentationUtils.js#L585) and [Contextual](src/components/text/presentation/SharedBilingualUnitsBody.jsx#L296) render the paired underline from the actual Sentence cursor. |

## Playback and audio evidence

The baseline and HF1 browser runs use the same authored fixture and browser. The configured-gap run uses controlled speech events to isolate App scheduling. The recorded run uses native `HTMLAudioElement` playback of deterministically generated fixture bytes. The native Browser run uses Edge's installed local voices and records real `start` and `end` events. [Runtime evidence](artifacts/a2-hf1-book-qa-runtime-evidence.json)

| Measurement | Starting build | HF1 |
| --- | ---: | ---: |
| EN end to ID start, with 500 ms configured silence | 551 ms | 528.4 ms |
| Silent frames retaining Sentence, voice and highlight | 0 of 33 | 32 of 32 |
| Silent frames showing the loading glyph | 33 of 33 | 0 of 32 |
| Silent frames exposing live media | 0 | 0 |
| Controlled TTS end to next recorded Sentence observed playing | 48.8 ms | 33.0 ms |
| Next recorded Sentence verification | 12.4 ms after the prior source ended | 9.5 ms, started before the prior source ended |
| Next clip `play()` call to native `playing` event | 21.0 ms | 17.8 ms |

These are individual browser observations. The scheduled 500 ms remains in force. The four native local TTS calls took about 52–126 ms from `speak()` to the native start event. The timing evidence records one stable session ID on both builds. HF1 changes the presentation during the gap and moves the next recorded verification earlier.

- Configured silence and media startup are measured separately. Finished media is dropped from the active timeline. The Reader and Global Player retain the owner and last started details, with a **Between audio steps** status during silence.
- The session preloads relevant upcoming recorded resolutions while the current source runs. Scope, snapshot freshness, trusted composition and exact byte proofs still apply. Each recorded step uses its own media element and has a browser startup cost. Book Browser TTS skips the old per-utterance cancel and 10 ms deferral at normal boundaries. Native engine and media event latency still vary.
- Paragraph ran a recorded Split fallback while Saved Full remained selected. Conversation ran a composed EN Full and then ID Split TTS under the same owner. Mixed ran Conversation Split fallback with per-Sentence timing. The Full waveform exposed no inferred Sentence or Turn cursor.
- Native TTS used Microsoft David and Microsoft Catherine from the actual browser catalog. The Edge recording fixture exercised Maya through Libby and Ari through Ryan with distinct played SHA-256 byte evidence. Selected profiles, Sonia/Gadis defaults and alternate saved renders retain their existing resolution rules.
- The local API responded on port 3001. The synthetic provider returned a 503 and the Reader gave the server startup command. The fixture also verified scoped coverage and generated both ZIP download names through the Reader. Live upstream Edge rendering remains NOT CONFIRMED.

## Verification

| Command or check | Result | Exit |
| --- | --- | ---: |
| `npm.cmd run build` | Normal build | 0 |
| `VITE_ENABLE_TEXT_UAT=true` then `npm.cmd run build:uat` | Isolated UAT build | 0 |
| `node scripts/audit-book-qa-a1a-browser.mjs` with `BOOK_QA_HF1_READER_AUDIT=baseline/final/native`, one mode per run | Starting-build reproduction, 10 HF1 groups and four native utterances | 0 each |
| Same browser harness with `BOOK_QA_A2_AUDIT=1`, `BOOK_QA_BODY_AUDIO_AUDIT=1`, and `BOOK_QA_HEADING_AUDIO_AUDIT=1` | 26 labeled checks, including A2 reconnect, exact audio and alternate references, Main Title, canonical v1 startup, and Table/Legacy playback | 0 |
| `node scripts/audit-text-uat4-reader-browser.mjs` | 5 browser groups, including current Follow Playback/Card expansion, Book Page and a mobile viewport | 0 |
| `node scripts/audit-text-uat4-4d-now-playing.mjs` | 4 groups covering authored scope, artifact precision, Table/Legacy and stale events | 0 |
| `node scripts/audit-v603-p12c-conversation-playback.mjs` | 13 checks | 0 |
| `node scripts/audit-book-qa-body-audio.mjs` | 6 checks | 0 |
| `node scripts/audit-book-qa-hf1-session.mjs` | 4 checks | 0 |
| `node scripts/audit-book-qa-portable-audio.mjs` | 17 scoped archive and byte-proof checks | 0 |
| `node scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs --voice-policy` | 6 voice-policy checks | 0 |
| `node scripts/audit-text-uat-release.mjs` | 2 groups for release guards and Node endpoint contracts | 0 |
| Local Vite Preview and `GET /api/health` through its proxy | HTTP 200 for UAT identity and local API health | 0 |
| Scoped ESLint and `git diff --check` | Passed | 0 |

Builds report the existing Swiper/PostCSS nesting, browser compatibility-data and chunk-size warnings.

## Changed-file inventory

| Area | Files |
| --- | --- |
| Application wiring | `src/App.jsx` |
| Book voice and audio UI | `BookQaBodyAudioPanel.jsx`, `BookQaHeadingAudioPanel.jsx`, `BookQaPortableAudioPanel.jsx`, and `BookQaVoiceSelect.jsx` under `src/components/text/` |
| Reader presentation | `SharedBilingualLayoutToolbar.jsx`, `SharedBilingualUnitsBody.jsx`, `SharedFocusCarousel.jsx`, `SharedNotebookUnitsBody.jsx`, `sharedCardPresentationUtils.js`, and `sharedNotebookParallelFlow.css` under `src/components/text/presentation/`, plus `src/domain/text/textCardPresentationCursorDomain.js` |
| Global Player | `src/components/layout/BottomPlayerBar.jsx`, `src/domain/playback/globalPlayerPresentationDomain.js`, and `src/domain/playback/nowPlayingDomain.js` |
| Audio and session services | `src/services/audio/audioPlaybackSideEffectService.js`, `src/services/audio/bookQaBodyAudioService.js`, `src/services/bookQaAudioSessionService.js`, `src/services/bookQaSessionService.js`, plus `playbackInteractionService.js`, `textStructuredAudioRuntimeService.js`, and `textStructuredPlaybackSessionService.js` under `src/services/playback/` |
| Tests and evidence | `scripts/audit-book-qa-a1a-browser.mjs`, `scripts/fixtures/book-qa/check-reader-refinement.mjs`, `scripts/fixtures/a1b-1c/check-heading-audio.mjs`, `artifacts/a2-hf1-book-qa-runtime-evidence.json` |
| Handoff | This report, `A1a_Book_QA_Persistence_Capability_Ledger.md`, and the manual, execution playbook and Master Contract under `docs/uat4/` |

## Manual retest

1. Reconnect to the existing A2 manual library using the same origin and browser profile. In **Body audio**, select a distinct Browser voice for the Paragraph Narrator and each Conversation Speaker. Compare EN and ID separately in Paragraph, Conversation and Mixed. Try the unavailable-voice path and compare the requested and actual voice in Global Player details.
2. Start the local provider from the [manual packet](docs/uat4/ProLingo_A2_UAT_Manual_ID.md). Generate a Sentence, verify coverage and play the saved recording. Try Card or Workspace Split, Cancel, and Compose Scene Full after complete 1× coverage. Download the Portable and Normal ZIPs and open both.
3. In Shared UI, start from a Sentence before a Section or Turn boundary. Hear EN→ID, then continue across Units and Cards. Compare Browser-only, Local first, and Saved Full with partial coverage. Try Pause/Resume during a gap and Previous/Next while playing. Confirm expected silence with a retained target and truthful source display.
4. In Vertical and Horizontal Focus, browse while a different Unit plays. Check the audible Unit, explicit Unit selection, Return to Playing and Follow Playback Card expansion. Resize with the Sidebar expanded, then open the mobile Reading Settings.
5. Enable Notebook Guide Lines and run bilingual playback in Full, Card, Focus and Segment. Confirm the active language and paired underline swap. Confirm a Full recording uses Card-level precision.

The [A5 UI backlog](docs/uat4/ProLingo_UAT4_Master_Contract_v1.2_REVIEW_2026-11-24.md#b4-a5-reader-ui-backlog-from-book-qa-a2-hf1) and the [Book QA roadmap](docs/uat4/ProLingo_UAT4_Execution_Playbook_v1.0.md#8-book-qa-roadmap-after-a2-hf1) record the deferred design. Work remains local and uncommitted at the starting HEAD. Production activation remains **NO-GO**.
