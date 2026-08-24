import 'server-only';

import fs from 'fs';
import path from 'path';

const EXCEL_DIR = path.join(process.cwd(), 'Excel');
const TEMPLATES_DIR = path.join(EXCEL_DIR, 'templates');

export function getExportTemplatesDirectory(): string {
  return process.env.EXPORT_TEMPLATES_DIR?.trim()
    ? path.resolve(process.env.EXPORT_TEMPLATES_DIR.trim())
    : TEMPLATES_DIR;
}

export const EXPORT_TEMPLATE_SUBDIRS = {
  employees: 'employees',
  dependants: 'dependants',
  checkDocuments: 'check-documents',
  village: 'village',
  guestHouse: 'guest-house',
  factures: 'factures',
  projects: 'projects',
  overtimes: 'overtimes',
  travel: 'travel',
  attestations: 'attestations',
  audit: 'audit',
  contrats: 'contrats',
} as const;

export const EXPORT_TEMPLATE_FILES = {
  checkDocuments: 'CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx',
  employeesHr: 'EMPLOYEES_HR_EXPORT_TEMPLATE.xlsx',
  dependants: 'DEPENDANTS_EXPORT_TEMPLATE.xlsx',
  village: 'VILLAGE_EXPORT_TEMPLATE.xlsx',
  projectsTemplate: 'PROJECTS_TEMPLATE.xlsx',
  guestHouse: 'Guesthouse_template.xlsx',
  serviceAttestation: 'Attestation de service .docx',
  leaveAttestation: 'attestation-conge.docx',
  contratStandard: 'contrat-standard.docx',
  facturesSuivi: 'FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx',
  overtimesTimesheet: 'Timesheet template.xlsx',
  overtimesCompilation: 'OVERTIMES.xlsx',
  travelCashRequest: 'Cash Request.xlsx',
  travelTripBudget: 'TRIP BUDGET FORM.xlsx',
  travelHistory: 'Historique mission.xlsx',
  travelAuthorization: "Formulaire d'autorisation de voyage.docx",
  travelHotelBooking: 'Hotel booking form HR DOC 07 version 02.docx',
  travelMissionOrder: 'Ordre de mission.docx',
  travelFlightBooking: 'FLIGHT BOOKING FORM DOC-PPCB-HR-06 version 03.doc',
  auditHr: 'Audit_HR_template.xlsm',
} as const;

const FILE_TO_SUBDIR: Record<string, string> = {
  [EXPORT_TEMPLATE_FILES.employeesHr]: EXPORT_TEMPLATE_SUBDIRS.employees,
  [EXPORT_TEMPLATE_FILES.dependants]: EXPORT_TEMPLATE_SUBDIRS.dependants,
  [EXPORT_TEMPLATE_FILES.checkDocuments]: EXPORT_TEMPLATE_SUBDIRS.checkDocuments,
  [EXPORT_TEMPLATE_FILES.village]: EXPORT_TEMPLATE_SUBDIRS.village,
  [EXPORT_TEMPLATE_FILES.guestHouse]: EXPORT_TEMPLATE_SUBDIRS.guestHouse,
  [EXPORT_TEMPLATE_FILES.projectsTemplate]: EXPORT_TEMPLATE_SUBDIRS.projects,
  [EXPORT_TEMPLATE_FILES.serviceAttestation]: EXPORT_TEMPLATE_SUBDIRS.attestations,
  [EXPORT_TEMPLATE_FILES.leaveAttestation]: EXPORT_TEMPLATE_SUBDIRS.attestations,
  [EXPORT_TEMPLATE_FILES.contratStandard]: EXPORT_TEMPLATE_SUBDIRS.contrats,
  [EXPORT_TEMPLATE_FILES.facturesSuivi]: EXPORT_TEMPLATE_SUBDIRS.factures,
  [EXPORT_TEMPLATE_FILES.overtimesTimesheet]: EXPORT_TEMPLATE_SUBDIRS.overtimes,
  [EXPORT_TEMPLATE_FILES.overtimesCompilation]: EXPORT_TEMPLATE_SUBDIRS.overtimes,
  [EXPORT_TEMPLATE_FILES.travelCashRequest]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.travelTripBudget]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.travelHistory]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.travelAuthorization]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.travelHotelBooking]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.travelMissionOrder]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.travelFlightBooking]: EXPORT_TEMPLATE_SUBDIRS.travel,
  [EXPORT_TEMPLATE_FILES.auditHr]: EXPORT_TEMPLATE_SUBDIRS.audit,
};

/** Resolve Excel/templates/<subdir>/<file> (env override first). */
export function resolveExportTemplate(
  fileName: string,
  envOverride?: string,
  subdir?: string,
): string {
  if (envOverride?.trim()) return path.resolve(envOverride.trim());
  const root = getExportTemplatesDirectory();
  const moduleDir = subdir ?? FILE_TO_SUBDIR[fileName];
  const preferred = moduleDir
    ? path.join(root, moduleDir, fileName)
    : path.join(root, fileName);
  if (fs.existsSync(preferred)) return preferred;
  const flat = path.join(root, fileName);
  if (fs.existsSync(flat)) return flat;
  return preferred;
}

export const CHECK_DOCUMENTS_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.checkDocuments,
  process.env.CHECK_DOCUMENTS_EXPORT_TEMPLATE_XLSX,
);

export const EMPLOYEES_HR_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.employeesHr,
  process.env.EMPLOYEES_HR_EXPORT_TEMPLATE_XLSX,
);

export const DEPENDANTS_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.dependants,
  process.env.DEPENDANTS_EXPORT_TEMPLATE_XLSX,
);

export const VILLAGE_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.village,
  process.env.VILLAGE_EXPORT_TEMPLATE_XLSX,
);

export const PROJECTS_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.projectsTemplate,
  process.env.PROJECTS_EXPORT_TEMPLATE_XLSX,
);

export const GUEST_HOUSE_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.guestHouse,
  process.env.GUEST_HOUSE_EXPORT_TEMPLATE_XLSX,
);

export const SERVICE_ATTESTATION_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.serviceAttestation,
  process.env.SERVICE_ATTESTATION_TEMPLATE_DOCX,
);

export const LEAVE_ATTESTATION_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.leaveAttestation,
  process.env.LEAVE_ATTESTATION_TEMPLATE_DOCX,
);

export const CONTRAT_STANDARD_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.contratStandard,
  process.env.CONTRAT_STANDARD_TEMPLATE_DOCX,
);

export const AUDIT_HR_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.auditHr,
  process.env.AUDIT_HR_EXPORT_TEMPLATE_XLSX,
  EXPORT_TEMPLATE_SUBDIRS.audit,
);

export {
  FACTURES_SUIVI_EXPORT_TEMPLATE_FILE,
  FACTURES_SUIVI_EXPORT_TEMPLATE_PATH,
} from '@/lib/factures-fournisseurs/paths';

export {
  OVERTIMES_FILES,
  OVERTIMES_EXPORT_XLSX_PATH,
  OVERTIMES_TIMESHEET_TEMPLATE_PATH,
  OVERTIMES_TIMESHEET_TEMPLATE_PATH as TIMESHEET_TEMPLATE_PATH,
} from './excel-overtimes-paths';

export {
  TRAVEL_TEMPLATE_FILES,
  CASH_REQUEST_TEMPLATE_PATH,
  TRIP_BUDGET_TEMPLATE_PATH,
  TRAVEL_AUTHORIZATION_TEMPLATE_PATH,
  HOTEL_BOOKING_TEMPLATE_PATH,
  MISSION_ORDER_TEMPLATE_PATH,
  FLIGHT_BOOKING_TEMPLATE_PATH,
  TRAVEL_HISTORY_EXPORT_TEMPLATE_PATH,
  resolveTravelHistoryPath,
} from './travel-template-paths';
