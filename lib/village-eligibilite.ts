/** Scoring éligibilité logement village (agents Kimpese). */

export const ELIGIBILITE_CRITERIA = [
  { key: 'criticalPosition', label: 'Critical position', short: 'Critical', compact: 'Crit', max: 20 },
  { key: 'seniorityEmployment', label: 'Seniority in employment', short: 'Seniority', compact: 'Sen', max: 20 },
  { key: 'mobilityRequirement', label: 'Mobility requirement', short: 'Mobility', compact: 'Mob', max: 20 },
  { key: 'talentAttraction', label: 'Talent attraction', short: 'Talent', compact: 'Tal', max: 20 },
  {
    key: 'familyComposition',
    label: 'Family composition (living alone or with family)',
    short: 'Family',
    compact: 'Fam',
    max: 20,
  },
] as const;

export type EligibiliteCriterionKey = (typeof ELIGIBILITE_CRITERIA)[number]['key'];

export type VillageEligibiliteScores = Record<EligibiliteCriterionKey, number | null>;

export interface VillageEligibiliteEntry {
  matricule: string;
  scores: VillageEligibiliteScores;
  note?: string;
  updatedAt?: string;
}

export interface VillageEligibiliteData {
  updatedAt?: string;
  entries: Record<string, VillageEligibiliteEntry>;
}

export interface VillageEligibiliteFamilyMember {
  id: string;
  matricule: string;
  nom: string;
  statut: string;
  sexe: string;
  age: string;
}

export interface VillageEligibiliteRow {
  n: number;
  matricule: string;
  nom: string;
  fonction: string;
  departement: string;
  grade: string;
  anciennete: string;
  /** Années décimales pour le tri (ex. 9 ans 11 mois → 9.92). */
  ancienneteYears: number;
  /** Date d’embauche (affichage), pour tooltip ancienneté. */
  dateEmbauche: string;
  /** Nombre de personnes sous l’employé (hors employé). */
  dependantsCount: number;
  /** Liste des dépendants (hors employé). */
  famille: VillageEligibiliteFamilyMember[];
  scores: VillageEligibiliteScores;
  totalPct: number;
  note: string;
}

export const ELIGIBILITE_MAX_TOTAL = ELIGIBILITE_CRITERIA.reduce((s, c) => s + c.max, 0);

/**
 * Cote Family /20 :
 * 0–3 dépendants : 3 points × dépendant ; dès 4 dépendants : 20/20.
 * Ex. 0→0, 1→3, 2→6, 3→9, 4+→20.
 */
export function computeFamilyCompositionScore(dependantsCount: number, max = 20): number {
  const n = Math.max(0, Math.floor(Number(dependantsCount) || 0));
  if (n > 3) return max;
  return n * 3;
}

export function emptyEligibiliteScores(): VillageEligibiliteScores {
  return {
    criticalPosition: null,
    seniorityEmployment: null,
    mobilityRequirement: null,
    talentAttraction: null,
    familyComposition: null,
  };
}

function clampScore(raw: unknown, max: number): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100));
}

export function normalizeEligibiliteScores(raw: unknown): VillageEligibiliteScores {
  const src =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = emptyEligibiliteScores();
  for (const c of ELIGIBILITE_CRITERIA) {
    out[c.key] = clampScore(src[c.key], c.max);
  }
  return out;
}

export function computeEligibiliteTotalPct(scores: VillageEligibiliteScores): number {
  let sum = 0;
  for (const c of ELIGIBILITE_CRITERIA) {
    const v = scores[c.key];
    sum += typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  if (ELIGIBILITE_MAX_TOTAL <= 0) return 0;
  return Math.round((sum / ELIGIBILITE_MAX_TOTAL) * 1000) / 10;
}

export function emptyVillageEligibiliteData(): VillageEligibiliteData {
  return { entries: {} };
}

export function normalizeVillageEligibiliteData(raw: unknown): VillageEligibiliteData {
  if (!raw || typeof raw !== 'object') return emptyVillageEligibiliteData();
  const src = raw as Partial<VillageEligibiliteData> & {
    entries?: unknown;
  };
  const entries: Record<string, VillageEligibiliteEntry> = {};
  const list = src.entries;
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    for (const [key, value] of Object.entries(list as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Partial<VillageEligibiliteEntry>;
      const matricule = String(row.matricule || key).trim();
      if (!matricule) continue;
      entries[matricule] = {
        matricule,
        scores: normalizeEligibiliteScores(row.scores),
        note: typeof row.note === 'string' ? row.note : '',
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
      };
    }
  } else if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<VillageEligibiliteEntry>;
      const matricule = String(row.matricule || '').trim();
      if (!matricule) continue;
      entries[matricule] = {
        matricule,
        scores: normalizeEligibiliteScores(row.scores),
        note: typeof row.note === 'string' ? row.note : '',
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
      };
    }
  }
  return {
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : undefined,
    entries,
  };
}

export function mergeEligibiliteEntries(
  current: VillageEligibiliteData,
  incoming: unknown,
): VillageEligibiliteData {
  const next = normalizeVillageEligibiliteData({
    ...current,
    entries: { ...current.entries },
  });
  const payload =
    incoming && typeof incoming === 'object'
      ? (incoming as { entries?: unknown })
      : {};
  const rows = Array.isArray(payload.entries)
    ? payload.entries
    : payload.entries && typeof payload.entries === 'object'
      ? Object.values(payload.entries as Record<string, unknown>)
      : [];
  const now = new Date().toISOString();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<VillageEligibiliteEntry> & {
      scores?: unknown;
    };
    const matricule = String(row.matricule || '').trim();
    if (!matricule) continue;
    next.entries[matricule] = {
      matricule,
      scores: normalizeEligibiliteScores(row.scores),
      note: typeof row.note === 'string' ? row.note : next.entries[matricule]?.note || '',
      updatedAt: now,
    };
  }
  next.updatedAt = now;
  return next;
}
