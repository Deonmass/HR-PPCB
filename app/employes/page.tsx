'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import EmployeeModal from '@/components/EmployeeModal';
import EmployeeViewModal from '@/components/EmployeeViewModal';
import EmployeesHrDashboardView from '@/components/EmployeesHrDashboardView';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import { calcDocumentCompletion, getDepartments } from '@/lib/documents';
import {
  computeAgeFromDisplayDate,
  computeSeniorityYears,
  wasPresentInYear,
  yearFromDisplayDate,
} from '@/lib/employee-columns';
import { downloadEmployeesHrExport } from '@/lib/employees-export';
import {
  daysUntilDisplayDate,
  ESSAI_STATUTS_EVAL,
  isCddEmployee,
  isCddEndAlert,
  isCddOverdue,
  isDisplayDatePast,
  isInActiveTrialPeriod,
  isTrialEvalAlert,
  resolveCddAlerteDate,
  resolveDateFinContrat,
  resolveDateFinPeriodeEssai,
  resolveDureeContratMois,
  resolveEssaiEcheanceEval,
  resolveEssaiStatutEval,
  essaiStatutClass,
} from '@/lib/employees-trial';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

type PageTab = 'dashboard' | 'liste' | 'essai' | 'cdd' | 'exit';

const CURRENT_YEAR = new Date().getFullYear();

function resolveEmployeeAge(employee: Employee): number | null {
  return computeAgeFromDisplayDate(employee.dateOfBirth || '') ?? employee.age ?? null;
}

function formatYears(value: number | null): string {
  if (value == null) return '—';
  return `${value}`;
}

function dateCellClass(value: string): string {
  return isDisplayDatePast(value) ? 'col-date employees-date-past' : 'col-date';
}

export default function EmployesPage() {
  const { can } = usePermissions();
  const canCreate = can('employes.liste', 'create');
  const canEdit = can('employes.liste', 'edit');
  const canDelete = can('employes.liste', 'delete');
  const canExport = can('employes.liste', 'export');
  const [tab, setTab] = useState<PageTab>('liste');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exits, setExits] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState<number | ''>('');
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; employee: Employee } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resActive, resExits] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/employees/exits'),
      ]);
      const dataActive = await resActive.json();
      const dataExits = await resExits.json();
      if (!resActive.ok) {
        await showError(dataActive?.error || 'Chargement impossible');
        setEmployees([]);
      } else {
        setEmployees(Array.isArray(dataActive) ? dataActive : []);
      }
      if (!resExits.ok) {
        setExits([]);
      } else {
        setExits(Array.isArray(dataExits) ? dataExits : []);
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      setEmployees([]);
      setExits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setSearch('');
    setDept('');
    setContractFilter('');
    setStatusFilter('');
    setContextMenu(null);
  }, [tab]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([CURRENT_YEAR]);
    for (const e of [...employees, ...exits]) {
      const hy = yearFromDisplayDate(e.appointmentDate || '');
      const ey = yearFromDisplayDate(e.dateFinContrat || '');
      if (hy != null) years.add(hy);
      if (ey != null) years.add(ey);
    }
    return [...years].sort((a, b) => b - a);
  }, [employees, exits]);

  const yearScopedActive = useMemo(() => {
    if (yearFilter === '') return employees;
    return employees.filter((e) => wasPresentInYear(e, yearFilter, { isExit: false }));
  }, [employees, yearFilter]);

  const yearScopedExits = useMemo(() => {
    if (yearFilter === '') return exits;
    return exits.filter((e) => wasPresentInYear(e, yearFilter, { isExit: true }));
  }, [exits, yearFilter]);

  /** Liste : avec année, inclut aussi les sorties présentes cette année-là. */
  const yearScopedListe = useMemo(() => {
    if (yearFilter === '') return yearScopedActive;
    const byMatricule = new Map<string, Employee>();
    for (const e of yearScopedActive) byMatricule.set(e.matricule, e);
    for (const e of yearScopedExits) {
      if (!byMatricule.has(e.matricule)) byMatricule.set(e.matricule, e);
    }
    return [...byMatricule.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [yearFilter, yearScopedActive, yearScopedExits]);

  const cddList = useMemo(
    () => yearScopedActive.filter((e) => isCddEmployee(e)),
    [yearScopedActive],
  );

  const essaiList = useMemo(
    () => yearScopedActive.filter((e) => isInActiveTrialPeriod(e)),
    [yearScopedActive],
  );

  const cddAlertCount = useMemo(
    () => yearScopedActive.filter((e) => isCddEndAlert(e)).length,
    [yearScopedActive],
  );

  const essaiAlertCount = useMemo(
    () => yearScopedActive.filter((e) => isTrialEvalAlert(e)).length,
    [yearScopedActive],
  );

  const sourceList =
    tab === 'exit'
      ? yearScopedExits
      : tab === 'cdd'
        ? cddList
        : tab === 'essai'
          ? essaiList
          : yearScopedListe;

  const filtered = useMemo(() => {
    const list = Array.isArray(sourceList) ? sourceList : [];
    return list.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch = !q
        || e.nom.toLowerCase().includes(q)
        || e.matricule.includes(q)
        || e.departement.toLowerCase().includes(q)
        || (e.localisation ?? '').toLowerCase().includes(q)
        || (e.raisonExit ?? '').toLowerCase().includes(q)
        || (e.typeContrat ?? '').toLowerCase().includes(q)
        || resolveEssaiStatutEval(e).toLowerCase().includes(q);
      const matchDept = !dept || e.departement === dept;
      const matchContract =
        !contractFilter
        || String(e.typeContrat || '').trim().toUpperCase() === contractFilter;
      const matchStatus =
        !statusFilter
        || String(resolveEssaiStatutEval(e) || 'Ongoing').trim().toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchDept && matchContract && matchStatus;
    });
  }, [sourceList, search, dept, contractFilter, statusFilter]);

  const dashboardEmployees = yearScopedActive;
  const dashboardExits = yearScopedExits;

  const pageSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (yearFilter !== '') parts.push(`Année ${yearFilter}`);
    if (dept) parts.push(dept);
    if (contractFilter) parts.push(contractFilter);
    if (statusFilter) parts.push(statusFilter);
    if (search.trim()) parts.push(`« ${search.trim()} »`);

    const n = tab === 'dashboard' ? dashboardEmployees.length : filtered.length;
    let countLabel = '';
    switch (tab) {
      case 'dashboard':
        countLabel = `${dashboardEmployees.length} actif${dashboardEmployees.length > 1 ? 's' : ''}`;
        if (dashboardExits.length > 0) {
          countLabel += ` · ${dashboardExits.length} sortie${dashboardExits.length > 1 ? 's' : ''}`;
        }
        break;
      case 'exit':
        countLabel = `${n} sortie${n > 1 ? 's' : ''}`;
        break;
      case 'cdd':
        countLabel = `${n} CDD`;
        break;
      case 'essai':
        countLabel = `${n} en période d'essai`;
        break;
      default:
        countLabel = `${n} employé${n > 1 ? 's' : ''}`;
    }

    if (parts.length === 0) return countLabel;
    return `${parts.join(' · ')} · ${countLabel}`;
  }, [
    tab,
    yearFilter,
    dept,
    contractFilter,
    statusFilter,
    search,
    filtered.length,
    dashboardEmployees.length,
    dashboardExits.length,
  ]);

  const openView = (employee: Employee) => {
    setViewing(employee);
    setViewOpen(true);
  };

  const openEdit = (employee: Employee | null) => {
    setEditing(employee);
    setEditOpen(true);
  };

  const handleSave = async (employee: Employee) => {
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/employees/${employee.matricule}` : '/api/employees';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employee),
    });
    if (!res.ok) {
      const err = await res.json();
      await showError(err.error || 'Erreur');
      return;
    }
    await showSuccess(editing ? 'Employé mis à jour' : 'Employé créé');
    await load(true);
    setEditOpen(false);
    setEditing(null);
  };

  const handleDelete = async (matricule: string) => {
    if (!(await confirmDelete('Supprimer cet employé ?', `Matricule ${matricule}`))) return;
    await fetch(`/api/employees/${matricule}`, { method: 'DELETE' });
    await load(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadEmployeesHrExport();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  const openContextMenu = (event: React.MouseEvent, employee: Employee) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, employee });
  };

  const contextItems: ContextMenuItem[] = contextMenu
    ? [
        {
          id: 'view',
          label: 'Voir la fiche',
          icon: 'view',
          onClick: () => openView(contextMenu.employee),
        },
        ...(canEdit
          ? [{
              id: 'edit',
              label: 'Modifier',
              icon: 'edit' as const,
              onClick: () => openEdit(contextMenu.employee),
            }]
          : []),
        ...(canDelete
          ? [{
              id: 'delete',
              label: 'Supprimer',
              icon: 'delete' as const,
              danger: true,
              onClick: () => void handleDelete(contextMenu.employee.matricule),
            }]
          : []),
      ]
    : [];

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate menuId="employes.liste" action="view">
    <div className="employees-page">
      <div className="employees-sticky">
        <div className="page-header page-header-with-tabs employees-header">
          <div>
            <div className="page-header-title-row">
              <h2>Liste des employés</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>{pageSubtitle}</p>
          </div>
          <div className="employees-header-actions">
            <div className="tabs header-tabs header-tabs-compact">
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                onClick={() => setTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`}
                onClick={() => setTab('liste')}
              >
                Liste
                <span className="employees-tab-count">{dashboardEmployees.length}</span>
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'essai' ? ' active' : ''}`}
                onClick={() => setTab('essai')}
              >
                Période d&apos;essai
                <span className="employees-tab-count">{essaiList.length}</span>
                {essaiAlertCount > 0 && (
                  <span className="employees-tab-alert" title="Évaluations à préparer (J-30)">
                    {essaiAlertCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'cdd' ? ' active' : ''}`}
                onClick={() => setTab('cdd')}
              >
                CDD
                <span className="employees-tab-count">{cddList.length}</span>
                {cddAlertCount > 0 && (
                  <span className="employees-tab-alert is-cdd" title="Fins de CDD ≤ 30 jours">
                    {cddAlertCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'exit' ? ' active' : ''}`}
                onClick={() => setTab('exit')}
              >
                Exit
                <span className="employees-tab-count">{dashboardExits.length}</span>
              </button>
            </div>
            {canExport && (
              <button
                type="button"
                className="btn btn-outline btn-export btn-with-icon"
                disabled={exporting}
                onClick={() => void handleExport()}
                title="Export RH : Dashboard + Base + Periode d'essai + CDD + EXIT"
              >
                {exporting ? (
                  <span className="btn-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {exporting ? 'Export…' : 'Export'}
              </button>
            )}
          </div>
        </div>

        {(tab === 'liste' || tab === 'exit' || tab === 'dashboard' || tab === 'cdd' || tab === 'essai') && (
          <div className="panel-toolbar employees-toolbar">
            {(tab === 'liste' || tab === 'exit' || tab === 'cdd' || tab === 'essai') && (
              <>
                <input
                  type="search"
                  className="search-input"
                  placeholder={
                    tab === 'exit'
                      ? 'Rechercher sortie…'
                      : tab === 'cdd'
                        ? 'Rechercher CDD…'
                        : tab === 'essai'
                          ? "Rechercher période d'essai…"
                          : 'Rechercher...'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select className="filter-select" value={dept} onChange={(e) => setDept(e.target.value)}>
                  <option value="">Tous les départements</option>
                  {getDepartments(sourceList).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {(tab === 'liste' || tab === 'essai') && (
                  <select
                    className="filter-select"
                    value={contractFilter}
                    onChange={(e) => setContractFilter(e.target.value)}
                    title="Filtrer par type de contrat"
                  >
                    <option value="">CDD + CDI</option>
                    <option value="CDD">CDD</option>
                    <option value="CDI">CDI</option>
                  </select>
                )}
                {tab === 'essai' && (
                  <select
                    className="filter-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    title="Filtrer par statut d'évaluation"
                  >
                    <option value="">Tous les statuts</option>
                    {ESSAI_STATUTS_EVAL.filter((s) => s !== 'Done').map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </>
            )}
            <select
              className="filter-select"
              value={yearFilter === '' ? '' : String(yearFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setYearFilter(v ? Number(v) : '');
              }}
              title="Filtrer par année de présence"
            >
              <option value="">Toutes les années</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {essaiAlertCount > 0 && (tab === 'dashboard' || tab === 'essai' || tab === 'liste') && (
              <button
                type="button"
                className="employees-trial-alert-toolbar"
                onClick={() => setTab('essai')}
                title="Voir les collaborateurs à évaluer"
              >
                <strong>{essaiAlertCount}</strong>
                {' '}
                éval. essai ≤ 30 j
              </button>
            )}
            {tab === 'liste' && (
              <PermissionGate menuId="employes.liste" action="create">
                <button type="button" className="btn btn-accent" onClick={() => openEdit(null)}>
                  + Ajouter un employé
                </button>
              </PermissionGate>
            )}
          </div>
        )}
      </div>

      {tab === 'dashboard' ? (
        <div className="employees-dashboard-body">
          <EmployeesHrDashboardView employees={dashboardEmployees} exits={dashboardExits} />
        </div>
      ) : (
        <div className="employees-list-body">
          {tab === 'cdd' && cddAlertCount > 0 && (
            <div className="employees-trial-alert-banner employees-trial-alert-banner-inline is-cdd">
              <strong>{cddAlertCount}</strong>
              {' '}
              CDD se terminant dans les 30 jours.
            </div>
          )}
          {(tab === 'cdd' || tab === 'essai') && (
            <div className="employees-row-legend" aria-label="Légende des couleurs">
              {tab === 'cdd' ? (
                <>
                  <span className="employees-row-legend-item">
                    <i className="employees-row-legend-swatch is-essai" aria-hidden />
                    Violet — encore en période d&apos;essai
                  </span>
                  <span className="employees-row-legend-item">
                    <i className="employees-row-legend-swatch is-alert" aria-hidden />
                    Rouge — fin de contrat ≤ 30 jours
                  </span>
                  <span className="employees-row-legend-item">
                    <i className="employees-row-legend-swatch is-overdue" aria-hidden />
                    Rouge fondu — fin de contrat déjà dépassée
                  </span>
                  <span className="employees-row-legend-item">
                    <strong className="employees-date-past employees-row-legend-date">Fin</strong>
                    Date en rouge gras — Fin ou Alerte déjà passée
                  </span>
                </>
              ) : (
                <>
                  <span className="employees-row-legend-item">
                    <i className="employees-row-legend-swatch is-alert" aria-hidden />
                    Rouge — évaluation essai ≤ 30 jours
                  </span>
                  <span className="employees-row-legend-item">
                    <strong className="employees-date-past employees-row-legend-date">Fin</strong>
                    Date en rouge gras — Fin essai ou Échéance déjà passée
                  </span>
                </>
              )}
            </div>
          )}
          <div className="panel employees-list-panel">
            <div className="employees-table-wrap is-compact">
              <table className="employees-table employees-table-compact">
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Nom</th>
                    {tab === 'cdd' || tab === 'essai' ? (
                      <>
                        <th>Département</th>
                        <th>Site</th>
                        <th>Contrat</th>
                      </>
                    ) : (
                      <>
                        <th>Département</th>
                        <th>Grade</th>
                        <th>Localisation</th>
                        <th>Âge</th>
                        <th>Ancienneté</th>
                      </>
                    )}
                    {tab === 'exit' && (
                      <>
                        <th>Date fin contrat</th>
                        <th>Raison exit</th>
                      </>
                    )}
                    {tab === 'liste' && (
                      <>
                        <th>Poste</th>
                        <th>Dossier</th>
                      </>
                    )}
                    {tab === 'cdd' && (
                      <>
                        <th>Durée</th>
                        <th>Début</th>
                        <th>Fin</th>
                        <th>Alerte</th>
                      </>
                    )}
                    {tab === 'essai' && (
                      <>
                        <th>Mois</th>
                        <th>Début</th>
                        <th>Fin essai</th>
                        <th>Actions</th>
                        <th>Resp.</th>
                        <th>Échéance</th>
                        <th>Statut</th>
                        <th>Comment.</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="empty-state">
                        {tab === 'exit'
                          ? 'Aucune sortie enregistrée.'
                          : tab === 'cdd'
                            ? 'Aucun CDD trouvé.'
                            : tab === 'essai'
                              ? "Aucune période d'essai en cours."
                              : 'Aucun employé trouvé.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((e) => {
                      const { pct } = calcDocumentCompletion(e);
                      const rateCls = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
                      const age = resolveEmployeeAge(e);
                      const seniority = computeSeniorityYears(
                        e.appointmentDate || '',
                        yearFilter !== '' ? new Date(yearFilter, 11, 31) : new Date(),
                      );
                      const finEssai = resolveDateFinPeriodeEssai(e);
                      const finContrat = resolveDateFinContrat(e);
                      const evalAlert = isTrialEvalAlert(e);
                      const cddAlert = isCddEndAlert(e);
                      const inTrial = isInActiveTrialPeriod(e);
                      const cddOverdue = isCddOverdue(e);
                      const rowAlertClass =
                        tab === 'cdd' && cddOverdue
                          ? ' employees-row-overdue'
                          : (tab === 'essai' || tab === 'liste') && evalAlert
                              ? ' employees-row-alert-eval'
                              : tab === 'cdd' && cddAlert
                                ? ' employees-row-alert-cdd'
                                : tab === 'cdd' && inTrial
                                  ? ' employees-row-cdd-essai'
                                  : tab === 'liste' && cddAlert
                                    ? ' employees-row-alert-cdd'
                                    : '';
                      const daysLeft = daysUntilDisplayDate(finEssai);
                      const daysCdd = daysUntilDisplayDate(finContrat);
                      const echeance = resolveEssaiEcheanceEval({
                        ...e,
                        dateFinPeriodeEssai: finEssai,
                      });
                      const cddAlerteDate = resolveCddAlerteDate(e);
                      const essaiStatut = resolveEssaiStatutEval(e);
                      return (
                        <tr
                          key={e.matricule}
                          className={`employees-row-context${rowAlertClass}`}
                          onClick={() => openView(e)}
                          onDoubleClick={() => openView(e)}
                          onContextMenu={(event) => openContextMenu(event, e)}
                        >
                          <td><strong>{e.matricule}</strong></td>
                          <td className="col-name" title={e.nom}>{e.nom}</td>
                          {tab === 'cdd' || tab === 'essai' ? (
                            <>
                              <td className="col-clip" title={e.departement || undefined}>
                                {e.departement || '—'}
                              </td>
                              <td>{e.localisation || '—'}</td>
                              <td>{e.typeContrat || '—'}</td>
                            </>
                          ) : (
                            <>
                              <td className="col-clip">{e.departement}</td>
                              <td>{e.grade}</td>
                              <td>{e.localisation}</td>
                              <td>{formatYears(age)}</td>
                              <td>{formatYears(seniority)}</td>
                            </>
                          )}
                          {tab === 'exit' && (
                            <>
                              <td className={dateCellClass(finContrat)}>{finContrat || '—'}</td>
                              <td>{e.raisonExit || '—'}</td>
                            </>
                          )}
                          {tab === 'liste' && (
                            <>
                              <td className="col-clip" title={e.jobTitle || undefined}>{e.jobTitle}</td>
                              <td>
                                <div className="progress-wrap">
                                  <div className="progress-bar">
                                    <div className={`progress-fill ${rateCls}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="progress-pct">{pct}%</span>
                                </div>
                              </td>
                            </>
                          )}
                          {tab === 'cdd' && (
                            <>
                              <td>{resolveDureeContratMois(e) ?? '—'}</td>
                              <td className="col-date">{e.appointmentDate || '—'}</td>
                              <td className={dateCellClass(finContrat)}>{finContrat || '—'}</td>
                              <td className={dateCellClass(cddAlerteDate)}>
                                {cddAlerteDate || '—'}
                                {cddAlert && daysCdd != null && daysCdd >= 0 && (
                                  <span className="employees-essai-days is-cdd" title="Jours restants avant fin de contrat">
                                    {' '}J-{daysCdd}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          {tab === 'essai' && (
                            <>
                              <td>{e.periodeEssaiMois ?? '—'}</td>
                              <td className="col-date">{e.appointmentDate || '—'}</td>
                              <td className={dateCellClass(finEssai)}>
                                {finEssai || '—'}
                                {evalAlert && daysLeft != null && daysLeft >= 0 && (
                                  <span className="employees-essai-days" title="Jours restants">
                                    {' '}J-{daysLeft}
                                  </span>
                                )}
                              </td>
                              <td className="col-clip" title={e.essaiActions || undefined}>{e.essaiActions || '—'}</td>
                              <td className="col-clip" title={e.essaiResponsable || undefined}>{e.essaiResponsable || '—'}</td>
                              <td className={`${dateCellClass(echeance)} col-echeance`}>
                                {echeance || '—'}
                              </td>
                              <td>
                                <span className={`employees-essai-status ${essaiStatutClass(essaiStatut)}`}>
                                  {essaiStatut}
                                </span>
                              </td>
                              <td className="col-clip" title={e.essaiCommentaire || undefined}>{e.essaiCommentaire || '—'}</td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {viewOpen && viewing && (
        <EmployeeViewModal
          employee={viewing}
          canEdit={canEdit}
          onClose={() => { setViewOpen(false); setViewing(null); }}
          onUpdated={() => {
            void load(true);
          }}
        />
      )}

      {editOpen && (canCreate || (editing && canEdit)) && (
        <EmployeeModal
          employee={editing}
          onClose={() => { setEditOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
    </PermissionGate>
  );
}
