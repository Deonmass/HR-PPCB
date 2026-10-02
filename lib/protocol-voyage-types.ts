export interface ProtocolVoyageCout {
  id: string;
  numero: string;
  date: string;
  voyageur: string;
  voyageurMatricule: string;
  destination: string;
  ticketAvion: number;
  visaVolant: number;
  lettreLegaliser: number;
  goPass: number;
  transfert: number;
  hotelNuit: number;
  nbreNuits: number;
  coutHotel: number;
  categorieHotel: string;
  appartement: number;
  coutTotal: number;
  createdAt: string;
  updatedAt: string;
}

export type ProtocolVoyageCoutInput = Partial<ProtocolVoyageCout>;

export interface ProtocolVoyagesStore {
  voyages: ProtocolVoyageCout[];
  nextSeq: number;
}

export const PROTOCOL_VOYAGE_COST_NATURES = [
  { id: 'ticketAvion', label: 'Billets avion' },
  { id: 'coutHotel', label: 'Hôtel' },
  { id: 'goPass', label: 'Go Pass' },
  { id: 'visaVolant', label: 'Visa volant' },
  { id: 'lettreLegaliser', label: 'Lettre à légaliser' },
  { id: 'transfert', label: 'Transferts' },
  { id: 'appartement', label: 'Appartement' },
] as const;

export type ProtocolVoyageCostNature = (typeof PROTOCOL_VOYAGE_COST_NATURES)[number]['id'];

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeCoutHotel(hotelNuit: number, nbreNuits: number): number {
  return roundMoney(Math.max(0, hotelNuit) * Math.max(0, nbreNuits));
}

export function computeCoutTotal(input: Pick<
  ProtocolVoyageCout,
  'ticketAvion' | 'visaVolant' | 'lettreLegaliser' | 'goPass' | 'transfert' | 'coutHotel' | 'appartement'
>): number {
  return roundMoney(
    input.ticketAvion
    + input.visaVolant
    + input.lettreLegaliser
    + input.goPass
    + input.transfert
    + input.coutHotel
    + input.appartement,
  );
}
