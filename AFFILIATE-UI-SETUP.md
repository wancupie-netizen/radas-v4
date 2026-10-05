# RADAS V4 — Affiliate UI Card

Apply selepas patch draft/import sebelum ini. Tidak memerlukan SQL baharu.

## Perubahan

- Nama produk: 18px, weight 700. Harga/komisen: 21px, weight 700; komisen berlatar highlight. Label weight 600; catatan sumber weight 400.
- Badge Draf / Diterbitkan untuk admin. Kategori di bawah nama. Medan gambar/content kosong tidak menggunakan ruang placeholder berlebihan.
- Edit berada dalam card yang dipilih. Simpan dan Batal berada di card yang sama. Tambah produk membuka card borang berhampiran bahagian atas.
- Maksimum 9 produk katalog setiap halaman. 99 produk = 11 halaman. Desktop 3 kolum; tablet 2; telefon 1.
- Carian/kategori menapis keseluruhan katalog sebelum pagination; menukar filter kembali ke halaman 1.
- Semasa edit, tukar halaman/filter/produk dikunci sehingga Simpan atau Batal. Respons gagal mengekalkan input dan ID asal.
- Save berjaya menutup borang; halaman semasa dikekalkan. Padam produk terakhir pada halaman terakhir kembali kepada halaman tersedia.
- Catatan sumber kekal boleh dibuka/tutup. Publish masih perlu semua medan lengkap. Kredit, pembayaran, API, SQL dan syarat akses tidak berubah.

## PowerShell VS Code

Muat turun RADAS-V4-affiliate-ui.patch ke Downloads. Terminal pada root repo, hentikan dev server dengan Ctrl+C sebelum menjalankan:

```powershell
$ErrorActionPreference = "Stop"
$patchPath = Join-Path $env:USERPROFILE "Downloads\RADAS-V4-affiliate-ui.patch"
if (!(Test-Path $patchPath)) { throw "Fail patch tiada dalam Downloads." }
git apply --check "$patchPath"
if ($LASTEXITCODE -ne 0) { throw "Semakan patch gagal. Berhenti dahulu." }
git apply "$patchPath"
if ($LASTEXITCODE -ne 0) { throw "Apply patch gagal." }
node scripts/check-affiliate-ui.cjs
if ($LASTEXITCODE -ne 0) { throw "Ujian UI gagal." }
node scripts/check-affiliate.cjs
if ($LASTEXITCODE -ne 0) { throw "Ujian affiliate gagal." }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck gagal." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build gagal." }
git diff --stat
Write-Host "UI PATCH + TESTS = PASS" -ForegroundColor Green
```

Kemudian `npm run dev`, buka http://localhost:3000/admin/products dan login admin.
Semak 9 card, halaman 1–11, font/harga/komisen, Edit card baris terakhir, Batal, Simpan, filter dan paparan telefon.
Tiada commit/push ke repo pengguna dibuat.

## Ujian

PASS: handler komponen sebenar (pagination 99/11, 9 card, search/filter reset, penempatan form dalam article, save/cancel, input null vs sifar, lost response, page clamp, user read-only, access asal).
PASS: ujian SQL/HTTP affiliate termasuk draft/publish/access serta snapshot wallet/ledger/payment tidak berubah.
PASS: typecheck, production build, whitespace check dan git apply check pada baseline selepas patch sebelumnya.

Semakan visual browser belum selesai: pemasangan Chromium gagal dalam persekitaran ini. Server fixture dan route ujian sementara telah dibuang dan tidak termasuk patch. Ujian menggunakan arkib penuh terdahulu dengan modul ZIP terbaru serta patch draft/import; tiada ujian Supabase live. Semakan rupa akhir perlu dilakukan pada localhost pengguna.
