# ProLingo V6 — Post-A2 UAT Contract & Patch Roadmap
## Catatan keputusan produk, hasil manual UAT, dan rencana pengerjaan menuju Book Stable

| Informasi | Nilai |
|---|---|
| Dokumen | Addendum v1.0 — 28 November 2026 |
| Repository | `nazurinian/prolingo-app` |
| Branch | `test/text-v2-uat` |
| Worktree | `prolingo-p12-integration-qa` |
| Baseline saat ini | `2c695bd0f91c20573fd08004a000c40d46e21050` — A2-HF1 |
| Status | Product contract retained. A2-HF2 implementation is at the review gate. |
| Next | A2-HF2 → A3 → A3-G → A4 → A5 → A6/4H2 → R0–R3 |
| Production activation | **NO-GO** |

> Dokumen ini mencatat pembahasan sejak A2-HF1 dan manual UAT kedua, termasuk koreksi dari diskusi lanjutan. Bukan perintah langsung untuk mengerjakan semua patch sekaligus. Tidak ada code, DB, konfigurasi, branch, commit, deployment atau release yang diubah oleh pembuatan catatan ini.

## 0. Precedence dan cara memakai dokumen

- `ProLingo_V6.0_Book_Final_Data_Audio_Contract_and_Release_Plan_v1.1.md` tetap authoritative untuk model data, storage, audio, transfer, dan release safety.
- `ProLingo_V6_Book_Living_Handoff_A1b-1C_Accepted_2026-11-27.md` merupakan checkpoint historis; status pekerjaan di dalamnya telah berkembang.
- `A1a_Book_QA_Persistence_Capability_Ledger.md`, laporan A1b integrated acceptance, A2 dan A2-HF1 dalam repository adalah implementation evidence. Gunakan exact commit, bukan asumsi dari nama dokumen.
- Addendum ini memperbarui keputusan produk dan roadmap pada area yang secara eksplisit dibahas pasca-UAT. Kontrak lama yang tidak diubah tetap berlaku. Bila ada konflik teknis, audit source dan ajukan koreksi terbatas; jangan diam-diam mengubah identitas atau persistence contract.
- Kategori status: **ACCEPTED** = diterima pada scope tertentu; **REPORTED PASS** = evidence executor, belum independent rerun; **OPEN DEFECT** = gejala/reproduksi yang memerlukan perbaikan; **NEW CONTRACT** = perilaku baru yang disepakati, belum otomatis tersedia; **DEFERRED** = sengaja dipindah ke fase yang relevan; **NOT CONFIRMED** = belum cukup bukti. Tidak menyamakan automated pass dengan human pass.
- Executor Sol (GPT-6.2 High) menangani logic/persistence/audio/critical gates; Neon menangani UI dan prototype. Zurey melakukan review berdasarkan diff dan evidence, pemilik proyek melakukan UAT dan commit. Satu active writer; jangan mengerjakan patch paralel pada boundary yang sama. AI Face berjalan dengan Neon terpisah; FL27 sementara ditunda. AI Voice tetap track eksperimen terpisah, bukan prerequisite Book Stable.

## 1. Baseline dan perjalanan menuju UAT kedua

| Checkpoint | Commit | Disposition |
|---|---|---|
| A1b-2A + HF1 | `b66893b227e548893e4263f2900cf6f5ec113301` | Portable v3 dan additive coverage accepted isolated QA |
| A1b-2B / A1b-G | `27e543052fe01c9a265a3adea6ddf328575a313e` | Gate A GO; Gate B awal CONDITIONAL GO; 45/45 dan 51/51 groups dilaporkan |
| A2 + closure default | `cbef9f50f2976352dbc438ef4729c1428b42bb50` | GO isolated manual UAT; 6 voice checks, 26 browser groups dilaporkan |
| A2-HF1 | `2c695bd0f91c20573fd08004a000c40d46e21050` | GO manual retest; RF01–RF11 automated dan 26 integrated browser groups dilaporkan; 31 changed files |

A2 persistent demo: 4 Workspaces, 12 Cards, 30 Units, 92 Sentences. London Mixed: P1 → C1 → P2 → C2; 4 Cards, 11 Units, 37 Segments. Pure Paragraph 6 SG, pure Conversation 6 SG, stress 43 SG (Card dengan 34 EN/33 ID). Demo awal tanpa rekaman. Create-only initialisation; reconnect tidak reset data. Normal/UAT builds dilaporkan lulus, canonical Text v1 tetap normal startup, isolated v2 Book QA. Lima historical assertions P7/HF2 baseline tetap open: Bottom Player controls/copy, Player Settings wording (A5); Audio Sidebar wording (A4); frozen beta.8 version (R3). Historical staging 21 assertions + 1 summary sudah dijelaskan. Packet C Edge timeout baseline/candidate; Chrome 25 groups PASS dilaporkan; Edge physical A6 masih open. Swiper CSS nesting warning → A5; outdated browser data dan large chunks → R2.

Default yang telah disepakati dan diimplementasikan pada A2: Edge generation manual/bulk/preferred export Sonia (`en-GB-SoniaNeural`) / Gadis (`id-ID-GadisNeural`); Browser Edge Sonia/Gadis jika tersedia; Chrome UK Female / Indonesian sesuai voice catalog dan fallback aktual. Explicit saved selections, Speaker overrides dan rekaman lama tidak ditimpa. Jangan mengembalikan Tuti/Libby sebagai default hanya untuk audit historis; Libby/Ryan tetap valid untuk profil tertentu.

### 1.1 Manual UAT A2 pertama (cbef9f5)

| Group | Hasil pemilik proyek |
|---|---|
| A2-A | 3/3 PASS — 4 Workspace, pemilihan, refresh/reconnect |
| A2-B | 4/4 PASS — FULL/CARD/FOCUS/SEGMENT, hierarchy, Mixed order, bilingual navigation |
| A2-C | 4/5 PASS — Main Title/Heading, Split/Full fallback, actual Global Player, Pause/Resume/Stop/Prev/Next; Start From Here belum dikonfirmasi |
| A2-D | 1/5 PASS — Sonia/Gadis; voice separation, EN/ID generation, coverage, Full generation/composition belum dikonfirmasi |
| A2-E | 0/5 confirmed — batch, cancel/retry, transfer, listening ZIP, restart with recordings belum dikonfirmasi |

Total 12 PASS / 10 NOT CONFIRMED, bukan 10 FAIL. Main Title dan tampilan umum Book disukai. User awalnya mendengar Sonia/Gadis semua; fixture mempunyai Edge Speaker profile berbeda tetapi Browser overrides belum dibedakan. Body QA menggunakan manual input voice; generation/export tidak jelas. Playback mati-nyala, vertical scroll memilih focus, toolbar overlap saat Orientation muncul, Notebook/paired highlight kurang terlihat, continuation belum jelas.

### 1.2 A2-HF1 hasil executor

- Voice selector dari Browser/Edge catalog; native browser test dengan voice berbeda; recorded fixtures dengan voice berbeda. Live upstream Edge belum dikonfirmasi oleh automated report.
- Reader scoped generation/coverage/cancel/Full/ZIP controls diuji; tidak menimpa persistent manual library.
- Retained session presentation (`lastStarted`) dan actual media timeline terpisah; lookahead verifikasi audio berikutnya, pemeriksaan snapshot/binary sebelum start; Prev/Next Book memakai execution token baru tetapi presentation session tetap.
- Baseline 33/33 sampled frames kehilangan highlight selama configured gap 500 ms; patched 0/32. Controlled next-recording transition 48.8 → 33.0 ms (reported, bukan jaminan pada perangkat user).
- Toolbar wrap; vertical passive scroll selama continuous Book playback tidak mengubah selection; Notebook/paired highlight dan continuation diaudit. Animasi final carousel tetap deferred.
- Normal dan UAT builds serta 26 integrated browser groups dilaporkan PASS. Independent review berupa focused source/diff review, bukan rerun seluruh test. Jangan menyatakan original RF seluruhnya manual PASS hanya karena laporan automated.

### 1.3 Manual retest kedua (2c695bd)

| Retest | Hasil dan batas bukti |
|---|---|
| 1 Continuous playback | User PASS; kemudian melaporkan residual flicker antar Sentence/Turn, terutama setelah recorded audio tersedia; ID terasa delay |
| 2 Voice separation | PASS untuk local recorded listening; Browser distinct Speaker test tidak diwajibkan user pada putaran ini, tetap regression capability |
| 3 Generation/download | PASS untuk alur yang dicoba: Sentence, Card Split, Workspace Split, Full Card P1, verify, Portable dan Normal ZIP. Jangan menyimpulkan seluruh cancel/retry, reimport, ID atau stress multi-batch sudah manual PASS |
| 4 Focus ownership | Audio tidak berubah ketika browse — PASS pada ownership; focus desain/idle scroll masih defect |
| 5 Toolbar | Tidak overlap lagi — PASS pada accessibility; susunan wrapping kurang rapi, visual A5 |
| 6 Notebook/continuation | User menyatakan aman dengan tambahan refinements; jangan menghapus catatan selection, highlight, repeat, exact scope dan latency yang masih perlu diuji |

Kesimpulan: cukup bukti untuk mempertahankan fondasi. HF1 tidak ditolak secara keseluruhan. HF2 menangani residual defect, A3/A3-G menyelesaikan capability/core yang belum lengkap. Jangan mengklaim seluruh A2-E atau physical A6 selesai. Tidak ada laporan penghapusan/kerusakan DB baru.

### 1.4 Evidence yang digunakan

- `A2_HF1_Book_QA_Manual_UAT_Refinement_Report.md`, `artifacts/a2-hf1-book-qa-runtime-evidence.json`, `A2_Book_QA_Persistent_Demo_Report.md`, `docs/uat4/ProLingo_A2_UAT_Manual_ID.md` (repo pada commit terkait).
- `ProLingo__TEXT_AUDIO__A_Journey_to_London__20261128T025548Z.zip` (Portable), `ProLingo__TEXT_AUDIO__A_Journey_to_London_Listening__20261128T025547Z.zip` (Normal).
- Screenshot 28 Nov: `101950`, `102219`, `102103`, `103556` (Card readiness, Focus browse vs playback, toolbar wrap, contoh dokumen LibreOffice); `111531`, `111534` (Notebook/Contextual width). Referensi filename asli `2026-11-28_*.png`.
- Video `Video_2026-11-28_101808.mp4` (playback transition) dan `Video_2026-11-28_102358.mp4` (vertical focus). Previous review memakai sampled frames dan analisis interval hening, bukan instrumentation internal runtime. Interval hening sekitar 0.64, 0.67, 1.15 detik pada 6.98–7.61, 10.44–11.10, 13.76–14.91 detik; belum dapat dipastikan apakah loading, configured delay atau silence MP3. Jangan memperlakukan interval sebagai bukti penyebab tertentu.

## 2. Audio ZIP audit — fakta yang sudah diverifikasi

Pemeriksaan ulang arsip aktual saat membuat dokumen: CRC kedua ZIP valid; Portable manifest v3 memiliki 38 assets dan 38 references; 38/38 SHA-256 byte cocok; multiset digest seluruh 38 MP3 Normal identik dengan Portable; 11 WAV terbaca sebagai mono PCM16 48 kHz. Audit ini bukan pengujian decode/synthesis seluruh runtime.

| Representasi | Portable | Normal |
|---|---:|---:|
| Split EN | 37 | 37 |
| Full Paragraph Card EN (P1) | 1 | 1 |
| Full Section EN export-time | 0 | 3 |
| Full Turn EN export-time | 0 | 8 |
| Total audio | 38 | 49 |
| Title / Heading / ID | 0 | 0 |
| Manifest + CSV | 2 | 0 |

Voice descriptor: Sonia 20, Ryan 12, Libby 6. User juga mengonfirmasi perbedaan suara saat listening lokal. Ini bukan bukti bahwa semua profil Browser TTS/ID sudah manual diuji.

| London Card | Split EN | Split ID | Full EN | Full ID |
|---|---:|---:|---|---|
| P1 Preparing for the Journey | 8/8 | 0/8 | Ready | Missing |
| C1 Buying a Train Ticket | 12/12 | 0/12 | Missing | Missing |
| P2 On the Train | 5/5 | 0/5 | Missing | Missing |
| C2 Meeting Another Passenger | 12/12 | 0/12 | Missing | Missing |

9 Ready P1 = 8 Split EN + 1 Full EN. 38 Ready + 3 Missing pada Workspace verification EN = 37 Split EN + 1 Full EN tersedia, 3 Full Card EN belum tersedia (inferensi konsisten dengan scope, arsip dan UI; exact verification selection perlu dipastikan di HF2). Screenshot Card 8/16, 12/24, 5/10, 12/24 adalah bilingual Split coverage; 37 ID belum dibuat. Missing Workspace **bukan** 3 Workspace lainnya di Root. Title/Heading tidak ada dalam arsip; pisahkan status optional/disabled/nonexistent dari missing expected. Tidak ada bukti bahwa generation yang berhasil kehilangan audio. Full Section/Turn 11 WAV tambahan memang ephemeral export-time dan tidak menambah persisted readiness; **perbedaan 38 vs 49 diterima, tidak perlu disamakan**.

Archive SHA-256 (file user):
- Portable `50def521bd4d0929c54600eccd4f743dcad7c8fbff5700628b935ad558f19941`
- Normal `8a2ae25cca0d11bb4b32fb5bbb13e6f518d44ff586803400af8dad19ab238854`

## 3. Audio identity, profil dan naming — final contract

### 3.1 RF tidak hanya teks

Content fingerprint: normalized content + channel. RF: content fingerprint, schema version, channel, language, engine, exact voiceId, render rate, pitch, rendererVersion, codecProfile. Full fingerprint menggunakan full content/representation/derivation descriptor; derived Conversation Full menjaga ordered inputs dan komposisi. RF request bukan byte SHA; independent binary proof tetap wajib.

- Generate Sonia rate 0, Sonia rate +20, Sonia pitch +10, Libby rate 0 = empat request berbeda, RF berbeda. Retain compatible alternatives; tidak replace default lama. Exact same RF + verified same bytes reuse; same RF + different bytes conflict, bukan otomatis V2; exact repair mengikuti committed proof. Max retained references dan operation limits tetap berlaku.
- Playback speed 1× → 1.2× bukan render rate; tidak menghasilkan RF baru. Perubahan teks EN tidak menghapus ID yang masih compatible. Rename/move/reorder tidak mengubah Split RF jika teks/profil sama (linked Main Title bisa berubah bila Workspace rename; Full ordered content bisa berubah). View/typography tidak mengubah RF.
- Browser TTS live tidak otomatis punya file exportable. AI Voice Kokoro/Piper kelak memakai identity principles, tidak diaktifkan dalam patch Book ini.
- Current render vs Other Profile vs actual playback priority bukan hal yang sama. Existing domain mendukung rate/pitch, namun voice-only UI dan pin/priority belum menjamin pemilihan exact same-voice profile. A4 perlu selector berisi actual engine, exact voice/model, rate, pitch, codec/version bila relevan, readiness dan label current/alternate. Pilihan UI harus diterjemahkan ke exact compatible descriptor/RF, bukan hanya label Sonia. Reset ke inheritance tidak menghapus file.

### 3.2 Dua produk audio dan nama file

Portable untuk backup/transfer/reimport, Normal/Listening untuk media player luar aplikasi. Nama ZIP membedakan jenis di awal, timestamp UTC lengkap agar tidak bentrok:

```text
PL_PORTABLE__A_Journey_to_London__20261128T025548Z.zip
PL_LISTENING__A_Journey_to_London__20261128T025547Z.zip
```

Portable tetap `prolingo-text-audio-manifest.json`, `AUDIO_INDEX.csv`, `Audio/RF/EN|ID/RF_<64-HEX>__EDGE__SONIA.mp3`, `Audio/Full/EN|ID/FULL_<64-HEX>__EDGE__SONIA.mp3`, derived `FULL_<64-HEX>__DERIVED__MULTI-SPEAKER.wav`. Exact path manifest/index, original voiceId, digest, descriptor, all logical refs; uppercase tokens, lowercase actual ext; preserve historical parser compatibility including SPEAKER token. Physical dedup hanya sekali per fingerprint, semua logical ownership tetap dicatat. Default Portable include compatible alternate profiles. Jangan mengubah manifest v3 atau menyingkat hash internal.

Normal default Current Profiles Only; optional include alternate profiles. Masalah source: `BookQaPortableAudioPanel.jsx` default includeAlternate=true digunakan bersama; `bookNormalAudioService.js` menambahkan full fingerprint suffix untuk setiap rekaman meski tak ada collision. Normal harus human-readable, authored ordinal/mixed order, semua logical occurrences termasuk shared RF, bukan satu file fisik saja. Contoh:

```text
01_A_Journey_to_London/
  00_Title/EN_EDGE_SONIA.mp3
  01_P1_Preparing_for_the_Journey/
    00_Heading/EN_EDGE_SONIA.mp3
    Full_Card/EN_EDGE_SONIA.mp3
    Full_Section/SC01_EN_DERIVED_SONIA.wav
    Split/SC01/SG01_EN_EDGE_SONIA.mp3
    Split/SC01/SG01_EN_EDGE_SONIA_R+20Pct.mp3
    Split/SC01/SG01_EN_EDGE_SONIA_P+10Hz.mp3
    Split/SC01/SG01_EN_EDGE_LIBBY.mp3
  02_C1_Buying_a_Train_Ticket/
    Full_Card/EN_DERIVED_MULTI-SPEAKER.wav
    Full_Turn/T01_JAMES_EN_DERIVED_RYAN.wav
    Split/T01_JAMES/SG01_EN_EDGE_RYAN.mp3
```

Contoh nama adalah target design, bukan semua file aktual telah tersedia. Engine wajib (EDGE, DERIVED; KOKORO/PIPER contoh masa depan). Derived single-voice Unit label actual source/composition, jangan mengaku native Edge WAV bila hasil compose. R/P suffix dari actual descriptor, tidak dari playback speed. Untuk profile berbeda yang tetap bertabrakan (codec/renderer/model atau label dipendekkan), deterministic short discriminator yang collision-checked; boleh `_V02` sebagai label saja atau short RF suffix yang diperpanjang bila perlu. Tidak silent overwrite; tidak perlu hash64 dalam nama Normal umum. Optional Listening index untuk full detail bila berguna, tidak menjadi manifest Portable; archive tetap bukan restore source. Nama final, sanitization, UTF-8 path bounds, reserved names, case/NFKC dan ancestor collision, length ≤ accepted bound, actual ext, preserve historical flat ZIP callers. Jangan memotong identitas internal. Normal 2,048 entries /128 MiB termasuk overhead dan generated WAV, ZIP32 safe. Unit compose max32 inputs/64 MiB/120s dan 48 kHz mono PCM WAV 1×, complete compatible current input; omit/report jika missing/corrupt/untrusted/non1×. No persisted Unit Full. Portable strict admission, cancellation/stale checks dan scope isolation tetap.

### 3.3 Coverage/readiness presentation

Pisahkan EN/ID, Split/Full Card, Main Title/Heading dan export-time composition availability. Ready = verified current durable compatible reference dan trusted composition jika diperlukan. Tampilkan Missing, Other Profile, Metadata Only, Stale, Corrupt/Unverified sesuai existing contract. Jangan hitung blank optional channel/heading atau fallback navigation sebagai requirement. Contoh P1: Split EN 8/8, ID 0/8; Full EN Ready, ID Missing; Section EN compose eligible 2/2 (conditional on inputs/rate), ID 0/2. Scope label Library/Collection/Workspace/Card harus eksplisit. Generate and Save berbeda dengan Verify dan Export Download. Preview omission dan actual profile selection; current default dan alternate toggles independen per export mode. Tidak membangun coverage kedua yang menyimpang dari existing authoritative requirements.

## 4. Data model, Root dan A3 authoring contract

Root adalah **Default Collection** yang selalu tersedia, secara fisik `collectionId: null`; bukan missing Collection dan tidak membutuhkan record palsu/UID Collection baru. Library = Root + Custom Collections. Demo keempat Workspace berada di Root. Custom Collection memiliki ID/UID; move/reorder dan rename aman, Root tidak dihapus. Workspace merupakan satu materi/book, bukan seluruh Library.

```text
Library
├─ Root (Default Collection; implicit)
│  ├─ A Journey to London (Mixed)
│  ├─ A morning by the river (Paragraph)
│  ├─ At the information desk (Conversation)
│  └─ Book audio and Reader (Stress)
└─ Custom Collection(s)
   └─ Workspace(s)
```

Workspace Name = catalog label; Main Title = satu EN required untuk new authoring, linked Workspace Name atau custom EN, ID optional. Card = Paragraph atau Conversation/Scene, Heading optional EN+optional ID (no ID-only new); fallback labels tidak spoken. Paragraph Section dan Conversation Turn adalah Unit peers; Segment = EN/ID text. Mixed authored order tetap. Conversation memakai stable registered Speaker identity, ≥2 registered speakers untuk create new Conversation Card sesuai existing contract; empty Turn tetap speaker-bound, consecutive same-speaker Turns tidak digabung otomatis. Preserve empty cards/units, `joinAfter`, stable IDs/UIDs dan lineage. Title bukan Card/Unit/Segment baru; Study Box bukan authored entity. Legacy historical Title role preserved, tanpa destructive conversion.

### 4.1 JSON dan transfer

Source `textPackJsonDomain.js` saat baseline mendukung document/collection pack. Single Workspace pack melepaskan Collection association (`collectionId:null`, order 1) dengan source collection provenance; merge existing default memetakan standalone document ke Root; Collection pack membawa Collection dan Workspace, remap destination IDs. Bukan bukti destination chooser telah tersedia. Root/Library export/backup perlu audit A3 dan format compatible yang jelas.

Target A3: Workspace JSON export/import ke Root, existing Custom Collection atau new Custom Collection; Collection pack opsi preserve as new Collection atau explicitly import its Workspaces ke destination; Root export seluruh root Workspaces dan full Library backup/export sesuai supported transfer contract. Tentukan perbedaan merge/new copy/preserve UID/restore, collision dan confirmation; jangan menimpa identity/audio atau menyamakan merge dengan restore. Preserve source UID provenance, order, independent data/audio transfer, portable reimport exact matching, no native-ID-only attach. JSON tidak berisi audio binary kecuali paket eksplisit (jangan klaim backup audio). Import destination choice harus dilakukan dalam scoped transaction, bukan canonical service fallback. Jika package format baru/metadata extension dibutuhkan, proposal compatibility yang minimal; **tidak ada persetujuan perubahan IndexedDB schema/object stores**.

A3 scope: P15 actual-shell Collection/Workspace/Card/Unit/Segment/Speaker CRUD, edit/rename/move/reorder/search, Main Title & Heading authoring, empty retention, native commands, supported JSON attach/sync/copy/import/export/backup/restore dan recovery, capabilities & typed errors. CSV/Legacy transfer/destructive operations yang belum didukung tidak boleh diaktifkan sekadar UI terlihat lengkap; audit supported scope. No implicit data reset, no canonical migration. Persistent user demo dipertahankan.

## 5. Tiga kelompok pengaturan + Data Management

Satu sumber preference/command, beberapa akses UI yang sama. Global defaults, Workspace preferences dan Card/Segment overrides dibedakan dari Reader view. Audit persisted vs session-only pada QA; jangan menulis canonical preferences untuk kemudahan UI. Reset enabled hanya dirty; slider commit on release, saved value vs effective value, independent reset, no flicker. A3-G/A4/A5 membuka safe controls yang sebelumnya disabled; bukan duplikasi state.

| Kelompok | Lokasi | Isi |
|---|---|---|
| DISPLAY / Reading Settings | Reader Toolbar / Workspace style | View Mode → Display Content → view-specific settings → reading style/typography → reader interaction |
| PLAYBACK / Player Settings | Global Player shortcut; Workspace heading policy shortcut | Read Title/Heading; Global Play; Manual Play; From Here; representation, channel, repeat, order, resume, delay |
| AUDIO / Voice & Recording | Sidebar/Workspace Control Center; Card/Segment override manager | Browser voices, Edge generation, playback rate, render rate/pitch, source/priority, narrator/speakers, exact recording profile, coverage, Generate/Verify/ZIP |
| DATA MANAGEMENT | Data Workspace | Isi data, hierarchy, CRUD, JSON/backup/restore |

Display EN/ID/bilingual direction tidak mengubah audio channel sequence. Audio source Local First/Custom Local/TTS Only adalah audio preference, bukan Reading Style. Full Reader ≠ Full Audio; view change tidak mengubah suara, scope, queue atau playback owner. Card settings hanya audio overrides yang supported, jangan duplikasi semua Global/Manual playback settings per Card. One Global Player/Media Session/ownership. Title has global voice source (read-only), no special narrator/speaker override.

### 5.1 DISPLAY details

View modes FULL / CARD / FOCUS / SEGMENT, independent of audio representation. Display Content: EN Only, ID Only, EN–ID, ID–EN; Main Title, Paragraph Heading, Scene Heading Show flags. Style & Typography: Separated, Interlinear, Notebook, Contextual sesuai supported level; alignment Left/Center/Justify; primary/translation font sizes, family Sans/Serif/Humanist, line height, contrast, spacing; Notebook guide lines/spacing, Contextual Above/Below/Inline; view-specific control only when relevant. Preserve existing approved four styles, contextual lens not forced into Segment. Workspace style vs shared default explicit. Reading Width proposed Fit Container default, Comfortable optional (decision implementation A5); no 66ch forced cap in fit mode. Follow/Return and Tap to Play as interaction; Continue From Here lives in playback settings with shared Reader shortcut.

### 5.2 PLAYBACK existing baseline vs target

Existing source `TextStructuredPlaybackControls.jsx` has Playback, Manual Play, Display (historical) tabs; `textStructuredPlaybackPreferenceDomain.js`: channel sequences, Full/Split, sequential/shuffle, global Once/2×/Loop, manual Segment/Card Follow Global channels + Once/2×/Custom/Loop, Continue/Restart, source modes, local priority, EN/ID rates, expansion and delays. App handlers: direct EN/ID segment once; manual Segment/Card sequential; Unit once; scoped Continue once; Start From Segment Workspace uses global defaults; current Global Play after Stop resolves Workspace scope and saved cursor if Continue. Existing nav resolver wraps. Do not misrepresent these as the newly agreed behavior. Final layout reorganises existing settings, retires redundant legacy Display section only after compatibility audit.

## 6. Playback contract — agreed target to implement/verify in A3-G

### 6.1 Commands, channel and scope

| Command | Scope | Channel policy | Order / repeat |
|---|---|---|---|
| Play All / fresh Workspace | Full Workspace | Global sequence or explicit top EN/ID quick play | Global sequential or shuffle; global repeat |
| Play EN / ID Sentence | One channel of one SG | Explicit channel | Sequential, one shot |
| Play Segment | One SG | Manual Segment sequence | Sequential; manual repeat |
| Play Section/Turn | One Unit | Proposed Manual Unit profile (inherit allowed) | Sequential; configured repeat, default once |
| Play Card | One Card | Manual Card profile or explicit EN/ID | Sequential; manual repeat |
| From Here | Selected SG → Unit/Card/Workspace end | Manual From Here sequence / Follow Global | Sequential only; configured repeat |
| Explicit Heading play | Atomic title/heading | Explicit/global channels | One shot; no fake SG |

Manual Unit and From Here settings proposed alongside existing manual Segment/Card; default once, channel inheritance explicit. Continue From Here default boundary Workspace, alternatives Unit/Card. Unit=Section or Turn. Explicit header From Here starts from first eligible SG of Unit, never needs opening Sentence List. Direct EN/ID button remains isolated channel (not auto-continue). For blank channels, skip/report per valid command, no generated translation or invalid target. Global Play All remains explicit fresh command distinct from bottom transport Play with pending selection/resume. Manual Card can use Full if exact scope supported; SG/Unit/partial first Card requires Split when no exact full timing. Full request retained separately, temporary fallback truthful; later whole Cards may use Full under command policy. Do not display fake sentence timeline in Full.

### 6.2 Tap to Play / Continue From Here truth table

Four interactions, two independent toggles. Need explicit selected target + channel and playback owner; do not conflate click selection with resume cursor.

| Tap | Continue | Click text | Bottom Play when idle |
|---|---|---|---|
| OFF | OFF | Select/focus SG + channel only | Play selected target once by applicable manual policy (ordinary default once) |
| OFF | ON | Select/focus SG only | Start From Here with configured sequence/scope/repeat |
| ON | OFF | Select + play clicked EN/ID channel, no continuation | Explicit manual controls remain available |
| ON | ON | Select + Play Segment sequence, then From Here continuation | Applicable selected From Here command |

User wants selection without sound when Tap OFF, and subsequent Global Player Play honors selection/Continue. Clarify during implementation: selected pending target when idle must take precedence over saved resume only on explicit selection intent; ordinary passive browse and Follow/Return must not silently retarget transport. Active transport Play remains Pause/Resume of owned session; clicking elsewhere with Tap OFF must not stop it. Explicit manual play can replace session. If explicit manual repeat is 2×/Custom/Loop, Continue OFF means no later SG, not necessarily single repetition; UI must make this distinction clear. Proposed default single play. EN/ID click with Continue ON triggers Play Segment sequence rather than explicit channel-only command; dedicated EN/ID buttons stay one-shot. Apply across Full Structured/Clear, Card, Focus and Segment with one shared intent resolver. Avoid four independent handlers/state machines. Access Tap/Continue as compact Reader controls + settings; explicit From Here button at relevant Unit/selection anchor.

### 6.3 Shuffle only Global; order and repeat

**Locked by user: no Manual Shuffle.** Shuffle Global Play All changes Card order only; authored Sentence/Section/Turn order inside Card unchanged, headings tied to owning Card. Reader and DB order unchanged. Fresh Play All may create new shuffle queue. From Here always sequential authored suffix; never shuffle or include earlier material. Current source may inherit global shuffle for Unit/From Here — audit and correct Book path.

For From Here build bounded suffix from exact selected SG to Unit/Card/Workspace end, not entire earlier Unit/Card. Example real London P1 SC01 SG03 → rest of SC01, SC02, C1, P2, C2 for Workspace; Card stops at P1 end; Unit at SC01 end. Once = finish once; 2×/Custom = repeat same suffix specified count; Loop = repeat same suffix until Stop. Repeat start is original start, not first SG of Workspace. New contract: preserve original session order for Restart/Continue; global shuffle repeat ordering proposed frozen per session for predictability (explicitly verify/confirm if existing repeat regenerates order). Do not silently change Table/Legacy navigation.

Previous/Next in Book scoped queue: once at end disable/no-op, no wrap/no crossing boundary; 2×/Custom may move into next remaining pass; Loop may wrap to original start; Previous cannot go before original From Here start. Full navigation by Card when actual command scope Full, Split by SG; fallback precision/source truthful. Manual navigation while paused should preserve appropriate paused ownership; during active playback continues session without stop flicker. Audit navigation/repeat interactions rather than assume current modulo resolver correct.

### 6.4 Resume Restart/Continue — revised definition

User explicitly means restart from **last session start**, not always Workspace beginning. Use actual authored ordering in examples: P1 SC02 SG03 → C1 T02 SG02 Stop. Earlier conversational example P2 SC02→C1 was illustrative and does not match London fixture (P2 has one Section and C1 precedes P2).

| Action | Restart | Continue |
|---|---|---|
| Pause / Resume | Same owned media/cursor, no re-init | Same |
| Explicit Stop | End active highlight/session; Ready target = original session start | End active highlight/session; Ready target = last audio cursor |
| Play after Stop | Restart same bounded session from original start | Replay last audio step then continue within same scope/order |
| Fresh Play All | New Workspace command | New Workspace command |
| Shuffle session | Same frozen order on restart | Same frozen order on continue |

State must retain Session Start, last Playback Cursor (incl actual channel/representation where possible), Selected Focus, Session Boundary, ordered queue, repeat/order policy and stable Workspace identity. Resume snapshot is not a live playing status. For Continue stopping on ID, replay that ID step if precise support, then proceed; no unsupported timestamp claim. Full only Card-level if no timing. Explicit selection and new play should not accidentally mutate old session start. Stop must not retain active highlight, but Global Player may show Ready target as distinct inactive preview. Completion resets according to accepted completion behavior, never fabricates playing media; define repeat counters on stop/restart/continue and what survives reconnect in acceptance before implementation (Continue should preserve relevant session/pass; Restart resets chosen session). No persistence schema redesign assumed; use existing scoped ownership and compatible session prefs if possible. Scope on restart/continue must not silently widen from Card to Workspace. Current `handlePlayerGlobalPlay` only passes document scope and saved cursor; this is a **new core contract** to implement, not already accepted.

### 6.5 Continuous playback / latency

One session through EN→ID, SG→SG, Section/Turn→Unit, Card→Card, intentional delay and repeat pass. Active focus/Now Playing context retained; actual audible media and timeline only when actually present. Pause retains source, channel, cursor, details. End only Stop, actual completion, cancellation, fatal failure or intentional replacement. No CSS-only concealment; use owned execution tokens and retained presentation. HF1 fixed measured gap behavior but residual recorded transition and ID latency reported. HF2 target compare identical EN/ID fixtures (both recorded, both browser fallback separately), configured zero and nonzero delay, intrinsic MP3 silence vs media teardown/prepare vs browser voice startup vs verification. Check Details open, source switching, EN→ID/ID→EN, SG/Unit/Card boundary, Pause/Resume, Next/Prev, Full-to-Split, stop/reconnect stale callbacks. Measure actual elapsed/events/frame evidence; don't promise zero gap or guess video silence cause. Keep bounded lookahead, current snapshot and byte validation, cancellation/ownership, no uncontrolled preload. Actual source/voice/representation in Global Player and Card/Unit (last source during wait labelled honestly, no live fake timeline). Background MediaSession/Android verified A6.

## 7. Main Title & Heading

Content authoring in Data Management; visibility in Display; Read policy in Playback / Workspace settings (shortcut to same source); generation and coverage in Audio. Independent Show/Read per Workspace Main Title, Paragraph Heading, Scene Heading. Existing default main ON, paragraph OFF, scene ON for Read and visibility fallback; preserve unless explicitly changed. Only relevant controls for Workspace kind. Show OFF can still Read ON. Title atomic, global EN/ID/source/rate, no narrator/speaker override, no fake Unit/SG. Play All fresh pass: optional Main Title once then each relevant heading before Body. Play Card from beginning may read own heading, not Main Title. Unit/SG local no intro. From Here middle skips starting title/heading; subsequent Card boundaries honor policy. Pause/Resume do not reinsert heading. Restart follows original session boundary; repeat semantics and shuffle heading ownership tested. Optional/blank skipped; fallback navigation label not spoken. Main Title approved by user: do not redesign or break existing functionality.

## 8. Focus, selection, follow, and Reader design (A5)

### 8.1 Focus is nested 3D carousel, not viewport-driven list

Design correction: outer page scroll moves between Cards; inner carousel drag/swipe moves Section/Turn within Card. Current vertical scroll registers nearest Unit from viewport when not continuous playback (`SharedFocusCarousel.jsx` L502–529 baseline). HF2 removes passive page-scroll selection **both idle and active**; explicit Unit rail, Prev/Next, carousel gesture or follow may select. A5 replaces interim vertical presentation with nested three-slot carousel. Horizontal and Vertical both use same selection contract.

```text
Card header (outside carousel)
  [Previous Unit — small / depth]   ← empty if unavailable
  [Current Focus — large / center]
  [Next Unit — small / depth]       ← empty if unavailable
Card controls / optional Sentence List
```

One Unit: center fixed, both slots empty. Two: focus 1 + next below/right; focus 2 + prev above/left; center fixed. 3+: only previous/current/next visible; no wrap duplicates at ends; empty spaces remain, not extra visible Units. Zero playable content/empty Unit must not corrupt selection or fabricate audio; represent emptiness honestly. On drag outgoing shrinks/rotates away progressively, incoming expands to center like ring/coverflow; no instant snap only. Adjacent previews reduced, compact not dominate; central content readable/clickable. Horizontal left/right and vertical up/down; stable bounded viewport, long text may scroll internally; distinguish inner text reading, carousel drag and outer page scroll via gesture ownership and edge behavior. Test mouse, wheel, touch, keyboard, reduced motion, focus accessibility, Android, long/short and empty content. No accidental audio on swipe/tap release. Prefer existing Swiper effects/coverflow or suitable established library after research and prototype; only consider replacement after checking capability, bundle/license/accessibility/gesture, user approval for new dependency. No native custom animation engine by default. No final carousel dependency in HF2. Swiper CSS nesting warning resolved at A5 if relevant.

### 8.2 Four controls and separate state

Tap to Play (toggle), Continue From Here (toggle + scope in Playback), Follow Playback (toggle), Return to Playing (one-shot action). Follow is Reader position behavior, not expansion. Separate selected Card/Unit/SG/channel, active playback cursor, outer scroll, inner carousel focus, Card expansion mode and pending play target. Passive browse never changes audio or queue.

| Event | Follow ON | Follow OFF |
|---|---|---|
| Manual click/drag with Tap OFF | Focus temporarily moves, audio keeps playing | Focus remains manual |
| Next actual SG/Unit/Card / explicit Prev/Next | Animate back to current playing target | Preserve manual focus |
| Pause | Retain current positions | Retain |
| Resume | Return to active target (proposed agreed direction; no extra toggle unless needed) | Keep manual focus |
| Return to Playing | Return now without changing audio | Return once, does not enable Follow |

Return clears temporary browse divergence, not authored content or audio state; disable when no target/no divergence as appropriate. Follow anchors Card near top with comfortable inset below AppBar while inner focused Unit centered. No auto-scroll fighting user during every scroll tick; re-follow on meaningful transitions/explicit action. Expansion Follow Playback / Expand All / Custom applies Card open/close, not all Unit previews. Follow focus and expansion controls distinguish labels. Actual playing highlight can remain visible in adjacent preview if manually focused elsewhere; no false playing on selected box. View switching no new audio start. Reader passive browse across Workspace must not steal active Global Player owner.

### 8.3 Toolbar

HF1 stopped overlap; user says wrap is visually awkward. Keep main row View Mode (Full/Card/Focus/Segment), display channels, Reading Settings; use responsive groups. Vertical/Horizontal only in Focus sub-toolbar below mode control (other Focus-specific options may join), not pushing main controls to random row; wide desktop ideally one main row, narrow screens intentionally wrap/stack, no hidden controls. Reading Settings contextual fields. Preserve accepted overall appearance, not entire redesign. Screenshots demonstrate earlier overlap and corrected but awkward layout; not a popup bug.

### 8.4 Full Structured and Full Clear

Keep current information-rich Full Structured. Add **Full Clear / Clean Reading** as alternative Full presentation, not fifth data model/Reader hierarchy. Inspired by user LibreOffice sample: Main Title + optional translation; natural paragraph indent/spacing, punctuation preserved, dialogue aligned Speaker names; Heading optional, subdued idle and clearer active; no repeated P/C badges, count/status, section/turn controls, multiple play buttons throughout body. One top workspace EN / ID / Play group, Reader interaction shortcuts and one central Card Audio Settings shortcut. Text remains clickable/selectable according to shared Tap/Continue contract, optional explicit From Here near selected anchor without clutter. Active left edge per true scope, actual channel highlight/paired indicator; Full Audio without timings only Card-level. Full Structured may keep per-Card controls if useful and central manager as well. No loss of data/voice override, same audio engine, same heading visibility/reading styles. Switching Structured/Clear must not reset active audio.

### 8.5 Card/Unit actual voice and source

Active Paragraph shows Narrator + actual voice + EN/ID + source (Local Recording/Browser TTS etc). Active Conversation Turn shows actual Speaker + voice + channel/source, Mixed remains separate. Show concise info on active header/anchor; inactive profiles optional muted, never label default as actual. If waiting, last source honest; fallback reason if available. Full Conversation derived composition may show multi-speaker/card-level; no invented active speaker timeline. Global Player details and lockscreen consistent owner/actual precision; avoid long machine filenames as primary labels. Example P1 · SC02 · SG3/4; C1 · James · T01 · SG2/3. Preserve actual voice id in detail. Title label without fake SG.

### 8.6 Segment / Study Box

One Study Box per Card, choose Section/Turn scope, no multiple independent Study Boxes; lock local Segment control as required when Full audio owns player, explicit replacement path only. Selected language (EN blue / ID purple) = colored box edge/border; no whole-text bright block solely for selection. Playing channel = colored background/highlight; paired language = underline/associated line; pause retains context with pause marker. Clear selected vs playing; clicked channel may differ from actual playing during browse. Clicking box with Tap OFF selects only; ON triggers shared play rules (direct clicked channel if Continue OFF, Play Segment sequence if Continue ON). Dedicated EN/ID play isolated; Play Segment follows manual channel sequence. Continue scope/repeat in Player settings. No fake highlight on missing channel. Full/Focus/Card use same identity/flags. Notebook Guide Lines separate visual control, not same as paired underline. Contextual inspection icon should not start audio just to view translation. Reading full width for non-Notebook as well; existing `max-w-[66ch]` identified on shared bodies. Fit Container uses available body width under header (not reserve unused space below Play Section); optional Comfortable width. Alignment typography across layouts, mobile wrapping/long text; preserve punctuation and bilingual order.

## 9. Audio override manager (A4 with A5 integration)

**User explicitly requests one central Card Audio Settings entry in both Full Structured and Full Clear**. It lists all Cards in authored order P/C, lets select/expand individual card to edit same underlying native Card override. No new Full View override entity. Card/Focus/Segment shortcuts open exact same Card profile; Sidebar offers Workspace profiles + manager. Segment-specific overrides only if supported, visible context, no independent Section narrator. Paragraph default Narrator per channel; Conversation Workspace registered Speaker profile per channel; local Card/Speaker and Segment overrides per accepted precedence. Full Card Paragraph uses Card/narrator/global, does not pretend per-SG overrides; Conversation Full preserves multiple speakers via validated composition. Mixed narrator changes never affect Speaker and vice versa. Heading follows global. Each profile group should show inherit vs explicit, effective voice, source, local priority, playback speed, available render profile/engine/rate/pitch. Generate voice/render vs playback speed vs local selection distinct. Existing voice-only priority/pins need audit for exact-profile selection; no silent substitution. Apply to selected Cards as optional future bulk action only explicit scope and confirmation; not mandatory Stable feature and no bulk replace/delete. Same settings visible after view change. Native commands, no parallel preference stores, no schema expansion without separate approval.


## 10. Classification register — defect, capability, UI refinement, no change

This register is the patch control list. A defect is an observed mismatch with an existing contract, not every feature the owner would prefer. A UX capability is new behavior or access to an already existing core capability; it requires acceptance criteria and must not be called a regression. UI refinement changes presentation, layout, labels, or animation while preserving behavior and data. A source-based risk or user observation without a confirmed cause is an investigation item, not a proven implementation failure.

| ID | Category | Finding / desired outcome | Evidence / disposition | Owner phase |
|---|---|---|---|---|
| V01 | VERIFIED / NO CHANGE | Database QA v2 hierarchy, IDs/UIDs, RF, byte proofs, committed audio storage | Accepted foundation; no new data loss or corruption reported | Preserve all phases |
| V02 | VERIFIED / NO CHANGE | Portable 38 vs Listening 49 | Valid actual exports; 11 ephemeral WAVs intentionally additional | Preserve HF2 |
| V03 | VERIFIED / NO CHANGE | EN Split 37/37; P1 Full EN exists; ID not generated | Missing not evidence of lost recording; 3 Full EN missing inferred from verification scope | HF2 presentation only |
| V04 | VERIFIED / NO CHANGE | Narrator/Speaker recorded voice separation | User PASS; actual metadata Sonia/Ryan/Libby | Preserve; browser/ID retest where relevant |
| V05 | VERIFIED / NO CHANGE | Main Title, authored mixed order, hierarchy, library refresh/reconnect, overall appearance | User PASS; retain | All phases |
| V06 | VERIFIED / NO CHANGE | Sonia/Gadis defaults and saved user selections | A2 closure; no default rewrite | Preserve |
| V07 | VERIFIED / NO CHANGE | Toolbar no longer overlaps; passive browse did not change active audio | User PASS for those properties | Preserve |
| B01 | BUG / investigation | Residual playback presentation flicker, perceived delay across recorded SG/Turn; ID delay | User video/observation; HF1 improved continuity but actual residual cause not proven | HF2 audio transition |
| B02 | BUG | Passive outer page scroll changes focused Unit while idle | Source registration guard excludes active playback only; video idle behavior | HF2 focus ownership |
| B03 | BUG audit | Potential inconsistent From Here repeat/order/transport and Resume scope vs desired contract | Existing core differs from new contract; distinguish legacy behavior from new requirements, do not label all as bugs | A3-G |
| B04 | BUG audit | Settings or existing audio actions inaccessible/disabled in isolated QA | User screenshots/report; inspect exact gates and scope; expose only authorized capabilities | HF2 audit, A3/A4/A5 as appropriate |
| U01 | UI refinement | Normal ZIP machine-like hash names; ZIP type suffix hidden by long title | Source reproduced includeAlternate suffix behavior; no RF/storage change | HF2 export |
| U02 | UI refinement | Coverage mixes channels and representations; Missing scope unclear | Actual ZIP and screenshot | HF2 coverage |
| U03 | UI refinement | Focus toolbar wrap awkward after overlap fix | Screenshot; Focus-specific sub-toolbar | A5-A/C |
| U04 | UI refinement | Non-Notebook content width truncated by reading measure | Source max-w-[66ch], user screenshots | A5-C |
| U05 | UI refinement | Selected channel border vs playing highlight; paired underline, guide lines, pause styling | User desired EN blue/ID purple; preserve actual cursor | A5-C |
| U06 | UI refinement | Voice/source labels on active Card/Unit and Global Player/lockscreen | Actual evidence required; no default-as-actual label | A5-C/D, A6 |
| U07 | UI refinement | Nested 3D carousel animation, three stable slots | User's clarified design; old vertical list not desired | A5-B |
| U08 | UI refinement | Sidebar, AppBar, responsive controls, reset states, settings layout | Existing A4/A5 roadmap | A4/A5 |
| X01 | UX capability | Exact recorded profile selector (same voice, different render rate/pitch etc.) and explicit export selection | RF support exists; UI/selection completeness needs audit | A4; HF2 export names/filters only |
| X02 | UX capability | Root as Default Collection in UI, JSON import destination selection, Root/library export and backup | Root storage already valid; destination/export workflow not fully verified | A3 |
| X03 | UX capability | Complete native Book Data Management, authorship and transfer | Planned A3, not missing RF storage | A3 |
| X04 | UX capability | Tap to Play / Continue From Here independently; selected target usable by Global Player; direct Unit From Here | New interaction contract; reuse core | A3-G logic, A5-A controls |
| X05 | UX capability | Scoped Manual Unit/From Here playback profiles, repeat bounded suffix, manual no shuffle | New behavior; existing handlers hardcode once or inherit globals | A3-G |
| X06 | UX capability | Restart from last session start; Continue from last step with retained boundary, queue, profile | Revised owner contract; existing global handler starts document scope | A3-G |
| X07 | UX capability | Follow playback on transition, Return to Playing one-shot, independent Card expansion | New shared focus/transport behavior; preserve passive browsing | A3-G state, A5-A/B presentation |
| X08 | UX capability | Full Clear alternative with one top playback group and interactive text | New presentation capability, no new entity/model | A5-C |
| X09 | UX capability | Central Card Audio Settings Manager accessible from Full Structured/Clear and Sidebar | New access to same native Card overrides | A4, A5 integration |
| X10 | UX capability | Nested carousel inner drag/keyboard navigation, distinct from outer scroll and inner text scroll | New gesture behavior, prototype before integration | A5-B |
| X11 | UX capability | Unified navigation Table / Legacy / Book in isolated UAT | Previously agreed A3-G; no canonical activation | A3-G |
| X12 | UX capability | Unified settings ownership: Display, Playback, Audio and Data Management | Reorganise existing and add missing safe controls; no duplicate value store | A3-G/A4/A5 |
| D01 | DEFERRED / technical debt | Five baseline historical P7/HF2 assertions | Not caused by A2; update only with actual intended changes | A4/A5/R3 |
| D02 | DEFERRED / verification | Packet C Edge timeout, physical devices, live upstream matrix | Chrome reported pass; manual local listening not whole provider matrix | A6/4H2 |
| D03 | DEFERRED / technical debt | Swiper/PostCSS nesting, browser compatibility data, large chunks | Build warning, no DB defect | A5/R2 |

A2-HF2 should not be called a database patch. A3 is a data-management capability patch, not a schema migration. The need for a new preference field or a scoped command is not evidence of a broken RF or physical storage design. If a concrete incompatibility requiring schema change is discovered, stop that portion and submit a bounded proposal with migration/rollback impact; do not silently redesign.

## 11. Grouped patch roadmap — objectives, scope and acceptance gates

### 11.1 A2-HF2 — export clarity and residual runtime defects (Sol High)

**Goal:** Close real UAT blockers before expanding authoring. Keep patch bounded; no full A1 rerun by default. Starting HEAD `2c695bd0f91c20573fd08004a000c40d46e21050`.

- HF2-E (U01/U02): separate Portable and Listening export defaults and filename prefix; engine/voice/render-rate/pitch readable names; collision-proof alternate selection/naming, preserve Portable canonical exact names, manifest/index, scope and limits. Coverage grouped EN/ID, Split/Full, Heading, compose eligibility. Clearly show selected scope/profile. Verify actual London export (37 EN Split + 1 Full EN, ID absent); reproduce 9/38/3 counts with explicit requirements, distinguish missing Full/ID. Include same-voice distinct rate/pitch fixtures, physical dedup vs logical fan-out, alternate-only and actual extension. Exact profile export filtering where existing descriptor API permits; do not implement full A4 manager here.
- HF2-P (B01): inspect existing continuity/lookahead rather than replace playback engine. Reproduce recorded and Browser EN/ID transitions, Details open, intentional delays vs load, compare equal recording availability, quantify event timeline and visible frames; fix reproduced issues with truthful source/precision. Preserve ownership, byte validation, stale/cancel and session cleanup. Do not fake gapless results. If an external provider/device latency remains, record measured limit and defer physical check.
- HF2-F (B02): stop outer passive scroll selecting focused Unit both idle and playing. Keep explicit nav, correct playback identity, Follow behavior and existing layout. No final carousel prototype/dependency in HF2.
- HF2 acceptance: focused Node/browser tests, actual ZIP tree and digest checks, roundtrip Portable, scope/isolation, normal/UAT builds sequentially, preserve original manual A2 library. User retest only corrected items; no requirement to repeat every accepted A2 scenario. If available, compare EN/ID recordings on same Card and capture residual delay. Record explicit PASS/FAIL/NOT CONFIRMED/DEFERRED; if blocked, hold dependent behavior or record reason, not pretend pass.

**Exit:** Human-readable archive + reliable coverage, no proven unresolved serious lifecycle or focus bug, remaining physical/visual refinements tracked. GO for A3 only after source review and appropriate focused acceptance. Can execute HF2 then A3 in one Sol assignment with separate gates if explicitly authorized; default separate checkpoint to protect scope. No DB schema/version or canonical activation.

**A2-HF2 review checkpoint, 28 November 2026.** Implemented from `cdfc32c006924b243537fc2fadc35a9460ba5305`, the documentation-only descendant of `2c695bd0f91c20573fd08004a000c40d46e21050`. Review the [HF2 report](A2_HF2_Book_QA_Targeted_Correction_Report.md) and its Indonesian retest checklist. The product requirements and downstream phase gates above remain in force. Owner acceptance and physical/provider retest remain open. Production activation is **NO-GO**.

### 11.2 A3 — native Book Data Management & authoring (Sol High)

**Goal:** User can create, organize, edit and transfer actual Book materials, not just seeded demos. Use authoritative scoped P15 session/native commands, no parallel writable snapshot or canonical fallback.

- A3-A Catalog: virtual Root default always available (`collectionId:null`), Custom Collection CRUD, Workspace create/edit/move/reorder/search, correct selection/scope and native stable UID. Do not delete Root or silently remove Workspace data with a collection action; explicit validated destructive semantics.
- A3-B Authoring: Workspace name vs Main Title linked/custom, bilingual headings, Speaker registry and exact references, Paragraph/Conversation/Mixed creation and native Card/Section/Turn/Segment CRUD/reorder/split/merge/move, empty Units/Cards preserved, required speaker rules, stable authored order, validation and typed errors. Read/Show independent; settings safe scoped writes. Reuse existing P12/P15 rather than redesign.
- A3-C Transfer: JSON document/collection import/export, Root destination default, existing/new Collection explicit selection, whole Collection preservation vs flatten only explicit, Root and Library full export/backup/recovery capability through compatible package contracts; verify format and authority before choosing extensions. Preserve UIDs or new-copy lineage according to command; separate audio ZIP import and text authoring, no phantom ready audio. JSON + Portable restore, missing/ambiguous/stale handling, additive import, conflict, cancellation, atomic/native publication and scope. No direct canonical v1 service call from QA. Full destructive restore remains gated by appropriate contract and approval.
- A3 acceptance: manual create/edit/move/delete confirmed sandbox items, persistent refresh and reconnect, actual JSON roundtrip and audio matching after remap, scope error tests, Root/default/no fake Collection, canonical/Table/Legacy sentinels, normal/UAT builds. Existing demo not overwritten. Explicit supported/unavailable operations and reason.

**Exit:** Functional data-management capability, not production activation. User tests authoring/transfer on QA v2 before final UI polish.

### 11.3 A3-G — functional playback/interaction contract + three-tab UAT integration (Sol High)

**Goal:** Finish shared core semantics before Neon final styling; expose minimal safe controls sufficient for functional verification. Keep A3 persistence work accepted, no redundant storage redesign.

- G-P1 Commands: one validated intent/scope resolver for global/manual/selection/From Here. Unit/Card/Workspace continuation, direct channel-only vs Play Segment, manual no shuffle, bounded suffix repeat, heading rules, Full/Split actual precision and override hierarchy. Audit transport wrap and repeat counters; verify Once/2x/Custom/Loop, blank optional channels, partial Full fallback and next/previous boundaries.
- G-P2 Session Start/Resume: retain original start, actual cursor/channel, scope, stable owner identity, ordered queue and repeat state; Restart same session start/order, Continue last actual step, Pause same media; fresh Play All new queue. Explicit selected pending target vs saved resume, stop preview Ready not Playing, stale edit/disposal/reconnect behavior. Specify what is persisted and what remains session-only before implementation; no unsupported timestamp. Freeze shuffle queue per session as target, verify/record behavior for repeats and explicit fresh command. Global Shuffle only, no manual/from-here. Never alter Table/Legacy transport semantics accidentally.
- G-P3 Reader state: common selected vs playing/paused state, Tap/Continue truth table, Follow transition trigger + Return action, independent Card expansion. Reuse scoped settings authority; minimal QA controls and shared presentation contract; final styles A5. A4 exact recorded profile selection should use existing supported descriptor/priority fields; flag any missing supported override authority for targeted review rather than new storage model.
- G-N Navigation: three tabs Table / Legacy / Book in approved UAT shell only. Book uses explicit isolated v2 connection; Table and Legacy retain existing approved paths, no transfer of QA scope/connection/prefs into canonical data. Fail closed if capability unavailable. Clear ownership/disposal when switching, no old audio callbacks changing new mode, no hidden canonical fallback; preserve normal build exclusion of QA activation. Explicitly review what data Table/Legacy UAT paths may read/write; if safe integration cannot be proven, keep read-only/disabled boundaries instead of broadening authority. No production Book activation until R1.
- G acceptance: complete functional matrix of commands, selection/owner, scope/representation, repeat/resume/shuffle, headings and actual voices; stale/cancel and switched tab tests; baseline regression only affected shared paths plus integrated gate. Manual tests on London and pure/stress fixtures, normal/UAT builds and canonical/legacy/table sentinels. Record updated ledger and remaining A5 presentation work.

**Exit:** Playback contract and safe UAT navigation accepted. Sol hands Neon stable shared APIs and preference ownership; no new independent player in UI.

### 11.4 A4 — Sidebar, Workspace Control Center & audio profiles (Neon; Sol review for logic)

**Goal:** Organize actual functionality cleanly, preserve all effective profiles and ownership. No final Reader redesign here.

- A4-A navigation/control center: Table/Legacy/Book layout, Library Root and Collections, Workspace selection, Data/Audio/Audio Library/System controls with minimal duplication; responsive desktop/mobile, theme/density; clear isolated badge in UAT. Existing accepted Table/Legacy functionality stays intact.
- A4-B audio settings: Browser voice catalog, Edge Generate voice/rate/pitch, Workspace Narrator/Speaker, EN/ID playback rate/priority; correct default/reset enabled only when changed, slider commit policy and voice catalog consistency (Natural flag/country labels/sort where applicable), unavailable voice truthful. Expose exact recorded profile selector incl same-voice differing render settings. Never confuse render rate and playback rate; choosing another profile must not replace audio.
- A4-C audio library and transfer UI: coverage groups from HF2, scoped generation/verify/cancel/export, explicit Portable vs Listening, actual selected alternate/profile filters. Central Card Audio Settings Manager lists all authored Cards with same existing overrides; optional future bulk override not necessary. Full Structured/Clear shortcut planned A5. Legacy historical Audio Sidebar assertion disposition only as relevant to changed UI.
- A4 acceptance: real native commands/session paths, no mock UI, changes reflected across workspace/Card, preserve saved prefs and exact fingerprint, reset/flicker tests, generation/error/cancel smoke, responsive/keyboard. Core changes requiring Sol approval separated; no duplicate settings store.

**Exit:** Complete discoverable Control Center with audio profile management and consistent state, ready for Reader/Player UI.

### 11.5 A5-A — Player Settings and Reader interaction controls (Neon + Sol for shared logic gaps)

**Goal:** Make accepted A3-G command semantics accessible, not reimplement them. Global Player settings for global/manual/title read/From Here; Reader toolbar display and interaction controls. Show actual selected/playing/paused/ready states, compact controls and safe Reset. Tap to Play, Continue, Follow, Return, explicit From Here from Unit/header/selected anchor, accessible without opening Sentence List. Main toolbar stable, Focus orientation in sub-toolbar. Keep Player Settings accessible in Book QA. Preserve active owner across view switches. Verify four-state interaction truth table and repeat/resume presentation; desktop/mobile controls reachable.

**Exit:** Shared settings and transport controls match core contract; no ambiguity between Full View and Full Audio, Show and Read, or selection and playback.

### 11.6 A5-B — nested 3D Focus prototype and integration (Neon)

**Goal:** A genuine Focus carousel with fixed three slots, center always dominant, smooth depth animation. First inspect installed Swiper version/features and suitable effects or other libraries using real prototype. Use existing library if capable; evaluate alternatives only if needed; don't create a custom engine by default. Show prototype with 0/1/2/3/4+ Units, horizontal/vertical, no edge wrap duplicates, fixed center, long text, progressive drag, empty slots, pointer/touch/wheel/keyboard/reduced motion. Confirm owner visual acceptance before full integration; any new dependency requires review/approval. Then wire shared state, inner vs outer scroll, actual playback/follow/return; no accidental tap-triggered playback on swipe. Resolve CSS nesting warning if relevant. Test desktop/mobile and stable Card anchor.

**Exit:** Focus visual and gesture acceptance, no passive page scroll changing selection, no audio ownership regression.

### 11.7 A5-C — Full Structured/Clear, Segment, width and bilingual polish (Neon)

**Goal:** Final clean reading and consistent visual states. Preserve four Reader levels and same data. Implement Full Clear alternative with Main Title, natural paragraph/dialogue, one top playback group, subdued optional headings, no repetitive metadata, central Card Audio manager shortcut. Keep Full Structured. Card/Focus active header actual narrator/speaker/voice/source. Segment selected edge blue/purple, active background, paired underline, pause and focus distinction; same shared Tap/Continue behavior. Notebook guides and paired underline distinct, Contextual translation inspection no playback. Fit Container vs optional Comfortable, consistent width/alignment/typography all relevant modes, no artificial blank column. AppBar/Reader responsive and no overlapping controls. Verify true Full precision (no fake per-SG highlight), actual source and fallback. Historical Bottom Player/Settings wording assertions updated transparently only where intended.

**Exit:** Owner approves visual interaction in all Reader levels, no duplicate audio engine/override stores, no hierarchy change.

### 11.8 A5-D — integrated Reader/Player gate (Sol focused independent logic verification + human UAT)

**Goal:** Reconcile A3-G core with A4/A5 UI. Run targeted integrated matrix: Paragraph/Conversation/Mixed, Full Structured/Clear, Card/Focus/Segment, bilingual styles, actual local/Browser fallback, source/voice, title policy, profiles, coverage, tap/continue/follow/return, Global/manual playback, stop/restart/continue, queue boundaries and repeat, responsive layout, selection vs playing, tab disposal. Preserve original fixtures and include user manual library without resetting. Actual evidence plus explicit manual retest; historical suites affected by shared changes, normal/UAT builds. No new feature scope during gate.

**Exit:** Integrated functional and visual GO in isolated UAT; remaining physical/device gaps documented for A6. No canonical activation.

### 11.9 A6 / 4H2 — physical Desktop and Android acceptance (owner + executor targeted fixes)

**Goal:** Validate real browsers/devices, not just emulated viewport. Edge/Chrome Browser voices and authorized actual provider smoke, recorded EN/ID, background/lockscreen MediaSession title/source/controls, interruptions, resume, touch/wheel nested gestures, performance, refresh/reconnect, audio generation/transfer and ZIP. Revisit Packet C Edge timeout. Use approved UAT origins; preserve scope. Explicitly test unknown actual device capabilities, no unsupported claims. No automatic large AI model downloads. Close defects with narrow patches and rerun affected paths.

**Exit:** Physical acceptance matrix and known limitations approved, release rehearsal ready.

### 11.10 R0–R3 — production boundary (Sol + owner approval)

- R0: rehearse canonical v1→v2 migration using authorized copies/test fixtures; backup, verify, restore/recovery, identity/order/audio byte/reference preservation, interrupted migration and safe failure; preserve Table/Legacy. Confirm exact migration plan and activation gate. Not production migration.
- R1: separately authorized canonical v2 activation and final production integration/navigation. No silent migration or deployment before human approval; validate data and rollback/recovery plan.
- R2: full release hardening/regression, browser compatibility data and chunk/bundle warning disposition, security/availability, normal and UAT artifacts, final-byte hashes, production excludes disposable QA privileges. Preserve exact source and audio identity contracts.
- R3: owner-approved release version/label, tag/build/deploy, historical frozen-version assertion disposition, smoke and rollback readiness. Product v6.0 Stable label vs current 6.0.3-beta.9-uat.2 semver requires explicit decision; do not downgrade silently.

Post-Stable: Legacy modernisation v6.1, Table v6.2, content authoring v6.3 as existing roadmap; AI Voice Track B remains isolated until separate acceptance/integration. Memory feature, offline APK/cloud and extra feature ideas remain outside current Book Stable scope unless separately approved.

## 12. Cross-patch execution rules, evidence and next instruction

- Authoritative baseline exact SHA + worktree/branch check before each task; clean/dirty state reported. One active writer, no agent commit/push/deploy without owner authorization. No unrelated changes to release version, dependencies, database schema, stores or fingerprints. New dependency only after demonstrated need and approval. Preserve canonical v1, isolated QA v2 and accepted origin/database allowlist. No general destructive GC. No automatic live synthesis.
- Keep prompts short and refer to this addendum, original architecture contract, current capability ledger and exact checkpoint. Sol only for core and acceptance, Neon for UI/prototype. Do not reread entire repo or rerun every historical audit for cosmetic changes; focused scope and escalation for shared persistence/runtime boundaries. Full regression at meaningful gates. Avoid repeated retries for unrelated baseline failures; compare and record evidence.
- Each patch report: issue IDs and classification; actual starting HEAD; scope and non-goals; reproduction/source anchors; changed-file list; commands/counts/exit codes; evidence of unchanged invariants; manual checklist only affected items; outstanding debt and next phase; GO/CONDITIONAL GO/NO-GO for isolated scope. Explicitly distinguish executor reported vs independent source review vs human verification. Normal/UAT builds sequential after final changes where applicable; preserve final-byte evidence. Do not mark deferred/untested as PASS.
- Pending UAT evidence: EN local listening confirmed; verify ID local and like-for-like latency; actual cancel/retry, portable reimport and browser restart with recordings only when tested; stress multi-batch manual status not implied by basic Workspace Split; exact Heading audio coverage/controls, manual repeat/resume/From Here settings after A3-G; full physical A6. Existing 12/22 first UAT tally remains historical; second retest records six responses and qualifications, not an automatic 22/22 replacement.
- Next instruction to prepare after owner approves this document: **A2-HF2 targeted export/readiness and residual runtime/focus correction**. Include sections 2–3, 6.5, 8.1 (ownership only), register B01/B02/U01/U02/B04 audit and gate 11.1. No final carousel, Full Clear, new settings manager or A3-G resume implementation inside HF2. Separate A3 instructions after HF2 gate (or explicitly authorized sequential assignment). Record new commit before expanding scope.

## 13. Source anchors and verification boundaries

Pinned review commit: `2c695bd0f91c20573fd08004a000c40d46e21050`. All paths below relative to repository. Line numbers may shift after patches.

| Area | Source anchors |
|---|---|
| RF and content identity | `src/domain/text/textStructuredAudioRenderFingerprintDomain.js` L24–79; `src/domain/text/bookQaBodyAudioDomain.js` L100–167 |
| Local profile rate/pitch | `src/domain/text/textStructuredAudioPlaybackOrderDomain.js` L15–56, L189–200; existing voice-oriented controls in `src/components/text/TextStructuredPlaybackControls.jsx` |
| Portable coverage/current/alternate | `src/domain/text/bookPortableAudioDomain.js` L73–112; portable service/manifest domain; `src/components/text/BookQaPortableAudioPanel.jsx` L19–53, L101–114 |
| Normal naming/bounds/composition | `src/services/audio/bookNormalAudioService.js` L23–40, L91–114, L137–171; `src/services/audio/browserZipService.js` |
| Root/Collection | `src/domain/text/textLibraryDomain.js` L107–121, L350–364, L411–413, L649–659; `src/domain/text/textDataManagementDomain.js` L61–70, L166–172 |
| JSON transfer | `src/domain/text/textPackJsonDomain.js` L121–148, L175–225, L324–386; `src/services/persistence/textPackJsonService.js` existing canonical path is not an authorization to use it from QA |
| Playback scope/order/nav | `src/domain/text/textStructuredPlaybackDomain.js` L59–224; `src/domain/text/textStructuredPlaybackPreferenceDomain.js` L3–85, L256–263 |
| Commands and resume | `src/App.jsx` L4486–4755; `src/services/playback/textStructuredPlaybackSessionService.js` (repeat, heading, lookahead and completion) |
| Continuity and actual source | `src/domain/playback/nowPlayingDomain.js`; `src/services/playback/textStructuredAudioRuntimeService.js`; `src/services/bookQaAudioSessionService.js` getPlaybackReadStamp; `src/services/audio/bookQaBodyAudioService.js` canStartVerifiedBookAudio |
| Title | `src/domain/text/textBookHeadingDomain.js`; `src/domain/text/bookQaHeadingAudioDomain.js`; `src/App.jsx` L930–942 |
| Focus and toolbar | `src/components/text/presentation/SharedFocusCarousel.jsx` L502–529; `SharedBilingualLayoutToolbar.jsx` |
| Reading width and visual state | `src/components/text/presentation/SharedBilingualUnitsBody.jsx` max-w-[66ch], `SharedNotebookUnitsBody.jsx`; inspect actual active Reader components during A5 |
| Isolation and command authority | `src/components/text/management/BookQaHost.jsx`, `src/services/bookQaSessionService.js`, `src/domain/text/bookQaCapabilities.js`, existing native P15 commands and staging |

This document is a consolidated product/technical planning artifact, not independent execution of all tests. Source inspection and actual ZIP integrity support the stated observations. Runtime metrics from executor and earlier video sampling retain their evidence limitations. Unverified UX capabilities remain planned. No repository files were modified by this authoring action. Database and RF/storage are **accepted and protected in the tested isolated scope**; canonical migration, physical acceptance, full data management and new core interaction contract remain open. The owner can now review this document before issuing the next bounded executor prompt.
