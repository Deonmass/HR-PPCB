import * as XLSX from 'xlsx';
import type { FactureSuiviInput } from '@/lib/factures-fournisseurs/types';
import {
  FACTURE_IMPORT_SKIP_COMMENTS,
  skippedRowFromInput,
  type FactureImportSkippedRow,
} from '@/lib/factures-fournisseurs/import-types';
import {
  factureImportIdentityKey,
  formatDateCell,
  normalizePaymentValue,
  parseMontant,
} from '@/lib/factures-fournisseurs/utils';

export type { FactureImportSkippedRow, FactureImportSkipReason, FactureImportResult } from '@/lib/factures-fournisseurs/import-types';
export { FACTURE_IMPORT_SKIP_COMMENTS, skippedRowFromInput } from '@/lib/factures-fournisseurs/import-types';

export interface ParsedFacturesImport {
  rows: FactureSuiviInput[];
  sheetName: string;
  sourceRowCount: number;
  invalidRows: FactureImportSkippedRow[];
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
    candidates.some((c) => c.length >= 3 && header.includes(c)),
  );
}

function cell(row: unknown[], col: number): unknown {
  if (col < 0) return '';
  return row[col];
}

function importRowKey(row: FactureSuiviInput): string {
  return factureImportIdentityKey(row);
}

function preferText(current: string | undefined, next: string | undefined): string {
  const a = String(current ?? '').trim();
  if (a) return a;
  return String(next ?? '').trim();
}

/**
 * Une ligne unique par SOCIETE + FACTURE + PR + P.O.
 * Les vrais doublons du fichier (même n°, même PR, même PO) sont fusionnés : montants additionnés.
 * Deux factures au même n° mais PR/PO différents restent deux lignes.
 */
export function consolidateDuplicateImportRows(rows: FactureSuiviInput[]): FactureSuiviInput[] {
  const byKey = new Map<string, FactureSuiviInput>();
  const order: string[] = [];

  for (const row of rows) {
    const facture = String(row.facture ?? '').trim();
    const societe = String(row.societe ?? '').trim();
    if (!facture || !societe) continue;

    const key = importRowKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, montant: row.montant ?? null });
      order.push(key);
      continue;
    }

    const left = existing.montant;
    const right = row.montant;
    const montant =
      left == null && right == null ? null : (left ?? 0) + (right ?? 0);

    byKey.set(key, {
      date: preferText(existing.date, row.date),
      societe: preferText(existing.societe, row.societe),
      facture: preferText(existing.facture, row.facture),
      montant,
      echeance: preferText(existing.echeance, row.echeance),
      pr: preferText(existing.pr, row.pr),
      datePr: preferText(existing.datePr, row.datePr),
      po: preferText(existing.po, row.po),
      datePo: preferText(existing.datePo, row.datePo),
      grn: preferText(existing.grn, row.grn),
      dateGrn: preferText(existing.dateGrn, row.dateGrn),
      payment: preferText(existing.payment, row.payment),
      datePym: preferText(existing.datePym, row.datePym),
      commentaire: preferText(existing.commentaire, row.commentaire),
    });
  }

  return order.map((key) => byKey.get(key)!);
}

/**
 * Parse Excel matching:
 * DATE | SOCIETE | FACTURE | MONTANT | PR | P.O | PYTMT
 * (legacy columns still accepted when present)
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
    throw new Error('En-têtes introuvables (DATE, SOCIETE, FACTURE, MONTANT, PR, P.O, PYTMT)');
  }

  const headers = (rows[headerRowIndex] as unknown[]).map((h) => normalizeHeader(h));
  const dateCol = findColumn(headers, ['date']);
  const societeCol = findColumn(headers, ['societe', 'fournisseur', 'supplier']);
  const factureCol = findColumn(headers, ['facture', 'invoice', 'nofacture']);
  const montantCol = findColumn(headers, ['montant', 'amount', 'total']);
  const prCol = findColumn(headers, ['pr', 'pi', 'purchaserequest']);
  const poCol = findColumn(headers, ['po', 'purchaseorder']);
  const paymentCol = findColumn(headers, ['pytmt', 'payment', 'paiement', 'pymt']);
  const commentaireCol = findColumn(headers, ['commentaire', 'comment', 'statut', 'status']);

  // Avoid matching DATE as DATE PR when only DATE exists
  const datePrCol = findColumn(headers, ['datepr']);
  const datePoCol = findColumn(headers, ['datepo']);
  const echeanceCol = findColumn(headers, ['echeance', 'duedate']);
  const grnCol = findColumn(headers, ['grn']);
  const dateGrnCol = findColumn(headers, ['dategrn']);
  const datePymCol = findColumn(headers, ['datepym', 'datepayment', 'datepaiement']);

  if (factureCol < 0) throw new Error('Colonne FACTURE introuvable');
  if (societeCol < 0) throw new Error('Colonne SOCIETE introuvable');

  const parsed: FactureSuiviInput[] = [];
  const invalidRows: FactureImportSkippedRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] as unknown[];
    const facture = String(cell(row, factureCol) ?? '').trim();
    const societe = String(cell(row, societeCol) ?? '').trim();
    if (!facture && !societe) continue;

    const input: FactureSuiviInput = {
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
      payment: normalizePaymentValue(String(cell(row, paymentCol) ?? '')),
      datePym: formatDateCell(cell(row, datePymCol)),
      commentaire: String(cell(row, commentaireCol) ?? '').trim(),
    };

    if (!facture || !societe) {
      invalidRows.push(skippedRowFromInput(
        input,
        'invalid',
        FACTURE_IMPORT_SKIP_COMMENTS.invalid,
      ));
      continue;
    }

    parsed.push(input);
  }

  if (!parsed.length && !invalidRows.length) throw new Error('Aucune ligne facture reconnue');
  return {
    rows: consolidateDuplicateImportRows(parsed),
    sheetName,
    sourceRowCount: parsed.length + invalidRows.length,
    invalidRows,
  };
}
