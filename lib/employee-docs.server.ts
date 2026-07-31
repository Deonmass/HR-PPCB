import 'server-only';

import path from 'path';
import { fillDocxTemplateToBuffer } from './docx-template';
import { fillDocxBlankAfterLabel, replaceDocxText } from './docx-fill';
import type { Employee } from './types';

const APPRAISAL_TEMPLATE_PATH = path.join(
  process.cwd(),
  'Excel',
  'templates',
  'appraisal',
  'Interim appraisal evaluation.docx',
);

const EXIT_TEMPLATE_DIR = path.join(process.cwd(), 'Excel', 'templates', 'exit');

export const EXIT_DOC_TYPES = [
  'clearance',
  'interview',
  'attestation-fin-service',
  'user-removal',
] as const;

export type ExitDocType = (typeof EXIT_DOC_TYPES)[number];

export const EXIT_DOC_LABELS: Record<ExitDocType, string> = {
  clearance: 'Employee exit clearance form',
  interview: 'Exit interview form',
  'attestation-fin-service': 'Attestation de fin de service',
  'user-removal': 'User removal form',
};

/* ── Dates ─────────────────────────────────────────────────────── */

function parseDisplayDate(value: string): Date | null {
  const trimmed = value.trim();
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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatSlash(date: Date | null): string {
  if (!date) return '—';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDot(date: Date | null): string {
  if (!date) return '—';
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatLongFr(date: Date | null): string {
  if (!date) return '—';
  const day = date.getDate();
  return `${day === 1 ? '1er' : day} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

function formatLongEn(date: Date | null): string {
  if (!date) return '—';
  return `${date.getDate()} ${MONTHS_EN[date.getMonth()]} ${date.getFullYear()}`;
}

function lengthOfService(start: Date | null, end: Date | null): string {
  if (!start || !end || end < start) return '—';
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
  parts.push(`${months} month${months > 1 ? 's' : ''}`);
  return parts.join(', ');
}

function civilite(gender: string): string {
  return /^f/i.test(gender.trim()) ? 'Madame' : 'Monsieur';
}

function safe(value: string | null | undefined, fallback = '—'): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ── Interim appraisal ─────────────────────────────────────────── */

export interface GeneratedDoc {
  fileName: string;
  buffer: Buffer;
}

export async function generateInterimAppraisal(employee: Employee): Promise<GeneratedDoc> {
  const buffer = await fillDocxTemplateToBuffer(APPRAISAL_TEMPLATE_PATH, (xml) => {
    let out = xml;
    out = fillDocxBlankAfterLabel(out, 'the employee: ', safe(employee.nom));
    out = fillDocxBlankAfterLabel(out, 'Position: ', safe(employee.jobTitle || employee.position));
    return out;
  });
  return {
    fileName: sanitizeFileName(`Interim appraisal evaluation - ${employee.nom}.docx`),
    buffer,
  };
}

/* ── Exit documents ────────────────────────────────────────────── */

export interface ExitDocOptions {
  /** Dernier jour de travail / date de sortie (affichage jj/mm/aaaa ou ISO). */
  exitDate?: string;
  /** Date du document (défaut : aujourd'hui). */
  documentDate?: string;
}

interface ExitContext {
  employee: Employee;
  hireDate: Date | null;
  exitDate: Date | null;
  documentDate: Date;
}

function buildExitContext(employee: Employee, options: ExitDocOptions): ExitContext {
  return {
    employee,
    hireDate: parseDisplayDate(employee.appointmentDate),
    exitDate: options.exitDate
      ? parseDisplayDate(options.exitDate)
      : parseDisplayDate(employee.dateFinContrat),
    documentDate: (options.documentDate ? parseDisplayDate(options.documentDate) : null) ?? new Date(),
  };
}

/** Employee exit clearance form — blancs pointillés après libellés. */
function fillClearance(xml: string, ctx: ExitContext): string {
  const { employee } = ctx;
  let out = xml;
  out = fillDocxBlankAfterLabel(out, 'Name: ', safe(employee.nom));
  out = fillDocxBlankAfterLabel(out, 'Last working day: ', formatSlash(ctx.exitDate));
  out = fillDocxBlankAfterLabel(out, 'Company joined date: ', formatSlash(ctx.hireDate));
  out = fillDocxBlankAfterLabel(out, 'Last date service: ', formatSlash(ctx.exitDate));
  out = fillDocxBlankAfterLabel(out, 'Designation/ Position: ', safe(employee.jobTitle || employee.position));
  out = fillDocxBlankAfterLabel(out, 'Employee number: ', safe(employee.matricule));
  out = fillDocxBlankAfterLabel(out, 'Department :', safe(employee.departement));
  return out;
}

/** Exit interview form — remplace les valeurs d'exemple du modèle. */
function fillInterview(xml: string, ctx: ExitContext): string {
  const { employee } = ctx;
  let out = xml;
  out = replaceDocxText(out, 'Ndusha Clement', safe(employee.nom));
  out = replaceDocxText(out, '70000273', safe(employee.matricule));
  out = replaceDocxText(out, '18 December 1999', formatLongEn(parseDisplayDate(employee.dateOfBirth)));
  out = replaceDocxText(out, 'Process Technician', safe(employee.jobTitle || employee.position));
  out = replaceDocxText(out, 'Optimization', safe(employee.departement));
  out = replaceDocxText(out, 'Zamba', safe(employee.localisation));
  out = replaceDocxText(out, '2 year, 2 months', lengthOfService(ctx.hireDate, ctx.exitDate));
  out = replaceDocxText(out, '03/06/2024', formatSlash(ctx.hireDate));
  out = replaceDocxText(out, '16/07/2026', formatSlash(ctx.exitDate));
  return out;
}

/** Attestation de fin de service — remplace les valeurs d'exemple. */
function fillAttestation(xml: string, ctx: ExitContext): string {
  const { employee } = ctx;
  let out = xml;
  out = replaceDocxText(
    out,
    'Monsieur BAZOLA NDELO Serge',
    `${civilite(employee.gender)} ${safe(employee.nom)}`,
  );
  out = replaceDocxText(out, '102329119830718004', safe(employee.cnss, '…………………'));
  out = replaceDocxText(out, '03 novembre 2025', formatLongFr(ctx.hireDate));
  // 1re occurrence : fin de service — 2e : « Fait à Kinshasa, le … ».
  out = replaceDocxText(out, '2 mai 2026', formatLongFr(ctx.exitDate), { occurrence: 1 });
  out = replaceDocxText(out, '2 mai 2026', formatLongFr(ctx.documentDate), { occurrence: 1 });
  out = replaceDocxText(out, 'Head of Sales & Marketing', safe(employee.jobTitle || employee.position));
  return out;
}

/** User removal form — remplace les valeurs d'exemple du tableau IT. */
function fillUserRemoval(xml: string, ctx: ExitContext): string {
  const { employee } = ctx;
  const manager = safe(employee.lineManagerName, '');
  let out = xml;
  out = replaceDocxText(out, 'NDUSHA CLEMENT', safe(employee.nom).toUpperCase());
  out = replaceDocxText(out, 'Ndusha Clement', safe(employee.nom));
  out = replaceDocxText(out, 'Process Technician', safe(employee.jobTitle || employee.position));
  out = replaceDocxText(out, 'Zamba', safe(employee.localisation));
  out = replaceDocxText(out, 'Optimization', safe(employee.departement));
  out = replaceDocxText(out, 'PARICIAN UCCHI', manager.toUpperCase());
  out = replaceDocxText(out, 'Patrick Kahasha Mbasha', manager, { optional: true });
  out = replaceDocxText(out, 'KM5910', safe(employee.centreCout));
  // 1re occurrence : Application Date — 2e : Termination Date.
  out = replaceDocxText(out, '16.07.2026', formatDot(ctx.documentDate), { occurrence: 1 });
  out = replaceDocxText(out, '16.07.2026', formatDot(ctx.exitDate), { occurrence: 1 });
  // Dates de signature (manager / employé / RH).
  out = replaceDocxText(out, '15.07.2026', formatDot(ctx.documentDate), { occurrence: 'all' });
  return out;
}

const EXIT_TEMPLATE_FILES: Record<ExitDocType, string> = {
  clearance: 'Employee exit clearance form.docx',
  interview: 'Exit interview form.docx',
  'attestation-fin-service': 'Attestation de fin de service.docx',
  'user-removal': 'User Removal Form.docx',
};

const EXIT_FILLERS: Record<ExitDocType, (xml: string, ctx: ExitContext) => string> = {
  clearance: fillClearance,
  interview: fillInterview,
  'attestation-fin-service': fillAttestation,
  'user-removal': fillUserRemoval,
};

export async function generateExitDocument(
  type: ExitDocType,
  employee: Employee,
  options: ExitDocOptions = {},
): Promise<GeneratedDoc> {
  const templatePath = path.join(EXIT_TEMPLATE_DIR, EXIT_TEMPLATE_FILES[type]);
  const ctx = buildExitContext(employee, options);
  const buffer = await fillDocxTemplateToBuffer(templatePath, (xml) => EXIT_FILLERS[type](xml, ctx));
  return {
    fileName: sanitizeFileName(`${EXIT_DOC_LABELS[type]} - ${employee.nom}.docx`),
    buffer,
  };
}
