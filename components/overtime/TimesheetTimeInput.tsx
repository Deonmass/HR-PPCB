'use client';

import { useMemo, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Normalize typed time to HH:MM (24h). Returns '' if incomplete/invalid. */
export function normalizeTimesheetTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const match = trimmed.match(/^(\d{1,2})(?:[:hH.](\d{0,2}))?$/);
  if (!match) return '';

  const hours = Number.parseInt(match[1], 10);
  const minutesRaw = match[2];
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return '';

  if (minutesRaw === undefined || minutesRaw === '') {
    // Incomplete while typing (e.g. "15") — keep as-is only if already HH:MM shape elsewhere
    return '';
  }
  if (minutesRaw.length < 2) return '';

  const minutes = Number.parseInt(minutesRaw, 10);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return '';

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toDisplayValue(value: string): string {
  const normalized = normalizeTimesheetTime(value);
  if (normalized) return normalized;
  return value.trim();
}

export default function TimesheetTimeInput({ value, onChange, placeholder = 'HH:MM', disabled }: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const display = useMemo(() => toDisplayValue(value), [value]);

  return (
    <div className="timesheet-time-field">
      <span className="timesheet-time-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
      <input
        type="text"
        inputMode="numeric"
        lang="fr-FR"
        className="timesheet-time-input"
        value={focused ? draft : display}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={5}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          setFocused(true);
          setDraft(display);
        }}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d:hH.]/g, '').slice(0, 5);
          setDraft(next);
          const normalized = normalizeTimesheetTime(next);
          if (normalized) onChange(normalized);
          else if (!next.trim()) onChange('');
        }}
        onBlur={() => {
          setFocused(false);
          const normalized = normalizeTimesheetTime(draft);
          if (normalized) {
            onChange(normalized);
            setDraft(normalized);
          } else if (!draft.trim()) {
            onChange('');
            setDraft('');
          } else {
            setDraft(display);
          }
        }}
      />
    </div>
  );
}
