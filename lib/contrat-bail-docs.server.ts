import 'server-only';

import { replaceDocxText } from './docx-fill';
import { fillDocxTemplateToBuffer } from './docx-template';
import { CONTRAT_BAIL_TEMPLATE_PATH } from './excel-export-template-paths';
import type { ContratBailFormData } from './contrat-bail-types';

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function parseIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatLongFr(date: Date | null, fallback = '—'): string {
  if (!date) return fallback;
  const day = date.getDate();
  return `${day === 1 ? '1er' : day} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

function safe(value: string | null | undefined, fallback = '—'): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fillBailXml(xml: string, form: ContratBailFormData): string {
  let out = xml;
  const name = safe(form.occupantName);
  const identity = safe(form.occupantIdentityNumber || form.occupantMatricule);
  const address = safe(form.propertyAddress);
  const start = formatLongFr(parseIsoDate(form.occupationStartDate));
  const docDate = formatLongFr(parseIsoDate(form.documentDate));
  const signer = safe(form.signerName, 'CARINE EWULI');
  const signerTitle = safe(form.signerTitle, 'Directrice des Ressources Humaines');

  // Occupant (texte éclaté — replaceDocxText gère les runs).
  out = replaceDocxText(out, 'Patrick KAHASHA', name, { optional: true });
  out = replaceDocxText(out, '70000256', identity, { optional: true });

  out = replaceDocxText(
    out,
    'Zamba 1, Village PPC Barnet, Twins House n°32',
    address,
    { optional: true },
  );
  out = replaceDocxText(out, 'Twins House n°32', address, { optional: true });

  out = replaceDocxText(out, '24 juillet 2026', start, { optional: true });
  out = replaceDocxText(out, '24 juillet', start.replace(/ \d{4}$/, ''), { optional: true });

  out = replaceDocxText(out, 'CARINE EWULI', signer, { optional: true });
  out = replaceDocxText(
    out,
    'Directrice des Ressources Humaines',
    signerTitle,
    { optional: true },
  );
  out = replaceDocxText(
    out,
    'En sa qualité de Directrice des Ressources Humaines',
    `En sa qualité de ${signerTitle}`,
    { optional: true },
  );

  // Date de signature (points de suspension du modèle).
  out = replaceDocxText(
    out,
    'Ainsi fait à Zamba 1, le…………………..en deux exemplaires',
    `Ainsi fait à Zamba 1, le ${docDate} en deux exemplaires`,
    { optional: true },
  );
  out = replaceDocxText(out, '…………………..', docDate, { optional: true });

  return out;
}

export interface GeneratedContratBail {
  fileName: string;
  buffer: Buffer;
}

export async function generateContratBail(form: ContratBailFormData): Promise<GeneratedContratBail> {
  const buffer = await fillDocxTemplateToBuffer(CONTRAT_BAIL_TEMPLATE_PATH, (xml) =>
    fillBailXml(xml, form),
  );
  const who = form.occupantName || form.occupantMatricule || 'occupant';
  return {
    fileName: sanitizeFileName(`Contrat de bail - ${who}.docx`),
    buffer,
  };
}
