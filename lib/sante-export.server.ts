import 'server-only';

import JSZip from 'jszip';
import XlsxPopulate from 'xlsx-populate';
import { SANTE_PATHOLOGIES_TEMPLATE_PATH } from './excel-export-template-paths';
import type { SanteVisit } from './sante-types';
import { buildSanteDashboard, formatSanteExcelMonthLabel } from './sante-utils';

const DATA_SHEET = 'Données';
const DASH_SHEET = 'Dashboard';
const FIRST_ROW = 2;
const TEMPLATE_LAST_ROW = 198;

const COL = {
  date: 1,
  nom: 2,
  postnom: 3,
  sexe: 4,
  age: 5,
  type: 6,
  pathologie: 7,
  traitement: 8,
  reference: 9,
  annee: 10,
  mois: 11,
  date2: 12,
} as const;

function excelSerialFromIso(iso: string): number {
  const date = new Date(`${iso}T00:00:00Z`);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((date.getTime() - epoch) / 86_400_000);
}

function setValue(
  sheet: { cell(row: number, col: number): { value(v?: unknown): unknown; style(k: string, v?: unknown): unknown } },
  row: number,
  col: number,
  value: unknown,
  numFmt?: string,
) {
  const cell = sheet.cell(row, col);
  cell.value(value ?? null);
  if (numFmt) {
    try {
      cell.style('numberFormat', numFmt);
    } catch {
      // ignore
    }
  }
}

function importRow(visit: SanteVisit): number {
  const match = /^sante-imp-(\d+)$/.exec(visit.id);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Même ordre que la feuille Données du fichier source (ligne Excel). */
function sortLikeSourceFile(visits: SanteVisit[]): SanteVisit[] {
  return visits.slice().sort((a, b) => {
    const ra = importRow(a);
    const rb = importRow(b);
    if (ra !== rb) return ra - rb;
    return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  });
}

async function patchExportWorkbook(buffer: Buffer, lastRow: number): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const autoSort =
    '<autoSortScope><pivotArea dataOnly="0" outline="0" fieldPosition="0"><references count="1"><reference field="4294967294" count="1" selected="0"><x v="0"/></reference></references></pivotArea></autoSortScope>';
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.xml')) continue;
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async('string');
    let next = xml;
    if (lastRow > TEMPLATE_LAST_ROW && (name.includes('tables/table') || name.includes('pivotCacheDefinition'))) {
      next = next.replace(/ref="A1:L\d+"/g, `ref="A1:L${lastRow}"`);
    }
    if (name.includes('pivotTables/pivotTable')) {
      next = next.replace(
        /<pivotField axis="axisRow" showAll="0"(?! sortType)/g,
        `<pivotField axis="axisRow" showAll="0" sortType="descending"`,
      );
      next = next.replace(
        /<pivotField axis="axisRow" showAll="0" sortType="descending">(?!<autoSortScope>)/g,
        `<pivotField axis="axisRow" showAll="0" sortType="descending">${autoSort}`,
      );
    }
    if (next !== xml) zip.file(name, next);
  }
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

export async function buildSanteExportBuffer(visits: SanteVisit[]): Promise<Buffer> {
  const workbook = await XlsxPopulate.fromFileAsync(SANTE_PATHOLOGIES_TEMPLATE_PATH);
  const data = workbook.sheet(DATA_SHEET);
  const ordered = sortLikeSourceFile(visits);
  const lastRow = FIRST_ROW + ordered.length - 1;

  for (let row = FIRST_ROW; row <= Math.max(lastRow, TEMPLATE_LAST_ROW); row += 1) {
    for (let col = 1; col <= 12; col += 1) {
      data.cell(row, col).value(null);
    }
  }

  ordered.forEach((visit, index) => {
    const row = FIRST_ROW + index;
    setValue(data, row, COL.date, excelSerialFromIso(visit.date), 'mm-dd-yy');
    setValue(data, row, COL.nom, visit.nom === '—' ? null : visit.nom);
    setValue(data, row, COL.postnom, visit.postnom || null);
    setValue(data, row, COL.sexe, visit.sexe || null);
    setValue(data, row, COL.age, visit.age);
    setValue(data, row, COL.type, visit.typeMalade);
    setValue(data, row, COL.pathologie, visit.pathologie);
    setValue(data, row, COL.traitement, visit.traitement || null);
    setValue(data, row, COL.reference, visit.reference || 'NON');
    setValue(data, row, COL.annee, visit.year);
    setValue(data, row, COL.mois, formatSanteExcelMonthLabel(visit.year, visit.month));
    setValue(data, row, COL.date2, visit.date);
  });

  const dashboard = buildSanteDashboard(ordered);
  const dash = workbook.sheet(DASH_SHEET);
  if (dash) {
    setValue(dash, 2, 26, dashboard.total);
    setValue(dash, 2, 27, dashboard.hommes);
    setValue(dash, 2, 28, dashboard.femmes);
  }

  const raw = await workbook.outputAsync();
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
  return patchExportWorkbook(buffer, lastRow);
}

export function buildSanteExportFilename(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `Fiche_pathologies_${stamp}.xlsx`;
}
