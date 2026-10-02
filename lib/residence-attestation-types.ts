export type ResidenceAttestationLanguage = 'fr' | 'en' | 'both';

export interface ResidenceAttestationFormData {
  language: ResidenceAttestationLanguage;
  documentDate: string;
  /** Numéro de maison village (auto si affecté). */
  maisonNumero: string;
  /** Phrase d'adresse complète dans le document (FR). */
  residenceAddress: string;
  /** Adresse EN (si language === 'both' / 'en'). */
  residenceAddressEn?: string;
  hodGenre: string;
  hodName: string;
  /** Fonction du signataire (FR). */
  hodFunction: string;
  hodFunctionEn?: string;
  /** M. / Mme */
  employeeGenre: string;
  employeeGenreEn?: string;
  employeeName: string;
  employeeMatricule: string;
  employeeFunction: string;
  employeeFunctionEn?: string;
  employeeDepartment: string;
}

export interface ResidenceAttestationRecord extends ResidenceAttestationFormData {
  id: string;
  createdAt: string;
  fileName: string;
  docxPath: string;
  pdfPath?: string;
  previewHtml: string;
}

export interface ResidenceAttestationHistoryData {
  records: ResidenceAttestationRecord[];
}
