/** Localités du tronçon routier Kinshasa → Matadi / côte, dans l’ordre de la route. */
export const CHARROI_ROUTE_PLACES = [
  'Kinshasa',
  'Kasangulu',
  'Madimba',
  'Kisantu',
  'Inkisi',
  'Mbanza-Ngungu',
  'Kimpese',
  'Zamba (Kimpese)',
  'Zamba (Village)',
  'Lukala',
  'Kwilu-Ngongo',
  'Songololo',
  'Lufu',
  'Matadi',
  'Boma',
  'Moanda',
] as const;

export const CHARROI_ROUTE_AUTRE = 'Autre';

export function isCharroiRoutePlace(value: string): boolean {
  return (CHARROI_ROUTE_PLACES as readonly string[]).includes(value.trim());
}
