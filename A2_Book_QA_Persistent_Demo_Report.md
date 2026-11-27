# ProLingo V6 · A2 persistent Book QA and A1b-G closure

Starting HEAD was `27e543052fe01c9a265a3adea6ddf328575a313e` on `test/text-v2-uat` in `prolingo-p12-integration-qa`. The starting worktree was clean. The coordinator accepted A1b-2B and authorized A2 with bounded A1b-G closure. The [previous acceptance report](A1b_Integrated_Book_Audio_Acceptance_Report.md) remains the baseline for audio architecture and the successful Chrome Packet C run.

## A1b-G voice policy

| Surface | Default and behavior |
| --- | --- |
| Table and existing Legacy | Shared Edge selections initialize to `en-GB-SoniaNeural` and `id-ID-GadisNeural`. Table playback and generation continue through their existing routes. Legacy retains its existing language and playback capabilities. |
| Structured Text and Book | Manual generation, download, atomic Heading, and fallback profile resolution use the shared IDs when no override applies. Bulk generation and preferred export initialize and reset to Sonia/Gadis. The existing bulk selections, export setting and ordered playback precedence are still independent controls. |
| Local Edge and API adapter | Requests without a voice default to Sonia. Existing explicit voice requests pass through unchanged, including Gadis. An unqualified request carries no channel information. |
| Browser TTS | Shared selection and Book/Structured playback use the live speech-synthesis catalog. Edge prefers Sonia/Gadis. Chrome prefers UK English Female and Indonesian, prioritizing the matching Google voices when available. Missing voices use an available language fallback or the existing native default path. |
| Saved preferences | Stored manual, bulk and export IDs are retained, including historical Libby and Tuti selections. Older records have no provenance that separates an explicit choice from an old default. Missing values receive the approved defaults. Workspace and Speaker overrides, recorded alternatives and persisted audio identities retain their existing precedence. |

The P7/HF2 suite changes three prior expectations. The manual case now expects Gadis and checks that Table uses the shared constants. The bulk case expects Sonia/Gadis in generation and preferred export while manual selections vary independently. The historical rewrite case now checks that stored choices survive older preference records. A new case covers competing Edge/Chrome voices and a missing catalog entry. The Chrome EN case explicitly declares its browser family. The impacted P9-C and D1/D2/D3 assertions changed only the default IDs and associated labels, retaining the existing override, reset-scope and playback checks.

On the final P7/HF2 run the voice slice passes 6/6. The full suite reports 16 PASS and 5 FAIL. Replaying the same assertions on the starting HEAD reproduces the same five unrelated failures plus the four addressed voice failures. The unchanged historical failures are the two old Bottom Player control/copy assertions, the Player Settings wording, the Audio sidebar wording and the frozen beta.8 package version. Packet C Edge stays open for A6/4H2. The completed Chrome Packet C evidence is preserved. Staging ZIP counting was closed at the prior gate.

**A1b-G closure recommendation — GO for the approved voice policy in isolated QA.** The five historical assertions remain visible in the full suite.

## A2 fixture and manual access

| Workspace | Cards | Units | Sentences | Coverage |
| --- | ---: | ---: | ---: | --- |
| A Journey to London | 4 | 11 | 37 | Original bilingual P1 → C1 → P2 → C2 Body, with Main Title translation, bilingual Card Headings and three registered Speaker profiles. |
| Paragraph · A morning by the river | 2 | 3 | 6 | Linked Main Title, Sonia/Gadis narrator, bilingual first Heading and optional blank ID on one Sentence. |
| Conversation · At the information desk | 2 | 6 | 6 | Custom Main Title, two bilingual Scene Headings, Maya and Ari with distinct render profiles, consecutive Maya Turns, an empty Turn and optional blank ID. |
| Stress · Book audio and Reader | 4 | 10 | 43 | Existing legacy Title, long-name, same-Speaker, join and empty-Unit cases, plus a 34-EN/33-ID batch Card across two Sections. |

The existing isolated Book QA Main App provides **Initialize A2 demo library** and **Load / Connect existing v2 library**. Initialization reuses native fixture commands and the existing create-only disposable v2 transaction. The manual database is `prolingo_text_library_d3b_qa_book_a2_manual`. Automated tests use `prolingo_text_library_d3b_qa_a2_browser` in a disposable browser profile. Initial records contain zero audio bindings. Explicitly generate one Sentence or import a matching Portable ZIP to create partial coverage. The browser test exercises partial EN/ID coverage with a deterministic local provider, builds scoped Normal and Portable ZIPs, and verifies exact authored state and byte proofs in a new browser process.

The exact PowerShell startup commands, URL, connection instructions and Indonesian checklist are in the manual packet. [Manual UAT](docs/uat4/ProLingo_A2_UAT_Manual_ID.md)

**A2 recommendation — GO for isolated manual UAT.** Recorded-audio items require an explicit generation or import step in the owner's library.

## Verification

| Command | Result | Exit |
| --- | --- | ---: |
| `node scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs --voice-policy` | 6 PASS | 0 |
| `node scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs` | 16 PASS, 5 unchanged historical FAIL | 1 |
| Same assertions in the detached starting HEAD | 12 PASS, 9 FAIL | 1 |
| `node scripts/audit-v603-p9c-bulk-marathon.mjs` | 17 PASS | 0 |
| `node scripts/audit-v603-round-d0-f1-f2-patch.mjs` | 12 PASS | 0 |
| `node scripts/audit-v603-round-d1-reset-preferences.mjs` | 3 PASS | 0 |
| `node scripts/audit-v603-round-d2-reset-ui.mjs` | 7 PASS | 0 |
| `node scripts/audit-v603-round-d3-paragraph-acceptance.mjs` | 7 PASS | 0 |
| `node scripts/audit-v603-p12c-conversation-playback.mjs` | 13 PASS | 0 |
| `node scripts/audit-book-qa-body-audio.mjs` | 6 PASS | 0 |
| `node scripts/audit-book-qa-heading-audio.mjs` | 7 PASS | 0 |
| `node scripts/audit-book-qa-portable-audio.mjs` | 17 PASS | 0 |
| Inline Node check of `createEdgeTtsStream` and `synthesizeEdgeTtsBuffer` with mocked `MsEdgeTTS` | 3 routes checked | 0 |
| `npm.cmd run build` | Normal build completed | 0 |
| `$env:VITE_ENABLE_TEXT_UAT='true'` then `npm.cmd run build:uat` | UAT build completed | 0 |
| `node scripts/audit-text-uat-release.mjs` | 2 groups | 0 |
| `node scripts/audit-book-qa-a1a-browser.mjs` with `BOOK_QA_A2_AUDIT`, `BOOK_QA_BODY_AUDIO_AUDIT` and `BOOK_QA_HEADING_AUDIO_AUDIT` set to `1` | 26 groups, zero runtime exceptions | 0 |
| Vite Preview for `dist-uat`, HTTP check at the documented manual URL | HTTP 200 with Text v2 UAT identity | 0 |
| `git diff --check` | Clean | 0 |

The integrated smoke confirmed exact library isolation, durable state through a browser process restart, guarded startup, and the normal build opening canonical Text at v1. Both builds completed with existing warnings for browsers compatibility data, Swiper CSS nesting and main chunk size. [Browser evidence](artifacts/a2-book-qa-browser-report.json)

## Changed files

| Area | Files |
| --- | --- |
| Shared voice policy | `src/constants/voiceConstants.js`, `src/hooks/useMainAppPrimaryState.js`, `src/domain/audio/browserTtsVoiceDecisionDomain.js`, `src/domain/text/textStructuredVoiceDomain.js`, `src/domain/text/textStructuredVoiceAssignmentDomain.js`, `src/domain/text/textStructuredAudioGenerationDomain.js`, `src/domain/text/textStructuredAudioDownloadProfileDomain.js`, `src/services/persistence/textStructuredAudioGenerationPreferenceService.js` |
| Provider fallbacks and visible reset labels | `server.js`, `server/edgeTtsService.js`, `src/App.jsx`, `src/components/text/TextBatchPopup.jsx`, `src/components/text/TextStructuredAudioControls.jsx` |
| Persistent fixture and shell | `src/components/text/management/BookQaHost.jsx`, `scripts/fixtures/uat4/journey-to-london.js`, `scripts/fixtures/book-qa/persistent-demo.js` |
| Focused regression | `scripts/audit-book-qa-a1a-browser.mjs`, `scripts/fixtures/book-qa/check-persistent-demo.mjs`, `scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs`, `scripts/audit-v603-p9c-bulk-marathon.mjs`, `scripts/audit-v603-round-d1-reset-preferences.mjs`, `scripts/audit-v603-round-d2-reset-ui.mjs`, `scripts/audit-v603-round-d3-paragraph-acceptance.mjs` |
| Manual and acceptance | `A1a_Book_QA_Persistence_Capability_Ledger.md`, this report, `docs/uat4/ProLingo_A2_UAT_Manual_ID.md`, `artifacts/a2-book-qa-browser-report.json` |

## A3 / A3-G handoff

Evaluate a shared UAT navigation surface with explicit Table / Legacy / Book destinations in the existing App shell. Preserve each destination's authoritative data boundary, current selection and playback ownership. Book navigation should continue to require explicit scoped v2 opt-in and reconnection. Gate A3-G should exercise navigation and existing Table/Legacy behavior alongside the new Book authoring flows, then validate real-device smoke within the agreed scope. The three-tab integration and A3 authoring expansion were not started.

Production activation remains **NO-GO**. Canonical Text stays v1 and Book QA stays isolated v2. Physical Desktop/Android and actual-provider acceptance remain open. The worktree is uncommitted.
