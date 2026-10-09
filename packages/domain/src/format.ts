/** pt-BR display formatting. Missing values render as an em dash, never as 0. */
export const MISSING = '—';

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return MISSING;
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatSigned(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return MISSING;
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return formatNumber(0, decimals);
  return (rounded > 0 ? '+' : '') + formatNumber(rounded, decimals);
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/**
 * dd/mm/aaaa [hh:mm]. Values with an explicit offset are converted to `timeZone`;
 * naive values are shown as written.
 */
export function formatDate(value: string | null | undefined, timeZone?: string): string {
  if (!value) return MISSING;
  if (timeZone && /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return MISSING;
    return new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      .format(d)
      .replace(',', '');
  }
  const m = ISO_RE.exec(value);
  if (!m) return MISSING;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
}

export const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
