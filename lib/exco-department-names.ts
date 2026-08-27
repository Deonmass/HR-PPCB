/**
 * @deprecated Utiliser `exco-department-map.ts` (resolveExcoDepartment / normalizeDepartmentName).
 */
export {
  EXCO_CANONICAL_DEPARTMENTS as EXCO_BASE_CANONICAL_DEPARTMENTS,
  normalizeDepartmentName as canonicalExcoDepartment,
  departmentsEqual as isSameExcoDepartment,
} from './exco-department-map';
