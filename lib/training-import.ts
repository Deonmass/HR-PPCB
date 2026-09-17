import 'server-only';

import ExcelJS from 'exceljs';
import type { TrainingCostEntry } from './training-types';

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
      return (o.richText as Array<{ text?: string }>).map((r) => r.text || '').join('').trim();
    }
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'result' in value) {
    return cellNumber((value as { result: unknown }).result);
  }
  const n = Number(String(cellText(value)).replace(/[\s,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function cellDate(value: unknown): { iso: string; year: number; month: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return {
      iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      year: y,
      month: m,
    };
  }
  if (typeof value === 'object' && value && 'result' in value) {
    return cellDate((value as { result: unknown }).result);
  }
  const raw = cellText(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, year: Number(iso[1]), month: Number(iso[2]) };
  }
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const d = Number(fr[1]);
    const m = Number(fr[2]);
    const y = Number(fr[3]);
    return {
      iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      year: y,
      month: m,
    };
  }
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return cellDate(dt);
  return null;
}

function normalizeCostCenterType(raw: string): string {
  const t = raw.trim();
  if (/^hq$/i.test(t) || /head\s*office/i.test(t)) return 'HQ';
  if (/^plant$/i.test(t)) return 'Plant';
  return t || 'HQ';
}

function headerIndex(row: ExcelJS.Row): Record<string, number> {
  const map: Record<string, number> = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = cellText(cell.value).toLowerCase().replace(/\s+/g, ' ');
    if (key) map[key] = col;
  });
  return map;
}

function findCol(headers: Record<string, number>, candidates: string[]): number | null {
  for (const c of candidates) {
    const hit = headers[c.toLowerCase()];
    if (hit) return hit;
  }
  for (const [k, col] of Object.entries(headers)) {
    if (candidates.some((c) => k.includes(c.toLowerCase()))) return col;
  }
  return null;
}

/**
 * Parse « Trainee cost …xlsx » (or any sheet with Posting Date / Amount / Cost center type / Text).
 */
export async function parseTraineeCostWorkbook(
  buffer: Buffer,
): Promise<Array<Omit<TrainingCostEntry, 'id' | 'importedAt'>>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no sheets');

  const headers = headerIndex(ws.getRow(1));
  const colDate = findCol(headers, ['posting date', 'date']);
  const colAmount = findCol(headers, ['amount in local currency', 'amount', 'montant']);
  const colType = findCol(headers, ['cost center type', 'cc type', 'type']);
  const colText = findCol(headers, ['text', 'description', 'libelle', 'libellé']);
  const colDoc = findCol(headers, ['document number', 'document', 'doc']);
  const colCc = findCol(headers, ['cost center']);

  if (!colDate || !colAmount) {
    throw new Error('Colonnes requises manquantes : Posting Date, Amount in local currency');
  }

  const out: Array<Omit<TrainingCostEntry, 'id' | 'importedAt'>> = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const date = cellDate(row.getCell(colDate).value);
    const amount = cellNumber(row.getCell(colAmount).value);
    if (!date || amount == null) return;
    const typeRaw = colType ? cellText(row.getCell(colType).value) : 'HQ';
    const text = colText ? cellText(row.getCell(colText).value) : '';
    const documentNumber = colDoc ? cellText(row.getCell(colDoc).value) : '';
    const costCenter = colCc ? cellText(row.getCell(colCc).value) : '';
    out.push({
      postingDate: date.iso,
      amount,
      costCenterType: normalizeCostCenterType(typeRaw),
      text: text || '—',
      documentNumber: documentNumber || undefined,
      costCenter: costCenter || undefined,
      year: date.year,
      month: date.month,
    });
  });

  if (!out.length) throw new Error('Aucune ligne de coût formation trouvée dans le fichier');
  return out;
}
