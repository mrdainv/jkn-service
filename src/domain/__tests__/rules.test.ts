import { describe, expect, it } from 'vitest';
import type { DraftReference, DraftRequest, NextQuestionRequest, PoolItem } from '../../ai/service';
import { draftSync, nextSync, rankSync } from '../../ai/simulatedAi';
import { checkQuestion, checksPass, optionScoreProblem } from '../checks';
import { claimedNights, evidenceStatus, strengthOf } from '../evidence';
import { bestMatch, mappingStatus } from '../mapping';
import type { AnswerOption, DictionaryEntry, VerificationScores } from '../types';
import { combineScores, EMPTY_SCORES, evaluateAnswer, fraudLevel, stopAfterAnswer } from '../verification';

const entry = (code: string, name: string): DictionaryEntry => ({
  id: `KMS-${code}`, scope: 'PROSEDUR', topic: null, code, name, category: 'Tindakan', experiences: [], avoidTerms: [],
  observability: 0.9, source: 'KAMUS_AWAL', aiDraftId: null, createdAt: '2026-01-01T00:00:00Z', status: 'AKTIF',
});

const T = { medium: 0.3, high: 0.7 };
const scores = (indication: number, answered: number, t = T): VerificationScores => ({ indication, support: 0, answered, definite: answered, level: fraudLevel(indication, t) });

describe('Table 1 and Table 2', () => {
  const nights: AnswerOption = { id: 'N2_3', label: '2–3 malam', mapping: { kind: 'RENTANG_MALAM', min: 2, max: 3 }, fraudScore: 0.4 };
  it('reads night ranges against the claimed stay', () => {
    expect(strengthOf(nights, 3)).toBe('KUAT');
    expect(strengthOf(nights, 5)).toBe('BERTENTANGAN');
    expect(strengthOf(nights, null)).toBe('NETRAL');
    expect(claimedNights({ careType: 'RAWAT_INAP', admissionDate: '2026-10-22', dischargeDate: '2026-10-25' })).toBe(3);
  });

  it('reads the case through the configured fraud level and never treats "Tidak ingat" as a rebuttal', () => {
    expect(evidenceStatus({ level: 'TINGGI', supported: true })).toMatchObject({ status: 'PERLU_DIPERIKSA', priority: true, rule: 1 });
    expect(evidenceStatus({ level: 'SEDANG', supported: true })).toMatchObject({ status: 'PERLU_DIPERIKSA', priority: false, rule: 2 });
    expect(evidenceStatus({ level: 'RENDAH', supported: false }).status).toBe('BUKTI_TIDAK_CUKUP');
    expect(evidenceStatus({ level: 'RENDAH', supported: true }).status).toBe('KONSISTEN');
  });
});

describe('dictionary mapping', () => {
  const dict = [entry('87.44', 'Foto rontgen dada'), entry('93.96', 'Terapi oksigen'), entry('88.76', 'USG abdomen')];
  it('prefers exact codes, then code families, then names', () => {
    expect(bestMatch({ code: '87.44', name: 'x' }, dict)).toMatchObject({ entryId: 'KMS-87.44', matchType: 'KODE_TEPAT', relevance: 1 });
    expect(bestMatch({ code: '93.94', name: 'Terapi inhalasi' }, dict)).toMatchObject({ entryId: 'KMS-93.96', matchType: 'KODE_INDUK' });
    expect(bestMatch({ code: '47.09', name: 'Apendektomi' }, dict)).toMatchObject({ entryId: null, matchType: 'TIDAK_ADA' });
    // Same category only, no shared word: not a match (infusion is not a transfusion).
    expect(bestMatch({ code: '99.18', name: 'Infus cairan elektrolit' }, [entry('99.05', 'Transfusi trombosit')])).toMatchObject({ entryId: null, matchType: 'TIDAK_ADA' });
    expect(bestMatch({ code: '99.04', name: 'Transfusi sel darah merah' }, [entry('99.05', 'Transfusi trombosit')])).toMatchObject({ entryId: 'KMS-99.05', matchType: 'KODE_INDUK', relevance: 0.7 });
    expect(mappingStatus({ entryId: 'x', matchType: 'KODE_INDUK', relevance: 0.45 }, 0.5)).toBe('DI_BAWAH_AMBANG');
  });
});

describe('wording checks', () => {
  const options: AnswerOption[] = [
    { id: 'YA', label: 'Ya', mapping: { kind: 'TETAP', strength: 'KUAT' }, fraudScore: 0 },
    { id: 'TIDAK', label: 'Tidak', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, fraudScore: 0.6 },
    { id: 'TI', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, fraudScore: 0, unsure: true },
  ];
  it('rejects medical terms, billed numbers, claim words and missing "Tidak ingat"', () => {
    expect(checksPass(checkQuestion('Selama dirawat di {faskes}, apakah Anda difoto menempel di papan?', options, ['rontgen']))).toBe(true);
    const failed = (text: string, opts = options) => checkQuestion(text, opts, ['rontgen']).filter((c) => !c.ok).map((c) => c.id);
    expect(failed('Apakah Anda menjalani rontgen dada di rumah sakit?')).toContain('ISTILAH_MEDIS');
    expect(failed('Apakah Anda diterapi 10 kali selama dirawat?')).toContain('ANGKA');
    expect(failed('Apakah klaim layanan Anda sesuai dengan yang dialami?')).toContain('KATA_KLAIM');
    expect(failed('Apakah Anda menjalani [isi] selama dirawat?')).toContain('PLACEHOLDER');
    expect(failed('Apakah Anda difoto menempel di papan?', options.slice(0, 2))).toContain('OPSI_TIDAK_INGAT');
  });

  it('keeps every option score in line with its strength', () => {
    const text = 'Selama dirawat di {faskes}, apakah Anda difoto menempel di papan?';
    const withScore = (i: number, fraudScore: number) => options.map((o, k) => (k === i ? { ...o, fraudScore } : o));
    const failed = (opts: AnswerOption[]) => checkQuestion(text, opts, []).filter((c) => !c.ok).map((c) => c.id);
    expect(failed(withScore(0, 0.3))).toEqual(['SKOR_FRAUD']);
    expect(failed(withScore(1, 0))).toEqual(['SKOR_FRAUD']);
    expect(failed(withScore(1, 1))).toEqual(['SKOR_FRAUD']);
    expect(failed(withScore(2, 0.1))).toEqual(['SKOR_FRAUD']);
    expect(optionScoreProblem({ id: 'X', label: 'Tidak pernah ke sana', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, fraudScore: 0.9, denial: true })).toBe('penyangkalan harus 1');
    expect(optionScoreProblem({ id: 'S', label: 'Sebagian', mapping: { kind: 'TETAP', strength: 'SEBAGIAN' }, fraudScore: 0.3 })).toBeNull();
    expect(optionScoreProblem({ id: 'N', label: '1 malam', mapping: { kind: 'RENTANG_MALAM', min: 1, max: 1 }, fraudScore: 0 })).not.toBeNull();
  });
});

const claim = { claimKey: 'KLM-1', careType: 'RAWAT_INAP' as const, claimedNights: 3, diagnosis: { code: 'J18.9', name: 'Pneumonia' }, procedures: [{ lineId: 'L1', code: '87.44', name: 'Foto rontgen dada', quantity: 1 }] };

describe('answer evaluation and stop rules (rule-based)', () => {
  const yes: AnswerOption = { id: 'YA', label: 'Ya', mapping: { kind: 'TETAP', strength: 'KUAT' }, fraudScore: 0 };
  const no: AnswerOption = { id: 'TIDAK', label: 'Tidak', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, fraudScore: 0.6 };
  const wentHome: AnswerOption = { id: 'PULANG', label: 'Pulang di hari yang sama', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, fraudScore: 0.8 };
  const partly: AnswerOption = { id: 'SEBAGIAN', label: 'Hanya sekali', mapping: { kind: 'TETAP', strength: 'SEBAGIAN' }, fraudScore: 0.4 };
  const unsure: AnswerOption = { id: 'TI', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, fraudScore: 0, unsure: true };
  const never: AnswerOption = { id: 'TIDAK_PERNAH', label: 'Tidak pernah ke sana', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, fraudScore: 1, denial: true };
  const oneNight: AnswerOption = { id: 'N1', label: '1 malam', mapping: { kind: 'RENTANG_MALAM', min: 1, max: 1 }, fraudScore: 0.4 };
  const proc = { observability: 0.9 };

  it('scores the option that was chosen, weighted by the observability of what was asked', () => {
    expect(evaluateAnswer(yes, proc, 3)).toMatchObject({ strength: 'KUAT', reliability: 0.9, fraudScore: 0, supportWeight: 0.9, indicationWeight: 0 });
    expect(evaluateAnswer(no, proc, 3)).toMatchObject({ strength: 'BERTENTANGAN', fraudScore: 0.6, indicationWeight: 0.54 });
    // Two contradicting options of the same question weigh what each option carries, not what the question carries.
    expect(evaluateAnswer(wentHome, { observability: 0.97 }, 3).indicationWeight).toBe(0.78);
    expect(evaluateAnswer({ ...wentHome, fraudScore: 0.5 }, { observability: 0.97 }, 3).indicationWeight).toBe(0.49);
    // A partly supporting option can carry both support and a fraud signal.
    expect(evaluateAnswer(partly, proc, 3)).toMatchObject({ strength: 'SEBAGIAN', supportWeight: 0.45, indicationWeight: 0.36 });
    expect(evaluateAnswer(unsure, proc, 3)).toMatchObject({ strength: 'NETRAL', definite: false, reliability: 0, fraudScore: 0, indicationWeight: 0 });
    expect(evaluateAnswer(yes, { observability: null }, 3).reliability).toBe(0.55);
  });

  it('counts a night range only when the billed nights fall outside it', () => {
    expect(evaluateAnswer(oneNight, { observability: 0.85 }, 1)).toMatchObject({ strength: 'KUAT', fraudScore: 0, indicationWeight: 0 });
    expect(evaluateAnswer(oneNight, { observability: 0.85 }, 4)).toMatchObject({ strength: 'BERTENTANGAN', fraudScore: 0.4, indicationWeight: 0.34 });
    expect(evaluateAnswer(oneNight, { observability: 0.85 }, null)).toMatchObject({ strength: 'NETRAL', fraudScore: 0 });
  });

  it('reaches indication 1 only through a denial and reads the level from the thresholds', () => {
    const many = Array.from({ length: 8 }, () => evaluateAnswer(wentHome, { observability: 0.97 }, 3));
    expect(combineScores(many, T).indication).toBe(0.99);
    expect(combineScores([evaluateAnswer(yes, proc, 3), evaluateAnswer(never, { observability: 0.97 }, 3)], T)).toMatchObject({ indication: 1, level: 'TINGGI' });
    expect(combineScores([evaluateAnswer(no, proc, 3)], T)).toMatchObject({ indication: 0.54, level: 'SEDANG' });
    expect(combineScores([evaluateAnswer(no, proc, 3), evaluateAnswer(no, proc, 3)], T)).toMatchObject({ indication: 0.79, level: 'TINGGI' });
    // The same answers read differently under other thresholds: nothing about the levels is fixed in the rules.
    expect(combineScores([evaluateAnswer(no, proc, 3)], { medium: 0.6, high: 0.9 }).level).toBe('RENDAH');
    expect(combineScores([evaluateAnswer(no, proc, 3), evaluateAnswer(no, proc, 3)], { medium: 0.5, high: 1 }).level).toBe('SEDANG');
    expect(combineScores([], T)).toEqual(EMPTY_SCORES);
    expect(fraudLevel(0.3, T)).toBe('SEDANG');
    expect(fraudLevel(0.29, T)).toBe('RENDAH');
  });

  it('stops when the evaluation reaches the high level, then on the question limit', () => {
    const cfg = { maxQuestions: 3 };
    expect(stopAfterAnswer(scores(1, 1), cfg)).toBe('INDIKASI_TINGGI');
    expect(stopAfterAnswer(scores(0.7, 1), cfg)).toBe('INDIKASI_TINGGI');
    expect(stopAfterAnswer(scores(0.69, 2), cfg)).toBeNull();
    expect(stopAfterAnswer(scores(0.99, 2, { medium: 0.3, high: 1 }), cfg)).toBeNull();
    expect(stopAfterAnswer(scores(0, 3), cfg)).toBe('BATAS_PERTANYAAN');
  });
});

describe('simulated AI', () => {
  const candidate = { questionId: 'Q1', version: 1, entry: { id: 'E', scope: 'PROSEDUR' as const, topic: null, category: 'x', observability: 0.9 }, lineId: 'L1', relevance: 1 };

  it('is deterministic and keeps scores in [0, 1]', () => {
    const req = { claim, candidates: [candidate] };
    expect(rankSync(req)).toEqual(rankSync(req));
    expect(rankSync(req)[0].confidence).toBeGreaterThan(0);
    expect(rankSync(req)[0].confidence).toBeLessThan(1);
  });

  it('asks presence first, skips nights after "went home", and confirms with the clearest question after a contradiction', () => {
    const pool = (items: Partial<PoolItem>[]): PoolItem[] =>
      items.map((p, i) => ({ ...candidate, questionId: `Q${i}`, order: i + 1, priorConfidence: null, ...p }) as PoolItem);
    const episode = (topic: 'KEBERADAAN' | 'LAMA_RAWAT') => ({ entry: { id: topic, scope: 'EPISODE' as const, topic, category: 'Episode', observability: 0.9 }, lineId: null });
    const base: NextQuestionRequest = { claim, sessionKey: 'RSP-1', pool: [], history: [], scores: EMPTY_SCORES, thresholds: T, remaining: 5 };

    const first = nextSync({ ...base, pool: pool([{ priorConfidence: 0.95 }, { ...episode('LAMA_RAWAT') }, { ...episode('KEBERADAAN') }]) });
    expect(first.next?.questionId).toBe('Q2');

    const wentHome = { questionId: 'Q2', version: 1, topic: 'KEBERADAAN' as const, lineId: null, strength: 'BERTENTANGAN' as const, definite: true, denial: false, fraudScore: 0.8, indicationWeight: 0.78 };
    const after = nextSync({ ...base, pool: pool([{ priorConfidence: 0.5 }, { ...episode('LAMA_RAWAT') }]), history: [wentHome], thresholds: { medium: 0.3, high: 0.9 }, scores: scores(0.78, 1, { medium: 0.3, high: 0.9 }) });
    expect(after.skipped.map((x) => x.questionId)).toEqual(['Q1']);
    expect(after.next?.questionId).toBe('Q0');

    const procs = pool([
      { priorConfidence: 0.9, entry: { ...candidate.entry, observability: 0.6 } },
      { priorConfidence: 0.7, entry: { ...candidate.entry, observability: 0.98 } },
    ]);
    expect(nextSync({ ...base, pool: procs }).next?.questionId).toBe('Q0');
    // Confirming questions start at the medium level the system read from the configured thresholds.
    const confirming = nextSync({ ...base, pool: procs, scores: scores(0.5, 1) });
    expect(confirming.next?.questionId).toBe('Q1');
    expect(confirming.next?.rationale).toContain('ambang sedang 0,30');
    const below = { medium: 0.6, high: 0.9 };
    expect(nextSync({ ...base, pool: procs, thresholds: below, scores: scores(0.5, 1, below) }).next?.questionId).toBe('Q0');
    expect(nextSync({ ...base, pool: procs, remaining: 0 }).next).toBeNull();
  });

  const draftOf = (target: DraftRequest['target'], over: Partial<DraftRequest> = {}): DraftRequest => ({ target, claim: { ...claim, procedures: [{ lineId: 'L1', code: target.code, name: target.name, quantity: 1 }] }, analysis: null, dictionary: [], variant: 0, ...over });

  it('does not invent experiences when it has no source for a code, and words drafts by care type', () => {
    const d = draftSync(draftOf({ code: '88.72', name: 'Ekokardiografi', category: 'Penunjang' }));
    expect(d.experienceSourceFound).toBe(false);
    expect(d.proposal.experiences).toEqual([]);
    expect(checksPass(checkQuestion(d.proposal.text, d.proposal.options, d.proposal.avoidTerms))).toBe(false);
    const ok = draftSync(draftOf({ code: '47.09', name: 'Apendektomi', category: 'Operasi' }));
    expect(checksPass(checkQuestion(ok.proposal.text, ok.proposal.options, ok.proposal.avoidTerms))).toBe(true);
    const outpatient = draftSync(draftOf({ code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang' }, { claim: { ...claim, careType: 'RAWAT_JALAN', claimedNights: null } }));
    expect(outpatient.proposal.text).toMatch(/^Saat berobat di \{faskes\}/);
    expect(outpatient.claimAttributes).toContain('jenis rawat');
    expect(draftSync(draftOf({ code: '89.52', name: 'EKG', category: 'Penunjang' }, { claim: null })).claimAttributes).not.toContain('jenis rawat');
  });

  it('gives every drafted option its own fraud score, from the claim, the mapping analysis and the reference entries', () => {
    const target = { code: '93.94', name: 'Terapi inhalasi (nebulizer)', category: 'Tindakan' };
    const scored = (o: AnswerOption) => o.fraudScore;
    // No reference: the model's own prior, and every option within the score rule.
    const plain = draftSync(draftOf(target));
    expect(plain.proposal.options.every((o) => optionScoreProblem(o) === null)).toBe(true);
    expect(plain.proposal.options.filter((o) => o.mapping.kind === 'TETAP' && o.mapping.strength === 'BERTENTANGAN').map(scored)).toEqual([0.6]);

    // The mapping matched a sibling entry: it becomes the first reference and its scores carry over.
    const sibling: DraftReference = {
      entry: entry('93.96', 'Terapi oksigen'),
      options: [
        { id: 'DUKUNG_1', label: 'Ya', mapping: { kind: 'TETAP', strength: 'KUAT' }, fraudScore: 0 },
        { id: 'BANTAH_1', label: 'Tidak ada', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, fraudScore: 0.7 },
      ],
    };
    const analysis = { lineId: 'L1', matchType: 'KODE_INDUK' as const, relevance: 0.7, status: 'TERPETAKAN' as const, matchedEntryId: sibling.entry.id };
    // Billed five times: an "only once" option appears with a contradiction-level score.
    const many = { ...claim, procedures: [{ lineId: 'L1', code: target.code, name: target.name, quantity: 5 }] };
    const d = draftSync(draftOf(target, { claim: many, analysis, dictionary: [sibling] }));
    expect(d.referenceEntryIds[0]).toBe(sibling.entry.id);
    expect(d.proposal.options.find((o) => o.id === 'HANYA_SEKALI')).toMatchObject({ mapping: { kind: 'TETAP', strength: 'SEBAGIAN' }, fraudScore: 0.7 });
    expect(d.proposal.options.filter((o) => o.mapping.kind === 'TETAP' && o.mapping.strength === 'BERTENTANGAN').map(scored)).toEqual([0.7]);
    expect(d.proposal.options.find((o) => o.unsure)?.fraudScore).toBe(0);
    expect(d.claimAttributes).toEqual(expect.arrayContaining(['jumlah tindakan', 'hasil pemetaan kamus']));
    expect(d.rationale).toContain('rujukan pertama');
    expect(checksPass(checkQuestion(d.proposal.text, d.proposal.options, d.proposal.avoidTerms))).toBe(true);
  });
});
