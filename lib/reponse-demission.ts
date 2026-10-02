/**
 * Réponse à une lettre de démission.
 *
 * Préavis employeur (capture conventionnelle) :
 * - Classifié B1–B5 : 15 jours + 7 jours par année entière d'ancienneté
 * - Maîtrise C1–C4 : 26 jours + 9 jours par année
 * - Cadre C5 et plus : 78 jours + 16 jours par année
 *
 * Une démission n'exécute que la moitié de ce total (« soit N jours »).
 * Un membre de la délégation syndicale exécute le double : (base + jours × années) × 2.
 * La période écrite part du lendemain de la lettre et compte les jours
 * du lundi au samedi (le dimanche est exclu), comme sur la lettre type
 * du 22 septembre 2026 au 27 novembre 2026 pour 58 jours.
 */

import { replaceDocxText } from './docx-fill';

export type NoticeBand = 'classifie' | 'maitrise' | 'cadre';

export interface NoticeBandRule {
  id: NoticeBand;
  label: string;
  grades: string;
  baseDays: number;
  perYearDays: number;
}

export const NOTICE_BANDS: Record<NoticeBand, NoticeBandRule> = {
  classifie: {
    id: 'classifie',
    label: 'Classifié',
    grades: 'B1–B5',
    baseDays: 15,
    perYearDays: 7,
  },
  maitrise: {
    id: 'maitrise',
    label: 'Maîtrise',
    grades: 'C1–C4',
    baseDays: 26,
    perYearDays: 9,
  },
  cadre: {
    id: 'cadre',
    label: 'Cadre',
    grades: 'C5 et plus',
    baseDays: 78,
    perYearDays: 16,
  },
};

export const NOTICE_BAND_OPTIONS = [
  NOTICE_BANDS.classifie,
  NOTICE_BANDS.maitrise,
  NOTICE_BANDS.cadre,
] as const;

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function noticeBandFromGrade(grade: string): NoticeBand | null {
  const raw = grade.trim().toUpperCase().replace(/\s+/g, '');
  const match = raw.match(/^([A-Z]+)(\d+)?$/);
  if (!match) return null;
  const letter = match[1];
  const level = match[2] ? Number(match[2]) : null;
  if (letter === 'A' || letter === 'B') return 'classifie';
  if (letter === 'C' && level !== null && level <= 4) return 'maitrise';
  if (letter === 'C' && level !== null && level >= 5) return 'cadre';
  if (letter === 'D' || letter === 'E' || letter === 'F') return 'cadre';
  return null;
}

export function isNoticeBand(value: string): value is NoticeBand {
  return value === 'classifie' || value === 'maitrise' || value === 'cadre';
}

/** jj/mm/aaaa, jj-mm-aaaa ou aaaa-mm-jj → date locale. */
export function parseFlexibleDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const date = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    if (
      date.getFullYear() !== Number(fr[3])
      || date.getMonth() !== Number(fr[2]) - 1
      || date.getDate() !== Number(fr[1])
    ) {
      return null;
    }
    return date;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  if (
    date.getFullYear() !== Number(iso[1])
    || date.getMonth() !== Number(iso[2]) - 1
    || date.getDate() !== Number(iso[3])
  ) {
    return null;
  }
  return date;
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Années entières de service, de date à date. */
export function completedServiceYears(hire: Date, asOf: Date): number {
  if (asOf < hire) return 0;
  let years = asOf.getFullYear() - hire.getFullYear();
  const anniversary = new Date(asOf.getFullYear(), hire.getMonth(), hire.getDate());
  if (asOf < anniversary) years -= 1;
  return Math.max(0, years);
}

export function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Jour inclusif où `workingDays` jours du lundi au samedi sont atteints. */
export function endOfMonSatPeriod(start: Date, workingDays: number): Date {
  if (workingDays <= 0) return new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let remaining = workingDays;
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let guard = 0; guard < 5000; guard += 1) {
    if (cursor.getDay() !== 0) {
      remaining -= 1;
      if (remaining === 0) return cursor;
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return cursor;
}

export function formatLongFr(date: Date): string {
  const day = date.getDate();
  const dayLabel = day === 1 ? '1er' : String(day);
  return `${dayLabel} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

function titleCaseToken(value: string): string {
  return value
    .split('-')
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1).toLocaleLowerCase('fr-FR');
    })
    .join('-');
}

/** « TULENGI KASIAMA REAGAN » → « TULENGI KASIAMA Reagan ». */
export function formatLetterName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0]!.toLocaleUpperCase('fr-FR');
  const family = parts
    .slice(0, -1)
    .map((part) => part.toLocaleUpperCase('fr-FR'))
    .join(' ');
  return `${family} ${titleCaseToken(parts[parts.length - 1]!)}`;
}

export function civilityFromGender(gender: string): 'Monsieur' | 'Madame' {
  return /^f/i.test(gender.trim()) ? 'Madame' : 'Monsieur';
}

export function employerSiteLabel(company: string, localisation: string): string {
  const companyName = company.trim();
  if (/ppc\s*barnet/i.test(companyName)) return 'PPC Barnet';
  if (companyName) return companyName;
  return localisation.trim();
}

export interface ResignationNotice {
  band: NoticeBand;
  years: number;
  baseDays: number;
  perYearDays: number;
  /** Préavis entier. La délégation syndicale le double avant la moitié de démission. */
  fullDays: number;
  /** Moitié du préavis entier, jours écrits dans la lettre. */
  servedDays: number;
  unionDelegate: boolean;
  periodStart: Date;
  periodEnd: Date;
}

export function computeResignationNotice(
  band: NoticeBand,
  hire: Date,
  resignationDate: Date,
  unionDelegate = false,
): ResignationNotice {
  const rule = NOTICE_BANDS[band];
  const years = completedServiceYears(hire, resignationDate);
  const statutory = rule.baseDays + rule.perYearDays * years;
  const fullDays = unionDelegate ? statutory * 2 : statutory;
  const servedDays = Math.round(fullDays / 2);
  const periodStart = addCalendarDays(resignationDate, 1);
  const periodEnd = endOfMonSatPeriod(periodStart, servedDays);
  return {
    band,
    years,
    baseDays: rule.baseDays,
    perYearDays: rule.perYearDays,
    fullDays,
    servedDays,
    unionDelegate,
    periodStart,
    periodEnd,
  };
}

export interface ReponseDemissionFillInput {
  civility: 'Monsieur' | 'Madame';
  letterName: string;
  jobTitle: string;
  matricule: string;
  site: string;
  documentDate: Date;
  resignationDate: Date;
  desiredEndDate: Date;
  notice: ResignationNotice;
}

/** Réécrit uniquement les passages variables de la lettre type. */
export function fillReponseDemissionXml(xml: string, input: ReponseDemissionFillInput): string {
  const site = input.site.trim() || '—';
  const jobTitle = input.jobTitle.trim() || '—';
  const letterName = input.letterName.trim() || '—';
  let out = xml;
  out = replaceDocxText(out, '07 octobre 2026', formatLongFr(input.desiredEndDate));
  out = replaceDocxText(
    out,
    '22 septembre 2026 au 27 novembre 2026',
    `${formatLongFr(input.notice.periodStart)} au ${formatLongFr(input.notice.periodEnd)}`,
  );
  out = replaceDocxText(
    out,
    'datée du 21 septembre 2026',
    `datée du ${formatLongFr(input.resignationDate)}`,
  );
  out = replaceDocxText(
    out,
    'Kinshasa, le 28 septembre 2026',
    `Kinshasa, le ${formatLongFr(input.documentDate)}`,
  );
  out = replaceDocxText(out, '58 jours', `${input.notice.servedDays} jours`);
  out = replaceDocxText(out, '116 jours', `${input.notice.fullDays} jours`);
  out = replaceDocxText(
    out,
    'Monsieur TULENGI KISIAMA Reagan',
    `${input.civility} ${letterName}`,
  );
  if (input.civility === 'Madame') {
    out = replaceDocxText(out, 'Monsieur', 'Madame', { occurrence: 'all' });
  }
  out = replaceDocxText(out, 'Fitter and Crane Specialist', jobTitle);
  out = replaceDocxText(out, '70000058', input.matricule.trim() || '—');
  out = replaceDocxText(out, 'PPC Barnet', site);
  return out;
}
