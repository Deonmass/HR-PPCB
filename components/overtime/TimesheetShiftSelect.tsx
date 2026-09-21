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
  const selected = TIMESHEET_SHIFT_OPTIONS.find((option) => option.id === value);
  const accent = selected?.color;

  return (
    <select
      id={id}
      className={[
        'timesheet-shift-select',
        compact ? 'timesheet-shift-select-compact' : '',
        isPlanning ? 'timesheet-shift-select-planning' : '',
        value === 'al' ? 'is-shift-al' : '',
        value === 'sl' ? 'is-shift-sl' : '',
        value === 'a' ? 'is-shift-a' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      value={value ?? ''}
      disabled={disabled}
      style={accent ? { color: accent, borderColor: accent, fontWeight: 700 } : undefined}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next ? (next as TimesheetShiftType) : null);
      }}
    >
      <option value="">{compact && !isPlanning ? '—' : 'Sélectionner'}</option>
      {TIMESHEET_SHIFT_OPTIONS.map((option) => (
        <option
          key={option.id}
          value={option.id}
          title={option.schedule}
          className={
            option.id === 'al'
              ? 'timesheet-shift-option-al'
              : option.id === 'sl'
                ? 'timesheet-shift-option-sl'
                : option.id === 'a'
                  ? 'timesheet-shift-option-a'
                  : undefined
          }
          style={option.color ? { color: option.color, fontWeight: 700 } : undefined}
        >
          {optionLabel(option, variant, Boolean(compact))}
        </option>
      ))}
    </select>
  );
}
