/**
 * Granular permissions and the default matrix of the initial profiles. The API enforces them on
 * every request; the UI only uses them to hide what the user cannot do.
 */
export const PERMISSIONS = {
  'dashboard:view': 'Ver painel executivo',
  'indicators:view': 'Ver catálogo e valores de indicadores',
  'indicators:consolidate': 'Consolidar indicadores a partir dos registros clínicos',
  'reports:view': 'Ver e gerar relatórios',
  'config:view': 'Ver configurações, referências e parâmetros',
  'config:targets:edit': 'Editar metas de indicadores',
  'config:rules:edit': 'Editar parâmetros de regras institucionais',
  'config:references:edit': 'Cadastrar e editar referências clínicas e regulatórias',
  'config:references:validate': 'Validar referências clínicas e regulatórias',
  'config:org:edit': 'Editar instituição, unidades e setores',
  'config:cme_policy:edit': 'Editar a política de liberação de cargas da CME',
  'users:view': 'Ver usuários e perfis',
  'users:manage': 'Gerenciar usuários, perfis e escopos',
  'audit:view': 'Consultar o log de auditoria',
  'patient:view': 'Ver pacientes (iniciais e prontuário)',
  'patient:view_identified': 'Ver dados identificados de pacientes',
  'patient:edit': 'Registrar pacientes, internações, movimentações, dispositivos e evoluções CCIH',
  'iras:view': 'Ver vigilância de IRAS',
  'iras:edit': 'Registrar suspeitas e investigações de IRAS',
  'iras:decide': 'Confirmar ou descartar IRAS',
  'surgery:view': 'Ver registro cirúrgico',
  'surgery:edit': 'Registrar cirurgias e antibioticoprofilaxia',
  'micro:view': 'Ver microbiologia',
  'micro:edit': 'Registrar culturas e perfis microbiológicos',
  'atm:view': 'Ver antimicrobianos',
  'atm:review': 'Registrar revisão de antimicrobianos',
  'cme:view': 'Ver CME e rastreabilidade',
  'cme:edit': 'Registrar processamento, ciclos e testes',
  'cme:release': 'Liberar, reter ou rejeitar cargas',
  'cme:configure': 'Cadastrar equipamentos da CME e o catálogo de caixas',
  'cme:scan': 'Registrar leituras nas estações da CME (entrada, processamento e saída)',
  'cme:stations:configure': 'Cadastrar e parear estações de leitura e configurar o fluxo da CME',
  'cme:override': 'Autorizar exceção de sequência no fluxo da CME (com justificativa)',
  'quality:view': 'Ver bundles, auditorias, treinamentos e insumos',
  'quality:edit': 'Registrar bundles, auditorias, treinamentos e insumos',
  'quality:configure': 'Configurar modelos de bundle, catálogo de treinamentos e de insumos',
  'alerts:view': 'Ver alertas',
  'alerts:manage': 'Reconhecer, assumir, resolver e encerrar alertas',
  'alerts:exception': 'Encerrar por exceção formal um alerta bloqueante cuja condição persiste',
  'export:aggregate': 'Exportar dados agregados',
  'export:identified': 'Exportar dados identificáveis',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export type RoleCode = 'admin' | 'enf_ccih' | 'infectologista' | 'cme' | 'auditor' | 'gestor' | 'consulta';

export const ROLE_LABEL: Record<RoleCode, string> = {
  admin: 'Administrador',
  enf_ccih: 'Enfermeiro CCIH',
  infectologista: 'Médico infectologista',
  cme: 'CME',
  auditor: 'Auditor',
  gestor: 'Gestor',
  consulta: 'Consulta',
};

const VIEW_CORE: Permission[] = ['dashboard:view', 'indicators:view'];

/** Default permissions per profile (least privilege). Institutions can adjust them in Administração. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  admin: ALL_PERMISSIONS,
  enf_ccih: [
    ...VIEW_CORE, 'reports:view', 'config:view', 'config:references:validate', 'indicators:consolidate',
    'patient:view', 'patient:view_identified', 'patient:edit', 'iras:view', 'iras:edit', 'iras:decide', 'surgery:view', 'surgery:edit',
    'micro:view', 'atm:view', 'cme:view', 'quality:view', 'quality:edit', 'quality:configure', 'alerts:view', 'alerts:manage', 'alerts:exception', 'export:aggregate',
  ],
  infectologista: [
    ...VIEW_CORE, 'reports:view', 'config:view', 'config:references:validate',
    'patient:view', 'patient:view_identified', 'iras:view', 'iras:edit', 'iras:decide', 'surgery:view',
    'micro:view', 'micro:edit', 'atm:view', 'atm:review', 'alerts:view', 'alerts:manage', 'export:aggregate',
  ],
  cme: ['cme:view', 'cme:edit', 'cme:release', 'cme:configure', 'cme:scan', 'cme:stations:configure', 'cme:override', 'alerts:view', 'alerts:manage'],
  auditor: [
    ...VIEW_CORE, 'reports:view', 'config:view', 'audit:view', 'users:view',
    'patient:view', 'iras:view', 'surgery:view', 'micro:view', 'atm:view', 'cme:view', 'quality:view', 'alerts:view',
  ],
  gestor: [...VIEW_CORE, 'reports:view', 'quality:view', 'export:aggregate'],
  consulta: [...VIEW_CORE],
};

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
