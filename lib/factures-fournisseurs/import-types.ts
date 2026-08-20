export type FactureImportSkipReason = 'invalid' | 'already-exists';

export interface FactureImportSkippedRow {
  date: string;
  societe: string;
  facture: string;
  montant: number | null;
  pr: string;
  po: string;
  payment: string;
  reason: FactureImportSkipReason;
  comment: string;
}

export const FACTURE_IMPORT_SKIP_COMMENTS = {
  invalid: 'Ligne incomplète — société ou n° de facture manquant',
  alreadyExists: 'Déjà enregistrée — non réimportée',
} as const;

export interface FactureImportResult {
  imported: number;
  skipped: number;
  sourceRowCount: number;
  uniqueRowCount: number;
  skippedRows: FactureImportSkippedRow[];
}

export function skippedRowFromInput(
  row: {
    date?: string;
    societe?: string;
    facture?: string;
    montant?: number | null;
    pr?: string;
    po?: string;
    payment?: string;
  },
  reason: FactureImportSkipReason,
  comment: string,
): FactureImportSkippedRow {
  return {
    date: String(row.date ?? ''),
    societe: String(row.societe ?? ''),
    facture: String(row.facture ?? ''),
    montant: row.montant ?? null,
    pr: String(row.pr ?? ''),
    po: String(row.po ?? ''),
    payment: String(row.payment ?? ''),
    reason,
    comment,
  };
}
