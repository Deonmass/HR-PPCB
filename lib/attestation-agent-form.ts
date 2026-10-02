import { formatAttestationAgentName } from './format-display-name';
import { localizeJobTitle } from './job-title-i18n';
import type { Employee } from './types';

export type AttestationAgentDraft = {
  matricule: string;
  name: string;
  genre: string;
  function: string;
  department: string;
  dateEmbauche: string;
};

function genreFromEmployee(employee: Employee, language: 'fr' | 'en'): string {
  if (/^f/i.test(employee.gender)) return language === 'en' ? 'Ms.' : 'Madame';
  if (/^m/i.test(employee.gender)) return language === 'en' ? 'Mr.' : 'Monsieur';
  return language === 'en' ? 'Mr.' : 'Monsieur';
}

export function mapAttestationGenre(genre: string, language: 'fr' | 'en'): string {
  if (language === 'en') {
    if (/madame|mme|mrs|ms|mademoiselle|mlle/i.test(genre)) return 'Ms.';
    return 'Mr.';
  }
  if (/mrs|ms|madame|mme/i.test(genre)) return 'Madame';
  if (/miss|mademoiselle|mlle/i.test(genre)) return 'Mademoiselle';
  return 'Monsieur';
}

export function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}`;
}

export function employeeToAttestationAgent(
  employee: Employee,
  language: 'fr' | 'en',
): AttestationAgentDraft {
  const genre = genreFromEmployee(employee, language);
  return {
    matricule: employee.matricule.trim(),
    name: formatAttestationAgentName(employee.nom),
    genre,
    function: localizeJobTitle(employee.jobTitle || employee.grade, language, genre),
    department: (employee.departement || '').trim(),
    dateEmbauche: toDateInputValue(employee.appointmentDate || ''),
  };
}

export function relocalizeAttestationAgents(
  agents: AttestationAgentDraft[],
  employees: Employee[],
  language: 'fr' | 'en',
): AttestationAgentDraft[] {
  return agents.map((agent) => {
    const emp = employees.find((e) => e.matricule.trim() === agent.matricule.trim());
    if (emp) return employeeToAttestationAgent(emp, language);
    return {
      ...agent,
      name: formatAttestationAgentName(agent.name),
      genre: mapAttestationGenre(agent.genre, language),
    };
  });
}

export function applyAgentToEmployeeFields(agent: AttestationAgentDraft): {
  employeeGenre: string;
  employeeName: string;
  employeeMatricule: string;
  employeeFunction: string;
  employeeDepartment: string;
  dateEmbauche: string;
} {
  return {
    employeeGenre: agent.genre,
    employeeName: formatAttestationAgentName(agent.name),
    employeeMatricule: agent.matricule,
    employeeFunction: agent.function,
    employeeDepartment: agent.department,
    dateEmbauche: agent.dateEmbauche,
  };
}

export function clearEmployeeFields(): {
  employeeGenre: string;
  employeeName: string;
  employeeMatricule: string;
  employeeFunction: string;
  employeeDepartment: string;
  dateEmbauche: string;
} {
  return {
    employeeGenre: 'Monsieur',
    employeeName: '',
    employeeMatricule: '',
    employeeFunction: '',
    employeeDepartment: '',
    dateEmbauche: '',
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
