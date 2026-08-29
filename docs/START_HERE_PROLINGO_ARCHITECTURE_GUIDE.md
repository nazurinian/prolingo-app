# ProLingo v5.11.6 — Architecture & Maintenance Guide

**Baseline:** Phase 3G.2 FINAL MODULARIZATION FREEZE  
**Purpose:** panduan utama untuk mengetahui **file mana yang harus disentuh** ketika mengubah UI, Player, Sidebar, Dataset, TTS/Audio, Persistence, Mobile, Scroll, atau fitur baru.

> **START HERE.** Untuk pengembangan berikutnya, baca bagian **Quick Routing Map** dulu. Jangan mencari seluruh `App.jsx` atau mengedit file berdasarkan nama yang mirip sebelum mengecek status ACTIVE/QUARANTINED di panduan ini.

## Prinsip utama arsitektur

1. **`App.jsx` adalah orchestrator/wiring**, bukan tempat menumpuk logic fitur baru.
2. **`domain/` = pure decision/business rules.** Tidak boleh berisi fetch, localStorage, Audio object, SpeechSynthesis, atau setter side-effect yang tidak diperlukan.
3. **`services/` = side effects/orchestration.** File I/O, fetch, Audio/TTS, localStorage, scroll/window, playback loop berada di sini.
4. **`components/` = presentation/UI.** Komponen menerima state/callback; jangan menduplikasi business rules di JSX.
5. **`hooks/` = state/ref ownership.** State global MainApp dan runtime refs dikelompokkan di sini.
6. **`constants/` = configuration/static schema/defaults.**
7. **`utils/` = helper reusable/stateless**, bukan feature orchestration.
8. **Frozen invariants tetap berlaku:** `VOCAB_ID` primary identity, `NO/audio slot` historical sequence, MAIN owns structure/order, local audio fallback ke Browser TTS, UK English priority, pause tidak memakan delay, active row auto-follow, Draft ≠ Save Updated CSV.

### Rule saat menambah fitur baru

- Mulai dari **UI** bila hanya tampilan berubah.
- Bila ada aturan/keputusan baru, buat/ubah **domain**.
- Bila ada fetch/localStorage/file/audio/window/timer orchestration, buat/ubah **service**.
- State global baru hanya masuk **`useMainAppPrimaryState.js`** bila benar-benar perlu dimiliki MainApp.
- Hubungkan semuanya di `App.jsx` secara tipis.
- Jangan membuat ulang monolith di `App.jsx`.
## Quick Routing Map — kalau mau update X, sentuh mana?

| Mau mengubah | Mulai dari | Biasanya terkait | Catatan |
|---|---|---|---|
| Header / navbar atas / app bar mobile | `components/layout/Header.jsx` | `components/layout/MainAppShellView.jsx`, `services/navigation/viewNavigationService.js`, `services/navigation/appWindowLifecycleService.js` | Visual header di Header; composition di shell; behavior tab/header visibility di navigation services. |
| Sidebar: lebar, overlay, posisi, buka/tutup | `components/layout/SidebarShell.jsx` | `components/layout/SidebarTopControls.jsx`, `components/layout/MainAppShellView.jsx`, `services/navigation/appWindowLifecycleService.js` | Jangan edit legacy `components/layout/Sidebar.jsx`. |
| Kategori sidebar Player / Learn / Data / System | `components/layout/SidebarTopControls.jsx`, `components/layout/MainAppAuxiliaryViews.jsx` | `constants/playbackConstants.js`, `services/persistence/preferencePersistenceService.js` | Daftar section disimpan/persist lewat `V5116_CONTROL_SECTIONS`. |
| Player bar bawah: tombol/visual | `components/layout/BottomPlayerBar.jsx` | `services/playback/playbackInteractionService.js` | Visual di component; behavior Play/Next/Stop jangan ditulis ulang di component. |
| Engine playback Repeat / Delay / Sequence / Shuffle | `services/playback/globalPlaybackSessionService.js` | `domain/playback/*`, `services/playback/playbackRuntimeControlService.js`, `services/playback/playbackConfigurationService.js`, `constants/playbackConstants.js` | CRITICAL. Audit timing/pause/fallback setelah perubahan. |
| UI Playback Sequence / repeat per part / preset | `components/controls/PlaybackSequenceBuilderView.jsx` | `services/playback/playbackConfigurationService.js`, `domain/playback/playbackSequenceDomain.js`, `constants/playbackConstants.js` | Jangan edit quarantined `PlaybackSequenceBuilder.jsx`. |
| Smart Next / Previous / Play-Pause / Stop | `services/playback/playbackInteractionService.js` | `domain/playback/playbackNavigationDomain.js`, `domain/playback/globalPlaybackControlDomain.js`, `domain/playback/playbackControlDomain.js` | BottomPlayerBar hanya memanggil handler. |
| Browser TTS voice/rate UI | `components/controls/PlayerBrowserTtsControls.jsx` | `domain/audio/browserTtsVoiceDecisionDomain.js`, `services/audio/audioRuntimeLifecycleService.js`, `services/audio/audioPlaybackSideEffectService.js` | Priority English UK→US→AU→SG ada di domain, bukan di component. |
| Local Audio routing / fallback Browser TTS | `domain/audio/audioSourceRoutingDomain.js` | `services/audio/audioPlaybackSideEffectService.js`, `services/audio/audioFolderLifecycleService.js` | CRITICAL: local failure harus fallback ke Browser TTS. |
| Load Audio Folder / mapping file | `services/audio/audioFolderLifecycleService.js` | `utils/audioUtils.js`, `domain/audio/audioSourceRoutingDomain.js`, `components/controls/DesktopSystemControls.jsx` | Numeric audio slot / stable identity jangan diubah sembarang. |
| Generate audio Edge / Gemini | `services/audio/audioTtsSideEffectService.js` | `domain/audio/ttsRequestProviderDomain.js`, `domain/audio/audioTtsCompletionFailureDomain.js`, `components/controls/DesktopSystemControls.jsx` | Domain menentukan request; service melakukan fetch/Blob/download/state. |
| Batch audio generation | `services/audio/audioBatchDownloadService.js` | `components/table/BatchPopup.jsx`, `services/dataset/datasetInteractionService.js` | UI opsi ada BatchPopup, runtime batch ada service. |
| Master Data / row Table UI | `components/table/MemoizedRow.jsx` | `components/table/PlaylistViewport.jsx`, `components/table/MasterDataToolbar.jsx`, `domain/view/mainAppDerivedStateDomain.js` | Virtualization/auto-follow sensitif. |
| Search / filter Master Data | `domain/view/mainAppDerivedStateDomain.js` | `components/table/MasterDataToolbar.jsx` | Jangan mutasi dataset ketika filter/search. |
| Study Queue | `components/table/WorkspaceTabs.jsx`, `components/table/MasterDataToolbar.jsx` | `services/dataset/manualTextStudyInteractionService.js`, `services/dataset/datasetInteractionService.js`, `services/navigation/viewNavigationService.js` | Queue join/restore memakai VOCAB_ID. |
| Add/Edit vocabulary manual | `components/modals/ManualEditorModal.jsx` | `domain/dataset/manualEditorStateDomain.js`, `domain/dataset/manualVocabularySaveDomain.js`, `services/dataset/datasetInteractionService.js` | Edit wajib mempertahankan historical NO/audio slot. |
| Delete vocabulary | `components/modals/ConfirmDialog.jsx` | `domain/dataset/structuredDeleteDomain.js`, `services/dataset/datasetInteractionService.js` | Delete tidak boleh menurunkan sequenceHighWater. |
| Review Changes / Undo / Revert | `components/modals/ChangeReviewModal.jsx` | `domain/dataset/changeRevertDomain.js`, `domain/dataset/datasetSnapshotRestoreDomain.js`, `services/dataset/datasetInteractionService.js` | Dirty/baseline semantics sensitif. |
| CSV parser / serializer / schema | `utils/csvUtils.js` | `constants/datasetConstants.js`, `domain/dataset/csvImportStateDomain.js`, `domain/dataset/csvSaveMetadataDomain.js` | CRITICAL: backward compatibility + VOCAB_ID + high-water. |
| Import CSV / Full Pack / Source Layer | `services/persistence/datasetImportFileService.js` | `domain/dataset/csvImportStateDomain.js`, `domain/dataset/sourceImportStateDomain.js`, `utils/multiSourceUtils.js` | MAIN owns structure/order; source joins via VOCAB_ID. |
| Save Updated CSV / Export Copy / Save Source | `services/persistence/datasetPersistenceService.js` | `domain/dataset/csvSaveMetadataDomain.js`, `domain/dataset/exportSourceMetadataDomain.js` | Export Copy tidak boleh membersihkan dirty status. |
| Source Manager MAIN/SENTENCE/EXP | `components/controls/DesktopDataWorkspace.jsx` | `utils/multiSourceUtils.js`, `services/persistence/datasetImportFileService.js`, `services/persistence/datasetPersistenceService.js` | UI source manager di component; semantics di util/domain/service. |
| Deck cache / startup restore / autosave draft | `services/persistence/deckCacheLifecycleService.js` | `domain/dataset/draftCacheMetadataDomain.js`, `components/layout/Header.jsx` | Draft cache ≠ Save Updated CSV. |
| Persist setting Player/Sidebar | `services/persistence/preferencePersistenceService.js` | `constants/playbackConstants.js`, `utils/playbackSequenceUtils.js` | Keys localStorage jangan diganti tanpa migration. |
| Memory Mode / hide-reveal | `components/controls/DesktopLearnControls.jsx`, `components/controls/MobileLearnControls.jsx` | `services/dataset/datasetInteractionService.js`, `components/table/MemoizedRow.jsx` | Reveal cell timer/row behavior tetap terpisah dari playback engine. |
| Mode Table ↔ Text / Master ↔ Study / mobile tabs | `services/navigation/viewNavigationService.js` | `components/layout/SidebarTopControls.jsx`, `components/table/WorkspaceTabs.jsx`, `components/layout/Header.jsx` | Switch juga menyimpan/restoring index/scroll dan stop state. |
| Scroll restoration / active-row auto-follow | `services/navigation/scrollViewportService.js` | `services/navigation/appWindowLifecycleService.js`, `components/table/PlaylistViewport.jsx` | CRITICAL untuk playback UX. |
| MediaSession / lock-screen Android | `services/playback/mediaSessionLifecycleService.js` | `services/playback/playbackInteractionService.js` | UI browser/OS media controls. |
| State global/default value | `hooks/useMainAppPrimaryState.js` | `hooks/useMainAppRuntimeRefs.js`, `App.jsx` | Jangan reorder hooks; audit hook-order bila menambah/memindah state. |
| Theme | `components/layout/SidebarTopControls.jsx`, `components/landing/LandingPage.jsx` | `services/navigation/appWindowLifecycleService.js`, `App.jsx` | Theme localStorage root tetap di App. |
| Layout besar aplikasi / composition | `components/layout/MainAppShellView.jsx` | `components/layout/MainAppAuxiliaryViews.jsx` | Gunakan untuk memindah posisi panel besar; jangan taruh business logic. |

## Peta folder

```text
src/
├── App.jsx                         # root orchestrator/wiring
├── hooks/                          # state + runtime refs ownership
├── constants/                      # schema/default/static config
├── utils/                          # stateless reusable helpers
├── domain/
│   ├── playback/                   # pure playback decisions
│   ├── dataset/                    # pure dataset/high-water/source decisions
│   ├── audio/                      # pure TTS/audio routing/request decisions
│   └── view/                       # pure derived list/filter/statistics
├── services/
│   ├── playback/                   # playback side effects/orchestration
│   ├── audio/                      # Audio/Speech/fetch/generation/folder
│   ├── persistence/                # CSV/source/deck/localStorage I/O
│   ├── dataset/                    # dataset interaction orchestration
│   ├── navigation/                 # tab/mode/scroll/window behavior
│   └── app/                        # root lifecycle/reset/log sync
└── components/
    ├── layout/                     # Header/Sidebar/Main shell/Bottom player
    ├── controls/                   # Player/Learn/Data/System panels
    ├── table/                      # playlist/rows/toolbars/tabs/batch
    ├── modals/                     # editor/review/confirm dialogs
    ├── common/                     # reusable UI
    └── landing/                    # landing screen
```

## Risiko perubahan

- **LOW** — presentasi kecil/helper sederhana.
- **MEDIUM** — UI yang menghubungkan banyak callback atau responsive behavior.
- **HIGH** — state, virtualization, navigation, derived data, persistence preference.
- **CRITICAL** — playback timing/session, audio fallback/TTS, CSV/high-water/VOCAB_ID, source baseline, file I/O save/import.

Untuk file **CRITICAL**, lakukan regression test terhadap invariant terkait setelah perubahan.
## Pengaturan dan lokasi penyimpanannya

| Key / setting | Fungsi | Pemilik |
|---|---|---|
| `theme` | Theme Light/System/Dark | `App.jsx` |
| `gemini_api_key` | User Gemini API key | `services/persistence/deckCacheLifecycleService.js` + setter UI di `MainAppShellView.jsx` |
| `pronunciation_decks` | Deck/cache/draft data | `services/persistence/deckCacheLifecycleService.js`, import/save services |
| `prolingo_csv_meta:<filename>` | High-water/import metadata sidecar per CSV | `services/persistence/datasetImportFileService.js`, `datasetPersistenceService.js` |
| `prolingo_playback_sequence_v511` | Playback part order/enabled/repeat | `services/persistence/preferencePersistenceService.js` |
| `prolingo_playback_delays_v511` | Part/repeat delays | `services/persistence/preferencePersistenceService.js` |
| `prolingo_vocabulary_play_order_v511` | Original vs shuffle vocabulary order | `services/persistence/preferencePersistenceService.js` |
| `prolingo_control_section_v5116` | Last Player/Learn/Data/System section | `services/persistence/preferencePersistenceService.js` |

### Default penting

- Browser TTS English priority: **UK → US → AU → SG → others** → `domain/audio/browserTtsVoiceDecisionDomain.js`.
- Edge default English: `en-GB-SoniaNeural` → `hooks/useMainAppPrimaryState.js`.
- Edge default Indonesian: `id-ID-GadisNeural` → `hooks/useMainAppPrimaryState.js`.
- Playback delay default: `300 ms` part + repeat → `constants/playbackConstants.js`.
- Playback sequence/presets/parts → `constants/playbackConstants.js`.
- Table virtualization row defaults/overscan → `constants/datasetConstants.js`.
- Gemini env key: `VITE_GEMINI_API_KEY` → dibaca di `App.jsx`.
## State & runtime ownership

### `hooks/useMainAppPrimaryState.js`
Tempat pertama untuk mencari **state aplikasi**. Kelompok utamanya:

- mode/table view/study queue;
- table/text content + playlist + CSV baseline;
- dirty/review/undo/source pack;
- manual editor;
- current/master/study/playing index + context;
- deck/high-water/import count;
- Browser TTS voices/rate;
- playback sequence/delay/vocabulary order/playback mode;
- local-audio preference + playback status;
- sidebar/mobile/batch;
- Memory Mode/revealed cells;
- Gemini/Edge generator settings;
- local audio maps/status;
- viewport/mobile/header state.

### `hooks/useMainAppRuntimeRefs.js`
Tempat pertama untuk mencari **imperative/runtime refs**:

- stop/pause/session/promise refs;
- current `Audio` object;
- abort controllers;
- current playback config refs;
- SpeechSynthesis utterance + synth;
- CSV/source/full-pack/folder input refs;
- log/batch panel refs;
- textarea refs.

**Penting:** urutan built-in hooks sudah diaudit/frozen. Jangan reorder state/ref sekadar untuk merapikan.
## Alur sistem utama

### Playback
`BottomPlayerBar / row UI` → `playbackInteractionService` → `domain/playback/*` → `globalPlaybackSessionService` → `playbackRuntimeControlService` → `audioPlaybackSideEffectService`.

### Browser TTS / Local Audio
`Player controls` → `audioSourceRoutingDomain` → Local `Audio` bila tersedia → jika gagal → `audioPlaybackSideEffectService` Browser TTS → voice defaults dari `browserTtsVoiceDecisionDomain`.

### Edge/Gemini generation
`DesktopSystemControls / BatchPopup` → `audioTtsSideEffectService` / `audioBatchDownloadService` → request decision di `ttsRequestProviderDomain` → completion/failure decision di `audioTtsCompletionFailureDomain`.

### Dataset CSV
UI → `datasetImportFileService` / `datasetPersistenceService` → `csvUtils` parsing/serialization → dataset domain untuk high-water/baseline metadata.

### Multi-source MAIN + SENTENCE/EXP
`DesktopDataWorkspace` → persistence import/save services → `multiSourceUtils` → `sourceImportStateDomain` / `exportSourceMetadataDomain`.

### Navigation & scroll
Header/WorkspaceTabs/Sidebar controls → `viewNavigationService` → `scrollViewportService` → effect wrappers `appWindowLifecycleService`.

### Cache/startup
`deckCacheLifecycleService` menangani autosave draft, startup restore, Save/Load/Delete Deck; preference kecil Player/Sidebar ada di `preferencePersistenceService`.
## File catalog lengkap

> `ACTIVE` = reachable runtime. `QUARANTINED` = sengaja tidak reachable dan **jangan diaktifkan**. `UNUSED` = asset/starter file tidak dipakai runtime final.

### Root / Entry / Legacy

#### `App.css` — UNUSED · LOW · 42 lines

**Peran:** CSS starter Vite lama; tidak di-import oleh runtime final.

**Sentuh ketika:** Biasanya jangan disentuh; bisa dibersihkan hanya pada fase cleanup non-behavior terpisah.

**Catatan:** Tidak aktif pada runtime saat ini.

#### `App.jsx` — ACTIVE · HIGH · 1199 lines

**Peran:** Root wiring aplikasi. Memiliki MainApp dan App; menghubungkan hooks, domain, services, renderer, effect, theme, dan dependency injection. Setelah modularisasi, business logic besar seharusnya tidak ditambahkan kembali di sini.

**Export/fungsi utama:** `App`

**Sentuh ketika:** Hanya bila perubahan membutuhkan wiring state lintas-domain, menambah effect root, atau menyambungkan module baru.

**Catatan:** Jangan taruh logic fitur besar di sini. Pertahankan sebagai state/hook ownership + delegate/wiring.

#### `_backup_app_v5116.jsx` — QUARANTINED · CRITICAL · 5751 lines

**Peran:** Backup monolith v5.11.6 lama, disimpan sebagai referensi historis/parity.

**Export/fungsi utama:** `App`

**Sentuh ketika:** Jangan dipakai untuk pengembangan baru. Hanya referensi audit bila sangat diperlukan.

**Catatan:** Tidak reachable dari main.jsx; jangan diaktifkan.

#### `assets/logo.svg` — UNUSED · LOW · 23 lines

**Peran:** Asset logo starter yang tidak dipakai runtime final.

**Sentuh ketika:** Hanya bila sengaja akan dipakai UI baru.

**Catatan:** Saat ini tidak direferensikan.

#### `assets/react.svg` — UNUSED · LOW · 1 lines

**Peran:** Asset React starter yang tidak dipakai runtime final.

**Sentuh ketika:** Biasanya tidak perlu disentuh.

**Catatan:** Saat ini tidak direferensikan.

#### `index.css` — ACTIVE · MEDIUM · 3 lines

**Peran:** Entry CSS Tailwind: @tailwind base/components/utilities.

**Sentuh ketika:** Konfigurasi entry CSS global/Tailwind.

**Catatan:** Sebagian besar tampilan saat ini memakai utility class langsung di JSX.

#### `main.jsx` — ACTIVE · LOW · 10 lines

**Peran:** Bootstrap React ke #root dan mengaktifkan StrictMode serta index.css.

**Sentuh ketika:** Mengubah entry React/StrictMode/root mount.

**Catatan:** Jarang perlu disentuh.

### Hooks

#### `hooks/useMainAppPrimaryState.js` — ACTIVE · HIGH · 199 lines

**Peran:** Satu tempat ownership seluruh state utama MainApp: dataset/view, high-water, voices/TTS, playback config/status, sidebar/mobile, batch, memory, generator, audio maps, viewport.

**Export/fungsi utama:** `useMainAppPrimaryState`

**Sentuh ketika:** Menambah state fitur baru atau mengubah default state yang benar-benar global/MainApp-owned.

**Catatan:** Urutan hook dibekukan; jangan reorder tanpa audit hook-order.

#### `hooks/useMainAppRuntimeRefs.js` — ACTIVE · CRITICAL · 42 lines

**Peran:** Runtime refs: stop/pause/session/promise, current Audio, AbortController, playback config refs, utterance ref, speechSynthesis, file inputs, logs/batch/text refs.

**Export/fungsi utama:** `useMainAppRuntimeRefs`

**Sentuh ketika:** Menambah ref runtime/imperative handle yang dibutuhkan lintas services.

**Catatan:** Urutan refs juga bagian hook-order freeze.

### Constants

#### `constants/datasetConstants.js` — ACTIVE · HIGH · 23 lines

**Peran:** Konstanta tinggi row/overscan, canonical CSV headers, source keys MAIN/SENTENCE/EXP1–EXP5 dan labels.

**Export/fungsi utama:** `DEFAULT_ROW_HEIGHT_PC`, `DEFAULT_ROW_HEIGHT_MOBILE`, `OVERSCAN`, `V58_CANONICAL_HEADERS`, `V510_SOURCE_KEYS`, `V510_SOURCE_LABELS`

**Sentuh ketika:** Mengubah schema/virtualization/source layer constants.

**Catatan:** Schema changes berdampak luas pada import/export dan compatibility.

#### `constants/playbackConstants.js` — ACTIVE · CRITICAL · 68 lines

**Peran:** Daftar playback parts, delay options/defaults, presets, dan section Player/Learn/Data/System.

**Export/fungsi utama:** `V511_PLAYBACK_PARTS`, `V511_DELAY_OPTIONS`, `V511_DEFAULT_DELAYS`, `V511_PLAYBACK_PRESETS`, `V5116_CONTROL_SECTIONS`, `V5116_CONTROL_SECTION_KEYS`

**Sentuh ketika:** Mengubah default sequence, delay choices, preset, atau daftar control sections.

**Catatan:** Setiap perubahan dapat mengubah behavior baseline/persistence; audit playback wajib.

#### `constants/voiceConstants.js` — ACTIVE · HIGH · 71 lines

**Peran:** Daftar initial Edge TTS voices.

**Export/fungsi utama:** `initialEdgeVoices`

**Sentuh ketika:** Menambah/mengubah daftar Edge voices bawaan.

**Catatan:** Default/priority Browser TTS berbeda dan ada di browserTtsVoiceDecisionDomain.

### Utils

#### `utils/audioUtils.js` — ACTIVE · HIGH · 167 lines

**Peran:** Helper WAV/base64/download/filename/voice labels+grouping dan identity/text extraction audio/VOCAB/advanced.

**Export/fungsi utama:** `writeString`, `encodeWAV`, `base64ToInt16Array`, `sanitizeFilename`, `triggerBrowserDownload`, `downloadTextFile`, `formatVoiceLabel`, `groupVoicesByRegion`, `getVocabIdentity`, `getRecordAudioNo`, `getStableAudioIdentity`, `getAudioFilenameIdentity`, `getAdvancedExpressionPairs`, `getAdvancedContentCount`, `hasAdvancedContent`, `isIndonesianAudioPart`, `getItemPartText`

**Sentuh ketika:** Mengubah helper reusable audio/identity.

**Catatan:** Stable audio identity sangat sensitif; perubahan utility berdampak banyak service/domain.

#### `utils/csvUtils.js` — ACTIVE · CRITICAL · 326 lines

**Peran:** Parser/serializer CSV/TSV, canonicalization/change summary, manual form/signature, VOCAB_ID normalization, validation, max NO/manual ID.

**Export/fungsi utama:** `normalizeHeaderKey`, `detectDelimiter`, `parseDelimitedText`, `csvEscape`, `normalizeVocabId`, `parseTableRecords`, `serializeTableRecords`, `createEmptyManualForm`, `getRecordSignature`, `canonicalizeTableContent`, `getTableChangeSummary`, `getMaxManualIdFromRecords`, `getNextManualVocabId`, `getMaxAssignedNoFromRecords`, `validateTableRecords`

**Sentuh ketika:** Mengubah format CSV/schema parser/serializer/validation.

**Catatan:** Backward compatibility dan high-water sangat sensitif.

#### `utils/multiSourceUtils.js` — ACTIVE · CRITICAL · 268 lines

**Peran:** Detect/read/parse/serialize MAIN + SENTENCE/EXP source files, merge baselines, diagnostics/change summaries, normalize source pack/deck.

**Export/fungsi utama:** `detectV510SourceKey`, `readV510FileText`, `createEmptySourcePack`, `parseLayerSourceRecords`, `getDuplicateSourceIds`, `serializeMainSourceRecords`, `serializeLayerSourceRecords`, `serializeSourceFromMerged`, `mergeSourcePackBaselines`, `getSourceDiagnostics`, `getSourceChangeSummary`, `normalizeSourcePack`, `normalizeDeckEntry`

**Sentuh ketika:** Mengubah format source pack atau merge/join workflow.

**Catatan:** MAIN owns structure; joins via VOCAB_ID.

#### `utils/playbackSequenceUtils.js` — ACTIVE · HIGH · 125 lines

**Peran:** Default/normalize/preset/delay helpers serta vocabulary order signatures/reorder/shuffle utilities.

**Export/fungsi utama:** `createDefaultPlaybackSequence`, `normalizePlaybackSequence`, `createPlaybackPresetSequence`, `normalizePlaybackDelays`, `playbackConfigSignature`, `formatPlaybackDelay`, `createEmptyVocabularyOrder`, `getPlaybackItemId`, `getPlaybackListSignature`, `reorderPlaybackListByIds`, `shuffleVocabularyItems`

**Sentuh ketika:** Mengubah normalization/default helper playback.

**Catatan:** Dipakai persistence + domain; audit playback jika berubah.

### Playback Domain

#### `domain/playback/globalPlaybackControlDomain.js` — ACTIVE · CRITICAL · 26 lines

**Peran:** Pure keputusan tombol global play: pause/resume/fresh-start, target context dan resume item.

**Export/fungsi utama:** `resolveGlobalPlayControlAction`, `shouldAttemptGlobalPlayResume`, `resolveGlobalPlayResumeItem`, `resolveGlobalPlayTargetContext`, `resolveGlobalPlayFreshStartState`

**Sentuh ketika:** Mengubah behavior tombol Play global.

**Catatan:** Playback session semantics sensitif.

#### `domain/playback/playbackControlDomain.js` — ACTIVE · CRITICAL · 22 lines

**Peran:** Pure pause/resume dan independent playback control/action/context/mode.

**Export/fungsi utama:** `shouldPausePlayback`, `shouldResumePlayback`, `resolveIndependentPlaybackControlAction`, `resolveIndependentPlaybackContext`, `resolveNextPlaybackMode`

**Sentuh ketika:** Mengubah aturan pause/resume atau row-independent playback.

**Catatan:** Harus selaras dengan runtime control/service.

#### `domain/playback/playbackNavigationDomain.js` — ACTIVE · CRITICAL · 45 lines

**Peran:** Pure Next/Previous navigation reference dan target state.

**Export/fungsi utama:** `resolvePlaybackNavigationReferenceState`, `resolvePlaybackNavigationTargetState`

**Sentuh ketika:** Mengubah Smart Next/Previous.

**Catatan:** Jangan mengubah index/context semantics tanpa audit.

#### `domain/playback/playbackSequenceDomain.js` — ACTIVE · CRITICAL · 39 lines

**Peran:** Pure mutation state sequence: toggle part, repeat, delay, move, shuffle.

**Export/fungsi utama:** `togglePlaybackSequencePartState`, `setPlaybackSequencePartRepeatState`, `setPlaybackDelayState`, `movePlaybackSequencePartState`, `shufflePlaybackSequenceState`

**Sentuh ketika:** Mengubah state transformation Playback Sequence.

**Catatan:** UI hanya memanggil service; default/preset ada constants/utils.

#### `domain/playback/playbackSessionDomain.js` — ACTIVE · CRITICAL · 81 lines

**Peran:** Pure session context/requested ID/start index/advance state untuk loop playback.

**Export/fungsi utama:** `resolvePlaybackSessionContextState`, `resolvePlaybackRequestedId`, `resolvePlaybackStartIndex`, `resolvePlaybackAdvanceState`

**Sentuh ketika:** Mengubah urutan/session advance/repeat behavior.

**Catatan:** Delay/pause/stop invariants sangat sensitif.

#### `domain/playback/vocabularyPlaybackOrderDomain.js` — ACTIVE · CRITICAL · 52 lines

**Peran:** Pure ordering vocabulary original/shuffle, cycle/signature/anchor preservation.

**Export/fungsi utama:** `resolveVocabularyPlaybackOrderState`

**Sentuh ketika:** Mengubah shuffle/order vocabulary.

**Catatan:** Search/filter tidak boleh renumber NO.

### Playback Services

#### `services/playback/globalPlaybackSessionService.js` — ACTIVE · CRITICAL · 211 lines

**Peran:** Loop/orchestrator session playback global: sequence part, per-part repeat, per-item mode, delays, pause-aware flow, item advance.

**Export/fungsi utama:** `executeGlobalPlaybackSessionService`

**Sentuh ketika:** Mengubah engine playback utama.

**Catatan:** File paling sensitif untuk Repeat/Delay/Shuffle/Pause.

#### `services/playback/mediaSessionLifecycleService.js` — ACTIVE · HIGH · 120 lines

**Peran:** Integrasi navigator.mediaSession / Android media widget: metadata dan action handlers.

**Export/fungsi utama:** `executeMediaSessionLifecycleService`

**Sentuh ketika:** Mengubah lock-screen/media notification controls.

**Catatan:** Jangan mengganggu playback core.

#### `services/playback/playbackConfigurationService.js` — ACTIVE · HIGH · 71 lines

**Peran:** UI-facing actions untuk sequence toggle/repeat/delay/reset/order/shuffle/move/preset dan availability part.

**Export/fungsi utama:** `executeTogglePlaybackSequencePart`, `executeSetPlaybackSequencePartRepeat`, `executeSetPlaybackDelay`, `executeResetPlaybackDelays`, `executeChangeVocabularyPlayOrder`, `executeReshuffleVocabularyPlayback`, `executeMovePlaybackSequencePart`, `executeShufflePlaybackSequence`, `executeResetPlaybackSequence`, `executeApplyPlaybackPreset`, `resolvePlaybackSequencePartAvailable`

**Sentuh ketika:** Mengubah cara UI menerapkan setting playback.

**Catatan:** Pure state transforms tetap di playbackSequenceDomain.

#### `services/playback/playbackInteractionService.js` — ACTIVE · CRITICAL · 167 lines

**Peran:** Entry interactions: independent row play, global play, manual row play, force-stop, Smart Next/Previous.

**Export/fungsi utama:** `executeIndependentPlaybackInteraction`, `executeGlobalPlayInteraction`, `executeManualRowPlaybackInteraction`, `executeForceStopPlaybackService`, `executeSmartPlaybackNavigation`

**Sentuh ketika:** Mengubah handler user player.

**Catatan:** Harus koordinasi dengan playback domains/session service.

#### `services/playback/playbackRuntimeControlService.js` — ACTIVE · CRITICAL · 61 lines

**Peran:** Pause/resume runtime, pause-aware wait/delay, promise settlement dan safe transition.

**Export/fungsi utama:** `executeSettlePlaybackPromise`, `executeWaitWhilePaused`, `executeWaitPlaybackDelay`, `executePausePlayback`, `executeResumePlayback`, `executeSafePlayTransition`

**Sentuh ketika:** Mengubah Pause/Resume atau delay runtime.

**Catatan:** Invariant: waktu pause tidak boleh memakan configured delay.

### Audio Domain

#### `domain/audio/audioSourceRoutingDomain.js` — ACTIVE · CRITICAL · 12 lines

**Peran:** Pure decision untuk local audio URL berdasarkan mode/identity/map dan fallback voice saat local audio gagal.

**Export/fungsi utama:** `resolveLocalAudioUrl`, `resolveAudioFallbackVoice`

**Sentuh ketika:** Mengubah aturan sumber Local Audio atau pilihan fallback voice.

**Catatan:** Harus mempertahankan stable audio identity dan local→Browser TTS fallback.

#### `domain/audio/audioTtsCompletionFailureDomain.js` — ACTIVE · CRITICAL · 42 lines

**Peran:** Pure completion/failure decisions: local audio failure, Edge health messages, Gemini inline audio, map key/filename, cancel/failure state.

**Export/fungsi utama:** `shouldIgnoreLocalAudioFailure`, `shouldResolveLocalAudioFailure`, `resolveEdgeHealthStatusMessage`, `resolveEdgeHealthLogMessage`, `resolveEdgeHealthFailureMessage`, `resolveGeminiInlineAudioState`, `resolveGeneratedAudioMapKey`, `resolveGeneratedAudioFilename`, `isGenerationCancelled`, `resolveGenerationFailureState`

**Sentuh ketika:** Mengubah aturan hasil/failure/cancel generation atau mapping output audio.

**Catatan:** Evaluation order/fallback sensitif.

#### `domain/audio/browserTtsVoiceDecisionDomain.js` — ACTIVE · CRITICAL · 25 lines

**Peran:** Pure preflight Browser TTS: filter voices, priority English UK→US→AU→SG→others, Indonesian voice dan default selection.

**Export/fungsi utama:** `resolveBrowserTtsVoiceState`

**Sentuh ketika:** Mengubah priority/default Browser TTS voice.

**Catatan:** UK English adalah invariant utama.

#### `domain/audio/ttsRequestProviderDomain.js` — ACTIVE · CRITICAL · 85 lines

**Peran:** Pure provider/request decisions untuk Gemini vs Edge: preparation text/filename, API key, endpoint/payload, rate/pitch, health request.

**Export/fungsi utama:** `resolveAudioGenerationPreparation`, `resolveTtsGenerationProvider`, `resolveEdgeHealthCheckRequest`, `resolveEdgeTtsRequestState`, `resolveGeminiTtsApiKey`, `resolveGeminiTtsRequestState`

**Sentuh ketika:** Mengubah routing provider atau request parameters.

**Catatan:** Network side effect tetap di services/audio.

### Audio Services

#### `services/audio/audioBatchDownloadService.js` — ACTIVE · CRITICAL · 114 lines

**Peran:** Orkestrasi batch audio generation start/stop/range/progress/delay; memanggil generator per item/part.

**Export/fungsi utama:** `executeAudioBatchDownloadService`

**Sentuh ketika:** Mengubah workflow Batch generation.

**Catatan:** Jangan ubah pacing/stop semantics tanpa test.

#### `services/audio/audioFolderLifecycleService.js` — ACTIVE · CRITICAL · 100 lines

**Peran:** File/folder side effects untuk load local audio folder dan membangun map Table/Text berdasarkan numeric audio slot/stable identity.

**Export/fungsi utama:** `executeAudioFolderSelectService`

**Sentuh ketika:** Mengubah cara Load Audio Folder memetakan file.

**Catatan:** Numeric slot identity/orphan behavior sangat sensitif.

#### `services/audio/audioPlaybackSideEffectService.js` — ACTIVE · CRITICAL · 116 lines

**Peran:** Actual Browser TTS playback dan Local Audio playback: SpeechSynthesis/Audio events, fallback, completion/cleanup.

**Export/fungsi utama:** `executeBrowserTtsPlaybackService`, `executeAudioSourcePlaybackService`

**Sentuh ketika:** Mengubah actual playback source, utterance events, local audio error fallback.

**Catatan:** Salah satu file paling sensitif; local failure harus fallback ke Browser TTS.

#### `services/audio/audioRuntimeLifecycleService.js` — ACTIVE · HIGH · 59 lines

**Peran:** Lifecycle silent-audio anchor dan Browser TTS voice polling/onvoiceschanged.

**Export/fungsi utama:** `executeSilentAudioAnchorEffect`, `executeBrowserTtsVoiceLifecycleEffect`

**Sentuh ketika:** Mengubah initialization Browser voices atau silent audio anchor.

**Catatan:** Hook wrapper tetap di App; jangan mengubah lifecycle timing sembarangan.

#### `services/audio/audioTtsSideEffectService.js` — ACTIVE · CRITICAL · 218 lines

**Peran:** Actual Edge backend health fetch dan Gemini/Edge audio generation network/Blob/WAV/download/map side effects.

**Export/fungsi utama:** `executeEdgeBackendHealthService`, `executeAudioGenerationService`

**Sentuh ketika:** Mengubah API/fetch/generation execution.

**Catatan:** Provider decision tetap di ttsRequestProviderDomain.

### Dataset Domain

#### `domain/dataset/changeRevertDomain.js` — ACTIVE · CRITICAL · 41 lines

**Peran:** Pure state resolution untuk revert satu perubahan CSV.

**Export/fungsi utama:** `resolveSingleChangeRevertState`

**Sentuh ketika:** Mengubah aturan Review Changes/Revert item.

**Catatan:** Dirty/baseline semantics sensitif.

#### `domain/dataset/csvImportStateDomain.js` — ACTIVE · CRITICAL · 37 lines

**Peran:** Pure state hasil import CSV termasuk initial max NO/manual ID/imported count/baseline dan historical high-water metadata.

**Export/fungsi utama:** `resolveCsvImportState`

**Sentuh ketika:** Mengubah import state atau high-water restoration.

**Catatan:** NO/audio slot tidak boleh reuse setelah tail deletion.

#### `domain/dataset/csvSaveMetadataDomain.js` — ACTIVE · CRITICAL · 12 lines

**Peran:** Pure metadata saat Save Updated CSV: max assigned NO, max manual ID, imported row count.

**Export/fungsi utama:** `resolveCsvSaveMetadata`

**Sentuh ketika:** Mengubah sidecar metadata save CSV.

**Catatan:** Harus menjaga Save→Reimport high-water.

#### `domain/dataset/datasetSnapshotRestoreDomain.js` — ACTIVE · HIGH · 7 lines

**Peran:** Pure valid-ID resolution dan filtering Study Queue saat snapshot restore/undo/revert all.

**Export/fungsi utama:** `resolveSnapshotValidIds`, `filterStudyQueueByValidIds`

**Sentuh ketika:** Mengubah restore snapshot dan queue consistency.

**Catatan:** VOCAB_ID consistency wajib.

#### `domain/dataset/draftCacheMetadataDomain.js` — ACTIVE · CRITICAL · 12 lines

**Peran:** Pure metadata Draft cache/autosave; membedakan working draft dari saved CSV baseline.

**Export/fungsi utama:** `resolveDraftCacheMetadata`

**Sentuh ketika:** Mengubah cache metadata/draft semantics.

**Catatan:** Save Draft tidak boleh dianggap Save Updated CSV.

#### `domain/dataset/exportSourceMetadataDomain.js` — ACTIVE · CRITICAL · 23 lines

**Peran:** Pure metadata untuk Export Copy, remove/detach source, dan Save Updated Source/baseline.

**Export/fungsi utama:** `resolveExportSourceMetadata`, `resolveSavedSourceMetadata`

**Sentuh ketika:** Mengubah source baseline/dirty metadata export/save.

**Catatan:** Saving satu source hanya boleh membersihkan dirty source itu.

#### `domain/dataset/manualEditorStateDomain.js` — ACTIVE · HIGH · 32 lines

**Peran:** Pure state pembukaan Manual Add/Edit: next NO, initial form, advanced open state.

**Export/fungsi utama:** `resolveManualAddNextNo`, `resolveManualAddForm`, `resolveManualEditAdvancedOpen`, `resolveManualEditForm`

**Sentuh ketika:** Mengubah initial form/NO ketika membuka editor.

**Catatan:** NO/history rules sensitif.

#### `domain/dataset/manualVocabularySaveDomain.js` — ACTIVE · CRITICAL · 62 lines

**Peran:** Pure Add/Edit vocabulary save state; Add memakai max(high-water,current)+1, Edit mempertahankan NO/audio slot.

**Export/fungsi utama:** `resolveManualVocabularySaveState`

**Sentuh ketika:** Mengubah aturan save manual vocabulary.

**Catatan:** Jangan pernah renumber historical NO pada edit.

#### `domain/dataset/sourceImportStateDomain.js` — ACTIVE · CRITICAL · 32 lines

**Peran:** Pure import state untuk Full Pack dan single source; MAIN mengatur structural high-water, layer lain join by VOCAB_ID.

**Export/fungsi utama:** `resolveFullPackImportState`, `resolveSingleSourceImportState`

**Sentuh ketika:** Mengubah aturan import source pack.

**Catatan:** MAIN owns structure/order; layer tidak boleh merusak NO.

#### `domain/dataset/structuredDeleteDomain.js` — ACTIVE · CRITICAL · 9 lines

**Peran:** Pure structured-delete: records, Study Queue, reference cleanup.

**Export/fungsi utama:** `resolveStructuredDeleteRecords`, `resolveStructuredDeleteStudyQueue`, `shouldClearStructuredDeleteReference`

**Sentuh ketika:** Mengubah delete vocabulary.

**Catatan:** Delete tidak boleh menurunkan sequenceHighWater.

### Dataset Services

#### `services/dataset/datasetInteractionService.js` — ACTIVE · CRITICAL · 214 lines

**Peran:** Orkestrasi Undo, per-change revert, Revert All, manual save, structured delete, batch range blur, Study range add, memory-cell reveal.

**Export/fungsi utama:** `executeUndoLastDataChange`, `executeApplyChangeRevert`, `executeRevertAllChanges`, `executeSaveManualVocabulary`, `executeConfirmDeleteStructuredItem`, `executeBatchRangeBlur`, `executeStudyRangeAdd`, `executeToggleCellReveal`

**Sentuh ketika:** Mengubah aksi dataset yang dipicu UI.

**Catatan:** Harus tetap memakai pure dataset domains untuk keputusan.

#### `services/dataset/manualTextStudyInteractionService.js` — ACTIVE · HIGH · 94 lines

**Peran:** UI interaction glue: open/close Manual Editor, delete prompt, Insert Tab, add/delete Text item, toggle/clear Study Queue, row menu toggle.

**Export/fungsi utama:** `executeOpenManualAdd`, `executeOpenManualEdit`, `executeCloseManualEditor`, `executeDeleteStructuredItemPrompt`, `executeInsertTab`, `executeAddTextItem`, `executeDeleteTextItem`, `executeToggleStudyItem`, `executeClearStudyQueue`, `executeMenuToggle`

**Sentuh ketika:** Mengubah workflow manual/text/study kecil-menengah.

**Catatan:** Jangan taruh CSV persistence di sini.

### View Domain

#### `domain/view/mainAppDerivedStateDomain.js` — ACTIVE · HIGH · 71 lines

**Peran:** Pure derived-state: source change summaries, advanced stats, master filtered playlist, current player list, active playback list.

**Export/fungsi utama:** `resolveSourceChangeSummaries`, `resolveAdvancedDatasetStats`, `resolveMasterFilteredPlaylist`, `resolveCurrentPlayerList`, `resolveActivePlaybackList`

**Sentuh ketika:** Mengubah filter/search/derived playlist atau statistik Advanced.

**Catatan:** Tidak boleh mutasi dataset.

### Navigation Services

#### `services/navigation/appWindowLifecycleService.js` — ACTIVE · HIGH · 122 lines

**Peran:** Browser/window effects: body scroll lock, sidebar/header visibility, beforeunload dirty warning, theme body, mobile scroll listener, responsive resize, auto-follow effect wrapper, log auto-scroll.

**Export/fungsi utama:** `executeBodyScrollLockEffect`, `executeSidebarHeaderVisibilityEffect`, `executeUnsavedCsvBeforeUnloadEffect`, `executeBodyThemeBackgroundEffect`, `executeMobileHeaderScrollListenerEffect`, `executeResponsiveViewportLifecycleEffect`, `executeActiveRowAutoFollowEffect`, `executeMobileWindowScrollEffect`, `executeLogAutoScrollEffect`

**Sentuh ketika:** Mengubah responsive/window/mobile lifecycle.

**Catatan:** Dependency/timing effect sensitif.

#### `services/navigation/scrollViewportService.js` — ACTIVE · CRITICAL · 144 lines

**Peran:** Imperative scroll logic: mobile header scrolling, pending scroll restoration, active-row auto-follow.

**Export/fungsi utama:** `executeMobileHeaderScroll`, `executePendingScrollRestoration`, `executeActiveRowAutoFollow`

**Sentuh ketika:** Mengubah scroll restoration/auto-follow/current row.

**Catatan:** Active playback row auto-follow adalah invariant.

#### `services/navigation/viewNavigationService.js` — ACTIVE · HIGH · 174 lines

**Peran:** Switch Table Master/Study, mobile tabs, dan Table/Text mode sambil menyimpan/restoring index/scroll dan stop state sesuai baseline.

**Export/fungsi utama:** `executeTableViewTabSwitch`, `executeMobileTabSwitch`, `executeModeSwitch`

**Sentuh ketika:** Mengubah behavior navigasi tab/mode.

**Catatan:** Jangan hanya ubah UI tabs bila behavior switch perlu berubah—file ini yang menangani.

### Persistence Services

#### `services/persistence/datasetImportFileService.js` — ACTIVE · CRITICAL · 253 lines

**Peran:** File I/O import CSV, Full Pack, dan single source; baca file, metadata sidecar/cache, apply state hasil domain import.

**Export/fungsi utama:** `executeCsvImportFileService`, `executeFullPackImportService`, `executeSourceLayerImportService`

**Sentuh ketika:** Mengubah import file/source workflow.

**Catatan:** High-water/VOCAB_ID/source semantics harus tetap domain-driven.

#### `services/persistence/datasetPersistenceService.js` — ACTIVE · CRITICAL · 236 lines

**Peran:** Export Copy, Save Updated CSV, detach source, Save Updated Source, Export Merged Dataset + localStorage metadata/cache updates.

**Export/fungsi utama:** `executeExportTableCsvService`, `executeSaveUpdatedCsvService`, `executeRemoveSourceLayerService`, `executeSaveUpdatedSourceService`, `executeExportMergedDatasetService`

**Sentuh ketika:** Mengubah save/export behavior.

**Catatan:** Export Copy tidak boleh clear dirty; save satu source hanya clear source itu.

#### `services/persistence/deckCacheLifecycleService.js` — ACTIVE · CRITICAL · 216 lines

**Peran:** Draft autosave, startup restore, Save Deck, Load Deck, Delete Deck, restore Gemini key/cache.

**Export/fungsi utama:** `executeDraftAutosaveEffect`, `executeStartupRestoreEffect`, `executeSaveDeckCacheService`, `executeLoadDeckCacheService`, `executeDeleteDeckCacheService`

**Sentuh ketika:** Mengubah startup/cache/deck lifecycle.

**Catatan:** Bedakan draft cache dari saved CSV baseline.

#### `services/persistence/preferencePersistenceService.js` — ACTIVE · HIGH · 84 lines

**Peran:** Load/save preferences playback sequence, delays, vocabulary order, dan control section ke localStorage.

**Export/fungsi utama:** `loadPlaybackSequencePreference`, `loadPlaybackDelaysPreference`, `loadVocabularyPlayOrderPreference`, `loadControlSectionPreference`, `executePlaybackSequencePersistenceEffect`, `executePlaybackDelaysPersistenceEffect`, `executeVocabularyPlayOrderPersistenceEffect`, `executeControlSectionPersistenceEffect`

**Sentuh ketika:** Mengubah key/default persistence pengaturan Player/Control Center.

**Catatan:** Perubahan key perlu migration/backward compatibility.

### App Services

#### `services/app/mainAppStateLifecycleService.js` — ACTIVE · HIGH · 69 lines

**Peran:** Side effects/root lifecycle untuk system log append, sinkronisasi playlist dari content, dan reset full state.

**Export/fungsi utama:** `executeSystemLogAppend`, `executePlaylistContentSyncEffect`, `executeResetFullState`

**Sentuh ketika:** Mengubah reset/sync/log lifecycle global.

**Catatan:** Reset berdampak banyak state; audit setelah perubahan.

### Components — Layout/Landing/Common

#### `components/common/GroupedVoiceSelect.jsx` — ACTIVE · LOW · 38 lines

**Peran:** Select voice reusable yang mengelompokkan voice berdasarkan region/context.

**Export/fungsi utama:** `GroupedVoiceSelect`

**Sentuh ketika:** Mengubah tampilan dropdown voice Browser/Edge secara umum.

**Catatan:** Logic pengelompokan voice berasal dari audioUtils; jangan ubah priority voice di sini.

#### `components/common/HighlightedText.jsx` — ACTIVE · LOW · 22 lines

**Peran:** Render teks dengan highlight pencarian.

**Export/fungsi utama:** `HighlightedText`

**Sentuh ketika:** Mengubah visual highlight search/text.

**Catatan:** Pure presentation.

#### `components/landing/LandingPage.jsx` — ACTIVE · LOW · 63 lines

**Peran:** Halaman awal sebelum masuk aplikasi, termasuk start action dan theme control.

**Export/fungsi utama:** `LandingPage`

**Sentuh ketika:** Mengubah landing/home screen.

**Catatan:** Tidak memegang business logic ProLingo.

#### `components/layout/BottomPlayerBar.jsx` — ACTIVE · MEDIUM · 115 lines

**Peran:** Bottom/global player bar desktop+mobile: Now Playing, Prev/Play/Pause/Next/Stop, playback mode, sidebar toggle.

**Export/fungsi utama:** `BottomPlayerBar`

**Sentuh ketika:** Mengubah visual/tombol player bawah.

**Catatan:** Jangan ubah session/repeat/delay logic di sini; handler berasal dari playback services.

#### `components/layout/Header.jsx` — ACTIVE · MEDIUM · 106 lines

**Peran:** Header/app bar terutama mobile: menu, deck selector/save/delete, upload inputs, dirty/save shortcut, mobile tabs/workspace.

**Export/fungsi utama:** `Header`

**Sentuh ketika:** Mengubah header/navbar atas, deck controls, upload trigger, mobile app bar.

**Catatan:** Deck persistence dan navigation tetap di service masing-masing.

#### `components/layout/MainAppAuxiliaryViews.jsx` — ACTIVE · MEDIUM · 201 lines

**Peran:** Plain renderers untuk Batch Popup, Control Section Tabs, Mobile Tools, Workspace Tabs, dan Master Data Toolbar.

**Export/fungsi utama:** `renderBatchPopupView`, `renderControlSectionTabsView`, `renderMobileToolsView`, `renderWorkspaceTabsView`, `renderMasterDataToolbarView`

**Sentuh ketika:** Mengubah shell/presentasi auxiliary yang dipakai MainApp tanpa menambah React component boundary.

**Catatan:** Ini renderer aktif; beberapa component lama yang mirip tetap ada tetapi tidak selalu dipakai langsung.

#### `components/layout/MainAppShellView.jsx` — ACTIVE · HIGH · 337 lines

**Peran:** Renderer shell utama aplikasi: Header, Sidebar, workspace, terminal/tools mobile, playlist area, BottomPlayerBar, dan seluruh modal stack.

**Export/fungsi utama:** `renderMainAppShellView`

**Sentuh ketika:** Mengubah struktur/layout besar UI, posisi sidebar/player/workspace/modal.

**Catatan:** Jangan masukkan business logic; hanya composition/wiring presentation.

#### `components/layout/MobileTools.jsx` — ACTIVE · MEDIUM · 201 lines

**Peran:** Component mobile tools lama/pendukung berisi Player/Learn/Data/System mobile panels. Runtime final juga memiliki plain renderer aktif di MainAppAuxiliaryViews.

**Export/fungsi utama:** `MobileTools`

**Sentuh ketika:** Sentuh hanya bila memastikan jalur pemanggilan aktif; untuk shell aktif biasanya mulai dari MainAppAuxiliaryViews.

**Catatan:** Cek importer sebelum edit agar tidak mengubah file yang sebenarnya tidak dipakai.

#### `components/layout/Sidebar.jsx` — QUARANTINED · CRITICAL · 449 lines

**Peran:** Sidebar legacy besar sebelum shell modular.

**Export/fungsi utama:** `Sidebar`

**Sentuh ketika:** Jangan disentuh/diaktifkan. Gunakan SidebarShell + SidebarTopControls + controls aktif.

**Catatan:** Tidak reachable.

#### `components/layout/SidebarShell.jsx` — ACTIVE · MEDIUM · 34 lines

**Peran:** Container/overlay/sidebar frame responsive; mengatur visibility shell sidebar desktop/mobile.

**Export/fungsi utama:** `SidebarShell`

**Sentuh ketika:** Mengubah lebar, overlay, positioning, open/close shell sidebar.

**Catatan:** Behavior open/header/scroll mobile juga terkait navigation lifecycle service.

#### `components/layout/SidebarTopControls.jsx` — ACTIVE · MEDIUM · 42 lines

**Peran:** Bagian atas sidebar: theme Light/System/Dark, mode Table/Text, label Control Center, dan tabs section Player/Learn/Data/System.

**Export/fungsi utama:** `SidebarTopControls`

**Sentuh ketika:** Mengubah top sidebar, mode switch, theme control, category header.

**Catatan:** Mode switching behavior ada viewNavigationService; control-section persistence ada preferencePersistenceService.

### Components — Controls

#### `components/controls/ControlSectionTabs.jsx` — QUARANTINED · MEDIUM · 36 lines

**Peran:** Versi lama tab Player/Learn/Data/System.

**Export/fungsi utama:** `ControlSectionTabs`

**Sentuh ketika:** Jangan dipakai; versi aktif dirender lewat MainAppAuxiliaryViews.

**Catatan:** Tidak reachable; jangan diaktifkan.

#### `components/controls/DesktopDataActions.jsx` — ACTIVE · MEDIUM · 35 lines

**Peran:** Tombol Import CSV, Add Manual, Export Copy, Clear View, dirty status, Review Changes, Undo, Save Updated CSV/Merged.

**Export/fungsi utama:** `DesktopDataActions`

**Sentuh ketika:** Mengubah tombol/label/layout aksi Data desktop.

**Catatan:** Perilaku import/save tetap di services/persistence dan dataset domain.

#### `components/controls/DesktopDataWorkspace.jsx` — ACTIVE · MEDIUM · 50 lines

**Peran:** Workspace Data desktop: editor Text lock/unlock + Add Tab, Source Manager MAIN/SENTENCE/EXP1–EXP5, status source/dirty, save/export source.

**Export/fungsi utama:** `DesktopDataWorkspace`

**Sentuh ketika:** Mengubah UI source manager, editor Text, atau panel status data desktop.

**Catatan:** Jangan pindahkan high-water/source baseline logic ke komponen.

#### `components/controls/DesktopLearnControls.jsx` — ACTIVE · LOW · 56 lines

**Peran:** Panel Learn desktop: Playback Sequence access + Memory Mode dan hide Word/Sentence/Meaning/EXP.

**Export/fungsi utama:** `DesktopLearnControls`

**Sentuh ketika:** Mengubah UI belajar/memory desktop.

**Catatan:** Sequence behavior ada di playback services/domain; reveal cell ada dataset interaction.

#### `components/controls/DesktopSystemControls.jsx` — ACTIVE · MEDIUM · 97 lines

**Peran:** Panel System desktop: generator Gemini/Edge, voice Edge/Gemini, rate/pitch, backend health test, API key, Load Audio Folder, Batch, Logs.

**Export/fungsi utama:** `DesktopSystemControls`

**Sentuh ketika:** Mengubah tampilan/pengaturan System desktop.

**Catatan:** Request TTS, folder map, batch, persistence jangan diimplementasikan di sini.

#### `components/controls/MobileDataControls.jsx` — ACTIVE · MEDIUM · 40 lines

**Peran:** Kontrol Data versi mobile untuk import/add/save/export/undo dan workflow data yang sesuai shell mobile.

**Export/fungsi utama:** `MobileDataControls`

**Sentuh ketika:** Mengubah Data tab/mobile tools.

**Catatan:** Logic data tetap gunakan services/domain.

#### `components/controls/MobileLearnControls.jsx` — ACTIVE · LOW · 30 lines

**Peran:** Kontrol Learn versi mobile termasuk Memory Mode/settings belajar.

**Export/fungsi utama:** `MobileLearnControls`

**Sentuh ketika:** Mengubah tampilan Learn di mobile tools.

**Catatan:** Jangan menduplikasi playback logic.

#### `components/controls/MobileSystemControls.jsx` — ACTIVE · MEDIUM · 31 lines

**Peran:** Kontrol System versi mobile; pengaturan generator/system yang disederhanakan untuk mobile.

**Export/fungsi utama:** `MobileSystemControls`

**Sentuh ketika:** Mengubah System mobile.

**Catatan:** Jaga feature parity dengan desktop bila fitur memang shared.

#### `components/controls/PlaybackSequenceBuilder.jsx` — QUARANTINED · CRITICAL · 151 lines

**Peran:** Versi legacy Playback Sequence Builder component.

**Export/fungsi utama:** `PlaybackSequenceBuilder`

**Sentuh ketika:** Jangan disentuh/diaktifkan. Versi aktif adalah PlaybackSequenceBuilderView.jsx.

**Catatan:** Tidak reachable.

#### `components/controls/PlaybackSequenceBuilderView.jsx` — ACTIVE · HIGH · 167 lines

**Peran:** Renderer aktif untuk urutan part playback, enable/disable, repeat per part, delay, preset, shuffle/reset, vocabulary order.

**Export/fungsi utama:** `renderPlaybackSequenceBuilderView`

**Sentuh ketika:** Mengubah UI/configuration panel Playback Sequence.

**Catatan:** Behavior konfigurasi ada playbackConfigurationService + playbackSequenceDomain + playbackConstants.

#### `components/controls/PlayerAudioSourceControls.jsx` — ACTIVE · MEDIUM · 24 lines

**Peran:** Toggle sumber playback Local/Generated vs Browser TTS dan status local audio map.

**Export/fungsi utama:** `PlayerAudioSourceControls`

**Sentuh ketika:** Mengubah UI pemilihan sumber audio player.

**Catatan:** Routing actual ada audioSourceRoutingDomain + audioPlaybackSideEffectService.

#### `components/controls/PlayerBrowserTtsControls.jsx` — ACTIVE · MEDIUM · 53 lines

**Peran:** Dropdown Browser TTS English/Indonesian dan slider playback rate.

**Export/fungsi utama:** `PlayerBrowserTtsControls`

**Sentuh ketika:** Mengubah UI voice/rate Browser TTS.

**Catatan:** Priority/default voice ada browserTtsVoiceDecisionDomain.

### Components — Table/Modals

#### `components/modals/ChangeReviewModal.jsx` — ACTIVE · MEDIUM · 55 lines

**Peran:** Modal review perubahan CSV: added/modified/deleted, revert per change, Undo, Revert All, Save.

**Export/fungsi utama:** `ChangeReviewModal`

**Sentuh ketika:** Mengubah UI review/dirty changes.

**Catatan:** Revert state logic ada changeRevertDomain/datasetInteractionService.

#### `components/modals/ConfirmDialog.jsx` — ACTIVE · LOW · 57 lines

**Peran:** Kumpulan dialog konfirmasi Revert All, Clear View, Delete Vocabulary, Delete Deck.

**Export/fungsi utama:** `RevertAllConfirmModal`, `ClearViewModal`, `DeleteVocabularyModal`, `DeleteDeckModal`

**Sentuh ketika:** Mengubah wording/visual konfirmasi.

**Catatan:** Aksi sebenarnya diberikan lewat callback service/domain.

#### `components/modals/ManualEditorModal.jsx` — ACTIVE · MEDIUM · 94 lines

**Peran:** Form Add/Edit vocabulary manual, termasuk advanced fields EXP1–EXP5 dan informasi NO/high-water.

**Export/fungsi utama:** `ManualEditorModal`

**Sentuh ketika:** Mengubah form manual editor.

**Catatan:** ID/NO/save rules ada manualEditorStateDomain + manualVocabularySaveDomain + datasetInteractionService.

#### `components/table/BatchPopup.jsx` — ACTIVE · MEDIUM · 113 lines

**Peran:** Popup batch generation: Words, Word IDN, Sentences, Meaning, EXP EN/IDN, range, start/stop, engine indicator.

**Export/fungsi utama:** `BatchPopup`

**Sentuh ketika:** Mengubah opsi/tampilan Batch.

**Catatan:** Batch execution ada audioBatchDownloadService; validation range ada datasetInteractionService.

#### `components/table/MasterDataToolbar.jsx` — ACTIVE · MEDIUM · 62 lines

**Peran:** Toolbar Master Data: search/filter, study-range add dan kontrol cepat dataset.

**Export/fungsi utama:** `MasterDataToolbar`

**Sentuh ketika:** Mengubah toolbar Master Data/Study selection.

**Catatan:** Filtering derived-state ada mainAppDerivedStateDomain.

#### `components/table/MemoizedRow.jsx` — ACTIVE · HIGH · 265 lines

**Peran:** Renderer row Table utama; menampilkan structured vocabulary, playback controls, Memory Mode/reveal, advanced content, action menu. File juga menyimpan legacy MemoizedTextRow export yang bukan jalur utama Text final.

**Export/fungsi utama:** `MemoizedRow`, `MemoizedTextRow`

**Sentuh ketika:** Mengubah tampilan/aksi per-row Table.

**Catatan:** Sensitif karena terkait playback row, delete/edit, study queue, virtualization.

#### `components/table/MemoizedTextRow.jsx` — ACTIVE · MEDIUM · 71 lines

**Peran:** Renderer memoized row untuk mode Text yang aktif.

**Export/fungsi utama:** `MemoizedTextRow`

**Sentuh ketika:** Mengubah tampilan/aksi item Text.

**Catatan:** Text add/delete behavior ada manualTextStudyInteractionService.

#### `components/table/PlaylistViewport.jsx` — ACTIVE · HIGH · 296 lines

**Peran:** Plain renderer viewport playlist: virtualized rows, padding top/bottom, Table/Text selection, row measurement dan props ke MemoizedRow/MemoizedTextRow.

**Export/fungsi utama:** `renderPlaylistViewport`

**Sentuh ketika:** Mengubah virtualized list, row rendering, viewport/performance.

**Catatan:** Jangan sembarang ubah index/height/scroll; terkait active-row auto-follow.

#### `components/table/WorkspaceTabs.jsx` — ACTIVE · LOW · 21 lines

**Peran:** Tabs MASTER DATA / STUDY QUEUE dan badge/clear queue.

**Export/fungsi utama:** `WorkspaceTabs`

**Sentuh ketika:** Mengubah tampilan tabs workspace.

**Catatan:** Switch/scroll restoration ada viewNavigationService.

## File yang jangan salah edit

Ada empat JS/JSX yang sengaja **QUARANTINED / unreachable**:

1. `src/_backup_app_v5116.jsx`
2. `src/components/controls/ControlSectionTabs.jsx`
3. `src/components/controls/PlaybackSequenceBuilder.jsx`
4. `src/components/layout/Sidebar.jsx`

Jangan mengaktifkan atau mengembangkan file ini hanya karena nama/class-nya tampak relevan. Gunakan boundary ACTIVE yang disebut dalam Quick Routing Map.

`src/App.css`, `src/assets/logo.svg`, dan `src/assets/react.svg` juga tidak dipakai runtime final; mereka berasal dari starter/template dan tidak perlu disentuh saat update fitur normal.

## Checklist sebelum mengubah fitur

1. Cari fitur di **Quick Routing Map**.
2. Ubah layer yang benar:
   - UI → component/renderer.
   - pure rule → domain.
   - side effect/orchestration → service.
   - global state → hook.
   - default/static → constants.
3. Hindari business logic baru di `App.jsx`.
4. Untuk playback/audio/dataset/persistence, regression-test invariant khusus.
5. Pastikan tidak mengedit file QUARANTINED.
6. Bila menambah module, hubungkan tipis melalui App/Main shell.
7. Update panduan ini bila file/tanggung jawab baru ditambahkan.

## Invariant regression checklist ringkas

### Dataset
- `VOCAB_ID` tetap primary identity.
- NO/audio slot tidak renumber karena search/filter/sort.
- deleted tail slot tidak reuse otomatis.
- MAIN owns structure/order.
- source layer join via VOCAB_ID.
- Export Copy tidak clear dirty.
- Save satu source hanya clear dirty source tersebut.
- Save→Reimport mempertahankan high-water.

### Playback
- Repeat/delay/shuffle sama dengan intended config.
- Pause duration tidak mengonsumsi configured delay.
- Next/Previous context benar.
- active row auto-follow tetap berjalan.
- MediaSession tidak memutus playback.

### Audio/TTS
- UK English priority dipertahankan kecuali memang sengaja diubah.
- Indonesian part memakai voice Indonesian.
- local audio failure → Browser TTS.
- `"Artinya:"` tidak ikut dibacakan sebelum Sentence IDN.
- Edge/Gemini cancellation/failure cleanup tetap aman.

### Persistence
- Draft/cache berbeda dari saved CSV baseline.
- Gemini key/startup restore tetap bekerja.
- `prolingo_csv_meta:*` tetap kompatibel.
- control/player preferences tetap load/save.
