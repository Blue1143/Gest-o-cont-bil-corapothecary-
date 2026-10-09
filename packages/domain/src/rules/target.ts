import type { IndicatorTarget } from '../config';
import type { Status } from '../status';

export type TargetResult = 'conforme' | 'atencao' | 'fora_da_meta' | 'sem_meta' | 'sem_dado';

export interface TargetEvaluation {
  result: TargetResult;
  status: Status;
  label: string;
}

const RESULT: Record<TargetResult, { status: Status; label: string }> = {
  conforme: { status: 'ok', label: 'Conforme' },
  atencao: { status: 'warn', label: 'Atenção' },
  fora_da_meta: { status: 'crit', label: 'Fora da meta' },
  sem_meta: { status: 'neutral', label: 'Sem meta configurada' },
  sem_dado: { status: 'neutral', label: 'Sem dado' },
};

const make = (result: TargetResult): TargetEvaluation => ({ result, ...RESULT[result] });

/**
 * Compares a value with its institutional target. The intermediate state exists only when the
 * administrator configured a warning band; no tolerance is assumed.
 */
export function evaluateTarget(value: number | null | undefined, target: IndicatorTarget | undefined): TargetEvaluation {
  if (value == null || Number.isNaN(value)) return make('sem_dado');
  if (!target) return make('sem_meta');
  const band = target.warningBand ?? 0;
  if (target.direction === 'lower') {
    if (value <= target.value) return make('conforme');
    return make(band > 0 && value <= target.value + band ? 'atencao' : 'fora_da_meta');
  }
  if (value >= target.value) return make('conforme');
  return make(band > 0 && value >= target.value - band ? 'atencao' : 'fora_da_meta');
}

export interface Trend {
  delta: number | null;
  /** true = improved, false = worsened, null = stable or unknown. */
  improved: boolean | null;
}

/** Treats a change that rounds to zero at the displayed precision as stable. */
export function roundTrend(trend: Trend, decimals: number): Trend {
  if (trend.delta == null) return trend;
  return Number(trend.delta.toFixed(decimals)) === 0 ? { delta: 0, improved: null } : trend;
}

export function compareWithPrevious(current: number | null | undefined, previous: number | null | undefined, direction: 'lower' | 'higher'): Trend {
  if (current == null || previous == null || Number.isNaN(current) || Number.isNaN(previous)) return { delta: null, improved: null };
  const delta = current - previous;
  if (Math.abs(delta) < 1e-9) return { delta: 0, improved: null };
  return { delta, improved: direction === 'lower' ? delta < 0 : delta > 0 };
}
