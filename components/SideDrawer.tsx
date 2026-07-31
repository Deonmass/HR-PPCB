'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

/** Panneau latéral droit avec animation d’entrée / sortie. */
export default function SideDrawer({
  open,
  title,
  onClose,
  children,
  footer,
  width = 420,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    const t = window.setTimeout(() => setVisible(false), 280);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Une alerte SweetAlert est ouverte : Échap ferme l'alerte, pas le drawer.
      if (document.body.classList.contains('swal2-shown')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || (!open && !visible)) return null;

  return createPortal(
    <div className={`side-drawer-root${open ? ' is-open' : ' is-closing'}`} role="presentation">
      <button
        type="button"
        className="side-drawer-backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <aside
        className="side-drawer-panel"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="side-drawer-header">
          <h3>{title}</h3>
          <button type="button" className="btn-icon side-drawer-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </header>
        <div className="side-drawer-body">{children}</div>
        {footer ? <footer className="side-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
