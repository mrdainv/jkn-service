import { checkQuestion, checksPass } from '../domain/checks';
import { FRAUD_LEVEL_LABEL, MATCH_TYPE_LABEL } from '../domain/labels';
import type { AnswerOption, CareType } from '../domain/types';
import { DEFAULT_OBSERVABILITY } from '../domain/verification';
import { formatNumber } from '../lib/format';
import { hashString, prng } from '../lib/random';
import { findProcedure } from './reference';
import type {
  AiModelInfo,
  ClaimContext,
  DraftReference,
  DraftRequest,
  DraftResponse,
  NextQuestionRequest,
  NextQuestionResponse,
  PoolItem,
  QuestionAi,
  RankCandidate,
  RankRequest,
  RankedQuestion,
} from './service';

/**
 * Deterministic stand-in for the question AI. It does no learning and no language modelling: scores
 * come from dictionary attributes plus a fixed per-claim jitter, the next question follows fixed
 * ordering rules over the approved round (switching to confirming questions at the level the system read
 * from the configured thresholds), and drafts are filled templates whose option fraud scores follow the
 * reference entries. Same input, same output. Its scores are only as good as those rules; the analytics
 * page measures them.
 */

export const SIMULATED_MODEL: AiModelInfo = {
  id: 'sim-question-ai',
  version: '1.0',
  kind: 'SIMULASI_DETERMINISTIK',
  label: 'Simulasi deterministik v1.0 (bukan model AI sungguhan)',
  confidenceEvent: 'JAWABAN_PASTI',
  confidenceEventText: 'Perkiraan peluang peserta memberi jawaban pasti (bukan "Tidak ingat") untuk pertanyaan ini.',
};

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

/** Predicted chance of a definite answer for one candidate of one claim. */
function scoreFor(claim: ClaimContext, c: RankCandidate): number {
  const key = `${claim.claimKey}|${c.questionId}`;
  let score: number;
  if (c.entry.scope === 'EPISODE' && c.entry.topic === 'KEBERADAAN') {
    score = 0.93 + jitter(key, 0.03);
  } else if (c.entry.scope === 'EPISODE') {
    // Long stays are harder to count back.
    const long = claim.claimedNights !== null && claim.claimedNights > 7 ? 0.08 : 0;
    score = 0.8 - long + jitter(key, 0.05);
  } else {
    const obs = c.entry.observability ?? DEFAULT_OBSERVABILITY;
    score = 0.15 + 0.75 * obs * (0.3 + 0.7 * c.relevance) + jitter(key, 0.06);
  }
  return round2(clamp(score, 0.05, 0.98));
}

export function rankSync(request: RankRequest): RankedQuestion[] {
  return request.candidates.map((c) => ({ questionId: c.questionId, version: c.version, confidence: scoreFor(request.claim, c) }));
}

function episodeOrder(item: PoolItem): number {
  return item.entry.topic === 'KEBERADAAN' ? 0 : item.entry.topic === 'LAMA_RAWAT' ? 1 : 2;
}

/**
 * Next question of an adaptive session. Presence first (it frames everything else), then the length of
 * stay unless the participant said they did not stay, then procedures: by predicted chance of a definite
 * answer, or, once the fraud indication is at the medium level or above (the level comes with the
 * request, read from the configured thresholds), by how observable the experience is, to confirm with
 * the clearest question left. Ties keep the verifier's order.
 */
export function nextSync(request: NextQuestionRequest): NextQuestionResponse {
  const skipped: NextQuestionResponse['skipped'] = [];
  const notStayed = request.history.some((h) => h.topic === 'KEBERADAAN' && h.strength === 'BERTENTANGAN');
  const eligible = request.pool.filter((p) => {
    if (notStayed && p.entry.topic === 'LAMA_RAWAT') {
      skipped.push({ questionId: p.questionId, reason: 'Peserta menyatakan tidak menginap, jadi jumlah malam tidak relevan ditanyakan.' });
      return false;
    }
    return true;
  });
  if (eligible.length === 0 || request.remaining <= 0) return { next: null, skipped };
  const confirming = request.scores.level !== 'RENDAH';
  const scored = eligible.map((p) => ({ p, score: p.priorConfidence ?? scoreFor(request.claim, p), obs: p.entry.observability ?? DEFAULT_OBSERVABILITY }));
  scored.sort(
    (a, b) =>
      episodeOrder(a.p) - episodeOrder(b.p) ||
      (confirming ? b.obs - a.obs : 0) ||
      b.score - a.score ||
      a.p.order - b.p.order,
  );
  const best = scored[0];
  const asked = request.history.length;
  let rationale: string;
  if (best.p.entry.topic === 'KEBERADAAN') rationale = 'Kehadiran dan menginap ditanyakan lebih dulu karena menjadi dasar pertanyaan lain.';
  else if (best.p.entry.topic === 'LAMA_RAWAT') rationale = `Lama menginap ditanyakan setelah ${asked} jawaban; klaim mencatat ${request.claim.claimedNights ?? '–'} malam.`;
  else if (confirming)
    rationale = `${FRAUD_LEVEL_LABEL[request.scores.level]} (${formatNumber(request.scores.indication, 2)}; ambang sedang ${formatNumber(request.thresholds.medium, 2)}, tinggi ${formatNumber(request.thresholds.high, 2)}); dipilih pengalaman paling mudah dikenali (observabilitas ${formatNumber(best.obs, 2)}) dari ${eligible.length} pertanyaan tersisa untuk konfirmasi.`;
  else rationale = `Peluang jawaban pasti tertinggi (${formatNumber(best.score, 2)}) dari ${eligible.length} pertanyaan tersisa.`;
  return { next: { questionId: best.p.questionId, version: best.p.version, predictedDefinite: best.score, rationale }, skipped };
}

/** How the question places the participant in time and place, by type of care. */
function stayPhrase(careType: CareType): { at: string; during: string } {
  return careType === 'RAWAT_JALAN' ? { at: 'Saat berobat di {faskes}', during: 'saat berobat' } : { at: 'Selama dirawat di {faskes}', during: 'selama dirawat' };
}

const GENERIC_BY_CATEGORY: Record<string, { text: (at: string) => string; experience: string }> = {
  Operasi: {
    text: (at) => `${at}, apakah Anda pernah dibawa ke kamar operasi dan dibius?`,
    experience: 'Dibawa ke kamar operasi dan dibius',
  },
  Darah: {
    text: (at) => `${at}, apakah ada cairan dari kantong darah yang dialirkan ke tubuh Anda?`,
    experience: 'Cairan dari kantong darah dialirkan ke tubuh',
  },
};

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** The model's own option scores, used only when no reference entry shows how similar options were scored. */
const SCORE_PRIOR = { BERTENTANGAN: 0.6, SEBAGIAN: 0.2 } as const;

function unsure(): AnswerOption {
  return { id: 'TIDAK_INGAT', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, fraudScore: 0, unsure: true };
}

function fixed(id: string, label: string, strength: 'KUAT' | 'SEBAGIAN' | 'BERTENTANGAN', fraudScore = 0): AnswerOption {
  return { id, label, mapping: { kind: 'TETAP', strength }, fraudScore };
}

/** The entry the mapping matched first (it was the closest the dictionary had), then same category, then same code family; at most three. */
function referencesFor(request: DraftRequest): DraftReference[] {
  const { code, category } = request.target;
  const family = code.split('.')[0];
  const usable = request.dictionary.filter((r) => r.entry.scope === 'PROSEDUR' && r.entry.status === 'AKTIF' && r.entry.code !== code);
  const matched = usable.find((r) => r.entry.id === request.analysis?.matchedEntryId);
  const rest = usable
    .filter((r) => r !== matched)
    .map((r) => ({ r, w: (r.entry.category === category ? 2 : 0) + (r.entry.code?.split('.')[0] === family ? 1 : 0) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || (a.r.entry.code ?? '').localeCompare(b.r.entry.code ?? ''))
    .map((x) => x.r);
  return [...(matched ? [matched] : []), ...rest].slice(0, 3);
}

/** Mean fraud score of the reference options with this strength (denials excluded), or null when none has one. */
function referenceScore(references: readonly DraftReference[], strength: 'BERTENTANGAN' | 'SEBAGIAN'): number | null {
  const scores = references.flatMap((r) => r.options.filter((o) => o.mapping.kind === 'TETAP' && o.mapping.strength === strength && !o.denial && o.fraudScore > 0).map((o) => o.fraudScore));
  return scores.length ? round2(clamp(scores.reduce((a, b) => a + b, 0) / scores.length, 0.05, 0.95)) : null;
}

export function draftSync(request: DraftRequest): DraftResponse {
  const { target, variant, claim, analysis } = request;
  const phrase = stayPhrase(claim?.careType ?? 'RAWAT_INAP');
  const ref = findProcedure(target.code);
  const experiences = ref?.experiences ?? [];
  // The catalogue's term list when there is one; otherwise at least the coded name itself.
  const avoidTerms = ref?.avoidTerms ?? [target.name];
  const references = referencesFor(request);
  const generic = GENERIC_BY_CATEGORY[target.category];
  const found = experiences.length > 0;
  const line = analysis ? claim?.procedures.find((p) => p.lineId === analysis.lineId) : undefined;
  // Billed more than once: a participant who had it only once partly supports the claim and contradicts the quantity.
  const several = (line?.quantity ?? 1) > 1;

  const refContra = referenceScore(references, 'BERTENTANGAN');
  const refPartial = referenceScore(references, 'SEBAGIAN');
  const contra = refContra ?? SCORE_PRIOR.BERTENTANGAN;
  const partial = refPartial ?? SCORE_PRIOR.SEBAGIAN;
  const no = (id: string, label: string) => fixed(id, label, 'BERTENTANGAN', contra);
  const once = several ? [fixed('HANYA_SEKALI', 'Pernah, tetapi hanya sekali', 'SEBAGIAN', contra)] : [];

  let text: string;
  let options: AnswerOption[];
  let usedExperiences: string[];
  const v = variant % 3;
  if (found) {
    const [e1, e2] = experiences;
    usedExperiences = experiences;
    if (v === 0) {
      text = `${phrase.at}, apakah Anda ingat ${lowerFirst(e1)}?`;
      options = [
        fixed('YA', 'Ya, saya ingat mengalaminya', 'KUAT'),
        ...once,
        fixed('MIRIP', 'Pernah, tetapi tidak persis seperti itu', 'SEBAGIAN', partial),
        no('TIDAK', 'Tidak, hal itu tidak pernah terjadi'),
        unsure(),
      ];
    } else if (v === 1) {
      text = `${phrase.at} pada {periode}, mana yang paling sesuai dengan yang Anda alami?`;
      options = [
        fixed('PENGALAMAN_1', e1, 'KUAT'),
        ...(e2 ? [fixed('PENGALAMAN_2', e2, 'KUAT')] : []),
        ...once,
        no('TIDAK_ADA', 'Tidak ada yang seperti itu'),
        unsure(),
      ];
    } else {
      text = `Ingatkah Anda mengalami hal ini ${phrase.during}: ${lowerFirst(e1)}${e2 ? `, lalu ${lowerFirst(e2)}` : ''}?`;
      options = [fixed('YA', 'Ya, saya mengalaminya', 'KUAT'), ...once, no('TIDAK', 'Tidak pernah'), unsure()];
    }
  } else if (generic) {
    usedExperiences = [generic.experience];
    text = generic.text(phrase.at);
    options = [fixed('YA', 'Ya, pernah', 'KUAT'), ...once, no('TIDAK', 'Tidak pernah'), unsure()];
  } else {
    // No lay description available: return a template the verifier must complete, never invented detail.
    usedExperiences = [];
    text = `${phrase.at}, apakah Anda menjalani [jelaskan "${target.name}" dengan bahasa sehari-hari]?`;
    options = [fixed('YA', 'Ya, pernah', 'KUAT'), ...once, no('TIDAK', 'Tidak pernah'), unsure()];
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

  const matched = analysis?.matchedEntryId ? references.find((r) => r.entry.id === analysis.matchedEntryId) : undefined;
  const usesPartial = options.some((o) => o.id === 'MIRIP');
  const parts = [
    found
      ? `Pengalaman pasien diambil dari katalog referensi simulasi untuk kode ${target.code} (belum divalidasi klinisi).`
      : generic
        ? `Tidak ada deskripsi pengalaman untuk kode ${target.code}; draf dibuat dari kategori "${target.category}" saja.`
        : `Tidak ada deskripsi pengalaman untuk kode ${target.code}; draf berupa templat yang wajib dilengkapi verifikator.`,
    analysis
      ? matched
        ? `Pemetaan klaim mencocokkan baris ini ke entri ${matched.entry.code} (${MATCH_TYPE_LABEL[analysis.matchType].toLowerCase()}, relevansi ${formatNumber(analysis.relevance, 2)}); entri itu dipakai sebagai rujukan pertama.`
        : `Pemetaan klaim tidak menemukan entri kamus yang cocok untuk baris ini.`
      : null,
    references.length
      ? `Struktur pilihan jawaban mengikuti entri kamus ${references.map((r) => r.entry.code).join(', ')} (mendukung / bertentangan / "Tidak ingat").`
      : 'Tidak ada entri kamus sejenis sebagai rujukan.',
    `Skor fraud per pilihan: bertentangan ${formatNumber(contra, 2)} (${refContra === null ? 'nilai awal model' : 'rata-rata pilihan bertentangan di entri rujukan'})${usesPartial ? `, sebagian ${formatNumber(partial, 2)} (${refPartial === null ? 'nilai awal model' : 'rata-rata pilihan sebagian di entri rujukan'})` : ''}, mendukung dan "Tidak ingat" 0.`,
    several ? `Klaim menagih tindakan ini ${line!.quantity} kali, jadi ada pilihan "hanya sekali" dengan skor fraud setara bantahan.` : null,
    `Varian templat ${v + 1} dari 3.`,
  ].filter((x): x is string => x !== null);

  return {
    proposal: { text, options, experiences: usedExperiences, avoidTerms },
    confidence,
    rationale: parts.join(' '),
    referenceEntryIds: references.map((r) => r.entry.id),
    experienceSourceFound: found,
    claimAttributes: [
      'kode tindakan',
      'nama tindakan',
      'kategori layanan',
      ...(claim ? ['jenis rawat'] : []),
      ...(several ? ['jumlah tindakan'] : []),
      ...(matched ? ['hasil pemetaan kamus'] : []),
    ],
  };
}

export const simulatedAi: QuestionAi = {
  info: SIMULATED_MODEL,
  rank: async (request) => rankSync(request),
  next: async (request) => nextSync(request),
  draft: async (request) => draftSync(request),
};
