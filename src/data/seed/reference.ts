import type { ActorRef, AiConfig, DictionaryEntry, Facility, Practitioner, Question } from '../../domain/types';
import { parseCsv } from '../../lib/csv';
import kamusCsv from '../../../datasets/2_dataset_kamus_observabilitas_pertanyaan.csv?raw';

// Reference records of the simulation. Hospital names follow the claims dataset (one renamed so no
// real hospital brand appears); all codes, people and doctors are synthetic.

export const SEED_EPOCH = '2026-05-02T02:00:00.000Z';

export const VERIFIER: ActorRef = { role: 'VERIFIKATOR', id: 'VRF-01', name: 'Verifikator KC Kota Contoh (simulasi)' };
export const DICTIONARY_PANEL: ActorRef = { role: 'SISTEM', id: 'PANEL-KAMUS', name: 'Panel kamus pengalaman (simulasi)' };

/** Dataset hospital name → facility record. */
export const FACILITIES: (Facility & { datasetName: string })[] = [
  { id: 'FKS-01', code: '0115R001', name: 'RS Kasih Harapan (fiktif)', datasetName: 'RS Hermina Kasih (fiktif)', hospitalClass: 'B', ownership: 'SWASTA', city: 'Kota Contoh' },
  { id: 'FKS-02', code: '0115R002', name: 'RS Mitra Medika (fiktif)', datasetName: 'RS Mitra Medika (fiktif)', hospitalClass: 'C', ownership: 'SWASTA', city: 'Kabupaten Contoh' },
  { id: 'FKS-03', code: '0115R003', name: 'RS Bhakti Husada (fiktif)', datasetName: 'RS Bhakti Husada (fiktif)', hospitalClass: 'C', ownership: 'SWASTA', city: 'Kota Contoh' },
  { id: 'FKS-04', code: '0115R004', name: 'RSUP Dr. Hasan Utama (fiktif)', datasetName: 'RSUP Dr. Hasan Utama (fiktif)', hospitalClass: 'A', ownership: 'PEMERINTAH', city: 'Kota Contoh' },
  { id: 'FKS-05', code: '0115R005', name: 'RSUD Kota Sejahtera (fiktif)', datasetName: 'RSUD Kota Sejahtera (fiktif)', hospitalClass: 'B', ownership: 'PEMERINTAH', city: 'Kota Sejahtera' },
];

export const SPECIALTIES = [
  { code: 'Sp.PD', name: 'Penyakit Dalam' },
  { code: 'Sp.OG', name: 'Obstetri & Ginekologi' },
  { code: 'Sp.B', name: 'Bedah' },
  { code: 'Sp.JP', name: 'Jantung & Pembuluh Darah' },
  { code: 'Sp.M', name: 'Mata' },
  { code: 'Sp.KFR', name: 'Kedokteran Fisik & Rehabilitasi' },
  { code: 'Sp.P', name: 'Paru' },
] as const;

const DOCTOR_NAMES = [
  'Andi Pratama', 'Budi Wicaksono', 'Citra Maharani', 'Dian Permata', 'Eka Saputra', 'Farida Hanum', 'Gilang Ramadhan',
  'Hesti Wulandari', 'Imam Syafii', 'Joko Susilo', 'Kartika Sari', 'Lukman Hakim', 'Melati Anggraini', 'Nanda Prasetyo',
  'Oktaviani Putri', 'Putu Adi', 'Qori Amalia', 'Rizky Fauzan', 'Sinta Dewi', 'Taufik Hidayat', 'Umi Kalsum',
  'Vina Lestari', 'Wahyu Nugraha', 'Yogi Firmansyah', 'Zahra Aulia', 'Arif Rahman', 'Bella Safitri', 'Candra Kirana',
  'Dimas Anggara', 'Erlina Sari', 'Fikri Maulana', 'Gita Puspita', 'Hadi Santoso', 'Indra Kusuma', 'Juwita Ningsih',
];

export const PRACTITIONERS: Practitioner[] = FACILITIES.flatMap((f, fi) =>
  SPECIALTIES.map((s, si) => ({
    id: `DPJP-${String(fi * SPECIALTIES.length + si + 1).padStart(3, '0')}`,
    facilityId: f.id,
    name: `dr. ${DOCTOR_NAMES[fi * SPECIALTIES.length + si]}, ${s.code}`,
    specialty: s.name,
  })),
);

export const DIAGNOSIS_SPECIALTY: Record<string, string> = {
  A91: 'Sp.PD', 'A01.0': 'Sp.PD', 'N18.5': 'Sp.PD', 'E11.9': 'Sp.PD', I10: 'Sp.PD', 'L03.1': 'Sp.PD',
  'O82.0': 'Sp.OG', 'M54.5': 'Sp.KFR', 'J18.9': 'Sp.P', 'J45.9': 'Sp.P', 'I21.9': 'Sp.JP', 'I20.0': 'Sp.JP', 'K35.8': 'Sp.B', 'H25.9': 'Sp.M',
};

export function practitionerFor(facilityId: string, diagnosisCode: string): Practitioner {
  const code = DIAGNOSIS_SPECIALTY[diagnosisCode] ?? 'Sp.PD';
  const specialty = SPECIALTIES.find((s) => s.code === code)!.name;
  return PRACTITIONERS.find((p) => p.facilityId === facilityId && p.specialty === specialty)!;
}

/** Synthetic INA-CBG group per diagnosis (format only; not an official grouping). */
export const INA_CBG: Record<string, string> = {
  A91: 'A-4-14-I', 'A01.0': 'A-4-13-I', 'O82.0': 'O-6-10-I', 'M54.5': 'M-4-17-I', 'J18.9': 'J-4-16-I', 'I21.9': 'I-4-12-II',
  'N18.5': 'N-4-10-II', 'K35.8': 'K-1-12-I', 'H25.9': 'H-1-30-I', 'E11.9': 'E-4-10-I',
};

export const INITIAL_AI_CONFIG: AiConfig = {
  version: 1,
  mappingThreshold: 0.5,
  autoSelectThreshold: 0.6,
  maxQuestions: 5,
  draftWarningThreshold: 0.5,
  stopIndicationThreshold: 1,
  updatedAt: SEED_EPOCH,
  updatedBy: DICTIONARY_PANEL,
};

function splitList(text: string, sep: RegExp): string[] {
  return text.split(sep).map((s) => s.trim()).filter(Boolean);
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The initial experience dictionary: two episode entries plus every row of the observability
 * dictionary dataset. Terms listed as "avoid" but used in the entry's own approved wording are treated
 * as lay terms for that entry.
 */
export function initialDictionary(): { entries: DictionaryEntry[]; questions: Question[] } {
  const entries: DictionaryEntry[] = [
    {
      id: 'KMS-EP01', scope: 'EPISODE', topic: 'KEBERADAAN', code: null, name: 'Keberadaan rawat inap', category: 'Episode',
      experiences: ['Menginap dan tidur di ranjang rumah sakit', 'Dirawat di bangsal setidaknya satu malam'],
      avoidTerms: ['rawat inap', 'admisi', 'opname'], observability: 0.97, source: 'KAMUS_AWAL', aiDraftId: null, createdAt: SEED_EPOCH, status: 'AKTIF',
    },
    {
      id: 'KMS-EP02', scope: 'EPISODE', topic: 'LAMA_RAWAT', code: null, name: 'Lama menginap', category: 'Episode',
      experiences: ['Jumlah malam tidur di rumah sakit'],
      avoidTerms: ['length of stay', 'LOS', 'lama rawat'], observability: 0.85, source: 'KAMUS_AWAL', aiDraftId: null, createdAt: SEED_EPOCH, status: 'AKTIF',
    },
  ];
  const v1 = { version: 1, origin: 'KAMUS_AWAL' as const, aiDraftId: null, basedOnVersion: null, createdAt: SEED_EPOCH, createdBy: DICTIONARY_PANEL, note: 'Kamus awal (simulasi)' };
  const questions: Question[] = [
    {
      id: 'QST-EP01', entryId: 'KMS-EP01', status: 'AKTIF',
      versions: [{
        ...v1,
        text: 'Apa yang Anda ingat tentang kunjungan Anda ke {faskes} pada {periode}?',
        options: [
          { id: 'DIRAWAT_MENGINAP', label: 'Saya dirawat dan menginap', mapping: { kind: 'TETAP', strength: 'KUAT' } },
          { id: 'PULANG_HARI_ITU', label: 'Saya datang, lalu pulang di hari yang sama', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' } },
          { id: 'TIDAK_PERNAH', label: 'Saya tidak pernah ke sana', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, denial: true },
          { id: 'TIDAK_INGAT', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, unsure: true },
        ],
      }],
    },
    {
      id: 'QST-EP02', entryId: 'KMS-EP02', status: 'AKTIF',
      versions: [{
        ...v1,
        text: 'Berapa malam Anda menginap di rumah sakit saat itu?',
        options: [
          { id: 'N1', label: '1 malam', mapping: { kind: 'RENTANG_MALAM', min: 1, max: 1 } },
          { id: 'N2_3', label: '2–3 malam', mapping: { kind: 'RENTANG_MALAM', min: 2, max: 3 } },
          { id: 'N4_7', label: '4–7 malam', mapping: { kind: 'RENTANG_MALAM', min: 4, max: 7 } },
          { id: 'N8P', label: 'Lebih dari 7 malam', mapping: { kind: 'RENTANG_MALAM', min: 8, max: null } },
          { id: 'TIDAK_INGAT', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, unsure: true },
        ],
      }],
    },
  ];

  parseCsv(kamusCsv).forEach((row, i) => {
    const n = String(i + 1).padStart(4, '0');
    const text = row.pertanyaan_peserta_awam;
    const support = splitList(row.opsi_jawaban_mendukung, /\s+\/\s+/);
    const contra = splitList(row.opsi_jawaban_bertentangan, /\s+\/\s+/);
    const options = [
      ...support.map((label, k) => ({ id: `DUKUNG_${k + 1}`, label: sentence(label), mapping: { kind: 'TETAP' as const, strength: (row.bobot_mendukung || 'KUAT') as 'KUAT' } })),
      ...contra.map((label, k) => ({ id: `BANTAH_${k + 1}`, label: sentence(label), mapping: { kind: 'TETAP' as const, strength: 'BERTENTANGAN' as const } })),
      { id: 'TIDAK_INGAT', label: row.opsi_jawaban_netral || 'Tidak ingat', mapping: { kind: 'TETAP' as const, strength: 'NETRAL' as const }, unsure: true },
    ];
    const wording = [text, ...options.map((o) => o.label)].join(' ').toLowerCase();
    entries.push({
      id: `KMS-${n}`,
      scope: 'PROSEDUR',
      topic: null,
      code: row.kode_tindakan,
      name: row.nama_tindakan_medis,
      category: row.kategori_layanan,
      experiences: splitList(row.sensasi_fisik_inderawi_pasien, /;\s*/).map(sentence),
      avoidTerms: splitList(row.istilah_medis_dihindari, /,\s*/).filter((t) => !wording.includes(t.toLowerCase())),
      observability: Number(row.skor_observabilitas),
      source: 'KAMUS_AWAL',
      aiDraftId: null,
      createdAt: SEED_EPOCH,
      status: 'AKTIF',
    });
    questions.push({ id: `QST-${n}`, entryId: `KMS-${n}`, status: 'AKTIF', versions: [{ ...v1, text, options }] });
  });
  return { entries, questions };
}
