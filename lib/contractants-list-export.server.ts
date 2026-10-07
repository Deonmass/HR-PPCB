import 'server-only';

import ExcelJS from 'exceljs';
import { withContractantAirtimePhones } from './airtime-store';
import type { ContractantAccessScope } from './auth-types';
import { filterContractantsByScope } from './contractant-scope';
import { listContractants } from './contractants-store';
import {
  etatCivilLabel,
  type Contractant,
  type ContractantEmployee,
} from './contractants-types';
import { buildExportDateStamp } from './employee-filters';

const HEADERS = [
  'Noms',
  'Sexe',
  'Lieu',
  'Fonction',
  'Département',
  'Service',
  'Téléphone',
  'État civil',
  'Statut',
  'Date d\'embauche',
  'Date de sortie',
  'Matricule PPC',
] as const;

const COL_WIDTHS = [32, 8, 16, 28, 22, 22, 16, 16, 14, 16, 16, 18];

function uniqueSheetName(raw: string, used: Set<string>): string {
  let base = raw
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  if (!base) base = 'Contractant';
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = `${base.slice(0, 31 - suffix.length).trimEnd()}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function formatDate(value: string): string {
  const iso = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return String(value || '').trim();
  return `${iso[3]}/${iso[2]}/${iso[1]}`;
}

function phoneOf(employee: ContractantEmployee): string {
  return String(employee.telephoneAirtime || employee.telephone || '').trim();
}

function statutOf(employee: ContractantEmployee): string {
  if (String(employee.dateSortie || '').trim()) return 'Sorti';
  return employee.statut || '';
}

function sortEmployees(employees: ContractantEmployee[]): ContractantEmployee[] {
  return [...employees].sort((a, b) => {
    const aExit = String(a.dateSortie || '').trim() ? 1 : 0;
    const bExit = String(b.dateSortie || '').trim() ? 1 : 0;
    if (aExit !== bExit) return aExit - bExit;
    return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  });
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1F1F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

function addContractorSheet(
  workbook: ExcelJS.Workbook,
  contractant: Contractant,
  usedNames: Set<string>,
): void {
  const employees = sortEmployees(contractant.employees || []);
  const actifs = employees.filter((employee) => !String(employee.dateSortie || '').trim()).length;
  const sorties = employees.length - actifs;
  const ws = workbook.addWorksheet(uniqueSheetName(contractant.denomination, usedNames), {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.mergeCells(1, 1, 1, HEADERS.length);
  const title = ws.getCell(1, 1);
  title.value = contractant.denomination;
  title.font = { bold: true, size: 16, color: { argb: 'FF1F1F1F' } };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, HEADERS.length);
  const subtitle = ws.getCell(2, 1);
  subtitle.value = [
    contractant.typeService.trim(),
    `${actifs} en poste`,
    `${sorties} sortie${sorties === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');
  subtitle.font = { italic: true, color: { argb: 'FF555555' } };

  const header = ws.getRow(3);
  HEADERS.forEach((label, index) => {
    header.getCell(index + 1).value = label;
  });
  styleHeader(header);

  if (employees.length === 0) {
    ws.getCell(4, 1).value = 'Aucun employé';
  } else {
    employees.forEach((employee, index) => {
      const row = ws.getRow(4 + index);
      const values = [
        employee.nom,
        employee.sexe,
        employee.lieuAffectation,
        employee.fonction,
        employee.departement,
        employee.service || '',
        phoneOf(employee),
        etatCivilLabel(employee.etatCivil),
        statutOf(employee),
        formatDate(employee.dateEmbauche),
        formatDate(employee.dateSortie),
        employee.matriculePpc || '',
      ];
      values.forEach((value, col) => {
        const cell = row.getCell(col + 1);
        cell.value = value;
        cell.alignment = { vertical: 'middle' };
      });
    });
  }

  COL_WIDTHS.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
  const lastRow = Math.max(4, 3 + employees.length);
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: lastRow, column: HEADERS.length },
  };
}

export async function buildContractantsListExcelBuffer(
  scope?: ContractantAccessScope | null,
): Promise<{ buffer: Buffer; filename: string }> {
  const all = await listContractants();
  const withPhones = await withContractantAirtimePhones(all);
  const contractants = filterContractantsByScope(withPhones, scope)
    .slice()
    .sort((a, b) => a.denomination.localeCompare(b.denomination, 'fr', { sensitivity: 'base' }));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RH PPCB';
  workbook.created = new Date();

  const usedNames = new Set<string>();
  if (contractants.length === 0) {
    const ws = workbook.addWorksheet('Contractants');
    ws.getCell(1, 1).value = 'Aucun contractant';
  } else {
    for (const contractant of contractants) {
      addContractorSheet(workbook, contractant, usedNames);
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    filename: `CONTRACTANTS_${buildExportDateStamp()}.xlsx`,
  };
}
