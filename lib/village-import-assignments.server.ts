import 'server-only';

import { assignManyEmployeeMaisons } from '@/lib/dependants-json-store';
import { normalizePersonName } from '@/lib/dependants-pactilis-compare';
import { readEmployees } from '@/lib/employees-json-store';
import { VILLAGE_HOUSING_ASSIGNMENTS } from '@/lib/village-housing-assignments';
import {
  findBestNameMatch,
  isNonPersonOccupantLabel,
  type NameMatchCandidate,
} from '@/lib/village-name-match';
import { readVillageCatalog, upsertManyMaisons } from '@/lib/village-store';

/** Forçages manuels pour homonymes / orthographes très divergentes. */
const FORCE_MATCH_BY_QUERY: Record<string, string> = {
  // « Andrew Malonga » ↔ MOLONGA LYONGA ANDREW
  'andrew malonga': '70000252',
  // « Nathan IT » (LAN Admin) ↔ NSINABAU TAMFUM NATHAN
  'nathan it': '70000259',
  // « LM ETEME » ↔ ETEME ABOUDI LOUIS MARIE
  'lm eteme': '70000281',
};

export interface VillageImportAssignmentRow {
  numero: string;
  occupantLabel: string;
  typeMaison: string;
  status: 'assigned' | 'vacant' | 'skipped' | 'unmatched' | 'ambiguous';
  matricule?: string;
  employeeNom?: string;
  score?: number;
  note?: string;
}

export interface VillageImportAssignmentsResult {
  assigned: number;
  vacant: number;
  skipped: number;
  unmatched: number;
  rows: VillageImportAssignmentRow[];
}

function resolveForcedMatricule(occupant: string): string | null {
  const key = normalizePersonName(occupant);
  return FORCE_MATCH_BY_QUERY[key] ?? null;
}

/**
 * Importe les affectations logement (capture) :
 * - met à jour typeMaison / taille des maisons
 * - match flou des occupants → employés
 * - écrit Numero Villa / Type sur DEPENDANTS (+ localisation Zamba)
 */
export async function importVillageHousingAssignments(): Promise<VillageImportAssignmentsResult> {
  const [employees, catalog] = await Promise.all([
    readEmployees(),
    readVillageCatalog(),
  ]);

  const candidates: NameMatchCandidate[] = employees.map((e) => ({
    matricule: e.matricule,
    nom: e.nom,
  }));
  const byMatricule = new Map(candidates.map((c) => [c.matricule, c]));
  const maisonByNumero = new Map(
    catalog.maisons.map((m) => [m.numero.trim().toLowerCase(), m]),
  );

  const rows: VillageImportAssignmentRow[] = [];
  const toAssign: Array<{ matricule: string; numeroVilla: string; typeMaison: string }> = [];
  const usedMatricules = new Set<string>();
  const maisonUpserts: Array<{
    numero: string;
    taille: string;
    typeMaison: string;
    commentaires: string;
  }> = [];

  for (const seed of VILLAGE_HOUSING_ASSIGNMENTS) {
    const numero = seed.numero.trim();
    const typeMaison = seed.typeMaison.trim();
    const occupant = seed.occupant.trim();

    const existing = maisonByNumero.get(numero.toLowerCase());
    maisonUpserts.push({
      numero,
      taille: typeMaison,
      typeMaison,
      commentaires: existing?.commentaires ?? '',
    });

    if (!occupant) {
      rows.push({
        numero,
        occupantLabel: '',
        typeMaison,
        status: 'vacant',
        note: 'Maison vide',
      });
      continue;
    }

    if (isNonPersonOccupantLabel(occupant)) {
      rows.push({
        numero,
        occupantLabel: occupant,
        typeMaison,
        status: 'skipped',
        note: 'Occupant non personnel (ex. Nursery School)',
      });
      continue;
    }

    const forced = resolveForcedMatricule(occupant);
    const match = forced
      ? (() => {
          const c = byMatricule.get(forced);
          return c ? { candidate: c, score: 100 } : null;
        })()
      : findBestNameMatch(occupant, candidates, 62);

    if (!match) {
      rows.push({
        numero,
        occupantLabel: occupant,
        typeMaison,
        status: 'unmatched',
        note: 'Aucune correspondance employé',
      });
      continue;
    }

    if (usedMatricules.has(match.candidate.matricule)) {
      rows.push({
        numero,
        occupantLabel: occupant,
        typeMaison,
        status: 'ambiguous',
        matricule: match.candidate.matricule,
        employeeNom: match.candidate.nom,
        score: match.score,
        note: 'Matricule déjà affecté à une autre maison dans cet import',
      });
      continue;
    }

    usedMatricules.add(match.candidate.matricule);
    toAssign.push({
      matricule: match.candidate.matricule,
      numeroVilla: numero,
      typeMaison,
    });
    rows.push({
      numero,
      occupantLabel: occupant,
      typeMaison,
      status: 'assigned',
      matricule: match.candidate.matricule,
      employeeNom: match.candidate.nom,
      score: match.score,
    });
  }

  if (maisonUpserts.length) {
    await upsertManyMaisons(maisonUpserts);
  }

  if (toAssign.length) {
    await assignManyEmployeeMaisons(
      toAssign.map((item) => ({
        ...item,
        setLocalisationZamba: true,
      })),
    );
  }

  return {
    assigned: rows.filter((r) => r.status === 'assigned').length,
    vacant: rows.filter((r) => r.status === 'vacant').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    unmatched: rows.filter((r) => r.status === 'unmatched' || r.status === 'ambiguous').length,
    rows,
  };
}
