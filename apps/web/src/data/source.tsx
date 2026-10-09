import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CcihDataSource, FactsQuery } from './port';

export class DataSourceConfigError extends Error {}

/**
 * Picks the data source from VITE_DATA_SOURCE. Production builds must set it explicitly so a
 * deployment never falls back to synthetic data by accident.
 */
export async function createDataSource(env: { VITE_DATA_SOURCE?: string; PROD?: boolean } = import.meta.env): Promise<CcihDataSource> {
  const kind = env.VITE_DATA_SOURCE ?? (env.PROD ? undefined : 'demo');
  // Loaded on demand so an institutional build never ships the synthetic generator in its main bundle.
  if (kind === 'demo') return new (await import('./demo/DemoDataSource')).DemoDataSource();
  if (kind === 'api') throw new DataSourceConfigError('A fonte de dados "api" será habilitada com o backend (Fase 2).');
  throw new DataSourceConfigError('Fonte de dados não configurada. Defina VITE_DATA_SOURCE (veja .env.example).');
}

const Ctx = createContext<CcihDataSource | null>(null);

export function DataSourceProvider({ source, children }: { source: CcihDataSource; children: ReactNode }) {
  return <Ctx.Provider value={source}>{children}</Ctx.Provider>;
}

export function useDataSource(): CcihDataSource {
  const s = useContext(Ctx);
  if (!s) throw new Error('DataSourceProvider ausente.');
  return s;
}

export function useInstitution() {
  const source = useDataSource();
  return useQuery({ queryKey: ['institution', source.origin], queryFn: () => source.getInstitution(), staleTime: 5 * 60_000 });
}

export function useFacts(query: FactsQuery) {
  const source = useDataSource();
  return useQuery({ queryKey: ['facts', source.origin, query.from, query.to], queryFn: () => source.getFacts(query), staleTime: 60_000 });
}
