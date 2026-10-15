import { departmentsEqual } from './exco-department-map';

export interface ResponsableCandidate {
  matricule: string;
  nom: string;
  departement?: string;
  jobTitle?: string;
  /** L’agent a quitté l’entreprise. */
  parti?: boolean;
}

export interface ResponsableLink {
  matricule: string;
  nom: string;
  departement: string;
  jobTitle: string;
  parti: boolean;
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokensOf(value: string): string[] {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Libellés de flotte, pas des personnes. */
function isFleetLabel(value: string): boolean {
  const text = tokensOf(value).join(' ');
  if (!text) return true;
  return /\b(vehicule|ambulance|secours|pool|bus)\b/.test(text);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  const prev = new Array<number>(b.length + 1);
  const next = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = next[j];
  }
  return prev[b.length];
}

function tokenMatches(query: string, words: string[]): boolean {
  if (words.some((word) => word === query)) return true;
  if (query.length <= 3) return words.some((word) => word.startsWith(query));
  return words.some((word) => {
    if (word.startsWith(query) || query.startsWith(word)) return false;
    const shortest = Math.min(query.length, word.length);
    if (shortest < 6 || Math.abs(query.length - word.length) > 1) return false;
    let prefix = 0;
    while (prefix < shortest && query[prefix] === word[prefix]) prefix += 1;
    if (prefix < 4) return false;
    const limit = query.length >= 7 || word.length >= 7 ? 2 : 1;
    return editDistance(query, word) <= limit;
  });
}

function hintScore(hit: ResponsableLink, departmentHint: string): number {
  const hint = departmentHint.trim();
  if (!hint) return 0;
  let score = 0;
  if (hit.departement && departmentsEqual(hit.departement, hint)) score += 2;
  const hintTokens = tokensOf(hint).filter((token) => token.length >= 4);
  const job = tokensOf(hit.jobTitle);
  if (hintTokens.some((token) => job.some((word) => word === token || word.startsWith(token)))) {
    score += 3;
  }
  return score;
}

function pickResponsable(hits: ResponsableLink[], departmentHint?: string): ResponsableLink | null {
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) return null;
  const scored = hits.map((hit) => ({ hit, score: hintScore(hit, departmentHint || '') }));
  const best = Math.max(...scored.map((item) => item.score));
  if (best <= 0) return null;
  const top = scored.filter((item) => item.score === best);
  if (top.length === 1) return top[0].hit;
  const actifs = top.filter((item) => !item.hit.parti);
  return actifs.length === 1 ? actifs[0].hit : null;
}

/**
 * Relie un libellé court (« Serge M », « Bovick ») au nom officiel
 * lorsqu’un seul employé correspond à tous les mots.
 * Le département du véhicule départage les homonymes (ex. Emmanuel du warehouse).
 */
export function resolveResponsable(
  raw: string,
  employees: ResponsableCandidate[],
  departmentHint?: string,
): ResponsableLink | null {
  const query = tokensOf(raw);
  if (query.length === 0 || isFleetLabel(raw)) return null;

  const hits: ResponsableLink[] = [];
  for (const employee of employees) {
    const nom = employee.nom.trim();
    const matricule = employee.matricule.trim();
    if (!nom || !matricule) continue;
    const words = tokensOf(nom);
    if (words.length === 0) continue;
    if (query.every((token) => tokenMatches(token, words))) {
      hits.push({
        matricule,
        nom,
        departement: (employee.departement || '').trim(),
        jobTitle: (employee.jobTitle || '').trim(),
        parti: Boolean(employee.parti),
      });
    }
  }

  return pickResponsable(hits, departmentHint);
}
