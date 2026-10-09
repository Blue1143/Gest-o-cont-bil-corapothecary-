import { formatNumber, formatSigned } from '@ccih/domain';
import { Card, EmptyState, Icon, ProvenanceTag, StatusBadge, type Column, toCsv } from '@ccih/ui';
import type { KpiView } from './model';

/** Compact KPI list for secondary indicators (CME, processes, stewardship). */
export function MiniKpiList({ title, subtitle, items }: { title: string; subtitle?: string; items: KpiView[] }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <ul className="mini-kpis">
        {items.map((k) => (
          <li key={k.id}>
            <span>{k.label}</span>
            <StatusBadge status={k.evaluation.status}>{k.evaluation.label}</StatusBadge>
            <span className="v">
              {formatNumber(k.value, k.def.decimals)}
              {k.value != null ? <span className="u">{k.def.unit}</span> : null}
            </span>
            <span className="m" style={{ gridColumn: 'auto', justifyContent: 'flex-end' }}>
              {k.trend.delta != null ? (
                <span aria-label={`Variação ${formatSigned(k.trend.delta, k.def.decimals)}, ${k.trend.improved == null ? 'estável' : k.trend.improved ? 'melhora' : 'piora'}`}>
                  <span style={{ color: k.trend.improved == null ? 'var(--ink-muted)' : k.trend.improved ? 'var(--ok)' : 'var(--crit)', verticalAlign: '-2px' }}>
                    <Icon name={k.trend.delta > 0 ? 'up' : k.trend.delta < 0 ? 'down' : 'flat'} size={14} />
                  </span>{' '}
                  {formatSigned(k.trend.delta, k.def.decimals)}
                </span>
              ) : null}
            </span>
            <span className="m">
              {k.target ? `Meta ${k.target.direction === 'lower' ? '≤' : '≥'} ${formatNumber(k.target.value, k.def.decimals)}` : 'Sem meta configurada'}
              {k.target?.origin === 'demonstracao' ? <ProvenanceTag kind="meta_demo">demo</ProvenanceTag> : null}
              {k.emptyReason ? <span>· {k.emptyReason}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Honest placeholder for dashboard blocks whose module is not built yet. */
export function PlannedBlock({ title, phase, children }: { title: string; phase: number; children: string }) {
  return (
    <Card title={title} actions={<span className="nav-phase">Fase {phase}</span>}>
      <EmptyState title="Módulo ainda não implantado">{children}</EmptyState>
    </Card>
  );
}

/** Aggregated (non-identifiable) chart data export, tagged with its provenance. */
export function exportCsv<R>(filename: string, columns: Column<R>[], rows: R[], origin: 'demo' | 'real') {
  const value = (c: Column<R>, r: R) => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number | null | undefined));
  const body = rows.map((r) => columns.map((c) => {
    const v = value(c, r);
    return typeof v === 'number' ? formatNumber(v, 2) : v;
  }));
  const csv = toCsv(columns.map((c) => c.label), [...body, [], [origin === 'demo' ? 'Origem: DADOS DE DEMONSTRAÇÃO (sintéticos)' : 'Origem: dados institucionais']]);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${origin === 'demo' ? 'DEMO-' : ''}${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
