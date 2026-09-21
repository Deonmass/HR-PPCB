'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TimesheetShiftSelect from '@/components/overtime/TimesheetShiftSelect';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import type { TimesheetPeriodDay } from '@/lib/timesheet-period';
import type { TimesheetDayEntry, TimesheetShiftType } from '@/lib/timesheet-types';
import { isTimesheetLeaveOrAbsentShift, TIMESHEET_SHIFT_OPTIONS } from '@/lib/timesheet-types';
import { continueShifterCycleFrom } from '@/lib/timesheet-bulk-shifts';
import { showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

interface AgentWeekRow {
  matricule: string;
  nom: string;
  shifts: Record<string, TimesheetShiftType | null>;
}

interface ColumnMenuState {
  dateKey: string;
  top: number;
  left: number;
}

interface Props {
  open: boolean;
  weekIndex: number;
  weekLabel: string;
  weekDays: TimesheetPeriodDay[];
  department: string;
  scopeLabel?: string;
  agents: Employee[];
  periodYear: number;
  periodMonth: number;
  canEdit?: boolean;
  locked?: boolean;
  canClear?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onClear?: () => void;
}

const COLUMN_MENU_WIDTH = 200;

function buildRows(
  agents: Employee[],
  weekDays: TimesheetPeriodDay[],
  saved: Record<string, Record<string, TimesheetDayEntry>>,
): AgentWeekRow[] {
  return agents.map((employee) => {
    const shifts: Record<string, TimesheetShiftType | null> = {};
    for (const day of weekDays) {
      shifts[day.dateKey] = saved[day.dateKey]?.[employee.matricule]?.shiftType ?? null;
    }
    return { matricule: employee.matricule, nom: employee.nom, shifts };
  });
}

/** Jours hors période qui ont déjà un shift enregistré → réactivés au chargement. */
function detectActivatedFromRows(weekDays: TimesheetPeriodDay[], rows: AgentWeekRow[]): Set<string> {
  const activated = new Set<string>();
  for (const day of weekDays) {
    if (!day.isInactive) continue;
    if (rows.some((row) => Boolean(row.shifts[day.dateKey]))) {
      activated.add(day.dateKey);
    }
  }
  return activated;
}

function IconMoreVertical({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function computeColumnMenuPosition(button: HTMLButtonElement): Pick<ColumnMenuState, 'top' | 'left'> {
  const rect = button.getBoundingClientRect();
  let left = rect.right - COLUMN_MENU_WIDTH;
  let top = rect.bottom + 4;

  if (left < 8) left = 8;
  if (left + COLUMN_MENU_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - COLUMN_MENU_WIDTH - 8;
  }
  if (top + 220 > window.innerHeight - 8) {
    top = rect.top - 4 - 220;
  }

  return { top, left };
}

export default function TimesheetPlanningWeekModal({
  open,
  weekIndex,
  weekLabel,
  weekDays,
  department,
  scopeLabel,
  agents,
  periodYear,
  periodMonth,
  canEdit = false,
  locked = false,
  canClear = false,
  onClose,
  onSaved,
  onClear,
}: Props) {
  const [rows, setRows] = useState<AgentWeekRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activatedDateKeys, setActivatedDateKeys] = useState<Set<string>>(() => new Set());
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const columnMenuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const agentsRef = useRef(agents);
  const weekDaysRef = useRef(weekDays);
  agentsRef.current = agents;
  weekDaysRef.current = weekDays;

  const weekLoadKey = [
    open ? '1' : '0',
    department,
    String(periodYear),
    String(periodMonth),
    String(weekIndex),
    agents.map((agent) => agent.matricule).join(','),
    weekDays.map((day) => `${day.dateKey}:${day.isInactive ? '0' : '1'}`).join(','),
  ].join('|');

  const isDayEditable = (day: TimesheetPeriodDay) =>
    !day.isInactive || activatedDateKeys.has(day.dateKey);

  useEffect(() => {
    if (!open || !department) return;

    let cancelled = false;
    setLoading(true);
    setActivatedDateKeys(new Set());

    const params = new URLSearchParams({
      year: String(periodYear),
      month: String(periodMonth),
      department,
      weekIndex: String(weekIndex),
      scope: 'planning-week',
    });

    fetch(`/api/timesheet/entries?${params}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          entries?: Record<string, Record<string, TimesheetDayEntry>>;
        };
        if (cancelled) return;
        const nextRows = buildRows(agentsRef.current, weekDaysRef.current, json.entries ?? {});
        setRows(nextRows);
        setActivatedDateKeys(detectActivatedFromRows(weekDaysRef.current, nextRows));
      })
      .catch(() => {
        if (cancelled) return;
        setRows(buildRows(agentsRef.current, weekDaysRef.current, {}));
        setActivatedDateKeys(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weekLoadKey, open, department, periodYear, periodMonth, weekIndex]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setColumnMenu(null);
      setActivatedDateKeys(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!columnMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      const activeButton = columnMenuButtonRefs.current.get(columnMenu.dateKey);
      if (activeButton?.contains(target)) return;
      setColumnMenu(null);
    };

    const handleReposition = () => {
      const activeButton = columnMenuButtonRefs.current.get(columnMenu.dateKey);
      if (!activeButton) return;
      setColumnMenu((current) =>
        current ? { ...current, ...computeColumnMenuPosition(activeButton) } : current,
      );
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [columnMenu]);

  const activeDays = useMemo(
    () => weekDays.filter((day) => !day.isInactive || activatedDateKeys.has(day.dateKey)),
    [weekDays, activatedDateKeys],
  );

  const plannedCells = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const row of rows) {
      for (const day of activeDays) {
        total += 1;
        if (row.shifts[day.dateKey]) filled += 1;
      }
    }
    return { total, filled, percent: total ? Math.round((filled / total) * 100) : 0 };
  }, [rows, activeDays]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (row) =>
        row.nom.toLowerCase().includes(query) || row.matricule.toLowerCase().includes(query),
    );
  }, [rows, searchQuery]);

  const updateShift = (matricule: string, dateKey: string, shiftType: TimesheetShiftType | null) => {
    if (!canEdit || locked) return;
    const dayMeta = weekDays.find((day) => day.dateKey === dateKey);
    if (!dayMeta || !isDayEditable(dayMeta)) return;
    setRows((prev) =>
      prev.map((row) => {
        if (row.matricule !== matricule) return row;

        const shifts = { ...row.shifts, [dateKey]: shiftType };
        if (!shiftType || isTimesheetLeaveOrAbsentShift(shiftType)) {
          return { ...row, shifts };
        }

        const dayIndex = weekDays.findIndex((day) => day.dateKey === dateKey);
        if (dayIndex < 0) return { ...row, shifts };

        if (shiftType === 'general') {
          weekDays.slice(dayIndex + 1).forEach((day) => {
            if (!isDayEditable(day)) return;
            shifts[day.dateKey] = day.isWeekend ? 'off' : 'general';
          });
          return { ...row, shifts };
        }

        const previousDay = dayIndex > 0 ? weekDays[dayIndex - 1] : undefined;
        const previousShift = previousDay ? row.shifts[previousDay.dateKey] ?? null : null;
        const following = continueShifterCycleFrom(
          shiftType,
          previousShift,
          weekDays.length - dayIndex - 1,
        );
        if (!following) return { ...row, shifts };

        following.forEach((nextShift, offset) => {
          const day = weekDays[dayIndex + 1 + offset];
          if (!day || !isDayEditable(day)) return;
          shifts[day.dateKey] = nextShift;
        });
        return { ...row, shifts };
      }),
    );
  };

  const fillColumn = (dateKey: string, shiftType: TimesheetShiftType) => {
    if (!canEdit || locked) return;
    const dayMeta = weekDays.find((day) => day.dateKey === dateKey);
    if (!dayMeta || !isDayEditable(dayMeta)) return;
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        shifts: { ...row.shifts, [dateKey]: shiftType },
      })),
    );
    setColumnMenu(null);
  };

  const activateDay = (dateKey: string) => {
    if (!canEdit || locked) return;
    setActivatedDateKeys((prev) => {
      if (prev.has(dateKey)) return prev;
      const next = new Set(prev);
      next.add(dateKey);
      return next;
    });
    setColumnMenu(null);
  };

  const deactivateDay = (dateKey: string) => {
    if (!canEdit || locked) return;
    setActivatedDateKeys((prev) => {
      if (!prev.has(dateKey)) return prev;
      const next = new Set(prev);
      next.delete(dateKey);
      return next;
    });
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        shifts: { ...row.shifts, [dateKey]: null },
      })),
    );
    setColumnMenu(null);
  };

  const fillGeneralWeek = () => {
    if (!canEdit || locked) return;
    setRows((prev) =>
      prev.map((row) => {
        const shifts = { ...row.shifts };
        for (const day of weekDays) {
          if (!isDayEditable(day)) continue;
          shifts[day.dateKey] = day.isWeekend ? 'off' : 'general';
        }
        return { ...row, shifts };
      }),
    );
    setColumnMenu(null);
  };

  const toggleColumnMenu = (dateKey: string) => {
    const button = columnMenuButtonRefs.current.get(dateKey);
    if (!button) return;

    setColumnMenu((current) => {
      if (current?.dateKey === dateKey) return null;
      return { dateKey, ...computeColumnMenuPosition(button) };
    });
  };

  const handleSave = async () => {
    if (!canEdit || locked) return;

    setSaving(true);
    try {
      const inactiveWeekKeys = weekDays.filter((day) => day.isInactive).map((day) => day.dateKey);
      // Autoriser l’API à écrire aussi les clears (null) sur les jours hors période non réactivés.
      const apiActivatedKeys = Array.from(new Set([...activatedDateKeys, ...inactiveWeekKeys]));
      const editableKeySet = new Set(
        weekDays.filter((day) => isDayEditable(day)).map((day) => day.dateKey),
      );

      const res = await fetch('/api/timesheet/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'planning-week',
          year: periodYear,
          month: periodMonth,
          department,
          weekIndex,
          activatedDateKeys: apiActivatedKeys,
          grid: rows.map((row) => ({
            matricule: row.matricule,
            shifts: weekDays.map((day) => ({
              dateKey: day.dateKey,
              shiftType: editableKeySet.has(day.dateKey) ? row.shifts[day.dateKey] ?? null : null,
            })),
          })),
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Enregistrement impossible');
      }
      await showSuccess(`Planning enregistré pour ${weekLabel}`);
      onSaved();
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const menuDay = columnMenu
    ? weekDays.find((day) => day.dateKey === columnMenu.dateKey)
    : undefined;
  const menuDayEditable = menuDay ? isDayEditable(menuDay) : false;
  const menuDayWasInactive = Boolean(menuDay?.isInactive);

  const columnMenuPortal =
    columnMenu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="timesheet-planning-week-col-dropdown timesheet-planning-week-col-dropdown-portal"
            style={{ top: columnMenu.top, left: columnMenu.left, width: COLUMN_MENU_WIDTH }}
            role="menu"
          >
            {menuDayEditable ? (
              <>
                <span className="timesheet-planning-week-col-dropdown-title">Remplir toute la colonne</span>
                {TIMESHEET_SHIFT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={[
                      'timesheet-planning-week-col-dropdown-item',
                      option.id === 'al' ? 'is-shift-al' : '',
                      option.id === 'sl' ? 'is-shift-sl' : '',
                      option.id === 'a' ? 'is-shift-a' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={option.color ? { color: option.color, fontWeight: 700 } : undefined}
                    onClick={() => fillColumn(columnMenu.dateKey, option.id)}
                  >
                    {option.planningLabel}
                  </button>
                ))}
                {menuDayWasInactive ? (
                  <>
                    <span className="timesheet-planning-week-col-dropdown-sep" aria-hidden="true" />
                    <button
                      type="button"
                      role="menuitem"
                      className="timesheet-planning-week-col-dropdown-item is-danger"
                      onClick={() => deactivateDay(columnMenu.dateKey)}
                    >
                      Désactiver la journée
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="timesheet-planning-week-col-dropdown-item"
                onClick={() => activateDay(columnMenu.dateKey)}
              >
                Activer la journée
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  if (!open) return null;

  return (
    <>
      {columnMenuPortal}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-form timesheet-planning-week-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="timesheet-planning-week-header-main">
              <h3>Planifier — {weekLabel}</h3>
              <p className="timesheet-manager-modal-subtitle">
                {scopeLabel ?? department}
                {locked ? ' · Semaine planifiée' : ''}
              </p>
            </div>
            <div className="timesheet-planning-week-header-actions">
              <div className="timesheet-planning-week-progress" aria-label="Progression du remplissage">
                <div className="timesheet-planning-week-progress-track">
                  <div
                    className="timesheet-planning-week-progress-fill"
                    style={{ width: `${plannedCells.percent}%` }}
                  />
                </div>
                <span className="timesheet-planning-week-progress-label">
                  {plannedCells.filled}/{plannedCells.total} · {plannedCells.percent}%
                </span>
              </div>
              <button type="button" className="modal-close" onClick={onClose}>
                ×
              </button>
            </div>
          </div>

          <div className="modal-body timesheet-manager-modal-body">
            <div className="timesheet-planning-week-search">
              <input
                type="search"
                className="search-input"
                placeholder="Rechercher un agent ou un matricule…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {canEdit && !locked ? (
                <button
                  type="button"
                  className="btn btn-outline timesheet-planning-week-fill-general"
                  onClick={fillGeneralWeek}
                  disabled={loading}
                  title="General Shift du lundi au vendredi, Off le week-end — pour tous les agents"
                >
                  General Shift — toute la semaine
                </button>
              ) : null}
              <span className="timesheet-planning-week-search-count">
                {filteredRows.length}/{rows.length} agent(s)
              </span>
            </div>

            <div className="table-wrap timesheet-planning-week-table-wrap">
              <table className="timesheet-table timesheet-planning-week-table">
                <thead>
                  <tr>
                    <th className="timesheet-planning-week-agent-col sticky-col">Agent</th>
                    <th className="timesheet-planning-week-mat-col sticky-col">Mat.</th>
                    {weekDays.map((day) => {
                      const editable = isDayEditable(day);
                      return (
                      <th
                        key={day.dateKey}
                        className={[
                          'timesheet-planning-week-day-col',
                          !editable ? 'is-inactive' : '',
                          day.isInactive && editable ? 'is-reactivated' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="timesheet-planning-week-day-header">
                          <div className="timesheet-planning-week-day-labels">
                            <span>{day.date.getDate()}</span>
                            <small>{day.dayLabel}</small>
                          </div>
                          {canEdit && !locked ? (
                            <button
                              type="button"
                              ref={(node) => {
                                if (node) columnMenuButtonRefs.current.set(day.dateKey, node);
                                else columnMenuButtonRefs.current.delete(day.dateKey);
                              }}
                              className="timesheet-planning-week-col-menu-btn"
                              aria-label={
                                editable
                                  ? `Options de la colonne du ${day.date.getDate()} ${day.dayLabel}`
                                  : `Activer le ${day.date.getDate()} ${day.dayLabel}`
                              }
                              title={
                                editable
                                  ? day.isInactive
                                    ? 'Journée réactivée — options'
                                    : 'Remplir la colonne'
                                  : 'Activer cette journée hors période'
                              }
                              aria-expanded={columnMenu?.dateKey === day.dateKey}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleColumnMenu(day.dateKey);
                              }}
                            >
                              <IconMoreVertical />
                            </button>
                          ) : null}
                        </div>
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2 + weekDays.length} className="timesheet-manager-loading">
                        Chargement…
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={2 + weekDays.length} className="timesheet-manager-loading">
                        Aucun agent trouvé
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.matricule}>
                        <td className="timesheet-manager-agent-cell timesheet-planning-week-agent-cell sticky-col">
                          {row.nom}
                        </td>
                        <td className="timesheet-planning-week-mat-cell sticky-col">{row.matricule}</td>
                        {weekDays.map((day) => {
                          const editable = isDayEditable(day);
                          return (
                          <td key={day.dateKey} className={!editable ? 'is-inactive' : undefined}>
                            <TimesheetShiftSelect
                              value={editable ? row.shifts[day.dateKey] ?? null : null}
                              onChange={(shiftType) => updateShift(row.matricule, day.dateKey, shiftType)}
                              disabled={!canEdit || locked || !editable}
                              variant="planning"
                            />
                          </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Fermer
            </button>
            {canClear && onClear ? (
              <button
                type="button"
                className="btn btn-outline timesheet-planning-week-clear-btn"
                onClick={onClear}
                disabled={saving || loading}
              >
                Effacer le planning
              </button>
            ) : null}
            {canEdit && !locked ? (
              <button
                type="button"
                className="btn btn-accent btn-with-icon"
                onClick={handleSave}
                disabled={saving || loading}
              >
                {saving ? <BtnSpinner /> : null}
                {saving ? 'Enregistrement…' : 'Enregistrer le planning de la semaine'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
