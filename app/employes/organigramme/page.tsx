'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OrganigrammeManagerDialog from '@/components/organigramme/OrganigrammeManagerDialog';
import OrganigrammePersonDialog from '@/components/organigramme/OrganigrammePersonDialog';
import OrganigrammeTree, { type OrgPersonTarget } from '@/components/organigramme/OrganigrammeTree';
import EmployeeViewModal from '@/components/EmployeeViewModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Contractant } from '@/lib/contractants-types';
import type { ContractantEmployee } from '@/lib/contractants-types';
import {
  adoptContractantManagers,
  buildContractantOrganigramme,
  buildOrganigramme,
  listOrganigrammeDepartments,
  listOrganigrammeServices,
  countContractantPopulations,
  moveContractantsUnderInternalManagers,
  orgPersonShortName,
  resolveLineManagerMatricule,
  type OrganigrammeScope,
} from '@/lib/organigramme';
import { confirmAction, showError, showSuccess } from '@/lib/swal';
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

function contractantPayload(
  employee: ContractantEmployee,
  manager: { employeeId: string; matricule: string },
) {
  return {
    nom: employee.nom,
    sexe: employee.sexe,
    lieuAffectation: employee.lieuAffectation,
    fonction: employee.fonction,
    departement: employee.departement,
    service: employee.service,
    telephone: employee.telephone,
    etatCivil: employee.etatCivil,
    statut: employee.statut,
    dateEmbauche: employee.dateEmbauche,
    dateSortie: employee.dateSortie,
    managerEmployeeId: manager.employeeId,
    managerMatricule: manager.matricule,
    family: employee.family || [],
    matriculePpc: employee.matriculePpc,
    numeroCnss: employee.numeroCnss,
    numeroCompte: employee.numeroCompte,
    banque: employee.banque,
    nbDependants: employee.nbDependants,
    txJr: employee.txJr,
    coutTransport: employee.coutTransport,
    payrollSite: employee.payrollSite,
  };
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

  const allowed = can(MENU, 'view') || can('employes.liste', 'view');
  const canEdit = can(MENU, 'edit') || can('employes.liste', 'edit');
  const canEditContractant = can('employes.contractants', 'edit') || can('employes.liste', 'edit');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resEmp, resCtr] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/employes/contractants', { cache: 'no-store' }),
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
    } catch (err) {
      setEmployees([]);
      setContractants([]);
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

  const departments = useMemo(
    () => listOrganigrammeDepartments(employees, contractants),
    [employees, contractants],
  );
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
    });
    const ctr = buildContractantOrganigramme(contractants, {
      scope,
      departement: departement || undefined,
      service: service || undefined,
      employees,
    });
    moveContractantsUnderInternalManagers(ppc.roots, ctr.roots, contractants);
    if (showContractants) adoptContractantManagers(ppc.roots, ctr.roots);
    const populations = countContractantPopulations([...ppc.roots, ...ctr.roots]);
    return {
      roots: showContractants ? [...ppc.roots, ...ctr.roots] : ppc.roots,
      internes: ppc.employeeCount,
      externes: ctr.employeeCount,
      capitalHr: populations.capitalHr,
      autres: populations.autres,
    };
  }, [employees, contractants, scope, departement, service, showContractants]);

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
    const internes = active
      .filter((item) => !targetMats.has(item.matricule))
      .filter((item) => !targetMats.size || !chainHits(item.matricule, targetMats, nextEmp))
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
    return [...internes, ...labeled].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [managerEdit, contractants, employees]);

  const saveManagers = async (choiceId: string) => {
    if (!managerEdit?.length) return;
    const kind = choiceId.startsWith('i:') ? 'interne' : choiceId.startsWith('e:') ? 'externe' : '';
    const ref = choiceId.slice(2);
    if (!kind || !ref) {
      await showError('N+1 introuvable.');
      return;
    }
    const internal = kind === 'interne' ? employees.find((item) => item.matricule === ref) : undefined;
    const external = kind === 'externe'
      ? contractants.flatMap((company) => (company.employees || []).map((employee) => ({ company, employee }))).find((item) => item.employee.id === ref)
      : undefined;
    const managerName = internal?.nom || external?.employee.nom || '';
    if (!managerName) {
      await showError('N+1 introuvable.');
      return;
    }
    const summary = managerEdit.length > 1
      ? `${managerEdit.length} agents → ${orgPersonShortName(managerName)}`
      : `N+1 : ${orgPersonShortName(managerName)}`;
    const confirmed = await confirmAction('Confirmer le N+1 ?', summary, 'Enregistrer');
    if (!confirmed) return;

    const contractantPeople = managerEdit.filter((item) => item.isContractant);
    const internalPeople = managerEdit.filter((item) => !item.isContractant);
    const link = kind === 'interne'
      ? { employeeId: '', matricule: ref }
      : { employeeId: ref, matricule: '' };

    if (contractantPeople.length > 0) {
      const savedIds = new Set<string>();
      try {
        for (const person of contractantPeople) {
          const found = contractants
            .flatMap((company) => (company.employees || []).map((employee) => ({ company, employee })))
            .find((item) => item.employee.id === person.contractantEmployeeId);
          if (!found) continue;
          const res = await fetch(
            `/api/employes/contractants/${found.company.id}/employees/${found.employee.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(contractantPayload(found.employee, link)),
            },
          );
          const json = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
          savedIds.add(found.employee.id);
        }
        setContractants((prev) => prev.map((company) => ({
          ...company,
          employees: company.employees.map((employee) => (
            savedIds.has(employee.id)
              ? { ...employee, managerEmployeeId: link.employeeId, managerMatricule: link.matricule }
              : employee
          )),
        })));
      } catch (err) {
        if (savedIds.size > 0) {
          setContractants((prev) => prev.map((company) => ({
            ...company,
            employees: company.employees.map((employee) => (
              savedIds.has(employee.id)
                ? { ...employee, managerEmployeeId: link.employeeId, managerMatricule: link.matricule }
                : employee
            )),
          })));
        }
        await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
        return;
      }
    }

    if (internalPeople.length > 0) {
      const saved: Employee[] = [];
      const lineName = internal?.nom || external?.employee.nom || '';
      const linePosition = String(
        internal?.jobTitle || internal?.position || external?.employee.fonction || '',
      ).trim();
      try {
        for (const person of internalPeople) {
          const employee = employeesByMatricule.get(person.matricule);
          if (!employee) continue;
          const next: Employee = {
            ...employee,
            lineManagerName: lineName,
            lineManagerPosition: linePosition || employee.lineManagerPosition,
          };
          const res = await fetch(`/api/employees/${encodeURIComponent(employee.matricule)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          const json = (await res.json()) as Employee & { error?: string };
          if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
          saved.push(json);
        }
        if (saved.length > 0) {
          const byMatricule = new Map(saved.map((item) => [item.matricule, item]));
          setEmployees((prev) => prev.map((item) => byMatricule.get(item.matricule) || item));
        }
      } catch (err) {
        if (saved.length > 0) {
          const byMatricule = new Map(saved.map((item) => [item.matricule, item]));
          setEmployees((prev) => prev.map((item) => byMatricule.get(item.matricule) || item));
        }
        await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
        return;
      }
    }

    await showSuccess(managerEdit.length > 1 ? 'N+1 du groupe enregistré.' : 'N+1 enregistré.');
    setManagerEdit(null);
  };

  const managerWho = managerEdit?.length === 1
    ? orgPersonShortName(managerEdit[0]!.nom)
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
            />
          )}
        </section>

        <footer className="org-footer">
          <ul className="org-footer-legend">
            <li>
              <i className="org-legend-swatch is-ppc" aria-hidden />
              <span>Internes</span>
              <strong>{loading ? '…' : built.internes}</strong>
            </li>
            <li>
              <button
                type="button"
                className={`org-footer-toggle${showContractants ? ' is-on' : ''}`}
                aria-pressed={showContractants}
                onClick={() => setShowContractants((value) => !value)}
              >
                <i className="org-legend-swatch is-contractant" aria-hidden />
                <span>Externes</span>
                <strong>{loading ? '…' : built.externes}</strong>
                <span className="org-footer-toggle-state">
                  {showContractants ? 'affichés' : 'masqués'}
                </span>
              </button>
            </li>
            <li className="org-footer-total">
              <span>Total</span>
              <strong>{loading ? '…' : built.internes + built.externes}</strong>
            </li>
          </ul>
          <div className="org-footer-key" aria-label="Légende">
            <span className="org-legend-item">
              <i className="org-legend-swatch is-ppc" aria-hidden />
              PPC
              <strong>{loading ? '…' : built.internes}</strong>
            </span>
            <span className="org-legend-item">
              <i className="org-legend-swatch is-capital-hr" aria-hidden />
              Capital HR
              <strong>{loading ? '…' : built.capitalHr}</strong>
            </span>
            <span className="org-legend-item">
              <i className="org-legend-swatch is-other" aria-hidden />
              Autres
              <strong>{loading ? '…' : built.autres}</strong>
            </span>
          </div>
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
        </footer>
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
