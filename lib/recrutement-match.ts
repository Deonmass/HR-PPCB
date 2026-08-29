import type { PosteGroup, VacantPoste } from './postes-types';
import {
  isAugust2026,
  normalizeRecrutementStatus,
  parseSlotsFromPosition,
  toIsoDate,
  type RecrutementOccupant,
  type RecrutementRow,
  type RecrutementRowEnriched,
  type RecrutementStatus,
} from './recrutement-types';
import type { Employee } from './types';

const TITLE_ALIASES: Record<string, string[]> = {
  cro: ['customer relationship officer'],
  'customer relationship officer': ['cro'],
  'sales and marketing head': ['head of sales and marketing', 'sales marketing head'],
  'mechanical foreman': ['mechanical foreman', 'mecanicien foreman'],
  'lab analyst': ['laboratory analyst', 'analyste laboratoire'],
};

function fold(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function aliasKeys(title: string): string[] {
  const key = fold(title);
  const extra = TITLE_ALIASES[key] || [];
  return [key, ...extra.map(fold)];
}

export function titlesMatch(a: string, b: string): boolean {
  const keysA = aliasKeys(a);
  const keysB = aliasKeys(b);
  if (keysA.some((k) => keysB.includes(k))) return true;
  for (const ka of keysA) {
    for (const kb of keysB) {
      if (!ka || !kb) continue;
      if (ka === kb) return true;
      const short = ka.length <= kb.length ? ka : kb;
      const long = ka.length > kb.length ? ka : kb;
      if (short.length >= 10 && long.includes(short)) return true;
      const words = short.split(' ').filter((w) => w.length > 2);
      if (words.length >= 2 && words.every((w) => long.includes(w))) return true;
      const firstA = ka.split(' ')[0] || '';
      const firstB = kb.split(' ')[0] || '';
      if (firstA && firstA === firstB && firstA.length >= 6 && (ka === firstA || kb === firstA)) return true;
    }
  }
  return false;
}

function foldLocation(value: string): string {
  const n = fold(value);
  if (!n) return '';
  if (n === 'hq' || n === 'head office' || n.includes('kinshasa')) return 'kinshasa';
  if (n.includes('lubudi') || n.includes('grand katanga')) return 'lubudi';
  if (n.includes('plant') || n.includes('usine')) return 'plant';
  if (n.includes('zamba')) return 'zamba';
  if (n.includes('kisangani')) return 'kisangani';
  if (n.includes('kindu')) return 'kindu';
  return n;
}

export function locationsCompatible(a: string, b: string): boolean {
  const na = foldLocation(a);
  const nb = foldLocation(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function occupantFromEmployee(emp: Employee): RecrutementOccupant {
  const appointmentDate = String(emp.appointmentDate || '').trim();
  return {
    matricule: emp.matricule,
    nom: emp.nom.trim(),
    localisation: emp.localisation || '',
    grade: emp.grade || emp.patersonGrade || '',
    appointmentDate,
    appointmentIso: toIsoDate(appointmentDate),
  };
}

function scoreGroup(row: RecrutementRow, group: PosteGroup, title: string): number {
  if (!titlesMatch(title, group.title)) return 0;
  let score = 40;
  if (fold(title) === fold(group.title)) score += 30;
  if (row.location && locationsCompatible(row.location, group.location)) score += 20;
  if (row.department && fold(row.department) && fold(group.department).includes(fold(row.department))) {
    score += 8;
  }
  if (row.grade && fold(row.grade) === fold(group.grade)) score += 6;
  return score;
}

function filterOccupants(
  occupants: RecrutementOccupant[],
  location: string,
): RecrutementOccupant[] {
  if (!location.trim()) return occupants;
  return occupants.filter((o) => locationsCompatible(location, o.localisation));
}

export function enrichRecrutementRow(
  row: RecrutementRow,
  groups: PosteGroup[],
  vacants: VacantPoste[],
  employees: Employee[],
): RecrutementRowEnriched {
  const { title, slots } = parseSlotsFromPosition(row.position);
  let best: PosteGroup | null = null;
  let bestScore = 0;
  for (const group of groups) {
    const score = scoreGroup(row, group, title);
    if (score > bestScore) {
      best = group;
      bestScore = score;
    }
  }

  const empByMat = new Map(employees.map((e) => [e.matricule, e]));
  let occupants: RecrutementOccupant[] = [];
  if (best && bestScore >= 40) {
    occupants = best.occupants
      .map((o) => empByMat.get(o.matricule))
      .filter((e): e is Employee => e != null && String(e.statut || '').toLowerCase() !== 'inactive')
      .map(occupantFromEmployee);
    occupants = filterOccupants(occupants, row.location);
  }

  if (!occupants.length) {
    occupants = employees
      .filter((e) => String(e.statut || '').toLowerCase() !== 'inactive')
      .filter((e) => titlesMatch(title, e.jobTitle || e.position || ''))
      .filter((e) => locationsCompatible(row.location, e.localisation))
      .map(occupantFromEmployee);
  }

  if (row.category === 'new') {
    const recent = occupants.filter((o) => o.appointmentIso && o.appointmentIso >= '2026-08-01');
    occupants = recent;
  }

  const vacantHeadcount = vacants
    .filter((v) => titlesMatch(title, v.title) && locationsCompatible(row.location, v.location))
    .reduce((sum, v) => sum + (v.headcount || 0), 0);

  const dates = new Set<string>();
  const filledIso = toIsoDate(row.filledAt || '');
  if (filledIso) dates.add(filledIso);
  for (const o of occupants) {
    if (o.appointmentIso) dates.add(o.appointmentIso);
  }
  const recruitmentDates = [...dates].sort();
  const filledInAugust = recruitmentDates.some(isAugust2026);

  let suggestedStatus: RecrutementStatus | '' = '';
  if (occupants.length >= slots) suggestedStatus = 'Done';
  else if (occupants.length > 0) suggestedStatus = 'Ongoing';

  const status = normalizeRecrutementStatus(row.status);

  return {
    ...row,
    status,
    slots,
    catalogTitle: best && bestScore >= 40 ? best.title : '',
    catalogMatch: Boolean(best && bestScore >= 40),
    occupants,
    vacantHeadcount,
    recruitmentDates,
    filledInAugust,
    suggestedStatus,
  };
}

export function seedFilledAt(position: string, location: string, category: string): string {
  const title = fold(parseSlotsFromPosition(position).title);
  const loc = foldLocation(location);
  if (category === 'new' && (title === 'cro' || title.startsWith('cro ')) && !loc) {
    return '2026-08-14';
  }
  if (category === 'new' && title === 'lab analyst' && loc === 'zamba') {
    return '2026-08-12';
  }
  return '';
}
