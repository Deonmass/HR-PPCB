'use client';

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
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onCreateRoom?: (building: string) => void;
  onEditRoom: (room: GuestRoom) => void;
  onDeleteRoom: (room: GuestRoom) => void;
  onHistory: (room: GuestRoom) => void;
}

const ONSITE_BUILDINGS = GUEST_HOUSE_BUILDINGS.filter((b) => b !== 'Kimpese');

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR');
}

function remainingDays(endDate: string): number {
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / 86_400_000);
}

function formatHoursMinutesLeft(endDate: string, now = new Date()): string {
  const end = new Date(`${endDate.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(end.getTime())) return '0 h 00';
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return '0 h 00';
  const totalMins = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours} h ${String(mins).padStart(2, '0')}`;
}

function formatDaysLeftDisplay(endDate: string): string {
  const days = remainingDays(endDate);
  if (days < 0) return 'Terminé';
  if (days === 0) return formatHoursMinutesLeft(endDate);
  return `${days} j restant${days > 1 ? 's' : ''}`;
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

function sortRooms(items: MotelRoomItem[]): MotelRoomItem[] {
  return [...items].sort((a, b) =>
    a.room.roomNumber.localeCompare(b.room.roomNumber, 'fr', { numeric: true }),
  );
}

export default function GuestHouseMotelView({
  roomsByBuilding,
  canCreate = false,
  canEdit = false,
  canDelete = false,
  onCreateRoom,
  onEditRoom,
  onDeleteRoom,
  onHistory,
}: Props) {
  const buildings = ONSITE_BUILDINGS.map((building) => ({
    building,
    rooms: sortRooms(roomsByBuilding[building] ?? []),
  }));

  const totals = buildings.reduce(
    (acc, block) => {
      for (const item of block.rooms) {
        acc.total += 1;
        if (item.status === 'occupied') acc.occupied += 1;
        else if (item.status === 'reserved') acc.reserved += 1;
        else acc.empty += 1;
      }
      return acc;
    },
    { total: 0, occupied: 0, reserved: 0, empty: 0 },
  );

  return (
    <section className="panel panel-padded guest-house-motel">
      <div className="guest-house-section-head guest-house-motel-head">
        <div>
          <h3>Plan des chambres</h3>
          <p className="text-muted">
            Vue motel · Bâtiment 1 &amp; 2 · {totals.occupied} occupée(s) · {totals.empty} vide(s)
            {totals.reserved ? ` · ${totals.reserved} réservée(s)` : ''}
          </p>
        </div>
        <div className="guest-house-motel-legend" aria-hidden>
          <span className="guest-house-motel-legend-item is-occupied">Occupé</span>
          <span className="guest-house-motel-legend-item is-reserved">Réservé</span>
          <span className="guest-house-motel-legend-item is-empty">Vide</span>
        </div>
      </div>

      <div className="guest-house-motel-campus">
        {buildings.map(({ building, rooms }) => {
          const shortLabel = building.replace(/^Batiment\s*#?/i, 'Bât. ');
          const occupiedCount = rooms.filter((r) => r.status === 'occupied').length;
          return (
            <article key={building} className="guest-house-motel-building">
              <div className="guest-house-motel-roof" aria-hidden />
              <header className="guest-house-motel-building-head">
                <div>
                  <h4>{shortLabel}</h4>
                  <p>
                    {rooms.length} chambre(s) · {occupiedCount} occupée(s)
                  </p>
                </div>
                {canCreate && onCreateRoom ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-with-icon"
                    onClick={() => onCreateRoom(building)}
                    title={`Ajouter une chambre — ${building}`}
                  >
                    <IconPlus size={13} />
                    Chambre
                  </button>
                ) : null}
              </header>

              {rooms.length === 0 ? (
                <p className="text-muted guest-house-motel-empty">Aucune chambre dans ce bâtiment.</p>
              ) : (
                <div className="guest-house-motel-doors" role="list">
                  {rooms.map(({ room, status, linkedReservation }) => {
                    const daysLeft = linkedReservation
                      ? remainingDays(linkedReservation.endDate)
                      : null;
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
                        className={`guest-house-motel-door is-${status}`}
                      >
                        <div className="guest-house-motel-door-knob" aria-hidden />
                        <div className="guest-house-motel-door-top">
                          <div>
                            <strong className="guest-house-motel-door-number">
                              {room.roomNumber || roomDisplayName(room)}
                            </strong>
                            {room.roomName ? (
                              <span className="guest-house-motel-door-name">{room.roomName}</span>
                            ) : null}
                          </div>
                          <CardActionMenu
                            ariaLabel={`Actions chambre ${roomDisplayName(room)}`}
                            items={menuItems}
                          />
                        </div>

                        <span className={`guest-house-motel-door-badge is-${status}`}>
                          {statusLabel(status)}
                        </span>

                        {linkedReservation ? (
                          <div className="guest-house-motel-door-body">
                            <div className="guest-house-motel-occupant" title={linkedReservation.personName}>
                              {linkedReservation.personName}
                            </div>
                            <div className="guest-house-motel-dates">
                              <span>{formatDate(linkedReservation.startDate)}</span>
                              <span aria-hidden>→</span>
                              <span>{formatDate(linkedReservation.endDate)}</span>
                            </div>
                            <div
                              className={`guest-house-motel-restant${
                                daysLeft != null && daysLeft <= 2 && daysLeft >= 0 ? ' is-critical' : ''
                              }`}
                            >
                              {formatDaysLeftDisplay(linkedReservation.endDate)}
                            </div>
                          </div>
                        ) : (
                          <div className="guest-house-motel-door-body is-vacant">
                            <span>Libre</span>
                            <span className="text-muted">Aucune occupation</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
