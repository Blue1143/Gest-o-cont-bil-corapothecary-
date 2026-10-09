import {
  REFERENCE_STATUS_LABEL, TEST_TYPE_LABEL, formatDate, requiresValidation,
  type ClinicalReference, type InstitutionalRules, type RuleParameter,
} from '@ccih/domain';
import { Card, DataTable, ErrorState, LoadingState, ProvenanceTag, StatusBadge, type Column } from '@ccih/ui';
import { useInstitution } from '../../data/source';

interface ParamRow {
  id: string;
  group: string;
  name: string;
  value: string;
  reference: ClinicalReference | undefined;
}

const PARAM_LABEL: Record<string, string> = {
  'devices.associationFromDeviceDay': 'IRAS associada a dispositivo a partir do dia (D1 = instalação)',
  'devices.associationGraceDaysAfterRemoval': 'Dias após retirada ainda atribuídos ao dispositivo',
  'admissions.hospitalAcquiredFromDay': 'IRAS a partir do dia de internação',
  'surgery.prophylaxisWindowMin': 'Janela da antibioticoprofilaxia (min antes da incisão)',
  'surgery.prophylaxisWindowByDrugMin': 'Janela por fármaco (min)',
  'surgery.prophylaxisMaxDurationH': 'Duração máxima da profilaxia (h)',
  'surgery.surveillanceDays': 'Vigilância pós-operatória sem implante (dias)',
  'surgery.surveillanceDaysWithImplant': 'Vigilância pós-operatória com implante (dias)',
  'supplies.expiryWarningDays': 'Alerta de validade de insumos (dias)',
  'supplies.defaultMinCoverageDays': 'Cobertura mínima padrão de estoque (dias)',
  'training.expiryWarningDays': 'Alerta de vencimento de treinamento (dias)',
  'antimicrobials.prolongedTherapyDays': 'Terapia antimicrobiana prolongada a partir de (dias)',
};

const GROUP_LABEL: Record<string, string> = { devices: 'Dispositivos', admissions: 'Internação', surgery: 'Cirurgia', supplies: 'Insumos', training: 'Treinamentos', antimicrobials: 'Antimicrobianos' };

function flattenRules(rules: InstitutionalRules, refs: ClinicalReference[]): ParamRow[] {
  return Object.entries(rules).flatMap(([group, params]) =>
    Object.entries(params as Record<string, RuleParameter<unknown> | undefined>)
      .filter(([, p]) => p != null)
      .map(([key, p]) => {
        const v = p!.value;
        const value = typeof v === 'object' && v ? Object.entries(v).map(([k, n]) => `${k}: ${String(n)}`).join(', ') : String(v);
        return { id: `${group}.${key}`, group: GROUP_LABEL[group] ?? group, name: PARAM_LABEL[`${group}.${key}`] ?? key, value, reference: refs.find((r) => r.id === p!.referenceId) };
      }),
  );
}

export function AdminPage() {
  const institution = useInstitution();
  if (institution.isPending) return <div className="page"><LoadingState /></div>;
  if (institution.isError) return <div className="page"><ErrorState onRetry={() => void institution.refetch()} /></div>;
  const { config, references, loadReleasePolicy } = institution.data.data;
  const params = flattenRules(config.rules, references);

  const refCols: Column<ClinicalReference>[] = [
    { key: 'title', label: 'Referência', render: (r) => <span><b>{r.title}</b><br /><span className="ig-small ig-muted">{r.source}</span></span> },
    { key: 'version', label: 'Versão' },
    { key: 'updatedAt', label: 'Atualização', render: (r) => formatDate(r.updatedAt) },
    { key: 'validatedBy', label: 'Validação', value: (r) => r.validatedBy ?? '', render: (r) => (r.validatedBy ? `${r.validatedBy} em ${formatDate(r.validatedAt)}` : <ProvenanceTag kind="requer_validacao" />) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status === 'vigente' ? 'ok' : r.status === 'arquivado' ? 'neutral' : 'warn'}>{REFERENCE_STATUS_LABEL[r.status]}</StatusBadge> },
    { key: 'notes', label: 'Observação', hidden: true, sortable: false },
  ];
  const paramCols: Column<ParamRow>[] = [
    { key: 'group', label: 'Grupo' },
    { key: 'name', label: 'Parâmetro' },
    { key: 'value', label: 'Valor', align: 'right', render: (r) => <span className="ig-row" style={{ gap: 6, justifyContent: 'flex-end' }}>{r.value}<ProvenanceTag kind="parametro">configurável</ProvenanceTag></span> },
    { key: 'reference', label: 'Referência', value: (r) => r.reference?.title ?? '', render: (r) => (
      <span className="ig-row" style={{ gap: 6 }}>{r.reference?.title ?? 'Sem referência'}{requiresValidation(r.reference) ? <ProvenanceTag kind="requer_validacao" /> : null}</span>
    ) },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Administração</h1>
          <p className="page-sub">Referências, parâmetros e regras que os módulos aplicam. Edição com controle de acesso e trilha de auditoria chega na Fase 2; nesta versão a tela é somente leitura.</p>
        </div>
      </header>
      <DataTable caption="Referências clínicas e regulatórias" columns={refCols} rows={references} rowKey={(r) => r.id} columnPicker searchable />
      <DataTable caption="Parâmetros de regras institucionais" columns={paramCols} rows={params} rowKey={(r) => r.id} searchable />
      <Card title="Política de liberação de cargas (CME)" subtitle="Aplicada pelo motor de regras; sem política configurada o sistema não decide a liberação.">
        {loadReleasePolicy ? (
          <dl className="def-list">
            <dt>Testes obrigatórios por carga</dt><dd>{loadReleasePolicy.requiredLoadTests.map((t) => TEST_TYPE_LABEL[t]).join(', ')}</dd>
            <dt>Bowie-Dick diário exigido</dt><dd>{loadReleasePolicy.requireDailyBowieDick ? 'Sim' : 'Não'}</dd>
            <dt>Implantáveis aguardam IB</dt><dd>{loadReleasePolicy.holdImplantsUntilBiological ? 'Sim' : 'Não'}</dd>
            <dt>Referência</dt>
            <dd className="ig-row" style={{ gap: 6 }}>
              {references.find((r) => r.id === loadReleasePolicy.referenceId)?.title ?? 'Sem referência'}
              {requiresValidation(references.find((r) => r.id === loadReleasePolicy.referenceId)) ? <ProvenanceTag kind="requer_validacao" /> : null}
            </dd>
          </dl>
        ) : (
          <p className="ig-muted">Nenhuma política configurada.</p>
        )}
      </Card>
    </div>
  );
}
