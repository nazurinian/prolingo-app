# Round D Implementation Readiness Brief (Text Audio Preferences Reset)

- **Repository / Baseline:** `nazurinian/prolingo-app` | `fix/text-data-system-boundaries` @ `c3b8f4f`
- **Purpose:** Pre-implementation safety & contract briefing for **Round D (Reset to Defaults for Text Audio Settings)**, cross-checking Stages 1–4 audit discoveries before any production source edits begin.

---

## 1. Exact Scope, Ownership & Persistence Map

| Setting Group | Canonical Owner / Module | Storage Location & Exact Key(s) | Protected Siblings (DO NOT TOUCH on Reset) |
|---|---|---|---|
| **Global Structured Playback** (EN/ID Browser TTS voices, representation `split`/`full`, `ttsOnly`, `playbackOrderMode`, delays/rates, `globalAudioPlaybackOrderV1`) | `textStructuredPreferenceService.js` + `textStructuredAudioPlaybackOrderDomain.js` | `localStorage['prolingo_text_structured_preferences_v1']` (`TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY`) + `TEXT_STRUCTURED_GLOBAL_AUDIO_PLAYBACK_ORDER_PREFERENCE_KEY` (`globalAudioPlaybackOrderV1`) | `prolingo_playback_sequence_v511`, `prolingo_playback_delays_v511`, `prolingo_vocabulary_play_order_v511`, `TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY` (Table-only!) |
| **Global Edge & Bulk Generation** (Edge EN/ID voices, rate, pitch, Bulk Split/Full/Multi-voice & Export defaults) | `textStructuredAudioGenerationPreferenceService.js` + `textStructuredAudioGenerationDomain.js` | `localStorage['prolingo_text_structured_audio_generation_preferences_v1']` (`TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY`) | `useMainAppPrimaryState.js:152` `edgeIndonesianVoice` (Table/Legacy state) |
| **Workspace Preferences** (Narrator TTS, Download Profile, Playback Order, Local Pin, Sync/Rate profiles) | Text Library IndexedDB `documents[].metadata` | `audioVoiceOverrideV1`, `audioDownloadProfileV1`, `audioPlaybackOrderV1`, `localAudioPlaybackProfileV1`, `audioPlaybackSyncProfileV1`, `audioPlaybackRateProfileV1` | `speakerRegistryV1`, `externalSourceV1`, document IDs/UIDs, collections |
| **Workspace & Card Speaker Assignments** (Speaker voice choices per channel/engine) | Text Library IDB `documents[].metadata` & `blocks[].metadata` | `speakerVoiceMapV1`, `speakerVoiceProfileV2`, and `blocks[].metadata.audioVoiceOverrideV1.speakerIds` / `.speakers` | **`speakerRegistryV1`** & **`speakerIdentityV1`** (`segments[].metadata`) — removing these destroys Conversation role labels! |
| **Card & Segment Overrides** (Playback order, Split/Full/Channel pin, Rate override, TTS override) | Text Library IDB `blocks[].metadata` & `segments[].metadata` | `audioVoiceOverrideV1`, `audioPlaybackOrderV1`, `localAudioPlaybackProfileV1`, `audioPlaybackRateProfileV1`, `audioPlaybackSyncProfileV1` | `paragraphRoleV1`, `sentenceAuthoringV1`, `contentInvalidatedV1`, `externalEntityV1`, **`fullAudioArtifactsV1`**, `audioVariants` |
| **Legacy Text Config** (Legacy raw text lines + remembered folder / TTS map) | `textIdentityPersistenceService.js` + `localAudioMapText` | `localStorage['prolingo_text_identity_v1']` (`TEXT_IDENTITY_STORAGE_KEY`) + Text `audioVariants` / runtime folder map | `pronunciation_decks`, `prolingo_csv_meta:*`, `prolingo_mastery_state_v1`, `prolingo_study_activity_v1` |

---

## 2. Critical Cross-Audit Hazards & Prerequisite Decisions

### Hazard 1 — `P10-G018` Default Indonesian Edge Voice Split (`Gadis` vs `Tuti`)
Commit `fdcf3aa` changed `edgeMeaningVoiceId` to `'id-ID-GadisNeural'` ([textStructuredAudioGenerationDomain.js:16](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioGenerationDomain.js#L16)), while `bulkMeaningVoiceIds` (`['su-ID-TutiNeural']` at `L24`), `bulkExportMeaningVoiceId` (`'su-ID-TutiNeural'` at `L32`), and [textStructuredAudioDownloadProfileDomain.js:165](file:///c:/Users/HikamSeif/Documents/@%20Lain-Lain/2000%20Most%20Frequently%20Used%20Words/prolingo-app/src/domain/text/textStructuredAudioDownloadProfileDomain.js#L165) remain `'su-ID-TutiNeural'`.
- **Action before coding Round D:** Decide whether **all** Structured Text Indonesian Edge defaults reset to `'id-ID-GadisNeural'` (leaving `useMainAppPrimaryState.js:152` on `Tuti` for Table), OR explicitly document separate defaults for Edge Single vs Bulk/Download Profile.

### Hazard 2 — Resetting Browser TTS to Null ("System Default") Triggers `P10-G005` + `P10-G001`
- **`P10-G005`:** If a Round D Browser TTS Reset sets `voiceName` to `null` (or system auto-pick fails in headless/muted environments), `playStructuredTextChannel` / `FullStep` currently return early when `!targetVoice`, silently skipping TTS playback instead of calling `executeBrowserTtsPlaybackService` with native OS default.
- **`P10-G001`:** Combined with `repeatMode=loop`, immediate TTS resolution without async yield causes an unthrottled spin loop (`S6-A`).
- **Recommendation:** Land `P10-G005` + `P10-G001` guards alongside (or prior to) exposing a one-click Browser TTS Reset.

### Hazard 3 — Preference Independence & Explicit `1.0x` vs `null` Rate Quirk
- **Order vs Download Independence (`P9-B S2`, `P9-C C1`):** Resetting **Playback Order / Global Player** MUST NOT mutate `audioDownloadProfileV1` or Bulk Generation preferences; resetting **Generation / Bulk** MUST NOT overwrite active Playback Order.
- **`1.0x` Rate Quirk (`textStructuredPlaybackRateProfileDomain.js`):** Inheriting cards/segments expect omitted/`null` rate metadata to cascade from parent; storing literal `1.0` after reset acts as an active pin instead of Inherit. Round D reset builders must delete keys (`audioPlaybackRateProfileV1`, `audioVoiceOverrideV1`, etc.) cleanly when empty/default rather than writing `1.0` or `{}` shells.

### Hazard 4 — Audio Staging Preservation & GC Asymmetry (`P10-G006`, `P10-G017`)
- Resetting voice/download/playback preferences **MUST NEVER delete Audio Staging IndexedDB blobs or `audioVariants` metadata**. Instead, coverage recalculates non-destructively into `OTHER_VOICE` / `OTHER_PROFILE` (`P9-C C7` contract passes).
- Watch out for **`P10-G017`**: `textAudioStagingGcService.js` retains stale `Split` blobs while dropping `Full` blobs if content fingerprints mismatch; Round D Reset must NOT mutate text content or invoke GC on Full blobs.
- Also watch **`P10-G008`**: if Reset refreshes runtime URLs, use `clearAudioStagingRuntimeCacheForMode('text')` rather than `clearAudioStagingRuntimeCache()` (which leaks into `Table`).

### Hazard 5 — Active Playback, Shuffle Override & Status Leaks (`P10-G003`, `P10-G004`, `P10-G012`)
- When Global Playback Settings reset mid-session:
  - Clear `orderedListOverride` (`P10-G004`) when `playbackOrderMode` returns to `Sequential`.
  - Do not let ephemeral Manual overrides (`P10-G003`) re-seed Reset state via `handlePlayerSmartNav`.
  - Clear `structuredTextPlaybackSourceStatus` (`P10-G012`) and stop active playback cleanly (`forceStopAll`) before mutating workspace/global audio preferences.

### Hazard 6 — Table & Legacy Boundary Discipline
- Text Reset actions MUST operate strictly on Structured Text keys (`TEXT_STRUCTURED_*`) and Text Library IndexedDB metadata, leaving Table `pronunciation_decks`, `TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY`, Table Audio Folder/ZIP, Table Staging (`mode: 'table'`), `prolingo_mastery_state_v1`, and `prolingo_study_activity_v1` untouched.

---

## 3. Recommended Round D Execution Sequencing & Test Matrix

| Phase | Scope | Recommended Implementation Checkpoints | Verification Mode (`Node` vs `Browser`) |
|---|---|---|---|
| **Phase D-0** | Align defaults + prerequisites | Ratify `id-ID-GadisNeural` vs `su-ID-TutiNeural` defaults (`P10-G018`), fix `P10-G005` (`!targetVoice` native TTS) + `P10-G001` loop throttle, and switch `P10-G008` to mode-scoped staging RAM clear. | **Node** unit + marathon probes |
| **Phase D-1** | Pure domain Reset builders | Implement non-destructive domain helpers resetting: (1) Global Player/TTS, (2) Global Edge/Bulk Gen, (3) Workspace/Speaker Voices, (4) Card/Segment overrides — preserving `speakerRegistryV1`, `speakerIdentityV1`, `fullAudioArtifactsV1`, `audioVariants`, and Staging blobs; clearing `1.0x` rate to `null`/omitted. | **Node** regression script asserting zero Table key mutations & intact protected metadata |
| **Phase D-2** | Command/UI wiring & Batch/Player sync | Wire scoped "Reset to Defaults" buttons (no native `window.confirm` — use inline arming or `SafetyConfirmDialog`), stop active audio + clear `orderedListOverride` & `structuredTextPlaybackSourceStatus` on reset, ensure single source of truth without duplicate UI (`BottomPlayerBar` vs `TextStructuredAudioControls` — resolve `P10-G013`). | **Node** AST/component contract + **Manual Browser** check |
| **Phase D-3** | Live E2E Acceptance | Verify `Split`, `Full`, Conversation speakers, Inherit cascade, `OTHER_VOICE` badge preservation after Reset, reload persistence, and untouched `Table` & `Legacy Text` datasets. | **Manual Browser** acceptance by user |
