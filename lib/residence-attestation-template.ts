import 'server-only';

import fs from 'fs/promises';
import JSZip from 'jszip';
import { escapeXmlText } from './docx-template';
import { PPC_LETTERHEAD_ADDRESS_LINES } from './ppc-letterhead-address';
import {
  formatResidenceHodSoussigne,
  resolveResidenceAddressEn,
} from './residence-attestation-text';
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

function replaceLiteralInXmlOnce(
  xml: string,
  literal: string,
  value: string,
  fromIndex = 0,
): string {
  const chars = literal.split('').map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const gap = '(?:<[^>]+>)*';
  const pattern = new RegExp(chars.join(gap));
  const searchFrom = Math.max(0, fromIndex);
  const slice = xml.slice(searchFrom);
  const match = pattern.exec(slice);
  if (!match) return xml;
  const at = searchFrom + match.index;
  const escaped = escapeXmlText(value);
  return `${xml.slice(0, at)}${escaped}${xml.slice(at + match[0].length)}`;
}

export function formatResidenceDocumentDate(
  value: string,
  language: 'fr' | 'en' = 'fr',
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function applyEnglishBoilerplate(xml: string, employeeGenreEn: string): string {
  let next = xml;
  const pronoun = /ms\.?|mrs\.?|miss/i.test(employeeGenreEn) ? 'her' : 'him';
  const replacements: [string, string][] = [
    ['ATTESTATION DE RESIDENCE', 'CERTIFICATE OF RESIDENCE'],
    ['Je soussignée,', 'I, the undersigned,'],
    ['Je soussigné,', 'I, the undersigned,'],
    ['atteste par la présente que', 'hereby certify that'],
    [
      'employé dans notre entreprise, réside effectivement au',
      'employed in our company, actually resides at',
    ],
    [
      'employée dans notre entreprise, réside effectivement au',
      'employed in our company, actually resides at',
    ],
    [
      'La présente lui est délivrée pour faire valoir ce que de droit.',
      `This certificate is issued to ${pronoun} to do what is right.`,
    ],
    ['Fait à Kinshasa le', 'Done in Kinshasa on'],
    ['de PPC Barnet DRC Manufacturing S.A', 'of PPC Barnet DRC Manufacturing S.A'],
  ];
  for (const [from, to] of replacements) {
    next = replaceLiteralInXmlOnce(next, from, to);
  }
  return next;
}

export function fillResidenceAttestationXml(xml: string, data: ResidenceAttestationFormData): string {
  let next = xml;
  let cursor = 0;
  const language = data.language === 'en' ? 'en' : 'fr';
  const soussigne = formatResidenceHodSoussigne(data.hodGenre);
  const address =
    language === 'en' ? resolveResidenceAddressEn(data) : data.residenceAddress.trim();

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
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'adresse', address, cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'DATE',
    formatResidenceDocumentDate(data.documentDate, language),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Nom complet HoD', data.hodName.trim(), cursor));
  ({ xml: next } = replaceBracketInXmlOnce(next, 'Fonction HoD', data.hodFunction.trim(), cursor));

  if (language === 'en') {
    next = applyEnglishBoilerplate(next, data.employeeGenre);
  }

  return next;
}

const DOCX_PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function extractBodyParts(xml: string): {
  before: string;
  inner: string;
  sectPr: string;
  after: string;
} {
  const openTag = '<w:body>';
  const closeTag = '</w:body>';
  const bodyOpen = xml.indexOf(openTag);
  const bodyClose = xml.lastIndexOf(closeTag);
  if (bodyOpen < 0 || bodyClose < 0) {
    throw new Error('Structure word/document.xml invalide (w:body)');
  }
  const before = xml.slice(0, bodyOpen + openTag.length);
  const after = xml.slice(bodyClose);
  const bodyContent = xml.slice(bodyOpen + openTag.length, bodyClose);
  const sectIdx = bodyContent.lastIndexOf('<w:sectPr');
  if (sectIdx < 0) {
    return { before, inner: bodyContent, sectPr: '', after };
  }
  return {
    before,
    inner: bodyContent.slice(0, sectIdx),
    sectPr: bodyContent.slice(sectIdx),
    after,
  };
}

/** Remplit le modèle en deux pages : FR puis EN. */
export function fillBilingualResidenceAttestationXml(
  templateXml: string,
  frData: ResidenceAttestationFormData,
  enData: ResidenceAttestationFormData,
): string {
  const frFilled = fillResidenceAttestationXml(templateXml, { ...frData, language: 'fr' });
  const enFilled = fillResidenceAttestationXml(templateXml, { ...enData, language: 'en' });
  const fr = extractBodyParts(frFilled);
  const en = extractBodyParts(enFilled);
  return `${fr.before}${fr.inner}${DOCX_PAGE_BREAK}${en.inner}${fr.sectPr || en.sectPr}${fr.after}`;
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

export function formatResidenceAttestationFileName(
  employeeName: string,
  documentDate: string,
  language: 'fr' | 'en' | 'both' = 'both',
): string {
  const safeName = employeeName.trim().replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_') || 'employe';
  const datePart = documentDate.trim() || new Date().toISOString().slice(0, 10);
  const prefix =
    language === 'en'
      ? 'Residence_Certificate'
      : language === 'both'
        ? 'Attestation_residence_FR-EN'
        : 'Attestation_residence';
  return `${prefix}_${safeName}_${datePart}.docx`;
}

export function buildResidenceAttestationParagraphs(data: ResidenceAttestationFormData): string[] {
  const language = data.language === 'en' ? 'en' : 'fr';
  const soussigne = formatResidenceHodSoussigne(data.hodGenre);
  const hod = data.hodName.trim();
  const hodFn = data.hodFunction.trim();
  const empGenre = data.employeeGenre.trim();
  const emp = data.employeeName.trim();
  const address =
    language === 'en' ? resolveResidenceAddressEn(data) : data.residenceAddress.trim();
  const docDate = formatResidenceDocumentDate(data.documentDate, language);
  const pronoun = /ms\.?|mrs\.?|miss/i.test(empGenre) ? 'her' : 'him';

  if (language === 'en') {
    return [
      'CERTIFICATE OF RESIDENCE',
      `I, the undersigned, ${hod}, ${hodFn} of PPC Barnet DRC Manufacturing S.A, hereby certify that ${empGenre} ${emp}, employed in our company, actually resides at ${address}.`,
      `This certificate is issued to ${pronoun} to do what is right.`,
      `Done in Kinshasa on ${docDate}`,
      hod,
      hodFn,
    ];
  }

  return [
    'ATTESTATION DE RESIDENCE',
    `Je ${soussigne}, ${hod}, ${hodFn} de PPC Barnet DRC Manufacturing S.A, atteste par la présente que ${empGenre} ${emp}, employé dans notre entreprise, réside effectivement au ${address}.`,
    'La présente lui est délivrée pour faire valoir ce que de droit.',
    `Fait à Kinshasa le ${docDate}`,
    hod,
    hodFn,
  ];
}
