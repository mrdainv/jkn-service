import { formatNumber } from '../lib/format';
import { strengthOf } from './evidence';
import type { AnswerEvaluation, AnswerOption, DictionaryEntry, StopReason, VerificationScores } from './types';

/**
 * Rule-based evaluation of the adaptive answering session (no AI). Each answer is read with Table 1
 * and weighted by how observable the asked experience is; the weights combine into two claim-level
 * scores. The scores order and stop the questioning; they are not fraud probabilities.
 */

export const EVALUATION_RULES = 'aturan-evaluasi-v1';

/** Observability assumed for entries nobody has assessed yet (new entries from AI drafts). */
export const DEFAULT_OBSERVABILITY = 0.55;

/** How much a contradiction weighs, by what was asked. A stay denied outright weighs most. */
export const CONTRADICTION_WEIGHT = { KEBERADAAN: 0.8, LAMA_RAWAT: 0.4, PROSEDUR: 0.6 } as const;
const SUPPORT_WEIGHT = { KUAT: 1, SEBAGIAN: 0.5 } as const;

const n = (x: number) => formatNumber(x, 2);

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function evaluateAnswer(option: AnswerOption, entry: Pick<DictionaryEntry, 'topic' | 'observability'>, claimedNights: number | null): AnswerEvaluation {
  const strength = strengthOf(option, claimedNights);
  const definite = !option.unsure;
  const denial = !!option.denial;
  const reliability = definite ? round2(entry.observability ?? DEFAULT_OBSERVABILITY) : 0;
  const kind = entry.topic ?? 'PROSEDUR';
  let indicationWeight = 0;
  let supportWeight = 0;
  let explanation: string;
  if (denial) {
    indicationWeight = 1;
    explanation = 'Peserta menyatakan tidak pernah ke faskes ini: indikasi maksimum, pertanyaan dihentikan.';
  } else if (!definite) {
    explanation = '"Tidak ingat" bernilai netral dan tidak pernah dihitung sebagai bantahan.';
  } else if (strength === 'BERTENTANGAN') {
    indicationWeight = round2(reliability * CONTRADICTION_WEIGHT[kind]);
    explanation = `Bertentangan dengan isi klaim; bobot ${n(indicationWeight)} = keandalan ${n(reliability)} × bobot ${kind.toLowerCase().replace('_', ' ')} ${n(CONTRADICTION_WEIGHT[kind])}.`;
  } else if (strength === 'KUAT' || strength === 'SEBAGIAN') {
    supportWeight = round2(reliability * SUPPORT_WEIGHT[strength]);
    explanation = `${strength === 'KUAT' ? 'Mendukung' : 'Sebagian mendukung'} isi klaim; bobot ${n(supportWeight)} = keandalan ${n(reliability)} × ${n(SUPPORT_WEIGHT[strength])}.`;
  } else {
    explanation = 'Jawaban netral terhadap isi klaim.';
  }
  return { rules: EVALUATION_RULES, strength, definite, denial, reliability, indicationWeight, supportWeight, explanation };
}

/** Noisy-OR of weights. Below 1 unless one weight is 1, so only a denial yields 1,00. */
function combine(weights: readonly number[]): number {
  if (weights.some((w) => w >= 1)) return 1;
  const rest = weights.reduce((p, w) => p * (1 - w), 1);
  return Math.min(0.99, round2(1 - rest));
}

export function combineScores(evaluations: readonly AnswerEvaluation[]): VerificationScores {
  return {
    indication: combine(evaluations.map((e) => e.indicationWeight)),
    support: combine(evaluations.map((e) => e.supportWeight)),
    answered: evaluations.length,
    definite: evaluations.filter((e) => e.definite).length,
  };
}

export const EMPTY_SCORES: VerificationScores = { indication: 0, support: 0, answered: 0, definite: 0 };

/** Stop rules checked after every answer, before the AI is asked for another question. */
export function stopAfterAnswer(scores: VerificationScores, cfg: { maxQuestions: number; stopIndicationThreshold: number }): StopReason | null {
  if (scores.indication >= cfg.stopIndicationThreshold) return 'INDIKASI_MAKSIMUM';
  if (scores.answered >= cfg.maxQuestions) return 'BATAS_PERTANYAAN';
  return null;
}
