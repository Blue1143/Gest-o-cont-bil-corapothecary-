import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ALERT_KIND_LABEL, ALERT_PRIORITY_LABEL, ALERT_STATUS_LABEL, formatDate, type AlertDto, type AlertKind, type AlertPriority, type Status } from '@ccih/domain';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormMessage, LoadingState, StatusBadge } from '@ccih/ui';
import { useSession } from '../auth/session';
import { justificationError } from '../admin/shared';
import { PageHeader, Pager, sectorName, useOrg, useTimeZone } from '../clinical/shared';
import { RequireOps, useOps, useOpsMutation, useUrlFilters } from './shared';

const PRIORITY_TONE: Record<AlertPriority, Status> = { alta: 'crit', media: 'warn', baixa: 'info' };

export function AlertsPage() {
  return <RequireOps title="Alertas"><Alerts /></RequireOps>;
}

function Alerts() {
  const ops = useOps()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const f = useUrlFilters({ situacao: 'abertos' });
  const query = { status: f.get('situacao'), priority: f.get('prioridade') || undefined, kind: f.get('tipo') || undefined, mine: f.get('meus') || undefined, page: f.page, pageSize: 25 };
  const list = useQuery({ queryKey: ['alerts', query], queryFn: () => ops.alerts(query), refetchInterval: 120_000 });
  const canManage = session.can('alerts:manage');
  const [closing, setClosing] = useState<AlertDto | null>(null);
  const assume = useOpsMutation((a: AlertDto) => ops.assumeAlert(a.id, a.rowVersion));
  const refresh = useOpsMutation(() => ops.refreshAlerts());

  return (
    <div className="page">
      <PageHeader title="Alertas" subtitle="Gerados a partir dos registros com os prazos configurados pela instituição. Um alerta por situação (sem duplicidade); encerrar exige registrar o que foi feito, e a mesma situação não volta a alertar durante o período de supressão configurado."
        actions={canManage ? <Button icon="refresh" onClick={() => refresh.mutation.mutate(undefined)} disabled={refresh.mutation.isPending}>Atualizar agora</Button> : null} />
      {assume.formError ? <FormMessage tone="error">{assume.formError}</FormMessage> : null}
      <div className="filters">
        <div className="field">
          <label htmlFor="al-sit">Situação</label>
          <select id="al-sit" className="select" value={f.get('situacao')} onChange={(e) => f.set('situacao', e.target.value)}>
            <option value="abertos">Abertos e assumidos</option>
            {Object.entries(ALERT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-pri">Prioridade</label>
          <select id="al-pri" className="select" value={f.get('prioridade')} onChange={(e) => f.set('prioridade', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ALERT_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-tipo">Tipo</label>
          <select id="al-tipo" className="select" value={f.get('tipo')} onChange={(e) => f.set('tipo', e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(ALERT_KIND_LABEL) as AlertKind[]).map((k) => <option key={k} value={k}>{ALERT_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <label className="ig-row" style={{ gap: 6, alignSelf: 'center' }}><input type="checkbox" checked={f.get('meus') === '1'} onChange={(e) => f.set('meus', e.target.checked ? '1' : '')} /> Só os assumidos por mim</label>
      </div>
      {list.isPending ? <Card><LoadingState /></Card> : list.isError ? <Card><ErrorState onRetry={() => void list.refetch()} /></Card> : !list.data.rows.length ? (
        <Card><EmptyState title="Nenhum alerta com estes filtros">Os alertas aparecem quando um registro ultrapassa um prazo ou limite configurado.</EmptyState></Card>
      ) : (
        <ul className="alert-list" aria-label="Alertas">
          {list.data.rows.map((a) => (
            <li key={a.id} className="alert-item">
              <div className="alert-main">
                <div className="ig-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <StatusBadge status={PRIORITY_TONE[a.priority]}>Prioridade {ALERT_PRIORITY_LABEL[a.priority].toLowerCase()}</StatusBadge>
                  <span className="ig-small ig-muted">{ALERT_KIND_LABEL[a.kind]}{a.sectorId ? ` · ${sectorName(org.data, a.sectorId)}` : ''}</span>
                </div>
                <p className="alert-title">{a.link ? <Link to={a.link}>{a.title}</Link> : a.title}</p>
                <p className="ig-small" style={{ margin: 0 }}>{a.detail}</p>
                <p className="ig-small ig-muted" style={{ margin: 0 }}>
                  Desde {formatDate(a.createdAt, tz)} · {ALERT_STATUS_LABEL[a.status]}
                  {a.assignedName ? ` por ${a.assignedName}` : ''}
                  {a.status === 'encerrado' ? ` · encerrado por ${a.closedByName} em ${formatDate(a.closedAt, tz)}: ${a.resolution}` : ''}
                </p>
              </div>
              {canManage && a.status !== 'encerrado' ? (
                <div className="ig-row" style={{ gap: 8 }}>
                  {a.status === 'aberto' ? <Button size="sm" onClick={() => assume.mutation.mutate(a)} aria-label={`Assumir: ${a.title}`}>Assumir</Button> : null}
                  <Button size="sm" variant="primary" onClick={() => setClosing(a)} aria-label={`Encerrar: ${a.title}`}>Encerrar</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {list.data ? <Pager page={f.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => f.set('pagina', String(p))} /> : null}
      <CloseDialog alert={closing} onClose={() => setClosing(null)} />
    </div>
  );
}

function CloseDialog({ alert, onClose }: { alert: AlertDto | null; onClose: () => void }) {
  const ops = useOps()!;
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useOpsMutation((a: AlertDto) => ops.closeAlert(a.id, resolution.trim(), a.rowVersion));
  return (
    <ConfirmDialog open={!!alert} title="Encerrar alerta?" confirmLabel="Encerrar" busy={m.mutation.isPending}
      onCancel={() => { setResolution(''); setError(null); onClose(); }}
      onConfirm={() => {
        const e = justificationError(resolution);
        if (e) { setError(e); return; }
        m.mutation.mutate(alert!, { onSuccess: () => { setResolution(''); onClose(); } });
      }}>
      <p style={{ marginTop: 0 }}>{alert?.title}</p>
      <Field label="O que foi feito" required hint="Fica registrado no alerta e no log de auditoria." error={error ?? m.formError}>
        <textarea value={resolution} onChange={(e) => { setResolution(e.target.value); setError(null); }} maxLength={500} />
      </Field>
    </ConfirmDialog>
  );
}

/** Small counter for the navigation: open high-priority alerts. */
export function useAlertCount() {
  const ops = useOps();
  const session = useSession();
  return useQuery({ queryKey: ['alerts', 'summary'], enabled: !!ops && session.status === 'authenticated' && session.can('alerts:view') && !session.info?.mustChangePassword, queryFn: () => ops!.alertSummary(), refetchInterval: 120_000, staleTime: 60_000 });
}
