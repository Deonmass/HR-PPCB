import type { Contractant } from '@/lib/contractants-types';
import { findBestNameMatch, isNonPersonOccupantLabel } from '@/lib/village-name-match';
import type { Employee } from '@/lib/types';

export type OrganigrammeScope = 'entreprise' | 'departement' | 'service';

export interface OrgChartEmployee {
  matricule: string;
  nom: string;
  jobTitle: string;
  grade: string;
  departement: string;
  service: string;
  localisation: string;
  lineManagerName: string;
  lineManagerPosition: string;
  statut: string;
}

export interface OrgChartNode {
  id: string;
  matricule: string;
  nom: string;
  jobTitle: string;
  grade: string;
  departement: string;
  service: string;
  localisation: string;
  /** Nœud synthétique (manager hors périmètre ou non résolu dans la base). */
  isExternal?: boolean;
  /** Manager hors du filtre département/service courant. */
  isOutsideScope?: boolean;
  /** Personnel contractant (couleur distincte). */
  isContractant?: boolean;
  /** Société contractante. */
  contractantName?: string;
  children: OrgChartNode[];
}

export interface OrganigrammeBuildResult {
  roots: OrgChartNode[];
  employeeCount: number;
  managerLinks: number;
  unresolvedManagers: string[];
  externalRoots: number;
}

function normKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isActiveEmployee(employee: Employee): boolean {
  const statut = String(employee.statut || 'Active').trim().toLowerCase();
  return !statut || statut === 'active';
}

function toChartEmployee(employee: Employee): OrgChartEmployee {
  return {
    matricule: String(employee.matricule || '').trim(),
    nom: String(employee.nom || '').trim(),
    jobTitle: String(employee.jobTitle || employee.position || '').trim(),
    grade: String(employee.grade || employee.patersonGrade || '').trim(),
    departement: String(employee.departement || employee.departmentHr || '').trim(),
    service: String(employee.service || '').trim(),
    localisation: String(employee.localisation || '').trim(),
    lineManagerName: String(employee.lineManagerName || '').trim(),
    lineManagerPosition: String(employee.lineManagerPosition || '').trim(),
    statut: String(employee.statut || 'Active').trim() || 'Active',
  };
}

function looksLikePersonName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === '0' || /^n\/?a$/i.test(trimmed)) return false;
  if (isNonPersonOccupantLabel(trimmed)) return false;
  // Titres / rôles sans personne identifiable
  if (
    /^(ppc\s*group|mechanical engineer|mobile equipment operator|transport optimisation manager)$/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  // Au moins une lettre
  return /[a-zA-ZÀ-ÿ]/.test(trimmed);
}

function employeeNode(emp: OrgChartEmployee, extras?: Partial<OrgChartNode>): OrgChartNode {
  return {
    id: `emp:${emp.matricule}`,
    matricule: emp.matricule,
    nom: emp.nom,
    jobTitle: emp.jobTitle,
    grade: emp.grade,
    departement: emp.departement,
    service: emp.service,
    localisation: emp.localisation,
    children: [],
    ...extras,
  };
}

function externalNode(
  name: string,
  position: string,
  extras?: Partial<OrgChartNode>,
): OrgChartNode {
  return {
    id: `ext:${normKey(name)}`,
    matricule: '',
    nom: name,
    jobTitle: position,
    grade: '',
    departement: '',
    service: '',
    localisation: '',
    isExternal: true,
    children: [],
    ...extras,
  };
}

function countNodes(nodes: OrgChartNode[]): number {
  let n = 0;
  const walk = (list: OrgChartNode[]) => {
    for (const node of list) {
      n += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return n;
}

/**
 * Résout le line manager d’un employé vers un matricule actif (matching flou de noms).
 */
export function resolveLineManagerMatricule(
  lineManagerName: string,
  candidates: Array<{ matricule: string; nom: string }>,
  selfMatricule?: string,
): string | null {
  if (!looksLikePersonName(lineManagerName)) return null;
  const pool = selfMatricule
    ? candidates.filter((c) => c.matricule !== selfMatricule)
    : candidates;
  const match = findBestNameMatch(lineManagerName, pool, 62);
  return match?.candidate.matricule ?? null;
}

export function listOrganigrammeDepartments(
  employees: Employee[],
  contractants: Contractant[] = [],
): string[] {
  const set = new Set<string>();
  for (const e of employees) {
    if (!isActiveEmployee(e)) continue;
    const d = String(e.departement || e.departmentHr || '').trim();
    if (d) set.add(d);
  }
  for (const c of contractants) {
    for (const e of c.employees || []) {
      if (String(e.dateSortie || '').trim()) continue;
      const d = String(e.departement || '').trim();
      if (d) set.add(d);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

export function listOrganigrammeServices(
  employees: Employee[],
  departement?: string,
  contractants: Contractant[] = [],
): string[] {
  const deptKey = departement ? normKey(departement) : '';
  const set = new Set<string>();
  for (const e of employees) {
    if (!isActiveEmployee(e)) continue;
    const d = String(e.departement || e.departmentHr || '').trim();
    if (deptKey && normKey(d) !== deptKey) continue;
    const s = String(e.service || '').trim();
    if (s) set.add(s);
  }
  for (const c of contractants) {
    for (const e of c.employees || []) {
      if (String(e.dateSortie || '').trim()) continue;
      const d = String(e.departement || '').trim();
      if (deptKey && normKey(d) !== deptKey) continue;
      const s = String(e.service || '').trim();
      if (s) set.add(s);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function inScope(
  emp: OrgChartEmployee,
  scope: OrganigrammeScope,
  departement: string,
  service: string,
): boolean {
  if (scope === 'entreprise') return true;
  if (scope === 'departement') {
    return Boolean(departement) && normKey(emp.departement) === normKey(departement);
  }
  if (scope === 'service') {
    if (!service) return false;
    if (normKey(emp.service) !== normKey(service)) return false;
    if (departement && normKey(emp.departement) !== normKey(departement)) return false;
    return true;
  }
  return true;
}

/**
 * Construit la forêt d’organigramme à partir des line managers.
 */
export function buildOrganigramme(
  employees: Employee[],
  options: {
    scope: OrganigrammeScope;
    departement?: string;
    service?: string;
  },
): OrganigrammeBuildResult {
  const scope = options.scope;
  const departement = String(options.departement || '').trim();
  const service = String(options.service || '').trim();

  const allActive = employees.filter(isActiveEmployee).map(toChartEmployee)
    .filter((e) => e.matricule && e.nom);

  const byMatricule = new Map(allActive.map((e) => [e.matricule, e]));
  const nameCandidates = allActive.map((e) => ({ matricule: e.matricule, nom: e.nom }));

  const scoped = allActive.filter((e) => inScope(e, scope, departement, service));
  const scopedIds = new Set(scoped.map((e) => e.matricule));

  const managerOf = new Map<string, string | null>();
  const unresolved = new Set<string>();
  let managerLinks = 0;

  for (const emp of scoped) {
    const lmName = emp.lineManagerName;
    if (!looksLikePersonName(lmName)) {
      managerOf.set(emp.matricule, null);
      continue;
    }
    const resolved = resolveLineManagerMatricule(lmName, nameCandidates, emp.matricule);
    if (resolved) {
      managerOf.set(emp.matricule, resolved);
      managerLinks += 1;
    } else {
      managerOf.set(emp.matricule, null);
      unresolved.add(lmName);
    }
  }

  const wouldCreateCycle = (fromMatricule: string, toManagerMatricule: string): boolean => {
    let cur: string | null = toManagerMatricule;
    const seen = new Set<string>([fromMatricule]);
    while (cur && scopedIds.has(cur)) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = managerOf.get(cur) ?? null;
    }
    return false;
  };

  const nodeMap = new Map<string, OrgChartNode>();
  for (const emp of scoped) {
    nodeMap.set(emp.matricule, employeeNode(emp));
  }

  const roots: OrgChartNode[] = [];
  const attachedExternal = new Map<string, OrgChartNode>();
  let externalRoots = 0;

  const ensureExternal = (
    key: string,
    name: string,
    position: string,
    outside: boolean,
  ): OrgChartNode => {
    const existing = attachedExternal.get(key);
    if (existing) return existing;
    const node = externalNode(name, position, { isOutsideScope: outside });
    attachedExternal.set(key, node);
    roots.push(node);
    externalRoots += 1;
    return node;
  };

  for (const emp of scoped) {
    const node = nodeMap.get(emp.matricule)!;
    const managerMat = managerOf.get(emp.matricule) ?? null;

    if (
      managerMat
      && scopedIds.has(managerMat)
      && !wouldCreateCycle(emp.matricule, managerMat)
    ) {
      nodeMap.get(managerMat)!.children.push(node);
      continue;
    }

    if (managerMat && byMatricule.has(managerMat)) {
      const mgr = byMatricule.get(managerMat)!;
      const parent = ensureExternal(
        `mgr:${mgr.matricule}`,
        mgr.nom,
        mgr.jobTitle || mgr.lineManagerPosition,
        true,
      );
      parent.matricule = mgr.matricule;
      parent.departement = mgr.departement;
      parent.service = mgr.service;
      parent.grade = mgr.grade;
      parent.localisation = mgr.localisation;
      parent.isExternal = false;
      parent.isOutsideScope = true;
      parent.children.push(node);
      continue;
    }

    if (looksLikePersonName(emp.lineManagerName) && !managerMat) {
      const parent = ensureExternal(
        `name:${normKey(emp.lineManagerName)}`,
        emp.lineManagerName,
        emp.lineManagerPosition,
        false,
      );
      parent.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const sortNodes = (list: OrgChartNode[]) => {
    list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
    for (const n of list) sortNodes(n.children);
  };
  sortNodes(roots);

  return {
    roots,
    employeeCount: scoped.length,
    managerLinks,
    unresolvedManagers: [...unresolved].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' }),
    ),
    externalRoots,
  };
}

export function flattenOrgNodes(roots: OrgChartNode[]): OrgChartNode[] {
  const out: OrgChartNode[] = [];
  const walk = (list: OrgChartNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

export function countOrgPeople(roots: OrgChartNode[]): number {
  return flattenOrgNodes(roots).filter((n) => !n.isExternal).length;
}

export function countOrgContractants(roots: OrgChartNode[]): number {
  return flattenOrgNodes(roots).filter((n) => n.isContractant && !n.isExternal).length;
}

/**
 * Organigramme des contractants (liens via managerEmployeeId),
 * regroupés par société.
 */
export function buildContractantOrganigramme(
  contractants: Contractant[],
  options: {
    scope: OrganigrammeScope;
    departement?: string;
    service?: string;
  },
): OrganigrammeBuildResult {
  const scope = options.scope;
  const departement = String(options.departement || '').trim();
  const service = String(options.service || '').trim();
  const roots: OrgChartNode[] = [];
  let employeeCount = 0;
  let managerLinks = 0;

  for (const company of contractants) {
    const companyName = String(company.denomination || '').trim() || 'Contractant';
    const active = (company.employees || []).filter((e) => {
      if (!String(e.nom || '').trim()) return false;
      if (String(e.dateSortie || '').trim()) return false;
      return true;
    });

    const scoped = active.filter((e) => {
      const empLike: OrgChartEmployee = {
        matricule: e.matriculePpc || e.id,
        nom: e.nom,
        jobTitle: e.fonction || '',
        grade: '',
        departement: e.departement || '',
        service: e.service || '',
        localisation: e.lieuAffectation || '',
        lineManagerName: '',
        lineManagerPosition: '',
        statut: e.statut || 'Active',
      };
      return inScope(empLike, scope, departement, service);
    });
    if (scoped.length === 0) continue;

    const byId = new Map(scoped.map((e) => [e.id, e]));
    const nodeMap = new Map<string, OrgChartNode>();
    for (const e of scoped) {
      nodeMap.set(
        e.id,
        {
          id: `ctr-emp:${e.id}`,
          matricule: String(e.matriculePpc || '').trim(),
          nom: String(e.nom || '').trim(),
          jobTitle: String(e.fonction || '').trim(),
          grade: '',
          departement: String(e.departement || '').trim(),
          service: String(e.service || '').trim(),
          localisation: String(e.lieuAffectation || '').trim(),
          isContractant: true,
          contractantName: companyName,
          children: [],
        },
      );
    }

    const localRoots: OrgChartNode[] = [];
    for (const e of scoped) {
      const node = nodeMap.get(e.id)!;
      const mgrId = String(e.managerEmployeeId || '').trim();
      if (mgrId && byId.has(mgrId) && mgrId !== e.id) {
        nodeMap.get(mgrId)!.children.push(node);
        managerLinks += 1;
      } else {
        localRoots.push(node);
      }
    }

    const sortNodes = (list: OrgChartNode[]) => {
      list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
      for (const n of list) sortNodes(n.children);
    };
    sortNodes(localRoots);

    employeeCount += scoped.length;
    roots.push({
      id: `ctr-co:${company.id}`,
      matricule: '',
      nom: companyName,
      jobTitle: companyName,
      grade: '',
      departement: '',
      service: String(company.typeService || '').trim(),
      localisation: '',
      isContractant: true,
      contractantName: companyName,
      children: localRoots,
    });
  }

  roots.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

  return {
    roots,
    employeeCount,
    managerLinks,
    unresolvedManagers: [],
    externalRoots: 0,
  };
}

export function maxOrgDepth(roots: OrgChartNode[]): number {
  let max = 0;
  const walk = (list: OrgChartNode[], depth: number) => {
    if (list.length === 0) return;
    max = Math.max(max, depth);
    for (const n of list) walk(n.children, depth + 1);
  };
  walk(roots, 1);
  return max;
}

/** Compte récursif des descendants (hors nœud courant). */
export function countDescendants(node: OrgChartNode): number {
  return countNodes(node.children);
}

/** Membre affiché dans un bloc « poste » (plusieurs personnes = même carte). */
export interface OrgPosteMember {
  id: string;
  matricule: string;
  nom: string;
  grade: string;
  departement: string;
  service: string;
  localisation: string;
  isExternal?: boolean;
  isOutsideScope?: boolean;
  isContractant?: boolean;
  contractantName?: string;
}

/**
 * Bloc organigramme : un poste / rôle, avec 1..n personnes regroupées
 * et les N-1 regroupés récursivement par poste.
 */
export interface OrgPosteGroup {
  id: string;
  /** Libellé du poste (affiché en titre de carte). */
  jobTitle: string;
  members: OrgPosteMember[];
  isContractant?: boolean;
  children: OrgPosteGroup[];
}

function posteGroupKey(node: OrgChartNode): string {
  const kind = node.isContractant ? 'ctr' : 'ppc';
  const title = normKey(node.jobTitle);
  if (title) return `${kind}:title:${title}`;
  // Sans poste : une carte par personne
  return `${kind}:solo:${node.matricule || node.id}`;
}

function nodeToMember(node: OrgChartNode): OrgPosteMember {
  return {
    id: node.id,
    matricule: node.matricule,
    nom: node.nom,
    grade: node.grade,
    departement: node.departement,
    service: node.service,
    localisation: node.localisation,
    isExternal: node.isExternal,
    isOutsideScope: node.isOutsideScope,
    isContractant: node.isContractant,
    contractantName: node.contractantName,
  };
}

/**
 * Transforme les nœuds personnes en blocs par poste :
 * frères/sœurs avec le même jobTitle → une seule carte.
 */
export function groupOrgNodesByPoste(nodes: OrgChartNode[]): OrgPosteGroup[] {
  if (nodes.length === 0) return [];

  const buckets = new Map<string, OrgChartNode[]>();
  const order: string[] = [];
  for (const node of nodes) {
    const key = posteGroupKey(node);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(node);
  }

  return order.map((key) => {
    const groupNodes = buckets.get(key)!;
    const title =
      groupNodes.find((n) => n.jobTitle)?.jobTitle
      || (groupNodes.length === 1 ? groupNodes[0]!.nom : 'Poste');
    const childNodes = groupNodes.flatMap((n) => n.children);
    return {
      id: `poste:${key}:${groupNodes.map((n) => n.matricule || n.id).join('+')}`,
      jobTitle: title,
      isContractant: groupNodes.some((n) => n.isContractant),
      members: groupNodes
        .map(nodeToMember)
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })),
      children: groupOrgNodesByPoste(childNodes),
    };
  });
}

export function countPosteGroupPeople(groups: OrgPosteGroup[]): number {
  let n = 0;
  const walk = (list: OrgPosteGroup[]) => {
    for (const g of list) {
      n += g.members.filter((m) => !m.isExternal).length;
      walk(g.children);
    }
  };
  walk(groups);
  return n;
}

export function maxPosteGroupDepth(groups: OrgPosteGroup[]): number {
  let max = 0;
  const walk = (list: OrgPosteGroup[], depth: number) => {
    if (list.length === 0) return;
    max = Math.max(max, depth);
    for (const g of list) walk(g.children, depth + 1);
  };
  walk(groups, 1);
  return max;
}

export function countPosteDescendants(group: OrgPosteGroup): number {
  let n = 0;
  const walk = (list: OrgPosteGroup[]) => {
    for (const g of list) {
      n += g.members.length;
      walk(g.children);
    }
  };
  walk(group.children);
  return n;
}
