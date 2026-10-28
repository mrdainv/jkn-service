import { describe, expect, it } from 'vitest';
import { checkQuestion, checksPass } from '../../domain/checks';
import { checkIntegrity } from '../../domain/integrity';
import { currentVersion } from '../../domain/queries';
import { buildSeed } from '../seed/buildSeed';

describe('simulation seed', () => {
  const db = buildSeed();

  it('is deterministic', () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(db));
  });

  it('has no broken references', () => {
    expect(checkIntegrity(db)).toEqual([]);
  });

  it('covers every workflow state', () => {
    const statuses = new Set(db.claims.map((c) => c.status));
    for (const s of ['DIAJUKAN', 'MENUNGGU_PESERTA', 'JAWABAN_DITERIMA', 'SELESAI', 'TIDAK_DIJAWAB']) expect(statuses).toContain(s);
    expect(db.claims).toHaveLength(104);
    expect(db.sessions.length).toBeGreaterThan(60);
    const stops = new Set(db.sessions.map((s) => s.stopReason));
    for (const r of ['PERTANYAAN_HABIS', 'INDIKASI_MAKSIMUM']) expect(stops).toContain(r);
    expect(db.sessions.some((s) => s.skipped.length > 0)).toBe(true);
  });

  it('runs the historical sessions through the same adaptive commands', () => {
    for (const s of db.sessions) {
      const answers = db.answers.filter((a) => a.sessionId === s.id).sort((a, b) => a.iteration - b.iteration);
      expect(answers.length).toBeLessThanOrEqual(db.aiConfig.maxQuestions);
      // Only the last answer can have triggered a stop on the indication.
      expect(answers.slice(0, -1).every((a) => a.scoresAfter.indication < 1)).toBe(true);
      if (s.stopReason === 'INDIKASI_MAKSIMUM') expect(answers.at(-1)!.evaluation.denial).toBe(true);
    }
    expect(db.claims.filter((c) => c.decision).every((c) => c.decision!.basis !== undefined)).toBe(true);
  });

  it('keeps every dictionary question within the wording rules', () => {
    for (const q of db.questions) {
      const entry = db.dictionary.find((e) => e.id === q.entryId)!;
      const v = currentVersion(q);
      expect(checksPass(checkQuestion(v.text, v.options, entry.avoidTerms)), `${q.id}: ${checkQuestion(v.text, v.options, entry.avoidTerms).filter((r) => !r.ok).map((r) => r.message)}`).toBe(true);
    }
  });

  it('stores nothing about the simulated ground truth', () => {
    const text = JSON.stringify(db);
    expect(text).not.toMatch(/PENYANGKALAN_TOTAL|ground_truth|Dugaan|Phantom|Sesi Fiktif/i);
  });
});
