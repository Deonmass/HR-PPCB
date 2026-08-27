'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TimesheetWeekOvertimeModal from '@/components/overtime/TimesheetWeekOvertimeModal';
import { buildTimesheetCalendarCells } from '@/lib/timesheet-calendar-cells';
import {
  buildTimesheetPeriod,
  listTimesheetMonthOptions,
  type TimesheetPeriod,
} from '@/lib/timesheet-period';
import type { Employee } from '@/lib/types';
import {
  CardSpinner,
  IconDots,
  IconExport,
  IconEye,
  IconImport,
  IconWeekDone,
} from '@/components/overtime/TimesheetIcons';
import type { TimesheetAccessContext, TimesheetViewScope } from '@/lib/timesheet-permissions';
import { matchesDepartment, TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import { usePermissions } from '@/contexts/PermissionContext';
import { confirmAction, showError, showSuccess } from '@/lib/swal';

function formatPeriodRange(period: TimesheetPeriod): string {
  const fmt = (date: Date) =>
    date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(period.start)} → ${fmt(period.end)}`;
}

const WEEK_LABELS = ['Semaine 1', 'Semaine 2', 'Semaine 3', 'Semaine 4'];

interface Props {
  onDepartmentChange?: (department: string) => void;
  toolbarSlotId?: string;
  onWeekStatusChange?: () => void;
  onPeriodChange?: (year: number, month: number) => void;
  refreshKey?: number;
  canExport?: boolean;
  onExport?: () => void;
  canImportOt?: boolean;
  canValidateOt?: boolean;
  canEditValidated?: boolean;
  onImportWeek?: (weekIndex: number) => void;
  access?: {
    loading: boolean;
    scope: TimesheetViewScope | null;
    department: string | null;
    permissions: TimesheetAccessContext['permissions'] | null;
  };
}

export default function TimesheetManagerView({
  onDepartmentChange,
  toolbarSlotId,
  onWeekStatusChange,
  onPeriodChange,
  refreshKey = 0,
  canExport = false,
  onExport,
  canImportOt = false,
  canValidateOt = false,
  canEditValidated = false,
  onImportWeek,
  access,
}: Props) {
  const { can } = usePermissions();
  const monthOptions = useMemo(() => listTimesheetMonthOptions(12), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [period, setPeriod] = useState(() =>
    buildTimesheetPeriod(monthOptions[0].year, monthOptions[0].month),
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState('');
  const [lockedWeekIndexes, setLockedWeekIndexes] = useState<Set<number>>(new Set());
  const [importedWeekIndexes, setImportedWeekIndexes] = useState<Set<number>>(new Set());
  const [plannedWeekIndexes, setPlannedWeekIndexes] = useState<Set<number>>(new Set());
  const [weekStatusLoading, setWeekStatusLoading] = useState(true);
  const [weekOtIndex, setWeekOtIndex] = useState<number | null>(null);
  const [toolbarReady, setToolbarReady] = useState(false);
  const [cardMenu, setCardMenu] = useState<{ weekIndex: number; top: number; left: number } | null>(
    null,
  );
  const cardMenuRef = useRef<HTMLDivElement | null>(null);
  const onPeriodChangeRef = useRef(onPeriodChange);
  const onDepartmentChangeRef = useRef(onDepartmentChange);

  const openCardMenu = (weekIndex: number, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 260;
    setCardMenu({
      weekIndex,
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - menuWidth),
    });
  };

  const openOtCardMenu = (weekIndex: number, clientX: number, clientY: number) => {
    const menuWidth = 260;
    setCardMenu({
      weekIndex,
      top: clientY + 4,
      left: Math.max(8, clientX - menuWidth),
    });
  };

  useEffect(() => {
    if (!cardMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (cardMenuRef.current?.contains(event.target as Node)) return;
      setCardMenu(null);
    };
    const handleClose = () => setCardMenu(null);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [cardMenu]);

  useEffect(() => {
    onPeriodChangeRef.current = onPeriodChange;
  }, [onPeriodChange]);

  useEffect(() => {
    onDepartmentChangeRef.current = onDepartmentChange;
  }, [onDepartmentChange]);

  useEffect(() => {
    setToolbarReady(true);
  }, []);

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

  const loadWeekStatus = useCallback(async () => {
    if (!department) {
      setLockedWeekIndexes(new Set());
      setImportedWeekIndexes(new Set());
      setPlannedWeekIndexes(new Set());
      setWeekStatusLoading(false);
      return;
    }
    setWeekStatusLoading(true);
    try {
      const planParams = new URLSearchParams({
        year: String(period.year),
        month: String(period.month),
        department,
        scope: 'calendar',
      });
      const [otRes, planRes] = await Promise.all([
        fetch(
          `/api/timesheet/weekly-ot?year=${period.year}&month=${period.month}&department=${encodeURIComponent(department)}`,
        ),
        fetch(`/api/timesheet/entries?${planParams}`),
      ]);
      const otJson = (await otRes.json()) as {
        lockedWeekIndexes?: number[];
        importedWeekIndexes?: number[];
      };
      const planJson = (await planRes.json()) as { planningCompleteWeekIndexes?: number[] };
      setLockedWeekIndexes(new Set(otJson.lockedWeekIndexes ?? []));
      setImportedWeekIndexes(new Set(otJson.importedWeekIndexes ?? []));
      setPlannedWeekIndexes(new Set(planJson.planningCompleteWeekIndexes ?? []));
    } catch {
      setLockedWeekIndexes(new Set());
      setImportedWeekIndexes(new Set());
      setPlannedWeekIndexes(new Set());
    } finally {
      setWeekStatusLoading(false);
    }
  }, [department, period.month, period.year]);

  useEffect(() => {
    if (department) onDepartmentChangeRef.current?.(department);
  }, [department]);

  useEffect(() => {
    fetch('/api/timesheet/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(json))
      .catch(() => setEmployees([]));
  }, []);

  const scope = access?.scope ?? 'department';
  const lockedDepartment = scope === 'department' ? access?.department ?? '' : '';
  const canEdit =
    can(TIMESHEET_MENU.department, 'edit') ||
    can(TIMESHEET_MENU.all, 'edit') ||
    Boolean(access?.permissions?.editManager);

  useEffect(() => {
    if (lockedDepartment) setDepartment(lockedDepartment);
  }, [lockedDepartment]);

  useEffect(() => {
    const nextPeriod = buildTimesheetPeriod(selectedMonth.year, selectedMonth.month);
    setPeriod((current) =>
      current.year === nextPeriod.year && current.month === nextPeriod.month ? current : nextPeriod,
    );
    setWeekOtIndex(null);
    onPeriodChangeRef.current?.(nextPeriod.year, nextPeriod.month);
  }, [selectedMonth]);

  useEffect(() => {
    if (!department && departments.length) setDepartment(departments[0].name);
  }, [department, departments]);

  useEffect(() => {
    loadWeekStatus();
  }, [loadWeekStatus, refreshKey]);

  const calendarCells = useMemo(() => buildTimesheetCalendarCells(period.days), [period.days]);

  const handleWeekOtSaved = () => {
    loadWeekStatus();
    onWeekStatusChange?.();
  };

  const confirmWeekOt = async (weekIndex: number) => {
    if (!canEdit || !department) return;
    try {
      const res = await fetch('/api/timesheet/weekly-ot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          year: period.year,
          month: period.month,
          department,
          weekIndex,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Confirmation impossible');
      }
      await showSuccess('Overtimes de la semaine confirmés et verrouillés');
      handleWeekOtSaved();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Confirmation impossible');
    }
  };

  const handleConfirmWeek = async (weekIndex: number) => {
    const confirmed = await confirmAction(
      'Confirmer les overtimes ?',
      'Après confirmation, les heures sup. de la semaine seront verrouillées et ne pourront plus être modifiées.',
      'Confirmer',
    );
    if (!confirmed) return;
    await confirmWeekOt(weekIndex);
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

  const cardMenuPortal =
    cardMenu && typeof document !== 'undefined'
      ? createPortal(
          (() => {
            const weekIndex = cardMenu.weekIndex;
            const isLocked = lockedWeekIndexes.has(weekIndex);
            const isImported = importedWeekIndexes.has(weekIndex);
            return (
              <div
                ref={cardMenuRef}
                className="timesheet-ot-card-menu"
                style={{ top: cardMenu.top, left: cardMenu.left }}
                role="menu"
              >
                {(isLocked || !canEdit) && !canEditValidated ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="timesheet-ot-card-menu-item"
                    onClick={() => {
                      setWeekOtIndex(weekIndex);
                      setCardMenu(null);
                    }}
                  >
                    <IconEye size={15} />
                    Voir
                  </button>
                ) : null}
                {(canEdit && !isLocked) || (isLocked && canEditValidated) ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="timesheet-ot-card-menu-item"
                    onClick={() => {
                      setWeekOtIndex(weekIndex);
                      setCardMenu(null);
                    }}
                  >
                    <IconEye size={15} />
                    {isLocked ? 'Modifier OT (après validation)' : isImported ? 'Modifier les OT' : 'Saisir les OT'}
                  </button>
                ) : null}
                {canValidateOt && !isLocked && isImported ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="timesheet-ot-card-menu-item"
                    onClick={() => {
                      setCardMenu(null);
                      void handleConfirmWeek(weekIndex);
                    }}
                  >
                    <IconWeekDone size={15} />
                    Confirmer / Valider les OT
                  </button>
                ) : null}
                {isLocked ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="timesheet-ot-card-menu-item"
                    disabled
                  >
                    <IconWeekDone size={15} />
                    OT confirmés — verrouillé
                  </button>
                ) : null}
                {canImportOt && (!isLocked || canEditValidated) ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="timesheet-ot-card-menu-item"
                    onClick={() => {
                      onImportWeek?.(weekIndex);
                      setCardMenu(null);
                    }}
                  >
                    <IconImport size={15} />
                    {isImported ? 'Compléter les OT (import)' : 'Importer les OT de cette semaine'}
                  </button>
                ) : null}
              </div>
            );
          })(),
          document.body,
        )
      : null;

  return (
    <>
      {cardMenuPortal}
      {toolbar && toolbarSlot ? createPortal(toolbar, toolbarSlot) : null}
      <div className="timesheet-manager timesheet-overtime-view">
        <div className="panel timesheet-calendar-panel timesheet-calendar-panel-full">
          <div className="timesheet-calendar-header">
            <h3>Calendrier période</h3>
            <span>{period.days.length} jours</span>
          </div>

          <div className="timesheet-calendar-grid timesheet-calendar-grid-full timesheet-calendar-grid-with-ot">
            {calendarCells.map((cell) => {
              if (cell.type === 'week-slot') {
                const isPlanned = !weekStatusLoading && plannedWeekIndexes.has(cell.weekIndex);
                const isLocked = !weekStatusLoading && lockedWeekIndexes.has(cell.weekIndex);
                const isImported = !weekStatusLoading && importedWeekIndexes.has(cell.weekIndex);
                // OT accessibles même sans planning (saisie / import / consultation).
                const canOpen = !weekStatusLoading && (canEdit || isImported || isLocked);
                const pendingConfirm = isImported && !isLocked;
                const canInteract = !weekStatusLoading;

                const openWeekModal = () => {
                  if (canOpen) setWeekOtIndex(cell.weekIndex);
                };

                return (
                  <div
                    key={`ot-${cell.weekIndex}`}
                    role={canOpen ? 'button' : undefined}
                    tabIndex={canOpen ? 0 : undefined}
                    className={[
                      'timesheet-calendar-day',
                      'timesheet-calendar-ot-card',
                      weekStatusLoading
                        ? 'is-loading'
                        : isImported
                          ? 'imported'
                          : 'ready',
                      isLocked ? 'locked' : '',
                      pendingConfirm ? 'pending-confirm' : '',
                      !isPlanned ? 'unplanned' : '',
                      canOpen ? 'clickable' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={canOpen ? openWeekModal : undefined}
                    onContextMenu={
                      canInteract
                        ? (event) => {
                            event.preventDefault();
                            openOtCardMenu(cell.weekIndex, event.clientX, event.clientY);
                          }
                        : (event) => event.preventDefault()
                    }
                    onKeyDown={
                      canOpen
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openWeekModal();
                            }
                          }
                        : undefined
                    }
                    title={
                      weekStatusLoading
                        ? 'Chargement…'
                        : !isImported && canEdit
                          ? 'Clic pour saisir les OT — Clic droit pour importer ou options'
                          : pendingConfirm
                            ? 'À confirmer — Clic droit pour modifier ou confirmer'
                            : isLocked
                              ? 'Mois clôturé ou OT confirmés — consultation'
                              : 'Voir / éditer les overtimes'
                    }
                  >
                    {weekStatusLoading ? <CardSpinner /> : null}
                    {canInteract ? (
                      <button
                        type="button"
                        className="timesheet-calendar-ot-menu-btn"
                        aria-label="Options de la semaine"
                        title="Options (clic droit)"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cardMenu?.weekIndex === cell.weekIndex) {
                            setCardMenu(null);
                          } else {
                            openCardMenu(cell.weekIndex, e.currentTarget);
                          }
                        }}
                      >
                        <IconDots size={16} />
                      </button>
                    ) : null}
                    <span className="timesheet-calendar-ot-label">OVERTIME</span>
                    {isLocked ? (
                      <>
                        <span className="timesheet-calendar-ot-lock">Compilé</span>
                        <span
                          className="timesheet-ot-compiled-badge"
                          title="Semaine clôturée / compilée"
                          aria-hidden="true"
                        >
                          <IconWeekDone size={14} />
                        </span>
                      </>
                    ) : null}
                    {pendingConfirm ? (
                      <span className="timesheet-calendar-ot-pending">À confirmer</span>
                    ) : null}
                    {canInteract && !isImported && !isLocked ? (
                      <span className="timesheet-calendar-ot-pending">À saisir</span>
                    ) : null}
                    {!weekStatusLoading && !isPlanned ? (
                      <span className="timesheet-calendar-ot-hint">Sans planning</span>
                    ) : null}
                  </div>
                );
              }

              const day = cell.day;

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

          {canExport ? (
            <div className="timesheet-calendar-panel-footer">
              <button
                type="button"
                className="btn-header-export btn-with-icon"
                onClick={() => onExport?.()}
              >
                <IconExport size={13} />
                Exporter Excel
              </button>
            </div>
          ) : null}
        </div>

        {weekOtIndex !== null && department && (
          <TimesheetWeekOvertimeModal
            open
            weekIndex={weekOtIndex}
            weekLabel={WEEK_LABELS[weekOtIndex] ?? `Semaine ${weekOtIndex + 1}`}
            department={department}
            agents={departmentAgents}
            periodYear={period.year}
            periodMonth={period.month}
            canEdit={canEdit && !lockedWeekIndexes.has(weekOtIndex)}
            onConfirmWeek={() => confirmWeekOt(weekOtIndex)}
            onClose={() => setWeekOtIndex(null)}
            onSaved={handleWeekOtSaved}
          />
        )}
      </div>
    </>
  );
}
