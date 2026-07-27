'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  children: React.ReactNode;
}

export default function ProjectPickerDropdown({ anchorRef, listRef, open, children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setStyle({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, anchorRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div ref={listRef} className="project-picker-list project-picker-list-portal" style={style} role="listbox">
      {children}
    </div>,
    document.body,
  );
}
