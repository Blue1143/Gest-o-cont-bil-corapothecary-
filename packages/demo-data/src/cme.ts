import { addDays, todayIn, zonedInstant, type IsoDate, type PackagingType, type SterilizerType } from '@ccih/domain';
import { hashSeed, rng } from './random';

/**
 * Synthetic CME records: sterilizers, instrument sets, loads (one per cycle) with chemical and
 * biological indicators, daily Bowie-Dick, release decisions following the demo policy and the use
 * of packages in the synthetic surgeries. Includes the situations the module must surface: a
 * failed Bowie-Dick repeated after maintenance, a non-conforming cycle and a failed IQ sent to
 * reprocessing, implant loads held until the IB reading, a biological indicator never read and a
 * load recalled after a positive IB with packages already used.
 */
export const DEMO_STERILIZERS: Array<{ code: string; name: string; type: SterilizerType; serial: string; qualificationInDays: number; hours: number[] }> = [
  { code: 'av1', name: 'Autoclave a vapor 1 (demonstração)', type: 'vapor_prevacuo', serial: 'DEMO-AV1-001', qualificationInDays: 140, hours: [8, 11, 15] },
  { code: 'av2', name: 'Autoclave a vapor 2 (demonstração)', type: 'vapor_prevacuo', serial: 'DEMO-AV2-002', qualificationInDays: 18, hours: [10, 14] },
  { code: 'pl1', name: 'Esterilizador a plasma (demonstração)', type: 'peroxido_plasma', serial: 'DEMO-PL1-003', qualificationInDays: 210, hours: [13] },
];

export const DEMO_SETS: Array<{ code: string; name: string; specialty: string; packaging: PackagingType; implant: boolean; itemCount: number; plasma: boolean }> = [
  { code: 'cx-laparotomia', name: 'Caixa de laparotomia', specialty: 'Cirurgia geral', packaging: 'container_rigido', implant: false, itemCount: 62, plasma: false },
  { code: 'cx-hernia', name: 'Caixa de herniorrafia', specialty: 'Cirurgia geral', packaging: 'sms', implant: false, itemCount: 38, plasma: false },
  { code: 'cx-pequena-cirurgia', name: 'Caixa de pequena cirurgia', specialty: 'Cirurgia geral', packaging: 'papel_grau_cirurgico', implant: false, itemCount: 24, plasma: false },
  { code: 'cx-cesarea', name: 'Caixa de cesárea', specialty: 'Obstetrícia', packaging: 'container_rigido', implant: false, itemCount: 48, plasma: false },
  { code: 'cx-histerectomia', name: 'Caixa de histerectomia', specialty: 'Ginecologia', packaging: 'container_rigido', implant: false, itemCount: 55, plasma: false },
  { code: 'cx-ortopedia-basica', name: 'Caixa de ortopedia básica', specialty: 'Ortopedia', packaging: 'container_rigido', implant: false, itemCount: 70, plasma: false },
  { code: 'cx-placas-parafusos', name: 'Caixa de placas e parafusos (implantável)', specialty: 'Ortopedia', packaging: 'container_rigido', implant: true, itemCount: 120, plasma: false },
  { code: 'cx-cardiaca', name: 'Caixa de cirurgia cardíaca', specialty: 'Cirurgia cardíaca', packaging: 'container_rigido', implant: false, itemCount: 95, plasma: false },
  { code: 'cx-traqueostomia', name: 'Caixa de traqueostomia', specialty: 'Cirurgia geral', packaging: 'sms', implant: false, itemCount: 21, plasma: false },
  { code: 'cx-curativo', name: 'Kit de curativo', specialty: 'Enfermagem', packaging: 'papel_grau_cirurgico', implant: false, itemCount: 6, plasma: false },
  { code: 'cx-videolaparoscopia', name: 'Caixa de videolaparoscopia', specialty: 'Cirurgia geral', packaging: 'sms', implant: false, itemCount: 30, plasma: true },
  { code: 'otica-30', name: 'Ótica 30° 10 mm', specialty: 'Cirurgia geral', packaging: 'papel_grau_cirurgico', implant: false, itemCount: 1, plasma: true },
];

export type CmeDecisionTo = 'liberada' | 'retida' | 'rejeitada' | 'reprocessamento';

export interface DemoCmeTest {
  type: 'IQ5' | 'IB'; result: 'aprovado' | 'reprovado' | 'pendente'; performedAt: Date; incubationStart: Date | null;
  /** Later reading of a pending IB (stored as a new version of the test). */
  reading: { result: 'aprovado' | 'reprovado'; readAt: Date } | null;
}

export interface DemoCmeLoad {
  key: string; sterilizerCode: string; program: string; startedAt: Date; endedAt: Date | null; temperatureC: number | null; pressureKpa: number | null;
  exposureMinutes: number | null; physical: 'conforme' | 'nao_conforme' | null; sets: string[]; tests: DemoCmeTest[];
  decisions: Array<{ to: CmeDecisionTo; at: Date; justification: string }>; reprocessedFromKey: string | null;
}

export interface DemoCme {
  bowieDick: Array<{ sterilizerCode: string; performedAt: Date; result: 'aprovado' | 'reprovado'; notes: string | null }>;
  loads: DemoCmeLoad[];
  uses: Array<{ loadKey: string; itemIndex: number; surgeryId: string | null; sectorCode: string | null; usedAt: Date }>;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export function generateCme(input: { from: IsoDate; now: Date; timezone: string; surgeries: Array<{ id: string; startedAt: Date; implant: boolean }> }): DemoCme {
  const tz = input.timezone;
  const r = rng(hashSeed(`cme|${input.from}`));
  const today = todayIn(tz, input.now);
  const now = input.now.getTime();
  const out: DemoCme = { bowieDick: [], loads: [], uses: [] };
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)]!;

  const bdFailDay = addDays(input.from, 9);
  const physicalFailDay = addDays(input.from, 23);
  const iqFailDay = addDays(input.from, 15);
  const recallDay = addDays(today, -12);
  const lateIbDay = addDays(today, -3);
  const released = (l: DemoCmeLoad) => l.decisions.find((d) => d.to === 'liberada')?.at ?? null;

  const addReprocess = (src: DemoCmeLoad, at: Date) => {
    const start = new Date(at.getTime() + 90 * MIN);
    if (start.getTime() > now - 2 * HOUR) return;
    const end = new Date(start.getTime() + 62 * MIN);
    out.loads.push({
      key: `${src.key}-r`, sterilizerCode: src.sterilizerCode, program: src.program, startedAt: start, endedAt: end, temperatureC: 134, pressureKpa: 304, exposureMinutes: 5,
      physical: 'conforme', sets: [...src.sets], tests: [{ type: 'IQ5', result: 'aprovado', performedAt: new Date(end.getTime() + 5 * MIN), incubationStart: null, reading: null }],
      decisions: [{ to: 'liberada', at: new Date(end.getTime() + 15 * MIN), justification: 'Reprocessamento concluído; testes exigidos pela política aprovados.' }], reprocessedFromKey: src.key,
    });
  };

  for (let day = input.from; day <= today; day = addDays(day, 1)) {
    for (const st of DEMO_STERILIZERS) {
      const steam = st.type === 'vapor_prevacuo';
      if (steam) {
        const at = zonedInstant(day, 7, tz, 5 + Math.floor(r() * 20));
        if (at.getTime() <= now) {
          const failed = day === bdFailDay && st.code === 'av2';
          out.bowieDick.push({ sterilizerCode: st.code, performedAt: at, result: failed ? 'reprovado' : 'aprovado', notes: failed ? 'Mancha central na folha de teste: equipamento bloqueado para manutenção.' : null });
          if (failed) {
            const again = zonedInstant(day, 9, tz, 10);
            if (again.getTime() <= now) out.bowieDick.push({ sterilizerCode: st.code, performedAt: again, result: 'aprovado', notes: 'Repetido após manutenção corretiva (purgador de ar).' });
          }
        }
      }
      st.hours.forEach((hour, idx) => {
        const start = zonedInstant(day, hour, tz, Math.floor(r() * 40));
        if (start.getTime() > now - 5 * MIN) return;
        const duration = (steam ? 55 + Math.floor(r() * 15) : 47 + Math.floor(r() * 8)) * MIN;
        const endMs = start.getTime() + duration;
        const ended = endMs <= now;
        const end = ended ? new Date(endMs) : null;
        const recall = day === recallDay && st.code === 'av1' && idx === 0;
        const pool = DEMO_SETS.filter((s) => s.plasma === !steam && s.code !== 'cx-curativo' && !(recall && s.implant));
        const count = steam ? 3 + Math.floor(r() * 3) : 2;
        const sets = Array.from({ length: count }, () => pick(pool).code);
        if (steam && r() < 0.35) sets.push('cx-curativo');
        const hasImplant = sets.some((c) => DEMO_SETS.find((s) => s.code === c)!.implant);
        const key = `${st.code}-${day}-${idx}`;
        const load: DemoCmeLoad = {
          key, sterilizerCode: st.code, program: steam ? 'Instrumental 134 °C' : 'Plasma — ciclo padrão', startedAt: start, endedAt: end,
          temperatureC: end ? (steam ? 134 : 50) : null, pressureKpa: end ? (steam ? 304 : null) : null, exposureMinutes: end ? (steam ? 5 : 28) : null,
          physical: null, sets, tests: [], decisions: [], reprocessedFromKey: null,
        };
        out.loads.push(load);
        if (!end) return;
        load.physical = day === physicalFailDay && st.code === 'av1' && idx === 1 ? 'nao_conforme' : 'conforme';
        const iqFailed = day === iqFailDay && st.code === 'av1' && idx === 2;
        load.tests.push({ type: 'IQ5', result: iqFailed ? 'reprovado' : 'aprovado', performedAt: new Date(endMs + 5 * MIN), incubationStart: null, reading: null });
        let ibReadAt: Date | null = null;
        if ((steam && idx === 0) || hasImplant || !steam) {
          const incubation = new Date(endMs + 10 * MIN);
          const readAt = new Date(incubation.getTime() + 24 * HOUR);
          const neverRead = day === lateIbDay && st.code === 'av1' && idx === 0;
          const read = !neverRead && readAt.getTime() <= now;
          if (read) ibReadAt = readAt;
          load.tests.push({ type: 'IB', result: 'pendente', performedAt: incubation, incubationStart: incubation, reading: read ? { result: recall ? 'reprovado' : 'aprovado', readAt } : null });
        }
        const after = (m: number) => new Date(endMs + m * MIN);
        if (load.physical === 'nao_conforme') {
          load.decisions.push({ to: 'reprocessamento', at: after(20), justification: 'Tempo de exposição abaixo do programado no registro físico: carga enviada para reprocessamento.' });
          addReprocess(load, after(20));
        } else if (iqFailed) {
          load.decisions.push({ to: 'rejeitada', at: after(15), justification: 'Indicador químico classe 5 sem viragem completa em dois pacotes: carga rejeitada.' });
          load.decisions.push({ to: 'reprocessamento', at: after(25), justification: 'Pacotes reembalados e encaminhados para novo ciclo.' });
          addReprocess(load, after(25));
        } else if (hasImplant) {
          load.decisions.push({ to: 'retida', at: after(15), justification: 'Carga com implantável: retida até a leitura do indicador biológico.' });
          if (ibReadAt) load.decisions.push({ to: 'liberada', at: new Date(ibReadAt.getTime() + 10 * MIN), justification: 'Indicador biológico negativo; demais testes exigidos aprovados.' });
        } else if (endMs < now - 60 * MIN) {
          load.decisions.push({ to: 'liberada', at: after(15), justification: 'Testes exigidos pela política aprovados.' });
          if (recall && ibReadAt) load.decisions.push({ to: 'rejeitada', at: new Date(ibReadAt.getTime() + 30 * MIN), justification: 'Indicador biológico positivo na leitura de 24 h: recolhimento dos pacotes e comunicação à CCIH.' });
        }
      });
    }
  }

  // The most recent finished load without a decision stays waiting (the release queue is never empty).
  const lastReleased = [...out.loads].reverse().find((l) => l.endedAt && l.decisions.length === 1 && l.decisions[0]!.to === 'liberada' && !l.reprocessedFromKey);
  if (lastReleased) lastReleased.decisions = [];

  // Use of packages: each surgery receives one or two packages released before it (implant surgeries
  // an implant set when there is one); the recalled load's packages go to the first surgeries after
  // its release, so the recall has exposure to trace.
  const usedKeys = new Set<string>();
  const items = out.loads.flatMap((l) => l.sets.map((setCode, itemIndex) => ({ load: l, itemIndex, setCode, key: `${l.key}#${itemIndex}` })));
  const surgeries = [...input.surgeries].filter((s) => s.startedAt.getTime() <= now).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const markUsed = (it: (typeof items)[number], surgeryId: string | null, sectorCode: string | null, usedAt: Date) => {
    usedKeys.add(it.key);
    out.uses.push({ loadKey: it.load.key, itemIndex: it.itemIndex, surgeryId, sectorCode, usedAt });
  };
  const recallLoad = out.loads.find((l) => l.decisions.some((d) => d.to === 'rejeitada') && l.decisions[0]?.to === 'liberada');
  const assigned = new Set<string>();
  if (recallLoad) {
    const rel = released(recallLoad)!;
    const recalledAt = recallLoad.decisions.at(-1)!.at;
    const exposed = surgeries.filter((s) => s.startedAt > rel && s.startedAt < recalledAt).slice(0, 2);
    exposed.forEach((s, i) => {
      const it = items.find((x) => x.load === recallLoad && x.itemIndex === i && x.setCode !== 'cx-curativo');
      if (it) { markUsed(it, s.id, null, s.startedAt); assigned.add(s.id); }
    });
  }
  for (const s of surgeries) {
    if (assigned.has(s.id)) continue;
    const t = s.startedAt.getTime();
    const available = items.filter((it) => {
      const rel = released(it.load);
      const recalled = it.load.decisions.some((d) => d.to === 'rejeitada' && d.at.getTime() <= t);
      return rel && !recalled && rel.getTime() <= t - 30 * MIN && rel.getTime() >= t - 72 * HOUR && !usedKeys.has(it.key) && it.setCode !== 'cx-curativo';
    });
    if (!available.length) continue;
    const implants = available.filter((it) => DEMO_SETS.find((x) => x.code === it.setCode)!.implant);
    markUsed(s.implant && implants.length ? pick(implants) : pick(available), s.id, null, s.startedAt);
    if (r() < 0.4) {
      const rest = available.filter((it) => !usedKeys.has(it.key));
      if (rest.length) markUsed(pick(rest), s.id, null, s.startedAt);
    }
  }
  // A few dressing kits used on the wards without a patient link: the traceability gap the indicator shows.
  for (const it of items) {
    const rel = released(it.load);
    if (it.setCode !== 'cx-curativo' || !rel || usedKeys.has(it.key) || r() > 0.12) continue;
    if (it.load.decisions.some((d) => d.to === 'rejeitada')) continue;
    const usedAt = new Date(rel.getTime() + 20 * HOUR);
    if (usedAt.getTime() <= now) markUsed(it, null, pick(['clinica-medica', 'uti-adulto', 'clinica-cirurgica']), usedAt);
  }
  return out;
}
