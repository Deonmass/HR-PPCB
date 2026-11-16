import 'server-only';

import path from 'path';
import { fillDocxTemplateToBuffer } from './docx-template';
import { replaceDocxText } from './docx-fill';
import {
  CONFIRMATION_SIGNATORY_NAME,
  CONFIRMATION_SIGNATORY_TITLE,
  formatLetterEffectDate,
  formatLetterHeaderDate,
  parseIsoOrDisplayDate,
  type ConfirmationLetterInput,
} from './confirmation-letter';

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'Excel',
  'templates',
  'documents',
  'Template Confirmation letter.docx',
);

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function safe(value: string, fallback = '—'): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export async function generateConfirmationLetter(
  input: ConfirmationLetterInput,
): Promise<{ fileName: string; buffer: Buffer }> {
  const letterDate = parseIsoOrDisplayDate(input.letterDate) ?? new Date();
  const confirmationDate = parseIsoOrDisplayDate(input.confirmationDate) ?? letterDate;
  const name = safe(input.employeeName);
  const family = safe(input.familyName, name.split(/\s+/)[0] || name);
  const civility = input.civility === 'Madame' ? 'Madame' : 'Monsieur';
  const jobTitle = safe(input.jobTitle);
  const companyShort = safe(input.companyShort, 'PPC Barnet DRC');
  const companyLegal = safe(input.companyLegal, 'PPC Barnet DRC Manufacturing S.A');
  const city = safe(input.city, 'Kinshasa');
  const signatory = safe(input.signatoryName, CONFIRMATION_SIGNATORY_NAME);
  const signatoryTitle = safe(input.signatoryTitle, CONFIRMATION_SIGNATORY_TITLE);
  const matricule = safe(input.matricule);

  const buffer = await fillDocxTemplateToBuffer(TEMPLATE_PATH, (xml) => {
    let out = xml;
    out = replaceDocxText(out, 'Revenue & Inventory Controller', jobTitle, { optional: true });
    out = replaceDocxText(out, 'PPC Barnet DRC Manufacturing S.A', companyLegal, { optional: true });
    out = replaceDocxText(out, 'PPC Barnet DRC', companyShort, { occurrence: 'all', optional: true });
    out = replaceDocxText(out, 'Kinshasa, le 02 novembre 2026', `${city}, le ${formatLetterHeaderDate(letterDate)}`, {
      optional: true,
    });
    out = replaceDocxText(out, '1 novembre 2026', formatLetterEffectDate(confirmationDate), { optional: true });
    out = replaceDocxText(out, 'Monsieur NDONDA', `${civility} ${family}`, { optional: true });
    out = replaceDocxText(out, 'NDONDA Pascal', name, { optional: true });
    out = replaceDocxText(out, '70000307', matricule, { optional: true });
    out = replaceDocxText(out, 'Carine EWULI SUKA', signatory, { optional: true });
    out = replaceDocxText(out, 'Directrice des Ressources Humaines', signatoryTitle, { optional: true });
    return out;
  });

  return {
    fileName: sanitizeFileName(`Lettre de confirmation - ${name} ${matricule}.docx`),
    buffer,
  };
}
