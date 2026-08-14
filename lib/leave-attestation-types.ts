export interface LeaveAttestationFormData {
  documentDate: string;
  leaveStart: string;
  leaveEnd: string;
  hodGenre: string;
  hodName: string;
  hodFunction: string;
  employeeGenre: string;
  employeeName: string;
  employeeMatricule: string;
  employeeFunction: string;
  employeeDepartment: string;
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
