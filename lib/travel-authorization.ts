import 'server-only';

import {
  computeBudgetTotal,
  type TripBudgetLine,
} from './travel-form';
import {
  formatEmployeeWithMatricule,
  replaceOnce,
  writeDocxFromTemplate,
} from './docx-template';
import { TRAVEL_AUTHORIZATION_TEMPLATE_PATH } from './travel-template-paths';
import { formatDisplayDate } from './xlsx-populate-utils';

export { TRAVEL_AUTHORIZATION_TEMPLATE_PATH };

export interface TravelAuthorizationFillInput {
  documentDate: string;
  employeeName: string;
  employeeMatricule: string;
  position: string;
  workDestination: string;
  departureDate: string;
  returnDate: string;
  tripPurpose: string;
  budgetLines: TripBudgetLine[];
  peopleCount: number;
  tripDays: number;
  currency?: string;
}

function formatAllowanceAmount(
  budgetLines: TripBudgetLine[],
  peopleCount: number,
  tripDays: number,
  currency: string,
): string {
  const total = computeBudgetTotal(budgetLines, peopleCount, tripDays);
  if (total <= 0) return '';
  const formatted = total.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency.trim() || 'USD'}`;
}

function fillTravelAuthorizationXml(xml: string, record: TravelAuthorizationFillInput): string {
  const currency = record.currency?.trim() || 'USD';
  let next = xml;

  next = replaceOnce(
    next,
    '<w:t xml:space="preserve">Date: </w:t>',
    `<w:t xml:space="preserve">Date: ${formatDisplayDate(record.documentDate)}</w:t>`,
  );
  next = replaceOnce(
    next,
    '<w:t xml:space="preserve">Name: </w:t>',
    `<w:t xml:space="preserve">Name: ${formatEmployeeWithMatricule(record.employeeName, record.employeeMatricule)}</w:t>`,
  );
  next = replaceOnce(
    next,
    '<w:t xml:space="preserve">Position: </w:t>',
    `<w:t xml:space="preserve">Position: ${record.position.trim()}</w:t>`,
  );
  next = replaceOnce(
    next,
    '<w:t xml:space="preserve">Travail destination : </w:t>',
    `<w:t xml:space="preserve">Travail destination : ${record.workDestination.trim()}</w:t>`,
  );
  next = replaceOnce(
    next,
    '<w:t xml:space="preserve"> date :  </w:t>',
    `<w:t xml:space="preserve"> date : ${formatDisplayDate(record.departureDate)}</w:t>`,
  );
  next = replaceOnce(
    next,
    '<w:t xml:space="preserve">Return date: </w:t>',
    `<w:t xml:space="preserve">Return date: ${formatDisplayDate(record.returnDate)}</w:t>`,
  );
  next = replaceOnce(
    next,
    '<w:t xml:space="preserve">Travel allowance amount requested: </w:t>',
    `<w:t xml:space="preserve">Travel allowance amount requested: ${formatAllowanceAmount(
      record.budgetLines,
      record.peopleCount,
      record.tripDays,
      currency,
    )}</w:t>`,
  );

  const purposePattern =
    /<w:t xml:space="preserve">Travel <\/w:t><\/w:r><w:proofErr w:type="spellStart"\/>[\s\S]*?<w:t xml:space="preserve"> <\/w:t>/;
  const purposeMatch = next.match(purposePattern);
  if (!purposeMatch || purposeMatch.index === undefined) {
    throw new Error('Champ Travel purpose introuvable dans le modèle Word');
  }
  const purposeReplacement = purposeMatch[0].replace(
    /<w:t xml:space="preserve"> <\/w:t>$/,
    `<w:t xml:space="preserve"> ${record.tripPurpose.trim()}</w:t>`,
  );
  next = `${next.slice(0, purposeMatch.index)}${purposeReplacement}${next.slice(
    purposeMatch.index + purposeMatch[0].length,
  )}`;

  return next;
}

export async function fillTravelAuthorizationTemplate(
  record: TravelAuthorizationFillInput,
  outputPath: string,
): Promise<void> {
  await writeDocxFromTemplate(TRAVEL_AUTHORIZATION_TEMPLATE_PATH, outputPath, (xml) =>
    fillTravelAuthorizationXml(xml, record),
  );
}
