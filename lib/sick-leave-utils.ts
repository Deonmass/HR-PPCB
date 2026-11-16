import type {
  SickLeaveAttestation,
  SickLeaveAttestationInput,
  SickLeaveBalance,
  SickLeaveCompareRow,
  SickLeaveDashboard,
  SickLeaveDeptCount,
} from './sick-leave-types';
import { SANTE_MONTH_NAMES } from './sante-utils';

export function normalizeSickMatricule(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, '').trim();
}

export function parseSickMonth(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (n >= 1 && n <= 12) return n;
    return null;
  }
  const raw = String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return null;
  const numeric = raw.match(/^0?(\d{1,2})$/);
  if (numeric) {
    const n = Number(numeric[1]);
    return n >= 1 && n <= 12 ? n : null;
  }
  const token = raw.slice(0, 4);
  const map: Record<string, number> = {
    jan: 1, janv: 1, fev: 2, feb: 2, mar: 3, avr: 4, apr: 4,
    mai: 5, may: 5, jui: 6, jun: 6, juil: 7, jul: 7, aou: 8, aug: 8,
    sep: 9, oct: 10, nov: 11, dec: 12,
  };
  for (const [key, month] of Object.entries(map)) {
    if (token.startsWith(key) || raw.startsWith(key)) return month;
  }
  return null;
}

export function sickLeaveKey(matricule: string, year: number, month: number): string {
  return `${normalizeSickMatricule(matricule)}|${year}|${String(month).padStart(2, '0')}`;
}

export function parseIsoDateParts(value: string): { iso: string; year: number; month: number } | null {
  const trimmed = (value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return {
    iso: trimmed,
    year: Number(trimmed.slice(0, 4)),
    month: Number(trimmed.slice(5, 7)),
  };
}

export function hasSickApplication(days: number | null | undefined): boolean {
  return typeof days === 'number' && Number.isFinite(days) && days < 0;
}

export const SICK_LEAVE_PROVENANCES = ['Lié au travail', 'Autres'] as const;
export type SickLeaveProvenance = (typeof SICK_LEAVE_PROVENANCES)[number];

export function normalizeSickProvenance(value: string | null | undefined): string {
  const raw = String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return '';
  if (raw.includes('travail') || raw.includes('work') || raw.includes('occup')) return 'Lié au travail';
  return 'Autres';
}

export function isSickAttestationYes(value: string | null | undefined): boolean {
  return /^(oui|yes|y|present)$/i.test(String(value ?? '').trim());
}

function countByDept(rows: SickLeaveCompareRow[]): SickLeaveDeptCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = row.department.trim() || '—';
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));
}

export function buildSickLeaveCompareRows(
  balances: SickLeaveBalance[],
  attestations: SickLeaveAttestation[],
): SickLeaveCompareRow[] {
  const attByKey = new Map<string, SickLeaveAttestation>();
  for (const item of attestations) {
    attByKey.set(sickLeaveKey(item.matricule, item.year, item.month), item);
  }
  const seen = new Set<string>();
  const rows: SickLeaveCompareRow[] = [];

  for (const balance of balances) {
    const key = sickLeaveKey(balance.matricule, balance.year, balance.month);
    seen.add(key);
    const attestation = attByKey.get(key);
    const hasApplication = hasSickApplication(balance.days);
    const hasAttestation = isSickAttestationYes(balance.attestationImported);
    let bucket: SickLeaveCompareRow['bucket'] = 'none';
    if (hasAttestation && !hasApplication) bucket = 'attestation-only';
    else if (hasApplication && !hasAttestation) bucket = 'application-only';
    else if (hasApplication && hasAttestation) bucket = 'both';
    rows.push({
      key,
      matricule: balance.matricule,
      nom: balance.nom || [balance.firstName, balance.lastName].filter(Boolean).join(' '),
      department: balance.department || attestation?.department || '',
      site: balance.site || attestation?.site || '',
      year: balance.year,
      month: balance.month,
      days: balance.days,
      hasApplication,
      hasAttestation,
      bucket,
      attestationId: attestation?.id || '',
      hospital: attestation?.hospital || '',
      startDate: attestation?.startDate || '',
      endDate: attestation?.endDate || '',
      confirmation: attestation?.confirmation || '',
      attestationImported: hasAttestation ? 'Oui' : (balance.attestationImported || 'Non'),
      observations: attestation?.observations || balance.observations || '',
      provenance: normalizeSickProvenance(attestation?.provenance || balance.provenance),
      statut: balance.statut || '',
      sourceSheet: balance.sourceSheet || '',
      parti: false,
    });
  }

  for (const attestation of attestations) {
    const key = sickLeaveKey(attestation.matricule, attestation.year, attestation.month);
    if (seen.has(key)) continue;
    rows.push({
      key,
      matricule: attestation.matricule,
      nom: attestation.nom,
      department: attestation.department,
      site: attestation.site,
      year: attestation.year,
      month: attestation.month,
      days: null,
      hasApplication: false,
      hasAttestation: true,
      bucket: 'attestation-only',
      attestationId: attestation.id,
      hospital: attestation.hospital,
      startDate: attestation.startDate,
      endDate: attestation.endDate,
      confirmation: attestation.confirmation,
      attestationImported: 'Oui',
      observations: attestation.observations || '',
      provenance: normalizeSickProvenance(attestation.provenance),
      statut: '',
      sourceSheet: '',
      parti: false,
    });
  }

  return rows.sort((a, b) => (
    b.year - a.year
    || b.month - a.month
    || a.nom.localeCompare(b.nom, 'fr')
    || a.matricule.localeCompare(b.matricule)
  ));
}

export function buildSickLeaveDashboard(
  balances: SickLeaveBalance[],
  attestations: SickLeaveAttestation[],
): SickLeaveDashboard {
  const rows = buildSickLeaveCompareRows(balances, attestations);
  const attestationOnly = rows.filter((row) => row.bucket === 'attestation-only');
  const applicationOnly = rows.filter((row) => row.bucket === 'application-only');
  const both = rows.filter((row) => row.bucket === 'both');
  const employees = new Set(rows.map((row) => row.matricule).filter(Boolean)).size;
  const monthMap = new Map<string, { applications: number; attestations: number; year: number; month: number }>();
  for (const row of rows) {
    const label = `${SANTE_MONTH_NAMES[row.month - 1] ?? row.month} ${row.year}`;
    const current = monthMap.get(label) || { applications: 0, attestations: 0, year: row.year, month: row.month };
    if (row.hasApplication) current.applications += 1;
    if (row.hasAttestation) current.attestations += 1;
    monthMap.set(label, current);
  }
  const byMonth = [...monthMap.entries()]
    .sort((a, b) => a[1].year - b[1].year || a[1].month - b[1].month)
    .map(([label, value]) => ({
      label,
      applications: value.applications,
      attestations: value.attestations,
    }));

  return {
    employees,
    applications: rows.filter((row) => row.hasApplication).length,
    attestations: rows.filter((row) => row.hasAttestation).length,
    attestationOnly: attestationOnly.length,
    applicationOnly: applicationOnly.length,
    both: both.length,
    byDeptAttestationOnly: countByDept(attestationOnly),
    byDeptApplicationOnly: countByDept(applicationOnly),
    byDeptBoth: countByDept(both),
    byMonth,
  };
}

export function emptySickLeaveAttestationInput(): SickLeaveAttestationInput {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    matricule: '',
    nom: '',
    site: '',
    department: '',
    startDate: iso,
    endDate: iso,
    days: 1,
    hospital: '',
    confirmation: '',
    observations: '',
    provenance: '',
  };
}

export function attestationToInput(item: SickLeaveAttestation): SickLeaveAttestationInput {
  return {
    matricule: item.matricule,
    nom: item.nom,
    site: item.site,
    department: item.department,
    startDate: item.startDate,
    endDate: item.endDate,
    year: item.year,
    month: item.month,
    days: item.days,
    hospital: item.hospital,
    confirmation: item.confirmation,
    observations: item.observations,
    provenance: item.provenance,
  };
}

export function formatSickMonthLabel(month: number, year: number): string {
  return `${SANTE_MONTH_NAMES[month - 1] ?? month} ${year}`;
}
