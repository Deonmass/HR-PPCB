import type { ExcoAuditFinding, ExcoReportPayload } from './exco-types';

export type AuditTrackerStatus = 'Closed' | 'Overdue' | 'On going' | 'Open';

export type InternalAuditRow = {
  number: string;
  finding: string;
  severity: 'High' | 'Medium' | 'Low';
  /** Statut de référence (Closed si déjà clôturé). */
  baselineStatus: 'Open' | 'Closed';
  /** Statut actuel (module Audit points). */
  status: AuditTrackerStatus;
  comments: string;
  dueDate: string;
  dueDateLabel: string;
  /** Ouvert puis Closed (progression). */
  progressed: boolean;
};

function formatDueLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '';
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

function mapLiveStatus(status: string | undefined): AuditTrackerStatus | null {
  if (status === 'Closed') return 'Closed';
  if (status === 'Overdue') return 'Overdue';
  if (status === 'On going' || status === 'Ongoing') return 'On going';
  if (status === 'Open') return 'Open';
  return null;
}

function mapSeverity(severity: string | undefined): InternalAuditRow['severity'] {
  if (severity === 'High' || severity === 'Medium' || severity === 'Low') return severity;
  return 'Medium';
}

/** Source de vérité : Audit points (findings EXCO déjà mergés depuis le module). */
export function buildInternalAuditRows(report: ExcoReportPayload): InternalAuditRow[] {
  const findings = (report.overlays.auditFindings || []) as ExcoAuditFinding[];
  return findings.map((f, index) => {
    const status = mapLiveStatus(f.status) || 'Open';
    return {
      number: f.number || String(index + 1).padStart(2, '0'),
      finding: f.finding || '',
      severity: mapSeverity(f.severity || ''),
      baselineStatus: status === 'Closed' ? 'Closed' : 'Open',
      status,
      comments: f.comments || '',
      dueDate: f.dueDate || '',
      dueDateLabel: formatDueLabel(f.dueDate || ''),
      progressed: status === 'Closed',
    };
  });
}

export function summarizeInternalAudit(rows: InternalAuditRow[]) {
  const closed = rows.filter((r) => r.status === 'Closed').length;
  const overdue = rows.filter((r) => r.status === 'Overdue').length;
  const ongoing = rows.filter((r) => r.status === 'On going').length;
  const open = rows.filter((r) => r.status === 'Open').length;
  const progressed = rows.filter((r) => r.progressed).length;
  const baselineClosed = rows.filter((r) => r.baselineStatus === 'Closed').length;
  return {
    total: rows.length,
    closed,
    overdue,
    ongoing,
    open,
    progressed,
    baselineClosed,
    closedPct: rows.length ? Math.round((closed / rows.length) * 100) : 0,
  };
}

export function auditStatusFill(row: InternalAuditRow, alt: boolean): string {
  if (row.status === 'Closed') return 'DCFCE7';
  if (row.status === 'Overdue') return 'FECACA';
  if (row.status === 'On going') return 'F3F4F6';
  return alt ? 'FCE8E9' : 'FFFFFF';
}

export function auditStatusColor(status: AuditTrackerStatus): string {
  if (status === 'Closed') return '166534';
  if (status === 'Overdue') return 'B91C1C';
  if (status === 'On going') return '0A0A0A';
  return '16161E';
}

export function auditSeverityColor(severity: InternalAuditRow['severity']): string {
  if (severity === 'High') return 'B91C1C';
  if (severity === 'Medium') return 'C2410C';
  return '15803D';
}
