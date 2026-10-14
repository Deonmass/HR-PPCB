'use client';

import { useEffect, useRef, useState } from 'react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';
import { confirmLogout, showLogoutLoading } from '@/lib/swal';

export default function MobileAccountMenu() {
  const { user } = usePermissions();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const name = user?.displayName || t('common.user');

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const logout = async () => {
    if (loggingOut) return;
    setOpen(false);
    if (!(await confirmLogout())) return;
    setLoggingOut(true);
    showLogoutLoading();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      // On bascule quand même vers la connexion.
    } finally {
      window.clearTimeout(timeoutId);
      window.location.replace('/login');
    }
  };

  return (
    <div className="mobile-account" ref={wrapRef}>
      <button
        type="button"
        className="mobile-account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mobile-account-avatar" aria-hidden>
          {user?.initials || 'RH'}
        </span>
      </button>
      {open && (
        <div className="mobile-account-menu" role="menu">
          <p className="mobile-account-menu-name">{name}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
          >
            {t('common.changePassword')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? t('common.loggingOut') : t('common.logout')}
          </button>
        </div>
      )}
      {passwordOpen && (
        <ChangePasswordModal mode="self" onClose={() => setPasswordOpen(false)} />
      )}
    </div>
  );
}
