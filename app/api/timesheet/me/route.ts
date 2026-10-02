import { NextResponse } from 'next/server';
import {
  getTimesheetAccessFromSession,
  isContractantTimesheetMode,
} from '@/lib/timesheet-access-server';
import { canPerformAction } from '@/lib/permission-check';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';

export async function GET() {
  const context = await getTimesheetAccessFromSession();
  if (!context) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { access } = context;
  const canViewModule =
    canPerformAction(context.session.menus, TIMESHEET_MENU.self, 'view') ||
    canPerformAction(context.session.menus, TIMESHEET_MENU.department, 'view') ||
    canPerformAction(context.session.menus, TIMESHEET_MENU.all, 'view') ||
    canPerformAction(context.session.menus, 'employes.contractants', 'view');

  if (!canViewModule) {
    return NextResponse.json({ error: 'Permission refusée' }, { status: 403 });
  }

  const permissions =
    isContractantTimesheetMode(context.session.menus)
      ? { ...access.permissions, applyPolicy: false }
      : access.permissions;

  return NextResponse.json({
    scope: access.scope,
    employee: access.linkedEmployee,
    department: access.userDepartment,
    allowedDepartments: access.allowedDepartments,
    allowedServices: access.allowedServices,
    permissions,
  });
}
