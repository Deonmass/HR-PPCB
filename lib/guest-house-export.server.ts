import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import { buildExportDateStamp } from './employee-filters';
import { GUEST_HOUSE_EXPORT_TEMPLATE_PATH } from './excel-export-template-paths';
import type { GuestHouseStoreData, GuestReservation, GuestRoom } from './guest-house-types';
import { KIMPESE_BUILDING, roomDisplayName } from './guest-house-types';
import { clearCellValue, setCellValue } from './xlsx-populate-utils';

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

const DAY_START_COL = 2; // B
const DAY_END_COL = 32; // AF (31 day slots)
const KIMPESE_HEADER_ROW = 26;
const KIMPESE_DATA_START = 27;

function colLetter(col1Based: number): string {
  let n = col1Based;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellAddress(row: number, col1Based: number): string {
  return `${colLetter(col1Based)}${row}`;
}

function isoToExcelSerial(iso: string): number {
  const date = new Date(`${iso}T00:00:00Z`);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((date.getTime() - epoch) / 86_400_000);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthDayIsos(year: number, month: number): string[] {
  const count = daysInMonth(year, month);
  const out: string[] = [];
  for (let day = 1; day <= count; day += 1) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

function isOnsite(room: GuestRoom): boolean {
  return room.category !== 'kimpese' && room.building !== KIMPESE_BUILDING;
}

function guestNameOnDay(
  reservations: GuestReservation[],
  roomId: string,
  day: string,
): string {
  const hit = reservations.find(
    (item) =>
      item.roomId === roomId
      && (item.status === 'confirmed' || item.status === 'completed')
      && item.startDate <= day
      && item.endDate >= day,
  );
  return hit?.personName ?? '';
}

function clearDayCells(sheet: PopulateSheet, row: number): void {
  for (let col = DAY_START_COL; col <= DAY_END_COL; col += 1) {
    const address = cellAddress(row, col);
    const cell = sheet.cell(address);
    let formula: string | undefined;
    try {
      formula = (cell as unknown as { formula(): string | undefined }).formula() || undefined;
    } catch {
      formula = undefined;
    }
    if (formula) continue;
    clearCellValue(sheet, address);
  }
}

function writeDayHeaders(sheet: PopulateSheet, days: string[]): void {
  for (let i = 0; i < 31; i += 1) {
    const col = DAY_START_COL + i;
    const iso = days[i];
    const addr1 = cellAddress(1, col);
    const addr2 = cellAddress(2, col);
    if (iso) {
      const serial = isoToExcelSerial(iso);
      sheet.cell(addr1).value(serial);
      sheet.cell(addr2).value(serial);
      try {
        sheet.cell(addr1).style('numberFormat', '[$-409]d\\-mmm;@');
        sheet.cell(addr2).style('numberFormat', '[$-409]d\\-mmm;@');
      } catch {
        // ignore
      }
    } else {
      clearCellValue(sheet, addr1);
      clearCellValue(sheet, addr2);
    }
  }
}

function fillRoomRow(
  sheet: PopulateSheet,
  row: number,
  roomId: string,
  reservations: GuestReservation[],
  days: string[],
): void {
  clearDayCells(sheet, row);
  for (let i = 0; i < days.length && i < 31; i += 1) {
    const name = guestNameOnDay(reservations, roomId, days[i]!);
    if (name) setCellValue(sheet, cellAddress(row, DAY_START_COL + i), name);
  }
}

function clearKimpeseBlock(sheet: PopulateSheet): void {
  for (let row = KIMPESE_DATA_START; row <= KIMPESE_DATA_START + 40; row += 1) {
    clearCellValue(sheet, cellAddress(row, 1));
    clearDayCells(sheet, row);
    for (const col of [33, 34]) {
      const address = cellAddress(row, col);
      const cell = sheet.cell(address);
      let formula: string | undefined;
      try {
        formula = (cell as unknown as { formula(): string | undefined }).formula() || undefined;
      } catch {
        formula = undefined;
      }
      if (!formula) clearCellValue(sheet, address);
    }
  }
}

function writeKimpeseSection(
  sheet: PopulateSheet,
  hotels: GuestRoom[],
  reservations: GuestReservation[],
  days: string[],
): void {
  // Ensure header
  sheet.cell(KIMPESE_HEADER_ROW, 1).value(KIMPESE_BUILDING);
  try {
    sheet.cell(KIMPESE_HEADER_ROW, 1).style({
      bold: true,
      fill: { type: 'solid', color: { rgb: '9BC2E6' } },
    });
  } catch {
    // ignore
  }

  clearKimpeseBlock(sheet);

  hotels.forEach((hotel, index) => {
    const row = KIMPESE_DATA_START + index;
    const label = hotel.hotelName || hotel.roomName || roomDisplayName(hotel);
    sheet.cell(row, 1).value(label);
    fillRoomRow(sheet, row, hotel.id, reservations, days);
    // Totals like on-site rooms
    try {
      sheet.cell(row, 33).formula(`COUNTA(B${row}:AF${row})`);
      sheet.cell(row, 34).formula(`AG${row}*100/28`);
    } catch {
      // ignore
    }
  });
}

/** Resolve YYYY-MM for export (query, else current month). */
export function resolveGuestHouseExportMonth(monthParam?: string | null): { year: number; month: number; key: string } {
  const raw = String(monthParam ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(5, 7));
    if (month >= 1 && month <= 12) return { year, month, key: raw };
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, key: `${year}-${String(month).padStart(2, '0')}` };
}

export function buildGuestHouseExportFilename(monthKey?: string): string {
  const stamp = buildExportDateStamp();
  const month = monthKey ? `_${monthKey.replace('-', '')}` : '';
  return `GUEST_HOUSE${month}_${stamp}.xlsx`;
}

/**
 * Fill Guesthouse_template.xlsx from JSON (Gestion sheet occupancy calendar).
 * Preserves formulas/styles on structure rows; writes guest names into day cells.
 */
export async function buildGuestHouseTemplateExportBuffer(
  data: GuestHouseStoreData,
  monthParam?: string | null,
): Promise<{ buffer: Buffer; monthKey: string }> {
  const templatePath = GUEST_HOUSE_EXPORT_TEMPLATE_PATH;
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template Guest house introuvable: ${templatePath}`);
  }

  const { year, month, key } = resolveGuestHouseExportMonth(monthParam);
  const days = monthDayIsos(year, month);
  const workbook = await XlsxPopulate.fromFileAsync(templatePath);
  const sheet = workbook.sheet(0);
  try {
    sheet.name('Gestion');
  } catch {
    // ignore
  }

  writeDayHeaders(sheet, days);

  // Map existing template labels → row for rooms without templateRow
  const labelToRow = new Map<string, number>();
  for (let row = 3; row <= 20; row += 1) {
    const label = String(sheet.cell(row, 1).value() ?? '').trim().toLowerCase();
    if (label.startsWith('room #')) labelToRow.set(label, row);
  }

  const onsite = data.rooms.filter(isOnsite);
  for (const room of onsite) {
    let row = room.templateRow;
    if (!row || row < 3) {
      const key = (room.templateLabel || '').trim().toLowerCase();
      row = key ? labelToRow.get(key) : undefined;
    }
    if (!row || row < 3) continue;
    setCellValue(sheet, cellAddress(row, 1), room.templateLabel || roomDisplayName(room));
    fillRoomRow(sheet, row, room.id, data.reservations, days);
  }

  // Clear leftover guest names on onsite room rows not covered (keep structure)
  for (let row = 3; row <= 9; row += 1) {
    const label = String(sheet.cell(row, 1).value() ?? '').trim();
    if (!label.toLowerCase().startsWith('room #')) continue;
    const matched = onsite.some((room) => room.templateRow === row
      || (room.templateLabel || '').trim().toLowerCase() === label.toLowerCase());
    if (!matched) clearDayCells(sheet, row);
  }
  for (let row = 13; row <= 20; row += 1) {
    const label = String(sheet.cell(row, 1).value() ?? '').trim();
    if (!label.toLowerCase().startsWith('room #')) continue;
    const matched = onsite.some((room) => room.templateRow === row
      || (room.templateLabel || '').trim().toLowerCase() === label.toLowerCase());
    if (!matched) clearDayCells(sheet, row);
  }

  clearCellValue(sheet, cellAddress(KIMPESE_HEADER_ROW, 2));
  const kimpeseHotels = data.rooms
    .filter((room) => !isOnsite(room))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  writeKimpeseSection(sheet, kimpeseHotels, data.reservations, days);

  const output = await workbook.outputAsync();
  return { buffer: Buffer.from(output), monthKey: key };
}

/** Legacy Village workbook append (summary sheets) — kept for village export bundle. */
export function appendGuestHouseSheetsToWorkbook(
  workbook: PopulateWorkbook,
  data: GuestHouseStoreData,
): void {
  const roomsById = new Map(data.rooms.map((room) => [room.id, room]));

  const writeSheet = (
    sheetName: string,
    headers: string[],
    rows: Array<Array<string | number>>,
  ) => {
    let sheet: PopulateSheet;
    try {
      sheet = workbook.sheet(sheetName);
    } catch {
      sheet = workbook.addSheet(sheetName);
    }
    headers.forEach((header, col) => {
      sheet.cell(1, col + 1).value(header);
      try {
        sheet.cell(1, col + 1).style({ bold: true });
      } catch {
        // ignore
      }
    });
    rows.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        sheet.cell(rowIndex + 2, colIndex + 1).value(value);
      });
    });
  };

  writeSheet(
    'Guest house - Chambres',
    ['N°', 'Label', 'N° chambre', 'Nom', 'Lieu/Bâtiment', 'Catégorie', 'Hôtel', 'Caractéristique', 'Créé le'],
    data.rooms.map((room, index) => [
      index + 1,
      room.templateLabel || roomDisplayName(room),
      room.roomNumber,
      room.roomName,
      room.building,
      room.category,
      room.hotelName || '',
      room.characteristics || '',
      room.createdAt.slice(0, 10),
    ]),
  );

  writeSheet(
    'Guest house - Reservations',
    [
      'N°', 'Date', 'Personne', 'Matricule', 'Agent', 'Motif', 'Société', 'Mission',
      'Début', 'Fin', 'Chambre/Hôtel', 'Lieu', 'Statut', 'Téléphone', 'Email', 'Notes',
    ],
    data.reservations.map((item) => {
      const room = item.roomId ? roomsById.get(item.roomId) : undefined;
      return [
        item.numero,
        item.createdAt.slice(0, 10),
        item.personName,
        item.matricule || '',
        item.isAgent ? 'Oui' : 'Non',
        item.motif,
        item.company || '',
        item.mission || '',
        item.startDate,
        item.endDate,
        room ? roomDisplayName(room) : '',
        room?.building || '',
        item.status,
        item.phone || '',
        item.email || '',
        item.notes || '',
      ];
    }),
  );

  writeSheet(
    'Guest house - Historique',
    ['N°', 'Chambre/Hôtel', 'Lieu', 'Personne', 'Matricule', 'Motif', 'Début', 'Fin', 'Entrée', 'Sortie'],
    data.passages.map((passage) => {
      const room = roomsById.get(passage.roomId);
      return [
        passage.numero,
        room ? roomDisplayName(room) : '',
        room?.building ?? '',
        passage.personName,
        passage.matricule || '',
        passage.motif,
        passage.startDate,
        passage.endDate,
        passage.checkedInAt.slice(0, 10),
        passage.checkedOutAt?.slice(0, 10) ?? '',
      ];
    }),
  );
}

/** @deprecated Prefer buildGuestHouseTemplateExportBuffer — kept for fallback. */
export async function buildGuestHouseVillageExportBuffer(
  data: GuestHouseStoreData,
): Promise<Buffer> {
  const { buffer } = await buildGuestHouseTemplateExportBuffer(data);
  return buffer;
}
