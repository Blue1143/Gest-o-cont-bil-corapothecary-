import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addMonths, formatDate, formatNumber, monthLongLabel, monthStart, todayIn, type CensusRow } from '@ccih/domain';
import { AlertBanner, Button, Card, DataTable, FormMessage, ProvenanceTag, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import type { ConsolidationSummary } from '../../data/port';
import { PageHeader, RequireClinical, sectorName, useClinical, useClinicalMutation, useOrg, useTimeZone } from './shared';

export function CensusPage() {
  return <RequireClinical title="Censo diário"><Census /></RequireClinical>;
}

const total = (rows: CensusRow[]): CensusRow => rows.reduce((t, r) => ({ ...t, beds: t.beds + r.beds, pacientes: t.pacientes + r.pacientes, cvc: t.cvc + r.cvc, vm: t.vm + r.vm, svd: t.svd + r.svd }), { sectorId: 'total', beds: 0, pacientes: 0, cvc: 0, vm: 0, svd: 0, byDevice: {} });

function Census() {
  const clinical = useClinical()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const today = todayIn(tz);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(addMonths(monthStart(today), -1));
  const day = useQuery({ queryKey: ['census', 'day', date], queryFn: () => clinical.census(date) });
  const monthly = useQuery({ queryKey: ['census', 'month', month], queryFn: () => clinical.censusMonth(month) });
  const name = (id: string) => (id === 'total' ? 'Total' : sectorName(org.data, id));

  const dayColumns: Column<CensusRow>[] = [
    { key: 'sector', label: 'Setor', value: (r) => name(r.sectorId), render: (r) => (r.sectorId === 'total' ? <b>Total</b> : name(r.sectorId)) },
    { key: 'beds', label: 'Leitos ativos', align: 'right' },
    { key: 'pacientes', label: 'Pacientes', align: 'right' },
    { key: 'occupancy', label: 'Ocupação', align: 'right', value: (r) => (r.beds ? r.pacientes / r.beds : null), render: (r) => (r.beds ? `${formatNumber((r.pacientes / r.beds) * 100)}%` : '—') },
    { key: 'cvc', label: 'Cateter central (CVC+PICC)', align: 'right' },
    { key: 'vm', label: 'Ventilação mecânica', align: 'right' },
    { key: 'svd', label: 'Cateter urinário', align: 'right' },
  ];
  const monthColumns: Column<CensusRow>[] = [
    { key: 'sector', label: 'Setor', value: (r) => name(r.sectorId), render: (r) => (r.sectorId === 'total' ? <b>Total</b> : name(r.sectorId)) },
    { key: 'pacientes', label: 'Paciente-dia', align: 'right', render: (r) => formatNumber(r.pacientes) },
    { key: 'cvc', label: 'Cateter central-dia', align: 'right', render: (r) => formatNumber(r.cvc) },
    { key: 'vm', label: 'Ventilação-dia', align: 'right', render: (r) => formatNumber(r.vm) },
    { key: 'svd', label: 'Cateter urinário-dia', align: 'right', render: (r) => formatNumber(r.svd) },
    { key: 'tu', label: 'Uso de CVC', align: 'right', value: (r) => (r.pacientes ? r.cvc / r.pacientes : null), render: (r) => (r.pacientes ? `${formatNumber((r.cvc / r.pacientes) * 100, 1)}%` : '—') },
  ];
  const ruleMissing = day.data?.ruleMissing || monthly.data?.ruleMissing;

  return (
    <div className="page">
      <PageHeader title="Censo diário" subtitle="Denominadores reais: cada paciente e cada dispositivo contam um dia no setor onde estão no horário do censo configurado pela instituição." />
      {ruleMissing ? (
        <AlertBanner tone="warn" title="Horário do censo não configurado">
          Sem esse parâmetro o sistema não calcula paciente-dia nem dispositivo-dia. {session.can('config:rules:edit') ? <Link to="/admin/parametros">Configurar em Administração › Parâmetros</Link> : 'Solicite a configuração ao administrador.'}
        </AlertBanner>
      ) : null}
      <Card title="Ocupação e dispositivos no dia" subtitle={day.data?.hour != null ? `Censo das ${String(day.data.hour).padStart(2, '0')}h de ${formatDate(date)} (${tz}).` : undefined}
        actions={<label className="ig-row" style={{ gap: 8 }}><span className="ig-small">Data</span><input type="date" className="select" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Data do censo" /></label>}>
        <DataTable ariaLabel="Censo do dia por setor" columns={dayColumns} rows={day.data ? [...day.data.rows, total(day.data.rows)] : []} rowKey={(r) => r.sectorId} state={day.isPending ? 'loading' : day.isError ? 'error' : 'ready'} onRetry={() => void day.refetch()} dense />
      </Card>
      <Card title="Denominadores do mês" subtitle="Calculados agora a partir das internações e dispositivos registrados. O mês corrente vai até o último censo realizado."
        actions={<label className="ig-row" style={{ gap: 8 }}><span className="ig-small">Mês</span>
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês dos denominadores">
            {Array.from({ length: 6 }, (_, i) => addMonths(monthStart(today), -i)).map((m) => <option key={m} value={m}>{monthLongLabel(m)}</option>)}
          </select></label>}>
        <DataTable ariaLabel="Denominadores do mês por setor" columns={monthColumns} rows={monthly.data ? [...monthly.data.rows, total(monthly.data.rows)] : []} rowKey={(r) => r.sectorId} state={monthly.isPending ? 'loading' : monthly.isError ? 'error' : 'ready'} onRetry={() => void monthly.refetch()} dense />
      </Card>
      {session.can('indicators:consolidate') ? <ConsolidationCard /> : null}
    </div>
  );
}

function ConsolidationCard() {
  const clinical = useClinical()!;
  const tz = useTimeZone();
  const current = monthStart(todayIn(tz));
  const options = Array.from({ length: 4 }, (_, i) => addMonths(current, -i));
  const [months, setMonths] = useState<string[]>([addMonths(current, -1)]);
  const [result, setResult] = useState<ConsolidationSummary | null>(null);
  const m = useClinicalMutation((ms: string[]) => clinical.consolidate(ms));
  return (
    <Card title="Consolidar indicadores" subtitle="Recalcula, a partir dos registros clínicos, paciente-dia, dispositivo-dia, IRAS, multirresistentes, investigações abertas e indicadores cirúrgicos. Indicadores de módulos ainda não implantados (higiene das mãos, bundles, CME, treinamentos) não são alterados.">
      {m.formError ? <FormMessage tone="error">{m.formError}</FormMessage> : null}
      <fieldset className="ig-checks">
        <legend>Meses</legend>
        {options.map((o) => (
          <label key={o}><input type="checkbox" checked={months.includes(o)} onChange={(e) => setMonths(e.target.checked ? [...months, o] : months.filter((x) => x !== o))} /> {monthLongLabel(o)}{o === current ? ' (parcial)' : ''}</label>
        ))}
      </fieldset>
      <div className="ig-form-actions" style={{ marginTop: 12 }}>
        <Button variant="primary" disabled={!months.length || m.mutation.isPending} onClick={() => m.mutation.mutate(months, { onSuccess: (r) => setResult(r) })}>{m.mutation.isPending ? 'Consolidando…' : 'Consolidar'}</Button>
        <span className="ig-small ig-muted">A operação fica registrada no log de auditoria.</span>
      </div>
      {result ? (
        <div className="ig-section">
          <FormMessage tone="success">{result.rows} valores gravados para {result.months.map(monthLongLabel).join(', ')}.{result.partialMonth ? ' O mês corrente é parcial.' : ''}</FormMessage>
          {result.origin === 'demo' ? <p className="ig-small"><ProvenanceTag kind="demo" /> Registros sintéticos: os indicadores continuam marcados como demonstração.</p> : null}
          {result.skipped.length ? <AlertBanner tone="warn" title="Indicadores não recalculados">{result.skipped.join(' ')}</AlertBanner> : null}
        </div>
      ) : null}
    </Card>
  );
}
