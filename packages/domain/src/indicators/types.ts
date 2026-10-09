import type { Direction } from '../status';

/** Raw counts that feed indicators (numerators and denominators). */
export type MetricKey =
  | 'pacientes_dia'
  | 'cvc_dia'
  | 'vm_dia'
  | 'svd_dia'
  | 'iras_total'
  | 'iras_ipcs'
  | 'iras_pav'
  | 'iras_itu'
  | 'iras_isc'
  | 'iras_outras'
  | 'cirurgias_limpas'
  | 'isc_limpas'
  | 'profilaxia_indicada'
  | 'profilaxia_no_prazo'
  | 'profilaxia_ate_24h'
  | 'hm_oportunidades'
  | 'hm_acoes'
  | 'alcool_ml'
  | 'bundle_cvc_auditorias'
  | 'bundle_cvc_conformes'
  | 'bundle_vm_auditorias'
  | 'bundle_vm_conformes'
  | 'bundle_svd_auditorias'
  | 'bundle_svd_conformes'
  | 'atm_ddd'
  | 'mdr_novos'
  | 'cme_ciclos'
  | 'cme_ciclos_conformes'
  | 'cme_ciclos_nao_conformes'
  | 'cme_iq_lidos'
  | 'cme_iq_conformes'
  | 'cme_cargas_reprocessadas'
  | 'cme_nao_conformidades'
  | 'cme_bd_realizados'
  | 'cme_bd_aprovados'
  | 'cme_ib_monitorados'
  | 'cme_ib_negativos'
  | 'cme_cargas'
  | 'cme_cargas_liberadas'
  | 'cme_cargas_retidas'
  | 'cme_caixas_usadas'
  | 'cme_caixas_rastreadas'
  | 'treinamento_publico'
  | 'treinamento_concluidos'
  | 'investigacoes_abertas';

export type MetricCounts = Partial<Record<MetricKey, number>>;

export type IndicatorCategory = 'iras' | 'dispositivos' | 'cirurgia' | 'processos' | 'antimicrobianos' | 'cme' | 'gestao';

export const CATEGORY_LABEL: Record<IndicatorCategory, string> = {
  iras: 'IRAS',
  dispositivos: 'Dispositivos',
  cirurgia: 'Cirurgia',
  processos: 'Processos',
  antimicrobianos: 'Antimicrobianos',
  cme: 'CME',
  gestao: 'Gestão',
};

export interface MetricRef {
  metric: MetricKey;
  label: string;
}

export interface IndicatorDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: IndicatorCategory;
  numerator: MetricRef;
  /** Absent for absolute counts (e.g. open investigations). */
  denominator?: MetricRef;
  multiplier: number;
  /**
   * 'fluxo' (default): counts are summed over the periods. 'estoque': point-in-time counts
   * (e.g. open investigations) — only the last period is used.
   */
  aggregation?: 'fluxo' | 'estoque';
  unit: string;
  decimals: number;
  periodicity: 'mensal' | 'trimestral';
  direction: Direction;
  dataSource: string;
  interpretation: string;
  responsibleRole: string;
  /** Id of the ClinicalReference for the formula; null until linked by the institution. */
  referenceId: string | null;
}

export type IndicatorComputation =
  | { kind: 'valor'; value: number; numerator: number; denominator: number | null }
  | { kind: 'denominador_zero'; value: null; numerator: number; denominator: 0 }
  | { kind: 'sem_dado'; value: null; numerator: null; denominator: null };
