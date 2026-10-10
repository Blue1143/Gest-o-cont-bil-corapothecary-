import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ALERT_ACTION_LABEL, ALERT_CATEGORY_LABEL, ALERT_CLOSED_REASON_LABEL, ALERT_KIND_LABEL, ALERT_PRIORITY_LABEL, ALERT_PRIORITY_ORDER, ALERT_STATUS_LABEL,
  PROCESS_STEP_LABEL, alertActions, formatDate,
  type AlertActionKind, type AlertCategory, type AlertDto, type AlertKind, type AlertPriority, type ProcessStep, type Status,
} from '@ccih/domain';
import { AlertBanner, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormMessage, LoadingState, StatusBadge } from '@ccih/ui';
import { ApiError } from '../../data/api/http';
import { useSession } from '../auth/session';
import { justificationError } from '../admin/shared';
import { PageHeader, Pager, Timeline, sectorName, useOrg, useTimeZone } from '../clinical/shared';
import { RequireOps, useOps, useOpsMutation, useUrlFilters } from './shared';

const PRIORITY_TONE: Record<AlertPriority, Status> = { critica: 'crit', alta: 'crit', media: 'warn', baixa: 'info' };
const ACTION_TONE: Record<AlertActionKind, Status> = {
  criado: 'info', visualizado: 'neutral', reconhecido: 'info', assumido: 'info', comentado: 'neutral', resolvido: 'ok', encerrado: 'ok', encerrado_automatico: 'ok', excecao: 'warn',
};

const BLOCKING_HELP = 'Alerta bloqueante: não pode ser encerrado enquanto a condição existir no registro de origem. Corrija a causa (o alerta se encerra sozinho) ou registre uma exceção formal.';

export function AlertsPage() {
  return <RequireOps title="Alertas"><Alerts /></RequireOps>;
}

function AlertBadges({ a }: { a: AlertDto }) {
  return (
    <>
      <StatusBadge status={PRIORITY_TONE[a.priority]}>{a.priority === 'critica' ? 'Crítica' : `Prioridade ${ALERT_PRIORITY_LABEL[a.priority].toLowerCase()}`}</StatusBadge>
      {a.blocking ? <StatusBadge status="crit">Bloqueante</StatusBadge> : null}
      <StatusBadge status="neutral">{ALERT_CATEGORY_LABEL[a.category]}</StatusBadge>
    </>
  );
}

function Alerts() {
  const ops = useOps()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const f = useUrlFilters({ situacao: 'abertos' });
  const query = {
    status: f.get('situacao'), priority: f.get('gravidade') || undefined, category: f.get('categoria') || undefined, kind: f.get('tipo') || undefined,
    unitId: f.get('unidade') || undefined, sectorId: f.get('setor') || undefined, from: f.get('de') || undefined, to: f.get('ate') || undefined,
    blocking: f.get('bloqueantes') || undefined, mine: f.get('meus') || undefined, page: f.page, pageSize: 25,
  };
  const list = useQuery({ queryKey: ['alerts', query], queryFn: () => ops.alerts(query), refetchInterval: 120_000 });
  const canManage = session.can('alerts:manage');
  const [closing, setClosing] = useState<AlertDto | null>(null);
  const acknowledge = useOpsMutation((a: AlertDto) => ops.acknowledgeAlert(a.id, a.rowVersion));
  const assume = useOpsMutation((a: AlertDto) => ops.assumeAlert(a.id, a.rowVersion));
  const refresh = useOpsMutation(() => ops.refreshAlerts());
  const unitId = f.get('unidade');
  const sectors = (org.data?.sectors ?? []).filter((s) => !unitId || s.unitId === unitId);

  return (
    <div className="page">
      <PageHeader title="Alertas" subtitle="Gerados a partir dos registros com os prazos configurados pela instituição. Um alerta por situação (sem duplicidade). Visualizar não muda a situação; reconhecer, assumir, resolver e encerrar ficam no histórico do alerta e no log de auditoria."
        actions={canManage ? <Button icon="refresh" onClick={() => refresh.mutation.mutate(undefined)} disabled={refresh.mutation.isPending}>Atualizar agora</Button> : null} />
      {acknowledge.formError ?? assume.formError ? <FormMessage tone="error">{acknowledge.formError ?? assume.formError}</FormMessage> : null}
      <div className="filters">
        <div className="field">
          <label htmlFor="al-sit">Situação</label>
          <select id="al-sit" className="select" value={f.get('situacao')} onChange={(e) => f.set('situacao', e.target.value)}>
            <option value="abertos">Em aberto (todas as etapas)</option>
            {Object.entries(ALERT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-pri">Gravidade</label>
          <select id="al-pri" className="select" value={f.get('gravidade')} onChange={(e) => f.set('gravidade', e.target.value)}>
            <option value="">Todas</option>
            {ALERT_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{ALERT_PRIORITY_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-cat">Categoria</label>
          <select id="al-cat" className="select" value={f.get('categoria')} onChange={(e) => f.set('categoria', e.target.value)}>
            <option value="">Todas</option>
            {(Object.keys(ALERT_CATEGORY_LABEL) as AlertCategory[]).map((k) => <option key={k} value={k}>{ALERT_CATEGORY_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-tipo">Tipo</label>
          <select id="al-tipo" className="select" value={f.get('tipo')} onChange={(e) => f.set('tipo', e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(ALERT_KIND_LABEL) as AlertKind[]).map((k) => <option key={k} value={k}>{ALERT_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-un">Unidade</label>
          <select id="al-un" className="select" value={unitId} onChange={(e) => { f.set('unidade', e.target.value); }}>
            <option value="">Todas</option>
            {(org.data?.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="al-set">Setor</label>
          <select id="al-set" className="select" value={f.get('setor')} onChange={(e) => f.set('setor', e.target.value)}>
            <option value="">Todos</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="al-de">Criados de</label><input id="al-de" className="select" type="date" value={f.get('de')} onChange={(e) => f.set('de', e.target.value)} /></div>
        <div className="field"><label htmlFor="al-ate">até</label><input id="al-ate" className="select" type="date" value={f.get('ate')} onChange={(e) => f.set('ate', e.target.value)} /></div>
        <label className="ig-row" style={{ gap: 6, alignSelf: 'center' }}><input type="checkbox" checked={f.get('bloqueantes') === '1'} onChange={(e) => f.set('bloqueantes', e.target.checked ? '1' : '')} /> Só bloqueantes</label>
        <label className="ig-row" style={{ gap: 6, alignSelf: 'center' }}><input type="checkbox" checked={f.get('meus') === '1'} onChange={(e) => f.set('meus', e.target.checked ? '1' : '')} /> Só os assumidos por mim</label>
      </div>
      {list.isPending ? <Card><LoadingState /></Card> : list.isError ? <Card><ErrorState onRetry={() => void list.refetch()} /></Card> : !list.data.rows.length ? (
        <Card><EmptyState title="Nenhum alerta com estes filtros">Os alertas aparecem quando um registro ultrapassa um prazo ou limite configurado.</EmptyState></Card>
      ) : (
        <ul className="alert-list" aria-label="Alertas">
          {list.data.rows.map((a) => {
            const can = alertActions(a);
            return (
              <li key={a.id} className={a.blocking && a.status !== 'encerrado' ? 'alert-item alert-blocking' : 'alert-item'}>
                <div className="alert-main">
                  <div className="ig-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <AlertBadges a={a} />
                    <span className="ig-small ig-muted">{ALERT_KIND_LABEL[a.kind]}{a.sectorId ? ` · ${sectorName(org.data, a.sectorId)}` : ''}</span>
                  </div>
                  <p className="alert-title"><Link to={`/alertas/${a.id}`}>{a.title}</Link></p>
                  <p className="ig-small" style={{ margin: 0 }}>{a.detail}</p>
                  <p className="ig-small ig-muted" style={{ margin: 0 }}>
                    Desde {formatDate(a.createdAt, tz)}{a.dueOn ? ` · prazo ${formatDate(a.dueOn)}` : ''} · {ALERT_STATUS_LABEL[a.status]}
                    {a.status === 'assumido' && a.assignedName ? ` por ${a.assignedName}` : ''}
                    {a.status === 'reconhecido' && a.acknowledgedName ? ` por ${a.acknowledgedName}` : ''}
                    {a.status === 'resolvido' && a.resolvedName ? ` por ${a.resolvedName}` : ''}
                    {a.status === 'encerrado' ? ` · ${a.closedReason ? ALERT_CLOSED_REASON_LABEL[a.closedReason].toLowerCase() : 'encerrado'} por ${a.closedByName} em ${formatDate(a.closedAt, tz)}: ${a.resolution}` : ''}
                  </p>
                </div>
                {canManage && a.status !== 'encerrado' ? (
                  <div className="ig-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {can.acknowledge ? <Button size="sm" onClick={() => acknowledge.mutation.mutate(a)} aria-label={`Reconhecer: ${a.title}`}>Reconhecer</Button> : null}
                    {can.assume ? <Button size="sm" onClick={() => assume.mutation.mutate(a)} aria-label={`Assumir: ${a.title}`}>Assumir</Button> : null}
                    {can.close ? <Button size="sm" variant="primary" onClick={() => setClosing(a)} aria-label={`Encerrar: ${a.title}`}>Encerrar</Button> : <Link className="ig-btn ig-btn-sm" to={`/alertas/${a.id}`} aria-label={`Tratar: ${a.title}`}>Tratar</Link>}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {list.data ? <Pager page={f.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => f.set('pagina', String(p))} /> : null}
      <NoteDialog alert={closing} mode="close" onClose={() => setClosing(null)} />
    </div>
  );
}

type NoteMode = 'close' | 'resolve' | 'exception';
const NOTE_TEXT: Record<NoteMode, { title: string; confirm: string; label: string; hint: string }> = {
  close: { title: 'Encerrar alerta?', confirm: 'Encerrar', label: 'O que foi feito', hint: 'Fica registrado no alerta, no histórico e no log de auditoria.' },
  resolve: { title: 'Registrar resolução', confirm: 'Registrar resolução', label: 'O que foi feito para resolver a causa', hint: 'O alerta fica como resolvido; um alerta bloqueante só se encerra quando a condição deixar de existir.' },
  exception: { title: 'Exceção formal', confirm: 'Registrar exceção e encerrar', label: 'Justificativa da exceção', hint: 'Aceita formalmente a condição que persiste: o alerta é encerrado e não volta para a mesma situação. Fica no histórico e no log de auditoria.' },
};

function NoteDialog({ alert, mode, onClose }: { alert: AlertDto | null; mode: NoteMode; onClose: () => void }) {
  const ops = useOps()!;
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = (a: AlertDto) => (mode === 'close' ? ops.closeAlert(a.id, note.trim(), a.rowVersion) : mode === 'resolve' ? ops.resolveAlert(a.id, note.trim(), a.rowVersion) : ops.alertException(a.id, note.trim(), a.rowVersion));
  const m = useOpsMutation(run);
  const t = NOTE_TEXT[mode];
  const reset = () => { setNote(''); setError(null); onClose(); };
  return (
    <ConfirmDialog open={!!alert} title={t.title} confirmLabel={t.confirm} tone={mode === 'exception' ? 'danger' : 'primary'} busy={m.mutation.isPending}
      onCancel={reset}
      onConfirm={() => {
        const e = justificationError(note);
        if (e) { setError(e); return; }
        m.mutation.mutate(alert!, { onSuccess: reset });
      }}>
      <p style={{ marginTop: 0 }}>{alert?.title}</p>
      <Field label={t.label} required hint={t.hint} error={error ?? m.formError}>
        <textarea value={note} onChange={(e) => { setNote(e.target.value); setError(null); }} maxLength={500} />
      </Field>
    </ConfirmDialog>
  );
}

export function AlertDetailPage() {
  return <RequireOps title="Alerta"><AlertDetailView /></RequireOps>;
}

function AlertDetailView() {
  const { id = '' } = useParams();
  const ops = useOps()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const q = useQuery({ queryKey: ['alerts', 'detail', id], queryFn: () => ops.alert(id) });
  const [dialog, setDialog] = useState<NoteMode | null>(null);
  const [comment, setComment] = useState('');
  const acknowledge = useOpsMutation(() => ops.acknowledgeAlert(id, q.data!.rowVersion));
  const assume = useOpsMutation(() => ops.assumeAlert(id, q.data!.rowVersion));
  const addComment = useOpsMutation(() => ops.commentAlert(id, comment.trim()));
  if (q.isPending) return <div className="page"><LoadingState /></div>;
  if (q.isError) return <div className="page"><Card>{q.error instanceof ApiError && q.error.status === 404 ? <EmptyState title="Alerta não encontrado" /> : <ErrorState onRetry={() => void q.refetch()} />}</Card></div>;
  const a = q.data;
  const can = alertActions(a);
  const manage = session.can('alerts:manage') && a.status !== 'encerrado';
  const error = acknowledge.formError ?? assume.formError;
  return (
    <div className="page">
      <PageHeader back={{ to: '/alertas', label: 'Alertas' }} title={a.title}
        subtitle={<>{ALERT_KIND_LABEL[a.kind]}{a.sectorId ? ` · ${sectorName(org.data, a.sectorId)}` : ''} · desde {formatDate(a.createdAt, tz)}</>}
        actions={<StatusBadge status={a.status === 'encerrado' ? 'ok' : 'info'}>{ALERT_STATUS_LABEL[a.status]}</StatusBadge>} />
      {a.blocking && a.status !== 'encerrado' ? <AlertBanner tone="crit" title="Alerta bloqueante">{BLOCKING_HELP}</AlertBanner> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Card title="Situação" headingLevel={2}
        actions={manage ? (
          <div className="ig-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {can.acknowledge ? <Button size="sm" onClick={() => acknowledge.mutation.mutate(undefined)}>Reconhecer</Button> : null}
            {can.assume ? <Button size="sm" onClick={() => assume.mutation.mutate(undefined)}>Assumir</Button> : null}
            {can.resolve ? <Button size="sm" onClick={() => setDialog('resolve')}>Registrar resolução</Button> : null}
            {can.close ? <Button size="sm" variant="primary" onClick={() => setDialog('close')}>Encerrar</Button> : null}
            {can.exception && session.can('alerts:exception') ? <Button size="sm" variant="danger" onClick={() => setDialog('exception')}>Exceção formal…</Button> : null}
          </div>
        ) : null}>
        <div className="ig-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}><AlertBadges a={a} /></div>
        <p style={{ marginTop: 0 }}>{a.detail}</p>
        <dl className="ig-facts">
          <div><dt>Prazo</dt><dd>{a.dueOn ? formatDate(a.dueOn) : '—'}</dd></div>
          <div><dt>Etapa</dt><dd>{a.step ? (PROCESS_STEP_LABEL[a.step as ProcessStep] ?? a.step) : '—'}</dd></div>
          <div><dt>Reconhecido</dt><dd>{a.acknowledgedName ? `${a.acknowledgedName} em ${formatDate(a.acknowledgedAt, tz)}` : '—'}</dd></div>
          <div><dt>Responsável</dt><dd>{a.assignedName ?? '—'}</dd></div>
          <div><dt>Resolução</dt><dd>{a.resolvedNote ? `${a.resolvedNote} (${a.resolvedName})` : '—'}</dd></div>
          <div><dt>Encerramento</dt><dd>{a.status === 'encerrado' ? `${a.closedReason ? ALERT_CLOSED_REASON_LABEL[a.closedReason] : 'Encerrado'} · ${a.closedByName} · ${a.resolution}` : '—'}</dd></div>
        </dl>
        {a.link ? <p className="ig-small" style={{ marginBottom: 0 }}><Link to={a.link}>Abrir o registro de origem</Link></p> : null}
      </Card>
      <Card title="Histórico" subtitle="Todas as ações sobre o alerta. Registros não podem ser alterados." headingLevel={2}>
        <Timeline timeZone={tz} items={[...a.actions].reverse().map((x) => ({ id: x.id, at: x.at, tone: ACTION_TONE[x.action], title: `${ALERT_ACTION_LABEL[x.action]} — ${x.userName}`, detail: x.note ?? undefined }))} />
        {manage ? (
          <form className="ig-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutation.mutate(undefined, { onSuccess: () => setComment('') }); }}>
            <Field label="Comentário" error={addComment.formError}><input value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} /></Field>
            <Button type="submit" disabled={!comment.trim() || addComment.mutation.isPending}>Comentar</Button>
          </form>
        ) : null}
      </Card>
      <NoteDialog alert={dialog ? a : null} mode={dialog ?? 'close'} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Small counter for the navigation: open critical and high-severity alerts. */
export function useAlertCount() {
  const ops = useOps();
  const session = useSession();
  return useQuery({ queryKey: ['alerts', 'summary'], enabled: !!ops && session.status === 'authenticated' && session.can('alerts:view') && !session.info?.mustChangePassword, queryFn: () => ops!.alertSummary(), refetchInterval: 120_000, staleTime: 60_000 });
}
