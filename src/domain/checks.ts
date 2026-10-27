import type { AnswerOption } from './types';

/**
 * System checks on participant wording, applied to AI drafts and verifier edits before they can be
 * approved or published. They guard the wording, not the clinical content: that stays a human job.
 */

export type CheckId =
  | 'PANJANG'
  | 'ISTILAH_MEDIS'
  | 'ANGKA'
  | 'KATA_KLAIM'
  | 'PLACEHOLDER'
  | 'OPSI_JUMLAH'
  | 'OPSI_TIDAK_INGAT'
  | 'OPSI_MENDUKUNG'
  | 'OPSI_BERTENTANGAN'
  | 'OPSI_KOSONG'
  | 'OPSI_GANDA';

export interface CheckResult {
  id: CheckId;
  ok: boolean;
  message: string;
}

/** Words that reveal the claim or billing to the participant and would steer their answer. */
const CLAIM_WORDS = ['klaim', 'tagihan', 'ditagihkan', 'tarif', 'ina-cbg', 'inacbg', 'icd', 'biaya'];
const ALLOWED_SLOTS = ['{faskes}', '{periode}'];

function containsTerm(text: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t.length < 3) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text);
}

export function checkQuestion(text: string, options: readonly AnswerOption[], avoidTerms: readonly string[]): CheckResult[] {
  const body = ALLOWED_SLOTS.reduce((t, slot) => t.split(slot).join(' '), text).trim();
  const all = [body, ...options.map((o) => o.label)].join(' \n ');
  const medical = avoidTerms.filter((term) => containsTerm(all, term));
  const claimWords = CLAIM_WORDS.filter((w) => containsTerm(all, w));
  const labels = options.map((o) => o.label.trim().toLowerCase());
  const strengths = options.map((o) => (o.mapping.kind === 'TETAP' ? o.mapping.strength : 'RENTANG'));
  const hasNights = options.some((o) => o.mapping.kind === 'RENTANG_MALAM');

  return [
    {
      id: 'PANJANG',
      ok: body.length >= 15 && body.length <= 240,
      message: 'Kalimat 15–240 karakter.',
    },
    {
      id: 'ISTILAH_MEDIS',
      ok: medical.length === 0,
      message: medical.length ? `Memuat istilah medis: ${medical.join(', ')}.` : 'Tanpa istilah medis dari kamus.',
    },
    {
      // Numbers in the question would reveal billed quantities; night ranges live in the options only.
      id: 'ANGKA',
      ok: !/\d/.test(body),
      message: 'Kalimat pertanyaan tidak memuat angka (jumlah yang ditagihkan tidak boleh terlihat).',
    },
    {
      id: 'KATA_KLAIM',
      ok: claimWords.length === 0,
      message: claimWords.length ? `Menyebut klaim atau biaya: ${claimWords.join(', ')}.` : 'Tidak menyebut klaim, tagihan, atau tarif.',
    },
    {
      id: 'PLACEHOLDER',
      ok: !/[[\]{}]/.test(body) && !/\{(?!faskes\}|periode\})[^}]*\}/.test(text),
      message: 'Tidak ada bagian yang belum diisi (hanya {faskes} dan {periode} yang diizinkan).',
    },
    {
      id: 'OPSI_JUMLAH',
      ok: options.length >= 2 && options.length <= 6,
      message: '2–6 pilihan jawaban.',
    },
    {
      id: 'OPSI_KOSONG',
      ok: labels.every((l) => l.length > 0),
      message: 'Setiap pilihan punya teks.',
    },
    {
      id: 'OPSI_GANDA',
      ok: new Set(labels).size === labels.length,
      message: 'Tidak ada pilihan yang sama.',
    },
    {
      id: 'OPSI_TIDAK_INGAT',
      ok: options.some((o) => o.unsure && o.mapping.kind === 'TETAP' && o.mapping.strength === 'NETRAL'),
      message: 'Ada pilihan "Tidak ingat" yang bernilai netral.',
    },
    {
      id: 'OPSI_MENDUKUNG',
      ok: hasNights || strengths.some((s) => s === 'KUAT' || s === 'SEBAGIAN'),
      message: 'Ada pilihan yang mendukung isi klaim.',
    },
    {
      id: 'OPSI_BERTENTANGAN',
      ok: hasNights || strengths.includes('BERTENTANGAN'),
      message: 'Ada pilihan yang bertentangan dengan isi klaim.',
    },
  ];
}

export function checksPass(results: readonly CheckResult[]): boolean {
  return results.every((r) => r.ok);
}
