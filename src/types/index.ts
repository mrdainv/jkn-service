export type ObservabilityLevel = 'Tinggi' | 'Sedang-tinggi' | 'Sedang' | 'Rendah' | 'Di luar cakupan';

export type ClaimDecision = 'Ditanya : jangkar' | 'Ditanya' | 'Dilewati' | 'Tak dapat ditanya' | 'Di luar cakupan';

export type FactCategory = 'Administratif' | 'Tindakan' | 'Penunjang' | 'Obat' | 'Alkes / BMHP' | 'Diagnosis';

export interface ClaimItem {
  id: string;
  code: string;
  description: string;
  category: FactCategory;
  quantity: string;
  observability: ObservabilityLevel;
  patientLanguage: string;
  informationGainBits: number;
  decision: ClaimDecision;
  reason: string;
}

export type QuestionType = 'single_choice' | 'number' | 'multi_select' | 'clarification';

export interface QuestionOption {
  id: string;
  label: string;
  sublabel?: string;
  isDistractor?: boolean;
}

export interface VerificationQuestion {
  id: string;
  factId?: string;
  stepNumber: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  questionType: QuestionType;
  options?: QuestionOption[];
  iconType: 'bed' | 'oxygen' | 'calendar' | 'treatment' | 'alert';
  isAdaptive?: boolean;
  adaptiveTriggerCondition?: {
    field: string;
    value: string | number;
  };
}

export interface PatientAnswerRecord {
  questionId: string;
  factId?: string;
  answerText: string;
  selectedOptions?: string[];
  answeredAt: string;
  responseTimeSeconds: number;
}

export type FactStatus = 'Sesuai' | 'Bertentangan' | 'Gugur' | 'Lolos' | 'Dilewati';

export interface FactEvidence {
  factId: string;
  factName: string;
  claimValue: string;
  patientAnswer: string;
  likelihoodRatio: number | null;
  ratioDirection: 'up' | 'down' | 'neutral';
  status: FactStatus;
  note?: string;
}

export interface VerificationResult {
  consistencyScore: number; // 0 - 100
  consistencyRange: string; // e.g. "rentang 79–95"
  evidenceCoverage: {
    answered: number;
    total: number;
  };
  materialContradictions: number;
  contradictionDetail: string;
  recallReliability: 'Tinggi' | 'Sedang' | 'Rendah';
  reliabilityReason: string;
  recommendation: 'Tinjauan manusia direkomendasikan' | 'Terverifikasi Selaras Otomatis' | 'Prioritas Tinggi: Dugaan Fraud Kritis';
  evidenceTrail: FactEvidence[];
  potentialExplanations: string[];
  discrepancyHighlight: string;
  verifierDecision?: 'minta_resume' | 'setujui' | 'eskalasi_pk_jkn';
  verifierNotes?: string;
}

export interface PatientProfile {
  name: string;
  maskedName: string;
  age: number;
  cardNumber: string;
  nikMasked: string;
  phone: string;
  avatarSeed: string;
}

export interface Claim {
  id: string;
  hospitalName: string;
  hospitalCode: string;
  patient: PatientProfile;
  admissionDate: string;
  dischargeDate: string;
  daysSinceDischarge: number;
  losDays: number;
  careClass: string;
  primaryDiagnosisCode: string;
  primaryDiagnosisName: string;
  tariffGroup: string;
  claimAmount: number;
  samplingReason: 'Sampel acak harian' | 'Sampel anomali LOS' | 'Sampel anomali Phantom Billing' | 'Sampel anomali Frekuensi Tindakan';
  samplingNote: string;
  status: 'Menunggu Pasien' | 'Siap Verifikasi' | 'Perlu Tinjauan' | 'Disetujui' | 'Eskalasi PK-JKN';
  claimItems: ClaimItem[];
  questions: VerificationQuestion[];
  distractors: string[];
  patientAnswers?: Record<string, PatientAnswerRecord>;
  faceVerificationPassed: boolean;
  faceMatchScore?: number;
  isCompanionAnswer?: boolean;
  result?: VerificationResult;
}

export interface HospitalRiskProfile {
  hospitalCode: string;
  hospitalName: string;
  type: string;
  city: string;
  totalAuditedClaims: number;
  discordanceRate: number; // %
  prolongedStayRate: number; // %
  phantomBillingRate: number; // %
  riskLevel: 'Rendah' | 'Waspada' | 'Tinggi';
  preventedLossRupiah: number;
  historyMonthly: { month: string; discordance: number }[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  targetId: string;
  dataHash: string;
  pdpComplianceNote: string;
}
