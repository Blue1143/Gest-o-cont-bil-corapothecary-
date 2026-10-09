import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routes } from './routes';
import { DataSourceProvider, createDataSource, DataSourceConfigError } from '../data/source';
import { DemoDataSource } from '../data/demo/DemoDataSource';
import type { CcihDataSource } from '../data/port';

function renderApp(path: string, source: CcihDataSource = new DemoDataSource(() => new Date('2026-10-09T12:00:00Z'))) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DataSourceProvider source={source}>
        <RouterProvider router={router} />
      </DataSourceProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('app', () => {
  it('flags the demo environment on every screen', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Visão Geral/ })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/demonstração/i);
    expect(screen.getAllByText('Dado de demonstração').length).toBeGreaterThan(0);
  });

  it('renders the executive KPIs from the engine and applies the sector filter', async () => {
    const user = userEvent.setup();
    const router = renderApp('/?periodo=3');
    const iras = await screen.findByRole('region', { name: 'IRAS' });
    for (const label of ['IRAS (global)', 'IPCS', 'PAV', 'ITU-AC', 'ISC limpa']) expect(within(iras).getByText(label)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Setor'), 'clinica-medica');
    expect(router.state.location.search).toContain('setor=clinica-medica');
    expect(await screen.findByText(/Clínica Médica · dados consolidados/)).toBeInTheDocument();
  });

  it('says plainly when a module is not built yet', async () => {
    renderApp('/cme');
    expect(await screen.findByText('Em desenvolvimento — Fase 5')).toBeInTheDocument();
  });

  it('lists references as pending institutional validation', async () => {
    renderApp('/admin');
    expect(await screen.findByText('Referências clínicas e regulatórias')).toBeInTheDocument();
    expect(screen.getAllByText('Requer validação institucional').length).toBeGreaterThan(0);
  });

  it('never falls back to demo data in a production build without configuration', () => {
    expect(() => createDataSource({ PROD: true })).toThrow(DataSourceConfigError);
    expect(createDataSource({ PROD: false }).origin).toBe('demo');
    expect(() => createDataSource({ VITE_DATA_SOURCE: 'api' })).toThrow(/Fase 2/);
  });
});
