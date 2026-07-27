'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import TimesheetShiftSelect from '@/components/overtime/TimesheetShiftSelect';
import TimesheetShiftBulkMenu from '@/components/overtime/TimesheetShiftBulkMenu';
import TimesheetTimeInput from '@/components/overtime/TimesheetTimeInput';
import {
  computePeriodOvertimeTotals,
  formatHoursValue,
  rowTotalHours,
} from '@/lib/timesheet-calc';
import {
  downloadTimesheetWorkbook,
  exportTimesheetWorkbook,
} from '@/lib/timesheet-export';
import { applyShiftSelection } from '@/lib/timesheet-shift-hours';
import { applyGeneralShiftToPeriod, applyShifterPatternToPeriod } from '@/lib/timesheet-bulk-shifts';
import { shouldShowOffDayHighlight } from '@/lib/timesheet-off-day';
import { refreshTimesheetRowsForPeriod } from '@/lib/timesheet-rows';
import { TIMESHEET_COMPANY_DEFAULT } from '@/lib/timesheet-policy';
import {
  buildTimesheetPeriod,
  listTimesheetMonthOptions,
  type TimesheetPeriod,
} from '@/lib/timesheet-period';
import type { TimesheetDayEntry, TimesheetRowData } from '@/lib/timesheet-types';
import { finalizeTimesheetRow } from '@/lib/timesheet-ws';
import { showError } from '@/lib/swal';
import { usePermissions } from '@/contexts/PermissionContext';
import { getDepartments } from '@/lib/employee-utils';
import {
  canEditTimesheetForMatricule,
  TIMESHEET_MENU,
} from '@/lib/timesheet-permissions';
import type { TimesheetAccessContext, TimesheetViewScope } from '@/lib/timesheet-permissions';
import type { Employee } from '@/lib/types';

function matchesDepartment(employeeDepartment: string, selectedDepartment: string): boolean {
  return employeeDepartment.trim().toLowerCase() === selectedDepartment.trim().toLowerCase();
}

function mergeManagerEntries(rows: TimesheetRowData[], entries: Record<string, TimesheetDayEntry>): TimesheetRowData[] {
  return rows.map((row) => {
    const entry = entries[row.dateKey];
    if (!entry) return row;
    const hasHours = Boolean(entry.from?.trim() || entry.to?.trim());
    const hasShift = entry.shiftType !== null && entry.shiftType !== undefined;
    if (!hasHours && !hasShift) return row;
    return finalizeTimesheetRow({
      ...row,
      from: hasHours ? entry.from : row.from,
      to: hasHours ? entry.to : row.to,
      shiftType: hasShift ? entry.shiftType : row.shiftType,
    });
  });
}

function formatPeriodRange(period: TimesheetPeriod): string {
  const fmt = (date: Date) =>
    date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(period.start)} → ${fmt(period.end)}`;
}

export interface TimesheetExportControls {
  export: () => void;
  exporting: boolean;
  canExport: boolean;
}

interface TimesheetEditorProps {
  onExportControls?: (controls: TimesheetExportControls) => void;
  defaultDepartment?: string;
  toolbarSlotId?: string;
  access?: {
    loading: boolean;
    scope: TimesheetViewScope | null;
    linkedEmployee: Employee | null;
    department: string | null;
    permissions: TimesheetAccessContext['permissions'] | null;
  };
}

export default function TimesheetEditor({
  onExportControls,
  defaultDepartment = '',
  toolbarSlotId,
  access,
}: TimesheetEditorProps) {
  const { can } = usePermissions();
  const monthOptions = useMemo(() => listTimesheetMonthOptions(12), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [period, setPeriod] = useState(() =>
    buildTimesheetPeriod(monthOptions[0].year, monthOptions[0].month),
  );
  const [rows, setRows] = useState<TimesheetRowData[]>(() => refreshTimesheetRowsForPeriod(period));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState(defaultDepartment);
  const [employee, setEmployee] = useState<EmployeeSelection | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toolbarReady, setToolbarReady] = useState(false);

  useEffect(() => {
    setToolbarReady(true);
  }, []);

  useEffect(() => {
    fetch('/api/timesheet/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(json))
      .catch(() => setEmployees([]));
  }, []);

  const scope = access?.scope ?? 'self';
  const lockedDepartment =
    scope === 'self'
      ? access?.linkedEmployee?.departement ?? ''
      : scope === 'department'
        ? access?.department ?? ''
        : '';

  const departments = useMemo(() => {
    if (lockedDepartment) return [lockedDepartment];
    return getDepartments(employees);
  }, [employees, lockedDepartment]);

  const departmentEmployees = useMemo(
    () =>
      employees.filter(
        (item) => item.nom.trim() && (!department || matchesDepartment(item.departement, department)),
      ),
    [department, employees],
  );

  useEffect(() => {
    if (defaultDepartment && scope === 'all') setDepartment(defaultDepartment);
  }, [defaultDepartment, scope]);

  useEffect(() => {
    if (lockedDepartment) {
      setDepartment(lockedDepartment);
      return;
    }
    if (!department && departments.length) setDepartment(departments[0]);
  }, [department, departments, lockedDepartment]);

  useEffect(() => {
    if (scope !== 'self' || employee) return;
    const linked = access?.linkedEmployee ?? departmentEmployees[0];
    if (!linked) return;
    setEmployee({
      matricule: linked.matricule,
      nom: linked.nom,
      departement: linked.departement,
    });
    setDepartment(linked.departement);
  }, [access?.linkedEmployee, departmentEmployees, employee, scope]);

  useEffect(() => {
    if (!employee || !department) return;
    if (!matchesDepartment(employee.departement, department)) setEmployee(null);
  }, [department, employee]);

  useEffect(() => {
    const nextPeriod = buildTimesheetPeriod(selectedMonth.year, selectedMonth.month);
    setPeriod(nextPeriod);
    setRows((prev) => refreshTimesheetRowsForPeriod(nextPeriod, prev));
  }, [selectedMonth]);

  useEffect(() => {
    if (!employee) return;
    const params = new URLSearchParams({
      year: String(period.year),
      month: String(period.month),
      matricule: employee.matricule,
    });
    fetch(`/api/timesheet/entries?${params}`)
      .then((res) => res.json())
      .then((json: { entries?: Record<string, TimesheetDayEntry> }) => {
        setRows((prev) => mergeManagerEntries(prev, json.entries ?? {}));
      })
      .catch(() => undefined);
  }, [employee, period.year, period.month]);

  const canEdit = useMemo(() => {
    if (!employee) return false;

    if (access?.permissions) {
      return canEditTimesheetForMatricule(
        {
          scope,
          linkedEmployee: access.linkedEmployee,
          userDepartment: access.department,
          permissions: access.permissions,
        },
        employee.matricule,
      );
    }

    if (scope === 'self') return can(TIMESHEET_MENU.self, 'edit');
    return can(TIMESHEET_MENU.department, 'edit') || can(TIMESHEET_MENU.all, 'edit');
  }, [access?.department, access?.linkedEmployee, access?.permissions, can, employee, scope]);

  const canExport = Boolean(access?.permissions?.exportOwn && employee);

  const periodTotals = useMemo(() => computePeriodOvertimeTotals(rows), [rows]);

  const updateRow = useCallback(
    (dateKey: string, patch: Partial<Pick<TimesheetRowData, 'from' | 'to' | 'shiftType'>>) => {
      if (!canEdit) return;
      setRows((prev) =>
        prev.map((row) => {
          if (row.dateKey !== dateKey) return row;
          if ('shiftType' in patch && patch.shiftType !== undefined) {
            return finalizeTimesheetRow(applyShiftSelection(row, patch.shiftType));
          }
          return finalizeTimesheetRow({ ...row, ...patch });
        }),
      );
    },
    [canEdit],
  );

  const applyGeneralShift = useCallback(() => {
    if (!canEdit) return;
    setRows((prev) => applyGeneralShiftToPeriod(prev));
  }, [canEdit]);

  const applyShifterPattern = useCallback(() => {
    if (!canEdit) return;
    setRows((prev) => applyShifterPatternToPeriod(prev));
  }, [canEdit]);

  const handleExport = useCallback(async () => {
    if (!employee) {
      await showError('Sélectionnez un employé avant export');
      return;
    }
    setExporting(true);
    try {
      const buffer = await exportTimesheetWorkbook({
        company: TIMESHEET_COMPANY_DEFAULT,
        department: employee.departement,
        employeeName: employee.nom,
        matricule: employee.matricule,
        period,
        rows,
      });
      const safeName = employee.nom.replace(/[^\w.-]+/g, '_');
      downloadTimesheetWorkbook(
        buffer,
        `Timesheet_${safeName}_${period.year}-${String(period.month).padStart(2, '0')}.xlsx`,
      );
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  }, [employee, period, rows]);

  useEffect(() => {
    onExportControls?.({
      export: handleExport,
      exporting,
      canExport,
    });
  }, [onExportControls, handleExport, exporting, canExport]);

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
        {scope !== 'self' && (
          <>
            <label className="overtime-inline-field">
              <span>Département</span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={Boolean(lockedDepartment)}
              >
                {departments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="overtime-inline-field overtime-inline-field-grow">
              <span>Employé</span>
              <EmployeePicker
                employees={departmentEmployees}
                value={employee}
                onChange={setEmployee}
                department={department}
              />
            </label>
          </>
        )}
        {scope === 'self' && employee && (
          <span className="overtime-inline-hint">
            {employee.nom} · {employee.matricule}
          </span>
        )}
      </div>
    ) : null;

  const toolbarSlot =
    toolbar && toolbarSlotId && typeof document !== 'undefined'
      ? document.getElementById(toolbarSlotId)
      : null;

  return (
    <>
      {toolbar && toolbarSlot ? createPortal(toolbar, toolbarSlot) : null}
      <div className="timesheet-editor">
      <div className="panel timesheet-grid-panel">
        <div className="table-wrap timesheet-table-wrap">
          <table className="timesheet-table timesheet-editor-table">
            <colgroup>
              <col className="timesheet-col-date" />
              <col className="timesheet-col-day" />
              <col className="timesheet-col-shift" />
              <col className="timesheet-col-time" />
              <col className="timesheet-col-time" />
              <col className="timesheet-col-calc" />
              <col className="timesheet-col-calc" />
              <col className="timesheet-col-calc" />
              <col className="timesheet-col-calc" />
              <col className="timesheet-col-calc" />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Jour</th>
                <th className="timesheet-shift-head">
                  <span>Shift</span>
                  <TimesheetShiftBulkMenu
                    onGeneralShift={applyGeneralShift}
                    onShifterPattern={applyShifterPattern}
                  />
                </th>
                <th>Début</th>
                <th>Fin</th>
                <th title="Général heures supplémentaires">Gén.</th>
                <th title="Shift 1 heures supplémentaires">S1</th>
                <th title="Shift 2 heures supplémentaires">S2</th>
                <th title="Heures de nuit">Nuit</th>
                <th title="Total heures du jour">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dateKey} className={shouldShowOffDayHighlight(row) ? 'timesheet-weekend-row' : ''}>
                  <td>{row.date.toLocaleDateString('fr-FR')}</td>
                  <td>{row.dayLabel}</td>
                  <td>
                    <TimesheetShiftSelect
                      value={row.shiftType}
                      onChange={(shiftType) => updateRow(row.dateKey, { shiftType })}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <TimesheetTimeInput
                      placeholder="07:00"
                      value={row.from}
                      onChange={(value) => updateRow(row.dateKey, { from: value })}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <TimesheetTimeInput
                      placeholder="16:30"
                      value={row.to}
                      onChange={(value) => updateRow(row.dateKey, { to: value })}
                      disabled={!canEdit}
                    />
                  </td>
                  <td className={`timesheet-calc-cell${row.shiftType === 'general' || row.shiftType === 'off' || (row.shiftType === 'shift3' && row.ordinary > 0) ? ' timesheet-calc-active' : ''}`}>
                    {formatHoursValue(row.ordinary)}
                  </td>
                  <td className={`timesheet-calc-cell${row.shiftType === 'shift1' ? ' timesheet-calc-active' : ''}`}>
                    {formatHoursValue(row.shift1)}
                  </td>
                  <td className={`timesheet-calc-cell${row.shiftType === 'shift2' ? ' timesheet-calc-active' : ''}`}>
                    {formatHoursValue(row.shift2)}
                  </td>
                  <td className={`timesheet-calc-cell${row.shiftType === 'shift3' || row.shiftType === 'off' || (row.shiftType === 'shift2' && row.night > 0) ? ' timesheet-calc-active' : ''}`}>
                    {formatHoursValue(row.night)}
                  </td>
                  <td className="timesheet-calc-cell timesheet-total-day-cell">
                    {formatHoursValue(rowTotalHours(row))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="timesheet-subtotal-row">
                <td colSpan={5}>
                  <strong>Sub-Total</strong>
                </td>
                <td className="timesheet-calc-cell">{formatHoursValue(periodTotals.ordinary)}</td>
                <td className="timesheet-calc-cell">{formatHoursValue(periodTotals.shift1)}</td>
                <td className="timesheet-calc-cell">{formatHoursValue(periodTotals.shift2)}</td>
                <td className="timesheet-calc-cell">{formatHoursValue(periodTotals.night)}</td>
                <td className="timesheet-calc-cell timesheet-total-day-cell">
                  {formatHoursValue(periodTotals.grandTotal)}
                </td>
              </tr>
              <tr className="timesheet-accumulative-row">
                <td colSpan={5}>
                  <strong>Total cumulé</strong>
                </td>
                <td className="timesheet-calc-cell timesheet-total-day-cell">
                  {formatHoursValue(periodTotals.grandTotal)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    </>
  );
}
