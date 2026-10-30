import type { AnswerOption, Claim, FraudLevel, Strength } from './types';

/** Case-level reading of the answers (URD Table 2). It orders the verifier's work; it is not a decision. */
export type EvidenceStatus = 'PERLU_DIPERIKSA' | 'BUKTI_TIDAK_CUKUP' | 'KONSISTEN';

/** Nights billed for an inpatient stay: discharge minus admission, in whole days. */
export function claimedNights(claim: Pick<Claim, 'admissionDate' | 'dischargeDate' | 'careType'>): number | null {
  if (claim.careType !== 'RAWAT_INAP') return null;
  const ms = Date.parse(`${claim.dischargeDate}T00:00:00Z`) - Date.parse(`${claim.admissionDate}T00:00:00Z`);
  const nights = Math.round(ms / 86_400_000);
  return Number.isFinite(nights) && nights >= 0 ? nights : null;
}

/**
 * Table 1: the strength of one answer against the claim. Night answers are ranges; they support the
 * claim when the billed nights fall inside the chosen range and contradict it otherwise.
 */
export function strengthOf(option: AnswerOption, nights: number | null): Strength {
  const m = option.mapping;
  if (m.kind === 'TETAP') return m.strength;
  if (nights === null) return 'NETRAL';
  return nights >= m.min && (m.max === null || nights <= m.max) ? 'KUAT' : 'BERTENTANGAN';
}

export interface EvidenceInput {
  /** Fraud level after the last answer, already read against the session's thresholds. */
  level: FraudLevel;
  /** Whether any answer supports the claim (support score above 0). */
  supported: boolean;
}

export interface EvidenceResult {
  status: EvidenceStatus;
  /** A TINGGI level (every denial reaches it) goes to the top of the verifier's list. */
  priority: boolean;
  /** Which Table 2 row decided. */
  rule: 1 | 2 | 3 | 4;
}

/**
 * Table 2, read through the configured thresholds: four ordered conditions; the first that holds
 * decides. The level is the only input about contradictions, so the result never disagrees with the
 * stop rule or with the score the verifier sees.
 */
export function evidenceStatus(input: EvidenceInput): EvidenceResult {
  if (input.level === 'TINGGI') return { status: 'PERLU_DIPERIKSA', priority: true, rule: 1 };
  if (input.level === 'SEDANG') return { status: 'PERLU_DIPERIKSA', priority: false, rule: 2 };
  if (!input.supported) return { status: 'BUKTI_TIDAK_CUKUP', priority: false, rule: 3 };
  return { status: 'KONSISTEN', priority: false, rule: 4 };
}

export const EVIDENCE_RULE_TEXT: Record<EvidenceResult['rule'], string> = {
  1: 'Indikasi fraud mencapai ambang tinggi (termasuk penyangkalan "tidak pernah ke sana").',
  2: 'Indikasi fraud mencapai ambang sedang.',
  3: 'Indikasi di bawah ambang sedang, tetapi tidak ada jawaban yang mendukung isi klaim (mis. semua "Tidak ingat").',
  4: 'Indikasi di bawah ambang sedang dan setidaknya satu jawaban mendukung isi klaim.',
};
