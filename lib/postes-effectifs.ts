import { localizeJobTitle as bilingualTitle } from './bilingual-title';
import {
  capitalHrEffectifEmployees,
  findCapitalHrContractant,
  isCapitalHrContractantName,
  isCapitalHrEmployeeActive,
} from './capital-hr-effectif';
import type { ClassificationPoste } from './classification-types';
import { classificationRank } from './classification-types';
import type { Contractant } from './contractants-types';
import { translateJobTitleToEnglish } from './job-title-i18n';
import { titlesMatch } from './recrutement-match';
import type { Employee } from './types';

export {
  capitalHrEffectifEmployees,
  findCapitalHrContractant,
  isCapitalHrCoreLocation,
} from './capital-hr-effectif';

export interface PosteEffectifPpcRow {
  id: string;
  matricule: string;
  nom: string;
  poste: string;
  classification: string;
  grade: string;
  department: string;
  localisation: string;
}

export interface PosteEffectifCapitalHrRow {
  id: string;
  nom: string;
  posteCapHr: string;
  fonction: string;
  classification: string;
  department: string;
  lieuAffectation: string;
}

/** Agent d’un contractant hors Capital HR (actifs). */
export interface PosteEffectifContractantRow {
  id: string;
  nom: string;
  fonction: string;
  classification: string;
  department: string;
  lieuAffectation: string;
  contractantId: string;
  contractantNom: string;
}

export interface PosteEffectifContractantColumn {
  id: string;
  nom: string;
}

export interface PosteEffectifResumeRow {
  poste: string;
  department: string;
  location: string;
  ppcCount: number;
  capitalHrCount: number;
  /** Effectifs des autres contractants, clé = contractantId. */
  autresCounts: Record<string, number>;
}

export interface PostesEffectifsPayload {
  ppc: PosteEffectifPpcRow[];
  capitalHr: PosteEffectifCapitalHrRow[];
  autres: PosteEffectifContractantRow[];
  resume: PosteEffectifResumeRow[];
  meta: {
    contractantNom: string | null;
    capitalHrContractantId: string | null;
    autresContractants: PosteEffectifContractantColumn[];
    ppcTotal: number;
    capitalHrTotal: number;
    autresTotal: number;
    postesTotal: number;
  };
}

function foldTitle(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function blank(value: string): string {
  const v = String(value || '').trim();
  return v || '—';
}

/** Regroupements / traductions FR → EN pour l’effectif par poste. */
const EFFECTIF_POSTE_GROUPS: Array<{ test: (folded: string) => boolean; label: string }> = [
  {
    test: (f) =>
      /\b(lubricator|lubrificateur|lubrificator)\b/.test(f)
      || f.includes('lubricator handyman')
      || f.includes('lubrificator handyman'),
    label: 'Lubricator Handyman',
  },
  {
    test: (f) => /\b(conducteur\s*elevateur|forklift|elevateur)\b/.test(f),
    label: 'Forklift Operator',
  },
  {
    test: (f) => /\bcrane\b/.test(f) && /\b(driver|operator|fitter)\b/.test(f),
    label: 'Crane Operator',
  },
  {
    test: (f) => {
      if (/\belevateur|forklift|crane\b/.test(f)) return false;
      return (
        /\b(driver|drivers|chauffeur|chauffeurs)\b/.test(f)
        || /^(conducteur|conducteurs)$/.test(f)
      );
    },
    label: 'Driver',
  },
  {
    test: (f) =>
      /\baide\s*menagere\b/.test(f)
      || /\bhousekeeper\b/.test(f)
      || /\bfemme\s*de\s*menage\b/.test(f)
      || /\bdomestic\s*helper\b/.test(f),
    label: 'Housekeeper',
  },
  {
    test: (f) =>
      /\bagent\s*d?\s*entretien\b/.test(f)
      || /\bagents?\s*d\s*entretien\b/.test(f)
      || /\bmaintenance\s*attendant\b/.test(f),
    label: 'Maintenance Attendant',
  },
  {
    test: (f) =>
      /\bchargee?\s*(e\s*)?des?\s*comptes?\s*clients?\b/.test(f)
      || /\bcustomer\s*accounts?\s*(officer|clerk)\b/.test(f),
    label: 'Customer Accounts Officer',
  },
  {
    test: (f) => /\belectriciens?\b/.test(f) || /\belectriciennes?\b/.test(f) || /\belectricians?\b/.test(f),
    label: 'Electrician',
  },
  {
    test: (f) =>
      /\blavandiere?s?\b/.test(f)
      || /\blaundry\s*(attendant|worker|hand|operator)\b/.test(f),
    label: 'Laundry Attendant',
  },
  {
    test: (f) => /\boperateur\s*portuaire\b/.test(f) || /\bport\s*operators?\b/.test(f),
    label: 'Port Operator',
  },
  {
    test: (f) => /\b(cuisiniere?s?|cooks?)\b/.test(f),
    label: 'Cook',
  },
  {
    test: (f) => /\breceptionnistes?\b/.test(f) || /\breceptionists?\b/.test(f),
    label: 'Receptionist',
  },
  {
    test: (f) => /\bwarehouse\s*cler(?:ck|k)\b/.test(f),
    label: 'Warehouse Clerk',
  },
  {
    test: (f) => f === 'warehouse' || /\bwarehouse\s*operators?\b/.test(f),
    label: 'Warehouse Operator',
  },
  {
    test: (f) => /\bhandy\s*mans?\b/.test(f) || /\bhandymen\b/.test(f),
    label: 'Handyman',
  },
  {
    test: (f) => /\bparking\s*queue\s*system\s*clerks?\b/.test(f),
    label: 'Parking Queue System Clerk',
  },
];

function applyEffectifPosteGroup(title: string): string | null {
  const f = foldTitle(title);
  if (!f) return null;
  for (const group of EFFECTIF_POSTE_GROUPS) {
    if (group.test(f)) return group.label;
  }
  return null;
}

function toDisplayTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^(of|and|the|for|in|to)$/i.test(w)) return w.toLowerCase();
      if (/^(hr|hse|it|ceo|cfo|wbo|tms)$/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Chauffeur / conducteur / driver → libellé unique « Driver ». */
export function isDriverTitle(title: string): boolean {
  return applyEffectifPosteGroup(title) === 'Driver';
}

/** Intitulé affiché : anglais + regroupements (Driver, Lubricator Handyman, …). */
export function normalizeEffectifPosteTitle(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\.+$/, '');
  if (!trimmed) return '—';

  const groupedRaw = applyEffectifPosteGroup(trimmed);
  if (groupedRaw) return groupedRaw;

  const bilingualEn = bilingualTitle(trimmed, 'en');
  const en = translateJobTitleToEnglish(bilingualEn || trimmed).trim();
  if (!en) return '—';

  const groupedEn = applyEffectifPosteGroup(en);
  if (groupedEn) return groupedEn;
  return toDisplayTitleCase(en);
}

/** Meilleur poste classifié correspondant à un intitulé (job title / fonction). */
export function matchClassificationPoste(
  title: string,
  postes: ClassificationPoste[],
): ClassificationPoste | null {
  const raw = String(title || '').trim();
  if (!raw) return null;

  let best: ClassificationPoste | null = null;
  let bestScore = 0;

  for (const poste of postes) {
    if (!titlesMatch(raw, poste.title) && !titlesMatch(normalizeEffectifPosteTitle(raw), poste.title)) {
      continue;
    }
    const foldedRaw = foldTitle(raw);
    const foldedPoste = foldTitle(poste.title);
    let score = 10;
    if (foldedRaw === foldedPoste) score = 100;
    else if (foldedRaw.includes(foldedPoste) || foldedPoste.includes(foldedRaw)) score = 70;
    else score = 40;
    score += Math.min(foldedPoste.length, 30) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = poste;
    }
  }

  return best;
}

function mapContractantEmployeeRow(
  emp: {
    id: string;
    nom: string;
    fonction: string;
    departement: string;
    lieuAffectation: string;
  },
  classification: ClassificationPoste[],
  contractantId: string,
  contractantNom: string,
): PosteEffectifContractantRow {
  const rawFonction = String(emp.fonction || '').trim();
  const matched = matchClassificationPoste(rawFonction, classification);
  const fonction = normalizeEffectifPosteTitle(
    matched?.title ? bilingualTitle(matched.title, 'en') || matched.title : rawFonction,
  );
  return {
    id: `${contractantId}:${emp.id}`,
    nom: emp.nom,
    fonction: blank(
      fonction === '—' && rawFonction ? normalizeEffectifPosteTitle(rawFonction) : fonction,
    ),
    classification: blank(matched?.classification || ''),
    department: blank(emp.departement || matched?.department || ''),
    lieuAffectation: blank(emp.lieuAffectation || ''),
    contractantId,
    contractantNom,
  };
}

export function buildPostesEffectifs(opts: {
  employees: Employee[];
  classification: ClassificationPoste[];
  contractants: Contractant[];
  /** Poste brut paie Capital HR (id employé → libellé fichier). */
  capitalHrPosteById?: Map<string, string> | Record<string, string>;
}): PostesEffectifsPayload {
  const { employees, classification, contractants } = opts;
  const posteCapHrMap =
    opts.capitalHrPosteById instanceof Map
      ? opts.capitalHrPosteById
      : new Map(Object.entries(opts.capitalHrPosteById || {}));
  const capital = findCapitalHrContractant(contractants);
  const autresContractantsList = contractants
    .filter((c) => !isCapitalHrContractantName(c.denomination))
    .slice()
    .sort((a, b) => a.denomination.localeCompare(b.denomination, 'fr'));

  const ppc: PosteEffectifPpcRow[] = employees
    .map((emp) => {
      const rawPoste = String(emp.jobTitle || emp.position || '').trim();
      const matched = matchClassificationPoste(rawPoste, classification);
      const poste = normalizeEffectifPosteTitle(
        matched?.title ? bilingualTitle(matched.title, 'en') || matched.title : rawPoste,
      );
      return {
        id: emp.matricule,
        matricule: emp.matricule,
        nom: emp.nom,
        poste: blank(poste === '—' && rawPoste ? normalizeEffectifPosteTitle(rawPoste) : poste),
        classification: blank(matched?.classification || ''),
        grade: blank(emp.grade || matched?.gradeNouveau || matched?.gradePaterson || ''),
        department: blank(emp.departement || emp.departmentHr || matched?.department || ''),
        localisation: blank(emp.localisation || matched?.location || ''),
      };
    })
    .sort((a, b) => {
      const ca = classificationRank(a.classification === '—' ? '' : a.classification);
      const cb = classificationRank(b.classification === '—' ? '' : b.classification);
      if (ca !== cb) return ca - cb;
      return a.nom.localeCompare(b.nom, 'en') || a.poste.localeCompare(b.poste, 'en');
    });

  const capitalEmployees = capitalHrEffectifEmployees(capital);
  const capitalHr: PosteEffectifCapitalHrRow[] = capitalEmployees
    .map((emp) => {
      const rawFonction = String(emp.fonction || '').trim();
      const posteCapHr = blank(posteCapHrMap.get(emp.id) || rawFonction);
      const matched = matchClassificationPoste(rawFonction || posteCapHr, classification);
      const fonction = normalizeEffectifPosteTitle(
        matched?.title ? bilingualTitle(matched.title, 'en') || matched.title : rawFonction,
      );
      return {
        id: emp.id,
        nom: emp.nom,
        posteCapHr,
        fonction: blank(
          fonction === '—' && rawFonction ? normalizeEffectifPosteTitle(rawFonction) : fonction,
        ),
        classification: blank(matched?.classification || ''),
        department: blank(emp.departement || matched?.department || ''),
        lieuAffectation: blank(emp.lieuAffectation || ''),
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.fonction.localeCompare(b.fonction, 'en'));

  const autres: PosteEffectifContractantRow[] = [];
  for (const c of autresContractantsList) {
    const actifs = (c.employees || []).filter(isCapitalHrEmployeeActive);
    for (const emp of actifs) {
      autres.push(mapContractantEmployeeRow(emp, classification, c.id, c.denomination));
    }
  }
  autres.sort(
    (a, b) =>
      a.contractantNom.localeCompare(b.contractantNom, 'fr')
      || a.nom.localeCompare(b.nom, 'fr')
      || a.fonction.localeCompare(b.fonction, 'en'),
  );

  const autresContractants: PosteEffectifContractantColumn[] = autresContractantsList
    .map((c) => ({
      id: c.id,
      nom: c.denomination,
      count: autres.filter((r) => r.contractantId === c.id).length,
    }))
    .filter((c) => c.count > 0)
    .map(({ id, nom }) => ({ id, nom }));

  type CountBucket = {
    poste: string;
    department: string;
    location: string;
    ppcCount: number;
    capitalHrCount: number;
    autresCounts: Record<string, number>;
  };
  const counts = new Map<string, CountBucket>();

  const bump = (
    posteLabel: string,
    side: 'ppc' | 'chr' | string,
    meta?: { department?: string; location?: string },
  ) => {
    const poste = String(posteLabel || '').trim() || 'Not specified';
    const key = foldTitle(poste);
    const matched = matchClassificationPoste(poste, classification);
    const cur = counts.get(key) || {
      poste,
      department: blank(matched?.department || meta?.department || ''),
      location: blank(matched?.location || meta?.location || ''),
      ppcCount: 0,
      capitalHrCount: 0,
      autresCounts: {},
    };
    if (cur.department === '—' && meta?.department) cur.department = blank(meta.department);
    if (cur.location === '—' && meta?.location) cur.location = blank(meta.location);
    if (cur.department === '—' && matched?.department) cur.department = blank(matched.department);
    if (cur.location === '—' && matched?.location) cur.location = blank(matched.location);
    if (side === 'ppc') cur.ppcCount += 1;
    else if (side === 'chr') cur.capitalHrCount += 1;
    else cur.autresCounts[side] = (cur.autresCounts[side] || 0) + 1;
    counts.set(key, cur);
  };

  for (const row of ppc) {
    bump(row.poste === '—' ? 'Not specified' : row.poste, 'ppc', {
      department: row.department,
      location: row.localisation,
    });
  }
  for (const row of capitalHr) {
    bump(row.fonction === '—' ? 'Not specified' : row.fonction, 'chr', {
      department: row.department,
      location: row.lieuAffectation,
    });
  }
  for (const row of autres) {
    bump(row.fonction === '—' ? 'Not specified' : row.fonction, row.contractantId, {
      department: row.department,
      location: row.lieuAffectation,
    });
  }

  const resume: PosteEffectifResumeRow[] = [...counts.values()]
    .map((row) => {
      const autresCounts: Record<string, number> = {};
      for (const col of autresContractants) {
        autresCounts[col.id] = row.autresCounts[col.id] || 0;
      }
      return {
        poste: row.poste,
        department: row.department,
        location: row.location,
        ppcCount: row.ppcCount,
        capitalHrCount: row.capitalHrCount,
        autresCounts,
      };
    })
    .sort((a, b) => a.poste.localeCompare(b.poste, 'en', { sensitivity: 'base' }));

  return {
    ppc,
    capitalHr,
    autres,
    resume,
    meta: {
      contractantNom: capital?.denomination || null,
      capitalHrContractantId: capital?.id || null,
      autresContractants,
      ppcTotal: ppc.length,
      capitalHrTotal: capitalHr.length,
      autresTotal: autres.length,
      postesTotal: resume.length,
    },
  };
}
