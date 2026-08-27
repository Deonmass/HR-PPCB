/**
 * Fichiers sources EXCO — uploadés depuis l’onglet Params.
 * Manico (Mco) + Quarico (Qco) sont toujours lus ensemble dans chaque fichier.
 * New report.xlsx est bundlé (feuille BASE affichée dans l’onglet BASE).
 */
export type ExcoSourceFileId =
  | 'componentPostedUnits'
  | 'leaveBalances'
  | 'engagementsTerminations'
  | 'newReport'; // interne / legacy — non exposé dans Params

export interface ExcoSourceFileDef {
  id: ExcoSourceFileId;
  label: string;
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
    description: 'Overtime Manico + Quarico — heures et montants FC (toutes feuilles).',
  },
  {
    id: 'leaveBalances',
    label: 'Leave Balances',
    exampleName: 'Leave Balances_July 2026.xlsx',
    required: true,
    accept: '.xlsx,.xlsm,.xls',
    description: 'Congés Annual — Closing Balance + Value (Manico + Quarico).',
  },
  {
    id: 'engagementsTerminations',
    label: 'New Engagements and Terminations',
    exampleName: 'New Engagements and Terminations_July 2026.xlsx',
    required: true,
    accept: '.xlsx,.xlsm,.xls',
    description: 'Entrées / sorties — Employment Date, Termination Date, Reason (Mco + Qco).',
  },
];
