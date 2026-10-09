/** Visual/semantic status shared by every module. Always rendered with icon + word, never color alone. */
export type Status = 'ok' | 'warn' | 'crit' | 'neutral' | 'info';

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'Conforme',
  warn: 'Atenção',
  crit: 'Crítico',
  neutral: 'Sem dado',
  info: 'Informativo',
};

/** Lower is better (infection densities) or higher is better (adherence, coverage). */
export type Direction = 'lower' | 'higher';
