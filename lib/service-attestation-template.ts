import 'server-only';

import { escapeXmlText } from './docx-template';
import { formatDisplayDate } from './xlsx-populate-utils';
import type { ServiceAttestationFormData } from './service-attestation-types';
import { SERVICE_ATTESTATION_TEMPLATE_PATH } from './service-attestation-template-paths';

export { SERVICE_ATTESTATION_TEMPLATE_PATH };

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
  const pattern = new RegExp(`${gap}${chars.join(gap)}${gap}`);
  pattern.lastIndex = fromIndex;
  const match = pattern.exec(xml);
  if (!match || match.index < fromIndex) return xml;
  const escaped = escapeXmlText(value);
  return `${xml.slice(0, match.index)}${escaped}${xml.slice(match.index + match[0].length)}`;
}

function formatDocumentDate(value: string, language: 'fr' | 'en'): string {
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

function applyEnglishBoilerplate(xml: string): string {
  let next = xml;
  const replacements: [string, string][] = [
    ['ATTESTATION DE SERVICE', 'CERTIFICATE OF EMPLOYMENT'],
    ['Je soussignée', 'I, the undersigned'],
    ['Je soussigné', 'I, the undersigned'],
    ['atteste par la présente que', 'hereby certify that'],
    ['Matricule', 'Employee ID'],
    [
      'est employée dans notre entreprise depuis le',
      'has been employed by our company since',
    ],
    [
      'est employé dans notre entreprise depuis le',
      'has been employed by our company since',
    ],
    [
      ' et occupe actuellement le poste de',
      ' and currently holds the position of',
    ],
    ['au sein du département de', 'in the department of'],
    ['au sein du département d', 'in the department of'],
    [
      'La présente lui est délivrée pour faire valoir ce que de droit.',
      'This certificate is issued upon request for whatever legal purpose it may serve.',
    ],
    ['Fait à Kinshasa, le', 'Done in Kinshasa, on'],
    ['de PPC Barnet DRC Manufacturing SA', 'of PPC Barnet DRC Manufacturing SA'],
  ];
  for (const [from, to] of replacements) {
    next = replaceLiteralInXmlOnce(next, from, to);
  }
  return next;
}

export function fillServiceAttestationXml(
  xml: string,
  data: ServiceAttestationFormData,
): string {
  let next = xml;
  let cursor = 0;

  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Genre', data.hodGenre.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Nom complet HoD', data.hodName.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Fonction HoD', data.hodFunction.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Genre', data.employeeGenre.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'Nom complet employe',
    data.employeeName.trim(),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Matricule', data.employeeMatricule.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'date_embauche',
    formatDocumentDate(data.dateEmbauche, data.language),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Fonction', data.employeeFunction.trim(), cursor));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'Departement',
    data.employeeDepartment.trim(),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(
    next,
    'DATE',
    formatDocumentDate(data.documentDate, data.language),
    cursor,
  ));
  ({ xml: next, index: cursor } = replaceBracketInXmlOnce(next, 'Nom complet HoD', data.hodName.trim(), cursor));
  ({ xml: next } = replaceBracketInXmlOnce(next, 'Fonction HoD', data.hodFunction.trim(), cursor));

  if (data.language === 'en') {
    next = applyEnglishBoilerplate(next);
  }

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

export function buildServiceAttestationPreviewHtml(plainText: string): string {
  const paragraphs = plainText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

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

  return `<div class="service-attestation-preview-doc">${body}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatServiceAttestationFileName(
  employeeName: string,
  documentDate: string,
  language: 'fr' | 'en',
): string {
  const safeName = employeeName.trim().replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_') || 'employe';
  const datePart = documentDate.trim() || new Date().toISOString().slice(0, 10);
  const prefix = language === 'en' ? 'Service_Certificate' : 'Attestation_service';
  return `${prefix}_${safeName}_${datePart}.docx`;
}
