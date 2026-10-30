import { formatNumber } from '../lib/format';
import { strengthOf } from './evidence';
import type { AiConfig, AnswerEvaluation, AnswerOption, DictionaryEntry, FraudLevel, StopReason, VerificationScores } from './types';

/**
 * Rule-based evaluation of the adaptive answering session (no AI). Each answer counts with the fraud
 * score of the option the participant chose (a question carries no score of its own), weighted by how
 * observable the asked experience is. The weights combine into the claim's fraud indication, and the
 * configured thresholds turn it into a level that both reads the session and steers it: SEDANG keeps
 * asking with confirming questions, TINGGI stops. Simulation scores, not validated fraud probabilities.
 */

export const EVALUATION_RULES = 'aturan-evaluasi-v2';

/** Observability assumed for entries nobody has assessed yet (new entries from AI drafts). */
export const DEFAULT_OBSERVABILITY = 0.55;

/** How much a supporting answer counts toward the support score, by Table 1 strength. */
const SUPPORT_WEIGHT = { KUAT: 1, SEBAGIAN: 0.5 } as const;

const n = (x: number) => formatNumber(x, 2);

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Fraud level thresholds, always taken from an `AiConfig` (the session's, once a session runs). */
export interface FraudThresholds {
  medium: number;
  high: number;
}

export function thresholdsOf(cfg: Pick<AiConfig, 'fraudMediumThreshold' | 'fraudHighThreshold'>): FraudThresholds {
  return { medium: cfg.fraudMediumThreshold, high: cfg.fraudHighThreshold };
}

/** The level of a fraud indication. The only place the thresholds are compared. */
export function fraudLevel(indication: number, t: FraudThresholds): FraudLevel {
  return indication >= t.high ? 'TINGGI' : indication >= t.medium ? 'SEDANG' : 'RENDAH';
}

/** The chosen option's fraud score as it applies to this claim: a night range counts only when the billed stay is outside it. */
export function appliedFraudScore(option: AnswerOption, claimedNights: number | null): number {
  if (option.unsure) return 0;
  if (option.mapping.kind === 'RENTANG_MALAM') return strengthOf(option, claimedNights) === 'BERTENTANGAN' ? option.fraudScore : 0;
  return option.fraudScore;
}

export function evaluateAnswer(option: AnswerOption, entry: Pick<DictionaryEntry, 'observability'>, claimedNights: number | null): AnswerEvaluation {
  const strength = strengthOf(option, claimedNights);
  const definite = !option.unsure;
  const denial = !!option.denial;
  const reliability = definite ? round2(entry.observability ?? DEFAULT_OBSERVABILITY) : 0;
  const fraudScore = appliedFraudScore(option, claimedNights);
  // A denial is not discounted by observability: nobody fails to notice they were never there.
  const indicationWeight = denial ? 1 : round2(reliability * fraudScore);
  const supportWeight = strength === 'KUAT' || strength === 'SEBAGIAN' ? round2(reliability * SUPPORT_WEIGHT[strength]) : 0;
  let explanation: string;
  if (denial) {
    explanation = 'Peserta menyatakan tidak pernah ke faskes ini: skor fraud pilihan 1, indikasi maksimum.';
  } else if (!definite) {
    explanation = '"Tidak ingat" bernilai netral dan tidak pernah dihitung sebagai bantahan.';
  } else {
    const parts = [strength === 'KUAT' ? 'Mendukung isi klaim' : strength === 'SEBAGIAN' ? 'Sebagian mendukung isi klaim' : strength === 'BERTENTANGAN' ? 'Bertentangan dengan isi klaim' : 'Netral terhadap isi klaim'];
    if (supportWeight > 0) parts.push(`dukungan ${n(supportWeight)} = keandalan ${n(reliability)} × ${n(SUPPORT_WEIGHT[strength as 'KUAT' | 'SEBAGIAN'])}`);
    if (indicationWeight > 0) parts.push(`bobot fraud ${n(indicationWeight)} = skor fraud pilihan ${n(fraudScore)} × keandalan ${n(reliability)}`);
    explanation = `${parts.join('; ')}.`;
  }
  return { rules: EVALUATION_RULES, strength, definite, denial, reliability, fraudScore, indicationWeight, supportWeight, explanation };
}

/** Noisy-OR of weights. Below 1 unless one weight is 1, so only a denial yields 1,00. */
function combine(weights: readonly number[]): number {
  if (weights.some((w) => w >= 1)) return 1;
  const rest = weights.reduce((p, w) => p * (1 - w), 1);
  return Math.min(0.99, round2(1 - rest));
}

/** Claim scores after the given answers, with the fraud level read against `thresholds`. */
export function combineScores(evaluations: readonly AnswerEvaluation[], thresholds: FraudThresholds): VerificationScores {
  const indication = combine(evaluations.map((e) => e.indicationWeight));
  return {
    indication,
    support: combine(evaluations.map((e) => e.supportWeight)),
    answered: evaluations.length,
    definite: evaluations.filter((e) => e.definite).length,
    level: fraudLevel(indication, thresholds),
  };
}

/** Scores before the first answer: no signal yet (every valid medium threshold is above 0). */
export const EMPTY_SCORES: VerificationScores = { indication: 0, support: 0, answered: 0, definite: 0, level: 'RENDAH' };

/**
 * Stop rules checked after every answer, before the AI is asked for another question. The evaluation
 * result decides: a TINGGI level ends the session; otherwise only the question limit does.
 */
export function stopAfterAnswer(scores: VerificationScores, cfg: Pick<AiConfig, 'maxQuestions'>): StopReason | null {
  if (scores.level === 'TINGGI') return 'INDIKASI_TINGGI';
  if (scores.answered >= cfg.maxQuestions) return 'BATAS_PERTANYAAN';
  return null;
}
