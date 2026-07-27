import * as XLSX from 'xlsx';
import type { FactureSuiviInput } from '@/lib/factures-fournisseurs/types';
import { formatDateCell, parseMontant } from '@/lib/factures-fournisseurs/utils';

export interface ParsedFacturesImport {
  rows: FactureSuiviInput[];
  sheetName: string;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function findColumn(headers: string[], candidates: string[]): number {
  const exact = headers.findIndex((header) => candidates.some((c) => header === c));
  if (exact >= 0) return exact;
  return headers.findIndex((header) =>
    candidates.some((c) => c.length >= 2 && header.includes(c)),
  );
}

function cell(row: unknown[], col: number): unknown {
  if (col < 0) return '';
  return row[col];
}

/**
 * Parse an Excel file matching:
 * DATE | SOCIETE | FACTURE | MONTANT | Echeance | PR | DATE PR | P.O | DATE PO | GRN | DATE GRN | payment | DATE PYM | Statut
 */
export function parseFacturesSuiviImportBuffer(buffer: ArrayBuffer): ParsedFacturesImport {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => /facture/i.test(name)) ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error('Feuille Excel introuvable');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  if (!rows.length) throw new Error('Fichier vide');

  const headerRowIndex = rows.findIndex((row) => {
    const joined = row.map(normalizeHeader).join('|');
    return joined.includes('facture') && (joined.includes('societe') || joined.includes('montant'));
  });
  if (headerRowIndex < 0) {
    throw new Error('En-têtes introuvables (DATE, SOCIETE, FACTURE, …)');
  }

  const headers = (rows[headerRowIndex] as unknown[]).map((h) => normalizeHeader(h));
  const dateCol = findColumn(headers, ['date']);
  const societeCol = findColumn(headers, ['societe', 'fournisseur', 'supplier']);
  const factureCol = findColumn(headers, ['facture', 'invoice', 'nofacture']);
  const montantCol = findColumn(headers, ['montant', 'amount', 'total']);
  const echeanceCol = findColumn(headers, ['echeance', 'duedate', 'echeance']);
  const prCol = findColumn(headers, ['pr', 'purchaserequest']);
  const datePrCol = findColumn(headers, ['datepr']);
  const poCol = findColumn(headers, ['po', 'p.o', 'purchaseorder']);
  const datePoCol = findColumn(headers, ['datepo']);
  const grnCol = findColumn(headers, ['grn']);
  const dateGrnCol = findColumn(headers, ['dategrn']);
  const paymentCol = findColumn(headers, ['payment', 'paiement']);
  const datePymCol = findColumn(headers, ['datepym', 'datepayment', 'datepaiement']);
  const statutCol = findColumn(headers, ['statut', 'status']);

  if (factureCol < 0) throw new Error('Colonne FACTURE introuvable');
  if (societeCol < 0) throw new Error('Colonne SOCIETE introuvable');

  const parsed: FactureSuiviInput[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] as unknown[];
    const facture = String(cell(row, factureCol) ?? '').trim();
    const societe = String(cell(row, societeCol) ?? '').trim();
    if (!facture && !societe) continue;

    const statutRaw = String(cell(row, statutCol) ?? '').trim();

    parsed.push({
      date: formatDateCell(cell(row, dateCol)),
      societe,
      facture,
      montant: parseMontant(cell(row, montantCol)),
      echeance: formatDateCell(cell(row, echeanceCol)),
      pr: String(cell(row, prCol) ?? '').trim(),
      datePr: formatDateCell(cell(row, datePrCol)),
      po: String(cell(row, poCol) ?? '').trim(),
      datePo: formatDateCell(cell(row, datePoCol)),
      grn: String(cell(row, grnCol) ?? '').trim(),
      dateGrn: formatDateCell(cell(row, dateGrnCol)),
      payment: String(cell(row, paymentCol) ?? '').trim(),
      datePym: formatDateCell(cell(row, datePymCol)),
      commentaire: statutRaw,
    });
  }

  if (!parsed.length) throw new Error('Aucune ligne facture reconnue');
  return { rows: parsed, sheetName };
}
