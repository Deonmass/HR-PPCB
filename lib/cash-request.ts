import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import XlsxPopulate from 'xlsx-populate';
import {
  CASH_REQUEST_DATA_END_ROW,
  CASH_REQUEST_DATA_START_ROW,
} from './cash-request-utils';
import type { CashRequestRecord } from './travel-types';
import { CASH_REQUEST_TEMPLATE_PATH } from './travel-template-paths';
import { parseExcelDate, setCellValue } from './xlsx-populate-utils';

export { CASH_REQUEST_TEMPLATE_PATH };

export const CASH_REQUEST_SHEET = 'Sheet1';

const LINE_COLUMNS = {
  description: 'E',
  currency: 'F',
  amount: 'G',
} as const;

export async function fillCashRequestTemplate(
  record: Pick<CashRequestRecord, 'requestorLine' | 'objet' | 'requestDate' | 'lines'>,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const workbook = await XlsxPopulate.fromFileAsync(CASH_REQUEST_TEMPLATE_PATH);
  const sheet = workbook.sheet(CASH_REQUEST_SHEET);

  setCellValue(sheet, 'D13', record.requestorLine);
  setCellValue(sheet, 'D16', parseExcelDate(record.requestDate));
  setCellValue(sheet, 'E16', record.objet);

  const maxRows = CASH_REQUEST_DATA_END_ROW - CASH_REQUEST_DATA_START_ROW + 1;
  for (let index = 0; index < maxRows; index += 1) {
    const line = record.lines[index];
    if (!line) continue;

    const row = CASH_REQUEST_DATA_START_ROW + index;
    setCellValue(sheet, `${LINE_COLUMNS.description}${row}`, line.description);
    setCellValue(sheet, `${LINE_COLUMNS.currency}${row}`, line.currency);
    if (line.amount > 0) {
      setCellValue(sheet, `${LINE_COLUMNS.amount}${row}`, line.amount);
    }
  }

  await workbook.toFileAsync(path.resolve(outputPath));
}
