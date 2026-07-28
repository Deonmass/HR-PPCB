import 'server-only';

import path from 'path';

const TRAVEL_TEMPLATE_DIR = path.join(process.cwd(), 'Excel', 'templates', 'travel');

export function getTravelTemplateDirectory(): string {
  return process.env.TRAVEL_TEMPLATE_DIR?.trim()
    ? path.resolve(process.env.TRAVEL_TEMPLATE_DIR.trim())
    : TRAVEL_TEMPLATE_DIR;
}

export function resolveTravelTemplate(fileName: string, envOverride?: string): string {
  if (envOverride?.trim()) return path.resolve(envOverride.trim());
  return path.join(getTravelTemplateDirectory(), fileName);
}

export const TRAVEL_TEMPLATE_FILES = {
  cashRequest: 'Cash Request.xlsx',
  tripBudget: 'TRIP BUDGET FORM.xlsx',
  travelAuthorization: "Formulaire d'autorisation de voyage.docx",
  hotelBooking: 'Hotel booking form HR DOC 07 version 02.docx',
  missionOrder: 'Ordre de mission.docx',
  flightBooking: 'FLIGHT BOOKING FORM DOC-PPCB-HR-06 version 03.doc',
  travelHistory: 'Historique mission.xlsx',
} as const;

export const CASH_REQUEST_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.cashRequest,
  process.env.CASH_REQUEST_TEMPLATE_XLSX,
);

export const TRIP_BUDGET_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.tripBudget,
  process.env.TRIP_BUDGET_TEMPLATE_XLSX,
);

export const TRAVEL_AUTHORIZATION_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.travelAuthorization,
  process.env.TRAVEL_AUTHORIZATION_TEMPLATE_DOCX,
);

export const HOTEL_BOOKING_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.hotelBooking,
  process.env.HOTEL_BOOKING_TEMPLATE_DOCX,
);

export const MISSION_ORDER_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.missionOrder,
  process.env.MISSION_ORDER_TEMPLATE_DOCX,
);

export const FLIGHT_BOOKING_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.flightBooking,
  process.env.FLIGHT_BOOKING_TEMPLATE_DOC,
);

export const TRAVEL_HISTORY_EXPORT_TEMPLATE_PATH = resolveTravelTemplate(
  TRAVEL_TEMPLATE_FILES.travelHistory,
  process.env.TRAVEL_HISTORY_XLSX,
);

export function resolveTravelHistoryPath(): string {
  return TRAVEL_HISTORY_EXPORT_TEMPLATE_PATH;
}
