export type GuestReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed';

/** On-site room vs external hotel overflow (Kimpese). */
export type GuestRoomCategory = 'standard' | 'kimpese';

export type GuestRoomAvailabilityStatus = 'available' | 'maintenance' | 'inactive';

export interface GuestHouseMeta {
  version: number;
  seededFrom?: string;
  seededAt?: string;
  historyImportedFrom?: string;
  historyImportedAt?: string;
  historySheetsImported?: number;
  historyMonths?: string[];
  templateSheet?: string;
  templateMonthHint?: string | null;
  buildings?: string[];
  notes?: string[];
}

export interface GuestRoom {
  id: string;
  /** Template room number token, e.g. "VIP", "3", "10". For Kimpese: slot / short code. */
  roomNumber: string;
  /** Template name after the dash, e.g. "ZAMBA". For Kimpese mirrors hotelName. */
  roomName: string;
  /** Full column-A label, e.g. "Room # 3 - MALANGA". */
  templateLabel: string;
  /** Row index in Gestion sheet for export mapping (standard rooms). */
  templateRow?: number;
  /** Lieu / bâtiment header, e.g. "Batiment #1", "Batiment #2", "Kimpese". */
  building: string;
  buildingKey: string;
  category: GuestRoomCategory;
  /** Free-text hotel name when category === 'kimpese'. */
  hotelName: string;
  characteristics: string;
  capacity: number;
  floor: string;
  amenities: string[];
  notes: string;
  sortOrder: number;
  status: GuestRoomAvailabilityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GuestReservation {
  id: string;
  /** Display number e.g. GH-2026-0001 */
  numero: string;
  createdAt: string;
  personName: string;
  matricule?: string;
  isAgent: boolean;
  motif: string;
  startDate: string;
  endDate: string;
  roomId?: string;
  status: GuestReservationStatus;
  notes?: string;
  company?: string;
  mission?: string;
  phone?: string;
  email?: string;
  nationality?: string;
  idDoc?: string;
  billing?: string;
  source?: string;
  /** YYYY-MM from stay start (history import / dashboard). */
  sourceMonth?: string;
  /** Source Excel sheet name(s) when imported from history workbook. */
  sheetName?: string;
  updatedAt: string;
}

/** Historique des passages (séjours) par chambre. */
export interface GuestRoomPassage {
  id: string;
  roomId: string;
  reservationId: string;
  numero: string;
  personName: string;
  matricule?: string;
  motif: string;
  startDate: string;
  endDate: string;
  checkedInAt: string;
  checkedOutAt?: string;
}

export interface GuestHouseStoreData {
  meta?: GuestHouseMeta;
  rooms: GuestRoom[];
  reservations: GuestReservation[];
  passages: GuestRoomPassage[];
  nextReservationSeq: number;
}

export interface GuestRoomInput {
  roomNumber?: string;
  roomName?: string;
  building?: string;
  category?: GuestRoomCategory;
  hotelName?: string;
  characteristics?: string;
  capacity?: number;
  floor?: string;
  amenities?: string[];
  notes?: string;
  status?: GuestRoomAvailabilityStatus;
}

export interface GuestReservationInput {
  personName: string;
  matricule?: string;
  isAgent?: boolean;
  motif: string;
  startDate: string;
  endDate: string;
  roomId?: string;
  notes?: string;
  company?: string;
  mission?: string;
  phone?: string;
  email?: string;
  nationality?: string;
  idDoc?: string;
  billing?: string;
}

export interface GuestHouseMonthlyPoint {
  key: string;
  month: number;
  label: string;
  /** Nombre total de réservations créées ce mois. */
  reservations: number;
  /** Nombre de réservations approuvées / occupées ce mois. */
  approved: number;
  /** Nuits-chambre sur site (séjours confirmés chevauchant le mois). */
  nights?: number;
  /** Jours dans le mois. */
  daysInMonth?: number;
  /** Capacité nuits = chambres sur site × jours du mois. */
  capacityNights?: number;
  /**
   * Taux d'occupation mensuel (%) :
   * nights / (onsiteRooms × daysInMonth) × 100
   */
  occupancyRate?: number;
  /** Séjours Kimpese (overflow) ce mois. */
  kimpese?: number;
}

export interface GuestHouseDashboard {
  totalRooms: number;
  /** On-site rooms only (excludes Kimpese hotels). */
  onsiteRooms: number;
  occupied: number;
  empty: number;
  reserved: number;
  pendingReservations: number;
  kimpeseHotels: number;
  kimpeseOccupied: number;
  occupancyRate: number;
  endingSoon: Array<{
    id: string;
    numero: string;
    personName: string;
    endDate: string;
    daysLeft: number;
    roomNumber: string;
    building: string;
    isKimpese: boolean;
  }>;
  /** Années disponibles pour le filtre (desc). */
  years: number[];
  /** Points mensuels Jan–Déc indexés par année. */
  monthlyByYear: Record<number, GuestHouseMonthlyPoint[]>;
  occupiedReservations: GuestReservation[];
  emptyRooms: GuestRoom[];
  reservedRooms: GuestRoom[];
}

/** Display helpers */
export function roomDisplayName(room: GuestRoom): string {
  if (room.category === 'kimpese') {
    return room.hotelName || room.roomName || room.roomNumber || 'Hôtel';
  }
  if (room.roomName && room.roomNumber) {
    return `${room.roomNumber} — ${room.roomName}`;
  }
  return room.roomNumber || room.roomName || room.templateLabel || '—';
}

export function buildTemplateLabel(room: Pick<GuestRoom, 'category' | 'roomNumber' | 'roomName' | 'hotelName' | 'templateLabel'>): string {
  if (room.category === 'kimpese') {
    const name = room.hotelName || room.roomName || 'Hôtel';
    return `Kimpese — ${name}`;
  }
  if (room.templateLabel) return room.templateLabel;
  const num = room.roomNumber || '?';
  const name = room.roomName || '';
  return name ? `Room # ${num} - ${name}` : `Room # ${num}`;
}

export const GUEST_HOUSE_BUILDINGS = ['Batiment #1', 'Batiment #2', 'Kimpese'] as const;
export const KIMPESE_BUILDING = 'Kimpese';
