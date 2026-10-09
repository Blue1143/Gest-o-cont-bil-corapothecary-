import { addMonths, type FactRow, type MetricCounts } from '@ccih/domain';
import { binomial, hashSeed, poisson, rng } from './random';

/**
 * Synthetic monthly facts per sector. Rates are plausible orders of magnitude for a demo, with a
 * mild improvement trend so indicators can be exercised — they are not benchmarks.
 */
interface WardProfile {
  beds: number;
  occupancy: number;
  cvc: number;
  vm: number;
  svd: number;
  /** Events per 1,000 device-days (or patient-days for "outras"). */
  ipcs: number;
  pav: number;
  itu: number;
  outras: number;
  staff: number;
}

const WARDS: Record<string, WardProfile> = {
  'uti-adulto': { beds: 20, occupancy: 0.9, cvc: 0.62, vm: 0.45, svd: 0.55, ipcs: 2.2, pav: 6.8, itu: 2.4, outras: 0.8, staff: 70 },
  'uti-neo': { beds: 15, occupancy: 0.85, cvc: 0.38, vm: 0.25, svd: 0.02, ipcs: 3.8, pav: 2.2, itu: 0, outras: 0.6, staff: 55 },
  'uti-coronariana': { beds: 10, occupancy: 0.85, cvc: 0.35, vm: 0.15, svd: 0.35, ipcs: 1.6, pav: 4.0, itu: 2.0, outras: 0.4, staff: 35 },
  'clinica-medica': { beds: 40, occupancy: 0.88, cvc: 0.08, vm: 0, svd: 0.12, ipcs: 1.2, pav: 0, itu: 3.2, outras: 0.5, staff: 80 },
  'clinica-cirurgica': { beds: 30, occupancy: 0.82, cvc: 0.06, vm: 0, svd: 0.1, ipcs: 1.0, pav: 0, itu: 2.6, outras: 0.4, staff: 60 },
};

const DAYS_IN_MONTH = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();

function wardCounts(sectorId: string, p: WardProfile, period: string, progress: number): MetricCounts {
  const r = rng(hashSeed(`${sectorId}|${period}`));
  const days = DAYS_IN_MONTH(period);
  const pd = Math.round(p.beds * days * (p.occupancy + (r() - 0.5) * 0.06));
  const cvc = Math.round(pd * p.cvc * (1 - 0.08 * progress));
  const vm = Math.round(pd * p.vm * (1 - 0.06 * progress));
  const svd = Math.round(pd * p.svd * (1 - 0.1 * progress));
  const improve = 1 - 0.25 * progress;
  const ipcs = poisson((cvc * p.ipcs * improve) / 1000, r);
  const pav = poisson((vm * p.pav * improve) / 1000, r);
  const itu = poisson((svd * p.itu * improve) / 1000, r);
  const outras = poisson((pd * p.outras) / 1000, r);
  const isIcu = p.vm > 0;
  const hmOpp = 120 + Math.round(r() * 60);
  const auditsCvc = isIcu ? 18 + Math.round(r() * 6) : 0;
  const auditsVm = isIcu && p.vm > 0.1 ? 18 + Math.round(r() * 6) : 0;
  const auditsSvd = p.svd > 0.05 ? 12 + Math.round(r() * 6) : 0;
  return {
    pacientes_dia: pd,
    cvc_dia: cvc,
    vm_dia: vm,
    svd_dia: svd,
    iras_ipcs: ipcs,
    iras_pav: pav,
    iras_itu: itu,
    iras_outras: outras,
    iras_total: ipcs + pav + itu + outras,
    mdr_novos: poisson((pd * (isIcu ? 2.2 : 0.7)) / 1000, r),
    hm_oportunidades: hmOpp,
    hm_acoes: binomial(hmOpp, 0.68 + 0.12 * progress, r),
    alcool_ml: Math.round(pd * (14 + 9 * progress + r() * 2)),
    bundle_cvc_auditorias: auditsCvc,
    bundle_cvc_conformes: binomial(auditsCvc, 0.74 + 0.14 * progress, r),
    bundle_vm_auditorias: auditsVm,
    bundle_vm_conformes: binomial(auditsVm, 0.7 + 0.12 * progress, r),
    bundle_svd_auditorias: auditsSvd,
    bundle_svd_conformes: binomial(auditsSvd, 0.78 + 0.1 * progress, r),
    atm_ddd: Math.round(pd * (isIcu ? 1.25 : 0.62) * (1 - 0.06 * progress) * (0.95 + r() * 0.1)),
    treinamento_publico: p.staff,
    treinamento_concluidos: Math.min(p.staff, Math.round(p.staff * (0.62 + 0.3 * progress + r() * 0.04))),
    investigacoes_abertas: poisson(isIcu ? 1.4 : 0.6, r),
  };
}

function surgeryCounts(period: string, progress: number): MetricCounts {
  const r = rng(hashSeed(`cc|${period}`));
  const clean = 130 + Math.round(r() * 30);
  const indicated = 210 + Math.round(r() * 30);
  return {
    cirurgias_limpas: clean,
    isc_limpas: poisson(clean * (0.019 - 0.006 * progress), r),
    profilaxia_indicada: indicated,
    profilaxia_no_prazo: binomial(indicated, 0.86 + 0.08 * progress, r),
    profilaxia_ate_24h: binomial(indicated, 0.88 + 0.06 * progress, r),
  };
}

function cmeCounts(period: string): MetricCounts {
  const r = rng(hashSeed(`cme|${period}`));
  const days = DAYS_IN_MONTH(period);
  const cycles = 280 + Math.round(r() * 40);
  const bd = days * 2;
  const loads = cycles;
  const retained = poisson(4, r);
  const boxes = 560 + Math.round(r() * 80);
  const nonConforming = poisson(2, r);
  const iq = boxes + 40;
  const reprocessed = poisson(3, r);
  return {
    cme_ciclos: cycles,
    cme_ciclos_conformes: cycles - nonConforming,
    cme_ciclos_nao_conformes: nonConforming,
    cme_iq_lidos: iq,
    cme_iq_conformes: iq - poisson(1.5, r),
    cme_cargas_reprocessadas: reprocessed,
    cme_nao_conformidades: nonConforming + reprocessed + poisson(4, r),
    cme_bd_realizados: bd,
    cme_bd_aprovados: bd - poisson(0.3, r),
    cme_ib_monitorados: days * 2 + 12,
    cme_ib_negativos: days * 2 + 12 - poisson(0.15, r),
    cme_cargas: loads,
    cme_cargas_liberadas: loads - retained,
    cme_cargas_retidas: retained,
    cme_caixas_usadas: boxes,
    cme_caixas_rastreadas: boxes - poisson(5, r),
  };
}

/** Facts for every month from `from` to `to` (inclusive). */
export function generateFacts(from: string, to: string, anchor: string): FactRow[] {
  const rows: FactRow[] = [];
  for (let period = from; period <= to; period = addMonths(period, 1)) {
    // 0 → 1 across the twelve months that end at `anchor`.
    const monthsBack = (Number(anchor.slice(0, 4)) - Number(period.slice(0, 4))) * 12 + Number(anchor.slice(5, 7)) - Number(period.slice(5, 7));
    const progress = Math.min(1, Math.max(0, 1 - monthsBack / 11));
    for (const [sectorId, profile] of Object.entries(WARDS)) rows.push({ period, sectorId, counts: wardCounts(sectorId, profile, period, progress) });
    rows.push({ period, sectorId: 'centro-cirurgico', counts: surgeryCounts(period, progress) });
    rows.push({ period, sectorId: 'cme', counts: cmeCounts(period) });
  }
  return rows;
}
