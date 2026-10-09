import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, type RoleCode } from '@ccih/domain';
import { DemoDataSource } from '../../data/demo/DemoDataSource';
import { DataSourceProvider } from '../../data/source';
import { ApiError } from '../../data/api/http';
import type { AdminPort, AuthPort, CcihDataSource, SessionInfo } from '../../data/port';
import { routes } from '../../app/routes';
import { SessionProvider } from './session';
import { safeReturnPath } from './LoginPage';

/** In-memory stand-in for the API: demo data + a login that knows two users. */
function fakeApi(role: RoleCode | null) {
  const demo = new DemoDataSource(() => new Date('2026-10-09T12:00:00Z'));
  let current: RoleCode | null = role;
  const info = (r: RoleCode): SessionInfo => ({
    user: { id: 'u1', login: r, displayName: `Usuário ${r}` }, roles: [r], permissions: DEFAULT_ROLE_PERMISSIONS[r], scope: null,
    session: { expiresAt: '2026-10-09T23:00:00Z', idleExpiresAt: '2026-10-09T13:00:00Z', idleMinutes: 30 },
  });
  const auth: AuthPort = {
    me: async () => (current ? info(current) : null),
    login: async (login, password) => { if (password !== 'Senha-Correta-1') throw new ApiError(401, 'credenciais', 'Usuário ou senha inválidos, ou conta temporariamente bloqueada.'); current = login as RoleCode; },
    logout: async () => { current = null; },
  };
  const saveTarget = vi.fn(async () => undefined);
  const admin = {
    versions: async () => ({ targets: [], rules: [], references: [], policy: { row_version: 1, updated_at: '' } }),
    saveTarget,
  } as unknown as AdminPort;
  const source: CcihDataSource = { origin: 'real', auth, admin, getInstitution: () => demo.getInstitution(), getFacts: (q) => demo.getFacts(q) };
  return { source, saveTarget };
}

function renderWith(source: CcihDataSource, path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider source={source}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('authentication in the web app', () => {
  it('sends anonymous users to the login page and back after signing in', async () => {
    const user = userEvent.setup();
    const { source } = fakeApi(null);
    const router = renderWith(source, '/indicadores');
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.search).toContain('voltar=%2Findicadores');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe o usuário.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Usuário/), 'gestor');
    await user.type(screen.getByLabelText(/Senha/), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/Usuário ou senha inválidos/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Senha/));
    await user.type(screen.getByLabelText(/Senha/), 'Senha-Correta-1');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Catálogo de indicadores' })).toBeInTheDocument();
  });

  it('accepts only internal return paths (no open redirect)', () => {
    expect(safeReturnPath('/admin/metas')).toBe('/admin/metas');
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('https://evil.example')).toBe('/');
    expect(safeReturnPath('/\\evil.example')).toBe('/');
    expect(safeReturnPath(null)).toBe('/');
  });

  it('shows only the modules of the profile (CME has no IRAS dashboard)', async () => {
    const { source } = fakeApi('cme');
    const router = renderWith(source, '/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: /CME/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Visão Geral' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Administração' })).toBeNull();
    expect(router.state.location.pathname).toBe('/cme');
  });

  it('blocks a direct URL outside the profile', async () => {
    const { source } = fakeApi('gestor');
    renderWith(source, '/admin/metas');
    expect(await screen.findByText('Seu perfil não tem acesso a esta área')).toBeInTheDocument();
  });

  it('saves an institutional target only with a justification and a confirmation', async () => {
    const user = userEvent.setup();
    const { source, saveTarget } = fakeApi('admin');
    renderWith(source, '/admin/metas');
    await user.click(await screen.findByRole('button', { name: 'Editar meta de Densidade de incidência de IPCS' }));
    await user.clear(screen.getByRole('textbox', { name: /^Meta \(/ }));
    await user.type(screen.getByRole('textbox', { name: /^Meta \(/ }), '1,8');
    await user.click(screen.getByRole('button', { name: 'Salvar meta' }));
    expect(screen.getByText('Descreva o motivo (mínimo 10 caracteres).')).toBeInTheDocument();
    expect(saveTarget).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Justificativa/), 'Meta aprovada em reunião da CCIH de outubro');
    await user.click(screen.getByRole('button', { name: 'Salvar meta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Salvar meta institucional?' });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar meta' }));
    expect(saveTarget).toHaveBeenCalledWith('di-ipcs', expect.objectContaining({ value: 1.8, warningBand: 0.5, justification: 'Meta aprovada em reunião da CCIH de outubro' }));
  });
});

describe('logout', () => {
  it('returns to the login page and keeps no cached data', async () => {
    const user = userEvent.setup();
    const { source } = fakeApi('gestor');
    const router = renderWith(source, '/indicadores');
    await screen.findByRole('heading', { name: 'Catálogo de indicadores' });
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByText('Você saiu do sistema.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  });
});
