import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, type LoadDetail, type RoleCode, type TraceResult } from '@ccih/domain';
import { DemoDataSource } from '../../data/demo/DemoDataSource';
import { DataSourceProvider } from '../../data/source';
import type { AuthPort, CcihDataSource, ClinicalPort, CmePort } from '../../data/port';
import { routes } from '../../app/routes';
import { SessionProvider } from '../auth/session';

const LOAD: LoadDetail = {
  id: 'l1', code: 'AV1-261009-01', sterilizerId: 's1', sterilizerName: 'Autoclave 1', program: 'Instrumental 134 °C', startedAt: '2026-10-09T11:00:00Z', endedAt: '2026-10-09T12:00:00Z',
  physical: 'conforme', status: 'aguardando', suggestion: 'aguardando', hasImplant: false, items: 1, used: 0, origin: 'real', reprocessedFromId: null,
  operatorName: 'Técnico', temperatureC: 134, pressureKpa: 304, exposureMinutes: 5, notes: null, rowVersion: 3,
  evaluation: { status: 'aguardando', reasons: ['Indicador químico classe 5 não registrado.'], policyApplied: true },
  policy: { version: 2, requiredLoadTests: ['IQ5', 'REGISTRO_FISICO'], requireDailyBowieDick: true, holdImplantsUntilBiological: true, referenceId: null },
  bowieDickApplies: true, equipmentBowieDick: null, tests: [],
  itemList: [{ id: 'i1', position: 1, labelCode: 'AV1-261009-01-01', setId: 'k1', setCode: 'cx-hernia', description: 'Caixa de herniorrafia', quantity: 1, packaging: 'sms', implant: false, expiresOn: '2026-11-08', use: null, processId: null }],
  decisions: [{ id: 'd0', from: null, to: 'aguardando', at: '2026-10-09T11:00:00Z', by: 'Técnico', justification: 'Carga registrada.', policy: null, evaluation: { status: 'aguardando', reasons: [] } }],
  exposed: { patients: 0, surgeries: 0 }, reprocessedIntoId: null,
};

function fakeSource(role: RoleCode, load: LoadDetail = LOAD) {
  const demo = new DemoDataSource(() => new Date('2026-10-09T15:00:00Z'));
  const auth: AuthPort = {
    me: async () => ({ user: { id: 'u1', login: role, displayName: 'Usuário' }, roles: [role], permissions: DEFAULT_ROLE_PERMISSIONS[role], scope: null, session: { expiresAt: '2026-10-09T23:00:00Z', idleExpiresAt: '2026-10-09T16:00:00Z', idleMinutes: 30 }, mustChangePassword: false }),
    login: async () => undefined, logout: async () => undefined, changePassword: async () => undefined,
  };
  const trace: TraceResult = { query: 'AV1-261009-01-01', truncated: false, rows: [{ itemId: 'i1', labelCode: 'AV1-261009-01-01', description: 'Caixa de herniorrafia', setCode: 'cx-hernia', implant: false, loadId: 'l1', loadCode: 'AV1-261009-01', loadStatus: 'liberada', cycleStartedAt: '2026-10-09T11:00:00Z', sterilizerName: 'Autoclave 1', expiresOn: '2026-11-08', statusAt: '2026-10-09T12:15:00Z', processId: null, use: { id: 'u1', usedAt: '2026-10-09T14:00:00Z', sectorId: 'cc', surgeryId: null, patient: null, procedure: 'Herniorrafia inguinal', recordedBy: 'Centro cirúrgico' } }] };
  const cme = {
    sectors: vi.fn(async () => ({ sectors: [{ id: 'cc', code: 'cc', name: 'Centro Cirúrgico', kind: 'centro_cirurgico', active: true }, { id: 'cme', code: 'cme', name: 'CME', kind: 'cme', active: true }] })),
    load: vi.fn(async () => load),
    decide: vi.fn(async () => undefined),
    trace: vi.fn(async () => trace),
    overview: vi.fn(async () => ({ awaiting: 1, retained: 0, releasedToday: 0, ibPending: 0, recalled30d: 0, sterilizers: [] })),
    loads: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 25 })),
    attachmentUrl: (id: string) => `/api/attachments/${id}`,
  } as unknown as CmePort & Record<string, ReturnType<typeof vi.fn>>;
  const clinical = { org: async () => ({ units: [], sectors: [] }) } as unknown as ClinicalPort;
  const source: CcihDataSource = { origin: 'real', auth, clinical, cme, getInstitution: () => demo.getInstitution(), getFacts: (q) => demo.getFacts(q) };
  return { source, cme };
}

function renderAt(source: CcihDataSource, path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider source={source}><SessionProvider><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></SessionProvider></DataSourceProvider>
    </QueryClientProvider>,
  );
}

describe('load release', () => {
  it('keeps "Liberar" disabled while the policy blocks it and shows why', async () => {
    const { source } = fakeSource('cme');
    renderAt(source, '/cme/cargas/l1');
    expect(await screen.findByRole('button', { name: 'Liberar' })).toBeDisabled();
    expect(screen.getAllByText(/Indicador químico classe 5 não registrado/).length).toBeGreaterThan(0);
    expect(screen.getByText('Bowie-Dick do dia não registrado antes deste ciclo')).toBeInTheDocument();
  });

  it('asks for a reason and a confirmation before retaining a load', async () => {
    const user = userEvent.setup();
    const { source, cme } = fakeSource('cme');
    renderAt(source, '/cme/cargas/l1');
    await user.click(await screen.findByRole('button', { name: 'Reter' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Descreva o motivo (mínimo 10 caracteres).')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Justificativa/), 'Aguardando leitura do indicador químico');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    const dialog = screen.getByRole('dialog', { name: /Reter a carga AV1-261009-01/ });
    expect(cme.decide).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(cme.decide).toHaveBeenCalledWith('l1', { status: 'retida', justification: 'Aguardando leitura do indicador químico', rowVersion: 3 });
  });

  it('flags a recalled load with the exposure and offers no decision to read-only profiles', async () => {
    const recalled: LoadDetail = {
      ...LOAD, status: 'rejeitada', exposed: { patients: 2, surgeries: 2 },
      decisions: [...LOAD.decisions, { id: 'd1', from: 'aguardando', to: 'liberada', at: '2026-10-09T12:15:00Z', by: 'RT', justification: 'Testes conformes', policy: LOAD.policy, evaluation: { status: 'liberada', reasons: [] } }, { id: 'd2', from: 'liberada', to: 'rejeitada', at: '2026-10-10T12:15:00Z', by: 'RT', justification: 'IB positivo', policy: LOAD.policy, evaluation: { status: 'rejeitada', reasons: ['Teste adicional reprovado.'] } }],
    };
    const { source } = fakeSource('auditor', recalled);
    renderAt(source, '/cme/cargas/l1');
    expect(await screen.findByText('Carga recolhida após liberação')).toBeInTheDocument();
    expect(screen.getByText(/2 paciente\(s\) em 2 cirurgia\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Recolhimento — Rejeitada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Liberar|Reter|Rejeitar/ })).toBeNull();
  });
});

describe('traceability', () => {
  it('shows the chain and keeps the patient hidden from profiles without patient access', async () => {
    const { source, cme } = fakeSource('cme');
    renderAt(source, '/rastreabilidade?q=AV1-261009-01-01');
    expect(await screen.findByRole('heading', { name: 'Pacote AV1-261009-01-01' })).toBeInTheDocument();
    expect(cme.trace).toHaveBeenCalledWith('AV1-261009-01-01');
    expect(screen.getAllByText(/paciente visível só para perfis com acesso a pacientes/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Seu perfil não vê pacientes/)).toBeInTheDocument();
  });

  it('explains that the module needs the backend in the in-browser demo', async () => {
    renderAt(new DemoDataSource(() => new Date('2026-10-09T12:00:00Z')), '/cme');
    expect(await screen.findByText('Módulo disponível com o backend')).toBeInTheDocument();
  });
});
