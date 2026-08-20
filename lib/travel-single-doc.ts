import type { TravelFileType } from './travel-types';

/**
 * Documents de voyage générables individuellement (hors pack Cash Request).
 * Chaque document expose la liste des champs du formulaire qui lui sont
 * réellement nécessaires — le formulaire s'adapte en conséquence.
 */
export const SINGLE_TRAVEL_DOC_IDS = [
  'cash-request',
  'travel-authorization',
  'hotel-booking',
  'mission-order',
  'trip-budget',
] as const;

export type SingleTravelDocId = (typeof SINGLE_TRAVEL_DOC_IDS)[number];

export type SingleTravelDocField =
  | 'position'
  | 'costCenter'
  | 'companyName'
  | 'documentDate'
  | 'travelDates'
  | 'peopleCount'
  | 'destinationPlace'
  | 'departmentToWorkWith'
  | 'contactPerson'
  | 'transportMeans'
  | 'signatory'
  | 'budget'
  | 'missionType'
  | 'missionObservation';

export interface SingleTravelDocConfig {
  id: SingleTravelDocId & TravelFileType;
  label: string;
  description: string;
  fields: readonly SingleTravelDocField[];
}

export const SINGLE_TRAVEL_DOCS: Record<SingleTravelDocId, SingleTravelDocConfig> = {
  'cash-request': {
    id: 'cash-request',
    label: 'Cash Request',
    description:
      'Demande de fonds — requestor, objet et lignes de dépenses (montants directs).',
    fields: ['costCenter', 'documentDate', 'budget'],
  },
  'travel-authorization': {
    id: 'travel-authorization',
    label: "Formulaire d'autorisation de voyage",
    description:
      "Autorisation de voyage remplie depuis les informations de l'agent, les dates et le budget du déplacement.",
    fields: [
      'position',
      'documentDate',
      'travelDates',
      'peopleCount',
      'destinationPlace',
      'departmentToWorkWith',
      'budget',
    ],
  },
  'hotel-booking': {
    id: 'hotel-booking',
    label: 'Hotel booking form',
    description:
      "Réservation d'hôtel basée sur l'agent, la destination, les dates du séjour et le contact sur place.",
    fields: ['companyName', 'travelDates', 'destinationPlace', 'departmentToWorkWith', 'contactPerson'],
  },
  'mission-order': {
    id: 'mission-order',
    label: 'Ordre de mission',
    description:
      'Ordre de mission par site (Kinshasa, Zamba, Lubudi) — référence annuelle KN / ZA / ZC / LU.',
    fields: [
      'position',
      'documentDate',
      'travelDates',
      'companyName',
      'destinationPlace',
      'transportMeans',
      'signatory',
      'missionType',
      'missionObservation',
    ],
  },
  'trip-budget': {
    id: 'trip-budget',
    label: 'Trip Budget Form',
    description: 'Budget de mission calculé par personne et par jour.',
    fields: ['travelDates', 'peopleCount', 'budget'],
  },
};

export function isSingleTravelDocId(value: string): value is SingleTravelDocId {
  return (SINGLE_TRAVEL_DOC_IDS as readonly string[]).includes(value);
}
