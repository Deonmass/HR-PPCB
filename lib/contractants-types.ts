/** Contractants externes et leurs employés. */

export const CONTRACTANT_EMPLOYEE_STATUTS = ['Permanent', 'Journalier'] as const;
export type ContractantEmployeeStatut = (typeof CONTRACTANT_EMPLOYEE_STATUTS)[number];

export const CONTRACTANT_SEXES = ['M', 'F'] as const;
export type ContractantSexe = (typeof CONTRACTANT_SEXES)[number];

export const CONTRACTANT_ETATS_CIVILS = [
  { id: 'M', label: 'Marié(e)' },
  { id: 'C', label: 'Célibataire' },
  { id: 'V', label: 'Veuf / Veuve' },
  { id: 'D', label: 'Divorcé(e)' },
] as const;

export type ContractantEtatCivilId = (typeof CONTRACTANT_ETATS_CIVILS)[number]['id'];

export interface ContractantEmployee {
  id: string;
  /** Noms et post-noms */
  nom: string;
  /** Vide si non renseigné à l’import. */
  sexe: ContractantSexe | '';
  lieuAffectation: string;
  fonction: string;
  departement: string;
  telephone: string;
  etatCivil: ContractantEtatCivilId;
  /** Permanent ou Journalier */
  statut: ContractantEmployeeStatut;
  createdAt: string;
  updatedAt: string;
}

export interface Contractant {
  id: string;
  denomination: string;
  typeService: string;
  employees: ContractantEmployee[];
  createdAt: string;
  updatedAt: string;
}

export interface ContractantInput {
  denomination: string;
  typeService: string;
}

export interface ContractantEmployeeInput {
  nom: string;
  /** Vide si absent dans le fichier Excel. */
  sexe: ContractantSexe | '';
  lieuAffectation: string;
  fonction: string;
  departement: string;
  telephone: string;
  etatCivil: ContractantEtatCivilId;
  statut: ContractantEmployeeStatut;
}

export function isContractantSexe(value: string): value is ContractantSexe {
  return CONTRACTANT_SEXES.includes(value as ContractantSexe);
}

export function isContractantEtatCivil(value: string): value is ContractantEtatCivilId {
  return CONTRACTANT_ETATS_CIVILS.some((item) => item.id === value);
}

export function isContractantEmployeeStatut(value: string): value is ContractantEmployeeStatut {
  return CONTRACTANT_EMPLOYEE_STATUTS.includes(value as ContractantEmployeeStatut);
}

export function etatCivilLabel(id: string): string {
  return CONTRACTANT_ETATS_CIVILS.find((item) => item.id === id)?.label || id || '—';
}

/** Icône / couleur de carte selon le type de service. */
export function resolveContractantServiceStyle(typeService: string): {
  kind: 'nettoyage' | 'placement' | 'securite' | 'catering' | 'transport' | 'travaux' | 'default';
  color: string;
} {
  const t = typeService.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/nettoy|menage|hygien|cleaning/.test(t)) {
    return { kind: 'nettoyage', color: '#0d9488' };
  }
  if (/placement|interim|recrut|rh|personnel/.test(t)) {
    return { kind: 'placement', color: '#2563eb' };
  }
  if (/gardien|securit|surveill|guard/.test(t)) {
    return { kind: 'securite', color: '#b45309' };
  }
  if (/catering|restau|cuisine|cantine|food/.test(t)) {
    return { kind: 'catering', color: '#db2777' };
  }
  if (/transport|logisti|camion|fleet/.test(t)) {
    return { kind: 'transport', color: '#7c3aed' };
  }
  if (/travaux|construct|batiment|genie/.test(t)) {
    return { kind: 'travaux', color: '#ea580c' };
  }
  return { kind: 'default', color: '#e30613' };
}
