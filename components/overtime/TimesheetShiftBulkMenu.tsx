'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onGeneralShift: () => void;
  onShifterPattern: () => void;
  disabled?: boolean;
}

export default function TimesheetShiftBulkMenu({
  onGeneralShift,
  onShifterPattern,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - 240),
        width: 240,
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [close, open]);

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            className="timesheet-shift-bulk-menu timesheet-shift-bulk-menu-portal"
            style={menuStyle}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="timesheet-shift-bulk-item"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onGeneralShift();
                close();
              }}
            >
              <strong>General shift</strong>
              <span>Applique le shift Général (07:00–16:30) sur toute la période</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="timesheet-shift-bulk-item"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onShifterPattern();
                close();
              }}
            >
              <strong>Shifter</strong>
              <span>2 j. Shift 1 · 2 j. Shift 2 · 2 j. Shift 3 · 2 j. Off (répété)</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`timesheet-col-info-btn${open ? ' active' : ''}`}
        title="Actions shift sur toute la période"
        aria-label="Actions shift sur toute la période"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((value) => !value);
        }}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="10" x2="12" y2="16" />
          <line x1="12" y1="7" x2="12" y2="7" />
        </svg>
      </button>
      {menu}
    </>
  );
}
