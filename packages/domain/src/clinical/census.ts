import { addDays, dateInZone, type IsoDate } from '../dates';
import type { DeviceType } from '../iras';

/**
 * Daily census: real denominators (patient-days, device-days) from stays and device uses. A patient
 * counts one day for the sector where they are at the institution's census hour; a device counts
 * one day when it is in place at that same instant.
 */

/** Offset (ms) of `timeZone` at `instant` (local wall clock − UTC). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Instant of local `date` at `hour`:`minute` in `timeZone`. */
export function zonedInstant(date: IsoDate, hour: number, timeZone: string, minute = 0): Date {
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return new Date(second);
}

/** "HH:mm" of `instant` in `timeZone`. */
export function timeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
}

/** Value for <input type="datetime-local"> showing `iso` in the institution zone. */
export function toLocalInput(iso: string | Date, timeZone: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${dateInZone(d, timeZone)}T${timeInZone(d, timeZone)}`;
}

/** Inverse of toLocalInput: the wall-clock value is read in the institution zone (not the browser's). */
export function fromLocalInput(value: string, timeZone: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  return m ? zonedInstant(m[1]!, Number(m[2]), timeZone, Number(m[3])).toISOString() : null;
}

export interface CensusStay {
  sectorId: string;
  /** ISO instants; `end` null while the patient is still there. */
  start: string;
  end: string | null;
}

export interface CensusDevice {
  type: DeviceType;
  insertedAt: string;
  removedAt: string | null;
}

export interface CensusAdmission {
  id: string;
  stays: CensusStay[];
  devices: CensusDevice[];
}

export interface CensusCounts {
  pacientes: number;
  /** Central lines (CVC + PICC), the denominator of the IPCS density. */
  cvc: number;
  vm: number;
  svd: number;
  byDevice: Partial<Record<DeviceType, number>>;
}

export const emptyCensus = (): CensusCounts => ({ pacientes: 0, cvc: 0, vm: 0, svd: 0, byDevice: {} });

const within = (t: number, start: string, end: string | null) => Date.parse(start) <= t && (end == null || t < Date.parse(end));

/** Census of one day: counts per sector at the census instant. */
export function censusOfDay(admissions: CensusAdmission[], date: IsoDate, hour: number, timeZone: string): Map<string, CensusCounts> {
  const t = zonedInstant(date, hour, timeZone).getTime();
  const out = new Map<string, CensusCounts>();
  for (const a of admissions) {
    const stay = a.stays.find((s) => within(t, s.start, s.end));
    if (!stay) continue;
    let c = out.get(stay.sectorId);
    if (!c) out.set(stay.sectorId, (c = emptyCensus()));
    c.pacientes++;
    for (const d of a.devices) {
      if (!within(t, d.insertedAt, d.removedAt)) continue;
      c.byDevice[d.type] = (c.byDevice[d.type] ?? 0) + 1;
      if (d.type === 'CVC' || d.type === 'PICC') c.cvc++;
      else if (d.type === 'VM') c.vm++;
      else if (d.type === 'SVD') c.svd++;
    }
  }
  return out;
}

/** Sum of daily censuses from `from` to `to` (inclusive) per sector. */
export function censusOfRange(admissions: CensusAdmission[], from: IsoDate, to: IsoDate, hour: number, timeZone: string): Map<string, CensusCounts> {
  const total = new Map<string, CensusCounts>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const [sector, c] of censusOfDay(admissions, d, hour, timeZone)) {
      let acc = total.get(sector);
      if (!acc) total.set(sector, (acc = emptyCensus()));
      acc.pacientes += c.pacientes;
      acc.cvc += c.cvc;
      acc.vm += c.vm;
      acc.svd += c.svd;
      for (const [k, v] of Object.entries(c.byDevice) as Array<[DeviceType, number]>) acc.byDevice[k] = (acc.byDevice[k] ?? 0) + v;
    }
  }
  return total;
}
