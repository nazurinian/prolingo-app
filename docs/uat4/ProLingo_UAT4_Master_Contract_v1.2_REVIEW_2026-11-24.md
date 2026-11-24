# ProLingo — UAT-4 Master Design & Implementation Contract

**Checkpoint:** 24 November 2026 (Asia/Jakarta)  
**Revision:** v1.2 — whole-conversation completeness review (supersedes v1.1 after review)  
**Status:** design agreement plus proposed refinements / implementation pending; not a release acceptance report  
**Baseline:** `6.0.3-beta.9-uat.2`, UAT-3 smoke 12/12 PASS (prior checkpoint)  
**Target:** `6.0.3-beta.9-uat.3`  
**Repository:** `nazurinian/prolingo-app`  
**Branch:** `test/text-v2-uat`  
**HEAD verified:** `0dba2c5de2ec7297a5606d05a2e45206559990d8`  
**Worktree reference:** `prolingo-p12-integration-qa` (confirm clean status and branch locally before edits)  
**Owners:** Gemini 4 Neon — UI/UX and layout experiments; Codex — core architecture, playback contracts, integration and tests; user — visual and device acceptance.

This contract consolidates the old UAT-4 screenshots and the subsequent design discussion. It supersedes old screenshots wherever the terminology or layout conflicts. No source, deployment, database or actual device data has been changed by this checkpoint. Proposed defaults, exact library selection and remaining interaction choices must be validated at the appropriate gate.

## 1. Non-negotiable boundaries

- Preserve canonical IndexedDB v1/schema v1. Canonical v2 activation is **NO-GO in UAT-4**. Use only the existing isolated UAT v2 mechanism for persistent Content Unit testing. A source check is not an inspection of physical user IndexedDB.
- Freeze hierarchy: Collection → Workspace (`document`) → Card (`block`) → Content Unit (`section` for paragraph; `turn` for conversation) → Segment. Persisted unit kinds are `paragraph` and `turn`.
- Preserve all existing IDs/UIDs, ownership, order, speaker registry identity, segment bilingual text, joinAfter, RF keys/files/Blobs, Full Audio artifact IDs/fingerprints/format, import/export/ZIP and migration compatibility. No resegmentation for display. No new Book Page, Part or Study Box entity.
- Mixed interleaves Paragraph and Conversation Cards in authored order. A paragraph Card can contain multiple Sections or a single Section. Conversation Scene contains Turns with speaker identity; consecutive turns by same speaker remain distinct. Retain empty Cards/Units; empty or missing audio is not a playable target.
- Title Card is an existing paragraph role (`paragraphRoleV1`), not a parent or new block type. Its segment content can be eligible for audio; workspace/card metadata titles are not automatically spoken. Verify actual EN/ID title playback and avoid duplicate displayed headings. Do not assume pure Conversation accepts Title Cards without auditing taxonomy.
- UI preference persistence may be adapted in existing preference mechanisms, with backward-compatible defaults and reset behaviour; not content-schema migration. Do not persist derived view fragment IDs or counters as data identity.
- Preserve Table, Legacy Text and P15 boundaries and previous acceptance. AI Voice Track B (`feature/ai-voice`) remains isolated. No Memory Mode until after Stable. No automatic dependency install, branch merge or promotion before agreed gates.

## 2. Terminology and representative fixture

Workspace = full visual Book Page, not a new record. Card = Paragraph Card, Title Card, or Conversation Scene Card. Section = paragraph alinea; Turn = speaker turn at same level as Section. Segment = bilingual learning unit. Retire old Reader mode `Part`; historical screenshots used Card to mean the whole page and Part to mean a block, which is superseded. Use global Card ordinal plus optional type ordinal P1/C1/P2/C2, and unit-local segment ordinal. All display numbers derive from authored structure, not shuffled queue position or persistent ID.

Primary fixture **A Journey to London**, four Cards / 11 Content Units / 37 Segments:

| Card | Title | Units | Segments |
|---|---|---|---|
| 1/4 · P1 | Preparing for the Journey | SC1, SC2 | 4 + 4 |
| 2/4 · C1 | Buying a Train Ticket | T1 James, T2 Ticket Officer, T3 James, T4 Ticket Officer | 3 + 3 + 3 + 3 |
| 3/4 · P2 | On the Train | SC1 | 5 |
| 4/4 · C2 | Meeting Another Passenger | T1 Emma, T2 James, T3 Emma, T4 James | 3 + 3 + 3 + 3 |

Add title-role, long bilingual texts, unequal translation lengths, repeated speakers, empty units, single unit, missing channel/audio, and long workspace fixtures in QA. The 37-segment fixture is a design example, not verified existing seed data.

## 3. Four Reader modes

| Mode | Visual contract |
|---|---|
| Full | All workspace content flows as a book; natural paragraphs, heading hierarchy and dialogue speaker lines, no excessive cards/boxes or numbering. |
| Card | Each Card has a clear boundary, with all its Sections/Turns visible in authored order when open. |
| Focus | One Unit visually focused per open Card; Vertical/Horizontal styles. |
| Segment | All Sections/Turns remain complete natural text above **one** Segment Study Box per Card; independent Unit selector and local Segment selector. |

Card visibility independent: Follow Playback / Expand All / Custom. Multiple open cards allowed; collapse must not stop playback. Manual browsing must not mutate active audio; Return to Playing restores follow. Mode switching retains queue, selected content, and preferences. Keep actual playback, visual focus and selection separate. Legacy Part vertical-list → Card; horizontal-focus → Focus Horizontal; vertical-focus → Focus Vertical, subject to preference audit. Old per-card Full → new workspace Full; preserve old data and underlying audio commands.

Focus Vertical: active Unit large and fully readable; previous/next smaller previews; scroll-to-centre/snap with stable heights and no clipping or nested scroll trap. Horizontal: swipe carousel, optional edge previews, compact Unit navigation rail with ordinal, speaker, segment count/active indicator. Hide redundant controls for one Unit. Embla vs Swiper vs native CSS scroll snap are candidates, not installed/approved dependencies. Validate long text, mobile momentum, reduced motion, keyboard navigation and reflow before selection.

## 3A. Shared Workspace Style — separate from Reader Mode and Bilingual Style

Recovered prior design direction: Full is one book-like visual page; Paragraph has natural first-line indentation; Conversation uses orderly speaker names/colons rather than alternating chat bubbles or a compulsory uniform left edge; stacked/aligned/inline speaker arrangements, left accent rails and Paragraph/Scene titles were discussed. The exact previous wording was not recovered in full. The examples and preference labels below are a proposed implementation contract for user review, not proof of existing controls.

Workspace Style is the shared structural/typographic presentation policy for Paragraph and Conversation, regardless of Full/Card/Focus/Segment. It must not reorder data, change a Card or Unit identity, or determine the playback sequence. Keep separate from bilingual layout, focus carousel orientation and card visibility. Mixed applies the Paragraph policy to every Paragraph Card and the Conversation policy to every Conversation Card in authored order; no per-type regrouping. Shared renderer must preserve natural Section/Turn text, including Segment Mode context (except intentionally selected Sentence Interlinear). No new content fields are required for these policies.

### Shared Text Alignment — confirmed correction

**Align Left / Justify applies to all Structured Text body content**, not only Paragraph. A Workspace-level effective alignment policy is consumed by Paragraph Sections and Conversation Turns in Full, Card, Focus and Segment, including the primary and secondary reading text and Study Box body. Do not force speaker labels, headings, navigation controls, or Global Player metadata to justify: these have distinct structural alignment rules. Speaker layout (Stacked/Aligned/Inline) and first-line Paragraph indentation remain independent. In Aligned Conversation, justify/left applies inside the speech column, not across the speaker column. Inline speaker labels participate in the first line without changing speaker identity. Apply equally to Mixed content in authored order, EN-only, ID-only, EN–ID and ID–EN, with all permitted bilingual styles. Last lines remain natural; avoid exaggerated word gaps on narrow screens, and test accessible overflow. Default Left is a proposal; user can choose Justify. The exact settings ownership and responsive fallback require acceptance; never silently change saved alignment.

### Paragraph presentation

- Natural flow within each Section; first-line indent at the start of each actual alinea, not at every wrapped line or every Segment. Provide an indent on/off or amount control as a proposed refinement; do not assume this already exists. Preserve authored paragraph boundaries, punctuation and joinAfter. Alignment is inherited from the shared text policy below, independent of indentation; no separate Paragraph-only alignment setting. Paragraph spacing separates actual Sections and Cards without excessive gaps. Title-role Card is not indented like body text.
- Full: minimal book-like headings/spacing, no repeated nested Card boxes. Card: visible Card boundary and all Sections; Focus: same style within active Section and previews; Segment: same complete Sections above one Study Box.
- Paragraph accent and active audio highlight are distinct; do not colour all body text by Section or speaker unless approved. A thin contextual rail or heading accent may be used; Full remains book-like.

### Conversation presentation — three candidate choices to confirm visually

| Style | Illustrative layout | Behaviour |
|---|---|---|
| Stacked | `James:` on its own line, then the complete Turn below | Good for narrow screens and long speaker names. |
| Aligned | Name/colon column, followed by Turn in a separate aligned text column | Continuation lines align with speech, not with the name; adapt/collapse on narrow screens. |
| Inline | `James: Good morning...` in the same natural flow | Compact book/script layout, with coherent wrapped lines. |

All Turns retain authored order, speaker attribution and distinct identity, even repeated consecutive speakers. No mandatory left/right chat bubbles or alternation based on speaker index. Speaker colours stable by speaker identity, not position. Use readable names/colons and optional subtle left rail; active channel highlight independent of speaker colour. Bilingual translation follows the selected speaker layout without repeating the name unnecessarily. Responsive long names, multiline turns, missing speaker, many speakers and repeated speakers are required test cases. A one-unit Card suppresses redundant navigation but not content or necessary speaker identity.

### Titles, headings and visibility

Distinguish Workspace metadata title, Card metadata title, and playable Title Card content. Prior design direction: main Workspace title at top with Play All, optional ID title in supported details; Card title optional and Scene heading meaningful. Audit actual title fields and bilingual heading capability before promising authoring or speaking them. Render real supported heading data only; never invent metadata translations. Title Card EN/ID segments are the source of any existing playable title content; avoid duplicate header/body text. Separate explicit heading playback from Play All only if supported and approved; metadata title must not silently become a new audio item. Earlier proposal of optional separate heading playback (default OFF) remains an audit/pending decision, not an implementation mandate. Decide heading visibility/numbering and spacing during 4B0 visual gate; keep authored order and local hierarchy regardless of visibility.

### Reader Settings contract — scope audit and proposed grouping

| Setting family | Responsibility |
|---|---|
| Reader Mode | Full / Card / Focus / Segment |
| Workspace Style | Shared Text Alignment (both types, all modes), Paragraph indent/spacing, Conversation speaker arrangement, heading visibility, accent/rails |
| Reading Language & Bilingual Style | EN only / ID only / EN-ID / ID-EN and permitted style per mode; Contextual position |
| Focus Style | Vertical / Horizontal, only where relevant |
| Card Visibility & Follow | Expand All / Follow Playback / Custom; manual browsing vs return-to-playing |
| Appearance | Primary and secondary size, font family, line height, translation contrast, spacing; optional guide lines for Notebook if accepted |
| Playback Settings | Audio representation, channel/voice order, source, speed, repeat/shuffle, scope and intent; independent of display |

Expose relevant controls contextually, do not make one long unstructured settings panel. Preserve existing settings and defaults where possible; audit actual global/workspace/card inheritance, overrides, reset-to-default behaviour, persistence on refresh and switch, and legacy preference mapping. Proposed shared default with workspace-level override where supported; do not introduce a new content-schema or persistent store just to implement presentation settings. Do not silently replace user preferences. Verify Reset only active for changed values, UI commit semantics and no flicker against previous acceptance. Exact defaults, control placement and whether a given setting belongs at global/workspace/card scope require user approval after 4A/4B0 audit.

## 4. Bilingual reading contract

Primary display EN or ID, with optional secondary translation. Reading order is independent of audio order. EN Only and ID Only available for all modes.

| Style | Full | Card | Focus | Segment context |
|---|---|---|---|---|
| Separated (complete primary, then complete secondary per Unit) | optional, not default | optional | available | disabled |
| Sentence Interlinear (each segment on own line/block, translation underneath) | available | available | available | optional |
| Notebook Interlinear — Parallel Flow | candidate | candidate | candidate | candidate |
| Contextual (only selected/actual playing Segment translation, Above/Below/Inline) | available | available | available | disabled; represented by Study Box |

Suggested initial defaults (verify during UAT): Full and Card primary-only or Contextual; Focus Contextual or Sentence Interlinear; Segment primary-only context plus bilingual Study Box. Notebook default only after prototype acceptance. Contextual preserves all primary text, never hides inactive text like future Memory Mode. Above/Below uses reserved in-flow space, Inline reveals near active segment; no overlay obscures adjacent text. Avoid duplicate EN/ID in separate Lens on Segment mode. Respect one active translation target and actual playback precision; browsing may select a segment without falsely labelling it playing.

## 5. Notebook Parallel Flow — locked visual target, technical gate pending

Both channels flow as interlinear paired fragments. Primary language sets paragraph order and main line breaks; short segments may share one line, long ones span lines; the secondary starts under the matching beginning and continues underneath later lines, **not** dumped only at the segment end. Translation is smaller and muted, supports its own wrapping and never overlaps neighbours. Primary order can reverse EN↔ID. Align Left and Justify options; Left suggested default. Primary/secondary font size, line spacing and typography are UI preferences; translation ratio ~75% is a proposed starting value, not an invariant. Avoid illegibly shrinking translation; allow additional annotation rows or a clear fallback for long secondary content. Never omit or truncate text.

Native HTML Ruby and a custom measured renderer are experiments, not yet proven. Compare real Chromium/Android layouts, long and short segments, narrow widths, font changes, zoom, RTL not a requirement for this EN/ID scope, justify and reverse order. Do not force one segment per line to claim Notebook success. Custom layout may measure text and DOM line fragments and recompute on resize; actual library/algorithm chosen after prototype. Segment data has no word/phrase alignment; fragments are visual projections, not semantic translation alignment or new segments. Do not generate extra translations or split actual data. All fragments retain original Segment ID/channel and interaction; no duplicate accessible reading order. Preserve exact punctuation and joinAfter. If wrapping cannot meet readability and non-overlap constraints, explicit fallback (e.g. Sentence Interlinear) rather than broken layout. Gate before integrating Notebook into production Reader.

## 6. Segment Study Box — one per Card

P1 displays SC1 and SC2 in full, then one box. C1 displays all four Turns, then one box. Study Box includes Unit picker (SC1/SC2 or T1 James/T2 Officer etc), Segment picker local to selected Unit, Previous/Next selection, EN and ID display, independent channel play, Play Segment and Play & Continue. No flat SG1–8 or SG1–12 numbering. Preserve selection per Unit when switching; selection is view state, not another playback cursor. Hide redundant Unit chooser for a single Unit. Clicking context in Segment Mode selects Unit+Segment without interrupting playback; explicit play starts audio. For Full/Card/Focus tap EN/ID performs one-time channel-specific Split playback; explicit select-only affordance if needed. Exact final interaction gestures (tap vs dedicated icon, return-to-playing and auto-scroll behaviour) require UI acceptance, especially Android. Do not force long context to scroll away to the box on every selection; test sensible scroll/focus.

## 7. Playback contract

Independent axes: Reader Mode, Workspace Style, Reading Style/Language, Card Visibility/Focus, Audio Representation (Full/Split), channel order, playback intent and scope. Full Reader != Full Audio. Entering Segment Reader during Full Audio never stops or modifies preference automatically. Study Box/individual segment commands temporarily override to Split; after completion the user's Full preference remains. A Unit scope with no exact unit full artifact uses a valid split path; do not invent Unit artifacts or slice a Full file without timing. Workspace Full can sequence whole-card Full audio, no mandatory merged workspace artifact.

Target semantics:
- Tap EN/ID in Full/Card/Focus: Single Play exact channel, one-time override; selected target must resolve by persistent identity. Segment Mode context tap selects only; its explicit EN/ID buttons play target.
- Play Segment: selected segment and configured channel sequence; Play once stops at target completion. Existing repeat and sequence behaviours remain compatible; exact controls for intentional repeat to be audited.
- Play Section/Turn, Play Card, Play Workspace: use corresponding scoped target. Play & Continue / Start From Here uses an explicit boundary (Unit, Card, Workspace); propose Card default for Study Box, not yet locked; scope must be visible before start. From-here must continue across Units and Cards where selected scope allows.
- Single and Continuous are intents on existing playback session paths, not separate players. One active audio session across Table/Text/Legacy; cancel old playback and ignore stale asynchronous completions when starting new target. No parallel playback or hidden queues.
- UI local prev/next chooses Segment within parent; global prev/next uses actual ordered queue, including shuffle/repeat, not visible order. Preserve existing boundary semantics unless explicitly changed and tested. Pause retains position; Stop removes active highlight while keeping eligible resume identity. Global Play resumes existing compatible session or uses current global preferences on fresh start. Preserve original rate, source fallback, EN/ID sequence, repeat and shuffle semantics.
- Controls that own active target or same session can show Stop together; inactive independent target controls remain Play and replace old session immediately. Global Stop works for all. Continuous stop controls follow session ID even when active Unit changes. No blanket isPlaying → every button Stop.
- Playback source/representation displayed from actual runtime: local RF, local/generated Full artifact, TTS, Full→Split fallback; not from preferences. No extra file creation required for reader design.

Audio settings boundary: audit existing Global/Sidebar, Workspace and Card Audio settings, Browser TTS versus Edge/generated/local RF, Local First/TTS Only (where available), per-channel and per-speaker voice selection, EN/ID playback order, rate, repeat/shuffle, inherited versus overridden values and Reset. Preserve previously accepted behaviour and avoid introducing independent Study Box audio preferences or a second engine. Resolve the effective configuration once at command/session start according to existing precedence; display actual source/voice/rate, distinguish temporary channel/Split overrides from persisted choices. Exact existing inheritance and any required change must be reported by Codex in 4A before implementation. Do not add new providers or change defaults as part of this Reader patch without approval. Test workspace/card switches and return to default, Table/Text isolation, cancellation when changing sources, and Full/Split fallback.

Current source at baseline has explicit scopes segment/card/from-here/document, not Unit. Codex must audit and add Unit scope safely using persistent unitId and v1 compatibility path; do not interpret missing IDs as permission to play unrelated scope. Queue item carries unitId when present and global displayId, which is not local Segment number. Existing structured and legacy/Table service paths remain intact; shared active session ownership and presentation adapter, not mandatory rewrite into one monolithic engine.

## 8. Unified Now Playing Context and Global Player

One normalized read-only projection of **actual** active runtime session. Proposed fields: domain/owner, session ID and state, workspace/card/unit/segment IDs, authored display ordinals and totals, speaker ID/name, active channel, requested and actual representation, source/provider/voice, effective rate, scope, actual queue index/count, elapsed/duration only if available, precision (`none`, `card`, `segment`; unit precision only if independently supported). Use existing cursor/queue/metadata source, no duplicate mutable cursor. Table adapter supplies existing word/part/learning channel, not fabricated Card or Section. Legacy adapter preserves current semantics. Reader/Study Box/highlight/Global Player/Media Session all consume same playback projection. User may browse another tab/Unit without switching active owner until playback explicitly starts.

Compact player uses workspace title and authored context, e.g. `A Journey to London` / `Card 2/4 · C1 · T2/4 · Officer · SG2/3` / `Playing · EN · Split · Local`. Expanded shows Card title, full speaker, actual segment text when precise, channel, scope, source, provider/voice, rate, queue progress and controls. Avoid confusing queue progress with segment index; actual time progress only if available. Table: `Abandon` / `Part 01 · Word 12/30` / actual learning channel and source; retain Table transport, sequences and preferences. Compact labels can omit redundant SC1/1, not internal identities. Artwork uses content type/ProLingo, not identity mutation.

Full audio without valid timing: Card-level now-playing and highlight only; omit speaker/Unit/Segment claims unless proven by actual runtime. Full→Split shows actual Segment/channel; exact Full timing may show segment only if authoritative. Same word/audio file reused by different speakers must show current context, no physical rename. Pause amber, active EN blue, active ID purple (old screenshot palette); paragraph teal, scene indigo, speaker colours separate, selected/focused states distinguishable (do not imply sound); use contrast/accessibility and light/dark. No fake progress, no active highlight after stop.

Android existing MediaSession lifecycle must use same projection. Example metadata title `C1 · Officer · T2 · SG2/3`, artist `A Journey to London · EN`, album collection name if known, artwork. Full title `C1 · Full`, no false speaker. Actions previous/play/pause/next/stop where supported; seek only if actual duration/seekable source. Update metadata per logical audio step, not every animation frame; clear stale metadata and timeline on stop. MediaSession support is not a guarantee of background playback. Real Android tests for RF/local MP3/WAV and Browser/Device TTS separately, locked screen, notification actions, app/tab switch, resume, Bluetooth/headset if available. No forced background workaround or new APK requirement.

## 9. Patch sequence and gates

| Patch | Owner | Deliverable / gate |
|---|---|---|
| 4A | Codex | Read-only baseline audit + implementation contract, inventory actual DB activation, reader/Workspace Style preferences, settings scope and inheritance, heading/audio support, audio ownership/cursor, scopes, Table/Legacy and MediaSession; test baseline; no schema changes. |
| 4B0 | Neon | Shared Workspace Style visual foundation: shared text alignment for both types/all modes, Paragraph indent/spacing, stacked/aligned/inline speaker positioning, titles/rails, responsive settings grouping; isolated visual prototypes and user approval before 4B1. |
| 4B1 | Neon | Shared Book Reader Full + Card; hierarchy, title/role, typography, dialogue, ordering, visibility; visual approval. |
| 4B2 | Neon | Focus Vertical/Horizontal prototypes; compare library/native; responsive long content; visual approval. |
| 4B3 | Neon | Segment UI one box per Card, hierarchical Unit/Segment selector, selection and passive browsing; visual approval. |
| 4C1 | Neon | Shared bilingual styles, language order, contextual position, left/justify and responsive typography; per-mode capabilities. |
| 4C2 | Neon | Isolated Notebook Parallel Flow feasibility prototype; native Ruby vs custom, real browser/mobile; go/no-go before integration. |
| 4C3 | Neon | Integrate accepted Notebook renderer and shared appearance. If prototype fails, stop Notebook integration, report and decide separately; no silent substitute. |
| 4D | Codex | Unified Now Playing Context, authored hierarchy numbering, Table/Text/Legacy adapters and actual precision/source; deterministic tests. |
| 4E1 | Codex | Segment/Unit/Card/Workspace scopes, one-time channel/Split overrides, Single vs Continuous, queue and Start From Here; contract tests. |
| 4E2 | Codex | Session ownership, cancellation/race prevention, stop/pause/resume, navigation, focus-follow and highlight selectors; regression tests. |
| 4F1 | Codex | Shared Bottom Player transport/metadata wiring with Table and Legacy regression; compact/expanded contract. |
| 4F2 | Codex | Media Session lifecycle metadata/actions and Android background checks, no stale state. |
| 4G | Neon | Global Player UI compact/expanded, palette, audio states, interaction, auto-scroll, accessibility/mobile/light/dark polish; no core rewrites. |
| 4H1 | Codex + independent review | Full automated regression, build, data/audio invariants, UAT deployment verification. |
| 4H2 | User + assistant | Real desktop and Android acceptance on isolated UAT data and representative user fixture; go/no-go for uat.3. |

4B0 is a proposed additional subpatch (16 total instead of 15); confirm during review. 4B/4C UI consumes stable interfaces agreed in 4A; no fabricated runtime logic. Integration after 4D/4E. Each subpatch: one bounded change set, explicit changed files, tests actually run, before/after screenshots for UI, known gaps, commit SHA and user gate where applicable. Do not assign Neon core playback or storage changes without separate Codex review. Avoid bundling entire roadmap in one prompt. Existing build UAT flow (`npm run build:uat`, `dist-uat`) to be checked against current config, not executed here.

## 10. Acceptance matrix (pending, not passed)

- Full reading natural order, all four Cards, two multi-turn scenes, single/multi-section paragraphs and title handling; no nested data hierarchy invention.
- Workspace Style applied consistently to all four modes, mixed type order unchanged; Left/Justify across Paragraph and Conversation bodies, both languages, all modes, independent of speaker layout and indent; first-line indentation only at actual alinea starts; stacked/aligned/inline speaker names and colons, wrapped speech, long names and narrow screens; title role versus metadata heading; no duplicate title/audio; settings scope/inheritance/reset/persistence; no UI flicker.
- Card expand/collapse/custom/follow without audio changes. Focus actual scroll horizontal and vertical, long content, resize, no trap/jump. One Study Box per Card; local selectors reset or remember as specified; empty units safe.
- EN/ID only and both language orders, permitted styles per mode, Contextual placement and no overlapping text. Notebook wraps long primary and secondary, short segments share rows, no clipping/duplication, exact reconstructed text, stable highlights for each fragment, reverse order, mobile zoom, left/justify, fallback visible if necessary.
- Real Single Play each channel and configured pair; Unit boundaries; Card crossing unit boundary; Workspace crossing Paragraph→Conversation; Start From Here; correct speaker changes; actual Full, Full fallback Split, missing channel/audio; pause/resume/stop/repeat/shuffle/next/prev; manual browse while playing; switch Table↔Text/Legacy; rapid tap/cancel async race; no double playback.
- Player metadata from actual session, local vs TTS, effective speed, requested vs actual representation, card vs segment precision, authored numbering vs queue index, no fake timing. Table sequence/word/meaning/examples, source switching, nav and preferences unchanged.
- Android lockscreen/media actions, actual background local and TTS capabilities reported separately, stale media cleanup; desktop/mobile UI and responsive settings, reduced motion, keyboard and screen-reader accessibility.
- Data/IDs/UIDs, metadata title role, speaker IDs, original text, ordering, ZIP/import/export, RF and Full artifact identity/fingerprints unchanged. Canonical v1 stays v1; isolated v2 UAT stays isolated. No production activation or Stable promotion.
- Existing regression suites plus new targeted tests, exact commands/results; production and UAT builds where applicable. Real user acceptance separate from code audits. Any unresolved Notebook or device limitation disclosed; user decides release gate rather than silently declaring PASS.

## 11. Source audit notes (read-only)

Pinned source links at `0dba2c5` (not runtime verification):
- [DB constants](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/constants/textDatabaseConstants.js#L1-L8): canonical versions 1/1, v2 constants 2/2, contentUnits store.
- [Content Unit domain](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/domain/text/textContentUnitDomain.js): unit identity and segment membership.
- [Card presentation state](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/domain/text/textCardPresentationStateDomain.js): existing vertical-list/horizontal-focus/vertical-focus.
- [Shared Part and Segment views](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/components/text/presentation/SharedPartAndSegmentViews.jsx): existing focus implementation, not new carousel acceptance.
- [Structured playback](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/domain/text/textStructuredPlaybackDomain.js#L10-L95): existing explicit scopes and flat runtime list; unitId carried if present. [Current title resolver](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/domain/text/textStructuredPlaybackDomain.js#L162-L182): document title and global Segment displayId, lacks final local hierarchy.
- [BottomPlayerBar](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/components/layout/BottomPlayerBar.jsx#L6-L64): existing shared bar, mode flags and excerpt-based label.
- [Structured session](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/services/playback/textStructuredPlaybackSessionService.js) and [global session](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/services/playback/globalPlaybackSessionService.js): existing separate service paths to preserve and coordinate.
- [Media Session lifecycle](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/services/playback/mediaSessionLifecycleService.js#L6-L79): existing active session list resolution and metadata; [actions](https://github.com/nazurinian/prolingo-app/blob/0dba2c5/src/services/playback/mediaSessionLifecycleService.js#L180-L209).

## 12. Locked vs pending decisions

Agreed design: four Reader modes; hierarchical Card/Unit/Segment; one Study Box per Card; four bilingual styles with Segment restrictions; Notebook Parallel Flow visual target; shared alignment choice for all Structured Text body content; one active playback; no database redesign/canonical activation; Global Player shared Table/Text, real playback metadata and Media Session; Neon UI and Codex core; Memory post-Stable.

Recovered design direction: natural first-line Paragraph indentation, speaker-name/colon arrangements, shared Workspace Style across modes. The precise labels/defaults and settings hierarchy in §3A are proposed for review, not final historical quotes.

Pending proof/approval: Workspace Style visual defaults, title visibility and supported bilingual heading controls, settings ownership/inheritance, actual Notebook algorithm and fallback, carousel library, exact default styles/typography, tap and scroll interaction refinements, default Continue scope, exact control layout and palette accessibility, local vs TTS Android capabilities. Unit scope is a new runtime requirement, not a tested existing feature. No implementation or new runtime test was performed in this checkpoint.

**Next action: approve v1.2 completeness amendments, then UAT-4A Codex audit only; review findings before 4B0/4B1.**

## Appendix A. Representative fixture requirement

The 37 bilingual segments used in the chat prototype should be retained as a reproducible design fixture, not merely the 4/11/37 counts. A complete fixture is supplied separately in `ProLingo_UAT4_Mixed_Fixture_A_Journey_to_London.md`. This is authored sample content, not a production import or existing database dump. Add separate stress fixtures for long translations, empty Units and Title Cards; do not modify this base fixture or user data to force a test to pass.


## Appendix B. Whole-conversation traceability and concrete acceptance gates (v1.2)

This review consolidates the visible current conversation, old screenshots already supplied in it, and v1.1 plus its separate fixture. It is not a new inspection of the repository or a claim to have recovered every inaccessible message of the prior chat. The pinned source evidence in §11 is from the earlier audit. User-confirmed corrections take precedence over earlier illustrative prototypes. Proposed behaviour remains pending where explicitly identified.

| Discussion / requirement | Contract location | Acceptance evidence required |
|---|---|---|
| Same hierarchy for Paragraph and Conversation, single/multiple Sections and Turns | §1–2 | 4/11/37 persistent isolated-v2 fixture; v1 compatibility (virtual paragraph unit must not pretend persistent v2); no forced conversion |
| Full natural book vs Card boundaries; no old Part level | §2–3 | Complete Mixed Full and Card snapshots, same authored order, both desktop and mobile |
| Card visibility and follow | §3 | Expand All, Custom multiple open, Follow; collapse/switch mode while actual playback continues |
| Vertical/Horizontal focus and modern scrolling | §3, 4B2 | Real scroll-to-focus, momentum/snap, smaller adjacent previews, dynamic size, horizontal speaker/unit rail, keyboard, no nested scroll trap |
| Segment one box per Card | §6 | Four open Cards -> four boxes, never 11 boxes; each local selector 4/4, 3/3/3/3, 5, 3/3/3/3; retained selection; context click selects not auto-plays |
| All text alignment, indent and speaker positioning | §3A | Mixed full fixture in every mode, Left/Justify applied to both types, each speaker arrangement, long names and wrap |
| Bilingual restrictions | §4 | Segment disallows Separated/Contextual; EN/ID-only context still has bilingual study box; language display reversal independent of actual playback |
| Contextual translation | §4 | Above/Below/Inline; one active target, primary text never hidden; no fabricated playing segment during imprecise Full |
| Notebook paired fragments | §5 | Native/custom comparison with short and long segments; start translation on first fragment, continue both on later rows; never put whole translation only after end; no overlap; semantic alignment not guaranteed |
| Shared typography | §3A,5 | Font, secondary ratio, spacing, contrast, alignment, line wraps, responsive/zoom/light/dark, no data changes |
| Titles | §1,3A | Metadata-only vs real Title Card; no double speech/heading; one-unit/empty Card handling |
| Interactive EN/ID, Single and Continue | §6–7 | Correct target/channel/temporary override, boundary selection, cancellation, play-to-end, no stale callbacks |
| One session, two existing runtime paths | §7–8 | Table/Text/Legacy cross-tab browsing and explicit ownership switch, correct transport and one audio at a time |
| Authored hierarchy vs queue order | §2,8 | P1 SC1 SG4 → SC2 SG1 → … → C1 T1 SG1; C1 T2 SG3 → T3 SG1 changes speaker; shuffled queue labels remain authored |
| Highlight and precision | §8 | Actual channel, Full card-only unless validated timings, fallback Split, selected/focused/paused/stopped distinct |
| Player compact/expanded and Android | §8 | Actual source/voice/speed/channel, scope and progress semantics; real locked-screen tests separately local/generated and TTS |
| Regression settings and data management | §1,3A,7,10 | Reset dirty/default, no flicker, refresh, import/export/ZIP, audio identity, v1 and isolated v2 separation |
| Deferred work | §1,10 | Memory post-Stable, Track B isolated, no APK or canonical activation, no automatic Stable promotion |

### B1. Same-fixture acceptance walkthrough (mandatory for every relevant patch)

Use `ProLingo_UAT4_Mixed_Fixture_A_Journey_to_London.md` without shortening content. 4 Cards / 11 Units / 37 pairs; P1=8, C1=12, P2=5, C2=12. Keep the same fixture IDs during a comparison; do not regenerate them between mode changes. Separate Title/empty/repeated consecutive speaker/unequal translation stress fixtures from the base counts. No production import is implied.

- 4B0/4B1: capture the **whole** Mixed Full page and Expand All Card page with Left and Justify, stacked/aligned/inline, EN-only then ID-only, and desktop/mobile. Show P1 two sections and P2 single section; all eight turns across C1/C2. Include title/heading options and first-line indent only on paragraph Sections. At least one representative screenshot per combination of mode and alignment, with further combinations tested; full-page capture or scroll recording if necessary.
- 4B2: show Focus on P1 SC1/SC2, C1 T1–T4 and P2 SC1 (no redundant navigation), C2 T1–T4, vertical and horizontal. Verify passive browsing vs actual playback independently, long turns remain fully readable, rail includes speaker and local counts. Scrollable preview does not equate to working playback.
- 4B3: all four Study Boxes visible on Expand All; each Unit picker and local SG picker. Select P1 SC1 SG3 → SC2 SG2 → SC1 and restore SG3; C1 T2 SG2 → T3 SG1 → T2 and restore SG2. Verify C2 speaker change and P2 single-unit controls. No data flattening or extra Study Boxes.
- 4C1: same data in every allowed mode/style, both primary orders and single languages; Contextual positions in Full/Card/Focus. No extra Contextual box in Segment; don't silently replace or persist an incompatible style when switching modes. Proposed fallback for mode-incompatible styles is primary-only context, preserving the prior preference for return; confirm at gate. Shared alignment also applies to Study Box text and translation without justifying control labels.
- 4C2/4C3: use additional short/long stress text and full fixture. Render actual browser layout, not a manually positioned SVG pretending to be a dynamic renderer. Test continuation of both languages from the first partial fragment; test secondary overflow with additional annotation rows or explicit fallback, font changes, zoom, resize, EN/ID reversal, Left/Justify. Preserve exact text reconstructed from fragments, channel identity and full segment highlight. If not feasible, report NO-GO on Notebook alone and ask before changing release gate; do not silently ship Sentence Interlinear under Notebook name.
- 4D/4E/4F: test actual transitions with expected labels, including C1 T2 SG3 → T3 SG1, P1 SC2 SG4 → C1 T1 SG1 and C1 T4 SG3 → P2 SC1 SG1, subject to actual scope/order. Test channel EN→ID and reverse, Full→Split override without changing saved settings, pause/resume/stop and audio-source fallbacks. Full card progress is never inferred from segment counts. Global player metadata and Android actions follow actual session even if user browses another mode or tab.
- 4G/4H: repeat complete fixture on desktop/Android, light/dark, user-supplied long dataset, regression suite and source/data invariants. Evidence distinguishes visual prototype, automated test, actual audio runtime and real-device acceptance.

### B2. Explicit design gates and remaining questions

Keep 16 subpatches in §9; no extra release version needed. Align contract is now corrected, not a new content schema. Confirm at 4B0: default speaker arrangement, indent and spacing, title controls and settings ownership; at 4B2: carousel implementation and scroll behaviour; at 4C1: defaults, per-mode preference restoration and contextual placement; at 4C2: Notebook feasibility and overflow fallback; at 4E1: Continue default scope and final repeat semantics; at 4F2: actual Android background capability. No need to make uncertain default choices permanent just to begin read-only 4A.

### B3. Companion interactive reference

`ProLingo_UAT4_Mixed_Reader_Reference_v1.2.html` is a standalone design reference using all 37 pairs, not repository code or a UAT test result. It demonstrates four modes, common alignment, speaker positioning, paragraph indent, supported ordinary bilingual styles, Card visibility, Unit/Segment selection and simulated shared playback metadata. Focus navigation is illustrative, not a verified carousel. Notebook is deliberately shown as pending rather than falsely implemented; no actual audio, browser/Android background verification, or data persistence. Use the existing Markdown fixture as the authoritative content reference. Neither companion changes user data or installs dependencies.
