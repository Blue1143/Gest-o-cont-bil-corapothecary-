import type { FactRow, InstitutionData, WithProvenance } from '@ccih/domain';
import type { AdminPort, AuthPort, CcihDataSource, FactsQuery, SessionInfo } from '../port';
import { createHttpClient, type HttpClient } from './http';

/** Backend source: every authorization decision is taken by the API; the UI only reflects it. */
export class ApiDataSource implements CcihDataSource {
  readonly origin = 'real' as const;
  readonly auth: AuthPort;
  readonly admin: AdminPort;
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
  }

  getInstitution(): Promise<WithProvenance<InstitutionData>> {
    return this.http.get('/institution');
  }

  getFacts(query: FactsQuery): Promise<WithProvenance<{ rows: FactRow[] }>> {
    return this.http.get('/facts', { from: query.from, to: query.to });
  }
}
