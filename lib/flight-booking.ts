import 'server-only';

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { formatDisplayDate } from './xlsx-populate-utils';
import { FLIGHT_BOOKING_TEMPLATE_PATH } from './travel-template-paths';
import type { FlightBookingFields } from './travel-form';

const execFileAsync = promisify(execFile);
const FILL_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'fill-flight-booking.ps1');

export { FLIGHT_BOOKING_TEMPLATE_PATH };

export interface FlightBookingFillInput extends FlightBookingFields {
  employeeName: string;
  tripPurpose: string;
  peopleCount: number;
}

function buildFillPayload(record: FlightBookingFillInput) {
  return {
    passportFullName: record.passportFullName.trim(),
    purpose: record.tripPurpose.trim(),
    numberOfTravellers: record.peopleCount,
    nearestAirport: record.nearestAirport.trim(),
    carrier: record.carrier.trim(),
    frequentFlyerNumber: record.frequentFlyerNumber.trim(),
    seatPreference: record.seatPreference.trim(),
    estimatedCost: record.estimatedCost.trim(),
    flyDepartureDate: formatDisplayDate(record.flyDepartureDate),
    flyDepartureFrom: record.flyDepartureFrom.trim(),
    flyDepartureTo: record.flyDepartureTo.trim(),
    flyReturnDate: formatDisplayDate(record.flyReturnDate),
    flyReturnFrom: record.flyReturnFrom.trim(),
    flyReturnTo: record.flyReturnTo.trim(),
    employeeName: record.employeeName.trim(),
  };
}

export async function fillFlightBookingTemplate(
  record: FlightBookingFillInput,
  outputPath: string,
): Promise<void> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      FILL_SCRIPT_PATH,
      '-TemplatePath',
      path.resolve(FLIGHT_BOOKING_TEMPLATE_PATH),
      '-OutputPath',
      path.resolve(outputPath),
      '-DataJson',
      JSON.stringify(buildFillPayload(record)),
    ],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );

  const resolved = stdout
    .trim()
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (!resolved) {
    throw new Error('FLIGHT BOOKING FORM non généré');
  }
}
