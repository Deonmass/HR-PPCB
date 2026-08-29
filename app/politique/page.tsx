'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';

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

function IconBook() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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
  {
    id: 'convention-collective',
    title: 'Convention collective',
    description: 'PDF de référence — recherche des clauses (essai, congés, préavis, heures supplémentaires).',
    href: '/politique/convention-collective',
    menuId: 'politique.convention-collective',
    accent: '#334155',
    badge: 'Recherche',
    icon: <IconBook />,
  },
  {
    id: 'heures-sup',
    title: 'Politique sur les heures supplémentaires finale oct 25',
    description: 'PPCB-LG-POL-HR-0032 — horaires, taux 130 / 160 / 200 % et plafonds HS.',
    href: '/politique/heures-supplementaires',
    menuId: 'politique.heures-sup',
    accent: '#0f766e',
    badge: 'Oct. 25',
    icon: <IconClock />,
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
  const { t, locale } = useI18n();

  useEffect(() => {
    void refresh({ silent: true });
  }, [refresh]);

  const visible = useMemo(
    () =>
      CARDS.filter((card) => canSeeMenu(can, card.menuId))
        .map((card) => {
          if (card.id === 'longs-etats') {
            return {
              ...card,
              title: t('pol.longs.title'),
              description: t('pol.longs.desc'),
              badge: t('pol.longs.badge'),
            };
          }
          if (card.id === 'convention-collective') {
            return {
              ...card,
              title: t('pol.convention.title'),
              description: t('pol.convention.desc'),
              badge: t('pol.convention.badge'),
            };
          }
          if (card.id === 'heures-sup') {
            return {
              ...card,
              title: t('pol.ot.title'),
              description: t('pol.ot.desc'),
              badge: t('pol.ot.badge'),
            };
          }
          return card;
        })
        .sort((a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base' })),
    [can, t, locale],
  );

  if (isLoading) return <div className="loading">{t('common.loading')}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t('pol.title')}</h2>
          <p>
            {t('pol.subtitle')}
            {visible.length > 0 ? (
              <span className="text-muted">
                {' '}
                · {t(visible.length > 1 ? 'pol.countPlural' : 'pol.count', { count: visible.length })}
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
        <p className="docs-hub-empty">{t('pol.empty')}</p>
      )}
    </>
  );
}
