'use client';

import { useRef, useState } from 'react';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';

interface Props {
  items: ContextMenuItem[];
  ariaLabel?: string;
}

export default function CardActionMenu({ items, ariaLabel = 'Actions' }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ x: rect.right - 8, y: rect.bottom + 4 });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="settings-card-menu-btn"
        aria-label={ariaLabel}
        onClick={openMenu}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {menu && (
        <RowContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
