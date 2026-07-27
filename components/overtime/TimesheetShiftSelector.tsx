'use client';

import { TIMESHEET_SHIFT_OPTIONS } from '@/lib/timesheet-types';
import type { TimesheetShiftType } from '@/lib/timesheet-types';

interface Props {
  value: TimesheetShiftType | null;
  onChange: (value: TimesheetShiftType) => void;
  compact?: boolean;
  disabled?: boolean;
  name?: string;
}

export default function TimesheetShiftSelector({ value, onChange, compact, disabled, name }: Props) {
  const groupName = name ?? 'timesheet-shift';
  return (
    <div className={`timesheet-shift-selector${compact ? ' timesheet-shift-selector-compact' : ''}`}>
      {TIMESHEET_SHIFT_OPTIONS.map((option) => (
        <label
          key={option.id}
          className={`timesheet-shift-option${value === option.id ? ' active' : ''}`}
          title={`${option.label} (${option.schedule})`}
        >
          <input
            type="radio"
            name={groupName}
            checked={value === option.id}
            disabled={disabled}
            onChange={() => onChange(option.id)}
          />
          <span>{compact ? option.shortLabel : option.label}</span>
        </label>
      ))}
    </div>
  );
}
