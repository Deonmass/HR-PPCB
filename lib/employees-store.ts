export {
  deleteEmployee,
  getEmployee,
  getEmployeesRecordIndex,
  readCheckDocumentsIndex,
  readEmployees,
  readEmployeesBundle,
  readExitedEmployees,
  updateEmployeeDocument,
  upsertEmployee,
} from './employees-json-store';

/** No-op: JSON store has no Excel mtime cache. */
export function invalidateEmployeesCache(): void {}

/** Recharge depuis le store JSON durable. */
export async function refreshEmployeesFromExcel() {
  const { readEmployees } = await import('./employees-json-store');
  return readEmployees();
}
