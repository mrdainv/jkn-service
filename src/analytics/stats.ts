// Small, dependency-free statistics for the analytics page. Every estimate that is shown comes with
// its sample size; proportions come with a Wilson 95% interval.

export const Z95 = 1.959964;

export function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Sample variance (n − 1). */
export function variance(xs: readonly number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Quantile with linear interpolation between order statistics (type 7, as R/NumPy default). */
export function quantile(xs: readonly number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export const median = (xs: readonly number[]) => quantile(xs, 0.5);

export interface Describe {
  n: number;
  mean: number | null;
  median: number | null;
  variance: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

export function describe(xs: readonly number[]): Describe {
  const v = variance(xs);
  return {
    n: xs.length,
    mean: mean(xs),
    median: median(xs),
    variance: v,
    sd: v === null ? null : Math.sqrt(v),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
    p10: quantile(xs, 0.1),
    p25: quantile(xs, 0.25),
    p75: quantile(xs, 0.75),
    p90: quantile(xs, 0.9),
  };
}

export interface Proportion {
  k: number;
  n: number;
  p: number | null;
  lo: number | null;
  hi: number | null;
}

/** Wilson score interval: well-behaved for small n and for p near 0 or 1. */
export function wilson(k: number, n: number, z = Z95): Proportion {
  if (n === 0) return { k, n, p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { k, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Difference of two proportions with Newcombe's hybrid score interval (method 10). */
export function proportionDiff(a: Proportion, b: Proportion): { diff: number; lo: number; hi: number } | null {
  if (a.p === null || b.p === null || a.lo === null || a.hi === null || b.lo === null || b.hi === null) return null;
  const d = a.p - b.p;
  const lo = d - Math.sqrt((a.p - a.lo) ** 2 + (b.hi - b.p) ** 2);
  const hi = d + Math.sqrt((a.hi - a.p) ** 2 + (b.p - b.lo) ** 2);
  return { diff: d, lo, hi };
}

export interface Bin {
  x0: number;
  x1: number;
  count: number;
}

export function histogram(xs: readonly number[], bins: number, lo = 0, hi = 1): Bin[] {
  const width = (hi - lo) / bins;
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count: 0 }));
  for (const x of xs) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / width)));
    out[i].count += 1;
  }
  return out;
}

function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].x === order[i].x) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) r[order[k].i] = avg;
    i = j + 1;
  }
  return r;
}

export function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;
  const mx = mean(x)!;
  const my = mean(y)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

export interface Correlation {
  r: number;
  lo: number;
  hi: number;
  n: number;
}

/** Spearman's rank correlation with an approximate 95% interval (Fisher z, Fieller's SE). */
export function spearman(x: readonly number[], y: readonly number[]): Correlation | null {
  const r = pearson(ranks(x), ranks(y));
  const n = x.length;
  if (r === null || n < 10) return null;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r)));
  const se = Math.sqrt(1.06 / (n - 3));
  return { r, lo: Math.tanh(z - Z95 * se), hi: Math.tanh(z + Z95 * se), n };
}

/** Mean squared error of probability forecasts against 0/1 outcomes. */
export function brier(pred: readonly number[], outcome: readonly number[]): number | null {
  if (!pred.length) return null;
  return pred.reduce((a, p, i) => a + (p - outcome[i]) ** 2, 0) / pred.length;
}

/** Expected calibration error over the given bins (weighted mean |predicted − observed|). */
export function ece(bins: readonly { n: number; meanPred: number | null; observed: number | null }[]): number | null {
  const total = bins.reduce((a, b) => a + b.n, 0);
  if (!total) return null;
  return bins.reduce((a, b) => (b.meanPred === null || b.observed === null ? a : a + (b.n / total) * Math.abs(b.meanPred - b.observed)), 0);
}
