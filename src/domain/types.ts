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

/**
 * What the verifier saw when deciding, copied at decision time so the decision stays tied to the
 * evaluation it was based on even if the claim is read again later.
 */
export interface DecisionBasis {
  sessionId: string | null;
  evidenceStatus: 'PERLU_DIPERIKSA' | 'BUKTI_TIDAK_CUKUP' | 'KONSISTEN' | 'TANPA_JAWABAN';
  indication: number | null;
  support: number | null;
  stopReason: StopReason | null;
  answered: number;
}

export interface VerifierDecision {
  outcome: DecisionOutcome;
  reason: string;
  decidedAt: Iso;
  decidedBy: ActorRef;
  basis: DecisionBasis;
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

/** How an AI result was produced. Only the deterministic simulation exists today. */
export type AiKind = 'SIMULASI_DETERMINISTIK' | 'MODEL_EKSTERNAL';

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
  generator: { id: string; version: string; kind: AiKind };
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

/**
 * A published round: the verifier-approved questions (exact versions) the AI may ask, one at a time,
 * up to `AiConfig.maxQuestions`. A new round supersedes an earlier one that nobody has started answering.
 */
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

/** Why the system stopped asking. Recorded once, when the session ends. */
export type StopReason =
  /** The inconsistency indication reached the configured stop threshold (1,00 = participant denied ever being there). */
  | 'INDIKASI_MAKSIMUM'
  /** As many questions were asked as the configuration allows. */
  | 'BATAS_PERTANYAAN'
  /** No relevant question was left in the round. */
  | 'PERTANYAAN_HABIS'
  /** The participant chose to stop. */
  | 'DIHENTIKAN_PESERTA'
  /** The response window closed while the session was open. */
  | 'BATAS_WAKTU';

/** Why the AI picked a question: the model, its predicted chance of a definite answer, and its reasoning. */
export interface AiPick {
  model: { id: string; version: string; kind: AiKind };
  /** 0–1: predicted chance the participant gives a definite answer (not "Tidak ingat"). Never claim validity. */
  predictedDefinite: number;
  rationale: string;
}

/** The question currently shown to the participant; exactly one at a time. */
export interface PendingQuestion {
  questionId: string;
  questionVersion: number;
  iteration: number;
  askedAt: Iso;
  pick: AiPick;
}

/**
 * One adaptive answering session: opened by a FRISTA match, then one question at a time until a stop
 * rule holds. Scores are not kept here; they live on each answer (`scoresAfter`), so they cannot drift.
 */
export interface ResponseSession {
  id: string;
  claimId: string;
  assignmentId: string;
  participantId: string;
  fristaCheckId: string;
  channel: 'MOBILE_JKN';
  startedAt: Iso;
  status: 'BERLANGSUNG' | 'SELESAI';
  pending: PendingQuestion | null;
  /** Round questions the AI judged irrelevant after earlier answers; they are never asked. */
  skipped: { questionId: string; questionVersion: number; reason: string; at: Iso }[];
  stopReason: StopReason | null;
  endedAt: Iso | null;
  /** AI configuration (stop threshold, question limit) the session ran under. */
  aiConfigVersion: number;
}

/**
 * Rule-based reading of one answer (not AI). `reliability` is how much this single answer can count:
 * the entry's observability when the answer is definite, 0 for "Tidak ingat".
 */
export interface AnswerEvaluation {
  rules: string;
  strength: Strength;
  definite: boolean;
  denial: boolean;
  reliability: number;
  /** Contribution to the inconsistency indication (0–1; 1 for a denial). */
  indicationWeight: number;
  /** Contribution to the support score (0–1). */
  supportWeight: number;
  explanation: string;
}

/**
 * Claim-level scores after an answer. `indication` combines contradicting answers (noisy-OR of their
 * weights) and reaches 1 only through a denial; `support` does the same for supporting answers. Both are
 * rule-based simulation scores, not validated fraud probabilities.
 */
export interface VerificationScores {
  indication: number;
  support: number;
  answered: number;
  definite: number;
}

export interface Answer {
  id: string;
  sessionId: string;
  claimId: string;
  assignmentId: string;
  questionId: string;
  questionVersion: number;
  optionId: string;
  /** 1 for the first question of the session, then 2, 3, … */
  iteration: number;
  askedAt: Iso;
  /** Command time when the answer was recorded (not the device clock). */
  answeredAt: Iso;
  pick: AiPick;
  evaluation: AnswerEvaluation;
  scoresAfter: VerificationScores;
}

// ── Configuration and audit ─────────────────────────────────────────────────

export interface AiConfig {
  version: number;
  /** Minimum relevance for a dictionary match to count as mapped. */
  mappingThreshold: number;
  /** Suggestions at or above this AI confidence are preselected for the verifier. */
  autoSelectThreshold: number;
  /** Maximum questions asked per claim in one session (and preselected for the verifier). */
  maxQuestions: number;
  /** The session stops once the inconsistency indication reaches this (1 = only a denial stops it). */
  stopIndicationThreshold: number;
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

export const SCHEMA_VERSION = 3;

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
