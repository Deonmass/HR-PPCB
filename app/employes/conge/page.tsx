'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import CongeDashboardView from '@/components/conge/CongeDashboardView';
import CongeGradesView from '@/components/conge/CongeGradesView';
import CongePlanningView from '@/components/conge/CongePlanningView';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  congeDrillTitle,
  employeesForCongeDrill,
} from '@/lib/conge-dashboard';
import {
  clampAsOfIso,
  countAlDays,
  formatCongeNumber,
  formatIsoFr,
  monthEndBalance,
  monthsInIsoRange,
  resolveDayCode,
} from '@/lib/conge-rules';
import { showError, showSuccess } from '@/lib/swal';
import type {
  CongeBundle,
  CongeDrillKind,
  CongeEmployeeView,
  CongeGradeRow,
  CongeSeniorityBand,
  LeaveCode,
} from '@/lib/conge-types';

type PageTab = 'dashboard' | 'planning' | 'grades';

const MENU = 'employes.conge';

const DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'departement', label: 'Département' },
  { key: 'grade', label: 'Grade' },
  { key: 'position', label: 'Position' },
  { key: 'detail', label: 'Détail' },
];

function emptyBundle(): CongeBundle {
  const year = new Date().getFullYear();
  return {
    exerciseYear: year,
    rangeStart: `${year}-01-01`,
    rangeEnd: `${year}-06-30`,
    source: '',
    updatedAt: '',
    grades: [],
    seniorityBands: [],
    employees: [],
  };
}

function drillDetail(
  emp: CongeEmployeeView,
  drill: CongeDrillKind,
  bundle: CongeBundle,
  asOf: string,
): string {
  const month = Number(asOf.slice(5, 7)) || 1;
  if (drill.kind === 'alDays') {
    return `${countAlDays(emp.days, bundle.rangeStart, bundle.rangeEnd)} j. AL`;
  }
  if (drill.kind === 'balance') {
    return formatCongeNumber(
      monthEndBalance(emp, bundle.exerciseYear, month, bundle.grades, bundle.seniorityBands),
      1,
    );
  }
  if (drill.kind === 'onLeave' || drill.kind === 'dept') {
    const code = resolveDayCode(asOf, emp.appointmentDate, emp.days);
    return code || '—';
  }
  if (drill.kind === 'code') return drill.code;
  return emp.fromHr ? '' : 'hors fichier HR';
}

export default function CongePage() {
  const { can } = usePermissions();
  const canEdit = can(MENU, 'edit');
  const canImport = can(MENU, 'create') || canEdit;
  const canExport = can(MENU, 'export');

  const [tab, setTab] = useState<PageTab>('dashboard');
  const [bundle, setBundle] = useState<CongeBundle>(emptyBundle);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [asOf, setAsOf] = useState('');
  const [monthKey, setMonthKey] = useState('');
  const [drill, setDrill] = useState<CongeDrillKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/employes/conge');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Chargement impossible');
        return;
      }
      const next = json.bundle as CongeBundle;
      setBundle(next);
      setAsOf((prev) => {
        if (prev && prev >= next.rangeStart && prev <= next.rangeEnd) return prev;
        return clampAsOfIso(next.rangeStart, next.rangeEnd);
      });
      setMonthKey((prev) => {
        const months = monthsInIsoRange(next.rangeStart, next.rangeEnd);
        if (months.some((m) => `${m.year}-${String(m.month).padStart(2, '0')}` === prev)) return prev;
        const asOfDate = clampAsOfIso(next.rangeStart, next.rangeEnd);
        const hit = months.find((m) => asOfDate >= m.start && asOfDate <= m.end);
        const last = months[months.length - 1];
        return hit
          ? `${hit.year}-${String(hit.month).padStart(2, '0')}`
          : last
            ? `${last.year}-${String(last.month).padStart(2, '0')}`
            : '';
      });
    } catch {
      await showError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(
    () => monthsInIsoRange(bundle.rangeStart, bundle.rangeEnd),
    [bundle.rangeStart, bundle.rangeEnd],
  );
  const selectedMonth = months.find((m) => `${m.year}-${String(m.month).padStart(2, '0')}` === monthKey)
    ?? months[0];

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const emp of bundle.employees) {
      const name = emp.departement.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [bundle.employees]);

  const drillRows: DashboardListRow[] = useMemo(() => {
    if (!drill) return [];
    return employeesForCongeDrill(bundle, drill, asOf || bundle.rangeEnd, department).map((emp) => ({
      id: emp.matricule,
      cells: {
        matricule: emp.matricule,
        nom: emp.nom,
        departement: emp.departement || '—',
        grade: emp.grade || '—',
        position: emp.jobTitle || emp.position || '—',
        detail: drillDetail(emp, drill, bundle, asOf || bundle.rangeEnd),
      },
    }));
  }, [bundle, drill, asOf, department]);

  const setDay = async (employee: CongeEmployeeView, iso: string, code: LeaveCode | '') => {
    setSaving(true);
    try {
      const res = await fetch('/api/employes/conge/days', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches: [{ matricule: employee.matricule, iso, code }] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Mise à jour impossible');
        return;
      }
      if (json.bundle) setBundle(json.bundle);
    } catch {
      await showError('Erreur de mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async (grades: CongeGradeRow[], bands: CongeSeniorityBand[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/employes/conge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grades, seniorityBands: bands }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      if (json.bundle) setBundle(json.bundle);
      await showSuccess('Barème enregistré');
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const importFile = async (file: File) => {
    setSaving(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/employes/conge', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Import impossible');
        return;
      }
      if (json.bundle) setBundle(json.bundle);
      await showSuccess(`Import : ${json.imported ?? 0} agent(s)`);
      await load(true);
    } catch {
      await showError('Erreur d’import');
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const exportFile = async () => {
    try {
      const res = await fetch('/api/employes/conge/export');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        await showError(json?.error || 'Export impossible');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Planning_conge_${bundle.exerciseYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      await showError('Erreur d’export');
    }
  };

  if (loading) {
    return (
      <PermissionGate menuId={MENU} action="view">
        <div className="loading">Chargement du planning de congé…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="mvt-page conge-page">
        <div className="page-header page-header-with-tabs mvt-page-header">
          <div>
            <div className="page-header-title-row">
              <h2>Congé</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p className="mvt-page-sub">
              Planning journalier, soldes et barème de grades
              <span className="mvt-count-pill">{bundle.employees.length}</span>
            </p>
          </div>
          <div className="page-header-actions mvt-header-actions">
            <div className="tabs header-tabs header-tabs-compact mvt-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'dashboard'}
                className={`tab-btn tab-btn-sm mvt-tab-btn${tab === 'dashboard' ? ' active' : ''}`}
                onClick={() => setTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'planning'}
                className={`tab-btn tab-btn-sm mvt-tab-btn${tab === 'planning' ? ' active' : ''}`}
                onClick={() => setTab('planning')}
              >
                Planning
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'grades'}
                className={`tab-btn tab-btn-sm mvt-tab-btn${tab === 'grades' ? ' active' : ''}`}
                onClick={() => setTab('grades')}
              >
                Grades
              </button>
            </div>
            {tab === 'planning' && selectedMonth ? (
              <select
                className="filter-select"
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                aria-label="Mois"
              >
                {months.map((m) => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${String(m.month).padStart(2, '0')}`}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : null}
            {canImport ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={saving}
                  onClick={() => fileRef.current?.click()}
                >
                  Importer
                </button>
              </>
            ) : null}
            {canExport ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void exportFile()}>
                Exporter
              </button>
            ) : null}
          </div>
        </div>

        {tab === 'dashboard' && (
          <CongeDashboardView
            bundle={bundle}
            asOf={asOf || clampAsOfIso(bundle.rangeStart, bundle.rangeEnd)}
            department={department}
            departments={departments}
            onAsOfChange={setAsOf}
            onDepartmentChange={setDepartment}
            onOpenDrill={setDrill}
          />
        )}

        {tab === 'planning' && selectedMonth && (
          <CongePlanningView
            bundle={bundle}
            monthStart={selectedMonth.start}
            monthEnd={selectedMonth.end}
            department={department}
            departments={departments}
            search={search}
            canEdit={canEdit}
            saving={saving}
            onDepartmentChange={setDepartment}
            onSearchChange={setSearch}
            onSetDay={(emp, iso, code) => void setDay(emp, iso, code)}
          />
        )}

        {tab === 'grades' && (
          <CongeGradesView
            grades={bundle.grades}
            seniorityBands={bundle.seniorityBands}
            canEdit={canEdit}
            saving={saving}
            onSave={saveRules}
          />
        )}

        {drill ? (
          <DashboardListModal
            title={congeDrillTitle(drill, formatIsoFr(asOf || bundle.rangeEnd))}
            columns={DRILL_COLUMNS}
            rows={drillRows}
            onClose={() => setDrill(null)}
            searchPlaceholder="Rechercher un agent…"
          />
        ) : null}
      </div>
    </PermissionGate>
  );
}
