# RADAS V4 — Video Resilience: patch untuk semakan localhost

Baseline upstream: `7e57b57523215d7086b0e9c6f3c19c1d0f4c3fae`.
Tarikh: 17 November 2026 (MYT). Tiada push, deployment, SQL live, generation berbayar atau refund pelanggan dijalankan oleh patch preparation ini.

## Hasil

Provider `done` dipisahkan daripada keadaan simpanan. Runner startup Node memproses job asal walaupun halaman ditutup. Kerja dan retry disimpan dalam PostgreSQL; restart boleh menyambung selepas lease luput. Playback dalam mod baharu hanya membaca salinan RADAS. UI menunggu video selesai dimuatkan sebelum memaparkan `Video ready`. Senarai 20 video selesai yang belum luput dipulihkan daripada server selepas refresh.

Sumber asal telah disemak melalui GitHub. Railway sebelum ini disahkan SUCCESS untuk baseline. Definisi fungsi live yang dibekalkan pemilik digunakan untuk mengekalkan perlindungan transaksi dan refund. Punca tepat gangguan sementara download/upload asal masih belum dibuktikan.

## Perubahan minimum

| Bahagian | Perubahan |
| --- | --- |
| Runner | `src/lib/finalization/runner.ts`, dimulakan melalui `src/instrumentation.ts`; satu transfer global, empat saat antara kerja |
| Ketahanan | Rekod `radas_v4.video_finalizations`, lease 10 minit, deadline kerja 5 minit, maksimum lima percubaan gagal/crash; pending provider yang sah menetapkan semula kiraan |
| Retry | Backoff 5, 15, 45, 135 saat sebelum had lima; kegagalan seterusnya memerlukan semakan. Tiada retry provider POST atau debit |
| Storage | Laluan immutable asal; membaca objek yang sudah wujud; metadata boleh dipulihkan; guard lease sebelum upload/mark; baca semula objek sebelum ready |
| API | `videoState` tambahan; status provider asal dikekalkan. GET `/api/generations` menyenaraikan hasil milik pengguna yang disahkan |
| UI | Generating → Finalizing → Video ready selepas `loadeddata`; keadaan expired/support dinyatakan; sejarah dipulihkan pada pembukaan/focus dan setiap 10 saat |
| Hos | `NEXABOT_DOWNLOAD_ORIGINS`: JSON array origin Supabase tepat dengan project ref 20 aksara; empat origin sedia ada kekal. Wildcard, HTTP, credentials, path, query dan custom port ditolak |
| Privasi | RPC baharu service-role sahaja, table RLS dan tiada akses terus browser. Tiada prompt, key atau signed URL ditambah ke log |

`RADAS_FINALIZATION_ENABLED` tidak ditetapkan kepada true secara lalai. Tiada perubahan dependency, project ID, bucket, harga atau formula kredit. Fungsi `credit_apply` dan `video_object_operation` tidak diganti.

## Dua migration yang perlu disemak berasingan

1. `20261117014123_video_finalization.sql`: menambah table dan RPC finalization. Tidak menggantikan tiga fungsi live asal. Ujian membandingkan definisinya sebelum/selepas.
2. `20261117014917_expired_generation_slot_release.sql`: CADANGAN POLISI UNTUK KELULUSAN PEMILIK. Menambah `slot_released_at` dan sebab, meminda hanya bahagian terhad fungsi generation melalui padanan teks yang dijaga, dan membina semula indeks satu job aktif. Jika definisi tidak sepadan, transaksi dibatalkan.

Migration kedua melepaskan slot `queued`/`processing` yang mempunyai job ID hanya selepas expiry asal 12 jam, ketika operasi akaun seterusnya berlaku. Ia tidak menukar status kepada failed, tidak refund dan tidak mengulangi generation. Masa dan sebab disimpan pada generation. Polling/transition job yang telah dilepaskan dibekukan; job baharu masih tertakluk kepada satu slot aktif. Satu 404 atau timeout sebelum expiry tidak melepaskan slot.

Semak definisi indeks/constraints live melalui `sql/inspect-live.sql` sebelum migration kedua. Jangan jalankan semula installer auto-release/admin-release lama selepas migration ini kerana installer lama tidak mengenali kolum slot baharu. Ujian menggunakan fungsi auto-release repository yang sepadan dengan definisi yang dibekalkan, termasuk guard kredit; keputusan live masih perlu disahkan.

Kedua-dua refund Azman yang telah selesai tidak disentuh. Penggantian kredit bagi job bermasalah masih memerlukan keputusan admin dan transaksi ledger yang diluluskan.

## Ujian yang telah lulus dalam workspace ini

- `check:finalization`: PGlite sebenar + kod TS/SQL/route; job selesai tanpa browser, body provider terputus, upload sementara gagal, respons upload hilang, metadata gagal, dua pemohon lease, crash lease, token lama, redirect tidak selamat, 404 berulang, expiry dan sejarah milik pengguna.
- Ujian migration slot: slot luput dilepaskan sekali, tiada status/refund berubah, job baharu kekal eksklusif, transition lama ditolak.
- Provider benar-benar failed: menggunakan laluan refund atomik sedia ada tepat sekali. Kegagalan polling dan expiry tidak masuk laluan refund.
- UI render: provider done/Blob sahaja tidak memaparkan Video ready; event media dimuatkan menjadi syarat.
- `check:finalization:runtime`: proses production `next start` sebenar, instrumentation dan SDK HTTP sebenar ke mock gateway setempat. Download 307 → MP4 → upload → metadata → readback berlaku tanpa sebarang HTTP daripada browser. Key tidak dihantar ke redirect Storage. Rangkaian live disekat dalam fixture.
- `check:storage`, `check:generation`, `check:safety`, `check:history`, `check:nexabot`, log sanitization, English UI boundary, typecheck dan build.

Ujian PGlite menggunakan satu sambungan beratur, bukan bukti transaksi PostgreSQL berbilang sambungan. MP4 fixture hanya menguji container/transport. Windows PowerShell installer belum dijalankan pada PC pemilik. Ujian video berbayar sebenar, playback codec pada browser, gangguan deployment Railway sebenar, kapasiti RAM untuk fail besar dan concurrency PostgreSQL sebenar masih diperlukan sebelum penerimaan production.

## Cara semak pada Windows

Extract ZIP ke folder baharu. Jalankan `Install-Local.ps1` dengan PowerShell. Script:

1. Memaparkan perubahan dan worktree repo Windows asal tanpa mengubah failnya.
2. Menyemak remote repo, fetch main, dan berhenti jika baseline main telah berubah.
3. Mencipta branch/worktree baharu dengan nama unik pada baseline tepat.
4. Menyemak serta menggunakan patch; menjalankan fixture tests, typecheck dan build.
5. Tidak menyalin `.env.local`, tidak menjalankan SQL, tidak mengaktifkan flag, tidak commit/push/deploy dan tidak membuat panggilan berbayar.

Fail `next-env.d.ts` boleh berubah akibat build dalam worktree baharu; jangan masukkannya ke commit. Perubahan diagnostik di worktree lama dikekalkan. Jangan sambungkan runner localhost kepada variables production sebelum migration dan ujian live dipersetujui: alamat Supabase aplikasi memang dikunci kepada project production. Fixture setempat memberikan ujian tanpa data live.

## Pelan deployment untuk kelulusan kemudian

1. Semak diff dan output Windows. Semak indeks/constraints live serta tetapan Railway: proses Node sentiasa hidup, tiada sleep/serverless request freeze, RAM dan kapasiti sesuai. Satu transfer pada satu masa mengawal memori; backlog boleh melambatkan simpanan.
2. Ambil salinan definisi fungsi/index live dan snapshot schema sebelum migration. Uji migration dalam PostgreSQL terasing dengan berbilang sesi; sahkan saingan browser/runner dan proses crash.
3. Selepas kelulusan, jalankan migration pertama dan query verification. Migration kedua memerlukan persetujuan polisi pelepasan slot tanpa refund. Ia bukan operasi read-only walaupun tiada kredit berubah.
4. Deploy code dengan flag false. Semak login, balance, sejarah dan playback lama. Jangan anggap deployment SUCCESS sebagai ujian generation.
5. Selepas persetujuan ujian live, aktifkan `RADAS_FINALIZATION_ENABLED=true` dalam persekitaran yang dipersetujui. Gunakan satu job ujian terkawal; tutup halaman sebelum siap, buka semula dan sahkan Storage, metadata, playback serta download. Ini menyentuh data live jika variables production digunakan.
6. Semak rekod ready/retry/needs_review, backlog dan log `video_finalize`. Retry tidak menjamin pemulihan selepas provider memadam video atau sepanjang servis tidak berjalan; expiry asal kekal.
7. Commit/push main dan sebarang deployment production hanya selepas kelulusan pemilik. Sahkan SHA deployment dan ujian penuh selepas deploy.

## Rollback

Matikan flag dahulu untuk menghentikan claim baharu, dan tunggu kerja dalam proses selesai atau hentikan proses secara terkawal. Flag ditukar melalui environment memerlukan restart/deployment mengikut platform. Kembali kepada aplikasi baseline yang diketahui baik jika perlu; salinan Storage dan ledger dikekalkan.

Jangan DROP table, mengosongkan lease atau menukar status/refund secara pukal. Migration pertama boleh kekal dorman apabila flag false. Migration slot perlu dikendalikan berasingan: jangan membina semula indeks lama sementara terdapat job lama yang sudah dilepaskan dan job baharu aktif bagi pengguna sama. Reverse migration memerlukan semakan data dan bukan sebahagian installer. Aplikasi lama mengabaikan medan slot baharu; pengguna mungkin perlu refresh semasa rollback UI.

## Pemulihan selepas had retry

`needs_review` tidak membuat refund. Semak log melalui generation ID, keadaan provider, origin yang diluluskan, objek dan metadata terlebih dahulu. Selepas punca diperbaiki, admin boleh meluluskan reset retry bagi satu generation yang belum luput menggunakan ID asal. Reset itu mesti disasarkan dan direkodkan oleh admin; tiada endpoint awam untuk menetapkan semula retry dalam patch ini. Job yang sudah luput kekal untuk semakan kredit, bukannya memanjangkan lifetime video.
