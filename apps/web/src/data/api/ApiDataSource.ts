import type { FactRow, InstitutionData, WithProvenance } from '@ccih/domain';
import type { AdminPort, AuthPort, CcihDataSource, ClinicalPort, FactsQuery, OrgAdminPort, SessionInfo } from '../port';
import { createHttpClient, type HttpClient } from './http';

/** Backend source: every authorization decision is taken by the API; the UI only reflects it. */
export class ApiDataSource implements CcihDataSource {
  readonly origin = 'real' as const;
  readonly auth: AuthPort;
  readonly admin: AdminPort;
  readonly clinical: ClinicalPort;
  readonly orgAdmin: OrgAdminPort;
  private readonly http: HttpClient;

  constructor(base = '/api', onUnauthorized: () => void = () => {}) {
    this.http = createHttpClient(base, () => onUnauthorized());
    const http = this.http;
    this.auth = {
      me: async () => {
        const r = await http.get<(SessionInfo & { authenticated: true }) | { authenticated: false }>('/auth/me');
        return r.authenticated ? r : null;
      },
      login: async (login, password) => { await http.send('POST', '/auth/login', { login, password }); },
      logout: async () => { await http.send('POST', '/auth/logout'); },
    };
    const ok = async (p: Promise<unknown>) => { await p; };
    this.admin = {
      versions: () => http.get('/config/versions'),
      saveTarget: (id, input) => ok(http.send('PUT', `/config/targets/${encodeURIComponent(id)}`, input)),
      deleteTarget: (id, justification) => ok(http.send('DELETE', `/config/targets/${encodeURIComponent(id)}`, { justification })),
      saveRule: (key, input) => ok(http.send('PUT', `/config/rules/${encodeURIComponent(key)}`, input)),
      createReference: (input) => ok(http.send('POST', '/config/references', input)),
      updateReference: (id, input) => ok(http.send('PUT', `/config/references/${encodeURIComponent(id)}`, input)),
      validateReference: (id, input) => ok(http.send('POST', `/config/references/${encodeURIComponent(id)}/validate`, input)),
      savePolicy: (input) => ok(http.send('PUT', '/config/load-release-policy', input)),
      users: () => http.get('/users'),
      roles: () => http.get('/roles'),
      patchUser: (id, input) => ok(http.send('PATCH', `/users/${encodeURIComponent(id)}`, input)),
      unlockUser: (id) => ok(http.send('POST', `/users/${encodeURIComponent(id)}/unlock`)),
      audit: (q) => http.get('/audit', q),
      verifyAudit: () => http.get('/audit/verify'),
      logExport: (event) => ok(http.send('POST', '/audit/events/export', event)),
    };
    const id = (v: string) => encodeURIComponent(v);
    this.clinical = {
      org: () => http.get('/org'),
      patients: (q) => http.get('/patients', q),
      patient: (p) => http.get(`/patients/${id(p)}`),
      createPatient: (input) => http.send('POST', '/patients', input),
      updatePatient: (p, input) => ok(http.send('PUT', `/patients/${id(p)}`, input)),
      revealName: (p, reason) => http.send('POST', `/patients/${id(p)}/reveal`, { reason }),
      admit: (p, input) => http.send('POST', `/patients/${id(p)}/admissions`, input),
      transfer: (a, input) => ok(http.send('POST', `/admissions/${id(a)}/transfer`, input)),
      discharge: (a, input) => http.send('POST', `/admissions/${id(a)}/discharge`, input),
      addDevice: (a, input) => ok(http.send('POST', `/admissions/${id(a)}/devices`, input)),
      removeDevice: (d, input) => ok(http.send('POST', `/devices/${id(d)}/remove`, input)),
      addNote: (p, input) => ok(http.send('POST', `/patients/${id(p)}/notes`, input)),
      amendNote: (n, input) => ok(http.send('POST', `/notes/${id(n)}/amend`, input)),
      census: (date) => http.get('/census', { date }),
      censusMonth: (month) => http.get('/census/month', { month }),
      cases: (q) => http.get('/iras', q),
      case: (c) => http.get(`/iras/${id(c)}`),
      createCase: (input) => http.send('POST', '/iras', input),
      updateCase: (c, input) => ok(http.send('PUT', `/iras/${id(c)}`, input)),
      changeCaseStatus: (c, input) => http.send('POST', `/iras/${id(c)}/status`, input),
      surgeries: (q) => http.get('/surgeries', q),
      surgery: (sid) => http.get(`/surgeries/${id(sid)}`),
      createSurgery: (input) => http.send('POST', '/surgeries', input),
      updateSurgery: (sid, input) => ok(http.send('PUT', `/surgeries/${id(sid)}`, input)),
      professionals: () => http.get('/professionals'),
      procedures: () => http.get('/procedures'),
      cultures: (q) => http.get('/cultures', q),
      culture: (c) => http.get(`/cultures/${id(c)}`),
      createCulture: (input) => http.send('POST', '/cultures', input),
      addCultureResult: (c, input) => http.send('POST', `/cultures/${id(c)}/results`, input),
      consolidate: (months) => http.send('POST', '/facts/consolidate', { months }),
    };
    this.orgAdmin = {
      createUnit: (input) => ok(http.send('POST', '/org/units', input)),
      updateUnit: (u, input) => ok(http.send('PUT', `/org/units/${id(u)}`, input)),
      createSector: (input) => ok(http.send('POST', '/org/sectors', input)),
      updateSector: (sid, input) => ok(http.send('PUT', `/org/sectors/${id(sid)}`, input)),
      addBeds: (sid, input) => ok(http.send('POST', `/org/sectors/${id(sid)}/beds`, input)),
      updateBed: (b, input) => ok(http.send('PUT', `/org/beds/${id(b)}`, input)),
    };
  }

  getInstitution(): Promise<WithProvenance<InstitutionData>> {
    return this.http.get('/institution');
  }

  getFacts(query: FactsQuery): Promise<WithProvenance<{ rows: FactRow[] }>> {
    return this.http.get('/facts', { from: query.from, to: query.to });
  }
}
