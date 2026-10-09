import { addDays, type IsoDate } from '../dates';

/**
 * Stock by lot from an append-only movement ledger. Quantities are signed deltas: entries are
 * positive; consumption and discard are negative; adjustments may be either.
 */
export type MovementKind = 'entrada' | 'consumo' | 'ajuste' | 'descarte';

export const MOVEMENT_LABEL: Record<MovementKind, string> = { entrada: 'Entrada', consumo: 'Consumo', ajuste: 'Ajuste de inventário', descarte: 'Descarte' };

export type SupplyCategory = 'preparacao_alcoolica' | 'sabonete' | 'epi' | 'antisseptico' | 'saneante' | 'outro';

export const SUPPLY_CATEGORY_LABEL: Record<SupplyCategory, string> = {
  preparacao_alcoolica: 'Preparação alcoólica', sabonete: 'Sabonete', epi: 'EPI', antisseptico: 'Antisséptico', saneante: 'Saneante', outro: 'Outro',
};

export interface LedgerMovement { lotId: string; kind: MovementKind; delta: number; occurredOn: IsoDate }

export function signedDelta(kind: MovementKind, quantity: number): number {
  return kind === 'entrada' ? Math.abs(quantity) : kind === 'ajuste' ? quantity : -Math.abs(quantity);
}

export function stockByLot(movements: LedgerMovement[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movements) out.set(m.lotId, (out.get(m.lotId) ?? 0) + m.delta);
  return out;
}

/** Average daily consumption over the `windowDays` days ending yesterday; null without consumption. */
export function dailyConsumption(movements: LedgerMovement[], today: IsoDate, windowDays = 30): number | null {
  const from = addDays(today, -windowDays);
  const used = movements.filter((m) => m.kind === 'consumo' && m.occurredOn >= from && m.occurredOn < today).reduce((s, m) => s - m.delta, 0);
  return used > 0 ? used / windowDays : null;
}
