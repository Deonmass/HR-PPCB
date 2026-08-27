/**
 * Réconciliation BASE / uploads vs employés système (par matricule).
 */
import 'server-only';

import { parseExcoNewReport, type ExcoWorkbookEmployee } from './exco-new-report-parse';
import {
  displayEngagementName,
  parseEngagementsTerminations,
  splitEngagementsForPeriod,
  type ExcoEngagementRow,
} from './exco-engagements-parse';
import { resolveExcoBaseWorkbook } from './exco-base-source';
import { departmentsEqual, resolveExcoDepartment } from './exco-department-map';
import { readExcoUploadBuffer } from './exco-uploads';
import { readEmployeesBundle } from './employees-json-store';
import { getExcoOverlays } from './exco-store';
import { listDepartments } from './settings-store';
import type { Employee } from './types';

export type ExcoMismatchKind =
  | 'missing_in_system'
  | 'missing_in_base'
  | 'name_mismatch'
  | 'position_mismatch'
  | 'department_mismatch';

export type ExcoMismatchPolicy =
  | 'apply_file_department'
  | 'keep_system'
  | 'leave_in_system'
  | 'create_from_base';

export interface ExcoEmployeeMismatch {
  kind: ExcoMismatchKind;
  matricule: string;
  fileName: string;
  filePosition: string;
  fileDepartment: string;
  /** Département canonique après mapping (HR → Human Resources, etc.). */
  resolvedDepartment: string;
  systemName: string;
  systemPosition: string;
  systemDepartment: string;
  systemStatut: string;
  policy: ExcoMismatchPolicy;
  company?: string;
}

export interface ExcoBaseReconcileResult {
  year: number;
  month: number;
  baseEmployees: number;
  systemActive: number;
  systemExits: number;
  matched: number;
  mismatches: ExcoEmployeeMismatch[];
  actionableCount: number;
  /** Noms système par matricule (pour affichage BASE). */
  namesByMatricule: Record<string, string>;
  baseDepartments: string[];
  systemDepartments: string[];
  departmentsToCreate: string[];
  engagementsInMonth: Array<ExcoEngagementRow & { displayName: string }>;
  terminationsInMonth: Array<ExcoEngagementRow & { displayName: string }>;
  historicalTerminations: Array<ExcoEngagementRow & { displayName: string }>;
  historicalMissingInSystem: Array<ExcoEngagementRow & { displayName: string }>;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesClose(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter >= Math.min(2, Math.min(ta.size, tb.size));
}

function employeeMap(employees: Employee[]): Map<string, Employee> {
  const map = new Map<string, Employee>();
  for (const e of employees) {
    const m = (e.matricule || '').trim();
    if (m) map.set(m, e);
  }
  return map;
}

export async function reconcileExcoBase(input: {
  year: number;
  month: number;
}): Promise<ExcoBaseReconcileResult> {
  const { year, month } = input;
  const bundle = await readEmployeesBundle();
  const actives = employeeMap(bundle.employees || []);
  const exits = employeeMap(bundle.exits || []);
  const allSystem = new Map([...actives, ...exits]);

  let baseEmployees: ExcoWorkbookEmployee[] = [];
  const newReport = await resolveExcoBaseWorkbook(year, month);
  if (newReport) {
    const snap = parseExcoNewReport(newReport.buffer, newReport.originalName);
    baseEmployees = snap.employees;
  }

  const mismatches: ExcoEmployeeMismatch[] = [];
  const baseDepts = new Set<string>();
  let matched = 0;

  for (const row of baseEmployees) {
    const resolvedDept = resolveExcoDepartment(row.department).department;
    if (resolvedDept) baseDepts.add(resolvedDept);
    const sys = allSystem.get(row.matricule);
    if (!sys) {
      mismatches.push({
        kind: 'missing_in_system',
        matricule: row.matricule,
        fileName: row.nom,
        filePosition: row.position,
        fileDepartment: row.department,
        resolvedDepartment: resolvedDept,
        systemName: '',
        systemPosition: '',
        systemDepartment: '',
        systemStatut: '',
        policy: 'create_from_base',
      });
      continue;
    }
    matched += 1;
    if (!namesClose(row.nom, sys.nom || '')) {
      mismatches.push({
        kind: 'name_mismatch',
        matricule: row.matricule,
        fileName: row.nom,
        filePosition: row.position,
        fileDepartment: row.department,
        resolvedDepartment: resolvedDept,
        systemName: sys.nom || '',
        systemPosition: sys.position || sys.jobTitle || '',
        systemDepartment: sys.departement || '',
        systemStatut: sys.statut || '',
        policy: 'keep_system',
      });
    }
    const sysPos = (sys.position || sys.jobTitle || '').trim();
    if (row.position && sysPos && norm(row.position) !== norm(sysPos)) {
      mismatches.push({
        kind: 'position_mismatch',
        matricule: row.matricule,
        fileName: row.nom,
        filePosition: row.position,
        fileDepartment: row.department,
        resolvedDepartment: resolvedDept,
        systemName: sys.nom || '',
        systemPosition: sysPos,
        systemDepartment: sys.departement || '',
        systemStatut: sys.statut || '',
        policy: 'keep_system',
      });
    }
    const sysDept = (sys.departement || '').trim();
    if (resolvedDept && sysDept && !departmentsEqual(resolvedDept, sysDept)) {
      mismatches.push({
        kind: 'department_mismatch',
        matricule: row.matricule,
        fileName: row.nom,
        filePosition: row.position,
        fileDepartment: row.department,
        resolvedDepartment: resolvedDept,
        systemName: sys.nom || '',
        systemPosition: sysPos,
        systemDepartment: sysDept,
        systemStatut: sys.statut || '',
        policy: 'apply_file_department',
      });
    }
  }

  const baseMatricules = new Set(baseEmployees.map((e) => e.matricule));
  if (baseEmployees.length) {
    for (const [mat, sys] of actives) {
      if (!baseMatricules.has(mat)) {
        mismatches.push({
          kind: 'missing_in_base',
          matricule: mat,
          fileName: '',
          filePosition: '',
          fileDepartment: '',
          resolvedDepartment: '',
          systemName: sys.nom || '',
          systemPosition: sys.position || sys.jobTitle || '',
          systemDepartment: sys.departement || '',
          systemStatut: sys.statut || '',
          policy: 'leave_in_system',
        });
      }
    }
  }

  let engagementsInMonth: ExcoEngagementRow[] = [];
  let terminationsInMonth: ExcoEngagementRow[] = [];
  let historicalTerminations: ExcoEngagementRow[] = [];
  const { overlays } = await getExcoOverlays(year, month);
  const engFromJson = overlays.engagementsImportsByMonth?.[String(month)];
  if (engFromJson?.length) {
    const split = splitEngagementsForPeriod(engFromJson, year, month);
    engagementsInMonth = split.engagementsInMonth;
    terminationsInMonth = split.terminationsInMonth;
    historicalTerminations = split.historicalTerminations;
  } else {
    const engFile = await readExcoUploadBuffer(year, month, 'engagementsTerminations');
    if (engFile) {
      const parsed = parseEngagementsTerminations(engFile.buffer);
      const split = splitEngagementsForPeriod(parsed, year, month);
      engagementsInMonth = split.engagementsInMonth;
      terminationsInMonth = split.terminationsInMonth;
      historicalTerminations = split.historicalTerminations;
    }
  }

  const historicalMissingInSystem = historicalTerminations.filter(
    (r) => !allSystem.has(r.matricule),
  );

  const systemDepartments = (await listDepartments())
    .filter((d) => d.active !== false)
    .map((d) => d.name);
  const systemDeptNorm = new Set(
    systemDepartments.map((d) => resolveExcoDepartment(d).department).map(norm),
  );
  const departmentsToCreate = [...baseDepts].filter(
    (d) => d && !systemDeptNorm.has(norm(d)),
  );

  const withName = <T extends ExcoEngagementRow>(rows: T[]) =>
    rows.map((r) => ({ ...r, displayName: displayEngagementName(r) }));

  const actionable = mismatches.filter((m) => m.policy === 'apply_file_department' || m.policy === 'create_from_base');

  const namesByMatricule: Record<string, string> = {};
  for (const [mat, emp] of allSystem) {
    if (emp.nom) namesByMatricule[mat] = emp.nom;
  }

  return {
    year,
    month,
    baseEmployees: baseEmployees.length,
    systemActive: actives.size,
    systemExits: exits.size,
    matched,
    mismatches,
    actionableCount: actionable.length,
    namesByMatricule,
    baseDepartments: [...baseDepts].sort((a, b) => a.localeCompare(b, 'fr')),
    systemDepartments: systemDepartments.sort((a, b) => a.localeCompare(b, 'fr')),
    departmentsToCreate,
    engagementsInMonth: withName(engagementsInMonth),
    terminationsInMonth: withName(terminationsInMonth),
    historicalTerminations: withName(historicalTerminations),
    historicalMissingInSystem: withName(historicalMissingInSystem),
  };
}
