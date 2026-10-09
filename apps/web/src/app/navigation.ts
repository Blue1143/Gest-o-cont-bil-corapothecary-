import type { Permission } from '@ccih/domain';

/** Main navigation. Modules not yet built say so and name the roadmap phase — no fake screens. */
export interface NavItem {
  path: string;
  label: string;
  /** Shown when the profile has any of these (the API enforces the same rule). */
  permissions: Permission[];
  /** Roadmap phase that delivers the module; null = available now. */
  phase: number | null;
  summary: string;
  planned?: string[];
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    items: [{ path: '/', permissions: ['dashboard:view'], label: 'Visão Geral', phase: null, summary: 'Painel executivo da CCIH.' }],
  },
  {
    label: 'Vigilância',
    items: [
      { path: '/vigilancia', permissions: ['iras:view'], label: 'Vigilância IRAS', phase: 3, summary: 'Suspeitas, investigações, confirmações e descartes de IRAS.',
        planned: ['Cadastro de suspeita e investigação', 'Vínculo com cultura, dispositivo, cirurgia, antimicrobiano e setor', 'Critérios versionados e configuráveis', 'Intervenções da CCIH'] },
      { path: '/pacientes', permissions: ['patient:view'], label: 'Pacientes', phase: 3, summary: 'Visão longitudinal do paciente: internação, dispositivos, culturas e IRAS.',
        planned: ['Timeline longitudinal', 'Evolução CCIH com auditoria', 'Dispositivos com dia de uso'] },
      { path: '/cirurgias', permissions: ['iras:view'], label: 'Cirurgias', phase: 3, summary: 'Registro cirúrgico, risco, antibioticoprofilaxia e vigilância de ISC.',
        planned: ['Registro completo com início/término', 'Verificação da janela de profilaxia configurada', 'Vínculo com caixas e cargas da CME'] },
      { path: '/microbiologia', permissions: ['micro:view'], label: 'Microbiologia', phase: 3, summary: 'Culturas, microrganismos, sensibilidade e perfis de resistência.',
        planned: ['Registro de culturas e antibiograma', 'Marcação MDR/XDR configurável', 'Antibiograma institucional consolidado (Fase 6)'] },
      { path: '/antimicrobianos', permissions: ['atm:view'], label: 'Antimicrobianos', phase: 6, summary: 'Stewardship: prescrições, revisões e alertas de apoio à decisão.',
        planned: ['Registro de prescrição e revisão CCIH', 'Alertas de terapia prolongada e descalonamento', 'DDD por setor'] },
    ],
  },
  {
    label: 'Prevenção e qualidade',
    items: [
      { path: '/bundles', permissions: ['quality:view'], label: 'Bundles', phase: 4, summary: 'Auditoria de bundles configuráveis com adesão, tendência e Pareto.' },
      { path: '/auditorias', permissions: ['quality:view'], label: 'Auditorias', phase: 4, summary: 'Auditorias, não conformidades e planos de ação (5W2H).' },
      { path: '/treinamentos', permissions: ['quality:view'], label: 'Treinamentos', phase: 4, summary: 'Treinamentos, presença, avaliação, cobertura e vencimentos.' },
      { path: '/insumos', permissions: ['quality:view'], label: 'Insumos', phase: 4, summary: 'Estoque, validade e disponibilidade de insumos de prevenção.' },
    ],
  },
  {
    label: 'CME',
    items: [
      { path: '/cme', permissions: ['cme:view'], label: 'CME', phase: 5, summary: 'Ciclos, testes (Bowie-Dick, IQ classes 1–6, IB) e liberação de cargas.' },
      { path: '/rastreabilidade', permissions: ['cme:view'], label: 'Rastreabilidade', phase: 5, summary: 'Lote → ciclo → carga → material → cirurgia → paciente, e o caminho inverso.' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { path: '/indicadores', permissions: ['indicators:view'], label: 'Indicadores', phase: null, summary: 'Catálogo de indicadores com fórmula, fonte e meta.' },
      { path: '/relatorios', permissions: ['reports:view'], label: 'Relatórios', phase: 7, summary: 'Relatórios com filtros, impressão, PDF e CSV.' },
      { path: '/alertas', permissions: ['alerts:view'], label: 'Alertas', phase: 4, summary: 'Central de alertas com prioridade, responsável e controle de alert fatigue.' },
      { path: '/admin', permissions: ['config:view', 'users:view', 'audit:view'], label: 'Administração', phase: null, summary: 'Metas, parâmetros, referências, política da CME, usuários, perfis e log de auditoria.' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAVIGATION.flatMap((g) => g.items);
