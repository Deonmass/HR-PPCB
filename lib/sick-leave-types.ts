export interface SickLeaveBalance {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  nom: string;
  department: string;
  site: string;
  leaveType: string;
  leaveDescription: string;
  year: number;
  month: number;
  days: number;
  attestationImported: string;
  observations: string;
  provenance: string;
  statut: string;
  sourceSheet: string;
  sourceFile: string;
  updatedAt: string;
}

export interface SickLeaveAttestation {
  id: string;
  matricule: string;
  nom: string;
  site: string;
  department: string;
  startDate: string;
  endDate: string;
  year: number;
  month: number;
  days: number | null;
  hospital: string;
  confirmation: string;
  observations: string;
  provenance: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface SickLeaveAttestationInput {
  matricule: string;
  nom: string;
  site: string;
  department: string;
  startDate: string;
  endDate: string;
  year?: number;
  month?: number;
  days?: number | null;
  hospital: string;
  confirmation: string;
  observations?: string;
  provenance?: string;
}

export interface SickLeaveDeptCount {
  label: string;
  value: number;
}

export interface SickLeaveDashboard {
  employees: number;
  applications: number;
  attestations: number;
  attestationOnly: number;
  applicationOnly: number;
  both: number;
  byDeptAttestationOnly: SickLeaveDeptCount[];
  byDeptApplicationOnly: SickLeaveDeptCount[];
  byDeptBoth: SickLeaveDeptCount[];
  byMonth: { label: string; applications: number; attestations: number }[];
}

export interface SickLeaveCompareRow {
  key: string;
  matricule: string;
  nom: string;
  department: string;
  site: string;
  year: number;
  month: number;
  days: number | null;
  hasApplication: boolean;
  hasAttestation: boolean;
  bucket: 'attestation-only' | 'application-only' | 'both' | 'none';
  attestationId: string;
  hospital: string;
  startDate: string;
  endDate: string;
  confirmation: string;
  attestationImported: string;
  observations: string;
  provenance: string;
  statut: string;
  sourceSheet: string;
  parti: boolean;
}

export interface SickLeaveStoreData {
  balances: SickLeaveBalance[];
  attestations: SickLeaveAttestation[];
}
