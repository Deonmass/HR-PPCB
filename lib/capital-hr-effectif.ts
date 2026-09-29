import type { Contractant, ContractantEmployee } from './contractants-types';

function foldLieu(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCapitalHrContractantName(denomination: string): boolean {
  return /capital\s*hr/i.test(String(denomination || ''));
}

export function findCapitalHrContractant(contractants: Contractant[]): Contractant | null {
  return contractants.find((c) => isCapitalHrContractantName(c.denomination)) || null;
}

/** Sites de la base effectif Capital HR (Zamba + Kinshasa). */
export function isCapitalHrCoreLocation(lieu: string): boolean {
  const f = foldLieu(lieu);
  return f === 'zamba' || f === 'kinshasa';
}

export function isCapitalHrEmployeeActive(emp: Pick<ContractantEmployee, 'dateSortie'>): boolean {
  return !String(emp.dateSortie || '').trim();
}

/**
 * Effectif Capital HR : tous les agents actifs, tous sites
 * (Zamba, Kinshasa, Lubudi et les autres villes de la feuille Capital HR).
 */
export function isCapitalHrEffectifEmployee(
  emp: Pick<ContractantEmployee, 'lieuAffectation' | 'dateSortie'>,
): boolean {
  return isCapitalHrEmployeeActive(emp);
}

export function capitalHrEffectifEmployees(
  contractant: Contractant | null | undefined,
): ContractantEmployee[] {
  if (!contractant) return [];
  return (contractant.employees || [])
    .filter(isCapitalHrEffectifEmployee)
    .slice()
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Listes multi-contractants : agents sans date de sortie, tous sites. */
export function isContractantEffectifEmployee(
  emp: Pick<ContractantEmployee, 'lieuAffectation' | 'dateSortie'>,
  _contractantNom: string,
): boolean {
  return isCapitalHrEmployeeActive(emp);
}
