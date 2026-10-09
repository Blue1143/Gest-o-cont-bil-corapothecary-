import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dayDiff, monthLabel, todayIn, toCalendarDate } from './dates';
import { formatDate, formatNumber, formatSigned } from './format';

describe('dates', () => {
  it('resolves "today" in the institution zone, not UTC (audit M-01)', () => {
    // 22:30 in Brasília on 09/10 is already 10/10 in UTC.
    const instant = new Date('2026-10-10T01:30:00Z');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-10-09');
    expect(todayIn('UTC', instant)).toBe('2026-10-10');
  });

  it('counts calendar days across month and DST-free boundaries', () => {
    expect(dayDiff('2026-09-28', '2026-10-09')).toBe(11);
    expect(dayDiff('2026-10-09', '2026-10-09')).toBe(0);
    expect(addDays('2026-10-02', 90)).toBe('2026-12-31');
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01');
  });

  it('takes the calendar date of offset timestamps in the given zone', () => {
    expect(toCalendarDate('2026-10-10T01:30:00Z', 'America/Sao_Paulo')).toBe('2026-10-09');
    expect(toCalendarDate('2026-10-09T08:12', 'America/Sao_Paulo')).toBe('2026-10-09');
  });

  it('labels months in pt-BR', () => {
    expect(monthLabel('2026-10-01')).toBe('out/26');
  });
});

describe('format', () => {
  it('formats numbers in pt-BR and never shows 0 for missing values', () => {
    expect(formatNumber(1248)).toBe('1.248');
    expect(formatNumber(2.45, 1)).toBe('2,5');
    expect(formatNumber(null)).toBe('—');
    expect(formatSigned(0.6, 1)).toBe('+0,6');
  });

  it('formats dates as dd/mm/aaaa', () => {
    expect(formatDate('2026-10-09')).toBe('09/10/2026');
    expect(formatDate('2026-10-09T08:12')).toBe('09/10/2026 08:12');
    expect(formatDate('2026-10-10T01:30:00Z', 'America/Sao_Paulo')).toBe('09/10/2026 22:30');
    expect(formatDate('não é data')).toBe('—');
  });
});

describe('signed deltas', () => {
  it('never shows a negative zero', () => {
    expect(formatSigned(-0.03, 1)).toBe('0,0');
    expect(formatSigned(-0.06, 1)).toBe('-0,1');
  });
});
