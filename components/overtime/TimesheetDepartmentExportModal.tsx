'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  downloadTimesheetWorkbook,
  exportDepartmentTimesheetWorkbook,
} from '@/lib/timesheet-export';
import { buildTimesheetPeriod, listTimesheetMonthOptions } from '@/lib/timesheet-period';
import { buildEmployeeTimesheetRows } from '@/lib/timesheet-rows';
import { TIMESHEET_COMPANY_DEFAULT } from '@/lib/timesheet-policy';
import type { TimesheetDayEntry } from '@/lib/timesheet-types';
import { showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import { BtnSpinner, IconExport } from '@/components/overtime/TimesheetIcons';

interface Props {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  defaultDepartment?: string;
}

function matchesDepartment(employeeDepartment: string, selectedDepartment: string): boolean {
  return employeeDepartment.trim().toLowerCase() === selectedDepartment.trim().toLowerCase();
}

export default function TimesheetDepartmentExportModal({
  open,
  onClose,
  employees,
  defaultDepartment = '',
}: Props) {
  const monthOptions = useMemo(() => listTimesheetMonthOptions(12), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [department, setDepartment] = useState(defaultDepartment);
  const [company, setCompany] = useState(TIMESHEET_COMPANY_DEFAULT);
  const [exporting, setExporting] = useState(false);

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

  const departmentEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.nom.trim() && matchesDepartment(employee.departement, department))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [department, employees],
  );

  useEffect(() => {
    if (!open) return;
    setDepartment(defaultDepartment || departments[0]?.name || '');
  }, [open, defaultDepartment, departments]);

  const handleExport = async () => {
    if (!department) {
      await showError('Sélectionnez un département');
      return;
    }
    if (!departmentEmployees.length) {
      await showError('Aucun employé dans ce département');
      return;
    }

    setExporting(true);
    try {
      const period = buildTimesheetPeriod(selectedMonth.year, selectedMonth.month);
      const exportEmployees = await Promise.all(
        departmentEmployees.map(async (employee) => {
          const params = new URLSearchParams({
            year: String(period.year),
            month: String(period.month),
            matricule: employee.matricule,
          });
          const res = await fetch(`/api/timesheet/entries?${params}`);
          const json = (await res.json()) as { entries?: Record<string, TimesheetDayEntry> };
          return {
            matricule: employee.matricule,
            nom: employee.nom,
            rows: buildEmployeeTimesheetRows(period, json.entries ?? {}),
          };
        }),
      );

      const buffer = await exportDepartmentTimesheetWorkbook({
        company,
        department,
        period,
        employees: exportEmployees,
      });

      const safeDept = department.replace(/[^\w.-]+/g, '_');
      downloadTimesheetWorkbook(
        buffer,
        `Timesheets_${safeDept}_${period.year}-${String(period.month).padStart(2, '0')}.xlsx`,
      );
      await showSuccess(
        `Export généré : ${exportEmployees.length} feuille(s) pour le département ${department}`,
      );
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form timesheet-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Exporter le département en Excel</h3>
            <p className="timesheet-manager-modal-subtitle">
              Un fichier, une feuille par employé ({departmentEmployees.length} feuille
              {departmentEmployees.length > 1 ? 's' : ''})
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="timesheet-export-form">
            <div className="form-group">
              <label>Période</label>
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
            </div>
            <div className="form-group">
              <label>Département</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                {departments.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count} agent{item.count > 1 ? 's' : ''})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Entreprise</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>

          <div className="timesheet-export-preview panel">
            <h4>Feuilles à générer</h4>
            <ul className="timesheet-export-employee-list">
              {departmentEmployees.map((employee) => (
                <li key={employee.matricule}>
                  <span>{employee.nom}</span>
                  <span className="timesheet-export-matricule">{employee.matricule}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-accent btn-with-icon" onClick={handleExport} disabled={exporting}>
            {exporting ? <BtnSpinner /> : <IconExport size={14} />}
            {exporting ? 'Export en cours…' : 'Exporter le département'}
          </button>
        </div>
      </div>
    </div>
  );
}
