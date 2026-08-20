import { getBudgetAmountsForCategory, type EmployeeAllowanceCategory } from './travel-allowance-rates';
import type { MissionSiteId } from './travel-mission-sites';

export const TRAVEL_COMPANY_OPTIONS = [
  'PPC Barnet Manufacturing SA',
  'PPC Barnet Quarring SA',
] as const;

export type TravelCompanyName = (typeof TRAVEL_COMPANY_OPTIONS)[number];

export interface TripBudgetLine {
  label: string;
  amount: number;
}

export interface FlightBookingFields {
  passportFullName: string;
  nearestAirport: string;
  carrier: string;
  frequentFlyerNumber: string;
  seatPreference: string;
  estimatedCost: string;
  flyDepartureDate: string;
  flyDepartureFrom: string;
  flyDepartureTo: string;
  flyReturnDate: string;
  flyReturnFrom: string;
  flyReturnTo: string;
}

export const emptyFlightBookingFields = (): FlightBookingFields => ({
  passportFullName: '',
  nearestAirport: '',
  carrier: '',
  frequentFlyerNumber: '',
  seatPreference: '',
  estimatedCost: '',
  flyDepartureDate: '',
  flyDepartureFrom: '',
  flyDepartureTo: '',
  flyReturnDate: '',
  flyReturnFrom: '',
  flyReturnTo: '',
});

export const DEFAULT_TRIP_BUDGET_LABELS = [
  'Accommodation ( Required)',
  'Food allowance ',
  'Trip allowance ',
  'Transport (if required)',
  'Airport Tax ( If required)',
  'Toll ( if required)',
] as const;

export const MAX_BUDGET_LINES = 10;

export interface TravelFormFields {
  position: string;
  department: string;
  tripPurpose: string;
  costCenter: string;
  documentDate: string;
  departureDate: string;
  departurePlace: string;
  destinationPlace: string;
  returnDate: string;
  peopleCount: number;
  companyName: TravelCompanyName | '';
  departmentToWorkWith: string;
  contactPerson: string;
  transportMeans: string;
  paymentOrderSignatory: string;
  budgetLines: TripBudgetLine[];
  isInternationalTravel?: boolean;
  flightBooking?: FlightBookingFields;
  /** Site d’émission de l’ordre de mission (KN / ZA / ZC / LU). */
  missionSite?: MissionSiteId;
  missionCategory?: string;
  missionType?: string;
  missionObservation?: string;
}

export function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createDefaultBudgetLines(
  category: EmployeeAllowanceCategory = 'others',
): TripBudgetLine[] {
  const amounts = getBudgetAmountsForCategory(category);
  return DEFAULT_TRIP_BUDGET_LABELS.map((label) => ({
    label,
    amount: amounts[label] ?? 0,
  }));
}

export function emptyBudgetLine(): TripBudgetLine {
  return { label: '', amount: 0 };
}

export function computeTripDays(departureDate: string, returnDate: string): number {
  if (!departureDate.trim() || !returnDate.trim()) return 0;
  const start = new Date(`${departureDate.trim()}T00:00:00`);
  const end = new Date(`${returnDate.trim()}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function computeHotelNights(departureDate: string, returnDate: string): number {
  const tripDays = computeTripDays(departureDate, returnDate);
  if (tripDays <= 1) return tripDays;
  return tripDays - 1;
}

export function formatMissionDuration(tripDays: number): string {
  if (tripDays <= 0) return '';
  return `${tripDays} Jour${tripDays > 1 ? 's' : ''}`;
}

export function normalizeBudgetLines(lines: TripBudgetLine[]): TripBudgetLine[] {
  return lines
    .map((line) => ({
      label: line.label.trim(),
      amount: Math.round((Number(line.amount) || 0) * 100) / 100,
    }))
    .filter((line) => line.label);
}

export function computeBudgetLineTotal(
  amount: number,
  peopleCount: number,
  tripDays: number,
): number {
  if (amount <= 0 || peopleCount <= 0 || tripDays <= 0) return 0;
  return Math.round(amount * peopleCount * tripDays * 100) / 100;
}

export function computeBudgetTotal(
  budgetLines: TripBudgetLine[],
  peopleCount: number,
  tripDays: number,
): number {
  return budgetLines.reduce(
    (sum, line) => sum + computeBudgetLineTotal(line.amount, peopleCount, tripDays),
    0,
  );
}

export function buildWorkDestination(destinationPlace: string, departmentToWorkWith: string): string {
  const destination = destinationPlace.trim();
  const department = departmentToWorkWith.trim();
  if (destination && department) return `${destination} — ${department}`;
  return destination || department;
}
