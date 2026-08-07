import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { fillDocxTemplateToBuffer } from './docx-template';
import { replaceDocxText } from './docx-fill';

const TEMPLATE_DIR = path.join(process.cwd(), 'Excel', 'templates', 'newcomers');

export const NEWCOMER_DOC_TYPES = [
  'declaration',
  'new-user-request',
  'sap-input',
] as const;

export type NewcomerDocType = (typeof NEWCOMER_DOC_TYPES)[number];

export const NEWCOMER_DOC_LABELS: Record<NewcomerDocType, string> = {
  declaration: "Déclaration sur l'honneur",
  'new-user-request': 'New User Request Form',
  'sap-input': 'SAP Input form (HR DOC 14)',
};

export interface NewcomerDocPayload {
  jobTitle: string;
  managerName: string;
  startDate: string;
  siteLocation: string;
  department: string;
  costCentre: string;
  managerFullNames: string;
  hrFullNames: string;
  grade: string;
}

export interface GeneratedNewcomerDoc {
  fileName: string;
  buffer: Buffer;
  contentType: string;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';

function safe(value: string | null | undefined, fallback = ''): string {
  return String(value ?? '').trim() || fallback;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document';
}

/** ISO / jj/mm/aaaa → jj.mm.aaaa (format du modèle New User Request). */
export function formatNewcomerDotDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    return `${fr[1].padStart(2, '0')}.${fr[2].padStart(2, '0')}.${fr[3]}`;
  }
  return raw;
}

/* ── Déclaration sur l'honneur (inchangée) ─────────────────────── */

async function generateDeclaration(): Promise<GeneratedNewcomerDoc> {
  const templatePath = path.join(TEMPLATE_DIR, 'declaration-sur-l-honneur.docx');
  const buffer = await fs.readFile(templatePath);
  return {
    fileName: "Déclaration sur l'honneur.docx",
    buffer,
    contentType: DOCX_MIME,
  };
}

/* ── New User Request Form ─────────────────────────────────────── */

/**
 * Remplace une valeur d’exemple déjà présente dans le modèle.
 * Garde le document intact si l’ancienne valeur est absente (template déjà vidé).
 */
function replaceSample(
  xml: string,
  search: string,
  value: string,
  options?: { occurrence?: number | 'all' },
): string {
  try {
    return replaceDocxText(xml, search, safe(value) || ' ', {
      occurrence: options?.occurrence ?? 1,
      optional: false,
    });
  } catch {
    return xml;
  }
}

async function generateNewUserRequest(payload: NewcomerDocPayload): Promise<GeneratedNewcomerDoc> {
  const templatePath = path.join(TEMPLATE_DIR, 'New-User-Request-Form_3.2.docx');
  const manager = safe(payload.managerFullNames || payload.managerName);
  const startDot = formatNewcomerDotDate(payload.startDate) || safe(payload.startDate);

  const buffer = await fillDocxTemplateToBuffer(templatePath, (xml) => {
    let out = xml;
    // Valeurs d’exemple présentes dans le modèle fourni (Lab Analyst).
    out = replaceSample(out, 'Lab analyst', safe(payload.jobTitle) || ' ');
    out = replaceSample(out, 'Zamba', safe(payload.siteLocation) || ' ');
    out = replaceSample(out, 'QA', safe(payload.department) || ' ');
    out = replaceSample(out, 'KM5510', safe(payload.costCentre) || ' ');
    out = replaceSample(out, '12.08.2026', startDot || ' ');
    // Manager Name + Manager Full Names (même nom d’exemple, 2 occurrences).
    out = replaceSample(out, 'Sosthene Kamanda', manager || ' ', { occurrence: 'all' });
    out = replaceSample(out, 'Pelagie Kinkinia', safe(payload.hrFullNames) || ' ');
    return out;
  });

  const base = sanitizeFileName(`New User Request Form - ${payload.jobTitle || 'newcomer'}`);
  return {
    fileName: `${base}.docx`,
    buffer,
    contentType: DOCX_MIME,
  };
}

/* ── SAP Input form (.doc binaire, séparateurs 0x07) ────────────── */

/**
 * Remplit un champ texte du formulaire SAP (OLE .doc).
 * Structure : `Label:\x07VALUE\x07…padding…NextLabel:`
 * La taille du slot binaire est fixée par le modèle : valeurs trop longues sont tronquées.
 */
function fillSapField(buf: Buffer, label: string, value: string): Buffer {
  const marker = Buffer.from(`${label}\x07`, 'latin1');
  const idx = buf.indexOf(marker);
  if (idx < 0) {
    throw new Error(`Champ SAP introuvable : ${label}`);
  }
  const valueStart = idx + marker.length;

  // Fin de la valeur courante, puis padding 0x07 jusqu’au prochain libellé.
  let scan = valueStart;
  while (scan < buf.length && buf[scan] !== 0x07) scan += 1;
  let padEnd = scan;
  while (padEnd < buf.length && buf[padEnd] === 0x07) padEnd += 1;

  // Slot = [valueStart, padEnd) ; au moins un 0x07 doit rester en terminateur.
  const slotLen = Math.max(0, padEnd - valueStart);
  const maxValue = Math.max(0, slotLen - 1);
  const clean = safe(value).slice(0, maxValue);
  const out = Buffer.from(buf);

  for (let i = 0; i < slotLen; i += 1) {
    out[valueStart + i] = i < clean.length ? clean.charCodeAt(i) & 0xff : 0x07;
  }
  return out;
}

async function generateSapInput(payload: NewcomerDocPayload): Promise<GeneratedNewcomerDoc> {
  const templatePath = path.join(TEMPLATE_DIR, 'SAP-Input-form-HR-DOC-14.doc');
  let buf = await fs.readFile(templatePath);

  buf = fillSapField(buf, 'Position:', safe(payload.jobTitle));
  buf = fillSapField(buf, 'Grade:', safe(payload.grade));
  buf = fillSapField(buf, 'Cost Centre:', safe(payload.costCentre));
  buf = fillSapField(buf, 'Department:', safe(payload.department));

  const base = sanitizeFileName(`SAP Input form - ${payload.jobTitle || 'newcomer'}`);
  return {
    fileName: `${base}.doc`,
    buffer: buf,
    contentType: DOC_MIME,
  };
}

export async function generateNewcomerDocument(
  docType: NewcomerDocType,
  payload: NewcomerDocPayload,
): Promise<GeneratedNewcomerDoc> {
  switch (docType) {
    case 'declaration':
      return generateDeclaration();
    case 'new-user-request':
      return generateNewUserRequest(payload);
    case 'sap-input':
      return generateSapInput(payload);
    default:
      throw new Error('Type de document invalide');
  }
}
