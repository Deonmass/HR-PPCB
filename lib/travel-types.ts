import type { TravelFormFields } from './travel-form';

export interface CashRequestLine {
  ref: string;
  description: string;
  currency: string;
  amount: number;
}

export type TravelFileType =
  | 'cash-request'
  | 'trip-budget'
  | 'travel-authorization'
  | 'hotel-booking'
  | 'flight-booking'
  | 'mission-order'
  | 'travel-pdf';

export interface TravelGeneratedFile {
  type: TravelFileType;
  fileName: string;
  filePath: string;
}

export interface CashRequestRecord {
  id: string;
  type: 'cash-request';
  createdAt: string;
  missionRef?: string;
  employeeMatricule: string;
  employeeName: string;
  employeeDepartment: string;
  costCenter: string;
  requestorLine: string;
  objet: string;
  requestDate: string;
  travel?: TravelFormFields;
  lines: CashRequestLine[];
  total: number;
  fileName: string;
  filePath?: string;
  files?: TravelGeneratedFile[];
  saveDirectory?: string;
}

export interface TravelHistoryData {
  cashRequests: CashRequestRecord[];
}
