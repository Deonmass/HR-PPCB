/** Formulaire RRF — Recruitment Requisition approval Form (PPCB-HR-DOC-26). */

export type RrfYesNo = 'Yes' | 'No' | '';

export type RrfNewOrReplacement = 'New position' | 'Replacement' | '';

export type RrfWorkSchedule = 'Full time' | 'Part time' | '';

export type RrfPosting = 'Internal' | 'External' | 'Internal & External' | '';

export interface RrfBenefits {
  car: boolean;
  fuelAllowance: boolean;
  housing: boolean;
  phone: boolean;
  laptop: boolean;
}

export interface RrfFormData {
  /** Position to be recruited (fonction + suggestion). */
  positionTitle: string;
  /** Number of vacancies. */
  headcount: string;
  costCenter: string;
  headAccountBlueprint: RrfYesNo;
  headAccountJustification: string;
  positionBudgeted: RrfYesNo;
  budgetJustification: string;
  newOrReplacement: RrfNewOrReplacement;
  workSchedule: RrfWorkSchedule;
  jobTitle: string;
  jobDescription: string;
  jobLevel: string;
  reportsTo: string;
  location: string;
  preferredStartDate: string;
  posting: RrfPosting;
  benefits: RrfBenefits;
  recruitmentRequestedBy: string;
  lineManagerRole: string;
  lineManagerApprovedBy: string;
  plantControllerRole: string;
  plantControllerApprovedBy: string;
  headOfDeptRole: string;
  headOfDeptApprovedBy: string;
  talentManagerRole: string;
  talentManagerApprovedBy: string;
  hrmRole: string;
  hrmApprovedBy: string;
  excoRole: string;
  excoApprovedBy: string;
}

export const RRF_EMPTY_FORM: RrfFormData = {
  positionTitle: '',
  headcount: '1',
  costCenter: '',
  headAccountBlueprint: '',
  headAccountJustification: '',
  positionBudgeted: '',
  budgetJustification: '',
  newOrReplacement: '',
  workSchedule: 'Full time',
  jobTitle: '',
  jobDescription: '',
  jobLevel: '',
  reportsTo: '',
  location: '',
  preferredStartDate: '',
  posting: 'Internal',
  benefits: {
    car: false,
    fuelAllowance: false,
    housing: false,
    phone: false,
    laptop: false,
  },
  recruitmentRequestedBy: '',
  lineManagerRole: 'Line Manager',
  lineManagerApprovedBy: '',
  plantControllerRole: 'Plant/finance Controller',
  plantControllerApprovedBy: '',
  headOfDeptRole: 'Head of department',
  headOfDeptApprovedBy: '',
  talentManagerRole: 'Talent and Development Manager',
  talentManagerApprovedBy: '',
  hrmRole: 'HRM',
  hrmApprovedBy: '',
  excoRole: 'Exco Member / Plant Manager',
  excoApprovedBy: '',
};

export const RRF_BENEFIT_LABELS: { key: keyof RrfBenefits; label: string }[] = [
  { key: 'car', label: 'Car' },
  { key: 'fuelAllowance', label: 'Fuel Allowance' },
  { key: 'housing', label: 'Housing' },
  { key: 'phone', label: 'Phone' },
  { key: 'laptop', label: 'Laptop' },
];

/** Suggestion de fonction construite depuis les employés (job title). */
export interface RrfJobSuggestion {
  jobTitle: string;
  costCenter: string;
  reportsTo: string;
  location: string;
  sampleCount: number;
}

function majority(values: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

/** Agrège les postes existants pour suggestions RRF. */
export function buildRrfJobSuggestions(
  employees: Array<{
    jobTitle?: string;
    centreCout?: string;
    localisation?: string;
    lineManagerName?: string;
    lineManagerPosition?: string;
  }>,
): RrfJobSuggestion[] {
  const byTitle = new Map<
    string,
    { costs: string[]; locs: string[]; reports: string[]; n: number }
  >();

  for (const e of employees) {
    const title = String(e.jobTitle ?? '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    let bucket = byTitle.get(key);
    if (!bucket) {
      bucket = { costs: [], locs: [], reports: [], n: 0 };
      byTitle.set(key, bucket);
    }
    bucket.n += 1;
    bucket.costs.push(String(e.centreCout ?? ''));
    bucket.locs.push(String(e.localisation ?? ''));
    const reports =
      String(e.lineManagerPosition ?? '').trim()
      || String(e.lineManagerName ?? '').trim();
    bucket.reports.push(reports);
  }

  const titleDisplay = new Map<string, string>();
  for (const e of employees) {
    const title = String(e.jobTitle ?? '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (!titleDisplay.has(key)) titleDisplay.set(key, title);
  }

  const result: RrfJobSuggestion[] = [];
  for (const [key, bucket] of byTitle) {
    result.push({
      jobTitle: titleDisplay.get(key) || key,
      costCenter: majority(bucket.costs),
      reportsTo: majority(bucket.reports),
      location: majority(bucket.locs),
      sampleCount: bucket.n,
    });
  }

  return result.sort((a, b) => a.jobTitle.localeCompare(b.jobTitle, 'fr'));
}

export function filterRrfJobSuggestions(
  items: RrfJobSuggestion[],
  query: string,
  limit = 12,
): RrfJobSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  return items
    .filter((item) => {
      const hay = `${item.jobTitle} ${item.costCenter} ${item.location} ${item.reportsTo}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);
}

export function yn(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function formatRrfDisplayDate(isoOrDisplay: string): string {
  const raw = String(isoOrDisplay || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}. ${iso[1]}`;
  return raw;
}

export function normalizeRrfText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Localisations uniques (employés actives si possible). */
export function buildRrfLocationSuggestions(
  employees: Array<{ localisation?: string; statut?: string }>,
): string[] {
  const set = new Map<string, string>();
  for (const e of employees) {
    const loc = String(e.localisation ?? '').trim();
    if (!loc) continue;
    const key = loc.toLowerCase();
    if (!set.has(key)) set.set(key, loc);
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function filterStringSuggestions(
  items: string[],
  query: string,
  limit = 12,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  return items.filter((item) => item.toLowerCase().includes(q)).slice(0, limit);
}

/** Rôles d’approbation RRF + mots-clés job title. */
export const RRF_APPROVER_FIELDS = [
  {
    roleKey: 'lineManagerRole' as const,
    nameKey: 'lineManagerApprovedBy' as const,
    fallback: 'Line Manager',
    keywords: ['line manager'],
  },
  {
    roleKey: 'plantControllerRole' as const,
    nameKey: 'plantControllerApprovedBy' as const,
    fallback: 'Plant/finance Controller',
    keywords: [
      'plant controller',
      'finance controller',
      'financial controller',
      'plant finance',
      'plant/finance controller',
    ],
  },
  {
    roleKey: 'headOfDeptRole' as const,
    nameKey: 'headOfDeptApprovedBy' as const,
    fallback: 'Head of department',
    keywords: ['head of department', 'head of dept', 'hod'],
  },
  {
    roleKey: 'talentManagerRole' as const,
    nameKey: 'talentManagerApprovedBy' as const,
    fallback: 'Talent and Development Manager',
    keywords: [
      'talent and development',
      'talent development',
      'talent manager',
      'learning and development',
    ],
  },
  {
    roleKey: 'hrmRole' as const,
    nameKey: 'hrmApprovedBy' as const,
    fallback: 'HRM',
    keywords: [
      'hrm',
      'head of human resources',
      'human resources manager',
      'head of hr',
      'hr manager',
      'head human resources',
    ],
  },
  {
    roleKey: 'excoRole' as const,
    nameKey: 'excoApprovedBy' as const,
    fallback: 'Exco Member / Plant Manager',
    keywords: [
      'plant manager',
      'exco member',
      'exco',
      'general manager',
      'managing director',
      'country manager',
    ],
  },
] as const;

function roleKeywordScore(jobTitle: string, roleLabel: string, keywords: string[]): number {
  const title = normalizeRrfText(jobTitle);
  if (!title) return 0;
  let best = 0;
  const label = normalizeRrfText(roleLabel);
  if (label && (title === label || title.includes(label) || label.includes(title))) {
    best = Math.max(best, title === label ? 100 : 70);
  }
  for (const kw of keywords) {
    const n = normalizeRrfText(kw);
    if (!n) continue;
    if (title === n) best = Math.max(best, 100);
    else if (title.includes(n)) best = Math.max(best, 80 + Math.min(n.length, 15));
    else if (n.includes(title) && title.length >= 4) best = Math.max(best, 50);
  }
  return best;
}

/** Trie les employés : matches du libellé de rôle en premier. */
export function employeesForRrfRole(
  employees: Array<{ nom?: string; jobTitle?: string; matricule?: string; departement?: string; statut?: string }>,
  roleLabel: string,
  keywords: string[],
): typeof employees {
  const list = employees.filter((e) => String(e.nom ?? '').trim());
  return [...list].sort((a, b) => {
    const sa = roleKeywordScore(String(a.jobTitle ?? ''), roleLabel, keywords);
    const sb = roleKeywordScore(String(b.jobTitle ?? ''), roleLabel, keywords);
    if (sb !== sa) return sb - sa;
    return String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr');
  });
}

/** Première personne dont le poste correspond au libellé / mots-clés. */
export function findApproverNameForRole(
  employees: Array<{ nom?: string; jobTitle?: string }>,
  roleLabel: string,
  keywords: string[],
): string {
  let bestName = '';
  let bestScore = 0;
  for (const e of employees) {
    const name = String(e.nom ?? '').trim();
    if (!name) continue;
    const score = roleKeywordScore(String(e.jobTitle ?? ''), roleLabel, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }
  return bestScore >= 50 ? bestName : '';
}

/** Remplit les cases Approved by vides selon les libellés de rôle. */
export function autoFillRrfApprovers(
  form: RrfFormData,
  employees: Array<{ nom?: string; jobTitle?: string }>,
): RrfFormData {
  const next = { ...form };
  for (const field of RRF_APPROVER_FIELDS) {
    const current = String(next[field.nameKey] ?? '').trim();
    if (current) continue;
    const roleLabel = String(next[field.roleKey] || field.fallback);
    const found = findApproverNameForRole(employees, roleLabel, [...field.keywords]);
    if (found) next[field.nameKey] = found;
  }
  return next;
}
