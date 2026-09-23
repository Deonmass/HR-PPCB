'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type {
  HouseDoorAction,
  HouseDoorPhase,
  HouseOriginRect,
} from '@/components/village/VillageHouseDoorModal';

export type { HouseDoorAction, HouseDoorPhase, HouseOriginRect };

export type GuestUnitKind = 'room' | 'maison' | 'kimpese';

export interface GuestUnitDoorDetail {
  label: string;
  value: string;
}

export interface GuestUnitDoorVisitor {
  name: string;
  meta?: string;
}

interface Props {
  kind: GuestUnitKind;
  badge: string;
  statusLabel: string;
  title: string;
  occupied: boolean;
  /** Proposition en attente — teinte réservé + panneau « sous réserve ». */
  proposal?: boolean;
  details: GuestUnitDoorDetail[];
  visitors?: GuestUnitDoorVisitor[];
  /** Texte panneau droit (jours restants ou « Réserver »). */
  sideLabel?: string;
  /** Libellé au-dessus du panneau droit. */
  sideKicker?: string;
  /** Clic sur le panneau droit (ex. ouvrir le formulaire de réservation). */
  onSideAction?: () => void;
  sideActionEnabled?: boolean;
  origin: HouseOriginRect;
  phase: HouseDoorPhase;
  actions?: HouseDoorAction[];
  onRequestClose: () => void;
  onClosed: () => void;
}

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

const MODAL_W = 352;
const MODAL_H = 420;
const TRAVEL_MS = 480;
const DOOR_MS = 560;
const CONTENT_MS = 280;
const CLOSE_COLLAPSE_MS = 120;
const CLOSE_CONTENT_MS = 80;
const CLOSE_DOOR_MS = 160;
const CLOSE_RETURN_MS = 200;

function computeFromTransform(origin: HouseOriginRect, hasSide: boolean) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const modalW = hasSide ? MODAL_W * 1.55 : MODAL_W;
  const scale = Math.max(
    0.22,
    Math.min(origin.width / modalW, origin.height / MODAL_H),
  );
  const dx = origin.left + origin.width / 2 - vw / 2;
  const dy = origin.top + origin.height / 2 - vh / 2;
  return `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`;
}

function svgProps(size = 14) {
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

function ActionIconSvg({ name }: { name: NonNullable<HouseDoorAction['icon']> }) {
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

export default function GuestHouseUnitDoorModal({
  kind,
  badge,
  statusLabel,
  title,
  occupied,
  proposal = false,
  details,
  visitors = [],
  sideLabel = 'Réserver',
  sideKicker,
  onSideAction,
  sideActionEnabled = false,
  origin,
  phase,
  actions = [],
  onRequestClose,
  onClosed,
}: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const hasVisitors = visitors.length > 0;
  const hasSide = true;
  const canExpand = true;
  const [stage, setStage] = useState<Stage>('lift');
  const [fromTransform, setFromTransform] = useState(() =>
    typeof window === 'undefined'
      ? 'translate(-50%, -50%) scale(0.3)'
      : computeFromTransform(origin, hasSide),
  );
  const closingRef = useRef(false);

  useLayoutEffect(() => {
    setFromTransform(computeFromTransform(origin, hasSide));
  }, [origin, hasSide]);

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
    setFromTransform(computeFromTransform(origin, hasSide));
    setStage((s) => {
      if (s === 'expand') return 'collapse';
      if (s === 'content' || s === 'door' || s === 'travel') return 'hide-content';
      return 'return';
    });
  }, [phase, origin, hasSide]);

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

  const doorOpen =
    stage === 'door'
    || stage === 'content'
    || stage === 'expand'
    || stage === 'collapse'
    || stage === 'hide-content';
  const contentVisible =
    stage === 'content' || stage === 'expand' || stage === 'collapse';
  const expanded = stage === 'expand';
  const interactive = stage === 'expand' || (stage === 'content' && !canExpand);
  const atOrigin = stage === 'lift' || stage === 'return';
  const overlayDim =
    stage === 'travel'
    || stage === 'door'
    || stage === 'content'
    || stage === 'expand'
    || stage === 'collapse'
    || stage === 'hide-content'
    || stage === 'close-door';

  const shapeClass =
    kind === 'kimpese' ? 'shape-high-standard' : kind === 'maison' ? 'shape-free-style' : 'shape-studio';

  const toneClass = proposal
    ? ' is-reserved'
    : occupied
      ? ' is-occupied'
      : ' is-empty';
  const sideKickerText = sideKicker
    || (proposal ? 'Sous réserve' : occupied ? 'Temps restant' : 'Disponible');

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
        className={`village-house-door-modal ${shapeClass}${toneClass}${
          hasSide ? ' has-room' : ''
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
              <div className="village-house-door-modal-badge">{badge}</div>
              <p className="village-house-door-modal-status">{statusLabel}</p>
              <h3 id={titleId} className="village-house-door-modal-name">
                {title}
              </h3>

              <dl className="village-house-door-modal-details">
                {details.map((row) => (
                  <div key={`${row.label}-${row.value}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <aside className="village-house-door-modal-room is-side-panel" aria-label="Statut séjour">
            <div className="village-house-door-modal-content village-house-door-modal-side-content">
              <p className="village-house-door-modal-side-kicker">
                {sideKickerText}
              </p>
              {sideActionEnabled && onSideAction ? (
                <button
                  type="button"
                  className="village-house-door-modal-side-btn"
                  onClick={onSideAction}
                  tabIndex={interactive ? 0 : -1}
                  disabled={!interactive}
                >
                  {sideLabel}
                </button>
              ) : (
                <p className="village-house-door-modal-side-value">{sideLabel}</p>
              )}
              {hasVisitors ? (
                <>
                  <p className="village-house-door-modal-room-title">
                    Visiteurs
                    <span>{visitors.length}</span>
                  </p>
                  <ul className="village-house-door-modal-room-list">
                    {visitors.map((v, idx) => (
                      <li key={`${v.name}-${idx}`}>
                        <div className="village-house-door-modal-room-member">
                          <strong>{v.name}</strong>
                          {v.meta ? <span>{v.meta}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </aside>

          <div className="village-house-door-modal-door is-right" aria-hidden>
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
