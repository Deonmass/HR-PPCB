import type { FactureImportSkippedRow } from '@/lib/factures-fournisseurs/import-types';

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function skippedFacturesImportFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `FACTURES_NON_IMPORTEES_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}

/** CSV UTF-8 (Excel) des lignes non importées. */
export function downloadSkippedFacturesImport(rows: FactureImportSkippedRow[]): void {
  const header = ['DATE', 'SOCIETE', 'FACTURE', 'MONTANT', 'PR', 'P.O', 'PYTMT', 'COMMENTAIRE'];
  const lines = [
    header.join(';'),
    ...rows.map((row) =>
      [
        csvCell(row.date),
        csvCell(row.societe),
        csvCell(row.facture),
        csvCell(row.montant),
        csvCell(row.pr),
        csvCell(row.po),
        csvCell(row.payment || 'Unpaid'),
        csvCell(row.comment),
      ].join(';'),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = skippedFacturesImportFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}
