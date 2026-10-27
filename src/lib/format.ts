// Indonesian formatting for dates, numbers and money. Dates are shown in WIB (UTC+7).

const TZ = 'Asia/Jakarta';

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});
const longDateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: TZ });

function asDate(value: string): Date {
  // Calendar dates are midday UTC so they never shift a day in WIB.
  return new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFmt.format(asDate(value)) : '–';
}

export function formatDateLong(value: string | null | undefined): string {
  return value ? longDateFmt.format(asDate(value)) : '–';
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFmt.format(asDate(value)) : '–';
}

/** "awal Juni 2026": the period wording shown to participants instead of exact dates. */
export function formatPeriod(date: string): string {
  const d = asDate(date);
  const day = Number(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: TZ }).format(d));
  const part = day <= 10 ? 'awal' : day <= 20 ? 'pertengahan' : 'akhir';
  return `${part} ${monthFmt.format(d)}`;
}

export function formatRupiah(value: number): string {
  return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null, digits = 0): string {
  return value === null || !Number.isFinite(value) ? '–' : `${formatNumber(value * 100, digits)}%`;
}

export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : formatNumber(value, 2);
}

export function ageOn(birthDate: string, on: string): number {
  const b = asDate(birthDate);
  const d = asDate(on);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000);
}

/** Masks all but the last four digits of a card number. */
export function maskCard(card: string): string {
  return card.length <= 4 ? card : `${'•'.repeat(card.length - 4)}${card.slice(-4)}`;
}

/** Calendar date in WIB for a timestamp (defaults to now). */
export function wibDate(iso: string = new Date().toISOString()): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
