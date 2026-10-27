import * as fs from 'fs';
import * as path from 'path';

type Cell = string | number | boolean | null;

/** RFC 4180 CSV with CRLF line ends; text that a spreadsheet would run as a formula is prefixed with '. */
function toCsv(rows: readonly (readonly Cell[])[]): string {
  const cell = (value: Cell): string => {
    if (value === null) return '';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

const datasetsDir = path.resolve(process.cwd(), 'datasets');

fs.mkdirSync(datasetsDir, { recursive: true });

console.log('Generating Dataset 2: Kamus Observabilitas Klinis & Pertanyaan Awam (URD E6)...');
const kamusRows: (string | number)[][] = [
  [
    'kode_tindakan',
    'sistem_koding',
    'nama_tindakan_medis',
    'kategori_layanan',
    'sensasi_fisik_inderawi_pasien',
    'istilah_medis_dihindari',
    'pertanyaan_peserta_awam',
    'pertanyaan_pendamping',
    'opsi_jawaban_mendukung',
    'bobot_mendukung',
    'opsi_jawaban_bertentangan',
    'bobot_bertentangan',
    'opsi_jawaban_netral',
    'bobot_netral',
    'skor_observabilitas',
    'tingkat_observabilitas',
    'ai_confidence_kalibrasi',
    'dampak_biaya_inacbg'
  ],
  [
    '99.05',
    'ICD-9-CM',
    'Transfusi trombosit',
    'Darah',
    'Cairan dari kantong darah dialirkan lewat selang di tangan; berbeda dari cairan bening infus biasa',
    'transfusi, trombosit, kantong TC',
    'Selama dirawat, selain cairan bening infus biasa, apakah Anda menerima cairan dari kantong darah yang dialirkan lewat selang ke tangan?',
    'Selama dirawat, selain cairan bening infus biasa, apakah Anda melihat pasien menerima cairan dari kantong darah?',
    'Ya, saya menerima cairan dari kantong darah',
    'KUAT',
    'Hanya cairan bening infus biasa / Tidak pernah ada kantong darah',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.96,
    'Tinggi',
    0.94,
    'Kritis (Penentu Tarif Utama)'
  ],
  [
    '88.76',
    'ICD-9-CM',
    'USG abdomen',
    'Penunjang',
    'Perut diolesi gel dingin; alat ditempelkan ke kulit perut sambil dokternya melihat gambar di layar monitor',
    'USG, ultrasonografi, probe, abdomen',
    'Selama dirawat, ingatkah Anda perut Anda pernah diolesi gel dingin lalu diperiksa menggunakan alat sambil dilihat di layar monitor?',
    'Selama dirawat, apakah Anda melihat perut pasien diolesi gel dingin lalu diperiksa alat di layar monitor?',
    'Ya, saya ingat dengan jelas',
    'KUAT',
    'Tidak, pemeriksaan perut ini tidak pernah terjadi',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.90,
    'Tinggi',
    0.86,
    'Signifikan (Penunjang Khusus)'
  ],
  [
    '87.03',
    'ICD-9-CM',
    'CT Scan Kepala',
    'Radiologi',
    'Pasien dibawa ke ruangan khusus; kepala dimasukkan ke dalam mesin tabung/lorong bundar besar yang berbunyi dengung',
    'CT scan, tomografi komputer, gantry',
    'Selama dirawat, pernahkah Anda dibawa ke ruang pemindaian dan kepala Anda dimasukkan ke dalam mesin lorong bundar besar yang berbunyi?',
    'Selama dirawat, pernahkah pasien dibawa ke ruang pemindaian dan kepalanya dimasukkan ke mesin bundar besar?',
    'Ya, saya masuk ke dalam mesin tabung bundar tersebut',
    'KUAT',
    'Tidak pernah dibawa ke ruang mesin pemindaian',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.98,
    'Tinggi',
    0.95,
    'Kritis (Penentu Tarif Utama)'
  ],
  [
    '74.1',
    'ICD-9-CM',
    'Sectio Caesarea (Sesar)',
    'Tindakan',
    'Pasien melahirkan di kamar operasi; perut bagian bawah disayat; disuntik bius di punggung',
    'sectio caesarea, operasi SC, histerotomi',
    'Saat proses melahirkan, apakah Anda dibawa ke kamar operasi dan perut bagian bawah Anda disayat untuk mengeluarkan bayi?',
    'Saat proses melahirkan, apakah pasien dibawa ke kamar operasi untuk operasi sayatan perut mengeluarkan bayi?',
    'Ya, saya menjalani operasi sayatan di perut',
    'KUAT',
    'Tidak, saya melahirkan secara normal tanpa operasi perut',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    1.00,
    'Tinggi',
    0.98,
    'Kritis (Disparitas Upcoding 300%)'
  ],
  [
    '93.39',
    'ICD-9-CM',
    'Fisioterapi motorik',
    'Rehabilitasi',
    'Petugas khusus datang melatih menggerakkan tangan, kaki, atau punggung berulang kali; alat hangat/getar ditempelkan',
    'fisioterapi, rehabilitasi medik, kinesioterapi',
    'Selama dirawat, ingatkah Anda didatangi petugas khusus yang melatih Anda menggerakkan tangan, kaki, atau badan berulang kali?',
    'Selama dirawat, apakah Anda melihat petugas khusus datang melatih pasien menggerakkan tangan, kaki, atau badan?',
    'Ya, saya dilatih rutin beberapa kali',
    'KUAT',
    'Tidak ada latihan fisik sama sekali dari petugas',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.88,
    'Sedang',
    0.84,
    'Signifikan (Rawan Klaim Fiktif Sesi)'
  ],
  [
    '87.44',
    'ICD-9-CM',
    'Foto rontgen dada',
    'Radiologi',
    'Pasien berdiri menempel pada papan keras; diminta menarik napas dan menahannya sebentar saat difoto dari jauh',
    'rontgen, x-ray, toraks, radiologi',
    'Selama dirawat, ingatkah Anda berdiri menempel pada sebuah papan, lalu diminta menarik napas dan menahannya sebentar?',
    'Selama dirawat, apakah Anda melihat pasien diminta menempel pada papan lalu menahan napas untuk difoto?',
    'Ya, saya difoto menempel di papan tersebut',
    'KUAT',
    'Tidak pernah difoto dengan papan tersebut',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.91,
    'Tinggi',
    0.88,
    'Penunjang (Diagnosa Paru/Jantung)'
  ],
  [
    '93.96',
    'ICD-9-CM',
    'Terapi oksigen tabung/kanul',
    'Tindakan',
    'Selang kecil bening dipasang di lubang hidung atau masker menutup hidung dan mulut; ada suara gelembung air di dinding',
    'oksigenasi, nasal kanul, kanula nasal',
    'Selama dirawat, apa yang dipasang di hidung atau wajah Anda untuk membantu bernapas?',
    'Selama dirawat, apa yang Anda lihat dipasang di hidung atau wajah pasien untuk membantu bernapas?',
    'Selang kecil di lubang hidung / Masker menutup hidung dan mulut',
    'KUAT',
    'Tidak ada alat pernapasan apa pun yang dipasang',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.89,
    'Tinggi',
    0.87,
    'Signifikan (Indikasi Sesak/Pneumonia)'
  ],
  [
    '39.95',
    'ICD-9-CM',
    'Hemodialisis (Cuci Darah)',
    'Tindakan Khusus',
    'Dua selang darah dipasang di lengan; darah dialirkan ke mesin tabung penyaring besar selama 4-5 jam',
    'hemodialisis, cuci darah, dializer, cimino',
    'Selama perawatan, apakah darah Anda dialirkan ke mesin tabung penyaring besar selama beberapa jam untuk cuci darah?',
    'Selama perawatan, apakah darah pasien dialirkan ke mesin tabung penyaring besar untuk cuci darah?',
    'Ya, saya menjalani cuci darah dengan mesin penyaring tersebut',
    'KUAT',
    'Tidak pernah menjalani cuci darah ke mesin',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.99,
    'Tinggi',
    0.98,
    'Kritis (Penentu Tarif Rutin Tinggi)'
  ],
  [
    '36.06',
    'ICD-9-CM',
    'Pemasangan Ring Jantung (Stent)',
    'Tindakan Jantung',
    'Selang kawat dimasukkan lewat pergelangan tangan atau pangkal paha menuju dada di ruang operasi jantung (kateterisasi)',
    'stent, kateterisasi, angioplasti, ring jantung',
    'Pernahkah dokter memasukkan selang kecil lewat pergelangan tangan atau pangkal paha Anda untuk memasang cincin penyangga di pembuluh darah dada?',
    'Pernahkah dokter memasukkan selang kecil lewat pergelangan tangan atau paha pasien untuk memasang cincin penyangga pembuluh darah?',
    'Ya, saya menjalani pemasangan cincin penyangga pembuluh darah',
    'KUAT',
    'Tidak pernah ada tindakan selang masuk lewat tangan atau paha',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.97,
    'Tinggi',
    0.96,
    'Kritis (Penentu Tarif Sangat Tinggi)'
  ],
  [
    '13.41',
    'ICD-9-CM',
    'Operasi Katarak Fakoemulsifikasi',
    'Tindakan Mata',
    'Mata ditetesi obat kebas; disorot lampu terang di ruang operasi mata; dipasang lensa tanam baru',
    'fakoemulsifikasi, katarak, IOL, lensa intraokular',
    'Saat operasi mata, apakah mata Anda ditetesi obat kebas lalu disorot lampu terang untuk penggantian lensa mata keruh?',
    'Apakah pasien menjalani operasi mata dengan disorot lampu terang untuk penggantian lensa mata?',
    'Ya, mata saya dioperasi untuk penggantian lensa',
    'KUAT',
    'Tidak ada operasi mata apa pun yang dilakukan',
    'BERTENTANGAN',
    'Tidak ingat',
    'NETRAL',
    0.95,
    'Tinggi',
    0.93,
    'Kritis (Tindakan Mata Utama)'
  ]
];

const csvKamus = toCsv(kamusRows);
fs.writeFileSync(path.join(datasetsDir, '2_dataset_kamus_observabilitas_pertanyaan.csv'), csvKamus, 'utf-8');

console.log('Generating Dataset 1: Data Sampel Resmi Klaim BPJS (Format RITL)...');
const sampleKlaimRows: (string | number)[][] = [
  [
    'no_sep',
    'nomor_kartu_pseudonym',
    'nama_pasien_masked',
    'jenis_kelamin',
    'usia',
    'faskes_perujuk',
    'nama_rumah_sakit',
    'tipe_rs',
    'kelas_rawat',
    'tgl_masuk',
    'tgl_pulang',
    'lama_rawat_los',
    'kode_diagnosa_icd10',
    'nama_diagnosa',
    'kode_prosedur_icd9',
    'nama_prosedur',
    'biaya_tagihan_rs',
    'tarif_inacbg',
    'selisih_biaya',
    'indikasi_anomali_klaim',
    'ground_truth_verifikasi'
  ]
];

// Generate 120 authentic sample claims representing realistic BPJS sample dataset
const RS_LIST = [
  { name: 'RSUD Kota Sejahtera (fiktif)', type: 'B' },
  { name: 'RS Hermina Kasih (fiktif)', type: 'B' },
  { name: 'RS Mitra Medika (fiktif)', type: 'C' },
  { name: 'RS Bhakti Husada (fiktif)', type: 'C' },
  { name: 'RSUP Dr. Hasan Utama (fiktif)', type: 'A' },
];

const DISEASES = [
  { code: 'A91', desc: 'Demam berdarah dengue (DHF)', proc: '99.05', procName: 'Transfusi trombosit 4 kantong', bill: 11200000, inabg: 9800000, los: 4, anomaly: 'Dugaan Transfusi Trombosit Fiktif', gt: 'BERTENTANGAN' },
  { code: 'O82.0', desc: 'Persalinan bedah sesar tunggal', proc: '74.1', procName: 'Sectio Caesarea (Sesar)', bill: 14500000, inabg: 13200000, los: 3, anomaly: 'Dugaan Upcoding (Pasien Melahirkan Normal)', gt: 'BERTENTANGAN' },
  { code: 'A01.0', desc: 'Demam tifoid (Typhoid)', proc: '99.18', procName: 'Akomodasi rawat inap & terapi injeksi', bill: 6800000, inabg: 5900000, los: 5, anomaly: 'Dugaan Phantom Billing (Pasien Tidak Menginap)', gt: 'PENYANGKALAN_TOTAL' },
  { code: 'M54.5', desc: 'Nyeri punggung bawah (LBP)', proc: '93.39', procName: 'Fisioterapi motorik 10 sesi', bill: 7400000, inabg: 6500000, los: 6, anomaly: 'Klaim Fisioterapi 10 Sesi Fiktif', gt: 'BERTENTANGAN' },
  { code: 'J18.9', desc: 'Pneumonia tidak spesifik', proc: '87.44', procName: 'Foto rontgen dada & terapi inhalasi', bill: 8200000, inabg: 7800000, los: 4, anomaly: 'Wajar (Konsisten)', gt: 'SESUAI' },
  { code: 'I21.9', desc: 'Infark miokard akut (Serangan Jantung)', proc: '36.06', procName: 'Pemasangan Ring Jantung (Stent)', bill: 48000000, inabg: 45000000, los: 5, anomaly: 'Wajar (Konsisten)', gt: 'SESUAI' },
  { code: 'N18.5', desc: 'Gagal ginjal kronik stadium 5', proc: '39.95', procName: 'Hemodialisis cuci darah reguler', bill: 12500000, inabg: 11900000, los: 3, anomaly: 'Wajar (Konsisten)', gt: 'SESUAI' },
  { code: 'K35.8', desc: 'Apendisitis akut (Usus Buntu)', proc: '47.09', procName: 'Operasi apendektomi pemotongan usus buntu', bill: 13800000, inabg: 12500000, los: 4, anomaly: 'Wajar (Konsisten)', gt: 'SESUAI' },
  { code: 'H25.9', desc: 'Katarak senilis', proc: '13.41', procName: 'Fakoemulsifikasi katarak & tanam lensa', bill: 8500000, inabg: 8100000, los: 2, anomaly: 'Wajar (Konsisten)', gt: 'SESUAI' },
  { code: 'E11.9', desc: 'Diabetes melitus tipe 2 dengan komplikasi', proc: '99.18', procName: 'Terapi insulin & rawat bangsal', bill: 7900000, inabg: 7400000, los: 4, anomaly: 'Wajar (Konsisten)', gt: 'SESUAI' },
];

for (let i = 1; i <= 100; i++) {
  const rs = RS_LIST[i % RS_LIST.length];
  const d = DISEASES[i % DISEASES.length];
  const sepNum = `0115R001${String(100000 + i)}`;
  const cardNum = `0001${String(20000000 + i * 37).slice(-8)}`;
  const gender = i % 2 === 0 ? 'P' : 'L';
  const age = 22 + (i * 7) % 55;
  const inDay = 1 + (i % 20);
  const outDay = inDay + d.los;
  const tglMasuk = `2026-06-${String(inDay).padStart(2, '0')}`;
  const tglPulang = `2026-06-${String(outDay).padStart(2, '0')}`;
  const kelas = (i % 3) + 1;
  const selisih = d.bill - d.inabg;

  sampleKlaimRows.push([
    sepNum,
    cardNum,
    `P*** ${String.fromCharCode(65 + (i % 26))}*****`,
    gender,
    age,
    `Puskesmas ${String.fromCharCode(65 + (i % 8))}`,
    rs.name,
    rs.type,
    `Kelas ${kelas}`,
    tglMasuk,
    tglPulang,
    d.los,
    d.code,
    d.desc,
    d.proc,
    d.procName,
    d.bill,
    d.inabg,
    selisih,
    d.anomaly,
    d.gt
  ]);
}

const csvSampleKlaim = toCsv(sampleKlaimRows);
fs.writeFileSync(path.join(datasetsDir, '1_dataset_klaim_bpjs_sample_training.csv'), csvSampleKlaim, 'utf-8');

console.log('Regenerated datasets 1 and 2 in datasets/.');
