'use client';

import { useCallback, useEffect, useState } from 'react';
import TimesheetCompilationView from '@/components/overtime/TimesheetCompilationView';
import TimesheetDepartmentExportModal from '@/components/overtime/TimesheetDepartmentExportModal';
import TimesheetManagerView from '@/components/overtime/TimesheetManagerView';
import TimesheetOvertimeImportModal from '@/components/overtime/TimesheetOvertimeImportModal';
import TimesheetPolicyModal from '@/components/overtime/TimesheetPolicyModal';
import { IconManager } from '@/components/overtime/TimesheetIcons';
import PermissionGate from '@/components/PermissionGate';
import { usePermissions } from '@/contexts/PermissionContext';
import { useTimesheetAccess } from '@/hooks/useTimesheetAccess';
import { listTimesheetMonthOptions } from '@/lib/timesheet-period';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import type { Employee } from '@/lib/types';

type PageTab = 'overtime' | 'compilation';

const TIMESHEET_DEPT_EXPORT_ANY = [
  { menuId: TIMESHEET_MENU.department, action: 'export' as const },
  { menuId: TIMESHEET_MENU.all, action: 'export' as const },
  { menuId: TIMESHEET_MENU.export, action: 'export' as const },
  { menuId: TIMESHEET_MENU.export, action: 'view' as const },
];

const TIMESHEET_DEPT_VIEW_ANY = [
  { menuId: TIMESHEET_MENU.department, action: 'view' as const },
  { menuId: TIMESHEET_MENU.all, action: 'view' as const },
];

function IconCompilation({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export default function HeuresSupplementairesPage() {
  const { can } = usePermissions();
  const timesheetAccess = useTimesheetAccess();
  const canViewDept = can(TIMESHEET_MENU.department, 'view') || can(TIMESHEET_MENU.all, 'view');
  const canImportOt =
    can(TIMESHEET_MENU.importOvertime, 'create') ||
    can(TIMESHEET_MENU.importOvertime, 'view') ||
    can(TIMESHEET_MENU.importOvertime, 'edit') ||
    Boolean(timesheetAccess.permissions?.importOvertime);
  const canExportDept =
    can(TIMESHEET_MENU.export, 'export') ||
    can(TIMESHEET_MENU.export, 'view') ||
    can(TIMESHEET_MENU.department, 'export') ||
    can(TIMESHEET_MENU.all, 'export') ||
    Boolean(timesheetAccess.permissions?.exportDepartment);
  const canValidateOt =
    can(TIMESHEET_MENU.validateOvertime, 'edit') ||
    can(TIMESHEET_MENU.validateOvertime, 'view') ||
    Boolean(timesheetAccess.permissions?.validateOvertime);
  const canEditValidated =
    can(TIMESHEET_MENU.editValidated, 'edit') ||
    can(TIMESHEET_MENU.editValidated, 'view') ||
    Boolean(timesheetAccess.permissions?.editValidatedOvertime);
  const canCloseMonth =
    can(TIMESHEET_MENU.compilation, 'edit') ||
    can(TIMESHEET_MENU.all, 'edit') ||
    canValidateOt;
  const canApplyPolicy =
    can(TIMESHEET_MENU.policy, 'edit') ||
    can(TIMESHEET_MENU.policy, 'view') ||
    can(TIMESHEET_MENU.compilation, 'create') ||
    Boolean(timesheetAccess.permissions?.applyPolicy);
  const canSimulate =
    can(TIMESHEET_MENU.simulation, 'view') ||
    can(TIMESHEET_MENU.simulation, 'edit') ||
    Boolean(timesheetAccess.permissions?.simulation);

  const [pageTab, setPageTab] = useState<PageTab>('overtime');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [deptExportOpen, setDeptExportOpen] = useState(false);
  const [otImportOpen, setOtImportOpen] = useState(false);
  const [managerDepartment, setManagerDepartment] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [otRefreshKey, setOtRefreshKey] = useState(0);
  const monthOptions = listTimesheetMonthOptions(12);
  const [importPeriod, setImportPeriod] = useState({
    year: monthOptions[0].year,
    month: monthOptions[0].month,
  });
  const [importWeekIndex, setImportWeekIndex] = useState<number | undefined>(undefined);

  const handlePeriodChange = useCallback((year: number, month: number) => {
    setImportPeriod((current) =>
      current.year === year && current.month === month ? current : { year, month },
    );
  }, []);

  const handleWeekStatusChange = useCallback(() => {
    setOtRefreshKey((value) => value + 1);
  }, []);

  const handleOtImported = useCallback(() => {
    setOtRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (canViewDept) setPageTab('overtime');
  }, [canViewDept]);

  useEffect(() => {
    fetch('/api/timesheet/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(json))
      .catch(() => setEmployees([]));
  }, []);

  return (
    <>
      <div className="overtime-page">
        <div className="overtime-sticky">
          <div className="overtime-page-header overtime-page-header-compact">
            <div className="overtime-header-top">
              <div className="page-header-title-row">
                <h2 className="overtime-page-title">Heures sup.</h2>
                <button
                  type="button"
                  className="page-info-btn"
                  onClick={() => setPolicyOpen(true)}
                  title="Politique shifts, nuit et HS"
                  aria-label="Politique shifts, nuit et HS"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="10" x2="12" y2="16" />
                    <line x1="12" y1="7" x2="12" y2="7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="overtime-toolbar-row">
              <div id="overtime-toolbar-slot" className="overtime-toolbar-slot" />
              <div className="overtime-header-primary-actions">
                <div className="tabs header-tabs header-tabs-compact overtime-page-tabs">
                  <PermissionGate anyOf={TIMESHEET_DEPT_VIEW_ANY}>
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm tab-btn-icon${pageTab === 'overtime' ? ' active' : ''}`}
                      onClick={() => setPageTab('overtime')}
                    >
                      <IconManager />
                      Overtime
                    </button>
                  </PermissionGate>
                  <PermissionGate anyOf={TIMESHEET_DEPT_VIEW_ANY}>
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm tab-btn-icon${pageTab === 'compilation' ? ' active' : ''}`}
                      onClick={() => setPageTab('compilation')}
                    >
                      <IconCompilation />
                      Compilation
                    </button>
                  </PermissionGate>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overtime-body overtime-body-scroll">
          {pageTab === 'overtime' ? (
            <PermissionGate anyOf={TIMESHEET_DEPT_VIEW_ANY}>
              <TimesheetManagerView
                refreshKey={otRefreshKey}
                onDepartmentChange={setManagerDepartment}
                toolbarSlotId="overtime-toolbar-slot"
                onWeekStatusChange={handleWeekStatusChange}
                onPeriodChange={handlePeriodChange}
                canExport={canExportDept}
                onExport={() => setDeptExportOpen(true)}
                canImportOt={canImportOt}
                canValidateOt={canValidateOt}
                canEditValidated={canEditValidated}
                onImportWeek={(weekIndex) => {
                  setImportWeekIndex(weekIndex);
                  setOtImportOpen(true);
                }}
                access={timesheetAccess}
              />
            </PermissionGate>
          ) : (
            <PermissionGate anyOf={TIMESHEET_DEPT_VIEW_ANY}>
              <TimesheetCompilationView
                toolbarSlotId="overtime-toolbar-slot"
                initialDepartment={managerDepartment}
                initialPeriod={importPeriod}
                refreshKey={otRefreshKey}
                canExport={canExportDept}
                canClose={canCloseMonth}
                canApplyPolicy={canApplyPolicy}
                canSimulate={canSimulate}
                access={timesheetAccess}
              />
            </PermissionGate>
          )}
        </div>
      </div>

      <PermissionGate anyOf={TIMESHEET_DEPT_EXPORT_ANY}>
        <TimesheetDepartmentExportModal
          open={deptExportOpen}
          onClose={() => setDeptExportOpen(false)}
          employees={employees}
          defaultDepartment={managerDepartment}
        />
      </PermissionGate>

      {canImportOt ? (
        <TimesheetOvertimeImportModal
          open={otImportOpen}
          periodYear={importPeriod.year}
          periodMonth={importPeriod.month}
          initialWeekIndex={importWeekIndex}
          onClose={() => {
            setOtImportOpen(false);
            setImportWeekIndex(undefined);
          }}
          onImported={handleOtImported}
        />
      ) : null}

      <TimesheetPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </>
  );
}
