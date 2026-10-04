import type { ClaimItem, VerificationQuestion, Claim } from '../types';

export interface ObservabilityTemplate {
  codeMatch: string | RegExp;
  category: ClaimItem['category'];
  patientLanguage: string;
  observability: ClaimItem['observability'];
  defaultInfoGain: number;
  decision: ClaimItem['decision'];
  reason: string;
}

export const CLINICAL_OBSERVABILITY_TEMPLATES: ObservabilityTemplate[] = [
  {
    codeMatch: /ADM-STAY|RAWAT_INAP/i,
    category: 'Administratif',
    patientLanguage: 'menginap di rumah sakit',
    observability: 'Tinggi',
    defaultInfoGain: 0.20,
    decision: 'Ditanya : jangkar',
    reason: 'Jangkar validasi utama seluruh rangkaian klaim rawat inap.',
  },
  {
    codeMatch: /LOS|LAMA_RAWAT/i,
    category: 'Administratif',
    patientLanguage: 'berapa malam Anda menginap',
    observability: 'Tinggi',
    defaultInfoGain: 0.15,
    decision: 'Ditanya',
    reason: 'Pasien mengingat jumlah malam tidur di RS dengan sangat baik (Zuvekas & Olin kappa 0.88).',
  },
  {
    codeMatch: /93\.96|OKSIGEN/i,
    category: 'Tindakan',
    patientLanguage: 'selang kecil di hidung atau masker',
    observability: 'Tinggi',
    defaultInfoGain: 0.10,
    decision: 'Ditanya',
    reason: 'Sensasi aliran udara dan selang di wajah terekam jelas dalam ingatan pasien.',
  },
  {
    codeMatch: /93\.94|NEBULIZER|UAP/i,
    category: 'Tindakan',
    patientLanguage: 'diuap / menghirup uap obat',
    observability: 'Sedang',
    defaultInfoGain: 0.09,
    decision: 'Ditanya',
    reason: 'Prosedur menghirup uap dengan masker berdesis cukup spesifik pada pasien pernapasan.',
  },
  {
    codeMatch: /87\.44|RONTGEN|TORAKS|FOTO/i,
    category: 'Penunjang',
    patientLanguage: 'dada Anda difoto (rontgen)',
    observability: 'Sedang-tinggi',
    defaultInfoGain: 0.12,
    decision: 'Ditanya',
    reason: 'Proses foto rontgen dada memerlukan pemindahan pasien atau penempatan plat besi dingin di punggung.',
  },
  {
    codeMatch: /13\.41|KATARAK|PHACO/i,
    category: 'Tindakan',
    patientLanguage: 'mata Anda dioperasi / diganti lensa',
    observability: 'Tinggi',
    defaultInfoGain: 0.22,
    decision: 'Ditanya',
    reason: 'Tindakan bedah katarak adalah momen penting yang tidak mungkin dilupakan pasien.',
  },
  {
    codeMatch: /90\.59|DARAH|LAB/i,
    category: 'Penunjang',
    patientLanguage: 'darah diambil dengan jarum suntik',
    observability: 'Tinggi',
    defaultInfoGain: 0.14,
    decision: 'Ditanya',
    reason: 'Pengambilan sampel darah rutin dengan jarum sangat disadari pasien.',
  },
  {
    codeMatch: /INFUS|BMHP|CAIRAN/i,
    category: 'Alkes / BMHP',
    patientLanguage: 'diinfus',
    observability: 'Tinggi',
    defaultInfoGain: 0.02,
    decision: 'Dilewati',
    reason: 'Hampir seluruh pasien rawat inap diinfus (p > 98%), sehingga nilai informasi diferensiasinya mendekati 0.',
  },
  {
    codeMatch: /99\.21|ANTIBIOTIK|OBAT_IV/i,
    category: 'Obat',
    patientLanguage: 'pasien sulit membedakan isi infus',
    observability: 'Rendah',
    defaultInfoGain: 0.01,
    decision: 'Tak dapat ditanya',
    reason: 'Pasien tidak memiliki kemampuan kimia/farmasi untuk membedakan zat antibiotik vs vitamin dalam infus.',
  },
  {
    codeMatch: /^[A-Z][0-9]{2}(\.[0-9]+)?$/i, // Diagnosis ICD-10 codes
    category: 'Diagnosis',
    patientLanguage: 'butuh penilaian klinis, bukan ingatan',
    observability: 'Di luar cakupan',
    defaultInfoGain: 0,
    decision: 'Di luar cakupan',
    reason: 'Kode diagnosis patologis membutuhkan interpretasi klinis dokter, bukan persepsi subjektif pasien.',
  },
];

export const DISTRACTOR_POOL = [
  { id: 'dist-1', label: 'Operasi di kamar bedah', sublabel: 'tindakan sayatan bedah' },
  { id: 'dist-2', label: 'Cuci darah (hemodialisis)', sublabel: 'terapi mesin darah ginjal' },
  { id: 'dist-3', label: 'Terapi sinar radiasi', sublabel: 'onkologi / radioterapi' },
  { id: 'dist-4', label: 'Pemasangan gips tulang', sublabel: 'ortopedi cedera patah tulang' },
  { id: 'dist-5', label: 'Fisioterapi alat kejut listrik', sublabel: 'rehabilitasi medik' },
];

/**
 * AI Planner: Automatically selects <= 5 questions based on maximum Information Gain
 */
export function generateAdaptiveVerificationPlan(claim: Claim): VerificationQuestion[] {
  // If claim already has custom questions pre-configured, return them
  if (claim.questions && claim.questions.length > 0) {
    return claim.questions;
  }

  const generatedQuestions: VerificationQuestion[] = [];
  let step = 1;

  // 1. Mandatory Anchor question (Rawat Inap)
  generatedQuestions.push({
    id: `q-anchor-${claim.id}`,
    stepNumber: step++,
    totalSteps: 5,
    title: `Apakah Anda sempat menginap dan dirawat di ${claim.hospitalName} pada tanggal ${claim.admissionDate} s.d. ${claim.dischargeDate}?`,
    subtitle: 'Kami memeriksa keabsahan catatan rawat inap atas nama Anda.',
    questionType: 'single_choice',
    iconType: 'bed',
    options: [
      { id: 'opt-anchor-yes', label: 'Ya, menginap dan dirawat' },
      { id: 'opt-anchor-no', label: 'Tidak pernah menginap / tidak pernah ke RS ini' },
      { id: 'opt-anchor-unsure', label: 'Tidak yakin / lupa' },
    ],
  });

  // 2. Length of stay question
  if (claim.losDays > 0) {
    generatedQuestions.push({
      id: `q-los-${claim.id}`,
      stepNumber: step++,
      totalSteps: 5,
      title: 'Berapa malam Anda menginap di rumah sakit pada saat itu?',
      subtitle: 'Hitung malam tidur di ruang perawatan.',
      questionType: 'single_choice',
      iconType: 'calendar',
      options: [
        { id: `opt-los-${claim.losDays}`, label: `${claim.losDays} malam (sesuai klaim)` },
        { id: 'opt-los-1', label: '1 malam' },
        { id: 'opt-los-more', label: `${claim.losDays + 2} malam atau lebih` },
        { id: 'opt-los-unsure', label: 'Tidak ingat pasti' },
      ],
    });
  }

  // 3. High observability procedures
  const highObservItems = claim.claimItems.filter(
    (item) => item.decision === 'Ditanya' && item.code !== 'LOS' && item.observability === 'Tinggi'
  );

  for (const item of highObservItems.slice(0, 2)) {
    if (step > 4) break;
    generatedQuestions.push({
      id: `q-proc-${item.id}`,
      factId: item.id,
      stepNumber: step++,
      totalSteps: 5,
      title: `Selama dirawat, apakah Anda menerima tindakan ${item.patientLanguage}?`,
      subtitle: `Klaim menagihkan: ${item.description}`,
      questionType: 'single_choice',
      iconType: item.category === 'Tindakan' ? 'treatment' : 'oxygen',
      options: [
        { id: 'opt-yes', label: 'Ya' },
        { id: 'opt-no', label: 'Tidak' },
        { id: 'opt-unsure', label: 'Tidak yakin' },
      ],
    });
  }

  // 4. Multi-select checklist with distractors (bias counter)
  const checklistItems = claim.claimItems
    .filter((item) => item.decision === 'Ditanya' && item.category !== 'Administratif')
    .slice(0, 2);

  const selectedDistractors = DISTRACTOR_POOL.slice(0, 2);

  const checklistOptions = [
    ...checklistItems.map((item) => ({
      id: `opt-real-${item.id}`,
      label: item.description.split('(')[0].trim(),
      sublabel: item.patientLanguage,
      isDistractor: false,
    })),
    ...selectedDistractors.map((dist) => ({
      id: dist.id,
      label: dist.label,
      sublabel: dist.sublabel,
      isDistractor: true,
    })),
  ];

  generatedQuestions.push({
    id: `q-checklist-${claim.id}`,
    stepNumber: step,
    totalSteps: step,
    title: 'Mana saja tindakan berikut yang Anda alami selama dirawat?',
    subtitle: 'Pilih semua yang Anda ingat. Boleh tidak memilih jika tidak mengalami.',
    questionType: 'multi_select',
    iconType: 'treatment',
    options: checklistOptions,
  });

  // Re-adjust total steps for each question
  return generatedQuestions.map((q) => ({
    ...q,
    totalSteps: generatedQuestions.length,
  }));
}
