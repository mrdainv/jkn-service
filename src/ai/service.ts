import type { AiKind, AnswerOption, CareType, CodedItem, DictionaryEntry, DraftProposal, EpisodeTopic, Strength, VerificationScores } from '../domain/types';

/**
 * The only boundary between the application and an AI. Today it is backed by a deterministic
 * simulation (`simulatedAi`); a real model would implement the same interface. Requests carry the claim
 * context and dictionary content only, never the participant's identity.
 */

export interface AiModelInfo {
  id: string;
  version: string;
  kind: AiKind;
  label: string;
  /** What the confidence score predicts. It never predicts claim validity. */
  confidenceEvent: 'JAWABAN_PASTI';
  confidenceEventText: string;
}

/**
 * Claim data the AI works from, built from the stored claim by `claimContextFor`. The claim ID is an
 * opaque key for deterministic output; no participant name, card number, birth date or address.
 */
export interface ClaimContext {
  claimKey: string;
  careType: CareType;
  claimedNights: number | null;
  diagnosis: CodedItem;
  procedures: { lineId: string; code: string; name: string; quantity: number }[];
}

/** What each AI request carries, shown on the configuration page. Kept next to the types it describes. */
export const AI_REQUEST_FIELDS: Record<'rank' | 'next' | 'draft', string[]> = {
  rank: ['ID klaim (kunci samaran)', 'jenis rawat', 'jumlah malam', 'diagnosis utama', 'kode, nama, dan jumlah tindakan', 'kandidat pertanyaan dengan entri kamus dan relevansi'],
  next: ['konteks klaim yang sama', 'pertanyaan putaran yang belum ditanyakan', 'jawaban sebelumnya beserta evaluasinya', 'skor indikasi dan dukungan saat ini', 'sisa kuota pertanyaan'],
  draft: ['kode, nama, dan kategori tindakan', 'jenis rawat (bila diminta dari klaim)', 'isi kamus pengalaman'],
};

/** The entry facts a question is ranked on. */
export type EntryFacts = Pick<DictionaryEntry, 'id' | 'scope' | 'topic' | 'category' | 'observability'>;

export interface RankCandidate {
  questionId: string;
  version: number;
  entry: EntryFacts;
  /** Claim line the entry was matched to; null for episode questions. */
  lineId: string | null;
  /** Relevance of the dictionary match (1 for episode questions). */
  relevance: number;
}

export interface RankRequest {
  claim: ClaimContext;
  candidates: RankCandidate[];
}

export interface RankedQuestion {
  questionId: string;
  version: number;
  confidence: number;
}

/** One question of the published round that has not been asked yet. */
export interface PoolItem extends RankCandidate {
  /** Order the verifier gave it; used to break ties. */
  order: number;
  /** The ranking score from preparation, when there is one. */
  priorConfidence: number | null;
}

export interface HistoryItem {
  questionId: string;
  version: number;
  topic: EpisodeTopic | null;
  lineId: string | null;
  strength: Strength;
  definite: boolean;
  denial: boolean;
}

/** Asks for the next question of an adaptive session, after the previous answer has been evaluated. */
export interface NextQuestionRequest {
  claim: ClaimContext;
  sessionKey: string;
  pool: PoolItem[];
  history: HistoryItem[];
  scores: VerificationScores;
  /** Questions that may still be asked before the configured limit. */
  remaining: number;
}

export interface NextQuestionResponse {
  /** Null when no relevant question is left. Must be one of the pool items. */
  next: { questionId: string; version: number; predictedDefinite: number; rationale: string } | null;
  /** Pool items no longer relevant given earlier answers; they will not be asked. */
  skipped: { questionId: string; reason: string }[];
}

export interface DraftRequest {
  target: { code: string; name: string; category: string };
  /** Present when the draft is asked for from a claim. */
  claim: Pick<ClaimContext, 'careType'> | null;
  /** Existing dictionary entries the drafter may use as references for structure and wording. */
  dictionary: readonly DictionaryEntry[];
  /** 0 for the first draft; regenerating asks for the next variant. */
  variant: number;
}

export interface DraftResponse {
  proposal: DraftProposal;
  confidence: number;
  rationale: string;
  referenceEntryIds: string[];
  experienceSourceFound: boolean;
  /** Claim and request attributes the drafter actually used. */
  claimAttributes: string[];
}

export interface QuestionAi {
  readonly info: AiModelInfo;
  /** Scores how likely each candidate question is to get a definite answer (not "Tidak ingat"). */
  rank(request: RankRequest): Promise<RankedQuestion[]>;
  /** Picks the next question of a session from the approved round, given the answers so far. */
  next(request: NextQuestionRequest): Promise<NextQuestionResponse>;
  /** Drafts a participant question and answer options for a service the dictionary does not cover. */
  draft(request: DraftRequest): Promise<DraftResponse>;
}

export type { AnswerOption };
