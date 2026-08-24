import 'server-only';

import type { CostCenterSetting, DepartmentSetting, ServiceSetting } from './auth-types';
import {
  createCostCenterId,
  createDepartmentId,
  createServiceId,
  deleteCostCenterFromParams,
  deleteDepartmentFromParams,
  deleteServiceFromParams,
  listCostCentersFromParams,
  listDepartmentsFromParams,
  listServicesFromParams,
  upsertCostCenterInParams,
  upsertDepartmentInParams,
  upsertServiceInParams,
} from './params-store';

export async function listDepartments(): Promise<DepartmentSetting[]> {
  return listDepartmentsFromParams();
}

export async function upsertDepartment(item: DepartmentSetting): Promise<DepartmentSetting> {
  return upsertDepartmentInParams(item);
}

export async function deleteDepartment(id: string): Promise<boolean> {
  return deleteDepartmentFromParams(id);
}

export async function listCostCenters(): Promise<CostCenterSetting[]> {
  return listCostCentersFromParams();
}

export async function upsertCostCenter(item: CostCenterSetting): Promise<CostCenterSetting> {
  return upsertCostCenterInParams(item);
}

export async function deleteCostCenter(id: string): Promise<boolean> {
  return deleteCostCenterFromParams(id);
}

export async function listServices(): Promise<ServiceSetting[]> {
  return listServicesFromParams();
}

export async function upsertService(item: ServiceSetting): Promise<ServiceSetting> {
  return upsertServiceInParams(item);
}

export async function deleteService(id: string): Promise<boolean> {
  return deleteServiceFromParams(id);
}

export { createDepartmentId, createCostCenterId, createServiceId };
