import type { CashRequestLine } from './travel-types';
import {
  computeBudgetLineTotal,
  normalizeBudgetLines,
  type TripBudgetLine,
} from './travel-form';

export const CASH_REQUEST_DATA_START_ROW = 17;
export const CASH_REQUEST_DATA_END_ROW = 33;
export const CASH_REQUEST_LINE_COLUMNS = {
  ref: 2,
  description: 4,
  currency: 5,
  amount: 6,
} as const;

export function buildRequestorLine(
  employeeName: string,
  employeeDepartment: string,
  costCenter: string,
  employeeMatricule = '',
): string {
  const name = employeeName.trim();
  const matricule = employeeMatricule.trim();
  const displayName = matricule ? `${name} (${matricule})` : name;
  const department = employeeDepartment.trim();
  const coastCenter = costCenter.trim();
  return `${displayName}        Department : ${department}        Coast center : ${coastCenter}`;
}

export function computeCashRequestTotal(lines: CashRequestLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}

export function normalizeCashRequestLines(lines: CashRequestLine[]): CashRequestLine[] {
  return lines
    .map((line) => ({
      ref: line.ref.trim(),
      description: line.description.trim(),
      currency: line.currency.trim() || 'USD',
      amount: Math.round((Number(line.amount) || 0) * 100) / 100,
    }))
    .filter((line) => line.ref || line.description || line.amount > 0);
}

export function budgetLinesToCashRequestLines(
  budgetLines: TripBudgetLine[],
  peopleCount: number,
  tripDays: number,
): CashRequestLine[] {
  return normalizeBudgetLines(budgetLines).map((line, index) => ({
    ref: String(index + 1),
    description: line.label,
    currency: 'USD',
    amount: computeBudgetLineTotal(line.amount, peopleCount, tripDays) || line.amount,
  }));
}
