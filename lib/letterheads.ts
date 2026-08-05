import 'server-only';

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { resolveWorkbookPath } from './runtime-mode';

export type LetterheadId = 'manuco' | 'quarryco';

export interface LetterheadTemplate {
  id: LetterheadId;
  label: string;
  company: string;
  description: string;
  /** Nom de fichier stable sous Excel/templates/entetes/ */
  fileName: string;
  downloadName: string;
}

/** Catalogue des en-têtes (papier à lettre). */
export const LETTERHEAD_TEMPLATES: LetterheadTemplate[] = [
  {
    id: 'manuco',
    label: 'Manuco company letterhead',
    company: 'Manuco',
    description: 'En-tête Manuco (adresse bureau à jour).',
    fileName: 'Manuco-company-letterhead.docx',
    downloadName: 'Manuco company letterhead.docx',
  },
  {
    id: 'quarryco',
    label: 'Quarryco company letterhead',
    company: 'Quarryco',
    description: 'En-tête Quarryco (adresse bureau à jour).',
    fileName: 'Quarryco-company-letterhead.docx',
    downloadName: 'Quarryco company letterhead.docx',
  },
];

const REL_DIR = path.join('templates', 'entetes');

export function getLetterheadById(id: string): LetterheadTemplate | null {
  return LETTERHEAD_TEMPLATES.find((item) => item.id === id) ?? null;
}

/** Chemin résolu (copie writable en mode tmp). */
export function resolveLetterheadPath(template: LetterheadTemplate): string {
  return resolveWorkbookPath(path.join(REL_DIR, template.fileName));
}

export interface LetterheadStatus {
  id: LetterheadId;
  label: string;
  company: string;
  description: string;
  fileName: string;
  downloadName: string;
  exists: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
}

export async function listLetterheadStatuses(): Promise<LetterheadStatus[]> {
  const results: LetterheadStatus[] = [];
  for (const template of LETTERHEAD_TEMPLATES) {
    const filePath = resolveLetterheadPath(template);
    let exists = false;
    let sizeBytes: number | null = null;
    let updatedAt: string | null = null;
    try {
      const stat = await fs.stat(filePath);
      exists = stat.isFile();
      sizeBytes = stat.size;
      updatedAt = stat.mtime.toISOString();
    } catch {
      exists = false;
    }
    results.push({
      id: template.id,
      label: template.label,
      company: template.company,
      description: template.description,
      fileName: template.fileName,
      downloadName: template.downloadName,
      exists,
      sizeBytes,
      updatedAt,
    });
  }
  return results;
}

export async function readLetterheadBuffer(id: string): Promise<{
  template: LetterheadTemplate;
  buffer: Buffer;
} | null> {
  const template = getLetterheadById(id);
  if (!template) return null;
  const filePath = resolveLetterheadPath(template);
  try {
    const buffer = await fs.readFile(filePath);
    return { template, buffer };
  } catch {
    return null;
  }
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP/PK

export function isDocxBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer.subarray(0, 4).equals(DOCX_MAGIC);
}

/** Remplace le fichier modèle (docx uniquement). */
export async function replaceLetterheadFile(
  id: string,
  buffer: Buffer,
): Promise<LetterheadStatus> {
  const template = getLetterheadById(id);
  if (!template) throw new Error('Modèle introuvable');
  if (!isDocxBuffer(buffer)) {
    throw new Error('Fichier invalide : un document .docx est requis');
  }
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('Fichier trop volumineux (max 15 Mo)');
  }

  const filePath = resolveLetterheadPath(template);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Sauvegarde de secours de l’ancienne version
  if (fsSync.existsSync(filePath)) {
    const backup = `${filePath}.bak`;
    try {
      await fs.copyFile(filePath, backup);
    } catch {
      // ignore backup errors
    }
  }

  await fs.writeFile(filePath, buffer);

  // En mode file, le chemin est déjà sous Excel/ du projet.
  // En mode tmp, on a écrit la copie writable — OK.

  const statuses = await listLetterheadStatuses();
  const status = statuses.find((s) => s.id === template.id);
  if (!status) throw new Error('Échec après remplacement');
  return status;
}

export { DOCX_MIME };
