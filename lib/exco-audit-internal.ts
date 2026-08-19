import type { ExcoAuditFinding, ExcoReportPayload } from './exco-types';

export type AuditTrackerStatus = 'Closed' | 'Overdue' | 'On going' | 'Open';

export type InternalAuditRow = {
  number: string;
  finding: string;
  severity: 'High' | 'Medium' | 'Low';
  /** Statut de la capture 1 (Internal AUDIT). */
  baselineStatus: 'Open' | 'Closed';
  /** Statut actuel (capture 2 / module Audit). */
  status: AuditTrackerStatus;
  comments: string;
  dueDate: string;
  dueDateLabel: string;
  /** Ouvert en capture 1, Closed depuis la capture 2. */
  progressed: boolean;
};

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\brecuitment\b/g, 'recruitment')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDueLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '';
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

/** Capture 1 — Internal AUDIT. */
const BASELINE: Array<{
  number: string;
  finding: string;
  severity: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Closed';
  dueDate: string;
}> = [
  {
    number: '01',
    finding: 'Complete all missing documents in employee files',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '02',
    finding: 'Ensure all induction plan are properly documented',
    severity: 'Medium',
    status: 'Closed',
    dueDate: '2026-06-30',
  },
  {
    number: '03',
    finding: 'Introduce a KPI related to proper documentation filing within the recruitment process in the Recruitment Officer scorecard',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '04',
    finding: 'Conduct an annual internal audit of employee files to ensure compliance and completeness and close the Gap (85% compliance rate)',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '05',
    finding: 'Define and streamline the approval workflow to reduce delays (Everything should be signed the last day)',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '06',
    finding: 'Employee files update',
    severity: 'High',
    status: 'Closed',
    dueDate: '2025-09-30',
  },
  {
    number: '07',
    finding: 'Ensure all FY26 training records are properly documented and closed',
    severity: 'High',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '08',
    finding: 'Ensure that all required employee data is systematically shared with Finance on an annual basis, no later than end of april',
    severity: 'Low',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '09',
    finding: 'Establish a formal procedure defining roles and responsibilities between HR and Finance, including timelines and data requirements',
    severity: 'Low',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '10',
    finding: 'Establish a formal procedure for conducting surveys, including confidentiality requirements and formal agreements with providers',
    severity: 'High',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '11',
    finding: 'Finalize and standardize reference checks',
    severity: 'Medium',
    status: 'Closed',
    dueDate: '2026-06-30',
  },
  {
    number: '12',
    finding: 'Implement a formal action plan and ensure proper closure tracking',
    severity: 'High',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '13',
    finding: 'Implement an automatic recruitment System',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2027-03-31',
  },
  {
    number: '14',
    finding: 'Include a mandatory handover/ tracking file within the clearance process (Update the clearance from)',
    severity: 'High',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '15',
    finding: 'Introduce a KPI on proper filing and document completeness in employee records',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '16',
    finding: 'Issue a decision note to formalize interview outcomes',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '17',
    finding: 'Notify all pending candidates of their probation status',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '18',
    finding: 'Organize an alignment session between Human Resources and Legal to clarify requirements and define the appropriate framework documentation.',
    severity: 'Low',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '19',
    finding: 'Organize focus group sessions (plant and head office) to gather additional insigh',
    severity: 'High',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '20',
    finding: 'Publish an updated and comprehensive training plan FY27, including clear objectives and cost tracking',
    severity: 'High',
    status: 'Open',
    dueDate: '2026-06-30',
  },
  {
    number: '21',
    finding: 'Send regret letters to all unsuccessful candidates',
    severity: 'Medium',
    status: 'Closed',
    dueDate: '2026-06-30',
  },
  {
    number: '22',
    finding: 'Send Training Plan FY26 asap',
    severity: 'High',
    status: 'Closed',
    dueDate: '2026-06-30',
  },
  {
    number: '23',
    finding: 'Update the procedure or policy to include a clear requirement for timely clearance and final payment processing (48H hours before the last)',
    severity: 'Medium',
    status: 'Open',
    dueDate: '2026-06-30',
  },
];

/** Capture 2 — tracker (Closed / Overdue / On going). */
const TRACKER_UPDATES: Array<{ finding: string; status: AuditTrackerStatus }> = [
  { finding: 'Conduct an annual internal audit of employee files to ensure compliance and completeness and close the Gap (85% compliance rate)', status: 'Closed' },
  { finding: 'Employee files update', status: 'Closed' },
  { finding: 'Ensure all FY26 training records are properly documented and closed', status: 'Overdue' },
  { finding: 'Ensure that all required employee data is systematically shared with Finance on an annual basis, no later than end of april', status: 'Closed' },
  { finding: 'Establish a formal procedure defining roles and responsibilities between HR and Finance, including timelines and data requirements', status: 'Closed' },
  { finding: 'Establish a formal procedure for conducting surveys, including confidentiality requirements and formal agreements with providers', status: 'Closed' },
  { finding: 'Finalize and standardize reference checks', status: 'Closed' },
  { finding: 'Implement a formal action plan and ensure proper closure tracking', status: 'Overdue' },
  { finding: 'Implement an automatic recruitment System', status: 'On going' },
  { finding: 'Include a mandatory handover/ tracking file within the clearance process (Update the clearance from)', status: 'Closed' },
  { finding: 'Introduce a KPI on proper filing and document completeness in employee records', status: 'Overdue' },
  { finding: 'Issue a decision note to formalize interview outcomes', status: 'Overdue' },
  { finding: 'Notify all pending candidates of their probation status', status: 'Overdue' },
  { finding: 'Organize an alignment session between Human Resources and Legal to clarify requirements and define the appropriate framework documentation.', status: 'Closed' },
  { finding: 'Organize focus group sessions (plant and head office) to gather additional insigh', status: 'Overdue' },
  { finding: 'Publish an updated and comprehensive training plan FY27, including clear objectives and cost tracking', status: 'Overdue' },
  { finding: 'Send regret letters to all unsuccessful candidates', status: 'Closed' },
  { finding: 'Send Training Plan FY26 asap', status: 'Closed' },
  { finding: 'Update the procedure or policy to include a clear requirement for timely clearance and final payment processing (48H hours before the last)', status: 'Closed' },
];

function mapLiveStatus(status: string | undefined): AuditTrackerStatus | null {
  if (status === 'Closed') return 'Closed';
  if (status === 'Overdue') return 'Overdue';
  if (status === 'On going' || status === 'Ongoing') return 'On going';
  if (status === 'Open') return 'Open';
  return null;
}

function lookup<T>(map: Map<string, T>, finding: string): T | undefined {
  const key = norm(finding);
  if (map.has(key)) return map.get(key);
  for (const [k, v] of map) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return undefined;
}

export function buildInternalAuditRows(report: ExcoReportPayload): InternalAuditRow[] {
  const live = new Map<string, ExcoAuditFinding>();
  for (const f of report.overlays.auditFindings || []) {
    live.set(norm(f.finding), f);
  }
  const tracker = new Map<string, AuditTrackerStatus>();
  for (const row of TRACKER_UPDATES) {
    tracker.set(norm(row.finding), row.status);
  }

  return BASELINE.map((row) => {
    const liveRow = live.get(norm(row.finding))
      || [...live.values()].find((f) => {
        const a = norm(f.finding);
        const b = norm(row.finding);
        return a.includes(b) || b.includes(a);
      });
    const tracked = lookup(tracker, row.finding);
    const liveStatus = mapLiveStatus(liveRow?.status);
    const status: AuditTrackerStatus = liveStatus && liveStatus !== 'Open'
      ? liveStatus
      : tracked || (row.status === 'Closed' ? 'Closed' : 'Open');
    return {
      number: row.number,
      finding: row.finding,
      severity: row.severity,
      baselineStatus: row.status,
      status,
      comments: liveRow?.comments || '',
      dueDate: liveRow?.dueDate || row.dueDate,
      dueDateLabel: formatDueLabel(liveRow?.dueDate || row.dueDate),
      progressed: row.status === 'Open' && status === 'Closed',
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
  if (row.status === 'Closed') return row.progressed ? '86EFAC' : 'DCFCE7';
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
