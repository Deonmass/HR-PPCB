export function setCellValue(
  sheet: { cell(address: string): { value(value?: unknown): unknown } },
  address: string,
  value: unknown,
): void {
  if (value === undefined || value === null || value === '') return;
  sheet.cell(address).value(value);
}

export function clearCellValue(
  sheet: { cell(address: string): { value(value?: unknown): unknown } },
  address: string,
): void {
  // Use null (not "") — Excel COUNTA counts empty strings as non-blank.
  sheet.cell(address).value(null);
}

export function parseExcelDate(value: string): Date | string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(date.getTime()) ? trimmed : date;
}

export function formatDisplayDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString('fr-FR');
}
