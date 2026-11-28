# Checklist UAT Manual A3 Book QA

## Jalankan build lokal

Di PowerShell dari worktree `prolingo-p12-integration-qa`, jalankan perintah ini secara berurutan.

```powershell
npm.cmd run build
$env:VITE_ENABLE_TEXT_UAT = 'true'
npm.cmd run build:uat
npm.cmd exec -- vite preview --mode text-uat --host 127.0.0.1 --port 5173 --strictPort
```

Gunakan [A3 authoring](http://127.0.0.1:5173/?qa=book-qa&db=prolingo_text_library_d3b_qa_a3_owner_authoring) dengan database `prolingo_text_library_d3b_qa_a3_owner_authoring`. Centang **Opt in to isolated Book QA storage**, lalu pilih **Initialize empty v2 library** untuk nama baru. Pilih **Load / Connect existing v2 library** jika nama tersebut sudah dipakai. Jika port 5173 sedang terpakai, port loopback 4173 juga didukung. Sesuaikan port pada perintah dan URL.

Siapkan [database pemulihan A3](http://127.0.0.1:5173/?qa=book-qa&db=prolingo_text_library_d3b_qa_a3_owner_recovery) dengan nama berbeda. Jalankan semua pengujian hapus di kedua database uji ini. Saat dialog **Confirm change** muncul, cocokkan data, Collection, dan nama database sebelum menyetujui.

## Skenario dan hasil

| ID | Langkah dari UI | Hasil yang diharapkan |
| --- | --- | --- |
| A3-A1 | Dari AppBar buka **Book Data → Library**. Buat dua Custom Collection. Ubah nama, atur urutan, lalu pilih **Root — Default Collection**. Buat Workspace Paragraph, Conversation, dan Mixed. | Root selalu tersedia. Ketiga Workspace muncul dan bisa diurutkan dalam Root. |
| A3-A2 | Cari Workspace menggunakan **Search Workspace names**. Dari **Workspace & Speakers**, pindahkan Mixed ke Custom Collection dan ubah namanya. Coba hapus Collection berisi Workspace. Pindahkan Workspace ke Root lalu hapus Collection yang sudah kosong. Uji **Cancel change** sebelum **Confirm change**. | Data Workspace tetap sama saat dipindah, pencarian menemukan nama baru, dan Collection berisi Workspace menolak penghapusan. Setelah Refresh dan koneksi ulang, lokasi dan urutan tetap tersimpan. |
| A3-B1 | Di Paragraph, ubah Main Title dari nama Workspace ke judul EN kustom dan isi ID. Ganti lagi nama Workspace. Buat Paragraph Card dengan Heading EN/ID. Dari Reader ubah **Show Main Title** dan **Read Main Title** secara terpisah lewat **Title and Heading audio**. | Nama katalog dan judul kustom tetap independen. Heading EN/ID tampil sesuai pengaturan, dan mengubah Show tidak mengubah Read. |
| A3-B2 | Buat Paragraph Section kosong dan dua kalimat EN/ID. Ubah teks serta `joinAfter`, urutkan dan pindahkan kalimat. Coba **Split Sentence**, gabungkan dengan kalimat berikutnya, lalu coba split/merge Section. | Urutan dan pasangan EN/ID benar. Section kosong tetap ada. Batas dan tombol yang tidak berlaku memberikan alasan atau tidak ditawarkan. |
| A3-B3 | Di Conversation, coba buat Scene sebelum ada dua Speaker. Daftarkan tiga Speaker lalu buat Scene. Buat dua Turn berurutan dengan Speaker sama dan biarkan salah satunya kosong. Ubah nama Speaker, coba hapus Speaker terpakai, dan hapus Speaker yang tidak dipakai. | Scene baru membutuhkan dua Speaker terdaftar. Kedua Turn tetap terpisah. Label berubah pada kedua Turn dan penghapusan Speaker terpakai diblokir. |
| A3-B4 | Di Mixed, buat dan susun Paragraph → Scene → Paragraph. Isi minimal dua Section atau Turn. Hapus satu item uji setelah konfirmasi. Coba Heading dengan ID saja, lalu perbaiki dan simpan. | Urutan tidak berubah menurut jenis Card. Kesalahan tampil dan draft bisa diperbaiki. Hanya item yang dikonfirmasi yang dihapus. |
| A3-C1 | Ekspor **Workspace JSON**, **Custom Collection JSON**, **Root JSON**, dan **Full Library JSON**. Pada database pemulihan, coba import ke Root, Custom Collection yang sudah ada, dan **Create New Collection**. Coba mode **Preserve as a new Collection** dan mode impor isi Collection ke tujuan. | Struktur dan urutan sesuai pilihan. Nama yang sama dapat muncul sebagai salinan terpisah. Full Library mengembalikan pengelompokan Root/Custom Collection secara aditif. |
| A3-C2 | Pilih JSON, batalkan, lalu pilih JSON rusak. Jika ada tab kedua, tambahkan Collection setelah pratinjau di tab pertama lalu coba impor. Klik Refresh dan pilih ulang berkas. | Batal dan JSON rusak tidak menulis data. Konflik meminta Refresh. Impor tidak diterapkan ulang otomatis. |
| A3-C3 | Bila tersedia rekaman di Workspace uji, ekspor **Workspace JSON** dan **Portable Audio ZIP**. Impor JSON ke database pemulihan. Pilih Workspace hasil impor, buka **Portable Audio ZIP**, pilih berkas, lalu klik **Import selected files**. Periksa coverage dan impor ZIP yang sama lagi. | JSON saja belum menyediakan audio siap putar. Rekaman ZIP terhubung ke salinan, termasuk profil alternatif bila tersedia. Impor kedua melaporkan aset sudah tersedia tanpa referensi duplikat. |
| A3-M1 | Ulangi satu tugas authoring dan satu tugas transfer di layar sempit atau ponsel. | Tombol **Book Data**, navigasi, form, konfirmasi, dan **Back to Reader** bisa dijangkau. |

Untuk setiap baris, tandai **PASS** setelah seluruh hasil terlihat, **FAIL** jika hasil berbeda dan bisa direproduksi, atau **NOT CONFIRMED** jika belum dijalankan atau bukti belum lengkap. Catat browser, perangkat, nama database dan langkah terakhir pada kasus FAIL. Gunakan **DEFERRED** untuk attach/sync, restore pengganti seluruh database, dan fitur lanjutan A3-G/A4/A5.

Opsional, buka URL dengan nama database A2 yang sudah dimiliki pada origin yang sama. Pilih **Load / Connect existing v2 library** dan periksa Workspace/rekaman saja. Inisialisasi dan pengujian ubah/hapus tetap di database A3 disposable.
