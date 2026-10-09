/** Thin fetch wrapper: same-origin cookies, CSRF header, pt-BR errors from the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

const CSRF_COOKIE = 'ccih_csrf';

function csrfToken(): string | null {
  const m = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return m ? decodeURIComponent(m[1]!) : null;
}

export interface HttpClient {
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T>;
  send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T>;
}

export function createHttpClient(base: string, onUnauthorized: () => void): HttpClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') {
      const token = csrfToken();
      if (token) headers['x-csrf-token'] = token;
    }
    let res: Response;
    try {
      res = await fetch(base + path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'rede', 'Sem conexão com o servidor. Verifique a rede e tente novamente.');
    }
    // A 401 on a protected call means the session ended while in use.
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; fields?: ApiError['fields'] };
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'erro', data.message ?? 'Não foi possível concluir a operação.', data.fields ?? []);
    return data as T;
  }
  return {
    get: (path, query) => {
      const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
      return request('GET', qs ? `${path}?${qs}` : path);
    },
    send: (method, path, body) => request(method, path, body),
  };
}
