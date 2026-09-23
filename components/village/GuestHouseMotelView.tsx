'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import GuestHouseUnitDoorModal, {
  type GuestUnitDoorDetail,
  type GuestUnitDoorVisitor,
  type GuestUnitKind,
  type HouseDoorAction,
  type HouseDoorPhase,
  type HouseOriginRect,
} from '@/components/village/GuestHouseUnitDoorModal';
import {
  KIMPESE_BUILDING,
  roomDisplayName,
  type GuestReservation,
  type GuestRoom,
} from '@/lib/guest-house-types';

export type MotelRoomStatus = 'occupied' | 'reserved' | 'empty';

export interface MotelRoomItem {
  room: GuestRoom;
  status: MotelRoomStatus;
  linkedReservation: GuestReservation | null;
}

/** Maison village (Back up village) — vide ou avec visiteurs GH. */
export interface MotelMaisonItem {
  numero: string;
  typeMaison?: string;
  taille?: string;
  lodgers: number;
  capacity: number;
  status: MotelRoomStatus;
  /** Première réservation active / réservée (affichage principal). */
  linkedReservation: GuestReservation | null;
  /** Toutes les réservations GH sur cette maison (visiteurs). */
  visitors: GuestReservation[];
}

interface Props {
  roomsByBuilding: Record<string, MotelRoomItem[]>;
  /** Maisons village avec visiteurs GH (et éventuellement vides disponibles). */
  maisonUnits?: MotelMaisonItem[];
  /** Réservations en attente sans chambre (mois courant) — affichées sur les vides, surplus en légende. */
  unassignedReservations?: GuestReservation[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onCreateReservation?: (prefill?: { roomId?: string; maisonNumero?: string }) => void;
  onEditRoom: (room: GuestRoom) => void;
  /** Ouvre le formulaire de modification de la réservation liée. */
  onEditReservation?: (reservation: GuestReservation) => void;
  onDeleteRoom: (room: GuestRoom) => void;
  onHistory: (room: GuestRoom) => void;
  /** Retire l’affichage chambre/maison sans annuler la réservation. */
  onClearProposal?: (reservation: GuestReservation) => void;
  /** Ouvre la validation / confirmation (attribution). */
  onValidateReservation?: (reservation: GuestReservation) => void;
  /** Annule définitivement la réservation. */
  onCancelReservation?: (reservation: GuestReservation) => void;
  onCreateKimpeseHotel?: () => void;
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function remainingDays(endDate: string): number {
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / 86_400_000);
}

function daysUntilStart(startDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((start.getTime() - today.getTime()) / 86_400_000);
}

function formatDaysLeftShort(endDate: string): string {
  const days = remainingDays(endDate);
  if (days < 0) return 'Terminé';
  if (days === 0) return 'Jour J';
  return `${days} j rest.`;
}

/** Jours avant le début du séjour (propositions / réservé). */
function formatDaysBeforeStart(startDate: string): string {
  const days = daysUntilStart(startDate);
  if (days > 1) return `Dans ${days} j`;
  if (days === 1) return 'Dans 1 j';
  if (days === 0) return 'Débute aujourd’hui';
  return 'Déjà commencé';
}

function statusLabel(status: MotelRoomStatus, proposal = false): string {
  if (proposal) return 'Sous réserve';
  if (status === 'occupied') return 'Occupé';
  if (status === 'reserved') return 'Réservé';
  return 'Vide';
}

function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconBed({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 18V9a2 2 0 0 1 2-2h6v11" />
      <path d="M11 11h8a2 2 0 0 1 2 2v5" />
      <path d="M3 18h18" />
      <path d="M7 9V7a1 1 0 0 1 1-1h2" />
    </svg>
  );
}

function IconHome({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function IconHotel({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01" />
    </svg>
  );
}

function IconShower({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M4 12h16" />
      <path d="M12 4v4" />
      <path d="M8 16v.01M12 17v.01M16 16v.01M10 20v.01M14 20v.01" />
      <path d="M8 8a4 4 0 0 1 8 0" />
    </svg>
  );
}

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      {dir === 'right' ? <path d="m9 6 6 6-6 6" /> : <path d="m15 6-6 6 6 6" />}
    </svg>
  );
}

/** Scroll horizontal avec flèche flottante (hôtels Kimpese). */
function FloorplanScrollRail({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 6);
    setCanRight(max > 6 && el.scrollLeft < max - 6);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update, children]);

  const scrollByDir = (dir: 'left' | 'right') => {
    const el = ref.current;
    if (!el) return;
    const step = Math.max(180, Math.floor(el.clientWidth * 0.7));
    el.scrollBy({ left: dir === 'right' ? step : -step, behavior: 'smooth' });
  };

  return (
    <div className={`guest-house-floorplan-scroll-wrap${className ? ` ${className}` : ''}`}>
      <div ref={ref} className="guest-house-floorplan-scroll is-rail">
        {children}
      </div>
      {canLeft ? (
        <button
          type="button"
          className="guest-house-floorplan-scroll-fab is-left"
          aria-label="Défiler vers la gauche"
          onClick={() => scrollByDir('left')}
        >
          <IconChevron dir="left" />
        </button>
      ) : null}
      {canRight ? (
        <button
          type="button"
          className="guest-house-floorplan-scroll-fab is-right"
          aria-label="Défiler vers la droite"
          onClick={() => scrollByDir('right')}
        >
          <IconChevron dir="right" />
        </button>
      ) : null}
    </div>
  );
}

function sortRooms(items: MotelRoomItem[]): MotelRoomItem[] {
  return [...items].sort((a, b) =>
    a.room.roomNumber.localeCompare(b.room.roomNumber, 'fr', { numeric: true }),
  );
}

function sortKimpese(items: MotelRoomItem[]): MotelRoomItem[] {
  return [...items].sort((a, b) =>
    roomDisplayName(a.room).localeCompare(roomDisplayName(b.room), 'fr'),
  );
}

function sortMaisons(items: MotelMaisonItem[]): MotelMaisonItem[] {
  return [...items].sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));
}

function roomUnitLabel(room: GuestRoom): string {
  const num = (room.roomNumber || '').trim();
  if (!num) return 'CH.';
  if (/^vip$/i.test(num)) return 'VIP';
  return `CH. ${num}`;
}

type RoomMenuIcon = 'view' | 'edit' | 'delete' | 'cancel' | 'add' | 'toggle';

function buildRoomMenuItems(opts: {
  room: GuestRoom;
  linkedReservation: GuestReservation | null;
  isKimpese: boolean;
  canEdit: boolean;
  canDelete: boolean;
  pendingActions: HouseDoorAction[];
  onHistory: (room: GuestRoom) => void;
  onEditRoom: (room: GuestRoom) => void;
  onEditReservation?: (reservation: GuestReservation) => void;
  onDeleteRoom: (room: GuestRoom) => void;
}): Array<{
  id: string;
  label: string;
  icon: RoomMenuIcon;
  onClick: () => void;
  danger?: boolean;
}> {
  const {
    room,
    linkedReservation,
    isKimpese,
    canEdit,
    canDelete,
    pendingActions,
    onHistory,
    onEditRoom,
    onEditReservation,
    onDeleteRoom,
  } = opts;
  const items: Array<{
    id: string;
    label: string;
    icon: RoomMenuIcon;
    onClick: () => void;
    danger?: boolean;
  }> = [
    {
      id: 'history',
      label: 'Historique',
      icon: 'view',
      onClick: () => onHistory(room),
    },
    ...pendingActions.map((a) => ({
      id: a.id,
      label: a.label,
      icon: (a.icon ?? 'view') as RoomMenuIcon,
      onClick: a.onClick,
      danger: a.danger,
    })),
  ];
  if (canEdit && linkedReservation && onEditReservation) {
    items.push({
      id: 'edit-reservation',
      label: 'Modifier la réservation',
      icon: 'edit',
      onClick: () => onEditReservation(linkedReservation),
    });
  }
  if (canEdit) {
    items.push({
      id: 'edit',
      label: isKimpese ? 'Modifier hôtel' : 'Modifier chambre',
      icon: 'edit',
      onClick: () => onEditRoom(room),
    });
  }
  if (canDelete) {
    items.push({
      id: 'delete',
      label: 'Supprimer',
      icon: 'delete',
      danger: true,
      onClick: () => onDeleteRoom(room),
    });
  }
  return items;
}

/** Chambre VIP (ex. 1/2 VIP) — exclue du placement automatique des réservations sans chambre. */
function isVipRoom(room: GuestRoom): boolean {
  const tokens = [room.roomNumber, room.roomName, room.templateLabel]
    .map((v) => (v || '').trim().toLowerCase())
    .filter(Boolean);
  return tokens.some((t) => /\bvip\b/.test(t));
}

type PlanBlock =
  | {
      key: string;
      kind: 'rooms';
      label: string;
      subtitle: string;
      rooms: MotelRoomItem[];
      showBath: boolean;
      accent: 'onsite' | 'kimpese';
    }
  | {
      key: string;
      kind: 'maisons';
      label: string;
      subtitle: string;
      maisons: MotelMaisonItem[];
      accent: 'maison';
    };

export default function GuestHouseMotelView({
  roomsByBuilding,
  maisonUnits = [],
  unassignedReservations = [],
  canCreate = false,
  canEdit = false,
  canDelete = false,
  onCreateReservation,
  onEditRoom,
  onEditReservation,
  onDeleteRoom,
  onHistory,
  onClearProposal,
  onValidateReservation,
  onCancelReservation,
  onCreateKimpeseHotel,
}: Props) {
  const [doorPeek, setDoorPeek] = useState<{
    kind: GuestUnitKind;
    badge: string;
    statusLabel: string;
    title: string;
    occupied: boolean;
    /** Proposition en attente → teinte « réservé » + panneau sous réserve. */
    proposal?: boolean;
    details: GuestUnitDoorDetail[];
    visitors: GuestUnitDoorVisitor[];
    phase: HouseDoorPhase;
    origin: HouseOriginRect;
    actions: HouseDoorAction[];
    sourceKey: string;
    sideLabel: string;
    sideKicker?: string;
    onSideAction?: () => void;
    sideActionEnabled?: boolean;
  } | null>(null);

  const openUnitDoor = useCallback((
    sourceEl: HTMLElement | null,
    payload: Omit<NonNullable<typeof doorPeek>, 'phase' | 'origin'>,
  ) => {
    const rect = sourceEl?.getBoundingClientRect();
    const origin: HouseOriginRect = rect
      ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      : {
          top: window.innerHeight / 2 - 40,
          left: window.innerWidth / 2 - 40,
          width: 80,
          height: 100,
        };
    setDoorPeek({ ...payload, phase: 'open', origin });
  }, []);

  const closeUnitDoor = useCallback(() => {
    setDoorPeek((prev) => {
      if (!prev || prev.phase === 'closing') return prev;
      return { ...prev, phase: 'closing' };
    });
  }, []);

  const finishUnitDoor = useCallback(() => {
    setDoorPeek(null);
  }, []);

  const buildPendingActions = useCallback((
    reservation: GuestReservation | null | undefined,
    opts?: { provisional?: boolean },
  ): HouseDoorAction[] => {
    if (!reservation || reservation.status !== 'pending' || !canEdit) return [];
    const actions: HouseDoorAction[] = [];
    if (onClearProposal && (opts?.provisional || reservation.roomId || reservation.maisonNumero)) {
      actions.push({
        id: 'clear-proposal',
        label: 'Annuler la proposition',
        icon: 'cancel',
        onClick: () => {
          closeUnitDoor();
          onClearProposal(reservation);
        },
      });
    }
    if (onValidateReservation) {
      actions.push({
        id: 'validate',
        label: 'Valider la réservation',
        icon: 'add',
        onClick: () => {
          closeUnitDoor();
          onValidateReservation(reservation);
        },
      });
    }
    if (onCancelReservation) {
      actions.push({
        id: 'cancel-reservation',
        label: 'Annuler la réservation',
        icon: 'toggle',
        onClick: () => {
          closeUnitDoor();
          onCancelReservation(reservation);
        },
      });
    }
    return actions;
  }, [canEdit, onClearProposal, onValidateReservation, onCancelReservation, closeUnitDoor]);

  const bat1 = useMemo(
    () => sortRooms(roomsByBuilding['Batiment #1'] ?? []),
    [roomsByBuilding],
  );
  const bat2 = useMemo(
    () => sortRooms(roomsByBuilding['Batiment #2'] ?? []),
    [roomsByBuilding],
  );
  const kimpese = useMemo(
    () => sortKimpese(roomsByBuilding[KIMPESE_BUILDING] ?? []),
    [roomsByBuilding],
  );
  const maisons = useMemo(() => sortMaisons(maisonUnits), [maisonUnits]);

  /** Place les réservations sans chambre sur les vides B1/B2 (affichage) ; le surplus = légende. */
  const { provisionalByRoomId, overflowUnassigned } = useMemo(() => {
    const queue = [...unassignedReservations].sort((a, b) =>
      a.startDate.localeCompare(b.startDate) || a.numero.localeCompare(b.numero),
    );
    const map = new Map<string, GuestReservation>();
    for (const item of [...bat1, ...bat2]) {
      if (item.status !== 'empty' || queue.length === 0) continue;
      if (isVipRoom(item.room)) continue;
      const next = queue.shift();
      if (next) map.set(item.room.id, next);
    }
    return { provisionalByRoomId: map, overflowUnassigned: queue.length };
  }, [bat1, bat2, unassignedReservations]);

  const planBlocks: PlanBlock[] = useMemo(() => [
    {
      key: 'bat1',
      kind: 'rooms',
      label: 'Bâtiment 1',
      subtitle: 'Guest house',
      rooms: bat1,
      showBath: true,
      accent: 'onsite',
    },
    {
      key: 'bat2',
      kind: 'rooms',
      label: 'Bâtiment 2',
      subtitle: 'Guest house',
      rooms: bat2,
      showBath: true,
      accent: 'onsite',
    },
    {
      key: 'bat3',
      kind: 'maisons',
      label: 'Back up village',
      subtitle: 'Maisons vides · overflow visiteurs',
      maisons,
      accent: 'maison',
    },
    {
      key: 'bat4',
      kind: 'rooms',
      label: 'Hors village',
      subtitle: 'Hôtels Kimpese',
      rooms: kimpese,
      showBath: false,
      accent: 'kimpese',
    },
  ], [bat1, bat2, maisons, kimpese]);

  const totals = useMemo(() => {
    let occupied = 0;
    let reserved = 0;
    let empty = 0;
    let total = 0;
    for (const block of planBlocks) {
      if (block.kind === 'maisons') {
        for (const m of block.maisons) {
          total += 1;
          if (m.status === 'occupied') occupied += 1;
          else if (m.status === 'reserved') reserved += 1;
          else empty += 1;
        }
        continue;
      }
      for (const item of block.rooms) {
        total += 1;
        const provisional = provisionalByRoomId.get(item.room.id);
        const status = provisional ? 'reserved' : item.status;
        if (status === 'occupied') occupied += 1;
        else if (status === 'reserved') reserved += 1;
        else empty += 1;
      }
    }
    return { total, occupied, reserved, empty };
  }, [planBlocks, provisionalByRoomId]);

  const showUnassignedLegend = overflowUnassigned > 0;
  const visitorCount = maisons.reduce((sum, m) => sum + m.lodgers, 0);

  return (
    <>
    <section className="panel panel-padded guest-house-motel">
      <div className="guest-house-section-head guest-house-motel-head">
        <div>
          <h3>Plan des chambres</h3>
          <p className="text-muted">
            4 bâtiments · {totals.occupied} occupée(s) · {totals.empty} vide(s)
            {totals.reserved ? ` · ${totals.reserved} réservée(s)` : ''}
            {visitorCount > 0 ? ` · ${visitorCount} visiteur(s) en maison` : ''}
            {showUnassignedLegend ? ` · ${overflowUnassigned} sans chambre` : ''}
          </p>
        </div>
        <div className="guest-house-motel-legend" aria-hidden>
          <span className="guest-house-motel-legend-item is-occupied">Occupé</span>
          <span className="guest-house-motel-legend-item is-reserved">Réservé</span>
          <span className="guest-house-motel-legend-item is-empty">Vide</span>
          {showUnassignedLegend ? (
            <span className="guest-house-motel-legend-item is-unassigned">
              Sans chambre ({overflowUnassigned})
            </span>
          ) : null}
        </div>
      </div>

      <div className="guest-house-motel-plans guest-house-motel-plans-4">
        {planBlocks.map((block) => {
          if (block.kind === 'maisons') {
            const occupiedCount = block.maisons.filter((m) => m.status === 'occupied').length;
            const reservedCount = block.maisons.filter((m) => m.status === 'reserved').length;
            const emptyCount = block.maisons.filter((m) => m.status === 'empty').length;
            const visitorSum = block.maisons.reduce((s, m) => s + m.lodgers, 0);
            const isFull = block.maisons.length > 0
              && block.maisons.every((m) => m.lodgers >= m.capacity);

            return (
              <article
                key={block.key}
                className={`guest-house-floorplan is-maison${isFull ? ' is-full' : ''}`}
              >
                <header className="guest-house-floorplan-head">
                  <div className="guest-house-floorplan-title-block">
                    <span className="guest-house-floorplan-building-badge is-maison" aria-hidden />
                    <div>
                      <h4>{block.label}</h4>
                      <p>
                        {block.subtitle} · {block.maisons.length} maison(s)
                        {occupiedCount ? ` · ${occupiedCount} occupée(s)` : ''}
                        {reservedCount ? ` · ${reservedCount} réservée(s)` : ''}
                        {emptyCount ? ` · ${emptyCount} vide(s)` : ''}
                        {visitorSum ? ` · ${visitorSum} visiteur(s)` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="guest-house-floorplan-head-actions">
                    {isFull ? (
                      <span className="guest-house-full-badge" title="Maisons saturées (max visiteurs)">
                        FULL
                      </span>
                    ) : null}
                    {canCreate && onCreateReservation ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm btn-with-icon"
                        onClick={() => onCreateReservation()}
                        title="Nouvelle réservation"
                      >
                        <IconPlus size={13} />
                        Réservation
                      </button>
                    ) : null}
                  </div>
                </header>

                {block.maisons.length === 0 ? (
                  <p className="text-muted guest-house-motel-empty">
                    Aucune maison village vide disponible.
                  </p>
                ) : (
                  <div className="guest-house-floorplan-scroll">
                    <div
                      className="guest-house-floorplan-building is-maison"
                      style={{ '--gh-room-count': String(Math.max(block.maisons.length, 1)) } as CSSProperties}
                    >
                      <div className="guest-house-floorplan-roof is-maison" aria-hidden />
                      <div className="guest-house-floorplan-units" role="list">
                        {block.maisons.map((maison) => {
                          const daysLeft = maison.linkedReservation
                            ? remainingDays(maison.linkedReservation.endDate)
                            : null;
                          const isMaisonProposal = Boolean(
                            maison.linkedReservation
                            && maison.linkedReservation.status === 'pending',
                          );
                          const menuItems = [
                            ...buildPendingActions(maison.linkedReservation).map((a) => ({
                              id: a.id,
                              label: a.label,
                              icon: (a.icon ?? 'view') as 'view' | 'edit' | 'delete' | 'cancel' | 'add' | 'toggle',
                              onClick: a.onClick,
                              danger: a.danger,
                            })),
                          ];

                          return (
                            <div
                              key={maison.numero}
                              role="button"
                              tabIndex={0}
                              className={`guest-house-floorplan-unit is-${isMaisonProposal ? 'reserved' : maison.status}${isMaisonProposal ? ' is-provisional' : ''} is-maison-unit is-clickable${
                                doorPeek?.sourceKey === `maison:${maison.numero}` ? ' is-door-source' : ''
                              }`}
                              title={`Maison ${maison.numero} — ${statusLabel(maison.status, isMaisonProposal)} · ${maison.lodgers}/${maison.capacity} visiteur(s)`}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest('.settings-card-menu-btn, .row-context-menu')) {
                                  return;
                                }
                                const isEmptyUnit = maison.status === 'empty' && !isMaisonProposal;
                                const sideLabel = isEmptyUnit
                                  ? 'Réserver'
                                  : isMaisonProposal && maison.linkedReservation
                                    ? formatDaysBeforeStart(maison.linkedReservation.startDate)
                                    : daysLeft == null
                                      ? 'Réserver'
                                      : daysLeft < 0
                                        ? 'Terminé'
                                        : daysLeft === 0
                                          ? 'Jour J'
                                          : `${daysLeft} j rest.`;
                                openUnitDoor(e.currentTarget, {
                                  kind: 'maison',
                                  badge: maison.numero,
                                  statusLabel: statusLabel(maison.status, isMaisonProposal),
                                  title: maison.linkedReservation?.personName
                                    || (maison.lodgers > 0 ? `${maison.lodgers} visiteurs` : 'Maison disponible'),
                                  occupied: maison.status === 'occupied' && !isMaisonProposal,
                                  proposal: isMaisonProposal,
                                  details: [
                                    {
                                      label: 'Occupation',
                                      value: `${maison.lodgers}/${maison.capacity} pers.`,
                                    },
                                    ...(maison.typeMaison
                                      ? [{ label: 'Type', value: maison.typeMaison }]
                                      : []),
                                    ...(maison.linkedReservation
                                      ? [{
                                          label: 'Période',
                                          value: `${formatDate(maison.linkedReservation.startDate)} → ${formatDate(maison.linkedReservation.endDate)}`,
                                        }]
                                      : []),
                                  ],
                                  visitors: maison.visitors.map((v) => ({
                                    name: v.personName,
                                    meta: `${formatDate(v.startDate)} → ${formatDate(v.endDate)}`,
                                  })),
                                  actions: buildPendingActions(maison.linkedReservation),
                                  sourceKey: `maison:${maison.numero}`,
                                  sideLabel,
                                  sideKicker: isEmptyUnit
                                    ? 'Disponible'
                                    : isMaisonProposal
                                      ? 'Sous réserve'
                                      : 'Temps restant',
                                  sideActionEnabled: Boolean(isEmptyUnit && canCreate && onCreateReservation),
                                  onSideAction: isEmptyUnit && canCreate && onCreateReservation
                                    ? () => {
                                        closeUnitDoor();
                                        onCreateReservation({ maisonNumero: maison.numero });
                                      }
                                    : undefined,
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  (e.currentTarget as HTMLElement).click();
                                }
                              }}
                            >
                              <div className="guest-house-floorplan-sleep">
                                <div className="guest-house-floorplan-unit-top">
                                  <div>
                                    <strong className="guest-house-floorplan-ch-label">
                                      Maison {maison.numero}
                                    </strong>
                                    {maison.typeMaison ? (
                                      <span className="guest-house-floorplan-room-name" title={maison.typeMaison}>
                                        {maison.typeMaison}
                                      </span>
                                    ) : null}
                                  </div>
                                  {menuItems.length > 0 ? (
                                    <CardActionMenu
                                      ariaLabel={`Actions Maison ${maison.numero}`}
                                      items={menuItems}
                                    />
                                  ) : null}
                                </div>

                                <div className="guest-house-floorplan-bed-area" aria-hidden>
                                  <IconHome size={28} />
                                </div>

                                {maison.linkedReservation ? (
                                  <div className="guest-house-floorplan-info">
                                    {isMaisonProposal || maison.status === 'reserved' ? (
                                      <span className="guest-house-floorplan-status-pill is-reserved">
                                        {isMaisonProposal ? 'Sous réserve' : 'Réservé'}
                                      </span>
                                    ) : (
                                      <span className="guest-house-floorplan-status-pill">
                                        Occupé
                                      </span>
                                    )}
                                    <div
                                      className="guest-house-floorplan-occupant"
                                      title={maison.visitors.map((v) => v.personName).join(', ')}
                                    >
                                      {maison.lodgers > 1
                                        ? `${maison.lodgers} visiteurs`
                                        : maison.linkedReservation.personName}
                                    </div>
                                    <div className="guest-house-floorplan-dates">
                                      {formatDate(maison.linkedReservation.startDate)}
                                      {' → '}
                                      {formatDate(maison.linkedReservation.endDate)}
                                    </div>
                                    <div
                                      className={`guest-house-floorplan-restant${
                                        !isMaisonProposal && daysLeft != null && daysLeft <= 2 && daysLeft >= 0
                                          ? ' is-critical'
                                          : ''
                                      }`}
                                    >
                                      {isMaisonProposal
                                        ? formatDaysBeforeStart(maison.linkedReservation.startDate)
                                        : `${maison.lodgers}/${maison.capacity} pers.${
                                            daysLeft != null ? ` · ${formatDaysLeftShort(maison.linkedReservation.endDate)}` : ''
                                          }`}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="guest-house-floorplan-info is-vacant">
                                    <span className="guest-house-floorplan-status-pill">Vide</span>
                                    <span>0/{maison.capacity} · disponible</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          }

          const displayRooms = block.rooms.map((item) => {
            if (block.accent === 'kimpese') return item;
            const provisional = provisionalByRoomId.get(item.room.id);
            if (!provisional) return item;
            return {
              ...item,
              status: 'reserved' as const,
              linkedReservation: provisional,
            };
          });
          const occupiedCount = displayRooms.filter((r) => r.status === 'occupied').length;
          const reservedCount = displayRooms.filter((r) => r.status === 'reserved').length;
          const emptyCount = displayRooms.filter((r) => r.status === 'empty').length;
          const isFull = displayRooms.length > 0 && emptyCount === 0;
          const isKimpese = block.accent === 'kimpese';

          return (
            <article
              key={block.key}
              className={`guest-house-floorplan${isKimpese ? ' is-kimpese' : ''}${isFull ? ' is-full' : ''}`}
            >
              <header className="guest-house-floorplan-head">
                <div className="guest-house-floorplan-title-block">
                  <span
                    className={`guest-house-floorplan-building-badge${isKimpese ? ' is-kimpese' : ''}`}
                    aria-hidden
                  />
                  <div>
                    <h4>{block.label}</h4>
                    <p>
                      {block.subtitle} · {displayRooms.length}{' '}
                      {isKimpese ? 'hôtel(s)' : 'chambre(s)'}
                      {occupiedCount ? ` · ${occupiedCount} occupée(s)` : ''}
                      {reservedCount ? ` · ${reservedCount} réservée(s)` : ''}
                      {emptyCount ? ` · ${emptyCount} vide(s)` : ''}
                    </p>
                  </div>
                </div>
                <div className="guest-house-floorplan-head-actions">
                  {isFull ? (
                    <span
                      className="guest-house-full-badge"
                      title={
                        isKimpese
                          ? 'Tous les hôtels Kimpese sont occupés'
                          : 'Aucune chambre libre dans ce bâtiment'
                      }
                    >
                      FULL
                    </span>
                  ) : null}
                  {canCreate && onCreateReservation && !isKimpese ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-with-icon"
                      onClick={() => onCreateReservation()}
                      title="Nouvelle réservation"
                    >
                      <IconPlus size={13} />
                      Réservation
                    </button>
                  ) : null}
                  {canCreate && isKimpese && onCreateKimpeseHotel ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-with-icon"
                      onClick={onCreateKimpeseHotel}
                      title="Ajouter un hôtel Kimpese"
                    >
                      <IconPlus size={13} />
                      Hôtel
                    </button>
                  ) : null}
                </div>
              </header>

              {displayRooms.length === 0 ? (
                <p className="text-muted guest-house-motel-empty">
                  {isKimpese
                    ? 'Aucun hôtel Kimpese — ajoutez-en quand la guest house est pleine.'
                    : 'Aucune chambre dans ce bâtiment.'}
                </p>
              ) : (
                (() => {
                  const scrollInner = (
                  <div
                    className={`guest-house-floorplan-building${isKimpese ? ' is-kimpese' : ''}`}
                    style={{ '--gh-room-count': String(Math.max(displayRooms.length, 1)) } as CSSProperties}
                  >
                    <div
                      className={`guest-house-floorplan-roof${isKimpese ? ' is-kimpese' : ''}`}
                      aria-hidden
                    />
                    <div
                      className={`guest-house-floorplan-units${isKimpese ? ' is-kimpese-rail' : ''}`}
                      role="list"
                    >
                      {displayRooms.map(({ room, status, linkedReservation }) => {
                        const daysLeft = linkedReservation
                          ? remainingDays(linkedReservation.endDate)
                          : null;
                        const isProvisional = !isKimpese && provisionalByRoomId.has(room.id);
                        const isProposal = Boolean(
                          linkedReservation
                          && linkedReservation.status === 'pending'
                          && (status === 'reserved' || isProvisional),
                        );
                        const pendingActions = buildPendingActions(linkedReservation, {
                          provisional: isProvisional,
                        });
                        const menuItems = buildRoomMenuItems({
                          room,
                          linkedReservation,
                          isKimpese,
                          canEdit,
                          canDelete,
                          pendingActions,
                          onHistory,
                          onEditRoom,
                          onEditReservation,
                          onDeleteRoom,
                        });

                        return (
                          <div
                            key={room.id}
                            role="button"
                            tabIndex={0}
                            className={`guest-house-floorplan-unit is-${isProposal ? 'reserved' : status}${isProvisional || isProposal ? ' is-provisional' : ''}${isKimpese ? ' is-kimpese-unit' : ''} is-clickable${
                              doorPeek?.sourceKey === `room:${room.id}` ? ' is-door-source' : ''
                            }`}
                            title={
                              isProposal
                                ? `${roomDisplayName(room)} — Sous réserve`
                                : `${roomDisplayName(room)} — ${statusLabel(status)}`
                            }
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('.settings-card-menu-btn, .row-context-menu')) {
                                return;
                              }
                              const isEmptyUnit = status === 'empty' && !isProposal;
                              const sideLabel = isEmptyUnit
                                ? 'Réserver'
                                : isProposal && linkedReservation
                                  ? formatDaysBeforeStart(linkedReservation.startDate)
                                  : daysLeft == null
                                    ? 'Réserver'
                                    : daysLeft < 0
                                      ? 'Terminé'
                                      : daysLeft === 0
                                        ? 'Jour J'
                                        : `${daysLeft} j rest.`;
                              const sideKicker = isEmptyUnit
                                ? 'Disponible'
                                : isProposal
                                  ? 'Sous réserve'
                                  : 'Temps restant';
                              const actions: HouseDoorAction[] = [
                                {
                                  id: 'history',
                                  label: 'Historique',
                                  icon: 'view',
                                  onClick: () => {
                                    closeUnitDoor();
                                    onHistory(room);
                                  },
                                },
                                ...pendingActions,
                              ];
                              if (canEdit && linkedReservation && onEditReservation) {
                                actions.push({
                                  id: 'edit-reservation',
                                  label: 'Modifier la réservation',
                                  icon: 'edit',
                                  onClick: () => {
                                    closeUnitDoor();
                                    onEditReservation(linkedReservation);
                                  },
                                });
                              }
                              if (canEdit) {
                                actions.push({
                                  id: 'edit',
                                  label: isKimpese ? 'Modifier hôtel' : 'Modifier chambre',
                                  icon: 'edit',
                                  onClick: () => {
                                    closeUnitDoor();
                                    onEditRoom(room);
                                  },
                                });
                              }
                              if (canDelete) {
                                actions.push({
                                  id: 'delete',
                                  label: 'Supprimer',
                                  icon: 'delete',
                                  danger: true,
                                  onClick: () => {
                                    closeUnitDoor();
                                    onDeleteRoom(room);
                                  },
                                });
                              }
                              openUnitDoor(e.currentTarget, {
                                kind: isKimpese ? 'kimpese' : 'room',
                                badge: isKimpese
                                  ? (room.hotelName || roomDisplayName(room)).slice(0, 18)
                                  : roomUnitLabel(room),
                                statusLabel: statusLabel(status, isProposal),
                                title: linkedReservation?.personName
                                  || (isKimpese ? 'Hôtel disponible' : 'Chambre disponible'),
                                occupied: status === 'occupied' && !isProposal,
                                proposal: isProposal,
                                details: [
                                  ...(linkedReservation
                                    ? [
                                        {
                                          label: 'Réservation',
                                          value: linkedReservation.numero,
                                        },
                                        {
                                          label: 'Période',
                                          value: `${formatDate(linkedReservation.startDate)} → ${formatDate(linkedReservation.endDate)}`,
                                        },
                                      ]
                                    : []),
                                  {
                                    label: isKimpese ? 'Lieu' : 'Bâtiment',
                                    value: isKimpese ? 'Kimpese' : room.building,
                                  },
                                  ...(!isKimpese && room.characteristics
                                    ? [{ label: 'Caractéristique', value: room.characteristics }]
                                    : []),
                                  ...(!isKimpese && room.roomName
                                    ? [{ label: 'Nom', value: room.roomName }]
                                    : []),
                                ],
                                visitors: [],
                                actions,
                                sourceKey: `room:${room.id}`,
                                sideLabel,
                                sideKicker,
                                sideActionEnabled: Boolean(isEmptyUnit && canCreate && onCreateReservation),
                                onSideAction: isEmptyUnit && canCreate && onCreateReservation
                                  ? () => {
                                      closeUnitDoor();
                                      onCreateReservation({ roomId: room.id });
                                    }
                                  : undefined,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                (e.currentTarget as HTMLElement).click();
                              }
                            }}
                          >
                            <div className="guest-house-floorplan-sleep">
                              <div className="guest-house-floorplan-unit-top">
                                <div>
                                  <strong className="guest-house-floorplan-ch-label">
                                    {isKimpese ? (room.hotelName || roomDisplayName(room)) : roomUnitLabel(room)}
                                  </strong>
                                  {!isKimpese && room.roomName ? (
                                    <span className="guest-house-floorplan-room-name" title={room.roomName}>
                                      {room.roomName}
                                    </span>
                                  ) : null}
                                  {isKimpese ? (
                                    <span className="guest-house-floorplan-room-name">Kimpese</span>
                                  ) : null}
                                </div>
                                <CardActionMenu
                                  ariaLabel={`Actions ${roomDisplayName(room)}`}
                                  items={menuItems}
                                />
                              </div>

                              <div className="guest-house-floorplan-bed-area" aria-hidden>
                                {isKimpese ? <IconHotel size={28} /> : <IconBed size={28} />}
                              </div>

                              {linkedReservation ? (
                                <div className="guest-house-floorplan-info">
                                  {isProposal || status === 'reserved' ? (
                                    <span className="guest-house-floorplan-status-pill is-reserved">
                                      {isProposal ? 'Sous réserve' : 'Réservé'}
                                    </span>
                                  ) : null}
                                  <div
                                    className="guest-house-floorplan-occupant"
                                    title={linkedReservation.personName}
                                  >
                                    {linkedReservation.personName}
                                  </div>
                                  <div className="guest-house-floorplan-dates">
                                    {formatDate(linkedReservation.startDate)}
                                    {' → '}
                                    {formatDate(linkedReservation.endDate)}
                                  </div>
                                  <div
                                    className={`guest-house-floorplan-restant${
                                      !isProposal && daysLeft != null && daysLeft <= 2 && daysLeft >= 0
                                        ? ' is-critical'
                                        : ''
                                    }`}
                                  >
                                    {isProposal
                                      ? formatDaysBeforeStart(linkedReservation.startDate)
                                      : formatDaysLeftShort(linkedReservation.endDate)}
                                  </div>
                                </div>
                              ) : (
                                <div className="guest-house-floorplan-info is-vacant">
                                  <span className="guest-house-floorplan-status-pill">
                                    {statusLabel(status)}
                                  </span>
                                  <span>{isKimpese ? 'Disponible' : 'Disponible'}</span>
                                </div>
                              )}
                            </div>

                            {block.showBath ? (
                              <div className="guest-house-floorplan-bath" aria-hidden>
                                <span className="guest-house-floorplan-bath-label">Douche</span>
                                <IconShower size={15} />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                  return isKimpese ? (
                    <FloorplanScrollRail className="is-kimpese-rail">{scrollInner}</FloorplanScrollRail>
                  ) : (
                    <div className="guest-house-floorplan-scroll">{scrollInner}</div>
                  );
                })()
              )}
            </article>
          );
        })}
      </div>
    </section>
    {doorPeek ? (
      <GuestHouseUnitDoorModal
        kind={doorPeek.kind}
        badge={doorPeek.badge}
        statusLabel={doorPeek.statusLabel}
        title={doorPeek.title}
        occupied={doorPeek.occupied}
        proposal={doorPeek.proposal}
        details={doorPeek.details}
        visitors={doorPeek.visitors}
        origin={doorPeek.origin}
        phase={doorPeek.phase}
        actions={doorPeek.actions}
        sideLabel={doorPeek.sideLabel}
        sideKicker={doorPeek.sideKicker}
        onSideAction={doorPeek.onSideAction}
        sideActionEnabled={doorPeek.sideActionEnabled}
        onRequestClose={closeUnitDoor}
        onClosed={finishUnitDoor}
      />
    ) : null}
    </>
  );
}
