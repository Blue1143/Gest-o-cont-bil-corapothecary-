/**
 * Where a piece of data comes from. Demo data must never be presented as institutional data:
 * every payload that reaches the UI carries its provenance so the shell can flag it.
 */
export type DataOrigin = 'real' | 'demo';

export interface Provenance {
  origin: DataOrigin;
  /** Human-readable source, e.g. "Vigilância ativa CCIH" or "Gerador sintético v1". */
  source: string;
  /** ISO timestamp of when the data was consolidated. */
  consolidatedAt: string;
}

export interface WithProvenance<T> {
  data: T;
  provenance: Provenance;
}

export const isDemo = (p: Provenance | undefined): boolean => p?.origin === 'demo';
