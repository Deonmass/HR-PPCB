'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BtnSpinner,
  IconExport,
  IconInfo,
  IconLock,
  IconPolicy,
  IconUndo,
  IconUnlock,
} from '@/components/overtime/TimesheetIcons';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { listTimesheetMonthOptions } from '@/lib/timesheet-period';
import {
  sumCompilationRow,
  type CompilationData,
  type CompilationRow,
} from '@/lib/timesheet-compilation';
import {
  applyCompilationPolicy,
  policyChangeKey,
  POLICY_RULES,
  type PolicyChange,
} from '@/lib/timesheet-compilation-policy';
import TimesheetEmployeeMonthModal from '@/components/overtime/TimesheetEmployeeMonthModal';
import TimesheetCompilationSimulationModal from '@/components/overtime/TimesheetCompilationSimulationModal';
import { usePermissions } from '@/contexts/PermissionContext';
import { downloadTimesheetWorkbook } from '@/lib/timesheet-export';
import type { TimesheetAccessContext, TimesheetViewScope } from '@/lib/timesheet-permissions';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

const ALL_DEPARTMENTS = '__ALL__';

type ColFilterKey = 'matricule' | 'nom' | 'departement' | 'localisation' | 'grade';

const EMPTY_COL_FILTERS: Record<ColFilterKey, string[]> = {
  matricule: [],
  nom: [],
  departement: [],
  localisation: [],
  grade: [],
};

const OT_SUBCOLS: { key: 'ot13' | 'ot16' | 'ot2' | 'night'; label: string }[] = [
  { key: 'ot13', label: '1.3' },
  { key: 'ot16', label: '1.6' },
  { key: 'ot2', label: '2' },
  { key: 'night', label: 'N' },
];

const TG_POS = ['tg1', 'tg2', 'tg3', 'tg4', 'tg5'] as const;

interface Props {
  toolbarSlotId?: string;
  initialDepartment?: string;
  initialPeriod?: { year: number; month: number };
  refreshKey?: number;
  canExport?: boolean;
  canClose?: boolean;
  canApplyPolicy?: boolean;
  canSimulate?: boolean;
  access?: {
    loading: boolean;
    scope: TimesheetViewScope | null;
    department: string | null;
    permissions: TimesheetAccessContext['permissions'] | null;
  };
}

function matchesDepartment(employeeDepartment: string, selectedDepartment: string): boolean {
  return employeeDepartment.trim().toLowerCase() === selectedDepartment.trim().toLowerCase();
}

function fmtHours(value: number): string {
  if (!value) return '';
  return (Math.round(value * 100) / 100).toFixed(2);
}

interface HoverPop {
  key: string;
  changes: PolicyChange[];
  x: number;
  y: number;
}

export default function TimesheetCompilationView({
  toolbarSlotId,
  initialDepartment,
  initialPeriod,
  refreshKey = 0,
  canExport = false,
  canClose = false,
  canApplyPolicy = false,
  canSimulate = false,
  access,
}: Props) {
  const { can } = usePermissions();
  const monthOptions = useMemo(() => listTimesheetMonthOptions(12), []);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (initialPeriod) {
      const found = monthOptions.find(
        (o) => o.year === initialPeriod.year && o.month === initialPeriod.month,
      );
      if (found) return found;
    }
    return monthOptions[0];
  });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState(
    initialDepartment?.trim() ? initialDepartment : ALL_DEPARTMENTS,
  );
  const [data, setData] = useState<CompilationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [toolbarReady, setToolbarReady] = useState(false);

  // Policy state
  const [policyApplied, setPolicyApplied] = useState(false);
  const [subTab, setSubTab] = useState<'sans' | 'avec'>('sans');
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  const [infoOpen, setInfoOpen] = useState(false);
  const [monthModal, setMonthModal] = useState<{
    matricule: string;
    nom: string;
    departement: string;
    localisation: string;
  } | null>(null);
  const [hoverPop, setHoverPop] = useState<HoverPop | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [colFilters, setColFilters] = useState<Record<ColFilterKey, string[]>>(EMPTY_COL_FILTERS);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToolbarReady(true);
  }, []);

  const scope = access?.scope ?? 'department';
  const lockedDepartment = scope === 'department' ? access?.department ?? '' : '';

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const employee of employees) {
      const name = employee.departement?.trim();
      if (!name || !employee.nom.trim()) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([name, count]) => ({ name, count }));
  }, [employees]);

  useEffect(() => {
    fetch('/api/timesheet/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(json))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (lockedDepartment) {
      setDepartment(lockedDepartment);
      return;
    }
    if (!department) {
      setDepartment(scope === 'all' ? ALL_DEPARTMENTS : departments[0]?.name ?? '');
    }
  }, [lockedDepartment, department, departments, scope]);

  useEffect(() => {
    if (!department) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      year: String(selectedMonth.year),
      month: String(selectedMonth.month),
      department,
    });
    fetch(`/api/timesheet/compilation?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: CompilationData | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [department, selectedMonth, reloadTick, refreshKey]);

  const isAll = department === ALL_DEPARTMENTS;
  const closed = data?.closed ?? false;
  const canEditTimesheet =
    (can(TIMESHEET_MENU.department, 'edit') ||
      can(TIMESHEET_MENU.all, 'edit') ||
      Boolean(access?.permissions?.editManager)) &&
    !closed;

  // A closed month is, by definition, already policy-applied.
  useEffect(() => {
    if (closed) {
      setPolicyApplied(true);
      setSubTab('avec');
    } else {
      setPolicyApplied(false);
      setSubTab('sans');
    }
    setReverted(new Set());
    setColFilters(EMPTY_COL_FILTERS);
  }, [closed, department, selectedMonth]);

  const rawRows = useMemo<CompilationRow[]>(() => data?.rows ?? [], [data]);
  const policy = useMemo(() => applyCompilationPolicy(rawRows), [rawRows]);

  const weekChangeMap = useMemo(() => {
    const map = new Map<string, PolicyChange[]>();
    for (const change of policy.changes) {
      const key = policyChangeKey(change.matricule, change.weekPos);
      const arr = map.get(key) ?? [];
      arr.push(change);
      map.set(key, arr);
    }
    return map;
  }, [policy]);

  const usePolicyView = policyApplied && subTab === 'avec';

  const baseRows = useMemo<CompilationRow[]>(() => {
    if (!usePolicyView) return rawRows;
    return policy.rows.map((prow, index) => {
      const raw = rawRows[index];
      const weeks = prow.weeks.map((week, weekPos) => {
        const key = policyChangeKey(prow.matricule, weekPos);
        if (weekChangeMap.has(key) && reverted.has(key)) return raw.weeks[weekPos];
        return week;
      });
      return { ...prow, weeks };
    });
  }, [usePolicyView, rawRows, policy, weekChangeMap, reverted]);

  const searchedRows = useMemo<CompilationRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseRows;
    return baseRows.filter((row) => {
      const haystack = `${row.matricule} ${row.nom} ${row.departement} ${row.localisation} ${row.grade}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [baseRows, searchQuery]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(searchedRows, {
        matricule: (row) => row.matricule,
        nom: (row) => row.nom,
        departement: (row) => row.departement,
        localisation: (row) => row.localisation,
        grade: (row) => row.grade,
      }),
    [searchedRows],
  );

  const displayRows = useMemo<CompilationRow[]>(
    () =>
      searchedRows.filter(
        (row) =>
          matchesColumnFilter(colFilters.matricule, row.matricule) &&
          matchesColumnFilter(colFilters.nom, row.nom) &&
          matchesColumnFilter(colFilters.departement, row.departement) &&
          matchesColumnFilter(colFilters.localisation, row.localisation) &&
          matchesColumnFilter(colFilters.grade, row.grade),
      ),
    [searchedRows, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const setColFilter = (key: ColFilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const weeks = data?.weeks ?? [];

  const agentCount = displayRows.length;

  const grandTotals = useMemo(() => {
    const acc = { ot13: 0, ot16: 0, ot2: 0, night: 0 };
    for (const row of displayRows) {
      const t = sumCompilationRow(row);
      acc.ot13 += t.ot13;
      acc.ot16 += t.ot16;
      acc.ot2 += t.ot2;
      acc.night += t.night;
    }
    return acc;
  }, [displayRows]);

  const nightNormalTotal = useMemo(
    () => displayRows.reduce((sum, row) => sum + row.nightNormal, 0),
    [displayRows],
  );

  const handleApplyPolicy = () => {
    setPolicyApplied(true);
    setSubTab('avec');
    setReverted(new Set());
  };

  const handleUndo = useCallback((key: string) => {
    setReverted((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setHoverPop(null);
  }, []);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setHoverPop(null), 160);
  };

  const openHoverPop = (event: React.MouseEvent, key: string, changes: PolicyChange[]) => {
    clearHideTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverPop({ key, changes, x: rect.left, y: rect.bottom + 4 });
  };

  const handleToggleClose = async () => {
    if (!department || closing || !data) return;
    setClosing(true);
    try {
      const response = await fetch('/api/timesheet/compilation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: closed ? 'reopen' : 'close',
          year: selectedMonth.year,
          month: selectedMonth.month,
          department,
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? 'Opération impossible');
      }
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Opération impossible');
    } finally {
      setClosing(false);
    }
  };

  const handleExport = async () => {
    if (!department || exporting || !data) return;
    setExporting(true);
    try {
      let buffer: ArrayBuffer;
      if (usePolicyView) {
        const policyChanges = policy.changes.filter(
          (change) => !reverted.has(policyChangeKey(change.matricule, change.weekPos)),
        );
        const response = await fetch('/api/timesheet/compilation/simulation-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: { ...data, rows: data.rows },
            policyRows: baseRows,
            policyChanges,
          }),
        });
        if (!response.ok) throw new Error('Export impossible');
        buffer = await response.arrayBuffer();
      } else {
        const params = new URLSearchParams({
          year: String(selectedMonth.year),
          month: String(selectedMonth.month),
          department,
        });
        const response = await fetch(`/api/timesheet/compilation/export?${params}`);
        if (!response.ok) throw new Error('Export impossible');
        buffer = await response.arrayBuffer();
      }
      const safeDept = (isAll ? 'tous' : department).replace(/[^a-z0-9]+/gi, '-');
      downloadTimesheetWorkbook(
        buffer,
        `Compilation-OT-${safeDept}-${selectedMonth.year}-${selectedMonth.month}.xlsx`,
      );
    } catch {
      // silent: server enforces access; UI simply stops the spinner
    } finally {
      setExporting(false);
    }
  };

  const toolbar =
    toolbarSlotId && toolbarReady ? (
      <div className="overtime-inline-filters">
        <label className="overtime-inline-field">
          <span>Période</span>
          <select
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={(e) => {
              const [year, month] = e.target.value.split('-').map(Number);
              const option = monthOptions.find((item) => item.year === year && item.month === month);
              if (option) setSelectedMonth(option);
            }}
          >
            {monthOptions.map((option) => (
              <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="overtime-inline-field">
          <span>Département</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={Boolean(lockedDepartment)}
          >
            {!lockedDepartment ? <option value={ALL_DEPARTMENTS}>Tous les Départements</option> : null}
            {departments.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </select>
        </label>
        <label className="overtime-inline-field overtime-inline-field-search">
          <span>Recherche</span>
          <input
            type="search"
            className="search-input"
            placeholder="Matricule, nom…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
        <span className="overtime-inline-count">{agentCount} agent(s)</span>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setColFilters(EMPTY_COL_FILTERS)}
          >
            Effacer les filtres ({activeFilterCount})
          </button>
        ) : null}
      </div>
    ) : null;

  const toolbarSlot =
    toolbar && toolbarSlotId && typeof document !== 'undefined'
      ? document.getElementById(toolbarSlotId)
      : null;

  const hasData = Boolean(data && data.rows.length && weeks.length);

  return (
    <>
      {toolbar && toolbarSlot ? createPortal(toolbar, toolbarSlot) : null}
      <div className="timesheet-manager timesheet-compilation-view">
        <div className="panel timesheet-calendar-panel timesheet-calendar-panel-full">
          <div className="timesheet-calendar-header compilation-header">
            {policyApplied ? (
              <div className="compilation-subtabs">
                <button
                  type="button"
                  className={`compilation-subtab${subTab === 'sans' ? ' active' : ''}`}
                  onClick={() => setSubTab('sans')}
                >
                  Compilation sans politique
                </button>
                <button
                  type="button"
                  className={`compilation-subtab${subTab === 'avec' ? ' active' : ''}`}
                  onClick={() => setSubTab('avec')}
                >
                  Compilation avec politique
                  {subTab === 'avec' ? (
                    <span
                      className="compilation-info-btn"
                      role="button"
                      tabIndex={0}
                      title="Règles de la politique appliquée"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setInfoOpen(true);
                        }
                      }}
                    >
                      <IconInfo size={14} />
                    </span>
                  ) : null}
                </button>
              </div>
            ) : (
              <h3>
                Compilation des heures supplémentaires
                {closed ? <span className="compilation-closed-badge">Mois clôturé</span> : null}
              </h3>
            )}
            <span>{data ? `${agentCount} agent(s)` : ''}</span>
          </div>

          {loading ? (
            <p className="overtime-compilation-placeholder">
              <span className="compilation-inline-spinner" aria-hidden="true" />
              Compilation en cours…
            </p>
          ) : !hasData ? (
            <p className="overtime-compilation-placeholder">
              Aucune donnée à compiler pour cette période. Importez les overtimes dans l'onglet
              Overtime.
            </p>
          ) : (
            <div className="compilation-table-wrap">
              <table className="compilation-table">
                <thead>
                  <tr>
                    <th rowSpan={3} className="th-filter compilation-freeze compilation-freeze-mat">
                      <TableHeaderFilter
                        label="Matricule"
                        values={filterValues.matricule}
                        selected={colFilters.matricule}
                        onChange={setColFilter('matricule')}
                      />
                    </th>
                    <th rowSpan={3} className="th-filter compilation-freeze compilation-freeze-name">
                      <TableHeaderFilter
                        label="Employee Name"
                        values={filterValues.nom}
                        selected={colFilters.nom}
                        onChange={setColFilter('nom')}
                      />
                    </th>
                    <th rowSpan={3} className="th-filter compilation-left">
                      <TableHeaderFilter
                        label="Departement"
                        values={filterValues.departement}
                        selected={colFilters.departement}
                        onChange={setColFilter('departement')}
                      />
                    </th>
                    <th rowSpan={3} className="th-filter compilation-left">
                      <TableHeaderFilter
                        label="Localisation"
                        values={filterValues.localisation}
                        selected={colFilters.localisation}
                        onChange={setColFilter('localisation')}
                      />
                    </th>
                    <th rowSpan={3} className="th-filter">
                      <TableHeaderFilter
                        label="Grade"
                        values={filterValues.grade}
                        selected={colFilters.grade}
                        onChange={setColFilter('grade')}
                      />
                    </th>
                    {weeks.map((week) => (
                      <th key={`w-${week.index}`} colSpan={4} className="compilation-group">
                        {week.label}
                      </th>
                    ))}
                    <th rowSpan={2} className="compilation-group">
                      Timesheet
                    </th>
                    <th
                      colSpan={5}
                      rowSpan={2}
                      className="compilation-group compilation-group-total compilation-freeze-right-head"
                    >
                      Total Général
                    </th>
                  </tr>
                  <tr>
                    {weeks.map((week) => (
                      <th key={`r-${week.index}`} colSpan={4} className="compilation-range">
                        {week.range}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {weeks.map((week) =>
                      OT_SUBCOLS.map((col) => (
                        <th key={`h-${week.index}-${col.key}`} className="compilation-num-col">
                          {col.label}
                        </th>
                      )),
                    )}
                    <th className="compilation-num-col compilation-night-col">N</th>
                    {['1.3', '1.6', '2', 'N', 'Total'].map((label, i) => (
                      <th
                        key={`ht-${TG_POS[i]}`}
                        className={`compilation-num-col compilation-total-col compilation-tg ${TG_POS[i]}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    const totals = sumCompilationRow(row);
                    const totalNight = totals.night + row.nightNormal;
                    const grandTotal = totals.ot13 + totals.ot16 + totals.ot2 + totalNight;
                    const tgValues = [totals.ot13, totals.ot16, totals.ot2, totalNight, grandTotal];
                    return (
                      <tr key={row.matricule}>
                        <td className="compilation-freeze compilation-freeze-mat">{row.matricule}</td>
                        <td className="compilation-freeze compilation-freeze-name">{row.nom}</td>
                        <td className="compilation-left">{row.departement}</td>
                        <td className="compilation-left">{row.localisation}</td>
                        <td>{row.grade}</td>
                        {row.weeks.map((week, weekPos) => {
                          const wkey = policyChangeKey(row.matricule, weekPos);
                          const changes = weekChangeMap.get(wkey);
                          const modified = usePolicyView && Boolean(changes) && !reverted.has(wkey);
                          return OT_SUBCOLS.map((col) => {
                            const isModCell =
                              modified && (col.key === 'ot13' || col.key === 'ot16');
                            return (
                              <td
                                key={`c-${row.matricule}-${weekPos}-${col.key}`}
                                className={`compilation-num-col${isModCell ? ' compilation-modified' : ''}`}
                                onMouseEnter={
                                  isModCell && changes
                                    ? (e) => openHoverPop(e, wkey, changes)
                                    : undefined
                                }
                                onMouseLeave={isModCell ? scheduleHide : undefined}
                              >
                                {fmtHours(week[col.key])}
                              </td>
                            );
                          });
                        })}
                        <td
                          className="compilation-num-col compilation-night-col compilation-timesheet-cell"
                          role="button"
                          tabIndex={0}
                          title="Voir le timesheet mensuel de l'employé"
                          onClick={() =>
                            setMonthModal({
                              matricule: row.matricule,
                              nom: row.nom,
                              departement: row.departement,
                              localisation: row.localisation,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setMonthModal({
                                matricule: row.matricule,
                                nom: row.nom,
                                departement: row.departement,
                                localisation: row.localisation,
                              });
                            }
                          }}
                        >
                          {fmtHours(row.nightNormal)}
                        </td>
                        {tgValues.map((value, i) => (
                          <td
                            key={`ct-${row.matricule}-${TG_POS[i]}`}
                            className={`compilation-num-col compilation-total-col compilation-tg ${TG_POS[i]}`}
                          >
                            {fmtHours(value)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="compilation-total-row">
                    <td className="compilation-freeze compilation-freeze-mat">Total général</td>
                    <td className="compilation-freeze compilation-freeze-name" />
                    <td className="compilation-left" />
                    <td className="compilation-left" />
                    <td />
                    {weeks.map((week, weekPos) =>
                      OT_SUBCOLS.map((col) => {
                        const total = displayRows.reduce(
                          (sum, row) => sum + (row.weeks[weekPos]?.[col.key] ?? 0),
                          0,
                        );
                        return (
                          <td key={`ft-${week.index}-${col.key}`} className="compilation-num-col">
                            {fmtHours(total)}
                          </td>
                        );
                      }),
                    )}
                    <td className="compilation-num-col compilation-night-col">
                      {fmtHours(nightNormalTotal)}
                    </td>
                    {[
                      grandTotals.ot13,
                      grandTotals.ot16,
                      grandTotals.ot2,
                      grandTotals.night + nightNormalTotal,
                      grandTotals.ot13 + grandTotals.ot16 + grandTotals.ot2 + grandTotals.night + nightNormalTotal,
                    ].map((value, i) => (
                      <td
                        key={`ftg-${TG_POS[i]}`}
                        className={`compilation-num-col compilation-total-col compilation-tg ${TG_POS[i]}`}
                      >
                        {fmtHours(value)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {hasData && (canApplyPolicy || canExport || canSimulate || (canClose && usePolicyView)) ? (
            <div className="timesheet-calendar-panel-footer compilation-footer">
              <div className="compilation-footer-left">
                {canApplyPolicy && !policyApplied ? (
                  <>
                    <button type="button" className="btn-apply-policy btn-with-icon" onClick={handleApplyPolicy}>
                      <IconPolicy size={14} />
                      Appliquer la politique
                    </button>
                    <button
                      type="button"
                      className="compilation-info-btn compilation-info-btn-standalone"
                      title="Règles de la politique appliquée"
                      onClick={() => setInfoOpen(true)}
                    >
                      <IconInfo size={16} />
                    </button>
                  </>
                ) : null}
                {canClose && usePolicyView ? (
                  <button
                    type="button"
                    className={`btn-with-icon ${closed ? 'btn-reopen-month' : 'btn-close-month'}`}
                    onClick={handleToggleClose}
                    disabled={closing}
                  >
                    {closing ? <BtnSpinner /> : closed ? <IconUnlock size={14} /> : <IconLock size={14} />}
                    {closed ? 'Rouvrir le mois' : 'Clôturer le mois'}
                  </button>
                ) : null}
              </div>
              <div className="compilation-footer-right">
                {canSimulate ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-with-icon"
                    onClick={() => setSimulationOpen(true)}
                    title="Simuler la politique sur un fichier Excel exporté"
                  >
                    <IconPolicy size={13} />
                    Simulation
                  </button>
                ) : null}
                {canExport ? (
                  <button
                    type="button"
                    className="btn-header-export btn-with-icon"
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? <BtnSpinner /> : <IconExport size={13} />}
                    Exporter Excel
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <TimesheetCompilationSimulationModal
        open={simulationOpen}
        onClose={() => setSimulationOpen(false)}
        canApplyPolicy={canApplyPolicy}
        canExport={canExport}
      />

      {hoverPop
        ? createPortal(
            <div
              className="compilation-cell-pop"
              style={{ left: hoverPop.x, top: hoverPop.y }}
              onMouseEnter={clearHideTimer}
              onMouseLeave={scheduleHide}
            >
              <div className="compilation-cell-pop-title">Modification politique</div>
              <ul className="compilation-cell-pop-list">
                {hoverPop.changes.map((change, idx) => (
                  <li key={`${change.field}-${change.from}-${change.to}-${idx}`}>
                    <strong>{change.field === 'ot13' ? '1.3' : change.field === 'ot16' ? '1.6' : change.field}</strong>
                    {' : '}
                    {fmtHours(change.from) || '0'} → {fmtHours(change.to) || '0'}
                  </li>
                ))}
              </ul>
              <p className="compilation-cell-pop-reason">{hoverPop.changes[0]?.reason}</p>
              {!closed ? (
                <button
                  type="button"
                  className="compilation-cell-pop-undo btn-with-icon"
                  onClick={() => handleUndo(hoverPop.key)}
                >
                  <IconUndo size={12} />
                  Annuler
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {monthModal ? (
        <TimesheetEmployeeMonthModal
          open
          matricule={monthModal.matricule}
          nom={monthModal.nom}
          department={monthModal.departement}
          localisation={monthModal.localisation}
          year={selectedMonth.year}
          month={selectedMonth.month}
          monthLabel={selectedMonth.label}
          canEdit={canEditTimesheet}
          onClose={() => setMonthModal(null)}
        />
      ) : null}

      {infoOpen
        ? createPortal(
            <div className="modal-overlay" onClick={() => setInfoOpen(false)}>
              <div
                className="modal modal-form compilation-policy-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h3>Politique de la convention collective</h3>
                    <p className="timesheet-manager-modal-subtitle">
                      Règles appliquées lors de la transformation des données
                    </p>
                  </div>
                  <button type="button" className="modal-close" onClick={() => setInfoOpen(false)}>
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  <ol className="compilation-policy-rules">
                    {POLICY_RULES.map((rule) => (
                      <li key={rule.id}>
                        <strong>{rule.title}</strong>
                        <p>{rule.description}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setInfoOpen(false)}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
