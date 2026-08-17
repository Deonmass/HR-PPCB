import type { TimesheetHourBreakdown, TimesheetShiftType } from './timesheet-types';

export type { TimesheetHourBreakdown, TimesheetShiftType };

const MIN = 60;
const GENERAL_START = 7 * MIN;
const GENERAL_END = 16 * MIN + 30;
const S1_START = 6 * MIN;
const S1_END = 14 * MIN;
const S2_START = 14 * MIN;
const S2_END = 22 * MIN;
const S3_NIGHT_END = 5 * MIN;
const S3_SHIFT_END = 6 * MIN;
const NIGHT_S2_START = 19 * MIN;
const NIGHT_S2_END = 22 * MIN;
const NIGHT_S3_START = 22 * MIN;
const NIGHT_LAW_END = 5 * MIN;

type MinuteInterval = { start: number; end: number };

function parseTimePart(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})[:h.](\d{2})$/i);
  if (match) {
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * MIN + minutes;
  }

  const decimal = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(decimal)) return null;
  if (decimal >= 0 && decimal < 1) return Math.round(decimal * 24 * MIN);
  if (decimal >= 0 && decimal <= 24) return Math.round(decimal * MIN);
  return null;
}

export function parseTimeToMinutes(value: string): number | null {
  return parseTimePart(value);
}

function splitWorkIntervals(start: number, end: number): MinuteInterval[] {
  if (end > start) return [{ start, end }];
  const parts: MinuteInterval[] = [];
  if (start < 24 * MIN) parts.push({ start, end: 24 * MIN });
  if (end > 0) parts.push({ start: 0, end });
  return parts;
}

/** Overnight windows as [start, 24h) ∪ [0, end). Empty / equal bounds yield no parts. */
function overnightWindowParts(windowStart: number, windowEnd: number): MinuteInterval[] {
  if (windowEnd > windowStart) return [{ start: windowStart, end: windowEnd }];
  if (windowEnd === windowStart) return [];
  const parts: MinuteInterval[] = [];
  if (windowStart < 24 * MIN) parts.push({ start: windowStart, end: 24 * MIN });
  if (windowEnd > 0) parts.push({ start: 0, end: windowEnd });
  return parts;
}

function sumOverlap(intervals: MinuteInterval[], windowStart: number, windowEnd: number): number {
  if (windowEnd <= windowStart) {
    return overnightWindowParts(windowStart, windowEnd).reduce(
      (total, part) => total + sumOverlap(intervals, part.start, part.end),
      0,
    );
  }

  let total = 0;
  for (const interval of intervals) {
    const start = Math.max(interval.start, windowStart);
    const end = Math.min(interval.end, windowEnd);
    if (end > start) total += end - start;
  }
  return total;
}

function totalMinutes(intervals: MinuteInterval[]): number {
  return intervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
}

function subtractWindow(intervals: MinuteInterval[], windowStart: number, windowEnd: number): MinuteInterval[] {
  const result: MinuteInterval[] = [];

  for (const interval of intervals) {
    if (windowEnd <= windowStart) {
      let remaining = [interval];
      for (const part of overnightWindowParts(windowStart, windowEnd)) {
        remaining = subtractWindow(remaining, part.start, part.end);
      }
      result.push(...remaining);
      continue;
    }

    if (interval.end <= windowStart || interval.start >= windowEnd) {
      result.push(interval);
      continue;
    }

    if (interval.start < windowStart) {
      result.push({ start: interval.start, end: windowStart });
    }
    if (interval.end > windowEnd) {
      result.push({ start: windowEnd, end: interval.end });
    }
  }

  return result.filter((interval) => interval.end > interval.start);
}

function nightOnIntervals(intervals: MinuteInterval[]): number {
  return (
    sumOverlap(intervals, NIGHT_S2_START, 24 * MIN) +
    sumOverlap(intervals, 0, NIGHT_LAW_END)
  );
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / MIN) * 100) / 100;
}

/** Legal night window: 19:00–05:00. */
export function legalNightHours(from: string, to: string): number {
  const start = parseTimeToMinutes(from);
  const end = parseTimeToMinutes(to);
  if (start === null || end === null || start === end) return 0;
  return minutesToHours(nightOnIntervals(splitWorkIntervals(start, end)));
}

/** Overlap in hours between two time ranges (supports overnight). */
export function overlapHours(
  fromA: string,
  toA: string,
  fromB: string,
  toB: string,
): number {
  const aStart = parseTimeToMinutes(fromA);
  const aEnd = parseTimeToMinutes(toA);
  const bStart = parseTimeToMinutes(fromB);
  const bEnd = parseTimeToMinutes(toB);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return 0;
  if (aStart === aEnd || bStart === bEnd) return 0;
  const a = splitWorkIntervals(aStart, aEnd);
  const b = splitWorkIntervals(bStart, bEnd);
  let total = 0;
  for (const interval of a) {
    if (interval.end <= interval.start) continue;
    total += sumOverlap(b, interval.start, interval.end);
  }
  return minutesToHours(total);
}

function emptyBreakdown(): TimesheetHourBreakdown {
  return { ordinary: 0, shift1: 0, shift2: 0, shift3: 0, night: 0 };
}

function calcGeneral(work: MinuteInterval[], ctx?: ShiftScheduleContext): TimesheetHourBreakdown {
  const { start, end } = generalShiftInterval(ctx);
  const outside = subtractWindow(work, start, end);
  const night = nightOnIntervals(outside);
  const ordinary = Math.max(0, totalMinutes(outside) - night);
  return { ordinary: minutesToHours(ordinary), shift1: 0, shift2: 0, shift3: 0, night: minutesToHours(night) };
}

function calcShift1(work: MinuteInterval[]): TimesheetHourBreakdown {
  const outside = subtractWindow(work, S1_START, S1_END);
  const night = nightOnIntervals(outside);
  const shift1 = Math.max(0, totalMinutes(outside) - night);
  return { ordinary: 0, shift1: minutesToHours(shift1), shift2: 0, shift3: 0, night: minutesToHours(night) };
}

function calcShift2(work: MinuteInterval[]): TimesheetHourBreakdown {
  const night = sumOverlap(work, NIGHT_S2_START, NIGHT_S2_END);
  const outside = subtractWindow(work, S2_START, S2_END);
  const shift2 = totalMinutes(outside);
  return { ordinary: 0, shift1: 0, shift2: minutesToHours(shift2), shift3: 0, night: minutesToHours(night) };
}

function calcShift3(work: MinuteInterval[]): TimesheetHourBreakdown {
  const night =
    sumOverlap(work, NIGHT_S3_START, 24 * MIN) + sumOverlap(work, 0, S3_NIGHT_END);

  let beforeShift = 0;
  let afterShift = 0;
  for (const interval of work) {
    if (interval.start >= 12 * MIN && interval.start < NIGHT_S3_START) {
      beforeShift += Math.min(interval.end, NIGHT_S3_START) - interval.start;
    }
    if (interval.end > S3_SHIFT_END && interval.start < S3_SHIFT_END) {
      afterShift += interval.end - S3_SHIFT_END;
    }
  }

  return {
    ordinary: 0,
    shift1: 0,
    shift2: 0,
    shift3: minutesToHours(beforeShift + afterShift),
    night: minutesToHours(night),
  };
}

function calcOff(work: MinuteInterval[]): TimesheetHourBreakdown {
  const total = totalMinutes(work);
  const nightMinutes =
    sumOverlap(work, NIGHT_S2_START, 24 * MIN) + sumOverlap(work, 0, NIGHT_LAW_END);
  const ordinaryMinutes = Math.max(0, total - nightMinutes);
  return {
    ordinary: minutesToHours(ordinaryMinutes),
    shift1: 0,
    shift2: 0,
    shift3: 0,
    night: minutesToHours(nightMinutes),
  };
}

export function calculateTimesheetHours(
  from: string,
  to: string,
  shiftType: TimesheetShiftType | null,
  ctx?: ShiftScheduleContext,
): TimesheetHourBreakdown {
  if (!shiftType) return emptyBreakdown();

  const start = parseTimeToMinutes(from);
  const end = parseTimeToMinutes(to);
  if (start === null || end === null || start === end) return emptyBreakdown();

  const work = splitWorkIntervals(start, end);

  switch (shiftType) {
    case 'general':
      return calcGeneral(work, ctx);
    case 'shift1':
      return calcShift1(work);
    case 'shift2':
      return calcShift2(work);
    case 'shift3':
      return calcShift3(work);
    case 'off':
      return calcOff(work);
    default:
      return emptyBreakdown();
  }
}

const SHIFT_STANDARD_TIMES: Record<Exclude<TimesheetShiftType, 'off'>, MinuteInterval> = {
  general: { start: GENERAL_START, end: GENERAL_END },
  shift1: { start: S1_START, end: S1_END },
  shift2: { start: S2_START, end: S2_END },
  shift3: { start: NIGHT_S3_START, end: S3_SHIFT_END },
};

/** Context used to resolve schedules that depend on the day and the employee localisation. */
export interface ShiftScheduleContext {
  date?: Date | string | null;
  localisation?: string | null;
}

function isFriday(date?: Date | string | null): boolean {
  if (!date) return false;
  const parsed = date instanceof Date ? date : new Date(date);
  return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 5;
}

export function isZambaLocalisation(localisation?: string | null): boolean {
  return (localisation ?? '').trim().toLowerCase() === 'zamba';
}

/**
 * General-shift schedule. On Fridays it is shortened per the collective agreement:
 * Zamba employees work 07h00–13h30, employees of other localisations 08h00–17h30.
 * Every other day keeps the standard 07h00–16h30 schedule.
 */
export function generalShiftInterval(ctx?: ShiftScheduleContext): MinuteInterval {
  if (isFriday(ctx?.date)) {
    return isZambaLocalisation(ctx?.localisation)
      ? { start: 7 * MIN, end: 13 * MIN + 30 }
      : { start: 8 * MIN, end: 17 * MIN + 30 };
  }
  return { start: GENERAL_START, end: GENERAL_END };
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / MIN);
  const m = minutes % MIN;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** General-shift schedule as "HH:MM" strings (used for planning defaults and exports). */
export function generalShiftTimes(ctx?: ShiftScheduleContext): { from: string; to: string } {
  const interval = generalShiftInterval(ctx);
  return { from: formatMinutes(interval.start), to: formatMinutes(interval.end) };
}

/**
 * Normal-hours breakdown for a worked interval. The whole worked duration is placed
 * in the shift's category column (Ordinary / Shift 1 / Shift 2 / Shift 3) and the
 * legal night portion is reported additionally in the Night column.
 */
function breakdownFromWork(
  work: MinuteInterval[],
  shiftType: Exclude<TimesheetShiftType, 'off'>,
): TimesheetHourBreakdown {
  const duration = minutesToHours(totalMinutes(work));

  let nightMinutes: number;
  if (shiftType === 'shift2') {
    nightMinutes = sumOverlap(work, NIGHT_S2_START, NIGHT_S2_END);
  } else if (shiftType === 'shift3') {
    nightMinutes = sumOverlap(work, NIGHT_S3_START, 24 * MIN) + sumOverlap(work, 0, NIGHT_LAW_END);
  } else {
    nightMinutes = nightOnIntervals(work);
  }
  const night = minutesToHours(nightMinutes);

  switch (shiftType) {
    case 'general':
      return { ordinary: duration, shift1: 0, shift2: 0, shift3: 0, night };
    case 'shift1':
      return { ordinary: 0, shift1: duration, shift2: 0, shift3: 0, night };
    case 'shift2':
      return { ordinary: 0, shift1: 0, shift2: duration, shift3: 0, night };
    case 'shift3':
      return { ordinary: 0, shift1: 0, shift2: 0, shift3: duration, night };
  }
}

/** Normal-hours breakdown from actual worked times (or standard schedule) for a shift. */
export function normalHoursBreakdown(
  from: string,
  to: string,
  shiftType: TimesheetShiftType | null,
): TimesheetHourBreakdown {
  if (!shiftType || shiftType === 'off') return emptyBreakdown();
  const start = parseTimeToMinutes(from);
  const end = parseTimeToMinutes(to);
  if (start === null || end === null || start === end) return emptyBreakdown();
  return breakdownFromWork(splitWorkIntervals(start, end), shiftType);
}

/** Normal-hours breakdown for a planned shift using its standard schedule. */
export function standardShiftBreakdown(
  shiftType: TimesheetShiftType | null,
  ctx?: ShiftScheduleContext,
): TimesheetHourBreakdown {
  if (!shiftType || shiftType === 'off') return emptyBreakdown();
  const times = shiftType === 'general' ? generalShiftInterval(ctx) : SHIFT_STANDARD_TIMES[shiftType];
  return breakdownFromWork(splitWorkIntervals(times.start, times.end), shiftType);
}

export function formatHoursValue(value: number): string {
  if (!value) return '';
  return value.toFixed(2);
}

/** Duration in hours between two HH:MM times (supports overnight). */
export function workedHoursBetween(from: string, to: string): number {
  const start = parseTimeToMinutes(from);
  const end = parseTimeToMinutes(to);
  if (start === null || end === null || start === end) return 0;
  const minutes = end > start ? end - start : 24 * MIN - start + end;
  return minutesToHours(minutes);
}

/** Daily OT split: first 2h at 1.3, remainder at 1.6. */
export function splitDailyOvertime(otHours: number): { ot13: number; ot16: number } {
  const total = Math.max(0, Math.round(otHours * 100) / 100);
  const ot13 = Math.min(total, 2);
  const ot16 = Math.round((total - ot13) * 100) / 100;
  return { ot13: Math.round(ot13 * 100) / 100, ot16 };
}

export function rowTotalHours(row: Pick<TimesheetHourBreakdown, 'ordinary' | 'shift1' | 'shift2' | 'shift3' | 'night'>): number {
  return Math.round((row.ordinary + row.shift1 + row.shift2 + row.shift3 + row.night) * 100) / 100;
}

export interface TimesheetPeriodTotals extends TimesheetHourBreakdown {
  grandTotal: number;
}

export function computePeriodOvertimeTotals(
  rows: Pick<TimesheetHourBreakdown, 'ordinary' | 'shift1' | 'shift2' | 'shift3' | 'night'>[],
): TimesheetPeriodTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      ordinary: acc.ordinary + row.ordinary,
      shift1: acc.shift1 + row.shift1,
      shift2: acc.shift2 + row.shift2,
      shift3: acc.shift3 + row.shift3,
      night: acc.night + row.night,
    }),
    { ordinary: 0, shift1: 0, shift2: 0, shift3: 0, night: 0 },
  );

  return {
    ordinary: Math.round(totals.ordinary * 100) / 100,
    shift1: Math.round(totals.shift1 * 100) / 100,
    shift2: Math.round(totals.shift2 * 100) / 100,
    shift3: Math.round(totals.shift3 * 100) / 100,
    night: Math.round(totals.night * 100) / 100,
    grandTotal: rowTotalHours(totals),
  };
}

export function recalculateRow<T extends { from: string; to: string; shiftType: TimesheetShiftType | null }>(
  row: T,
  ctx?: ShiftScheduleContext,
): T & TimesheetHourBreakdown {
  const calc = calculateTimesheetHours(row.from, row.to, row.shiftType, ctx);
  return { ...row, ...calc };
}
