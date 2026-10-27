import { checkQuestion, checksPass } from '../domain/checks';
import type { AnswerOption, DictionaryEntry } from '../domain/types';
import { hashString, prng } from '../lib/random';
import { findProcedure } from './reference';
import type { AiModelInfo, DraftRequest, DraftResponse, QuestionAi, RankRequest, RankedQuestion } from './service';

/**
 * Deterministic stand-in for the question AI. It does no learning and no language modelling: scores
 * come from dictionary attributes plus a fixed per-claim jitter, and drafts are filled templates. Same
 * input, same output. Its scores are only as good as those rules; the analytics page measures them.
 */

export const SIMULATED_MODEL: AiModelInfo = {
  id: 'sim-question-ai',
  version: '1.0',
  kind: 'SIMULASI_DETERMINISTIK',
  label: 'Simulasi deterministik v1.0 (bukan model AI sungguhan)',
  confidenceEvent: 'JAWABAN_PASTI',
  confidenceEventText: 'Perkiraan peluang peserta memberi jawaban pasti (bukan "Tidak ingat") untuk pertanyaan ini.',
};

const DEFAULT_OBSERVABILITY = 0.55;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** A fixed offset in [-spread, spread] per (claim, question); stands in for model noise. */
function jitter(key: string, spread: number): number {
  return (prng(hashString(key))() * 2 - 1) * spread;
}

export function rankSync(request: RankRequest): RankedQuestion[] {
  return request.candidates.map((c) => {
    const key = `${request.claimKey}|${c.questionId}`;
    let score: number;
    if (c.entry.scope === 'EPISODE' && c.entry.topic === 'KEBERADAAN') {
      score = 0.93 + jitter(key, 0.03);
    } else if (c.entry.scope === 'EPISODE') {
      // Long stays are harder to count back.
      const long = request.claimedNights !== null && request.claimedNights > 7 ? 0.08 : 0;
      score = 0.8 - long + jitter(key, 0.05);
    } else {
      const obs = c.entry.observability ?? DEFAULT_OBSERVABILITY;
      score = 0.15 + 0.75 * obs * (0.3 + 0.7 * c.relevance) + jitter(key, 0.06);
    }
    return { questionId: c.questionId, version: c.version, confidence: round2(clamp(score, 0.05, 0.98)) };
  });
}

const GENERIC_BY_CATEGORY: Record<string, { text: string; experience: string }> = {
  Operasi: {
    text: 'Selama dirawat di {faskes}, apakah Anda pernah dibawa ke kamar operasi dan dibius?',
    experience: 'Dibawa ke kamar operasi dan dibius',
  },
  Darah: {
    text: 'Selama dirawat, apakah ada cairan dari kantong darah yang dialirkan ke tubuh Anda?',
    experience: 'Cairan dari kantong darah dialirkan ke tubuh',
  },
};

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function unsure(): AnswerOption {
  return { id: 'TIDAK_INGAT', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, unsure: true };
}

function fixed(id: string, label: string, strength: 'KUAT' | 'SEBAGIAN' | 'BERTENTANGAN'): AnswerOption {
  return { id, label, mapping: { kind: 'TETAP', strength } };
}

/** Same category first, then same code family; at most three. */
function referencesFor(code: string, category: string, dictionary: readonly DictionaryEntry[]): DictionaryEntry[] {
  const family = code.split('.')[0];
  return dictionary
    .filter((e) => e.scope === 'PROSEDUR' && e.status === 'AKTIF' && e.code !== code)
    .map((e) => ({ e, w: (e.category === category ? 2 : 0) + (e.code?.split('.')[0] === family ? 1 : 0) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || (a.e.code ?? '').localeCompare(b.e.code ?? ''))
    .slice(0, 3)
    .map((x) => x.e);
}

export function draftSync(request: DraftRequest): DraftResponse {
  const { target, variant } = request;
  const ref = findProcedure(target.code);
  const experiences = ref?.experiences ?? [];
  // The catalogue's term list when there is one; otherwise at least the coded name itself.
  const avoidTerms = ref?.avoidTerms ?? [target.name];
  const references = referencesFor(target.code, target.category, request.dictionary);
  const generic = GENERIC_BY_CATEGORY[target.category];
  const found = experiences.length > 0;

  let text: string;
  let options: AnswerOption[];
  let usedExperiences: string[];
  const v = variant % 3;
  if (found) {
    const [e1, e2] = experiences;
    usedExperiences = experiences;
    if (v === 0) {
      text = `Selama dirawat di {faskes}, apakah Anda ingat ${lowerFirst(e1)}?`;
      options = [
        fixed('YA', 'Ya, saya ingat mengalaminya', 'KUAT'),
        fixed('MIRIP', 'Pernah, tetapi tidak persis seperti itu', 'SEBAGIAN'),
        fixed('TIDAK', 'Tidak, hal itu tidak pernah terjadi', 'BERTENTANGAN'),
        unsure(),
      ];
    } else if (v === 1) {
      text = 'Selama perawatan {periode}, mana yang paling sesuai dengan yang Anda alami?';
      options = [
        fixed('PENGALAMAN_1', e1, 'KUAT'),
        ...(e2 ? [fixed('PENGALAMAN_2', e2, 'KUAT')] : []),
        fixed('TIDAK_ADA', 'Tidak ada yang seperti itu', 'BERTENTANGAN'),
        unsure(),
      ];
    } else {
      text = `Ingatkah Anda mengalami hal ini selama dirawat: ${lowerFirst(e1)}${e2 ? `, lalu ${lowerFirst(e2)}` : ''}?`;
      options = [fixed('YA', 'Ya, saya mengalaminya', 'KUAT'), fixed('TIDAK', 'Tidak pernah', 'BERTENTANGAN'), unsure()];
    }
  } else if (generic) {
    usedExperiences = [generic.experience];
    text = generic.text;
    options = [fixed('YA', 'Ya, pernah', 'KUAT'), fixed('TIDAK', 'Tidak pernah', 'BERTENTANGAN'), unsure()];
  } else {
    // No lay description available: return a template the verifier must complete, never invented detail.
    usedExperiences = [];
    text = `Selama dirawat, apakah Anda menjalani [jelaskan "${target.name}" dengan bahasa sehari-hari]?`;
    options = [fixed('YA', 'Ya, pernah', 'KUAT'), fixed('TIDAK', 'Tidak pernah', 'BERTENTANGAN'), unsure()];
  }

  const pass = checksPass(checkQuestion(text, options, avoidTerms));
  const base = found ? 0.62 : generic ? 0.38 : 0.2;
  const confidence = round2(
    clamp(
      base + (references.length > 0 ? 0.08 : 0) + [0, -0.04, -0.07][v] + (pass ? 0.05 : -0.1) + jitter(`${target.code}|${variant}`, 0.03),
      0.1,
      0.9,
    ),
  );

  const parts = [
    found
      ? `Pengalaman pasien diambil dari katalog referensi simulasi untuk kode ${target.code} (belum divalidasi klinisi).`
      : generic
        ? `Tidak ada deskripsi pengalaman untuk kode ${target.code}; draf dibuat dari kategori "${target.category}" saja.`
        : `Tidak ada deskripsi pengalaman untuk kode ${target.code}; draf berupa templat yang wajib dilengkapi verifikator.`,
    references.length
      ? `Struktur pilihan jawaban mengikuti entri kamus ${references.map((r) => r.code).join(', ')} (mendukung / bertentangan / "Tidak ingat").`
      : 'Tidak ada entri kamus sejenis sebagai rujukan.',
    `Varian templat ${v + 1} dari 3.`,
  ];

  return {
    proposal: { text, options, experiences: usedExperiences, avoidTerms },
    confidence,
    rationale: parts.join(' '),
    referenceEntryIds: references.map((r) => r.id),
    experienceSourceFound: found,
    claimAttributes: ['kode tindakan', 'nama tindakan', 'kategori layanan', 'jenis rawat', ...(request.claimContext.diagnosisName ? ['diagnosis utama'] : [])],
  };
}

export const simulatedAi: QuestionAi = {
  info: SIMULATED_MODEL,
  rank: async (request) => rankSync(request),
  draft: async (request) => draftSync(request),
};
