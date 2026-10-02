import 'server-only';

import ExcelJS from 'exceljs';
import {
  CHARROI_VOYAGE_BUDGET_LINES,
  CHARROI_VOYAGE_STATUSES,
  voyageBudgetTotal,
  type CharroiVoyage,
} from './charroi-types';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF7A1F2B' },
};

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatWhen(date: string, time: string): string {
  const day = formatDate(date);
  if (!day) return '';
  return time ? `${day} ${time}` : day;
}

function statusLabel(status: CharroiVoyage['status']): string {
  return CHARROI_VOYAGE_STATUSES.find((item) => item.id === status)?.label ?? status;
}

function moneyLabel(value: number): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

function personLine(name: string, matricule: string): string {
  const who = name.trim();
  return matricule.trim() ? `${who} (${matricule.trim()})` : who;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle' };
  row.height = 22;
}

function writePairs(sheet: ExcelJS.Worksheet, rows: Array<[string, string]>) {
  rows.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, size: 11 };
    row.getCell(2).value = value || '—';
    row.getCell(2).alignment = { wrapText: true };
    row.height = 20;
  });
}

export function charroiDriverDocsFileName(voyage: CharroiVoyage): string {
  const who = voyage.chauffeurNom.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, ' ').trim() || voyage.numero;
  return `Documents voyage chauffeur - ${voyage.numero} - ${who}.xlsx`;
}

export async function buildCharroiDriverDocs(voyage: CharroiVoyage): Promise<Buffer> {
  if (!voyage.chauffeurNom.trim() || !voyage.vehiculeLibelle.trim()) {
    throw new Error('Chauffeur et véhicule requis pour générer les documents');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HR';

  const mission = workbook.addWorksheet('Ordre de voyage');
  mission.columns = [{ width: 28 }, { width: 62 }];
  mission.mergeCells('A1:B1');
  mission.getCell('A1').value = 'Documents de voyage — chauffeur';
  styleHeader(mission.getRow(1));
  writePairs(mission, [
    ['N°', voyage.numero],
    ['Statut', statusLabel(voyage.status)],
    ['Passager', personLine(voyage.passagerNom, voyage.passagerMatricule)],
    ['Personnes', String(voyage.nombrePersonnes || 1)],
    ['Trajet', `${voyage.depart} → ${voyage.destination}`],
    ['Départ', formatWhen(voyage.dateDepart, voyage.heureDepart)],
    ['Arrivée', formatWhen(voyage.dateArrivee, voyage.heureArrivee)],
    ['Motif', voyage.motif],
    ['Chauffeur', personLine(voyage.chauffeurNom, voyage.chauffeurMatricule)],
    ['Véhicule', voyage.vehiculeLibelle],
    ['Notes', voyage.notes],
  ]);

  const budget = workbook.addWorksheet('Budget');
  budget.columns = [{ width: 32 }, { width: 22 }];
  budget.mergeCells('A1:B1');
  budget.getCell('A1').value = `Budget du voyage ${voyage.numero}`;
  styleHeader(budget.getRow(1));
  budget.getRow(2).getCell(1).value = 'Ligne';
  budget.getRow(2).getCell(2).value = 'Montant';
  styleHeader(budget.getRow(2));

  CHARROI_VOYAGE_BUDGET_LINES.forEach((line, index) => {
    const row = budget.getRow(index + 3);
    row.getCell(1).value = line.label;
    row.getCell(2).value = moneyLabel(voyage[line.id]);
    row.height = 20;
  });

  const totalRow = budget.getRow(CHARROI_VOYAGE_BUDGET_LINES.length + 3);
  totalRow.getCell(1).value = 'Total';
  totalRow.getCell(1).font = { bold: true, size: 11 };
  totalRow.getCell(2).value = moneyLabel(voyageBudgetTotal(voyage));
  totalRow.getCell(2).font = { bold: true, size: 11 };
  totalRow.height = 22;

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}
