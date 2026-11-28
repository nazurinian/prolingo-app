# Checklist UAT Terpadu A3 dan A3-G

Gunakan checklist ini setelah review independen. A2-HF2 tetap **PASS 4/4** pada lingkup yang diuji pemilik. Penerimaan manual A3 dan A3-G dicatat bersama pada checklist ini.

## Build dan lingkungan

Jalankan PowerShell di worktree `prolingo-p12-integration-qa`.

```powershell
npm.cmd run build
$env:VITE_ENABLE_TEXT_UAT = 'true'
npm.cmd run build:uat
npm.cmd exec -- vite preview --mode text-uat --host 127.0.0.1 --port 5173 --strictPort
```

- [Book, library authoring disposable](http://127.0.0.1:5173/?qa=book-qa&db=prolingo_text_library_d3b_qa_a3_owner_authoring) memakai `prolingo_text_library_d3b_qa_a3_owner_authoring`.
- [Book, library pemulihan disposable](http://127.0.0.1:5173/?qa=book-qa&db=prolingo_text_library_d3b_qa_a3_owner_recovery) memakai `prolingo_text_library_d3b_qa_a3_owner_recovery`.
- Centang **Opt in to isolated Book QA storage**. Pilih **Initialize empty v2 library** hanya untuk nama baru. Untuk library existing pilih **Load / Connect existing v2 library**.
- Gunakan port dan origin asli library London milik Anda. Salin nama database aslinya ke parameter `db` dan gunakan **Load / Connect existing**. Gunakan library tersebut untuk mendengarkan rekaman, membaca dan mengganti preferensi sesi saja. Jalankan edit, hapus, merge, dan import hanya di dua library disposable.
- Tab Table memakai penyimpanan Table di origin tersebut setelah **Open Table workspace** dipilih. Gunakan data uji untuk perubahan Table. Tab Legacy menampilkan batas akses karena bootstrap Legacy yang tersedia dapat menulis Text v1. Uji mode Legacy yang normal dari build normal dan profil uji terpisah bila diperlukan.

## Siapkan bahan sekali

Di library authoring buat satu Mixed Workspace dengan urutan **Paragraph → Conversation → Paragraph**. Isi dua Section pada Paragraph pertama dan dua Turn dengan dua Speaker terdaftar. Buat minimal dua kalimat EN/ID per Unit, termasuk satu kalimat dengan ID kosong. Tambahkan Main Title EN/ID, Heading EN/ID pada Paragraph dan Scene, dan biarkan satu Heading opsional kosong. Pakai bahan ini untuk A3 dan A3-G.

Gunakan Browser TTS untuk pengujian interaksi. Untuk uji audio lokal, rekam beberapa kalimat dan satu Heading atau gunakan salinan rekaman London yang sesuai di library pemulihan. Uji Full Conversation impor hanya jika tersedia Portable ZIP dari Full Conversation yang dibuat di scope sumber. Satu Full serta rekaman Split penyusunnya cukup.

## A3 Data dan Transfer

| ID | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| A3-A | Buka **Book Data → Library**. Buat dua Custom Collection dan Workspace Paragraph, Conversation, Mixed. Cari, ubah nama, susun ulang, dan pindahkan Workspace dari Root ke Collection lalu kembali. Ubah nama dan urutkan Collection. | Root selalu tersedia. Perpindahan mempertahankan struktur dan identitas. Urutan dan nama bertahan setelah Refresh dan koneksi ulang. |
| A3-A2 | Coba hapus Collection berisi Workspace. Kosongkan Collection lewat pemindahan. Uji Cancel dan Confirm saat menghapus Collection kosong dan Workspace uji. | Collection terisi diblokir. Hanya data disposable yang disetujui terhapus. |
| A3-B1 | Gunakan Main Title linked lalu custom EN/ID. Ubah nama Workspace. Tambah, ubah, kosongkan dan urutkan Card Heading/Card. Uji ID tanpa EN. | Nama katalog dan judul custom tetap independen. Kesalahan Heading memberikan alasan dan draft dapat diperbaiki. |
| A3-B2 | Tambah Section, termasuk kosong. Ubah teks EN/ID dan `joinAfter`. Urutkan, pindah, split/merge Sentence dan Section yang memenuhi syarat, lalu hapus item uji. | Urutan, pasangan bilingual dan Unit kosong dipertahankan. Operasi tidak sah tidak mengubah data. |
| A3-B3 | Coba buat Scene sebelum dua Speaker terdaftar. Daftarkan tiga Speaker. Buat dua Turn berurutan dengan Speaker yang sama, termasuk Turn kosong. Ubah nama Speaker, coba hapus Speaker terpakai, lalu hapus satu Speaker bebas. | Ambang dua Speaker berlaku, Turn tidak digabung otomatis, referensi Speaker tetap benar dan penghapusan yang melanggar diblokir. |
| A3-B4 | Selang-selingkan Paragraph, Scene, Paragraph. Setelah merekam EN/ID, ubah hanya ID sebuah kalimat di fixture. | Urutan authored tetap berlaku. Rekaman EN yang cocok tetap tersedia. ID lama tidak ditandai Ready untuk teks baru. |
| A3-C1 | Ekspor Workspace, Collection, Root, dan Full Library JSON. Impor ke library pemulihan dengan tujuan Root, Collection existing atau Collection baru. Coba Preserve dan salin isi Collection ke tujuan pilihan. | Salinan mendapat identitas lokal dan lineage. Pengelompokan sesuai pilihan. Pemulihan bersifat aditif. |
| A3-C2 | Batalkan impor yang telah dipratinjau. Coba JSON rusak. Jika bisa, ubah data dari tab kedua setelah pratinjau lalu coba impor dari pratinjau lama. | Batal dan JSON rusak tidak menulis data. Konflik memerlukan Refresh dan pratinjau baru. |
| A3-C3 | Ekspor JSON dan Portable Audio ZIP terpisah, impor keduanya ke library pemulihan lalu ulangi impor ZIP. | JSON belum membuat audio Ready. ZIP memulihkan rekaman yang cocok, termasuk alternatif jika tersedia. Impor kedua melaporkan referensi sudah tersedia. |
| A3-M | Ulangi satu edit dan satu transfer di layar sempit. | **Book Data**, input, konfirmasi dan tombol kembali dapat dijangkau. |

## A3-G Pemutaran dan Navigasi

Setel **Book playback settings** dari Reader. **Play All** memulai Workspace baru saat tombol berlabel Play All. Tombol Play di Global Player memproses pilihan atau sesi yang disimpan selama Book masih terhubung.

| ID | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| G-P1 | Uji Play All, Play Card, Play Section/Turn, Play Segment, tombol EN dan ID, dan tombol **From this Section/Turn**. Ubah **From Here boundary** ke Unit, Card dan Workspace. Mulai pada SG ketiga Section pertama, misalnya P1/SC01/SG03 pada London. | Batas Unit berhenti di akhir SC01. Card menyelesaikan P1. Workspace berlanjut ke C1, P2 dan C2. Tidak ada kalimat sebelum titik awal. Tombol EN/ID hanya memutar kanal yang dipilih sekali. Kalimat tanpa ID tidak memunculkan terjemahan buatan. |
| G-P1B | Pilih Full audio, mulai dari tengah Card, lalu lanjut ke Card lengkap. Berpindah Full, Card, Focus dan Segment saat masih bermain. | Awal parsial memakai Split. Card lengkap berikutnya dapat memakai Full sesuai sumber. Full tidak menampilkan progres per Sentence. Mengganti Reader View mempertahankan playback dan representasi yang diminta. |
| G-P1C | Dalam library pemulihan pilih Full dan mainkan Scene yang memiliki Full Conversation WAV hasil impor. | WAV impor tetap dapat diverifikasi. Tanpa trust komposisi lokal, playback memakai Split yang sah. Detail menunjukkan Full diminta dan Split aktual dengan sumber yang sesuai. |
| G-P2 | Atur From Here Once, 2×, Custom 3 dan Loop. Atur Play All Shuffle Cards; ulangi sesi dan coba Play All baru. Uji Previous pada awal dan Next pada batas, termasuk saat Pause. | Setiap pass mengulang suffix yang sama. Shuffle hanya mengubah urutan Card Play All dan menjaga urutan isi serta Heading. Next pada Once tidak membungkus. Pass tambahan berjalan sesuai counter. Next saat Pause tetap tanpa suara hingga Resume. |
| G-P2B | Stop ketika ID berbunyi dalam From Here. Dengan **Continue last step**, tekan Play. Ulangi dengan **Restart session start**. Uji Pause/Resume terpisah dan biarkan satu sesi selesai. | Setelah Stop tidak ada highlight aktif. Continue mengulang langkah ID yang terakhir dan mempertahankan sisa pass. Restart kembali ke titik awal dan pass pertama. Pause mempertahankan media yang sama atau pengulangan aman untuk Browser TTS. Selesai tampil Ready. |
| G-P3 | Coba klik teks untuk kombinasi Tap OFF/Continue OFF, OFF/ON, ON/OFF dan ON/ON. Pada saat bermain dengan Tap OFF, pilih kalimat lain lalu Stop dan Play. | OFF/OFF hanya memilih dan Play memakai Manual Segment. OFF/ON hanya memilih dan Play memakai From Here. ON/OFF segera memutar kanal yang diklik sekali. ON/ON mulai dari urutan kanal Manual Segment lalu mengikuti From Here. Pemilihan saat aktif tidak memotong suara. Pilihan pending mengalahkan posisi Stop. |
| G-P3B | Di Focus, scroll halaman, pilih Unit lain, ubah Follow Playback, klik **Return to Playing**, dan uji Follow / Expand All / Custom untuk buka Card. | Scroll pasif tidak memindahkan Unit. Follow OFF mempertahankan browsing. Follow ON kembali pada transisi bermakna. Return mengarah sekali tanpa restart atau mengaktifkan Follow. Mode buka/tutup Card tetap terpisah. |
| G-P4 | Periksa default 0/0/200/350/750/400/500 ms. Ubah dua nilai, kembalikan manual, lalu coba Reset. Dengarkan batas kanal, Sentence, Unit, Card, Main Title, Heading, dan Repeat. Saat jeda coba Pause, Next dan Stop. | Reset hanya aktif ketika nilai efektif berbeda dan hanya mengubah kelompok delay. Satu delay berlaku di setiap batas. Heading kosong atau Read OFF tidak mendapat jeda Heading. Jeda dan Browser TTS tidak menampilkan timeline media palsu. |
| G-P4B | Di **Title and Heading audio**, set Show OFF dan Read ON; uji Play All, Card, Unit, From Here, Pause/Resume dan pass kedua. | Heading tersembunyi tetap dapat dibaca. Main Title hanya masuk Play All. Card membaca Heading sendiri jika berlaku. Unit/Sentence serta Card awal From Here tidak mendapat intro. Heading berikutnya dan repeat mengikuti kebijakan. |
| G-N | Saat Book berbunyi, buka Legacy lalu Table. Buka Table secara eksplisit dan putar item. Kembali ke Book dan reconnect library yang sama. Periksa di layar sempit. | Pemilik playback lama dilepas. Legacy menampilkan gerbang. Table mengikuti perilaku Table. Book idle setelah reconnect, dengan data tetap tersimpan. Pengaturan Book bersifat sesi; pilihan Table menggunakan jalur Table. |

Tandai **PASS** jika hasil lengkap terlihat, **FAIL** jika perbedaan dapat direproduksi, atau **NOT CONFIRMED** jika belum diuji atau buktinya belum cukup. Catat ID, origin, nama library, browser, perangkat, dan langkah terakhir. Gunakan **DEFERRED** untuk akses Legacy live dari shell UAT, attach/sync atau restore pengganti, pengelolaan profil A4, desain Reader A5, serta pengujian latar Android dan pengurangan hening A6.
