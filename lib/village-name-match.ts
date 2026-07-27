import { normalizePersonName } from '@/lib/dependants-pactilis-compare';

export interface NameMatchCandidate {
  matricule: string;
  nom: string;
}

export interface NameMatchResult {
  candidate: NameMatchCandidate;
  score: number;
}

function tokens(name: string): string[] {
  return normalizePersonName(name)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/** Distance de Levenshtein bornée (pour tokens courts). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) grid[i]![0] = i;
  for (let j = 0; j < cols; j++) grid[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        grid[i - 1]![j]! + 1,
        grid[i]![j - 1]! + 1,
        grid[i - 1]![j - 1]! + cost,
      );
    }
  }
  return grid[a.length]![b.length]!;
}

function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 2) return false;
  const dist = editDistance(a, b);
  if (maxLen <= 5) return dist <= 1;
  return dist <= 2 || dist / maxLen <= 0.34;
}

/**
 * Score 0–100 : correspondance floue query ↔ candidat (noms village vs EMPLOYEE).
 */
export function scoreNameMatch(query: string, candidateName: string): number {
  const qNorm = normalizePersonName(query);
  const cNorm = normalizePersonName(candidateName);
  if (!qNorm || !cNorm) return 0;
  if (qNorm === cNorm) return 100;

  const qTokens = tokens(query);
  const cTokens = tokens(candidateName);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  let matched = 0;
  for (const qt of qTokens) {
    if (cTokens.some((ct) => tokenSimilar(qt, ct))) matched += 1;
  }
  const coverage = matched / qTokens.length;
  if (coverage < 0.5) return Math.round(coverage * 40);

  // Bonus si prénom + nom (au moins 2 tokens query) matchent
  let score = 50 + coverage * 40;
  if (matched >= 2) score += 8;
  if (cNorm.includes(qNorm) || qNorm.includes(cNorm)) score += 5;
  return Math.min(99, Math.round(score));
}

export function findBestNameMatch(
  query: string,
  candidates: NameMatchCandidate[],
  minScore = 62,
): NameMatchResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  let best: NameMatchResult | null = null;
  for (const candidate of candidates) {
    const score = scoreNameMatch(trimmed, candidate.nom);
    if (score < minScore) continue;
    if (!best || score > best.score) best = { candidate, score };
  }
  return best;
}

/** Libellés non-personnes à ignorer (école, etc.). */
export function isNonPersonOccupantLabel(label: string): boolean {
  const n = normalizePersonName(label);
  if (!n) return true;
  return /nursery|school|ecole|ecole|vacant|vide|empty|libre/.test(n);
}
