import type { AnswerOption, Claim, Strength } from './types';

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
  strengths: readonly Strength[];
  denied: boolean;
}

export interface EvidenceResult {
  status: EvidenceStatus;
  /** A denial ("never went there") goes to the top of the verifier's list. */
  priority: boolean;
  /** Which Table 2 row decided. */
  rule: 1 | 2 | 3 | 4;
}

/** Table 2: four ordered conditions; the first that holds decides. */
export function evidenceStatus(input: EvidenceInput): EvidenceResult {
  if (input.denied) return { status: 'PERLU_DIPERIKSA', priority: true, rule: 1 };
  if (input.strengths.some((s) => s === 'BERTENTANGAN')) return { status: 'PERLU_DIPERIKSA', priority: false, rule: 2 };
  if (input.strengths.every((s) => s === 'NETRAL')) return { status: 'BUKTI_TIDAK_CUKUP', priority: false, rule: 3 };
  return { status: 'KONSISTEN', priority: false, rule: 4 };
}

export const EVIDENCE_RULE_TEXT: Record<EvidenceResult['rule'], string> = {
  1: 'Peserta menyatakan tidak pernah ke faskes tersebut.',
  2: 'Setidaknya satu jawaban bertentangan dengan isi klaim.',
  3: 'Semua jawaban netral ("Tidak ingat") atau tidak ada jawaban.',
  4: 'Tidak ada jawaban yang bertentangan dan setidaknya satu mendukung.',
};
