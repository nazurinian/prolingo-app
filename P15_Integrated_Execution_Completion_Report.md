# Structured Text integrated completion

**GO for extensive isolated user acceptance testing.** All five authorized phases completed, including the conditional P14 read-only foundation. Canonical migration/production activation remain **NO-GO** without separate approval.

Baseline verified clean: feature/p15-structured-data-management at a1a95cd1d5d3050d6bd384ec6c306a8dc80f5ec4, in prolingo-p12-integration-qa. No worktree/branch reset or merge. Checkpoints:

| Gate | Commit | Result |
| --- | --- | --- |
| H3-S atomic safety | e7882576a3882d7cdc09b77cf1c18e528e3cb02e | createOnly, existing DB/schema protection, same-TX count/write, noncreating missing probe |
| R1 readers | 8fcf1080b3649eb69b476236fe4d034c36c12d91 | Unified three-type DEV reader, shared presentation and one D5 host |
| R2 migration dry-run | 9b81631b1c0eb5be7ba4f583181557f5273df56d | Separate-source/destination migration and independently verified recovery |
| R3 persistent Beta | f23903ac3f10e8c9e0c4768ed9beac08981907f5 | Opt-in persistent QA, native editing, Reader/audio, backup verification/recovery |
| P14 A0/A1 | 46551a153253b69378bcc0162b3eba7b30b80954 | Legacy contract plus isolated read-only selectors; no Legacy/Table writes |

A final verification commit records this report and targeted test-contract/synchronization corrections. Its SHA is returned in delivery.

## Start testing

From **prolingo-p12-integration-qa**, run:

    npm run dev -- --host 127.0.0.1

Use the address Vite prints, with **?qa=text-beta**. Opt in, choose a fresh prolingo_text_library_d3b_qa_* name, then initialize the empty library or the three-type demo. Existing databases are connected without reseeding. The name is retained in the URL; reconnect after restart.

Other DEV-only entries:

- ?qa=structured-text — three-type in-memory reader comparison.
- ?qa=data-management — existing H3 advanced Data Management QA, including explicit confirmed destructive QA overwrite.
- ?qa=conversation-editor / ?qa=mixed-workspace — original isolated D4/P13 regression hosts.

These are development entries, excluded from production artifacts. No database is opened by the new Beta before opt-in/action, including when the actual App module is imported. The main production Text tab continues using its existing canonical v1 storage; the new persistent testing workflow is isolated.

## Reader combinations that actually work

| Workspace | Tampilan Lama in testing environment | Shared UI Beta |
| --- | --- | --- |
| Paragraph | Existing Paragraph Sentence interaction/flow reused per actual Section | Existing Full/Part/Segment, four bilingual layouts and three Part layouts |
| Conversation | Explicit compatible Turn adapter; real Turn boundaries/speakers/empties, not the old flat Sentence list | Existing Conversation-aware Shared Card surfaces |
| Mixed | Compatible Card/Unit adapter in global interleaved Card order | Same Shared surfaces dispatch by Card kind |

Tampilan Lama is a presentation choice, not legacy-line-v1 storage. Conversation/Mixed adapters preserve persistent identities; they are not claimed to reproduce an older visual design exactly. Main App selector/embedded Shared shell accepts validated v2 projections, but canonical v1 Conversation/Mixed remains gated. V1 Paragraph virtual Sections remain nonpersistent.

The parent owns one existing D5 host. Mode/level/bilingual browsing does not remount, reconfigure or cancel it. Explicit audio configuration changes stop the attempt according to the existing contract. Current Segment/Unit/Card highlights come only from authoritative session evidence; whole-Card Full has Card precision, per-Sentence Full fallback has Segment precision.

## Persistent QA and migration safety

- Accepted commands publish one native transaction result to the same session observed by Reader and Data Management. Arbitrary new Paragraph/Conversation/Mixed Workspaces can be created from a blank library; demo IDs are not authoring restrictions.
- Data persists across reload and a new Edge process. Unsaved drafts, reader/view/audio-control choices and selected ZIP binaries are session-only; conflict reload within the live session preserves drafts.
- Native IDs/UIDs, bilingual pairs, joinAfter, order, speakers, source ownership, AudioVariant/RF/Full metadata and Staging references retain their contracts. No new command allocator, audio engine, voice registry or physical cache was introduced.
- Consistent JSON backup export reads complete metadata with records. User-selected files undergo strict validation. Recovery creates a fresh QA database with createOnly, then separately reads and verifies its fingerprint. Existing data is never overwritten by this workflow.
- A selected v1 backup can be converted into a new v2 QA copy after explicit confirmation. No automatic read/copy/export of canonical data occurs.
- Optional portable ZIP selection reuses existing RF/Full matching and existing D5 Blob playback for records already present. It does not create metadata or access global Staging/folder storage. Reselect binaries after restart; JSON does not include them. Decoder errors still use native fallback.
- R2 verified a separately named v1 source remains unchanged through successful/interrupted migration, with before/after backup recovery, invalid-input rejection, Unit allocation, counters, source registries, audio associations and Legacy exclusion.

The dormant in-place migration helper still has separate schema-upgrade and record transactions. This report does not certify rollback of a canonical in-place upgrade. Representative user-export testing, production switching/recovery design and explicit activation approval remain required.

## Consolidated verification

Evidence: **C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-integrated-18c86330**. Per-suite logs and final-node-results.json / final-browser-results.json retain initial results, including resolved failures.

- **45 Node configurations: final 40 PASS; five established historical failures unchanged.** Includes new R1/R2/R3/P14, P15 A1/A2, P13 A2–A5, P12 A1–A6, D3–D5, P9, RF/Full/Split, External JSON, Text Pack/source, Staging/ZIP/GC fixture regressions.
- **23 browser configurations: all pass after the R1 harness correction described below.** A2 original 6 and independent 16; H1 13; H2 8; H3 5; H3-S 5; R1 7; R2 5; Beta final 8; P13 Reader/Editor/Audio/A5 11/11/10/4; real App A6 12; Shared A1/A2/A3/A4C/A4H 7/10/8/12/6; D3 9, D4 13, D5 3/UI 15. Applicable production route gates pass.
- **Beta final 8/8**, actual page reload, **new Edge process with the same temporary profile**, and six route/opt-in gates PASS. Two gates use the actual App module rather than the App stub. Zero canonical accesses; no pre-opt-in DB opens.
- Full at requested 1.5× verified through the real Beta controls: Paragraph whole-Card fallback uses Card precision, subsequent Conversation fallback uses authoritative Sentence precision; one host retained.
- Source checks, fresh-create races, independent-realm initialization, interrupted write/restore and independent recovery checks PASS. Test DBs are separately named and cleaned; no real audio deleted.
- Scoped ESLint --max-warnings=0 PASS for all changed/new JS/JSX except the known TextStructuredPlayer debt. That file has the **same exact rule/message diagnostics as baseline: 17 errors, 3 warnings**, verified via baseline/current stdin lint. No newly introduced player lint diagnostic.
- Production build PASS (8.54 s): index-Dunlwdrt.js, 1707.84 kB / gzip 452.19; index-BI6XMyn5.css, 121.51 kB. Existing chunk-size and browser-mapping-age notices remain.
- Git diff whitespace/integrity checks PASS; DB/schema constants remain **1**. AI Voice worktree fc8e0350c2d911381b47d14e973132e2b42d7f93, P13 source branch 6d481cd3fcf8cad580661552a10c0203ffd30419 and backup a85bb63be2dcb2fad69f31e6ea7654ef9fcf35bd preserved. No push/deploy/stable merge.

Two newly observed test issues were investigated:

1. P13's old assertion required Mixed to be rejected by the main selector. R1 explicitly changes that contract. It now asserts exact v2 Card order **and retains canonical v1 rejection**. Final 18/18 passes; no historical hash/version assertion was changed.
2. R1 initially captured status before React published it. Diagnostic serial run reproduced **before=null**, after=current TTS session, with unchanged invocation/cancellation counts. The test now waits for committed matching Workspace/session/step telemetry before switching views, preserving exact status and no-restart assertions. **Five consecutive serial runs pass 7/7**, with no production scrolling/audio change. Earlier failures remain in logs.

Five historical Node failures remain separate: beta8-p9-hf4a-card-ux (obsolete source regex), beta8-p9-hf4c-r1-ui-repair and beta8-p9-hf4c-player-audio-ux (old expected version), d0-d1-text-identity (frozen Table hash), beta8-p9-hf5-voice-audio-ux (old Browser TTS label expectation). They were not altered or counted as passing.

Focused reproduction commands:

    node scripts/audit-v603-p15-a2-persistence-browser.mjs --h3-s
    node scripts/audit-v603-p15-a2-persistence-browser.mjs --r1
    node scripts/audit-v603-p15-a2-persistence-browser.mjs --r2
    node scripts/audit-v603-p15-r3-beta-browser.mjs
    node scripts/audit-v603-p15-r1-reader.mjs
    node scripts/audit-v603-p15-r2-migration.mjs
    node scripts/audit-v603-p15-r3-beta.mjs
    node scripts/audit-v603-p14-legacy-a1.mjs

## Manual acceptance checklist

1. Opt in with a fresh QA name. Test both empty-library creation and the optional demo. Add a Collection and all three Workspace types through Data Management.
2. Paragraph: create/reorder Sections; add duplicate English text with distinct meanings, blank meanings and joinAfter changes. Compare classic and Shared Full/Part/Segment, all bilingual and Part layouts; use search, copy/select and Enter/Space play.
3. Conversation: empty Scene, empty Turn, two adjacent same-speaker Turns, multiple Sentences per Turn; register/rename/reassign speakers; split/merge/move within native boundaries. Verify Reader immediately reflects accepted commands.
4. Mixed: Paragraph → Conversation → Paragraph → Conversation; reorder Cards globally and retain their Unit types/empties. Check both presentations.
5. Audio: explicit Workspace/Card/Sentence play; EN, ID and both orders; Split/Full and 1×/1.5×; pause/resume/stop; change layouts while playing. Confirm actual source status and truthful Card versus Sentence highlighting. Compare installed speaker voices audibly.
6. If available, select a known portable audio ZIP matching existing metadata. Verify local/Cached Full use and fallback on unavailable/stale/unusable binaries. JSON metadata alone must not imply playable audio.
7. Save an edit, reload the page, close/restart the browser and reconnect to the same QA URL. Verify records, identities and order. Unsaved drafts and binary selection are not restart-persistent.
8. Open the same QA DB in two tabs. Commit in one, save a draft in the stale tab, reload authoritative source, inspect the winner, then explicitly retry if still appropriate. Do not auto-replay a committed command.
9. Export JSON, verify the selected file, recover into a **new** QA name, and compare content/metadata. Try malformed files and existing destinations: both must reject safely.
10. Repeat on desktop and Android/narrow/large-text layouts with real voices/audio and downloads. **Actual Android, device UX and human visual/auditory acceptance are not claimed by headless Edge tests.**

## Remaining limits and P14 status

Canonical v2, automatic startup migration, production Conversation/Mixed creation, real-data writes, destructive source/restore apply, audio generation/GC and non-unit-rate WAV composition bypasses remain disabled/gated. Existing rate-aware-assembly-required restriction remains. This is a usable isolated UAT environment, not production activation.

P14 reached A0 plus read-only A1: explicit Legacy model discrimination, one-Segment-per-line validation, stable TEXT_/Segment identity, frozen metadata/audio association inspection, zero storage calls and all mutation capabilities false. No large Legacy UI, implicit conversion, Table behavior or AI Voice change.
