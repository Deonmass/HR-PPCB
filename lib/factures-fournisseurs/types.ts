/** Étapes du pipeline facture fournisseur (ordre chronologique). */
export const FACTURE_STAGES = ['facture', 'pr', 'po', 'posted', 'paid'] as const;

export type FactureStage = (typeof FACTURE_STAGES)[number];

export type FactureSuiviTab = 'dashboard' | FactureStage;

/**
 * Libellés affichés dans la colonne STATUT.
 * PR et PO → « unpaid » ; GRN → « Posted and unpaid » ; paiement → « paid ».
 */
export const FACTURE_STAGE_LABELS: Record<FactureStage, string> = {
  facture: 'Facture reçue',
  pr: 'unpaid',
  po: 'unpaid',
  posted: 'Posted and unpaid',
  paid: 'paid',
};

/** Libellés des onglets / pipeline (plus parlants que le statut seul). */
export const FACTURE_TAB_LABELS: Record<FactureSuiviTab, string> = {
  dashboard: 'Dashboard',
  facture: 'Factures',
  pr: 'PR',
  po: 'PO',
  posted: 'Posted & unpaid',
  paid: 'Paid',
};

/** Commentaires français selon l’étape. */
export const FACTURE_STAGE_COMMENTS: Record<FactureStage, string> = {
  facture: 'La facture a été reçue et est en attente de création du PR.',
  pr: 'Le PR a été renseigné ; facture non payée, en attente du bon de commande (PO).',
  po: 'Le PO a été renseigné ; facture non payée, en attente du bon de réception (GRN).',
  posted: 'Le GRN a été renseigné ; facture comptabilisée et non payée.',
  paid: 'Le paiement a été enregistré ; facture payée.',
};

export type AssignStep = 'pr' | 'po' | 'grn' | 'payment';

/** Prochaine étape à renseigner depuis l’onglet courant. */
export function nextMissingStage(stage: FactureStage): AssignStep | null {
  if (stage === 'facture') return 'pr';
  if (stage === 'pr') return 'po';
  if (stage === 'po') return 'grn';
  if (stage === 'posted') return 'payment';
  return null;
}

export interface FactureSuivi {
  id: string;
  date: string;
  societe: string;
  facture: string;
  montant: number | null;
  echeance: string;
  pr: string;
  datePr: string;
  po: string;
  datePo: string;
  grn: string;
  dateGrn: string;
  payment: string;
  datePym: string;
  /** Étape courante du pipeline. */
  statut: FactureStage;
  /** Libellé principal (ex. unpaid / Posted and unpaid / paid). */
  statutLabel: string;
  /** Sous-titre selon la position. */
  commentaire: string;
}

export interface FactureSuiviInput {
  id?: string;
  date?: string;
  societe?: string;
  facture?: string;
  montant?: number | null;
  echeance?: string;
  pr?: string;
  datePr?: string;
  po?: string;
  datePo?: string;
  grn?: string;
  dateGrn?: string;
  payment?: string;
  datePym?: string;
  commentaire?: string;
}

export interface AssignStepPayload {
  step: AssignStep;
  numero: string;
  date: string;
  ids: string[];
}

export interface FactureBatchLineInput {
  date?: string;
  societe?: string;
  facture?: string;
  montant?: number | null;
  echeance?: string;
  pr?: string;
  datePr?: string;
}

export interface FactureStageKpi {
  stage: FactureStage;
  label: string;
  count: number;
  montant: number;
}

export interface FactureDashboard {
  total: number;
  montantTotal: number;
  enCours: number;
  montantEnCours: number;
  posted: number;
  montantPosted: number;
  paid: number;
  montantPaid: number;
  enRetard: number;
  montantRetard: number;
  parEtape: FactureStageKpi[];
}

export interface FactureGroupNode {
  key: string;
  label: string;
  ref: string;
  date: string;
  count: number;
  montant: number;
  children?: FactureGroupNode[];
  factures?: FactureSuivi[];
}
