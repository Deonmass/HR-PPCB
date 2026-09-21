import { NextResponse } from 'next/server';
import { canPerformAction } from '@/lib/permission-check';
import {
  getTimesheetAccessFromSession,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import {
  getTimesheetPeriodBounds,
  resolveTimesheetPeriod,
  saveTimesheetPeriodBounds,
} from '@/lib/timesheet-period-bounds-store';
import { boundsFromPeriod } from '@/lib/timesheet-period-bounds';
import { withAudit } from '@/lib/with-audit';

function parsePeriod(searchParams: URLSearchParams): { year: number; month: number } | null {
  const year = Number.parseInt(searchParams.get('year') ?? '', 10);
  const month = Number.parseInt(searchParams.get('month') ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function GET(request: Request) {
  const result = await requireTimesheetModuleAccess();
  if ('error' in result && result.error) return result.error;

  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams);
  if (!period) {
    return NextResponse.json({ error: 'Paramètres year et month requis' }, { status: 400 });
  }

  const [bounds, resolved] = await Promise.all([
    getTimesheetPeriodBounds(period.year, period.month),
    resolveTimesheetPeriod(period.year, period.month),
  ]);

  return NextResponse.json({
    bounds,
    period: {
      year: resolved.year,
      month: resolved.month,
      start: boundsFromPeriod(resolved).activeStart,
      end: boundsFromPeriod(resolved).activeEnd,
      days: resolved.days.map((day) => ({
        dateKey: day.dateKey,
        isInactive: day.isInactive,
        isWeekend: day.isWeekend,
        dayLabel: day.dayLabel,
        ws: day.ws,
        weekNumber: day.weekNumber,
      })),
    },
  });
}

export async function PUT(request: Request) {
  const access = await getTimesheetAccessFromSession();
  if (!access) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const canConfigure = canPerformAction(access.session.menus, TIMESHEET_MENU.all, 'view');
  if (!canConfigure) {
    return NextResponse.json(
      { error: 'Seuls les profils « tout voir » peuvent définir la période timesheet' },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    year?: number;
    month?: number;
    activeStart?: string;
    activeEnd?: string;
  };
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year et month invalides' }, { status: 400 });
  }
  const activeStart = String(body.activeStart ?? '').trim();
  const activeEnd = String(body.activeEnd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(activeEnd)) {
    return NextResponse.json(
      { error: 'activeStart et activeEnd requis (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  const bounds = await withAudit(
    {
      module: 'timesheet',
      action: 'update',
      summary: `Période timesheet ${month}/${year} : ${activeStart} → ${activeEnd}`,
      undoable: false,
      meta: { year, month, activeStart, activeEnd },
      path: '/api/timesheet/period-bounds',
      method: 'PUT',
    },
    () => saveTimesheetPeriodBounds(year, month, { activeStart, activeEnd }),
  );

  const resolved = await resolveTimesheetPeriod(year, month);
  return NextResponse.json({
    bounds,
    period: {
      year: resolved.year,
      month: resolved.month,
      start: bounds.activeStart,
      end: bounds.activeEnd,
    },
  });
}
