import { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatDate } from '@ccih/domain';
import { AlertBanner, Button, Card, DataTable, EmptyState, type Column } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import type { AuditRow } from '../../data/port';
import { useAdmin } from './shared';

const ACTION_LABEL: Record<string, string> = {
  login_success: 'Entrada no sistema', login_failure: 'Falha de entrada', logout: 'Saída', session_expired: 'Sessão expirada', access_denied: 'Acesso negado',
  create: 'Criação', update: 'Alteração', delete: 'Exclusão', validate: 'Validação', unlock: 'Desbloqueio', export: 'Exportação', seed: 'Carga de demonstração',
};
const ENTITY_LABEL: Record<string, string> = {
  indicator_target: 'Meta de indicador', rule_parameter: 'Parâmetro de regra', clinical_reference: 'Referência', load_release_policy: 'Política da CME',
  app_user: 'Usuário', app_user_access: 'Acesso de usuário', session: 'Sessão', route: 'Rota', aggregate: 'Dados agregados', audit_log: 'Log de auditoria', institution: 'Instituição',
};
const PAGE_SIZE = 25;

export function AuditPage() {
  const admin = useAdmin();
  const institution = useInstitution();
  const [filters, setFilters] = useState({ entity: '', action: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const ids = { entity: useId(), action: useId() };
  const tz = institution.data?.data.config.timezone ?? 'America/Sao_Paulo';
  const query = useQuery({
    queryKey: ['audit', filters, page],
    enabled: !!admin,
    queryFn: () => admin!.audit({ ...(filters.entity ? { entity: filters.entity } : {}), ...(filters.action ? { action: filters.action } : {}), page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });
  const verify = useMutation({ mutationFn: () => admin!.verifyAudit() });

  if (!admin) {
    return <Card title="Log de auditoria"><EmptyState title="Disponível com o backend">O log de auditoria imutável é mantido pela API (VITE_DATA_SOURCE=api).</EmptyState></Card>;
  }

  const columns: Column<AuditRow>[] = [
    { key: 'occurred_at', label: 'Data/hora', sortable: false, render: (r) => formatDate(r.occurred_at, tz) },
    { key: 'user_login', label: 'Usuário', sortable: false, render: (r) => <span className="ig-mono">{r.user_login ?? '—'}</span> },
    { key: 'action', label: 'Ação', sortable: false, value: (r) => ACTION_LABEL[r.action] ?? r.action },
    { key: 'entity', label: 'Entidade', sortable: false, value: (r) => ENTITY_LABEL[r.entity] ?? r.entity },
    { key: 'entity_id', label: 'Registro', sortable: false, hidden: true, render: (r) => <span className="ig-mono ig-small">{r.entity_id ?? '—'}</span> },
    { key: 'justification', label: 'Justificativa', sortable: false, value: (r) => (typeof r.context?.justification === 'string' ? r.context.justification : '') },
    { key: 'ip', label: 'IP', sortable: false, hidden: true },
    { key: 'detail', label: 'Detalhes', sortable: false, exportable: false, render: (r) => <Button size="sm" variant="ghost" onClick={() => setDetail(r)} aria-label={`Ver detalhes do registro ${r.id}`}>Ver</Button> },
  ];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <form className="filters" aria-label="Filtros do log" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor={ids.entity}>Entidade</label>
          <select id={ids.entity} className="select" value={filters.entity} onChange={(e) => { setFilters({ ...filters, entity: e.target.value }); setPage(1); }}>
            <option value="">Todas</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.action}>Ação</label>
          <select id={ids.action} className="select" value={filters.action} onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }}>
            <option value="">Todas</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <Button icon="shield" onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? 'Verificando…' : 'Verificar integridade'}</Button>
      </form>
      {verify.data ? (
        verify.data.ok
          ? <AlertBanner tone="ok" title={`Cadeia de auditoria íntegra: ${verify.data.checked} registros verificados.`} />
          : <AlertBanner tone="crit" title={`Cadeia de auditoria violada no registro ${verify.data.brokenAtId}.`}>Acione a TI e o encarregado de dados (DPO) imediatamente.</AlertBanner>
      ) : null}
      {detail ? (
        <Card title={`Registro ${detail.id} — ${ACTION_LABEL[detail.action] ?? detail.action}`} subtitle={`${formatDate(detail.occurred_at, tz)} · ${detail.user_login ?? 'sistema'} · ${ENTITY_LABEL[detail.entity] ?? detail.entity}${detail.ip ? ` · IP ${detail.ip}` : ''}`} actions={<Button size="sm" onClick={() => setDetail(null)}>Fechar</Button>}>
          <div className="ig-diff">
            <div><p className="ig-label">Valor anterior</p><pre>{detail.before == null ? '—' : JSON.stringify(detail.before, null, 2)}</pre></div>
            <div><p className="ig-label">Valor posterior</p><pre>{detail.after == null ? '—' : JSON.stringify(detail.after, null, 2)}</pre></div>
            <div><p className="ig-label">Contexto</p><pre>{detail.context == null ? '—' : JSON.stringify(detail.context, null, 2)}</pre></div>
          </div>
        </Card>
      ) : null}
      <DataTable
        caption={`Log de auditoria (${total} registros)`}
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(r) => r.id}
        state={query.isPending ? 'loading' : query.isError ? 'error' : 'ready'}
        onRetry={() => void query.refetch()}
        columnPicker
        dense
      />
      <nav className="ig-table-foot" aria-label="Paginação do log" style={{ border: 0 }}>
        <span>Página {page} de {pages}</span>
        <span className="ig-row" style={{ gap: 8 }}>
          <Button size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Anterior</Button>
          <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>Próxima</Button>
        </span>
      </nav>
    </div>
  );
}
