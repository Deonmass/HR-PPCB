'use client';

import { TIMESHEET_SHIFT_OPTIONS } from '@/lib/timesheet-types';
import type { TimesheetShiftType } from '@/lib/timesheet-types';

interface Props {
  value: TimesheetShiftType | null;
  onChange: (value: TimesheetShiftType | null) => void;
  disabled?: boolean;
  id?: string;
  compact?: boolean;
  variant?: 'default' | 'planning';
}

function optionLabel(
  option: (typeof TIMESHEET_SHIFT_OPTIONS)[number],
  variant: 'default' | 'planning',
  compact: boolean,
): string {
  if (variant === 'planning') return option.planningLabel;
  return compact ? option.shortLabel : option.label;
}

export default function TimesheetShiftSelect({ value, onChange, disabled, id, compact, variant = 'default' }: Props) {
  const isPlanning = variant === 'planning';
  return (
    <select
      id={id}
      className={[
        'timesheet-shift-select',
        compact ? 'timesheet-shift-select-compact' : '',
        isPlanning ? 'timesheet-shift-select-planning' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next ? (next as TimesheetShiftType) : null);
      }}
    >
      <option value="">{compact && !isPlanning ? '—' : 'Sélectionner'}</option>
      {TIMESHEET_SHIFT_OPTIONS.map((option) => (
        <option key={option.id} value={option.id} title={option.schedule}>
          {optionLabel(option, variant, Boolean(compact))}
        </option>
      ))}
    </select>
  );
}
