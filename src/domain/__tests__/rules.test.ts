import { describe, expect, it } from 'vitest';
import type { NextQuestionRequest, PoolItem } from '../../ai/service';
import { draftSync, nextSync, rankSync } from '../../ai/simulatedAi';
import { checkQuestion, checksPass } from '../checks';
import { claimedNights, evidenceStatus, strengthOf } from '../evidence';
import { bestMatch, mappingStatus } from '../mapping';
import type { AnswerOption, DictionaryEntry } from '../types';
import { combineScores, EMPTY_SCORES, evaluateAnswer, stopAfterAnswer } from '../verification';

const entry = (code: string, name: string): DictionaryEntry => ({
  id: `KMS-${code}`, scope: 'PROSEDUR', topic: null, code, name, category: 'Tindakan', experiences: [], avoidTerms: [],
  observability: 0.9, source: 'KAMUS_AWAL', aiDraftId: null, createdAt: '2026-01-01T00:00:00Z', status: 'AKTIF',
});

describe('Table 1 and Table 2', () => {
  const nights: AnswerOption = { id: 'N2_3', label: '2–3 malam', mapping: { kind: 'RENTANG_MALAM', min: 2, max: 3 } };
  it('reads night ranges against the claimed stay', () => {
    expect(strengthOf(nights, 3)).toBe('KUAT');
    expect(strengthOf(nights, 5)).toBe('BERTENTANGAN');
    expect(strengthOf(nights, null)).toBe('NETRAL');
    expect(claimedNights({ careType: 'RAWAT_INAP', admissionDate: '2026-10-22', dischargeDate: '2026-10-25' })).toBe(3);
  });

  it('orders the four case rules and never treats "Tidak ingat" as a rebuttal', () => {
    expect(evidenceStatus({ denied: true, strengths: ['KUAT'] })).toMatchObject({ status: 'PERLU_DIPERIKSA', priority: true, rule: 1 });
    expect(evidenceStatus({ denied: false, strengths: ['KUAT', 'BERTENTANGAN'] }).rule).toBe(2);
    expect(evidenceStatus({ denied: false, strengths: ['NETRAL', 'NETRAL'] }).status).toBe('BUKTI_TIDAK_CUKUP');
    expect(evidenceStatus({ denied: false, strengths: ['NETRAL', 'SEBAGIAN'] }).status).toBe('KONSISTEN');
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
    { id: 'YA', label: 'Ya', mapping: { kind: 'TETAP', strength: 'KUAT' } },
    { id: 'TIDAK', label: 'Tidak', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' } },
    { id: 'TI', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, unsure: true },
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
});

const claim = { claimKey: 'KLM-1', careType: 'RAWAT_INAP' as const, claimedNights: 3, diagnosis: { code: 'J18.9', name: 'Pneumonia' }, procedures: [{ lineId: 'L1', code: '87.44', name: 'Foto rontgen dada', quantity: 1 }] };

describe('answer evaluation and stop rules (rule-based)', () => {
  const yes: AnswerOption = { id: 'YA', label: 'Ya', mapping: { kind: 'TETAP', strength: 'KUAT' } };
  const no: AnswerOption = { id: 'TIDAK', label: 'Tidak', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' } };
  const unsure: AnswerOption = { id: 'TI', label: 'Tidak ingat', mapping: { kind: 'TETAP', strength: 'NETRAL' }, unsure: true };
  const never: AnswerOption = { id: 'TIDAK_PERNAH', label: 'Tidak pernah ke sana', mapping: { kind: 'TETAP', strength: 'BERTENTANGAN' }, denial: true };
  const proc = { topic: null, observability: 0.9 };

  it('weights each answer by the observability of what was asked', () => {
    expect(evaluateAnswer(yes, proc, 3)).toMatchObject({ strength: 'KUAT', reliability: 0.9, supportWeight: 0.9, indicationWeight: 0 });
    expect(evaluateAnswer(no, proc, 3)).toMatchObject({ strength: 'BERTENTANGAN', indicationWeight: 0.54 });
    expect(evaluateAnswer(no, { topic: 'KEBERADAAN', observability: 0.97 }, 3).indicationWeight).toBe(0.78);
    expect(evaluateAnswer(unsure, proc, 3)).toMatchObject({ strength: 'NETRAL', definite: false, reliability: 0, indicationWeight: 0 });
    expect(evaluateAnswer(yes, { topic: null, observability: null }, 3).reliability).toBe(0.55);
  });

  it('reaches indication 1 only through a denial and keeps scores in [0, 1]', () => {
    const many = Array.from({ length: 8 }, () => evaluateAnswer(no, { topic: 'KEBERADAAN', observability: 0.97 }, 3));
    expect(combineScores(many).indication).toBe(0.99);
    expect(combineScores([evaluateAnswer(yes, proc, 3), evaluateAnswer(never, { topic: 'KEBERADAAN', observability: 0.97 }, 3)]).indication).toBe(1);
    expect(combineScores([evaluateAnswer(no, proc, 3), evaluateAnswer(no, proc, 3)]).indication).toBe(0.79);
    expect(combineScores([])).toEqual(EMPTY_SCORES);
  });

  it('stops on the indication threshold, then on the question limit', () => {
    const cfg = { maxQuestions: 3, stopIndicationThreshold: 1 };
    expect(stopAfterAnswer({ indication: 1, support: 0, answered: 1, definite: 1 }, cfg)).toBe('INDIKASI_MAKSIMUM');
    expect(stopAfterAnswer({ indication: 0.99, support: 0, answered: 2, definite: 2 }, cfg)).toBeNull();
    expect(stopAfterAnswer({ indication: 0.99, support: 0, answered: 2, definite: 2 }, { ...cfg, stopIndicationThreshold: 0.9 })).toBe('INDIKASI_MAKSIMUM');
    expect(stopAfterAnswer({ indication: 0, support: 0.9, answered: 3, definite: 3 }, cfg)).toBe('BATAS_PERTANYAAN');
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
    const base: NextQuestionRequest = { claim, sessionKey: 'RSP-1', pool: [], history: [], scores: EMPTY_SCORES, remaining: 5 };

    const first = nextSync({ ...base, pool: pool([{ priorConfidence: 0.95 }, { ...episode('LAMA_RAWAT') }, { ...episode('KEBERADAAN') }]) });
    expect(first.next?.questionId).toBe('Q2');

    const wentHome = { questionId: 'Q2', version: 1, topic: 'KEBERADAAN' as const, lineId: null, strength: 'BERTENTANGAN' as const, definite: true, denial: false };
    const after = nextSync({ ...base, pool: pool([{ priorConfidence: 0.5 }, { ...episode('LAMA_RAWAT') }]), history: [wentHome], scores: { indication: 0.78, support: 0, answered: 1, definite: 1 } });
    expect(after.skipped.map((x) => x.questionId)).toEqual(['Q1']);
    expect(after.next?.questionId).toBe('Q0');

    const procs = pool([
      { priorConfidence: 0.9, entry: { ...candidate.entry, observability: 0.6 } },
      { priorConfidence: 0.7, entry: { ...candidate.entry, observability: 0.98 } },
    ]);
    expect(nextSync({ ...base, pool: procs }).next?.questionId).toBe('Q0');
    expect(nextSync({ ...base, pool: procs, scores: { indication: 0.5, support: 0, answered: 1, definite: 1 } }).next?.questionId).toBe('Q1');
    expect(nextSync({ ...base, pool: procs, remaining: 0 }).next).toBeNull();
  });

  it('does not invent experiences when it has no source for a code, and words drafts by care type', () => {
    const d = draftSync({ target: { code: '88.72', name: 'Ekokardiografi', category: 'Penunjang' }, claim: { careType: 'RAWAT_INAP' }, dictionary: [], variant: 0 });
    expect(d.experienceSourceFound).toBe(false);
    expect(d.proposal.experiences).toEqual([]);
    expect(checksPass(checkQuestion(d.proposal.text, d.proposal.options, d.proposal.avoidTerms))).toBe(false);
    const ok = draftSync({ target: { code: '47.09', name: 'Apendektomi', category: 'Operasi' }, claim: { careType: 'RAWAT_INAP' }, dictionary: [], variant: 0 });
    expect(checksPass(checkQuestion(ok.proposal.text, ok.proposal.options, ok.proposal.avoidTerms))).toBe(true);
    const outpatient = draftSync({ target: { code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang' }, claim: { careType: 'RAWAT_JALAN' }, dictionary: [], variant: 0 });
    expect(outpatient.proposal.text).toMatch(/^Saat berobat di \{faskes\}/);
    expect(outpatient.claimAttributes).toContain('jenis rawat');
    expect(draftSync({ target: { code: '89.52', name: 'EKG', category: 'Penunjang' }, claim: null, dictionary: [], variant: 0 }).claimAttributes).not.toContain('jenis rawat');
  });
});
