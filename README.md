# JKN Service: Verifikasi Klaim dengan Suara Peserta

Simulasi end-to-end verifikasi klaim BPJS Kesehatan (Healthkathon BPJS Kesehatan 2026). Faskes mengajukan klaim, verifikator BPJS menyiapkan pertanyaan dari **kamus pengalaman**, dan peserta JKN menjawab apa yang benar-benar mereka alami. AI membantu menyusun dan mengurutkan pertanyaan; keputusan tetap di tangan verifikator. Ketiga peran memakai catatan yang sama.

> **Semua data adalah simulasi.** Tidak ada koneksi ke sistem BPJS, FRISTA, atau layanan AI sungguhan. AI dan FRISTA disimulasikan secara deterministik dan diberi label di setiap layar.

## Menjalankan

Perlu Node.js 22 atau lebih baru.

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Saat pertama dibuka, data simulasi dibuat dan disimpan ke `local-data/db.json` (tidak masuk git).

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan dengan penyimpanan berkas lokal |
| `npm test` | Semua tes (Vitest; layar diuji dengan Testing Library + jsdom) |
| `npm run lint` | oxlint |
| `npm run typecheck` | Pemeriksaan TypeScript |
| `npm run build` | Pemeriksaan TypeScript lalu bundel produksi ke `dist/` |

## Peran dan alur

| Peran | Halaman | Isi |
|---|---|---|
| **Faskes (Rumah Sakit)** | `#/faskes` | Daftar klaim faskes dengan status, formulir klaim terstruktur (peserta dari kepesertaan, SEP, DPJP, rawat, ICD-10, ICD-9-CM, INA-CBG, tarif) dengan validasi, detail klaim dan riwayat status. Faskes tidak melihat jawaban peserta. |
| **Verifikator BPJS** | `#/verifikator` | Klaim masuk (dikelompokkan per langkah), ruang kerja klaim (data klaim + faskes + peserta, pemetaan kamus, pertanyaan, jawaban & bukti, keputusan, riwayat), kamus pengalaman (entri, versi pertanyaan, celah cakupan), draf AI, analitik AI, konfigurasi AI, log audit. |
| **Peserta JKN** | `#/peserta` | Beranda, notifikasi, ringkasan layanan (faskes, jenis rawat, periode; tanpa isi tagihan), FRISTA (simulasi), satu pertanyaan per layar, kirim sekaligus, tanda terima, riwayat jawaban. |

Alur utamanya:

1. **Klaim diajukan** faskes → tersimpan dan tertaut ke peserta, faskes, dan DPJP.
2. **Pemetaan kamus** otomatis: pertanyaan episode (menginap, lama rawat) untuk rawat inap; setiap baris tindakan dicocokkan (kode sama, kode induk, kemiripan nama) dengan skor relevansi dan status *terpetakan / di bawah ambang / tidak terpetakan*.
3. **Usulan AI**: setiap pertanyaan kandidat mendapat *keyakinan AI*; yang di atas ambang dan dalam batas jumlah pertanyaan dicentang otomatis.
4. **Persiapan**: verifikator memilih, mengurutkan, menyunting (teks dan pemetaan jawaban → kekuatan bukti, dengan pemeriksaan sistem), menambah dari kamus, atau **Tanya AI** untuk tindakan yang belum cocok. Draf AI terpisah dari kamus sampai disetujui.
5. **Terbit**: suntingan menjadi versi pertanyaan baru; satu *putaran* (assignment) mengunci versi persis yang ditanyakan. Menerbitkan ulang sebelum dijawab membuat putaran baru dan menggantikan yang lama.
6. **Notifikasi** dibuat untuk peserta yang tertaut ke klaim.
7. **FRISTA**: cocok → lanjut; tidak cocok (gagal kedua → dialihkan ke telepon); layanan tidak tersedia (tidak dihitung); tanpa kamera (dialihkan). Hanya hasilnya yang disimpan.
8. **Jawaban** dikirim sekaligus dengan versi pertanyaan, waktu per jawaban, referensi klaim, dan tanda terima. Kiriman kedua, putaran yang sudah diganti, atau versi yang tidak cocok ditolak. Setelah penyangkalan ("tidak pernah ke sana") sisa pertanyaan disimpan sebagai *dilewati*.
9. **Bukti**: setiap jawaban dibaca dengan Tabel 1 (kuat mendukung / sebagian / netral / bertentangan; rentang malam dibanding lama rawat klaim); klaim dibaca dengan Tabel 2 (penyangkalan dan pertentangan → *perlu diperiksa manusia*; semua netral → *bukti tidak cukup*; selain itu *konsisten*). "Tidak ingat" tidak pernah dianggap bantahan.
10. **Keputusan** verifikator (*sesuai / perlu tindak lanjut / tidak dapat disimpulkan*) wajib beralasan.
11. **Analitik** dihitung ulang dari catatan yang sama dan menunjukkan celah kamus untuk ditindaklanjuti lewat draf AI.

Putaran yang tidak dijawab dalam 28 hari ditutup otomatis oleh sistem.

## Model data

Satu basis data (`src/domain/types.ts`) dengan ID stabil dan referensi eksplisit. Integritasnya diperiksa oleh `checkIntegrity` (`src/domain/integrity.ts`) di tes.

| Koleksi | Isi | Referensi |
|---|---|---|
| `participants`, `facilities`, `practitioners` | Peserta JKN, faskes, DPJP | DPJP → faskes |
| `claims` | Klaim, status alur kerja, keputusan | → peserta, faskes, DPJP |
| `statusHistory` | Setiap perubahan status dengan pelaku | → klaim |
| `dictionary` | Entri kamus pengalaman (episode atau tindakan) | → draf AI asal (bila ada) |
| `questions` | Pertanyaan dengan **versi tak berubah** (teks, pilihan, pemetaan Tabel 1, asal) | → entri kamus |
| `mappings` | Hasil pemetaan per atribut klaim | → klaim, entri |
| `suggestions` | Usulan AI per klaim: skor keyakinan, model, versi konfigurasi, tindakan verifikator | → klaim, versi pertanyaan, pemetaan |
| `selections` | Pilihan kerja verifikator (belum terbit) | → klaim, versi pertanyaan, usulan |
| `drafts` | Draf AI dengan konteks, alasan, suntingan, status | → klaim, entri/pertanyaan hasil |
| `assignments` | Putaran terbit: daftar `(pertanyaan, versi)` | → klaim, peserta |
| `notifications` | Notifikasi peserta dari peristiwa nyata | → peserta, klaim, putaran |
| `fristaChecks` | Hasil FRISTA per percobaan | → putaran |
| `sessions`, `answers` | Sesi jawaban dan jawaban per butir | → putaran, versi pertanyaan, FRISTA |
| `aiConfig`, `aiConfigHistory` | Konfigurasi AI berversi | – |
| `audit` | Log setiap perubahan dari semua peran | → klaim (bila ada) |

Tidak ada agregat yang disimpan: semua angka analitik diturunkan dari koleksi di atas.

## Penyimpanan

- **Lokal (`dev`/`preview`)**: plugin Vite `plugins/db-file-store.ts` melayani `/api/db` dan menulis `local-data/db.json` secara atomik. Setiap simpanan membawa nomor revisi; simpanan yang basi ditolak (409) lalu toko memuat ulang dan menerapkan ulang perubahannya. Tab lain mendapat pembaruan lewat `BroadcastChannel` dan pemeriksaan revisi berkala, jadi peran berbeda di tab berbeda selalu melihat data yang sama.
- **Hosting statis** (mis. GitHub Pages): tanpa server, data disimpan di `localStorage` peramban dengan aturan revisi yang sama.
- **Reset data** di bilah atas membuat ulang data simulasi.
- Setiap perintah (`src/application/commands.ts`) memvalidasi dulu, berjalan dalam satu transaksi, dan menulis log audit. Perintah yang gagal tidak menyimpan apa pun.

## AI (simulasi)

Semua akses AI melewati antarmuka `QuestionAi` (`src/ai/service.ts`). Implementasi saat ini, `simulatedAi`, deterministik dan tidak belajar:

- **Peringkat**: skor dari observabilitas entri kamus, relevansi pemetaan, dan jitter tetap per klaim. Skor menyatakan satu peristiwa: *peluang peserta memberi jawaban pasti (bukan "Tidak ingat")*. Skor tidak pernah menyatakan keabsahan klaim.
- **Draf (Tanya AI)**: templat berisi deskripsi pengalaman dari katalog referensi (`src/ai/reference.ts`, belum divalidasi klinisi) dan pola jawaban dari entri kamus sejenis. Bila tidak ada deskripsi untuk kode itu, AI tidak mengarang detail: draf berupa templat yang wajib dilengkapi verifikator dan tidak lolos pemeriksaan sampai dilengkapi.
- Permintaan ke AI tidak memuat identitas peserta.
- Mengganti dengan layanan sungguhan cukup dengan implementasi `QuestionAi` lain; alur kerja sudah memanggil AI di luar transaksi.

## Analitik

Halaman *Analitik AI* memisahkan **metrik teramati**, **konfigurasi** (ambang), dan **saran sistem** (aturan sederhana, untuk ditinjau). Isinya: volume dan alur klaim, cakupan kamus dan celahnya, statistik deskriptif keyakinan AI (n, rata-rata, median, SD, varians, persentil), keyakinan vs. tindakan verifikator, kalibrasi terhadap jawaban pasti (diagram dengan IK95% Wilson, Brier, ECE, Spearman dengan IK), penguji ambang (selisih proporsi dengan IK Newcombe), respons per pertanyaan dan versinya, asosiasi menurut asal kalimat / observabilitas / usia, kualitas data dan konsistensi jawaban, serta keputusan vs. pembacaan bukti.

Prinsipnya: setiap proporsi tampil dengan n dan interval 95%; di bawah n minimum (30 keseluruhan, 10 per kelompok) muncul *data belum cukup*; keyakinan AI dibedakan dari kepercayaan statistik dan dari hasil verifikasi; asosiasi tidak disajikan sebagai sebab-akibat; tidak ada ambang yang dinyatakan optimal.

## Data simulasi

- **Klaim historis**: 100 klaim dari `datasets/1_dataset_klaim_bpjs_sample_training.csv` (Juni 2026). Verifikasinya disimulasikan dengan menjalankan ulang perintah aplikasi yang sama dalam urutan waktu, sehingga data historis mengikuti aturan yang sama dengan penggunaan langsung. Kolom kebenaran dasar dataset hanya mengarahkan jawaban peserta simulasi dan tidak disimpan.
- **Kamus awal**: 10 entri dari `datasets/2_dataset_kamus_observabilitas_pertanyaan.csv` ditambah dua entri episode.
- **Kasus demo** (Oktober 2026): `KLM-000101` siap disiapkan, `KLM-000102` tanpa entri kamus untuk tindakan utamanya (Tanya AI), `KLM-000103` menunggu jawaban Budi Santoso, `KLM-000104` sudah dijawab dengan satu pertentangan. Peserta **Yohanes Situmorang** (kartu `0001234500059`) belum punya klaim, untuk mencoba alur dari awal.
- Nama orang, faskes, dokter, kode faskes, dan kode INA-CBG adalah fiktif. `datasets/3_dataset_evaluasi_ai_1210_kasus.csv` adalah berkas statis dari implementasi sebelumnya dan tidak dipakai aplikasi.

## Struktur kode

```
src/domain/        Tipe data, Tabel 1/2, pemetaan kamus, pemeriksaan kalimat, kueri, integritas
src/ai/            Antarmuka QuestionAi, simulasi deterministik, katalog referensi
src/application/   Perintah (satu-satunya jalan mengubah data), use case per peran, konteks React
src/analytics/     Statistik dan metrik turunan
src/data/          Toko data (berkas/peramban/memori), protokol, seed simulasi
src/components/    Layar per peran (provider/, verifier/, participant/) dan komponen bersama
plugins/           Plugin Vite penyimpanan berkas lokal
datasets/          Dataset contoh (CSV)
```

## Batasan

- AI, FRISTA, kepesertaan, dan login adalah simulasi; satu akun verifikator.
- Jalur telepon untuk peserta yang dialihkan hanya dicatat statusnya; belum ada layar petugas kontak.
- Dataset historis kecil (100 klaim, satu prosedur per klaim, empat minggu), jadi banyak rincian analitik menampilkan *data belum cukup*; skor keyakinan simulasi hampir tidak membedakan jawaban pasti (Spearman ≈ 0) dan itu ditampilkan apa adanya.
- Deskripsi pengalaman di katalog referensi dan kamus awal belum divalidasi klinisi.
