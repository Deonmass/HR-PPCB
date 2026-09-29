'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import TimesheetCompilationView from '@/components/overtime/TimesheetCompilationView';
import TimesheetDepartmentExportModal from '@/components/overtime/TimesheetDepartmentExportModal';
import TimesheetManagerView from '@/components/overtime/TimesheetManagerView';
import TimesheetOvertimeImportModal from '@/components/overtime/TimesheetOvertimeImportModal';
import TimesheetPlanningView from '@/components/overtime/TimesheetPlanningView';
import { IconManager } from '@/components/overtime/TimesheetIcons';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { useTimesheetAccess } from '@/hooks/useTimesheetAccess';
import {
  flattenContractantEmployees,
  mapContractantEmployeeToPpcEmployee,
} from '@/lib/contractant-portal';
import type { Contractant } from '@/lib/contractants-types';
import { listTimesheetMonthOptions } from '@/lib/timesheet-period';
import type { Employee } from '@/lib/types';

type PageTab = 'planning' | 'overtime' | 'compilation';

const CONTRACTANTS_MENU = 'employes.contractants';

const CONTRACTANTS_VIEW_ANY = [{ menuId: CONTRACTANTS_MENU, action: 'view' as const }];

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

export default function ContractantsPlanningPage() {
  const { can } = usePermissions();
  const timesheetAccess = useTimesheetAccess();

  const canEdit = can(CONTRACTANTS_MENU, 'edit');
  const canCreate = can(CONTRACTANTS_MENU, 'create');
  const canManage = canEdit || canCreate;
  const canImportOt = canManage || Boolean(timesheetAccess.permissions?.importOvertime);
  const canValidateOt = canEdit || Boolean(timesheetAccess.permissions?.validateOvertime);
  const canEditValidated = canEdit || Boolean(timesheetAccess.permissions?.editValidatedOvertime);
  const canExportDept =
    can(CONTRACTANTS_MENU, 'export') ||
    canManage ||
    Boolean(timesheetAccess.permissions?.exportDepartment);
  const canCloseMonth = canEdit || Boolean(timesheetAccess.permissions?.closeMonth);

  const [pageTab, setPageTab] = useState<PageTab>('planning');
  const [deptExportOpen, setDeptExportOpen] = useState(false);
  const [otImportOpen, setOtImportOpen] = useState(false);
  const [managerDepartment, setManagerDepartment] = useState('');
  const [contractants, setContractants] = useState<Contractant[]>([]);
  const [otRefreshKey, setOtRefreshKey] = useState(0);
  const monthOptions = listTimesheetMonthOptions(12);
  const [importPeriod, setImportPeriod] = useState({
    year: monthOptions[0].year,
    month: monthOptions[0].month,
  });
  const [importWeekIndex, setImportWeekIndex] = useState<number | undefined>(undefined);

  const employees = useMemo<Employee[]>(
    () =>
      flattenContractantEmployees(contractants).map(mapContractantEmployeeToPpcEmployee),
    [contractants],
  );

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

  const loadContractants = useCallback(() => {
    fetch('/api/employes/contractants')
      .then((res) => (res.ok ? res.json() : { contractants: [] }))
      .then((json: { contractants?: Contractant[] }) =>
        setContractants(Array.isArray(json.contractants) ? json.contractants : []),
      )
      .catch(() => setContractants([]));
  }, []);

  useEffect(() => {
    loadContractants();
  }, [loadContractants]);

  return (
    <PermissionGate anyOf={CONTRACTANTS_VIEW_ANY}>
      <div className="overtime-page">
        <div className="overtime-sticky">
          <div className="overtime-page-header overtime-page-header-compact">
            <div className="overtime-header-top">
              <div className="page-header-title-row">
                <h2 className="overtime-page-title">Planning de travail</h2>
                <RefreshButton
                  onClick={() => {
                    loadContractants();
                    setOtRefreshKey((value) => value + 1);
                  }}
                  title="Actualiser"
                />
              </div>
            </div>
            <div className="overtime-toolbar-row">
              <div id="contractant-planning-toolbar-slot" className="overtime-toolbar-slot" />
              <div className="overtime-header-primary-actions">
                <div className="tabs header-tabs header-tabs-compact overtime-page-tabs">
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-icon${pageTab === 'planning' ? ' active' : ''}`}
                    onClick={() => setPageTab('planning')}
                  >
                    <IconPlanning />
                    Planning
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-icon${pageTab === 'overtime' ? ' active' : ''}`}
                    onClick={() => setPageTab('overtime')}
                  >
                    <IconManager />
                    Overtime
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-icon${pageTab === 'compilation' ? ' active' : ''}`}
                    onClick={() => setPageTab('compilation')}
                  >
                    <IconCompilation />
                    Compilation
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overtime-body overtime-body-scroll">
          {pageTab === 'planning' ? (
            <TimesheetPlanningView
              onDepartmentChange={setManagerDepartment}
              toolbarSlotId="contractant-planning-toolbar-slot"
              employeesOverride={employees}
              access={timesheetAccess}
            />
          ) : pageTab === 'overtime' ? (
            <TimesheetManagerView
              refreshKey={otRefreshKey}
              onDepartmentChange={setManagerDepartment}
              toolbarSlotId="contractant-planning-toolbar-slot"
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
              employeesOverride={employees}
              access={timesheetAccess}
            />
          ) : (
            <TimesheetCompilationView
              toolbarSlotId="contractant-planning-toolbar-slot"
              initialDepartment={managerDepartment}
              initialPeriod={importPeriod}
              refreshKey={otRefreshKey}
              canExport={canExportDept}
              canClose={canCloseMonth}
              canApplyPolicy={false}
              canSimulate={false}
              employeesOverride={employees}
              access={timesheetAccess}
            />
          )}
        </div>
      </div>

      {canExportDept ? (
        <TimesheetDepartmentExportModal
          open={deptExportOpen}
          onClose={() => setDeptExportOpen(false)}
          employees={employees}
          defaultDepartment={managerDepartment}
        />
      ) : null}

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
    </PermissionGate>
  );
}
