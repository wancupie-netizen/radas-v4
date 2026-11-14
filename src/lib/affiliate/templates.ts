import type { CONTENT_TYPES } from './types';

type TemplateType = Exclude<(typeof CONTENT_TYPES)[number], 'Perbandingan'>;

// Shared guidance only. Templates never become product fields or generation requests.
export const PROMPT_TEMPLATES: readonly { type: TemplateType; text: string }[] = [
 { type: 'POV', text: `Bantu saya hasilkan satu idea video POV untuk [nama produk].

Maklumat produk yang disahkan: [ciri dan kegunaan].
Sasaran pengguna: [siapa yang sesuai].

Gunakan sudut pandang orang pertama supaya penonton terasa berada dalam situasi harian yang melibatkan produk ini. Tunjukkan satu kegunaan utama melalui aksi yang mudah difahami.

Hasilkan satu prompt siap guna untuk video 15 saat, menggabungkan situasi, aksi, pergerakan kamera dan skrip ringkas Bahasa Melayu yang natural. Jika gambar produk diberikan, kekalkan rupa asalnya. Jangan tambah dakwaan atau fungsi yang tidak diberikan.` },
 { type: 'UGC', text: `Bantu saya hasilkan satu idea video UGC untuk [nama produk].

Maklumat produk yang disahkan: [ciri dan kegunaan].
Sasaran pengguna: [siapa yang sesuai].

Gunakan situasi seseorang memperkenalkan produk sambil bercakap kepada kamera dalam suasana harian. Gaya santai seperti berbual dengan kawan, dengan pembuka yang menarik dan ajakan ringkas untuk melihat produk.

Hasilkan satu prompt siap guna untuk video 15 saat, menggabungkan situasi, aksi, pergerakan kamera dan dialog Bahasa Melayu. Jika gambar produk diberikan, kekalkan rupa asalnya. Jangan reka pengalaman penggunaan, testimoni atau hasil yang tidak diberikan.` },
 { type: 'Demonstrasi', text: `Bantu saya hasilkan satu idea video demonstrasi untuk [nama produk].

Maklumat produk yang disahkan: [ciri dan kegunaan].
Cara penggunaan sebenar: [langkah penggunaan].

Fokus pada satu fungsi utama. Tunjukkan langkah penggunaan secara ringkas dengan pandangan dekat supaya penonton mudah memahami cara produk digunakan.

Hasilkan satu prompt siap guna untuk video 15 saat, menggabungkan situasi, aksi, pergerakan kamera dan penerangan ringkas Bahasa Melayu. Jika gambar produk diberikan, kekalkan rupa asalnya. Jika cara penggunaan belum jelas, tanya saya dahulu sebelum menghasilkan prompt.` },
 { type: 'Unboxing', text: `Bantu saya hasilkan satu idea video unboxing untuk [nama produk].

Maklumat produk yang disahkan: [ciri produk].
Pembungkusan dan kandungan sebenar: [butiran atau gambar rujukan].

Tunjukkan urutan membuka bungkusan, mengeluarkan produk dan melihat satu atau dua butiran fizikal yang menarik. Gunakan reaksi sederhana dan percakapan yang natural.

Hasilkan satu prompt siap guna untuk video 15 saat, menggabungkan situasi, aksi, pergerakan kamera dan dialog ringkas Bahasa Melayu. Kekalkan rupa produk serta pembungkusan seperti rujukan. Jangan reka aksesori atau kandungan kotak. Jika maklumat bungkusan tidak mencukupi, tanya saya dahulu.` },
 { type: 'Review', text: `Bantu saya hasilkan satu idea video review untuk [nama produk].

Maklumat produk yang disahkan: [ciri dan spesifikasi].
Pengalaman sebenar saya, jika ada: [isi atau kosongkan].
Sasaran pengguna: [siapa yang sesuai].

Fokus pada satu atau dua perkara yang membantu penonton menilai kesesuaian produk. Gunakan gaya penerangan yang jujur dan santai. Jika tiada pengalaman sebenar diberikan, hasilkan ulasan berdasarkan maklumat produk sahaja tanpa mendakwa pernah mencubanya.

Hasilkan satu prompt siap guna untuk video 15 saat, menggabungkan situasi, aksi, pergerakan kamera dan skrip Bahasa Melayu. Jika gambar produk diberikan, kekalkan rupa asalnya. Jangan reka keputusan ujian, penilaian atau testimoni.` },
 { type: 'Storytelling', text: `Bantu saya hasilkan satu idea video storytelling untuk [nama produk].

Maklumat produk yang disahkan: [ciri dan kegunaan].
Sasaran pengguna: [siapa yang sesuai].
Situasi yang berkaitan: [keperluan atau masalah harian].

Bina cerita pendek dengan tiga bahagian: situasi pembuka, watak menggunakan produk dan penutup yang menunjukkan kegunaannya. Pilih satu situasi mudah supaya cerita tidak terlalu padat.

Hasilkan satu prompt siap guna untuk video 15 saat, menggabungkan jalan cerita, aksi, pergerakan kamera dan dialog atau suara latar Bahasa Melayu. Jika gambar produk diberikan, kekalkan rupa asalnya. Gunakan watak rekaan tanpa menjadikannya testimoni pelanggan sebenar atau menjanjikan hasil yang tidak disahkan.` },
];

export function productTemplates(name: string, contentTypes: readonly string[]) {
 return PROMPT_TEMPLATES.filter(template => contentTypes.includes(template.type)).map(template => ({
  type: template.type,
  text: template.text.replace('[nama produk]', () => name.trim() || '[nama produk]'),
 }));
}
