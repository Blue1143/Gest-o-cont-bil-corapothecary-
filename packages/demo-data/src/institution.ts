import { emptyRules, type ClinicalReference, type IndicatorTarget, type InstitutionalConfig, type LoadReleasePolicy, type RuleParameter, type Sector, type Unit } from '@ccih/domain';

/**
 * Demo institution. Every reference is pending institutional validation and every target is a
 * demonstration target: nothing here is an institutional or regulatory decision.
 */
const pending = (id: string, title: string, kind: ClinicalReference['kind'], source: string, notes: string): ClinicalReference => ({
  id, title, kind, source, version: 'A confirmar pela instituição', updatedAt: '2026-10-09', validatedBy: null, validatedAt: null, status: 'revisao_necessaria', notes,
});

export const DEMO_REFERENCES: ClinicalReference[] = [
  pending('ref-anvisa-criterios-iras', 'Critérios diagnósticos de IRAS', 'regulatoria', 'ANVISA — Critérios Diagnósticos de Infecções Relacionadas à Assistência à Saúde',
    'Usada para parâmetros de associação a dispositivo e de classificação de IRAS. Confirmar a edição vigente antes de ativar.'),
  pending('ref-rdc-15-2012', 'Boas práticas de processamento de produtos para saúde', 'regulatoria', 'ANVISA — RDC nº 15/2012',
    'Base da política de liberação de cargas e rastreabilidade da CME. Confirmar vigência e atualizações.'),
  pending('ref-protocolo-profilaxia', 'Protocolo institucional de antibioticoprofilaxia cirúrgica', 'protocolo_institucional', 'Protocolo da instituição (modelo de demonstração)',
    'Janela de dose, exceções por fármaco e duração máxima. Deve ser aprovado pela CCIH e pelo corpo clínico.'),
  pending('ref-protocolo-isc', 'Protocolo institucional de vigilância de ISC', 'protocolo_institucional', 'Protocolo da instituição (modelo de demonstração)',
    'Prazos de vigilância pós-operatória com e sem implante.'),
  pending('ref-protocolo-insumos', 'Procedimento de gestão de insumos da CCIH', 'protocolo_institucional', 'Procedimento da instituição (modelo de demonstração)',
    'Cobertura mínima de estoque e antecedência de alerta de validade.'),
  pending('ref-protocolo-censo', 'Procedimento institucional de censo diário', 'protocolo_institucional', 'Procedimento da instituição (modelo de demonstração)',
    'Horário do censo usado para paciente-dia e dispositivo-dia (denominadores dos indicadores).'),
  pending('ref-procedimento-alertas', 'Procedimento institucional da central de alertas da CCIH', 'protocolo_institucional', 'Procedimento da instituição (modelo de demonstração)',
    'Prazos que geram alertas e tempo de supressão após o encerramento (controle de excesso de alertas).'),
  pending('ref-procedimento-cme', 'Procedimento operacional da CME', 'protocolo_institucional', 'Procedimento da instituição (modelo de demonstração)',
    'Validade da esterilização por embalagem, prazo de leitura do indicador biológico (conforme o fabricante do indicador) e antecedência do alerta de qualificação dos equipamentos.'),
  pending('ref-protocolo-stewardship', 'Programa de gerenciamento do uso de antimicrobianos', 'protocolo_institucional', 'Programa da instituição (modelo de demonstração)',
    'Gatilhos de revisão de prescrição.'),
];

const param = <T,>(value: T, referenceId: string): RuleParameter<T> => ({ value, referenceId });

const demoTarget = (indicatorId: string, value: number, direction: 'lower' | 'higher', warningBand?: number): IndicatorTarget => ({
  indicatorId, value, direction, origin: 'demonstracao', approvedBy: null, validFrom: '2026-01-01', referenceId: null, ...(warningBand != null ? { warningBand } : {}),
});

export const DEMO_CONFIG: InstitutionalConfig = {
  institutionName: 'Hospital de Demonstração',
  timezone: 'America/Sao_Paulo',
  targets: [
    demoTarget('di-ipcs', 2.0, 'lower', 0.5),
    demoTarget('di-pav', 7.0, 'lower', 1.0),
    demoTarget('di-itu', 2.5, 'lower', 0.5),
    demoTarget('tx-isc-limpa', 1.5, 'lower', 0.3),
    demoTarget('hm-adesao', 80, 'higher', 5),
    demoTarget('hm-consumo', 20, 'higher', 3),
    demoTarget('bundle-cvc', 85, 'higher', 10),
    demoTarget('bundle-vm', 85, 'higher', 10),
    demoTarget('bundle-svd', 85, 'higher', 10),
    demoTarget('atb-prazo', 95, 'higher', 5),
    demoTarget('cme-bowie-dick', 100, 'higher'),
    demoTarget('cme-ib-negativo', 100, 'higher'),
    demoTarget('cme-rastreabilidade', 100, 'higher', 2),
    demoTarget('treinamento-cobertura', 90, 'higher', 10),
  ],
  rules: {
    ...emptyRules(),
    devices: {
      associationFromDeviceDay: param(3, 'ref-anvisa-criterios-iras'),
      associationGraceDaysAfterRemoval: param(1, 'ref-anvisa-criterios-iras'),
    },
    admissions: { hospitalAcquiredFromDay: param(3, 'ref-anvisa-criterios-iras'), censusHour: param(0, 'ref-protocolo-censo') },
    surgery: {
      prophylaxisWindowMin: param(60, 'ref-protocolo-profilaxia'),
      prophylaxisWindowByDrugMin: param({ vancomicina: 120 }, 'ref-protocolo-profilaxia'),
      prophylaxisMaxDurationH: param(24, 'ref-protocolo-profilaxia'),
      surveillanceDays: param(30, 'ref-protocolo-isc'),
      surveillanceDaysWithImplant: param(90, 'ref-protocolo-isc'),
    },
    supplies: { expiryWarningDays: param(30, 'ref-protocolo-insumos'), defaultMinCoverageDays: param(15, 'ref-protocolo-insumos') },
    training: { expiryWarningDays: param(30, 'ref-protocolo-insumos') },
    antimicrobials: { prolongedTherapyDays: param(7, 'ref-protocolo-stewardship') },
    alerts: {
      investigationOverdueDays: param(7, 'ref-procedimento-alertas'),
      deviceReviewDays: param(10, 'ref-procedimento-alertas'),
      suppressHours: param(24, 'ref-procedimento-alertas'),
    },
    cme: {
      shelfLifeDays: param(30, 'ref-procedimento-cme'),
      ibReadingHours: param(48, 'ref-procedimento-cme'),
      qualificationWarningDays: param(30, 'ref-procedimento-cme'),
    },
  },
};

export const DEMO_LOAD_POLICY: LoadReleasePolicy = {
  requiredLoadTests: ['IQ5', 'REGISTRO_FISICO'],
  requireDailyBowieDick: true,
  holdImplantsUntilBiological: true,
  referenceId: 'ref-rdc-15-2012',
};

export const DEMO_UNITS: Unit[] = [
  { id: 'central', name: 'Unidade Central' },
  { id: 'norte', name: 'Unidade Norte' },
];

export const DEMO_SECTORS: Sector[] = [
  { id: 'uti-adulto', code: 'uti-adulto', name: 'UTI Adulto', unitId: 'central', kind: 'uti' },
  { id: 'uti-neo', code: 'uti-neo', name: 'UTI Neonatal', unitId: 'central', kind: 'uti' },
  { id: 'uti-coronariana', code: 'uti-coronariana', name: 'UTI Coronariana', unitId: 'norte', kind: 'uti' },
  { id: 'clinica-medica', code: 'clinica-medica', name: 'Clínica Médica', unitId: 'central', kind: 'internacao' },
  { id: 'clinica-cirurgica', code: 'clinica-cirurgica', name: 'Clínica Cirúrgica', unitId: 'norte', kind: 'internacao' },
  { id: 'centro-cirurgico', code: 'centro-cirurgico', name: 'Centro Cirúrgico', unitId: 'central', kind: 'centro_cirurgico' },
  { id: 'cme', code: 'cme', name: 'CME', unitId: 'central', kind: 'cme' },
];
