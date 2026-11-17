import 'server-only';

import path from 'path';
import { fillDocxTemplateToBuffer } from './docx-template';
import { replaceDocxText } from './docx-fill';
import {
  CONFIRMATION_SIGNATORY_NAME,
  CONFIRMATION_SIGNATORY_TITLE,
  buildConfirmationParagraph,
  formatLetterEffectDate,
  formatLetterHeaderDate,
  parseIsoOrDisplayDate,
  wholeMonthsBetween,
  type ConfirmationLetterInput,
} from './confirmation-letter';

/** Paragraphe d’origine du modèle, remplacé en entier. */
const TEMPLATE_BODY =
  "Suite à l'évaluation favorable de vos prestations durant la période d'essai prévue à votre contrat de travail, nous avons le plaisir de vous confirmer dans vos fonctions de Revenue & Inventory Controller au sein de PPC Barnet DRC Manufacturing S.A, avec effet au 1 novembre 2026.";

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
  const trialStart = parseIsoOrDisplayDate(input.trialStartDate);
  const trialMonths =
    input.trialMonths != null && Number.isFinite(input.trialMonths) && input.trialMonths > 0
      ? input.trialMonths
      : wholeMonthsBetween(trialStart, confirmationDate);
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

  const paragraph = buildConfirmationParagraph({
    trialMonths,
    trialStartLabel: trialStart ? formatLetterEffectDate(trialStart) : '',
    jobTitle,
    companyLegal,
    effectLabel: formatLetterEffectDate(confirmationDate),
  });

  const buffer = await fillDocxTemplateToBuffer(TEMPLATE_PATH, (xml) => {
    let out = xml;
    out = replaceDocxText(out, 'PPC Barnet DRC', companyShort, { optional: true });
    out = replaceDocxText(out, TEMPLATE_BODY, paragraph);
    out = replaceDocxText(out, 'Kinshasa, le 02 novembre 2026', `${city}, le ${formatLetterHeaderDate(letterDate)}`, {
      optional: true,
    });
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
