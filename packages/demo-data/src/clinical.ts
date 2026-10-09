import {
  addDays, dateInZone, zonedInstant,
  type CultureMaterial, type DeviceType, type DischargeOutcome, type Interpretation, type InvestigationStatus, type IrasType,
  type IsoDate, type NoteKind, type ResistanceProfile, type Sex, type WoundClass,
} from '@ccih/domain';
import { WARD_PROFILES } from './facts';
import { hashSeed, rng } from './random';

/**
 * Synthetic clinical records (no real patients): bed-by-bed stays, transfers, devices, surgeries,
 * cultures and IRAS cases, deterministic for a given start date. Volumes follow the same ward
 * profiles as the monthly facts, so consolidated indicators stay in the same order of magnitude.
 */
export interface DemoProcedure { code: string; name: string; specialty: string; p75Min: number; woundClass: WoundClass; implant: boolean; weight: number }
export interface DemoMovement { sectorCode: string; bedCode: string | null; start: string; end: string | null; reason: string | null }
export interface DemoDevice { key: string; type: DeviceType; site: string | null; insertedAt: string; removedAt: string | null; removalReason: string | null }
export interface DemoAdmission {
  key: string; patientKey: string; admittedAt: string; dischargedAt: string | null; outcome: DischargeOutcome | null; diagnosis: string;
  movements: DemoMovement[]; devices: DemoDevice[];
}
export interface DemoPatient { key: string; recordNumber: string; initials: string; sex: Sex; birthDate: IsoDate }
export interface DemoSurgery {
  key: string; admissionKey: string; procedureCode: string; surgeonKey: string; room: string; startedAt: string; endedAt: string;
  woundClass: WoundClass; asa: number; implant: boolean; urgency: boolean;
  prophylaxisIndicated: boolean; drug: string | null; doseAt: string | null; durationH: number | null; redose: boolean | null;
}
export interface DemoIsolate { organism: string; profile: ResistanceProfile | null; mechanism: string | null; susceptibility: Array<{ antimicrobial: string; interpretation: Interpretation }> }
export interface DemoCulture {
  key: string; admissionKey: string; sectorCode: string; material: CultureMaterial; collectedAt: string;
  result: { outcome: 'negativa' | 'positiva'; reportedAt: string; isolates: DemoIsolate[] } | null;
}
export interface DemoCase {
  key: string; admissionKey: string; type: IrasType; eventDate: IsoDate; sectorCode: string; status: InvestigationStatus;
  deviceKey: string | null; deviceAssociated: boolean | null; surgeryKey: string | null; cultureKeys: string[];
  history: Array<{ from: InvestigationStatus | null; to: InvestigationStatus; at: string; justification: string }>;
}
export interface DemoNote { patientKey: string; admissionKey: string; caseKey: string | null; kind: NoteKind; body: string; at: string }
export interface DemoClinical {
  procedures: DemoProcedure[]; surgeons: Array<{ key: string; name: string }>; patients: DemoPatient[]; admissions: DemoAdmission[];
  surgeries: DemoSurgery[]; cultures: DemoCulture[]; cases: DemoCase[]; notes: DemoNote[];
}

export const DEMO_PROCEDURES: DemoProcedure[] = [
  { code: 'herniorrafia-inguinal', name: 'Herniorrafia inguinal', specialty: 'Cirurgia geral', p75Min: 90, woundClass: 'limpa', implant: true, weight: 14 },
  { code: 'colecistectomia-vlp', name: 'Colecistectomia videolaparoscópica', specialty: 'Cirurgia geral', p75Min: 120, woundClass: 'potencialmente_contaminada', implant: false, weight: 16 },
  { code: 'artroplastia-quadril', name: 'Artroplastia total de quadril', specialty: 'Ortopedia', p75Min: 150, woundClass: 'limpa', implant: true, weight: 8 },
  { code: 'artroplastia-joelho', name: 'Artroplastia total de joelho', specialty: 'Ortopedia', p75Min: 150, woundClass: 'limpa', implant: true, weight: 8 },
  { code: 'cesariana', name: 'Cesariana', specialty: 'Obstetrícia', p75Min: 80, woundClass: 'potencialmente_contaminada', implant: false, weight: 14 },
  { code: 'histerectomia', name: 'Histerectomia abdominal', specialty: 'Ginecologia', p75Min: 150, woundClass: 'potencialmente_contaminada', implant: false, weight: 6 },
  { code: 'revascularizacao-miocardio', name: 'Revascularização do miocárdio', specialty: 'Cirurgia cardíaca', p75Min: 300, woundClass: 'limpa', implant: false, weight: 6 },
  { code: 'craniotomia', name: 'Craniotomia', specialty: 'Neurocirurgia', p75Min: 240, woundClass: 'limpa', implant: false, weight: 5 },
  { code: 'tireoidectomia', name: 'Tireoidectomia', specialty: 'Cabeça e pescoço', p75Min: 120, woundClass: 'limpa', implant: false, weight: 7 },
  { code: 'colectomia', name: 'Colectomia', specialty: 'Coloproctologia', p75Min: 240, woundClass: 'contaminada', implant: false, weight: 6 },
  { code: 'apendicectomia', name: 'Apendicectomia', specialty: 'Cirurgia geral', p75Min: 70, woundClass: 'contaminada', implant: false, weight: 10 },
];

export const DEMO_P75_SOURCE = 'Valor de demonstração — substituir pela tabela institucional de duração (P75)';

const SURGEONS = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({ key: `cir-${l}`, name: `Cirurgião(ã) ${l} (demonstração)` }));

const DIAGNOSES: Record<string, string[]> = {
  'uti-adulto': ['Sepse de foco pulmonar', 'Choque séptico', 'Insuficiência respiratória aguda', 'Pós-operatório de grande porte', 'Acidente vascular cerebral'],
  'uti-neo': ['Prematuridade', 'Desconforto respiratório do recém-nascido', 'Baixo peso ao nascer'],
  'uti-coronariana': ['Síndrome coronariana aguda', 'Insuficiência cardíaca descompensada', 'Arritmia'],
  'clinica-medica': ['Pneumonia comunitária', 'Infecção do trato urinário comunitária', 'Diabetes descompensado', 'Doença pulmonar obstrutiva crônica'],
  'clinica-cirurgica': ['Internação para procedimento cirúrgico eletivo', 'Internação para procedimento cirúrgico de urgência'],
};

const ORGANISMS: Record<IrasType, string[]> = {
  IPCS: ['Staphylococcus aureus', 'Staphylococcus epidermidis', 'Klebsiella pneumoniae', 'Candida albicans'],
  PAV: ['Pseudomonas aeruginosa', 'Acinetobacter baumannii', 'Klebsiella pneumoniae', 'Staphylococcus aureus'],
  'ITU-AC': ['Escherichia coli', 'Klebsiella pneumoniae', 'Enterococcus faecalis', 'Pseudomonas aeruginosa'],
  ISC: ['Staphylococcus aureus', 'Escherichia coli', 'Enterococcus faecalis'],
  OUTRA: ['Escherichia coli', 'Klebsiella pneumoniae'],
};
const MDR_MECHANISM: Record<string, string> = {
  'Klebsiella pneumoniae': 'Carbapenemase (KPC) — informado pelo laboratório',
  'Acinetobacter baumannii': 'Resistente a carbapenêmicos',
  'Pseudomonas aeruginosa': 'Resistente a carbapenêmicos',
  'Staphylococcus aureus': 'MRSA',
  'Escherichia coli': 'ESBL',
  'Enterococcus faecium': 'VRE',
};
const SURVEILLANCE_ORGANISMS = ['Klebsiella pneumoniae', 'Acinetobacter baumannii', 'Enterococcus faecium', 'Staphylococcus aureus'];
const PANEL_GRAM_NEG = ['Amicacina', 'Cefepima', 'Ceftriaxona', 'Ciprofloxacino', 'Meropeném', 'Piperacilina-tazobactam', 'Polimixina B'];
const PANEL_SAUREUS = ['Oxacilina', 'Vancomicina', 'Clindamicina', 'Sulfametoxazol-trimetoprima', 'Linezolida'];
const PANEL_ENTERO = ['Ampicilina', 'Vancomicina', 'Linezolida'];
const RESISTANT_WHEN_MDR = new Set(['Cefepima', 'Ceftriaxona', 'Meropeném', 'Piperacilina-tazobactam', 'Oxacilina', 'Ampicilina', 'Vancomicina']);

const MATERIAL_BY_TYPE: Record<IrasType, CultureMaterial> = { IPCS: 'sangue', PAV: 'secrecao_traqueal', 'ITU-AC': 'urina', ISC: 'ferida_operatoria', OUTRA: 'sangue' };
const DEVICE_SITES: Partial<Record<DeviceType, string[]>> = {
  CVC: ['Veia subclávia direita', 'Veia jugular interna direita', 'Veia femoral esquerda'],
  PICC: ['Veia basílica esquerda', 'Veia cefálica direita'],
  VM: ['Tubo orotraqueal'],
};
const DAY = 86_400_000;

export interface DemoClinicalOptions {
  /** First day of the first month that must be fully covered. */
  from: IsoDate;
  now: Date;
  timezone: string;
}

export function generateClinical({ from, now, timezone }: DemoClinicalOptions): DemoClinical {
  const r = rng(hashSeed(`clinical|${from}`));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const exp = (mean: number) => -mean * Math.log(1 - r());
  const iso = (ms: number) => new Date(Math.round(ms / 60_000) * 60_000).toISOString();
  const localDate = (ms: number) => dateInZone(new Date(ms), timezone);
  const at = (date: IsoDate, hour: number, minute = 0) => zonedInstant(date, hour, timezone).getTime() + minute * 60_000;
  const nowMs = now.getTime();
  const today = localDate(nowMs);
  const start = at(addDays(from, -30), 0);

  const out: DemoClinical = { procedures: DEMO_PROCEDURES, surgeons: SURGEONS, patients: [], admissions: [], surgeries: [], cultures: [], cases: [], notes: [] };
  let seq = 0;
  const newPatient = (sectorCode: string, admittedMs: number): DemoPatient => {
    seq++;
    const letters = 'ABCDEFGHIJLMNOPRSTV';
    const initials = Array.from({ length: 2 + Math.floor(r() * 3) }, () => pick([...letters])).join('');
    const admitted = localDate(admittedMs);
    const birthDate = sectorCode === 'uti-neo' ? addDays(admitted, -Math.floor(r() * 4)) : addDays(admitted, -Math.round((18 + Math.pow(r(), 0.7) * 72) * 365.25));
    const p: DemoPatient = { key: `pac-${seq}`, recordNumber: `DEMO-${String(100000 + seq)}`, initials, sex: r() < 0.5 ? 'F' : 'M', birthDate };
    out.patients.push(p);
    return p;
  };

  let caseSeq = 0;
  let cultureSeq = 0;
  const addCulture = (admissionKey: string, sectorCode: string, material: CultureMaterial, collectedMs: number, isolate: DemoIsolate | null): DemoCulture | null => {
    if (collectedMs > nowMs) return null;
    const reportedMs = collectedMs + (2 + r()) * DAY;
    const c: DemoCulture = {
      key: `cult-${++cultureSeq}`, admissionKey, sectorCode, material, collectedAt: iso(collectedMs),
      result: reportedMs > nowMs ? null : { outcome: isolate ? 'positiva' : 'negativa', reportedAt: iso(reportedMs), isolates: isolate ? [isolate] : [] },
    };
    out.cultures.push(c);
    return c;
  };
  const makeIsolate = (organism: string, mdr: boolean): DemoIsolate => {
    const panel = organism.startsWith('Staphylococcus') ? PANEL_SAUREUS : organism.startsWith('Enterococcus') ? PANEL_ENTERO : organism.startsWith('Candida') ? [] : PANEL_GRAM_NEG;
    return {
      organism, profile: mdr ? 'MDR' : null, mechanism: mdr ? (MDR_MECHANISM[organism] ?? null) : null,
      susceptibility: panel.map((antimicrobial) => {
        // Vancomycin resistance only in VRE; other MDR mechanisms hit beta-lactams and carbapenems.
        const resistant = mdr && RESISTANT_WHEN_MDR.has(antimicrobial) && (antimicrobial !== 'Vancomicina' || organism === 'Enterococcus faecium');
        return { antimicrobial, interpretation: resistant ? 'R' : r() < 0.92 ? 'S' : 'R' };
      }),
    };
  };
  const addCase = (adm: DemoAdmission, type: IrasType, eventMs: number, sectorCode: string, deviceKey: string | null, surgeryKey: string | null) => {
    const eventDate = localDate(eventMs);
    if (eventDate > today) return;
    const age = Math.floor((nowMs - eventMs) / DAY);
    const key = `caso-${++caseSeq}`;
    const organism = pick(ORGANISMS[type]);
    const discarded = age >= 12 && r() < 0.15;
    const culture = addCulture(adm.key, sectorCode, MATERIAL_BY_TYPE[type], eventMs, discarded ? null : makeIsolate(organism, (type === 'IPCS' || type === 'PAV') && r() < 0.25 && organism in MDR_MECHANISM));
    const history: DemoCase['history'] = [];
    const step = (from: InvestigationStatus | null, to: InvestigationStatus, ms: number, justification: string) => {
      if (ms <= nowMs) history.push({ from, to, at: iso(ms), justification });
    };
    const suspected = Math.min(eventMs + 0.6 * DAY, nowMs - 60_000);
    step(null, 'suspeita', suspected, 'Busca ativa da CCIH: suspeita registrada (dado sintético).');
    step('suspeita', 'em_investigacao', suspected + 1.2 * DAY, 'Investigação iniciada com revisão de prontuário e culturas (dado sintético).');
    if (age >= 12) step('em_investigacao', discarded ? 'descartada' : 'confirmada', suspected + (5 + r() * 4) * DAY, discarded ? 'Critérios não atendidos após revisão (dado sintético).' : 'Critérios atendidos após revisão da CCIH (dado sintético).');
    const status = history.at(-1)!.to;
    const devAssoc = deviceKey != null && status === 'confirmada' ? true : null;
    out.cases.push({ key, admissionKey: adm.key, type, eventDate, sectorCode, status, deviceKey, deviceAssociated: devAssoc, surgeryKey, cultureKeys: culture ? [culture.key] : [], history });
    out.notes.push({ patientKey: adm.patientKey, admissionKey: adm.key, caseKey: key, kind: 'avaliacao', body: `Suspeita de ${type} identificada na busca ativa. Solicitada revisão de culturas e dispositivos. Registro sintético de demonstração.`, at: history[0]!.at });
    if (status === 'confirmada') out.notes.push({ patientKey: adm.patientKey, admissionKey: adm.key, caseKey: key, kind: 'recomendacao', body: 'Reforçar bundle de prevenção com a equipe do setor e reavaliar diariamente a necessidade do dispositivo. Registro sintético de demonstração.', at: history.at(-1)!.at });
  };

  for (const [sectorCode, prof] of Object.entries(WARD_PROFILES)) {
    const gapMean = (prof.los * (1 - prof.occupancy)) / prof.occupancy;
    for (let bed = 1; bed <= prof.beds; bed++) {
      const bedCode = String(bed).padStart(2, '0');
      let t = r() < prof.occupancy ? start - r() * prof.los * DAY : start + exp(gapMean) * DAY;
      while (t < nowMs) {
        const los = Math.min(60, Math.max(0.3, exp(prof.los))) * DAY;
        const patient = newPatient(sectorCode, t);
        const key = `int-${out.admissions.length + 1}`;
        let bedEnd = t + los;
        const transfer = (sectorCode === 'uti-adulto' || sectorCode === 'uti-coronariana') && r() < 0.4;
        let end = transfer ? bedEnd + exp(3) * DAY : bedEnd;
        const open = end > nowMs;
        if (bedEnd > nowMs) bedEnd = Number.POSITIVE_INFINITY;
        if (open) end = Number.POSITIVE_INFINITY;
        const movements: DemoMovement[] = [{ sectorCode, bedCode, start: iso(t), end: Number.isFinite(bedEnd) ? iso(bedEnd) : null, reason: 'Admissão' }];
        if (transfer && Number.isFinite(bedEnd)) movements.push({ sectorCode: 'clinica-medica', bedCode: null, start: iso(bedEnd), end: Number.isFinite(end) ? iso(end) : null, reason: 'Transferência após alta da UTI' });
        const adm: DemoAdmission = {
          key, patientKey: patient.key, admittedAt: iso(t), dischargedAt: Number.isFinite(end) ? iso(end) : null,
          outcome: Number.isFinite(end) ? (sectorCode.startsWith('uti') && r() < 0.12 ? 'obito' : 'alta') : null,
          diagnosis: pick(DIAGNOSES[sectorCode] ?? ['Internação clínica']), movements, devices: [],
        };
        out.admissions.push(adm);

        // Devices during the first stay; ratio of device-days ≈ profile (mean in-place fraction 0.75).
        const stayEnd = Math.min(bedEnd, nowMs);
        const kinds: Array<[DeviceType, number]> = [[sectorCode === 'uti-neo' ? 'PICC' : 'CVC', prof.cvc], ['VM', prof.vm], ['SVD', prof.svd]];
        for (const [type, ratio] of kinds) {
          if (ratio <= 0 || r() > Math.min(0.95, ratio / 0.75)) continue;
          const inserted = t + r() * Math.min(DAY, (stayEnd - t) * 0.1);
          const removalPlanned = inserted + (0.5 + 0.5 * r()) * (Math.min(bedEnd, t + los) - inserted);
          const removed = removalPlanned > nowMs ? null : removalPlanned;
          const device: DemoDevice = {
            key: `disp-${type}-${key}`, type, site: DEVICE_SITES[type] ? pick(DEVICE_SITES[type]!) : null, insertedAt: iso(inserted),
            removedAt: removed == null ? null : iso(removed), removalReason: removed == null ? null : 'Sem indicação de manutenção',
          };
          adm.devices.push(device);
          const days = ((removed ?? nowMs) - inserted) / DAY;
          const rate = (type === 'VM' ? prof.pav : type === 'SVD' ? prof.itu : prof.ipcs) * 0.75;
          if (days >= 3 && r() < 1 - Math.exp((-rate / 1000) * days)) {
            const irasType: IrasType = type === 'VM' ? 'PAV' : type === 'SVD' ? 'ITU-AC' : 'IPCS';
            addCase(adm, irasType, inserted + (2 + r() * (days - 2)) * DAY, sectorCode, device.key, null);
          }
        }
        const stayDays = (stayEnd - t) / DAY;
        if (r() < 1 - Math.exp((-prof.outras / 1000) * stayDays)) addCase(adm, 'OUTRA', t + r() * stayDays * DAY, sectorCode, null, null);

        if (sectorCode.startsWith('uti')) {
          if (r() < 0.3) addCulture(key, sectorCode, 'sangue', t + r() * Math.min(3, stayDays) * DAY, null);
          if (r() < 1 - Math.exp((-2.2 / 1000) * stayDays * 1.5)) {
            const organism = pick(SURVEILLANCE_ORGANISMS);
            addCulture(key, sectorCode, 'swab_vigilancia', t + r() * stayDays * DAY, makeIsolate(organism, true));
          }
        } else if (r() < 1 - Math.exp((-0.7 / 1000) * stayDays * 1.5)) {
          addCulture(key, sectorCode, 'swab_vigilancia', t + r() * stayDays * DAY, makeIsolate(pick(SURVEILLANCE_ORGANISMS), true));
        }

        if (sectorCode === 'clinica-cirurgica') {
          const total = DEMO_PROCEDURES.reduce((s, p) => s + p.weight, 0);
          let roll = r() * total;
          const proc = DEMO_PROCEDURES.find((p) => (roll -= p.weight) < 0) ?? DEMO_PROCEDURES[0]!;
          const day = localDate(t + 2 * 3_600_000);
          const startedMs = Math.max(t + 1_800_000, at(day, 7 + Math.floor(r() * 11), Math.floor(r() * 60)));
          if (startedMs < nowMs) {
            const durationMin = Math.round(proc.p75Min * (0.6 + r() * 0.7));
            const woundClass: WoundClass = proc.code === 'apendicectomia' && r() < 0.3 ? 'infectada' : proc.woundClass;
            const indicated = woundClass === 'limpa' || woundClass === 'potencialmente_contaminada';
            const drug = indicated ? (r() < 0.06 ? 'vancomicina' : r() < 0.05 ? 'cefuroxima' : 'cefazolina') : null;
            const roll2 = r();
            const minutes = drug === 'vancomicina' ? 60 + Math.round(r() * 55) : roll2 < 0.88 ? 10 + Math.round(r() * 48) : roll2 < 0.95 ? 61 + Math.round(r() * 40) : -Math.round(r() * 10);
            const durationRoll = r();
            const surgeryKey = `cirurgia-${out.surgeries.length + 1}`;
            out.surgeries.push({
              key: surgeryKey, admissionKey: key, procedureCode: proc.code, surgeonKey: pick(SURGEONS).key, room: `Sala ${1 + Math.floor(r() * 6)}`,
              startedAt: iso(startedMs), endedAt: iso(startedMs + durationMin * 60_000), woundClass, asa: 1 + Math.floor(Math.pow(r(), 1.6) * 4), implant: proc.implant, urgency: r() < 0.15,
              prophylaxisIndicated: indicated, drug, doseAt: drug ? iso(startedMs - minutes * 60_000) : null,
              durationH: drug ? (durationRoll < 0.6 ? 0 : durationRoll < 0.91 ? 24 : 48) : null, redose: drug === 'cefazolina' ? durationMin > 240 : null,
            });
            if (woundClass === 'limpa' && r() < 0.012 * 1.4) addCase(adm, 'ISC', startedMs + (5 + r() * 20) * DAY, sectorCode, null, surgeryKey);
          }
        }
        t = (Number.isFinite(bedEnd) ? bedEnd : nowMs) + exp(gapMean) * DAY;
      }
    }
  }
  return out;
}
