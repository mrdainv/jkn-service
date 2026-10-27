// The shared simulation database. Every screen of every role reads these records; nothing about a
// claim, question or answer is kept anywhere else. Union types instead of enums (erasableSyntaxOnly).

/** ISO 8601 timestamp, e.g. `2026-10-27T09:30:00.000Z`. */
export type Iso = string;
/** Calendar date `YYYY-MM-DD`. */
export type IsoDate = string;

export type Role = 'FASKES' | 'VERIFIKATOR' | 'PESERTA' | 'SISTEM' | 'AI';

/** Who did something. Stored on every change so the audit log and history can name them. */
export interface ActorRef {
  role: Role;
  id: string;
  name: string;
}

// ── People and places ───────────────────────────────────────────────────────

export type Gender = 'L' | 'P';
export type CareClass = 'KELAS_1' | 'KELAS_2' | 'KELAS_3';
export type Segment = 'PBI' | 'PPU' | 'PBPU';

export interface Participant {
  id: string;
  /** Nomor kartu JKN (13 digits, pseudonymous). */
  cardNumber: string;
  name: string;
  gender: Gender;
  birthDate: IsoDate;
  careClass: CareClass;
  segment: Segment;
  region: string;
  mobileJknActive: boolean;
  status: 'AKTIF' | 'NONAKTIF';
}

export interface Facility {
  id: string;
  /** Kode faskes (synthetic). */
  code: string;
  name: string;
  /** Kelas rumah sakit. */
  hospitalClass: 'A' | 'B' | 'C' | 'D';
  ownership: 'PEMERINTAH' | 'SWASTA';
  city: string;
}

/** Dokter penanggung jawab pelayanan (DPJP) at a facility. */
export interface Practitioner {
  id: string;
  facilityId: string;
  name: string;
  specialty: string;
}

// ── Claims ──────────────────────────────────────────────────────────────────

export type CareType = 'RAWAT_INAP' | 'RAWAT_JALAN';

export interface CodedItem {
  code: string;
  name: string;
}

/** One procedure line of a claim (ICD-9-CM). `lineId` is stable within the claim. */
export interface ClaimProcedure extends CodedItem {
  lineId: string;
  quantity: number;
}

/**
 * Verification workflow status of a claim. The verifier's decision is separate (`Claim.decision`);
 * nothing here is a payment status.
 */
export type ClaimStatus =
  | 'DIAJUKAN'
  | 'MENUNGGU_PESERTA'
  | 'JAWABAN_DITERIMA'
  | 'PERLU_KONTAK'
  | 'DITOLAK_PESERTA'
  | 'TIDAK_DIJAWAB'
  | 'SELESAI';

export type DecisionOutcome = 'SESUAI' | 'PERLU_TINDAK_LANJUT' | 'TIDAK_DAPAT_DISIMPULKAN';

export interface VerifierDecision {
  outcome: DecisionOutcome;
  reason: string;
  decidedAt: Iso;
  decidedBy: ActorRef;
}

export interface Claim {
  id: string;
  /** Nomor SEP; unique across claims. */
  sepNumber: string;
  participantId: string;
  facilityId: string;
  practitionerId: string;
  careType: CareType;
  careClass: CareClass;
  admissionDate: IsoDate;
  dischargeDate: IsoDate;
  diagnosis: CodedItem;
  secondaryDiagnoses: CodedItem[];
  procedures: ClaimProcedure[];
  inaCbg: { code: string; tariff: number };
  hospitalCharge: number;
  submittedAt: Iso;
  submittedBy: ActorRef;
  status: ClaimStatus;
  statusUpdatedAt: Iso;
  decision: VerifierDecision | null;
}

export interface StatusEvent {
  id: string;
  claimId: string;
  from: ClaimStatus | null;
  to: ClaimStatus;
  at: Iso;
  actor: ActorRef;
  note: string;
}

// ── Experience dictionary and questions ─────────────────────────────────────

export type EpisodeTopic = 'KEBERADAAN' | 'LAMA_RAWAT';

/** Kamus pengalaman: what a participant can notice about a service, in lay terms. */
export interface DictionaryEntry {
  id: string;
  scope: 'EPISODE' | 'PROSEDUR';
  topic: EpisodeTopic | null;
  /** ICD-9-CM code for procedure entries; null for episode entries. */
  code: string | null;
  name: string;
  category: string;
  experiences: string[];
  /** Medical terms that must not appear in participant wording. */
  avoidTerms: string[];
  /** 0–1: how observable the service is to a patient. Null when not yet assessed (new AI entries). */
  observability: number | null;
  source: 'KAMUS_AWAL' | 'DRAF_AI';
  aiDraftId: string | null;
  createdAt: Iso;
  status: 'AKTIF' | 'NONAKTIF';
}

/** Evidence strength of one answer against the claim (URD Table 1). */
export type Strength = 'KUAT' | 'SEBAGIAN' | 'NETRAL' | 'BERTENTANGAN';

export type OptionMapping =
  | { kind: 'TETAP'; strength: Strength }
  /** Answer is a range of nights; supports the claim when the claimed nights fall inside it. */
  | { kind: 'RENTANG_MALAM'; min: number; max: number | null };

export interface AnswerOption {
  id: string;
  label: string;
  mapping: OptionMapping;
  /** "Tidak ingat": never counts as a rebuttal. */
  unsure?: boolean;
  /** Participant says they were never there; the remaining questions are skipped. */
  denial?: boolean;
}

export type QuestionOrigin = 'KAMUS_AWAL' | 'DRAF_AI' | 'DRAF_AI_DISUNTING' | 'SUNTINGAN_VERIFIKATOR';

/** An immutable version. Published assignments and answers pin `(questionId, version)`. */
export interface QuestionVersion {
  version: number;
  /** May contain `{faskes}` and `{periode}`, filled from the claim when shown to the participant. */
  text: string;
  options: AnswerOption[];
  origin: QuestionOrigin;
  aiDraftId: string | null;
  basedOnVersion: number | null;
  createdAt: Iso;
  createdBy: ActorRef;
  note: string;
}

export interface Question {
  id: string;
  entryId: string;
  status: 'AKTIF' | 'DIARSIPKAN';
  versions: QuestionVersion[];
}

// ── Mapping, AI suggestions and the verifier's working selection ────────────

export type MappingTarget =
  | { kind: 'EPISODE'; topic: EpisodeTopic }
  | { kind: 'PROSEDUR'; lineId: string; code: string; name: string };

export type MatchType = 'EPISODE' | 'KODE_TEPAT' | 'KODE_INDUK' | 'KATA_KUNCI' | 'TIDAK_ADA';
export type MappingStatus = 'TERPETAKAN' | 'DI_BAWAH_AMBANG' | 'TIDAK_TERPETAKAN';

/** Result of matching one claim attribute against the dictionary. Recomputed when the dictionary grows. */
export interface ClaimMapping {
  id: string;
  claimId: string;
  target: MappingTarget;
  entryId: string | null;
  matchType: MatchType;
  /** 0–1. Deterministic, explained by `matchType`; not an AI score. */
  relevance: number;
  status: MappingStatus;
  computedAt: Iso;
}

/**
 * One AI-ranked question suggestion for a claim: the AI confidence observation. The score predicts a
 * single declared event (`confidenceEvent`), never whether the claim is valid.
 */
export interface Suggestion {
  id: string;
  claimId: string;
  questionId: string;
  questionVersion: number;
  mappingId: string | null;
  source: 'PEMETAAN_KAMUS' | 'DRAF_AI';
  aiConfidence: number;
  confidenceEvent: 'JAWABAN_PASTI';
  model: { id: string; version: string };
  aiConfigVersion: number;
  rank: number;
  preselected: boolean;
  createdAt: Iso;
  /** What the verifier did with it, recorded when the claim's questions are published. */
  verifierAction: 'DITERIMA' | 'DISUNTING' | 'DIHAPUS' | null;
  actionAt: Iso | null;
}

export interface SelectionItem {
  questionId: string;
  /** The version this item is based on. */
  version: number;
  included: boolean;
  source: 'PEMETAAN' | 'DRAF_AI' | 'MANUAL';
  suggestionId: string | null;
  /** Unpublished verifier edit; becomes a new question version on publish. */
  edit: { text: string; options: AnswerOption[] } | null;
}

/** The verifier's working set for a claim, saved separately from what has been published. */
export interface QuestionSelection {
  claimId: string;
  items: SelectionItem[];
  updatedAt: Iso;
  updatedBy: ActorRef;
}

// ── AI drafts ───────────────────────────────────────────────────────────────

export interface DraftProposal {
  text: string;
  options: AnswerOption[];
  experiences: string[];
  avoidTerms: string[];
}

export interface AiDraft {
  id: string;
  claimId: string | null;
  target: { code: string; name: string; category: string };
  status: 'DRAF' | 'DISETUJUI' | 'DIBUANG' | 'DIGANTIKAN';
  /** Regenerating creates a new draft and marks this one DIGANTIKAN. */
  previousDraftId: string | null;
  variant: number;
  generatedAt: Iso;
  requestedBy: ActorRef;
  generator: { id: string; version: string; kind: 'SIMULASI_DETERMINISTIK' };
  context: {
    /** Claim attributes the generator used. */
    claimAttributes: string[];
    /** Dictionary entries it used as references. */
    referenceEntryIds: string[];
    /** Whether a lay description of the service was available; false means a generic draft. */
    experienceSourceFound: boolean;
  };
  proposal: DraftProposal;
  /** Verifier's working edits, kept on the draft until approval. */
  edited: DraftProposal | null;
  confidence: number;
  rationale: string;
  resolvedAt: Iso | null;
  resolvedBy: ActorRef | null;
  approvedEntryId: string | null;
  approvedQuestionId: string | null;
}

// ── Publication, notification and participant response ──────────────────────

export interface AssignmentItem {
  questionId: string;
  questionVersion: number;
  order: number;
  suggestionId: string | null;
}

/** A published set of questions for one claim. A new round supersedes an unanswered earlier one. */
export interface Assignment {
  id: string;
  claimId: string;
  participantId: string;
  round: number;
  items: AssignmentItem[];
  publishedAt: Iso;
  publishedBy: ActorRef;
  status: 'AKTIF' | 'DIGANTIKAN' | 'DIJAWAB' | 'DITUTUP';
  supersededBy: string | null;
}

export type NotificationKind = 'PERTANYAAN_BARU' | 'PERTANYAAN_DIPERBARUI' | 'JAWABAN_DITERIMA';

export interface Notification {
  id: string;
  participantId: string;
  claimId: string;
  assignmentId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: Iso;
  readAt: Iso | null;
}

export type FristaResult = 'COCOK' | 'TIDAK_COCOK' | 'LAYANAN_TIDAK_TERSEDIA' | 'TANPA_KAMERA';

/** FRISTA face check. Only the result is stored, never an image or a match percentage. */
export interface FristaCheck {
  id: string;
  participantId: string;
  claimId: string;
  assignmentId: string;
  result: FristaResult;
  /** Counted failed attempts including this one (a service outage is not counted). */
  failedAttempts: number;
  at: Iso;
  method: 'SIMULASI';
}

export interface ResponseSession {
  id: string;
  claimId: string;
  assignmentId: string;
  participantId: string;
  fristaCheckId: string;
  channel: 'MOBILE_JKN';
  startedAt: Iso;
  submittedAt: Iso;
  status: 'TERKIRIM';
}

export interface Answer {
  id: string;
  sessionId: string;
  claimId: string;
  assignmentId: string;
  questionId: string;
  questionVersion: number;
  /** Null when the question was skipped. */
  optionId: string | null;
  status: 'DIJAWAB' | 'DILEWATI';
  answeredAt: Iso;
}

// ── Configuration and audit ─────────────────────────────────────────────────

export interface AiConfig {
  version: number;
  mode: 'SIMULASI_DETERMINISTIK';
  /** Minimum relevance for a dictionary match to count as mapped. */
  mappingThreshold: number;
  /** Suggestions at or above this AI confidence are preselected for the verifier. */
  autoSelectThreshold: number;
  /** Maximum questions published per claim. */
  maxQuestions: number;
  /** AI drafts below this confidence carry a warning. */
  draftWarningThreshold: number;
  updatedAt: Iso;
  updatedBy: ActorRef;
}

export interface AuditEntry {
  id: string;
  at: Iso;
  actor: ActorRef;
  action: string;
  entity: string;
  entityId: string;
  claimId: string | null;
  summary: string;
}

export const SCHEMA_VERSION = 2;

export interface Db {
  schemaVersion: typeof SCHEMA_VERSION;
  datasetId: string;
  /** Always true: this database only ever holds simulated data. */
  synthetic: true;
  createdAt: Iso;
  /** Next number per ID prefix, so IDs stay stable and never reused. */
  counters: Record<string, number>;
  participants: Participant[];
  facilities: Facility[];
  practitioners: Practitioner[];
  claims: Claim[];
  statusHistory: StatusEvent[];
  dictionary: DictionaryEntry[];
  questions: Question[];
  mappings: ClaimMapping[];
  suggestions: Suggestion[];
  selections: QuestionSelection[];
  drafts: AiDraft[];
  assignments: Assignment[];
  notifications: Notification[];
  fristaChecks: FristaCheck[];
  sessions: ResponseSession[];
  answers: Answer[];
  aiConfig: AiConfig;
  aiConfigHistory: AiConfig[];
  audit: AuditEntry[];
}
