import {
  computeFinPeriodeEssai,
  displayDateSortKey,
  parseOptionalNumber,
} from './employee-columns';
import type { Employee } from './types';

/** Statuts d'évaluation période d'essai (fichier Trial period). */
export const ESSAI_STATUTS_EVAL = ['Ongoing', 'On time', 'Overdue', 'Done'] as const;
export type EssaiStatutEval = (typeof ESSAI_STATUTS_EVAL)[number];

export const ESSAI_ACTIONS = [
  'Evaluation Done',
  'The Interim approvisal evaluation form sent',
  'The Interim approvisal evaluation sent',
  'The Interim approvisal evaluation to be sent',
  "The Interim approvisal evaluation didn't be sent",
] as const;

export const ESSAI_COMMENTAIRES = [
  'Approved',
  'Not Approved',
  'No reply',
  'Doubtful-PIP',
  'Confirmation letter done',
] as const;

/** Alerte évaluation : J-30 avant la fin de période d'essai. */
export const TRIAL_EVAL_ALERT_DAYS = 30;

function parseDisplayDateParts(value: string): { y: number; m: number; d: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) return { d: Number(fr[1]), m: Number(fr[2]), y: Number(fr[3]) };
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  return null;
}

function toDisplayDate(y: number, m: number, d: number): string {
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}/${mm}/${y}`;
}

/** Soustrait N mois à une date affichée. */
export function subtractMonthsFromDisplayDate(value: string, months: number): string {
  const parts = parseDisplayDateParts(value);
  if (!parts || !Number.isFinite(months) || months <= 0) return '';
  let year = parts.y;
  let monthIndex = parts.m - 1 - Math.trunc(months);
  year += Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(parts.d, lastDay);
  return toDisplayDate(year, monthIndex + 1, day);
}

export function daysUntilDisplayDate(value: string, asOf: Date = new Date()): number | null {
  const parts = parseDisplayDateParts(value);
  if (!parts) return null;
  const target = new Date(parts.y, parts.m - 1, parts.d);
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

/** Date affichée strictement avant aujourd’hui. */
export function isDisplayDatePast(value: string, asOf: Date = new Date()): boolean {
  const days = daysUntilDisplayDate(value, asOf);
  return days != null && days < 0;
}

/** CDD dont la fin de contrat est déjà dépassée. */
export function isCddOverdue(
  employee: Pick<Employee, 'typeContrat' | 'appointmentDate' | 'dureeContratMois' | 'dateFinContrat' | 'statut'>,
  asOf: Date = new Date(),
): boolean {
  if (!isCddEmployee(employee)) return false;
  if (/^inact/i.test(String(employee.statut || '').trim())) return false;
  return isDisplayDatePast(resolveDateFinContrat(employee), asOf);
}

/** Période d’essai dont la fin est déjà dépassée (hors Done). */
export function isTrialOverdue(
  employee: Pick<
    Employee,
    'appointmentDate' | 'periodeEssaiMois' | 'dateFinPeriodeEssai' | 'essaiStatutEval' | 'statut'
  >,
  asOf: Date = new Date(),
): boolean {
  if (!isInActiveTrialPeriod(employee)) return false;
  return isDisplayDatePast(resolveDateFinPeriodeEssai(employee), asOf);
}

export function isCddEmployee(employee: Pick<Employee, 'typeContrat'>): boolean {
  return /^cdd$/i.test(String(employee.typeContrat || '').trim());
}

/** A une période d'essai renseignée (mois > 0 ou date de fin). */
export function hasTrialPeriod(employee: Pick<Employee, 'periodeEssaiMois' | 'dateFinPeriodeEssai'>): boolean {
  const mois = employee.periodeEssaiMois;
  if (mois != null && Number.isFinite(mois) && mois > 0) return true;
  return displayDateSortKey(employee.dateFinPeriodeEssai || '') > 0;
}

/**
 * Suivi période d'essai (onglet / stats) :
 * période renseignée, commentaire ≠ Approved, collaborateur actif.
 * Inclut les dossiers Overdue (fin d'essai dépassée).
 */
export function isEssaiCommentApproved(
  employee: Pick<Employee, 'essaiCommentaire'>,
): boolean {
  return /^approved$/i.test(String(employee.essaiCommentaire || '').trim());
}

export function isInActiveTrialPeriod(
  employee: Pick<Employee, 'periodeEssaiMois' | 'dateFinPeriodeEssai' | 'essaiCommentaire' | 'statut'>,
): boolean {
  if (!hasTrialPeriod(employee)) return false;
  if (isEssaiCommentApproved(employee)) return false;
  if (/^inact/i.test(String(employee.statut || '').trim())) return false;
  return true;
}

/** Échéance d'évaluation : champ stocké, sinon 1 mois avant fin d'essai. */
export function resolveEssaiEcheanceEval(
  employee: Pick<Employee, 'essaiEcheanceEval' | 'appointmentDate' | 'periodeEssaiMois' | 'dateFinPeriodeEssai'>,
): string {
  const stored = String(employee.essaiEcheanceEval || '').trim();
  if (stored) return stored;
  return subtractMonthsFromDisplayDate(resolveDateFinPeriodeEssai(employee), 1);
}

/**
 * Alerte J-30 : fin de période d'essai dans ≤ 30 jours (et pas Approved).
 */
export function isTrialEvalAlert(
  employee: Pick<
    Employee,
    'appointmentDate' | 'periodeEssaiMois' | 'dateFinPeriodeEssai' | 'essaiCommentaire' | 'statut'
  >,
  asOf: Date = new Date(),
  withinDays: number = TRIAL_EVAL_ALERT_DAYS,
): boolean {
  if (!isInActiveTrialPeriod(employee)) return false;
  const days = daysUntilDisplayDate(resolveDateFinPeriodeEssai(employee), asOf);
  if (days == null) return false;
  return days >= 0 && days <= withinDays;
}

/** Fin d'essai dérivée de la date d'embauche + mois (source de vérité RH). */
export function resolveDateFinPeriodeEssai(
  employee: Pick<Employee, 'appointmentDate' | 'periodeEssaiMois' | 'dateFinPeriodeEssai'>,
): string {
  const computed = computeFinPeriodeEssai(
    employee.appointmentDate || '',
    employee.periodeEssaiMois,
  );
  return computed || String(employee.dateFinPeriodeEssai || '').trim();
}

/**
 * Statut évaluation auto selon la fin d'essai :
 * - Overdue : fin déjà dépassée
 * - On time : fin dans ≤ 30 jours
 * - Ongoing : sinon (ou pas de date)
 */
export function resolveEssaiStatutEval(
  employee: Pick<Employee, 'appointmentDate' | 'periodeEssaiMois' | 'dateFinPeriodeEssai'>,
  asOf: Date = new Date(),
): EssaiStatutEval {
  const fin = resolveDateFinPeriodeEssai(employee);
  const days = daysUntilDisplayDate(fin, asOf);
  if (days == null) return 'Ongoing';
  if (days < 0) return 'Overdue';
  if (days <= TRIAL_EVAL_ALERT_DAYS) return 'On time';
  return 'Ongoing';
}

/** Fin de contrat : durée + embauche si disponible, sinon date stockée. */
export function resolveDateFinContrat(
  employee: Pick<Employee, 'appointmentDate' | 'dureeContratMois' | 'dateFinContrat'>,
): string {
  const computed = computeFinContratFromDuree(
    employee.appointmentDate || '',
    employee.dureeContratMois,
  );
  const duree = employee.dureeContratMois;
  if (duree != null && Number.isFinite(duree) && duree > 0 && computed) {
    return computed;
  }
  return String(employee.dateFinContrat || '').trim() || computed || '';
}

/** Date d'alerte CDD = 1 mois avant la fin de contrat. */
export function resolveCddAlerteDate(
  employee: Pick<Employee, 'appointmentDate' | 'dureeContratMois' | 'dateFinContrat'>,
): string {
  return subtractMonthsFromDisplayDate(resolveDateFinContrat(employee), 1);
}

/**
 * Alerte J-30 : fin de CDD dans ≤ 30 jours.
 */
export function isCddEndAlert(
  employee: Pick<Employee, 'typeContrat' | 'appointmentDate' | 'dureeContratMois' | 'dateFinContrat' | 'statut'>,
  asOf: Date = new Date(),
  withinDays: number = TRIAL_EVAL_ALERT_DAYS,
): boolean {
  if (!isCddEmployee(employee)) return false;
  if (/^inact/i.test(String(employee.statut || '').trim())) return false;
  const days = daysUntilDisplayDate(resolveDateFinContrat(employee), asOf);
  if (days == null) return false;
  return days >= 0 && days <= withinDays;
}

/** Suivi période d'essai (inclut Done) — onglet liste. */
export function isTrialTrackedEmployee(
  employee: Pick<Employee, 'periodeEssaiMois' | 'dateFinPeriodeEssai' | 'statut'>,
): boolean {
  if (!hasTrialPeriod(employee)) return false;
  if (/^inact/i.test(String(employee.statut || '').trim())) return false;
  return true;
}

export function essaiStatutClass(statut: string | null | undefined): string {
  const raw = String(statut || 'ongoing').trim().toLowerCase().replace(/\s+/g, '-');
  if (raw === 'done') return 'is-done';
  if (raw === 'overdue') return 'is-overdue';
  if (raw === 'on-time') return 'is-on-time';
  if (raw === 'ongoing') return 'is-ongoing';
  return `is-${raw || 'ongoing'}`;
}

export function isCdiEmployee(employee: Pick<Employee, 'typeContrat'>): boolean {
  return /^cdi$/i.test(String(employee.typeContrat || '').trim());
}

export function hasCddVersCdiHistory(
  employee: Pick<Employee, 'datePassageCdi' | 'cddHistoriqueDebut' | 'cddHistoriqueFin'>,
): boolean {
  return Boolean(
    String(employee.datePassageCdi || '').trim()
    || String(employee.cddHistoriqueDebut || '').trim()
    || String(employee.cddHistoriqueFin || '').trim(),
  );
}

/**
 * Conserve l'historique CDD lors d'un passage CDD → CDI
 * (changement de type ou évaluation Done alors que le collaborateur est / devient CDI).
 */
export function applyCddVersCdiHistory(
  previous: Partial<Employee> | null | undefined,
  next: Employee,
): Employee {
  const prevType = String(previous?.typeContrat || '').trim().toUpperCase();
  const nextType = String(next.typeContrat || '').trim().toUpperCase();
  const already = hasCddVersCdiHistory(next);
  const becameCdi = nextType === 'CDI' && prevType === 'CDD';

  if (already || !becameCdi) {
    return {
      ...next,
      cddHistoriqueDebut: next.cddHistoriqueDebut || '',
      cddHistoriqueFin: next.cddHistoriqueFin || '',
      cddHistoriqueDureeMois: next.cddHistoriqueDureeMois ?? null,
      datePassageCdi: next.datePassageCdi || '',
    };
  }

  const source = previous ?? next;
  return {
    ...next,
    cddHistoriqueDebut:
      next.cddHistoriqueDebut
      || source.appointmentDate
      || next.appointmentDate
      || '',
    cddHistoriqueFin:
      next.cddHistoriqueFin
      || source.dateFinContrat
      || next.dateFinContrat
      || todayDisplaySafe(),
    cddHistoriqueDureeMois:
      next.cddHistoriqueDureeMois
      ?? source.dureeContratMois
      ?? next.dureeContratMois
      ?? null,
    datePassageCdi: next.datePassageCdi || todayDisplaySafe(),
  };
}

function todayDisplaySafe(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Durée contrat : champ stocké, sinon estimée entre embauche et fin de contrat. */
export function resolveDureeContratMois(
  employee: Pick<Employee, 'dureeContratMois' | 'appointmentDate' | 'dateFinContrat'>,
): number | null {
  if (employee.dureeContratMois != null && Number.isFinite(employee.dureeContratMois)) {
    return employee.dureeContratMois;
  }
  const start = parseDisplayDateParts(employee.appointmentDate || '');
  const end = parseDisplayDateParts(employee.dateFinContrat || '');
  if (!start || !end) return null;
  const months =
    (end.y - start.y) * 12 + (end.m - start.m) + (end.d >= start.d ? 0 : -1);
  return months > 0 ? months : null;
}

export function computeFinContratFromDuree(
  appointmentDate: string,
  dureeContratMois: number | null | undefined,
): string {
  return computeFinPeriodeEssai(appointmentDate, dureeContratMois);
}

export function normalizeEssaiStatutEval(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hit = ESSAI_STATUTS_EVAL.find((s) => s.toLowerCase() === raw.toLowerCase());
  return hit ?? raw;
}

export function parseOptionalDuree(value: unknown): number | null {
  return parseOptionalNumber(value);
}
