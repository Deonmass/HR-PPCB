'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  children: React.ReactNode;
  /** Hauteur max approximative de la liste (pour flip haut/bas). */
  maxHeight?: number;
}

export default function ProjectPickerDropdown({
  anchorRef,
  listRef,
  open,
  children,
  maxHeight = 240,
}: Props) {
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
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUpward = spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow;
      const available = openUpward ? spaceAbove : spaceBelow;
      const height = Math.max(120, Math.min(maxHeight, available - 8));

      if (openUpward) {
        setStyle({
          top: 'auto',
          bottom: window.innerHeight - rect.top + gap,
          left: rect.left,
          width: rect.width,
          maxHeight: height,
        });
      } else {
        setStyle({
          top: rect.bottom + gap,
          bottom: 'auto',
          left: rect.left,
          width: rect.width,
          maxHeight: height,
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, anchorRef, maxHeight]);

  if (!mounted || !open) return null;

  return createPortal(
    <div ref={listRef} className="project-picker-list project-picker-list-portal" style={style} role="listbox">
      {children}
    </div>,
    document.body,
  );
}
