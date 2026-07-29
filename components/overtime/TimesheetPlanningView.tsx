'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TimesheetPlanningDayModal from '@/components/overtime/TimesheetPlanningDayModal';
import TimesheetPlanningWeekModal from '@/components/overtime/TimesheetPlanningWeekModal';
import { CardSpinner, IconDownload, IconWeekDone } from '@/components/overtime/TimesheetIcons';
import { buildTimesheetCalendarCells } from '@/lib/timesheet-calendar-cells';
import {
  buildTimesheetPeriod,
  listTimesheetMonthOptions,
  type TimesheetPeriod,
} from '@/lib/timesheet-period';
import type { TimesheetAccessContext, TimesheetViewScope } from '@/lib/timesheet-permissions';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Employee } from '@/lib/types';

function formatPeriodRange(period: TimesheetPeriod): string {
  const fmt = (date: Date) =>
    date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(period.start)} → ${fmt(period.end)}`;
}

function matchesDepartment(employeeDepartment: string, selectedDepartment: string): boolean {
  return employeeDepartment.trim().toLowerCase() === selectedDepartment.trim().toLowerCase();
}

const WEEK_LABELS = ['Semaine 1', 'Semaine 2', 'Semaine 3', 'Semaine 4'];

interface Props {
  onDepartmentChange?: (department: string) => void;
  toolbarSlotId?: string;
  access?: {
    loading: boolean;
    scope: TimesheetViewScope | null;
    department: string | null;
    permissions: TimesheetAccessContext['permissions'] | null;
  };
}

export default function TimesheetPlanningView({ onDepartmentChange, toolbarSlotId, access }: Props) {
  const { can } = usePermissions();
  const monthOptions = useMemo(() => listTimesheetMonthOptions(12), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [period, setPeriod] = useState(() =>
    buildTimesheetPeriod(monthOptions[0].year, monthOptions[0].month),
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState('');
  const [plannedWeekIndexes, setPlannedWeekIndexes] = useState<Set<number>>(new Set());
  const [importedOtWeekIndexes, setImportedOtWeekIndexes] = useState<Set<number>>(new Set());
  const [lockedOtWeekIndexes, setLockedOtWeekIndexes] = useState<Set<number>>(new Set());
  const [statusLoading, setStatusLoading] = useState(true);
  const [weekPlanIndex, setWeekPlanIndex] = useState<number | null>(null);
  const [weekPlanReadOnly, setWeekPlanReadOnly] = useState(false);
  const [viewDayKey, setViewDayKey] = useState<string | null>(null);
  const [toolbarReady, setToolbarReady] = useState(false);
  const [planCardMenu, setPlanCardMenu] = useState<{
    weekIndex: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setToolbarReady(true);
  }, []);

  const scope = access?.scope ?? 'department';
  const lockedDepartment = scope === 'department' ? access?.department ?? '' : '';
  const canEdit =
    can(TIMESHEET_MENU.department, 'edit') ||
    can(TIMESHEET_MENU.all, 'edit') ||
    Boolean(access?.permissions?.editManager);

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

  const departmentAgents = useMemo(
    () =>
      employees
        .filter((employee) => employee.nom.trim() && matchesDepartment(employee.departement, department))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [department, employees],
  );

  const loadCalendarStatus = useCallback(async () => {
    if (!department) {
      setPlannedWeekIndexes(new Set());
      setImportedOtWeekIndexes(new Set());
      setLockedOtWeekIndexes(new Set());
      setStatusLoading(false);
      return;
    }
    setStatusLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(period.year),
        month: String(period.month),
        department,
        scope: 'calendar',
      });
      const [planRes, otRes] = await Promise.all([
        fetch(`/api/timesheet/entries?${params}`),
        fetch(
          `/api/timesheet/weekly-ot?year=${period.year}&month=${period.month}&department=${encodeURIComponent(department)}`,
        ),
      ]);
      const planJson = (await planRes.json()) as { planningCompleteWeekIndexes?: number[] };
      const otJson = (await otRes.json()) as {
        importedWeekIndexes?: number[];
        lockedWeekIndexes?: number[];
      };
      setPlannedWeekIndexes(new Set(planJson.planningCompleteWeekIndexes ?? []));
      setImportedOtWeekIndexes(new Set(otJson.importedWeekIndexes ?? []));
      setLockedOtWeekIndexes(new Set(otJson.lockedWeekIndexes ?? []));
    } catch {
      setPlannedWeekIndexes(new Set());
      setImportedOtWeekIndexes(new Set());
      setLockedOtWeekIndexes(new Set());
    } finally {
      setStatusLoading(false);
    }
  }, [department, period.month, period.year]);

  useEffect(() => {
    fetch('/api/timesheet/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(json))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (lockedDepartment) setDepartment(lockedDepartment);
  }, [lockedDepartment]);

  useEffect(() => {
    if (!department && departments.length) setDepartment(departments[0].name);
  }, [department, departments]);

  useEffect(() => {
    if (department) onDepartmentChange?.(department);
  }, [department, onDepartmentChange]);

  useEffect(() => {
    const nextPeriod = buildTimesheetPeriod(selectedMonth.year, selectedMonth.month);
    setPeriod(nextPeriod);
    setWeekPlanIndex(null);
    setWeekPlanReadOnly(false);
    setViewDayKey(null);
  }, [selectedMonth]);

  useEffect(() => {
    loadCalendarStatus();
  }, [loadCalendarStatus]);

  const calendarCells = useMemo(() => buildTimesheetCalendarCells(period.days), [period.days]);
  const weekPlanDays =
    weekPlanIndex === null ? [] : period.days.slice(weekPlanIndex * 7, weekPlanIndex * 7 + 7);
  const viewDay = period.days.find((day) => day.dateKey === viewDayKey) ?? null;

  const openPlanWeek = (weekIndex: number, readOnly: boolean) => {
    if (!readOnly && !canEdit) return;
    setWeekPlanReadOnly(readOnly);
    setWeekPlanIndex(weekIndex);
  };

  const buildPlanCardMenuItems = (weekIndex: number, isPlanned: boolean): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (isPlanned) {
      items.push({
        id: 'view-week',
        label: 'Voir le planning de la semaine',
        icon: 'view',
        onClick: () => openPlanWeek(weekIndex, true),
      });
      if (canEdit) {
        items.push({
          id: 'edit-week',
          label: 'Modifier le planning',
          icon: 'edit',
          onClick: () => openPlanWeek(weekIndex, false),
        });
      }
      return items;
    }
    if (canEdit) {
      items.push({
        id: 'plan-week',
        label: 'Planifier la semaine',
        icon: 'edit',
        onClick: () => openPlanWeek(weekIndex, false),
      });
    }
    return items;
  };

  const handlePlanCardContextMenu = (
    event: React.MouseEvent,
    weekIndex: number,
    isPlanned: boolean,
  ) => {
    event.preventDefault();
    const items = buildPlanCardMenuItems(weekIndex, isPlanned);
    if (!items.length) return;
    setPlanCardMenu({ weekIndex, x: event.clientX, y: event.clientY });
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
        <span className="overtime-inline-hint">{formatPeriodRange(period)}</span>
        <label className="overtime-inline-field">
          <span>Département</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={Boolean(lockedDepartment)}
          >
            {departments.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </select>
        </label>
        <span className="overtime-inline-count">{departmentAgents.length} agent(s)</span>
      </div>
    ) : null;

  const toolbarSlot =
    toolbar && toolbarSlotId && typeof document !== 'undefined'
      ? document.getElementById(toolbarSlotId)
      : null;

  return (
    <>
      {planCardMenu ? (
        <RowContextMenu
          x={planCardMenu.x}
          y={planCardMenu.y}
          items={buildPlanCardMenuItems(
            planCardMenu.weekIndex,
            plannedWeekIndexes.has(planCardMenu.weekIndex),
          )}
          onClose={() => setPlanCardMenu(null)}
        />
      ) : null}
      {toolbar && toolbarSlot ? createPortal(toolbar, toolbarSlot) : null}
      <div className="timesheet-manager timesheet-planning-view">
        <div className="panel timesheet-calendar-panel timesheet-calendar-panel-full">
          <div className="timesheet-calendar-header">
            <h3>Planning mensuel</h3>
            <span>{period.days.length} jours</span>
          </div>

          <div className="timesheet-calendar-grid timesheet-calendar-grid-full timesheet-calendar-grid-with-ot">
            {calendarCells.map((cell) => {
              if (cell.type === 'week-slot') {
                const isPlanned = !statusLoading && plannedWeekIndexes.has(cell.weekIndex);
                const otImported = !statusLoading && importedOtWeekIndexes.has(cell.weekIndex);
                const otLocked = !statusLoading && lockedOtWeekIndexes.has(cell.weekIndex);
                const otPendingConfirm = otImported && !otLocked;
                const menuItems = buildPlanCardMenuItems(cell.weekIndex, isPlanned);
                return (
                  <div
                    key={`plan-${cell.weekIndex}`}
                    role={isPlanned || canEdit ? 'button' : undefined}
                    tabIndex={isPlanned || canEdit ? 0 : undefined}
                    className={[
                      'timesheet-calendar-day',
                      'timesheet-calendar-plan-card',
                      statusLoading ? 'is-loading' : isPlanned ? 'planned' : 'neutral',
                      isPlanned || canEdit ? 'clickable' : '',
                      menuItems.length ? 'has-context-menu' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={
                      canEdit && !isPlanned
                        ? 'Clic ou clic droit pour planifier la semaine'
                        : isPlanned
                          ? canEdit
                            ? 'Clic pour consulter · Clic droit pour modifier'
                            : 'Clic pour consulter le planning'
                          : 'Planning non modifiable'
                    }
                    onClick={
                      isPlanned
                        ? () => openPlanWeek(cell.weekIndex, true)
                        : canEdit
                          ? () => openPlanWeek(cell.weekIndex, false)
                          : undefined
                    }
                    onKeyDown={
                      isPlanned || canEdit
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openPlanWeek(cell.weekIndex, isPlanned || !canEdit);
                            }
                          }
                        : undefined
                    }
                    onContextMenu={(event) => handlePlanCardContextMenu(event, cell.weekIndex, isPlanned)}
                  >
                    {statusLoading ? <CardSpinner /> : null}
                    {otPendingConfirm ? (
                      <span
                        className="timesheet-plan-ot-imported-badge"
                        title="Les OT sont importés — en attente de confirmation"
                      >
                        <IconDownload size={11} />
                      </span>
                    ) : null}
                    <span className="timesheet-calendar-plan-label">
                      {isPlanned ? 'Planifié' : 'Planifier'}
                    </span>
                    <span className="timesheet-calendar-plan-week">
                      {WEEK_LABELS[cell.weekIndex] ?? `S${cell.weekIndex + 1}`}
                    </span>
                  </div>
                );
              }

              const day = cell.day;
              const weekIndex = Math.floor(cell.index / 7);
              const isWeekPlanned = !statusLoading && plannedWeekIndexes.has(weekIndex);

              if (isWeekPlanned) {
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={[
                      'timesheet-calendar-day',
                      'timesheet-calendar-day-planned',
                      day.isWeekend ? 'weekend' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setViewDayKey(day.dateKey)}
                  >
                    <span className="timesheet-calendar-day-num">
                      {day.date.getDate()}
                      <span className="timesheet-calendar-day-month">
                        {day.date.toLocaleDateString('fr-FR', { month: 'short' })}
                      </span>
                    </span>
                    <span className="timesheet-calendar-day-label">{day.dayLabel}</span>
                    <span className="timesheet-ot-done-corner" aria-hidden="true">
                      <IconWeekDone size={18} />
                    </span>
                  </button>
                );
              }

              return (
                <div
                  key={day.dateKey}
                  className={[
                    'timesheet-calendar-day',
                    'timesheet-calendar-day-neutral',
                    day.isWeekend ? 'weekend' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="timesheet-calendar-day-num">
                    {day.date.getDate()}
                    <span className="timesheet-calendar-day-month">
                      {day.date.toLocaleDateString('fr-FR', { month: 'short' })}
                    </span>
                  </span>
                  <span className="timesheet-calendar-day-label">{day.dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {weekPlanIndex !== null && department && weekPlanDays.length > 0 && (
          <TimesheetPlanningWeekModal
            open
            weekIndex={weekPlanIndex}
            weekLabel={WEEK_LABELS[weekPlanIndex] ?? `Semaine ${weekPlanIndex + 1}`}
            weekDays={weekPlanDays}
            department={department}
            agents={departmentAgents}
            periodYear={period.year}
            periodMonth={period.month}
            canEdit={canEdit && !weekPlanReadOnly}
            locked={weekPlanReadOnly || !canEdit}
            onClose={() => {
              setWeekPlanIndex(null);
              setWeekPlanReadOnly(false);
            }}
            onSaved={loadCalendarStatus}
          />
        )}

        {viewDay && department && (
          <TimesheetPlanningDayModal
            open
            day={viewDay}
            department={department}
            agents={departmentAgents}
            periodYear={period.year}
            periodMonth={period.month}
            readOnly
            onClose={() => setViewDayKey(null)}
            onSaved={loadCalendarStatus}
          />
        )}
      </div>
    </>
  );
}
