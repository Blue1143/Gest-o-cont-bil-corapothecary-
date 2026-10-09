import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, type IrasCaseDetail, type OrgPayload, type PatientDetail, type RoleCode } from '@ccih/domain';
import { DemoDataSource } from '../../data/demo/DemoDataSource';
import { DataSourceProvider } from '../../data/source';
import type { AuthPort, CcihDataSource, ClinicalPort } from '../../data/port';
import { routes } from '../../app/routes';
import { SessionProvider } from '../auth/session';
import { expandBedCodes } from '../admin/OrgPage';

const ORG: OrgPayload = {
  units: [{ id: 'central', name: 'Unidade Central', active: true, rowVersion: 1 }],
  sectors: [
    { id: 'uti-adulto', code: 'uti-adulto', name: 'UTI Adulto', unitId: 'central', kind: 'uti', active: true, rowVersion: 1, beds: [{ id: 'b1', code: '01', active: true, occupied: true }] },
    { id: 'centro-cirurgico', code: 'centro-cirurgico', name: 'Centro Cirúrgico', unitId: 'central', kind: 'centro_cirurgico', active: true, rowVersion: 1, beds: [] },
  ],
};
const ADMISSION = {
  id: 'a1', admittedAt: '2026-10-01T13:00:00Z', dischargedAt: null, outcome: null, diagnosis: 'Choque séptico', rowVersion: 1,
  movements: [{ id: 'm1', sectorId: 'uti-adulto', bedId: 'b1', bedCode: '01', start: '2026-10-01T13:00:00Z', end: null, reason: 'Admissão' }],
  devices: [{ id: 'd1', admissionId: 'a1', type: 'CVC' as const, site: 'Veia jugular interna direita', indication: null, insertedAt: '2026-10-02T12:00:00Z', removedAt: null, removalReason: null, rowVersion: 1 }],
};
const PATIENT: PatientDetail = {
  id: 'p1', recordNumber: 'DEMO-100001', initials: 'MAS', sex: 'F', birthDate: '1950-03-10', hasFullName: true, origin: 'demo', rowVersion: 1,
  current: { admissionId: 'a1', admittedAt: ADMISSION.admittedAt, sectorId: 'uti-adulto', bedCode: '01' }, activeDevices: ['CVC'], openCases: 1,
  admissions: [ADMISSION], surgeries: [], cultures: [], notes: [],
  cases: [],
};
const CASE: IrasCaseDetail = {
  id: 'c1', patient: { id: 'p1', recordNumber: 'DEMO-100001', initials: 'MAS' }, admissionId: 'a1', type: 'IPCS', status: 'em_investigacao', eventDate: '2026-10-06', sectorId: 'uti-adulto',
  deviceAssociated: null, deviceType: 'CVC', surgeryId: null, criterion: null, createdAt: '2026-10-06T14:00:00Z', updatedAt: '2026-10-07T14:00:00Z', rowVersion: 2, origin: 'demo',
  description: 'Febre e hemocultura positiva.', deviceUseId: 'd1', cultureIds: [], criterionReferenceId: null,
  history: [{ id: 'h1', from: null, to: 'suspeita', at: '2026-10-06T14:00:00Z', by: 'CCIH', justification: 'Busca ativa' }, { id: 'h2', from: 'suspeita', to: 'em_investigacao', at: '2026-10-07T14:00:00Z', by: 'CCIH', justification: 'Revisão iniciada' }],
  admission: ADMISSION, cultures: [], surgery: null, notes: [],
  context: { hospitalDay: 6, healthcareAssociated: 'elegivel', hospitalAcquiredFromDay: 3, devices: [{ id: 'd1', type: 'CVC', deviceDayOnEvent: 5, association: 'elegivel', relevant: true }] },
};

function fakeSource(role: RoleCode) {
  const demo = new DemoDataSource(() => new Date('2026-10-09T12:00:00Z'));
  const auth: AuthPort = {
    me: async () => ({ user: { id: 'u1', login: role, displayName: `Usuário ${role}` }, roles: [role], permissions: DEFAULT_ROLE_PERMISSIONS[role], scope: null, session: { expiresAt: '2026-10-09T23:00:00Z', idleExpiresAt: '2026-10-09T13:00:00Z', idleMinutes: 30 } }),
    login: async () => undefined,
    logout: async () => undefined,
    changePassword: async () => undefined,
  };
  const clinical = {
    org: vi.fn(async () => ORG),
    patient: vi.fn(async () => PATIENT),
    revealName: vi.fn(async () => ({ fullName: 'Maria Aparecida Souza', available: true, reason: null })),
    case: vi.fn(async () => CASE),
    changeCaseStatus: vi.fn(async () => ({ criterionValidated: false })),
    patients: vi.fn(async () => ({ rows: [PATIENT], total: 1, page: 1, pageSize: 25 })),
  } as unknown as ClinicalPort & Record<string, ReturnType<typeof vi.fn>>;
  const source: CcihDataSource = { origin: 'real', auth, clinical, getInstitution: () => demo.getInstitution(), getFacts: (q) => demo.getFacts(q) };
  return { source, clinical };
}

function renderAt(source: CcihDataSource, path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider source={source}>
        <SessionProvider>
          <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
        </SessionProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  );
}

describe('clinical modules', () => {
  it('explain that they need the backend when the source is the in-browser demo', async () => {
    renderAt(new DemoDataSource(() => new Date('2026-10-09T12:00:00Z')), '/pacientes');
    expect(await screen.findByText('Módulo disponível com o backend')).toBeInTheDocument();
  });

  it('identify patients by initials and record number, never by name, in the list', async () => {
    const { source } = fakeSource('enf_ccih');
    renderAt(source, '/pacientes');
    const table = await screen.findByRole('table', { name: 'Pacientes internados' });
    expect(within(table).getByRole('link', { name: 'Paciente MAS, prontuário DEMO-100001' })).toBeInTheDocument();
    expect(within(table).getByText('UTI Adulto · leito 01')).toBeInTheDocument();
    expect(screen.queryByText(/Maria/)).toBeNull();
  });

  it('reveal the full name only after a justified request', async () => {
    const user = userEvent.setup();
    const { source, clinical } = fakeSource('enf_ccih');
    renderAt(source, '/pacientes/p1');
    await user.click(await screen.findByRole('button', { name: 'Ver nome completo' }));
    const dialog = screen.getByRole('dialog', { name: 'Exibir nome completo?' });
    await user.click(within(dialog).getByRole('button', { name: 'Exibir' }));
    expect(within(dialog).getByText('Descreva o motivo (mínimo 10 caracteres).')).toBeInTheDocument();
    expect(clinical.revealName).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Motivo do acesso/), 'Conferência para notificação compulsória');
    await user.click(within(dialog).getByRole('button', { name: 'Exibir' }));
    expect(await screen.findByText('Maria Aparecida Souza')).toBeInTheDocument();
    expect(clinical.revealName).toHaveBeenCalledWith('p1', 'Conferência para notificação compulsória');
  });

  it('hide the reveal button from profiles without the identified-data permission', async () => {
    const { source } = fakeSource('auditor');
    renderAt(source, '/pacientes/p1');
    expect(await screen.findByText('Internação atual')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver nome completo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transferir' })).toBeNull();
  });

  it('show device days and decision support without classifying the case', async () => {
    const { source } = fakeSource('enf_ccih');
    renderAt(source, '/vigilancia/c1');
    expect(await screen.findByText('Apoio à decisão')).toBeInTheDocument();
    expect(screen.getByText('D5')).toBeInTheDocument();
    expect(screen.getByText('Elegível pelos parâmetros configurados')).toBeInTheDocument();
    expect(screen.getByText('Ainda não decidido')).toBeInTheDocument();
  });

  it('require criterion, device decision and justification to confirm, then confirm explicitly', async () => {
    const user = userEvent.setup();
    const { source, clinical } = fakeSource('infectologista');
    renderAt(source, '/vigilancia/c1');
    await user.click(await screen.findByRole('button', { name: 'Confirmar IRAS' }));
    await user.click(screen.getAllByRole('button', { name: 'Confirmar IRAS' }).at(-1)!);
    expect(screen.getByText('Informe o critério diagnóstico aplicado.')).toBeInTheDocument();
    expect(screen.getByText('Informe se a IRAS é associada ao dispositivo.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Critério diagnóstico aplicado/), screen.getByRole('option', { name: /Critérios diagnósticos de IRAS/ }));
    expect(screen.getByText('Critério sem validação institucional')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Sim \(entra na densidade/));
    await user.type(screen.getByLabelText(/Justificativa/), 'Critérios atendidos após revisão da CCIH');
    await user.click(screen.getAllByRole('button', { name: 'Confirmar IRAS' }).at(-1)!);
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar IRAS?' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar IRAS' }));
    expect(clinical.changeCaseStatus).toHaveBeenCalledWith('c1', expect.objectContaining({ to: 'confirmada', deviceAssociated: true, rowVersion: 2, criterionReferenceId: 'ref-anvisa-criterios-iras' }));
  });

  it('offer no workflow actions to the auditor profile', async () => {
    const { source } = fakeSource('auditor');
    renderAt(source, '/vigilancia/c1');
    expect(await screen.findByText('Histórico do caso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmar IRAS|Descartar|Editar dados/ })).toBeNull();
  });
});

describe('bed codes', () => {
  it('expands ranges keeping zero padding and rejects invalid input', () => {
    expect(expandBedCodes('01-03, 10')).toEqual(['01', '02', '03', '10']);
    expect(expandBedCodes('5-2')).toMatch(/inválido/);
    expect(expandBedCodes('')).toMatch(/ao menos/);
    expect(expandBedCodes('leito 1!')).toMatch(/inválido/);
  });
});
