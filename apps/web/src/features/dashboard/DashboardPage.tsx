import { useId, useMemo } from 'react';
import { formatDate, formatNumber, monthLongLabel } from '@ccih/domain';
import { BarChart, Disclosure, ErrorState, KpiCard, LoadingState, ProvenanceTag, TrendChart } from '@ccih/ui';
import { NARROW, useMediaQuery } from '../../app/useMediaQuery';
import { PERIOD_OPTIONS, periodWindow, sectorScope, useGlobalFilters } from '../../app/filters';
import { useFacts, useInstitution } from '../../data/source';
import { buildKpi, bundleAdherence, exposure, irasBySector, irasTrend, type DashboardInput } from './model';
import { MiniKpiList, PlannedBlock, exportCsv, statusSummary } from './parts';

export function DashboardPage() {
  const institution = useInstitution();
  const [filters, setFilter] = useGlobalFilters();
  const tz = institution.data?.data.config.timezone ?? 'America/Sao_Paulo';
  const win = useMemo(() => periodWindow(filters.months, tz), [filters.months, tz]);
  const history = useMemo(() => periodWindow(12, tz).periods, [tz]);
  const from = [win.previous[0]!, history[0]!].sort()[0]!;
  const facts = useFacts({ from, to: win.periods[win.periods.length - 1]! });
  const ids = { period: useId(), unit: useId(), sector: useId() };
  const narrow = useMediaQuery(NARROW);

  if (institution.isPending || facts.isPending) return <div className="page"><LoadingState lines={6} label="Carregando painel…" /></div>;
  if (institution.isError || facts.isError) {
    return <div className="page"><ErrorState onRetry={() => { void institution.refetch(); void facts.refetch(); }} /></div>;
  }

  const { config, sectors, units } = institution.data.data;
  const scope = sectorScope(filters, sectors);
  const input: DashboardInput = { rows: facts.data.data.rows, periods: win.periods, previous: win.previous, history, scope, config, sectors };
  const first = win.periods[0]!;
  const last = win.periods[win.periods.length - 1]!;
  const periodLabel = first === last ? monthLongLabel(last) : `${monthLongLabel(first)} – ${monthLongLabel(last)}`;
  const scopeLabel = filters.sectorId ? sectors.find((s) => s.id === filters.sectorId)?.name : filters.unitId ? units.find((u) => u.id === filters.unitId)?.name : 'Todas as unidades';
  const origin = facts.data.provenance.origin;
  const headline = [buildKpi('di-iras', input, 'IRAS (global)'), buildKpi('di-ipcs', input, 'IPCS'), buildKpi('di-pav', input, 'PAV'), buildKpi('di-itu', input, 'ITU-AC'), buildKpi('tx-isc-limpa', input, 'ISC limpa')];
  const trend = irasTrend(input);
  const bySector = irasBySector(input);
  const bundles = bundleAdherence(input);
  const open = buildKpi('investigacoes-abertas', input);
  const sectorOptions = sectors.filter((s) => !filters.unitId || s.unitId === filters.unitId);
  const micro = [buildKpi('mdr-incidencia', input, 'Incidência de MDR')];
  const cme = ['cme-ciclos-conformes', 'cme-bowie-dick', 'cme-iq-conformes', 'cme-ib-negativo', 'cme-cargas-retidas', 'cme-rastreabilidade'].map((id) => buildKpi(id, input));
  const stewardship = [buildKpi('atm-ddd', input, 'Consumo (DDD/1.000 pac-dia)'), buildKpi('atb-prazo', input), buildKpi('atb-duracao', input)];
  const processes = [buildKpi('hm-adesao', input), buildKpi('hm-consumo', input), buildKpi('treinamento-cobertura', input)];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="ig-label">Comissão de Controle de Infecção Hospitalar</span>
          <h1 className="page-title">Visão Geral — {periodLabel}</h1>
          <p className="page-sub">
            {config.institutionName} · {scopeLabel} · dados consolidados em {formatDate(facts.data.provenance.consolidatedAt, tz)}{' '}
            {origin === 'demo' ? <ProvenanceTag kind="demo" title={facts.data.provenance.source} /> : null}
          </p>
        </div>
      </header>

      <form className="filters" aria-label="Filtros globais" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor={ids.period}>Período</label>
          <select id={ids.period} className="select" value={String(filters.months)} onChange={(e) => setFilter({ periodo: e.target.value })}>
            {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.unit}>Unidade</label>
          <select id={ids.unit} className="select" value={filters.unitId ?? ''} onChange={(e) => setFilter({ unidade: e.target.value || null })}>
            <option value="">Todas</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.sector}>Setor</label>
          <select id={ids.sector} className="select" value={filters.sectorId ?? ''} onChange={(e) => setFilter({ setor: e.target.value || null })}>
            <option value="">Todos</option>
            {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <p className="ig-small ig-muted" style={{ margin: 0, flex: '1 1 220px' }}>
          Comparação com os {filters.months === 1 ? 'mês anterior' : `${filters.months} meses anteriores`}. Tipo de infecção, procedimento, cirurgião e dispositivo entram com os módulos clínicos (Fase 3).
        </p>
      </form>

      <section aria-labelledby="h-iras">
        <h2 id="h-iras" className="section-title">IRAS</h2>
        <div className="kpi-row">
          {headline.map((k) => (
            <KpiCard
              key={k.id}
              label={k.label}
              value={k.value}
              unit={k.def.unit}
              decimals={k.def.decimals}
              evaluation={k.evaluation}
              {...(k.target ? { target: k.target } : {})}
              trend={k.trend}
              previousLabel="vs período anterior"
              spark={k.spark}
              {...(k.emptyReason ? { emptyReason: k.emptyReason } : {})}
              {...(k.footnote ? { footnote: k.footnote } : {})}
            />
          ))}
        </div>
        <dl className="exposure" style={{ marginTop: 16 }}>
          {exposure(input).map((e) => (
            <div key={e.metric}><dt>{e.label}</dt><dd>{formatNumber(e.value)}</dd></div>
          ))}
          <div><dt>Investigações abertas</dt><dd>{formatNumber(open.value)}</dd></div>
        </dl>
      </section>

      <section className="cols-3" aria-label="Tendência e distribuição">
        <TrendChart
          title="Densidade de incidência por tipo"
          description="Casos por 1.000 dispositivos-dia"
          period={trend.labels.length > 1 ? `${trend.labels[0]} – ${trend.labels[trend.labels.length - 1]}` : trend.labels[0]}
          unit="‰"
          labels={trend.labels}
          series={trend.series}
          onExport={(c, r) => exportCsv('densidade-iras-por-tipo', c, r, origin)}
        />
        <BarChart
          title="IRAS por setor"
          description="Densidade global, IRAS por 1.000 pacientes-dia"
          period={periodLabel}
          unit="‰"
          data={bySector}
          categoryLabel="Setor"
          valueLabel="Densidade"
          onExport={(c, r) => exportCsv('iras-por-setor', c, r, origin)}
        />
        <BarChart
          title="Adesão aos bundles"
          description="Auditorias conformes (tudo ou nada)"
          period={periodLabel}
          unit="%"
          decimals={0}
          data={bundles.bars}
          keepOrder
          {...(bundles.sharedTarget != null ? { target: { value: bundles.sharedTarget, label: 'Meta' } } : {})}
          categoryLabel="Bundle"
          valueLabel="Adesão"
          {...(config.targets.some((t) => t.indicatorId.startsWith('bundle-') && t.origin === 'demonstracao') ? { footnote: 'Meta de demonstração — configure a meta institucional em Administração.' } : {})}
        />
      </section>

      <Disclosure title="Microbiologia, alertas e não conformidades" summary={statusSummary(micro)} defaultOpen={!narrow}>
        <div className="cols-3">
          <MiniKpiList title="Microbiologia" subtitle="Indicadores agregados do período" items={micro} />
          <PlannedBlock title="Alertas" phase={4}>A Central de Alertas (prioridade, responsável, status e controle de alert fatigue) entra na Fase 4.</PlannedBlock>
          <PlannedBlock title="Não conformidades" phase={4}>Não conformidades e planos de ação vêm do módulo de Auditorias, previsto para a Fase 4.</PlannedBlock>
        </div>
      </Disclosure>

      <Disclosure title="CME, antimicrobianos e treinamentos" summary={statusSummary([...cme, ...stewardship, ...processes])} defaultOpen={!narrow}>
        <div className="cols-3">
          <MiniKpiList title="CME" subtitle="Esterilização e rastreabilidade" items={cme} />
          <MiniKpiList title="Antimicrobianos e cirurgia" items={stewardship} />
          <MiniKpiList title="Processos e treinamentos" items={processes} />
        </div>
      </Disclosure>
    </div>
  );
}
