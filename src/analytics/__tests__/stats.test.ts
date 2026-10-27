import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../data/seed/buildSeed';
import { computeAnalytics, MIN_N } from '../metrics';
import { brier, describe as summarize, ece, histogram, proportionDiff, quantile, spearman, wilson } from '../stats';

describe('statistics', () => {
  it('matches reference values', () => {
    // Wilson 95% for 8/10: 0.4902–0.9433 (Newcombe 1998).
    const w = wilson(8, 10);
    expect(w.lo).toBeCloseTo(0.4902, 3);
    expect(w.hi).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 0).p).toBeNull();
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    const d = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.mean).toBe(5);
    expect(d.variance).toBeCloseTo(32 / 7);
    expect(d.median).toBe(4.5);
    expect(brier([1, 0], [1, 1])).toBe(0.5);
    expect(ece([{ n: 10, meanPred: 0.8, observed: 0.6 }, { n: 10, meanPred: 0.5, observed: 0.5 }])).toBeCloseTo(0.1);
    expect(histogram([0.05, 0.95, 1], 2).map((b) => b.count)).toEqual([1, 2]);
  });

  it('gives a difference interval that contains zero for equal proportions', () => {
    const diff = proportionDiff(wilson(10, 20), wilson(10, 20))!;
    expect(diff.diff).toBe(0);
    expect(diff.lo).toBeLessThan(0);
    expect(diff.hi).toBeGreaterThan(0);
  });

  it('refuses a correlation on tiny samples', () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(spearman([...Array(20).keys()], [...Array(20).keys()])!.r).toBeCloseTo(1);
  });
});

describe('analytics on the simulation data', () => {
  const db = buildSeed();
  const a = computeAnalytics(db, '2026-10-27T00:00:00Z');

  it('counts the same records the workflow stored', () => {
    expect(a.totals).toMatchObject({ claims: db.claims.length, sessions: db.sessions.length, answers: db.answers.length });
    expect(Object.values(a.operations.byStatus).reduce((x, y) => x + (y ?? 0), 0)).toBe(db.claims.length);
    expect(a.coverage.mapped + a.coverage.belowThreshold + a.coverage.unmatched).toBe(a.coverage.lines);
  });

  it('has enough data for calibration and reports sample sizes', () => {
    expect(a.calibration.n).toBeGreaterThanOrEqual(MIN_N);
    for (const b of a.calibration.bins) if (b.n === 0) expect(b.meanPred).toBeNull();
    expect(a.acceptance.reduce((x, b) => x + b.n, 0)).toBe(db.suggestions.filter((s) => s.verifierAction).length);
  });

  it('flags the dictionary gaps in its suggestions', () => {
    expect(a.recommendations.filter((r) => r.kind === 'CELAH_KAMUS').map((r) => r.text)).toEqual(
      expect.arrayContaining([expect.stringContaining('99.18'), expect.stringContaining('47.09')]),
    );
  });
});
