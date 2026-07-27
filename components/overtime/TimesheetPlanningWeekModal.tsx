'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TimesheetShiftSelect from '@/components/overtime/TimesheetShiftSelect';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import type { TimesheetPeriodDay } from '@/lib/timesheet-period';
import type { TimesheetDayEntry, TimesheetShiftType } from '@/lib/timesheet-types';
import { TIMESHEET_SHIFT_OPTIONS } from '@/lib/timesheet-types';
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
  agents: Employee[];
  periodYear: number;
  periodMonth: number;
  canEdit?: boolean;
  locked?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const COLUMN_MENU_WIDTH = 176;

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
  agents,
  periodYear,
  periodMonth,
  canEdit = false,
  locked = false,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<AgentWeekRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const columnMenuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const loadWeek = useCallback(async () => {
    if (!open || !department) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(periodYear),
        month: String(periodMonth),
        department,
        weekIndex: String(weekIndex),
        scope: 'planning-week',
      });
      const res = await fetch(`/api/timesheet/entries?${params}`);
      const json = (await res.json()) as {
        entries?: Record<string, Record<string, TimesheetDayEntry>>;
      };
      setRows(buildRows(agents, weekDays, json.entries ?? {}));
    } catch {
      setRows(buildRows(agents, weekDays, {}));
    } finally {
      setLoading(false);
    }
  }, [agents, department, open, periodMonth, periodYear, weekDays, weekIndex]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setColumnMenu(null);
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

  const plannedCells = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const row of rows) {
      for (const day of weekDays) {
        total += 1;
        if (row.shifts[day.dateKey]) filled += 1;
      }
    }
    return { total, filled, percent: total ? Math.round((filled / total) * 100) : 0 };
  }, [rows, weekDays]);

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
    setRows((prev) =>
      prev.map((row) =>
        row.matricule === matricule
          ? { ...row, shifts: { ...row.shifts, [dateKey]: shiftType } }
          : row,
      ),
    );
  };

  const fillColumn = (dateKey: string, shiftType: TimesheetShiftType) => {
    if (!canEdit || locked) return;
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        shifts: { ...row.shifts, [dateKey]: shiftType },
      })),
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

    const incomplete = rows.some((row) =>
      weekDays.some((day) => row.shifts[day.dateKey] === null || row.shifts[day.dateKey] === undefined),
    );
    if (incomplete) {
      await showError('Définissez un shift pour chaque agent et chaque jour avant d\'enregistrer.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/timesheet/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'planning-week',
          year: periodYear,
          month: periodMonth,
          department,
          weekIndex,
          grid: rows.map((row) => ({
            matricule: row.matricule,
            shifts: weekDays.map((day) => ({
              dateKey: day.dateKey,
              shiftType: row.shifts[day.dateKey] ?? null,
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

  const columnMenuPortal =
    columnMenu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="timesheet-planning-week-col-dropdown timesheet-planning-week-col-dropdown-portal"
            style={{ top: columnMenu.top, left: columnMenu.left, width: COLUMN_MENU_WIDTH }}
            role="menu"
          >
            <span className="timesheet-planning-week-col-dropdown-title">Remplir toute la colonne</span>
            {TIMESHEET_SHIFT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                className="timesheet-planning-week-col-dropdown-item"
                onClick={() => fillColumn(columnMenu.dateKey, option.id)}
              >
                {option.planningLabel}
              </button>
            ))}
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
                {department}
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
                    {weekDays.map((day) => (
                      <th key={day.dateKey} className="timesheet-planning-week-day-col">
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
                              aria-label={`Remplir la colonne du ${day.date.getDate()} ${day.dayLabel}`}
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
                    ))}
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
                        {weekDays.map((day) => (
                          <td key={day.dateKey}>
                            <TimesheetShiftSelect
                              value={row.shifts[day.dateKey] ?? null}
                              onChange={(shiftType) => updateShift(row.matricule, day.dateKey, shiftType)}
                              disabled={!canEdit || locked}
                              variant="planning"
                            />
                          </td>
                        ))}
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
