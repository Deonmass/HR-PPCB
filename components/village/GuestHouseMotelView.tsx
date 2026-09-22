'use client';

import { useMemo, type CSSProperties } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import {
  GUEST_HOUSE_BUILDINGS,
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

interface Props {
  roomsByBuilding: Record<string, MotelRoomItem[]>;
  /** Réservations en attente sans chambre (mois courant) — affichées sur les vides, surplus en légende. */
  unassignedReservations?: GuestReservation[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onCreateReservation?: () => void;
  onEditRoom: (room: GuestRoom) => void;
  onDeleteRoom: (room: GuestRoom) => void;
  onHistory: (room: GuestRoom) => void;
}

const ONSITE_BUILDINGS = GUEST_HOUSE_BUILDINGS.filter((b) => b !== 'Kimpese');

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

function formatDaysLeftShort(endDate: string): string {
  const days = remainingDays(endDate);
  if (days < 0) return 'Terminé';
  if (days === 0) return 'Jour J';
  return `${days} j rest.`;
}

function statusLabel(status: MotelRoomStatus): string {
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

function sortRooms(items: MotelRoomItem[]): MotelRoomItem[] {
  return [...items].sort((a, b) =>
    a.room.roomNumber.localeCompare(b.room.roomNumber, 'fr', { numeric: true }),
  );
}

function roomUnitLabel(room: GuestRoom): string {
  const num = (room.roomNumber || '').trim();
  if (!num) return 'CH.';
  if (/^vip$/i.test(num)) return 'VIP';
  return `CH. ${num}`;
}

/** Chambre VIP (ex. 1/2 VIP) — exclue du placement automatique des réservations sans chambre. */
function isVipRoom(room: GuestRoom): boolean {
  const tokens = [room.roomNumber, room.roomName, room.templateLabel]
    .map((v) => (v || '').trim().toLowerCase())
    .filter(Boolean);
  return tokens.some((t) => /\bvip\b/.test(t));
}

export default function GuestHouseMotelView({
  roomsByBuilding,
  unassignedReservations = [],
  canCreate = false,
  canEdit = false,
  canDelete = false,
  onCreateReservation,
  onEditRoom,
  onDeleteRoom,
  onHistory,
}: Props) {
  const buildings = useMemo(
    () =>
      ONSITE_BUILDINGS.map((building) => ({
        building,
        rooms: sortRooms(roomsByBuilding[building] ?? []),
      })),
    [roomsByBuilding],
  );

  /** Place les réservations sans chambre sur les vides (affichage) ; le surplus = légende. */
  const { provisionalByRoomId, overflowUnassigned } = useMemo(() => {
    const queue = [...unassignedReservations].sort((a, b) =>
      a.startDate.localeCompare(b.startDate) || a.numero.localeCompare(b.numero),
    );
    const map = new Map<string, GuestReservation>();
    for (const block of buildings) {
      for (const item of block.rooms) {
        if (item.status !== 'empty' || queue.length === 0) continue;
        if (isVipRoom(item.room)) continue;
        const next = queue.shift();
        if (next) map.set(item.room.id, next);
      }
    }
    return { provisionalByRoomId: map, overflowUnassigned: queue.length };
  }, [buildings, unassignedReservations]);

  const totals = buildings.reduce(
    (acc, block) => {
      for (const item of block.rooms) {
        acc.total += 1;
        const provisional = provisionalByRoomId.get(item.room.id);
        const status = provisional ? 'reserved' : item.status;
        if (status === 'occupied') acc.occupied += 1;
        else if (status === 'reserved') acc.reserved += 1;
        else acc.empty += 1;
      }
      return acc;
    },
    { total: 0, occupied: 0, reserved: 0, empty: 0 },
  );

  const showUnassignedLegend = overflowUnassigned > 0;

  return (
    <section className="panel panel-padded guest-house-motel">
      <div className="guest-house-section-head guest-house-motel-head">
        <div>
          <h3>Plan des chambres</h3>
          <p className="text-muted">
            Bâtiment 1 &amp; 2 · chambre + douche · {totals.occupied} occupée(s) · {totals.empty} vide(s)
            {totals.reserved ? ` · ${totals.reserved} réservée(s)` : ''}
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

      <div className="guest-house-motel-plans">
        {buildings.map(({ building, rooms }) => {
          const shortLabel = building.replace(/^Batiment\s*#?/i, 'Bâtiment ');
          const displayRooms = rooms.map((item) => {
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

          return (
            <article key={building} className={`guest-house-floorplan${isFull ? ' is-full' : ''}`}>
              <header className="guest-house-floorplan-head">
                <div className="guest-house-floorplan-title-block">
                  <span className="guest-house-floorplan-building-badge" aria-hidden />
                  <div>
                    <h4>{shortLabel}</h4>
                    <p>
                      {displayRooms.length} chambre(s) · {occupiedCount} occupée(s)
                      {reservedCount ? ` · ${reservedCount} réservée(s)` : ''}
                      {emptyCount ? ` · ${emptyCount} vide(s)` : ''}
                    </p>
                  </div>
                </div>
                <div className="guest-house-floorplan-head-actions">
                  {isFull ? (
                    <span className="guest-house-full-badge" title="Aucune chambre libre dans ce bâtiment">
                      FULL
                    </span>
                  ) : null}
                  {canCreate && onCreateReservation ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-with-icon"
                      onClick={onCreateReservation}
                      title="Nouvelle réservation"
                    >
                      <IconPlus size={13} />
                      Réservation
                    </button>
                  ) : null}
                </div>
              </header>

              {displayRooms.length === 0 ? (
                <p className="text-muted guest-house-motel-empty">Aucune chambre dans ce bâtiment.</p>
              ) : (
                <div className="guest-house-floorplan-scroll">
                  <div
                    className="guest-house-floorplan-building"
                    style={{ '--gh-room-count': String(Math.max(displayRooms.length, 1)) } as CSSProperties}
                  >
                    <div className="guest-house-floorplan-roof" aria-hidden />
                    <div className="guest-house-floorplan-units" role="list">
                      {displayRooms.map(({ room, status, linkedReservation }) => {
                        const daysLeft = linkedReservation
                          ? remainingDays(linkedReservation.endDate)
                          : null;
                        const isProvisional = provisionalByRoomId.has(room.id);
                        const menuItems = [
                          {
                            id: 'history',
                            label: 'Historique',
                            icon: 'view' as const,
                            onClick: () => onHistory(room),
                          },
                          ...(canEdit
                            ? [{
                                id: 'edit',
                                label: 'Modifier',
                                icon: 'edit' as const,
                                onClick: () => onEditRoom(room),
                              }]
                            : []),
                          ...(canDelete
                            ? [{
                                id: 'delete',
                                label: 'Supprimer',
                                icon: 'delete' as const,
                                danger: true,
                                onClick: () => onDeleteRoom(room),
                              }]
                            : []),
                        ];

                        return (
                          <div
                            key={room.id}
                            role="listitem"
                            className={`guest-house-floorplan-unit is-${status}${isProvisional ? ' is-provisional' : ''}`}
                            title={
                              isProvisional
                                ? `${roomDisplayName(room)} — Réservé (sans attribution définitive)`
                                : `${roomDisplayName(room)} — ${statusLabel(status)}`
                            }
                          >
                            <div className="guest-house-floorplan-sleep">
                              <div className="guest-house-floorplan-unit-top">
                                <div>
                                  <strong className="guest-house-floorplan-ch-label">
                                    {roomUnitLabel(room)}
                                  </strong>
                                  {room.roomName ? (
                                    <span className="guest-house-floorplan-room-name" title={room.roomName}>
                                      {room.roomName}
                                    </span>
                                  ) : null}
                                </div>
                                <CardActionMenu
                                  ariaLabel={`Actions ${roomDisplayName(room)}`}
                                  items={menuItems}
                                />
                              </div>

                              <div className="guest-house-floorplan-bed-area" aria-hidden>
                                <IconBed size={28} />
                              </div>

                              {linkedReservation ? (
                                <div className="guest-house-floorplan-info">
                                  {status === 'reserved' ? (
                                    <span className="guest-house-floorplan-status-pill is-reserved">
                                      Réservé
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
                                      daysLeft != null && daysLeft <= 2 && daysLeft >= 0
                                        ? ' is-critical'
                                        : ''
                                    }`}
                                  >
                                    {formatDaysLeftShort(linkedReservation.endDate)}
                                  </div>
                                </div>
                              ) : (
                                <div className="guest-house-floorplan-info is-vacant">
                                  <span className="guest-house-floorplan-status-pill">
                                    {statusLabel(status)}
                                  </span>
                                  <span>Disponible</span>
                                </div>
                              )}
                            </div>

                            <div className="guest-house-floorplan-bath" aria-hidden>
                              <span className="guest-house-floorplan-bath-label">Douche</span>
                              <IconShower size={15} />
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
        })}
      </div>
    </section>
  );
}
