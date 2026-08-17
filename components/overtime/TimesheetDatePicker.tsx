'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatTimesheetDateFr,
  localDateKey,
  parseTimesheetDateFr,
} from '@/lib/timesheet-period';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

type Props = {
  value: string;
  onCommit: (value: string) => void;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarCells(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() + index);
    return day;
  });
}

function IconCalendar({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

export default function TimesheetDatePicker({ value, onCommit }: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const selected = parseTimesheetDateFr(value) ?? startOfDay(new Date());
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const cells = useMemo(() => calendarCells(view), [view]);
  const selectedKey = localDateKey(selected);
  const todayKey = localDateKey(startOfDay(new Date()));
  const viewMonth = view.getMonth();

  const placeMenu = () => {
    const anchor = buttonRef.current ?? rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 268;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    if (top + 320 > window.innerHeight - 8) top = Math.max(8, rect.top - 6 - 320);
    setMenu({ top, left });
  };

  const toggleCalendar = () => {
    if (open) {
      setOpen(false);
      setMenu(null);
      return;
    }
    setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setOpen(true);
    placeMenu();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
      setMenu(null);
    };
    const onReposition = () => placeMenu();

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const pickDay = (date: Date) => {
    onCommit(formatTimesheetDateFr(date));
    setDraft(formatTimesheetDateFr(date));
    setOpen(false);
    setMenu(null);
  };

  const calendar =
    open && menu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popRef}
            className="timesheet-datepicker-pop"
            style={{ top: menu.top, left: menu.left }}
            role="dialog"
            aria-label="Choisir la date de début"
          >
            <div className="timesheet-datepicker-nav">
              <button
                type="button"
                className="timesheet-datepicker-nav-btn"
                aria-label="Mois précédent"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              >
                ‹
              </button>
              <strong>
                {MONTHS[view.getMonth()]} {view.getFullYear()}
              </strong>
              <button
                type="button"
                className="timesheet-datepicker-nav-btn"
                aria-label="Mois suivant"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              >
                ›
              </button>
            </div>
            <div className="timesheet-datepicker-weekdays">
              {WEEKDAYS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="timesheet-datepicker-grid">
              {cells.map((day) => {
                const key = localDateKey(day);
                const outside = day.getMonth() !== viewMonth;
                const isSelected = key === selectedKey;
                const isToday = key === todayKey;
                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'timesheet-datepicker-day',
                      outside ? 'is-outside' : '',
                      isSelected ? 'is-selected' : '',
                      isToday ? 'is-today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => pickDay(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="timesheet-datepicker">
      <input
        type="text"
        inputMode="numeric"
        className="timesheet-template-start-date"
        value={focused ? draft : value}
        placeholder="JJ/MM/AAAA"
        maxLength={10}
        title="Date de début — les 27 jours suivants suivent"
        aria-label="Date de début du timesheet"
        onFocus={() => {
          setFocused(true);
          setDraft(value);
        }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d/.\-]/g, '').slice(0, 10);
          setDraft(next);
          const parsed = parseTimesheetDateFr(next);
          if (parsed) onCommit(formatTimesheetDateFr(parsed));
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseTimesheetDateFr(draft);
          if (parsed) onCommit(formatTimesheetDateFr(parsed));
          else setDraft(value);
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        className="timesheet-datepicker-btn"
        aria-label="Ouvrir le calendrier"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleCalendar();
        }}
      >
        <IconCalendar />
      </button>
      {calendar}
    </div>
  );
}
