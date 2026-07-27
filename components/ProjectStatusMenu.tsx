'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PROJECT_STATUS_OPTIONS, statusBadgeClass } from '@/lib/projects';

interface Props {
  x: number;
  y: number;
  current: string;
  onSelect: (statut: string) => void;
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

export default function ProjectStatusMenu({ x, y, current, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition(computeMenuPosition(x, y, width, height));
    setReady(true);
  }, [x, y]);

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
      className="project-status-menu"
      style={{
        left: position.left,
        top: position.top,
        visibility: ready ? 'visible' : 'hidden',
      }}
      role="menu"
    >
      {PROJECT_STATUS_OPTIONS.map((option) => {
        const isActive = option.value.toLowerCase() === current.toLowerCase();
        return (
          <button
            key={option.value}
            type="button"
            className={`project-status-menu-item${isActive ? ' active' : ''}`}
            role="menuitem"
            onClick={() => {
              onSelect(option.value);
              onClose();
            }}
          >
            <span className={`badge badge-sm ${statusBadgeClass(option.value)}`}>
              {option.label}
            </span>
            {isActive && <span className="project-status-menu-check">✓</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
