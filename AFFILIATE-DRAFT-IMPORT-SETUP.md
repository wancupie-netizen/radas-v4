# RADAS V4 — Draft Affiliate & Import TXT

Baseline: `ea64a09c19ae03158cd6d1182f53ae279e2ad728`.
ZIP modul: integriti PASS; SOURCE-INFO.txt sepadan.
Sumber: RADAS PRODUCT DATABASE V1.txt; SHA-256: `389adf0b3ffbdfd81f6da13a98787ad940eae73a1d7cb6cdc177ee9a036a5613`.

## Hasil

- 99 produk bernama, semuanya draft/unpublished. Ulangan #059 dan #081 sekali sahaja.
- #022/#026 ditangguhkan; baris “text analisis” #078 diabaikan. Produk sebenar #078, #027 dan #101 dikekalkan.
- Medan teks kosong = `""`, wang tidak diketahui = `null`, jenis content = `[]`. Tiada kategori, gambar, pautan, tarikh semakan atau jenis content direka.
- Metadata sumber lengkap kekal dalam catatan admin; bukan data semasa yang disahkan.
- Draft boleh disimpan dengan nama sahaja. Publish wajib semua maklumat seperti baseline.
- Draft hanya dalam admin_list. Catatan sumber dibuang daripada respons list pengguna walaupun produk sudah published.
- Kredit, pembayaran dan akses pengguna kekal. Import melalui operasi save sedia ada dengan audit/revision.

| Entri | Medan kosong | Sebab |
| --- | --- | --- |
| #007 | Komisen | RM44 tidak sepadan dengan harga RM170 pada kadar 22% sumber |
| #020 | Harga dan komisen | Harga varian RM19.90/RM36.90/RM45.90; komisen RM161.59 meragukan |
| #034 | Komisen | Julat RM21.70–RM24.50 |
| #043 | Komisen | Julat RM10.29–RM15.44 |

Nilai asal tetap ada dalam catatan sumber. Nilai tidak digantikan dengan angka rekaan.

## Apply melalui VS Code

Simpan patch di luar repo. Buka terminal root repo:

```sh
git rev-parse HEAD
git status --short
git apply --check "../RADAS-V4-affiliate-drafts.patch"
git apply "../RADAS-V4-affiliate-drafts.patch"
node scripts/check-affiliate.cjs
node scripts/check-affiliate-ui.cjs
npm run typecheck
npm run build
```

HEAD mestilah baseline di atas. Elakkan menindih perubahan tempatan pada fail yang sama.
Patch turut memasukkan SQL ke repo. Dalam Supabase SQL Editor, jalankan dengan akses owner/postgres:

1. `supabase/migrations/20261005131720_affiliate_drafts.sql` — sokongan draft.
2. `supabase/import-affiliate-txt-v1.sql` — import 99 produk.

`01-affiliate-drafts.sql` dan `02-import-99-products.sql` ialah salinan SQL yang sama; jalankan satu salinan sahaja. Jangan jalankan semula migrasi pemasangan affiliate asal.
Import memilih admin secara automatik jika terdapat tepat satu payment_admins confirmed. Jika ada beberapa admin, isi UUID admin pada `v_actor uuid := null` dalam SQL import. Senarai admin:

```sql
select a.user_id, u.email from radas_v4.payment_admins a
join auth.users u on u.id = a.user_id;
```

Import atomik. ID stabil dan padanan nama (abaikan huruf besar/kecil dan ruang berulang) mengelakkan pendua. Rerun tidak menimpa edit admin. Jika nama telah wujud, rekod itu dikekalkan; jumlah inserted boleh kurang daripada 99 dan SQL melaporkan inserted/skipped.

Selepas SQL, buka `/admin/products`. Semak 99 draft, edit medan kosong dan pastikan publish hanya tersedia selepas lengkap. Akaun pengguna yang layak tidak melihat draft. Anda urus commit dan push sendiri.

## Ujian

- `check-affiliate.cjs`: PASS — SQL PGlite dan route HTTP sebenar, auth/CSRF, draft, publish lengkap, source notes private, 99 nama, dedup/replay, edit admin, rollback atomik, admin berbilang, revision/audit. Snapshot wallet/ledger/payments tidak berubah.
- `check-affiliate-ui.cjs`: PASS — handler komponen sebenar, draft tanpa gambar rosak, notes, null vs sifar, publish gating, save draft dan akses asal.
- Typecheck dan production build Next.js 16.3.8: PASS.
- Diff whitespace dan apply check pada baseline fixture: PASS.

Ujian/build menggunakan arkib penuh radas-v4-main.zip dengan modul daripada ZIP terbaru ditindih sebelum perubahan. Commit keseluruhan tidak disahkan melalui remote Git; baseline modul disokong SOURCE-INFO.txt dan fail ZIP. Patch hanya menyentuh modul affiliate, ujian, fixture, SQL dan dokumen ini. Tiada perubahan live/remote. Ujian Supabase live dan visual browser belum dijalankan.
