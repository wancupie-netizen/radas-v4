# Email dan WhatsApp pesanan RADAS V4

Baseline pengguna: `0881fd58829adc7a9d47a8ae2120579ec00f6d86`.

## Tingkah laku

- Admin melihat email akaun sebenar serta WhatsApp pada setiap pesanan yang menunggu semakan.
- Pengguna mengisi WhatsApp sebelum memilih pakej. Nombor disimpan apabila pesanan dibuat, bukan selepas rujukan bank dihantar.
- `012-345 6789` dan `+60 12 3456789` disimpan sebagai `60123456789`. Nombor antarabangsa turut diterima. Tiada pengesahan OTP atau semakan sama ada nombor mempunyai akaun WhatsApp.
- Pemilik boleh melengkapkan atau mengemas kini WhatsApp pesanan berstatus pending/submitted. Pesanan lama tanpa nombor dipaparkan sebagai “Belum diisi”.
- Email hanya dipulangkan dalam senarai admin. WhatsApp hanya boleh diakses oleh admin atau pemilik pesanan.
- “Buka WhatsApp” membuka pautan secara manual; tiada mesej dihantar secara automatik.
- Rujukan bank yang sedang ditaip dikekalkan apabila WhatsApp disimpan.
- Pakej, pengesahan manual, idempotensi, ledger, baki kredit dan akses affiliate menggunakan aturan asal.

## Apply di terminal PowerShell VS Code

Letakkan patch yang dimuat turun dalam folder repo, kemudian jalankan:

```powershell
git status --short
git apply --check .\RADAS-V4-payment-contact.patch
if ($LASTEXITCODE -ne 0) { throw 'Patch tidak sepadan. Jangan teruskan.' }
git apply .\RADAS-V4-payment-contact.patch
if ($LASTEXITCODE -ne 0) { throw 'Apply patch gagal.' }
```

Jika ada perubahan sendiri pada fail yang sama, selesaikan dahulu sebelum apply.

## SQL Supabase

Sebelum menjalankan aplikasi baharu, buka Supabase project RADAS → SQL Editor → New query.
Salin seluruh `payment-contacts.sql`, kemudian Run.
SQL yang sama turut disertakan dalam repo sebagai `supabase/migrations/20261005212041_payment_contacts.sql`; jalankan salah satu salinan sahaja.
SQL ini menambah kolum WhatsApp nullable dan RPC contact yang mengguna semula operasi pembayaran asal. Data lama tidak diisi dengan nombor rekaan.

## Ujian dan localhost

```powershell
node .\scripts\check-payments.cjs
if ($LASTEXITCODE -ne 0) { throw 'Ujian bayaran gagal.' }
node .\scripts\check-payment-contact-ui.cjs
if ($LASTEXITCODE -ne 0) { throw 'Ujian borang gagal.' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck gagal.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build gagal.' }
npm run dev
```

Buka http://localhost:3000. Semak sebagai pengguna dan admin:
1. Tanpa WhatsApp sah, pakej belum boleh dipilih.
2. Isi WhatsApp, pilih pakej; admin melihat email dan nombor walaupun rujukan belum dihantar.
3. Pesanan lama membenarkan pemilik menyimpan nombor tanpa mencipta pesanan kedua.
4. Admin boleh membuka WhatsApp dan masih mengesahkan bayaran mengikut aturan asal.

Ujian SQL PGlite, HTTP sebenar dengan auth terasing, handler borang, typecheck dan production build lulus di persekitaran pembinaan. Semakan visual pelayar belum dilakukan; semak localhost sebelum commit/push. Tiada SQL dijalankan pada Supabase live oleh pembina.
