import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import { buildExportDateStamp } from './employee-filters';
import type { GuestHouseStoreData } from './guest-house-types';
import { VILLAGE_EXPORT_TEMPLATE_PATH } from './excel-export-template-paths';

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

export function buildGuestHouseExportFilename(): string {
  return `VILLAGE_GUEST_HOUSE_${buildExportDateStamp()}.xlsx`;
}

function getOrCreateSheet(workbook: PopulateWorkbook, sheetName: string): PopulateSheet {
  try {
    return workbook.sheet(sheetName);
  } catch {
    return workbook.addSheet(sheetName);
  }
}

function writeSheet(
  sheet: PopulateSheet,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  for (let col = 0; col < headers.length; col += 1) {
    sheet.cell(1, col + 1).value(headers[col] ?? '');
    try {
      sheet.cell(1, col + 1).style({ bold: true });
    } catch {
      // ignore
    }
  }
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      sheet.cell(rowIndex + 2, colIndex + 1).value(value);
    });
  });
  try {
    sheet.usedRange()?.style({ fontSize: 10 });
  } catch {
    // ignore
  }
}

/** Ajoute les feuilles Guest house dans un classeur Village existant. */
export function appendGuestHouseSheetsToWorkbook(
  workbook: PopulateWorkbook,
  data: GuestHouseStoreData,
): void {
  const roomsById = new Map(data.rooms.map((room) => [room.id, room]));

  writeSheet(
    getOrCreateSheet(workbook, 'Guest house - Chambres'),
    ['N°', 'N° chambre', 'Bâtiment', 'Caractéristique', 'Créé le'],
    data.rooms.map((room, index) => [
      index + 1,
      room.roomNumber,
      room.building,
      room.characteristics || '',
      room.createdAt.slice(0, 10),
    ]),
  );

  writeSheet(
    getOrCreateSheet(workbook, 'Guest house - Reservations'),
    ['N°', 'Date', 'Personne', 'Matricule', 'Agent', 'Motif', 'Début', 'Fin', 'Chambre', 'Statut'],
    data.reservations.map((item) => [
      item.numero,
      item.createdAt.slice(0, 10),
      item.personName,
      item.matricule || '',
      item.isAgent ? 'Oui' : 'Non',
      item.motif,
      item.startDate,
      item.endDate,
      item.roomId ? roomsById.get(item.roomId)?.roomNumber ?? '' : '',
      item.status,
    ]),
  );

  writeSheet(
    getOrCreateSheet(workbook, 'Guest house - Historique'),
    ['N°', 'Chambre', 'Bâtiment', 'Personne', 'Matricule', 'Motif', 'Début', 'Fin', 'Entrée', 'Sortie'],
    data.passages.map((passage) => {
      const room = roomsById.get(passage.roomId);
      return [
        passage.numero,
        room?.roomNumber ?? '',
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

/** Export dédié : template Village + nouvelles feuilles Guest house. */
export async function buildGuestHouseVillageExportBuffer(
  data: GuestHouseStoreData,
): Promise<Buffer> {
  const templatePath = VILLAGE_EXPORT_TEMPLATE_PATH;
  let workbook: PopulateWorkbook;
  if (fs.existsSync(templatePath)) {
    workbook = await XlsxPopulate.fromFileAsync(templatePath);
  } else {
    workbook = await XlsxPopulate.fromBlankAsync();
    try {
      workbook.sheet(0).name('Village');
    } catch {
      // ignore
    }
  }

  appendGuestHouseSheetsToWorkbook(workbook, data);

  const output = await workbook.outputAsync();
  return Buffer.from(output);
}
