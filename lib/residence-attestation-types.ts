export interface ResidenceAttestationFormData {
  documentDate: string;
  /** Numéro de maison village (auto si affecté). */
  maisonNumero: string;
  /** Phrase d'adresse complète dans le document. */
  residenceAddress: string;
  hodGenre: string;
  hodName: string;
  hodFunction: string;
  /** M. / Mme */
  employeeGenre: string;
  employeeName: string;
  employeeMatricule: string;
  employeeFunction: string;
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
