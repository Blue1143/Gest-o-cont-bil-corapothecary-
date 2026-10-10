import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, type UserNotificationDto } from '@ccih/domain';
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusBadge } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import { useSession } from '../auth/session';
import { DemoTag, PageHeader, useTimeZone } from '../clinical/shared';

/** Unread count for the header bell (refreshed every minute while the session is active). */
export function useUnreadNotifications() {
  const inbox = useDataSource().inbox;
  const session = useSession();
  return useQuery({
    queryKey: ['notifications', 'nao_lidas'], enabled: !!inbox && session.status === 'authenticated' && !session.info?.mustChangePassword,
    queryFn: () => inbox!.notifications({ situacao: 'nao_lidas' }), refetchInterval: 60_000, staleTime: 30_000,
  });
}

/** Where a notification leads, when the user may open it (the text is complete without it). */
function linkFor(n: UserNotificationDto, can: (p: 'quality:view') => boolean) {
  return n.link && n.entity === 'nonconformity' && can('quality:view') ? n.link : null;
}

export function NotificationsPage() {
  const inbox = useDataSource().inbox;
  const session = useSession();
  const tz = useTimeZone();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const situacao = params.get('situacao') === 'todas' ? 'todas' : 'nao_lidas';
  const list = useQuery({ queryKey: ['notifications', situacao], queryFn: () => inbox!.notifications({ situacao }), enabled: !!inbox });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: (id: string) => inbox!.markRead(id), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => inbox!.markAllRead(), onSuccess: refresh });
  if (!inbox) return <div className="page"><PageHeader title="Notificações" /><EmptyState title="Notificações exigem o servidor">No modo de demonstração local não há usuários.</EmptyState></div>;
  return (
    <div className="page">
      <PageHeader title="Notificações" subtitle="Avisos dirigidos a você. Ficam guardados; marcar como lida não apaga o registro."
        actions={list.data?.unread ? <Button onClick={() => readAll.mutate()} disabled={readAll.isPending}>Marcar todas como lidas</Button> : null} />
      <div className="filters" role="group" aria-label="Situação">
        <Button size="sm" variant={situacao === 'nao_lidas' ? 'primary' : undefined} aria-pressed={situacao === 'nao_lidas'} onClick={() => setParams({})}>Não lidas</Button>
        <Button size="sm" variant={situacao === 'todas' ? 'primary' : undefined} aria-pressed={situacao === 'todas'} onClick={() => setParams({ situacao: 'todas' })}>Todas</Button>
      </div>
      {list.isPending ? <LoadingState /> : list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : list.data.rows.length === 0 ? (
        <EmptyState title={situacao === 'nao_lidas' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'} />
      ) : (
        <ul className="inbox-list">
          {list.data.rows.map((n) => {
            const to = linkFor(n, (p) => session.can(p));
            return (
              <li key={n.id}>
                <Card title={<span>{n.title} <DemoTag origin={n.dataOrigin} /></span>} headingLevel={2}
                  actions={n.readAt ? <StatusBadge status="neutral">Lida</StatusBadge> : <Button size="sm" onClick={() => read.mutate(n.id)} disabled={read.isPending} aria-label={`Marcar como lida: ${n.title}`}>Marcar como lida</Button>}>
                  <p style={{ marginTop: 0 }}>{n.detail}</p>
                  <p className="ig-small ig-muted" style={{ marginBottom: 0 }}>
                    Recebida em {formatDate(n.createdAt, tz)}{n.readAt ? ` · lida em ${formatDate(n.readAt, tz)}` : ''}
                    {to ? <> · <Link to={to}>Abrir a não conformidade</Link></> : null}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
