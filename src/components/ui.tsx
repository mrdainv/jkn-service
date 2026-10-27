import { AlertTriangle, CheckCircle2, CircleSlash, Info, Loader2, XCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { cx } from './styles';

// Shared building blocks. Every role uses them, so status colours and spacing mean the same everywhere.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 border border-emerald-700',
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 border border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 border border-red-300',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  pending,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; pending?: boolean; icon?: ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || pending}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANT[variant],
        className,
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'violet' | 'accent';

const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-300',
  bad: 'bg-red-50 text-red-800 border-red-200',
  violet: 'bg-violet-50 text-violet-800 border-violet-200',
  accent: 'bg-teal-50 text-teal-800 border-teal-200',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4', TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('rounded-lg border border-slate-200 bg-white', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

const NOTICE: Record<'info' | 'warn' | 'error' | 'success', { cls: string; icon: ComponentType<{ className?: string }> }> = {
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
  warn: { cls: 'border-amber-300 bg-amber-50 text-amber-950', icon: AlertTriangle },
  error: { cls: 'border-red-200 bg-red-50 text-red-900', icon: XCircle },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
};

export function Notice({ kind = 'info', title, children, className }: { kind?: keyof typeof NOTICE; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { cls, icon: Icon } = NOTICE[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('flex gap-2 rounded-md border px-3 py-2 text-sm', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx(title ? 'mt-0.5 text-[13px]' : '')}>{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon = CircleSlash, title, children }: { icon?: ComponentType<{ className?: string }>; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 px-4 py-8 text-center">
      <Icon className="h-6 w-6 text-slate-400" aria-hidden />
      <div className="mt-2 text-sm font-medium text-slate-700">{title}</div>
      {children && <div className="mt-1 max-w-md text-xs text-slate-500">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'good' | 'info' }) {
  return (
    <div className={cx('rounded-lg border bg-white px-4 py-3', tone === 'warn' ? 'border-amber-300' : tone === 'good' ? 'border-emerald-200' : tone === 'info' ? 'border-sky-200' : 'border-slate-200')}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor, required }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-4 gap-y-2 text-sm', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
            value === item.id ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs && <div className="mb-1 text-xs text-slate-500">{crumbs}</div>}
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SimBadge() {
  return (
    <Badge tone="warn" title="Semua data, AI, dan FRISTA di aplikasi ini adalah simulasi.">
      Data simulasi
    </Badge>
  );
}
