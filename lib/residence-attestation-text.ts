/** Adresse type Camp PPC Barnet / Village Malanga (texte officiel). */
export const RESIDENCE_VILLAGE_ADDRESS_BASE =
  'Camp PPC Barnet situé au Village Malanga, Territoire de Songololo dans la Province du Kongo Central';

export function buildVillageResidenceAddress(maisonNumero?: string | null): string {
  const numero = String(maisonNumero ?? '').trim();
  if (!numero) return RESIDENCE_VILLAGE_ADDRESS_BASE;
  return `Camp PPC Barnet, maison n° ${numero}, situé au Village Malanga, Territoire de Songololo dans la Province du Kongo Central`;
}

export function formatResidenceEmployeeGenre(gender: string | undefined | null): string {
  if (/^f/i.test(String(gender || ''))) return 'Mme';
  if (/^m/i.test(String(gender || ''))) return 'M.';
  return 'M.';
}

export function formatResidenceHodSoussigne(genreOrGender: string | undefined | null): string {
  const raw = String(genreOrGender || '').trim();
  if (/^f/i.test(raw) || /^madame$/i.test(raw) || /^mme\b/i.test(raw)) return 'soussignée';
  return 'soussigné';
}
