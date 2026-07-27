import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import XlsxPopulate from 'xlsx-populate';
import {
  computeBudgetLineTotal,
  computeTripDays,
  type TripBudgetLine,
} from './travel-form';
import { formatDisplayDate, clearCellValue, setCellValue } from './xlsx-populate-utils';
import { TRIP_BUDGET_TEMPLATE_PATH } from './travel-template-paths';

export { TRIP_BUDGET_TEMPLATE_PATH };

export const TRIP_BUDGET_SHEET = 'Budget form';
export const TRIP_BUDGET_DATA_START_ROW = 15;
export const TRIP_BUDGET_DATA_END_ROW = 24;

export interface TripBudgetFillInput {
  employeeName: string;
  employeeMatricule: string;
  departureDate: string;
  returnDate: string;
  tripPurpose: string;
  peopleCount: number;
  budgetLines: TripBudgetLine[];
}

export async function fillTripBudgetTemplate(
  record: TripBudgetFillInput,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const workbook = await XlsxPopulate.fromFileAsync(TRIP_BUDGET_TEMPLATE_PATH);
  const sheet = workbook.sheet(TRIP_BUDGET_SHEET);
  const tripDays = computeTripDays(record.departureDate, record.returnDate);

  const matricule = record.employeeMatricule.trim();
  const nameLine = matricule
    ? `Name : ${record.employeeName.trim()} (${matricule})`
    : `Name : ${record.employeeName.trim()}`;
  setCellValue(sheet, 'A6', nameLine);
  setCellValue(sheet, 'A7', `Departure date: ${formatDisplayDate(record.departureDate)}`);
  setCellValue(sheet, 'A8', `Return date : ${formatDisplayDate(record.returnDate)}`);
  setCellValue(sheet, 'A9', `Trip purpose : ${record.tripPurpose.trim()}`);

  const maxRows = TRIP_BUDGET_DATA_END_ROW - TRIP_BUDGET_DATA_START_ROW + 1;
  for (let index = 0; index < maxRows; index += 1) {
    const line = record.budgetLines[index];
    const row = TRIP_BUDGET_DATA_START_ROW + index;
    const label = line?.label?.trim() ?? '';

    if (!label) {
      clearCellValue(sheet, `A${row}`);
      clearCellValue(sheet, `B${row}`);
      clearCellValue(sheet, `C${row}`);
      clearCellValue(sheet, `D${row}`);
      clearCellValue(sheet, `E${row}`);
      continue;
    }

    setCellValue(sheet, `A${row}`, label);
    if (line.amount > 0) {
      setCellValue(sheet, `B${row}`, line.amount);
      setCellValue(sheet, `C${row}`, record.peopleCount);
      if (tripDays > 0) {
        setCellValue(sheet, `D${row}`, tripDays);
        setCellValue(
          sheet,
          `E${row}`,
          computeBudgetLineTotal(line.amount, record.peopleCount, tripDays),
        );
      }
    } else {
      clearCellValue(sheet, `B${row}`);
      clearCellValue(sheet, `C${row}`);
      clearCellValue(sheet, `D${row}`);
      clearCellValue(sheet, `E${row}`);
    }
  }

  await workbook.toFileAsync(path.resolve(outputPath));
}
