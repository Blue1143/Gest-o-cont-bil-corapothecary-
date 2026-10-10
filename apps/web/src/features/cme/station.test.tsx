import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_SCAN_CONFIG, type ProcessSummaryDto, type RoleCode, type ScanResponse, type StationDto } from '@ccih/domain';
import { DemoDataSource } from '../../data/demo/DemoDataSource';
import { DataSourceProvider } from '../../data/source';
import { ApiError } from '../../data/api/http';
import type { AuthPort, CcihDataSource, ClinicalPort, CmePort } from '../../data/port';
import { routes } from '../../app/routes';
import { SessionProvider } from '../auth/session';
import { ScanInput } from './scan/ScanInput';

const STATION: StationDto = {
  id: 'st1', sectorId: 'cme', name: 'Limpeza', location: 'Área suja', steps: ['limpeza'], inputMethods: ['leitor', 'manual'], symbologies: ['code128'], deviceLabel: null,
  responsibleUserId: null, responsibleName: null, requirePairing: false, scanConfig: DEFAULT_SCAN_CONFIG, enabled: true, lastSeenAt: null, devices: [], rowVersion: 1,
};
const PROCESS: ProcessSummaryDto = {
  id: 'p1', code: 'AT-K7M2Q9X4', assetCode: 'AT-K7M2Q9X4', description: 'Caixa de laparotomia', setName: 'Caixa de laparotomia', currentStep: 'recepcao', state: 'em_processo',
  nextSteps: ['limpeza'], packageLabel: null, loadId: null, loadCode: null, loadStatus: null, destinationSectorId: null, openedAt: '2026-10-09T12:00:00Z', closedAt: null, legacy: false, origin: 'demo',
};

function fakeSource(role: RoleCode, scan: CmePort['scan'], station: StationDto = STATION) {
  const demo = new DemoDataSource(() => new Date('2026-10-09T15:00:00Z'));
  const auth: AuthPort = {
    me: async () => ({ user: { id: 'u1', login: role, displayName: 'Operador' }, roles: [role], permissions: DEFAULT_ROLE_PERMISSIONS[role], scope: null, session: { expiresAt: '2026-10-09T23:00:00Z', idleExpiresAt: '2026-10-09T16:00:00Z', idleMinutes: 30 }, mustChangePassword: false }),
    login: async () => undefined, logout: async () => undefined, changePassword: async () => undefined,
  };
  const cme = {
    sectors: vi.fn(async () => ({ sectors: [{ id: 'cc', code: 'cc', name: 'Centro Cirúrgico', kind: 'centro_cirurgico', active: true }, { id: 'cme', code: 'cme', name: 'CME', kind: 'cme', active: true }] })),
    stations: vi.fn(async () => ({ stations: [station] })),
    thisStation: vi.fn(async () => ({ station: null, deviceId: null })),
    scanEvents: vi.fn(async () => ({ events: [] })),
    processes: vi.fn(async () => ({ rows: [PROCESS], total: 1, page: 1, pageSize: 25 })),
    scan: vi.fn(scan),
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

/** Keystrokes into the field (timing comes from the mocked performance.now). */
function typeInto(field: HTMLElement, text: string) {
  for (const ch of text) {
    fireEvent.keyDown(field, { key: ch });
    fireEvent.change(field, { target: { value: (field as HTMLInputElement).value + ch } });
  }
}

const accepted = (result: ScanResponse['result'] = 'aceita', message = 'Limpeza registrada.'): ScanResponse => ({ eventId: 'e1', result, message, replay: false, process: { ...PROCESS, currentStep: 'limpeza', nextSteps: ['inspecao'] }, load: null });

afterEach(() => vi.restoreAllMocks());

describe('reading field', () => {
  it('labels a fast burst ending in Enter as a reader, and slow typing as manual', async () => {
    const onCode = vi.fn();
    render(<ScanInput config={DEFAULT_SCAN_CONFIG} allowCamera={false} busy={false} onCode={onCode} />);
    const field = screen.getByLabelText('Leitura do código de barras');
    expect(field).toHaveFocus();
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 6));
    typeInto(field, 'AT-K7M2Q9X4');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCode).toHaveBeenLastCalledWith({ code: 'AT-K7M2Q9X4', method: 'leitor' });
    t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 180));
    typeInto(field, 'AT-K7M2Q9X4');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCode).toHaveBeenLastCalledWith({ code: 'AT-K7M2Q9X4', method: 'manual' });
    expect(field).toHaveValue('');
  });
});

describe('reading station', () => {
  it('sends the reading with station, step and an idempotency key, and shows the server decision', async () => {
    const { source, cme } = fakeSource('cme', async () => accepted());
    renderAt(source, '/cme/estacao?estacao=st1');
    const field = await screen.findByLabelText('Leitura do código de barras');
    await userEvent.type(field, 'AT-K7M2Q9X4{Enter}', { delay: null });
    await waitFor(() => expect(cme.scan).toHaveBeenCalled());
    const sent = vi.mocked(cme.scan).mock.calls[0]![0];
    expect(sent).toMatchObject({ stationId: 'st1', step: 'limpeza', code: 'AT-K7M2Q9X4', override: false });
    expect(sent.clientEventId).toMatch(/^[A-Za-z0-9-]{8,}$/);
    expect(sent.deviceAt).toBeTruthy();
    expect(await screen.findByText('Limpeza registrada.')).toBeInTheDocument();
    expect(screen.getByText('Leitura aceita')).toBeInTheDocument();
  });

  it('offers an authorized exception only for sequence problems and only with permission', async () => {
    const { source, cme } = fakeSource('cme', async () => accepted('etapa_incorreta', 'Etapa obrigatória pendente: Limpeza.'));
    renderAt(source, '/cme/estacao?estacao=st1');
    await userEvent.type(await screen.findByLabelText('Leitura do código de barras'), 'AT-K7M2Q9X4{Enter}', { delay: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar exceção de sequência…' }));
    await userEvent.type(screen.getByLabelText(/Justificativa da exceção/), 'Leitura da lavadora registrada no papel');
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar exceção' }));
    await waitFor(() => expect(cme.scan).toHaveBeenCalledTimes(2));
    expect(vi.mocked(cme.scan).mock.calls[1]![0]).toMatchObject({ override: true, justification: 'Leitura da lavadora registrada no papel' });
  });

  it('never queues readings offline: it says the reading was not recorded and resends the same one', async () => {
    let calls = 0;
    const { source, cme } = fakeSource('cme', async () => { calls++; if (calls === 1) throw new ApiError(0, 'rede', 'Sem conexão'); return accepted(); });
    renderAt(source, '/cme/estacao?estacao=st1');
    await userEvent.type(await screen.findByLabelText('Leitura do código de barras'), 'AT-K7M2Q9X4{Enter}', { delay: null });
    expect(await screen.findByText('Sem conexão: a leitura NÃO foi registrada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Repetir envio' }));
    await waitFor(() => expect(cme.scan).toHaveBeenCalledTimes(2));
    expect(vi.mocked(cme.scan).mock.calls[1]![0].clientEventId).toBe(vi.mocked(cme.scan).mock.calls[0]![0].clientEventId);
  });

  it('after a manual conference, offers to continue at the next step when this station handles it', async () => {
    const both: StationDto = { ...STATION, steps: ['limpeza', 'inspecao'] };
    const { source, cme } = fakeSource('cme', async () => accepted(), both);
    renderAt(source, '/cme/estacao?estacao=st1');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar Caixa de laparotomia AT-K7M2Q9X4' }));
    expect(vi.mocked(cme.scan).mock.calls[0]![0]).toMatchObject({ inputMethod: 'manual', step: 'limpeza', justification: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar: Inspeção' }));
    expect(await screen.findByRole('button', { name: 'Inspeção', pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar: Inspeção' })).not.toBeInTheDocument();
  });

  it('lets the operator confirm a material manually when there is no reader', async () => {
    const { source, cme } = fakeSource('cme', async () => accepted());
    renderAt(source, '/cme/estacao?estacao=st1');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar Caixa de laparotomia AT-K7M2Q9X4' }));
    await waitFor(() => expect(cme.scan).toHaveBeenCalled());
    expect(cme.processes).toHaveBeenCalledWith(expect.objectContaining({ aguardando: 'limpeza' }));
    expect(vi.mocked(cme.scan).mock.calls[0]![0]).toMatchObject({ inputMethod: 'manual', code: 'AT-K7M2Q9X4' });
  });
});
