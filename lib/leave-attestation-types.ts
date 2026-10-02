export interface LeaveAttestationFormData {
  language: 'fr' | 'en' | 'both';
  documentDate: string;
  leaveStart: string;
  leaveEnd: string;
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
  employeeFunction: string;
  employeeFunctionEn?: string;
  employeeDepartment: string;
  /** Corps FR (ou unique si monolingue). */
  bodyText?: string;
  /** Corps EN (requis si language === 'both'). */
  bodyTextEn?: string;
}

export interface LeaveAttestationRecord extends LeaveAttestationFormData {
  id: string;
  createdAt: string;
  fileName: string;
  docxPath: string;
  pdfPath?: string;
  previewHtml: string;
}

export interface LeaveAttestationHistoryData {
  records: LeaveAttestationRecord[];
}
