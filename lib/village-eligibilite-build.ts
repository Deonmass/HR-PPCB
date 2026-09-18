import 'server-only';

import { computeSeniority, formatSeniority } from './employee-columns';
import { buildFamilyGroups, isChildStatut } from './dependants-utils';
import type { Dependant } from './dependants-types';
import { formatDisplayName } from './format-display-name';
import type { Employee } from './types';
import {
  buildZambaAgentsFromEmployees,
  splitVillageKimpese,
  type VillageAgentRow,
} from './village-agents';
import {
  computeEligibiliteTotalPct,
  computeFamilyCompositionScore,
  emptyEligibiliteScores,
  type VillageEligibiliteData,
  type VillageEligibiliteRow,
  type VillageEligibiliteScores,
} from './village-eligibilite';

function employeeByMatricule(employees: Employee[]): Map<string, Employee> {
  const map = new Map<string, Employee>();
  for (const e of employees) {
    const m = String(e.matricule || '').trim();
    if (m) map.set(m, e);
  }
  return map;
}

export function buildKimpeseEligibiliteRows(
  employees: Employee[],
  dependants: Dependant[],
  data: VillageEligibiliteData,
): VillageEligibiliteRow[] {
  const zamba = buildZambaAgentsFromEmployees(employees, dependants);
  const { kimpese } = splitVillageKimpese(zamba);
  return buildEligibiliteRowsFromAgents(kimpese, employees, dependants, data);
}

export function buildEligibiliteRowsFromAgents(
  agents: VillageAgentRow[],
  employees: Employee[],
  dependants: Dependant[],
  data: VillageEligibiliteData,
): VillageEligibiliteRow[] {
  const byMat = employeeByMatricule(employees);
  const groupsByMat = new Map(
    buildFamilyGroups(dependants).map((g) => [String(g.matricule || '').trim(), g] as const),
  );
  const sorted = agents
    .slice()
    .sort((a, b) =>
      formatDisplayName(a.nom).localeCompare(formatDisplayName(b.nom), 'fr', {
        sensitivity: 'base',
      }),
    );

  return sorted.map((agent, index) => {
    const mat = String(agent.matricule || '').trim();
    const emp = byMat.get(mat);
    const saved = data.entries[mat];
    const group = groupsByMat.get(mat);
    const famille = (group?.famille ?? []).map((m) => ({
      id: String(m.id ?? `${mat}-${m.nom}`),
      matricule: String(m.matricule || '').trim(),
      nom: formatDisplayName(m.nom),
      statut: String(m.statut || '').trim() || '—',
      sexe: String(m.sexe || '').trim(),
      age: m.age != null && String(m.age).trim() !== '' ? String(m.age) : '',
    }));
    const dependantsCount = famille.length;
    const familyScore = computeFamilyCompositionScore(dependantsCount);
    const scores: VillageEligibiliteScores = {
      ...(saved?.scores
        ? { ...emptyEligibiliteScores(), ...saved.scores }
        : emptyEligibiliteScores()),
      familyComposition: familyScore,
    };
    const grade = String(emp?.grade || emp?.patersonGrade || '').trim();
    const fonction = String(emp?.jobTitle || emp?.position || '').trim();
    const dateEmbauche = String(emp?.appointmentDate || '').trim();
    const seniority = computeSeniority(dateEmbauche);
    const ancienneteYears = seniority
      ? seniority.years + seniority.months / 12
      : -1;
    return {
      n: index + 1,
      matricule: mat || '—',
      nom: formatDisplayName(agent.nom || emp?.nom || ''),
      fonction: fonction || '—',
      departement: String(agent.departement || emp?.departement || '').trim() || '—',
      grade: grade || '—',
      anciennete: formatSeniority(seniority),
      ancienneteYears,
      dateEmbauche,
      dependantsCount,
      famille,
      scores,
      totalPct: computeEligibiliteTotalPct(scores),
      note: saved?.note || '',
    };
  });
}

/** Base + détail famille pour export Excel (uniquement les agents fournis). */
export function buildEligibiliteFamilyExport(
  rows: VillageEligibiliteRow[],
  dependants: Dependant[],
): {
  base: Array<{
    matricule: string;
    nom: string;
    dependantsCount: number;
    enfantsCount: number;
    dependantsNames: string;
  }>;
  detail: Array<{
    matriculeAgent: string;
    nomAgent: string;
    matriculeDependant: string;
    nomDependant: string;
    statut: string;
    sexe: string;
    age: string;
  }>;
} {
  const wanted = new Set(
    rows.map((r) => String(r.matricule || '').trim()).filter(Boolean),
  );
  const groups = buildFamilyGroups(dependants).filter((g) =>
    wanted.has(String(g.matricule || '').trim()),
  );
  const byMatGroup = new Map(
    groups.map((g) => [String(g.matricule || '').trim(), g] as const),
  );

  const base = rows.map((row) => {
    const mat = String(row.matricule || '').trim();
    const group = byMatGroup.get(mat);
    const famille = group?.famille ?? [];
    return {
      matricule: mat,
      nom: row.nom,
      dependantsCount: famille.length,
      enfantsCount: famille.filter((m) => isChildStatut(m.statut)).length,
      dependantsNames: famille
        .map((m) => formatDisplayName(m.nom))
        .filter(Boolean)
        .join(' ; '),
    };
  });

  const detail = rows.flatMap((row) => {
    const mat = String(row.matricule || '').trim();
    const group = byMatGroup.get(mat);
    const famille = group?.famille ?? [];
    if (famille.length === 0) {
      return [
        {
          matriculeAgent: mat,
          nomAgent: row.nom,
          matriculeDependant: '',
          nomDependant: '—',
          statut: 'Aucun dépendant',
          sexe: '',
          age: '',
        },
      ];
    }
    return famille.map((m) => ({
      matriculeAgent: mat,
      nomAgent: row.nom,
      matriculeDependant: String(m.matricule || '').trim(),
      nomDependant: formatDisplayName(m.nom),
      statut: String(m.statut || '').trim() || '—',
      sexe: String(m.sexe || '').trim(),
      age: m.age != null && String(m.age).trim() !== '' ? String(m.age) : '',
    }));
  });

  return { base, detail };
}
