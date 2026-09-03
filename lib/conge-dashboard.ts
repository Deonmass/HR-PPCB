import {
  countAlDays,
  eachIsoDateInclusive,
  monthEndBalance,
  monthRangeIso,
  resolveDayCode,
} from './conge-rules';
import {
  LEAVE_CODES,
  type CongeBundle,
  type CongeChartItem,
  type CongeDrillKind,
  type CongeEmployeeView,
  type LeaveCode,
} from './conge-types';

export interface CongeDashboardKpi {
  key: string;
  label: string;
  value: number;
  format: 'int' | '1';
  glow: string;
  drill: CongeDrillKind;
}

export interface CongeDashboard {
  asOf: string;
  monthStart: string;
  monthEnd: string;
  kpis: CongeDashboardKpi[];
  byCode: CongeChartItem[];
  byDepartment: CongeChartItem[];
}

const LEAVE_AWAY: ReadonlySet<string> = new Set(
  LEAVE_CODES.filter((item) => item.code !== 'IN').map((item) => item.code),
);

export function isAwayCode(code: string): boolean {
  return LEAVE_AWAY.has(code);
}

export function filterCongeEmployees(
  employees: CongeEmployeeView[],
  department: string,
): CongeEmployeeView[] {
  const dept = department.trim().toLowerCase();
  if (!dept) return employees;
  return employees.filter((row) => row.departement.trim().toLowerCase() === dept);
}

function monthBounds(asOf: string, rangeStart: string, rangeEnd: string): { start: string; end: string } {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7));
  const range = monthRangeIso(y, m);
  return {
    start: range.start < rangeStart ? rangeStart : range.start,
    end: range.end > rangeEnd ? rangeEnd : range.end,
  };
}

export function buildCongeDashboard(
  bundle: Pick<CongeBundle, 'employees' | 'grades' | 'seniorityBands' | 'exerciseYear' | 'rangeStart' | 'rangeEnd'>,
  asOf: string,
  department = '',
): CongeDashboard {
  const employees = filterCongeEmployees(bundle.employees, department);
  const month = monthBounds(asOf, bundle.rangeStart, bundle.rangeEnd);
  const asOfMonth = Number(asOf.slice(5, 7)) || 1;

  let onLeave = 0;
  let onLeaveMonth = 0;
  let alDays = 0;
  let balanceSum = 0;
  const daysByCode = new Map<LeaveCode, number>();
  const deptOnLeave = new Map<string, number>();

  for (const code of LEAVE_CODES) {
    if (code.code === 'IN') continue;
    daysByCode.set(code.code, 0);
  }

  for (const emp of employees) {
    const dayCode = resolveDayCode(asOf, emp.appointmentDate, emp.days);
    if (isAwayCode(dayCode)) {
      onLeave += 1;
      const dept = emp.departement.trim() || '—';
      deptOnLeave.set(dept, (deptOnLeave.get(dept) ?? 0) + 1);
    }

    const al = countAlDays(emp.days, bundle.rangeStart, bundle.rangeEnd);
    alDays += al;
    balanceSum += monthEndBalance(
      emp,
      bundle.exerciseYear,
      asOfMonth,
      bundle.grades,
      bundle.seniorityBands,
    );

    let awayThisMonth = false;
    for (const iso of eachIsoDateInclusive(month.start, month.end)) {
      const code = resolveDayCode(iso, emp.appointmentDate, emp.days);
      if (isAwayCode(code)) {
        awayThisMonth = true;
        daysByCode.set(code as LeaveCode, (daysByCode.get(code as LeaveCode) ?? 0) + 1);
      }
    }
    if (awayThisMonth) onLeaveMonth += 1;
  }

  const kpis: CongeDashboardKpi[] = [
    {
      key: 'effectif',
      label: 'Effectif planning',
      value: employees.length,
      format: 'int',
      glow: 'card-glow-cyan',
      drill: { kind: 'effectif' },
    },
    {
      key: 'onLeave',
      label: 'En congé',
      value: onLeave,
      format: 'int',
      glow: 'card-glow-amber',
      drill: { kind: 'onLeave' },
    },
    {
      key: 'onLeaveMonth',
      label: 'En congé ce mois',
      value: onLeaveMonth,
      format: 'int',
      glow: 'card-glow-violet',
      drill: { kind: 'onLeaveMonth' },
    },
    {
      key: 'alDays',
      label: 'Jours AL (période)',
      value: alDays,
      format: 'int',
      glow: 'card-glow-green',
      drill: { kind: 'alDays' },
    },
    {
      key: 'balance',
      label: 'Solde restant',
      value: Math.round(balanceSum * 10) / 10,
      format: '1',
      glow: 'card-glow-red',
      drill: { kind: 'balance' },
    },
  ];

  const byCode: CongeChartItem[] = LEAVE_CODES
    .filter((item) => item.code !== 'IN')
    .map((item) => ({
      label: `${item.code} · ${item.label}`,
      value: daysByCode.get(item.code) ?? 0,
    }));

  const byDepartment: CongeChartItem[] = [...deptOnLeave.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));

  return {
    asOf,
    monthStart: month.start,
    monthEnd: month.end,
    kpis,
    byCode,
    byDepartment,
  };
}

export function employeesForCongeDrill(
  bundle: Pick<CongeBundle, 'employees' | 'grades' | 'seniorityBands' | 'exerciseYear' | 'rangeStart' | 'rangeEnd'>,
  drill: CongeDrillKind,
  asOf: string,
  department = '',
): CongeEmployeeView[] {
  const employees = filterCongeEmployees(bundle.employees, department);
  const month = monthBounds(asOf, bundle.rangeStart, bundle.rangeEnd);
  const asOfMonth = Number(asOf.slice(5, 7)) || 1;

  switch (drill.kind) {
    case 'effectif':
      return employees;
    case 'onLeave':
      return employees.filter((emp) => isAwayCode(resolveDayCode(asOf, emp.appointmentDate, emp.days)));
    case 'onLeaveMonth':
      return employees.filter((emp) =>
        eachIsoDateInclusive(month.start, month.end).some((iso) =>
          isAwayCode(resolveDayCode(iso, emp.appointmentDate, emp.days)),
        ),
      );
    case 'alDays':
      return employees.filter((emp) => countAlDays(emp.days, bundle.rangeStart, bundle.rangeEnd) > 0);
    case 'balance':
      return [...employees].sort((a, b) => {
        const ba = monthEndBalance(a, bundle.exerciseYear, asOfMonth, bundle.grades, bundle.seniorityBands);
        const bb = monthEndBalance(b, bundle.exerciseYear, asOfMonth, bundle.grades, bundle.seniorityBands);
        return bb - ba;
      });
    case 'code':
      return employees.filter((emp) =>
        eachIsoDateInclusive(month.start, month.end).some(
          (iso) => resolveDayCode(iso, emp.appointmentDate, emp.days) === drill.code,
        ),
      );
    case 'dept':
      return employees.filter((emp) => {
        if (emp.departement.trim() !== drill.departement) return false;
        return isAwayCode(resolveDayCode(asOf, emp.appointmentDate, emp.days));
      });
    default:
      return employees;
  }
}

export function congeDrillTitle(drill: CongeDrillKind, asOfLabel: string): string {
  switch (drill.kind) {
    case 'effectif':
      return 'Voir la liste — Effectif planning';
    case 'onLeave':
      return `Voir la liste — En congé (${asOfLabel})`;
    case 'onLeaveMonth':
      return 'Voir la liste — En congé ce mois';
    case 'alDays':
      return 'Voir la liste — Jours AL (période)';
    case 'balance':
      return 'Voir la liste — Solde restant';
    case 'code':
      return `Voir la liste — ${drill.code}`;
    case 'dept':
      return `Voir la liste — ${drill.departement}`;
    default:
      return 'Voir la liste';
  }
}

export function codeFromChartLabel(label: string): LeaveCode | null {
  const code = label.split('·')[0]?.trim().toUpperCase();
  return LEAVE_CODES.some((item) => item.code === code) ? (code as LeaveCode) : null;
}
