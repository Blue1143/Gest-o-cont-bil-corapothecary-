import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, type AlertDetail, type AlertDto, type BundleTemplateDto, type RoleCode } from '@ccih/domain';
import { DemoDataSource } from '../../data/demo/DemoDataSource';
import { DataSourceProvider } from '../../data/source';
import type { AuthPort, CcihDataSource, ClinicalPort, OperationsPort } from '../../data/port';
import { routes } from '../../app/routes';
import { SessionProvider } from '../auth/session';
import { passwordHint } from '../auth/AccountPage';

const ALERT: AlertDto = {
  id: 'a1', kind: 'insumo_critico', priority: 'alta', status: 'aberto', title: 'Respirador N95: Ruptura iminente', detail: 'Cobertura estimada de 2 dia(s).', entity: 'supply', entityId: 's1',
  sectorId: null, createdAt: '2026-10-09T10:00:00Z', lastSeenAt: '2026-10-09T10:00:00Z', assignedName: null, assignedAt: null, closedAt: null, closedByName: null, resolution: null, rowVersion: 1, link: '/insumos',
  category: 'seguranca', blocking: false, step: null, dueOn: null, unitId: null, acknowledgedName: null, acknowledgedAt: null, resolvedName: null, resolvedAt: null, resolvedNote: null, closedReason: null,
};
const BLOCKING: AlertDto = {
  ...ALERT, id: 'b1', kind: 'cme_bowie_dick_reprovado', priority: 'critica', title: 'Autoclave 2: Bowie-Dick reprovado hoje', detail: 'Bloquear o equipamento ou repetir o teste.', entity: 'sterilizer', entityId: 'st2',
  link: '/cme/equipamentos', blocking: true, step: 'esterilizacao',
};
const BLOCKING_DETAIL: AlertDetail = { ...BLOCKING, actions: [{ id: 'x1', action: 'criado', userName: 'Sistema', note: null, at: '2026-10-09T10:00:00Z' }] };
const TEMPLATE: BundleTemplateDto = {
  id: 't1', code: 'bundle-cvc', name: 'Manutenção de CVC (modelo)', metric: 'cvc', method: 'tudo_ou_nada', referenceId: null, active: true, rowVersion: 1,
  items: [{ id: 'i1', position: 0, label: 'Higiene das mãos antes do manuseio' }, { id: 'i2', position: 1, label: 'Curativo íntegro' }],
};

function fakeSource(role: RoleCode, mustChangePassword = false) {
  const demo = new DemoDataSource(() => new Date('2026-10-09T12:00:00Z'));
  let must = mustChangePassword;
  const auth: AuthPort = {
    me: async () => ({ user: { id: 'u1', login: 'enf.ccih', displayName: 'Usuário' }, roles: [role], permissions: DEFAULT_ROLE_PERMISSIONS[role], scope: null, session: { expiresAt: '2026-10-09T23:00:00Z', idleExpiresAt: '2026-10-09T13:00:00Z', idleMinutes: 30 }, mustChangePassword: must }),
    login: async () => undefined,
    logout: async () => undefined,
    changePassword: vi.fn(async () => { must = false; }),
  };
  const operations = {
    alerts: vi.fn(async () => ({ rows: [ALERT, BLOCKING], total: 2, page: 1, pageSize: 25 })),
    alert: vi.fn(async () => BLOCKING_DETAIL),
    acknowledgeAlert: vi.fn(async () => undefined),
    alertException: vi.fn(async () => undefined),
    resolveAlert: vi.fn(async () => undefined),
    commentAlert: vi.fn(async () => undefined),
    alertSummary: vi.fn(async () => ({ open: 1, byPriority: { critica: 0, alta: 1, media: 0, baixa: 0 }, assignedToMe: 0, blocking: 0 })),
    closeAlert: vi.fn(async () => undefined),
    assumeAlert: vi.fn(async () => undefined),
    bundleTemplates: vi.fn(async () => ({ templates: [TEMPLATE] })),
    bundleSummary: vi.fn(async () => ({ rows: [], pareto: [] })),
    bundleAudits: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 25 })),
    createBundleAudit: vi.fn(async () => ({ id: 'x', result: 'nao_conforme', nonCompliant: 1 })),
  } as unknown as OperationsPort & Record<string, ReturnType<typeof vi.fn>>;
  const clinical = { org: async () => ({ units: [], sectors: [{ id: 'uti', code: 'uti-adulto', name: 'UTI Adulto', unitId: 'u', kind: 'uti', active: true, rowVersion: 1, beds: [] }] }) } as unknown as ClinicalPort;
  const source: CcihDataSource = { origin: 'real', auth, clinical, operations, getInstitution: () => demo.getInstitution(), getFacts: (q) => demo.getFacts(q) };
  return { source, operations, auth };
}

function renderAt(source: CcihDataSource, path: string) {
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

describe('alert center', () => {
  it('requires a resolution before closing and shows the high-priority count in the menu', async () => {
    const user = userEvent.setup();
    const { source, operations } = fakeSource('enf_ccih');
    renderAt(source, '/alertas');
    expect(await screen.findByRole('link', { name: 'Respirador N95: Ruptura iminente' })).toHaveAttribute('href', '/alertas/a1');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(await within(nav).findByText('1', { selector: '.nav-count' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Encerrar: Respirador/ }));
    const dialog = screen.getByRole('dialog', { name: 'Encerrar alerta?' });
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar' }));
    expect(within(dialog).getByText('Descreva o motivo (mínimo 10 caracteres).')).toBeInTheDocument();
    expect(operations.closeAlert).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/O que foi feito/), 'Compra emergencial solicitada');
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar' }));
    expect(operations.closeAlert).toHaveBeenCalledWith('a1', 'Compra emergencial solicitada', 1);
  });

  it('offers no actions to profiles without alerts:manage', async () => {
    const { source } = fakeSource('auditor');
    renderAt(source, '/alertas');
    expect(await screen.findByText('Respirador N95: Ruptura iminente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encerrar|Assumir|Reconhecer/ })).toBeNull();
  });

  it('never offers manual closing of a blocking alert in the list', async () => {
    const { source } = fakeSource('enf_ccih');
    renderAt(source, '/alertas');
    expect(await screen.findByText('Bloqueante')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encerrar: Autoclave 2/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Tratar: Autoclave 2/ })).toHaveAttribute('href', '/alertas/b1');
    expect(screen.getByRole('button', { name: /Reconhecer: Autoclave 2/ })).toBeInTheDocument();
  });

  it('closes a blocking alert only through a justified formal exception, for profiles allowed to', async () => {
    const user = userEvent.setup();
    const { source, operations } = fakeSource('enf_ccih');
    renderAt(source, '/alertas/b1');
    expect(await screen.findByText('Alerta bloqueante')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encerrar' })).toBeNull();
    expect(screen.getByText('Criado — Sistema')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exceção formal…' }));
    const dialog = screen.getByRole('dialog', { name: 'Exceção formal' });
    await user.type(within(dialog).getByLabelText(/Justificativa da exceção/), 'Ciclo de emergência autorizado pela CCIH');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar exceção e encerrar' }));
    expect(operations.alertException).toHaveBeenCalledWith('b1', 'Ciclo de emergência autorizado pela CCIH', 1);
  });

  it('hides the formal exception from profiles without alerts:exception', async () => {
    const { source } = fakeSource('cme');
    renderAt(source, '/alertas/b1');
    expect(await screen.findByText('Alerta bloqueante')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar resolução' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exceção formal…' })).toBeNull();
  });
});

describe('bundle audit form', () => {
  it('evaluates the answers live and blocks unanswered items', async () => {
    const user = userEvent.setup();
    const { source, operations } = fakeSource('enf_ccih');
    renderAt(source, '/bundles');
    await user.click(await screen.findByRole('button', { name: 'Nova auditoria de bundle' }));
    await user.selectOptions(screen.getByLabelText(/^Setor \*/), 'uti');
    await user.click(within(screen.getByRole('group', { name: 'Higiene das mãos antes do manuseio' })).getByRole('button', { name: 'Conforme' }));
    await user.click(screen.getByRole('button', { name: 'Registrar auditoria' }));
    expect(screen.getByText('Responda todos os itens (1 sem resposta).')).toBeInTheDocument();
    expect(operations.createBundleAudit).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('group', { name: 'Curativo íntegro' })).getByRole('button', { name: 'Não conforme' }));
    expect(screen.getByText('Não conforme — 1 item')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar auditoria' }));
    expect(operations.createBundleAudit).toHaveBeenCalledWith(expect.objectContaining({ templateId: 't1', sectorId: 'uti', answers: [{ itemId: 'i1', answer: 'conforme' }, { itemId: 'i2', answer: 'nao_conforme' }] }));
  });

  it('explains that the module needs the backend in the in-browser demo', async () => {
    renderAt(new DemoDataSource(() => new Date('2026-10-09T12:00:00Z')), '/treinamentos');
    expect(await screen.findByText('Módulo disponível com o backend')).toBeInTheDocument();
  });
});

describe('password change', () => {
  it('sends a user with a temporary password to "Minha conta" and releases the app after the change', async () => {
    const user = userEvent.setup();
    const { source, auth } = fakeSource('enf_ccih', true);
    const router = renderAt(source, '/pacientes');
    expect(await screen.findByText('Troque sua senha para continuar')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/conta');
    expect(screen.queryByRole('navigation', { name: 'Principal' })?.querySelectorAll('a').length ?? 0).toBe(0);
    await user.type(screen.getByLabelText(/Senha atual/), 'Tmp-temporaria-1!');
    await user.type(screen.getByLabelText(/^Nova senha/), 'curta');
    await user.type(screen.getByLabelText(/Confirme/), 'curta');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(screen.getByText('A senha deve ter ao menos 12 caracteres.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Nova senha/));
    await user.type(screen.getByLabelText(/^Nova senha/), 'Nova-Senha-Forte-26');
    await user.clear(screen.getByLabelText(/Confirme/));
    await user.type(screen.getByLabelText(/Confirme/), 'Nova-Senha-Forte-26');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(auth.changePassword).toHaveBeenCalledWith('Tmp-temporaria-1!', 'Nova-Senha-Forte-26');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { level: 1, name: /Visão Geral/ }, { timeout: 3000 })).toBeInTheDocument();
  });

  it('applies the same password policy as the server', () => {
    expect(passwordHint('abcdefghijkl', 'x')).toMatch(/três tipos/);
    expect(passwordHint('Enf.ccih-Senha-1', 'enf.ccih')).toMatch(/nome de usuário/);
    expect(passwordHint('Senha-Forte-2026', 'enf.ccih')).toBeNull();
  });
});
