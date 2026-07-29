'use client';

import ChartChipFilter from '@/components/ChartChipFilter';

interface DeptOption {
  name: string;
  count: number;
}

interface Props {
  departments: DeptOption[];
  value: string;
  onChange: (department: string) => void;
  totalCount: number;
}

/** @deprecated Prefer ChartChipFilter — conservé pour compatibilité. */
export default function ChartDepartmentFilter({
  departments,
  value,
  onChange,
  totalCount,
}: Props) {
  return (
    <ChartChipFilter
      title="Départements"
      options={departments}
      value={value}
      onChange={onChange}
      totalCount={totalCount}
      ariaLabel="Filtrer par département"
    />
  );
}
