import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, type RoleCode, type UserNotificationDto } from '@ccih/domain';
import { DemoDataSource } from '../../data/demo/DemoDataSource';
import { DataSourceProvider } from '../../data/source';
import type { AuthPort, CcihDataSource, InboxPort } from '../../data/port';
import { routes } from '../../app/routes';
import { SessionProvider } from '../auth/session';

const NOTE: UserNotificationDto = {
  id: 'n1', kind: 'nao_conformidade', title: 'Não conformidade: uso sem saída registrada do CME', entity: 'nonconformity', entityId: 'nc1', link: '/auditorias/nao-conformidades/nc1',
  detail: 'Pacote PL1-261009-03-01 (Ótica 30° 10 mm) usado em Centro Cirúrgico em 09/10/2026 sem saída registrada do CME.', createdAt: '2026-10-09T14:00:00Z', readAt: null, dataOrigin: 'demo',
};

function fakeSource(role: RoleCode) {
  const demo = new DemoDataSource(() => new Date('2026-10-09T15:00:00Z'));
  const auth: AuthPort = {
    me: async () => ({ user: { id: 'u1', login: role, displayName: 'Usuário' }, roles: [role], permissions: DEFAULT_ROLE_PERMISSIONS[role], scope: null, session: { expiresAt: '2026-10-09T23:00:00Z', idleExpiresAt: '2026-10-09T16:00:00Z', idleMinutes: 30 }, mustChangePassword: false }),
    login: async () => undefined, logout: async () => undefined, changePassword: async () => undefined,
  };
  let read = false;
  const inbox = {
    notifications: vi.fn(async () => ({ rows: read ? [] : [NOTE], unread: read ? 0 : 1 })),
    markRead: vi.fn(async () => { read = true; }),
    markAllRead: vi.fn(async () => { read = true; }),
  } satisfies InboxPort;
  const source: CcihDataSource = { origin: 'real', auth, inbox, getInstitution: () => demo.getInstitution(), getFacts: (q) => demo.getFacts(q) };
  return { source, inbox };
}

function renderAt(source: CcihDataSource, path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider source={source}><SessionProvider><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></SessionProvider></DataSourceProvider>
    </QueryClientProvider>,
  );
}

describe('personal notifications', () => {
  it('shows the unread count in the header and marks a notification as read', async () => {
    const { source, inbox } = fakeSource('enf_ccih');
    renderAt(source, '/notificacoes');
    expect(await screen.findByRole('link', { name: 'Notificações: 1 não lida' })).toBeInTheDocument();
    expect(await screen.findByText(/usado em Centro Cirúrgico/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir a não conformidade' })).toHaveAttribute('href', '/auditorias/nao-conformidades/nc1');
    await userEvent.click(screen.getByRole('button', { name: /^Marcar como lida:/ }));
    await waitFor(() => expect(inbox.markRead).toHaveBeenCalledWith('n1'));
    expect(await screen.findByText('Nenhuma notificação não lida')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Notificações' })).toBeInTheDocument();
  });

  it('keeps the text complete but hides the link from users who cannot open non-conformities', async () => {
    const { source } = fakeSource('cme');
    renderAt(source, '/notificacoes');
    expect(await screen.findByText(/usado em Centro Cirúrgico/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir a não conformidade' })).not.toBeInTheDocument();
  });
});
