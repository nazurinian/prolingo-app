# ProLingo V6 Book QA integrated audio acceptance

| Checkpoint | Commit |
| --- | --- |
| Independently accepted baseline | `b66893b227e548893e4263f2900cf6f5ec113301` |
| A1b-2B intermediate checkpoint | `05640503037b0b502c893055826fb1a0831dc4e5` |
| Actual starting HEAD | `d09401c1c63ff4332e9ee021e2cd97c23c67d709` |

The `test/text-v2-uat` worktree for `nazurinian/prolingo-app` was clean at the start. Both ancestry checks passed. The candidate remains uncommitted. Production activation is **NO-GO**. Physical Desktop and Android acceptance remains open under A6/4H2.

## Gate A · A1b-2B

| Check | Status | Evidence |
| --- | --- | --- |
| A01 · RF01 and RF02 | PASS | Canonical derived `MULTI-SPEAKER`, historical `SPEAKER` basename compatibility, parent/child collisions in both orders including Unicode normalized paths. |
| A02 · RF03 | PASS | A shared 64 MiB RF with two logical occurrences reached CRC serialization before remediation. The same reproduction now returns `NORMAL_AUDIO_LIMIT`. Boundary tests cover 2,048 entries, 128 MiB including UTF-8 names and ZIP structures, and ZIP32 count, payload and cumulative offset overflow using virtual sizes. |
| A03 · V01 | PASS | The real Normal button started a native Unit decode before cancellation. One context opened and closed, one decode ran, zero downloads occurred, the Web Lock was available again, the authoritative snapshot matched byte-for-byte and retry downloaded the archive. |
| A04 · V02 | PASS | An external collection write during native Unit decode caused `STALE_RESULT`, with zero stale downloads. Refresh enabled retry. Disposal during the final authoritative read returned `AUDIO_CANCELLED`; the panel unmounted. Reconnect enabled retry. |
| A05 · V03 | PASS | London fixture selected four exact Speaker/channel voice profiles. The real download held 32 Split entries checked by digest, ten complete Section/Turn WAVs and two trusted Full Conversation WAVs checked sample by sample. Channel and alternate selection, unavailable/missing Unit and unsupported rate diagnostics, imported Full omission and unchanged audio bindings also covered. |
| A06 · archive contract, scope and regression | PASS | All four Book QA audio flags enabled in Edge. The script logged 45 passing groups and exited 0. Portable tree and CSV agree, reorganized ZIP reimports idempotently, Normal follows P1/C1/P2/C2, and Library vs. Workspace outputs stay within the connected disposable library. |

**Gate A recommendation — GO for isolated Book QA, pending independent source review and human approval.**

### Gate A implementation inventory

| File | Purpose |
| --- | --- |
| `src/services/audio/bookNormalAudioService.js` | Limits each listening occurrence, including repeated physical RFs. Checks planned WAV bytes before constructing PCM. Retains cached reads only for packaged entries. |
| `src/services/audio/browserZipService.js` | Preflights stored ZIP geometry and reserved ZIP32 markers before CRC. Uses the same byte calculation as Normal. |
| `src/services/audio/textStructuredFullAudioExportService.js` | Supports cancellation, a duration bound and output-size admission in the actual decoder and PCM composition path. |
| `src/services/bookQaAudioSessionService.js` | Rechecks cancellation and connection lifetime after the final authoritative read. |
| `src/components/text/BookQaPortableAudioPanel.jsx` | Displays cancellation if it occurs before the download handoff. |
| `scripts/audit-book-qa-portable-audio.mjs` | Keeps historical tests and exercises the listening and ZIP32 limits. |
| `scripts/audit-book-qa-a1a-browser.mjs` | Runs the bilingual Normal gate in real Edge with disposable database and sentinel instrumentation. |
| `scripts/fixtures/a1b-2a/check-portable-audio.mjs` and `portable-browser-probe.js` | Exercise reorganized-manifest import, exact ZIP and index paths, idempotence, scope after reconnect and omission of imported untrusted Full. |
| `scripts/fixtures/a1b-2b/check-normal-audio.mjs` and `normal-browser-probe.js` | Deterministic recording, actual browser downloads, PCM verification, cancellation, stale/disposal races and damaged-byte diagnostics. |
| `A1a_Book_QA_Persistence_Capability_Ledger.md` and this report | Gate A status, scope and acceptance evidence. |

## Gate B · A1b-G

| Check | Status | Evidence |
| --- | --- | --- |
| G01 · multi-batch generation | PASS | Exact batch layouts of 32, 32+1 and 32+32+3 in the disposable QA IndexedDB. Shared RFs keep one binary. The byte case commits 64 MiB in one operation and 576 bytes in the next, from three provider fixture calls. Cancellation, quota failure and stale writer each preserve the first 32. Uncertain and committed-unaccepted second batches stop the sequence, then reconciliation recognizes 64 accepted references and the explicit retry commits three more. |
| G02 · damaged provisional recovery | PASS | Intact provisional bytes reuse their digest. A damaged asset owned by a failed precommit job can be recovered at the same physical ID. A committed proof protects all logical owners of that RF. Different bytes, unknown journal owners and corrupt uncertain operations fail closed. |
| G03 · actual playback representation | PASS | Offline Mixed Paragraph fallback reported the exact Sentence, Section, Edge provider voice, recorded media duration and SHA-256. Pause/Resume retain the session. Stop and Start resume the fallback Sentence, and Previous/Next keep Full command scope at the Card level. From Here keeps the requested boundary and actual Split identity. |
| G04 · bilingual and multi-Speaker playback | PASS | London byte/PCM proof, exact EN and ID provider IDs, independent narration and Speaker profiles, Workspace/Card/Sentence precedence, blank optional channels, preserved alternates and exact bindings after a voice edit. Standalone Conversation played the enabled Scene Heading, then kept consecutive same-Speaker Turns distinct during recorded Split playback. |
| G05 · integrated Title, Heading and Body playback | PASS | Heading browser probes, existing heading/session auditors and integrated Reader/Now Playing cases exercise atomic Main Title, both Heading kinds, paragraph Full and Split, Conversation Split and trusted local Full, imported untrusted fallback, sourced duration, continuation, cursor, Shuffle and the FULL → CARD → FOCUS → SEGMENT levels. |
| G06 · transfer and persistence | PASS | Text Pack JSON fixture imports before audio. Remapped native IDs resolve through preserved UIDs or copy lineage. ZIP A, ZIP B, combined files, exact bytes, versions, partial coverage, profiles and idempotent retry covered. Normal export and scoped audio playback work after reconnect. |
| G07 · concurrency, isolation and recovery | PASS | Scoped namespace and exact origin, two tabs, stale projection rejection, cancellation, disposal, durable reads, journal and no-replay recovery, and shared namespace/preference sentinels. Host instrumentation observes only authorized QA DB, companion and fixture endpoints. |
| G08 · regression and release boundaries | FAIL | The historical P7/HF2 default expectation fails on baseline and candidate. The scoped Edge replay, production verification, release audit, builds and Packet C Chrome retry passed. |

**Gate B recommendation — CONDITIONAL GO for isolated Book QA, pending independent source review, human approval and explicit disposition of the reproduced historical P7/HF2 failure.** The final scoped Edge replay passed all 51 logged groups.

### Gate B implementation inventory

| File | Purpose |
| --- | --- |
| `src/services/bookQaAudioSessionService.js` | Bounded ordered generation, exact verified reuse, resumable accepted batches, damaged provisional proof, and trusted Full dependency readback. |
| `src/services/bookQaSessionService.js` | Exposes ordered generation only through the existing authorized Book QA connection. |
| `src/services/persistence/bookQaAudioStagingService.js` | Checks and updates one proven provisional asset in the existing stage transaction while preserving its original job. |
| `src/domain/text/bookQaAudioDomain.js` | Uses the existing library-wide binary-proof owners to protect committed RFs and Full artifacts. |
| `src/components/text/BookQaBodyAudioPanel.jsx` | Enables large Card and Workspace Split requests and reports accepted and available counts, stops and Refresh requirements. |
| `src/services/audio/textStructuredFullAudioExportService.js` | Carries the session abort signal into the shared Conversation composer. |
| `src/services/audio/bookQaBodyAudioService.js` | Resolves per-Sentence or whole-Card fallback from the accepted hierarchy after Full is unavailable. |
| `src/services/playback/textStructuredPlaybackSessionService.js` and `src/App.jsx` | Track actual Book QA fallback Sentence playback and stopped-resume cursor. Full artifact and Card navigation semantics remain scoped to the actual command. |
| `scripts/audit-book-qa-body-audio.mjs` | Verifies bilingual precedence, blank channels and exact profile identity after a voice edit. |
| `scripts/audit-book-qa-a1a-browser.mjs` | Adds the hardening runner and production exclusion assertions. |
| `scripts/fixtures/a1b-g/check-hardening.mjs`, `check-hardening-playback.mjs`, `hardening-browser-probe.js` | Exercise real controls, publication and lease faults, sampled media identity, offline playback, and distinct Speaker scopes. |
| `scripts/fixtures/a1b-2a/check-portable-audio.mjs` | Sends two selected packages into a fresh copy for the interrupted combined import case. |
| `scripts/fixtures/a1b-2b/check-normal-audio.mjs` and `normal-browser-probe.js` | Reuse the downloaded bilingual fixtures for offline runtime byte comparison. |
| `scripts/audit-v603-p12c-conversation-playback.mjs` | Supplies the missing normal-App flag to the historical extracted App resolver. Existing assertions are preserved. |
| `A1a_Book_QA_Persistence_Capability_Ledger.md` and this report | Capability boundaries, acceptance matrix and handoff. |
| `artifacts/a1b-integrated-book-audio-evidence.json` and `artifacts/a1b-integrated-book-audio-sha256.json` | Browser scenario evidence and final per-file source and build hashes. |

## Reproductions and source anchors

- The repeated logical size test in [the Portable and Normal audit](scripts/audit-book-qa-portable-audio.mjs) fails at CRC on the starting implementation. [The Normal capacity check](src/services/audio/bookNormalAudioService.js) charges stored bytes per actual output before serialization. [The generic stored ZIP writer](src/services/audio/browserZipService.js) checks geometry for both nested and historical flat callers. Portable limits still apply at the existing import and export boundaries.
- [The browser probe](scripts/fixtures/a1b-2b/normal-browser-probe.js) gates the first native decode completion and separately the second authoritative read. [The session export guard](src/services/bookQaAudioSessionService.js) rechecks connection lifetime after that asynchronous read. No ZIP reaches the download control on either cancelled path.
- The old [Body generation panel](src/components/text/BookQaBodyAudioPanel.jsx) disabled larger Card requests. The ordered session sequence uses the same bounded stage and commit for every batch. [The generation probe](scripts/fixtures/a1b-g/hardening-browser-probe.js) checks authored owner order, shared RFs, job counts, accepted stops, and exact retries.
- Damaged provisional bytes formerly caused `AUDIO_STAGED_BYTES_UNAVAILABLE` even when the journal could prove the failed operation. The scoped [session proof](src/services/bookQaAudioSessionService.js) and [staging transaction](src/services/persistence/bookQaAudioStagingService.js) now allow the exact uncommitted case. The old code remains the outcome when ownership is unproven.
- Before hardening, a Full command falling back to Split retained its Card-first resume cursor. [The playback service](src/services/playback/textStructuredPlaybackSessionService.js) now updates the fallback Sentence and keeps the actual media evidence as the source of precision and duration.

## Archive and transfer evidence

- The original London export contains 42 Portable audio assets and 44 logical references, and the index path and fingerprint pairs match the manifest order. A relocated tree with adjusted exact paths imports 18 references, then ZIP B adds 26. Reimport recognizes all 44 and creates zero new bindings. The Connected Library Normal result has three Workspace roots and Selected Workspace has one. The original Normal result has 53 audio entries.
- The bilingual Normal download has 32 Split MP3s, ten generated Full Section/Turn WAVs and two trusted Full Conversation WAVs. James uses `en-GB-RyanNeural` and `id-ID-ArdiNeural`. Ticket Officer uses `en-GB-LibbyNeural` and `id-ID-GadisNeural`. Narration uses `en-GB-SoniaNeural` and `id-ID-GadisNeural`. Each Split matches the fixture bytes by SHA-256. The browser independently decoded every composition input and compared the full output PCM in sequence. The alternate pitch file has a separate render identity and exact digest.
- Durable missing and corrupt inputs are distinguished. Incomplete and non-1× Unit compositions are omitted. Imported untrusted Full is portable with verified bytes and omitted from Normal playback export. Export snapshot fingerprints guard authored data and audio bindings, and Unit artifacts exist only inside the download.

## Regression commands and results

All Node and browser commands below run from the worktree root. Counts are completed cases or groups printed by each script. A summary line is excluded from the group count.

| Command | Result | Exit |
| --- | --- | ---: |
| `node scripts/audit-book-qa-portable-audio.mjs` | 17/17 | 0 |
| `node scripts/audit-book-qa-body-audio.mjs` | 6/6 | 0 |
| `node scripts/audit-book-qa-heading-audio.mjs` | 7/7 | 0 |
| `node scripts/audit-book-qa-hf1-session.mjs` | 4 groups | 0 |
| `node scripts/audit-book-qa-t1.mjs` | 14/14 | 0 |
| `node scripts/audit-book-qa-a1a-browser.mjs` (Gate A, four audio flags) | 45 groups | 0 |
| `node scripts/audit-book-qa-a1a-browser.mjs` (Gate B, all five audio flags) | 51 groups, zero runtime exceptions | 0 |
| `node scripts/audit-v603-p15-a2-persistence.mjs` | 6/6 | 0 |
| `node scripts/audit-v603-p15-data-management.mjs` | 18/18 | 0 |
| `node scripts/audit-v603-p15-a2-persistence-browser.mjs` | 6/6 | 0 |
| `node scripts/audit-v603-p15-data-management-browser.mjs` | 13/13 on the built output | 0 |
| `node scripts/audit-v603-p15-r3-beta.mjs` | 1 group | 0 |
| `node scripts/audit-v603-p12d-d3b-content-unit-persistence.mjs` | 11/11 | 0 |
| `node scripts/audit-v603-p12d-d3d-regression.mjs` | 12/12 | 0 |
| `node scripts/audit-v603-p12d-d3d-browser.mjs` | 9/9 | 0 |
| `node scripts/audit-v603-p12c-conversation-playback.mjs` | 13/13 with the extracted App harness fixed | 0 |
| `node scripts/audit-v603-p12d-d5-conversation-audio.mjs` | 15/15 | 0 |
| `node scripts/audit-v603-p13-mixed-audio.mjs` | 11/11 | 0 |
| `node scripts/audit-v603-p13-integration-a5.mjs` | 8/8 | 0 |
| `node scripts/audit-v603-p12-a6-main-reader.mjs` | 14/14 | 0 |
| `node scripts/audit-v603-p12-a6-main-reader-browser.mjs` | 14/14 | 0 |
| `node scripts/audit-text-uat4-reader-browser.mjs` | 5 browser groups and 1 Node fixture group | 0 |
| `node scripts/audit-text-uat4-4c1-bilingual-typography-browser.mjs` | 7 groups | 0 |
| `node scripts/audit-text-uat4-notebook-browser.mjs` | 6 groups | 0 |
| `node scripts/audit-text-uat4-packet-c-browser.mjs` (candidate Edge) | 15 completed groups, then mouse drag timed out | 1 |
| `node scripts/audit-text-uat4-packet-c-browser.mjs` (starting HEAD Edge) | 15 completed groups, then CDP screenshot timed out in the same interaction group | 1 |
| `$env:UAT4_BROWSER_PATH='C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'` then `node scripts/audit-text-uat4-packet-c-browser.mjs` | 25 groups, including real mouse drag | 0 |
| `node scripts/audit-text-uat4-4c3-layout.mjs` | 1 group | 0 |
| `node scripts/audit-text-uat4-4d-now-playing.mjs` | 4 groups | 0 |
| `node scripts/audit-text-uat4-4e1.mjs` | 2 groups | 0 |
| `node scripts/audit-text-uat4-4e2.mjs` | 4 groups | 0 |
| `node scripts/audit-text-uat4-4f1.mjs` | 5 groups | 0 |
| `node scripts/audit-text-uat4-4f2.mjs` | 3 groups | 0 |
| `node scripts/audit-v603-beta8-p7-hf2-global-player-defaults.mjs` | 11 completed, then legacy default assertion failed | 1 |
| `node scripts/audit-v603-beta8-p4-staging-zip.mjs` | 21/21 | 0 |
| `node scripts/audit-v603-a4-staging-gc.mjs` | 7/7 | 0 |
| `node scripts/audit-v603-p10-h4-playback-remediation.mjs` | 8/8 | 0 |
| `node scripts/audit-v603-p10-h5-export-zip-remediation.mjs` | 11/11 | 0 |
| `node scripts/audit-v603-p14-legacy-a1.mjs` | 1 aggregate group | 0 |
| `node scripts/audit-v603-round-c1-legacy-empty-audio.mjs` | 4/4 | 0 |
| `node scripts/audit-text-uat-release.mjs` | 2 groups | 0 |
| `npm.cmd run build` | Normal build completed first | 0 |
| `$env:VITE_ENABLE_TEXT_UAT='true'` then `npm.cmd run build:uat` | UAT build completed second | 0 |
| `node node_modules/eslint/bin/eslint.js src --format json` | Baseline and final both contain 232 errors and 77 warnings | 1 |
| `git diff --check` | Passed | 0 |

Browser flags for the Gate A replay are `BOOK_QA_AUDIO_AUDIT`, `BOOK_QA_BODY_AUDIO_AUDIT`, `BOOK_QA_HEADING_AUDIO_AUDIT` and `BOOK_QA_PORTABLE_AUDIO_AUDIT`, each set to `1`. Gate B also sets `BOOK_QA_HARDENING_AUDIT=1`. All provider requests in these runs went to the deterministic loopback fixture.

The final replay checked that normal output excludes the Book QA host, panels, ZIP and recovery executors. The normal App opened the canonical Text database at v1 and exercised Table and Legacy playback. The browser evidence carries the 45- and 51-group lists, actual archive paths, Split and WAV digests, ordered PCM inputs, batch receipts, recovery diagnostics and production assertions. [Browser evidence](artifacts/a1b-integrated-book-audio-evidence.json)

## Final-byte verification

SHA-256 tree digests hash UTF-8 lines sorted by repo-relative path. Each line contains the raw file SHA-256, two spaces, the path and LF. The file inventory and per-file hashes for changed code and all build output are in [the SHA-256 manifest](artifacts/a1b-integrated-book-audio-sha256.json).

| Byte scope | Files | SHA-256 |
| --- | ---: | --- |
| Tracked runtime, fixtures, tests and build configuration plus new source and scripts | 513 | `d72aacf8141fcd1b54d6f32d5d000e97186506733b946e9ed702bf1acd2d5c92` |
| Normal `dist/` | 10 | `152b70346549408c4802ecdd816335fc80a740f3d926206aac14338483e886b5` |
| UAT `dist-uat/` | 14 | `e1737d961e444991a231d226ad30b2332c8be296bfb0e553ab75506da70cf1ea` |

## Baseline diagnostics and handoff

- The historical Staging ZIP audit numbers 21 assertions. The final line begins with `PASS` and summarizes those same 21 checks, yielding 22 lines under a plain `^PASS` filter. This matches both the first tracked version and its unchanged check count after the H5 source-anchor update. No expectation changed.
- Beta.8 P7/HF2 stops at its Tuti-default expectation on both `d09401c` and this candidate. The resolver returns `id-ID-GadisNeural` in both. The audit assertion and voice selection policy were preserved.
- Packet C reached the same mouse-interaction group on starting-HEAD and candidate Edge runs and then encountered the distinct timeouts listed above. The unchanged suite completed in Chrome. Edge Packet C drag remains unverified.
- P12-C reported 11/13 on `d09401c` because the legacy extracted App resolver lacked the later `bookQaMode` test binding. The harness now selects the normal App branch explicitly and passes 13/13 with the same assertions.
- Lint messages agree between baseline and final after normalizing line references embedded in hook warning messages. Production and UAT builds report stale browsers compatibility data, existing Swiper CSS nesting and main-chunk size warnings.
- The cross-library JSON scenario exercises the existing Text Pack merge before seeding the destination QA fixture. Any wider Book authoring and Text Pack management UI remains in its separately authorized phase. Final styling, physical Android and Desktop playback, background and lock-screen media, and real device transfer are open under A6/4H2.
- A2 starts only after independent review of the exact candidate and explicit human approval, including disposition of historical red checks. Carry forward the London Mixed fixture, the pure Paragraph and Conversation stress cases, preserved UIDs and copy lineage, scoped byte proofs and recovery evidence. A2 acceptance library work was not started.
