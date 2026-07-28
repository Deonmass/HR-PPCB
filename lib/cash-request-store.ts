import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import {
  buildRequestorLine,
  budgetLinesToCashRequestLines,
  computeCashRequestTotal,
} from './cash-request-utils';
import { fillCashRequestTemplate } from './cash-request';
import { readEmployees } from './employees-json-store';
import { fillFlightBookingTemplate } from './flight-booking';
import { fillHotelBookingTemplate } from './hotel-booking';
import { fillMissionOrderTemplate } from './mission-order';
import { fillTripBudgetTemplate } from './trip-budget';
import { fillTravelAuthorizationTemplate } from './travel-authorization';
import {
  allocateMissionRef,
  appendTravelHistoryRow,
} from './travel-history-store';
import {
  buildWorkDestination,
  computeTripDays,
  normalizeBudgetLines,
  MAX_BUDGET_LINES,
  emptyFlightBookingFields,
  type TravelFormFields,
} from './travel-form';
import {
  buildCashRequestFileName,
  buildFlightBookingFileName,
  buildHotelBookingFileName,
  buildMissionOrderFileName,
  buildTravelAuthorizationFileName,
  buildTravelPdfFileName,
  buildTripBudgetFileName,
  resolveTravelSaveDirectory,
  uniqueFilePath,
} from './travel-paths';
import { buildTravelPdfBundle } from './travel-pdf';
import type {
  CashRequestLine,
  CashRequestRecord,
  TravelFileType,
  TravelGeneratedFile,
  TravelHistoryData,
} from './travel-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import fsSync from 'fs';

const DATA_DIR = canPersistProjectFiles()
  ? path.join(process.cwd(), 'data', 'travel')
  : path.join(getWritableDataRoot(), 'travel');
const HISTORY_PATH = path.join(DATA_DIR, 'cash-requests.json');

function seedTravelHistoryIfNeeded(): void {
  if (canPersistProjectFiles()) return;
  const bundled = path.join(process.cwd(), 'data', 'travel', 'cash-requests.json');
  try {
    if (!fsSync.existsSync(HISTORY_PATH) && fsSync.existsSync(bundled)) {
      fsSync.mkdirSync(DATA_DIR, { recursive: true });
      fsSync.copyFileSync(bundled, HISTORY_PATH);
    }
  } catch {
    // ignore
  }
}
seedTravelHistoryIfNeeded();

let generationChain: Promise<unknown> = Promise.resolve();

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readHistory(): Promise<TravelHistoryData> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, 'utf8');
    const json = JSON.parse(raw) as TravelHistoryData;
    return { cashRequests: json.cashRequests ?? [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { cashRequests: [] };
    throw err;
  }
}

async function writeHistory(data: TravelHistoryData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function listCashRequests(): Promise<CashRequestRecord[]> {
  const data = await readHistory();
  return [...data.cashRequests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getCashRequest(id: string): Promise<CashRequestRecord | undefined> {
  const data = await readHistory();
  return data.cashRequests.find((item) => item.id === id);
}

export async function getCashRequestByMissionRef(
  missionRef: string,
): Promise<CashRequestRecord | undefined> {
  const normalized = missionRef.trim();
  if (!normalized) return undefined;
  const data = await readHistory();
  return data.cashRequests.find((item) => item.missionRef?.trim() === normalized);
}

export async function deleteCashRequestByMissionRef(missionRef: string): Promise<boolean> {
  const normalized = missionRef.trim();
  if (!normalized) return false;

  const data = await readHistory();
  const before = data.cashRequests.length;
  data.cashRequests = data.cashRequests.filter(
    (item) => item.missionRef?.trim() !== normalized,
  );
  if (data.cashRequests.length === before) return false;
  await writeHistory(data);
  return true;
}

export async function getCashRequestFilePath(record: CashRequestRecord): Promise<string> {
  if (record.filePath && (await fileExists(record.filePath))) {
    return record.filePath;
  }
  const legacyPath = path.join(DATA_DIR, 'files', `${record.id}.xlsx`);
  if (await fileExists(legacyPath)) return legacyPath;
  if (record.filePath) return record.filePath;
  throw new Error(`Fichier introuvable pour le document ${record.id}`);
}

export interface CreateTravelDocumentsInput {
  employeeMatricule: string;
  employeeName: string;
  employeeDepartment: string;
  travel: TravelFormFields;
  lines: CashRequestLine[];
  saveDirectory?: string;
  /** Si fourni, seuls ces types de fichiers sont générés. Sinon : tous. */
  selectedDocuments?: TravelFileType[];
}

export type TravelGenerationProgressEvent = {
  type: 'step-start' | 'step-complete';
  stepId: TravelFileType;
};

export type TravelGenerationProgressCallback = (event: TravelGenerationProgressEvent) => void;

async function trackDocumentStep(
  stepId: TravelFileType,
  task: () => Promise<unknown>,
  onProgress?: TravelGenerationProgressCallback,
): Promise<void> {
  onProgress?.({ type: 'step-start', stepId });
  await task();
  onProgress?.({ type: 'step-complete', stepId });
}

function resolveSignatoryPosition(signatoryName: string, employees: Awaited<ReturnType<typeof readEmployees>>): string {
  const normalized = signatoryName.trim().toLowerCase();
  if (!normalized) return '';
  const match = employees.find((employee) => employee.nom.trim().toLowerCase() === normalized);
  return match?.jobTitle?.trim() || match?.grade?.trim() || '';
}

function normalizeTravelForm(travel: TravelFormFields): TravelFormFields {
  return {
    position: travel.position.trim(),
    department: travel.department.trim(),
    tripPurpose: travel.tripPurpose.trim(),
    costCenter: travel.costCenter.trim(),
    documentDate: travel.documentDate.trim(),
    departureDate: travel.departureDate.trim(),
    departurePlace: travel.departurePlace.trim(),
    destinationPlace: travel.destinationPlace.trim(),
    returnDate: travel.returnDate.trim(),
    peopleCount: Math.max(1, Number(travel.peopleCount) || 1),
    companyName: travel.companyName,
    departmentToWorkWith: travel.departmentToWorkWith.trim(),
    contactPerson: travel.contactPerson.trim(),
    transportMeans: travel.transportMeans.trim(),
    paymentOrderSignatory: travel.paymentOrderSignatory.trim(),
    budgetLines: normalizeBudgetLines(travel.budgetLines),
    isInternationalTravel: Boolean(travel.isInternationalTravel),
    flightBooking: travel.isInternationalTravel
      ? {
          passportFullName: travel.flightBooking?.passportFullName?.trim() ?? '',
          nearestAirport: travel.flightBooking?.nearestAirport?.trim() ?? '',
          carrier: travel.flightBooking?.carrier?.trim() ?? '',
          frequentFlyerNumber: travel.flightBooking?.frequentFlyerNumber?.trim() ?? '',
          seatPreference: travel.flightBooking?.seatPreference?.trim() ?? '',
          estimatedCost: travel.flightBooking?.estimatedCost?.trim() ?? '',
          flyDepartureDate: travel.flightBooking?.flyDepartureDate?.trim() ?? '',
          flyDepartureFrom: travel.flightBooking?.flyDepartureFrom?.trim() ?? '',
          flyDepartureTo: travel.flightBooking?.flyDepartureTo?.trim() ?? '',
          flyReturnDate: travel.flightBooking?.flyReturnDate?.trim() ?? '',
          flyReturnFrom: travel.flightBooking?.flyReturnFrom?.trim() ?? '',
          flyReturnTo: travel.flightBooking?.flyReturnTo?.trim() ?? '',
        }
      : undefined,
  };
}

export async function createTravelDocuments(
  input: CreateTravelDocumentsInput,
  onProgress?: TravelGenerationProgressCallback,
): Promise<CashRequestRecord> {
  const run = generationChain.then(() => createTravelDocumentsInternal(input, onProgress));
  generationChain = run.catch(() => undefined);
  return run;
}

async function createTravelDocumentsInternal(
  input: CreateTravelDocumentsInput,
  onProgress?: TravelGenerationProgressCallback,
): Promise<CashRequestRecord> {
  const rawBudgetLines = input.travel.budgetLines ?? [];
  if (rawBudgetLines.length < 1) {
    throw new Error('Ajoutez au moins une ligne au budget voyage');
  }
  if (rawBudgetLines.length > MAX_BUDGET_LINES) {
    throw new Error(`Maximum ${MAX_BUDGET_LINES} lignes au budget voyage`);
  }

  const travel = normalizeTravelForm(input.travel);

  const selectedSet = new Set<TravelFileType>(
    input.selectedDocuments?.length
      ? input.selectedDocuments
      : ([
          'cash-request',
          'trip-budget',
          'travel-authorization',
          'hotel-booking',
          ...(travel.isInternationalTravel ? (['flight-booking'] as const) : []),
          'mission-order',
          'travel-pdf',
        ] as TravelFileType[]),
  );

  const wants = (type: TravelFileType) => selectedSet.has(type);

  if (input.selectedDocuments && input.selectedDocuments.length === 0) {
    throw new Error('Sélectionnez au moins un fichier à générer');
  }

  const contentTypes: TravelFileType[] = [
    'cash-request',
    'trip-budget',
    'travel-authorization',
    'hotel-booking',
    'flight-booking',
    'mission-order',
  ];
  const wantsAnyContent = contentTypes.some((type) => wants(type));
  if (!wantsAnyContent && !wants('travel-pdf')) {
    throw new Error('Sélectionnez au moins un fichier à générer');
  }
  if (wants('travel-pdf') && !wantsAnyContent) {
    throw new Error('Le PDF combiné nécessite au moins un autre document');
  }

  if (!input.employeeName.trim()) throw new Error('Employé requis');
  if (!travel.costCenter.trim()) throw new Error('Centre de coût requis');
  if (!travel.tripPurpose.trim()) throw new Error('Trip purpose requis');
  if (!travel.documentDate.trim()) throw new Error('Date document requise');
  if (!travel.departureDate.trim()) throw new Error('Departure date requise');
  if (!travel.returnDate.trim()) throw new Error('Return date requise');
  if (!travel.companyName) throw new Error('Company name requis');
  if (!travel.transportMeans.trim()) throw new Error('Moyen de transport requis');
  if (!travel.paymentOrderSignatory.trim()) {
    throw new Error('Signataire de l\'ordre de paiement requis');
  }
  if (!travel.budgetLines.length) {
    throw new Error('Renseignez au moins une description au budget voyage');
  }

  if (travel.isInternationalTravel) {
    const flight = travel.flightBooking ?? emptyFlightBookingFields();
    if (!flight.passportFullName.trim()) {
      throw new Error('Nom complet (passeport) requis pour un déplacement international');
    }
    if (!flight.nearestAirport.trim()) throw new Error('Aéroport le plus proche requis');
    if (!flight.carrier.trim()) throw new Error('Compagnie aérienne requise');
    if (!flight.flyDepartureDate.trim()) throw new Error('Date de vol aller requise');
    if (!flight.flyDepartureFrom.trim()) throw new Error('Vol aller — départ requis');
    if (!flight.flyDepartureTo.trim()) throw new Error('Vol aller — destination requise');
    if (!flight.flyReturnDate.trim()) throw new Error('Date de vol retour requise');
    if (!flight.flyReturnFrom.trim()) throw new Error('Vol retour — départ requis');
    if (!flight.flyReturnTo.trim()) throw new Error('Vol retour — destination requise');
    travel.flightBooking = flight;
  } else {
    travel.flightBooking = undefined;
  }

  const tripDays = computeTripDays(travel.departureDate, travel.returnDate);
  const lines = budgetLinesToCashRequestLines(travel.budgetLines, travel.peopleCount, tripDays);
  const missionRef = await allocateMissionRef(new Date());

  await ensureDataDir();

  const id = `cr-${Date.now()}`;
  const saveDirectory = resolveTravelSaveDirectory(input.saveDirectory);
  await fs.mkdir(saveDirectory, { recursive: true });

  const employees = await readEmployees();
  const signatoryPosition = resolveSignatoryPosition(travel.paymentOrderSignatory, employees);

  const cashFileName = buildCashRequestFileName(input.employeeName);
  const tripFileName = buildTripBudgetFileName(input.employeeName);
  const authFileName = buildTravelAuthorizationFileName(input.employeeName);
  const hotelFileName = buildHotelBookingFileName(input.employeeName);
  const flightFileName = buildFlightBookingFileName(input.employeeName);
  const missionFileName = buildMissionOrderFileName(input.employeeName);
  const pdfFileName = buildTravelPdfFileName(input.employeeName);

  const [
    cashFilePath,
    tripFilePath,
    authFilePath,
    hotelFilePath,
    flightFilePath,
    missionFilePath,
    pdfFilePath,
  ] = await Promise.all([
    wants('cash-request')
      ? uniqueFilePath(saveDirectory, cashFileName, fileExists)
      : Promise.resolve(null),
    wants('trip-budget')
      ? uniqueFilePath(saveDirectory, tripFileName, fileExists)
      : Promise.resolve(null),
    wants('travel-authorization')
      ? uniqueFilePath(saveDirectory, authFileName, fileExists)
      : Promise.resolve(null),
    wants('hotel-booking')
      ? uniqueFilePath(saveDirectory, hotelFileName, fileExists)
      : Promise.resolve(null),
    travel.isInternationalTravel && wants('flight-booking')
      ? uniqueFilePath(saveDirectory, flightFileName, fileExists)
      : Promise.resolve(null),
    wants('mission-order')
      ? uniqueFilePath(saveDirectory, missionFileName, fileExists)
      : Promise.resolve(null),
    wants('travel-pdf')
      ? uniqueFilePath(saveDirectory, pdfFileName, fileExists)
      : Promise.resolve(null),
  ]);

  const requestorLine = buildRequestorLine(
    input.employeeName,
    travel.department || input.employeeDepartment,
    travel.costCenter,
    input.employeeMatricule,
  );
  const total = computeCashRequestTotal(lines);

  const documentFillTasks: Promise<void>[] = [];

  if (cashFilePath) {
    documentFillTasks.push(
      trackDocumentStep(
        'cash-request',
        () =>
          fillCashRequestTemplate(
            {
              requestorLine,
              objet: travel.tripPurpose,
              requestDate: travel.documentDate,
              lines,
            },
            cashFilePath,
          ),
        onProgress,
      ),
    );
  }

  if (tripFilePath) {
    documentFillTasks.push(
      trackDocumentStep(
        'trip-budget',
        () =>
          fillTripBudgetTemplate(
            {
              employeeName: input.employeeName,
              employeeMatricule: input.employeeMatricule,
              departureDate: travel.departureDate,
              returnDate: travel.returnDate,
              tripPurpose: travel.tripPurpose,
              peopleCount: travel.peopleCount,
              budgetLines: travel.budgetLines,
            },
            tripFilePath,
          ),
        onProgress,
      ),
    );
  }

  if (authFilePath) {
    documentFillTasks.push(
      trackDocumentStep(
        'travel-authorization',
        () =>
          fillTravelAuthorizationTemplate(
            {
              documentDate: travel.documentDate,
              employeeName: input.employeeName,
              employeeMatricule: input.employeeMatricule,
              position: travel.position,
              workDestination: buildWorkDestination(travel.destinationPlace, travel.departmentToWorkWith),
              departureDate: travel.departureDate,
              returnDate: travel.returnDate,
              tripPurpose: travel.tripPurpose,
              budgetLines: travel.budgetLines,
              peopleCount: travel.peopleCount,
              tripDays,
              currency: 'USD',
            },
            authFilePath,
          ),
        onProgress,
      ),
    );
  }

  if (hotelFilePath) {
    documentFillTasks.push(
      trackDocumentStep(
        'hotel-booking',
        () =>
          fillHotelBookingTemplate(
            {
              employeeName: input.employeeName,
              employeeMatricule: input.employeeMatricule,
              department: travel.department || input.employeeDepartment,
              destinationPlace: travel.destinationPlace,
              companyName: travel.companyName,
              tripPurpose: travel.tripPurpose,
              departureDate: travel.departureDate,
              returnDate: travel.returnDate,
              departmentToWorkWith: travel.departmentToWorkWith,
              contactPerson: travel.contactPerson,
            },
            hotelFilePath,
          ),
        onProgress,
      ),
    );
  }

  if (missionFilePath) {
    documentFillTasks.push(
      trackDocumentStep(
        'mission-order',
        () =>
          fillMissionOrderTemplate(
            {
              employeeName: input.employeeName,
              employeeMatricule: input.employeeMatricule,
              position: travel.position,
              tripPurpose: travel.tripPurpose,
              tripDays,
              departureDate: travel.departureDate,
              returnDate: travel.returnDate,
              transportMeans: travel.transportMeans,
              companyName: travel.companyName,
              documentDate: travel.documentDate,
              signatoryName: travel.paymentOrderSignatory,
              signatoryPosition,
              missionRef,
            },
            missionFilePath,
          ),
        onProgress,
      ),
    );
  }

  if (flightFilePath && travel.flightBooking) {
    documentFillTasks.push(
      trackDocumentStep(
        'flight-booking',
        () =>
          fillFlightBookingTemplate(
            {
              ...travel.flightBooking!,
              employeeName: input.employeeName,
              tripPurpose: travel.tripPurpose,
              peopleCount: travel.peopleCount,
            },
            flightFilePath,
          ),
        onProgress,
      ),
    );
  }

  await Promise.all(documentFillTasks);

  const files: TravelGeneratedFile[] = [];
  if (cashFilePath) {
    files.push({
      type: 'cash-request',
      fileName: path.basename(cashFilePath),
      filePath: cashFilePath,
    });
  }
  if (tripFilePath) {
    files.push({
      type: 'trip-budget',
      fileName: path.basename(tripFilePath),
      filePath: tripFilePath,
    });
  }
  if (authFilePath) {
    files.push({
      type: 'travel-authorization',
      fileName: path.basename(authFilePath),
      filePath: authFilePath,
    });
  }
  if (hotelFilePath) {
    files.push({
      type: 'hotel-booking',
      fileName: path.basename(hotelFilePath),
      filePath: hotelFilePath,
    });
  }
  if (flightFilePath) {
    files.push({
      type: 'flight-booking',
      fileName: path.basename(flightFilePath),
      filePath: flightFilePath,
    });
  }
  if (missionFilePath) {
    files.push({
      type: 'mission-order',
      fileName: path.basename(missionFilePath),
      filePath: missionFilePath,
    });
  }

  if (pdfFilePath && files.length > 0) {
    await trackDocumentStep(
      'travel-pdf',
      () => buildTravelPdfBundle(files, pdfFilePath),
      onProgress,
    );
    files.push({
      type: 'travel-pdf',
      fileName: path.basename(pdfFilePath),
      filePath: pdfFilePath,
    });
  }

  const primary =
    files.find((file) => file.type === 'cash-request')
    ?? files.find((file) => file.type !== 'travel-pdf')
    ?? files[0];

  const record: CashRequestRecord = {
    id,
    type: 'cash-request',
    createdAt: new Date().toISOString(),
    missionRef,
    employeeMatricule: input.employeeMatricule.trim(),
    employeeName: input.employeeName.trim(),
    employeeDepartment: travel.department || input.employeeDepartment.trim(),
    costCenter: travel.costCenter.trim(),
    requestorLine,
    objet: travel.tripPurpose,
    requestDate: travel.documentDate,
    travel,
    lines,
    total,
    fileName: primary?.fileName ?? '',
    filePath: primary?.filePath,
    files,
    saveDirectory,
  };

  const data = await readHistory();
  data.cashRequests.push(record);
  await writeHistory(data);
  void appendTravelHistoryRow(record).catch(() => undefined);
  return record;
}

/** @deprecated Utiliser createTravelDocuments */
export const createCashRequest = createTravelDocuments;
