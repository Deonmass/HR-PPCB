import 'server-only';

import type { CostCenterSetting, DepartmentSetting } from './auth-types';
import {
  createCostCenterId,
  createDepartmentId,
  deleteCostCenterFromParams,
  deleteDepartmentFromParams,
  listCostCentersFromParams,
  listDepartmentsFromParams,
  upsertCostCenterInParams,
  upsertDepartmentInParams,
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

export { createDepartmentId, createCostCenterId };
