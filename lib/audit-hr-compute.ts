import type {
  AuditHrAction,
  AuditHrActionView,
  AuditHrDashboard,
  AuditHrSeverity,
  AuditHrStatus,
} from './audit-hr-types';
import { ratioToRate } from './format-rate';

function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayDiff(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86_400_000);
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Aligné sur le template Excel : Due − Closing (ou Due − asOf). */
export function computeDaysOverdue(
  action: Pick<AuditHrAction, 'dueDate' | 'closingDate'>,
  asOf: Date,
): number | null {
  const due = parseIsoDate(action.dueDate);
  if (!due) return null;
  const closing = parseIsoDate(action.closingDate);
  return dayDiff(due, closing || asOf);
}

/** Aligné sur le template : Closing → Closed ; Days < 0 → Overdue ; sinon On going. */
export function computeStatus(
  action: Pick<AuditHrAction, 'dueDate' | 'closingDate'>,
  asOf: Date,
): AuditHrStatus {
  if (parseIsoDate(action.closingDate)) return 'Closed';
  const days = computeDaysOverdue(action, asOf);
  if (days == null) return 'On going';
  return days < 0 ? 'Overdue' : 'On going';
}

export function enrichAuditAction(
  action: AuditHrAction,
  asOf: Date,
  moisRef?: string,
): AuditHrActionView {
  const daysOverdue = computeDaysOverdue(action, asOf);
  const status = computeStatus(action, asOf);
  const due = parseIsoDate(action.dueDate);
  const issue = parseIsoDate(action.issueCreationDate);
  const closing = parseIsoDate(action.closingDate);
  const annee = due
    ? due.getFullYear()
    : issue
      ? issue.getFullYear()
      : null;
  const moisCloture = closing ? toMonthKey(closing) : '';
  const ref = moisRef || toMonthKey(asOf);
  const filtreMois: 'Oui' | 'Non' =
    !moisCloture || moisCloture <= ref ? 'Oui' : 'Non';

  return {
    ...action,
    daysOverdue,
    status,
    annee,
    moisCloture,
    filtreMois,
  };
}

export function buildAuditHrDashboard(
  actions: AuditHrAction[],
  asOfIso: string,
): AuditHrDashboard {
  const asOf = parseIsoDate(asOfIso) || new Date();
  const moisRef = toMonthKey(asOf);
  const views = actions.map((a) => enrichAuditAction(a, asOf, moisRef));
  const total = views.length;

  const closed = views.filter((v) => v.status === 'Closed').length;
  const ongoing = views.filter((v) => v.status === 'On going').length;
  const overdue = views.filter((v) => v.status === 'Overdue').length;
  const closedPct = total ? ratioToRate(closed, total) : 0;

  const byStatus: AuditHrDashboard['byStatus'] = (
    [
      ['Closed', closed],
      ['On going', ongoing],
      ['Overdue', overdue],
    ] as Array<[AuditHrStatus, number]>
  ).map(([status, count]) => ({
    status,
    count,
    pct: total ? Math.round((count / total) * 100) : 0,
  }));

  const ownerMap = new Map<string, AuditHrActionView[]>();
  for (const v of views) {
    const key = v.owner.trim() || '(Sans owner)';
    const list = ownerMap.get(key) || [];
    list.push(v);
    ownerMap.set(key, list);
  }

  const byOwner = [...ownerMap.entries()]
    .map(([owner, rows]) => {
      const t = rows.length;
      const c = rows.filter((r) => r.status === 'Closed').length;
      const o = rows.filter((r) => r.status === 'On going').length;
      const ov = rows.filter((r) => r.status === 'Overdue').length;
      return {
        owner,
        total: t,
        closed: c,
        closedPct: t ? Math.round((c / t) * 100) : 0,
        ongoing: o,
        ongoingPct: t ? Math.round((o / t) * 100) : 0,
        overdue: ov,
        overduePct: t ? Math.round((ov / t) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'fr'));

  const severities: AuditHrSeverity[] = ['High', 'Medium', 'Low'];
  const bySeverity = severities.map((severity) => {
    const count = views.filter((v) => v.severity === severity).length;
    return {
      severity,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    };
  });

  const closedByMonth = new Map<string, number>();
  for (const v of views) {
    if (v.status !== 'Closed' || !v.moisCloture) continue;
    closedByMonth.set(v.moisCloture, (closedByMonth.get(v.moisCloture) || 0) + 1);
  }

  const year = asOf.getFullYear();
  const asOfMonth = asOf.getMonth() + 1;
  const progression = Array.from({ length: 12 }, (_, i) => {
    const monthNum = i + 1;
    const month = `${year}-${String(monthNum).padStart(2, '0')}`;
    let c = 0;
    for (let m = 1; m <= Math.min(monthNum, asOfMonth); m++) {
      c += closedByMonth.get(`${year}-${String(m).padStart(2, '0')}`) || 0;
    }
    return {
      month,
      closedCumul: c,
      closedPct: total ? Math.round((c / total) * 100) : 0,
    };
  });

  return {
    asOf: asOfIso.slice(0, 10),
    total,
    closed,
    ongoing,
    overdue,
    closedPct,
    byStatus,
    byOwner,
    bySeverity,
    progression,
  };
}

export function formatAuditDateFr(iso: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return iso;
}
