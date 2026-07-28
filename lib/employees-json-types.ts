import type { Employee, EmployeeDocuments } from './types';

export interface EmployeeRecord extends Omit<Employee, 'documents'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeExitRecord extends EmployeeRecord {}

export interface EmployeeCheckDocumentRecord {
  id: string;
  employeeId: string;
  matricule: string;
  documents: EmployeeDocuments;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeesJsonStoreData {
  employees: EmployeeRecord[];
}

export interface EmployeeExitsJsonStoreData {
  exits: EmployeeExitRecord[];
}

export interface EmployeeCheckDocumentsJsonStoreData {
  documents: EmployeeCheckDocumentRecord[];
}
