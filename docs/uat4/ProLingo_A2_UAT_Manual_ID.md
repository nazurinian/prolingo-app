# ProLingo V6 · UAT manual Book QA A2

## Menjalankan Book QA

Dari worktree `prolingo-p12-integration-qa` pada branch `test/text-v2-uat`, jalankan di PowerShell:

```powershell
$env:VITE_ENABLE_TEXT_UAT = 'true'
npm.cmd run build:uat
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort --outDir dist-uat
```

1. Buka [Book QA A2](http://127.0.0.1:4173/?qa=book-qa&db=prolingo_text_library_d3b_qa_book_a2_manual) pada profil browser yang akan dipakai untuk UAT. Nama database ialah `prolingo_text_library_d3b_qa_book_a2_manual`.
2. Centang **I explicitly opt in to isolated Book QA storage**. Untuk nama baru, pilih **Initialize A2 demo library**. Jika nama itu sudah ada, pilih **Load / Connect existing v2 library**. Inisialisasi ulang menampilkan `EXISTING_DB_PROTECTED` dan mempertahankan isinya.
3. Gunakan pemilih Workspace pada AppBar. Pertahankan URL, host, port, profil browser, dan nama database yang sama saat membuka kembali. IndexedDB terikat pada origin dan profil browser.

Library dimulai dengan nol rekaman. Uji baca dan Browser TTS dapat dilakukan langsung jika browser menyediakan suara. Untuk **uji yang memerlukan rekaman**, impor arsip Portable yang cocok atau jalankan `npm.cmd run server` di terminal PowerShell lain. Dengan server aktif, tombol **Generate** mengirim permintaan ke Edge TTS atas tindakan penguji. Untuk membuat cakupan parsial, pilih satu Sentence pada Paragraph, pilih **English** lalu **Generate Sentence**. Ulangi untuk **Indonesian** jika diperlukan. Setelah **Verify Card audio**, Sentence terpilih semestinya Ready dan Sentence lain masih berstatus Missing.

## Checklist

| Uji | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| Inisialisasi | Buat library baru melalui tombol A2. | Empat Workspace muncul. London Mixed memiliki 4 Card, 11 Unit dan 37 Sentence. Status rekaman awal Missing. |
| Paragraph | Buka **A morning by the river**. Periksa dua Card, tiga Section, dan Sentence EN/ID. | Narrator konsisten. Sentence terakhir di Card kedua berisi EN dengan ID kosong. Heading Card kedua tersedia dalam EN. |
| Conversation | Buka **At the information desk** dan kedua Scene. | Maya memiliki dua Turn berurutan dengan ID Turn terpisah. Ari memiliki profil berbeda. Turn kosong di Scene kedua tetap ada. |
| Mixed | Buka **A Journey to London**. | Urutan Card P1 → C1 → P2 → C2 tetap. Main Title dan Heading tersedia dalam EN dan ID. |
| Reader | Beralih **FULL → CARD → FOCUS → SEGMENT**. Pindah Card/Section sambil audio berjalan. | Posisi baca berubah sesuai level. Global Player tetap mengikuti sumber yang sedang dimainkan. |
| Main Title dan Heading | Di **Title and Heading audio**, putar Main Title atau pilih Card Heading. Ubah **Read** untuk Scene atau Paragraph lalu ulangi playback Card. | Main Title/Heading dibaca sebagai bagian tersendiri bila diaktifkan. Skip untuk Heading yang dimatikan atau kanal kosong. |
| Split dan fallback | Pilih **Saved Full** pada pengaturan Global Player lalu putar Scene yang belum mempunyai Full. Coba **Saved Split**. | Untuk fallback Scene, Global Player menampilkan Sentence, Turn, Speaker, kanal dan sumber aktual. Browser TTS memakai suara yang tersedia pada perangkat. |
| Global Player | Coba Pause/Resume, Stop, Previous/Next, **Start From Here**, lalu biarkan playback berlanjut. | Pause/Resume mempertahankan sesi. Navigasi mengikuti cakupan perintah. Continue dari Section/Turn berhenti di batas yang dipilih. |
| Suara EN/ID | Di **Body audio**, pilih kanal dan Speaker berbeda. Bandingkan Maya dengan Ari dan narrator Paragraph. | Pengaturan EN dan ID independen. Default Edge ialah Sonia/Gadis. Browser Edge memilih Sonia/Gadis bila tersedia, Chrome mengutamakan UK Female/Indonesian. Profil yang disimpan tetap didahulukan. |
| Rekaman Split/Full | **Perlu rekaman.** Di Paragraph jalankan **Generate Card Full** atau impor rekaman yang cocok. Untuk Scene, siapkan semua Split satu kanal pada 1× lalu pilih **Compose Scene Full**. | Full Paragraph yang tersedia diputar pada presisi Card. Full Scene lokal yang terverifikasi memakai 1×. Derived Full dari impor dapat tetap memakai fallback per Sentence. |
| Pembuatan bertahap | **Perlu Edge TTS.** Pilih **Stress**, Card **34 Sentences · Batch generation**, lalu **Generate Card Split**. Coba Cancel dan ulangi. | Operasi berjalan dalam batch. Batch yang sudah diterima tetap tersimpan. Ulangan melewati rekaman yang terverifikasi. Tersedia 34 target EN dan 33 target ID. |
| Portable ZIP | **Perlu rekaman.** Buka **Portable Audio ZIP**, pilih **Selected Workspace**, lalu **Export Portable Audio**. Pilih kembali ZIP yang sama dan tekan **Import selected files**. | Manifest dan `AUDIO_INDEX.csv` mencatat audio terverifikasi. Cakupan parsial terlihat. Impor ulang mengenali rekaman yang sudah ada. |
| Normal ZIP | **Perlu rekaman.** Pilih kanal dan representasi di panel yang sama, lalu **Export Normal Audio**. | Arsip mendengar mengikuti urutan Card/Unit. Unit WAV memerlukan Split lengkap pada 1×. Masukan yang kurang dilaporkan sebagai omission. |
| Refresh dan buka ulang | Ubah nama salah satu Workspace lewat **Data**, klik **Refresh isolated Book QA library**, lalu tutup dan buka ulang browser. Centang opt-in dan gunakan **Load / Connect existing v2 library**. | Nama baru dan audio yang sama tetap ada. Browser meminta koneksi kembali setelah dibuka ulang. |

Preferensi Global Book QA berlaku selama sesi. Profil Workspace, referensi audio, dan rekaman yang sudah diterima tersimpan di library. Uji perangkat fisik Desktop/Android, media latar belakang dan perpindahan antarperangkat tetap dicatat pada A6/4H2. Perluasan authoring, backup, dan navigasi Table/Legacy/Book masuk A3/A3-G.
