import { translateJobTitleToEnglish } from './job-title-i18n';
import type { ResidenceAttestationFormData } from './residence-attestation-types';

/** Adresse type Camp PPC Barnet / Village Malanga (texte officiel). */
export const RESIDENCE_VILLAGE_ADDRESS_BASE =
  'Camp PPC Barnet situé au Village Malanga, Territoire de Songololo dans la Province du Kongo Central';

export const RESIDENCE_VILLAGE_ADDRESS_BASE_EN =
  'Camp PPC Barnet located in Village Malanga, Songololo Territory in Kongo Central Province';

export function buildVillageResidenceAddress(maisonNumero?: string | null): string {
  const numero = String(maisonNumero ?? '').trim();
  if (!numero) return RESIDENCE_VILLAGE_ADDRESS_BASE;
  return `Camp PPC Barnet, maison n° ${numero}, situé au Village Malanga, Territoire de Songololo dans la Province du Kongo Central`;
}

export function buildVillageResidenceAddressEn(maisonNumero?: string | null): string {
  const numero = String(maisonNumero ?? '').trim();
  if (!numero) return RESIDENCE_VILLAGE_ADDRESS_BASE_EN;
  return `Camp PPC Barnet, house no. ${numero}, located in Village Malanga, Songololo Territory in Kongo Central Province`;
}

export function formatResidenceEmployeeGenre(gender: string | undefined | null): string {
  if (/^f/i.test(String(gender || ''))) return 'Mme';
  if (/^m/i.test(String(gender || ''))) return 'M.';
  return 'M.';
}

export function formatResidenceEmployeeGenreEn(genderOrGenre: string | undefined | null): string {
  const raw = String(genderOrGenre || '').trim();
  if (/^f/i.test(raw) || /madame|mme|mrs|ms|miss/i.test(raw)) return 'Ms.';
  return 'Mr.';
}

export function formatResidenceHodSoussigne(genreOrGender: string | undefined | null): string {
  const raw = String(genreOrGender || '').trim();
  if (/^f/i.test(raw) || /^madame$/i.test(raw) || /^mme\b/i.test(raw)) return 'soussignée';
  return 'soussigné';
}

/** Adresse EN : village traduit, sinon même texte libre. */
export function resolveResidenceAddressEn(
  form: Pick<ResidenceAttestationFormData, 'maisonNumero' | 'residenceAddress' | 'residenceAddressEn'>,
): string {
  if (form.residenceAddressEn?.trim()) return form.residenceAddressEn.trim();
  const maison = form.maisonNumero?.trim();
  if (maison) return buildVillageResidenceAddressEn(maison);
  const fr = form.residenceAddress.trim();
  if (!fr) return '';
  if (fr.includes('Village Malanga') || fr.includes('Camp PPC Barnet')) {
    return buildVillageResidenceAddressEn(maison);
  }
  return fr;
}

export function splitBilingualResidenceForm(form: ResidenceAttestationFormData): {
  fr: ResidenceAttestationFormData;
  en: ResidenceAttestationFormData;
} {
  const fr: ResidenceAttestationFormData = {
    ...form,
    language: 'fr',
    hodFunction: form.hodFunction.trim(),
    employeeGenre: form.employeeGenre.trim(),
    employeeFunction: form.employeeFunction.trim(),
    residenceAddress: form.residenceAddress.trim(),
    residenceAddressEn: undefined,
    hodFunctionEn: undefined,
    employeeGenreEn: undefined,
    employeeFunctionEn: undefined,
  };
  const en: ResidenceAttestationFormData = {
    ...form,
    language: 'en',
    hodFunction:
      form.hodFunctionEn?.trim() ||
      translateJobTitleToEnglish(form.hodFunction) ||
      form.hodFunction.trim(),
    employeeGenre:
      form.employeeGenreEn?.trim() || formatResidenceEmployeeGenreEn(form.employeeGenre),
    employeeFunction:
      form.employeeFunctionEn?.trim() ||
      translateJobTitleToEnglish(form.employeeFunction) ||
      form.employeeFunction.trim(),
    residenceAddress: resolveResidenceAddressEn(form),
    residenceAddressEn: undefined,
    hodFunctionEn: undefined,
    employeeGenreEn: undefined,
    employeeFunctionEn: undefined,
  };
  return { fr, en };
}
