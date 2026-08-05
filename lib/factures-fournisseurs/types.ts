/** Statuts simplifiés : unpaid / paid (selon la colonne Payment / PYTMT). */
export const FACTURE_STAGES = ['unpaid', 'paid'] as const;

export type FactureStage = (typeof FACTURE_STAGES)[number];

export type FactureSuiviTab = 'dashboard' | FactureStage;

export const FACTURE_STAGE_LABELS: Record<FactureStage, string> = {
  unpaid: 'unpaid',
  paid: 'paid',
};

export const FACTURE_TAB_LABELS: Record<FactureSuiviTab, string> = {
  dashboard: 'Dashboard',
  unpaid: 'Unpaid',
  paid: 'Paid',
};

export const FACTURE_STAGE_COMMENTS: Record<FactureStage, string> = {
  unpaid: 'Facture non payée.',
  paid: 'Facture payée.',
};

export type AssignStep = 'pr' | 'po' | 'grn' | 'payment';

/** @deprecated Pipeline multi-étapes retiré — conservé pour compat API. */
export function nextMissingStage(_stage: FactureStage): AssignStep | null {
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
  /** unpaid | paid */
  statut: FactureStage;
  statutLabel: string;
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
  po?: string;
  payment?: string;
  commentaire?: string;
}

export interface FactureStageKpi {
  stage: FactureStage;
  label: string;
  count: number;
  montant: number;
}

/** Étapes analytiques dashboard (Reçus / PR / PO / Paid). */
export type FacturePipelineStep = 'recu' | 'pr' | 'po' | 'paid';

export const FACTURE_PIPELINE_STEPS = ['recu', 'pr', 'po', 'paid'] as const;

export const FACTURE_PIPELINE_LABELS: Record<FacturePipelineStep, string> = {
  recu: 'Reçus',
  pr: 'PR',
  po: 'PO',
  paid: 'Paid',
};

/** Commentaires courts selon la position pipeline. */
export const FACTURE_PIPELINE_COMMENTS: Record<FacturePipelineStep, string> = {
  recu: 'Reçue — en attente du PR.',
  pr: 'Au PR — en attente du PO.',
  po: 'Au PO — en attente de paiement.',
  paid: 'Facture payée.',
};

export interface FacturePipelineKpi {
  step: FacturePipelineStep;
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
  /** Factures unpaid au stade PR (PR sans PO). */
  pr: number;
  montantPr: number;
  /** Factures unpaid au stade PO. */
  po: number;
  montantPo: number;
  /** Factures unpaid reçues sans PR ni PO. */
  recu: number;
  montantRecu: number;
  parEtape: FactureStageKpi[];
  parPipeline: FacturePipelineKpi[];
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
