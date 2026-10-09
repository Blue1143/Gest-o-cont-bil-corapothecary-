import { dayDiff, type IsoDate } from '../dates';

export interface DeviceUse {
  insertedOn: IsoDate;
  removedOn?: IsoDate | null;
}

/** Device day on `refDate` (D1 = insertion day); null when the device was not in place that day. */
export function deviceDay(device: DeviceUse, refDate: IsoDate): number | null {
  if (refDate < device.insertedOn) return null;
  if (device.removedOn && device.removedOn < refDate) return null;
  return dayDiff(device.insertedOn, refDate) + 1;
}

/** Device-days of a use (inclusive), counting until `refDate` while still in place. */
export function deviceDaysTotal(device: DeviceUse, refDate: IsoDate): number {
  const end = device.removedOn && device.removedOn < refDate ? device.removedOn : refDate;
  return end < device.insertedOn ? 0 : dayDiff(device.insertedOn, end) + 1;
}

export interface DeviceAssociationRule {
  /** Device day (D1 = insertion) from which an event may be device-associated. */
  fromDeviceDay: number | undefined;
  /** Days after removal during which an event is still attributed to the device. */
  graceDaysAfterRemoval: number | undefined;
}

export type DeviceAssociation = 'elegivel' | 'nao_elegivel' | 'sem_regra';

/**
 * Whether an event on `eventDate` may be classified as associated with `device`, using only the
 * institution's configured parameters. Missing parameters → 'sem_regra' (no classification).
 */
export function deviceAssociation(device: DeviceUse, eventDate: IsoDate, rule: DeviceAssociationRule): DeviceAssociation {
  if (rule.fromDeviceDay == null || rule.graceDaysAfterRemoval == null) return 'sem_regra';
  if (eventDate < device.insertedOn) return 'nao_elegivel';
  if (device.removedOn && dayDiff(device.removedOn, eventDate) > rule.graceDaysAfterRemoval) return 'nao_elegivel';
  const lastDay = device.removedOn && device.removedOn < eventDate ? device.removedOn : eventDate;
  const daysInPlace = dayDiff(device.insertedOn, lastDay) + 1;
  return daysInPlace >= rule.fromDeviceDay ? 'elegivel' : 'nao_elegivel';
}
