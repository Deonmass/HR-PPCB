'use client';

import {
  parseTimesheetOrgValue,
  timesheetOrgValue,
  type TimesheetOrgKind,
  type TimesheetOrgOption,
} from '@/lib/timesheet-org-filter';

interface Props {
  departments: TimesheetOrgOption[];
  services: TimesheetOrgOption[];
  department: string;
  service: string;
  disabled?: boolean;
  includeAll?: boolean;
  allValue?: string;
  allLabel?: string;
  onChange: (kind: TimesheetOrgKind | 'all', name: string) => void;
}

export default function TimesheetOrgFilterSelect({
  departments,
  services,
  department,
  service,
  disabled,
  includeAll,
  allValue = '__ALL__',
  allLabel = 'Tous les Départements',
  onChange,
}: Props) {
  const value = includeAll && !department && !service
    ? allValue
    : service
      ? timesheetOrgValue('service', service)
      : timesheetOrgValue('department', department);

  return (
    <label className="overtime-inline-field">
      <span>Département</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (includeAll && next === allValue) {
            onChange('all', allValue);
            return;
          }
          const parsed = parseTimesheetOrgValue(next);
          if (parsed) onChange(parsed.kind, parsed.name);
        }}
      >
        {includeAll ? <option value={allValue}>{allLabel}</option> : null}
        {departments.length ? (
          <optgroup label="Départements">
            {departments.map((item) => (
              <option key={`dept-${item.name}`} value={timesheetOrgValue('department', item.name)}>
                {item.name} ({item.count})
              </option>
            ))}
          </optgroup>
        ) : null}
        {services.length ? (
          <optgroup label="Services">
            {services.map((item) => (
              <option key={`svc-${item.name}`} value={timesheetOrgValue('service', item.name)}>
                {item.name} ({item.count})
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
