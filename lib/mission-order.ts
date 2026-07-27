import 'server-only';

import {
  escapeXmlText,
  fillEmptyParagraph,
  formatEmployeeWithMatricule,
  replaceFirstPreserveSpaceAfter,
  replaceOnce,
  writeDocxFromTemplate,
} from './docx-template';
import { formatMissionDuration } from './travel-form';
import { MISSION_ORDER_TEMPLATE_PATH } from './travel-template-paths';
import { formatDisplayDate } from './xlsx-populate-utils';

export { MISSION_ORDER_TEMPLATE_PATH };

export interface MissionOrderFillInput {
  employeeName: string;
  employeeMatricule: string;
  position: string;
  tripPurpose: string;
  tripDays: number;
  departureDate: string;
  returnDate: string;
  transportMeans: string;
  companyName: string;
  documentDate: string;
  signatoryName: string;
  signatoryPosition: string;
  missionRef: string;
}

const MISSION_REF_PARA_ID = '78B70347';

function replaceMissionReference(xml: string, missionRef: string): string {
  const marker = `w14:paraId="${MISSION_REF_PARA_ID}"`;
  const paraIndex = xml.indexOf(marker);
  if (paraIndex < 0) {
    throw new Error('Référence mission introuvable dans le modèle Ordre de mission');
  }

  const paragraphStart = xml.lastIndexOf('<w:p ', paraIndex);
  const paragraphEnd = xml.indexOf('</w:p>', paraIndex);
  if (paragraphStart < 0 || paragraphEnd < 0) {
    throw new Error('Paragraphe référence mission introuvable');
  }

  const paragraph = xml.slice(paragraphStart, paragraphEnd + '</w:p>'.length);
  const pPrEnd = paragraph.indexOf('</w:pPr>');
  const run = `<w:r w:rsidRPr="02C28A1D"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/><w:lang w:val="fr-FR"/></w:rPr><w:t>${escapeXmlText(missionRef.trim())}</w:t></w:r>`;

  const newParagraph =
    pPrEnd >= 0
      ? `${paragraph.slice(0, pPrEnd + '</w:pPr>'.length)}${run}</w:p>`
      : `${paragraph.slice(0, paragraph.indexOf('>') + 1)}${run}</w:p>`;

  return `${xml.slice(0, paragraphStart)}${newParagraph}${xml.slice(paragraphEnd + '</w:p>'.length)}`;
}

function replaceMissionFieldValue(xml: string, label: string, value: string): string {
  const labelIndex = xml.indexOf(label);
  if (labelIndex < 0) {
    throw new Error(`Champ introuvable dans le modèle Word : ${label}`);
  }

  const paragraphEnd = xml.indexOf('</w:p>', labelIndex);
  if (paragraphEnd < 0) {
    throw new Error(`Fin de paragraphe introuvable pour : ${label}`);
  }

  const paragraph = xml.slice(labelIndex, paragraphEnd);
  const colonPatterns = ['<w:t xml:space="preserve">: </w:t>', '<w:t>:</w:t>'];
  let colonMatchIndex = -1;
  let colonPatternLength = 0;
  for (const pattern of colonPatterns) {
    const relativeIndex = paragraph.indexOf(pattern);
    if (relativeIndex >= 0) {
      colonMatchIndex = labelIndex + relativeIndex;
      colonPatternLength = pattern.length;
      break;
    }
  }
  if (colonMatchIndex < 0) {
    throw new Error(`Séparateur introuvable pour : ${label}`);
  }

  const runEnd = xml.indexOf('</w:r>', colonMatchIndex + colonPatternLength);
  if (runEnd < 0 || runEnd > paragraphEnd) {
    throw new Error(`Fin de run introuvable pour : ${label}`);
  }

  const insertPos = runEnd + '</w:r>'.length;
  const before = xml.slice(0, insertPos);
  const after = xml.slice(paragraphEnd);
  const run = `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="fr-FR"/></w:rPr><w:t xml:space="preserve"> ${escapeXmlText(value)}</w:t></w:r>`;
  return `${before}${run}${after}`;
}

function replaceFraisChargeDe(xml: string, companyName: string): string {
  const marker = 'harge de</w:t>';
  const markerIndex = xml.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('Champ Frais à charge de introuvable dans le modèle Word');
  }

  const paragraphEnd = xml.indexOf('</w:p>', markerIndex);
  if (paragraphEnd < 0) {
    throw new Error('Fin de paragraphe introuvable pour Frais à charge de');
  }

  const runEnd = xml.indexOf('</w:r>', markerIndex);
  if (runEnd < 0 || runEnd > paragraphEnd) {
    throw new Error('Fin de run introuvable pour Frais à charge de');
  }

  const insertPos = runEnd + '</w:r>'.length;
  const before = xml.slice(0, insertPos);
  const after = xml.slice(paragraphEnd);
  const run = `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="fr-FR"/></w:rPr><w:t xml:space="preserve"> : ${escapeXmlText(companyName.trim())}</w:t></w:r>`;
  return `${before}${run}${after}`;
}

function fillMissionOrderXml(xml: string, record: MissionOrderFillInput): string {
  const employeeLine = formatEmployeeWithMatricule(record.employeeName, record.employeeMatricule);
  const duration = formatMissionDuration(record.tripDays);
  const departure = formatDisplayDate(record.departureDate);
  const returnDate = formatDisplayDate(record.returnDate);
  const documentDate = formatDisplayDate(record.documentDate);

  let next = xml;

  next = replaceMissionReference(next, record.missionRef);

  next = fillEmptyParagraph(next, '6445B72C', employeeLine, {
    font: 'Times New Roman',
    size: '24',
  });
  next = fillEmptyParagraph(next, '6190F451', record.position.trim(), {
    font: 'Times New Roman',
    size: '24',
    bold: true,
  });

  next = replaceMissionFieldValue(next, 'Objet de la mission</w:t>', record.tripPurpose.trim());
  next = replaceMissionFieldValue(next, 'Durée de la mission</w:t>', duration);
  next = replaceMissionFieldValue(next, 'Début de la Mission</w:t>', departure);
  next = replaceMissionFieldValue(next, 'Fin de la mission</w:t>', returnDate);
  next = replaceMissionFieldValue(next, 'Moyen de transport</w:t>', record.transportMeans.trim());
  next = replaceFraisChargeDe(next, record.companyName.trim());

  next = replaceFirstPreserveSpaceAfter(next, ', le</w:t>', documentDate);

  next = replaceOnce(
    next,
    'Pelagie KINKINIA</w:t>',
    `${escapeXmlText(record.signatoryName.trim())}</w:t>`,
  );
  next = replaceOnce(
    next,
    'Plant HR Manager</w:t>',
    `${escapeXmlText(record.signatoryPosition.trim() || record.signatoryName.trim())}</w:t>`,
  );

  return next;
}

export async function fillMissionOrderTemplate(
  record: MissionOrderFillInput,
  outputPath: string,
): Promise<void> {
  await writeDocxFromTemplate(MISSION_ORDER_TEMPLATE_PATH, outputPath, (xml) =>
    fillMissionOrderXml(xml, record),
  );
}
