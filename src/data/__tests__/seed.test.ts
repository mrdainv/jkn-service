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
    for (const r of ['PERTANYAAN_HABIS', 'INDIKASI_TINGGI']) expect(stops).toContain(r);
    const levels = new Set(db.answers.map((a) => a.scoresAfter.level));
    for (const l of ['RENDAH', 'SEDANG', 'TINGGI']) expect(levels).toContain(l);
  });

  it('runs the historical sessions through the same adaptive commands', () => {
    for (const s of db.sessions) {
      const answers = db.answers.filter((a) => a.sessionId === s.id).sort((a, b) => a.iteration - b.iteration);
      expect(answers.length).toBeLessThanOrEqual(db.aiConfig.maxQuestions);
      // Only the last answer can have reached the high level, and reaching it is what stopped the session.
      expect(answers.slice(0, -1).every((a) => a.scoresAfter.level !== 'TINGGI')).toBe(true);
      expect(s.stopReason === 'INDIKASI_TINGGI').toBe(answers.at(-1)?.scoresAfter.level === 'TINGGI');
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
