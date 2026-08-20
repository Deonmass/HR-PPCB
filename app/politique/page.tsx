'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';

interface PolicyCard {
  id: string;
  title: string;
  description: string;
  href: string;
  menuId: string;
  accent: string;
  badge?: string;
  icon: ReactNode;
}

function IconAward() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M8.2 13.4 7 22l5-2.2L17 22l-1.2-8.6" />
    </svg>
  );
}

const CARDS: PolicyCard[] = [
  {
    id: 'longs-etats',
    title: 'Récompense pour longs états de service',
    description: 'Paliers 5 à 40 ans — sacs de ciment, chèque-cadeau et incitatif sur le salaire de base.',
    href: '/politique/longs-etats-de-service',
    menuId: 'politique.longs-etats',
    accent: '#b45309',
    badge: 'Ancienneté',
    icon: <IconAward />,
  },
];

function canSeeMenu(
  can: (menuId: string, action: 'view' | 'create' | 'edit' | 'export' | 'delete' | 'undo') => boolean,
  menuId: string,
): boolean {
  return can(menuId, 'view');
}

export default function PolitiqueHubPage() {
  const { can, isLoading, refresh } = usePermissions();

  useEffect(() => {
    void refresh({ silent: true });
  }, [refresh]);

  const visible = useMemo(
    () =>
      CARDS.filter((card) => canSeeMenu(can, card.menuId)).sort((a, b) =>
        a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }),
      ),
    [can],
  );

  if (isLoading) return <div className="loading">Chargement...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Politique</h2>
          <p>
            Politiques RH de référence — consultez le document et les agents concernés.
            {visible.length > 0 ? (
              <span className="text-muted">
                {' '}
                · {visible.length} politique{visible.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="docs-hub-grid">
        {visible.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            prefetch={false}
            className="docs-hub-card"
            style={{ '--docs-accent': card.accent } as CSSProperties}
          >
            <span className="docs-hub-icon">{card.icon}</span>
            <span className="docs-hub-body">
              <span className="docs-hub-title-row">
                <strong>{card.title}</strong>
                {card.badge && <span className="docs-hub-badge">{card.badge}</span>}
              </span>
              <span className="docs-hub-desc">{card.description}</span>
            </span>
            <span className="docs-hub-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
        ))}
      </div>

      {!visible.length && (
        <p className="docs-hub-empty">Aucune politique accessible avec vos permissions.</p>
      )}
    </>
  );
}
