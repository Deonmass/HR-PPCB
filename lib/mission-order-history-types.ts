import type { MissionSiteId } from './travel-mission-sites';

export interface MissionOrderHistoryRow {
  id: string;
  site: MissionSiteId;
  sr: string;
  registerDate: string;
  missionRef: string;
  matricule: string;
  employeeName: string;
  category: string;
  title: string;
  purpose: string;
  destination: string;
  transportMeans: string;
  departureDate: string;
  returnDate: string;
  days: number;
  type: string;
  amount: number | null;
  observation: string;
  recordId: string;
  source: 'import' | 'app';
  createdAt: string;
}

export interface MissionOrderHistoryStoreData {
  rows: MissionOrderHistoryRow[];
}
