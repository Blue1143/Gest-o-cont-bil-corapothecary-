import type { Direction } from './status';

/**
 * A configurable rule parameter. Values come from Administração > Configurações and always carry
 * the reference that justifies them; rule functions receive `undefined` when nothing is configured
 * and must answer "sem regra configurada" instead of inventing a default.
 */
export interface RuleParameter<T> {
  value: T;
  /** Id of the ClinicalReference backing this value. */
  referenceId: string | null;
}

export type TargetOrigin = 'institucional' | 'demonstracao';

/** Institutional target for one indicator. */
export interface IndicatorTarget {
  indicatorId: string;
  value: number;
  direction: Direction;
  /**
   * Optional tolerance (same unit as the indicator) for an intermediate "Atenção" state.
   * Without it, results are only "Conforme" or "Fora da meta".
   */
  warningBand?: number;
  origin: TargetOrigin;
  approvedBy: string | null;
  validFrom: string;
  referenceId: string | null;
}

export interface InstitutionalRules {
  devices: {
    /** Device day (D1 = insertion) from which an event may be classified as device-associated. */
    associationFromDeviceDay?: RuleParameter<number>;
    /** Days after removal during which an event is still attributed to the device. */
    associationGraceDaysAfterRemoval?: RuleParameter<number>;
  };
  admissions: {
    /** Hospital day from which an infection is classified as healthcare-associated. */
    hospitalAcquiredFromDay?: RuleParameter<number>;
    /** Local hour of the daily census: a patient (or device) present at that time counts one day. */
    censusHour?: RuleParameter<number>;
  };
  surgery: {
    /** Maximum minutes between the prophylaxis dose and the incision. */
    prophylaxisWindowMin?: RuleParameter<number>;
    /** Extended window for specific drugs (lowercase drug name → minutes). */
    prophylaxisWindowByDrugMin?: RuleParameter<Record<string, number>>;
    prophylaxisMaxDurationH?: RuleParameter<number>;
    surveillanceDays?: RuleParameter<number>;
    surveillanceDaysWithImplant?: RuleParameter<number>;
  };
  supplies: {
    expiryWarningDays?: RuleParameter<number>;
    defaultMinCoverageDays?: RuleParameter<number>;
  };
  training: {
    expiryWarningDays?: RuleParameter<number>;
  };
  antimicrobials: {
    /** Days of therapy after which a prescription is flagged for review. */
    prolongedTherapyDays?: RuleParameter<number>;
  };
  alerts: {
    /** Open IRAS investigation older than this raises an alert. */
    investigationOverdueDays?: RuleParameter<number>;
    /** Device in place beyond this day raises a review alert. */
    deviceReviewDays?: RuleParameter<number>;
    /** After an alert is closed, the same condition does not reopen it for this long. */
    suppressHours?: RuleParameter<number>;
  };
  cme: {
    /** Days a sterilized package stays usable (institutional, by packaging validation). */
    shelfLifeDays?: RuleParameter<number>;
    /** Hours after the incubation start by which a biological indicator must be read. */
    ibReadingHours?: RuleParameter<number>;
    /** Days before the thermal qualification due date that raise an alert. */
    qualificationWarningDays?: RuleParameter<number>;
  };
}

export interface InstitutionalConfig {
  institutionName: string;
  /** IANA time zone used for every "today" and day count. */
  timezone: string;
  targets: IndicatorTarget[];
  rules: InstitutionalRules;
}

export const emptyRules = (): InstitutionalRules => ({
  devices: {},
  admissions: {},
  surgery: {},
  supplies: {},
  training: {},
  antimicrobials: {},
  alerts: {},
  cme: {},
});

export function findTarget(config: InstitutionalConfig, indicatorId: string): IndicatorTarget | undefined {
  return config.targets.find((t) => t.indicatorId === indicatorId);
}

/** Unwraps a parameter value, keeping `undefined` when it is not configured. */
export const paramValue = <T>(p: RuleParameter<T> | undefined): T | undefined => p?.value;
