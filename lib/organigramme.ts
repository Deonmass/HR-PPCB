import type { Contractant } from '@/lib/contractants-types';
import {
  compareExcoDepartments,
  normalizeServiceName,
  resolveExcoDepartment,
} from '@/lib/exco-department-map';
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
  /** Id de la société contractante. */
  contractantId?: string;
  /** Id de l’employé contractant (absent sur la carte société). */
  contractantEmployeeId?: string;
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

/** Clé stable : casse, accents, ponctuation. */
function foldOrgLabel(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCapitalHrCompany(name: string | undefined): boolean {
  return foldOrgLabel(name || '') === 'capital hr';
}

/** Compte les agents contractants déjà placés dans les arbres (Capital HR à part). */
export function countContractantPopulations(roots: OrgChartNode[]): { capitalHr: number; autres: number } {
  let capitalHr = 0;
  let autres = 0;
  const walk = (list: OrgChartNode[]) => {
    for (const node of list) {
      if (node.contractantEmployeeId) {
        if (isCapitalHrCompany(node.contractantName)) capitalHr += 1;
        else autres += 1;
      }
      walk(node.children);
    }
  };
  walk(roots);
  return { capitalHr, autres };
}

function resolvedOrgPlacement(rawDept: string, rawService: string): { departement: string; service: string } {
  const resolved = resolveExcoDepartment(rawDept);
  const departement = (resolved.department || rawDept).trim();
  const serviceRaw = rawService.trim() || resolved.serviceName || '';
  const service = serviceRaw ? (normalizeServiceName(serviceRaw) || serviceRaw).trim() : '';
  return { departement, service };
}

function labelScore(label: string): number {
  const letters = label.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const shouting = letters.length > 2 && letters === letters.toUpperCase();
  return shouting ? 0 : 1;
}

function buildLabelMap(values: string[]): Map<string, string> {
  const buckets = new Map<string, Map<string, number>>();
  for (const value of values) {
    const label = value.trim();
    if (!label) continue;
    const key = foldOrgLabel(label);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new Map();
      buckets.set(key, bucket);
    }
    bucket.set(label, (bucket.get(label) || 0) + 1);
  }
  const map = new Map<string, string>();
  for (const [key, bucket] of buckets) {
    let best = '';
    let bestCount = 0;
    for (const [label, count] of bucket) {
      if (!best) {
        best = label;
        bestCount = count;
        continue;
      }
      const scoreDiff = labelScore(label) - labelScore(best);
      if (
        scoreDiff > 0
        || (scoreDiff === 0 && count > bestCount)
        || (scoreDiff === 0 && count === bestCount && label.localeCompare(best, 'fr', { sensitivity: 'base' }) < 0)
      ) {
        best = label;
        bestCount = count;
      }
    }
    if (best) map.set(key, best);
  }
  return map;
}

function lookupLabel(map: Map<string, string>, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return map.get(foldOrgLabel(trimmed)) || trimmed;
}

type OrgCanon = (departement: string, service: string) => { departement: string; service: string };

function orgCanon(employees: Employee[], contractants: Contractant[]): OrgCanon {
  const rows: Array<{ departement: string; service: string }> = [];
  for (const employee of employees) {
    if (!isActiveEmployee(employee)) continue;
    rows.push(resolvedOrgPlacement(
      String(employee.departement || employee.departmentHr || ''),
      String(employee.service || ''),
    ));
  }
  for (const company of contractants) {
    for (const person of company.employees || []) {
      if (!String(person.nom || '').trim()) continue;
      if (String(person.dateSortie || '').trim()) continue;
      rows.push(resolvedOrgPlacement(
        String(person.departement || ''),
        String(person.service || ''),
      ));
    }
  }
  const departments = buildLabelMap(rows.map((row) => row.departement));
  const services = buildLabelMap(rows.map((row) => row.service));
  return (departement, service) => {
    const placed = resolvedOrgPlacement(departement, service);
    return {
      departement: lookupLabel(departments, placed.departement),
      service: lookupLabel(services, placed.service),
    };
  };
}

/** Prénom + nom, sans postnom ni matricule. Le nom stocké est « NOM [POSTNOM] PRÉNOM ». */
export function orgPersonShortName(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const word = (value: string) => {
    const lower = value.toLocaleLowerCase('fr');
    return lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1);
  };
  if (parts.length === 1) return word(parts[0]!);
  return `${word(parts[parts.length - 1]!)} ${word(parts[0]!)}`;
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
  const canon = orgCanon(employees, contractants);
  const set = new Set<string>();
  for (const e of employees) {
    if (!isActiveEmployee(e)) continue;
    const d = canon(String(e.departement || e.departmentHr || ''), String(e.service || '')).departement;
    if (d) set.add(d);
  }
  for (const c of contractants) {
    for (const e of c.employees || []) {
      if (String(e.dateSortie || '').trim()) continue;
      const d = canon(String(e.departement || ''), String(e.service || '')).departement;
      if (d) set.add(d);
    }
  }
  return [...set].sort(compareExcoDepartments);
}

export function listOrganigrammeServices(
  employees: Employee[],
  departement?: string,
  contractants: Contractant[] = [],
): string[] {
  const canon = orgCanon(employees, contractants);
  const deptKey = departement ? foldOrgLabel(departement) : '';
  const set = new Set<string>();
  const push = (rawDept: string, rawService: string) => {
    const place = canon(rawDept, rawService);
    if (deptKey && foldOrgLabel(place.departement) !== deptKey) return;
    if (place.service) set.add(place.service);
  };
  for (const e of employees) {
    if (!isActiveEmployee(e)) continue;
    push(String(e.departement || e.departmentHr || ''), String(e.service || ''));
  }
  for (const c of contractants) {
    for (const e of c.employees || []) {
      if (String(e.dateSortie || '').trim()) continue;
      push(String(e.departement || ''), String(e.service || ''));
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
    return Boolean(departement) && foldOrgLabel(emp.departement) === foldOrgLabel(departement);
  }
  if (scope === 'service') {
    if (!service) return false;
    if (foldOrgLabel(emp.service) !== foldOrgLabel(service)) return false;
    if (departement && foldOrgLabel(emp.departement) !== foldOrgLabel(departement)) return false;
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
    contractants?: Contractant[];
  },
): OrganigrammeBuildResult {
  const scope = options.scope;
  const departement = String(options.departement || '').trim();
  const service = String(options.service || '').trim();
  const canon = orgCanon(employees, options.contractants || []);

  const allActive = employees.filter(isActiveEmployee).map(toChartEmployee)
    .filter((e) => e.matricule && e.nom)
    .map((employee) => ({ ...employee, ...canon(employee.departement, employee.service) }));

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
    employees?: Employee[];
  },
): OrganigrammeBuildResult {
  const scope = options.scope;
  const departement = String(options.departement || '').trim();
  const service = String(options.service || '').trim();
  const canon = orgCanon(options.employees || [], contractants);
  const roots: OrgChartNode[] = [];
  let employeeCount = 0;
  let managerLinks = 0;

  const nodeMap = new Map<string, OrgChartNode>();
  const companyOf = new Map<string, { id: string; name: string; service: string }>();
  const sourceById = new Map<string, Contractant['employees'][number]>();

  for (const company of contractants) {
    const companyName = String(company.denomination || '').trim() || 'Contractant';
    const active = (company.employees || []).filter((e) => {
      if (!String(e.nom || '').trim()) return false;
      if (String(e.dateSortie || '').trim()) return false;
      return true;
    });

    const scoped = active.filter((e) => {
      const place = canon(e.departement || '', e.service || '');
      const empLike: OrgChartEmployee = {
        matricule: e.matriculePpc || e.id,
        nom: e.nom,
        jobTitle: e.fonction || '',
        grade: '',
        departement: place.departement,
        service: place.service,
        localisation: e.lieuAffectation || '',
        lineManagerName: '',
        lineManagerPosition: '',
        statut: e.statut || 'Active',
      };
      return inScope(empLike, scope, departement, service);
    });
    if (scoped.length === 0) continue;
    employeeCount += scoped.length;

    for (const e of scoped) {
      sourceById.set(e.id, e);
      const place = canon(e.departement || '', e.service || '');
      companyOf.set(e.id, {
        id: company.id,
        name: companyName,
        service: String(company.typeService || '').trim(),
      });
      nodeMap.set(e.id, {
        id: `ctr-emp:${e.id}`,
        matricule: String(e.matriculePpc || '').trim(),
        nom: String(e.nom || '').trim(),
        jobTitle: String(e.fonction || '').trim(),
        grade: '',
        departement: place.departement,
        service: place.service,
        localisation: String(e.lieuAffectation || '').trim(),
        isContractant: true,
        contractantName: companyName,
        contractantId: company.id,
        contractantEmployeeId: e.id,
        children: [],
      });
    }
  }

  const localRoots = new Map<string, OrgChartNode[]>();
  for (const [id, node] of nodeMap) {
    const company = companyOf.get(id)!;
    const source = sourceById.get(id);
    const mgrId = String(source?.managerEmployeeId || '').trim();
    if (mgrId && mgrId !== id && nodeMap.has(mgrId)) {
      nodeMap.get(mgrId)!.children.push(node);
      managerLinks += 1;
      continue;
    }
    const list = localRoots.get(company.id) || [];
    list.push(node);
    localRoots.set(company.id, list);
  }

  const sortNodes = (list: OrgChartNode[]) => {
    list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
    for (const n of list) sortNodes(n.children);
  };

  const companies = new Map<string, { name: string; service: string }>();
  for (const [id, company] of companyOf) {
    if (!companies.has(company.id)) companies.set(company.id, { name: company.name, service: company.service });
    void id;
  }
  for (const [companyId, company] of companies) {
    const children = localRoots.get(companyId) || [];
    if (children.length === 0) continue;
    sortNodes(children);
    roots.push({
      id: `ctr-co:${companyId}`,
      matricule: '',
      nom: company.name,
      jobTitle: company.name,
      grade: '',
      departement: '',
      service: company.service,
      localisation: '',
      isContractant: true,
      contractantName: company.name,
      contractantId: companyId,
      children,
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

function treeHasId(nodes: OrgChartNode[], id: string): boolean {
  for (const node of nodes) {
    if (node.id === id || treeHasId(node.children, id)) return true;
  }
  return false;
}

/**
 * Déplace les contractants dont le N+1 est un interne sous la carte de cet interne.
 * Le sous-arbre (leurs propres N-1) suit.
 */
export function moveContractantsUnderInternalManagers(
  ppcRoots: OrgChartNode[],
  ctrRoots: OrgChartNode[],
  contractants: Contractant[],
): void {
  const linked = new Map<string, string>();
  const vacantLinked = new Map<string, string>();
  for (const company of contractants) {
    for (const employee of company.employees || []) {
      if (String(employee.dateSortie || '').trim()) continue;
      const matricule = String(employee.managerMatricule || '').trim();
      if (!matricule) continue;
      if (matricule.startsWith('vacant:')) {
        const title = matricule.slice('vacant:'.length).trim();
        if (title) vacantLinked.set(employee.id, title);
        continue;
      }
      linked.set(employee.id, matricule);
    }
  }
  if (linked.size === 0 && vacantLinked.size === 0) return;

  const byMatricule = new Map<string, OrgChartNode>();
  const index = (list: OrgChartNode[]) => {
    for (const node of list) {
      if (node.matricule && !node.isContractant) byMatricule.set(node.matricule, node);
      index(node.children);
    }
  };
  index(ppcRoots);

  const findNode = (list: OrgChartNode[], id: string): OrgChartNode | undefined => {
    for (const node of list) {
      if (node.id === id) return node;
      const child = findNode(node.children, id);
      if (child) return child;
    }
    return undefined;
  };
  const ensureVacant = (title: string): OrgChartNode => {
    const id = `ext:${normKey(title)}`;
    const existing = findNode(ppcRoots, id);
    if (existing) return existing;
    const node = externalNode(title, 'Poste vacant');
    ppcRoots.push(node);
    return node;
  };

  const detach = (list: OrgChartNode[]): OrgChartNode[] => {
    const kept: OrgChartNode[] = [];
    for (const node of list) {
      node.children = detach(node.children);
      const vacantTitle = node.contractantEmployeeId ? vacantLinked.get(node.contractantEmployeeId) : '';
      if (vacantTitle && !treeHasId(node.children, `ext:${normKey(vacantTitle)}`)) {
        const parent = ensureVacant(vacantTitle);
        if (parent.id !== node.id && !parent.children.some((child) => child.id === node.id)) {
          parent.children.push(node);
          parent.children.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
        }
        continue;
      }
      const matricule = node.contractantEmployeeId ? linked.get(node.contractantEmployeeId) : '';
      const parent = matricule ? byMatricule.get(matricule) : undefined;
      if (parent && parent.id !== node.id && !treeHasId(node.children, parent.id)) {
        if (!parent.children.some((child) => child.id === node.id)) parent.children.push(node);
        parent.children.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
        continue;
      }
      kept.push(node);
    }
    return kept;
  };

  const next = detach(ctrRoots).filter((node) => !node.id.startsWith('ctr-co:') || node.children.length > 0);
  ctrRoots.splice(0, ctrRoots.length, ...next);
}

/**
 * Quand le N+1 d’un interne est un contractant (même nom), place l’interne sous cette carte.
 * Ne déplace que si la carte contractante est déjà dans l’un des arbres fournis.
 */
export function adoptContractantManagers(ppcRoots: OrgChartNode[], ctrRoots: OrgChartNode[]): void {
  const byName = new Map<string, OrgChartNode[]>();
  const collect = (list: OrgChartNode[]) => {
    for (const node of list) {
      if (node.contractantEmployeeId && node.nom.trim()) {
        const key = foldOrgLabel(node.nom);
        const bucket = byName.get(key) || [];
        bucket.push(node);
        byName.set(key, bucket);
      }
      collect(node.children);
    }
  };
  collect(ppcRoots);
  collect(ctrRoots);

  const walk = (list: OrgChartNode[]) => {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const node = list[index]!;
      walk(node.children);
      const synthetic = Boolean(node.isExternal) && !node.matricule && !node.contractantEmployeeId;
      if (!synthetic || node.children.length === 0) continue;
      const matches = (byName.get(foldOrgLabel(node.nom)) || []).filter((item) => item.id !== node.id);
      if (matches.length !== 1) continue;
      const target = matches[0]!;
      if (treeHasId([target], node.id) || node.children.some((child) => child.id === target.id)) continue;
      for (const child of node.children) {
        if (!target.children.some((item) => item.id === child.id)) target.children.push(child);
      }
      target.children.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
      list.splice(index, 1);
    }
  };
  walk(ppcRoots);
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
  jobTitle: string;
  grade: string;
  departement: string;
  service: string;
  localisation: string;
  isExternal?: boolean;
  isOutsideScope?: boolean;
  isContractant?: boolean;
  contractantName?: string;
  contractantId?: string;
  contractantEmployeeId?: string;
  /** Parent dans l’arbre (N+1). Absent pour une racine. */
  managerId?: string;
  managerMatricule?: string;
  managerNom?: string;
  managerJobTitle?: string;
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

function nodeToMember(node: OrgChartNode, manager: OrgChartNode | null): OrgPosteMember {
  return {
    id: node.id,
    matricule: node.matricule,
    nom: node.nom,
    jobTitle: node.jobTitle,
    grade: node.grade,
    departement: node.departement,
    service: node.service,
    localisation: node.localisation,
    isExternal: node.isExternal,
    isOutsideScope: node.isOutsideScope,
    isContractant: node.isContractant,
    contractantName: node.contractantName,
    contractantId: node.contractantId,
    contractantEmployeeId: node.contractantEmployeeId,
    managerId: manager?.id || undefined,
    managerMatricule: manager?.matricule || undefined,
    managerNom: manager?.nom || undefined,
    managerJobTitle: manager?.jobTitle || undefined,
  };
}

type ManagedOrgNode = {
  node: OrgChartNode;
  manager: OrgChartNode | null;
};

function groupManagedNodes(items: ManagedOrgNode[]): OrgPosteGroup[] {
  if (items.length === 0) return [];

  const buckets = new Map<string, ManagedOrgNode[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = posteGroupKey(item.node);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }

  return order.map((key) => {
    const groupItems = buckets.get(key)!;
    const groupNodes = groupItems.map((item) => item.node);
    const title =
      groupNodes.find((n) => n.jobTitle)?.jobTitle
      || (groupNodes.length === 1 ? groupNodes[0]!.nom : 'Poste');
    const childItems: ManagedOrgNode[] = [];
    for (const item of groupItems) {
      for (const child of item.node.children) {
        childItems.push({ node: child, manager: item.node });
      }
    }
    return {
      id: `poste:${key}:${groupNodes.map((n) => n.matricule || n.id).join('+')}`,
      jobTitle: title,
      isContractant: groupNodes.some((n) => n.isContractant),
      members: groupItems
        .map((item) => nodeToMember(item.node, item.manager))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })),
      children: groupManagedNodes(childItems),
    };
  });
}

/**
 * Transforme les nœuds personnes en blocs par poste :
 * frères/sœurs avec le même jobTitle → une seule carte.
 * Chaque membre conserve son N+1 (parent dans l’arbre).
 */
export function groupOrgNodesByPoste(nodes: OrgChartNode[]): OrgPosteGroup[] {
  return groupManagedNodes(nodes.map((node) => ({ node, manager: null })));
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
