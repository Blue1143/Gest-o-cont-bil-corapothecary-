import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addMonths, monthStart, todayIn } from '@ccih/domain';
import type { Sector } from '../data/port';

export const PERIOD_OPTIONS = [
  { value: '1', label: 'Último mês fechado' },
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
] as const;

export interface GlobalFilters {
  months: number;
  unitId: string | null;
  sectorId: string | null;
}

/** Global filters live in the URL so a view can be shared and reloaded. */
export function useGlobalFilters() {
  const [params, setParams] = useSearchParams();
  const filters: GlobalFilters = useMemo(() => {
    const m = Number(params.get('periodo'));
    return {
      months: PERIOD_OPTIONS.some((o) => Number(o.value) === m) ? m : 12,
      unitId: params.get('unidade'),
      sectorId: params.get('setor'),
    };
  }, [params]);
  const update = useCallback(
    (patch: Partial<Record<'periodo' | 'unidade' | 'setor', string | null>>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if ('unidade' in patch) next.delete('setor');
        return next;
      }, { replace: true });
    },
    [setParams],
  );
  return [filters, update] as const;
}

/** Month starts of the selected window, ending at the last closed month. */
export function periodWindow(months: number, timeZone: string, now: Date = new Date()): { periods: string[]; previous: string[] } {
  const last = addMonths(monthStart(todayIn(timeZone, now)), -1);
  const periods = Array.from({ length: months }, (_, i) => addMonths(last, i - months + 1));
  const previous = periods.map((p) => addMonths(p, -months));
  return { periods, previous };
}

/** Sector ids in scope for the filters; undefined = all sectors. */
export function sectorScope(filters: GlobalFilters, sectors: Sector[]): string[] | undefined {
  if (filters.sectorId) return [filters.sectorId];
  if (filters.unitId) return sectors.filter((s) => s.unitId === filters.unitId).map((s) => s.id);
  return undefined;
}
