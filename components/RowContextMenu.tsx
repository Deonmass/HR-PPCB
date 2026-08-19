'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon: 'view' | 'edit' | 'delete' | 'add' | 'expenses' | 'toggle' | 'permissions' | 'home' | 'doc' | 'import' | 'move';
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

function computeMenuPosition(x: number, y: number, width: number, height: number) {
  let left = x;
  let top = y;

  if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
    left = x - width;
  }
  if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
    top = y - height;
  }

  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN));

  return { left, top };
}

function MenuIcon({ name }: { name: ContextMenuItem['icon'] }) {
  const props = {
    width: 15,
    height: 15,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'view') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === 'edit') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (name === 'add') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  }
  if (name === 'expenses') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h10" />
        <circle cx="18" cy="18" r="3" />
      </svg>
    );
  }
  if (name === 'toggle') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <rect x="1" y="5" width="22" height="14" rx="7" />
        <circle cx="16" cy="12" r="3" />
      </svg>
    );
  }
  if (name === 'permissions') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M12 3 4 7v6c0 5 3.5 8 8 8s8-3 8-8V7Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === 'doc') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="m8.5 14.5 2 2 4-4.5" />
      </svg>
    );
  }
  if (name === 'import') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M12 18V11" />
        <path d="m9 14 3 3 3-3" />
      </svg>
    );
  }
  if (name === 'move') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
        <path d="M3 5v14" />
      </svg>
    );
  }
  if (name === 'home') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-6h4v6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function RowContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition(computeMenuPosition(x, y, width, height));
    setReady(true);
  }, [x, y, items]);

  useLayoutEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      className="row-context-menu"
      style={{
        left: position.left,
        top: position.top,
        visibility: ready ? 'visible' : 'hidden',
      }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`row-context-item${item.danger ? ' danger' : ''}`}
          role="menuitem"
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          <span className="row-context-icon"><MenuIcon name={item.icon} /></span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
