import { Bar, BarChart, CartesianGrid, ComposedChart, ErrorBar, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReactNode } from 'react';
import { MIN_BIN_N } from '../../../analytics/metrics';
import type { Proportion } from '../../../analytics/stats';
import type { Strength } from '../../../domain/types';
import { STRENGTH_LABEL } from '../../../domain/labels';
import { formatNumber } from '../../../lib/format';
import { Badge } from '../../ui';
import { cx } from '../../styles';
import { pct, STRENGTH_FILL } from './display';

// Presentation helpers for the analytics page. Charts follow the dataviz reference palette: thin marks,
// hairline solid grid, one series per colour slot, tooltips on hover, tables for the exact numbers.


export function Kind({ kind }: { kind: 'observed' | 'config' | 'suggestion' }) {
  if (kind === 'observed') return <Badge tone="info">Metrik teramati</Badge>;
  if (kind === 'config') return <Badge tone="neutral">Konfigurasi</Badge>;
  return <Badge tone="violet">Saran sistem</Badge>;
}

export function Section({ title, kind, intro, children, id }: { title: string; kind: 'observed' | 'config' | 'suggestion'; intro?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <Kind kind={kind} />
        </div>
        {intro && <p className="mt-1 max-w-4xl text-xs text-slate-600">{intro}</p>}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export function Insufficient({ n, need, what }: { n: number; need: number; what?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600" role="status">
      <div className="font-medium">Data belum cukup</div>
      <div className="mt-0.5 text-xs">
        {what ? `${what}: ` : ''}n = {n}; perlu sedikitnya {need} sebelum angka ini ditampilkan.
      </div>
    </div>
  );
}

/** "62% (51–72%) n=80", or an insufficient marker for small n. */
export function PropCell({ p, minN = MIN_BIN_N, compact }: { p: Proportion; minN?: number; compact?: boolean }) {
  if (p.n === 0) return <span className="text-slate-400">–</span>;
  if (p.n < minN) return <span className="text-xs text-slate-400" title={`n = ${p.n}; perlu ≥ ${minN}`}>n = {p.n}, belum cukup</span>;
  return (
    <span className="tabular whitespace-nowrap">
      <span className="font-medium text-slate-900">{pct(p.p)}</span>
      <span className="text-[11px] text-slate-500">
        {' '}
        ({pct(p.lo)}–{pct(p.hi)}){!compact && ` n=${p.n}`}
      </span>
    </span>
  );
}

const AXIS = { stroke: 'var(--axis)', fontSize: 11, tick: { fill: 'var(--ink-muted)' } } as const;

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; payload?: { range?: string } }[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-medium text-slate-900">{payload[0].payload?.range ?? label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-slate-700">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-medium">{typeof p.value === 'number' ? formatNumber(p.value, Number.isInteger(p.value) ? 0 : 2) : p.value}</span>
          {unit}
        </div>
      ))}
    </div>
  );
}

export function HistogramChart({ bins, threshold, label }: { bins: { x0: number; x1: number; count: number }[]; threshold: number; label: string }) {
  // Axis shows each bin's lower edge; the tooltip names the full range.
  const data = bins.map((b) => ({ name: formatNumber(b.x0, 1), range: `Keyakinan ${formatNumber(b.x0, 1)}–${formatNumber(b.x1, 1)}`, Jumlah: b.count }));
  return (
    <figure>
      <div className="h-56" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="name" {...AXIS} interval={0} angle={0} />
            <YAxis allowDecimals={false} {...AXIS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="Jumlah" name="Jumlah usulan" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
            <ReferenceLine
              x={data[bins.findIndex((b) => threshold >= b.x0 && threshold < b.x1)]?.name}
              stroke="var(--ink-2)"
              strokeWidth={1.5}
              label={{ value: `ambang ${formatNumber(threshold, 2)} (konfigurasi)`, position: 'top', fontSize: 10, fill: 'var(--ink-2)' }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-[11px] text-slate-500">{label}</figcaption>
    </figure>
  );
}

export function WeeklyChart({ rows }: { rows: { week: string; submitted: number }[] }) {
  return (
    <div className="h-48" role="img" aria-label="Klaim diajukan per minggu">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows.map((r) => ({ name: r.week, Diajukan: r.submitted }))} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="name" {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="Diajukan" name="Klaim diajukan" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Reliability diagram: mean AI score against the observed rate of definite answers, with 95% intervals. */
export function CalibrationChart({ bins }: { bins: { band: string; n: number; meanPred: number | null; observed: number | null; ci: Proportion }[] }) {
  const points = bins
    .filter((b) => b.n >= MIN_BIN_N && b.meanPred !== null && b.observed !== null)
    .map((b) => ({ x: b.meanPred!, y: b.observed!, err: [b.observed! - (b.ci.lo ?? b.observed!), (b.ci.hi ?? b.observed!) - b.observed!] as [number, number], band: b.band, n: b.n }));
  return (
    <div className="h-64" role="img" aria-label="Diagram kalibrasi keyakinan AI terhadap jawaban pasti yang teramati">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" domain={[0.4, 1]} ticks={[0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]} {...AXIS} label={{ value: 'Rata-rata keyakinan AI', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--ink-2)' }} />
          <YAxis type="number" dataKey="y" domain={[0.4, 1]} ticks={[0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]} {...AXIS} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <Line data={[{ x: 0.4, y: 0.4 }, { x: 1, y: 1 }]} dataKey="y" stroke="var(--axis)" strokeWidth={1} dot={false} isAnimationActive={false} name="Kalibrasi sempurna" legendType="none" />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const p = payload?.find((x) => (x.payload as { band?: string }).band)?.payload as (typeof points)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
                  <div className="font-medium">Keyakinan {p.band}</div>
                  <div>Rata-rata skor: {formatNumber(p.x, 2)}</div>
                  <div>
                    Jawaban pasti: {pct(p.y)} (IK95% {pct(p.y - p.err[0])}–{pct(p.y + p.err[1])})
                  </div>
                  <div>n = {p.n}</div>
                </div>
              );
            }}
          />
          <Scatter data={points} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} name="Rentang keyakinan">
            <ErrorBar dataKey="err" direction="y" stroke="var(--series-1)" strokeWidth={1.5} width={6} />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StrengthLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-600" aria-label="Legenda kekuatan bukti">
      {(Object.keys(STRENGTH_FILL) as Strength[]).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STRENGTH_FILL[s] }} />
          {STRENGTH_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

export function OptionBar({ options }: { options: { label: string; count: number; strength: Strength | null }[] }) {
  const total = options.reduce((a, o) => a + o.count, 0);
  if (!total) return <span className="text-xs text-slate-400">belum ada jawaban</span>;
  const order: (Strength | null)[] = ['KUAT', 'SEBAGIAN', 'NETRAL', 'BERTENTANGAN', null];
  const sorted = [...options].sort((a, b) => order.indexOf(a.strength) - order.indexOf(b.strength));
  return (
    <div className="w-48">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded" role="img" aria-label={sorted.map((o) => `${o.label}: ${o.count}`).join('; ')}>
        {sorted.map((o) => (
          <div key={o.label} title={`${o.label}: ${o.count} (${pct(o.count / total)})`} style={{ width: `${(o.count / total) * 100}%`, background: o.strength ? STRENGTH_FILL[o.strength] : 'var(--axis)' }} />
        ))}
      </div>
    </div>
  );
}

export function HBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-sm bg-slate-100">
        <div className="h-2.5 rounded-sm" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: 'var(--series-1)' }} aria-hidden />
      </div>
      <span className={cx('tabular w-10 text-right text-xs text-slate-700')} aria-label={label}>
        {value}
      </span>
    </div>
  );
}
