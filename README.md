# JKN Service: Verifikasi Klaim dengan Suara Peserta

Simulasi end-to-end verifikasi klaim BPJS Kesehatan (Healthkathon BPJS Kesehatan 2026). Faskes mengajukan klaim, verifikator BPJS menyetujui pertanyaan dari **kamus pengalaman**, lalu peserta JKN ditanya **satu pertanyaan per langkah**: setiap jawaban dievaluasi, skor diperbarui, dan AI memilih pertanyaan berikutnya atau berhenti. Keputusan tetap di tangan verifikator. Ketiga peran memakai catatan yang sama.

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
| **Faskes (Rumah Sakit)** | `#/faskes` | Daftar klaim faskes dengan status, formulir klaim terstruktur (peserta dari kepesertaan, SEP, DPJP, rawat, ICD-10 utama dan sekunder, ICD-9-CM, INA-CBG, tarif) dengan validasi, detail klaim, riwayat status, dan hasil keputusan. Faskes tidak melihat jawaban, skor, maupun alasan keputusan. |
| **Verifikator BPJS** | `#/verifikator` | Klaim masuk (dikelompokkan per langkah), ruang kerja klaim (data klaim + faskes + peserta, pemetaan kamus, pertanyaan, jawaban & bukti, keputusan, riwayat), kamus pengalaman (entri, versi pertanyaan, celah cakupan), draf AI, analitik AI, konfigurasi AI, log audit. |
| **Peserta JKN** | `#/peserta` | Beranda, notifikasi, ringkasan layanan (faskes, jenis rawat, periode; tanpa isi tagihan), FRISTA (simulasi), satu pertanyaan per langkah (tiap jawaban langsung tersimpan), berhenti kapan saja, tanda terima, riwayat jawaban. |

Alur utamanya (`Claim Submission → Validation → Claim Context → Generate Question → Collect Answer → Evaluate → Update Confidence → Stop or Continue → Verification Result → Verifier Review`):

1. **Klaim diajukan** faskes dan **divalidasi** (format kode, tanggal, peserta aktif, DPJP faskes, diagnosis sekunder, tanggal masuk setelah lahir) → tersimpan dan tertaut ke peserta, faskes, dan DPJP.
2. **Pemetaan kamus** otomatis: pertanyaan episode (menginap, lama rawat) untuk rawat inap; setiap baris tindakan dicocokkan (kode sama, kode induk, kemiripan nama; kesamaan kategori kode saja tanpa kata yang sama tidak dihitung) dengan skor relevansi.
3. **Konteks klaim** (`claimContextFor`): jenis rawat, malam, diagnosis, baris tindakan, tanpa identitas peserta. Inilah satu-satunya data klaim yang diterima AI.
4. **Usulan AI**: setiap pertanyaan kandidat mendapat *keyakinan AI* (peluang jawaban pasti); yang di atas ambang dicentang otomatis.
5. **Persiapan**: verifikator menyetujui hingga 10 pertanyaan (menyunting, menambah dari kamus, atau **Tanya AI**). Draf AI terpisah dari kamus sampai disetujui.
6. **Terbit**: suntingan menjadi versi baru; satu *putaran* mengunci versi persis. Menerbitkan ulang hanya bisa sebelum peserta memulai.
7. **FRISTA** cocok membuka **sesi adaptif** (tidak cocok dua kali atau tanpa kamera → telepon).
8. **Sesi**: AI memilih **satu** pertanyaan dari putaran; peserta menjawab; jawaban dicatat dengan waktu perintah, **dievaluasi dengan aturan** (Tabel 1 × keandalan = observabilitas entri), skor indikasi dan dukungan diperbarui, lalu aturan berhenti diperiksa sebelum AI memilih pertanyaan berikutnya. Pertanyaan yang tidak relevan setelah jawaban sebelumnya dilewati (mis. jumlah malam setelah "pulang di hari yang sama").
9. **Berhenti** bila indikasi mencapai ambang (bawaan 1,00: hanya penyangkalan "tidak pernah ke sana"), batas pertanyaan tercapai, tidak ada pertanyaan relevan, peserta berhenti, atau batas waktu 28 hari lewat. Jawaban yang sudah masuk tetap tersimpan.
10. **Hasil sesi**: Tabel 2 atas jawaban yang ditanyakan (penyangkalan dan pertentangan → *perlu diperiksa manusia*; semua netral → *bukti tidak cukup*; selain itu *konsisten*) beserta skor. "Tidak ingat" tidak pernah dianggap bantahan.
11. **Keputusan** verifikator (*sesuai / perlu tindak lanjut / tidak dapat disimpulkan*) wajib beralasan dan menyimpan **dasar evaluasi** saat itu (sesi, pembacaan bukti, skor, alasan berhenti). Faskes melihat hasil keputusannya.
12. **Analitik** dihitung ulang dari catatan yang sama, termasuk jumlah pertanyaan per sesi dan alasan berhenti.

Putaran yang tidak selesai dalam 28 hari ditutup oleh pekerjaan sistem (saat aplikasi dimuat dan pada setiap siklus sinkronisasi).

### Dua skor, dua arti

| Skor | Arti | Dasar | Dipakai untuk |
|---|---|---|---|
| Keyakinan AI (`Suggestion.aiConfidence`, `AiPick.predictedDefinite`) | Perkiraan peluang peserta memberi jawaban pasti untuk satu pertanyaan, sebelum ditanyakan | Simulasi: observabilitas × relevansi + jitter tetap | Mencentang dan memilih pertanyaan |
| Keandalan jawaban (`AnswerEvaluation.reliability`) | Seberapa banyak satu jawaban boleh dihitung | Observabilitas entri bila pasti; 0 bila "Tidak ingat" | Bobot per jawaban |
| Indikasi ketidaksesuaian (`VerificationScores.indication`) | Gabungan noisy-OR bobot jawaban bertentangan (menginap 0,8, lama rawat 0,4, tindakan 0,6 × keandalan); 1,00 hanya lewat penyangkalan | Aturan `aturan-evaluasi-v1` | Berhenti dan urutan antrean |
| Dukungan (`VerificationScores.support`) | Gabungan bobot jawaban yang mendukung | Aturan yang sama | Ditampilkan ke verifikator |

Skor indikasi **bukan probabilitas fraud yang tervalidasi** dan bukan keputusan; nilainya hanya mengurutkan pekerjaan dan menghentikan pertanyaan.

### Kontrak antarkomponen

| Komponen | Input | Proses | Output | Konsumen |
|---|---|---|---|---|
| Form faskes (`ClaimForm`) | `ClaimInput` | `validateClaimInput` (fungsi yang sama dengan perintah) | `Claim` | Verifikator, peserta, AI (via konteks) |
| Perintah klaim (`submitClaim`) | `ClaimInput` | Validasi, pemetaan, peringkat AI | `Claim`, `ClaimMapping[]`, `Suggestion[]` | Ruang kerja verifikator |
| AI `rank` | `RankRequest { claim: ClaimContext, candidates }` | Skor peluang jawaban pasti | `RankedQuestion[]` (divalidasi 0–1) | `Suggestion` |
| AI `next` | `NextQuestionRequest { claim, pool, history, scores, remaining }` | Memilih satu pertanyaan atau melewati yang tidak relevan | `NextQuestionResponse` (harus anggota putaran) | `ResponseSession.pending` |
| Evaluasi (`evaluateAnswer`, `combineScores`, `stopAfterAnswer`) | Opsi jawaban, entri, malam klaim | Aturan Tabel 1 + bobot | `AnswerEvaluation`, `VerificationScores`, `StopReason` | `Answer`, sesi |
| Sesi (`recordFrista`, `answerQuestion`) | `FristaResult`, `AnswerInput` | Satu transaksi per langkah; AI dipanggil di luar transaksi | `ResponseSession`, `Answer` | Verifikator, analitik |
| Keputusan (`decideClaim`) | `outcome`, `reason` | Validasi + salin `DecisionBasis` | `Claim.decision` | Faskes, analitik |

Contoh `Answer` tersimpan:

```json
{ "id": "ANS-0000227", "sessionId": "RSP-000089", "claimId": "KLM-000104", "assignmentId": "ASG-000102",
  "questionId": "QST-0005", "questionVersion": 3, "optionId": "BANTAH_1", "iteration": 4,
  "askedAt": "2026-10-21T12:05:00.000Z", "answeredAt": "2026-10-21T12:06:00.000Z",
  "pick": { "model": { "id": "sim-question-ai", "version": "1.0", "kind": "SIMULASI_DETERMINISTIK" }, "predictedDefinite": 0.79,
            "rationale": "Peluang jawaban pasti tertinggi (0,79) dari 1 pertanyaan tersisa." },
  "evaluation": { "rules": "aturan-evaluasi-v1", "strength": "BERTENTANGAN", "definite": true, "denial": false, "reliability": 0.88,
                  "indicationWeight": 0.53, "supportWeight": 0, "explanation": "Bertentangan dengan isi klaim; …" },
  "scoresAfter": { "indication": 0.53, "support": 0.99, "answered": 4, "definite": 4 } }
```

Bila AI gagal atau menjawab di luar kontrak (pertanyaan di luar putaran, skor di luar 0–1), tidak ada yang disimpan dan peserta dapat mencoba lagi pada pertanyaan yang sama.

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
| `suggestions` | Usulan AI per klaim: skor keyakinan, sumber (pemetaan kamus / draf AI), model, versi konfigurasi, tindakan verifikator | → klaim, versi pertanyaan, pemetaan |
| `selections` | Pilihan kerja verifikator (belum terbit) | → klaim, versi pertanyaan, usulan |
| `drafts` | Draf AI dengan konteks, alasan, suntingan, status | → klaim, entri/pertanyaan hasil |
| `assignments` | Putaran terbit: daftar `(pertanyaan, versi)` yang boleh ditanyakan AI | → klaim, peserta |
| `notifications` | Notifikasi peserta dari peristiwa nyata | → peserta, klaim, putaran |
| `fristaChecks` | Hasil FRISTA per percobaan | → putaran |
| `sessions` | Sesi adaptif: pertanyaan yang sedang ditanyakan, yang dilewati AI, alasan berhenti, versi konfigurasi | → putaran, FRISTA |
| `answers` | Jawaban per langkah: iterasi, alasan AI memilih, evaluasi aturan, skor sesudahnya | → sesi, putaran, versi pertanyaan |
| `aiConfig`, `aiConfigHistory` | Konfigurasi berversi (ambang relevansi, pilih otomatis, maks. pertanyaan, peringatan draf, ambang berhenti indikasi) | – |
| `audit` | Log setiap perubahan dari semua peran | → klaim (bila ada) |

Tidak ada agregat yang disimpan: semua angka analitik diturunkan dari koleksi di atas. Sumber kebenaran: klaim di `claims`; peserta di `participants`; teks pertanyaan di `questions[].versions`; evaluasi dan skor di `answers` (dihitung sekali saat jawaban masuk); hasil sesi di `sessions`; keputusan beserta dasarnya di `claims[].decision`. Skema saat ini versi 3; data versi lama harus di-reset.

## Penyimpanan

- **Lokal (`dev`/`preview`)**: plugin Vite `plugins/db-file-store.ts` melayani `/api/db` dan menulis `local-data/db.json` secara atomik; simpanan yang bentuknya bukan basis data versi saat ini ditolak (422). Setiap simpanan membawa nomor revisi; simpanan yang basi ditolak (409) lalu toko memuat ulang dan menerapkan ulang perubahannya. Tab lain mendapat pembaruan lewat `BroadcastChannel` dan pemeriksaan revisi berkala, jadi peran berbeda di tab berbeda selalu melihat data yang sama.
- **Hosting statis** (mis. GitHub Pages): tanpa server, data disimpan di `localStorage` peramban dengan aturan revisi yang sama.
- **Reset data** di bilah atas membuat ulang data simulasi.
- Setiap perintah (`src/application/commands.ts`) memvalidasi dulu, berjalan dalam satu transaksi, dan menulis log audit. Perintah yang gagal tidak menyimpan apa pun.

## AI (simulasi)

Semua akses AI melewati antarmuka `QuestionAi` (`src/ai/service.ts`). Implementasi saat ini, `simulatedAi`, deterministik dan tidak belajar; **tidak ada model bahasa atau API AI**:

- **`rank`**: skor dari observabilitas entri kamus, relevansi pemetaan, dan jitter tetap per klaim. Skor menyatakan satu peristiwa: *peluang peserta memberi jawaban pasti (bukan "Tidak ingat")*. Skor tidak pernah menyatakan keabsahan klaim.
- **`next`**: memilih pertanyaan berikutnya dari putaran yang disetujui verifikator: kehadiran dulu, lalu lama menginap (dilewati bila peserta tidak menginap), lalu tindakan dengan peluang jawaban pasti tertinggi, atau, setelah ada jawaban bertentangan, tindakan yang paling mudah dikenali untuk konfirmasi. AI tidak menulis kalimat baru saat sesi berjalan; hanya kalimat yang disetujui verifikator yang ditanyakan.
- **`draft` (Tanya AI)**: templat berisi deskripsi pengalaman dari katalog referensi (`src/ai/reference.ts`, belum divalidasi klinisi) dan pola jawaban dari entri kamus sejenis; kalimatnya menyesuaikan jenis rawat bila diminta dari klaim. Bila tidak ada deskripsi untuk kode itu, AI tidak mengarang detail.
- **Evaluasi jawaban bukan AI**: aturan di `src/domain/verification.ts`.
- Permintaan ke AI tidak memuat identitas peserta; daftar isinya (`AI_REQUEST_FIELDS`) tampil di Konfigurasi AI.
- Mengganti dengan layanan sungguhan cukup dengan implementasi `QuestionAi` lain (`kind: 'MODEL_EKSTERNAL'`); alur kerja memanggil AI di luar transaksi dan memvalidasi keluarannya sebelum menyimpan.

## Analitik

Halaman *Analitik AI* memisahkan **metrik teramati**, **konfigurasi** (ambang), dan **saran sistem** (aturan sederhana, untuk ditinjau). Isinya: volume dan alur klaim, cakupan kamus dan celahnya, statistik deskriptif keyakinan AI (n, rata-rata, median, SD, varians, persentil), keyakinan vs. tindakan verifikator, kalibrasi terhadap jawaban pasti (diagram dengan IK95% Wilson, Brier, ECE, Spearman dengan IK), penguji ambang (selisih proporsi dengan IK Newcombe), respons per pertanyaan dan versinya, asosiasi menurut asal kalimat / observabilitas / usia, kualitas data dan konsistensi jawaban, serta keputusan vs. pembacaan bukti.

Prinsipnya: setiap proporsi tampil dengan n dan interval 95%; di bawah n minimum (30 keseluruhan, 10 per kelompok) muncul *data belum cukup*; keyakinan AI dibedakan dari kepercayaan statistik dan dari hasil verifikasi; asosiasi tidak disajikan sebagai sebab-akibat; tidak ada ambang yang dinyatakan optimal.

## Data simulasi

- **Klaim historis**: 100 klaim dari `datasets/1_dataset_klaim_bpjs_sample_training.csv` (Juni 2026). Verifikasinya disimulasikan dengan menjalankan ulang perintah aplikasi yang sama dalam urutan waktu, sehingga data historis mengikuti aturan yang sama dengan penggunaan langsung. Kolom kebenaran dasar dataset hanya mengarahkan jawaban peserta simulasi dan tidak disimpan.
- **Kamus awal**: 10 entri dari `datasets/2_dataset_kamus_observabilitas_pertanyaan.csv` ditambah dua entri episode.
- **Kasus demo** (Oktober 2026): `KLM-000101` siap disiapkan, `KLM-000102` tanpa entri kamus untuk tindakan utamanya (Tanya AI), `KLM-000103` menunggu Budi Santoso memulai sesi, `KLM-000104` sesi selesai dengan satu pertentangan (indikasi 0,53). Peserta **Yohanes Situmorang** (kartu `0001234500059`) belum punya klaim, untuk mencoba alur dari awal.
- Nama orang, faskes, dokter, kode faskes, dan kode INA-CBG adalah fiktif.

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
- Dataset historis kecil (100 klaim, satu prosedur per klaim, empat minggu), jadi banyak rincian analitik menampilkan *data belum cukup*, dan putaran biasanya hanya 2–4 pertanyaan sehingga sesi jarang berhenti karena batas pertanyaan. Skor keyakinan simulasi lemah membedakan jawaban pasti dan itu ditampilkan apa adanya.
- Bobot evaluasi (0,8 / 0,4 / 0,6) dan skor indikasi adalah pilihan aturan simulasi, belum dikalibrasi terhadap hasil verifikasi nyata.
- Entri kamus dari draf AI belum punya penilaian observabilitas (memakai 0,55) dan belum ada layar untuk menilainya.
- Deskripsi pengalaman di katalog referensi dan kamus awal belum divalidasi klinisi.
