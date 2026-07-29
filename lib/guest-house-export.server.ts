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

/** Day calendar columns B..AF (31 slots). */
const DAY_START_COL = 2; // B
const DAY_END_COL = 32; // AF
const TOTAL_COL = 33; // AG
const RATE_COL = 34; // AH

/** Updated Guesthouse_template.xlsx layout (Gestion). */
const BAT1_ROOM_ROWS = { start: 4, end: 10 } as const;
const BAT2_ROOM_ROWS = { start: 14, end: 21 } as const;
const DATE_HEADER_ROW = 2; // serial dates (B2 seed, C2… = B2+1)
const KIMPESE_HEADER_ROW = 30;
const KIMPESE_DATA_START = 32;
const KIMPESE_DATA_END = 38;

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

function getCellFormula(sheet: PopulateSheet, row: number, col: number): string | undefined {
  try {
    return (sheet.cell(row, col) as unknown as { formula(): string | undefined }).formula() || undefined;
  } catch {
    return undefined;
  }
}

/** Clear a cell without leaving "" (COUNTA counts empty strings). */
function clearDayCell(sheet: PopulateSheet, row: number, col: number): void {
  if (getCellFormula(sheet, row, col)) return;
  try {
    sheet.cell(row, col).value(null);
  } catch {
    clearCellValue(sheet, cellAddress(row, col));
  }
}

function clearDayCells(sheet: PopulateSheet, row: number): void {
  for (let col = DAY_START_COL; col <= DAY_END_COL; col += 1) {
    clearDayCell(sheet, row, col);
  }
}

/**
 * Seed month on row 2 only (B2 = 1st day). Keep C2… formulas (B2+1) when present.
 * Clear day columns beyond the month length so they stay truly empty.
 */
function writeDayHeaders(sheet: PopulateSheet, days: string[]): void {
  const first = days[0];
  if (!first) return;
  const serial = isoToExcelSerial(first);
  sheet.cell(DATE_HEADER_ROW, DAY_START_COL).value(serial);
  try {
    sheet.cell(DATE_HEADER_ROW, DAY_START_COL).style('numberFormat', '[$-409]d\\-mmm;@');
  } catch {
    // ignore
  }

  for (let i = 0; i < 31; i += 1) {
    const col = DAY_START_COL + i;
    const iso = days[i];
    if (iso) {
      // Prefer keeping chain formulas after B2; force-write value if no formula.
      const formula = getCellFormula(sheet, DATE_HEADER_ROW, col);
      if (!formula || col === DAY_START_COL) {
        sheet.cell(DATE_HEADER_ROW, col).value(isoToExcelSerial(iso));
        try {
          sheet.cell(DATE_HEADER_ROW, col).style('numberFormat', '[$-409]d\\-mmm;@');
        } catch {
          // ignore
        }
      }
    } else {
      // Beyond month length — clear header so unused day slots stay blank
      try {
        sheet.cell(DATE_HEADER_ROW, col).value(null);
      } catch {
        clearCellValue(sheet, cellAddress(DATE_HEADER_ROW, col));
      }
    }
  }
}

/** AG = count of occupied days; AH = occupation / daysInMonth as %. */
function writeRoomTotalFormulas(sheet: PopulateSheet, row: number, daysCount: number): void {
  const dayRange = `B${row}:AF${row}`;
  // COUNTIF ignores truly blank cells (null). Avoids "" leftovers if any remain.
  sheet.cell(row, TOTAL_COL).formula(`COUNTIF(${dayRange},"<>")`);
  // Prefer calendar days from B2; fall back to explicit month length.
  sheet.cell(row, RATE_COL).formula(
    `IFERROR(AG${row}/IFERROR(DAY(EOMONTH($B$2,0)),${daysCount}),0)`,
  );
  try {
    sheet.cell(row, RATE_COL).style('numberFormat', '0%');
  } catch {
    // ignore
  }
}

function fillRoomRow(
  sheet: PopulateSheet,
  row: number,
  roomId: string,
  reservations: GuestReservation[],
  days: string[],
  daysCount: number,
): void {
  clearDayCells(sheet, row);
  for (let i = 0; i < days.length && i < 31; i += 1) {
    const name = guestNameOnDay(reservations, roomId, days[i]!);
    if (name) setCellValue(sheet, cellAddress(row, DAY_START_COL + i), name);
  }
  writeRoomTotalFormulas(sheet, row, daysCount);
}

function normalizeRoomLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildLabelToRowMap(sheet: PopulateSheet): Map<string, number> {
  const labelToRow = new Map<string, number>();
  const ranges = [
    [BAT1_ROOM_ROWS.start, BAT1_ROOM_ROWS.end],
    [BAT2_ROOM_ROWS.start, BAT2_ROOM_ROWS.end],
  ] as const;
  for (const [start, end] of ranges) {
    for (let row = start; row <= end; row += 1) {
      const label = String(sheet.cell(row, 1).value() ?? '').trim();
      if (!label.toLowerCase().startsWith('room #')) continue;
      labelToRow.set(normalizeRoomLabel(label), row);
    }
  }
  return labelToRow;
}

function resolveOnsiteRow(
  room: GuestRoom,
  labelToRow: Map<string, number>,
): number | undefined {
  const fromLabel = labelToRow.get(normalizeRoomLabel(room.templateLabel || roomDisplayName(room)));
  if (fromLabel) return fromLabel;

  // Stale templateRow from previous template layout (rooms were 1 row higher)
  const stale = room.templateRow;
  if (typeof stale === 'number') {
    if (stale >= 3 && stale <= 9) return stale + 1; // Batiment #1: 3→4 … 9→10
    if (stale >= 13 && stale <= 20) return stale + 1; // Batiment #2: 13→14 … 20→21
    if (
      (stale >= BAT1_ROOM_ROWS.start && stale <= BAT1_ROOM_ROWS.end)
      || (stale >= BAT2_ROOM_ROWS.start && stale <= BAT2_ROOM_ROWS.end)
    ) {
      return stale;
    }
  }
  return undefined;
}

function clearKimpeseBlock(sheet: PopulateSheet): void {
  for (let row = KIMPESE_DATA_START; row <= KIMPESE_DATA_END + 5; row += 1) {
    try {
      sheet.cell(row, 1).value(null);
    } catch {
      clearCellValue(sheet, cellAddress(row, 1));
    }
    clearDayCells(sheet, row);
    for (const col of [TOTAL_COL, RATE_COL]) {
      if (!getCellFormula(sheet, row, col)) {
        try {
          sheet.cell(row, col).value(null);
        } catch {
          clearCellValue(sheet, cellAddress(row, col));
        }
      }
    }
  }
}

function writeKimpeseSection(
  sheet: PopulateSheet,
  hotels: GuestRoom[],
  reservations: GuestReservation[],
  days: string[],
  daysCount: number,
): void {
  sheet.cell(KIMPESE_HEADER_ROW, 1).value('HORS GUEST HOUSE');
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
    if (row > KIMPESE_DATA_END) return;
    const label = hotel.hotelName || hotel.roomName || roomDisplayName(hotel);
    sheet.cell(row, 1).value(label);
    fillRoomRow(sheet, row, hotel.id, reservations, days, daysCount);
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
  const daysCount = days.length;
  const workbook = await XlsxPopulate.fromFileAsync(templatePath);
  const sheet = workbook.sheet(0);
  try {
    sheet.name('Gestion');
  } catch {
    // ignore
  }

  writeDayHeaders(sheet, days);

  const labelToRow = buildLabelToRowMap(sheet);
  const onsite = data.rooms.filter(isOnsite);
  const usedRows = new Set<number>();

  for (const room of onsite) {
    const row = resolveOnsiteRow(room, labelToRow);
    if (!row) continue;
    usedRows.add(row);
    setCellValue(sheet, cellAddress(row, 1), room.templateLabel || roomDisplayName(room));
    fillRoomRow(sheet, row, room.id, data.reservations, days, daysCount);
  }

  // Clear leftover guest names on unused onsite room rows; refresh AG/AH formulas
  for (const { start, end } of [BAT1_ROOM_ROWS, BAT2_ROOM_ROWS]) {
    for (let row = start; row <= end; row += 1) {
      const label = String(sheet.cell(row, 1).value() ?? '').trim();
      if (!label.toLowerCase().startsWith('room #')) continue;
      if (!usedRows.has(row)) {
        clearDayCells(sheet, row);
      }
      writeRoomTotalFormulas(sheet, row, daysCount);
    }
  }

  const kimpeseHotels = data.rooms
    .filter((room) => !isOnsite(room))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  writeKimpeseSection(sheet, kimpeseHotels, data.reservations, days, daysCount);

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
