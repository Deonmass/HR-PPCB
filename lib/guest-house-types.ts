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
  rooms: GuestRoom[];
  reservations: GuestReservation[];
  passages: GuestRoomPassage[];
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

export interface GuestHouseMonthlyPoint {
  key: string;
  month: number;
  label: string;
  /** Nombre total de réservations créées ce mois. */
  reservations: number;
  /** Nombre de réservations approuvées / occupées ce mois. */
  approved: number;
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
  /** Années disponibles pour le filtre (desc). */
  years: number[];
  /** Points mensuels Jan–Déc indexés par année. */
  monthlyByYear: Record<number, GuestHouseMonthlyPoint[]>;
  occupiedReservations: GuestReservation[];
  emptyRooms: GuestRoom[];
}
