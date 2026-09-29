import type { Contractant, ContractantEmployee } from './contractants-types';
import { contractantEmployeeMatricule } from './contractants-types';
import type { Employee } from './types';
import { emptyEmployeeHrProfile } from './types';

export type FlatContractantEmployee = ContractantEmployee & {
  contractantId: string;
  contractantNom: string;
  typeService: string;
};

export function flattenContractantEmployees(contractants: Contractant[]): FlatContractantEmployee[] {
  const rows: FlatContractantEmployee[] = [];
  for (const c of contractants) {
    for (const e of c.employees) {
      rows.push({
        ...e,
        contractantId: c.id,
        contractantNom: c.denomination,
        typeService: c.typeService,
      });
    }
  }
  return rows;
}

/** Top 10 entrées récentes (embauche ou createdAt). */
export function topNewHires(employees: FlatContractantEmployee[], limit = 10): FlatContractantEmployee[] {
  return [...employees]
    .filter((e) => !e.dateSortie)
    .sort((a, b) => {
      const da = a.dateEmbauche || a.createdAt;
      const db = b.dateEmbauche || b.createdAt;
      return new Date(db).getTime() - new Date(da).getTime();
    })
    .slice(0, limit);
}

/** Sorties récentes (dateSortie renseignée). */
export function recentExits(employees: FlatContractantEmployee[], limit = 10): FlatContractantEmployee[] {
  return [...employees]
    .filter((e) => Boolean(e.dateSortie?.trim()))
    .sort((a, b) => new Date(b.dateSortie).getTime() - new Date(a.dateSortie).getTime())
    .slice(0, limit);
}

/** Map vers le modèle Employee PPC pour réutiliser planning / OT / timesheets. */
export function mapContractantEmployeeToPpcEmployee(
  emp: FlatContractantEmployee,
): Employee {
  return {
    ...emptyEmployeeHrProfile(),
    matricule: contractantEmployeeMatricule(emp.contractantId, emp.id),
    nom: emp.nom,
    departement: emp.departement,
    grade: '',
    jobTitle: emp.fonction,
    localisation: emp.lieuAffectation,
    service: emp.service || undefined,
    gender: emp.sexe === 'F' ? 'F' : emp.sexe === 'M' ? 'M' : '',
    appointmentDate: emp.dateEmbauche || emp.createdAt.slice(0, 10),
    statut: emp.dateSortie ? 'Inactive' : 'Active',
    documents: {},
  };
}

export function greetingForHour(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
