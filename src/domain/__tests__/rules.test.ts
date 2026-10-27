import { describe, expect, it } from 'vitest';
import { draftSync, rankSync } from '../../ai/simulatedAi';
import { checkQuestion, checksPass } from '../checks';
import { claimedNights, evidenceStatus, strengthOf } from '../evidence';
import { bestMatch, mappingStatus } from '../mapping';
import type { AnswerOption, DictionaryEntry } from '../types';

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

describe('simulated AI', () => {
  it('is deterministic and keeps scores in [0, 1]', () => {
    const req = {
      claimKey: 'KLM-1', careType: 'RAWAT_INAP' as const, claimedNights: 3,
      candidates: [{ questionId: 'Q1', version: 1, entry: { id: 'E', scope: 'PROSEDUR' as const, topic: null, category: 'x', observability: 0.9 }, relevance: 1 }],
    };
    expect(rankSync(req)).toEqual(rankSync(req));
    expect(rankSync(req)[0].confidence).toBeGreaterThan(0);
    expect(rankSync(req)[0].confidence).toBeLessThan(1);
  });

  it('does not invent experiences when it has no source for a code', () => {
    const d = draftSync({ target: { code: '88.72', name: 'Ekokardiografi', category: 'Penunjang' }, claimContext: { careType: 'RAWAT_INAP', diagnosisName: null }, dictionary: [], variant: 0 });
    expect(d.experienceSourceFound).toBe(false);
    expect(d.proposal.experiences).toEqual([]);
    expect(checksPass(checkQuestion(d.proposal.text, d.proposal.options, d.proposal.avoidTerms))).toBe(false);
    const ok = draftSync({ target: { code: '47.09', name: 'Apendektomi', category: 'Operasi' }, claimContext: { careType: 'RAWAT_INAP', diagnosisName: null }, dictionary: [], variant: 0 });
    expect(checksPass(checkQuestion(ok.proposal.text, ok.proposal.options, ok.proposal.avoidTerms))).toBe(true);
  });
});
