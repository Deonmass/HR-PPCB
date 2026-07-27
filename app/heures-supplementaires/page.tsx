'use client';

import { useCallback, useEffect, useState } from 'react';
import TimesheetCompilationView from '@/components/overtime/TimesheetCompilationView';
import TimesheetDepartmentExportModal from '@/components/overtime/TimesheetDepartmentExportModal';
import TimesheetManagerView from '@/components/overtime/TimesheetManagerView';
import TimesheetOvertimeImportModal from '@/components/overtime/TimesheetOvertimeImportModal';
import TimesheetPlanningView from '@/components/overtime/TimesheetPlanningView';
import TimesheetPolicyModal from '@/components/overtime/TimesheetPolicyModal';
import { IconManager } from '@/components/overtime/TimesheetIcons';
import PermissionGate from '@/components/PermissionGate';
import { usePermissions } from '@/contexts/PermissionContext';
import { useTimesheetAccess } from '@/hooks/useTimesheetAccess';
import { listTimesheetMonthOptions } from '@/lib/timesheet-period';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import type { Employee } from '@/lib/types';

type PageTab = 'planning' | 'overtime' | 'compilation';

const TIMESHEET_DEPT_EXPORT_ANY = [
  { menuId: TIMESHEET_MENU.department, action: 'export' as const },
  { menuId: TIMESHEET_MENU.all, action: 'export' as const },
];

const TIMESHEET_DEPT_VIEW_ANY = [
  { menuId: TIMESHEET_MENU.department, action: 'view' as const },
  { menuId: TIMESHEET_MENU.all, action: 'view' as const },
];

function IconPlanning({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="14" x2="8" y2="14.01" />
      <line x1="12" y1="14" x2="12" y2="14.01" />
      <line x1="16" y1="14" x2="16" y2="14.01" />
    </svg>
  );
}

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
    Boolean(timesheetAccess.permissions?.importOvertime);
  const canExportDept =
    can(TIMESHEET_MENU.department, 'export') ||
    can(TIMESHEET_MENU.all, 'export') ||
    Boolean(timesheetAccess.permissions?.exportDepartment);
  const canCloseMonth =
    can(TIMESHEET_MENU.compilation, 'edit') || can(TIMESHEET_MENU.all, 'edit');
  const canApplyPolicy =
    can(TIMESHEET_MENU.compilation, 'create') || can(TIMESHEET_MENU.all, 'edit');

  const [pageTab, setPageTab] = useState<PageTab>('planning');
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
    if (canViewDept) setPageTab('planning');
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
                      className={`tab-btn tab-btn-sm tab-btn-icon${pageTab === 'planning' ? ' active' : ''}`}
                      onClick={() => setPageTab('planning')}
                    >
                      <IconPlanning />
                      Planning Timesheet
                    </button>
                  </PermissionGate>
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
          {pageTab === 'planning' ? (
            <PermissionGate anyOf={TIMESHEET_DEPT_VIEW_ANY}>
              <TimesheetPlanningView
                onDepartmentChange={setManagerDepartment}
                toolbarSlotId="overtime-toolbar-slot"
                access={timesheetAccess}
              />
            </PermissionGate>
          ) : pageTab === 'overtime' ? (
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
