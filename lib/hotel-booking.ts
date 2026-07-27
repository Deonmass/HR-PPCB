import 'server-only';

import {
  fillEmptyParagraph,
  formatEmployeeWithMatricule,
  replaceFirstPreserveSpaceAfter,
  replaceOnce,
  writeDocxFromTemplate,
} from './docx-template';
import { formatDisplayDate } from './xlsx-populate-utils';
import { computeHotelNights } from './travel-form';
import { HOTEL_BOOKING_TEMPLATE_PATH } from './travel-template-paths';

export { HOTEL_BOOKING_TEMPLATE_PATH };

export interface HotelBookingFillInput {
  employeeName: string;
  employeeMatricule: string;
  department: string;
  destinationPlace: string;
  companyName: string;
  tripPurpose: string;
  departureDate: string;
  returnDate: string;
  departmentToWorkWith: string;
  contactPerson: string;
}

function fillHotelBookingXml(xml: string, record: HotelBookingFillInput): string {
  const guestName = formatEmployeeWithMatricule(record.employeeName, record.employeeMatricule);
  const checkIn = formatDisplayDate(record.departureDate);
  const checkOut = formatDisplayDate(record.returnDate);
  const nights = String(computeHotelNights(record.departureDate, record.returnDate));

  let next = xml;

  next = replaceFirstPreserveSpaceAfter(
    next,
    'Employee / Guest </w:t></w:r><w:r w:rsidR="3E4ABD06"',
    guestName,
  );
  next = replaceFirstPreserveSpaceAfter(next, 'Department:</w:t>', record.department.trim());
  next = replaceOnce(next, '<w:t>origin</w:t>', '<w:t>destination</w:t>');
  next = replaceFirstPreserveSpaceAfter(
    next,
    'if applicable</w:t>',
    record.destinationPlace.trim(),
  );
  next = replaceFirstPreserveSpaceAfter(
    next,
    'Company </w:t></w:r><w:r w:rsidR="3E4ABD06"',
    record.companyName.trim(),
  );
  next = replaceFirstPreserveSpaceAfter(next, 'visit:</w:t>', record.tripPurpose.trim());
  next = replaceFirstPreserveSpaceAfter(next, 'Arrival </w:t></w:r><w:r w:rsidR="3E4ABD06"', checkIn);
  next = replaceFirstPreserveSpaceAfter(next, 'Departure </w:t></w:r><w:r w:rsidR="3E4ABD06"', checkOut);
  next = replaceFirstPreserveSpaceAfter(
    next,
    'Department to work </w:t></w:r><w:r w:rsidR="3E4ABD06"',
    record.departmentToWorkWith.trim(),
  );
  next = replaceFirstPreserveSpaceAfter(
    next,
    'w:rsidR="008A069D" w:rsidRPr="004F3F40"',
    record.contactPerson.trim(),
  );

  next = fillEmptyParagraph(next, '0AD8CE92', guestName);
  next = fillEmptyParagraph(next, '3A7968DE', checkIn);
  next = fillEmptyParagraph(next, '5EB8DE78', checkOut);
  next = fillEmptyParagraph(next, '753B88EB', nights);

  return next;
}

export async function fillHotelBookingTemplate(
  record: HotelBookingFillInput,
  outputPath: string,
): Promise<void> {
  await writeDocxFromTemplate(HOTEL_BOOKING_TEMPLATE_PATH, outputPath, (xml) =>
    fillHotelBookingXml(xml, record),
  );
}
