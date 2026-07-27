import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import { buildExportDateStamp } from './employee-filters';
import type { Dependant } from './dependants-types';
import { formatDisplayName } from './format-display-name';
import type { Employee } from './types';
import type { VillageAffectationHistoryEntry } from './village-affectation-history';
import type { VillageAffectationSuggestion } from './village-affectation-suggestions';
import {
  buildMaisonOccupancy,
  buildVillageDashboardStats,
  buildVillageFamilyGroups,
  buildZambaAgentsFromEmployees,
  HORS_EFFECTIF_DEPT,
  splitVillageKimpese,
} from './village-agents';
import type { VillageMaison, VillageTaille } from './village-types';
import {
  EXPORT_TEMPLATE_FILES,
  getExportTemplatesDirectory,
  VILLAGE_EXPORT_TEMPLATE_PATH,
} from './excel-export-template-paths';

export { VILLAGE_EXPORT_TEMPLATE_PATH };

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

const STYLE_PROPS = [
  'bold',
  'italic',
  'fill',
  'border',
  'horizontalAlignment',
  'verticalAlignment',
  'fontColor',
  'fontSize',
  'wrapText',
  'numberFormat',
] as const;

export function buildVillageExportFilename(): string {
  return `VILLAGE_KIMPESE_${buildExportDateStamp()}.xlsx`;
}

function copyCellStyle(
  from: PopulateSheet,
  to: PopulateSheet,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
) {
  const src = from.cell(fromRow, fromCol);
  const dst = to.cell(toRow, toCol);
  for (const prop of STYLE_PROPS) {
    try {
      const value = src.style(prop);
      if (value !== undefined) dst.style(prop, value);
    } catch {
      // ignore unsupported style
    }
  }
}

function getOrCreateSheet(
  workbook: PopulateWorkbook,
  sheetName: string,
): { sheet: PopulateSheet; created: boolean } {
  try {
    return { sheet: workbook.sheet(sheetName), created: false };
  } catch {
    return { sheet: workbook.addSheet(sheetName), created: true };
  }
}

function applyListeHeaderStyleToSheet(
  workbook: PopulateWorkbook,
  sheetName: string,
  headers: string[],
) {
  const liste = workbook.sheet('Liste');
  const { sheet, created } = getOrCreateSheet(workbook, sheetName);
  for (let col = 1; col <= headers.length; col++) {
    sheet.cell(1, col).value(headers[col - 1] ?? '');
    if (created) {
      copyCellStyle(liste, sheet, 1, Math.min(col, 10), 1, col);
    }
  }
  return sheet;
}

/** Vide les anciennes données sans balayer des plages énormes. */
function clearSheetData(
  sheet: PopulateSheet,
  startRow: number,
  colCount: number,
  maxRows = 800,
) {
  const used = sheet.usedRange();
  if (!used) return;
  const lastRow = Math.min(used.endCell().rowNumber(), startRow + maxRows - 1);
  if (lastRow < startRow) return;
  for (let row = startRow; row <= lastRow; row++) {
    for (let col = 1; col <= colCount; col++) {
      sheet.cell(row, col).value(null);
    }
  }
}

function writeAoa(
  sheet: PopulateSheet,
  rows: (string | number)[][],
  startRow: number,
) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const value = row[c];
      sheet.cell(startRow + r, c + 1).value(value === '' ? null : value);
    }
  }
}

function setFormula(sheet: PopulateSheet, row: number, col: number, formula: string) {
  sheet.cell(row, col).formula(formula);
}

function cellText(sheet: PopulateSheet, row: number, col: number): string {
  const v = sheet.cell(row, col).value();
  if (v == null) return '';
  return String(v).trim();
}

/** Colonne Excel 1-based → lettre (1=A … 26=Z, 27=AA…). */
function colLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function familyListeRows(
  agents: ReturnType<typeof buildZambaAgentsFromEmployees>,
  dependants: Dependant[],
): (string | number)[][] {
  const groups = buildVillageFamilyGroups(agents, dependants);
  const byMatricule = new Map(agents.map((a) => [a.matricule, a]));
  const rows: (string | number)[][] = [];
  for (const group of groups) {
    const agent = byMatricule.get(group.matricule);
    const villa = agent?.numeroVilla ?? group.employee.numeroVilla ?? '';
    const typeMaison = agent?.typeMaison ?? group.employee.typeMaison ?? '';
    const familySize = 1 + group.famille.length;
    const pushMember = (d: Dependant) => {
      rows.push([
        d.matricule,
        formatDisplayName(group.employee.nom),
        d.statut,
        formatDisplayName(d.nom),
        d.sexe,
        d.localisation,
        villa,
        typeMaison,
        d.departement || agent?.departement || '',
        familySize,
      ]);
    };
    pushMember(group.employee);
    for (const member of group.famille) pushMember(member);
  }
  return rows;
}

/** Occupants en maison sans être employés (→ Liste + formules Hors effectif). */
function horsEffectifListeRows(
  occupancy: ReturnType<typeof buildMaisonOccupancy>,
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const m of occupancy) {
    for (const o of m.occupants) {
      if (!o.externe) continue;
      const typeMaison = m.typeMaison || m.taille || '';
      rows.push([
        '',
        formatDisplayName(o.nom),
        HORS_EFFECTIF_DEPT,
        formatDisplayName(o.nom),
        '',
        'Village',
        m.numero,
        typeMaison,
        HORS_EFFECTIF_DEPT,
        1,
      ]);
    }
  }
  return rows;
}

/** Garde Hors effectif visible même s’il y a plus de 11 départements. */
function pickDeptRowsForDashboard(
  stats: ReturnType<typeof buildVillageDashboardStats>,
  maxRows = 11,
): ReturnType<typeof buildVillageDashboardStats>['parDepartementTaille'] {
  const all = stats.parDepartementTaille;
  const hors = all.find((d) => d.departement === HORS_EFFECTIF_DEPT);
  const others = all.filter((d) => d.departement !== HORS_EFFECTIF_DEPT);
  if (!hors) return all.slice(0, maxRows);
  const room = Math.max(0, maxRows - 1);
  return [...others.slice(0, room), hors];
}

function maisonRows(
  list: ReturnType<typeof buildMaisonOccupancy>,
  statut: string,
): (string | number)[][] {
  return list.map((m) => [
    m.numero,
    m.typeMaison || m.taille,
    statut,
    m.capacite ?? '',
    m.occupantCount,
    m.occupants.map((o) => o.matricule).join(', '),
    m.occupants.map((o) => formatDisplayName(o.nom)).join(', '),
    m.commentaires,
  ]);
}

function suggestionExportRows(
  vacant: ReturnType<typeof buildMaisonOccupancy>,
  kimpese: ReturnType<typeof buildZambaAgentsFromEmployees>,
  suggestions: VillageAffectationSuggestion[],
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const byVilla = new Map<string, VillageAffectationSuggestion[]>();
  for (const s of suggestions) {
    const key = s.numeroVilla.trim().toLowerCase();
    const list = byVilla.get(key) ?? [];
    list.push(s);
    byVilla.set(key, list);
  }

  let kimpeseIdx = 0;
  for (const m of vacant) {
    const key = m.numero.trim().toLowerCase();
    const persisted = byVilla.get(key) ?? [];
    const type = m.typeMaison || m.taille;
    if (persisted.length) {
      for (const s of persisted) {
        rows.push([
          m.numero,
          type,
          s.matricule,
          formatDisplayName(s.nom),
          '',
          s.commentaire,
          '',
        ]);
      }
      continue;
    }
    const agent = kimpese[kimpeseIdx++];
    if (!agent) {
      rows.push([m.numero, type, '', '', '', '', '']);
      continue;
    }
    rows.push([
      m.numero,
      type,
      agent.matricule,
      formatDisplayName(agent.nom),
      agent.departement,
      '',
      '',
    ]);
  }
  return rows;
}

function historiqueRows(history: VillageAffectationHistoryEntry[]): (string | number)[][] {
  return history.map((h) => [
    h.date,
    h.action,
    h.matricule,
    formatDisplayName(h.nom),
    h.numeroVilla,
    h.typeMaison,
    h.ancienNumero,
    h.raison,
    h.commentaire,
  ]);
}

const LISTE_HEADERS = [
  'Matricule',
  'Employé',
  'Statut membre',
  'Nom membre',
  'Sexe',
  'Localisation',
  'Numero Villa',
  'Type maison',
  'Département',
  'Taille famille',
] as const;

const MAISON_HEADERS = [
  'Numero',
  'Type de maison',
  'Statut',
  'Capacité',
  'Occupants',
  'Matricules',
  'Noms',
  'Commentaires',
] as const;

const HISTO_HEADERS = [
  'Date',
  'Action',
  'Matricule',
  'Nom',
  'Numero Villa',
  'Type maison',
  'Ancien numero',
  'Raison',
  'Commentaire',
] as const;

const SUG_HEADERS = [
  'Numero Villa',
  'Type de maison',
  'Matricule agent suggéré',
  'Nom agent suggéré',
  'Département agent',
  "Raison d'affectation",
  'Commentaire',
] as const;

/**
 * Remplit uniquement les cellules de valeurs du Dashboard template.
 * Ne touche ni titres, ni mises en forme, ni graphiques Excel.
 *
 * Layout template :
 *  A4/B4/C4  = totaux maisons
 *  A11/B11/C11 = totaux employés
 *  E4:H7     = par type (labels E, formules F/G/H) — charts chart1
 *  A20:F30   = département × type (B–E = COUNTIFS Liste) — charts chart2
 */
function fillDashboardFormulas(
  dash: PopulateSheet,
  stats: ReturnType<typeof buildVillageDashboardStats>,
  occFirst: number,
  occLast: number,
  videFirst: number,
  videLast: number,
  listeLast: number,
) {
  const listeEnd = Math.max(2, listeLast);
  const occEnd = Math.max(occFirst, occLast);
  const videEnd = Math.max(videFirst, videLast);
  const occA = `'Maisons occupees'!$A$${occFirst}:$A$${occEnd}`;
  const videA = `'Maisons vides'!$A$${videFirst}:$A$${videEnd}`;
  const occType = `'Maisons occupees'!$B$${occFirst}:$B$${occEnd}`;
  const videType = `'Maisons vides'!$B$${videFirst}:$B$${videEnd}`;
  const listeStatut = `Liste!$C$2:$C$${listeEnd}`;
  const listeVilla = `Liste!$G$2:$G$${listeEnd}`;

  // KPI maisons (ligne 4)
  setFormula(dash, 4, 1, `COUNTA(${occA})+COUNTA(${videA})`);
  setFormula(dash, 4, 2, `COUNTA(${occA})`);
  setFormula(dash, 4, 3, `COUNTA(${videA})`);

  // KPI employés (ligne 11)
  setFormula(
    dash,
    11,
    1,
    `SUMPRODUCT((${listeStatut}<>"")*(ISNUMBER(SEARCH("Employ",${listeStatut}))))`,
  );
  setFormula(
    dash,
    11,
    2,
    `SUMPRODUCT((${listeStatut}<>"")*(ISNUMBER(SEARCH("Employ",${listeStatut})))*(${listeVilla}<>""))`,
  );
  setFormula(
    dash,
    11,
    3,
    `SUMPRODUCT((${listeStatut}<>"")*(ISNUMBER(SEARCH("Employ",${listeStatut})))*(${listeVilla}=""))`,
  );

  // Par type — lignes 4..7 : garder les libellés template (chart1 = E4:G7)
  const typeLabelsFromStats = stats.parTaille.map((t) => t.label);
  const typeLabels: string[] = [];
  for (let i = 0; i < 4; i++) {
    const row = 4 + i;
    const existing = cellText(dash, row, 5);
    const label = existing || typeLabelsFromStats[i] || '';
    if (label && !existing) dash.cell(row, 5).value(label);
    typeLabels.push(label);
    const lit = label.replace(/"/g, '""');
    if (lit) {
      setFormula(dash, row, 6, `COUNTIF(${occType},"${lit}")`);
      setFormula(dash, row, 7, `COUNTIF(${videType},"${lit}")`);
    } else {
      dash.cell(row, 6).value(0);
      dash.cell(row, 7).value(0);
    }
    setFormula(dash, row, 8, `F${row}+G${row}`);
  }
  setFormula(dash, 8, 6, 'SUM(F4:F7)');
  setFormula(dash, 8, 7, 'SUM(G4:G7)');
  setFormula(dash, 8, 8, 'SUM(H4:H7)');

  // Colonnes types du tableau département = mêmes libellés que E4:E7 (chart2)
  for (let c = 2; c <= 5; c++) {
    const label = typeLabels[c - 2] || '';
    if (label) dash.cell(19, c).value(label);
  }

  // Efface anciennes lignes département (garde en-tête 19 et total 31)
  for (let row = 20; row <= 30; row++) {
    for (let col = 1; col <= 6; col++) {
      dash.cell(row, col).value(null);
    }
  }

  // Liste : C=Statut, G=Villa, H=Type, I=Département
  const listeDept = `Liste!$I$2:$I$${listeEnd}`;
  const listeType = `Liste!$H$2:$H$${listeEnd}`;
  const listeStatutCol = `Liste!$C$2:$C$${listeEnd}`;
  const listeVillaCol = `Liste!$G$2:$G$${listeEnd}`;

  const deptRows = pickDeptRowsForDashboard(stats);
  deptRows.forEach((dept, idx) => {
    const row = 20 + idx;
    dash.cell(row, 1).value(dept.departement);
    const isHorsEffectif = dept.departement === HORS_EFFECTIF_DEPT;
    // B–E : formules COUNTIFS — Hors effectif = non-employés en maison
    for (let col = 2; col <= 5; col++) {
      const typeHdr = `${colLetter(col)}$19`;
      const formula = isHorsEffectif
        ? `COUNTIFS(${listeDept},$A${row},${listeType},${typeHdr},${listeStatutCol},"${HORS_EFFECTIF_DEPT}")`
        : `COUNTIFS(${listeDept},$A${row},${listeType},${typeHdr},${listeStatutCol},"Employé",${listeVillaCol},"<>")`;
      setFormula(dash, row, col, formula);
    }
    setFormula(dash, row, 6, `SUM(B${row}:E${row})`);
  });

  // Ligne Total (31)
  dash.cell(31, 1).value('Total');
  const lastDeptRow = deptRows.length ? 19 + deptRows.length : 20;
  if (deptRows.length) {
    setFormula(dash, 31, 2, `SUM(B20:B${lastDeptRow})`);
    setFormula(dash, 31, 3, `SUM(C20:C${lastDeptRow})`);
    setFormula(dash, 31, 4, `SUM(D20:D${lastDeptRow})`);
    setFormula(dash, 31, 5, `SUM(E20:E${lastDeptRow})`);
    setFormula(dash, 31, 6, `SUM(F20:F${lastDeptRow})`);
  } else {
    for (let c = 2; c <= 6; c++) dash.cell(31, c).value(0);
  }
}

/**
 * Remplit le template Village.
 * Dashboard : formules uniquement — graphiques Excel du template préservés.
 * Pas de round-trip ExcelJS (détruit les charts et ralentit l’export).
 */
export async function buildVillageExportBuffer(
  employees: Employee[],
  dependants: Dependant[],
  maisons: VillageMaison[],
  tailles: VillageTaille[],
  history: VillageAffectationHistoryEntry[] = [],
  suggestions: VillageAffectationSuggestion[] = [],
): Promise<Buffer> {
  const templatePath = VILLAGE_EXPORT_TEMPLATE_PATH;
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template introuvable : ${templatePath}. Placez ${EXPORT_TEMPLATE_FILES.village} dans ${getExportTemplatesDirectory()}.`,
    );
  }

  const zamba = buildZambaAgentsFromEmployees(employees, dependants);
  const { village, kimpese } = splitVillageKimpese(zamba);
  const occupancy = buildMaisonOccupancy(maisons, tailles, village, dependants);
  const stats = buildVillageDashboardStats(employees, dependants, maisons, tailles);
  const occupied = occupancy.filter((m) => m.occupied);
  const vacant = occupancy.filter((m) => !m.occupied);
  const listeAgents = [...village, ...kimpese];

  const workbook = await XlsxPopulate.fromFileAsync(templatePath);

  // Liste
  const listeSheet = workbook.sheet('Liste');
  clearSheetData(listeSheet, 2, LISTE_HEADERS.length);
  for (let col = 1; col <= LISTE_HEADERS.length; col++) {
    listeSheet.cell(1, col).value(LISTE_HEADERS[col - 1] ?? '');
  }
  const listeData = [
    ...familyListeRows(listeAgents, dependants),
    ...horsEffectifListeRows(occupancy),
  ];
  writeAoa(listeSheet, listeData, 2);
  const listeLast = listeData.length ? 1 + listeData.length : 1;

  // Maisons occupees — titre L1, en-têtes L2, données dès L3
  const occSheet = workbook.sheet('Maisons occupees');
  clearSheetData(occSheet, 3, 8);
  for (let col = 1; col <= MAISON_HEADERS.length; col++) {
    occSheet.cell(2, col).value(MAISON_HEADERS[col - 1] ?? '');
  }
  const occData = maisonRows(occupied, 'Occupée');
  writeAoa(occSheet, occData, 3);
  const occFirst = 3;
  const occLast = occData.length ? 2 + occData.length : 3;

  // Maisons vides — en-têtes L1, données dès L2
  const videSheet = workbook.sheet('Maisons vides');
  clearSheetData(videSheet, 2, 8);
  for (let col = 1; col <= MAISON_HEADERS.length; col++) {
    videSheet.cell(1, col).value(MAISON_HEADERS[col - 1] ?? '');
  }
  const videData = maisonRows(vacant, 'Vide');
  writeAoa(videSheet, videData, 2);
  const videFirst = 2;
  const videLast = videData.length ? 1 + videData.length : 2;

  // Dashboard — formules seules, graphiques intacts
  const dashSheet = workbook.sheet('Dashboard');
  fillDashboardFormulas(
    dashSheet,
    stats,
    occFirst,
    occLast,
    videFirst,
    videLast,
    listeLast,
  );

  // Historique
  const histoSheet = applyListeHeaderStyleToSheet(
    workbook,
    'Historique affectation',
    [...HISTO_HEADERS],
  );
  clearSheetData(histoSheet, 2, HISTO_HEADERS.length);
  writeAoa(histoSheet, historiqueRows(history), 2);

  // Suggestions
  const sugSheet = applyListeHeaderStyleToSheet(
    workbook,
    'Suggestions affectation',
    [...SUG_HEADERS],
  );
  clearSheetData(sugSheet, 2, SUG_HEADERS.length);
  writeAoa(sugSheet, suggestionExportRows(vacant, kimpese, suggestions), 2);

  const output = await workbook.outputAsync();
  return Buffer.from(output);
}
