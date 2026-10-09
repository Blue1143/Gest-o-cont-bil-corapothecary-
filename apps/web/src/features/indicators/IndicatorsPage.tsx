import { CATEGORY_LABEL, INDICATORS, findTarget, formatNumber, type IndicatorDefinition } from '@ccih/domain';
import { DataTable, ErrorState, LoadingState, ProvenanceTag, type Column } from '@ccih/ui';
import { useInstitution } from '../../data/source';

export function IndicatorsPage() {
  const institution = useInstitution();
  if (institution.isPending) return <div className="page"><LoadingState /></div>;
  if (institution.isError) return <div className="page"><ErrorState onRetry={() => void institution.refetch()} /></div>;
  const { config } = institution.data.data;

  const formula = (d: IndicatorDefinition) =>
    d.denominator ? `${d.numerator.label} ÷ ${d.denominator.label}${d.multiplier !== 1 ? ` × ${formatNumber(d.multiplier)}` : ''}` : d.numerator.label;

  const columns: Column<IndicatorDefinition>[] = [
    { key: 'name', label: 'Indicador', render: (d) => <span><b>{d.name}</b><br /><span className="ig-small ig-muted">{d.description}</span></span> },
    { key: 'category', label: 'Categoria', value: (d) => CATEGORY_LABEL[d.category] },
    { key: 'formula', label: 'Fórmula', value: formula, sortable: false },
    { key: 'unit', label: 'Unidade' },
    { key: 'direction', label: 'Melhor quando', value: (d) => (d.direction === 'lower' ? 'Menor' : 'Maior') },
    {
      key: 'target', label: 'Meta', sortable: false,
      value: (d) => findTarget(config, d.id)?.value ?? null,
      render: (d) => {
        const t = findTarget(config, d.id);
        if (!t) return <span className="ig-muted">Não configurada</span>;
        return (
          <span className="ig-row" style={{ gap: 6 }}>
            {t.direction === 'lower' ? '≤' : '≥'} {formatNumber(t.value, d.decimals)}
            <ProvenanceTag kind={t.origin === 'demonstracao' ? 'meta_demo' : 'meta_institucional'} />
          </span>
        );
      },
    },
    { key: 'periodicity', label: 'Periodicidade', hidden: true },
    { key: 'dataSource', label: 'Fonte de dados', hidden: true },
    { key: 'responsibleRole', label: 'Responsável', hidden: true },
    { key: 'interpretation', label: 'Interpretação', hidden: true, sortable: false },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Catálogo de indicadores</h1>
          <p className="page-sub">
            Todas as telas calculam indicadores pelo mesmo motor (numerador ÷ denominador × multiplicador). Metas são configuração institucional, editáveis em Administração a partir da Fase 2.
          </p>
        </div>
      </header>
      <DataTable
        caption={`${INDICATORS.length} indicadores`}
        columns={columns}
        rows={INDICATORS}
        rowKey={(d) => d.id}
        searchable
        searchPlaceholder="Pesquisar indicador"
        columnPicker
        initialSort={{ key: 'category', dir: 'asc' }}
      />
    </div>
  );
}
