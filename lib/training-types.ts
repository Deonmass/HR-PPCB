/** Training cost & dashboard — monthly history + detail postings. */

export type TrainingCostCenterType = 'HQ' | 'Plant' | string;

export interface TrainingCostEntry {
  id: string;
  /** ISO date YYYY-MM-DD */
  postingDate: string;
  amount: number;
  costCenterType: TrainingCostCenterType;
  text: string;
  documentNumber?: string;
  costCenter?: string;
  /** Calendar year of posting */
  year: number;
  /** Calendar month 1–12 */
  month: number;
  importedAt: string;
  sourceFile?: string;
}

/** Aggregated HQ / Plant spend for one calendar month. */
export interface TrainingMonthCost {
  year: number;
  month: number;
  hq: number;
  plant: number;
  /** True when values come from imported detail lines (vs seeded aggregate). */
  fromEntries?: boolean;
  updatedAt?: string;
}

export interface TrainingKpis {
  budgetUsd: number;
  plantBudgetPct: number;
  hqBudgetPct: number;
  hoursYtd: number;
  hoursPlantPct: number;
  hoursHqPct: number;
  avgHoursPerEmployee: number;
  technicalSkillsPct: number;
  softSkillsPct: number;
  safetyTopicsPct: number;
  upcoming: string[];
}

export interface TrainingStoreData {
  kpis: TrainingKpis;
  /** Monthly aggregates — history kept across imports. Key: YYYY-MM */
  monthlyCosts: Record<string, TrainingMonthCost>;
  entries: TrainingCostEntry[];
  updatedAt: string;
}

export interface TrainingDashboardView {
  kpis: TrainingKpis;
  actualSpend: number;
  plantActualPct: number;
  hqActualPct: number;
  topicsCount: number;
  /** Calendar year Jan→Dec for chart + editable table */
  costMonths: Array<{
    key: string;
    label: string;
    year: number;
    month: number;
    hq: number;
    plant: number;
    total: number;
    isCurrent?: boolean;
  }>;
  /** Year used for the Jan–Dec grid */
  viewYear: number;
  /** Optional month filter (1–12) applied to covered list */
  viewMonth: number | null;
  covered: string[];
  upcoming: string[];
  entries: TrainingCostEntry[];
  updatedAt: string;
}

export const DEFAULT_TRAINING_KPIS: TrainingKpis = {
  budgetUsd: 507_500,
  plantBudgetPct: 65,
  hqBudgetPct: 35,
  hoursYtd: 1_728,
  hoursPlantPct: 50,
  hoursHqPct: 50,
  avgHoursPerEmployee: 10,
  technicalSkillsPct: 0,
  softSkillsPct: 67,
  safetyTopicsPct: 33,
  upcoming: ['AI', 'Retirement preparation'],
};

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabelEn(month: number): string {
  const labels = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return labels[Math.max(1, Math.min(12, month)) - 1] || String(month);
}

export function monthLabelShortEn(month: number): string {
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return labels[Math.max(1, Math.min(12, month)) - 1] || String(month);
}

/** Calendar year Jan→Dec (Training dashboard). */
export function calendarYearMonths(year: number): Array<{ year: number; month: number }> {
  return Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }));
}

/** PPC FY display order: Apr … Dec, then Jan … Mar of next calendar year. */
export function fyMonthSequence(reportYear: number, reportMonth: number): Array<{ year: number; month: number }> {
  // FY starts in April of reportYear if reportMonth >= 4, else April of reportYear-1
  const fyStartYear = reportMonth >= 4 ? reportYear : reportYear - 1;
  const seq: Array<{ year: number; month: number }> = [];
  for (let m = 4; m <= 12; m++) seq.push({ year: fyStartYear, month: m });
  for (let m = 1; m <= 3; m++) seq.push({ year: fyStartYear + 1, month: m });
  return seq;
}
