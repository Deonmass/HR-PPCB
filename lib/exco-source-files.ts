/**
 * Fichiers sources EXCO — ajouter ici les prochains fichiers à importer.
 * L’UI du formulaire de génération lit cette liste.
 */
export type ExcoSourceFileId = 'componentPostedUnits' | 'leaveBalances';

export interface ExcoSourceFileDef {
  id: ExcoSourceFileId;
  label: string;
  /** Nom d’exemple affiché à l’utilisateur. */
  exampleName: string;
  required: boolean;
  accept: string;
  description?: string;
}

export const EXCO_SOURCE_FILES: ExcoSourceFileDef[] = [
  {
    id: 'componentPostedUnits',
    label: 'Component Posted Units',
    exampleName: 'Component Posted Units_July 2026.xlsx',
    required: true,
    accept: '.xlsx,.xlsm,.xls',
    description: 'Overtime hours + FC amounts (2 company sheets)',
  },
  {
    id: 'leaveBalances',
    label: 'Leave Balances',
    exampleName: 'Leave Balances_July 2026.xlsx',
    required: true,
    accept: '.xlsx,.xlsm,.xls',
    description: 'Leave Type Annual · Closing Balance · provision',
  },
];
