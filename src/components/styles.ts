// Class-name helpers shared by the UI components.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-50 aria-[invalid=true]:border-red-500';

export const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';
export const td = 'px-3 py-2 align-top text-sm text-slate-800';
