import 'server-only';

import fontkit from '@pdf-lib/fontkit';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { splitPersonName, formatMaritalStatusFr } from './contrat-standard-family';
import { resolveClassification } from './convention-collective-rules';
import type { Dependant } from './dependants-types';
import {
  listFamilyDependants,
  parseDependantBirthDate,
} from './dependants-utils';
import { PPC_EMPLOYER_INSS, PPC_LETTERHEAD_ADDRESS_LINES } from './ppc-letterhead-address';
import { toWinAnsi } from './pdf-winansi';
import type { Employee } from './types';
import { isDmtMotifId, suggestDmtMotif, formatDmtSalary, type DmtMotifId } from './declaration-dmt-motif';

export { DMT_MOTIFS, DECLARATION_BATCH_LIMIT, isDmtMotifId, suggestDmtMotif } from './declaration-dmt-motif';
export type { DmtMotifId };

const TEMPLATE_DIR = path.join(process.cwd(), 'Excel', 'templates', 'declarations');

export const COMPOSITION_FAMILIALE_TEMPLATE = path.join(
  TEMPLATE_DIR,
  'DECLARATION-DE-COMPOSITION-FAMILIALE-DU-TRAVAILLEUR.pdf',
);

export const MOUVEMENT_TRAVAILLEUR_TEMPLATE = path.join(
  TEMPLATE_DIR,
  'DECLARATION-DE-MOUVEMENT-DE-TRAVAILLEUR.pdf',
);

export interface DeclarationFamilyMember {
  fullName: string;
  day: string;
  month: string;
  year: string;
  birthPlace: string;
  sex: string;
  filiation: string;
}

export interface DeclarationFamilyContext {
  spouse: DeclarationFamilyMember | null;
  children: DeclarationFamilyMember[];
}

export interface GeneratedPdf {
  fileName: string;
  buffer: Buffer;
}

export async function mergeGeneratedPdfs(
  files: GeneratedPdf[],
  fileName: string,
): Promise<GeneratedPdf> {
  if (files.length === 1) {
    return { fileName: files[0].fileName, buffer: files[0].buffer };
  }
  const merged = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(file.buffer);
    const copied = await merged.copyPages(source, source.getPageIndices());
    for (const page of copied) merged.addPage(page);
  }
  return {
    fileName,
    buffer: Buffer.from(await merged.save()),
  };
}

const INK = rgb(0, 0, 0);
/** Encre stylo bille pour le DMT (valeurs manuscrites). */
const DMT_INK = rgb(0.05, 0.22, 0.72);
const WHITE = rgb(1, 1, 1);
/** Corps du MOD. F6 (ArialMT 10,1 pt). */
const F6_SIZE = 10.1;
/** En-tête Calibri du MOD. F6. */
const F6_HEADER_SIZE = 9.1;
/** Corps du DMT (Arial 9,1 pt). */
const DMT_SIZE = 9.1;
const F6_DOTS_END = 560;
const DMT_DOTS_END = 425;
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const ARIAL_CANDIDATES = [
  'C:\\Windows\\Fonts\\arial.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
];

let cachedArialBytes: Uint8Array | null | undefined;

async function loadArialBytes(): Promise<Uint8Array | null> {
  if (cachedArialBytes !== undefined) return cachedArialBytes;
  for (const candidate of ARIAL_CANDIDATES) {
    try {
      cachedArialBytes = new Uint8Array(await fs.readFile(candidate));
      return cachedArialBytes;
    } catch {
      /* try next system font */
    }
  }
  cachedArialBytes = null;
  return null;
}

async function embedFormFont(pdf: PDFDocument): Promise<{ font: PDFFont; winAnsi: boolean }> {
  const bytes = await loadArialBytes();
  if (bytes) {
    pdf.registerFontkit(fontkit);
    return { font: await pdf.embedFont(bytes, { subset: true }), winAnsi: false };
  }
  return { font: await pdf.embedFont(StandardFonts.Helvetica), winAnsi: true };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDate(raw: string): Date | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const dependant = parseDependantBirthDate(trimmed);
  if (dependant) return dependant;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatSlash(raw: string): string {
  const date = parseDate(raw);
  if (!date) return (raw || '').trim();
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function splitYmd(raw: string): { day: string; month: string; year: string } {
  const date = parseDate(raw);
  if (!date) return { day: '', month: '', year: '' };
  return {
    day: pad2(date.getDate()),
    month: pad2(date.getMonth() + 1),
    year: String(date.getFullYear()),
  };
}

function formatSexShort(raw: string): string {
  const v = (raw || '').trim();
  if (/^f/i.test(v) || /^femme/i.test(v)) return 'F';
  if (/^m/i.test(v) || /^homme/i.test(v) || /^masculin/i.test(v)) return 'M';
  return v.slice(0, 1).toUpperCase();
}

function formatSexLong(raw: string): string {
  const short = formatSexShort(raw);
  if (short === 'F') return 'Féminin';
  if (short === 'M') return 'Masculin';
  return (raw || '').trim();
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function civility(gender: string): 'Monsieur' | 'Madame' {
  return /^f/i.test((gender || '').trim()) ? 'Madame' : 'Monsieur';
}

function cnssCentre(localisation: string): string {
  const loc = localisation.trim().toLowerCase();
  if (!loc) return 'KINSHASA';
  if (loc.includes('kinshasa') || loc.includes('ngaliema')) return 'KINSHASA';
  if (loc.includes('lubudi') || loc.includes('lualaba') || loc.includes('kolwezi')) return 'LUALABA';
  return 'KONGO CENTRAL';
}

function employerName(employee: Employee): string {
  return (employee.company || '').trim() || PPC_LETTERHEAD_ADDRESS_LINES[0];
}

function employerAddress(): string {
  return `${PPC_LETTERHEAD_ADDRESS_LINES[1]} ${PPC_LETTERHEAD_ADDRESS_LINES[2]}`.replace(/\s+/g, ' ').trim();
}

function birthPlaceOf(row: Dependant): string {
  const loc = (row.localisation || '').trim();
  if (loc && !/^zamba$/i.test(loc)) return loc;
  return '';
}

function filiationOf(sex: string): string {
  return formatSexShort(sex) === 'F' ? 'Fille' : 'Fils';
}

function formatNationality(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  const n = v.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (n.startsWith('congol')) return 'Congolaise';
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function encodeFormText(text: string, _winAnsi: boolean): string {
  return toWinAnsi(String(text || '').replace(/\s+/g, ' ')).trim();
}

function fitDisplay(font: PDFFont, text: string, size: number, maxWidth?: number): string {
  if (!maxWidth) return text;
  let display = text;
  while (display.length > 1 && font.widthOfTextAtSize(display, size) > maxWidth) {
    display = display.slice(0, -1);
  }
  return display;
}

function sizeToFit(font: PDFFont, text: string, maxWidth: number, preferred: number, min = 7.6): number {
  let size = preferred;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.15;
  }
  return size;
}

function baselineFromTop(page: PDFPage, font: PDFFont, topY: number, size: number): number {
  const ascent = font.heightAtSize(size, { descender: false });
  // pdf-lib Arial ascent sits ~0.22em above the form's ArialMT glyph box.
  return page.getHeight() - topY - ascent - size * 0.222;
}

function drawDottedValue(
  page: PDFPage,
  font: PDFFont,
  text: string,
  topY: number,
  valueX: number,
  options: {
    size?: number;
    maxWidth?: number;
    dotsUntil?: number;
    eraseFrom?: number;
    winAnsi?: boolean;
    color?: RGB;
    minSize?: number;
    eraseTextOnly?: boolean;
  } = {},
) {
  const preferred = options.size ?? F6_SIZE;
  const raw = encodeFormText(text, options.winAnsi ?? false);
  if (!raw) return;
  const dotsUntil = options.dotsUntil ?? F6_DOTS_END;
  const eraseFrom = Math.min(valueX, options.eraseFrom ?? valueX - 4);
  const maxWidth = options.maxWidth ?? Math.max(12, dotsUntil - valueX - 2);
  const size = sizeToFit(font, raw, maxWidth, preferred, options.minSize ?? 9.2);
  const display = fitDisplay(font, raw, size, maxWidth);
  const y = baselineFromTop(page, font, topY, size);
  const ascent = font.heightAtSize(size, { descender: false });
  const descent = Math.max(0.4, font.heightAtSize(size) - ascent);
  const eraseWidth = options.eraseTextOnly
    ? font.widthOfTextAtSize(display, size) + 3
    : Math.max(8, dotsUntil - eraseFrom);
  page.drawRectangle({
    x: eraseFrom,
    y: y - descent + 0.35,
    width: eraseWidth,
    height: ascent + descent - 0.55,
    color: WHITE,
  });
  page.drawText(display, { x: valueX, y, size, font, color: options.color ?? INK });
}

function drawDmtAddress(
  page: PDFPage,
  font: PDFFont,
  topY: number,
  valueX: number,
  options: { winAnsi?: boolean } = {},
) {
  const raw = encodeFormText(employerAddress(), options.winAnsi ?? false);
  if (!raw) return;
  const maxWidth = Math.max(12, DMT_DOTS_END - valueX - 2);
  const size = sizeToFit(font, raw, maxWidth, DMT_SIZE, 5.7);
  const display = fitDisplay(font, raw, size, maxWidth);
  const y = baselineFromTop(page, font, topY, size);
  const ascent = font.heightAtSize(size, { descender: false });
  const descent = Math.max(0.4, font.heightAtSize(size) - ascent);
  page.drawRectangle({
    x: valueX - 4,
    y: y - descent + 0.35,
    width: Math.max(8, DMT_DOTS_END - (valueX - 4)),
    height: ascent + descent - 0.55,
    color: WHITE,
  });
  page.drawText(display, { x: valueX, y, size, font, color: DMT_INK });
}

function highlightPrintedOption(
  page: PDFPage,
  _font: PDFFont,
  spec: {
    topY: number;
    x0: number;
    x1: number;
    label: string;
    size?: number;
    winAnsi?: boolean;
  },
) {
  const size = spec.size ?? DMT_SIZE;
  const underlineY = page.getHeight() - spec.topY - size - 1.15;
  page.drawLine({
    start: { x: spec.x0, y: underlineY },
    end: { x: spec.x1, y: underlineY },
    thickness: 0.65,
    color: DMT_INK,
  });
}

function formatLongFr(raw: string, fallback: Date): string {
  const date = parseDate(raw) ?? fallback;
  return `${date.getDate()} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

function drawCellText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  spec: {
    x0: number;
    x1: number;
    textTop: number;
    size?: number;
    align?: 'left' | 'center';
    winAnsi?: boolean;
  },
) {
  const size = spec.size ?? F6_SIZE;
  const raw = encodeFormText(text, spec.winAnsi ?? false);
  if (!raw) return;
  const pad = spec.align === 'center' ? 1.2 : 3;
  const maxWidth = Math.max(8, spec.x1 - spec.x0 - pad * 2);
  const fittedSize = sizeToFit(font, raw, maxWidth, size, 7.2);
  const display = fitDisplay(font, raw, fittedSize, maxWidth);
  const width = font.widthOfTextAtSize(display, fittedSize);
  const x = spec.align === 'center'
    ? spec.x0 + (spec.x1 - spec.x0 - width) / 2
    : spec.x0 + pad;
  const y = baselineFromTop(page, font, spec.textTop, fittedSize);
  page.drawText(display, { x, y, size: fittedSize, font, color: INK });
}

function toMember(row: Dependant, filiation: string): DeclarationFamilyMember {
  const parts = splitYmd(row.dateNaissance);
  return {
    fullName: row.nom.trim(),
    day: parts.day,
    month: parts.month,
    year: parts.year,
    birthPlace: birthPlaceOf(row),
    sex: formatSexShort(row.sexe),
    filiation,
  };
}

export function resolveDeclarationFamily(
  dependants: Dependant[],
  employee: { matricule: string; nom: string },
  memberIds?: number[],
): DeclarationFamilyContext {
  const empty: DeclarationFamilyContext = { spouse: null, children: [] };
  let { spouse, children } = listFamilyDependants(dependants, employee);
  if (!spouse && children.length === 0) return empty;
  if (memberIds) {
    const allowed = new Set(memberIds);
    if (spouse && !allowed.has(spouse.id)) spouse = null;
    children = children.filter((child) => allowed.has(child.id));
  }
  return {
    spouse: spouse ? toMember(spouse, 'Conjoint') : null,
    children: children.slice(0, 25).map((row) => toMember(row, filiationOf(row.sexe))),
  };
}

async function loadTemplate(templatePath: string): Promise<PDFDocument> {
  const bytes = await fs.readFile(templatePath);
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function generateCompositionFamiliale(
  employee: Employee,
  family: DeclarationFamilyContext,
): Promise<GeneratedPdf> {
  const pdf = await loadTemplate(COMPOSITION_FAMILIALE_TEMPLATE);
  const { font, winAnsi } = await embedFormFont(pdf);
  const pages = pdf.getPages();
  const page1 = pages[0];
  const page2 = pages[1];
  if (!page1 || !page2) {
    throw new Error('Modèle F6 incomplet (2 pages attendues)');
  }

  const names = splitPersonName(employee.nom);
  const today = new Date();
  const todayLabel = `${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()}`;
  const marital = formatMaritalStatusFr(employee.maritalStatus, civility(employee.gender));
  const birth = formatSlash(employee.dateOfBirth);
  const dotted = { winAnsi };
  const col = { ...dotted, eraseFrom: 199 };
  const colLow = { ...dotted, eraseFrom: 196.2 };

  drawDottedValue(page1, font, cnssCentre(employee.localisation), 46.22, 432, {
    ...dotted,
    size: F6_HEADER_SIZE,
    maxWidth: 125,
    dotsUntil: 558,
    eraseFrom: 430,
  });
  drawDottedValue(page1, font, todayLabel, 57.02, 381, {
    ...dotted,
    size: F6_HEADER_SIZE,
    maxWidth: 175,
    dotsUntil: 558,
    eraseFrom: 378.5,
  });

  const employerX = 155;
  const employer = { ...dotted, eraseFrom: 152.2 };
  drawDottedValue(page1, font, employerName(employee), 200.71, employerX, employer);
  drawDottedValue(page1, font, PPC_EMPLOYER_INSS, 215.35, employerX, employer);
  drawDottedValue(page1, font, employerAddress(), 229.75, employerX, employer);
  drawDottedValue(page1, font, 'Reception.HQ@ppcdrc.cd', 244.39, employerX, employer);
  drawDottedValue(page1, font, '+243 899922864', 258.79, 288, { ...dotted, eraseFrom: 285 });

  const valueX = 202;
  drawDottedValue(page1, font, employee.cnss, 321.94, valueX, { ...dotted, eraseFrom: 199.2 });
  drawDottedValue(page1, font, names.nom, 336.58, valueX, col);
  drawDottedValue(page1, font, names.postNom, 351.0, valueX, col);
  drawDottedValue(page1, font, names.prenom, 365.4, valueX, col);
  drawDottedValue(page1, font, employee.matricule, 380.04, valueX, colLow);
  drawDottedValue(page1, font, birth, 394.44, valueX, colLow);
  drawDottedValue(page1, font, formatSexLong(employee.gender), 409.08, valueX, colLow);
  drawDottedValue(page1, font, marital, 423.48, valueX, colLow);
  drawDottedValue(page1, font, formatNationality(employee.nationality), 437.9, valueX, colLow);
  drawDottedValue(page1, font, employee.nif, 452.54, 314, { ...dotted, eraseFrom: 311.2 });
  drawDottedValue(page1, font, employee.localisation, 481.58, valueX, colLow);
  drawDottedValue(page1, font, formatSlash(employee.appointmentDate), 522.17, 216, {
    ...dotted,
    eraseFrom: 213,
  });

  const cell = { winAnsi, size: F6_SIZE };
  if (family.spouse) {
    const spouse = family.spouse;
    const spouseTop = 103.99;
    drawCellText(page2, font, spouse.fullName, { x0: 28.6, x1: 219.5, textTop: spouseTop, ...cell });
    drawCellText(page2, font, spouse.day, { x0: 219.9, x1: 252.1, textTop: spouseTop, align: 'center', ...cell });
    drawCellText(page2, font, spouse.month, { x0: 252.6, x1: 285.7, textTop: spouseTop, align: 'center', ...cell });
    drawCellText(page2, font, spouse.year, { x0: 286.2, x1: 332.5, textTop: spouseTop, align: 'center', ...cell });
    drawCellText(page2, font, spouse.birthPlace, { x0: 333.0, x1: 414.4, textTop: spouseTop, align: 'center', ...cell });
    drawCellText(page2, font, spouse.sex, { x0: 414.9, x1: 448.8, textTop: spouseTop, align: 'center', ...cell });
  }

  family.children.slice(0, 25).forEach((child, index) => {
    const textTop = 163.49 + index * 12;
    drawCellText(page2, font, child.fullName, { x0: 52.1, x1: 219.5, textTop, ...cell });
    drawCellText(page2, font, child.day, { x0: 219.9, x1: 255.2, textTop, align: 'center', ...cell });
    drawCellText(page2, font, child.month, { x0: 255.7, x1: 291.0, textTop, align: 'center', ...cell });
    drawCellText(page2, font, child.year, { x0: 291.5, x1: 332.5, textTop, align: 'center', ...cell });
    drawCellText(page2, font, child.birthPlace, { x0: 333.0, x1: 414.4, textTop, align: 'center', ...cell });
    drawCellText(page2, font, child.sex, { x0: 414.9, x1: 448.8, textTop, align: 'center', ...cell });
    drawCellText(page2, font, child.filiation, { x0: 449.2, x1: 510.2, textTop, ...cell });
  });

  return {
    fileName: sanitizeFileName(
      `DECLARATION-DE-COMPOSITION-FAMILIALE-DU-TRAVAILLEUR - ${employee.nom}.pdf`,
    ),
    buffer: Buffer.from(await pdf.save()),
  };
}

export interface MouvementTravailleurOptions {
  motif?: DmtMotifId;
  salary?: string;
  documentDate?: string;
  lieu?: string;
}

export async function generateMouvementTravailleur(
  employee: Employee,
  family: DeclarationFamilyContext,
  options: MouvementTravailleurOptions = {},
): Promise<GeneratedPdf> {
  const pdf = await loadTemplate(MOUVEMENT_TRAVAILLEUR_TEMPLATE);
  const { font, winAnsi } = await embedFormFont(pdf);
  const page = pdf.getPages()[0];
  if (!page) throw new Error('Modèle DMT introuvable');

  const motif = options.motif && isDmtMotifId(options.motif)
    ? options.motif
    : suggestDmtMotif(employee);
  const classification = resolveClassification(
    `${employee.grade || ''} ${employee.patersonGrade || ''} ${employee.employeeSubGroup || ''}`,
  );
  const isCdi = /cdi/i.test(employee.typeContrat || '');
  const marital = formatMaritalStatusFr(employee.maritalStatus, civility(employee.gender));
  const childrenCount = family.children.length || employee.numberOfChildren || 0;
  const today = new Date();
  const documentLabel = formatLongFr(options.documentDate || '', today);
  const lieu = (options.lieu || employee.localisation || '').trim() || 'Kinshasa';
  const opt = { winAnsi };

  const dotted = { size: DMT_SIZE, winAnsi, dotsUntil: DMT_DOTS_END, color: DMT_INK };
  drawDottedValue(page, font, employerName(employee), 151.16, 126, dotted);
  drawDmtAddress(page, font, 166.76, 70, opt);
  drawDottedValue(page, font, '+243 899922864', 182.36, 132, { ...dotted, maxWidth: 135, dotsUntil: 270 });
  drawDottedValue(page, font, 'Reception.HQ@ppcdrc.cd', 182.36, 280, dotted);
  drawDottedValue(page, font, 'Fabrication et vente du ciment', 203.74, 108, dotted);
  drawDottedValue(page, font, PPC_EMPLOYER_INSS, 219.10, 66, dotted);

  drawDottedValue(page, font, employee.nom, 287.53, 136, dotted);
  drawDottedValue(page, font, formatSlash(employee.dateOfBirth), 303.13, 175, dotted);
  drawDottedValue(page, font, formatNationality(employee.nationality), 318.49, 116, {
    ...dotted,
    maxWidth: 118,
    dotsUntil: 242,
    eraseFrom: 116,
    eraseTextOnly: true,
  });
  drawDottedValue(page, font, formatSexShort(employee.gender), 318.49, 292, {
    ...dotted,
    maxWidth: 120,
    eraseFrom: 290,
    eraseTextOnly: true,
  });
  drawDottedValue(page, font, employee.jobTitle || employee.position, 334.09, 101, dotted);

  if (classification === 'classifie') {
    highlightPrintedOption(page, font, {
      topY: 349.69, x0: 139.5, x1: 216.7, label: 'catégorie- échelon-', ...opt,
    });
  } else if (classification === 'cadre') {
    highlightPrintedOption(page, font, {
      topY: 349.69, x0: 315.9, x1: 404.7, label: 'personnel de direction', ...opt,
    });
  } else {
    highlightPrintedOption(page, font, {
      topY: 349.69, x0: 219.2, x1: 289.0, label: 'agent de maitrise', ...opt,
    });
  }

  drawDottedValue(page, font, formatDmtSalary(options.salary || ''), 365.05, 270, {
    ...dotted,
    maxWidth: 150,
    dotsUntil: 425,
  });

  if (isCdi) {
    highlightPrintedOption(page, font, {
      topY: 380.67, x0: 205.0, x1: 290.8, label: 'à durée Indéterminée', ...opt,
    });
  } else {
    highlightPrintedOption(page, font, {
      topY: 380.67, x0: 119.1, x1: 197.1, label: 'à durée déterminée', ...opt,
    });
  }

  drawDottedValue(
    page,
    font,
    lieu,
    396.27,
    130,
    dotted,
  );
  drawDottedValue(page, font, employee.cnss, 427.23, 197, dotted);

  const maritalKey = marital.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (maritalKey.startsWith('marie')) {
    highlightPrintedOption(page, font, { topY: 445.47, x0: 173.8, x1: 196.5, label: 'Marié', ...opt });
  } else if (maritalKey.startsWith('celib')) {
    highlightPrintedOption(page, font, {
      topY: 443.03, x0: 202.4, x1: 251.8, label: 'célibataire', size: 12, ...opt,
    });
  } else if (maritalKey.startsWith('divor')) {
    highlightPrintedOption(page, font, { topY: 445.47, x0: 262.2, x1: 291.5, label: 'divorcé', ...opt });
  } else if (maritalKey.startsWith('separe')) {
    highlightPrintedOption(page, font, {
      topY: 445.47, x0: 301.3, x1: 368.9, label: 'séparé de corps', ...opt,
    });
  } else if (maritalKey.startsWith('veuf') || maritalKey.startsWith('veuve')) {
    highlightPrintedOption(page, font, { topY: 445.47, x0: 371.4, x1: 399.7, label: 'Veuve', ...opt });
  }

  drawDottedValue(page, font, String(childrenCount), 463.49, 148, dotted);

  if (motif === 'embauche') {
    highlightPrintedOption(page, font, {
      topY: 526.85, x0: 28.3, x1: 95.1, label: '(1) Embauchage', ...opt,
    });
  } else if (motif === 'expiration') {
    highlightPrintedOption(page, font, {
      topY: 526.85, x0: 145.0, x1: 275.9, label: '(2) Expiration normale du contrat', ...opt,
    });
  } else if (motif === 'licenciement') {
    highlightPrintedOption(page, font, {
      topY: 537.44, x0: 28.3, x1: 94.9, label: '(3) Licenciement', ...opt,
    });
  } else if (motif === 'demission') {
    highlightPrintedOption(page, font, {
      topY: 537.44, x0: 147.4, x1: 203.1, label: '(4) Démission', ...opt,
    });
  } else if (motif === 'deces') {
    highlightPrintedOption(page, font, {
      topY: 537.44, x0: 229.1, x1: 268.1, label: '(5) Décès', ...opt,
    });
  }

  drawDottedValue(page, font, `${documentLabel} à ${lieu}`, 547.76, 42, {
    ...dotted,
    maxWidth: 370,
    dotsUntil: DMT_DOTS_END,
    eraseFrom: 40.5,
  });
  drawDottedValue(page, font, lieu, 731.89, 48, { ...dotted, maxWidth: 130, dotsUntil: 183 });
  drawDottedValue(page, font, documentLabel, 731.89, 250, { ...dotted, maxWidth: 150 });

  return {
    fileName: sanitizeFileName(`DECLARATION DE MOUVEMENT DE TRAVAILLEUR - ${employee.nom}.pdf`),
    buffer: Buffer.from(await pdf.save()),
  };
}
