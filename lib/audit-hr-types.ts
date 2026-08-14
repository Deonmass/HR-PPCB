export type AuditHrStatus = 'Closed' | 'On going' | 'Overdue';
export type AuditHrSeverity = 'High' | 'Medium' | 'Low';
export type AuditHrConfirmation = 'Oui' | 'Non';

export interface AuditHrAction {
  id: string;
  owner: string;
  action: string;
  issueCreationDate: string;
  dueDate: string;
  closingDate: string;
  confirmationAudit: AuditHrConfirmation;
  commentaire: string;
  severity: AuditHrSeverity;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface AuditHrActionInput {
  owner: string;
  action: string;
  issueCreationDate?: string;
  dueDate?: string;
  closingDate?: string;
  confirmationAudit?: AuditHrConfirmation | '';
  commentaire?: string;
  severity?: AuditHrSeverity | '';
}

export interface AuditHrActionView extends AuditHrAction {
  daysOverdue: number | null;
  status: AuditHrStatus;
  annee: number | null;
  moisCloture: string;
  filtreMois: 'Oui' | 'Non';
}

export interface AuditHrOwnerStats {
  owner: string;
  total: number;
  closed: number;
  closedPct: number;
  ongoing: number;
  ongoingPct: number;
  overdue: number;
  overduePct: number;
}

export interface AuditHrSeverityStats {
  severity: AuditHrSeverity;
  count: number;
  pct: number;
}

export interface AuditHrMonthProgress {
  month: string;
  closedCumul: number;
  closedPct: number;
}

export interface AuditHrDashboard {
  asOf: string;
  total: number;
  closed: number;
  ongoing: number;
  overdue: number;
  closedPct: number;
  byStatus: Array<{ status: AuditHrStatus; count: number; pct: number }>;
  byOwner: AuditHrOwnerStats[];
  bySeverity: AuditHrSeverityStats[];
  progression: AuditHrMonthProgress[];
}

export const AUDIT_HR_SEVERITIES: AuditHrSeverity[] = ['High', 'Medium', 'Low'];
export const AUDIT_HR_CONFIRMATIONS: AuditHrConfirmation[] = ['Oui', 'Non'];

export function emptyAuditHrActionInput(): AuditHrActionInput {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    owner: '',
    action: '',
    issueCreationDate: iso,
    dueDate: '',
    closingDate: '',
    confirmationAudit: 'Non',
    commentaire: '',
    severity: 'Medium',
  };
}
