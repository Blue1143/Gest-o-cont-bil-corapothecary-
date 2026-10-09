import { dayDiff, type IsoDate } from '../dates';

/**
 * Patient identification (LGPD): screens show initials + record number by default. The full name
 * is optional, stored encrypted by the API and revealed only with a specific permission.
 */
export type Sex = 'F' | 'M' | 'NI';

export const SEX_LABEL: Record<Sex, string> = { F: 'Feminino', M: 'Masculino', NI: 'Não informado' };

/** "j. da silva" → "JDS"; accents and non-letters removed. Null when nothing usable remains. */
export function normalizeInitials(value: string): string | null {
  const letters = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return letters.length >= 1 && letters.length <= 6 ? letters : null;
}

/** Initials derived from a full name ("Maria das Dores Lima" → "MDL"), connectives ignored. */
export function initialsFromName(name: string): string | null {
  const skip = new Set(['DA', 'DAS', 'DE', 'DO', 'DOS', 'E']);
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w && !skip.has(w));
  return normalizeInitials(words.map((w) => w[0]).join('').slice(0, 6));
}

export const RECORD_NUMBER_RE = /^[A-Za-z0-9./-]{1,30}$/;

/** Completed years on `today`; null without a birth date. */
export function ageYears(birthDate: IsoDate | null | undefined, today: IsoDate): number | null {
  if (!birthDate) return null;
  let years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (today.slice(5) < birthDate.slice(5)) years--;
  return years < 0 ? null : years;
}

/** Age for display: days for newborns, months under 2 years, years after that. */
export function ageLabel(birthDate: IsoDate | null | undefined, today: IsoDate): string {
  if (!birthDate) return 'Idade não informada';
  const days = dayDiff(birthDate, today);
  if (days < 0) return 'Idade não informada';
  if (days < 31) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  const years = ageYears(birthDate, today) ?? 0;
  if (years < 2) {
    const months = (Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(birthDate.slice(5, 7)) - (today.slice(8) < birthDate.slice(8) ? 1 : 0);
    return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  }
  return `${years} anos`;
}

/** Hospital day on `refDate` with D1 = admission day. */
export const hospitalDay = (admittedOn: IsoDate, refDate: IsoDate): number => dayDiff(admittedOn, refDate) + 1;

export type DischargeOutcome = 'alta' | 'obito' | 'transferencia_externa';

export const OUTCOME_LABEL: Record<DischargeOutcome, string> = { alta: 'Alta', obito: 'Óbito', transferencia_externa: 'Transferência externa' };

export type NoteKind = 'avaliacao' | 'conduta' | 'recomendacao' | 'acompanhamento' | 'retificacao';

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  avaliacao: 'Avaliação', conduta: 'Conduta', recomendacao: 'Recomendação', acompanhamento: 'Acompanhamento', retificacao: 'Retificação',
};
