/** Main navigation. Modules not yet built say so and name the roadmap phase — no fake screens. */
export interface NavItem {
  path: string;
  label: string;
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
    items: [{ path: '/', label: 'Visão Geral', phase: null, summary: 'Painel executivo da CCIH.' }],
  },
  {
    label: 'Vigilância',
    items: [
      { path: '/vigilancia', label: 'Vigilância IRAS', phase: 3, summary: 'Suspeitas, investigações, confirmações e descartes de IRAS.',
        planned: ['Cadastro de suspeita e investigação', 'Vínculo com cultura, dispositivo, cirurgia, antimicrobiano e setor', 'Critérios versionados e configuráveis', 'Intervenções da CCIH'] },
      { path: '/pacientes', label: 'Pacientes', phase: 3, summary: 'Visão longitudinal do paciente: internação, dispositivos, culturas e IRAS.',
        planned: ['Timeline longitudinal', 'Evolução CCIH com auditoria', 'Dispositivos com dia de uso'] },
      { path: '/cirurgias', label: 'Cirurgias', phase: 3, summary: 'Registro cirúrgico, risco, antibioticoprofilaxia e vigilância de ISC.',
        planned: ['Registro completo com início/término', 'Verificação da janela de profilaxia configurada', 'Vínculo com caixas e cargas da CME'] },
      { path: '/microbiologia', label: 'Microbiologia', phase: 3, summary: 'Culturas, microrganismos, sensibilidade e perfis de resistência.',
        planned: ['Registro de culturas e antibiograma', 'Marcação MDR/XDR configurável', 'Antibiograma institucional consolidado (Fase 6)'] },
      { path: '/antimicrobianos', label: 'Antimicrobianos', phase: 6, summary: 'Stewardship: prescrições, revisões e alertas de apoio à decisão.',
        planned: ['Registro de prescrição e revisão CCIH', 'Alertas de terapia prolongada e descalonamento', 'DDD por setor'] },
    ],
  },
  {
    label: 'Prevenção e qualidade',
    items: [
      { path: '/bundles', label: 'Bundles', phase: 4, summary: 'Auditoria de bundles configuráveis com adesão, tendência e Pareto.' },
      { path: '/auditorias', label: 'Auditorias', phase: 4, summary: 'Auditorias, não conformidades e planos de ação (5W2H).' },
      { path: '/treinamentos', label: 'Treinamentos', phase: 4, summary: 'Treinamentos, presença, avaliação, cobertura e vencimentos.' },
      { path: '/insumos', label: 'Insumos', phase: 4, summary: 'Estoque, validade e disponibilidade de insumos de prevenção.' },
    ],
  },
  {
    label: 'CME',
    items: [
      { path: '/cme', label: 'CME', phase: 5, summary: 'Ciclos, testes (Bowie-Dick, IQ classes 1–6, IB) e liberação de cargas.' },
      { path: '/rastreabilidade', label: 'Rastreabilidade', phase: 5, summary: 'Lote → ciclo → carga → material → cirurgia → paciente, e o caminho inverso.' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { path: '/indicadores', label: 'Indicadores', phase: null, summary: 'Catálogo de indicadores com fórmula, fonte e meta.' },
      { path: '/relatorios', label: 'Relatórios', phase: 7, summary: 'Relatórios com filtros, impressão, PDF e CSV.' },
      { path: '/alertas', label: 'Alertas', phase: 4, summary: 'Central de alertas com prioridade, responsável e controle de alert fatigue.' },
      { path: '/admin', label: 'Administração', phase: null, summary: 'Referências, parâmetros, metas e (Fase 2) usuários e perfis.' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAVIGATION.flatMap((g) => g.items);
