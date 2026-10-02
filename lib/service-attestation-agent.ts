import { formatAttestationAgentName } from './format-display-name';
import { localizeJobTitle, translateJobTitleToEnglish } from './job-title-i18n';
import { formatResidenceHodSoussigne } from './residence-attestation-text';
import type { ServiceAttestationFormData } from './service-attestation-types';
import type { Employee } from './types';

export type ServiceAgentDraft = {
  matricule: string;
  name: string;
  department: string;
  dateEmbauche: string;
  genreFr: string;
  genreEn: string;
  functionFr: string;
  functionEn: string;
  bodyFr: string;
  bodyEn: string;
  bodyFrTouched: boolean;
  bodyEnTouched: boolean;
};

export type ServiceSharedFields = {
  documentDate: string;
  hodName: string;
  hodFunctionFr: string;
  hodFunctionEn: string;
};

function formatServiceDocDate(value: string, language: 'fr' | 'en'): string {
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

function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}`;
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

export function buildServiceBodyFr(
  shared: ServiceSharedFields,
  agent: Pick<
    ServiceAgentDraft,
    'name' | 'genreFr' | 'functionFr' | 'department' | 'dateEmbauche' | 'matricule'
  >,
  hodGenre: string,
): string {
  const hod = formatAttestationAgentName(shared.hodName);
  const emp = formatAttestationAgentName(agent.name);
  const hire = formatServiceDocDate(agent.dateEmbauche, 'fr');
  const soussigne = formatResidenceHodSoussigne(hodGenre);
  const genreHod = hodGenre.trim() || 'Monsieur';
  const employe = /madame|mme/i.test(agent.genreFr) ? 'employée' : 'employé';
  // Modèle officiel attestation de service
  return `Je ${soussigne}, ${genreHod} ${hod}, ${shared.hodFunctionFr.trim()} de PPC Barnet DRC Manufacturing SA, atteste par la présente que ${agent.genreFr.trim()} ${emp} Matricule ${agent.matricule.trim()} est ${employe} dans notre entreprise depuis le ${hire} et occupe actuellement le poste de ${agent.functionFr.trim()} au sein du département de ${agent.department.trim()}.`;
}

export function buildServiceBodyEn(
  shared: ServiceSharedFields,
  agent: Pick<
    ServiceAgentDraft,
    'name' | 'genreEn' | 'functionEn' | 'dateEmbauche' | 'matricule'
  >,
): string {
  const hod = formatAttestationAgentName(shared.hodName);
  const emp = formatAttestationAgentName(agent.name);
  const hire = formatServiceDocDate(agent.dateEmbauche, 'en');
  const hodFn =
    translateJobTitleToEnglish(shared.hodFunctionEn.trim() || shared.hodFunctionFr.trim()) ||
    shared.hodFunctionEn.trim() ||
    shared.hodFunctionFr.trim();
  return `I, the undersigned, ${hod}, ${hodFn} of PPC Barnet DRC Manufacturing SA, hereby certify that ${agent.genreEn.trim()} ${emp}, employee number ${agent.matricule.trim()} is employed in our company since ${hire}, and occupies the position of ${agent.functionEn.trim()}.`;
}

export function employeeToServiceAgent(
  employee: Employee,
  shared: ServiceSharedFields,
  hodGenre: string,
): ServiceAgentDraft {
  const genreFr = genreFrFromEmployee(employee);
  const genreEn = genreEnFromEmployee(employee);
  const draft: ServiceAgentDraft = {
    matricule: employee.matricule.trim(),
    name: formatAttestationAgentName(employee.nom),
    department: (employee.departement || '').trim(),
    dateEmbauche: toDateInputValue(employee.appointmentDate || ''),
    genreFr,
    genreEn,
    functionFr: localizeJobTitle(employee.jobTitle || employee.grade, 'fr', genreFr),
    functionEn: localizeJobTitle(employee.jobTitle || employee.grade, 'en', genreEn),
    bodyFr: '',
    bodyEn: '',
    bodyFrTouched: false,
    bodyEnTouched: false,
  };
  draft.bodyFr = buildServiceBodyFr(shared, draft, hodGenre);
  draft.bodyEn = buildServiceBodyEn(shared, draft);
  return draft;
}

export function refreshServiceAgentBodies(
  agents: ServiceAgentDraft[],
  shared: ServiceSharedFields,
  hodGenre: string,
): ServiceAgentDraft[] {
  return agents.map((agent) => ({
    ...agent,
    name: formatAttestationAgentName(agent.name),
    bodyFr: agent.bodyFrTouched ? agent.bodyFr : buildServiceBodyFr(shared, agent, hodGenre),
    bodyEn: agent.bodyEnTouched ? agent.bodyEn : buildServiceBodyEn(shared, agent),
  }));
}

function enHodFunction(shared: ServiceSharedFields): string {
  return (
    translateJobTitleToEnglish(shared.hodFunctionEn.trim() || shared.hodFunctionFr.trim()) ||
    shared.hodFunctionEn.trim() ||
    shared.hodFunctionFr.trim()
  );
}

export function serviceAgentToFormData(
  shared: ServiceSharedFields,
  agent: ServiceAgentDraft,
  language: 'fr' | 'en',
  hodGenre: string,
): ServiceAttestationFormData {
  return {
    language,
    documentDate: shared.documentDate,
    hodGenre,
    hodName: formatAttestationAgentName(shared.hodName),
    hodFunction: language === 'en' ? enHodFunction(shared) : shared.hodFunctionFr.trim(),
    employeeGenre: language === 'en' ? agent.genreEn : agent.genreFr,
    employeeName: formatAttestationAgentName(agent.name),
    employeeMatricule: agent.matricule,
    dateEmbauche: agent.dateEmbauche,
    employeeFunction: language === 'en' ? agent.functionEn : agent.functionFr,
    employeeDepartment: agent.department,
    bodyText: language === 'en' ? agent.bodyEn.trim() : agent.bodyFr.trim(),
  };
}

/** Un seul fichier bilingual : page FR puis page EN. */
export function serviceAgentToBilingualFormData(
  shared: ServiceSharedFields,
  agent: ServiceAgentDraft,
  hodGenre: string,
): ServiceAttestationFormData {
  return {
    language: 'both',
    documentDate: shared.documentDate,
    hodGenre,
    hodName: formatAttestationAgentName(shared.hodName),
    hodFunction: shared.hodFunctionFr.trim(),
    hodFunctionEn: enHodFunction(shared),
    employeeGenre: agent.genreFr,
    employeeGenreEn: agent.genreEn,
    employeeName: formatAttestationAgentName(agent.name),
    employeeMatricule: agent.matricule,
    dateEmbauche: agent.dateEmbauche,
    employeeFunction: agent.functionFr,
    employeeFunctionEn: agent.functionEn,
    employeeDepartment: agent.department,
    bodyText: agent.bodyFr.trim(),
    bodyTextEn: agent.bodyEn.trim(),
  };
}

/** Découpe un payload bilingual en formulaires FR / EN pour le remplissage. */
export function splitBilingualServiceForm(form: ServiceAttestationFormData): {
  fr: ServiceAttestationFormData;
  en: ServiceAttestationFormData;
} {
  const fr: ServiceAttestationFormData = {
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
  const en: ServiceAttestationFormData = {
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
