export {
  assignEmployeeMaison,
  assignManyEmployeeMaisons,
  createDependant,
  deleteDependant,
  readDependantsData,
  removeDependantsByMatricule,
  updateDependant,
  updateFamilyLocalisation,
} from './dependants-json-store';

/** Compat : purge inactive — no-op côté JSON (les exits restent filtrés à la lecture). */
export async function purgeDependantsOfInactiveEmployees(): Promise<number> {
  return 0;
}

/** Compat : sync villa — déjà géré par assignManyEmployeeMaisons JSON. */
export async function syncAllDependantsVillaFromEmployees(): Promise<number> {
  return 0;
}
