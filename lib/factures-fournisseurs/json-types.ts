import type { FactureDashboard, FactureSuivi } from './types';
import type { Fournisseur } from '../fournisseurs-types';

export interface FacturesJsonStoreData {
  factures: FactureSuivi[];
  nextFactureSeq: number;
}

export interface FournisseursJsonStoreData {
  fournisseurs: Fournisseur[];
  nextFournisseurSeq: number;
}

export interface FacturesBundleJsonStoreData {
  factures: FactureSuivi[];
  dashboard: FactureDashboard;
}
