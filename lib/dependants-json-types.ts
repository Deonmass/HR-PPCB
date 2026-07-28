import type { Dependant } from './dependants-types';

export interface DependantRecord extends Omit<Dependant, 'employeNom' | 'departement'> {
  employeeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DependantsJsonStoreData {
  dependants: DependantRecord[];
}
