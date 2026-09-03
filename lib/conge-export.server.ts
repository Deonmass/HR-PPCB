import 'server-only';

import ExcelJS from 'exceljs';
import {
  CONGE_MONTH_LABELS_FR,
  eachIsoDateInclusive,
  formatIsoFr,
  isSundayIso,
  monthEndBalance,
  monthRangeIso,
  monthStartBalance,
  monthlyAccrual,
  resolveDayCode,
  seniorityYearsAsOfJan1,
} from './conge-rules';
import { getCongeBundle } from './conge-store';
import { LEAVE_CODES } from './conge-types';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF7A1F2B' },
};

const CODE_COLORS: Record<string, string> = {
  IN: 'FFCCFBF1',
  AL: 'FFFEF08A',
  SL: 'FFFED7AA',
  CL: 'FFBFDBFE',
  PL: 'FFE9D5FF',
  ML: 'FFFBCFE8',
  SP: 'FFE2E8F0',
  UL: 'FFFECACA',
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' };
  row.height = 28;
}

function isoToExcelDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function buildCongeExportFilename(year: number, rangeStart: string, rangeEnd: string): string {
  return `Planning_conge_${year}_${rangeStart}_${rangeEnd}.xlsx`;
}

export async function buildCongeExportBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const bundle = await getCongeBundle();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PPC Barnet HR';
  const planning = wb.addWorksheet('Planning', {
    views: [{ state: 'frozen', xSplit: 7, ySplit: 2 }],
  });

  planning.mergeCells(1, 1, 1, 7);
  planning.getCell(1, 1).value = `Leave Planning ${bundle.exerciseYear} — ${formatIsoFr(bundle.rangeStart)} à ${formatIsoFr(bundle.rangeEnd)}`;
  planning.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF7A1F2B' } };

  const months: Array<{ year: number; month: number; start: string; end: string }> = [];
  const start = new Date(`${bundle.rangeStart}T12:00:00Z`);
  const end = new Date(`${bundle.rangeEnd}T12:00:00Z`);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth() + 1)) {
    months.push({ year: y, month: m, ...monthRangeIso(y, m) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  type Col =
    | { kind: 'id'; key: string; title: string; width: number }
    | { kind: 'solde'; month: number; title: string }
    | { kind: 'day'; iso: string }
    | { kind: 'soldeFin'; title: string };

  const cols: Col[] = [
    { kind: 'id', key: 'matricule', title: 'Matricule', width: 12 },
    { kind: 'id', key: 'nom', title: 'Nom complet', width: 28 },
    { kind: 'id', key: 'sexe', title: 'Sexe', width: 8 },
    { kind: 'id', key: 'departement', title: 'Département', width: 18 },
    { kind: 'id', key: 'position', title: 'Position', width: 26 },
    { kind: 'id', key: 'grade', title: 'Grade', width: 8 },
    { kind: 'id', key: 'hire', title: "Date d'embauche", width: 14 },
    { kind: 'id', key: 'anciennete', title: 'Ancienete', width: 12 },
    { kind: 'id', key: 'augmentation', title: 'augmentation', width: 12 },
  ];

  months.forEach((month, index) => {
    cols.push({
      kind: 'solde',
      month: month.month,
      title: `Solde\n${CONGE_MONTH_LABELS_FR[month.month - 1]}`,
    });
    const from = month.start < bundle.rangeStart ? bundle.rangeStart : month.start;
    const to = month.end > bundle.rangeEnd ? bundle.rangeEnd : month.end;
    for (const iso of eachIsoDateInclusive(from, to)) {
      cols.push({ kind: 'day', iso });
    }
    if (index === months.length - 1) {
      cols.push({ kind: 'soldeFin', title: `Solde fin\n${CONGE_MONTH_LABELS_FR[month.month - 1]}` });
    }
  });

  cols.forEach((col, i) => {
    const cell = planning.getCell(2, i + 1);
    if (col.kind === 'day') {
      cell.value = isoToExcelDate(col.iso);
      cell.numFmt = 'dd-mmm';
    } else {
      cell.value = col.title;
    }
    const column = planning.getColumn(i + 1);
    if (col.kind === 'id') column.width = col.width;
    else if (col.kind === 'day') column.width = 6;
    else column.width = 10;
  });
  styleHeader(planning.getRow(2));

  bundle.employees.forEach((emp, rowIndex) => {
    const excelRow = rowIndex + 3;
    const seniority = seniorityYearsAsOfJan1(emp.appointmentDate, bundle.exerciseYear);
    const accrual = monthlyAccrual(emp.grade, seniority, bundle.grades, bundle.seniorityBands);
    const lastMonth = months[months.length - 1]?.month ?? 6;

    cols.forEach((col, i) => {
      const cell = planning.getCell(excelRow, i + 1);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (col.kind === 'id') {
        cell.alignment = { horizontal: col.key === 'nom' || col.key === 'position' || col.key === 'departement' ? 'left' : 'center' };
        if (col.key === 'matricule') cell.value = emp.matricule;
        else if (col.key === 'nom') cell.value = emp.nom;
        else if (col.key === 'sexe') cell.value = emp.gender?.startsWith('F') ? 'F' : emp.gender?.startsWith('M') ? 'H' : emp.sexe;
        else if (col.key === 'departement') cell.value = emp.departement;
        else if (col.key === 'position') cell.value = emp.jobTitle || emp.position;
        else if (col.key === 'grade') cell.value = emp.grade;
        else if (col.key === 'hire') {
          cell.value = emp.appointmentDate ? isoToExcelDate(emp.appointmentDate) : '';
          cell.numFmt = 'dd/mm/yyyy';
        } else if (col.key === 'anciennete') {
          cell.value = Math.round(seniority * 1000) / 1000;
          cell.numFmt = '0.000';
        } else if (col.key === 'augmentation') {
          cell.value = Math.round(accrual * 1000) / 1000;
          cell.numFmt = '0.000';
        }
        return;
      }
      if (col.kind === 'solde') {
        cell.value = monthStartBalance(emp, bundle.exerciseYear, col.month, bundle.grades, bundle.seniorityBands);
        cell.numFmt = '0.00';
        return;
      }
      if (col.kind === 'soldeFin') {
        cell.value = monthEndBalance(emp, bundle.exerciseYear, lastMonth, bundle.grades, bundle.seniorityBands);
        cell.numFmt = '0.00';
        return;
      }
      const code = resolveDayCode(col.iso, emp.appointmentDate, emp.days);
      cell.value = code || '';
      if (isSundayIso(col.iso)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      } else if (code && CODE_COLORS[code]) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CODE_COLORS[code] } };
      }
    });
  });

  let legendRow = bundle.employees.length + 5;
  planning.mergeCells(legendRow, 1, legendRow, 5);
  planning.getCell(legendRow, 1).value = 'LÉGENDE';
  planning.getCell(legendRow, 1).font = { bold: true };
  legendRow += 1;
  planning.getCell(legendRow, 1).value = 'Code';
  planning.getCell(legendRow, 2).value = 'Signification';
  legendRow += 1;
  for (const item of LEAVE_CODES) {
    planning.getCell(legendRow, 1).value = item.code;
    planning.getCell(legendRow, 2).value = item.label;
    if (CODE_COLORS[item.code]) {
      planning.getCell(legendRow, 1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: CODE_COLORS[item.code] },
      };
    }
    legendRow += 1;
  }
  planning.getCell(legendRow, 1).value = '—';
  planning.getCell(legendRow, 2).value = "Avant date d'embauche";
  legendRow += 2;
  planning.mergeCells(legendRow, 1, legendRow, 7);
  planning.getCell(legendRow, 1).value =
    'Samedi = jour ouvrable (IN). Dimanche : cellules laissées vides. Seuls les AL sont retranchés du solde.';

  const gradeSheet = wb.addWorksheet('Grade');
  gradeSheet.addRow(['Grade', 'Catégorie CC', 'Jours annuels (base)', 'Jours/mois (base)', 'limite par année']);
  styleHeader(gradeSheet.getRow(1));
  bundle.grades.forEach((row) => {
    gradeSheet.addRow([row.grade, row.categorie, row.joursAnnuels, row.joursParMois, row.limiteAnnee]);
  });
  gradeSheet.addRow([]);
  gradeSheet.addRow(['Tranche de 3 ans', 'Ancienneté min (ans)', 'Jours extra / an', 'Mensuel (/12)']);
  styleHeader(gradeSheet.getRow(bundle.grades.length + 3));
  bundle.seniorityBands.forEach((band) => {
    gradeSheet.addRow([band.label, band.minYears, band.extraDaysPerYear, band.extraPerMonth]);
  });
  gradeSheet.columns = [
    { width: 22 },
    { width: 32 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
  ];

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    filename: buildCongeExportFilename(bundle.exerciseYear, bundle.rangeStart, bundle.rangeEnd),
  };
}
