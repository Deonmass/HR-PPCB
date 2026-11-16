export const CONFIRMATION_SIGNATORY_NAME = 'Carine EWULI SUKA';
export const CONFIRMATION_SIGNATORY_TITLE = 'Directrice des Ressources Humaines';

export interface ConfirmationLetterInput {
  matricule: string;
  employeeName: string;
  familyName: string;
  civility: 'Monsieur' | 'Madame';
  jobTitle: string;
  companyShort: string;
  companyLegal: string;
  city: string;
  letterDate: string;
  confirmationDate: string;
  signatoryName: string;
  signatoryTitle: string;
}

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function parseIsoOrDisplayDate(value: string): Date | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const date = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function toIsoDateLocal(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIsoDate(): string {
  return toIsoDateLocal(new Date());
}

/** En-tête : « 02 novembre 2026 ». */
export function formatLetterHeaderDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

/** Corps : « 1 novembre 2026 ». */
export function formatLetterEffectDate(date: Date): string {
  return `${date.getDate()} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

export function confirmationCompanyNames(company: string): { short: string; legal: string } {
  const raw = company.trim();
  const isQuarry = /quarr/i.test(raw);
  return {
    short: 'PPC Barnet DRC',
    legal: isQuarry ? 'PPC Barnet DRC Quarrying S.A' : 'PPC Barnet DRC Manufacturing S.A',
  };
}

export function confirmationCityFromLocalisation(localisation: string): string {
  const loc = localisation.trim();
  if (/zamba/i.test(loc)) return 'Kinshasa';
  if (loc) {
    const first = loc.split(/[/,]/)[0]?.trim();
    if (first) return first;
  }
  return 'Kinshasa';
}
