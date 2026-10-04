# JKN Service: Verifikasi Klaim Dua Sumber
### *Solusi Efisiensi Risiko Pelayanan Kesehatan Program JKN*
**Healthkathon BPJS Kesehatan 2026**

---

## 📌 Ringkasan Eksekutif
**JKN Service** adalah sistem verifikasi klaim dua sumber independen yang menggabungkan:
1. **Sumber 1**: Dokumen klaim rumah sakit (E-Klaim INA-CBG & Resume Medis).
2. **Sumber 2**: Pengalaman langsung pasien sebagai saksi independen yang hadir saat layanan diberikan.

### Masalah Utama yang Diselesaikan:
- **Dokumen fiktif tetap rapi**: Selama ini verifikasi klaim hanya memeriksa dokumen yang diterbitkan oleh pihak yang menagih (Faskes).
- **Rp 866 Miliar** dugaan kecurangan dicegah BPJS Kesehatan (2023).
- **0 Pasien yang ditanya**: Kasus 4.341 klaim ditagih 3 RS padahal rekam medis hanya ±1.000 kasus (temuan tim gabungan KPK-Kemenkes-BPJS-BPKP).

---

## 🚀 Fitur Utama MVP JKN Service


### 1. AI Information Gain Planner (Peta Keteramatan)
- Menerjemahkan kode klinis (ICD-10, ICD-9-CM, BMHP) menjadi bahasa sensorik pasien (contoh: `93.94 Nebulizer` → *"diuap"*, `LOS 4 hari` → *"berapa malam menginap"*).
- Menghitung **Information Gain** (bit ketidakpastian) untuk memilih **maksimal 5 pertanyaan paling informatif**.
- Mengabaikan tindakan yang tidak membedakan (contoh: *Infus cairan* dilewati karena >98% pasien rawat inap diinfus, info gain = 0.02 bit).
- Menghindari risiko halusinasi klinis: AI bekerja di balik layar memilih templat baku tervalidasi klinis (*MediQ, NeurIPS 2024*).
- Menyisipkan item pengecoh (*distractors*) untuk mendeteksi *yea-saying bias*.

### 2. Pengalaman Pasien di Mobile JKN & FRISTA
- Alur ramah pengguna: **1 pertanyaan per layar**, estimasi waktu pengisian ±2 menit.
- **FRISTA BPJS Face Liveness Check**: Verifikasi wajah biometrik terenkripsi (pilihan webcam nyata atau simulasi liveness).
- Pilihan *"Saya pendamping pasien"* jika pasien anak atau lansia.
- **Percabangan Adaptif**: Jika terjadi diskrepansi lama rawat (klaim 4 hari vs pasien ingat 1 malam), sistem memunculkan pertanyaan klarifikasi dinamis (*"Apakah sempat pulang lalu dirawat lagi?"*).
- Jika pasien menyatakan *"Tidak pernah dirawat sama sekali"*, sistem memotong alur dan langsung mengaktifkan jalur cepat eskalasi dugaan *Phantom Billing*.

### 3. Penimbangan Bukti Bayesian & Skor 4 Dimensi
Bukan sekadar satu angka scalar bias, melainkan skor 4 dimensi yang transparan:
1. **Konsistensi Klaim (0–100)**: Probabilitas posterior keabsahan klaim berdasarkan Likelihood Ratio Bayes.
2. **Cakupan Bukti (X/Y)**: Jumlah fakta klaim yang terkonfirmasi oleh saksi.
3. **Kontradiksi Material**: Jumlah sanggahan kritis (lama rawat, tindakan fiktif).
4. **Keandalan Ingatan (Tinggi/Sedang/Rendah)**: Dihitung dari jeda hari sejak pulang dan lolos/gagalnya uji pengecoh.

### 4. Decision Support Verifikator & Tim PK-JKN
- Rekomendasi verifikator yang *explainable*:
  - *Terverifikasi Selaras Otomatis* (Klaim bersih)
  - *Tinjauan Manusia Direkomendasikan* (Perbedaan persepsi / Prolonged stay)
  - *Prioritas Tinggi: Dugaan Fraud Kritis* (Phantom billing)
- Tombol aksi verifikator: **Minta resume medis bangsal**, **Tandai sesuai**, atau **Eskalasi ke Tim PK-JKN**.

### 5. Profil Risiko Fasilitas Kesehatan
- Agregasi diskordansi tingkat faskes untuk mencegah salah tuduh pada RS jujur.
- Estimasi potensi penghematan dana jaminan sosial kesehatan (Rp Miliar).
- Efek gentar (*deterrence effect*) aktif bagi oknum faskes.

### 6. Kepatuhan Privasi (UU PDP No. 27/2022) & Permenkes 16/2019
- **Pseudonimisasi**: Nama dan nomor kartu disamarkan (`B*** S****`).
- **Zero Raw Biometric Storage**: Foto wajah tidak disimpan di database, hanya token hasil pencocokan.
- **Audit Trail SHA-256**: Jejak audit mutlak untuk setiap inferensi dan keputusan verifikator.

---

## 🛠️ Cara Menjalankan Aplikasi

Pastikan Node.js (v18+) telah terpasang di komputer Anda.

```bash
# 1. Masuk ke direktori proyek
cd D:\project\selaras-bpjs

# 2. Jalankan development server
npm run dev
```

Buka browser Anda di `http://localhost:5173`.

Untuk membangun bundle produksi:
```bash
npm run build
npm run preview
```

---

## 🎯 Panduan Live Demo untuk Juri Hackathon
Gunakan tombol navigasi di bagian atas:
1. **Mode Live Split**:
   - Di sebelah kiri: **Portal Verifikator BPJS**.
   - Di sebelah kanan: **Simulator Ponsel Mobile JKN**.
   - Pilih skenario `KLM-DEMO-0427` (Kasus Pneumonia di slide PPT).
   - Di sisi Mobile JKN, selesaikan cek wajah FRISTA, pilih jawaban *1 malam*, jawab pertanyaan klarifikasi, dan pilih checklist tindakan.
   - Perhatikan bahwa di sisi Verifikator sebelah kiri, skor **86/100**, kontradiksi material **1 (lama rawat)**, dan rasio bukti Bayes langsung diperbarui secara interaktif!
2. **Pilih Skenario Lainnya**:
   - `KLM-DEMO-0812`: Kasus Phantom Billing Katarak (Peserta menyatakan tidak pernah dirawat/operasi).
   - `KLM-DEMO-0199`: Kasus Bersih DBD (Skor 98/100, langsung disetujui otomatis).
   - `+ Tambah Klaim`: Uji AI Planner pada klaim buatan sendiri secara dinamis.
3. **Klik Tombol "Riset & Dalil"**:
   - Menampilkan sitasi resmi *Zuvekas & Olin (2009)*, *MediQ NeurIPS 2024*, rumus Bayesian Likelihood, dan UU PDP 27/2022.

---

*JKN Service — Efisiensi Risiko JKN melalui Verifikasi Dua Sumber Cerdas & Beretika.*
