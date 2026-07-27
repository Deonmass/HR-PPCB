import type { Dependant } from '@/lib/dependants-types';
import {
  buildFamilyGroups,
  isEmployeeStatut,
  type FamilyGroup,
} from '@/lib/dependants-utils';
import { isZambaLocalisation } from '@/lib/timesheet-calc';
import type { Employee } from '@/lib/types';
import type {
  VillageDashboardStats,
  VillageMaison,
  VillageMaisonOccupancy,
  VillageTaille,
} from '@/lib/village-types';

export interface VillageAgentRow {
  matricule: string;
  nom: string;
  localisation: string;
  /** Localisation EMPLOYEE (affectation RH). */
  localisationEmployee: string;
  /** Localisation DEPENDANTS (logement / famille). */
  localisationDependant: string;
  departement: string;
  numeroVilla: string;
  typeMaison: string;
}

function norm(s: string | undefined | null): string {
  return String(s ?? '').trim();
}

/** Libellé département pour les occupants de maison non employés. */
export const HORS_EFFECTIF_DEPT = 'Hors effectif';

function villaKey(numero: string | undefined | null): string {
  return norm(numero).toLowerCase();
}

/** Infos villa depuis la feuille DEPENDANTS (ligne employé par matricule). */
export function buildVillaInfoByMatricule(
  dependants: Dependant[],
): Map<string, { numeroVilla: string; typeMaison: string; localisation: string }> {
  const map = new Map<string, { numeroVilla: string; typeMaison: string; localisation: string }>();
  for (const d of dependants) {
    if (!isEmployeeStatut(d.statut)) continue;
    const matricule = norm(d.matricule);
    if (!matricule) continue;
    map.set(matricule, {
      numeroVilla: norm(d.numeroVilla),
      typeMaison: norm(d.typeMaison),
      localisation: norm(d.localisation),
    });
  }
  return map;
}

/**
 * Agents Zamba harmonisés :
 * - localisation EMPLOYEE = Zamba, OU
 * - localisation DEPENDANTS (ligne employé) = Zamba
 * (corrige l’écart 101 vs 104 quand EMP ≠ DEP).
 */
export function buildZambaAgentsFromEmployees(
  employees: Employee[],
  dependants: Dependant[],
): VillageAgentRow[] {
  const villaByMatricule = buildVillaInfoByMatricule(dependants);
  const byMatricule = new Map<string, VillageAgentRow>();

  for (const e of employees) {
    const matricule = norm(e.matricule);
    if (!matricule) continue;
    const villa = villaByMatricule.get(matricule);
    const locEmp = norm(e.localisation);
    const locDep = villa?.localisation ?? '';
    if (!isZambaLocalisation(locEmp) && !isZambaLocalisation(locDep)) continue;

    byMatricule.set(matricule, {
      matricule: e.matricule,
      nom: e.nom,
      localisation: isZambaLocalisation(locDep) ? locDep : locEmp,
      localisationEmployee: locEmp,
      localisationDependant: locDep,
      departement: norm(e.departement),
      numeroVilla: villa?.numeroVilla ?? '',
      typeMaison: villa?.typeMaison ?? '',
    });
  }

  return [...byMatricule.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function splitVillageKimpese(agents: VillageAgentRow[]): {
  village: VillageAgentRow[];
  kimpese: VillageAgentRow[];
} {
  const village = agents.filter((a) => norm(a.numeroVilla) !== '');
  const kimpese = agents.filter((a) => norm(a.numeroVilla) === '');
  return { village, kimpese };
}

export function countOtherLocalisations(
  employees: Employee[],
  zambaAgents: VillageAgentRow[],
): number {
  const zambaMats = new Set(zambaAgents.map((a) => norm(a.matricule)));
  return employees.filter((e) => !zambaMats.has(norm(e.matricule))).length;
}

export function listOtherLocalisationEmployees(
  employees: Employee[],
  zambaAgents: VillageAgentRow[],
): Employee[] {
  const zambaMats = new Set(zambaAgents.map((a) => norm(a.matricule)));
  return employees
    .filter((e) => !zambaMats.has(norm(e.matricule)))
    .slice()
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Familles (collapse) pour un sous-ensemble d’agents Zamba. */
export function buildVillageFamilyGroups(
  agents: VillageAgentRow[],
  dependants: Dependant[],
): FamilyGroup[] {
  const mats = new Set(agents.map((a) => norm(a.matricule)));
  const scoped = dependants.filter((d) => mats.has(norm(d.matricule)));
  return buildFamilyGroups(scoped);
}

export function buildMaisonOccupancy(
  maisons: VillageMaison[],
  tailles: VillageTaille[],
  villageAgents: VillageAgentRow[],
  dependants: Dependant[],
): VillageMaisonOccupancy[] {
  const capaciteByCode = new Map(
    tailles.map((t) => [t.code.toLowerCase(), t.capacite] as const),
  );
  const capaciteByLabel = new Map(
    tailles.map((t) => [(t.label || t.code).toLowerCase(), t.capacite] as const),
  );
  const familleSizeByMat = new Map<string, number>();
  for (const group of buildFamilyGroups(dependants)) {
    familleSizeByMat.set(norm(group.matricule), 1 + group.famille.length);
  }

  const agentsByVilla = new Map<string, VillageAgentRow[]>();
  for (const agent of villageAgents) {
    const key = norm(agent.numeroVilla).toLowerCase();
    if (!key) continue;
    const list = agentsByVilla.get(key) ?? [];
    list.push(agent);
    agentsByVilla.set(key, list);
  }

  return maisons.map((maison) => {
    const occupantsAgents = agentsByVilla.get(villaKey(maison.numero)) ?? [];
    const occupants = occupantsAgents.map((a) => ({
      matricule: a.matricule,
      nom: a.nom,
      departement: a.departement,
      familleSize: familleSizeByMat.get(norm(a.matricule)) ?? 1,
      externe: false,
    }));
    // Hors effectif : toute personne en maison sans être employé actif
    const externeNom = norm(maison.occupantExterne);
    if (externeNom && occupants.length === 0) {
      occupants.push({
        matricule: '',
        nom: externeNom,
        departement: HORS_EFFECTIF_DEPT,
        familleSize: 1,
        externe: true,
      });
    }
    const tailleKey = norm(maison.taille).toLowerCase();
    return {
      ...maison,
      occupied: occupants.length > 0,
      occupants,
      occupantCount: occupants.length,
      capacite:
        capaciteByLabel.get(tailleKey)
        ?? capaciteByCode.get(tailleKey)
        ?? null,
    };
  });
}

function countPersonnesForAgents(
  agents: VillageAgentRow[],
  dependants: Dependant[],
): number {
  const mats = new Set(agents.map((a) => norm(a.matricule)));
  let n = 0;
  for (const d of dependants) {
    if (mats.has(norm(d.matricule))) n += 1;
  }
  return n;
}

export function buildVillageDashboardStats(
  employees: Employee[],
  dependants: Dependant[],
  maisons: VillageMaison[],
  tailles: VillageTaille[],
): VillageDashboardStats {
  const zamba = buildZambaAgentsFromEmployees(employees, dependants);
  const { village, kimpese } = splitVillageKimpese(zamba);
  const occupancy = buildMaisonOccupancy(maisons, tailles, village, dependants);
  const occupees = occupancy.filter((m) => m.occupied);
  const vides = occupancy.filter((m) => !m.occupied);

  const tailleLabel = new Map(
    tailles.map((t) => [t.code.toLowerCase(), t.label || t.code] as const),
  );
  for (const t of tailles) {
    tailleLabel.set((t.label || t.code).toLowerCase(), t.label || t.code);
  }
  const parTailleMap = new Map<string, { label: string; total: number; occupees: number; vides: number }>();
  for (const m of occupancy) {
    const key = norm(m.taille).toLowerCase() || '—';
    const label = tailleLabel.get(key) || (norm(m.taille) || 'Non renseigné');
    const current = parTailleMap.get(key) ?? { label, total: 0, occupees: 0, vides: 0 };
    current.total += 1;
    if (m.occupied) current.occupees += 1;
    else current.vides += 1;
    parTailleMap.set(key, current);
  }

  const familleSizeByMat = new Map<string, number>();
  for (const group of buildFamilyGroups(dependants)) {
    familleSizeByMat.set(norm(group.matricule), 1 + group.famille.length);
  }

  const employeeVillaKeys = new Set(
    village.map((a) => villaKey(a.numeroVilla)).filter(Boolean),
  );

  /** Maisons occupées par un non-employé (occupant externe, sans agent actif). */
  const horsEffectifMaisons = maisons.filter((m) => {
    const ext = norm(m.occupantExterne);
    if (!ext) return false;
    return !employeeVillaKeys.has(villaKey(m.numero));
  });

  const quiOu = [
    ...village.map((a) => {
      const maison = maisons.find(
        (m) => villaKey(m.numero) === villaKey(a.numeroVilla),
      );
      return {
        matricule: a.matricule,
        nom: a.nom,
        numeroVilla: a.numeroVilla,
        taille: maison?.taille || '',
        typeMaison: a.typeMaison || maison?.typeMaison || '',
        departement: a.departement,
        familleSize: familleSizeByMat.get(norm(a.matricule)) ?? 1,
        externe: false,
      };
    }),
    ...horsEffectifMaisons.map((m) => ({
      matricule: '',
      nom: norm(m.occupantExterne),
      numeroVilla: m.numero,
      taille: m.taille,
      typeMaison: m.typeMaison || m.taille,
      departement: HORS_EFFECTIF_DEPT,
      familleSize: 1,
      externe: true,
    })),
  ];

  const parTailleList = [...parTailleMap.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fr'),
  );
  const tailleColumns = parTailleList.map((t) => t.label);

  const deptMap = new Map<string, Record<string, number>>();
  for (const row of quiOu) {
    const dept =
      norm(row.departement)
      || (row.externe ? HORS_EFFECTIF_DEPT : 'Non renseigné');
    const tailleKey = tailleLabel.get(norm(row.taille).toLowerCase())
      || tailleLabel.get(norm(row.typeMaison).toLowerCase())
      || norm(row.taille)
      || norm(row.typeMaison)
      || 'Non renseigné';
    const counts = deptMap.get(dept) ?? {};
    counts[tailleKey] = (counts[tailleKey] ?? 0) + 1;
    deptMap.set(dept, counts);
  }

  // Garantit la ligne Hors effectif dès qu’il y a des occupants non employés
  if (horsEffectifMaisons.length && !deptMap.has(HORS_EFFECTIF_DEPT)) {
    deptMap.set(HORS_EFFECTIF_DEPT, {});
  }

  const parDepartementTaille = [...deptMap.entries()]
    .map(([departement, counts]) => ({
      departement,
      counts,
      total: Object.values(counts).reduce((sum, n) => sum + n, 0),
    }))
    .sort((a, b) => {
      // Hors effectif toujours visible (après les vrais départements triés)
      if (a.departement === HORS_EFFECTIF_DEPT) return 1;
      if (b.departement === HORS_EFFECTIF_DEPT) return -1;
      return b.total - a.total || a.departement.localeCompare(b.departement, 'fr');
    });

  return {
    zamba: zamba.length,
    village: village.length,
    kimpese: kimpese.length,
    zambaPersonnes: countPersonnesForAgents(zamba, dependants),
    villagePersonnes: countPersonnesForAgents(village, dependants),
    kimpesePersonnes: countPersonnesForAgents(kimpese, dependants),
    autres: countOtherLocalisations(employees, zamba),
    maisonsTotal: maisons.length,
    maisonsOccupees: occupees.length,
    maisonsVides: vides.length,
    parTaille: parTailleList,
    tailleColumns,
    parDepartementTaille,
    quiOu,
  };
}
