'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  href?: string;
  menuId?: string;
  accent: string;
  badge?: string;
  comingSoon?: boolean;
  icon: ReactNode;
}

function IconSlides() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function IconBalance() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3" />
      <path d="M5 10h14" />
      <path d="M7 10 4 16h6l-3-6zM17 10l-3 6h6l-3-6z" />
      <path d="M12 6v14" />
    </svg>
  );
}

const CARDS: ReportCard[] = [
  {
    id: 'exco',
    title: 'EXCO',
    description: 'Rapport mensuel ExCo — effectifs, heures supplémentaires, coûts et présentation.',
    href: '/exco',
    menuId: 'exco.rapport',
    accent: '#be123c',
    badge: 'Mensuel',
    icon: <IconSlides />,
  },
  {
    id: 'bilan-social',
    title: 'Bilan social',
    description: 'Indicateurs sociaux annuels — en cours de développement.',
    accent: '#0f766e',
    badge: 'À venir',
    comingSoon: true,
    icon: <IconBalance />,
  },
];

export default function RapportHubPage() {
  const { can, isLoading, refresh } = usePermissions();
  const { t, locale } = useI18n();
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    void refresh({ silent: true });
  }, [refresh]);

  const visible = useMemo(
    () =>
      CARDS.filter((card) => {
        if (card.comingSoon) return can('exco.rapport', 'view');
        return card.menuId ? can(card.menuId, 'view') : false;
      })
        .map((card) => {
          if (card.id === 'exco') {
            return {
              ...card,
              title: t('rapport.exco.title'),
              description: t('rapport.exco.desc'),
              badge: t('rapport.exco.badge'),
            };
          }
          if (card.id === 'bilan-social') {
            return {
              ...card,
              title: t('rapport.bilan.title'),
              description: t('rapport.bilan.desc'),
              badge: t('rapport.bilan.badge'),
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
          <h2>{t('rapport.title')}</h2>
          <p>
            {t('rapport.subtitle')}
            {visible.length > 0 ? (
              <span className="text-muted">
                {' '}
                · {t(visible.length > 1 ? 'rapport.countPlural' : 'rapport.count', { count: visible.length })}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="docs-hub-grid">
        {visible.map((card) => {
          const opening = openingId === card.id;
          const body = (
            <>
              <span className="docs-hub-icon">
                {opening ? <span className="btn-spinner docs-hub-spinner" aria-hidden="true" /> : card.icon}
              </span>
              <span className="docs-hub-body">
                <span className="docs-hub-title-row">
                  <strong>{card.title}</strong>
                  {card.badge ? <span className="docs-hub-badge">{card.badge}</span> : null}
                </span>
                <span className="docs-hub-desc">{card.description}</span>
              </span>
              {!card.comingSoon ? (
                <span className="docs-hub-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              ) : null}
            </>
          );

          if (card.comingSoon || !card.href) {
            return (
              <div
                key={card.id}
                className="docs-hub-card is-disabled"
                style={{ '--docs-accent': card.accent } as CSSProperties}
              >
                {body}
              </div>
            );
          }

          return (
            <Link
              key={card.id}
              href={card.href}
              prefetch={false}
              className={`docs-hub-card${opening ? ' is-opening' : ''}`}
              style={{ '--docs-accent': card.accent } as CSSProperties}
              aria-busy={opening}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                setOpeningId(card.id);
              }}
            >
              {body}
            </Link>
          );
        })}
      </div>

      {!visible.length ? (
        <p className="docs-hub-empty">{t('rapport.empty')}</p>
      ) : null}
    </>
  );
}
