import type { Employee } from '@/lib/types';

function isActiveEmployee(e: Employee): boolean {
  const statut = String(e.statut || '').toLowerCase();
  return !statut || statut === 'active' || statut === 'actif';
}

function isHrDepartment(value: string): boolean {
  const d = value.trim().toLowerCase();
  if (!d) return false;
  return (
    d.includes('human resources')
    || d.includes('ressources humaines')
    || d.includes('resource humaine')
    || d === 'rh'
    || d === 'hr'
    || d.startsWith('rh ')
    || d.startsWith('hr ')
    || d.includes(' hr')
    || /\brh\b/.test(d)
  );
}

function titleOf(e: Employee): string {
  return `${e.jobTitle || ''} ${e.position || ''}`.trim().toLowerCase();
}

function deptOf(e: Employee): string {
  return `${e.departement || ''} ${e.departmentHr || ''}`.trim().toLowerCase();
}

/** Responsables / managers du département HR. */
export function isHrDepartmentResponsable(e: Employee): boolean {
  if (!isHrDepartment(deptOf(e))) return false;
  const title = titleOf(e);
  if (!title) return false;
  return (
    /\bmanager\b/i.test(title)
    || /\bhead of\b/i.test(title)
    || /\bchef\b/i.test(title)
    || /\bdirecteur\b/i.test(title)
    || /\bresponsable\b/i.test(title)
    || /plant\s*hr/.test(title)
  );
}

/** Chef d’usine / Plant Manager. */
export function isPlantManagerOrChefUsine(e: Employee): boolean {
  const title = titleOf(e);
  if (!title) return false;
  return (
    /plant\s*manager/.test(title)
    || /chef\s*d['’]?\s*usine/.test(title)
    || /factory\s*manager/.test(title)
  );
}

/** Managing Director / MD. */
export function isManagingDirector(e: Employee): boolean {
  const title = titleOf(e);
  const dept = deptOf(e);
  if (/managing\s*director/.test(title)) return true;
  if (/\bdirecteur\s*g[eé]n[eé]ral\b/.test(title)) return true;
  if (/(^|\s)md(\s|$)/.test(title) && !/assistant|secretary|secr[eé]taire|driver|chauffeur/.test(title)) {
    return true;
  }
  if (
    (dept.includes('md office') || dept === 'md' || dept.startsWith('md '))
    && (/\bdirector\b|\bdirecteur\b|\bmanager\b|\bchef\b|(^|\s)md(\s|$)/.test(title) || !title)
  ) {
    // Titre MD / directeur dans le bureau MD, ou unique occupant MD Office sans titre parasite
    if (!title) return dept.includes('md office') || dept === 'md';
    return !/assistant|secretary|secr[eé]taire|driver|chauffeur|clerk/.test(title);
  }
  return false;
}

/**
 * Signataires autorisés pour les attestations (congé, résidence, service) :
 * responsables HR, chef d’usine / Plant Manager, MD.
 */
export function isAttestationSignatory(e: Employee): boolean {
  if (!isActiveEmployee(e)) return false;
  return (
    isHrDepartmentResponsable(e)
    || isPlantManagerOrChefUsine(e)
    || isManagingDirector(e)
  );
}

export function filterAttestationSignatories(employees: Employee[]): Employee[] {
  return employees.filter(isAttestationSignatory);
}
