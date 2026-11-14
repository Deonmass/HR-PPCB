export interface ProtocolVoyageCout {
  id: string;
  numero: string;
  date: string;
  voyageur: string;
  voyageurMatricule: string;
  departement: string;
  centreCout: string;
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
  autresCharges: number;
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
  { id: 'autresCharges', label: 'Autres charges' },
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
  'ticketAvion' | 'visaVolant' | 'lettreLegaliser' | 'goPass' | 'transfert' | 'coutHotel' | 'appartement' | 'autresCharges'
>): number {
  return roundMoney(
    input.ticketAvion
    + input.visaVolant
    + input.lettreLegaliser
    + input.goPass
    + input.transfert
    + input.coutHotel
    + input.appartement
    + input.autresCharges,
  );
}

export const PROTOCOL_VOYAGE_UNASSIGNED = 'Non renseigné';

function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(mr|mme|mlle|ms|mrs|dr|m)\s+/, '');
}

function lookupPersonValue(
  item: Pick<ProtocolVoyageCout, 'voyageur' | 'voyageurMatricule'>,
  byMatricule: Map<string, string>,
  byName: Map<string, string>,
): string {
  const matricule = item.voyageurMatricule.trim();
  if (matricule && byMatricule.has(matricule)) return byMatricule.get(matricule) ?? '';
  const name = normalizePersonName(item.voyageur);
  if (name && byName.has(name)) return byName.get(name) ?? '';
  return '';
}

export function buildProtocolVoyageOrgLookup(
  people: { matricule?: string; nom?: string; departement?: string; centreCout?: string }[],
): {
  departementOf: (item: ProtocolVoyageCout) => string;
  centreCoutOf: (item: ProtocolVoyageCout) => string;
} {
  const deptByMatricule = new Map<string, string>();
  const deptByName = new Map<string, string>();
  const ccByMatricule = new Map<string, string>();
  const ccByName = new Map<string, string>();
  for (const person of people) {
    const matricule = person.matricule?.trim() ?? '';
    const name = normalizePersonName(person.nom ?? '');
    const department = person.departement?.trim() ?? '';
    const centreCout = person.centreCout?.trim() ?? '';
    if (department) {
      if (matricule && !deptByMatricule.has(matricule)) deptByMatricule.set(matricule, department);
      if (name && !deptByName.has(name)) deptByName.set(name, department);
    }
    if (centreCout) {
      if (matricule && !ccByMatricule.has(matricule)) ccByMatricule.set(matricule, centreCout);
      if (name && !ccByName.has(name)) ccByName.set(name, centreCout);
    }
  }
  return {
    departementOf: (item) => item.departement?.trim() || lookupPersonValue(item, deptByMatricule, deptByName),
    centreCoutOf: (item) => item.centreCout?.trim() || lookupPersonValue(item, ccByMatricule, ccByName),
  };
}

export function groupProtocolVoyageCosts(
  items: Array<{ label: string; value: number }>,
): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = item.label.trim() || PROTOCOL_VOYAGE_UNASSIGNED;
    map.set(label, (map.get(label) ?? 0) + item.value);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
    .map(([label, value]) => ({ label, value: roundMoney(value) }));
}
