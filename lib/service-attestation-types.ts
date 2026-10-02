export type ServiceAttestationLanguage = 'fr' | 'en' | 'both';

export interface ServiceAttestationFormData {
  language: ServiceAttestationLanguage;
  documentDate: string;
  hodGenre: string;
  hodName: string;
  /** Fonction du signataire (FR, ou unique si monolingue). */
  hodFunction: string;
  /** Fonction EN (requis si language === 'both'). */
  hodFunctionEn?: string;
  employeeGenre: string;
  employeeGenreEn?: string;
  employeeName: string;
  employeeMatricule: string;
  dateEmbauche: string;
  employeeFunction: string;
  employeeFunctionEn?: string;
  employeeDepartment: string;
  /** Corps FR (ou unique si monolingue). */
  bodyText?: string;
  /** Corps EN (requis si language === 'both'). */
  bodyTextEn?: string;
}

export interface ServiceAttestationRecord extends ServiceAttestationFormData {
  id: string;
  createdAt: string;
  fileName: string;
  docxPath: string;
  pdfPath?: string;
  previewHtml: string;
}

export interface ServiceAttestationHistoryData {
  records: ServiceAttestationRecord[];
}
