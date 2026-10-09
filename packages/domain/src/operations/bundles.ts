import type { BundleMethod } from '../rules/operations';
import type { MetricKey } from '../indicators/types';

/**
 * Configurable bundles. A template may feed one of the catalog adherence indicators through
 * `metric` (CVC, VM or urinary catheter); other bundles are tracked on their own.
 */
export type BundleMetric = 'cvc' | 'vm' | 'svd';

export const BUNDLE_METRIC_LABEL: Record<BundleMetric, string> = { cvc: 'Adesão ao bundle de CVC', vm: 'Adesão ao bundle de VM', svd: 'Adesão ao bundle de cateter urinário' };

export const BUNDLE_METRIC_KEYS: Record<BundleMetric, { audits: MetricKey; compliant: MetricKey }> = {
  cvc: { audits: 'bundle_cvc_auditorias', compliant: 'bundle_cvc_conformes' },
  vm: { audits: 'bundle_vm_auditorias', compliant: 'bundle_vm_conformes' },
  svd: { audits: 'bundle_svd_auditorias', compliant: 'bundle_svd_conformes' },
};

export const BUNDLE_METHOD_LABEL: Record<BundleMethod, string> = { tudo_ou_nada: 'Tudo ou nada', por_item: 'Por item' };

export type HandHygieneCategory = 'enfermagem' | 'medica' | 'fisioterapia' | 'apoio' | 'outros';
export const HH_CATEGORY_LABEL: Record<HandHygieneCategory, string> = { enfermagem: 'Enfermagem', medica: 'Equipe médica', fisioterapia: 'Fisioterapia', apoio: 'Apoio / higienização', outros: 'Outros' };
