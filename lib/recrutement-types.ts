/** Suivi des recrutements (replacements / new positions) lié au catalogue Postes. */

export const RECRUITMENT_CATEGORIES = ['replacement', 'new'] as const;
export type RecrutementCategory = (typeof RECRUITMENT_CATEGORIES)[number];

export const RECRUITMENT_STATUSES = ['Not started', 'Started', 'Ongoing', 'Done'] as const;
export type RecrutementStatus = (typeof RECRUITMENT_STATUSES)[number];

export const RECRUITMENT_BUDGETED = ['Yes', 'No'] as const;
export const RECRUITMENT_CONTRACTS = ['Permanent', 'Outsourced'] as const;

export interface RecrutementOccupant {
  matricule: string;
  nom: string;
  localisation: string;
  grade: string;
  appointmentDate: string;
  appointmentIso: string;
}

export interface RecrutementRow {
  id: string;
  category: RecrutementCategory;
  position: string;
  grade: string;
  status: string;
  comments: string;
  budgeted: string;
  department: string;
  location: string;
  contractType: string;
  /** Date de recrutement saisie (ISO YYYY-MM-DD). */
  filledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface RecrutementInput {
  category: RecrutementCategory;
  position: string;
  grade?: string;
  status?: string;
  comments?: string;
  budgeted?: string;
  department?: string;
  location?: string;
  contractType?: string;
  filledAt?: string;
}

export interface RecrutementRowEnriched extends RecrutementRow {
  slots: number;
  catalogTitle: string;
  catalogMatch: boolean;
  occupants: RecrutementOccupant[];
  vacantHeadcount: number;
  /** Dates de recrutement affichées (occupants août + filledAt). */
  recruitmentDates: string[];
  filledInAugust: boolean;
  suggestedStatus: RecrutementStatus | '';
}

export interface RecrutementCatalogOption {
  title: string;
  department: string;
  location: string;
  grade: string;
  occupants: number;
  source: 'catalogue' | 'vacant';
}

export interface RecrutementDashboard {
  total: number;
  replacements: number;
  newPositions: number;
  ongoing: number;
  started: number;
  done: number;
  notStarted: number;
  filledAugust: number;
  catalogLinked: number;
}

export interface RecrutementBundle {
  rows: RecrutementRowEnriched[];
  dashboard: RecrutementDashboard;
  catalog: RecrutementCatalogOption[];
}

export function isRecrutementCategory(value: string): value is RecrutementCategory {
  return (RECRUITMENT_CATEGORIES as readonly string[]).includes(value);
}

export function stripExcoMarkup(value: string): string {
  return String(value || '')
    .replace(/\[\[|\]\]/g, '')
    .trim();
}

export function normalizeRecrutementStatus(value: string): RecrutementStatus | string {
  const raw = stripExcoMarkup(value);
  const compact = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (compact === 'not started' || compact === 'notstarted') return 'Not started';
  if (compact === 'started') return 'Started';
  if (compact === 'ongoing' || compact === 'on going') return 'Ongoing';
  if (compact === 'done') return 'Done';
  return raw;
}

export function normalizeBudgeted(value: string): string {
  const v = stripExcoMarkup(value).toLowerCase();
  if (v === 'yes' || v === 'oui') return 'Yes';
  if (v === 'no' || v === 'non') return 'No';
  return stripExcoMarkup(value);
}

export function parseSlotsFromPosition(position: string): { title: string; slots: number } {
  const raw = stripExcoMarkup(position);
  const match = raw.match(/\((\d+)\)\s*$/);
  const slots = match ? Math.max(1, Number(match[1]) || 1) : 1;
  const title = raw.replace(/\((\d+)\)\s*$/, '').trim() || raw;
  return { title, slots };
}

export function formatDisplayDate(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function toIsoDate(value: string): string {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    const d = fr[1].padStart(2, '0');
    const m = fr[2].padStart(2, '0');
    return `${fr[3]}-${m}-${d}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isAugust2026(iso: string): boolean {
  return /^\d{4}-08-/.test(iso) && iso.startsWith('2026-08');
}

export function categoryLabel(category: RecrutementCategory): string {
  return category === 'replacement' ? 'Replacements' : 'New positions';
}
