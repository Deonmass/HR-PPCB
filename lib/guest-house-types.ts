export type GuestReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed';

export interface GuestRoom {
  id: string;
  roomNumber: string;
  building: string;
  characteristics: string;
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
  updatedAt: string;
}

export interface GuestHouseStoreData {
  rooms: GuestRoom[];
  reservations: GuestReservation[];
  nextReservationSeq: number;
}

export interface GuestRoomInput {
  roomNumber: string;
  building: string;
  characteristics: string;
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
}

export interface GuestHouseDashboard {
  totalRooms: number;
  occupied: number;
  empty: number;
  pendingReservations: number;
  endingSoon: Array<{
    id: string;
    numero: string;
    personName: string;
    endDate: string;
    daysLeft: number;
    roomNumber: string;
  }>;
  monthly: Array<{
    key: string;
    label: string;
    reservations: number;
    occupiedDays: number;
    emptyDays: number;
  }>;
}
