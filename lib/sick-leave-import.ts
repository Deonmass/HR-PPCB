import 'server-only';

import ExcelJS from 'exceljs';
import type { SickLeaveBalance } from './sick-leave-types';
import { normalizeSickMatricule, normalizeSickProvenance, parseSickMonth } from './sick-leave-utils';

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('result' in o && o.result != null) return cellText(o.result);
    if ('text' in o && o.text != null) return String(o.text).trim();
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((row) => row.text || '').join('').trim();
    }
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'result' in value) {
    return cellNumber((value as { result: unknown }).result);
  }
  const n = Number(String(cellText(value)).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function headerIndex(row: ExcelJS.Row): Record<string, number> {
  const map: Record<string, number> = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = normalizeHeader(cellText(cell.value));
    if (key) map[key] = col;
  });
  return map;
}

function pickCol(map: Record<string, number>, ...aliases: string[]): number | null {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (map[key] != null) return map[key];
    if (key.length <= 2) continue;
    const found = Object.keys(map).find((item) => item === key || item.startsWith(`${key} `) || item.includes(key));
    if (found) return map[found];
  }
  return null;
}

function uid(): string {
  return `slb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function parseSickLeaveWorkbook(
  buffer: Buffer,
  year: number,
  sourceFile: string,
): Promise<SickLeaveBalance[]> {
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error('Année d’import invalide');
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const now = new Date().toISOString();
  const merged = new Map<string, SickLeaveBalance>();

  for (const sheet of workbook.worksheets) {
    const title = normalizeHeader(sheet.name || '');
    if (title.includes('resume') || title.includes('attestation data') || title === 'sheet4') continue;
    const isZamba = title.includes('zamba');
    let headerRow = 0;
    let cols: Record<string, number> = {};
    const maxScan = Math.min(sheet.rowCount || 0, 20);
    for (let r = 1; r <= maxScan; r += 1) {
      const map = headerIndex(sheet.getRow(r));
      const emp = pickCol(map, 'emp number', 'matricule', 'matr');
      const days = pickCol(map, 'sick leave', 'sick leave na', 'jours');
      const month = pickCol(map, 'mois', 'month', 'm');
      if (emp && (days || month)) {
        headerRow = r;
        cols = map;
        break;
      }
    }
    if (!headerRow) continue;
    const empCol = pickCol(cols, 'emp number', 'matricule', 'matr');
    const firstCol = pickCol(cols, 'first name', 'prenom');
    const lastCol = pickCol(cols, 'last name', 'nom');
    const deptCol = pickCol(cols, 'department', 'departement');
    const typeCol = pickCol(cols, 'leave type');
    const descCol = pickCol(cols, 'leave description');
    const daysCol = pickCol(cols, 'sick leave na', 'sick leave', 'jours');
    const locCol = pickCol(cols, 'location', 'site');
    const moisCol = pickCol(cols, 'mois', 'month');
    const mCol = pickCol(cols, 'm');
    const attCol = pickCol(cols, 'attestation');
    const obsCol = pickCol(cols, 'observations', 'observation');
    const provCol = pickCol(cols, 'provenance pathologie', 'provenance');
    const statutCol = pickCol(cols, 'statut', 'status');
    if (!empCol || !daysCol) continue;

    for (let r = headerRow + 1; r <= (sheet.rowCount || 0); r += 1) {
      const row = sheet.getRow(r);
      const matricule = normalizeSickMatricule(cellText(row.getCell(empCol).value));
      if (!matricule) continue;
      const month = parseSickMonth(moisCol ? cellText(row.getCell(moisCol).value) : '')
        || parseSickMonth(mCol ? row.getCell(mCol).value : '')
        || parseSickMonth(mCol ? cellText(row.getCell(mCol).value) : '');
      if (!month) continue;
      const days = cellNumber(row.getCell(daysCol).value);
      if (days == null) continue;
      const firstName = firstCol ? cellText(row.getCell(firstCol).value) : '';
      const lastName = lastCol ? cellText(row.getCell(lastCol).value) : '';
      const nom = [firstName, lastName].filter(Boolean).join(' ').trim() || matricule;
      const key = `${matricule}|${year}|${String(month).padStart(2, '0')}`;
      const next: SickLeaveBalance = {
        id: uid(),
        matricule,
        firstName,
        lastName,
        nom,
        department: deptCol ? cellText(row.getCell(deptCol).value) : '',
        site: locCol ? cellText(row.getCell(locCol).value) : '',
        leaveType: typeCol ? cellText(row.getCell(typeCol).value) : 'Sick',
        leaveDescription: descCol ? cellText(row.getCell(descCol).value) : '',
        year,
        month,
        days,
        attestationImported: attCol ? cellText(row.getCell(attCol).value) : '',
        observations: obsCol ? cellText(row.getCell(obsCol).value) : '',
        provenance: normalizeSickProvenance(provCol ? cellText(row.getCell(provCol).value) : ''),
        statut: statutCol ? cellText(row.getCell(statutCol).value) : '',
        sourceSheet: isZamba ? 'Zamba Data' : sheet.name || 'Leave balance',
        sourceFile,
        updatedAt: now,
      };
      const existing = merged.get(key);
      const preferDays = (primary: number, fallback: number) =>
        (primary < 0 || primary !== 0 ? primary : fallback);
      if (!existing) {
        merged.set(key, next);
      } else if (isZamba) {
        merged.set(key, {
          ...existing,
          days: preferDays(existing.days, next.days),
          attestationImported: next.attestationImported || existing.attestationImported,
          observations: next.observations || existing.observations,
          provenance: next.provenance || existing.provenance,
          statut: next.statut || existing.statut,
          sourceSheet: existing.sourceSheet.includes('Zamba')
            ? existing.sourceSheet
            : `${existing.sourceSheet} + Zamba Data`,
          firstName: existing.firstName || next.firstName,
          lastName: existing.lastName || next.lastName,
          nom: existing.nom || next.nom,
          department: existing.department || next.department,
          site: existing.site || next.site,
        });
      } else {
        merged.set(key, {
          ...next,
          id: existing.id,
          days: preferDays(next.days, existing.days),
          attestationImported: existing.attestationImported || next.attestationImported,
          observations: existing.observations || next.observations,
          provenance: existing.provenance || next.provenance,
          statut: existing.statut || next.statut,
          sourceSheet: existing.sourceSheet.includes('Zamba')
            ? `${next.sourceSheet} + Zamba Data`
            : next.sourceSheet,
        });
      }
    }
  }

  if (!merged.size) {
    throw new Error('Aucune ligne leave balance reconnue (colonnes Emp Number, Sick leave, Mois).');
  }
  return [...merged.values()];
}
