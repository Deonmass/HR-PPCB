/** Colonnes feuille `weeks` de Excel/overtimes/OVERTIMES_DATA.xlsx (0-based). */
export const OVERTIMES_DATA_SHEET = 'weeks';
export const OVERTIMES_PLANNING_SHEET = 'planning';
export const OVERTIMES_META_SHEET = 'meta';
export const OVERTIMES_DATA_START = 1; // ligne 0 = en-têtes

export const OT_COL = {
  year: 0,
  month: 1,
  department: 2,
  weekIndex: 3,
  weekFromTo: 4,
  locked: 5,
  updatedAt: 6,
  updatedBy: 7,
  confirmedAt: 8,
  confirmedBy: 9,
  closedAt: 10,
  closedBy: 11,
  /** @deprecated legacy — still read for migration; prefer confirmedAt/closedAt */
  lockedAt: 12,
  lockedBy: 13,
  entries: 14,
} as const;

export const OT_LAST_COL = OT_COL.entries;

export const OT_HEADERS = [
  'year',
  'month',
  'department',
  'weekIndex',
  'weekFromTo',
  'locked',
  'updatedAt',
  'updatedBy',
  'confirmedAt',
  'confirmedBy',
  'closedAt',
  'closedBy',
  'lockedAt',
  'lockedBy',
  'entries',
] as const;

/** Feuille planning timesheet — 1 ligne = 1 jour (dateKey). */
export const PLAN_COL = {
  year: 0,
  month: 1,
  dateKey: 2,
  weekday: 3,
  updatedAt: 4,
  updatedBy: 5,
  entries: 6,
} as const;

export const PLAN_LAST_COL = PLAN_COL.entries;

export const PLAN_HEADERS = [
  'year',
  'month',
  'dateKey',
  'weekday',
  'updatedAt',
  'updatedBy',
  'entries',
] as const;

export const OVERTIMES_DATA_SCHEMA_VERSION = 3;

export const OT_WEEK_COLS_WIDTHS = [
  { wch: 6 },
  { wch: 6 },
  { wch: 18 },
  { wch: 10 },
  { wch: 28 },
  { wch: 8 },
  { wch: 22 },
  { wch: 14 },
  { wch: 22 },
  { wch: 14 },
  { wch: 22 },
  { wch: 14 },
  { wch: 22 },
  { wch: 14 },
  { wch: 80 },
];

export const PLAN_COLS_WIDTHS = [
  { wch: 6 },
  { wch: 6 },
  { wch: 12 },
  { wch: 10 },
  { wch: 22 },
  { wch: 14 },
  { wch: 100 },
];
