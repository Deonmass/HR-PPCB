import type {
  Dependant,
  DependantChartItem,
  DependantFamilleRepartition,
  DependantLocalisationAge,
  DependantLocalisationStatut,
  DependantsDashboard,
  DependantStackedBar,
} from './dependants-types';

export function isConjointEmployeStatut(statut: string): boolean {
  return /conjoint\s*employ/i.test(statut);
}

export function isEmployeeStatut(statut: string): boolean {
  // « Conjoint employé » reste un conjoint rattaché à la famille, pas un chef.
  if (isConjointEmployeStatut(statut)) return false;
  return /employ/i.test(statut);
}

/**
 * KPI / dashboard : un Conjoint employé compte comme employé
 * (tout en restant rattaché au bloc familial du mari).
 */
export function countsAsEmployeeKpi(statut: string): boolean {
  return isEmployeeStatut(statut) || isConjointEmployeStatut(statut);
}

/** KPI / dashboard : conjoints non employés uniquement. */
export function countsAsSpouseKpi(statut: string): boolean {
  return isSpouseStatut(statut) && !isConjointEmployeStatut(statut);
}

export function isSpouseStatut(statut: string): boolean {
  return /conjoint/i.test(statut);
}

export function isChildStatut(statut: string): boolean {
  return /enfant/i.test(statut);
}

/** Parse une date FR (jj/mm/aaaa) ou ISO (aaaa-mm-jj). */
export function parseDependantBirthDate(raw: string): Date | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    const date = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Affichage stocké : jj/mm/aaaa */
export function formatDependantBirthDateDisplay(raw: string): string {
  const date = parseDependantBirthDate(raw);
  if (!date) return (raw || '').trim();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Valeur pour `<input type="date">` : aaaa-mm-jj */
export function formatDependantBirthDateIso(raw: string): string {
  const date = parseDependantBirthDate(raw);
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function computeDependantAge(dateNaissance: string, asOf = new Date()): number | null {
  const date = parseDependantBirthDate(dateNaissance);
  if (!date) return null;
  let age = asOf.getFullYear() - date.getFullYear();
  const monthDiff = asOf.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function resolveDependantAge(
  age: number | null | undefined,
  dateNaissance: string,
): number | null {
  if (age != null && Number.isFinite(age) && age >= 0) return age;
  return computeDependantAge(dateNaissance);
}

/** Clé de regroupement familial (toujours le matricule du chef / mari). */
export function familyGroupKey(item: {
  matricule?: string | null;
  familyMatricule?: string | null;
}): string {
  // Legacy inversé : familyMatricule portait le chef pendant que matricule = soi.
  const legacyFamily = String(item.familyMatricule ?? '').trim();
  if (legacyFamily) return legacyFamily;
  return String(item.matricule ?? '').trim();
}

/** Matricule à afficher en liste (propre pour conjoint employé, sinon famille). */
export function displayMatricule(item: {
  matricule?: string | null;
  ownMatricule?: string | null;
  familyMatricule?: string | null;
  statut?: string | null;
}): string {
  const own = String(item.ownMatricule ?? '').trim();
  if (own) return own;
  // Legacy inversé non migré : matricule était le propre.
  const legacyFamily = String(item.familyMatricule ?? '').trim();
  const mat = String(item.matricule ?? '').trim();
  if (legacyFamily && mat && mat !== legacyFamily) return mat;
  if (isConjointEmployeStatut(String(item.statut ?? '')) && mat) return mat;
  return mat;
}

export function belongsToFamily(
  item: { matricule?: string | null; familyMatricule?: string | null },
  familyMatricule: string,
): boolean {
  const key = familyMatricule.trim();
  if (!key) return false;
  return familyGroupKey(item) === key;
}

/**
 * Lignes récapitulatives Excel (ex. « TOTAL DES BENEFICIAIRES ») —
 * ce ne sont pas des bénéficiaires / enfants.
 */
export function isDependantSummaryRow(item: {
  pactilis?: string | null;
  nom?: string | null;
  statut?: string | null;
}): boolean {
  const pactilis = String(item.pactilis ?? '').trim().toUpperCase();
  const nom = String(item.nom ?? '').trim().toUpperCase();
  const statut = String(item.statut ?? '').trim();
  if (pactilis.includes('TOTAL DES BENEFICIAIRES') || nom.includes('TOTAL DES BENEFICIAIRES')) {
    return true;
  }
  if (pactilis.startsWith('TOTAL ') && !isEmployeeStatut(statut) && !isSpouseStatut(statut) && !isChildStatut(statut)) {
    return true;
  }
  // Ligne fantôme : statut tiret, sans vrai nom, souvent un récap Excel
  if ((statut === '—' || statut === '-') && (!nom || nom === '—')) {
    return true;
  }
  return false;
}

/** Enfant ≥ 21 ans sans preuve de scolarisation (lien document manquant). */
export function needsSchoolingProof(dependant: {
  statut: string;
  age: number | null;
  lienDocument?: string | null;
}): boolean {
  return (
    isChildStatut(dependant.statut)
    && dependant.age != null
    && dependant.age >= 21
    && !String(dependant.lienDocument ?? '').trim()
  );
}

export function countNeedsSchoolingProof(
  dependants: Array<{
    statut: string;
    age: number | null;
    lienDocument?: string | null;
  }>,
): number {
  return dependants.filter(needsSchoolingProof).length;
}

export function isParentStatut(statut: string): boolean {
  return isEmployeeStatut(statut) || isSpouseStatut(statut);
}

/** Compteurs famille pour la ligne employé (Composition / Enfants / Total). */
export function computeFamilyCompositionCounts(
  members: Array<{ statut: string }>,
): { compositionFamille: number; enfants: number; total: number } {
  let conjoints = 0;
  let enfants = 0;
  let autres = 0;

  for (const member of members) {
    if (isEmployeeStatut(member.statut)) continue;
    if (isSpouseStatut(member.statut)) conjoints += 1;
    else if (isChildStatut(member.statut)) enfants += 1;
    else autres += 1;
  }

  const compositionFamille = conjoints + autres;
  return {
    compositionFamille,
    enfants,
    total: 1 + compositionFamille + enfants,
  };
}

/** Met à jour Composition / Enfants / Total sur la ligne employé d'une famille. */
export function applyFamilyCompositionToEmployee(
  dependants: Dependant[],
  matricule: string,
): Dependant[] {
  const normalized = matricule.trim();
  if (!normalized) return dependants;
  const family = dependants.filter((item) => belongsToFamily(item, normalized));
  const counts = computeFamilyCompositionCounts(family);
  return dependants.map((item) => {
    if (!belongsToFamily(item, normalized) || !isEmployeeStatut(item.statut)) return item;
    return {
      ...item,
      compositionFamille: counts.compositionFamille,
      enfants: counts.enfants,
      total: counts.total,
    };
  });
}

/** Recalcule Composition / Enfants / Total pour toutes les familles. */
export function applyAllFamilyCompositions(dependants: Dependant[]): Dependant[] {
  const matricules = new Set(
    dependants
      .filter((item) => isEmployeeStatut(item.statut))
      .map((item) => familyGroupKey(item))
      .filter(Boolean),
  );

  let next = dependants;
  for (const matricule of matricules) {
    next = applyFamilyCompositionToEmployee(next, matricule);
  }
  return next;
}

export interface FamilyGroup {
  matricule: string;
  employee: Dependant;
  famille: Dependant[];
}

function familyMemberSort(a: Dependant, b: Dependant): number {
  const aSpouse = isSpouseStatut(a.statut) ? 0 : 1;
  const bSpouse = isSpouseStatut(b.statut) ? 0 : 1;
  if (aSpouse !== bSpouse) return aSpouse - bSpouse;
  return a.id - b.id;
}

export function buildFamilyGroups(dependants: Dependant[]): FamilyGroup[] {
  const byFamily = new Map<string, Dependant[]>();

  for (const item of dependants) {
    if (isDependantSummaryRow(item)) continue;
    const key = familyGroupKey(item);
    if (!key) continue;
    const list = byFamily.get(key) ?? [];
    list.push(item);
    byFamily.set(key, list);
  }

  const groups: FamilyGroup[] = [];

  for (const [matricule, members] of byFamily) {
    const employee = members.find((item) => isEmployeeStatut(item.statut));
    if (!employee) continue;

    const famille = members
      .filter((item) => item !== employee && !isDependantSummaryRow(item))
      .sort(familyMemberSort);

    groups.push({ matricule, employee, famille });
  }

  return groups.sort((a, b) =>
    a.employee.nom.localeCompare(b.employee.nom, 'fr', { sensitivity: 'base' }),
  );
}

function chartItem(label: string, value: number): DependantChartItem {
  return { label, value };
}

function ageBucket(age: number | null): string | null {
  if (age == null || age < 0) return null;
  if (age <= 2) return '0-2 ans';
  if (age <= 12) return '3-12 ans';
  if (age <= 15) return '13-15 ans';
  if (age <= 19) return '16-19 ans';
  if (age <= 25) return '20-25 ans';
  return '26 ans et +';
}

export function matchAgeBucket(age: number | null, bucket: string): boolean {
  return ageBucket(age) === bucket;
}

export function isMineurAge(age: number | null): boolean {
  return age != null && age <= 17;
}

export type DependantsDrillQuery =
  | { kind: 'kpi'; label: string }
  | { kind: 'localisation'; localisation: string; role?: 'employe' | 'conjoint' | 'enfant' }
  | { kind: 'localisation-age'; localisation: string; ageGroup?: 'mineurs' | 'majeurs' }
  | { kind: 'statut'; label: string }
  | { kind: 'sexe'; label: string }
  | { kind: 'age-tranche'; label: string };

function localisationKey(value: string): string {
  return value.trim() || 'Non renseigné';
}

function matchLocalisation(item: Dependant, localisation: string): boolean {
  return localisationKey(item.localisation) === localisationKey(localisation);
}

/** Résout une requête dashboard → liste de bénéficiaires pour le modal. */
export function resolveDependantsDrilldown(
  dependants: Dependant[],
  query: DependantsDrillQuery,
): { title: string; items: Dependant[] } | null {
  const scoped = dependants.filter((item) => !isDependantSummaryRow(item));
  const groups = buildFamilyGroups(scoped);

  switch (query.kind) {
    case 'kpi': {
      const label = query.label.trim().toLowerCase();
      if (label.includes('moyenne')) return null;
      if (label.includes('total beneficiaires') || label.includes('total bénéficiaires')) {
        return { title: 'Total bénéficiaires', items: scoped };
      }
      if (label === 'employes' || label === 'employés') {
        return {
          title: 'Employés',
          items: scoped.filter((item) => countsAsEmployeeKpi(item.statut)),
        };
      }
      if (label === 'conjoints') {
        return {
          title: 'Conjoints',
          items: scoped.filter((item) => countsAsSpouseKpi(item.statut)),
        };
      }
      if (label === 'enfants') {
        return {
          title: 'Enfants',
          items: scoped.filter((item) => isChildStatut(item.statut)),
        };
      }
      if (label.includes('scolaris')) {
        return {
          title: 'Scolarisé — sans preuve',
          items: scoped.filter(needsSchoolingProof),
        };
      }
      if (label.includes('beneficiaires avec matricule') || label.includes('bénéficiaires avec matricule')) {
        return {
          title: 'Bénéficiaires avec matricule',
          items: scoped.filter((item) => Boolean(item.matricule.trim())),
        };
      }
      if (label.includes('employes avec matricule') || label.includes('employés avec matricule')) {
        return {
          title: 'Employés avec matricule',
          items: scoped.filter(
            (item) => countsAsEmployeeKpi(item.statut) && Boolean(displayMatricule(item).trim()),
          ),
        };
      }
      if (label.includes('employes avec famille') || label.includes('employés avec famille')) {
        const mats = new Set(
          groups.filter((g) => g.famille.length > 0).map((g) => g.employee.id),
        );
        return {
          title: 'Employés avec famille',
          items: scoped.filter((item) => mats.has(item.id)),
        };
      }
      if (label.includes('employes seuls') || label.includes('employés seuls')) {
        const mats = new Set(
          groups.filter((g) => g.famille.length === 0).map((g) => g.employee.id),
        );
        return {
          title: 'Employés seuls',
          items: scoped.filter((item) => mats.has(item.id)),
        };
      }
      return null;
    }
    case 'statut': {
      const label = query.label.toLowerCase();
      if (label.includes('enfant')) {
        return {
          title: 'Par statut — Enfant',
          items: scoped.filter((item) => isChildStatut(item.statut)),
        };
      }
      if (label.includes('employ')) {
        return {
          title: 'Par statut — Employé(e)',
          items: scoped.filter((item) => countsAsEmployeeKpi(item.statut)),
        };
      }
      if (label.includes('conjoint')) {
        return {
          title: 'Par statut — Conjoint(e)',
          items: scoped.filter((item) => countsAsSpouseKpi(item.statut)),
        };
      }
      return null;
    }
    case 'sexe': {
      const sexe = query.label.trim().toUpperCase();
      if (sexe !== 'M' && sexe !== 'F') return null;
      return {
        title: `Par sexe — ${sexe}`,
        items: scoped.filter((item) => item.sexe.trim().toUpperCase() === sexe),
      };
    }
    case 'age-tranche': {
      return {
        title: `Tranche d'âge — ${query.label}`,
        items: scoped.filter(
          (item) => isChildStatut(item.statut) && matchAgeBucket(item.age, query.label),
        ),
      };
    }
    case 'localisation': {
      const atSite = scoped.filter((item) => matchLocalisation(item, query.localisation));
      if (!query.role) {
        return {
          title: `Localisation — ${localisationKey(query.localisation)}`,
          items: atSite,
        };
      }
      const roleLabel =
        query.role === 'employe' ? 'Employés'
          : query.role === 'conjoint' ? 'Conjoints'
            : 'Enfants';
      const items = atSite.filter((item) => {
        if (query.role === 'employe') return countsAsEmployeeKpi(item.statut);
        if (query.role === 'conjoint') return countsAsSpouseKpi(item.statut);
        return isChildStatut(item.statut);
      });
      return {
        title: `${localisationKey(query.localisation)} — ${roleLabel}`,
        items,
      };
    }
    case 'localisation-age': {
      const atSite = scoped.filter((item) => matchLocalisation(item, query.localisation));
      if (!query.ageGroup) {
        return {
          title: `Localisation — ${localisationKey(query.localisation)}`,
          items: atSite,
        };
      }
      const items = atSite.filter((item) =>
        query.ageGroup === 'mineurs' ? isMineurAge(item.age) : !isMineurAge(item.age),
      );
      return {
        title: `${localisationKey(query.localisation)} — ${
          query.ageGroup === 'mineurs' ? 'Mineurs' : 'Majeurs'
        }`,
        items,
      };
    }
    default:
      return null;
  }
}

/** Dashboard live calculé depuis la feuille DEPENDANTS (indépendant de RESUME). */
export function buildDashboardFromDependants(dependants: Dependant[]): DependantsDashboard {
  const scoped = dependants.filter((item) => !isDependantSummaryRow(item));
  const groups = buildFamilyGroups(scoped);

  let employes = 0;
  let conjoints = 0;
  let enfants = 0;
  let male = 0;
  let female = 0;
  let withMatricule = 0;
  let employesAvecMatricule = 0;
  let sumEnfantsParEmploye = 0;
  let employesAvecFamille = 0;
  let employesSeuls = 0;

  const ageBuckets = new Map<string, number>([
    ['0-2 ans', 0],
    ['3-12 ans', 0],
    ['13-15 ans', 0],
    ['16-19 ans', 0],
    ['20-25 ans', 0],
    ['26 ans et +', 0],
  ]);

  const localisationMap = new Map<string, DependantLocalisationStatut>();
  const localisationAgeMap = new Map<string, DependantLocalisationAge>();

  const bumpLocalisation = (
    localisation: string,
    field: 'employe' | 'conjoint' | 'enfant',
  ) => {
    const key = localisation.trim() || 'Non renseigné';
    const current = localisationMap.get(key) ?? {
      localisation: key,
      employe: 0,
      conjoint: 0,
      enfant: 0,
    };
    current[field] += 1;
    localisationMap.set(key, current);
  };

  const bumpLocalisationAge = (localisation: string, age: number | null) => {
    const key = localisation.trim() || 'Non renseigné';
    const current = localisationAgeMap.get(key) ?? {
      localisation: key,
      mineurs: 0,
      majeurs: 0,
    };
    // Aligné avec la liste : âge ≤ 17 = mineur, > 17 ou non renseigné = majeur
    if (age != null && age <= 17) current.mineurs += 1;
    else current.majeurs += 1;
    localisationAgeMap.set(key, current);
  };

  for (const item of scoped) {
    if (item.matricule.trim()) withMatricule += 1;

    const sexe = item.sexe.trim().toUpperCase();
    if (sexe === 'M') male += 1;
    else if (sexe === 'F') female += 1;

    bumpLocalisationAge(item.localisation, item.age);

    if (countsAsEmployeeKpi(item.statut)) {
      employes += 1;
      if (displayMatricule(item).trim()) employesAvecMatricule += 1;
      bumpLocalisation(item.localisation, 'employe');
    } else if (countsAsSpouseKpi(item.statut)) {
      conjoints += 1;
      bumpLocalisation(item.localisation, 'conjoint');
    } else if (isChildStatut(item.statut)) {
      enfants += 1;
      bumpLocalisation(item.localisation, 'enfant');
      const bucket = ageBucket(item.age);
      if (bucket) ageBuckets.set(bucket, (ageBuckets.get(bucket) ?? 0) + 1);
    }
    // Autres statuts (récaps, tirets…) : ignorés — ce ne sont pas des enfants
  }

  for (const group of groups) {
    const childCount = group.famille.filter((member) => isChildStatut(member.statut)).length;
    sumEnfantsParEmploye += childCount;
    if (group.famille.length > 0) employesAvecFamille += 1;
    else employesSeuls += 1;
  }

  const moyenneEnfants = employes
    ? Math.round((sumEnfantsParEmploye / employes) * 100) / 100
    : 0;

  const localisationTotals = [...localisationMap.values()]
    .map((row) => ({
      label: row.localisation,
      value: row.employe + row.conjoint + row.enfant,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));

  const scolarisesSansPreuve = countNeedsSchoolingProof(scoped);

  const kpis: DependantChartItem[] = [
    chartItem('Total beneficiaires', scoped.length),
    chartItem('Employes', employes),
    chartItem('Conjoints', conjoints),
    chartItem('Enfants', enfants),
    chartItem('Scolarises sans preuve', scolarisesSansPreuve),
    chartItem('Beneficiaires avec matricule', withMatricule),
    chartItem('Employes avec matricule', employesAvecMatricule),
    chartItem('Moyenne enfants par employe', moyenneEnfants),
    chartItem('Employes avec famille', employesAvecFamille),
    chartItem('Employes seuls', employesSeuls),
  ];

  const parStatut = [
    chartItem('Enfant', enfants),
    chartItem('Employé(e)', employes),
    chartItem('Conjoint(e)', conjoints),
  ];

  const parSexe = [
    chartItem('M', male),
    chartItem('F', female),
  ];

  const parTrancheAge = [...ageBuckets.entries()].map(([label, value]) => chartItem(label, value));

  const parLocalisationStatut = [...localisationMap.values()]
    .sort((a, b) => {
      const totalA = a.employe + a.conjoint + a.enfant;
      const totalB = b.employe + b.conjoint + b.enfant;
      return totalB - totalA || a.localisation.localeCompare(b.localisation, 'fr');
    });

  const parLocalisationAge = [...localisationAgeMap.values()].sort((a, b) => {
    const totalA = a.mineurs + a.majeurs;
    const totalB = b.mineurs + b.majeurs;
    return totalB - totalA || a.localisation.localeCompare(b.localisation, 'fr');
  });

  const indicateurs = localisationTotals.map((item) => chartItem(item.label, item.value));

  return {
    kpis,
    parStatut,
    parSexe,
    parLocalisationStatut,
    parLocalisationAge,
    parTrancheAge,
    familleRepartition: buildFamilleRepartition(scoped),
    indicateurs,
  };
}

export function buildFamilleRepartition(dependants: Dependant[]): DependantFamilleRepartition {
  let garconUnder = 0;
  let garconOver = 0;
  let filleUnder = 0;
  let filleOver = 0;
  let parentHomme = 0;
  let parentFemme = 0;

  for (const item of dependants) {
    const sexe = item.sexe.toUpperCase();
    const age = item.age;

    if (isChildStatut(item.statut)) {
      if (age == null) continue;
      if (sexe === 'M') {
        if (age > 17) garconOver += 1;
        else garconUnder += 1;
      } else if (sexe === 'F') {
        if (age > 17) filleOver += 1;
        else filleUnder += 1;
      }
      continue;
    }

    if (isParentStatut(item.statut)) {
      if (sexe === 'M') parentHomme += 1;
      else if (sexe === 'F') parentFemme += 1;
    }
  }

  const bars: DependantStackedBar[] = [
    {
      label: 'Garçons',
      segments: [
        { label: '≤ 17 ans', value: garconUnder, className: 'dependants-seg-under' },
        { label: '> 17 ans', value: garconOver, className: 'dependants-seg-over' },
      ],
    },
    {
      label: 'Filles',
      segments: [
        { label: '≤ 17 ans', value: filleUnder, className: 'dependants-seg-under' },
        { label: '> 17 ans', value: filleOver, className: 'dependants-seg-over' },
      ],
    },
    {
      label: 'Parents H',
      segments: [{ label: 'Hommes', value: parentHomme, className: 'dependants-seg-parent-m' }],
    },
    {
      label: 'Parents F',
      segments: [{ label: 'Femmes', value: parentFemme, className: 'dependants-seg-parent-f' }],
    },
  ];

  return { bars };
}
