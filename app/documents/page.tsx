'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';
import { DOCUMENTS_HUB_MENU_IDS } from '@/lib/menu-routes';

interface DocCard {
  id: string;
  title: string;
  description: string;
  href: string;
  menuId: string;
  accent: string;
  badge?: string;
  icon: ReactNode;
}

function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function IconPlane() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10v4M18 10v4" />
    </svg>
  );
}

function IconBed() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8v11M2 15h20v4M22 19v-6a3 3 0 0 0-3-3H8v5" />
      <circle cx="5.5" cy="10.5" r="1.5" />
    </svg>
  );
}

function IconBudget() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="5" width="3" height="13" />
    </svg>
  );
}

function IconBadgeCheck() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconLetterhead() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v4H4z" />
      <path d="M6 12h12M6 16h8M6 20h10" />
    </svg>
  );
}

function IconRrf() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
      <rect x="2" y="4" width="4" height="4" rx="1" />
      <rect x="2" y="10" width="4" height="4" rx="1" />
      <rect x="2" y="16" width="4" height="4" rx="1" />
    </svg>
  );
}

function IconNewcomer() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

function IconContract() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h6M9 17h4" />
      <path d="M9 9h1" />
    </svg>
  );
}

function IconConvention() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  );
}

function IconOrder() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 12h8M8 16h5" />
      <circle cx="9" cy="12" r="0.2" />
    </svg>
  );
}

const CARDS: DocCard[] = [
  {
    id: 'entetes',
    title: 'Entête',
    description: 'Papiers à en-tête Manuco et Quarryco — téléchargement et mise à jour des modèles.',
    href: '/documents/entetes',
    menuId: 'documents.entetes',
    accent: '#0f766e',
    badge: '2 modèles',
    icon: <IconLetterhead />,
  },
  {
    id: 'voyage',
    title: 'Voyage',
    description: 'Missions : formulaire complet (pack de documents) et documents émis.',
    href: '/documents-voyage/historique',
    menuId: 'travel.historique',
    accent: '#06b6d4',
    icon: <IconPlane />,
  },
  {
    id: 'cash-request',
    title: 'Cash Request',
    description: 'Demande de fonds — requestor, objet et lignes de dépenses.',
    href: '/documents-voyage/document/cash-request',
    menuId: 'travel.etablir',
    accent: '#22c55e',
    icon: <IconCash />,
  },
  {
    id: 'autorisation-voyage',
    title: "Formulaire d'autorisation de voyage",
    description: 'Formulaire adapté et liste des autorisations émises.',
    href: '/documents-voyage/document/travel-authorization',
    menuId: 'travel.etablir',
    accent: '#a855f7',
    icon: <IconDoc />,
  },
  {
    id: 'hotel-booking',
    title: 'Hotel booking form',
    description: 'Formulaire adapté et liste des réservations émises.',
    href: '/documents-voyage/document/hotel-booking',
    menuId: 'travel.etablir',
    accent: '#f59e0b',
    icon: <IconBed />,
  },
  {
    id: 'ordre-mission',
    title: 'Ordre de mission',
    description: 'Formulaire adapté et liste des ordres de mission émis.',
    href: '/documents-voyage/document/mission-order',
    menuId: 'travel.etablir',
    accent: '#6366f1',
    icon: <IconOrder />,
  },
  {
    id: 'trip-budget',
    title: 'Trip Budget Form',
    description: 'Formulaire adapté et liste des budgets de mission émis.',
    href: '/documents-voyage/document/trip-budget',
    menuId: 'travel.etablir',
    accent: '#0ea5e9',
    icon: <IconBudget />,
  },
  {
    id: 'attestation-service',
    title: 'Attestation de service',
    description: 'Attestation de service (FR/EN) basée sur l’agent sélectionné.',
    href: '/documents-voyage/attestation-services',
    menuId: 'travel.attestation',
    accent: '#e30613',
    icon: <IconBadgeCheck />,
  },
  {
    id: 'payment-voucher',
    title: 'Payment voucher',
    description: 'Bon de paiement.',
    href: '/documents-voyage/payment-voucher',
    menuId: 'travel.payment-voucher',
    accent: '#14b8a6',
    icon: <IconCash />,
  },
  {
    id: 'interim-appraisal',
    title: 'Interim appraisal evaluation',
    description: 'Évaluation de période d’essai — nom et fonction remplis automatiquement.',
    href: '/documents/interim-appraisal',
    menuId: 'documents.appraisal',
    accent: '#8b5cf6',
    icon: <IconBadgeCheck />,
  },
  {
    id: 'exit-forms',
    title: 'Exit forms',
    description: 'Clearance, exit interview, attestation de fin de service et user removal — remplis depuis la fiche agent.',
    href: '/documents/exit',
    menuId: 'documents.exit',
    accent: '#ef4444',
    badge: '4 documents',
    icon: <IconExit />,
  },
  {
    id: 'newcomer',
    title: 'Newcomer',
    description: 'Pack d’intégration — déclaration, New User Request et SAP Input form à partir du poste sélectionné.',
    href: '/documents/newcomer',
    menuId: 'documents.newcomer',
    accent: '#0d9488',
    badge: '3 documents',
    icon: <IconNewcomer />,
  },
  {
    id: 'rrf',
    title: 'RRF',
    description: 'Recruitment Requisition Form — fonction auto (cost center, reports to, location), benefits et export Excel/PDF.',
    href: '/documents/rrf',
    menuId: 'documents.rrf',
    accent: '#2563eb',
    badge: 'Excel + PDF',
    icon: <IconRrf />,
  },
  {
    id: 'contrat-standard',
    title: 'Contrat standard',
    description: 'Contrat CDD/CDI — agent, famille, classification conventionnelle, salaire USD/CDF et signature RH.',
    href: '/documents/contrat-standard',
    menuId: 'documents.contrat-standard',
    accent: '#b45309',
    badge: 'CDD / CDI',
    icon: <IconContract />,
  },
  {
    id: 'convention-collective',
    title: 'Convention collective',
    description: 'PDF de référence — recherche des clauses (essai, congés, préavis) et résumés RH.',
    href: '/documents/convention-collective',
    menuId: 'documents.convention-collective',
    accent: '#334155',
    badge: 'Recherche',
    icon: <IconConvention />,
  },
];

function canSeeMenu(
  can: (menuId: string, action: 'view' | 'create' | 'edit' | 'export' | 'delete' | 'undo') => boolean,
  menuId: string,
): boolean {
  return (
    can(menuId, 'view')
    || can(menuId, 'create')
    || can(menuId, 'edit')
    || can(menuId, 'export')
    || can(menuId, 'delete')
  );
}

export default function DocumentsHubPage() {
  const { can, isLoading, refresh } = usePermissions();

  useEffect(() => {
    void refresh({ silent: true });
  }, [refresh]);

  const visible = useMemo(() => {
    // Accès au hub Documents (au moins un menu du hub).
    const hasHubAccess = DOCUMENTS_HUB_MENU_IDS.some((id) => canSeeMenu(can, id));

    return CARDS
      .filter((card) => {
        // Entête : droit dédié OU n’importe quel accès Documents.
        if (card.id === 'entetes') {
          return canSeeMenu(can, 'documents.entetes') || hasHubAccess;
        }
        return canSeeMenu(can, card.menuId);
      })
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
  }, [can]);

  if (isLoading) return <div className="loading">Chargement...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Documents</h2>
          <p>
            Modèles et documents RH — sélectionnez un document pour l’établir ou le consulter.
            {visible.length > 0 ? (
              <span className="text-muted"> · {visible.length} module{visible.length > 1 ? 's' : ''}</span>
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
        <p className="docs-hub-empty">Aucun document accessible avec vos permissions.</p>
      )}
    </>
  );
}
