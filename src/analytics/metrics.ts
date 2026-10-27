import { findProcedure } from '../ai/reference';
import { claimedNights, strengthOf, type EvidenceStatus } from '../domain/evidence';
import { claimEvidence, getEntry, getQuestion, getVersion, sessionFor, answersOf } from '../domain/queries';
import type { ClaimStatus, Db, DecisionOutcome, QuestionOrigin, Strength } from '../domain/types';
import { ageOn } from '../lib/format';
import { brier, describe, ece, spearman, wilson, type Correlation, type Describe, type Proportion } from './stats';

// Every number on the analytics page is derived here from the operational records (claims, mappings,
// suggestions, assignments, sessions, answers). Nothing is stored separately, so the page always agrees
// with what verifiers and participants did.

/** Below these sample sizes the page shows "data belum cukup" instead of an estimate. */
export const MIN_N = 30;
export const MIN_BIN_N = 10;

export const BANDS: { lo: number; hi: number; label: string }[] = [
  { lo: 0, hi: 0.5, label: '< 0,50' },
  { lo: 0.5, hi: 0.6, label: '0,50–0,59' },
  { lo: 0.6, hi: 0.7, label: '0,60–0,69' },
  { lo: 0.7, hi: 0.8, label: '0,70–0,79' },
  { lo: 0.8, hi: 0.9, label: '0,80–0,89' },
  { lo: 0.9, hi: 1.01, label: '≥ 0,90' },
];

export function bandOf(x: number): number {
  return BANDS.findIndex((b) => x >= b.lo && x < b.hi);
}

export type ItemOutcome = 'PASTI' | 'TIDAK_INGAT' | 'DILEWATI' | 'TANPA_RESPONS' | 'MENUNGGU';

/** One published question on one claim (final rounds only) and what came of it. */
export interface ItemFact {
  claimId: string;
  assignmentId: string;
  questionId: string;
  version: number;
  origin: QuestionOrigin;
  entryId: string;
  entryName: string;
  entryCode: string | null;
  scope: 'EPISODE' | 'PROSEDUR';
  observability: number | null;
  aiConfidence: number | null;
  outcome: ItemOutcome;
  optionId: string | null;
  optionLabel: string | null;
  strength: Strength | null;
  age: number;
  publishedAt: string;
}

export function itemFacts(db: Db): ItemFact[] {
  const facts: ItemFact[] = [];
  for (const a of db.assignments) {
    if (a.status === 'DIGANTIKAN') continue;
    const claim = db.claims.find((c) => c.id === a.claimId)!;
    const participant = db.participants.find((p) => p.id === a.participantId)!;
    const session = sessionFor(db, a.id);
    const answers = session ? answersOf(db, session.id) : [];
    const nights = claimedNights(claim);
    for (const item of a.items) {
      const question = getQuestion(db, item.questionId);
      const entry = getEntry(db, question.entryId);
      const version = getVersion(db, item.questionId, item.questionVersion);
      const suggestion = item.suggestionId ? db.suggestions.find((s) => s.id === item.suggestionId) : undefined;
      const answer = answers.find((x) => x.questionId === item.questionId);
      const option = answer?.optionId ? version.options.find((o) => o.id === answer.optionId) : undefined;
      let outcome: ItemOutcome;
      if (session) outcome = !answer || answer.status === 'DILEWATI' ? 'DILEWATI' : option?.unsure ? 'TIDAK_INGAT' : 'PASTI';
      else outcome = a.status === 'AKTIF' ? 'MENUNGGU' : 'TANPA_RESPONS';
      facts.push({
        claimId: claim.id,
        assignmentId: a.id,
        questionId: item.questionId,
        version: item.questionVersion,
        origin: version.origin,
        entryId: entry.id,
        entryName: entry.name,
        entryCode: entry.code,
        scope: entry.scope,
        observability: entry.observability,
        aiConfidence: suggestion?.aiConfidence ?? null,
        outcome,
        optionId: option?.id ?? null,
        optionLabel: option?.label ?? null,
        strength: option ? strengthOf(option, nights) : null,
        age: ageOn(participant.birthDate, claim.admissionDate),
        publishedAt: a.publishedAt,
      });
    }
  }
  return facts;
}

const answered = (f: ItemFact) => f.outcome === 'PASTI' || f.outcome === 'TIDAK_INGAT';

function isoWeek(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-M${String(week).padStart(2, '0')}`;
}

function hoursBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 3_600_000;
}

export interface QuestionRow {
  questionId: string;
  entryName: string;
  entryCode: string | null;
  scope: 'EPISODE' | 'PROSEDUR';
  versions: number[];
  published: number;
  settled: number;
  answered: number;
  unanswered: Proportion;
  unsure: Proportion;
  contradiction: Proportion;
  options: { label: string; count: number; strength: Strength | null }[];
}

export interface GroupRow {
  key: string;
  label: string;
  definite: Proportion;
  contradiction: Proportion;
  unsure: Proportion;
}

export interface Recommendation {
  kind: 'CELAH_KAMUS' | 'TIDAK_INGAT_TINGGI' | 'KALIBRASI' | 'RELEVANSI_RENDAH';
  text: string;
  basis: string;
  link?: string;
}

export function computeAnalytics(db: Db, now: string = new Date().toISOString()) {
  const facts = itemFacts(db);
  const claims = db.claims;

  // ── Operations ────────────────────────────────────────────────────────────
  const byStatus = claims.reduce<Partial<Record<ClaimStatus, number>>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  const decisions = claims.reduce<Partial<Record<DecisionOutcome, number>>>((m, c) => (c.decision ? { ...m, [c.decision.outcome]: (m[c.decision.outcome] ?? 0) + 1 } : m), {});
  const firstRound = (claimId: string) => db.assignments.filter((a) => a.claimId === claimId).sort((a, b) => a.round - b.round)[0];
  const toPublish = claims.flatMap((c) => {
    const a = firstRound(c.id);
    return a ? [hoursBetween(c.submittedAt, a.publishedAt)] : [];
  });
  const settledRounds = db.assignments.filter((a) => a.status === 'DIJAWAB' || a.status === 'DITUTUP');
  const responded = settledRounds.filter((a) => a.status === 'DIJAWAB');
  const toResponse = responded.map((a) => hoursBetween(a.publishedAt, sessionFor(db, a.id)!.submittedAt));
  const weeks = new Map<string, { week: string; submitted: number; published: number; responded: number; settled: number }>();
  for (const c of claims) {
    const w = isoWeek(c.submittedAt);
    const row = weeks.get(w) ?? { week: w, submitted: 0, published: 0, responded: 0, settled: 0 };
    row.submitted += 1;
    const a = firstRound(c.id);
    if (a) row.published += 1;
    const rounds = db.assignments.filter((x) => x.claimId === c.id && (x.status === 'DIJAWAB' || x.status === 'DITUTUP'));
    if (rounds.length) {
      row.settled += 1;
      if (rounds.some((x) => x.status === 'DIJAWAB')) row.responded += 1;
    }
    weeks.set(w, row);
  }
  const weekly = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ ...w, responseRate: wilson(w.responded, w.settled) }));

  // ── Coverage of the dictionary ───────────────────────────────────────────
  const lines = db.mappings.filter((m) => m.target.kind === 'PROSEDUR');
  const claimsWithLines = new Set(lines.map((m) => m.claimId));
  const claimsWithGap = new Set(lines.filter((m) => m.status !== 'TERPETAKAN').map((m) => m.claimId));
  const publishedClaims = new Set(db.assignments.map((a) => a.claimId));
  const procedureCovered = claims.filter((c) => {
    const a = db.assignments.filter((x) => x.claimId === c.id && x.status !== 'DIGANTIKAN').sort((x, y) => y.round - x.round)[0];
    if (!a || c.procedures.length === 0) return false;
    return a.items.some((i) => getEntry(db, getQuestion(db, i.questionId).entryId).scope === 'PROSEDUR');
  }).length;
  const coverage = {
    lines: lines.length,
    mapped: lines.filter((m) => m.status === 'TERPETAKAN').length,
    belowThreshold: lines.filter((m) => m.status === 'DI_BAWAH_AMBANG').length,
    unmatched: lines.filter((m) => m.status === 'TIDAK_TERPETAKAN').length,
    claimsWithLines: claimsWithLines.size,
    claimsWithGap: claimsWithGap.size,
    claimsFullyMapped: claimsWithLines.size - claimsWithGap.size,
    publishedWithLines: [...claimsWithLines].filter((id) => publishedClaims.has(id)).length,
    procedureCovered,
  };

  // ── AI confidence ────────────────────────────────────────────────────────
  const scores = db.suggestions.map((s) => s.aiConfidence);
  const confidence = {
    all: describe(scores),
    kamus: describe(db.suggestions.filter((s) => s.source === 'PEMETAAN_KAMUS').map((s) => s.aiConfidence)),
    procedure: describe(db.suggestions.filter((s) => getEntry(db, getQuestion(db, s.questionId).entryId).scope === 'PROSEDUR').map((s) => s.aiConfidence)),
    episode: describe(db.suggestions.filter((s) => getEntry(db, getQuestion(db, s.questionId).entryId).scope === 'EPISODE').map((s) => s.aiConfidence)),
    scores,
  };
  const acted = db.suggestions.filter((s) => s.verifierAction !== null);
  const acceptance = BANDS.map((band, i) => {
    const inBand = acted.filter((s) => bandOf(s.aiConfidence) === i);
    const kept = inBand.filter((s) => s.verifierAction !== 'DIHAPUS').length;
    return {
      band: band.label,
      n: inBand.length,
      accepted: inBand.filter((s) => s.verifierAction === 'DITERIMA').length,
      edited: inBand.filter((s) => s.verifierAction === 'DISUNTING').length,
      removed: inBand.filter((s) => s.verifierAction === 'DIHAPUS').length,
      preselected: inBand.filter((s) => s.preselected).length,
      kept: wilson(kept, inBand.length),
    };
  });
  const keptBySelection = {
    preselected: wilson(acted.filter((s) => s.preselected && s.verifierAction !== 'DIHAPUS').length, acted.filter((s) => s.preselected).length),
    notPreselected: wilson(acted.filter((s) => !s.preselected && s.verifierAction !== 'DIHAPUS').length, acted.filter((s) => !s.preselected).length),
  };

  // Calibration against the declared event: a definite answer, among answered questions that carried a score.
  const scored = facts.filter((f) => f.aiConfidence !== null && answered(f));
  const pred = scored.map((f) => f.aiConfidence!);
  const obs = scored.map((f) => (f.outcome === 'PASTI' ? 1 : 0));
  const calibrationBins = BANDS.map((band, i) => {
    const inBand = scored.filter((f) => bandOf(f.aiConfidence!) === i);
    const k = inBand.filter((f) => f.outcome === 'PASTI').length;
    const p = wilson(k, inBand.length);
    return { band: band.label, n: inBand.length, meanPred: inBand.length ? inBand.reduce((a, f) => a + f.aiConfidence!, 0) / inBand.length : null, observed: p.p, ci: p };
  });
  const calibration = {
    n: scored.length,
    sufficient: scored.length >= MIN_N,
    bins: calibrationBins,
    brier: scored.length >= MIN_N ? brier(pred, obs) : null,
    ece: scored.length >= MIN_N ? ece(calibrationBins) : null,
    meanPred: pred.length ? pred.reduce((a, b) => a + b, 0) / pred.length : null,
    observed: wilson(obs.filter((x) => x === 1).length, obs.length),
    correlation: spearman(pred, obs) as Correlation | null,
    pairs: scored.map((f) => ({ confidence: f.aiConfidence!, definite: f.outcome === 'PASTI' })),
  };

  // ── Responses per question ───────────────────────────────────────────────
  const settled = facts.filter((f) => f.outcome !== 'MENUNGGU');
  const byQuestion = new Map<string, ItemFact[]>();
  for (const f of facts) byQuestion.set(f.questionId, [...(byQuestion.get(f.questionId) ?? []), f]);
  const questions: QuestionRow[] = [...byQuestion.entries()]
    .map(([questionId, fs]) => {
      const st = fs.filter((f) => f.outcome !== 'MENUNGGU');
      const ans = st.filter(answered);
      const optionCounts = new Map<string, { label: string; count: number; strength: Strength | null }>();
      for (const f of ans) {
        const key = f.optionLabel ?? '?';
        const prev = optionCounts.get(key);
        optionCounts.set(key, { label: key, count: (prev?.count ?? 0) + 1, strength: f.strength });
      }
      return {
        questionId,
        entryName: fs[0].entryName,
        entryCode: fs[0].entryCode,
        scope: fs[0].scope,
        versions: [...new Set(fs.map((f) => f.version))].sort(),
        published: fs.length,
        settled: st.length,
        answered: ans.length,
        unanswered: wilson(st.filter((f) => f.outcome === 'TANPA_RESPONS' || f.outcome === 'DILEWATI').length, st.length),
        unsure: wilson(ans.filter((f) => f.outcome === 'TIDAK_INGAT').length, ans.length),
        contradiction: wilson(ans.filter((f) => f.strength === 'BERTENTANGAN').length, ans.length),
        options: [...optionCounts.values()].sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => (a.scope === b.scope ? b.published - a.published : a.scope === 'EPISODE' ? -1 : 1));

  const group = (key: string, label: string, fs: ItemFact[]): GroupRow => {
    const ans = fs.filter(answered);
    return {
      key,
      label,
      definite: wilson(ans.filter((f) => f.outcome === 'PASTI').length, ans.length),
      contradiction: wilson(ans.filter((f) => f.strength === 'BERTENTANGAN').length, ans.length),
      unsure: wilson(ans.filter((f) => f.outcome === 'TIDAK_INGAT').length, ans.length),
    };
  };
  const procedureFacts = settled.filter((f) => f.scope === 'PROSEDUR');
  const byOrigin: GroupRow[] = [
    group('KAMUS_AWAL', 'Kamus awal', procedureFacts.filter((f) => f.origin === 'KAMUS_AWAL')),
    group('SUNTINGAN_VERIFIKATOR', 'Disunting verifikator', procedureFacts.filter((f) => f.origin === 'SUNTINGAN_VERIFIKATOR')),
    group('DRAF_AI', 'Dari draf AI (disunting atau tidak)', procedureFacts.filter((f) => f.origin === 'DRAF_AI' || f.origin === 'DRAF_AI_DISUNTING')),
  ];
  const byAge: GroupRow[] = [
    group('<40', '< 40 tahun', settled.filter((f) => f.age < 40)),
    group('40-64', '40–64 tahun', settled.filter((f) => f.age >= 40 && f.age < 65)),
    group('65+', '65 tahun ke atas', settled.filter((f) => f.age >= 65)),
  ];
  const byObservability: GroupRow[] = [
    group('<0.9', 'Observabilitas < 0,90', procedureFacts.filter((f) => f.observability !== null && f.observability < 0.9)),
    group('>=0.9', 'Observabilitas ≥ 0,90', procedureFacts.filter((f) => f.observability !== null && f.observability >= 0.9)),
    group('null', 'Belum dinilai (entri baru)', procedureFacts.filter((f) => f.observability === null)),
  ];

  // ── Data quality and consistency ─────────────────────────────────────────
  // "Went home the same day" together with a number of nights is internally inconsistent.
  const topicOf = (questionId: string) => getEntry(db, getQuestion(db, questionId).entryId).topic;
  let nightsInconsistent = 0;
  let nightsChecked = 0;
  for (const s of db.sessions) {
    const ans = answersOf(db, s.id);
    const stayAnswer = ans.find((a) => topicOf(a.questionId) === 'KEBERADAAN');
    const nightsAnswer = ans.find((a) => topicOf(a.questionId) === 'LAMA_RAWAT');
    if (stayAnswer?.optionId && nightsAnswer?.optionId) {
      const stayOption = getVersion(db, stayAnswer.questionId, stayAnswer.questionVersion).options.find((o) => o.id === stayAnswer.optionId);
      const nightsOption = getVersion(db, nightsAnswer.questionId, nightsAnswer.questionVersion).options.find((o) => o.id === nightsAnswer.optionId);
      const stay = stayOption?.mapping.kind === 'TETAP' && stayOption.mapping.strength === 'BERTENTANGAN' && !stayOption.denial;
      nightsChecked += 1;
      if (stay && nightsOption?.mapping.kind === 'RENTANG_MALAM') nightsInconsistent += 1;
    }
  }
  const quality = {
    nightsInconsistent: wilson(nightsInconsistent, nightsChecked),
    skipped: db.answers.filter((a) => a.status === 'DILEWATI').length,
    fristaChecks: db.fristaChecks.length,
    fristaMismatch: db.fristaChecks.filter((f) => f.result === 'TIDAK_COCOK').length,
    fristaUnavailable: db.fristaChecks.filter((f) => f.result === 'LAYANAN_TIDAK_TERSEDIA').length,
    routedToPhone: claims.filter((c) => db.statusHistory.some((s) => s.claimId === c.id && s.to === 'PERLU_KONTAK')).length,
    declined: claims.filter((c) => db.statusHistory.some((s) => s.claimId === c.id && s.to === 'DITOLAK_PESERTA')).length,
    expired: claims.filter((c) => db.statusHistory.some((s) => s.claimId === c.id && s.to === 'TIDAK_DIJAWAB')).length,
    noResponse: wilson(settledRounds.length - responded.length, settledRounds.length),
    unpublishedOver2Days: claims.filter((c) => c.status === 'DIAJUKAN' && hoursBetween(c.submittedAt, now) > 48).length,
    answeredUndecided: claims.filter((c) => c.status === 'JAWABAN_DITERIMA').length,
    manualQuestions: facts.filter((f) => f.aiConfidence === null).length,
  };

  // ── Outcomes: the verifier's decisions next to the evidence reading ──────
  const outcomeTable: { evidence: EvidenceStatus | 'TANPA_JAWABAN'; decision: DecisionOutcome | 'BELUM'; count: number }[] = [];
  for (const c of claims) {
    if (c.status === 'DIAJUKAN' || c.status === 'MENUNGGU_PESERTA') continue;
    const ev = claimEvidence(db, c);
    const evidence = ev?.result?.status ?? 'TANPA_JAWABAN';
    const decision = c.decision?.outcome ?? 'BELUM';
    const row = outcomeTable.find((r) => r.evidence === evidence && r.decision === decision);
    if (row) row.count += 1;
    else outcomeTable.push({ evidence, decision, count: 1 });
  }

  // ── System suggestions (rule-based; for review, not conclusions) ─────────
  const recommendations: Recommendation[] = [];
  const gapCounts = new Map<string, { name: string; claims: Set<string> }>();
  for (const m of lines.filter((x) => x.status !== 'TERPETAKAN')) {
    if (m.target.kind !== 'PROSEDUR') continue;
    const g = gapCounts.get(m.target.code) ?? { name: findProcedure(m.target.code)?.name ?? m.target.name, claims: new Set<string>() };
    g.claims.add(m.claimId);
    gapCounts.set(m.target.code, g);
  }
  for (const [code, g] of [...gapCounts.entries()].sort((a, b) => b[1].claims.size - a[1].claims.size)) {
    if (g.claims.size < 3) continue;
    const last = db.drafts.filter((d) => d.target.code === code).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
    recommendations.push({
      kind: 'CELAH_KAMUS',
      text: `Kode ${code} (${g.name}) ada di ${g.claims.size} klaim tanpa entri kamus yang relevan, sehingga tindakan itu tidak pernah ditanyakan.`,
      basis: last ? `Draf AI terakhir ${last.id} berstatus ${last.status.toLowerCase()}. Tinjau ulang apakah tindakan ini membedakan.` : 'Belum pernah ada draf AI. Pertimbangkan Tanya AI di Kamus → Celah cakupan.',
      link: '/verifikator/kamus',
    });
  }
  for (const q of questions) {
    if (q.unsure.n >= MIN_BIN_N && q.unsure.lo !== null && q.unsure.lo >= 0.15) {
      recommendations.push({
        kind: 'TIDAK_INGAT_TINGGI',
        text: `"${q.entryName}" dijawab "Tidak ingat" ${Math.round(q.unsure.p! * 100)}% (n = ${q.unsure.n}; IK95% ${Math.round(q.unsure.lo * 100)}–${Math.round(q.unsure.hi! * 100)}%).`,
        basis: 'Batas bawah interval ≥ 15%. Kalimat atau pilihan jawaban mungkin perlu ditinjau; penyebabnya belum diketahui.',
        link: `/verifikator/kamus/${db.questions.find((x) => x.id === q.questionId)?.entryId ?? ''}`,
      });
    }
  }
  for (const b of calibrationBins) {
    if (b.n >= MIN_BIN_N && b.meanPred !== null && b.ci.lo !== null && b.ci.hi !== null && (b.meanPred > b.ci.hi || b.meanPred < b.ci.lo)) {
      recommendations.push({
        kind: 'KALIBRASI',
        text: `Pada keyakinan ${b.band}, rata-rata skor ${b.meanPred.toFixed(2).replace('.', ',')} berada di luar IK95% jawaban pasti yang teramati (${Math.round(b.ci.lo * 100)}–${Math.round(b.ci.hi * 100)}%, n = ${b.n}).`,
        basis: `Skor ${b.meanPred > b.ci.hi ? 'lebih tinggi' : 'lebih rendah'} dari kenyataan di rentang ini. Ini temuan tentang skor simulasi, bukan tentang klaim.`,
      });
    }
  }
  const lowRel = db.suggestions.filter((s) => s.verifierAction && db.mappings.find((m) => m.id === s.mappingId)?.status === 'DI_BAWAH_AMBANG');
  if (lowRel.length >= MIN_BIN_N) {
    const removed = wilson(lowRel.filter((s) => s.verifierAction === 'DIHAPUS').length, lowRel.length);
    recommendations.push({
      kind: 'RELEVANSI_RENDAH',
      text: `Usulan dari kecocokan di bawah ambang relevansi dihapus verifikator ${Math.round(removed.p! * 100)}% (n = ${removed.n}).`,
      basis: 'Pencocokan kode induk mungkin terlalu longgar untuk kode-kode ini; lihat Celah cakupan.',
    });
  }

  return {
    totals: { claims: claims.length, suggestions: db.suggestions.length, assignments: db.assignments.length, sessions: db.sessions.length, answers: db.answers.length, items: facts.length },
    operations: {
      byStatus,
      decisions,
      decided: claims.filter((c) => c.decision).length,
      hoursToPublish: describe(toPublish),
      hoursToResponse: describe(toResponse),
      responseRate: wilson(responded.length, settledRounds.length),
      weekly,
    },
    coverage,
    confidence,
    acceptance,
    keptBySelection,
    calibration,
    questions,
    byOrigin,
    byAge,
    byObservability,
    quality,
    outcomeTable,
    recommendations,
  };
}

export type Analytics = ReturnType<typeof computeAnalytics>;
export type { Describe };
