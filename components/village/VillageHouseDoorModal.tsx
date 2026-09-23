'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatDisplayName } from '@/lib/format-display-name';
import { isSpouseStatut } from '@/lib/dependants-utils';
import type { VillageMaisonOccupancy } from '@/lib/village-types';

export type HouseDoorPhase = 'open' | 'closing';

export interface HouseOriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface HouseDoorFamilyMember {
  nom: string;
  age: number | null;
  statut: string;
}

export type HouseDoorActionIcon =
  | 'home'
  | 'toggle'
  | 'move'
  | 'edit'
  | 'view'
  | 'delete'
  | 'add'
  | 'cancel';

export interface HouseDoorAction {
  id: string;
  label: string;
  icon?: HouseDoorActionIcon;
  danger?: boolean;
  onClick: () => void;
}

export type HouseShape = 'free-style' | 'high-standard' | 'studio' | 'twins';

type Stage =
  | 'lift'
  | 'travel'
  | 'door'
  | 'content'
  | 'expand'
  | 'collapse'
  | 'hide-content'
  | 'close-door'
  | 'return';

type DetailIcon = 'badge' | 'dept' | 'family' | 'home' | 'capacity' | 'note';

interface Props {
  maison: VillageMaisonOccupancy;
  tailleLabel: string;
  origin: HouseOriginRect;
  phase: HouseDoorPhase;
  familyMembers?: HouseDoorFamilyMember[];
  actions?: HouseDoorAction[];
  onRequestClose: () => void;
  onClosed: () => void;
}

const MODAL_W = 352;
const MODAL_H = 420;
const TRAVEL_MS = 480;
const DOOR_MS = 560;
const CONTENT_MS = 280;
const CLOSE_COLLAPSE_MS = 120;
const CLOSE_CONTENT_MS = 80;
const CLOSE_DOOR_MS = 160;
const CLOSE_RETURN_MS = 200;

export function resolveHouseShape(label: string): HouseShape {
  const key = label.trim().toLowerCase();
  if (key.includes('high') || key.includes('standard')) return 'high-standard';
  if (key.includes('studio')) return 'studio';
  if (key.includes('twin')) return 'twins';
  if (key.includes('free')) return 'free-style';
  return 'free-style';
}

function computeFromTransform(origin: HouseOriginRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(
    0.22,
    Math.min(origin.width / MODAL_W, origin.height / MODAL_H),
  );
  const dx = origin.left + origin.width / 2 - vw / 2;
  const dy = origin.top + origin.height / 2 - vh / 2;
  return `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`;
}

function formatAge(age: number | null): string {
  if (age == null || !Number.isFinite(age)) return '—';
  return `${age} an${age > 1 ? 's' : ''}`;
}

function memberRoleLabel(statut: string): string {
  if (isSpouseStatut(statut)) return 'Conjoint(e)';
  if (/enfant/i.test(statut)) return 'Enfant';
  return statut || 'Dépendant';
}

function svgProps(size = 13) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
}

function DetailIconSvg({ name }: { name: DetailIcon }) {
  const props = svgProps(12);
  if (name === 'badge') {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h6M7 13h10" />
      </svg>
    );
  }
  if (name === 'dept') {
    return (
      <svg {...props}>
        <path d="M4 20V8l8-4 8 4v12" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (name === 'family') {
    return (
      <svg {...props}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" />
        <path d="M15 14.5c2.2.3 4 2 4 4.5" />
      </svg>
    );
  }
  if (name === 'home') {
    return (
      <svg {...props}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10.5V20h12v-9.5" />
      </svg>
    );
  }
  if (name === 'capacity') {
    return (
      <svg {...props}>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
    </svg>
  );
}

function ActionIconSvg({ name }: { name: HouseDoorActionIcon }) {
  const props = svgProps(14);
  if (name === 'home') {
    return (
      <svg {...props}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10.5V20h12v-9.5" />
      </svg>
    );
  }
  if (name === 'toggle') {
    return (
      <svg {...props}>
        <rect x="2" y="8" width="20" height="8" rx="4" />
        <circle cx="16" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'move') {
    return (
      <svg {...props}>
        <path d="M5 12h11" />
        <path d="M12 7l5 5-5 5" />
        <path d="M5 5v14" />
      </svg>
    );
  }
  if (name === 'edit') {
    return (
      <svg {...props}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (name === 'view') {
    return (
      <svg {...props}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === 'delete') {
    return (
      <svg {...props}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
      </svg>
    );
  }
  if (name === 'cancel') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6" />
        <path d="m15 9-6 6" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DetailRow({
  icon,
  label,
  value,
  full,
}: {
  icon: DetailIcon;
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? 'is-full' : undefined}>
      <dt>
        <span className="village-house-door-modal-detail-icon">
          <DetailIconSvg name={icon} />
        </span>
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function VillageHouseDoorModal({
  maison,
  tailleLabel,
  origin,
  phase,
  familyMembers = [],
  actions = [],
  onRequestClose,
  onClosed,
}: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const hasRoom = familyMembers.length > 0;
  const canExpand = hasRoom || actions.length > 0;
  const shape = resolveHouseShape(tailleLabel || maison.typeMaison || maison.taille);
  const [stage, setStage] = useState<Stage>('lift');
  const [fromTransform, setFromTransform] = useState(() =>
    typeof window === 'undefined'
      ? 'translate(-50%, -50%) scale(0.3)'
      : computeFromTransform(origin),
  );
  const occupant = maison.occupants[0];
  const occupied = maison.occupied && Boolean(occupant);
  const closingRef = useRef(false);

  const sortedFamily = useMemo(
    () =>
      [...familyMembers].sort((a, b) => {
        const ra = isSpouseStatut(a.statut) ? 0 : 1;
        const rb = isSpouseStatut(b.statut) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return a.nom.localeCompare(b.nom, 'fr');
      }),
    [familyMembers],
  );

  useLayoutEffect(() => {
    setFromTransform(computeFromTransform(origin));
  }, [origin]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setStage('travel'));
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (stage === 'travel') {
      const t = window.setTimeout(() => setStage('door'), TRAVEL_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'door') {
      const t = window.setTimeout(() => setStage('content'), DOOR_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'content') {
      if (!canExpand) return undefined;
      const t = window.setTimeout(() => setStage('expand'), CONTENT_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'collapse') {
      const t = window.setTimeout(() => setStage('hide-content'), CLOSE_COLLAPSE_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'hide-content') {
      const t = window.setTimeout(() => setStage('close-door'), CLOSE_CONTENT_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'close-door') {
      const t = window.setTimeout(() => setStage('return'), CLOSE_DOOR_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'return') {
      const t = window.setTimeout(() => onClosed(), CLOSE_RETURN_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [stage, onClosed, canExpand]);

  useEffect(() => {
    if (phase !== 'closing' || closingRef.current) return;
    closingRef.current = true;
    setFromTransform(computeFromTransform(origin));
    setStage((s) => {
      if (s === 'expand') return 'collapse';
      if (s === 'content' || s === 'door' || s === 'travel') return 'hide-content';
      return 'return';
    });
  }, [phase, origin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  useEffect(() => {
    if (stage !== 'expand' && !(stage === 'content' && !canExpand)) return;
    closeBtnRef.current?.focus();
  }, [stage, canExpand]);

  const assignAction = actions.find((a) => a.id === 'assign');
  const doorOpen =
    stage === 'door' ||
    stage === 'content' ||
    stage === 'expand' ||
    stage === 'collapse' ||
    stage === 'hide-content';
  const contentVisible =
    stage === 'content' || stage === 'expand' || stage === 'collapse';
  const expanded = stage === 'expand';
  const interactive = stage === 'expand' || (stage === 'content' && !canExpand);
  const atOrigin = stage === 'lift' || stage === 'return';
  const overlayDim =
    stage === 'travel' ||
    stage === 'door' ||
    stage === 'content' ||
    stage === 'expand' ||
    stage === 'collapse' ||
    stage === 'hide-content' ||
    stage === 'close-door';

  return (
    <div
      className={`village-house-door-overlay${overlayDim ? ' is-dim' : ''}${
        stage === 'return' || stage === 'lift' ? ' is-clear' : ''
      }`}
      role="presentation"
      onClick={() => {
        if (interactive) onRequestClose();
      }}
    >
      <div
        className={`village-house-door-modal shape-${shape}${occupied ? ' is-occupied' : ' is-empty'}${
          hasRoom ? ' has-room' : ''
        }${doorOpen ? ' is-door-open' : ''}${contentVisible ? ' is-content-visible' : ''}${
          expanded ? ' is-expanded' : ''
        }${atOrigin ? ' is-at-origin' : ' is-at-center'}${
          phase === 'closing' ? ' is-closing-fast' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          transform: atOrigin
            ? fromTransform
            : 'translate(-50%, -50%) translate(0, 0) scale(1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="village-house-door-modal-crown" aria-hidden>
          <span className="village-house-door-modal-chimney" />
          <div className="village-house-door-modal-roof roof-main" />
          <div className="village-house-door-modal-roof roof-twin" />
          <span className="village-house-door-modal-eave" />
        </div>

        <div className="village-house-door-modal-shell">
          <button
            ref={closeBtnRef}
            type="button"
            className="village-house-door-modal-close"
            onClick={onRequestClose}
            aria-label="Fermer"
            tabIndex={interactive ? 0 : -1}
          >
            ×
          </button>

          <div className="village-house-door-modal-body">
            <div className="village-house-door-modal-content">
              <div className="village-house-door-modal-badge">{maison.numero}</div>
              <p className="village-house-door-modal-status">
                {occupied ? 'Occupée' : 'Vide'}
              </p>

              <h3 id={titleId} className="village-house-door-modal-name">
                {occupied ? formatDisplayName(occupant!.nom) : 'Maison disponible'}
              </h3>

              <dl className="village-house-door-modal-details">
                {occupied ? (
                  <>
                    <DetailRow
                      icon="badge"
                      label="Matricule"
                      value={
                        occupant!.externe || !occupant!.matricule
                          ? 'Hors effectif'
                          : occupant!.matricule
                      }
                    />
                    <DetailRow
                      icon="dept"
                      label="Département"
                      value={occupant!.departement || '—'}
                    />
                    <DetailRow
                      icon="family"
                      label="Famille"
                      value={
                        occupant!.familleSize > 0
                          ? `${occupant!.familleSize} personne${occupant!.familleSize > 1 ? 's' : ''}`
                          : '—'
                      }
                    />
                  </>
                ) : null}
                <DetailRow
                  icon="home"
                  label="Type"
                  value={tailleLabel || maison.typeMaison || '—'}
                />
                {maison.capacite != null ? (
                  <DetailRow icon="capacity" label="Capacité" value={String(maison.capacite)} />
                ) : null}
                {maison.commentaires ? (
                  <DetailRow icon="note" label="Commentaire" value={maison.commentaires} full />
                ) : null}
              </dl>

              {!occupied && assignAction ? (
                <button
                  type="button"
                  className="village-house-door-modal-add"
                  onClick={assignAction.onClick}
                  tabIndex={interactive ? 0 : -1}
                  disabled={!interactive}
                  title="Affecter un occupant"
                  aria-label="Affecter un occupant"
                >
                  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Affecter</span>
                </button>
              ) : null}
            </div>
          </div>

          {hasRoom ? (
            <aside className="village-house-door-modal-room" aria-label="Dépendants">
              <div className="village-house-door-modal-content">
                <p className="village-house-door-modal-room-title">
                  Dépendants
                  <span>{sortedFamily.length}</span>
                </p>
                <ul className="village-house-door-modal-room-list">
                  {sortedFamily.map((member, idx) => (
                    <li key={`${member.nom}-${idx}`}>
                      <div className="village-house-door-modal-room-member">
                        <strong>{formatDisplayName(member.nom)}</strong>
                        <span>{memberRoleLabel(member.statut)}</span>
                      </div>
                      <span className="village-house-door-modal-room-age">
                        {formatAge(member.age)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          ) : null}

          <div className="village-house-door-modal-door" aria-hidden>
            <span className="village-house-door-modal-door-panel">
              <span className="village-house-door-modal-knob" />
            </span>
          </div>
        </div>

        {actions.length > 0 ? (
          <div className="village-house-door-modal-actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`village-house-door-modal-action${action.danger ? ' is-danger' : ''}`}
                onClick={action.onClick}
                tabIndex={interactive ? 0 : -1}
                disabled={!interactive}
              >
                {action.icon ? <ActionIconSvg name={action.icon} /> : null}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
