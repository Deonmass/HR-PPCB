export interface CompilationWeek {
  index: number;
  label: string;
  range: string;
}

export interface CompilationRowWeek {
  ot13: number;
  ot16: number;
  ot2: number;
  night: number;
}

export interface CompilationRow {
  matricule: string;
  nom: string;
  departement: string;
  localisation: string;
  grade: string;
  weeks: CompilationRowWeek[];
  /** Night hours from normal (timesheet) hours — column Z of the OVERTIMES template. */
  nightNormal: number;
}

export interface CompilationTotals {
  ot13: number;
  ot16: number;
  ot2: number;
  night: number;
}

export interface CompilationData {
  year: number;
  month: number;
  department: string;
  weeks: CompilationWeek[];
  rows: CompilationRow[];
  /** True when every week of the period is locked (month closed / editions frozen). */
  closed: boolean;
}

export function sumCompilationRow(row: CompilationRow): CompilationTotals {
  return row.weeks.reduce(
    (acc, week) => ({
      ot13: acc.ot13 + week.ot13,
      ot16: acc.ot16 + week.ot16,
      ot2: acc.ot2 + week.ot2,
      night: acc.night + week.night,
    }),
    { ot13: 0, ot16: 0, ot2: 0, night: 0 },
  );
}

/** Total OT hors N (1.3 + 1.6 + 2). */
export function compilationOtOnlyTotal(totals: CompilationTotals): number {
  return roundCompilationHours(totals.ot13 + totals.ot16 + totals.ot2);
}

export function roundCompilationHours(value: number): number {
  return Math.round(value * 100) / 100;
}
