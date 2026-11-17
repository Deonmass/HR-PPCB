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
  /** Début de la période d’essai (date d’embauche). */
  trialStartDate: string;
  /** Durée d’essai en mois, depuis la fiche agent. */
  trialMonths: number | null;
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

const TRIAL_MONTHS_WORDS = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze',
];

const BLANK_FIELD = '………………';

/** Mois entiers entre deux dates (la date de fin est exclue si le jour n’est pas atteint). */
export function wholeMonthsBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end || end < start) return null;
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const total = years * 12 + months;
  return total > 0 ? total : null;
}

/** « trois (3) mois prévus » — mois entier en toutes lettres, sinon « 3,5 mois prévus ». */
export function formatTrialMonthsPhrase(months: number | null | undefined): string {
  if (months == null || !Number.isFinite(months) || months <= 0) {
    return `${BLANK_FIELD} mois prévus`;
  }
  const rounded = Math.round(months * 100) / 100;
  if (!Number.isInteger(rounded) || rounded > 12) {
    return `${String(rounded).replace('.', ',')} mois prévus`;
  }
  const words = TRIAL_MONTHS_WORDS[rounded] || String(rounded);
  const accord = rounded === 1 ? 'prévu' : 'prévus';
  return `${words} (${rounded}) mois ${accord}`;
}

/** « S.A » du référentiel → « S.A. » en fin de phrase. */
export function companyLegalWithPeriod(legal: string): string {
  const trimmed = legal.trim();
  if (!trimmed) return 'PPC Barnet DRC Manufacturing S.A.';
  if (/S\.A$/i.test(trimmed)) return `${trimmed}.`;
  return trimmed;
}

export interface ConfirmationTextPart {
  text: string;
  bold?: boolean;
}

export function buildConfirmationParagraphParts(input: {
  trialMonths: number | null | undefined;
  trialStartLabel: string;
  jobTitle: string;
  companyLegal: string;
  effectLabel: string;
}): ConfirmationTextPart[] {
  const duration = formatTrialMonthsPhrase(input.trialMonths);
  const start = input.trialStartLabel.trim() || BLANK_FIELD;
  const job = input.jobTitle.trim() || BLANK_FIELD;
  const company = companyLegalWithPeriod(input.companyLegal);
  const effect = input.effectLabel.trim() || BLANK_FIELD;
  return [
    {
      text:
        `Suite à l’évaluation satisfaisante de vos performances au cours de la période d’essai de ${duration} par votre contrat de travail, débutée le ${start}, nous avons le plaisir de vous confirmer dans vos fonctions de `,
    },
    { text: job, bold: true },
    { text: ' au sein de ' },
    { text: company, bold: true },
    { text: ', avec effet au ' },
    { text: effect, bold: true },
    { text: '.' },
  ];
}

export function buildConfirmationParagraph(input: {
  trialMonths: number | null | undefined;
  trialStartLabel: string;
  jobTitle: string;
  companyLegal: string;
  effectLabel: string;
}): string {
  return buildConfirmationParagraphParts(input).map((part) => part.text).join('');
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
