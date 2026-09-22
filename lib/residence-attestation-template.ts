import 'server-only';

import fs from 'fs/promises';
import JSZip from 'jszip';
import { escapeXmlText } from './docx-template';
import { PPC_LETTERHEAD_ADDRESS_LINES } from './ppc-letterhead-address';
import { formatResidenceHodSoussigne } from './residence-attestation-text';
import type { ResidenceAttestationFormData } from './residence-attestation-types';
import { RESIDENCE_ATTESTATION_TEMPLATE_PATH } from './residence-attestation-template-paths';

export { RESIDENCE_ATTESTATION_TEMPLATE_PATH };

export interface ResidenceAttestationHeaderImage {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
}

let cachedHeaderImage: ResidenceAttestationHeaderImage | null | undefined;

export async function loadResidenceAttestationHeaderImage(): Promise<ResidenceAttestationHeaderImage | null> {
  if (cachedHeaderImage !== undefined) return cachedHeaderImage;
  try {
    const templateBuffer = await fs.readFile(RESIDENCE_ATTESTATION_TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(templateBuffer);
    const mediaPaths = Object.keys(zip.files)
      .filter((key) => /^word\/media\/.+\.(png|jpe?g)$/i.test(key))
      .sort((a, b) => a.localeCompare(b, 'en'));
    if (!mediaPaths.length) {
      cachedHeaderImage = null;
      return null;
    }
    const file = zip.file(mediaPaths[0]!);
    if (!file) {
      cachedHeaderImage = null;
      return null;
    }
    const bytes = new Uint8Array(await file.async('arraybuffer'));
    const lower = mediaPaths[0]!.toLowerCase();
    cachedHeaderImage = {
      bytes,
      mime: lower.endsWith('.png') ? 'image/png' : 'image/jpeg',
    };
    return cachedHeaderImage;
  } catch {
    cachedHeaderImage = null;
    return null;
  }
}

export async function getResidenceAttestationHeaderDataUrl(): Promise<string | null> {
  const image = await loadResidenceAttestationHeaderImage();
  if (!image) return null;
  return `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`;
}

function buildSplitBracketPattern(key: string): RegExp {
  const chars = key.split('').map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const gap = '(?:<[^>]+>)*';
  return new RegExp(`\\[${gap}${chars.join(gap)}${gap}\\]`);
}

function replaceBracketInXmlOnce(
  xml: string,
  key: string,
  value: string,
  fromIndex = 0,
): { xml: string; index: number } {
  const pattern = buildSplitBracketPattern(key);
  pattern.lastIndex = fromIndex;
  const match = pattern.exec(xml);
  if (!match || match.index < fromIndex) {
    throw new Error(`Champ introuvable dans le modèle : [${key}]`);
  }
  const escaped = escapeXmlText(value);
  const nextXml = `${xml.slice(0, match.index)}${escaped}${xml.slice(match.index + match[0].length)}`;
  return { xml: nextXml, index: match.index + escaped.length };
}

export function formatResidenceDocumentDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fillResidenceAttestationXml(xml: string, data: ResidenceAttestationFormData): string {
  let next = xml;
  let cursor = 0;
  const soussigne = formatResidenceHodSoussigne(data.hodGenre);

  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'soussigne', soussigne, cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Nom complet HoD', data.hodName.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Fonction HoD', data.hodFunction.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Genre employe', data.employeeGenre.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'Nom complet employe',
    data.employeeName.trim(),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'adresse',
    data.residenceAddress.trim(),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'DATE',
    formatResidenceDocumentDate(data.documentDate),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Nom complet HoD', data.hodName.trim(), cursor));
  ({ xml: next } = replaceBracketInXmlOnce(next, 'Fonction HoD', data.hodFunction.trim(), cursor));

  return next;
}

export function extractDocxPlainText(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildResidenceAttestationPreviewHtml(
  plainText: string,
  options?: { headerDataUrl?: string | null },
): string {
  const paragraphs = plainText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const addressHtml = PPC_LETTERHEAD_ADDRESS_LINES.map(
    (line) => `<span>${escapeHtml(line)}</span>`,
  ).join('');

  const headerBlock = options?.headerDataUrl
    ? `<div class="service-attestation-preview-header">
  <img src="${options.headerDataUrl}" alt="" />
  <div class="service-attestation-preview-address">${addressHtml}</div>
</div>`
    : `<div class="service-attestation-preview-header">
  <div class="service-attestation-preview-address">${addressHtml}</div>
</div>`;

  const body = paragraphs
    .map((line, index) => {
      const isTitle = index === 0;
      const isSignature = index >= paragraphs.length - 2;
      const className = isTitle
        ? 'service-attestation-preview-title'
        : isSignature
          ? 'service-attestation-preview-signature'
          : 'service-attestation-preview-paragraph';
      return `<p class="${className}">${escapeHtml(line)}</p>`;
    })
    .join('');

  return `<div class="service-attestation-preview-doc">${headerBlock}${body}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatResidenceAttestationFileName(employeeName: string, documentDate: string): string {
  const safeName = employeeName.trim().replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_') || 'employe';
  const datePart = documentDate.trim() || new Date().toISOString().slice(0, 10);
  return `Attestation_residence_${safeName}_${datePart}.docx`;
}

export function buildResidenceAttestationParagraphs(data: ResidenceAttestationFormData): string[] {
  const soussigne = formatResidenceHodSoussigne(data.hodGenre);
  return [
    'ATTESTATION DE RESIDENCE',
    `Je ${soussigne}, ${data.hodName.trim()}, ${data.hodFunction.trim()} de PPC Barnet DRC Manufacturing S.A, atteste par la présente que ${data.employeeGenre.trim()} ${data.employeeName.trim()}, employé dans notre entreprise, réside effectivement au ${data.residenceAddress.trim()}.`,
    'La présente lui est délivrée pour faire valoir ce que de droit.',
    `Fait à Kinshasa le ${formatResidenceDocumentDate(data.documentDate)}`,
    data.hodName.trim(),
    data.hodFunction.trim(),
  ];
}
