import { formatAttestationAgentName } from './format-display-name';
import { localizeJobTitle, translateJobTitleToEnglish } from './job-title-i18n';
import { formatResidenceHodSoussigne } from './residence-attestation-text';
import type { LeaveAttestationFormData } from './leave-attestation-types';
import type { Employee } from './types';

export type LeaveAgentDraft = {
  matricule: string;
  name: string;
  department: string;
  leaveStart: string;
  leaveEnd: string;
  genreFr: string;
  genreEn: string;
  functionFr: string;
  functionEn: string;
  bodyFr: string;
  bodyEn: string;
  bodyFrTouched: boolean;
  bodyEnTouched: boolean;
};

export type LeaveSharedFields = {
  documentDate: string;
  hodName: string;
  hodGenre: string;
  hodFunctionFr: string;
  hodFunctionEn: string;
};

export function formatLeaveDocDate(value: string, language: 'fr' | 'en' = 'fr'): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function genreFrFromEmployee(employee: Employee): string {
  if (/^f/i.test(employee.gender)) return 'Madame';
  if (/^m/i.test(employee.gender)) return 'Monsieur';
  return 'Monsieur';
}

function genreEnFromEmployee(employee: Employee): string {
  if (/^f/i.test(employee.gender)) return 'Ms.';
  if (/^m/i.test(employee.gender)) return 'Mr.';
  return 'Mr.';
}

export function buildLeaveBodyFr(
  shared: LeaveSharedFields,
  agent: Pick<
    LeaveAgentDraft,
    'name' | 'genreFr' | 'functionFr' | 'leaveStart' | 'leaveEnd'
  >,
): string {
  const hod = formatAttestationAgentName(shared.hodName);
  const emp = formatAttestationAgentName(agent.name);
  const start = formatLeaveDocDate(agent.leaveStart, 'fr');
  const end = formatLeaveDocDate(agent.leaveEnd, 'fr');
  const soussigne = formatResidenceHodSoussigne(shared.hodGenre);
  const hodGenre = shared.hodGenre.trim() || 'Monsieur';
  // Modèle Word / texte officiel fourni
  return `Je ${soussigne}, ${hodGenre} ${hod}, ${shared.hodFunctionFr.trim()} de PPC Barnet DRC Manufacturing S.A, atteste par la présente que ${agent.genreFr.trim()} ${emp}, ${agent.functionFr.trim()} au sein de notre entreprise, sera en congé à partir du ${start} et reprendra le travail en date du ${end}.`;
}

export function buildLeaveBodyEn(
  shared: LeaveSharedFields,
  agent: Pick<
    LeaveAgentDraft,
    'name' | 'genreEn' | 'functionEn' | 'leaveStart' | 'leaveEnd'
  >,
): string {
  const hod = formatAttestationAgentName(shared.hodName);
  const emp = formatAttestationAgentName(agent.name);
  const start = formatLeaveDocDate(agent.leaveStart, 'en');
  const end = formatLeaveDocDate(agent.leaveEnd, 'en');
  // Toujours passer par la traduction EN (évite un titre FR collé par erreur).
  const hodFn =
    translateJobTitleToEnglish(shared.hodFunctionEn.trim() || shared.hodFunctionFr.trim()) ||
    shared.hodFunctionEn.trim() ||
    shared.hodFunctionFr.trim();
  // Modèle : attestation de service et de conge Angele.docx
  return `I, the undersigned, ${hod}, ${hodFn} of PPC Barnet DRC Manufacturing S.A, hereby certify that ${agent.genreEn.trim()} ${emp}, ${agent.functionEn.trim()} of our company and will be on leave from ${start}, and will resume work on ${end}.`;
}

export function employeeToLeaveAgent(
  employee: Employee,
  shared: LeaveSharedFields,
  leaveStart = '',
  leaveEnd = '',
): LeaveAgentDraft {
  const genreFr = genreFrFromEmployee(employee);
  const genreEn = genreEnFromEmployee(employee);
  const functionFr = localizeJobTitle(employee.jobTitle || employee.grade, 'fr', genreFr);
  const functionEn = localizeJobTitle(employee.jobTitle || employee.grade, 'en', genreEn);
  const draft: LeaveAgentDraft = {
    matricule: employee.matricule.trim(),
    name: formatAttestationAgentName(employee.nom),
    department: (employee.departement || '').trim(),
    leaveStart,
    leaveEnd,
    genreFr,
    genreEn,
    functionFr,
    functionEn,
    bodyFr: '',
    bodyEn: '',
    bodyFrTouched: false,
    bodyEnTouched: false,
  };
  draft.bodyFr = buildLeaveBodyFr(shared, draft);
  draft.bodyEn = buildLeaveBodyEn(shared, draft);
  return draft;
}

/** Recalcule les textes auto (sauf ceux déjà édités manuellement). */
export function refreshLeaveAgentBodies(
  agents: LeaveAgentDraft[],
  shared: LeaveSharedFields,
): LeaveAgentDraft[] {
  return agents.map((agent) => ({
    ...agent,
    name: formatAttestationAgentName(agent.name),
    bodyFr: agent.bodyFrTouched ? agent.bodyFr : buildLeaveBodyFr(shared, agent),
    bodyEn: agent.bodyEnTouched ? agent.bodyEn : buildLeaveBodyEn(shared, agent),
  }));
}

function enHodFunction(shared: LeaveSharedFields): string {
  return (
    translateJobTitleToEnglish(shared.hodFunctionEn.trim() || shared.hodFunctionFr.trim()) ||
    shared.hodFunctionEn.trim() ||
    shared.hodFunctionFr.trim()
  );
}

/** Un seul fichier bilingual : page FR puis page EN. */
export function leaveAgentToBilingualFormData(
  shared: LeaveSharedFields,
  agent: LeaveAgentDraft,
): LeaveAttestationFormData {
  return {
    language: 'both',
    documentDate: shared.documentDate,
    leaveStart: agent.leaveStart,
    leaveEnd: agent.leaveEnd,
    hodGenre: shared.hodGenre,
    hodName: formatAttestationAgentName(shared.hodName),
    hodFunction: shared.hodFunctionFr.trim(),
    hodFunctionEn: enHodFunction(shared),
    employeeGenre: agent.genreFr,
    employeeGenreEn: agent.genreEn,
    employeeName: formatAttestationAgentName(agent.name),
    employeeMatricule: agent.matricule,
    employeeFunction: agent.functionFr,
    employeeFunctionEn: agent.functionEn,
    employeeDepartment: agent.department,
    bodyText: agent.bodyFr.trim(),
    bodyTextEn: agent.bodyEn.trim(),
  };
}

export function leaveAgentToFormData(
  shared: LeaveSharedFields,
  agent: LeaveAgentDraft,
  language: 'fr' | 'en',
): LeaveAttestationFormData {
  return {
    language,
    documentDate: shared.documentDate,
    leaveStart: agent.leaveStart,
    leaveEnd: agent.leaveEnd,
    hodGenre: shared.hodGenre,
    hodName: formatAttestationAgentName(shared.hodName),
    hodFunction: language === 'en' ? enHodFunction(shared) : shared.hodFunctionFr.trim(),
    employeeGenre: language === 'en' ? agent.genreEn : agent.genreFr,
    employeeName: formatAttestationAgentName(agent.name),
    employeeMatricule: agent.matricule,
    employeeFunction: language === 'en' ? agent.functionEn : agent.functionFr,
    employeeDepartment: agent.department,
    bodyText: language === 'en' ? agent.bodyEn.trim() : agent.bodyFr.trim(),
  };
}

/** Découpe un payload bilingual en formulaires FR / EN pour le remplissage. */
export function splitBilingualLeaveForm(form: LeaveAttestationFormData): {
  fr: LeaveAttestationFormData;
  en: LeaveAttestationFormData;
} {
  const fr: LeaveAttestationFormData = {
    ...form,
    language: 'fr',
    hodFunction: form.hodFunction.trim(),
    employeeGenre: form.employeeGenre.trim(),
    employeeFunction: form.employeeFunction.trim(),
    bodyText: form.bodyText?.trim() || undefined,
    bodyTextEn: undefined,
    hodFunctionEn: undefined,
    employeeGenreEn: undefined,
    employeeFunctionEn: undefined,
  };
  const en: LeaveAttestationFormData = {
    ...form,
    language: 'en',
    hodFunction:
      form.hodFunctionEn?.trim() ||
      translateJobTitleToEnglish(form.hodFunction) ||
      form.hodFunction.trim(),
    employeeGenre: form.employeeGenreEn?.trim() || form.employeeGenre.trim(),
    employeeFunction: form.employeeFunctionEn?.trim() || form.employeeFunction.trim(),
    bodyText: form.bodyTextEn?.trim() || form.bodyText?.trim() || undefined,
    bodyTextEn: undefined,
    hodFunctionEn: undefined,
    employeeGenreEn: undefined,
    employeeFunctionEn: undefined,
  };
  return { fr, en };
}
