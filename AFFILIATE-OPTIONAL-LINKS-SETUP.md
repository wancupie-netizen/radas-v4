# RADAS V4 — Pautan Produk Pilihan

Apply selepas patch draft/import, UI dan admin refresh sebelumnya.

## Perubahan

Pautan gambar dan link produk/affiliate boleh kosong untuk produk published. Nilai kosong disimpan sebagai `""`; jika diisi, wajib HTTPS sah. Teks “Akan dikemaskini” ialah placeholder kelabu sahaja, bukan URL yang disimpan.
Nama, kategori, harga, komisen, tarikh semakan dan minimum satu jenis content masih wajib. Harga/komisen serta tarikh mesti sah seperti sebelum ini.
Tanpa gambar: tiada image kosong/rosak. Tanpa link: butang Lihat produk disembunyikan dan teks makluman dipaparkan.
Tiada perubahan pada kredit, pembayaran, akses pengguna, data import, pagination atau admin refresh.

## Apply

Muat turun RADAS-V4-optional-links.patch ke Downloads. Hentikan localhost dengan Ctrl+C, kemudian PowerShell pada root repo:

```powershell
$patchPath = Join-Path $env:USERPROFILE "Downloads\RADAS-V4-optional-links.patch"
git apply --check "$patchPath"
if ($LASTEXITCODE -ne 0) { throw "Semakan patch gagal." }
git apply "$patchPath"
if ($LASTEXITCODE -ne 0) { throw "Apply patch gagal." }
node scripts/check-affiliate.cjs
if ($LASTEXITCODE -ne 0) { throw "Ujian affiliate gagal." }
node scripts/check-affiliate-ui.cjs
if ($LASTEXITCODE -ne 0) { throw "Ujian UI gagal." }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck gagal." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build gagal." }
```

Dalam Supabase SQL Editor jalankan `20261005165014_affiliate_optional_links.sql`, atau salinan `affiliate-optional-links.sql` yang dimuat turun. Kedua-duanya sama: jalankan satu salinan sahaja. SQL ini menggantikan validator sahaja; tidak mengubah produk sedia ada.

Kemudian `npm run dev` dan buka http://localhost:3000/admin/products.
**Padam teks “Akan Dikemaskini” yang ditaip pada kedua-dua medan URL. Biarkan nilai sebenar kosong.** Placeholder kelabu akan muncul sendiri. Lengkapkan medan wajib, tick Terbitkan kepada pengguna, kemudian Simpan produk.
Jika hanya frontend patch dipasang tanpa SQL, checkbox boleh aktif tetapi Simpan published tanpa pautan masih ditolak oleh database.

## Pengesahan

PASS: PostgreSQL PGlite dan API sebenar menerima published tanpa pautan; katalog pengguna boleh membaca produk tersebut. Nilai URL bukan HTTPS, placeholder yang ditaip, null dan URL tidak sah masih ditolak. Medan publish wajib lain tetap diuji.
PASS: handler UI, placeholder kosong, checkbox publish enabled, tiada image/CTA kosong; pagination, inline edit dan admin refresh kekal.
PASS: typecheck, production build, whitespace dan git apply check pada baseline selepas patch sebelumnya.
Tiada ujian browser/live Supabase atau commit/push ke repo pengguna dilakukan.
