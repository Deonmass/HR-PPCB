export type ServiceAttestationLanguage = 'fr' | 'en';

export interface ServiceAttestationFormData {
  language: ServiceAttestationLanguage;
  documentDate: string;
  hodGenre: string;
  hodName: string;
  hodFunction: string;
  employeeGenre: string;
  employeeName: string;
  employeeMatricule: string;
  dateEmbauche: string;
  employeeFunction: string;
  employeeDepartment: string;
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
