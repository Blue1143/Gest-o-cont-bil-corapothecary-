import {
  addDays, addMonths, dateInZone, zonedInstant,
  type ActionStatus, type AuditStatus, type BundleMetric, type FollowupMethod, type HandHygieneCategory, type IsoDate, type NcStatus, type SupplyCategory,
} from '@ccih/domain';
import { WARD_PROFILES } from './facts';
import { binomial, hashSeed, rng } from './random';

/**
 * Synthetic operational records (Phase 4): bundle audits, hand hygiene observations, staff and
 * trainings, supplies ledger, quality audits with non-conformities and action plans. Volumes follow
 * the same ward profiles as the monthly facts. Every template, training and item is a demonstration
 * model that the institution must replace or validate.
 */
export interface DemoBundleTemplate { code: string; name: string; metric: BundleMetric | null; method: 'tudo_ou_nada' | 'por_item'; items: string[] }

export const DEMO_BUNDLES: DemoBundleTemplate[] = [
  { code: 'bundle-cvc', name: 'Manutenção de cateter venoso central (modelo)', metric: 'cvc', method: 'tudo_ou_nada', items: [
    'Higiene das mãos antes do manuseio', 'Curativo íntegro, limpo e datado', 'Desinfecção do conector antes do acesso', 'Necessidade do cateter revisada no dia', 'Equipos identificados conforme protocolo'] },
  { code: 'bundle-vm', name: 'Prevenção de pneumonia associada à ventilação (modelo)', metric: 'vm', method: 'tudo_ou_nada', items: [
    'Cabeceira elevada conforme protocolo', 'Interrupção diária da sedação avaliada', 'Higiene oral conforme protocolo', 'Pressão do cuff verificada', 'Necessidade da ventilação revisada no dia'] },
  { code: 'bundle-svd', name: 'Manutenção de cateter urinário (modelo)', metric: 'svd', method: 'tudo_ou_nada', items: [
    'Fixação adequada', 'Bolsa coletora abaixo do nível da bexiga', 'Sistema fechado mantido', 'Necessidade do cateter revisada no dia'] },
  { code: 'bundle-isc', name: 'Prevenção de infecção de sítio cirúrgico (modelo)', metric: null, method: 'por_item', items: [
    'Tricotomia apenas quando necessária, com tricotomizador', 'Antissepsia da pele conforme protocolo', 'Profilaxia administrada no horário', 'Normotermia mantida'] },
];

export const DEMO_JOB_ROLES = ['Enfermeiro(a)', 'Técnico(a) de enfermagem', 'Médico(a)', 'Fisioterapeuta'] as const;
const ROLE_SHARE: Array<[(typeof DEMO_JOB_ROLES)[number], number]> = [['Enfermeiro(a)', 0.2], ['Técnico(a) de enfermagem', 0.55], ['Médico(a)', 0.18], ['Fisioterapeuta', 0.07]];

export const DEMO_TRAININGS = [
  { title: 'Higiene das mãos (modelo)', theme: 'Higiene das mãos', mandatory: true, validityMonths: 12, roles: [...DEMO_JOB_ROLES] },
  { title: 'Prevenção de IRAS associadas a dispositivos (modelo)', theme: 'Dispositivos invasivos', mandatory: true, validityMonths: 12, roles: ['Enfermeiro(a)', 'Técnico(a) de enfermagem', 'Médico(a)'] },
  { title: 'Precauções e isolamento (modelo)', theme: 'Precauções', mandatory: true, validityMonths: 24, roles: [...DEMO_JOB_ROLES] },
  { title: 'Atualização em uso de antimicrobianos (modelo)', theme: 'Antimicrobianos', mandatory: false, validityMonths: null, roles: ['Médico(a)', 'Enfermeiro(a)'] },
] as const;

export const DEMO_SUPPLIES: Array<{ code: string; name: string; category: SupplyCategory; unit: string; perPatientDay: number; minCoverageDays: number | null }> = [
  { code: 'alcool-gel-70', name: 'Preparação alcoólica gel 70% (frasco 800 mL)', category: 'preparacao_alcoolica', unit: 'mL', perPatientDay: 20, minCoverageDays: null },
  { code: 'sabonete-clorexidina', name: 'Sabonete com clorexidina 2%', category: 'antisseptico', unit: 'mL', perPatientDay: 6, minCoverageDays: null },
  { code: 'luva-procedimento', name: 'Luva de procedimento (caixa com 100)', category: 'epi', unit: 'caixa', perPatientDay: 0.12, minCoverageDays: 20 },
  { code: 'mascara-n95', name: 'Respirador N95/PFF2', category: 'epi', unit: 'unidade', perPatientDay: 0.08, minCoverageDays: 30 },
  { code: 'avental-descartavel', name: 'Avental descartável', category: 'epi', unit: 'unidade', perPatientDay: 0.4, minCoverageDays: null },
];

export interface DemoStaff { key: string; name: string; jobRole: (typeof DEMO_JOB_ROLES)[number]; sectorCode: string }
export interface DemoOperations {
  bundleAudits: Array<{ templateCode: string; sectorCode: string; auditedAt: string; answers: Array<'conforme' | 'nao_conforme' | 'nao_aplicavel'> }>;
  handHygiene: Array<{ sectorCode: string; observedAt: string; category: HandHygieneCategory; opportunities: number; actions: number }>;
  staff: DemoStaff[];
  sessions: Array<{ trainingTitle: string; heldOn: IsoDate; attendees: string[] }>;
  lots: Array<{ supplyCode: string; lot: string; expiresOn: IsoDate; entries: Array<{ at: string; quantity: number }> }>;
  consumption: Array<{ supplyCode: string; lot: string; sectorCode: string; at: string; quantity: number }>;
  audits: Array<{
    title: string; kind: 'processo' | 'estrutura' | 'documental'; sectorCode: string; plannedFor: IsoDate; status: AuditStatus; findings: string | null;
    history: Array<{ from: AuditStatus | null; to: AuditStatus; at: string }>;
    nonconformity: null | {
      description: string; severity: 'baixa' | 'media' | 'alta'; status: NcStatus; effectiveness: string | null; history: Array<{ from: NcStatus | null; to: NcStatus; at: string }>;
      actions: Array<{ what: string; why: string; where: string; who: string; dueOn: IsoDate; how: string; status: ActionStatus; completedOn: IsoDate | null }>;
    };
  }>;
}

export function generateOperations({ from, now, timezone }: { from: IsoDate; now: Date; timezone: string }): DemoOperations {
  const r = rng(hashSeed(`operations|${from}`));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const today = dateInZone(now, timezone);
  const at = (date: IsoDate, hour: number, minute = 0) => zonedInstant(date, hour, timezone, minute).toISOString();
  const days: IsoDate[] = [];
  for (let d = from; d < today; d = addDays(d, 1)) days.push(d);
  const out: DemoOperations = { bundleAudits: [], handHygiene: [], staff: [], sessions: [], lots: [], consumption: [], audits: [] };

  // Bundle audits and hand hygiene: roughly the monthly volumes of the fact generator.
  for (const [code, p] of Object.entries(WARD_PROFILES)) {
    const isIcu = p.vm > 0;
    const perMonth: Array<[string, number, number]> = [
      ['bundle-cvc', isIcu ? 21 : 0, 0.88],
      ['bundle-vm', isIcu && p.vm > 0.1 ? 21 : 0, 0.82],
      ['bundle-svd', p.svd > 0.05 ? 15 : 0, 0.88],
    ];
    for (const [template, n, compliance] of perMonth) {
      const items = DEMO_BUNDLES.find((b) => b.code === template)!.items.length;
      const total = Math.round((n * days.length) / 30);
      for (let i = 0; i < total; i++) {
        const day = pick(days);
        const answers = Array.from({ length: items }, () => 'conforme' as 'conforme' | 'nao_conforme' | 'nao_aplicavel');
        if (r() > compliance) answers[Math.floor(r() * items)] = 'nao_conforme';
        if (r() < 0.1) answers[items - 1] = answers[items - 1] === 'nao_conforme' ? 'nao_conforme' : 'nao_aplicavel';
        out.bundleAudits.push({ templateCode: template, sectorCode: code, auditedAt: at(day, 8 + Math.floor(r() * 10), Math.floor(r() * 60)), answers });
      }
    }
    for (let i = 0; i < Math.round((8 * days.length) / 30); i++) {
      const opportunities = 15 + Math.floor(r() * 11);
      out.handHygiene.push({ sectorCode: code, observedAt: at(pick(days), 7 + Math.floor(r() * 12), Math.floor(r() * 60)), category: pick(['enfermagem', 'enfermagem', 'medica', 'fisioterapia', 'apoio'] as const), opportunities, actions: binomial(opportunities, 0.8, r) });
    }
  }

  // Staff and trainings: attendance spread over the last 13 months, ~5% never attended.
  let staffSeq = 0;
  for (const [code, p] of Object.entries(WARD_PROFILES)) {
    for (const [role, share] of ROLE_SHARE) {
      for (let i = 0; i < Math.round(p.staff * share); i++) out.staff.push({ key: `prof-${++staffSeq}`, name: `Profissional ${String(staffSeq).padStart(3, '0')} (demonstração)`, jobRole: role, sectorCode: code });
    }
  }
  const sessions = new Map<string, { trainingTitle: string; heldOn: IsoDate; attendees: string[] }>();
  for (const t of DEMO_TRAININGS) {
    for (const s of out.staff) {
      if (!(t.roles as readonly string[]).includes(s.jobRole) || r() < (t.mandatory ? 0.05 : 0.6)) continue;
      const month = addMonths(`${today.slice(0, 7)}-01`, -Math.floor(r() * 13));
      const heldOn = `${month.slice(0, 7)}-15` > today ? addDays(today, -1) : `${month.slice(0, 7)}-15`;
      const key = `${t.title}|${heldOn}`;
      const session = sessions.get(key) ?? { trainingTitle: t.title, heldOn, attendees: [] };
      session.attendees.push(s.key);
      sessions.set(key, session);
    }
  }
  out.sessions = [...sessions.values()];

  // Supplies: monthly entries, daily consumption per ward; N95 kept short and one gel lot near expiry.
  const wards = Object.entries(WARD_PROFILES);
  for (const s of DEMO_SUPPLIES) {
    const dailyTotal = wards.reduce((sum, [, p]) => sum + p.beds * p.occupancy * s.perPatientDay, 0);
    const entryDays: IsoDate[] = [];
    for (let m = 0; addDays(from, m * 30 - 3) < today; m++) entryDays.push(addDays(from, m * 30 - 3));
    const months = entryDays.length;
    for (let m = 0; m < months; m++) {
      const entryDay = entryDays[m]!;
      const shortage = s.code === 'mascara-n95' && m === months - 1 ? 0.15 : 1;
      const expiresOn = s.code === 'alcool-gel-70' && m === months - 1 ? addDays(today, 20) : addDays(entryDay, 540);
      out.lots.push({ supplyCode: s.code, lot: `DEMO-${s.code.slice(0, 3).toUpperCase()}-${String(m + 1).padStart(3, '0')}`, expiresOn, entries: [{ at: at(entryDay, 9), quantity: Math.ceil(dailyTotal * 31 * shortage * 1.05) }] });
    }
    // FIFO consumption: never below zero (a missing quantity is a stock-out, not a negative lot).
    const lots = out.lots.filter((l) => l.supplyCode === s.code);
    const remaining = lots.map(() => 0);
    days.forEach((day) => {
      lots.forEach((l, i) => { const e = entryDays[i]!; if (e === day || (day === days[0] && e < day)) remaining[i]! += l.entries[0]!.quantity; });
      for (const [code, p] of wards) {
        const q = p.beds * p.occupancy * s.perPatientDay * (0.85 + r() * 0.3);
        let quantity = s.unit === 'mL' ? Math.round(q) : Math.round(q * 10) / 10;
        for (let i = 0; i < lots.length && quantity > 0; i++) {
          const take = Math.min(remaining[i]!, quantity);
          if (take <= 0) continue;
          remaining[i]! -= take;
          quantity -= take;
          const rounded = s.unit === 'mL' ? Math.round(take) : Math.round(take * 10) / 10;
          if (rounded > 0) out.consumption.push({ supplyCode: s.code, lot: lots[i]!.lot, sectorCode: code, at: at(day, 18), quantity: rounded });
        }
      }
    });
  }

  // Quality audits with the full workflow represented.
  const ago = (n: number) => addDays(today, -n);
  out.audits.push(
    {
      title: 'Auditoria de processo — preparo de medicação endovenosa (modelo)', kind: 'processo', sectorCode: 'uti-adulto', plannedFor: ago(60), status: 'encerrada',
      findings: 'Bancada de preparo sem desinfecção registrada em 3 de 10 observações (dado sintético).',
      history: [{ from: null, to: 'planejada', at: at(ago(70), 9) }, { from: 'planejada', to: 'em_andamento', at: at(ago(60), 9) }, { from: 'em_andamento', to: 'concluida', at: at(ago(58), 15) }, { from: 'concluida', to: 'plano_de_acao', at: at(ago(57), 10) }, { from: 'plano_de_acao', to: 'verificacao_eficacia', at: at(ago(30), 10) }, { from: 'verificacao_eficacia', to: 'encerrada', at: at(ago(10), 10) }],
      nonconformity: {
        description: 'Desinfecção da bancada de preparo não realizada antes do preparo (dado sintético).', severity: 'media', status: 'encerrada',
        effectiveness: 'Reauditoria com 10 de 10 observações conformes (dado sintético).',
        history: [{ from: null, to: 'aberta', at: at(ago(58), 15) }, { from: 'aberta', to: 'em_tratamento', at: at(ago(57), 10) }, { from: 'em_tratamento', to: 'aguardando_eficacia', at: at(ago(30), 10) }, { from: 'aguardando_eficacia', to: 'encerrada', at: at(ago(10), 10) }],
        actions: [{ what: 'Treinar a equipe no procedimento de preparo', why: 'Desinfecção da bancada não realizada', where: 'UTI Adulto', who: 'Enfermeira CCIH (demonstração)', dueOn: ago(40), how: 'Treinamento em serviço nos três turnos', status: 'concluida', completedOn: ago(42) }],
      },
    },
    {
      title: 'Auditoria de estrutura — pias e dispensadores (modelo)', kind: 'estrutura', sectorCode: 'clinica-medica', plannedFor: ago(25), status: 'plano_de_acao',
      findings: 'Dois dispensadores de preparação alcoólica vazios e um sem suporte (dado sintético).',
      history: [{ from: null, to: 'planejada', at: at(ago(35), 9) }, { from: 'planejada', to: 'em_andamento', at: at(ago(25), 9) }, { from: 'em_andamento', to: 'concluida', at: at(ago(24), 16) }, { from: 'concluida', to: 'plano_de_acao', at: at(ago(23), 10) }],
      nonconformity: {
        description: 'Dispensadores de preparação alcoólica vazios nos pontos de assistência (dado sintético).', severity: 'alta', status: 'em_tratamento', effectiveness: null,
        history: [{ from: null, to: 'aberta', at: at(ago(24), 16) }, { from: 'aberta', to: 'em_tratamento', at: at(ago(23), 10) }],
        actions: [
          { what: 'Definir rotina de reposição dos dispensadores por turno', why: 'Dispensadores vazios', where: 'Clínica Médica', who: 'Coordenação de enfermagem (demonstração)', dueOn: ago(5), how: 'Checklist de reposição no início de cada turno', status: 'em_andamento', completedOn: null },
          { what: 'Instalar suporte no dispensador do leito 12', why: 'Dispensador sem suporte', where: 'Clínica Médica', who: 'Manutenção (demonstração)', dueOn: ago(15), how: 'Ordem de serviço', status: 'concluida', completedOn: ago(16) },
        ],
      },
    },
    { title: 'Auditoria documental — registros de inserção de cateter (modelo)', kind: 'documental', sectorCode: 'uti-coronariana', plannedFor: addDays(today, 10), status: 'planejada', findings: null, history: [{ from: null, to: 'planejada', at: at(ago(3), 9) }], nonconformity: null },
  );
  return out;
}

export const DEMO_FOLLOWUP_METHODS: FollowupMethod[] = ['telefone', 'telefone', 'telefone', 'ambulatorio', 'retorno'];
