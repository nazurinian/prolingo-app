# ProLingo V6 A2-HF2 targeted correction

Review gate for `test/text-v2-uat` in `prolingo-p12-integration-qa`. The worktree started clean at `cdfc32c006924b243537fc2fadc35a9460ba5305`, the documentation-only descendant of accepted HF1 implementation `2c695bd0f91c20573fd08004a000c40d46e21050`. The [post-A2 contract](ProLingo_V6_Post_A2_UAT_Contract_and_Patch_Roadmap_v1.0.md) and [HF1 evidence](artifacts/a2-hf1-book-qa-runtime-evidence.json) informed the targeted checks.

## Status matrix

| Scope | Status | Disposition |
| --- | --- | --- |
| HF2-E1 / U01 | PASS | Separate names and default profiles, canonical Portable contents, collision-safe readable Listening names, and verified exact Edge render selection. |
| HF2-E2 / U02 | PASS | Verified Workspace/Card and EN/ID coverage separates persisted recordings, atomic titles/headings and Unit composition. The disposable London fixture reproduces the reported shape. |
| HF2-P / B01 | PASS for reproduced defects | Details timeline layout and eager Full fallback reads corrected. Payload verification, media startup, native Browser startup and authored silence measured independently. The cause of the owner's exact gaps and physical ID latency remain NOT CONFIRMED. |
| HF2-F / B02 | PASS | The starting build changed idle Unit focus on an outer wheel. HF2 preserved the selected Unit and playback owner when idle, playing and paused. Explicit Unit selection and Return to Playing passed. |
| B04 | PASS for bounded audit | Existing Playback settings and scoped Reader audio controls exercised. Corrected stale sidebar copy about the available scoped routes. A3 authoring, A4 exact playback profile manager and A5 settings redesign are DEFERRED. |

PASS records engineering evidence. The owner's HF1 acceptance remains at its recorded scope. HF2 manual acceptance, physical desktop/Android and live upstream Edge checks remain NOT CONFIRMED. The review gate does not authorize later phases.

## Export and verification

- The Reader now offers independent Portable and Listening choices. Portable defaults to including compatible alternates and keeps canonical RF/FULL paths, manifest v3, AUDIO_INDEX.csv, complete fingerprint and byte digests. Listening defaults to current profiles. Its optional alternates and explicit verified Edge render choice use the existing compatible descriptors. Exact selection compares engine, exact voice and language, render parameters and version/codec fields. Unit WAVs follow the current-profile composition path. [Export panel](src/components/text/BookQaPortableAudioPanel.jsx)
- Download names use `PL_PORTABLE__<scope>__<UTC>.zip` or `PL_LISTENING__<scope>__<UTC>.zip`. Milliseconds disambiguate exports within one second. Inside Listening, names include engine, voice, channel, actual extension and non-default render rate or pitch. Identical readable names get a deterministic `_V02`-style suffix after a normalized-path collision check. Playback speed is independent of the render label. Existing path safety, entry/byte limits and logical fan-out apply. [Listening exporter](src/services/audio/bookNormalAudioService.js#L23) · [Archive name builder](src/domain/text/textFilenameDomain.js#L67)
- Current readiness uses authored requirements, validated binding, verified bytes and trusted composition where needed. The table presents current Ready, compatible alternate references and current/alternate diagnostics independently. Blank optional text is displayed as **No requirement**. Unit eligibility checks the same current Split inputs and 1× rule as Listening export, with decoded duration checked when composing. The connection's recovery lock and stale snapshot fence cover this read. [Coverage verifier](src/services/audio/bookQaAudioCoverageService.js#L14) · [Book audio session](src/services/bookQaAudioSessionService.js#L331)

| London fixture scope | EN | ID |
| --- | --- | --- |
| P1 Split Sentence | 8/8 Ready | 0/8 Ready |
| P1 Full Card | 1/1 Ready | 0/1 Ready |
| Workspace Split Sentence | 37/37 Ready | 0/37 Ready |
| Workspace Full Card | 1/4 Ready | 0/4 Ready |
| Workspace Section/Turn composition | 3 Sections and 8 Turns eligible | 0 eligible |

**9 Ready** is P1 EN Split plus persisted Full. **38 Ready and 3 Missing** is Workspace EN body coverage, including the three remaining Full Cards. Main Title and authored Headings have their own rows. The fixture generated 38 Portable MP3 assets plus the two control files, and 49 Listening audio entries, including 11 export-only 48 kHz WAVs. The 38 MP3 digests matched across both archives. Portable import reported 38 additive references on a clean London projection and 38 already available on a scoped reimport. The artifact records the actual generated trees and the exact rate-profile export. Evidence here comes from fixture archives. The user ZIP findings come from the contract's historical review. [Runtime and archive evidence](artifacts/a2-hf2-book-qa-evidence.json)

## Playback and Focus

- **Details flicker.** HF1 retained the cursor and source context during silence, but the expanded panel still removed the measured timeline row at source settlement and added it at the next media start. HF2 keeps the Book timeline section mounted for the session. Live progress remains conditional on observed media. Gaps and Browser TTS have explicit timing-unavailable text. [Player presentation](src/domain/playback/globalPlayerPresentationDomain.js#L119) · [Details timeline](src/components/layout/BottomPlayerBar.jsx#L148)
- **Full fallback startup.** Paragraph Full-to-Split selection used to verify every Split byte before starting, even after the first verified recording settled the representation decision. It now stops the discovery pass at the first verified recording. Later targets use the existing snapshot-checked lookahead or on-demand proof. The all-TTS whole-Card fallback, media playback precision, active ownership and stop/cancel guards continue to apply. [Book Full playback planner](src/services/audio/bookQaBodyAudioService.js#L47)
- **Focus ownership.** The vertical viewport observer called the same Unit selection path as the rail. Its HF1 guard only excluded continuous playback. The scroll controller now handles viewport motion and interruptions, and Unit focus follows the explicit rail/arrow path or the playback cursor. Card expansion and the existing Follow Playback mode retain their independent state. [Vertical Focus](src/components/text/presentation/SharedFocusCarousel.jsx#L446) · [Reader scrolling](src/components/text/presentation/useWorkspaceReaderScroll.js#L72)

The Details-open matrix exercised matching EN/ID recorded availability, recorded-to-ID Browser fallback, Browser-only, zero and 500 ms gaps, Section/Turn/Card boundaries, and Full-to-Split. The expanded Player published zero live timeline frames while waiting. The fixture MP3 measured 28 ms of leading and 10.3 ms of trailing silence at a 1% peak-amplitude threshold. Playback preserves the recorded samples. The owner's video and exact recordings were outside this measurement.

| Timing or visible state | Starting build | HF2 |
| --- | ---: | ---: |
| Recorded EN → recorded ID, zero gap | 12.1 ms | 14.1 ms |
| Recorded ID → next recorded EN, zero gap | 18.1 ms | 13.1 ms |
| Recorded Section / Turn transition, zero gap | 20.7 / 10.9 ms | 21.9 / 11.3 ms |
| Recorded EN → recorded ID, configured 500 ms | 548.4 ms | 513.5 ms |
| Timeline section heights sampled in that 500 ms case | 48 px, then 0 px | 48 px throughout |
| Drawer top movement in that case | 58 px | 0 px |
| Verified Split reads before first Paragraph Full-fallback play | 4 reads, 15.1 ms combined | 1 read, 9.9 ms |

Elapsed recorded transitions are native end-event to next playing-event samples. For the HF2 zero-gap EN→ID sample, 13.3 of 14.1 ms was native media startup and the next proof was ready during the preceding clip. In the separate native Browser run, local EN and ID Browser startup took 77.4 ms and 45.4 ms in the Browser-only sample. Recorded EN → local ID fallback queued speech after 0.9 ms and then took 90.6 ms to start. These samples do not establish a general EN/ID speed difference or the cause of the original device report. [Timing and frame evidence](artifacts/a2-hf2-book-qa-evidence.json)

## B04 access and authorization

| Surface | Accessible capability and boundary |
| --- | --- |
| Global Player Details → Open Text Player settings | Existing Split/Full, channel sequence, order, repeat, delays, resume and manual policies. The detailed settings lock when structured playback is active or its generation guard is busy. **Stop audio** is offered for active playback. The saved-representation shortcut is for the next play. The preferences are in-memory for Book QA. [Settings dialog](src/components/text/TextStructuredPlayer.jsx#L1151) · [Global Player settings](src/components/layout/BottomPlayerBar.jsx#L649) |
| Reader Body / Title and Heading / ZIP panels | Scoped voice inputs, generation, verification, recovery and transfers. Operations are authorized only on the explicitly opted-in disposable connection. Workspace profile changes use native commands. [Book QA session](src/services/bookQaSessionService.js#L73) |
| Existing audio Sidebar and Card/Sentence managers | Canonical audio tools stay gated by Book mode. The advanced local-priority selector uses the normal runtime inventory and cannot offer every Book render or distinguish same-voice render parameters. Book's scoped panels and export profile choice are available. Complete profile management remains A4. [Inventory selector](src/App.jsx#L1232) · [Reader Card actions](src/components/text/TextStructuredPlayer.jsx#L1344) |
| Data and System | Native catalog/create sample and reconnect continue in scope. Document transfer, full authoring and their destination controls remain A3. Canonical credentials, folder handles, general staging and destructive tools remain outside Book QA. Corrected the desktop System and Data Transfer notices to point to the existing Reader routes. [Desktop data workspace](src/components/controls/DesktopDataWorkspace.jsx#L78) · [Main app shell](src/components/layout/MainAppShellView.jsx#L192) |

## Verification

| Command | Result | Exit |
| --- | --- | ---: |
| `npm.cmd run build`, then `VITE_ENABLE_TEXT_UAT=true` and `npm.cmd run build:uat` | Normal then UAT builds | 0 / 0 |
| `node scripts/audit-book-qa-portable-audio.mjs` | 18 checks including RF, exact profile collisions, alternate-only and archive limits | 0 |
| `node scripts/audit-book-qa-body-audio.mjs` | 6 body profile and proof checks | 0 |
| `node scripts/audit-text-uat4-4d-now-playing.mjs` | 4 groups including Table/Legacy ownership and stale callbacks | 0 |
| `node scripts/audit-book-qa-hf1-session.mjs` | 4 scope and session checks | 0 |
| `node scripts/audit-book-qa-a1a-browser.mjs` with `BOOK_QA_HF1_READER_AUDIT=hf2-baseline`, `hf2-final`, and `hf2-native` | Starting-build reproduction, 5 HF2 browser groups and native EN/ID evidence | 0 each |
| Same harness with `BOOK_QA_A2_AUDIT=1` and `BOOK_QA_PORTABLE_AUDIO_AUDIT=1` | 25 labeled scope, ZIP and reconnect checks, including exact PCM, protected canonical v1 startup, and Table/Legacy playback | 0 |
| Scoped ESLint and baseline comparison | 14 findings on both snapshots, zero new findings across 16 source files | 1 raw / 0 comparison |
| `node --check` for 10 changed harness/fixture files and `git diff --check` | PASS | 0 |

Browser checks used a disposable browser profile and the allowed `127.0.0.1:5173` origin so the existing listener on 4173 could remain available. Browserslist data, chunk size and Swiper/PostCSS warnings remain the existing build follow-ups.

## Changed files

| Area | Files |
| --- | --- |
| Export and coverage services | `src/domain/text/textFilenameDomain.js`, `src/services/audio/bookNormalAudioService.js`, `src/services/audio/bookQaAudioCoverageService.js`, `src/services/audio/bookQaBodyAudioService.js`, `src/services/bookQaAudioSessionService.js`, `src/services/bookQaSessionService.js` |
| Audio UI and access notes | `src/components/text/BookQaBodyAudioPanel.jsx`, `src/components/text/BookQaCoverageTable.jsx`, `src/components/text/BookQaPortableAudioPanel.jsx`, `src/components/layout/MainAppShellView.jsx`, `src/components/controls/DesktopDataWorkspace.jsx` |
| Playback and Focus | `src/components/layout/BottomPlayerBar.jsx`, `src/domain/playback/globalPlayerPresentationDomain.js`, `SharedFocusCarousel.jsx`, `SharedFocusView.jsx`, `useWorkspaceReaderScroll.js` under `src/components/text/presentation/` |
| Tests | `scripts/audit-book-qa-a1a-browser.mjs`, `scripts/audit-book-qa-portable-audio.mjs`, `scripts/fixtures/a1b-2a/check-portable-audio.mjs`, `scripts/fixtures/a1b-2b/check-normal-audio.mjs`, `scripts/fixtures/a1b-2b/normal-browser-probe.js`, `scripts/fixtures/a1b-g/check-hardening-playback.mjs`, and `check-hf2-archives.mjs`, `check-hf2-runtime.mjs`, `hf2-browser-probe.js`, `check-reader-refinement.mjs` under `scripts/fixtures/book-qa/` |
| Handoff | This report, `artifacts/a2-hf2-book-qa-evidence.json`, `A1a_Book_QA_Persistence_Capability_Ledger.md`, `ProLingo_V6_Post_A2_UAT_Contract_and_Patch_Roadmap_v1.0.md` |

## Uji ulang manual

1. Hubungkan kembali library A2 dari URL dan profil browser yang sama. Buka **Body audio** lalu coba **Verify Card audio** dan **Verify Workspace audio**. Cocokkan EN/ID, Split, Full Card, Heading dan kelayakan komposisi dengan rekaman yang memang tersedia.
2. Buka **Portable Audio ZIP**. Coba kedua unduhan, lalu pilih **Include compatible alternate profiles** dan satu profil terverifikasi jika tersedia. Periksa prefix ZIP, label suara dan sufiks render rate/pitch. WAV Section/Turn muncul hanya di Listening.
3. Buka **Global Player Details** dan putar Split EN→ID dengan dua kanal rekaman, lalu ulangi saat ID memakai Browser TTS. Coba delay nol dan 500 ms, Pause/Resume, dan lanjutkan melalui batas Section/Turn. Periksa sumber aktual dan timeline saat jeda.
4. Di **Vertical Focus**, gulir halaman saat idle, playing dan paused. Fokus Unit tetap. Pilih Unit lewat rail atau panah, lalu gunakan **Return to Playing** dan periksa pemilik audio serta ekspansi Card.

The work remains local and uncommitted at the A2-HF2 review gate. Canonical Text v1 and the isolated Book QA v2 boundary remain in force. The manual A2 library, file identities, journal and exact proofs were preserved. **Production activation remains NO-GO.**
