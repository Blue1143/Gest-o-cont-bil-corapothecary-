import { dayDiff, type IsoDate } from '../dates';
import type { InstitutionalRules } from '../config';
import { IRAS_TYPES, type DeviceType, type InvestigationStatus, type IrasType } from '../iras';
import type { Permission } from '../permissions';
import { deviceAssociation, deviceDay, type DeviceAssociation } from '../rules/devices';

/**
 * IRAS surveillance workflow. The system supports the decision (eligibility by the configured
 * parameters, required fields) but never confirms or discards a case by itself.
 */
export const IRAS_TRANSITIONS: Record<InvestigationStatus, InvestigationStatus[]> = {
  suspeita: ['em_investigacao', 'descartada'],
  em_investigacao: ['confirmada', 'descartada'],
  confirmada: ['em_investigacao'],
  descartada: ['em_investigacao'],
};

export const TRANSITION_LABEL: Record<InvestigationStatus, string> = {
  suspeita: 'Registrar suspeita',
  em_investigacao: 'Iniciar investigação',
  confirmada: 'Confirmar IRAS',
  descartada: 'Descartar',
};

export const isOpenStatus = (s: InvestigationStatus): boolean => s === 'suspeita' || s === 'em_investigacao';

/** Concluding a case, or reopening a concluded one, is a CCIH decision. */
export function transitionPermission(from: InvestigationStatus, to: InvestigationStatus): Permission {
  return to === 'confirmada' || to === 'descartada' || !isOpenStatus(from) ? 'iras:decide' : 'iras:edit';
}

export const DEVICE_ASSOCIATED_TYPES: IrasType[] = ['IPCS', 'PAV', 'ITU-AC'];

export interface TransitionInput {
  type: IrasType;
  justification: string;
  /** Diagnostic criterion (clinical reference) applied; required to confirm. */
  criterionReferenceId?: string | null;
  /** Decided by the CCIH for device-associated types; required to confirm them. */
  deviceAssociated?: boolean | null;
  deviceUseId?: string | null;
  surgeryId?: string | null;
}

/** pt-BR problems that block the transition (empty = allowed). */
export function checkTransition(from: InvestigationStatus, to: InvestigationStatus, input: TransitionInput): Array<{ path: string; message: string }> {
  const problems: Array<{ path: string; message: string }> = [];
  if (!IRAS_TRANSITIONS[from].includes(to)) problems.push({ path: 'status', message: `Transição não permitida: ${from} → ${to}.` });
  if (input.justification.trim().length < 10) problems.push({ path: 'justification', message: 'Descreva o motivo (mínimo 10 caracteres).' });
  if (to === 'confirmada') {
    if (!input.criterionReferenceId) problems.push({ path: 'criterionReferenceId', message: 'Informe o critério diagnóstico aplicado.' });
    if (DEVICE_ASSOCIATED_TYPES.includes(input.type)) {
      if (input.deviceAssociated == null) problems.push({ path: 'deviceAssociated', message: 'Informe se a IRAS é associada ao dispositivo.' });
      else if (input.deviceAssociated && !input.deviceUseId) problems.push({ path: 'deviceUseId', message: 'Vincule o dispositivo associado.' });
    }
    if (input.type === 'ISC' && !input.surgeryId) problems.push({ path: 'surgeryId', message: 'Vincule a cirurgia da ISC.' });
  }
  return problems;
}

export interface IrasContextInput {
  type: IrasType;
  admittedOn: IsoDate;
  eventDate: IsoDate;
  devices: Array<{ id: string; type: DeviceType; insertedOn: IsoDate; removedOn: IsoDate | null }>;
  rules: InstitutionalRules;
}

export interface IrasContext {
  hospitalDay: number;
  /** 'elegivel' when the event day reaches the configured hospital day; 'sem_regra' when not configured. */
  healthcareAssociated: 'elegivel' | 'nao_elegivel' | 'sem_regra';
  hospitalAcquiredFromDay: number | null;
  devices: Array<{ id: string; type: DeviceType; deviceDayOnEvent: number | null; association: DeviceAssociation; relevant: boolean }>;
}

/** Decision support shown next to the case: everything comes from the institution's parameters. */
export function irasContext(input: IrasContextInput): IrasContext {
  const day = dayDiff(input.admittedOn, input.eventDate) + 1;
  const from = input.rules.admissions.hospitalAcquiredFromDay?.value;
  const rule = { fromDeviceDay: input.rules.devices.associationFromDeviceDay?.value, graceDaysAfterRemoval: input.rules.devices.associationGraceDaysAfterRemoval?.value };
  const relevantTypes = IRAS_TYPES[input.type].devices;
  return {
    hospitalDay: day,
    healthcareAssociated: from == null ? 'sem_regra' : day >= from ? 'elegivel' : 'nao_elegivel',
    hospitalAcquiredFromDay: from ?? null,
    devices: input.devices.map((d) => {
      const use = { insertedOn: d.insertedOn, removedOn: d.removedOn };
      return { id: d.id, type: d.type, deviceDayOnEvent: deviceDay(use, input.eventDate), association: deviceAssociation(use, input.eventDate, rule), relevant: relevantTypes.includes(d.type) };
    }),
  };
}

export const ASSOCIATION_LABEL: Record<DeviceAssociation, string> = {
  elegivel: 'Elegível pelos parâmetros configurados',
  nao_elegivel: 'Não elegível pelos parâmetros configurados',
  sem_regra: 'Sem regra configurada',
};
