/**
 * Date helpers. Calendar dates are plain `YYYY-MM-DD` strings; "today" is always resolved in the
 * institution's time zone (a UTC "today" is already tomorrow after 21:00 in Brasília).
 */
export type IsoDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 86_400_000;

function utcMidnight(iso: IsoDate): number {
  const m = DATE_RE.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(utcMidnight(value));
}

/** Calendar date of `instant` in `timeZone`. */
export function dateInZone(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const todayIn = (timeZone: string, now: Date = new Date()): IsoDate => dateInZone(now, timeZone);

/** Whole days from `from` to `to` (calendar dates; time part ignored). */
export function dayDiff(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return new Date(utcMidnight(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar date part of an ISO date or date-time string, in the institution zone when it has an offset. */
export function toCalendarDate(value: string, timeZone: string): IsoDate {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return dateInZone(new Date(value), timeZone);
  return value.slice(0, 10);
}

/** First day of the month of `iso`. */
export const monthStart = (iso: IsoDate): IsoDate => `${iso.slice(0, 7)}-01`;

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const m = DATE_RE.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
export const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;

/** "out/26" style label for a period starting at `iso`. */
export function monthLabel(iso: IsoDate): string {
  return `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? '?'}/${iso.slice(2, 4)}`;
}

export function monthLongLabel(iso: IsoDate): string {
  return `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1] ?? '?'}/${iso.slice(2, 4)}`;
}
