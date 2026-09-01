'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import EmployeeModal from '@/components/EmployeeModal';
import EmployeeViewModal from '@/components/EmployeeViewModal';
import EmployeesHrDashboardView from '@/components/EmployeesHrDashboardView';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';
import type { MessageKey } from '@/lib/i18n';
import { calcDocumentCompletion, getDepartments } from '@/lib/documents';
import { getLocalisations } from '@/lib/employee-utils';
import {
  computeAgeFromDisplayDate,
  computeSeniority,
  exitedInYear,
  exitedInYearMonth,
  formatSeniority,
  formatSeniorityLabel,
  wasPresentOnAsOf,
  yearFromDisplayDate,
} from '@/lib/employee-columns';
import { downloadEmployeesHrExport } from '@/lib/employees-export';
import { employeesPresentOnAsOf } from '@/lib/employees-hr-dashboard';
import {
  daysUntilDisplayDate,
  ESSAI_COMMENTAIRES,
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
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { confirmDelete, promptSelect, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

type PageTab = 'dashboard' | 'liste' | 'essai' | 'cdd' | 'exit';

type FilterKey =
  | 'matricule'
  | 'nom'
  | 'departement'
  | 'grade'
  | 'localisation'
  | 'age'
  | 'anciennete'
  | 'poste'
  | 'finContrat'
  | 'raisonExit'
  | 'contrat'
  | 'duree'
  | 'debut'
  | 'fin'
  | 'alerte'
  | 'mois'
  | 'finEssai'
  | 'actions'
  | 'resp'
  | 'echeance'
  | 'statut'
  | 'comment';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  matricule: [],
  nom: [],
  departement: [],
  grade: [],
  localisation: [],
  age: [],
  anciennete: [],
  poste: [],
  finContrat: [],
  raisonExit: [],
  contrat: [],
  duree: [],
  debut: [],
  fin: [],
  alerte: [],
  mois: [],
  finEssai: [],
  actions: [],
  resp: [],
  echeance: [],
  statut: [],
  comment: [],
};

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

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

function seniorityParts(employee: Employee, yearFilter: number | '', monthFilter: number | '') {
  return computeSeniority(
    employee.appointmentDate || '',
    yearFilter !== '' ? asOfFromYearMonth(yearFilter, monthFilter) : new Date(),
  );
}

function seniorityValue(employee: Employee, yearFilter: number | '', monthFilter: number | ''): string {
  return formatSeniority(seniorityParts(employee, yearFilter, monthFilter));
}

const MONTH_KEYS: MessageKey[] = [
  'cal.month.1', 'cal.month.2', 'cal.month.3', 'cal.month.4',
  'cal.month.5', 'cal.month.6', 'cal.month.7', 'cal.month.8',
  'cal.month.9', 'cal.month.10', 'cal.month.11', 'cal.month.12',
];

/** Dernier jour du mois (asOf pour ancienneté filtrée). */
function asOfFromYearMonth(year: number, month: number | ''): Date {
  if (month === '') return new Date(year, 11, 31);
  return new Date(year, month, 0); // jour 0 du mois suivant = dernier jour du mois
}

function dureeValue(employee: Employee): string {
  const value = resolveDureeContratMois(employee);
  return value == null ? '' : String(value);
}

function moisValue(employee: Employee): string {
  return employee.periodeEssaiMois == null ? '' : String(employee.periodeEssaiMois);
}

export default function EmployesPage() {
  const { can } = usePermissions();
  const { t } = useI18n();
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
  const [yearFilter, setYearFilter] = useState<number | ''>(CURRENT_YEAR);
  const [monthFilter, setMonthFilter] = useState<number | ''>(CURRENT_MONTH);
  const [locFilter, setLocFilter] = useState('');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTab, setViewTab] = useState<'infos' | 'essai'>('infos');
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
    setColFilters(EMPTY_FILTERS);
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
    let list = employees;
    if (yearFilter !== '') {
      const asOf = asOfFromYearMonth(yearFilter, monthFilter);
      list = employees.filter((e) => wasPresentOnAsOf(e, asOf));
    }
    if (locFilter) list = list.filter((e) => (e.localisation || '').trim() === locFilter);
    return list;
  }, [employees, yearFilter, monthFilter, locFilter]);

  /** Effectif encore en poste au dernier jour de la période (actifs + sorties postérieures). */
  const yearScopedHeadcount = useMemo(() => {
    let list = yearFilter === ''
      ? employees
      : employeesPresentOnAsOf(employees, exits, asOfFromYearMonth(yearFilter, monthFilter));
    if (locFilter) list = list.filter((e) => (e.localisation || '').trim() === locFilter);
    return [...list].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [employees, exits, yearFilter, monthFilter, locFilter]);

  /** Sorties dont la date de fin tombe dans la période sélectionnée. */
  const yearScopedExits = useMemo(() => {
    let list = exits;
    if (yearFilter !== '') {
      list = monthFilter !== ''
        ? exits.filter((e) => exitedInYearMonth(e, yearFilter, monthFilter))
        : exits.filter((e) => exitedInYear(e, yearFilter));
    }
    if (locFilter) list = list.filter((e) => (e.localisation || '').trim() === locFilter);
    return list;
  }, [exits, yearFilter, monthFilter, locFilter]);

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
          : yearScopedHeadcount;

  const toolbarFiltered = useMemo(() => {
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

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarFiltered, {
        matricule: (e) => e.matricule,
        nom: (e) => e.nom,
        departement: (e) => e.departement,
        grade: (e) => e.grade,
        localisation: (e) => e.localisation,
        age: (e) => formatYears(resolveEmployeeAge(e)),
        anciennete: (e) => seniorityValue(e, yearFilter, monthFilter),
        poste: (e) => e.jobTitle,
        finContrat: (e) => resolveDateFinContrat(e),
        raisonExit: (e) => e.raisonExit,
        contrat: (e) => e.typeContrat,
        duree: (e) => dureeValue(e),
        debut: (e) => e.appointmentDate,
        fin: (e) => resolveDateFinContrat(e),
        alerte: (e) => resolveCddAlerteDate(e),
        mois: (e) => moisValue(e),
        finEssai: (e) => resolveDateFinPeriodeEssai(e),
        actions: (e) => e.essaiActions,
        resp: (e) => e.essaiResponsable,
        echeance: (e) =>
          resolveEssaiEcheanceEval({
            ...e,
            dateFinPeriodeEssai: resolveDateFinPeriodeEssai(e),
          }),
        statut: (e) => resolveEssaiStatutEval(e),
        comment: (e) => e.essaiCommentaire,
      }),
    [toolbarFiltered, yearFilter, monthFilter],
  );

  const filtered = useMemo(
    () =>
      toolbarFiltered.filter((e) => {
        const finEssai = resolveDateFinPeriodeEssai(e);
        const finContrat = resolveDateFinContrat(e);
        const echeance = resolveEssaiEcheanceEval({
          ...e,
          dateFinPeriodeEssai: finEssai,
        });
        return (
          matchesColumnFilter(colFilters.matricule, e.matricule) &&
          matchesColumnFilter(colFilters.nom, e.nom) &&
          matchesColumnFilter(colFilters.departement, e.departement) &&
          matchesColumnFilter(colFilters.grade, e.grade) &&
          matchesColumnFilter(colFilters.localisation, e.localisation) &&
          matchesColumnFilter(colFilters.age, formatYears(resolveEmployeeAge(e))) &&
          matchesColumnFilter(colFilters.anciennete, seniorityValue(e, yearFilter, monthFilter)) &&
          matchesColumnFilter(colFilters.poste, e.jobTitle) &&
          matchesColumnFilter(colFilters.finContrat, finContrat) &&
          matchesColumnFilter(colFilters.raisonExit, e.raisonExit) &&
          matchesColumnFilter(colFilters.contrat, e.typeContrat) &&
          matchesColumnFilter(colFilters.duree, dureeValue(e)) &&
          matchesColumnFilter(colFilters.debut, e.appointmentDate) &&
          matchesColumnFilter(colFilters.fin, finContrat) &&
          matchesColumnFilter(colFilters.alerte, resolveCddAlerteDate(e)) &&
          matchesColumnFilter(colFilters.mois, moisValue(e)) &&
          matchesColumnFilter(colFilters.finEssai, finEssai) &&
          matchesColumnFilter(colFilters.actions, e.essaiActions) &&
          matchesColumnFilter(colFilters.resp, e.essaiResponsable) &&
          matchesColumnFilter(colFilters.echeance, echeance) &&
          matchesColumnFilter(colFilters.statut, resolveEssaiStatutEval(e)) &&
          matchesColumnFilter(colFilters.comment, e.essaiCommentaire)
        );
      }),
    [toolbarFiltered, colFilters, yearFilter, monthFilter],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const dashboardEmployees = yearScopedActive;
  const dashboardExits = yearScopedExits;

  const locOptions = useMemo(
    () => getLocalisations([...employees, ...exits]),
    [employees, exits],
  );

  const openView = (employee: Employee) => {
    setViewTab(tab === 'essai' || tab === 'cdd' ? 'essai' : 'infos');
    setViewing(employee);
    setViewOpen(true);
  };

  const openEdit = (employee: Employee | null) => {
    setEditing(employee);
    setEditOpen(true);
  };

  const handleSave = async (employee: Employee): Promise<boolean> => {
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
      return false;
    }
    await showSuccess(editing ? 'Employé mis à jour' : 'Employé créé');
    await load(true);
    return true;
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

  /** Interim appraisal : disponible à partir d'un mois avant la fin de la période d'essai. */
  const isAppraisalAvailable = (employee: Employee): boolean => {
    const finEssai = resolveDateFinPeriodeEssai(employee);
    if (!finEssai) return false;
    const days = daysUntilDisplayDate(finEssai);
    return days != null && days <= 30;
  };

  const generateAppraisal = async (employee: Employee) => {
    const res = await fetch('/api/documents/interim-appraisal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricule: employee.matricule }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      await showError(err.error || 'Erreur de génération');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Interim appraisal evaluation - ${employee.nom}.docx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    await showSuccess('Interim appraisal généré');
  };

  /** Onglet essai : la modification contextuelle ne touche que le commentaire. */
  const editEssaiComment = async (employee: Employee) => {
    const value = await promptSelect('Commentaire évaluation', {
      text: employee.nom,
      inputOptions: {
        '': '—',
        ...Object.fromEntries(ESSAI_COMMENTAIRES.map((c) => [c, c])),
      },
      inputValue: employee.essaiCommentaire || '',
      confirmText: 'Enregistrer',
    });
    if (value == null) return;
    const res = await fetch(`/api/employees/${encodeURIComponent(employee.matricule)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...employee, essaiCommentaire: value }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      await showError((err as { error?: string }).error || 'Erreur');
      return;
    }
    await showSuccess('Commentaire mis à jour');
    await load(true);
  };

  const contextItems: ContextMenuItem[] = contextMenu
    ? [
        {
          id: 'view',
          label: 'Voir la fiche',
          icon: 'view',
          onClick: () => openView(contextMenu.employee),
        },
        ...(tab === 'essai'
        && can('documents.appraisal', 'create')
        && isAppraisalAvailable(contextMenu.employee)
          ? [{
              id: 'appraisal',
              label: 'Interim appraisal evaluation',
              icon: 'doc' as const,
              onClick: () => void generateAppraisal(contextMenu.employee),
            }]
          : []),
        ...(canEdit
          ? [{
              id: 'edit',
              label: tab === 'essai' ? 'Modifier le commentaire' : 'Modifier',
              icon: 'edit' as const,
              onClick: () => {
                if (tab === 'essai') void editEssaiComment(contextMenu.employee);
                else openEdit(contextMenu.employee);
              },
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

  if (loading) return <div className="loading">{t('common.loading')}</div>;

  return (
    <PermissionGate menuId="employes.liste" action="view">
    <div className="employees-page">
      <div className="employees-sticky">
        <div className="page-header page-header-with-tabs employees-header">
          <div>
            <div className="page-header-title-row">
              <h2>{t('emp.title')}</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
          </div>
          <div className="employees-header-actions">
            <div className="employees-header-period">
              <select
                className="filter-select employees-filter-year"
                value={yearFilter === '' ? '' : String(yearFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setYearFilter(v ? Number(v) : '');
                  if (!v) setMonthFilter('');
                }}
                title={t('emp.filter.yearTitle')}
              >
                <option value="">{t('emp.filter.allYears')}</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                className="filter-select employees-filter-month"
                value={monthFilter === '' ? '' : String(monthFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setMonthFilter(v ? Number(v) : '');
                }}
                disabled={yearFilter === ''}
                title={
                  yearFilter === ''
                    ? t('emp.filter.monthDisabled')
                    : t('emp.filter.monthTitle')
                }
              >
                <option value="">{t('emp.filter.allMonths')}</option>
                {MONTH_KEYS.map((key, index) => (
                  <option key={key} value={index + 1}>{t(key)}</option>
                ))}
              </select>
              <select
                className="filter-select employees-filter-loc"
                value={locFilter}
                onChange={(e) => setLocFilter(e.target.value)}
                title={t('emp.filter.locTitle')}
              >
                <option value="">{t('emp.filter.allLocations')}</option>
                {locOptions.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            {canExport && (
              <button
                type="button"
                className="btn btn-outline btn-export btn-with-icon"
                disabled={exporting}
                onClick={() => void handleExport()}
                title={t('emp.exportTitle')}
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
            {canCreate && (
              <PermissionGate menuId="employes.liste" action="create">
                <button
                  type="button"
                  className="btn btn-accent btn-icon-only"
                  onClick={() => openEdit(null)}
                  title={t('emp.addTitle')}
                  aria-label={t('emp.addTitle')}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden>
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </PermissionGate>
            )}
          </div>
        </div>

        <div className="exco-main-tabs employees-main-tabs" role="tablist" aria-label={t('emp.title')}>
          <button
            type="button"
            role="tab"
            className={`exco-main-tab${tab === 'dashboard' ? ' is-active' : ''}`}
            aria-selected={tab === 'dashboard'}
            onClick={() => setTab('dashboard')}
          >
            {t('emp.tab.dashboard')}
          </button>
          <button
            type="button"
            role="tab"
            className={`exco-main-tab${tab === 'liste' ? ' is-active' : ''}`}
            aria-selected={tab === 'liste'}
            onClick={() => setTab('liste')}
          >
            {t('emp.tab.list')}
            <span className="employees-tab-count">{dashboardEmployees.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`exco-main-tab${tab === 'essai' ? ' is-active' : ''}`}
            aria-selected={tab === 'essai'}
            onClick={() => setTab('essai')}
          >
            {t('emp.tab.trial')}
            <span className="employees-tab-count">{essaiList.length}</span>
            {essaiAlertCount > 0 && (
              <span className="employees-tab-alert" title={t('emp.trialAlert')}>
                {essaiAlertCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            className={`exco-main-tab${tab === 'cdd' ? ' is-active' : ''}`}
            aria-selected={tab === 'cdd'}
            onClick={() => setTab('cdd')}
          >
            {t('emp.tab.cdd')}
            <span className="employees-tab-count">{cddList.length}</span>
            {cddAlertCount > 0 && (
              <span className="employees-tab-alert is-cdd" title={t('emp.cddAlert')}>
                {cddAlertCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            className={`exco-main-tab${tab === 'exit' ? ' is-active' : ''}`}
            aria-selected={tab === 'exit'}
            onClick={() => setTab('exit')}
          >
            {t('emp.tab.exit')}
            <span className="employees-tab-count">{dashboardExits.length}</span>
          </button>
        </div>

        {((tab === 'liste' || tab === 'exit' || tab === 'cdd' || tab === 'essai')
          || (essaiAlertCount > 0 && (tab === 'dashboard' || tab === 'essai' || tab === 'liste'))) && (
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
            {activeFilterCount > 0 && (tab === 'liste' || tab === 'exit' || tab === 'cdd' || tab === 'essai') && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setColFilters(EMPTY_FILTERS)}
              >
                Effacer les filtres ({activeFilterCount})
              </button>
            )}
          </div>
        )}
      </div>

      {tab === 'dashboard' ? (
        <div className="employees-dashboard-body">
          <EmployeesHrDashboardView
            employees={dashboardEmployees}
            exits={dashboardExits}
            allEmployees={locFilter ? employees.filter((e) => (e.localisation || '').trim() === locFilter) : employees}
            allExits={locFilter ? exits.filter((e) => (e.localisation || '').trim() === locFilter) : exits}
            year={yearFilter}
            month={monthFilter}
          />
        </div>
      ) : (
        <div className="employees-list-body">
          {tab === 'cdd' && cddAlertCount > 0 && (
            <div className="employees-trial-alert-banner employees-trial-alert-banner-inline is-cdd">
              <strong>{cddAlertCount}</strong>
              {' '}
              CDD échu(s) ou se terminant dans les 30 jours.
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
              <table
                className={`employees-table employees-table-compact${tab === 'essai' || tab === 'cdd' ? ' is-wide' : ''}`}
              >
                <thead>
                  <tr>
                    <th className="th-filter emp-col-matricule">
                      <TableHeaderFilter
                        label="Matricule"
                        values={filterValues.matricule}
                        selected={colFilters.matricule}
                        onChange={(next) => setColFilters((p) => ({ ...p, matricule: next }))}
                      />
                    </th>
                    <th className="th-filter emp-col-nom">
                      <TableHeaderFilter
                        label="Nom"
                        values={filterValues.nom}
                        selected={colFilters.nom}
                        onChange={(next) => setColFilters((p) => ({ ...p, nom: next }))}
                      />
                    </th>
                    {tab === 'cdd' || tab === 'essai' ? (
                      <>
                        <th className="th-filter emp-col-dept">
                          <TableHeaderFilter
                            label="Département"
                            values={filterValues.departement}
                            selected={colFilters.departement}
                            onChange={(next) => setColFilters((p) => ({ ...p, departement: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-loc">
                          <TableHeaderFilter
                            label="Site"
                            values={filterValues.localisation}
                            selected={colFilters.localisation}
                            onChange={(next) => setColFilters((p) => ({ ...p, localisation: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-contrat">
                          <TableHeaderFilter
                            label="Contrat"
                            values={filterValues.contrat}
                            selected={colFilters.contrat}
                            onChange={(next) => setColFilters((p) => ({ ...p, contrat: next }))}
                          />
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="th-filter emp-col-dept">
                          <TableHeaderFilter
                            label="Département"
                            values={filterValues.departement}
                            selected={colFilters.departement}
                            onChange={(next) => setColFilters((p) => ({ ...p, departement: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-grade">
                          <TableHeaderFilter
                            label="Grade"
                            values={filterValues.grade}
                            selected={colFilters.grade}
                            onChange={(next) => setColFilters((p) => ({ ...p, grade: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-loc">
                          <TableHeaderFilter
                            label="Localisation"
                            values={filterValues.localisation}
                            selected={colFilters.localisation}
                            onChange={(next) => setColFilters((p) => ({ ...p, localisation: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-age">
                          <TableHeaderFilter
                            label="Âge"
                            values={filterValues.age}
                            selected={colFilters.age}
                            onChange={(next) => setColFilters((p) => ({ ...p, age: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-anciennete">
                          <TableHeaderFilter
                            label="Ancienneté"
                            values={filterValues.anciennete}
                            selected={colFilters.anciennete}
                            onChange={(next) => setColFilters((p) => ({ ...p, anciennete: next }))}
                          />
                        </th>
                      </>
                    )}
                    {tab === 'exit' && (
                      <>
                        <th className="th-filter emp-col-date">
                          <TableHeaderFilter
                            label="Date fin contrat"
                            values={filterValues.finContrat}
                            selected={colFilters.finContrat}
                            onChange={(next) => setColFilters((p) => ({ ...p, finContrat: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-raison">
                          <TableHeaderFilter
                            label="Raison exit"
                            values={filterValues.raisonExit}
                            selected={colFilters.raisonExit}
                            onChange={(next) => setColFilters((p) => ({ ...p, raisonExit: next }))}
                          />
                        </th>
                      </>
                    )}
                    {tab === 'liste' && (
                      <>
                        <th className="th-filter emp-col-poste">
                          <TableHeaderFilter
                            label="Poste"
                            values={filterValues.poste}
                            selected={colFilters.poste}
                            onChange={(next) => setColFilters((p) => ({ ...p, poste: next }))}
                          />
                        </th>
                        <th className="emp-col-dossier">Dossier</th>
                      </>
                    )}
                    {tab === 'cdd' && (
                      <>
                        <th className="th-filter emp-col-duree">
                          <TableHeaderFilter
                            label="Durée"
                            values={filterValues.duree}
                            selected={colFilters.duree}
                            onChange={(next) => setColFilters((p) => ({ ...p, duree: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-debut">
                          <TableHeaderFilter
                            label="Début"
                            values={filterValues.debut}
                            selected={colFilters.debut}
                            onChange={(next) => setColFilters((p) => ({ ...p, debut: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-fin">
                          <TableHeaderFilter
                            label="Fin"
                            values={filterValues.fin}
                            selected={colFilters.fin}
                            onChange={(next) => setColFilters((p) => ({ ...p, fin: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-alerte">
                          <TableHeaderFilter
                            label="Alerte"
                            values={filterValues.alerte}
                            selected={colFilters.alerte}
                            onChange={(next) => setColFilters((p) => ({ ...p, alerte: next }))}
                          />
                        </th>
                      </>
                    )}
                    {tab === 'essai' && (
                      <>
                        <th className="th-filter emp-col-mois">
                          <TableHeaderFilter
                            label="Mois"
                            values={filterValues.mois}
                            selected={colFilters.mois}
                            onChange={(next) => setColFilters((p) => ({ ...p, mois: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-debut">
                          <TableHeaderFilter
                            label="Début"
                            values={filterValues.debut}
                            selected={colFilters.debut}
                            onChange={(next) => setColFilters((p) => ({ ...p, debut: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-fin">
                          <TableHeaderFilter
                            label="Fin essai"
                            values={filterValues.finEssai}
                            selected={colFilters.finEssai}
                            onChange={(next) => setColFilters((p) => ({ ...p, finEssai: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-actions">
                          <TableHeaderFilter
                            label="Actions"
                            values={filterValues.actions}
                            selected={colFilters.actions}
                            onChange={(next) => setColFilters((p) => ({ ...p, actions: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-resp">
                          <TableHeaderFilter
                            label="Resp."
                            values={filterValues.resp}
                            selected={colFilters.resp}
                            onChange={(next) => setColFilters((p) => ({ ...p, resp: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-echeance">
                          <TableHeaderFilter
                            label="Échéance"
                            values={filterValues.echeance}
                            selected={colFilters.echeance}
                            onChange={(next) => setColFilters((p) => ({ ...p, echeance: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-statut">
                          <TableHeaderFilter
                            label="Statut"
                            values={filterValues.statut}
                            selected={colFilters.statut}
                            onChange={(next) => setColFilters((p) => ({ ...p, statut: next }))}
                          />
                        </th>
                        <th className="th-filter emp-col-comment">
                          <TableHeaderFilter
                            label="Comment."
                            values={filterValues.comment}
                            selected={colFilters.comment}
                            onChange={(next) => setColFilters((p) => ({ ...p, comment: next }))}
                          />
                        </th>
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
                    filtered.map((e, rowIndex) => {
                      const { pct } = calcDocumentCompletion(e);
                      const rateCls = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
                      const age = resolveEmployeeAge(e);
                      const seniority = seniorityParts(e, yearFilter, monthFilter);
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
                          key={`${e.matricule}-${rowIndex}`}
                          className={`employees-row-context${rowAlertClass}`}
                          onClick={() => openView(e)}
                          onDoubleClick={() => openView(e)}
                          onContextMenu={(event) => openContextMenu(event, e)}
                        >
                          <td className="emp-col-matricule"><strong>{e.matricule}</strong></td>
                          <td className="col-name emp-col-nom" title={e.nom}>{e.nom}</td>
                          {tab === 'cdd' || tab === 'essai' ? (
                            <>
                              <td className="col-clip emp-col-dept" title={e.departement || undefined}>
                                {e.departement || '—'}
                              </td>
                              <td className="emp-col-loc">{e.localisation || '—'}</td>
                              <td className="emp-col-contrat">{e.typeContrat || '—'}</td>
                            </>
                          ) : (
                            <>
                              <td className="col-clip emp-col-dept" title={e.departement || undefined}>
                                {e.departement}
                              </td>
                              <td className="emp-col-grade">{e.grade}</td>
                              <td className="emp-col-loc">{e.localisation}</td>
                              <td className="emp-col-age">{formatYears(age)}</td>
                              <td className="emp-col-anciennete" title={formatSeniorityLabel(seniority)}>
                                {seniority == null ? (
                                  '—'
                                ) : (
                                  <>
                                    {seniority.years} an(s){' '}
                                    <span className="emp-anciennete-mois">({seniority.months}m)</span>
                                  </>
                                )}
                              </td>
                            </>
                          )}
                          {tab === 'exit' && (
                            <>
                              <td className={`emp-col-date ${dateCellClass(finContrat)}`.trim()}>
                                {finContrat || '—'}
                              </td>
                              <td className="emp-col-raison">{e.raisonExit || '—'}</td>
                            </>
                          )}
                          {tab === 'liste' && (
                            <>
                              <td className="col-clip emp-col-poste" title={e.jobTitle || undefined}>
                                {e.jobTitle}
                              </td>
                              <td className="emp-col-dossier">
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
                              <td className="emp-col-duree">{resolveDureeContratMois(e) ?? '—'}</td>
                              <td className="col-date emp-col-debut">{e.appointmentDate || '—'}</td>
                              <td className={`emp-col-fin ${dateCellClass(finContrat)}`.trim()}>
                                {finContrat || '—'}
                              </td>
                              <td className={`emp-col-alerte ${dateCellClass(cddAlerteDate)}`.trim()}>
                                {cddAlerteDate || '—'}
                                {cddAlert && daysCdd != null && (
                                  <span
                                    className="employees-essai-days is-cdd"
                                    title={daysCdd >= 0 ? 'Jours restants avant fin de contrat' : 'Contrat déjà échu'}
                                  >
                                    {' '}{daysCdd >= 0 ? `J-${daysCdd}` : 'échu'}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          {tab === 'essai' && (
                            <>
                              <td className="emp-col-mois">{e.periodeEssaiMois ?? '—'}</td>
                              <td className="col-date emp-col-debut">{e.appointmentDate || '—'}</td>
                              <td className={`emp-col-fin ${dateCellClass(finEssai)}`.trim()}>
                                {finEssai || '—'}
                                {evalAlert && daysLeft != null && daysLeft >= 0 && (
                                  <span className="employees-essai-days" title="Jours restants">
                                    {' '}J-{daysLeft}
                                  </span>
                                )}
                              </td>
                              <td className="col-clip emp-col-actions" title={e.essaiActions || undefined}>
                                {e.essaiActions || '—'}
                              </td>
                              <td className="col-clip emp-col-resp" title={e.essaiResponsable || undefined}>
                                {e.essaiResponsable || '—'}
                              </td>
                              <td className={`emp-col-echeance ${dateCellClass(echeance)} col-echeance`.trim()}>
                                {echeance || '—'}
                              </td>
                              <td className="emp-col-statut">
                                <span className={`employees-essai-status ${essaiStatutClass(essaiStatut)}`}>
                                  {essaiStatut}
                                </span>
                              </td>
                              <td className="col-clip emp-col-comment" title={e.essaiCommentaire || undefined}>
                                {e.essaiCommentaire || '—'}
                              </td>
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
          initialTab={viewTab}
          onClose={() => { setViewOpen(false); setViewing(null); }}
          onUpdated={() => {
            void load(true);
          }}
        />
      )}

      {editOpen && (canCreate || (editing && canEdit)) && (
        <EmployeeModal
          employee={editing}
          employees={employees}
          onClose={() => { setEditOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
    </PermissionGate>
  );
}
