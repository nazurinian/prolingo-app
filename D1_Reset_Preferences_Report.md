# Round D1 — Reset Preferences: Domain & Persistence Report

**Branch:** `fix/text-data-system-boundaries`  
**Phase 0 Baseline Commit:** `c0d9717f10280a25824f2a702308b9bcc21079d4`  
**Status:** AUTOMATED PASS (Domain, Persistence, Inheritance, Idempotency & Build Verified)

---

## 1. Summary of Changes

### Pure Domain Reset Builders (`src/domain/text/textStructuredResetDomain.js`)
Implemented pure, idempotent reset helpers covering all four preference layers:

1. **Global Browser TTS & Playback (`prolingo_text_structured_preferences_v1`):**
   - `buildResetTextStructuredGlobalBrowserTtsPreferences`: resets `browserTextVoiceName: null`, `browserMeaningVoiceName: null`, `browserTextRate: 1`, `browserMeaningRate: 1`, `browserRatesLinked: true`, and `browserTtsRate: 1` while leaving non-TTS playback layout settings intact.
   - `buildResetTextStructuredGlobalPlaybackPreferences`: resets `displayMode`, `playbackChannelMode`, `audioSourceMode` (`'local-first'`), `playbackRepresentationMode` (`'split'`), `playbackOrderMode` (`'sequential'`), `repeatMode` (`'once'`), `manualSegment*`, `manualCard*`, `resumeMode` (`'continue'`), `cardExpansionMode` (`'follow'`), `channelDelayMs` (`0`), `segmentDelayMs` (`0`), and a fresh `globalAudioPlaybackOrderV1` (`channels: { text: [], meaning: [] }`, `ttsOnly: null`), with configurable `{ includeBrowserTts }`.

2. **Global Edge & Bulk Generation (`prolingo_text_structured_audio_generation_preferences_v1`):**
   - `buildResetTextStructuredGlobalEdgePreferences`: restores single/global Edge defaults (`en-GB-SoniaNeural`, `id-ID-GadisNeural`, `edgeRate: 0`, `edgePitch: 0`, `engine: 'edge'`, `generateText: true`, `generateMeaning: true`) without overwriting Bulk selections.
   - `buildResetTextStructuredBulkGenerationPreferences`: restores Bulk & export defaults (`['en-GB-LibbyNeural']`, `['su-ID-TutiNeural']`, `bulkGenerateSplit: true`, `bulkGenerateFull: false`, `bulkAutoExport: false`, `bulkExportFormat: 'portable-zip'`, `bulkExportVoicePolicy: 'all-selected'`, `bulkExportTextVoiceId: 'en-GB-LibbyNeural'`, `bulkExportMeaningVoiceId: 'su-ID-TutiNeural'`, `bulkExportRepresentation: 'split'`) without overwriting single/global Edge defaults.
   - `buildResetTextStructuredGlobalEdgeAndBulkPreferences`: restores the full generation baseline while preserving the intentional `Sonia`/`Gadis` vs `Libby`/`Tuti` independence and leaving Table/Legacy state untouched.

3. **Workspace, Speaker, Card & Segment Metadata Reset Builders:**
   - `buildResetTextWorkspaceAudioMetadata`: deletes workspace-channel preference keys (`audioVoiceOverrideV1`, `audioDownloadProfileV1`, `audioPlaybackOrderV1`, `localAudioPlaybackProfileV1`, `audioPlaybackRateProfileV1`) and removes empty shells rather than storing explicit `1.0x` rates or `{}` objects.
   - `buildResetTextSpeakerAudioMetadata`: removes per-speaker voice, rate, local pin, and download overrides (targeted by `{ speakerId, speaker }` or across all speakers) plus `audioPlaybackSyncProfileV1` when resetting all speakers, while strictly preserving `speakerRegistryV1` and segment `speakerIdentityV1`.
   - `buildResetTextBlockAudioMetadata` & `buildResetTextSegmentAudioMetadata`: remove Card and Segment override keys while strictly preserving `paragraphRoleV1`, `sentenceAuthoringV1`, `contentInvalidatedV1`, `fullAudioArtifactsV1`, `externalSourceV1`, `externalEntityV1`, `speakerIdentityV1`, and `audioVariants`.

### Atomic Library Command & Persistence Integration
- **`src/domain/text/textLibraryCommandDomain.js`:** Added `TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES` (`'audioPreferences.reset'`) handling `workspace`, `speakers`, `card`, and `segment` scopes in one atomic command, refusing `legacy-line-v1` documents, keeping `updatedAt` unchanged when no metadata changed (idempotent), and leaving `audioVariants`, counters, UIDs, and Staging binaries untouched.
- **`src/services/persistence/textStructuredPreferenceService.js`:** Added `resetTextStructuredPreferences` using targeted `localStorage.setItem` on `TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY`.
- **`src/services/persistence/textStructuredAudioGenerationPreferenceService.js`:** Added `resetTextStructuredAudioGenerationPreferences` using targeted `localStorage.setItem` on `TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY`.

---

## 2. Verification & Commands Run

| Check | Command | Result |
|---|---|---|
| D1 Reset Domain & Persistence Suite | `node scripts/audit-v603-round-d1-reset-preferences.mjs` | **3 PASS, 0 FAIL** |
| ESLint on D1 Modified & Added Files | `npx eslint src/domain/text/textStructuredResetDomain.js src/domain/text/textLibraryCommandDomain.js src/services/persistence/textStructuredPreferenceService.js src/services/persistence/textStructuredAudioGenerationPreferenceService.js scripts/audit-v603-round-d1-reset-preferences.mjs` | **0 errors, 0 warnings** |
| P9-C Bulk Generation & Export Regression | `node scripts/audit-v603-p9c-bulk-marathon.mjs` | **17 PASS, 0 FAIL** |
| P10 H1–H3 Remediation Regression | `node scripts/audit-v603-p10-h1-h3-remediation.mjs` | **8 PASS, 0 FAIL** |
| Production Bundle Build | `npm run build` | **PASS** (`vite build` succeeded) |

---

## 3. Protected Data Guarantees Verified
- `localStorage.clear()` is never invoked; Table/Legacy keys (`prolingo_playback_sequence_v511`, `TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY`, `prolingo_text_identity_v1`, `pronunciation_decks`, `prolingo_mastery_state_v1`, `prolingo_study_activity_v1`) remain untouched.
- Resetting Card/Segment overrides deletes `audioPlaybackRateProfileV1` and override keys cleanly so rate/voice inheritance cascades properly to Workspace/Global settings.
- `speakerRegistryV1`, `speakerIdentityV1`, `paragraphRoleV1`, `sentenceAuthoringV1`, `fullAudioArtifactsV1`, `audioVariants`, and `legacy-line-v1` documents are preserved across all reset operations.
