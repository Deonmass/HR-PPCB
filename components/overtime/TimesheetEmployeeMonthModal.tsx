'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TimesheetTimeInput from '@/components/overtime/TimesheetTimeInput';
import TimesheetDatePicker from '@/components/overtime/TimesheetDatePicker';
import { BtnSpinner, CardSpinner } from '@/components/overtime/TimesheetIcons';
import { buildTimesheetPeriod, isTimesheetWeekend, parseTimesheetDateFr, snapToTimesheetWeekStart } from '@/lib/timesheet-period';
import { refreshTimesheetRowsForPeriod, shiftTimesheetRowsToStart } from '@/lib/timesheet-rows';
import type { TimesheetDayEntry, TimesheetRowData } from '@/lib/timesheet-types';
import { finalizeTimesheetRow } from '@/lib/timesheet-ws';
import {
  applyShifterPatternToPeriod,
  detectShifterCycleStart,
  inferTimesheetShiftFromActual,
} from '@/lib/timesheet-bulk-shifts';
import type { WeeklyOvertimeEntry } from '@/lib/timesheet-weekly-ot';
import { downloadTimesheetWorkbook, exportTimesheetWorkbook } from '@/lib/timesheet-export';
import { TIMESHEET_COMPANY_DEFAULT } from '@/lib/timesheet-policy';
import { showError, showSuccess } from '@/lib/swal';
import {
  buildTimesheetTemplateLines,
  formatHoursValue,
  sumTimesheetTemplateLines,
} from '@/lib/timesheet-template-view';

interface Props {
  open: boolean;
  matricule: string;
  nom: string;
  department: string;
  localisation?: string;
  year: number;
  month: number;
  monthLabel?: string;
  canEdit?: boolean;
  onClose: () => void;
}

type SchedulePresetId = 'general-zamba' | 'general-kinshasa' | 'shifter';

type SchedulePreset = {
  id: SchedulePresetId;
  label: string;
  detail: string;
};

type ActualMenuState = { top: number; left: number };

const ACTUAL_MENU_WIDTH = 280;

const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: 'general-zamba',
    label: 'General Shift — Zamba',
    detail: '07:00–16:30 · ven. → 13:30',
  },
  {
    id: 'general-kinshasa',
    label: 'General Shift — Kinshasa',
    detail: '08:30–17:30',
  },
  {
    id: 'shifter',
    label: 'Shifter',
    detail: '2j S1 · 2j S2 · 2j S3 · 2j OFF',
  },
];

function isFridayDate(value: Date | string): boolean {
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getDay() === 5;
}

function timesForGeneralPreset(
  presetId: 'general-zamba' | 'general-kinshasa',
  date: Date | string,
): { from: string; to: string } {
  if (presetId === 'general-zamba') {
    return isFridayDate(date) ? { from: '07:00', to: '13:30' } : { from: '07:00', to: '16:30' };
  }
  return { from: '08:30', to: '17:30' };
}

function mergeEntries(
  rows: TimesheetRowData[],
  entries: Record<string, TimesheetDayEntry>,
): TimesheetRowData[] {
  return rows.map((row) => {
    const entry = entries[row.dateKey];
    if (!entry) return row;
    const hasHours = Boolean(entry.from?.trim() || entry.to?.trim());
    const hasShift = entry.shiftType !== null && entry.shiftType !== undefined;
    const hasHoliday = entry.holiday !== undefined;
    if (!hasHours && !hasShift && !hasHoliday) return row;
    return finalizeTimesheetRow({
      ...row,
      from: hasHours ? entry.from : row.from,
      to: hasHours ? entry.to : row.to,
      shiftType: hasShift ? entry.shiftType : row.shiftType,
      holiday: hasHoliday ? Boolean(entry.holiday) : Boolean(row.holiday),
    });
  });
}

function rowsSignature(rows: TimesheetRowData[]): string {
  return rows
    .map(
      (row) =>
        `${row.dateKey}:${row.from}:${row.to}:${row.shiftType ?? ''}:${row.holiday ? '1' : '0'}`,
    )
    .join('|');
}

function fmtDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
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

function computeMenuPosition(button: HTMLButtonElement): ActualMenuState {
  const rect = button.getBoundingClientRect();
  let left = rect.right - ACTUAL_MENU_WIDTH;
  let top = rect.bottom + 4;

  if (left < 8) left = 8;
  if (left + ACTUAL_MENU_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - ACTUAL_MENU_WIDTH - 8;
  }
  if (top + 280 > window.innerHeight - 8) {
    top = Math.max(8, rect.top - 4 - 280);
  }

  return { top, left };
}

export default function TimesheetEmployeeMonthModal({
  open,
  matricule,
  nom,
  department,
  localisation = '',
  year,
  month,
  monthLabel,
  canEdit = false,
  onClose,
}: Props) {
  const period = useMemo(() => buildTimesheetPeriod(year, month), [year, month]);
  const [rows, setRows] = useState<TimesheetRowData[]>([]);
  const [weeklyOtByIndex, setWeeklyOtByIndex] = useState<
    Record<number, WeeklyOvertimeEntry | undefined>
  >({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [actualMenu, setActualMenu] = useState<ActualMenuState | null>(null);
  const [followShifterCycle, setFollowShifterCycle] = useState(false);
  const savedSignatureRef = useRef('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setWeeklyOtByIndex({});
    setDirty(false);
    setActualMenu(null);
    setFollowShifterCycle(false);
    savedSignatureRef.current = '';

    const base = refreshTimesheetRowsForPeriod(period);
    const entriesParams = new URLSearchParams({
      year: String(year),
      month: String(month),
      matricule,
    });
    const otParams = new URLSearchParams({
      year: String(year),
      month: String(month),
      department,
      matricule,
    });

    Promise.all([
      fetch(`/api/timesheet/entries?${entriesParams}`).then(async (res) => {
        if (!res.ok) return {} as Record<string, TimesheetDayEntry>;
        const json = (await res.json()) as { entries?: Record<string, TimesheetDayEntry> };
        return json.entries ?? {};
      }),
      fetch(`/api/timesheet/weekly-ot?${otParams}`).then(async (res) => {
        if (!res.ok) return {} as Record<number, WeeklyOvertimeEntry>;
        const json = (await res.json()) as { byWeek?: Record<number, WeeklyOvertimeEntry> };
        return json.byWeek ?? {};
      }),
    ])
      .then(([entries, byWeek]) => {
        if (cancelled) return;
        const merged = mergeEntries(base, entries);
        setRows(merged);
        setFollowShifterCycle(detectShifterCycleStart(merged) !== null);
        savedSignatureRef.current = rowsSignature(merged);
        setWeeklyOtByIndex(byWeek);
      })
      .catch(() => {
        if (!cancelled) {
          setRows(base);
          setFollowShifterCycle(false);
          savedSignatureRef.current = rowsSignature(base);
          setWeeklyOtByIndex({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, matricule, department, year, month, period]);

  useEffect(() => {
    if (!actualMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setActualMenu(null);
    };

    const handleReposition = () => {
      if (!menuButtonRef.current) return;
      setActualMenu(computeMenuPosition(menuButtonRef.current));
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [actualMenu]);

  const lines = useMemo(
    () =>
      buildTimesheetTemplateLines(rows, weeklyOtByIndex, localisation, {
        explicitActual: canEdit,
        year,
        month,
      }),
    [rows, weeklyOtByIndex, localisation, canEdit, year, month],
  );
  const totals = useMemo(() => sumTimesheetTemplateLines(lines), [lines]);

  const updateRow = useCallback(
    (
      dateKey: string,
      patch: Partial<Pick<TimesheetRowData, 'from' | 'to' | 'holiday'>>,
    ) => {
      if (!canEdit) return;
      setRows((prev) => {
        const next = prev.map((row) => {
          if (row.dateKey !== dateKey) return row;
          return finalizeTimesheetRow({ ...row, ...patch });
        });

        const firstKey = prev[0]?.dateKey;
        const timesChanged = patch.from !== undefined || patch.to !== undefined;
        if (!followShifterCycle || !timesChanged || dateKey !== firstKey) {
          return next;
        }

        const startShift = inferTimesheetShiftFromActual(next[0].from, next[0].to);
        if (!startShift) return next;
        return applyShifterPatternToPeriod(next, startShift);
      });
      setDirty(true);
    },
    [canEdit, followShifterCycle],
  );

  const fillFromPreset = useCallback(
    (presetId: SchedulePresetId) => {
      if (!canEdit) return;
      const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;

      setRows((prev) => {
        if (presetId === 'shifter') {
          const inferred = prev[0]
            ? inferTimesheetShiftFromActual(prev[0].from, prev[0].to)
            : null;
          const startShift = inferred && inferred !== 'off' ? inferred : 'shift1';
          return applyShifterPatternToPeriod(prev, startShift);
        }

        return prev.map((row) => {
          if (isTimesheetWeekend(row.date)) {
            return finalizeTimesheetRow({
              ...row,
              from: '',
              to: '',
              shiftType: 'off',
            });
          }
          const times = timesForGeneralPreset(presetId, row.date);
          return finalizeTimesheetRow({
            ...row,
            from: times.from,
            to: times.to,
            shiftType: 'general',
          });
        });
      });
      setFollowShifterCycle(presetId === 'shifter');
      setDirty(true);
      setActualMenu(null);
    },
    [canEdit],
  );

  const updateStartDate = useCallback(
    (value: string) => {
      if (!canEdit) return;
      const parsed = parseTimesheetDateFr(value);
      if (!parsed) return;
      const start = snapToTimesheetWeekStart(parsed);
      setRows((prev) => {
        if (!prev[0]) return prev;
        const next = shiftTimesheetRowsToStart(prev, start);
        if (next[0]?.dateKey === prev[0].dateKey) return prev;
        return next;
      });
      setDirty(true);
    },
    [canEdit],
  );

  const toggleActualMenu = () => {
    const button = menuButtonRef.current;
    if (!button) return;
    setActualMenu((current) => (current ? null : computeMenuPosition(button)));
  };

  const handleSave = async () => {
    if (!canEdit || !department) return;
    setSaving(true);
    try {
      const responses = await Promise.all(
        rows.map((row) =>
          fetch('/api/timesheet/entries', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              year,
              month,
              dateKey: row.dateKey,
              department,
              entries: [
                {
                  matricule,
                  from: row.from,
                  to: row.to,
                  shiftType: row.shiftType,
                  holiday: Boolean(row.holiday),
                },
              ],
            }),
          }),
        ),
      );

      const failed = responses.find((res) => !res.ok);
      if (failed) {
        const json = (await failed.json()) as { error?: string };
        throw new Error(json.error ?? 'Enregistrement impossible');
      }

      savedSignatureRef.current = rowsSignature(rows);
      setDirty(false);
      await showSuccess('Timesheet enregistré');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!department) {
      await showError('Département requis pour export');
      return;
    }
    setExporting(true);
    try {
      const buffer = await exportTimesheetWorkbook({
        company: TIMESHEET_COMPANY_DEFAULT,
        department,
        employeeName: nom,
        matricule,
        localisation: localisation ?? '',
        period,
        rows,
      });
      const safeName = nom.replace(/[^\w.-]+/g, '_');
      downloadTimesheetWorkbook(
        buffer,
        `Timesheet_${safeName}_${period.year}-${String(period.month).padStart(2, '0')}.xlsx`,
      );
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  const handleClose = () => {
    if (dirty && rowsSignature(rows) !== savedSignatureRef.current) {
      const leave = window.confirm('Des modifications ne sont pas enregistrées. Fermer quand même ?');
      if (!leave) return;
    }
    onClose();
  };

  const actualMenuPortal =
    actualMenu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="timesheet-planning-week-col-dropdown timesheet-planning-week-col-dropdown-portal timesheet-month-actual-menu"
            style={{ top: actualMenu.top, left: actualMenu.left, width: ACTUAL_MENU_WIDTH }}
            role="menu"
          >
            <span className="timesheet-planning-week-col-dropdown-title">Remplir Actual</span>
            {SCHEDULE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="timesheet-planning-week-col-dropdown-item timesheet-month-actual-menu-item"
                role="menuitem"
                onClick={() => fillFromPreset(preset.id)}
              >
                <span className="timesheet-month-actual-menu-label">{preset.label}</span>
                <small className="timesheet-month-actual-menu-detail">{preset.detail}</small>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  if (!open) return null;

  return (
    <>
      {actualMenuPortal}
      <div className="modal-overlay" onClick={handleClose}>
        <div
          className="modal modal-form timesheet-month-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h3>Timesheet — {nom}</h3>
              <p className="timesheet-manager-modal-subtitle">
                {matricule}
                {department ? ` · ${department}` : ''}
                {localisation ? ` · ${localisation}` : ''}
                {monthLabel ? ` · ${monthLabel}` : ''}
              </p>
            </div>
            <button type="button" className="modal-close" onClick={handleClose}>
              ×
            </button>
          </div>

          <div className="modal-body timesheet-manager-modal-body">
            {loading ? (
              <div className="timesheet-month-loading" role="status" aria-live="polite">
                <CardSpinner />
                <span>Chargement du timesheet…</span>
              </div>
            ) : (
              <div className="table-wrap timesheet-manager-table-wrap timesheet-template-table-wrap">
                <table className="timesheet-table timesheet-template-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="timesheet-template-holiday-col" title="Jour férié">
                        F
                      </th>
                      <th rowSpan={2} className="timesheet-template-date-col">
                        Date
                      </th>
                      <th rowSpan={2}>Jour</th>
                      <th rowSpan={2}>WS</th>
                      <th colSpan={2} className="timesheet-template-actual-head">
                        <span className="timesheet-template-actual-header">
                          Actual
                          {canEdit ? (
                            <button
                              type="button"
                              ref={menuButtonRef}
                              className="timesheet-planning-week-col-menu-btn"
                              aria-label="Remplir Actual selon un horaire"
                              aria-expanded={Boolean(actualMenu)}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleActualMenu();
                              }}
                            >
                              <IconMoreVertical />
                            </button>
                          ) : null}
                        </span>
                      </th>
                      <th colSpan={5}>Normal Hours</th>
                      <th colSpan={4}>Overtime</th>
                    </tr>
                    <tr>
                      <th className="timesheet-template-actual-head">From</th>
                      <th className="timesheet-template-actual-head">To</th>
                      <th title="Ordinary">Ord.</th>
                      <th>S1</th>
                      <th>S2</th>
                      <th>S3</th>
                      <th>Night</th>
                      <th>1.3</th>
                      <th>1.6</th>
                      <th>2</th>
                      <th>Night</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      if (line.kind === 'week') {
                        return (
                          <tr key={`week-${line.weekIndex}`} className="timesheet-template-week-row">
                            <td colSpan={6}>
                              <strong>{line.label}</strong>
                            </td>
                            <td className="timesheet-calc-cell" />
                            <td className="timesheet-calc-cell" />
                            <td className="timesheet-calc-cell" />
                            <td className="timesheet-calc-cell" />
                            <td className="timesheet-calc-cell" />
                            <td className="timesheet-calc-cell timesheet-ot-cell">
                              {formatHoursValue(line.ot13)}
                            </td>
                            <td className="timesheet-calc-cell timesheet-ot-cell">
                              {formatHoursValue(line.ot16)}
                            </td>
                            <td className="timesheet-calc-cell timesheet-ot-cell">
                              {formatHoursValue(line.ot2)}
                            </td>
                            <td className="timesheet-calc-cell timesheet-ot-cell">
                              {formatHoursValue(line.otNight)}
                            </td>
                          </tr>
                        );
                      }

                      const editable = Boolean(canEdit);
                      const isStartDate = line.row.dateKey === rows[0]?.dateKey;

                      return (
                        <tr
                          key={line.row.dateKey}
                          className={[
                            line.gray ? 'timesheet-template-off-row' : '',
                            line.holiday ? 'timesheet-template-holiday-row' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td className="timesheet-template-holiday-col">
                            <input
                              type="checkbox"
                              className="timesheet-template-holiday-check"
                              checked={Boolean(line.row.holiday)}
                              disabled={!canEdit}
                              title="Jour férié — heures en overtime"
                              aria-label={`Férié ${fmtDate(line.row.date)}`}
                              onChange={(event) =>
                                updateRow(line.row.dateKey, { holiday: event.target.checked })
                              }
                            />
                          </td>
                          <td className="timesheet-template-date-col">
                            {editable && isStartDate ? (
                              <TimesheetDatePicker
                                value={fmtDate(line.row.date)}
                                onCommit={updateStartDate}
                              />
                            ) : (
                              fmtDate(line.row.date)
                            )}
                          </td>
                          <td>{line.row.dayLabel}</td>
                          <td>{line.ws || '—'}</td>
                          <td className="timesheet-template-actual-cell">
                            {editable ? (
                              <TimesheetTimeInput
                                value={line.row.from}
                                placeholder="OFF"
                                onChange={(value) => updateRow(line.row.dateKey, { from: value })}
                              />
                            ) : (
                              line.actualFrom
                            )}
                          </td>
                          <td className="timesheet-template-actual-cell">
                            {editable ? (
                              <TimesheetTimeInput
                                value={line.row.to}
                                placeholder="OFF"
                                onChange={(value) => updateRow(line.row.dateKey, { to: value })}
                              />
                            ) : (
                              line.actualTo
                            )}
                          </td>
                          <td className="timesheet-calc-cell">{formatHoursValue(line.ordinary)}</td>
                          <td className="timesheet-calc-cell">{formatHoursValue(line.shift1)}</td>
                          <td className="timesheet-calc-cell">{formatHoursValue(line.shift2)}</td>
                          <td className="timesheet-calc-cell">{formatHoursValue(line.shift3)}</td>
                          <td className="timesheet-calc-cell">{formatHoursValue(line.night)}</td>
                          <td className="timesheet-calc-cell timesheet-ot-cell">
                            {formatHoursValue(line.ot13)}
                          </td>
                          <td className="timesheet-calc-cell timesheet-ot-cell">
                            {formatHoursValue(line.ot16)}
                          </td>
                          <td className="timesheet-calc-cell timesheet-ot-cell">
                            {formatHoursValue(line.ot2)}
                          </td>
                          <td className="timesheet-calc-cell timesheet-ot-cell">
                            {formatHoursValue(line.otNight)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="timesheet-subtotal-row">
                      <td colSpan={6}>
                        <strong>Sub-Total</strong>
                      </td>
                      <td className="timesheet-calc-cell">{formatHoursValue(totals.ordinary)}</td>
                      <td className="timesheet-calc-cell">{formatHoursValue(totals.shift1)}</td>
                      <td className="timesheet-calc-cell">{formatHoursValue(totals.shift2)}</td>
                      <td className="timesheet-calc-cell">{formatHoursValue(totals.shift3)}</td>
                      <td className="timesheet-calc-cell">{formatHoursValue(totals.night)}</td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.ot13)}
                      </td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.ot16)}
                      </td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.ot2)}
                      </td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.otNight)}
                      </td>
                    </tr>
                    <tr className="timesheet-accumulative-row">
                      <td colSpan={6}>
                        <strong>Accumulative Total</strong>
                      </td>
                      <td className="timesheet-calc-cell" />
                      <td className="timesheet-calc-cell" />
                      <td className="timesheet-calc-cell" />
                      <td className="timesheet-calc-cell" />
                      <td className="timesheet-calc-cell">{formatHoursValue(totals.night)}</td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.ot13)}
                      </td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.ot16)}
                      </td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.ot2)}
                      </td>
                      <td className="timesheet-calc-cell timesheet-ot-cell">
                        {formatHoursValue(totals.otNight)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {canEdit ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSave()}
                disabled={loading || saving || !dirty}
              >
                {saving ? <BtnSpinner /> : null}
                Enregistrer
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void handleExport()}
              disabled={loading || exporting || !department}
              title="Exporter l'employé (template Excel)"
            >
              {exporting ? <BtnSpinner /> : null}
              Exporter Excel (template)
            </button>
            <button type="button" className="btn btn-outline" onClick={handleClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
