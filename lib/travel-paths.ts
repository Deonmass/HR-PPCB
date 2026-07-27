import path from 'path';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

const INVALID_FILE_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

export function sanitizeTravelFileName(name: string): string {
  return name.replace(INVALID_FILE_CHARS, '').replace(/\s+/g, ' ').trim() || 'Sans nom';
}

export function buildCashRequestFileName(employeeName: string): string {
  return `Cash Request - ${sanitizeTravelFileName(employeeName)}.xlsx`;
}

export function buildTripBudgetFileName(employeeName: string): string {
  return `TRIP BUDGET FORM - ${sanitizeTravelFileName(employeeName)}.xlsx`;
}

export function buildTravelAuthorizationFileName(employeeName: string): string {
  return `Formulaire d'autorisation de voyage - ${sanitizeTravelFileName(employeeName)}.docx`;
}

export function buildHotelBookingFileName(employeeName: string): string {
  return `Hotel booking form - ${sanitizeTravelFileName(employeeName)}.docx`;
}

export function buildFlightBookingFileName(employeeName: string): string {
  return `FLIGHT BOOKING FORM - ${sanitizeTravelFileName(employeeName)}.doc`;
}

export function buildMissionOrderFileName(employeeName: string): string {
  return `Ordre de mission - ${sanitizeTravelFileName(employeeName)}.docx`;
}

export function buildTravelPdfFileName(employeeName: string): string {
  return `Documents de voyage - ${sanitizeTravelFileName(employeeName)}.pdf`;
}

export function resolveTravelSaveDirectory(input?: string): string {
  const raw =
    input?.trim() ||
    process.env.TRAVEL_OUTPUT_DIR?.trim() ||
    (canPersistProjectFiles()
      ? path.join(process.cwd(), 'data', 'travel', 'output')
      : path.join(getWritableDataRoot(), 'travel', 'output'));
  return path.resolve(raw);
}

export function getTravelSaveBaseDirectory(): string {
  const configured =
    process.env.TRAVEL_SAVE_BASE_DIR?.trim() ||
    process.env.TRAVEL_OUTPUT_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve('D:\\Templates docs voyage');
}

export function formatTravelFolderDate(documentDate: string): string {
  const trimmed = documentDate.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd} ${mm} ${yyyy}`;
}

export function buildTravelFolderName(employeeName: string, documentDate: string): string {
  const name = sanitizeTravelFileName(employeeName);
  const folderDate = formatTravelFolderDate(documentDate);
  return folderDate ? `${name} ${folderDate}` : name;
}

export function buildTravelSaveDirectoryPath(employeeName: string, documentDate: string): string {
  return path.join(getTravelSaveBaseDirectory(), buildTravelFolderName(employeeName, documentDate));
}

export function resolveTravelSaveDirectoryFromFolderName(folderName: string): string {
  const trimmed = folderName.trim();
  if (!trimmed) return getTravelSaveBaseDirectory();
  if (isFullWindowsPath(trimmed)) return path.resolve(trimmed);
  return path.join(getTravelSaveBaseDirectory(), trimmed);
}

function isFullWindowsPath(value: string): boolean {
  return /^[A-Za-z]:\\/.test(value.trim());
}

export async function uniqueFilePath(
  directory: string,
  fileName: string,
  exists: (filePath: string) => Promise<boolean>,
): Promise<string> {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(directory, fileName);
  if (!(await exists(candidate))) return candidate;

  let index = 1;
  while (await exists(path.join(directory, `${stem} (${index})${ext}`))) {
    index += 1;
  }
  return path.join(directory, `${stem} (${index})${ext}`);
}
