'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OrganigrammeDepartmentDialog from '@/components/organigramme/OrganigrammeDepartmentDialog';
import OrganigrammeManagerDialog from '@/components/organigramme/OrganigrammeManagerDialog';
import OrganigrammePersonDialog from '@/components/organigramme/OrganigrammePersonDialog';
import OrganigrammeTree, { type OrgPersonTarget } from '@/components/organigramme/OrganigrammeTree';
import OrgSiteMark from '@/components/organigramme/OrgSiteMark';
import EmployeeViewModal from '@/components/EmployeeViewModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Contractant } from '@/lib/contractants-types';
import {
  adoptContractantManagers,
  buildContractantOrganigramme,
  buildOrganigramme,
  isCapitalHrCompany,
  listOrganigrammeDepartments,
  listOrganigrammeServices,
  moveContractantsUnderInternalManagers,
  ORG_LOCATION_ZONES,
  orgPersonShortName,
  reportingDepartment,
  resolveLineManagerMatricule,
  summarizeOrganigramme,
  type OrganigrammeScope,
} from '@/lib/organigramme';
import type { ClassificationPoste } from '@/lib/classification-types';
import { compareExcoDepartments, EXCO_CANONICAL_DEPARTMENTS } from '@/lib/exco-department-map';
import { matchClassificationPoste } from '@/lib/postes-effectifs';
import { confirmAction, showError, showSuccess } from '@/lib/swal';
import type { VacantPoste } from '@/lib/postes-types';
import type { Employee } from '@/lib/types';

const MENU = 'employes.organigramme';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;

function chainHits(startId: string, targets: Set<string>, nextOf: Map<string, string>): boolean {
  const seen = new Set<string>();
  let current = startId;
  while (current && !seen.has(current)) {
    if (targets.has(current)) return true;
    seen.add(current);
    current = nextOf.get(current) || '';
  }
  return false;
}

function foldLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isActiveEmployee(employee: Employee): boolean {
  const statut = String(employee.statut || 'Active').trim().toLowerCase();
  return !statut || statut === 'active';
}

/** « Optimization Manager ( Responsable optimisation ) » → titre court + traduction. */
function classificationChoiceTitle(title: string): { nom: string; extra: string } {
  const raw = String(title || '').trim();
  const match = raw.match(/^(.*?)\s*\(\s*([^()]+)\s*\)\s*$/);
  if (match?.[1] && match[2]) return { nom: match[1].trim(), extra: match[2].trim() };
  return { nom: raw, extra: '' };
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <polyline points="7 11 12 16 17 11" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconChevrons({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {up ? (
        <>
          <polyline points="7 11 12 6 17 11" />
          <polyline points="7 17 12 12 17 17" />
        </>
      ) : (
        <>
          <polyline points="7 7 12 12 17 7" />
          <polyline points="7 13 12 18 17 13" />
        </>
      )}
    </svg>
  );
}

export default function OrganigrammePage() {
  const { can } = usePermissions();
  const chartRef = useRef<HTMLElement>(null);
  const loadedOnce = useRef(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractants, setContractants] = useState<Contractant[]>([]);
  const [vacantPostes, setVacantPostes] = useState<VacantPoste[]>([]);
  const [classificationPostes, setClassificationPostes] = useState<ClassificationPoste[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [departement, setDepartement] = useState('');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [collapseAllKey, setCollapseAllKey] = useState(0);
  const [showContractants, setShowContractants] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fiche, setFiche] = useState<Employee | null>(null);
  const [edit, setEdit] = useState<{ mode: 'manager' | 'role'; person: OrgPersonTarget } | null>(null);
  const [managerEdit, setManagerEdit] = useState<OrgPersonTarget[] | null>(null);
  const [departmentEdit, setDepartmentEdit] = useState<OrgPersonTarget[] | null>(null);
  const [selectionClearKey, setSelectionClearKey] = useState(0);

  const allowed = can(MENU, 'view') || can('employes.liste', 'view');
  const canEdit = can(MENU, 'edit') || can('employes.liste', 'edit');
  const canEditContractant = can('employes.contractants', 'edit') || can('employes.liste', 'edit');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resEmp, resCtr, resVacants, resClass] = await Promise.all([
        fetch('/api/employees?excludeExits=1', { cache: 'no-store' }),
        fetch('/api/employes/contractants', { cache: 'no-store' }),
        fetch('/api/employes/postes?vacants=1', { cache: 'no-store' }),
        fetch('/api/employes/classification', { cache: 'no-store' }),
      ]);
      const empJson = (await resEmp.json()) as Employee[] | { error?: string };
      if (!resEmp.ok) {
        throw new Error(
          !Array.isArray(empJson) && empJson.error ? empJson.error : 'Chargement impossible',
        );
      }
      setEmployees(Array.isArray(empJson) ? empJson : []);

      if (resCtr.ok) {
        const ctrJson = (await resCtr.json()) as { contractants?: Contractant[] };
        setContractants(Array.isArray(ctrJson.contractants) ? ctrJson.contractants : []);
      } else {
        setContractants([]);
      }
      if (resVacants.ok) {
        const vacantJson = (await resVacants.json()) as { vacants?: VacantPoste[] };
        setVacantPostes(Array.isArray(vacantJson.vacants) ? vacantJson.vacants : []);
      } else {
        setVacantPostes([]);
      }
      if (resClass.ok) {
        const classJson = (await resClass.json()) as { postes?: ClassificationPoste[] };
        setClassificationPostes(Array.isArray(classJson.postes) ? classJson.postes : []);
      } else {
        setClassificationPostes([]);
      }
    } catch (err) {
      setEmployees([]);
      setContractants([]);
      setVacantPostes([]);
      setClassificationPostes([]);
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed || loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [allowed, load]);

  useEffect(() => {
    const onEmployee = (event: Event) => {
      const next = (event as CustomEvent<Employee>).detail;
      if (!next?.matricule) return;
      setEmployees((prev) => prev.map((item) => (item.matricule === next.matricule ? { ...item, ...next } : item)));
      setFiche((current) => (current?.matricule === next.matricule ? { ...current, ...next } : current));
    };
    window.addEventListener('hr-employee-updated', onEmployee);
    return () => window.removeEventListener('hr-employee-updated', onEmployee);
  }, []);

  const departments = useMemo(
    () => listOrganigrammeDepartments(employees, contractants),
    [employees, contractants],
  );
  const departmentChoices = useMemo(() => {
    const names = new Set<string>(EXCO_CANONICAL_DEPARTMENTS);
    for (const name of departments) if (name.trim()) names.add(name.trim());
    return [...names].sort(compareExcoDepartments);
  }, [departments]);
  const services = useMemo(
    () => listOrganigrammeServices(employees, departement || undefined, contractants),
    [employees, contractants, departement],
  );

  const scope: OrganigrammeScope = service ? 'service' : departement ? 'departement' : 'entreprise';

  const built = useMemo(() => {
    const ppc = buildOrganigramme(employees, {
      scope,
      departement: departement || undefined,
      service: service || undefined,
      contractants,
      vacantReports: vacantPostes
        .filter((poste) => poste.reportsTo.trim())
        .map((poste) => ({ title: poste.title, reportsTo: poste.reportsTo })),
    });
    const ctr = buildContractantOrganigramme(contractants, {
      scope,
      departement: departement || undefined,
      service: service || undefined,
      employees,
    });
    moveContractantsUnderInternalManagers(ppc.roots, ctr.roots, contractants, employees);
    const ctrVisible = showContractants || search.trim()
      ? ctr.roots
      : ctr.roots.filter((node) => !isCapitalHrCompany(node.contractantName || node.nom));
    adoptContractantManagers(ppc.roots, ctrVisible, contractants, employees);
    return {
      roots: [...ppc.roots, ...ctrVisible],
      legend: summarizeOrganigramme([...ppc.roots, ...ctr.roots]),
    };
  }, [employees, contractants, vacantPostes, scope, departement, service, showContractants, search]);

  const title = useMemo(() => {
    if (service) return `Organigramme — ${service}`;
    if (departement) return `Organigramme — ${departement}`;
    return 'Organigramme';
  }, [departement, service]);

  const employeesByMatricule = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const employee of employees) map.set(employee.matricule, employee);
    return map;
  }, [employees]);

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExpandAllKey((n) => n + 1);
    await new Promise((resolve) => setTimeout(resolve, 420));
    const canvas = chartRef.current;
    const scroll = canvas?.querySelector<HTMLElement>('.org-chart-scroll') ?? null;
    const clearPrint = () => {
      document.body.classList.remove('org-printing');
      if (scroll) scroll.style.zoom = '';
      setExporting(false);
    };
    try {
      document.body.classList.add('org-printing');
      if (scroll) scroll.style.zoom = '1';
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      if (scroll) {
        const width = Math.max(scroll.scrollWidth, scroll.offsetWidth);
        const height = Math.max(scroll.scrollHeight, scroll.offsetHeight);
        const pageW = ((297 - 14) / 25.4) * 96;
        const pageH = ((210 - 16) / 25.4) * 96 - 36;
        const scale = Math.min(pageW / Math.max(width, 1), pageH / Math.max(height, 1));
        scroll.style.zoom = String(scale);
      }
      const onAfterPrint = () => {
        window.removeEventListener('afterprint', onAfterPrint);
        clearPrint();
      };
      window.addEventListener('afterprint', onAfterPrint);
      window.print();
      setTimeout(() => {
        if (document.body.classList.contains('org-printing')) onAfterPrint();
      }, 2000);
    } catch (err) {
      clearPrint();
      await showError(err instanceof Error ? err.message : 'Export PDF impossible');
    }
  }, [exporting]);

  const openFiche = (person: OrgPersonTarget) => {
    const employee = employeesByMatricule.get(person.matricule);
    if (employee) setFiche(employee);
  };

  const editEmployee = edit ? employeesByMatricule.get(edit.person.matricule) : undefined;

  const managerChoices = useMemo(() => {
    if (!managerEdit?.length) return [];
    const targetMats = new Set(
      managerEdit.filter((item) => !item.isContractant).map((item) => item.matricule).filter(Boolean),
    );
    const targetCtr = new Set(
      managerEdit.filter((item) => item.isContractant).map((item) => item.contractantEmployeeId || '').filter(Boolean),
    );
    const targetNames = new Set(managerEdit.map((item) => foldLabel(item.nom)).filter(Boolean));
    const active = employees.filter(isActiveEmployee);
    const namePool = active.map((item) => ({ matricule: item.matricule, nom: item.nom }));
    const nextEmp = new Map(
      active.map((item) => [
        item.matricule,
        resolveLineManagerMatricule(item.lineManagerName || '', namePool, item.matricule) || '',
      ]),
    );
    const externes: Array<{ id: string; nom: string; company: string; employeeId: string; managerEmployeeId: string; managerMatricule: string }> = [];
    for (const company of contractants) {
      for (const employee of company.employees || []) {
        if (!String(employee.nom || '').trim() || String(employee.dateSortie || '').trim()) continue;
        externes.push({
          id: employee.id,
          nom: employee.nom,
          company: company.denomination,
          employeeId: employee.id,
          managerEmployeeId: employee.managerEmployeeId || '',
          managerMatricule: employee.managerMatricule || '',
        });
      }
    }
    const nextCtr = new Map(externes.map((item) => [item.id, item.managerEmployeeId]));
    const reportMats = new Set(
      active
        .filter((item) => targetNames.has(foldLabel(item.lineManagerName || '')))
        .map((item) => item.matricule),
    );
    const internes = active
      .filter((item) => !targetMats.has(item.matricule))
      .filter((item) => !targetMats.size || !chainHits(item.matricule, targetMats, nextEmp))
      .filter((item) => !reportMats.has(item.matricule))
      .filter((item) => !reportMats.size || !chainHits(item.matricule, reportMats, nextEmp))
      .filter((item) => !targetNames.has(foldLabel(item.lineManagerName || '')))
      .map((item) => ({
        id: `i:${item.matricule}`,
        kind: 'interne' as const,
        nom: item.nom,
        detail: [item.jobTitle || item.position, item.departement].filter(Boolean).join(' · '),
      }));
    const externalLabeled = externes
      .filter((item) => !targetCtr.has(item.id))
      .filter((item) => !targetCtr.size || !chainHits(item.id, targetCtr, nextCtr))
      .filter((item) => !item.managerMatricule || !targetMats.has(item.managerMatricule))
      .filter((item) => {
        const matricule = item.managerMatricule.trim();
        if (!matricule.toLowerCase().startsWith('vacant:')) return true;
        return !targetNames.has(foldLabel(matricule.slice('vacant:'.length)));
      })
      .map((item) => ({
        id: `e:${item.id}`,
        kind: 'externe' as const,
        nom: item.nom,
        detail: [item.company].filter(Boolean).join(''),
      }));
    const fonctionById = new Map<string, string>();
    for (const company of contractants) {
      for (const employee of company.employees || []) fonctionById.set(employee.id, employee.fonction || '');
    }
    const labeled = externalLabeled.map((item) => ({
      ...item,
      detail: [fonctionById.get(item.id.slice(2)), item.detail].filter(Boolean).join(' · '),
    }));
    const occupiedTitles = new Set(
      active.map((item) => foldLabel(item.jobTitle || item.position || '')).filter(Boolean),
    );
    const ownTitles = new Set(managerEdit.map((item) => foldLabel(item.jobTitle)).filter(Boolean));
    const vacantByKey = new Map<string, { id: string; nom: string; detail: string }>();
    for (const item of active) {
      const title = String(item.lineManagerPosition || '').trim();
      const key = foldLabel(title);
      if (!key || title === '0' || occupiedTitles.has(key) || ownTitles.has(key)) continue;
      if (!vacantByKey.has(key)) {
        vacantByKey.set(key, {
          id: `v:${encodeURIComponent(title)}`,
          nom: title,
          detail: 'Poste vacant',
        });
      }
    }
    for (const poste of vacantPostes) {
      const title = String(poste.title || '').trim();
      const key = foldLabel(title);
      if (!key || ownTitles.has(key)) continue;
      vacantByKey.set(key, {
        id: `v:${poste.id}`,
        nom: title,
        detail: [poste.department, poste.location].filter(Boolean).join(' · ') || 'Poste vacant',
      });
    }
    const occupiedClassIds = new Set<string>();
    const markOccupied = (title: string) => {
      const matched = matchClassificationPoste(title, classificationPostes);
      if (matched) occupiedClassIds.add(matched.id);
    };
    for (const item of active) markOccupied(item.jobTitle || item.position || '');
    for (const item of managerEdit) markOccupied(item.jobTitle || '');
    for (const company of contractants) {
      for (const employee of company.employees || []) {
        if (!String(employee.nom || '').trim() || String(employee.dateSortie || '').trim()) continue;
        markOccupied(employee.fonction || '');
      }
    }
    for (const poste of classificationPostes) {
      if (occupiedClassIds.has(poste.id)) continue;
      const choice = classificationChoiceTitle(poste.title);
      const key = foldLabel(choice.nom);
      if (!key || ownTitles.has(key) || occupiedTitles.has(key)) continue;
      vacantByKey.set(key, {
        id: `v:cls:${poste.id}`,
        nom: choice.nom,
        detail: [choice.extra, poste.department, poste.location, 'Classification'].filter(Boolean).join(' · '),
      });
    }
    const vacants = [...vacantByKey.values()].map((item) => ({
      ...item,
      kind: 'vacant' as const,
    }));
    return [...internes, ...labeled, ...vacants].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [managerEdit, contractants, employees, vacantPostes, classificationPostes]);

  const saveManagers = async (choiceId: string) => {
    if (!managerEdit?.length) return;
    const choice = managerChoices.find((item) => item.id === choiceId);
    const vacantTitle = choice?.kind === 'vacant' ? choice.nom.trim() : '';
    const kind = vacantTitle
      ? 'vacant'
      : choiceId.startsWith('i:')
        ? 'interne'
        : choiceId.startsWith('e:')
          ? 'externe'
          : '';
    const ref = choiceId.startsWith('v:') ? '' : choiceId.slice(2);
    if (!kind || (!vacantTitle && !ref)) {
      await showError('N+1 introuvable.');
      return;
    }
    const internal = kind === 'interne' ? employees.find((item) => item.matricule === ref) : undefined;
    const external = kind === 'externe'
      ? contractants.flatMap((company) => (company.employees || []).map((employee) => ({ company, employee }))).find((item) => item.employee.id === ref)
      : undefined;
    const managerName = vacantTitle || internal?.nom || external?.employee.nom || '';
    if (!managerName) {
      await showError('N+1 introuvable.');
      return;
    }
    const summaryLabel = vacantTitle || orgPersonShortName(managerName) || managerName;
    const vacantPeople = managerEdit.filter((item) => item.isVacant);
    const contractantPeople = managerEdit.filter((item) => item.isContractant);
    const internalPeople = managerEdit.filter((item) => !item.isContractant && !item.isVacant);
    const link = kind === 'vacant'
      ? { employeeId: '', matricule: `vacant:${vacantTitle}` }
      : kind === 'interne'
        ? { employeeId: '', matricule: ref }
        : { employeeId: ref, matricule: '' };
    const lineName = vacantTitle || internal?.nom || external?.employee.nom || '';
    const linePosition = vacantTitle
      ? 'Poste vacant'
      : String(internal?.jobTitle || internal?.position || external?.employee.fonction || '').trim();
    const nextDepartment = reportingDepartment({
      lineManagerName: lineName,
      lineManagerPosition: linePosition,
      managerMatricule: link.matricule,
      managerEmployeeId: link.employeeId,
      employees,
      contractants: contractants.flatMap((company) => (company.employees || []).map((employee) => ({
        id: employee.id,
        nom: employee.nom,
        departement: employee.departement,
        dateSortie: employee.dateSortie,
      }))),
      vacantDepartments: [
        ...vacantPostes.map((poste) => ({ title: poste.title, department: poste.department })),
        ...classificationPostes.map((poste) => ({
          title: classificationChoiceTitle(poste.title).nom,
          department: poste.department,
        })),
      ],
    });
    const summary = managerEdit.length > 1
      ? `${managerEdit.length} agents → ${summaryLabel}${nextDepartment ? ` · ${nextDepartment}` : ''}`
      : `N+1 : ${summaryLabel}${nextDepartment ? ` · ${nextDepartment}` : ''}`;
    const confirmed = await confirmAction('Confirmer le N+1 ?', summary, 'Enregistrer');
    if (!confirmed) return;

    const employeeUpdates = internalPeople.flatMap((person) => {
      const employee = employeesByMatricule.get(person.matricule);
      if (!employee) return [];
      return [{
        matricule: employee.matricule,
        lineManagerName: lineName,
        lineManagerPosition: linePosition || employee.lineManagerPosition,
      }];
    });
    const contractantUpdates = contractantPeople.flatMap((person) => {
      const found = contractants
        .flatMap((company) => (company.employees || []).map((employee) => ({ company, employee })))
        .find((item) => item.employee.id === person.contractantEmployeeId);
      if (!found) return [];
      return [{
        contractantId: found.company.id,
        employeeId: found.employee.id,
        managerEmployeeId: link.employeeId,
        managerMatricule: link.matricule,
      }];
    });
    const vacantUpdates = vacantPeople.map((person) => {
      const title = person.jobTitle || person.nom;
      const classified = classificationPostes.find((poste) => {
        const choice = classificationChoiceTitle(poste.title);
        return foldLabel(choice.nom) === foldLabel(title) || foldLabel(poste.title) === foldLabel(title);
      });
      return {
        title,
        reportsTo: lineName,
        department: classified?.department || person.departement || '',
        location: classified?.location || '',
      };
    });
    if (employeeUpdates.length === 0 && contractantUpdates.length === 0 && vacantUpdates.length === 0) {
      await showError('N+1 introuvable.');
      return;
    }

    try {
      const res = await fetch('/api/employes/organigramme/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employees: employeeUpdates,
          contractants: contractantUpdates,
          vacants: vacantUpdates,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        employees?: Array<{
          matricule: string;
          lineManagerName: string;
          lineManagerPosition: string;
          departement: string;
          departmentHr: string;
          service: string;
        }>;
        contractants?: Array<{
          employeeId: string;
          managerEmployeeId: string;
          managerMatricule: string;
          departement: string;
          service: string;
        }>;
        vacants?: VacantPoste[];
      };
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      const savedEmployees = json.employees || [];
      const savedContractants = json.contractants || [];
      if (savedEmployees.length > 0) {
        const byMatricule = new Map(savedEmployees.map((item) => [item.matricule, item]));
        setEmployees((prev) => prev.map((item) => {
          const update = byMatricule.get(item.matricule);
          return update
            ? {
              ...item,
              lineManagerName: update.lineManagerName,
              lineManagerPosition: update.lineManagerPosition,
              departement: update.departement,
              departmentHr: update.departmentHr,
              service: update.service,
            }
            : item;
        }));
        setFiche((current) => {
          if (!current) return current;
          const update = byMatricule.get(current.matricule);
          return update
            ? {
              ...current,
              lineManagerName: update.lineManagerName,
              lineManagerPosition: update.lineManagerPosition,
              departement: update.departement,
              departmentHr: update.departmentHr,
              service: update.service,
            }
            : current;
        });
      }
      const savedVacants = json.vacants || [];
      if (savedVacants.length > 0) {
        setVacantPostes((prev) => {
          const next = [...prev];
          for (const saved of savedVacants) {
            const index = next.findIndex((item) => item.id === saved.id);
            if (index >= 0) next[index] = saved;
            else next.push(saved);
          }
          return next;
        });
      }
      if (savedContractants.length > 0) {
        const byId = new Map(savedContractants.map((item) => [item.employeeId, item]));
        setContractants((prev) => prev.map((company) => ({
          ...company,
          employees: company.employees.map((employee) => {
            const update = byId.get(employee.id);
            return update
              ? {
                ...employee,
                managerEmployeeId: update.managerEmployeeId,
                managerMatricule: update.managerMatricule,
                departement: update.departement,
                service: update.service,
              }
              : employee;
          }),
        })));
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
      return;
    }

    await showSuccess(
      nextDepartment
        ? (managerEdit.length > 1 ? 'N+1 du groupe enregistré. Le département suit le N+1.' : 'N+1 enregistré. Le département suit le N+1.')
        : (managerEdit.length > 1 ? 'N+1 du groupe enregistré.' : 'N+1 enregistré.'),
    );
    setManagerEdit(null);
  };

  const saveDepartments = async (departement: string) => {
    if (!departmentEdit?.length) return;
    const label = departement.trim();
    if (!label) {
      await showError('Choisissez un département.');
      return;
    }
    const summary = departmentEdit.length === 1
      ? `${orgPersonShortName(departmentEdit[0]!.nom)} → ${label}`
      : `${departmentEdit.length} agents → ${label}`;
    const confirmed = await confirmAction('Confirmer le département ?', summary, 'Enregistrer');
    if (!confirmed) return;

    const employeeUpdates = departmentEdit
      .filter((person) => !person.isContractant && person.matricule)
      .map((person) => ({ matricule: person.matricule }));
    const contractantUpdates = departmentEdit.flatMap((person) => {
      if (!person.isContractant || !person.contractantEmployeeId) return [];
      const found = contractants
        .flatMap((company) => (company.employees || []).map((employee) => ({ company, employee })))
        .find((item) => item.employee.id === person.contractantEmployeeId);
      if (!found) return [];
      return [{ contractantId: found.company.id, employeeId: found.employee.id }];
    });
    if (employeeUpdates.length === 0 && contractantUpdates.length === 0) {
      await showError('Aucun agent à mettre à jour.');
      return;
    }

    try {
      const res = await fetch('/api/employes/organigramme/departements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departement: label,
          employees: employeeUpdates,
          contractants: contractantUpdates,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        departement?: string;
        employees?: Array<{ matricule: string; departement: string; departmentHr: string; service: string }>;
        contractants?: Array<{ employeeId: string; departement: string; service: string }>;
      };
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      const savedEmployees = json.employees || [];
      const savedContractants = json.contractants || [];
      if (savedEmployees.length > 0) {
        const byMatricule = new Map(savedEmployees.map((item) => [item.matricule, item]));
        setEmployees((prev) => prev.map((item) => {
          const update = byMatricule.get(item.matricule);
          return update
            ? { ...item, departement: update.departement, departmentHr: update.departmentHr, service: update.service }
            : item;
        }));
        setFiche((current) => {
          if (!current) return current;
          const update = byMatricule.get(current.matricule);
          return update
            ? { ...current, departement: update.departement, departmentHr: update.departmentHr, service: update.service }
            : current;
        });
      }
      if (savedContractants.length > 0) {
        const byId = new Map(savedContractants.map((item) => [item.employeeId, item]));
        setContractants((prev) => prev.map((company) => ({
          ...company,
          employees: company.employees.map((employee) => {
            const update = byId.get(employee.id);
            return update
              ? { ...employee, departement: update.departement, service: update.service }
              : employee;
          }),
        })));
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
      return;
    }

    await showSuccess(departmentEdit.length > 1 ? 'Département du groupe enregistré.' : 'Département enregistré.');
    setDepartmentEdit(null);
    setSelectionClearKey((value) => value + 1);
  };

  const managerWho = managerEdit?.length === 1
    ? (managerEdit[0]!.isVacant ? managerEdit[0]!.nom : orgPersonShortName(managerEdit[0]!.nom))
    : managerEdit && managerEdit.length > 1
      ? `${managerEdit.length} agents${managerEdit[0]?.jobTitle ? ` · ${managerEdit[0].jobTitle}` : ''}`
      : '';

  return (
    <PermissionGate
      anyOf={[
        { menuId: MENU, action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
      fallback={<p className="docs-hub-empty">Accès refusé.</p>}
    >
      <div className="org-page">
        <div className="org-sticky">
          <div className="page-header page-header-with-tabs mvt-page-header">
            <div>
              <div className="page-header-title-row">
                <h2>{title}</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
            </div>
            <div className="page-header-actions org-header-filters">
              <label className="org-filter">
                <select
                  aria-label="Département"
                  value={departement}
                  onChange={(event) => {
                    setDepartement(event.target.value);
                    setService('');
                  }}
                >
                  <option value="">Tous les départements</option>
                  {departments.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="org-filter">
                <select
                  aria-label="Service"
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                >
                  <option value="">Tous les services</option>
                  {services.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm org-icon-btn"
                disabled={loading || exporting}
                onClick={() => void exportPdf()}
              >
                <IconDownload />
                {exporting ? 'PDF…' : 'Exporter PDF'}
              </button>
            </div>
          </div>

          <div className="org-toolbar">
            <label className="org-filter org-filter-search">
              <input
                type="search"
                aria-label="Recherche"
                placeholder="Nom, matricule, poste…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="org-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm org-icon-btn"
                onClick={() => setExpandAllKey((n) => n + 1)}
              >
                <IconChevrons />
                Tout déplier
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm org-icon-btn"
                onClick={() => setCollapseAllKey((n) => n + 1)}
              >
                <IconChevrons up />
                Tout replier
              </button>
              <div className="org-zoom" aria-label="Zoom">
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.max(ZOOM_MIN, Math.round((value - 0.1) * 10) / 10))}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Zoom arrière"
                >
                  −
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(ZOOM_MAX, Math.round((value + 0.1) * 10) / 10))}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Zoom avant"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <section className="org-canvas" aria-label={title} ref={chartRef}>
          <h3 className="org-print-only">{title}</h3>
          {loading ? (
            <p className="org-empty">Chargement…</p>
          ) : (
            <OrganigrammeTree
              roots={built.roots}
              search={search}
              expandAllKey={expandAllKey}
              collapseAllKey={collapseAllKey}
              zoom={zoom}
              canEdit={canEdit}
              canEditContractant={canEditContractant}
              hasFiche={(matricule) => employeesByMatricule.has(matricule)}
              onOpenFiche={openFiche}
              onEditManager={(person) => setManagerEdit([person])}
              onEditGroupManager={(people) => setManagerEdit(people)}
              onEditRole={(person) => setEdit({ mode: 'role', person })}
              onChangeDepartments={canEdit || canEditContractant ? (people) => setDepartmentEdit(people) : undefined}
              selectionClearKey={selectionClearKey}
            />
          )}
        </section>

        <aside className="org-float-legend is-left" aria-label="Contractants">
          <table className="org-float-table">
            <tbody>
              {(loading ? [] : built.legend.companies).map((company) => {
                const capitalHr = isCapitalHrCompany(company.name);
                return (
                  <tr key={company.name}>
                    <td>
                      {capitalHr ? (
                        <button
                          type="button"
                          className={`org-float-company${showContractants ? ' is-on' : ''}`}
                          aria-pressed={showContractants}
                          onClick={() => setShowContractants((value) => !value)}
                        >
                          <i className="org-float-swatch" style={{ background: company.tone.background, borderColor: company.tone.border }} aria-hidden />
                          <span>{company.name}</span>
                          <span className="org-float-state">{showContractants ? 'affichés' : 'masqués'}</span>
                        </button>
                      ) : (
                        <span className="org-float-company">
                          <i className="org-float-swatch" style={{ background: company.tone.background, borderColor: company.tone.border }} aria-hidden />
                          <span>{company.name}</span>
                        </span>
                      )}
                    </td>
                    <td>{loading ? '…' : company.count}</td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <span className="org-float-company">
                    <i className="org-float-swatch is-vacant" aria-hidden />
                    <span>Poste vacant</span>
                  </span>
                </td>
                <td>{loading ? '…' : built.legend.vacant}</td>
              </tr>
              <tr className="is-total">
                <td>Total</td>
                <td>{loading ? '…' : built.legend.total}</td>
              </tr>
            </tbody>
          </table>
        </aside>
        <aside className="org-float-legend is-right" aria-label="Localisations">
          <table className="org-float-table">
            <tbody>
              {ORG_LOCATION_ZONES.map((zone) => (
                <tr key={zone.id}>
                  <td>
                    <span className="org-float-company">
                      <OrgSiteMark zone={zone.id} />
                      <span>{zone.label}</span>
                    </span>
                  </td>
                  <td>{loading ? '…' : built.legend.locations[zone.id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>

      {fiche ? (
        <EmployeeViewModal
          employee={fiche}
          canEdit={canEdit}
          onClose={() => setFiche(null)}
          onUpdated={(next) => {
            setEmployees((prev) => prev.map((item) => (item.matricule === next.matricule ? next : item)));
            setFiche(next);
          }}
        />
      ) : null}

      {managerEdit ? (
        <OrganigrammeManagerDialog
          title={managerEdit.length > 1 ? 'N+1 du groupe' : 'Modifier le N+1'}
          who={managerWho}
          hint={managerEdit.length > 1 ? 'Le même N+1 sera appliqué à tous les agents du groupe.' : undefined}
          choices={managerChoices}
          onClose={() => setManagerEdit(null)}
          onSave={saveManagers}
        />
      ) : null}

      {departmentEdit ? (
        <OrganigrammeDepartmentDialog
          count={departmentEdit.length}
          departments={departmentChoices}
          onClose={() => setDepartmentEdit(null)}
          onSave={saveDepartments}
        />
      ) : null}

      {edit && editEmployee ? (
        <OrganigrammePersonDialog
          mode={edit.mode}
          person={edit.person}
          employee={editEmployee}
          employees={employees}
          departments={departments}
          onClose={() => setEdit(null)}
          onSaved={(next) => {
            setEmployees((prev) => prev.map((item) => (item.matricule === next.matricule ? next : item)));
          }}
        />
      ) : null}
    </PermissionGate>
  );
}
