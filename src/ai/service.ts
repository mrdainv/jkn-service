import type { AnswerOption, CareType, DictionaryEntry, DraftProposal } from '../domain/types';

/**
 * The only boundary between the application and an AI. Today it is backed by a deterministic
 * simulation (`simulatedAi`); a real model would implement the same interface. Requests carry claim
 * attributes and dictionary content only, never the participant's identity.
 */

export interface AiModelInfo {
  id: string;
  version: string;
  kind: 'SIMULASI_DETERMINISTIK';
  label: string;
  /** What the confidence score predicts. It never predicts claim validity. */
  confidenceEvent: 'JAWABAN_PASTI';
  confidenceEventText: string;
}

export interface RankCandidate {
  questionId: string;
  version: number;
  entry: Pick<DictionaryEntry, 'id' | 'scope' | 'topic' | 'category' | 'observability'>;
  /** Relevance of the dictionary match (1 for episode questions). */
  relevance: number;
}

export interface RankRequest {
  /** Opaque key for deterministic output; not an identity. */
  claimKey: string;
  careType: CareType;
  claimedNights: number | null;
  candidates: RankCandidate[];
}

export interface RankedQuestion {
  questionId: string;
  version: number;
  confidence: number;
}

export interface DraftRequest {
  target: { code: string; name: string; category: string };
  claimContext: { careType: CareType; diagnosisName: string | null };
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
  claimAttributes: string[];
}

export interface QuestionAi {
  readonly info: AiModelInfo;
  /** Scores how likely each candidate question is to get a definite answer (not "Tidak ingat"). */
  rank(request: RankRequest): Promise<RankedQuestion[]>;
  /** Drafts a participant question and answer options for a service the dictionary does not cover. */
  draft(request: DraftRequest): Promise<DraftResponse>;
}

export type { AnswerOption };
